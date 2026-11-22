"""Tests for scripts/infra/ec2_ops.py: the Author's EC2 targets (spec 001 tasks.md T120, T125; FR-012, FR-065;
contracts/handover.md §5 and §7; research.md R-32; ADR 0048). His terminal alone, with his SSO session: each refuses
inside the agent sandbox, and the bash gate refuses the targets to agent sessions (P-1's rows).

    ec2_ops.py status                 EC2's state and its spot request's, the autostart switch, the server action, the
                                      hours and whether it is inside them, and the relay's serving host
    ec2_ops.py start                  invokes h4-ec2-start with {"manual": true}, so the function's checks apply
    ec2_ops.py stop                   stops the instance tagged h4-prod-ec2, through the h4-ec2-stop profile he names;
                                      an audit line, and ec2_stopped_by_author on h4-alerts. W1's: it needs no function
    ec2_ops.py autostart --state S    writes the switch; with on, invokes the start once; an audit line
    ec2_ops.py restore --incident F   reverses the server action, after the incident note F, under docs/incidents/

The aws CLI is scripts/infra/infra_testkit.py's fake; the relay's status is a server on 127.0.0.1.
"""

from __future__ import annotations

import http.server
import importlib.util
import json
import re
import sys
import threading
from pathlib import Path
from typing import ClassVar

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


kit = _load("infra_testkit_for_ec2_ops", HERE / "infra_testkit.py")
PROFILE = "h4reet-admin"
ACCOUNT = "1" * 4 + "2" * 4 + "3" * 4
EC2_ID = "i-0" + "ab" * 8
SPOT_ID = "sir-" + "x" * 8
HOURS_TF = """locals {
  wired = false
}

locals {
  ec2_hours = {
    zone  = "America/Denver"
    open  = "07:00"
    close = "19:00"
  }
}
"""


class Status(http.server.BaseHTTPRequestHandler):
    seen: ClassVar[list[dict]] = []

    def do_GET(self) -> None:
        Status.seen.append(dict(self.headers))
        body = json.dumps(
            {"serving": "laptop", "since": "2026-11-13T05:00:00Z"}
        ).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        pass


@pytest.fixture
def relay():
    Status.seen = []
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Status)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}/api/status"
    server.shutdown()


def answers(**over: object) -> dict:
    out: dict = {
        "sts get-caller-identity": {"Account": ACCOUNT},
        "ec2 describe-instances": {
            "Reservations": [
                {
                    "Instances": [
                        {
                            "InstanceId": EC2_ID,
                            "InstanceType": "m7g.large",
                            "State": {"Name": "running"},
                            "SpotInstanceRequestId": SPOT_ID,
                        }
                    ]
                }
            ]
        },
        "ec2 describe-spot-instance-requests": {
            "SpotInstanceRequests": [
                {"State": "active", "Status": {"Code": "fulfilled"}}
            ]
        },
        "ssm get-parameter": {"Parameter": {"Value": "on"}},
        "ssm put-parameter": {"Version": 2},
        "budgets describe-budget-actions-for-budget": {
            "Actions": [
                {
                    "ActionId": "a-model",
                    "ActionType": "APPLY_IAM_POLICY",
                    "Status": "STANDBY",
                },
                {
                    "ActionId": "a-server",
                    "ActionType": "RUN_SSM_DOCUMENTS",
                    "Status": "EXECUTION_SUCCESS",
                },
            ]
        },
        "budgets execute-budget-action": {"ExecutionType": "REVERSE_BUDGET_ACTION"},
        "ec2 stop-instances": {"StoppingInstances": [{"InstanceId": EC2_ID}]},
        "sns publish": {"MessageId": "m-1"},
        "lambda invoke": {"StatusCode": 202},
    }
    out.update(over)
    return out


