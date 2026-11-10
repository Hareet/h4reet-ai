#!/usr/bin/env python3
"""The measurement's load (spec 001, tasks.md T014; research.md R-33).

    python3 -I /app/measure_load.py --minutes N --hello-per-minute H --turns-per-minute T     in a breach-probe container

deploy/scripts/measure_stack.py starts it in a one-off breach-probe container on dev-cpu's internal network
(`docker compose --profile breach run --build --rm -T breach-probe`), and samples the stack's memory while it runs. For
N minutes it sends hello at H a minute to edge's api listener, http://edge:8080/hello, and twin turns at T a minute to
edge's site listener, http://edge:8087/api/room/turn: the path a visitor's request takes, edge first, then the gateway,
its store, and the telemetry behind it. With the model server stopped, the gateway answers each from dev's route
without it: the synthetic adapter, the stub of a paid one, while dev's meters allow, and degraded after.

What it sends is fixed text, never a visitor's: hello's empty body (the gateway's "Hello."), and one free-talk turn,
"Hello.". Hello rotates eight X-H4-Client labels, measure-1 to measure-8, so the per-client cap doesn't bind before the
global metered limit; edge drops the label on the turn, so turns come from one client. One request at a time, on a
fixed schedule; one that goes out more than a slot late counts as late.

What it prints: one JSON line at the end, marked "h4_measure_load": 1, with what it sent, how many went late, and each
answer counted by its status and the route or cause code it names. Never an answer's text: a field that isn't a code
counts as "other". HTTP goes through urllib with an empty ProxyHandler and no redirects, so every request stays on the
stack's network, as the breach probe's do (evals/breach_probe.py).

Standard library only, copied into the probe's image (evals/Dockerfile.probe). Exit codes: 0 it ran, whatever the
answers; 2 usage.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from collections.abc import Callable
from typing import Any, TextIO

HELLO_URL = "http://edge:8080/hello"
TURN_URL = "http://edge:8087/api/room/turn"
HELLO_BODY = b"{}"
TURN_BODY = json.dumps(
    {
        "feature": "free_talk",
        "path": "engineer",
        "turns": [{"role": "visitor", "text": "Hello."}],
    }
).encode()
LABELS = tuple(f"measure-{n}" for n in range(1, 9))
MARK = "h4_measure_load"
# Above the gateway's 20-second deadline, and edge's 30-second read on the turn.
TIMEOUT_S = 35
MAX_BODY = 64 * 1024
MAX_MINUTES = 240
MAX_PER_MINUTE = 600
CODE = re.compile(r"^[a-z][a-z0-9_]{0,39}$")

Send = Callable[[str, "str | None"], "tuple[int | None, bytes]"]


def kinds(hello: int, turns: int, minutes: int) -> list[str]:
    """The schedule: hello + turns slots a minute, each a hello or a turn, turns spread evenly among them."""
    total = hello + turns
    return [
        "turn" if (i + 1) * turns // total > i * turns // total else "hello"
        for i in range(total * minutes)
    ]


def outcome(status: int | None, body: bytes) -> str:
    """An answer as its status and the code it names: the route on a 200, else the cause or the error."""
    if status is None:
        return "no answer"
    try:
        doc = json.loads(body)
    except ValueError:
        doc = None
    if not isinstance(doc, dict):
        return str(status)
    value = doc.get("route") if status == 200 else doc.get("cause") or doc.get("error")
    if value is None:
        return str(status)
    return (
        f"{status} {value if isinstance(value, str) and CODE.match(value) else 'other'}"
    )


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())


def http_send(kind: str, label: str | None) -> tuple[int | None, bytes]:
    url, body = (HELLO_URL, HELLO_BODY) if kind == "hello" else (TURN_URL, TURN_BODY)
    headers = {"Content-Type": "application/json"}
    if label:
        headers["X-H4-Client"] = label
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with _OPENER.open(request, timeout=TIMEOUT_S) as response:
            return response.status, response.read(MAX_BODY)
    except urllib.error.HTTPError as error:
        with error:
            return error.code, error.read(MAX_BODY)
    except (urllib.error.URLError, OSError, ValueError):
        return None, b""


def run(
    *,
    minutes: int,
    hello: int,
    turns: int,
    send: Send,
    now: Callable[[], float],
    sleep: Callable[[float], None],
) -> dict[str, Any]:
    step = 60.0 / (hello + turns)
    sent: Counter[str] = Counter()
    outcomes: dict[str, Counter[str]] = {"hello": Counter(), "turn": Counter()}
    late = 0
    start = now()
    for i, kind in enumerate(kinds(hello, turns, minutes)):
        wait = start + i * step - now()
        if wait > 0:
            sleep(wait)
        elif -wait > step:
            late += 1
        label = LABELS[sent["hello"] % len(LABELS)] if kind == "hello" else None
        status, body = send(kind, label)
        sent[kind] += 1
        outcomes[kind][outcome(status, body)] += 1
    return {
        MARK: 1,
        "minutes": minutes,
        "hello_per_minute": hello,
        "turns_per_minute": turns,
        "sent": {"hello": sent["hello"], "turn": sent["turn"]},
        "late": late,
        "seconds": round(now() - start),
        "outcomes": {
            kind: dict(sorted(counts.items())) for kind, counts in outcomes.items()
        },
    }


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:  # type: ignore[override]
        raise ValueError(message)


def main(
    argv: list[str] | None = None,
    *,
    send: Send | None = None,
    now: Callable[[], float] | None = None,
    sleep: Callable[[float], None] | None = None,
    out: TextIO | None = None,
) -> int:
    out = out or sys.stdout
    parser = _Parser(prog="measure_load.py", description=__doc__.splitlines()[0])
    parser.add_argument("--minutes", type=int, required=True)
    parser.add_argument("--hello-per-minute", type=int, required=True)
    parser.add_argument("--turns-per-minute", type=int, required=True)
    try:
        args = parser.parse_args(argv)
        if not 1 <= args.minutes <= MAX_MINUTES:
            raise ValueError(f"--minutes is 1 to {MAX_MINUTES}")
        for name in ("hello_per_minute", "turns_per_minute"):
            if not 0 <= getattr(args, name) <= MAX_PER_MINUTE:
                raise ValueError(f"--{name.replace('_', '-')} is 0 to {MAX_PER_MINUTE}")
        if args.hello_per_minute + args.turns_per_minute == 0:
            raise ValueError("nothing to send: hello and turns are both 0 a minute")
    except ValueError as problem:
        print(f"measure_load.py: {problem}", file=sys.stderr)
        return 2
    summary = run(
        minutes=args.minutes,
        hello=args.hello_per_minute,
        turns=args.turns_per_minute,
        send=send or http_send,
        now=now or time.monotonic,
        sleep=sleep or time.sleep,
    )
    print(json.dumps(summary, sort_keys=False), file=out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
