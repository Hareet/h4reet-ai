#!/usr/bin/env python3
"""SC-017's harness: EC2's route, first then second (spec 001 SC-017; FR-067, FR-068; tasks.md T090; quickstart §7,
step 4).

    sudo python3 -I -B evals/sc017_ec2_routes.py --base http://127.0.0.1:18000 --admin http://127.0.0.1:<admin port>
        --operator-token-file FILE [--turns 100] [--env-file /run/h4reet/ec2.env] [--state /var/lib/h4reet/deploy]

On EC2, from the release's tree, in the Author's Systems Manager session, as root, since it reads EC2's env file and
recreates its gateway. It sends a number of hellos to EC2's stack with both paid APIs healthy, paced under the
per-client cap; then makes the Anthropic API fail, and sends the same number again; then restores it. The failing
step works as EC2's gateway reads its key, from the env file, when its container is created (group 7's review A, I-G):
it holds the deployer (its `hold`, unless the Author's already stands), writes a 0600 copy of the env file with the
Anthropic key refused, and recreates the gateway alone from the running release's tree with that copy; the restore
recreates it with the real file, and removes the copy and the hold, whatever happened. The hold's `deploy_refused`
alert (reason `held`) is the run's own.

It reads the operator's status before, between, and after: `meters.fallback_day` and the day's and month's ceilings
(GET /admin/status's shape). It scores the run as SC-017 counts it: in each phase, every turn admitted (a throttled one
leaves the run short), every admitted turn answered, by the Anthropic adapter in the first, by Bedrock in the second;
`fallback_day` unchanged; spend inside the day's and the month's ceilings; and each answered turn carrying provider,
model, tokens, and cost, as its span and its ledger row do. It reads EC2's route from config/routing.yaml once the
Author's line is there (ADR 0041), and from the routing fixture until then, and refuses a route that isn't the
Anthropic API first and Bedrock second. Its calls are paid, at most about $0.05 for 200 turns (plan.md §16): the
Author's alone. Exit 0 the run meets SC-017, 1 it doesn't, 2 it couldn't run.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from collections.abc import Callable
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]
FIXTURE = REPO / "evals" / "fixtures" / "routing" / "schema2-ec2-first-anthropic.yaml"
PROVIDERS = {"anthropic": "anthropic", "bedrock": "aws.bedrock"}
MESSAGE = "Say hello."
# config/budgets.yaml's per_client cap is 20 a minute with a burst of 5: one turn each 3.2 s stays under it.
INTERVAL = 3.2
# What the failing phase gives the gateway for the Anthropic key: no key's shape, so the API refuses every call.
REFUSED_KEY = "sc017-refused-key"
KEY = "GATEWAY_ANTHROPIC_API_KEY"
ENV_FILE = Path("/run/h4reet/ec2.env")
STATE = Path("/var/lib/h4reet/deploy")


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


def phase(
    gateway,
    turns: int,
    start: int,
    sleep: Callable[[float], None] | None,
    interval: float,
) -> tuple[dict, list[dict]]:
    sent = []
    for i in range(turns):
        sent.append(gateway.hello(start + i))
        if sleep is not None:
            sleep(interval)
    admitted = [t for t in sent if t.get("status") != 429]
    ok = [t for t in admitted if t.get("status") == 200]
    return (
        {
            "sent": turns,
            "admitted": len(admitted),
            "answered": len(ok),
            "not_answered": dict(
                Counter(str(t.get("status")) for t in admitted if t not in ok)
            ),
            "by_provider": dict(Counter(str(t.get("provider")) for t in ok)),
        },
        ok,
    )


def meters(status: dict) -> dict:
    """GET /admin/status's meters (services/gateway/src/routes/admin.ts, meterReport); null while the store can't be
    read, which the run can't score."""
    found = status.get("meters")
    if isinstance(found, dict):
        return found
    raise RuntimeError("the operator's status has no meters: the store can't be read")


def run(
    gateway,
    turns: int,
    fail_first: Callable[[], None],
    sleep: Callable[[float], None] | None = None,
    interval: float = INTERVAL,
) -> dict:
    """Both phases: healthy, then with the first paid adapter failing, and the meters around them."""
    seen = [meters(gateway.status())]
    healthy, first = phase(gateway, turns, 0, sleep, interval)
    seen.append(meters(gateway.status()))
    fail_first()
    failing, second = phase(gateway, turns, turns, sleep, interval)
    seen.append(meters(gateway.status()))
    return {
        "healthy": healthy,
        "failing": failing,
        "fallback_day": tuple(m["fallback_day"]["spent_micro_usd"] for m in seen),
        "ceilings": [
            {
                period: (
                    m[period]["spent_micro_usd"],
                    m[period]["ceiling_micro_usd"],
                )
                for period in ("day", "month")
            }
            for m in seen
        ],
        "turns": first + second,
    }