@pytest.fixture
def world(tmp_path: Path) -> dict:
    repo = tmp_path / "repo"
    (repo / "scripts" / "infra").mkdir(parents=True)
    (repo / "scripts" / "infra" / "ec2_ops.py").write_bytes(
        (HERE / "ec2_ops.py").read_bytes()
    )
    (repo / "infra" / "account").mkdir(parents=True)
    (repo / "infra" / "account" / "handover.tf").write_text(HOURS_TF, encoding="utf-8")
    (repo / "infra" / "lambdas" / "ec2_start").mkdir(parents=True)
    (repo / "infra" / "lambdas" / "ec2_start" / "start.py").write_bytes(
        (REPO / "infra" / "lambdas" / "ec2_start" / "start.py").read_bytes()
    )
    (repo / "docs" / "incidents").mkdir(parents=True)
    (repo / "docs" / "incidents" / "2026-12-01-server-budget.md").write_text(
        "# The note\n", encoding="utf-8"
    )
    home = tmp_path / "home"
    home.mkdir()
    bin_dir = kit.fakes(tmp_path, aws=answers())
    return {"repo": repo, "home": home, "bin": bin_dir}


def run(w: dict, *args: str, **env: str):
    return kit.run_script(
        w["repo"], w["home"], w["bin"], "ec2_ops.py", *args, "--profile", PROFILE, **env
    )


def aws_calls(w: dict) -> list[list[str]]:
    return [c["argv"] for c in kit.calls(w["bin"], "aws")]


def calls_of(w: dict, service: str, op: str) -> list[list[str]]:
    return [a for a in aws_calls(w) if a[:2] == [service, op]]


def value(argv: list[str], flag: str) -> str:
    return argv[argv.index(flag) + 1]


def audit_rows(w: dict) -> list[dict]:
    path = w["home"] / ".local" / "state" / "h4reet" / "ec2-actions.jsonl"
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


COMMANDS = (
    ("status",),
    ("start",),
    ("stop",),
    ("autostart", "--state", "on"),
    ("restore", "--incident", "docs/incidents/2026-12-01-server-budget.md"),
)


@pytest.mark.parametrize("args", COMMANDS, ids=[a[0] for a in COMMANDS])
def test_each_refuses_inside_the_sandbox(world: dict, args: tuple[str, ...]) -> None:
    done = run(world, *args, SANDBOX_RUNTIME="1")
    assert done.returncode == 2
    assert "the Author's" in done.stderr
    assert aws_calls(world) == []


def test_each_needs_a_named_profile(world: dict) -> None:
    done = kit.run_script(
        world["repo"], world["home"], world["bin"], "ec2_ops.py", "status"
    )
    assert done.returncode == 2 and "PROFILE" in done.stderr
    assert aws_calls(world) == []


def test_start_invokes_the_function_by_hand_once(world: dict) -> None:
    done = run(world, "start")
    assert done.returncode in (0, 1), done.stderr
    (invoke,) = calls_of(world, "lambda", "invoke")
    assert value(invoke, "--function-name") == "h4-ec2-start"
    assert json.loads(value(invoke, "--payload")) == {"manual": True}
    assert value(invoke, "--invocation-type") == "RequestResponse"
    # It starts nothing itself: only the function does, after its checks.
    assert calls_of(world, "ec2", "start-instances") == []


# Spec 032 (FR-009): the Author's hand replace, through the same function and its checks.
@pytest.mark.parametrize(
    ("argv", "payload"),
    [
        (
            ("start", "--replace", "ec2", "--skip", "t4g.large"),
            {"manual": True, "replace": "ec2", "skip": ["t4g.large"]},
        ),
        (
            ("start", "--replace", "ec2", "--skip", "t4g.large,m7g.large"),
            {"manual": True, "replace": "ec2", "skip": ["t4g.large", "m7g.large"]},
        ),
        (
            ("start", "--replace", "tunnel_end"),
            {"manual": True, "replace": "tunnel_end", "skip": []},
        ),
    ],
)
def test_start_with_a_replace_sends_the_host_and_the_types_to_skip(
    world: dict, argv: tuple[str, ...], payload: dict
) -> None:
    done = run(world, *argv)
    assert done.returncode in (0, 1), done.stderr
    (invoke,) = calls_of(world, "lambda", "invoke")
    assert json.loads(value(invoke, "--payload")) == payload
    assert calls_of(world, "ec2", "terminate-instances") == []


@pytest.mark.parametrize(
    "argv",
    [
        ("start", "--skip", "t4g.large"),
        ("start", "--replace", "laptop"),
        ("start", "--replace", "ec2", "--skip", "t4g.large;id"),
        ("stop", "--replace", "ec2"),
    ],
)
def test_a_replace_it_cant_read_invokes_nothing(
    world: dict, argv: tuple[str, ...]
) -> None:
    done = run(world, *argv)
    assert done.returncode == 2
    assert calls_of(world, "lambda", "invoke") == []


