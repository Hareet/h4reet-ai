"""The HAR checker (spec 004 T247; SC-004, SC-012; research.md R-70; contracts/tier-signal.md §9).

Agent code that runs in the Author's terminal (ADR 0017), standard library only, as

    python3 -I scripts/room/har_check.py <visit.har> <frame-log.json> <path-change-time> [--relay-offset-ms N]

with the browser's exported network log of one visit (a HAR file, which stays on the Author's machine), the drafts
build's frame log (the console's h4FrameLog(), copied to a file), and the time of the relay's `relay.path.change` log
line, in ISO 8601 with its UTC offset. It needs Python 3.11 or later (datetime.fromisoformat with a `Z` suffix).

The failover check compares two machines' clocks: the relay's log line is stamped by the engine's clock (WSL's, or a
container's), and the frame log by the browser's. WSL2's clock can drift from Windows' after the laptop sleeps, by more
than the margin between the 30-second poll and the 40-second limit. So, just before the run, compare them: in WSL,
`date -u +%FT%T.%3NZ`, and at the same moment in the browser's console, `new Date().toISOString()`. Resync WSL if they
differ (`sudo hwclock -s`), or pass the difference as `--relay-offset-ms`: the relay's clock minus the browser's, in
milliseconds (positive when the relay's runs ahead), which the checker subtracts from the path change's time.

From the HAR it reads only each request's URL, method, start time, and status, never a header, cookie, query value, or
body, and it prints only counts and verdicts, never a URL, a host, or anything a request carried:
- third-party: 0 requests to any origin but the page's own (data: and blob: URLs reach no host; a browser extension's
  chrome-extension: or moz-extension: requests are a NOTE of their own, not counted here, so record in a browser profile
  without extensions);
- before-enter, paused, hidden: 0 status requests (GET /api/status on the page's origin) before Enter, between a pause
  and its resume, or between a hide and its show;
- interval: no two status requests closer together than the poll interval;
- failover: the first frame off the plugged pose within 40 seconds of the relay's path change (SC-004);
- plugged-paused, plugged-hidden: 0 frames of the plugged pose while paused or hidden (SC-004). A 2D case its pause's or
  hide's own reduction logged (only `tier` entries, or that reduction's other 2D cases, between them) replaces the case
  before it at the event's time, since the room reads its Clock once for the event and again for the case.

"Plugged" is what the room logged: app.ts logs each case as the claims rule, `caseFor`, gives it with its default
`drawn`, so where a model lacks the claimed pose and the stage draws another, the log over-reports the plugged pose
(plan.md §10). An over-report can only fail a check, never pass one.

The HAR's start times are the browser's network clock, the frame log's the page's: two readings of the wall clock that
can differ by a few milliseconds. So each HAR check against the frame log, and the HAR's own interval check, allows
SLACK_MS; the same checks over the frame log's own request entries, all on the room's monotonic Clock, allow nothing.

Exit codes: 0 when every check passes, 1 when any fails, 2 when an input can't be read.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from itertools import pairwise
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

STATUS_PATH = "/api/status"
FRAME_LOG_KIND = "h4-frame-log"
FAILOVER_LIMIT_MS = 40_000
SLACK_MS = 50
NO_HOST = ("data", "blob")
EXTENSIONS = ("chrome-extension", "moz-extension")
REDUCING = ("pause", "resume", "hide", "show")
DEFAULT_PORTS = {"http": 80, "https": 443, "ws": 80, "wss": 443}


class Unreadable(Exception):
    """An input the checker can't read. Its message names the input and never echoes its content."""


@dataclass(frozen=True)
class Request:
    """What the checker reads of one HAR entry: its URL, method, start time (ms since the epoch), and status."""

    url: str
    method: str
    start: float
    status: int


@dataclass(frozen=True)
class FrameLog:
    origin: str
    poll_ms: float
    dropped: int
    entries: list[dict[str, Any]]


def parse_time(text: str, what: str) -> float:
    """An ISO 8601 time with its UTC offset, as ms since the epoch."""
    try:
        when = datetime.fromisoformat(text.strip())
    except ValueError:
        raise Unreadable(f"{what} isn't ISO 8601") from None
    if when.tzinfo is None:
        raise Unreadable(f"{what} needs its UTC offset")
    return when.timestamp() * 1000


def checked_url(url: str, what: str) -> str:
    """A URL urlsplit reads whole, host and port included; its error would hold the host, so it is never shown."""
    try:
        parts = urlsplit(url)
        _ = (parts.hostname, parts.port)
    except ValueError:
        raise Unreadable(f"{what} isn't a URL") from None
    return url


