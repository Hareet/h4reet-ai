#!/usr/bin/env python3
"""SC-017's harness: EC2's route, first then second (spec 001 SC-017; FR-067, FR-068; tasks.md T090; quickstart §7,
step 4).

    python3 -I -B evals/sc017_ec2_routes.py --base http://127.0.0.1:18000 --admin http://127.0.0.1:<admin port>
        --operator-token-file FILE [--turns 100]

It sends a number of hellos to EC2's stack with both paid APIs healthy, then, once the Author has made the Anthropic
API fail (its key refused: a SecureString he changes, then restores), the same number again, and reads `fallback_day`
from the operator's status before, between, and after. It scores the run as SC-017 counts it: in the first phase,
every answered turn the Anthropic adapter's; in the second, every admitted turn Bedrock's; `fallback_day` unchanged;
and each answered turn carrying provider, model, tokens, and cost, as its span and its ledger row do. It reads EC2's
route from config/routing.yaml once the Author's line is there (ADR 0041), and from the routing fixture until then,
and refuses a route that isn't the Anthropic API first and Bedrock second. Its calls are paid: the Author's terminal
alone. Exit 0 the run meets SC-017, 1 it doesn't, 2 it couldn't run.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from collections import Counter
from collections.abc import Callable
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]
FIXTURE = REPO / "evals" / "fixtures" / "routing" / "schema2-ec2-first-anthropic.yaml"
PROVIDERS = {"anthropic": "anthropic", "bedrock": "aws.bedrock"}
MESSAGE = "Say hello."


def routing_file(repo: Path = REPO) -> Path:
    """config/routing.yaml once it names EC2's route; the fixture until then."""
    real = repo / "config" / "routing.yaml"
    routing = yaml.safe_load(real.read_text(encoding="utf-8")) or {}
    hosts = ((routing.get("envs") or {}).get("prod") or {}).get("hosts") or {}
    return real if "ec2" in hosts else FIXTURE


def ec2_route(path: Path) -> dict[str, str]:
    routing = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    route = (((routing.get("envs") or {}).get("prod") or {}).get("hosts") or {}).get(
        "ec2"
    )
    if route != {"first": "anthropic", "second": "bedrock"}:
        raise ValueError(
            f"{path}: EC2's route isn't the Anthropic API first and Bedrock second"
        )
    return {"first": "anthropic", "second": "bedrock"}


def attributes_missing(turn: dict) -> list[str]:
    """What an answered turn lacks of provider, model, tokens, and cost."""
    usage = turn.get("usage") or {}
    missing = [k for k in ("provider", "model") if not turn.get(k)]
    if not all(
        isinstance(usage.get(k), int) for k in ("input_tokens", "output_tokens")
    ):
        missing.append("tokens")
    if not isinstance(turn.get("cost_micro_usd"), int):
        missing.append("cost")
    return missing


def phase(gateway, turns: int, start: int) -> tuple[dict, list[dict]]:
    answered = [gateway.hello(start + i) for i in range(turns)]
    ok = [t for t in answered if t.get("status") == 200]
    return (
        {
            "sent": turns,
            "answered": len(ok),
            "admitted": len(ok),
            "by_provider": dict(Counter(str(t.get("provider")) for t in ok)),
        },
        ok,
    )


def run(gateway, turns: int, fail_first: Callable[[], None]) -> dict:
    """Both phases: healthy, then with the first paid adapter failing, and `fallback_day` around them."""
    before = gateway.status()["fallback_day"]["spent_micro_usd"]
    healthy, first = phase(gateway, turns, 0)
    between = gateway.status()["fallback_day"]["spent_micro_usd"]
    fail_first()
    failing, second = phase(gateway, turns, turns)
    after = gateway.status()["fallback_day"]["spent_micro_usd"]
    return {
        "healthy": healthy,
        "failing": failing,
        "fallback_day": (before, between, after),
        "turns": first + second,
    }


def score(report: dict) -> list[str]:
    found = []
    healthy, failing = report["healthy"], report["failing"]
    if not healthy["answered"] or healthy["by_provider"] != {
        PROVIDERS["anthropic"]: healthy["answered"]
    }:
        found.append(
            f"healthy: not every answered turn is the Anthropic adapter's: {healthy['by_provider']}"
        )
    if not failing["admitted"] or failing["by_provider"] != {
        PROVIDERS["bedrock"]: failing["admitted"]
    }:
        found.append(
            f"failing: not every admitted turn is Bedrock's: {failing['by_provider']}"
        )
    if len(set(report["fallback_day"])) != 1:
        found.append(
            "fallback_day changed: EC2's calls must never count against the laptop's sub-budget"
        )
    lacking = [t.get("request_id") for t in report["turns"] if attributes_missing(t)]
    if lacking:
        found.append(f"{len(lacking)} turns lack provider, model, tokens, or cost")
    return found


class HttpGateway:
    """EC2's stack through its edge, in the Author's Systems Manager session: hello on the API port, and the
    operator's status on the admin port with his token."""

    def __init__(self, base: str, admin: str, token: str) -> None:
        self.base, self.admin, self.token = base.rstrip("/"), admin.rstrip("/"), token
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def hello(self, i: int) -> dict:
        request = urllib.request.Request(
            f"{self.base}/hello",
            data=json.dumps({"message": MESSAGE}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with self.opener.open(request, timeout=60) as response:
                return {"status": response.status, **json.loads(response.read())}
        except urllib.error.HTTPError as error:
            return {"status": error.code}

    def status(self) -> dict:
        request = urllib.request.Request(
            f"{self.admin}/admin/status",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        with self.opener.open(request, timeout=30) as response:
            return json.loads(response.read())


def main(argv: list[str], env: dict[str, str] | None = None) -> int:
    env = dict(os.environ) if env is None else env
    parser = argparse.ArgumentParser(
        prog="sc017_ec2_routes.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--base", required=True)
    parser.add_argument("--admin")
    parser.add_argument("--operator-token-file", type=Path)
    parser.add_argument("--turns", type=int, default=100)
    args = parser.parse_args(argv)
    if env.get("SANDBOX_RUNTIME") == "1":
        print(
            "sc017: the Author's run, in his terminal: its calls are paid",
            file=sys.stderr,
        )
        return 2
    try:
        ec2_route(routing_file())
        token = args.operator_token_file.read_text(encoding="utf-8").strip()
    except (OSError, ValueError, AttributeError) as error:
        print(f"sc017: can't run: {error}", file=sys.stderr)
        return 2
    gateway = HttpGateway(args.base, args.admin or args.base, token)

    def wait_for_the_author() -> None:
        input(
            "sc017: make the Anthropic API fail now (its key refused), then press Enter: "
        )

    report = run(gateway, args.turns, wait_for_the_author)
    found = score(report)
    print(json.dumps({k: v for k, v in report.items() if k != "turns"}, indent=2))
    for line in found:
        print(f"sc017: FAIL {line}")
    print("sc017: PASS" if not found else "sc017: FAIL")
    return 0 if not found else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