def test_the_start_target_passes_replace_and_skip() -> None:
    recipe = MAKEFILE.split("\nec2-start:", 1)[1].split("\n\n", 1)[0]
    assert '$(if $(call from_cli,REPLACE), --replace "$$REPLACE")' in recipe
    assert '$(if $(call from_cli,SKIP), --skip "$$SKIP")' in recipe


def test_autostart_on_writes_the_switch_invokes_the_start_once_and_writes_the_audit_row(
    world: dict,
) -> None:
    done = run(world, "autostart", "--state", "on")
    assert done.returncode in (0, 1), done.stderr
    (put,) = calls_of(world, "ssm", "put-parameter")
    assert value(put, "--name") == "/h4reet/prod/ec2-autostart"
    assert value(put, "--value") == "on" and value(put, "--type") == "String"
    assert "--overwrite" in put
    (invoke,) = calls_of(world, "lambda", "invoke")
    assert json.loads(value(invoke, "--payload")) == {"manual": True}
    (row,) = audit_rows(world)
    assert row["action"] == "autostart" and row["state"] == "on" and "at" in row


def test_autostart_off_writes_the_switch_and_invokes_nothing(world: dict) -> None:
    done = run(world, "autostart", "--state", "off")
    assert done.returncode == 0, done.stderr
    assert value(calls_of(world, "ssm", "put-parameter")[0], "--value") == "off"
    assert calls_of(world, "lambda", "invoke") == []
    assert [r["state"] for r in audit_rows(world)] == ["off"]


def test_autostart_takes_on_or_off_alone(world: dict) -> None:
    done = run(world, "autostart", "--state", "maybe")
    assert done.returncode == 2 and aws_calls(world) == []


def test_stop_stops_the_tagged_instance_alerts_and_writes_the_audit_line(
    world: dict,
) -> None:
    done = run(world, "stop")
    assert done.returncode == 0, done.stderr
    (describe,) = calls_of(world, "ec2", "describe-instances")
    assert "Name=tag:Name,Values=h4-prod-ec2" in describe
    (stop,) = calls_of(world, "ec2", "stop-instances")
    assert value(stop, "--instance-ids") == EC2_ID
    (publish,) = calls_of(world, "sns", "publish")
    assert value(publish, "--topic-arn") == f"arn:aws:sns:us-east-1:{ACCOUNT}:h4-alerts"
    message = value(publish, "--message")
    assert message.startswith("[hareet.ai aws] ec2_stopped_by_author: ")
    assert ACCOUNT not in message
    (row,) = audit_rows(world)
    assert row["action"] == "stop" and row["instances"] == [EC2_ID]


def test_stop_with_nothing_running_stops_nothing(world: dict) -> None:
    kit.answer(
        world["bin"], aws=answers(**{"ec2 describe-instances": {"Reservations": []}})
    )
    done = run(world, "stop")
    assert done.returncode == 0, done.stderr
    assert calls_of(world, "ec2", "stop-instances") == []
    assert "nothing" in done.stdout


def test_status_shows_each_read_and_the_hours_inside_or_out(
    world: dict, relay: str
) -> None:
    done = run(world, "status", H4_STATUS_URL=relay, H4_NOW="2026-11-18T17:00:00Z")
    assert done.returncode == 0, done.stderr
    out = done.stdout
    assert f"{EC2_ID} running" in out and "spot request active" in out
    assert "autostart  on" in out
    assert "server     RUN_SSM_DOCUMENTS EXECUTION_SUCCESS" in out
    assert "hours      07:00-19:00 America/Denver, inside them now" in out
    assert "relay      serving laptop" in out
    # Its status read is marked as a probe, as the loop's is (disclosure row C6).
    assert Status.seen and Status.seen[0].get("X-H4-Probe") == "1"


def test_status_says_outside_the_hours(world: dict, relay: str) -> None:
    done = run(world, "status", H4_STATUS_URL=relay, H4_NOW="2026-11-19T04:00:00Z")
    assert "hours      07:00-19:00 America/Denver, outside them now" in done.stdout