def read_har(data: Any) -> list[Request]:
    """Each HAR entry's URL, method, start time, and status, and nothing else of it."""
    log = data["log"] if isinstance(data, Mapping) and "log" in data else None
    entries = log["entries"] if isinstance(log, Mapping) and "entries" in log else None
    if not isinstance(entries, list):
        raise Unreadable("the HAR has no list of entries")
    requests: list[Request] = []
    for entry in entries:
        try:
            request, response = entry["request"], entry["response"]
            url, method, started, status = (
                request["url"],
                request["method"],
                entry["startedDateTime"],
                response["status"],
            )
        except (KeyError, TypeError):
            raise Unreadable(
                "a HAR entry lacks its URL, method, start time, or status"
            ) from None
        if not (
            isinstance(url, str)
            and isinstance(method, str)
            and isinstance(started, str)
        ):
            raise Unreadable("a HAR entry lacks its URL, method, start time, or status")
        if not isinstance(status, int) or isinstance(status, bool):
            raise Unreadable("a HAR entry lacks its URL, method, start time, or status")
        requests.append(
            Request(
                checked_url(url, "a HAR entry's URL"),
                method,
                parse_time(started, "a HAR entry's start time"),
                status,
            )
        )
    return requests


def read_frame_log(data: Any) -> FrameLog:
    """The frame log, as h4FrameLog() gives it: the JSON object, or the JSON string the console copies."""
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except (ValueError, RecursionError):
            raise Unreadable("the frame log isn't JSON") from None
    if not isinstance(data, Mapping) or data.get("kind") != FRAME_LOG_KIND:
        raise Unreadable(f"the frame log isn't an {FRAME_LOG_KIND}")
    origin, entries, dropped = (
        data.get("origin"),
        data.get("entries"),
        data.get("dropped", 0),
    )
    if not isinstance(origin, str) or not isinstance(entries, list):
        raise Unreadable("the frame log lacks its origin or its entries")
    checked_url(origin, "the frame log's origin")
    if not isinstance(dropped, int) or isinstance(dropped, bool) or dropped < 0:
        raise Unreadable("the frame log's dropped isn't a count")
    for entry in entries:
        if not isinstance(entry, Mapping) or not isinstance(entry.get("event"), str):
            raise Unreadable("a frame log entry lacks its event")
        for key in ("t", "wall", "frame"):
            value = entry.get(key)
            if (
                not isinstance(value, int | float)
                or isinstance(value, bool)
                or not math.isfinite(value)
            ):
                raise Unreadable("a frame log entry lacks its t, wall, or frame")
    enter = next((e for e in entries if e["event"] == "enter"), None)
    if enter is None:
        raise Unreadable("the frame log has no Enter")
    poll_ms = enter.get("poll_ms")
    if (
        not isinstance(poll_ms, int | float)
        or isinstance(poll_ms, bool)
        or poll_ms <= 0
    ):
        raise Unreadable("the frame log's Enter has no poll_ms")
    return FrameLog(origin, float(poll_ms), dropped, [dict(e) for e in entries])


def origin_of(url: str) -> tuple[str, str, int | None] | None:
    """A URL's scheme, host, and port, the default port spelled out; None for a URL that reaches no host."""
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    if scheme in NO_HOST or scheme in EXTENSIONS:
        return None
    try:
        port = parts.port
    except ValueError:
        port = -1
    return (
        scheme,
        (parts.hostname or "").lower(),
        port if port is not None else DEFAULT_PORTS.get(scheme),
    )


def plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def spans(
    entries: list[dict[str, Any]], opening: str, closing: str
) -> list[tuple[dict[str, Any], dict[str, Any] | None]]:
    """Each opening event with the closing event that ends it, or None where the log ends first."""
    found: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
    open_at: dict[str, Any] | None = None
    for entry in entries:
        if entry["event"] == opening and open_at is None:
            open_at = entry
        elif entry["event"] == closing and open_at is not None:
            found.append((open_at, entry))
            open_at = None
    if open_at is not None:
        found.append((open_at, None))
    return found


@dataclass(frozen=True)
class Shown:
    """One switch case as the log shows it: from its first frame (3D) or time (2D) to the next case's."""

    plugged: bool
    mode: str
    first_frame: float
    last_frame: float
    t: float
    until_t: float


def shown_at(entries: list[dict[str, Any]]) -> dict[int, float]:
    """When each case replaced the one before, by the case's index in the log: its own `t`, except a 2D case its
    pause's, resume's, hide's, or show's own reduction logged, which replaces at that event's `t` (I-2 of T248's
    review): the room reads its Clock once for the event and again for the case. A reduction's cases follow its event
    with only `tier` entries and its other switches' 2D cases between, at most one for each switch; any other entry, a
    3D case, or a second case for a switch ends the reduction."""
    at: dict[int, float] = {}
    anchor: dict[str, Any] | None = None
    anchored: set[str] = set()
    for k, entry in enumerate(entries):
        event = entry["event"]
        if event == "tier":
            continue
        if event != "case":
            anchor = entry if event in REDUCING else None
            anchored = set()
            continue
        at_switch = str(entry.get("switch"))
        if (
            anchor is not None
            and entry.get("mode") == "2d"
            and at_switch not in anchored
        ):
            anchored.add(at_switch)
            at[k] = anchor["t"]
        else:
            anchor = None
            at[k] = entry["t"]
    return at


