"""The studio's GPU window, from the Author's terminal (spec 003 FR-035; tasks.md T033, T035;
specs/003-studio-assets/contracts/gpu-window.md §2).

- The operator CLI's studio-window command (T033): its arguments, the reason's length, the stack refusals, its summary,
  its exit codes, and the dev-cpu hop. Each runs against a temporary HOME and a stand-in admin listener on 127.0.0.1 at
  port 0, with ADMIN_PORTS pointed at it, never a real stack. Tokens are built at run time, so this file holds none.
- make studio-window (T035): its refusals, and the order of what it runs, with stand-ins for python3 and docker first
  on PATH that only record their arguments, so nothing reaches a stack, an engine, or the operator token.
"""

from __future__ import annotations

import http.server
import importlib.util
import json
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "h4_operator_studio_window", REPO / "scripts" / "operator.py"
)
assert SPEC and SPEC.loader
op = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = op
SPEC.loader.exec_module(op)

B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
START = "studio: a portrait batch on the GPU"
END = "studio: the portrait batch is done"


def token(scope: str) -> str:
    """A token in the credential's shape (data-model.md §5), assembled here so the file holds none."""
    return f"h4op_{scope}_" + "".join(B64URL[(i * 5) % 64] for i in range(43))


class Listener:
    """A stand-in admin listener: one queued answer per request, and every request kept."""

    def __init__(self) -> None:
        self.queue: list[tuple[int, Any]] = []
        self.requests: list[dict[str, Any]] = []
        listener = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def handle_one(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                listener.requests.append(
                    {
                        "method": self.command,
                        "path": self.path,
                        "auth": self.headers.get("Authorization"),
                        "body": json.loads(raw) if raw else None,
                    }
                )
                status, body = (
                    listener.queue.pop(0)
                    if listener.queue
                    else (404, {"error": "not_found"})
                )
                data = json.dumps(body).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            do_GET = handle_one
            do_POST = handle_one

            def log_message(self, format: str, *args: Any) -> None:
                return

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(
            target=self.server.serve_forever,
            kwargs={"poll_interval": 0.02},
            daemon=True,
        )
        self.thread.start()
        self.port = self.server.server_address[1]

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    base = home / ".config" / "h4reet-ai" / "operator"
    base.mkdir(parents=True)
    (home / ".config" / "h4reet-ai").chmod(0o700)
    base.chmod(0o700)
    for stack in ("dev", "prod"):
        path = base / f"{stack}.token"
        path.write_text(token(stack), encoding="utf-8")
        path.chmod(0o600)
    return home


@pytest.fixture
def listener(monkeypatch: pytest.MonkeyPatch) -> Any:
    stand_in = Listener()
    monkeypatch.setattr(op, "ADMIN_PORTS", dict.fromkeys(op.STACKS, stand_in.port))
    yield stand_in
    stand_in.close()


def opened(stack: str = "prod") -> dict[str, Any]:
    return {
        "action": "studio_window",
        "audit_id": 57,
        "state": "start",
        "window": "open",
        "since": "2026-11-02T20:14:03Z",
        "note": "The window is open. Hello falls back within the sub-budget, or degrades, once the model server stops.",
        "journal": "ok",
    }


def closed() -> dict[str, Any]:
    return {
        "action": "studio_window",
        "audit_id": 58,
        "state": "end",
        "window": "closed",
        "since": "2026-11-02T21:02:40Z",
        "opened": "2026-11-02T20:14:03Z",
        "fallback": {"spent_micro_usd": 2700, "calls": 1},
        "note": "The window is closed. Its fallback spend: $0.0027 in 1 call.",
        "journal": "ok",
    }


def window(*extra: str, stack: str = "prod", state: str = "start") -> list[str]:
    return ["--stack", stack, "studio-window", state, *extra]


# --------------------------------------------------------------------------------------------------
# The CLI's studio-window command (T033)
# --------------------------------------------------------------------------------------------------


def test_start_posts_the_state_and_the_trimmed_reason_and_summarizes(
    home: Path, listener: Listener, capsys: pytest.CaptureFixture[str]
) -> None:
    listener.queue.append((200, opened()))
    assert op.main(window("--reason", f"  {START}  ")) == 0
    (request,) = listener.requests
    assert request["method"] == "POST"
    assert request["path"] == "/admin/studio-window"
    assert request["body"] == {"state": "start", "reason": START}
    assert request["auth"] == f"Bearer {token('prod')}"
    out = capsys.readouterr().out.splitlines()
    assert out[0] == "prod  studio window open · audit #57 · since 2026-11-02T20:14:03Z"
    assert out[1].startswith("note           The window is open.")
    assert token("prod") not in "\n".join(out)


def test_end_summarizes_the_windows_span_and_its_fallback_spend(
    home: Path, listener: Listener, capsys: pytest.CaptureFixture[str]
) -> None:
    listener.queue.append((200, closed()))
    assert op.main(window("--reason", END, state="end")) == 0
    assert listener.requests[0]["body"] == {"state": "end", "reason": END}
    out = capsys.readouterr().out.splitlines()
    assert out[:2] == [
        "prod  studio window closed · audit #58 · open 2026-11-02T20:14:03Z to 2026-11-02T21:02:40Z",
        "fallback       0.0027 USD in 1 call (the window's, from the ledger)",
    ]


def test_json_prints_the_answer_as_it_came(
    home: Path, listener: Listener, capsys: pytest.CaptureFixture[str]
) -> None:
    listener.queue.append((200, opened()))
    assert op.main([*window("--reason", START), "--json"]) == 0
    assert json.loads(capsys.readouterr().out) == opened()


def test_a_failed_journal_append_is_named_and_the_window_stands(
    home: Path, listener: Listener, capsys: pytest.CaptureFixture[str]
) -> None:
    listener.queue.append((200, {**opened(), "journal": "unwritable"}))
    assert op.main(window("--reason", START)) == 0
    assert "journal        unwritable: the action stands" in capsys.readouterr().out


@pytest.mark.parametrize(
    "argv",
    [
        ["--stack", "prod", "studio-window", "--reason", START],  # no state
        ["--stack", "prod", "studio-window", "pause", "--reason", START],
        ["--stack", "prod", "studio-window", "start"],  # no --reason
        ["--stack", "prod", "studio-window", "start", "--reason"],
        ["studio-window", "start", "--reason", START],  # no --stack
    ],
)
def test_arguments_out_of_shape_are_usage_and_call_nothing(
    home: Path, listener: Listener, argv: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    assert op.main(argv) == 2
    assert listener.requests == []
    assert capsys.readouterr().err.rstrip().endswith("operator.py: exit 2: usage")


@pytest.mark.parametrize(
    "reason",
    ["too short", "   short   ", "x" * 501, "studio: a\nsecond line", "studio:\ta tab"],
)
def test_the_reason_rule_is_checked_before_any_call(
    home: Path, listener: Listener, reason: str, capsys: pytest.CaptureFixture[str]
) -> None:
    # operator-admin.md §1.2: 10 to 500 code points once trimmed, with no control characters.
    assert op.main(window("--reason", reason)) == 2
    assert listener.requests == []
    assert "contracts/operator-admin.md §1.2" in capsys.readouterr().err


def test_dev_is_refused_the_window_is_prods_and_dev_cpus(
    home: Path, listener: Listener, capsys: pytest.CaptureFixture[str]
) -> None:
    assert op.main(window("--reason", START, stack="dev")) == 2
    assert listener.requests == []
    err = capsys.readouterr().err
    assert "prod's" in err and "dev-cpu" in err and "gpu-window.md" in err


def test_prod_inside_the_sandbox_is_refused_before_the_token_is_read(
    home: Path,
    listener: Listener,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    assert op.main(window("--reason", START)) == 2
    assert listener.requests == []
    assert "FR-008" in capsys.readouterr().err


@pytest.mark.parametrize(
    ("status", "body", "code", "words"),
    [
        (
            409,
            {
                "error": "already_open",
                "detail": "A studio window is already open: end it first, with STATE=end.",
                "since": "2026-11-02T20:14:03Z",
            },
            1,
            "HTTP 409 already_open: A studio window is already open",
        ),
        (
            409,
            {
                "error": "not_open",
                "detail": "No studio window is open: there is nothing to end.",
            },
            1,
            "HTTP 409 not_open",
        ),
        (
            400,
            {
                "error": "invalid_request",
                "field": "reason",
                "detail": "at least 10 characters",
            },
            1,
            "field reason",
        ),
        (401, {"error": "unauthorized"}, 3, "HTTP 401"),
        (404, {"error": "not_found"}, 1, "HTTP 404 not_found"),
        (503, {"error": "store_unreachable"}, 4, "HTTP 503"),
    ],
)
def test_refusals_keep_spec_000s_exit_codes(
    home: Path,
    listener: Listener,
    status: int,
    body: dict[str, Any],
    code: int,
    words: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    listener.queue.append((status, body))
    assert op.main(window("--reason", START)) == code
    assert words in capsys.readouterr().err


def test_an_answer_from_another_stacks_listener_is_no_answer(
    home: Path, listener: Listener, capsys: pytest.CaptureFixture[str]
) -> None:
    listener.queue.append((200, {**opened(), "stack": "dev-cpu"}))
    assert op.main(window("--reason", START)) == 4
    assert "wrong_stack" in capsys.readouterr().err


def test_the_admin_client_checks_the_state_and_the_reason_itself(
    home: Path, listener: Listener
) -> None:
    client = op.AdminClient("prod")
    with pytest.raises(op.Usage):
        client.studio_window("pause", START)
    with pytest.raises(op.Usage):
        client.studio_window("start", "too short")
    assert listener.requests == []
    listener.queue.append((200, opened()))
    assert client.studio_window("start", START) == opened()


def test_audit_takes_studio_window_as_an_action(home: Path, listener: Listener) -> None:
    listener.queue.append((200, {"entries": [], "next_before_id": None}))
    assert op.main(["--stack", "prod", "audit", "--action", "studio_window"]) == 0
    assert listener.requests[0]["path"] == "/admin/audit?action=studio_window"


class Runner:
    """Stands in for the docker compose hop: records what it was given, and answers as the probe would."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def __call__(
        self, command: list[str], stdin_text: str, env: dict[str, str]
    ) -> tuple[int, str]:
        self.calls.append({"command": command, "stdin": stdin_text})
        return 0, ""


def test_dev_cpu_inside_the_sandbox_hops_with_the_checked_arguments(
    home: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dockerfile = tmp_path / "tree" / "evals" / "Dockerfile.probe"
    dockerfile.parent.mkdir(parents=True)
    dockerfile.write_text("FROM scratch\n", encoding="utf-8")
    monkeypatch.setattr(op, "PROBE_DOCKERFILE", dockerfile)
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    runner = Runner()
    code = op.main(
        window("--reason", f"  {START}  ", stack="dev-cpu", state="end"), runner=runner
    )
    assert code == 0
    (call,) = runner.calls
    command = call["command"]
    assert command[0] == str(op.RELAY)
    assert command[-6:] == [
        "--url",
        "http://gateway:8081",
        "--token-stdin",
        "studio-window",
        "end",
        f"--reason={START}",
    ]
    assert call["stdin"] == op.read_devcpu_token(op.DEVCPU_VARS) + "\n"


def test_dev_cpu_inside_the_sandbox_checks_the_reason_before_the_hop(
    home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    runner = Runner()
    assert op.main(window("--reason", "short", stack="dev-cpu"), runner=runner) == 2
    assert runner.calls == []


# --------------------------------------------------------------------------------------------------
# make studio-window (T035), with stand-ins that record their arguments
# --------------------------------------------------------------------------------------------------
REF = "0123456789abcdef0123456789abcdef01234567"

# python3: every Python the recipes run, through PY_HOST. The operator CLI's studio-window exits $OPERATOR_EXIT; its
# status prints the next line of $STATUS_LINES (the last one once they run out); hello.py prints an answer whose route
# is $HELLO_ROUTE and exits $HELLO_EXIT; anything else (preflight, the export, status.py) succeeds.
FAKE_PYTHON = r"""#!/usr/bin/env bash
printf 'python3 %s\n' "$*" >>"$CALLS"
case "$*" in
  *scripts/operator.py*studio-window*) exit "${OPERATOR_EXIT:-0}" ;;
  *scripts/operator.py*status*)
    n=$(($(cat "$CALLS.status" 2>/dev/null || echo 0) + 1)); echo "$n" >"$CALLS.status"
    line=$(printf '%s\n' "${STATUS_LINES:-adapters       local healthy}" | sed -n "${n}p")
    [ -n "$line" ] || line=$(printf '%s\n' "${STATUS_LINES:-adapters       local healthy}" | tail -n 1)
    printf 'prod  state normal\n%s\n' "$line" ;;
  *scripts/hello.py*)
    printf 'HTTP 200\n{\n  "answer": "Hello.",\n  "route": "%s",\n  "cost_micro_usd": 0\n}\n' "${HELLO_ROUTE:-local}"
    exit "${HELLO_EXIT:-0}" ;;
esac
exit 0
"""
# docker: records its arguments, and fails a compose subcommand named in $DOCKER_FAIL.
FAKE_DOCKER = r"""#!/usr/bin/env bash
printf 'docker %s\n' "$*" >>"$CALLS"
for word in "$@"; do [ -n "${DOCKER_FAIL:-}" ] && [ "$word" = "$DOCKER_FAIL" ] && exit 1; done
exit 0
"""


def make_studio(
    tmp_path: Path, *args: str, run_file: bool = True, ref: str = REF, **env: str
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    """make studio-window <args> from the repository, in a temporary HOME with prod's run file, the stand-ins first on
    PATH, and none of the sandbox's variables: the Author's terminal."""
    bindir = tmp_path / "bin"
    bindir.mkdir(exist_ok=True)
    for name, text in (("python3", FAKE_PYTHON), ("docker", FAKE_DOCKER)):
        (bindir / name).write_text(text, encoding="utf-8")
        (bindir / name).chmod(0o755)
    home = tmp_path / "home"
    state = home / ".local" / "state" / "h4reet" / "prod"
    state.mkdir(parents=True, exist_ok=True)
    tree = state / "tree" / REF
    tree.mkdir(parents=True, exist_ok=True)
    if run_file:
        (state / "run.env").write_text(
            f"H4_TREE={tree}\nH4_REF={ref}\nH4_REF_BRANCH=main\nH4_REF_PREVIOUS=\n",
            encoding="utf-8",
        )
    calls = tmp_path / "calls.log"
    calls.write_text("", encoding="utf-8")
    done = subprocess.run(
        ["make", "--no-print-directory", "-C", str(REPO), "studio-window", *args],
        env={
            "PATH": f"{bindir}:/usr/local/bin:/usr/bin:/bin",
            "HOME": str(home),
            "LC_ALL": "C",
            "CALLS": str(calls),
            **env,
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    return done, calls.read_text(encoding="utf-8").splitlines()


needs_make = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")


def index(calls: list[str], text: str) -> int:
    found = [i for i, line in enumerate(calls) if text in line]
    assert found, f"{text!r} isn't among {calls}"
    return found[0]


@needs_make
@pytest.mark.parametrize(
    ("args", "words"),
    [
        (["ENV=prod", f"REASON={START}"], "STATE=start or STATE=end"),
        (["ENV=prod", "STATE=pause", f"REASON={START}"], "STATE=start or STATE=end"),
        (["ENV=prod", "STATE=start"], 'REASON="<why'),
        (["ENV=dev", "STATE=start", f"REASON={START}"], "dev has no fallback"),
    ],
)
def test_make_refuses_before_any_call(
    tmp_path: Path, args: list[str], words: str
) -> None:
    done, calls = make_studio(tmp_path, *args)
    assert done.returncode == 2, done.stderr
    assert words in done.stderr
    assert calls == []


@needs_make
@pytest.mark.parametrize("state", ["start", "end"])
def test_make_refuses_prod_with_no_run_file(tmp_path: Path, state: str) -> None:
    done, calls = make_studio(
        tmp_path, "ENV=prod", f"STATE={state}", f"REASON={START}", run_file=False
    )
    assert done.returncode == 2, done.stderr
    assert "wasn't started by make up" in done.stderr
    assert calls == []


@needs_make
def test_make_refuses_prod_in_an_agent_session(tmp_path: Path) -> None:
    done, calls = make_studio(
        tmp_path, "ENV=prod", "STATE=start", f"REASON={START}", SANDBOX_RUNTIME="1"
    )
    assert done.returncode == 2, done.stderr
    assert "FR-008" in done.stderr
    assert calls == []


@needs_make
def test_make_reads_state_and_reason_from_the_command_line_only(tmp_path: Path) -> None:
    done, calls = make_studio(tmp_path, "ENV=prod", STATE="start", REASON=START)
    assert done.returncode == 2, done.stderr
    assert calls == []


@needs_make
def test_start_records_the_window_then_stops_prods_model_server(tmp_path: Path) -> None:
    done, calls = make_studio(tmp_path, "ENV=prod", "STATE=start", f"REASON={START}")
    assert done.returncode == 0, done.stderr
    assert len(calls) == 2, calls
    assert "scripts/operator.py --stack prod studio-window start" in calls[0]
    assert f"--reason={START}" in calls[0]
    assert calls[1].startswith("docker compose -p h4reet-prod -f ")
    assert calls[1].endswith(" stop model-server-gpu")
    assert f"--env-file {tmp_path}/home/.local/state/h4reet/prod/run.env" in calls[1]
    assert "falls back within the sub-budget" in done.stdout


@needs_make
def test_start_stops_nothing_when_the_window_isnt_recorded(tmp_path: Path) -> None:
    done, calls = make_studio(
        tmp_path, "ENV=prod", "STATE=start", f"REASON={START}", OPERATOR_EXIT="1"
    )
    assert done.returncode != 0
    assert [c for c in calls if c.startswith("docker")] == []


@needs_make
def test_start_says_the_window_is_open_when_the_stop_fails(tmp_path: Path) -> None:
    done, calls = make_studio(
        tmp_path, "ENV=prod", "STATE=start", f"REASON={START}", DOCKER_FAIL="stop"
    )
    assert done.returncode != 0
    assert index(calls, "studio-window start") < index(
        calls, " stop model-server-gpu"
    )
    assert "the window is open, but model-server-gpu didn't stop" in done.stderr
    assert "STATE=end" in done.stderr


@needs_make
def test_start_on_dev_cpu_stops_its_cpu_model_server(tmp_path: Path) -> None:
    done, calls = make_studio(tmp_path, "ENV=dev-cpu", "STATE=start", f"REASON={START}")
    assert done.returncode == 0, done.stderr
    assert "--stack dev-cpu studio-window start" in calls[0]
    assert calls[1] == (
        "docker compose -p h4reet-dev-cpu -f ./deploy/compose.yaml --env-file deploy/env.agents/dev-cpu.vars "
        "stop model-server-cpu"
    )


@needs_make
def test_end_brings_prod_back_at_its_commit_then_hello_then_records(
    tmp_path: Path,
) -> None:
    done, calls = make_studio(tmp_path, "ENV=prod", "STATE=end", f"REASON={END}")
    assert done.returncode == 0, done.stderr
    export = index(calls, "deploy/scripts/export_tree.py --stack prod")
    assert f"--ref={REF}" in calls[export]
    up = index(calls, " up -d ")
    wait = index(calls, "scripts/operator.py --stack prod status")
    hello = index(calls, "scripts/hello.py --stack prod")
    record = index(calls, "scripts/operator.py --stack prod studio-window end")
    assert export < up < wait < hello < record == len(calls) - 1
    assert f"--reason={END}" in calls[record]
    assert (
        len([c for c in calls if "scripts/hello.py" in c]) == 1
    )  # one hello, and no more
    assert '"route": "local"' in done.stdout


@needs_make
def test_end_waits_for_the_gateway_to_see_the_local_model(tmp_path: Path) -> None:
    done, calls = make_studio(
        tmp_path,
        "ENV=prod",
        "STATE=end",
        f"REASON={END}",
        STATUS_LINES="adapters       local unhealthy (unreachable)\nadapters       local healthy",
    )
    assert done.returncode == 0, done.stderr
    statuses = [
        i for i, c in enumerate(calls) if "operator.py --stack prod status" in c
    ]
    assert len(statuses) == 2
    assert statuses[-1] < index(calls, "scripts/hello.py")


@needs_make
@pytest.mark.parametrize(
    ("env", "words"),
    [
        ({"HELLO_ROUTE": "fallback"}, "didn't answer route: local"),
        ({"HELLO_EXIT": "1"}, "hello didn't answer"),
    ],
)
def test_end_records_nothing_unless_hello_answers_locally(
    tmp_path: Path, env: dict[str, str], words: str
) -> None:
    done, calls = make_studio(tmp_path, "ENV=prod", "STATE=end", f"REASON={END}", **env)
    assert done.returncode != 0
    assert words in done.stderr
    assert "window stays open" in done.stderr
    assert [c for c in calls if "studio-window end" in c] == []


@needs_make
def test_end_sends_no_hello_when_up_fails(tmp_path: Path) -> None:
    done, calls = make_studio(
        tmp_path, "ENV=prod", "STATE=end", f"REASON={END}", DOCKER_FAIL="up"
    )
    assert done.returncode != 0
    assert "window stays open" in done.stderr
    assert [c for c in calls if "scripts/hello.py" in c] == []
    assert [c for c in calls if "studio-window end" in c] == []


@needs_make
def test_end_refuses_a_run_file_that_names_no_commit(tmp_path: Path) -> None:
    done, calls = make_studio(
        tmp_path, "ENV=prod", "STATE=end", f"REASON={END}", ref="HEAD"
    )
    assert done.returncode == 2, done.stderr
    assert "names no commit" in done.stderr
    assert calls == []


@needs_make
def test_help_lists_the_target_as_the_authors(tmp_path: Path) -> None:
    done = subprocess.run(
        ["make", "-s", "-C", str(REPO), "help"],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
        },
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    (line,) = [
        x for x in done.stdout.splitlines() if x.strip().startswith("studio-window ")
    ]
    assert "(the Author)" in line and "STATE=start|end" in line and "REASON=" in line