def test_status_names_what_it_couldnt_read_and_never_guesses(world: dict) -> None:
    kit.answer(
        world["bin"],
        aws=answers(**{"ssm get-parameter": {"__error__": "AccessDenied"}}),
    )
    done = run(world, "status", H4_STATUS_URL="http://127.0.0.1:9/api/status")
    assert done.returncode == 0, done.stderr
    assert "autostart  unknown" in done.stdout
    assert "relay      unknown" in done.stdout


def test_restore_needs_an_incident_note_that_exists(world: dict) -> None:
    done = run(world, "restore", "--incident", "docs/incidents/none.md")
    assert done.returncode == 1 and "incident" in done.stderr
    assert calls_of(world, "budgets", "execute-budget-action") == []
    done = run(world, "restore", "--incident", "../outside.md")
    assert done.returncode == 1


def test_restore_reverses_the_server_action_alone(world: dict) -> None:
    done = run(
        world, "restore", "--incident", "docs/incidents/2026-12-01-server-budget.md"
    )
    assert done.returncode == 0, done.stderr
    (reverse,) = calls_of(world, "budgets", "execute-budget-action")
    assert value(reverse, "--budget-name") == "h4-server-month"
    assert value(reverse, "--action-id") == "a-server"
    assert value(reverse, "--execution-type") == "REVERSE_BUDGET_ACTION"
    assert value(reverse, "--account-id") == ACCOUNT
    (row,) = audit_rows(world)
    assert row["action"] == "server-budget-restore"
    assert row["incident"] == "docs/incidents/2026-12-01-server-budget.md"


def test_restore_refuses_while_the_action_hasnt_run(world: dict) -> None:
    kit.answer(
        world["bin"],
        aws=answers(
            **{
                "budgets describe-budget-actions-for-budget": {
                    "Actions": [
                        {
                            "ActionId": "a-server",
                            "ActionType": "RUN_SSM_DOCUMENTS",
                            "Status": "STANDBY",
                        }
                    ]
                }
            }
        ),
    )
    done = run(
        world, "restore", "--incident", "docs/incidents/2026-12-01-server-budget.md"
    )
    assert done.returncode == 1
    assert calls_of(world, "budgets", "execute-budget-action") == []


# The Makefile's five targets: each the Author's, refusing in the sandbox before its script runs, and running its
# script with the command line's values passed as typed.
MAKEFILE = (REPO / "Makefile").read_text(encoding="utf-8")
TARGETS = [
    ("ec2-status", "scripts/infra/ec2_ops.py status"),
    ("ec2-start", "scripts/infra/ec2_ops.py start"),
    ("ec2-stop", "scripts/infra/ec2_ops.py stop"),
    ("ec2-autostart", 'scripts/infra/ec2_ops.py autostart --state "$$STATE"'),
    (
        "server-budget-restore",
        'scripts/infra/ec2_ops.py restore --incident "$$INCIDENT"',
    ),
]


@pytest.mark.parametrize(("target", "line"), TARGETS, ids=[t for t, _ in TARGETS])
def test_the_targets_are_the_authors_and_run_their_scripts(
    target: str, line: str
) -> None:
    recipe = MAKEFILE.split(f"\n{target}:", 1)[1].split("\n\n", 1)[0]
    assert "## (the Author)" in recipe.splitlines()[0]
    assert "$(call AUTHOR_ONLY," in recipe
    assert line in recipe
    phony = " ".join(
        block.split("\n\n", 1)[0].replace("\\\n", " ")
        for block in MAKEFILE.split("\n.PHONY:")[1:]
    )
    assert f" {target} " in f" {phony} ", target


@pytest.mark.parametrize(
    ("target", "name"),
    [("ec2-autostart", "STATE"), ("server-budget-restore", "INCIDENT")],
)
def test_the_targets_that_need_a_value_say_so(target: str, name: str) -> None:
    recipe = MAKEFILE.split(f"\n{target}:", 1)[1].split("\n\n", 1)[0]
    assert f"$(call NEEDS,{name}," in recipe