def shown_cases(entries: list[dict[str, Any]]) -> list[Shown]:
    """Each switch's cases, in order, with the frames that drew each (3D) or the time it showed (2D)."""
    last_frame = max((e["frame"] for e in entries), default=0)
    at = shown_at(entries)
    by_switch: dict[str, list[dict[str, Any]]] = {}
    for k, entry in enumerate(entries):
        if entry["event"] == "case":
            by_switch.setdefault(str(entry.get("switch")), []).append(
                {**entry, "t": at[k]}
            )
    out: list[Shown] = []
    for cases in by_switch.values():
        for k, case in enumerate(cases):
            following = cases[k + 1] if k + 1 < len(cases) else None
            if following is None:
                end_frame, until_t = last_frame, float("inf")
            elif following.get("mode") == "3d":
                end_frame, until_t = following["frame"] - 1, following["t"]
            else:
                end_frame, until_t = following["frame"], following["t"]
            out.append(
                Shown(
                    case.get("plugged") is True,
                    str(case.get("mode")),
                    case["frame"],
                    end_frame,
                    case["t"],
                    until_t,
                )
            )
    return out


def plugged_while(log: FrameLog, opening: str, closing: str) -> int:
    """Frames of the plugged pose drawn between each opening event and its closing one (3D), and plugged 2D cases
    showing then."""
    last_frame = max((e["frame"] for e in log.entries), default=0)
    count = 0
    for start, end in spans(log.entries, opening, closing):
        frames = (start["frame"] + 1, end["frame"] if end else last_frame)
        times = (start["t"], end["t"] if end else float("inf"))
        for shown in shown_cases(log.entries):
            if not shown.plugged:
                continue
            if shown.mode == "3d":
                count += max(
                    0,
                    min(shown.last_frame, frames[1])
                    - max(shown.first_frame, frames[0])
                    + 1,
                )
            elif shown.t < times[1] and shown.until_t > times[0]:
                count += 1
    return int(count)


def check(
    requests: list[Request], log: FrameLog, change_ms: float
) -> list[tuple[bool, str]]:
    """Each check's verdict and its line."""
    verdicts: list[tuple[bool, str]] = []
    page = origin_of(log.origin)
    elsewhere = sum(
        1 for r in requests if (o := origin_of(r.url)) is not None and o != page
    )
    verdicts.append(
        (
            elsewhere == 0,
            f"third-party: {plural(elsewhere, 'request', 'requests')} to another origin",
        )
    )

    status = sorted(
        r.start
        for r in requests
        if origin_of(r.url) == page
        and r.method == "GET"
        and urlsplit(r.url).path == STATUS_PATH
    )
    own = [e for e in log.entries if e["event"] == "request"]
    enter = next(e for e in log.entries if e["event"] == "enter")
    early = sum(1 for s in status if s < enter["wall"] - SLACK_MS)
    early_log = sum(1 for e in own if e["t"] < enter["t"])
    verdicts.append(
        (
            early + early_log == 0,
            (
                f"before-enter: {plural(early, 'status request', 'status requests')} before Enter in the HAR, "
                f"{early_log} in the frame log"
            ),
        )
    )
    for name, opening, closing, words in (
        ("paused", "pause", "resume", "between a pause and its resume"),
        ("hidden", "hide", "show", "between a hide and its show"),
    ):
        inside = inside_log = 0
        for start, end in spans(log.entries, opening, closing):
            to_wall = end["wall"] if end else float("inf")
            to_t = end["t"] if end else float("inf")
            inside += sum(
                1 for s in status if start["wall"] + SLACK_MS < s < to_wall - SLACK_MS
            )
            inside_log += sum(1 for e in own if start["t"] < e["t"] < to_t)
        verdicts.append(
            (
                inside + inside_log == 0,
                (
                    f"{name}: {plural(inside, 'status request', 'status requests')} {words} in the HAR, "
                    f"{inside_log} in the frame log"
                ),
            )
        )

    gaps = [b - a for a, b in pairwise(status)]
    close = sum(1 for g in gaps if g < log.poll_ms - SLACK_MS)
    own_t = [e["t"] for e in own]
    close_log = sum(1 for a, b in pairwise(own_t) if b - a < log.poll_ms)
    closest = f" (closest {min(gaps) / 1000:.1f} s)" if gaps else ""
    verdicts.append(
        (
            close + close_log == 0,
            (
                f"interval: {plural(close, 'pair', 'pairs')} of status requests closer than {log.poll_ms / 1000:g} s "
                f"in the HAR, {close_log} in the frame log{closest}"
            ),
        )
    )

    verdicts.append(failover(log, change_ms))
    for name, opening, closing, words in (
        ("plugged-paused", "pause", "resume", "paused"),
        ("plugged-hidden", "hide", "show", "hidden"),
    ):
        n = plugged_while(log, opening, closing)
        verdicts.append(
            (
                n == 0,
                f"{name}: {plural(n, 'frame', 'frames')} of the plugged pose while {words}",
            )
        )
    return verdicts


