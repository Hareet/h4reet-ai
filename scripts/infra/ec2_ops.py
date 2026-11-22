#!/usr/bin/env python3
"""The Author's EC2 targets (spec 001 tasks.md T120, T125; FR-012, FR-065; contracts/handover.md §5 and §7; research.md
R-32; ADR 0048). His terminal alone, with his SSO session: each refuses inside the agent sandbox, and the bash gate
refuses the targets to agent sessions (P-1's rows).

    python3 -I -B scripts/infra/ec2_ops.py status [--profile NAME]
    python3 -I -B scripts/infra/ec2_ops.py start [--replace ec2|tunnel_end [--skip TYPE,...] [--dry-run]] [--profile NAME]
    python3 -I -B scripts/infra/ec2_ops.py stop [--profile NAME]
    python3 -I -B scripts/infra/ec2_ops.py autostart --state on|off [--profile NAME]
    python3 -I -B scripts/infra/ec2_ops.py restore --incident docs/incidents/<note>.md [--profile NAME]

status     EC2's state and its spot request's, the autostart switch, the server action's status, EC2's hours and whether
           it is inside them now, and the relay's serving host. Each read that fails reads `unknown`, never a guess.
           The hours are read from infra/account/handover.tf's local.ec2_hours, their one source; the status request is
           marked as a probe (X-H4-Probe: 1), as the handover loop's is.
start      invokes h4-ec2-start with {"manual": true}, so the function's checks apply (outside the hours, refused:
           with --replace, spec 032's hand replace of that host from its list of launch templates, skipping the types
           --skip names (FR-009; docs/runbooks/ec2.md, tunnel-end.md); EC2's still after its checks;
           the regrouping note's question 2, his answer "2 A"), and prints its outcome.
stop       stops the running instance tagged h4-prod-ec2 through the profile he names, his h4-ec2-stop permission set;
           a line in ~/.local/state/h4reet/ec2-actions.jsonl, and ec2_stopped_by_author on h4-alerts. W1's: it needs no
           function (plan.md §16, "Between W1's applies and W2's").
autostart  writes /h4reet/prod/ec2-autostart; with `on`, invokes h4-ec2-start once, since the alarm won't change again
           while the laptop stays away; an audit line.
restore    the server-budget-restore target: reverses the server action on h4-server-month, after the incident note he
           names, which must be a file under docs/incidents/; an audit line.

It prints names and states, never a secret. Exit codes: 0 done (for start, EC2 started); 1 refused (for start, the
function refused); 2 it couldn't run.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROG = "ec2"
REPO = Path(__file__).resolve().parents[2]
PROFILE = re.compile(r"[A-Za-z0-9._-]+")
EC2_NAME = "h4-prod-ec2"
TUNNEL_END_NAME = "h4-prod-tunnel-end"
AUTOSTART = "/h4reet/prod/ec2-autostart"
SERVER_BUDGET = "h4-server-month"
START_FUNCTION = "h4-ec2-start"
STATUS_URL = "https://hareet.ai/api/status"
HOURS = re.compile(
    r'ec2_hours\s*=\s*\{\s*zone\s*=\s*"([^"]+)"\s*open\s*=\s*"([0-9]{2}:[0-9]{2})"\s*close\s*=\s*"([0-9]{2}:[0-9]{2})"\s*\}'
)


class Refused(Exception):
    pass


class Usage(Exception):
    pass


class AwsFailed(RuntimeError):
    pass


def aws(profile: str, *args: str, env: dict[str, str] | None = None) -> dict:
    """One AWS CLI call with the profile; `env` adds to the call's environment (the hand start's send-once)."""
    done = subprocess.run(
        [
            "aws",
            *args,
            "--profile",
            profile,
            "--region",
            "us-east-1",
            "--output",
            "json",
            "--no-cli-pager",
        ],
        capture_output=True,
        text=True,
        env={
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(Path.home()),
            **(env or {}),
        },
        check=False,
        stdin=subprocess.DEVNULL,
    )
    if done.returncode != 0:
        m = re.search(r"\(([A-Za-z]+)\)", done.stderr)
        raise AwsFailed(
            f"aws {' '.join(args[:2])}: {m.group(1) if m else f'exited {done.returncode}'}"
        )
    try:
        answer = json.loads(done.stdout or "{}")
    except ValueError:
        raise AwsFailed(
            f"aws {' '.join(args[:2])}: an answer that isn't JSON"
        ) from None
    return answer if isinstance(answer, dict) else {}


def now() -> datetime:
    given = os.environ.get("H4_NOW")
    if given:
        return datetime.fromisoformat(given.replace("Z", "+00:00"))
    return datetime.now(timezone.utc)


def audit(row: dict) -> None:
    """One line in ~/.local/state/h4reet/ec2-actions.jsonl (contracts/handover.md §7), 0600 in 0700."""
    folder = Path.home() / ".local" / "state" / "h4reet"
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = folder / "ec2-actions.jsonl"
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    with os.fdopen(fd, "a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {"at": now().strftime("%Y-%m-%dT%H:%M:%SZ"), **row}, sort_keys=True
            )
            + "\n"
        )


def account(profile: str) -> str:
    value = aws(profile, "sts", "get-caller-identity").get("Account")
    if not isinstance(value, str) or not value.isdigit():
        raise AwsFailed("aws sts get-caller-identity: no account")
    return value


def tagged(
    profile: str, states: str = "pending,running", name: str = EC2_NAME
) -> list[dict]:
    answer = aws(
        profile,
        "ec2",
        "describe-instances",
        "--filters",
        f"Name=tag:Name,Values={name}",
        f"Name=instance-state-name,Values={states}",
    )
    return [
        i
        for r in answer.get("Reservations") or []
        for i in r.get("Instances") or []
        if isinstance(i, dict)
    ]


TYPE = re.compile(r"[a-z][a-z0-9]{1,7}\.[a-z0-9]{3,10}")


def start_event(replace: str | None, skip: str | None, dry: bool = False) -> dict:
    """The start function's event: {"manual": true}, and spec 032's replace with the types it skips (FR-009), or its
    dry run, which proves the role launches each listed type and changes nothing (the rework's note, step 6)."""
    if replace is None:
        if skip is not None or dry:
            raise Usage("--skip and --dry-run go with --replace ec2|tunnel_end")
        return {"manual": True}
    types = [t for t in (skip or "").split(",") if t]
    if not all(TYPE.fullmatch(t) for t in types):
        raise Usage("--skip takes instance types, comma-separated: t4g.large,m7g.large")
    event: dict = {"manual": True, "replace": replace, "skip": types}
    if dry:
        event["dry_run"] = True
    return event


# fix/032-launch-policy, found on AWS on 2026-11-22: a replace (launch, wait until it runs, attach) takes minutes, so
# the CLI's default 60-second read timeout gave up and its default retries sent the invocation again; the second found
# the first's lock and answered busy while the first still replaced EC2. The hand start waits past the function's
# timeout (infra/account/handover.tf, 900 s) and is sent once.
START_READ_TIMEOUT_S = 960
SEND_ONCE = {"AWS_MAX_ATTEMPTS": "1", "AWS_RETRY_MODE": "standard"}


def invoke_start(profile: str, event: dict | None = None) -> int:
    """h4-ec2-start, by hand, synchronously and sent once: its outcome is what this prints."""
    with tempfile.TemporaryDirectory() as folder:
        out = Path(folder) / "out.json"
        aws(
            profile,
            "lambda",
            "invoke",
            "--function-name",
            START_FUNCTION,
            "--invocation-type",
            "RequestResponse",
            "--cli-binary-format",
            "raw-in-base64-out",
            "--payload",
            json.dumps(event or {"manual": True}),
            "--cli-read-timeout",
            str(START_READ_TIMEOUT_S),
            str(out),
            env=SEND_ONCE,
        )
        try:
            result = json.loads(out.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            result = {}
    outcome = result.get("outcome") if isinstance(result, dict) else None
    dry = result.get("dry_run") if isinstance(result, dict) else None
    if isinstance(dry, dict):
        for kind, code in dry.items():
            print(f"{PROG}: dry run {kind}: {code}")
        ok = bool(dry) and all(code == "DryRunOperation" for code in dry.values())
        print(
            f"{PROG}: the role {'launches every listed type' if ok else 'refuses a type: see above'}"
        )
        return 0 if ok else 1
    if outcome == "started":
        print(f"{PROG}: {START_FUNCTION} started EC2")
        return 0
    reason = result.get("reason", "unknown") if isinstance(result, dict) else "unknown"
    if isinstance(result, dict) and result.get("code") == "busy":
        # busy sends no alert: another start or replace holds the host lock and is still running.
        print(
            f"{PROG}: {START_FUNCTION}: another start holds the lock; wait, or check the first run's outcome in "
            "the function's log (docs/runbooks/handover.md)"
        )
        return 1
    print(
        f"{PROG}: {START_FUNCTION} refused ({reason}); its alert says why (docs/runbooks/handover.md)"
    )
    return 1


def read_hours() -> tuple[str, str, str] | None:
    path = REPO / "infra" / "account" / "handover.tf"
    try:
        m = HOURS.search(path.read_text(encoding="utf-8"))
    except OSError:
        return None
    return (m.group(1), m.group(2), m.group(3)) if m else None


def hours_line() -> str:
    hours = read_hours()
    if hours is None:
        return "unknown (infra/account/handover.tf holds no local.ec2_hours yet: P-I6)"
    zone, opens, closes = hours
    try:
        spec = importlib.util.spec_from_file_location(
            "h4_ec2_start_for_status",
            REPO / "infra" / "lambdas" / "ec2_start" / "start.py",
        )
        assert spec is not None and spec.loader is not None
        start = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = start
        spec.loader.exec_module(start)
        inside = start.parse_hours(f"{zone} {opens}-{closes}").inside(now())
    except Exception as exc:  # noqa: BLE001 - any failure reads unknown, with its class alone
        return f"{opens}-{closes} {zone}, unknown now ({type(exc).__name__})"
    return f"{opens}-{closes} {zone}, {'inside' if inside else 'outside'} them now"


def relay_line() -> str:
    url = os.environ.get("H4_STATUS_URL", STATUS_URL)
    request = urllib.request.Request(
        url, headers={"X-H4-Probe": "1", "Accept": "application/json"}, method="GET"
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            doc = json.loads(response.read(65536).decode("utf-8"))
    except (OSError, ValueError, urllib.error.URLError):
        return "unknown (the status request failed)"
    serving = doc.get("serving") if isinstance(doc, dict) else None
    return (
        f"serving {serving}"
        if isinstance(serving, str)
        else "unknown (no serving field)"
    )


def status(profile: str) -> int:
    lines: list[tuple[str, str]] = []
    try:
        found = tagged(profile, "pending,running,stopping,stopped")
        if not found:
            lines.append(("ec2", "no instance tagged h4-prod-ec2"))
        for i in found:
            state = (i.get("State") or {}).get("Name", "unknown")
            spot = i.get("SpotInstanceRequestId")
            # Spec 032: the listed type each host runs.
            text = f"{i.get('InstanceId')} {state}, {i.get('InstanceType', 'unknown type')}"
            if isinstance(spot, str):
                try:
                    req = (
                        aws(
                            profile,
                            "ec2",
                            "describe-spot-instance-requests",
                            "--spot-instance-request-ids",
                            spot,
                        ).get("SpotInstanceRequests")
                        or [{}]
                    )[0]
                    text += f", spot request {req.get('State', 'unknown')}"
                except AwsFailed:
                    text += ", spot request unknown"
            lines.append(("ec2", text))
    except AwsFailed as exc:
        lines.append(("ec2", f"unknown ({exc})"))
    try:
        ends = tagged(profile, "pending,running,stopping,stopped", TUNNEL_END_NAME)
        lines += [
            (
                "tunnel end",
                (
                    f"{i.get('InstanceId')} {(i.get('State') or {}).get('Name', 'unknown')}, "
                    f"{i.get('InstanceType', 'unknown type')}"
                ),
            )
            for i in ends
        ] or [("tunnel end", f"no instance tagged {TUNNEL_END_NAME}")]
    except AwsFailed as exc:
        lines.append(("tunnel end", f"unknown ({exc})"))
    try:
        value = (
            aws(profile, "ssm", "get-parameter", "--name", AUTOSTART)
            .get("Parameter", {})
            .get("Value")
        )
        lines.append(
            (
                "autostart",
                str(value) if value in ("on", "off") else f"unknown ({value!r})",
            )
        )
    except AwsFailed as exc:
        lines.append(("autostart", f"unknown ({exc})"))
    try:
        actions = aws(
            profile,
            "budgets",
            "describe-budget-actions-for-budget",
            "--account-id",
            account(profile),
            "--budget-name",
            SERVER_BUDGET,
        ).get("Actions")
        servers = [
            a for a in actions or [] if a.get("ActionType") == "RUN_SSM_DOCUMENTS"
        ]
        lines.append(
            (
                "server",
                " ".join(f"RUN_SSM_DOCUMENTS {a.get('Status')}" for a in servers)
                or "unknown (no action)",
            )
        )
    except AwsFailed as exc:
        lines.append(("server", f"unknown ({exc})"))
    lines.append(("hours", hours_line()))
    lines.append(("relay", relay_line()))
    for key, text in lines:
        print(f"{key:<11}{text}")
    return 0


def stop(profile: str) -> int:
    running = [
        i["InstanceId"] for i in tagged(profile) if isinstance(i.get("InstanceId"), str)
    ]
    if not running:
        print(f"{PROG}: nothing to stop: no instance tagged {EC2_NAME} runs")
        return 0
    aws(profile, "ec2", "stop-instances", "--instance-ids", *running)
    audit({"action": "stop", "instances": running, "by": "author"})
    topic = f"arn:aws:sns:us-east-1:{account(profile)}:h4-alerts"
    message = "\n".join(
        [
            "[hareet.ai aws] ec2_stopped_by_author: EC2 stopped by hand",
            f"- at: {now().strftime('%Y-%m-%dT%H:%M:%SZ')}",
            f"- instances: {len(running)}",
        ]
    )
    try:
        aws(profile, "sns", "publish", "--topic-arn", topic, "--message", message)
    except AwsFailed as exc:
        print(
            f"{PROG}: stopped; the alert didn't go ({exc}); the audit line has it",
            file=sys.stderr,
        )
    print(f"{PROG}: stopping {', '.join(running)}")
    return 0


def autostart(profile: str, state: str) -> int:
    aws(
        profile,
        "ssm",
        "put-parameter",
        "--name",
        AUTOSTART,
        "--type",
        "String",
        "--overwrite",
        "--value",
        state,
    )
    audit({"action": "autostart", "state": state, "by": "author"})
    print(f"{PROG}: the autostart switch is {state}")
    return invoke_start(profile) if state == "on" else 0


def restore(profile: str, incident: str) -> int:
    note = (REPO / incident).resolve()
    incidents = (REPO / "docs" / "incidents").resolve()
    if not (note.is_file() and note.parent == incidents and note.suffix == ".md"):
        raise Refused(
            "name the incident note first: INCIDENT=docs/incidents/<date>-<what>.md, a file that exists"
        )
    acct = account(profile)
    actions = aws(
        profile,
        "budgets",
        "describe-budget-actions-for-budget",
        "--account-id",
        acct,
        "--budget-name",
        SERVER_BUDGET,
    ).get("Actions")
    servers = [a for a in actions or [] if a.get("ActionType") == "RUN_SSM_DOCUMENTS"]
    if len(servers) != 1:
        raise Refused(f"{SERVER_BUDGET} holds {len(servers)} server actions, not one")
    action = servers[0]
    if action.get("Status") not in (
        "EXECUTION_SUCCESS",
        "EXECUTION_FAILURE",
        "REVERSE_FAILURE",
    ):
        raise Refused(
            f"the server action is {action.get('Status')}: nothing to reverse"
        )
    aws(
        profile,
        "budgets",
        "execute-budget-action",
        "--account-id",
        acct,
        "--budget-name",
        SERVER_BUDGET,
        "--action-id",
        str(action.get("ActionId")),
        "--execution-type",
        "REVERSE_BUDGET_ACTION",
    )
    audit({"action": "server-budget-restore", "incident": incident, "by": "author"})
    print(
        f"{PROG}: the server action is reversed; EC2 may start again by its usual triggers"
    )
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="ec2_ops.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument(
        "command", choices=("status", "start", "stop", "autostart", "restore")
    )
    parser.add_argument("--state", choices=("on", "off"))
    parser.add_argument("--incident")
    parser.add_argument("--profile")
    parser.add_argument("--replace", choices=("ec2", "tunnel_end"))
    parser.add_argument("--skip")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    if args.command != "start" and (args.replace or args.skip or args.dry_run):
        print(f"{PROG}: --replace and --skip are start's alone", file=sys.stderr)
        return 2
    try:
        event = start_event(args.replace, args.skip, args.dry_run)
    except Usage as exc:
        print(f"{PROG}: {exc}", file=sys.stderr)
        return 2
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            f"{PROG}: this is the Author's: it acts on EC2 with his SSO session",
            file=sys.stderr,
        )
        return 2
    profile = args.profile or os.environ.get("AWS_PROFILE", "")
    if not PROFILE.fullmatch(profile):
        print(f"{PROG}: name your SSO profile: PROFILE=h4reet-…", file=sys.stderr)
        return 2
    try:
        if args.command == "status":
            return status(profile)
        if args.command == "start":
            return invoke_start(profile, event)
        if args.command == "stop":
            return stop(profile)
        if args.command == "autostart":
            if args.state is None:
                print(f"{PROG}: autostart needs --state on|off", file=sys.stderr)
                return 2
            return autostart(profile, args.state)
        if args.incident is None:
            print(
                f"{PROG}: restore needs --incident docs/incidents/<note>.md",
                file=sys.stderr,
            )
            return 2
        return restore(profile, args.incident)
    except Refused as exc:
        print(f"{PROG}: {exc}", file=sys.stderr)
        return 1
    except AwsFailed as exc:
        print(f"{PROG}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