# Spec 032's rework: the status names each host's type, and the hand dry run proves the role without a change.
def test_status_names_each_hosts_type(world: dict, relay: str) -> None:
    done = run(world, "status", H4_STATUS_URL=relay, H4_NOW="2026-11-18T17:00:00Z")
    assert done.returncode == 0, done.stderr
    assert f"ec2        {EC2_ID} running, m7g.large" in done.stdout
    assert f"tunnel end {EC2_ID} running, m7g.large" in done.stdout
    filters = [
        value(c, "--filters") for c in calls_of(world, "ec2", "describe-instances")
    ]
    assert any("h4-prod-tunnel-end" in f for f in filters)


def test_start_with_a_dry_run_sends_it_and_changes_nothing(world: dict) -> None:
    done = run(world, "start", "--replace", "tunnel_end", "--dry-run")
    assert done.returncode in (0, 1), done.stderr
    (invoke,) = calls_of(world, "lambda", "invoke")
    assert json.loads(value(invoke, "--payload")) == {
        "manual": True,
        "replace": "tunnel_end",
        "skip": [],
        "dry_run": True,
    }


def test_a_dry_run_needs_a_replace(world: dict) -> None:
    assert run(world, "start", "--dry-run").returncode == 2
    assert calls_of(world, "lambda", "invoke") == []


def test_the_start_target_passes_dry_run() -> None:
    recipe = MAKEFILE.split("\nec2-start:", 1)[1].split("\n\n", 1)[0]
    assert "$(if $(call from_cli,DRY_RUN), --dry-run)" in recipe


# fix/032-launch-policy, found on AWS on 2026-11-22: the CLI's default 60-second read timeout gave up on a replace that
# takes minutes, and its default retries sent the invocation again; the second found the first's lock and answered
# busy, which this printed as a failed start while the first still replaced EC2.
START_TIMEOUT = int(
    re.search(
        r'function_name\s*=\s*"h4-ec2-start".*?\btimeout\s*=\s*(\d+)',
        (REPO / "infra" / "account" / "handover.tf").read_text(encoding="utf-8"),
        re.DOTALL,
    ).group(1)  # type: ignore[union-attr]
)


@pytest.mark.parametrize(
    "argv", [("start",), ("start", "--replace", "ec2"), ("autostart", "--state", "on")]
)
def test_a_hand_start_outwaits_the_function_and_is_sent_once(
    world: dict, argv: tuple[str, ...]
) -> None:
    run(world, *argv)
    rows = kit.calls(world["bin"], "aws")
    (invoke,) = [r for r in rows if r["argv"][:2] == ["lambda", "invoke"]]
    assert int(value(invoke["argv"], "--cli-read-timeout")) > START_TIMEOUT
    assert invoke["env"].get("AWS_MAX_ATTEMPTS") == "1"
    # The other calls keep the CLI's defaults.
    assert all(
        "AWS_MAX_ATTEMPTS" not in r["env"] and "--cli-read-timeout" not in r["argv"]
        for r in rows
        if r["argv"][:2] != ["lambda", "invoke"]
    )


def _answered(monkeypatch: pytest.MonkeyPatch, result: dict):
    ops = _load("ec2_ops_for_its_answers", HERE / "ec2_ops.py")

    def invoked(profile: str, *args: str, **_: object) -> dict:
        Path(args[-1]).write_text(json.dumps(result), encoding="utf-8")
        return {"StatusCode": 200}

    monkeypatch.setattr(ops, "aws", invoked)
    return ops


def test_a_busy_refusal_says_another_start_holds_the_lock(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    ops = _answered(
        monkeypatch,
        {
            "outcome": "refused",
            "trigger": "manual",
            "reason": "start_failed",
            "code": "busy",
        },
    )
    assert ops.invoke_start(PROFILE, {"manual": True, "replace": "ec2"}) == 1
    out = capsys.readouterr().out
    assert "another start holds the lock" in out
    assert "the function's log" in out
    # busy sends no alert, so the line never points at one.
    assert "start_failed" not in out and "alert" not in out


def test_another_refusal_still_points_at_its_alert(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    ops = _answered(
        monkeypatch,
        {
            "outcome": "refused",
            "trigger": "manual",
            "reason": "start_failed",
            "code": "no_capacity",
        },
    )
    assert ops.invoke_start(PROFILE) == 1
    out = capsys.readouterr().out
    assert "refused (start_failed)" in out and "its alert says why" in out