def failover(log: FrameLog, change_ms: float) -> tuple[bool, str]:
    """SC-004: the plugged pose showing at the path change, and the first frame off it within 40 seconds."""
    # Whether any switch shows its plugged pose, after each case change.
    state: list[tuple[float, bool]] = []
    cases = [e for e in log.entries if e["event"] == "case"]
    showing: dict[str, bool] = {}
    for entry in cases:
        showing[str(entry.get("switch"))] = entry.get("plugged") is True
        state.append((entry["wall"], any(showing.values())))
    before = [plugged for wall, plugged in state if wall <= change_ms]
    if not before or not before[-1]:
        return (False, "failover: the plugged pose wasn't showing at the path change")
    off = next(
        (wall for wall, plugged in state if wall > change_ms and not plugged), None
    )
    if off is None:
        return (False, "failover: the plugged pose never left after the path change")
    delay = off - change_ms
    line = (
        f"failover: the first frame off the plugged pose came {delay / 1000:.1f} s after the path change "
        f"(limit {FAILOVER_LIMIT_MS // 1000} s)"
    )
    return (delay <= FAILOVER_LIMIT_MS, line)


def load_json(path: str, what: str) -> Any:
    try:
        text = Path(path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        raise Unreadable(f"can't read {what}") from None
    try:
        return json.loads(text)
    except (ValueError, RecursionError):
        raise Unreadable(f"{what} isn't JSON") from None


def main(
    argv: Sequence[str] | None = None,
    out: Callable[[str], None] = print,
    err: Callable[[str], None] = lambda line: print(line, file=sys.stderr),
) -> int:
    parser = argparse.ArgumentParser(
        prog="har_check.py",
        description="Check a visit's HAR file and frame log against SC-004 and SC-012 (spec 004).",
    )
    parser.add_argument(
        "har", help="the browser's exported network log of the visit (a HAR file)"
    )
    parser.add_argument(
        "frame_log", help="the drafts build's frame log, h4FrameLog()'s JSON, in a file"
    )
    parser.add_argument(
        "path_change",
        help="the time of the relay's relay.path.change log line, ISO 8601 with offset",
    )
    parser.add_argument(
        "--relay-offset-ms",
        type=int,
        default=0,
        help="the relay's clock minus the browser's, in ms (positive when the relay's runs ahead)",
    )
    args = parser.parse_args(argv)
    try:
        requests = read_har(load_json(args.har, "the HAR"))
        log = read_frame_log(load_json(args.frame_log, "the frame log"))
        change_ms = (
            parse_time(args.path_change, "the path change's time")
            - args.relay_offset_ms
        )
    except Unreadable as error:
        err(f"har_check: {error}")
        return 2
    status = sum(
        1
        for r in requests
        if urlsplit(r.url).path == STATUS_PATH
        and origin_of(r.url) == origin_of(log.origin)
    )
    out(
        f"har_check: {plural(len(requests), 'request', 'requests')} in the HAR, {status} of them status requests; "
        f"{len(log.entries)} frame log entries"
    )
    if args.relay_offset_ms:
        out(
            "har_check: the path change read on the browser's clock, "
            f"relay offset {args.relay_offset_ms} ms"
        )
    verdicts = [(log.dropped == 0, f"frame-log: {log.dropped} entries dropped")]
    if log.dropped:
        verdicts = [
            (
                False,
                f"frame-log: it dropped {log.dropped} entries, so it may not hold the whole visit",
            )
        ]
    verdicts += check(requests, log, change_ms)
    for passed, line in verdicts:
        out(f"{'PASS' if passed else 'FAIL'}  {line}")
    extensions = sum(
        1 for r in requests if urlsplit(r.url).scheme.lower() in EXTENSIONS
    )
    out(
        f"NOTE  extensions: {plural(extensions, 'request', 'requests')} from a browser extension, not counted above"
    )
    passed = all(ok for ok, _ in verdicts)
    out(f"har_check: {'PASS' if passed else 'FAIL'}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