def score(report: dict) -> list[str]:
    found = []
    for name, adapter in (("healthy", "anthropic"), ("failing", "bedrock")):
        p = report[name]
        if p["admitted"] < p["sent"]:
            found.append(
                f"{name}: {p['sent'] - p['admitted']} turns throttled: fewer than {p['sent']} admitted"
            )
        if p["answered"] < p["admitted"]:
            found.append(
                f"{name}: {p['admitted'] - p['answered']} admitted turns weren't answered: {p['not_answered']}"
            )
        if not p["answered"] or p["by_provider"] != {PROVIDERS[adapter]: p["answered"]}:
            found.append(
                f"{name}: not every answered turn is the {adapter} adapter's: {p['by_provider']}"
            )
    if len(set(report["fallback_day"])) != 1:
        found.append(
            "fallback_day changed: EC2's calls must never count against the laptop's sub-budget"
        )
    for at, ceilings in zip(("before", "between", "after"), report["ceilings"]):
        for period, (spent, ceiling) in ceilings.items():
            if spent > ceiling:
                found.append(
                    f"{at}: the {period}'s ceiling was crossed, {spent} of {ceiling} micro-USD"
                )
    lacking = [t.get("request_id") for t in report["turns"] if attributes_missing(t)]
    if lacking:
        found.append(f"{len(lacking)} turns lack provider, model, tokens, or cost")
    return found


def compose_runner(argv: list[str], **kwargs) -> int:
    return subprocess.run(argv, check=False, timeout=900, **kwargs).returncode


class Ec2Key:
    """The failing phase on EC2: the gateway recreated from the running release's tree, with a copy of the env file
    whose Anthropic key is refused, under the deployer's hold; then the real file again."""

    def __init__(self, env_file: Path, state: Path, runner=compose_runner) -> None:
        self.env_file, self.state, self.runner = env_file, state, runner
        current = json.loads((state / "current.json").read_text(encoding="utf-8"))
        self.tree = state / "trees" / str(current["commit"])
        self.release_env = state / "releases" / f"{current['release']}.env"
        self.refused_env = state / "sc017.env"
        self.hold = state / "hold"
        self.made_hold = self.refused = False

    def recreate(self, env_file: Path) -> bool:
        argv = [
            "docker",
            "compose",
            "-f",
            str(self.tree / "deploy" / "compose.yaml"),
            "--env-file",
            str(env_file),
            "--env-file",
            str(self.release_env),
            "up",
            "-d",
            "--no-deps",
            "--force-recreate",
            "--wait",
            "gateway",
        ]
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": "/root",
            "H4_TREE": str(self.tree),
        }
        return self.runner(argv, env=env, cwd=str(self.tree)) == 0

    def refuse(self) -> None:
        self.refused = True
        if not self.hold.exists():
            self.hold.write_text("sc017\n", encoding="utf-8")
            self.made_hold = True
        lines = self.env_file.read_text(encoding="utf-8").splitlines()
        if not [ln for ln in lines if ln.startswith(f"{KEY}=")]:
            raise RuntimeError(f"the env file names no {KEY}")
        text = "".join(
            (f"{KEY}={REFUSED_KEY}" if ln.startswith(f"{KEY}=") else ln) + "\n"
            for ln in lines
        )
        fd = os.open(
            str(self.refused_env), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600
        )
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            out.write(text)
        os.chmod(str(self.refused_env), 0o600)
        if not self.recreate(self.refused_env):
            raise RuntimeError("the gateway didn't start again with the refused key")

    def restore(self) -> bool:
        """The gateway with the real file; the copy and the run's own hold go whatever happens, so the deployer's
        next run brings the real gateway back if this didn't. Nothing to do if the key was never refused."""
        if not self.refused:
            return True
        ok = self.recreate(self.env_file)
        try:
            self.refused_env.unlink()
        except OSError:
            pass
        if self.made_hold:
            try:
                self.hold.unlink()
            except OSError:
                pass
        return ok


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
        except (OSError, ValueError):
            return {"status": 0}

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
    parser.add_argument("--env-file", type=Path, default=ENV_FILE)
    parser.add_argument("--state", type=Path, default=STATE)
    parser.add_argument("--interval", type=float, default=INTERVAL)
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
        key = Ec2Key(args.env_file, args.state)
    except (OSError, ValueError, KeyError, AttributeError) as error:
        print(f"sc017: can't run: {error}", file=sys.stderr)
        return 2
    gateway = HttpGateway(args.base, args.admin or args.base, token)
    try:
        report = run(gateway, args.turns, key.refuse, time.sleep, args.interval)
    except (OSError, RuntimeError) as error:
        print(f"sc017: can't run: {error}", file=sys.stderr)
        return 2
    finally:
        if not key.restore():
            print(
                "sc017: the gateway didn't start again with the real key: the deployer's next run restarts it",
                file=sys.stderr,
            )
    found = score(report)
    print(json.dumps({k: v for k, v in report.items() if k != "turns"}, indent=2))
    for line in found:
        print(f"sc017: FAIL {line}")
    print("sc017: PASS" if not found else "sc017: FAIL")
    return 0 if not found else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
