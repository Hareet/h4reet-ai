"""Tests for scripts/operator.py contract-record (contracts/provider-adapter.md §5.3, §5.4; tasks.md T103).

Each runs against a temporary HOME and a stand-in admin listener on 127.0.0.1 at port 0, with ADMIN_PORTS pointed at
it, never a real stack. Tokens are built at run time, so this file holds none.
"""

from __future__ import annotations

import http.server
import importlib.util
import json
import stat
import sys
import threading
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "h4_operator_record", REPO / "scripts" / "operator.py"
)
assert SPEC and SPEC.loader
op = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = op
SPEC.loader.exec_module(op)

B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
REASON = "contract-live local, 2026-10-10"


def token(scope: str) -> str:
    """A token in the credential's shape (data-model.md §5), assembled here so the file holds none."""
    return f"h4op_{scope}_" + "".join(B64URL[(i * 7) % 64] for i in range(43))


class Listener:
    """A stand-in admin listener: canned answers by (method, path), queued for the POSTs, and every request kept."""

    def __init__(self) -> None:
        self.answers: dict[tuple[str, str], tuple[int, Any]] = {}
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
                        "body": json.loads(raw) if raw else None,
                    }
                )
                if self.command == "POST" and listener.queue:
                    status, body = listener.queue.pop(0)
                else:
                    status, body = listener.answers.get(
                        (self.command, self.path), (404, {"error": "not_found"})
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
    for stack, scope in (("dev", "dev"), ("prod", "prod")):
        path = base / f"{stack}.token"
        path.write_text(token(scope), encoding="utf-8")
        path.chmod(0o600)
    return home


@pytest.fixture
def listener(monkeypatch: pytest.MonkeyPatch) -> Any:
    stand_in = Listener()
    monkeypatch.setattr(op, "ADMIN_PORTS", dict.fromkeys(op.STACKS, stand_in.port))
    yield stand_in
    stand_in.close()


def status(stack: str) -> dict[str, Any]:
    return {
        "stack": stack,
        "adapters": [
            {
                "id": "local",
                "role": "primary",
                "provider": "local",
                "kind": "local",
                "model": "stand-in",
                "healthy": True,
                "reason": None,
                "checked_at": "2026-10-10T12:00:00Z",
            }
        ],
    }


def answer(text: str) -> dict[str, Any]:
    return {
        "adapter": "local",
        "attribution": "none",
        "result": {
            "text": text,
            "usage": {
                "input_tokens": 20,
                "output_tokens": 2,
                "cache_read_input_tokens": 0,
            },
            "finish_reason": "stop",
            "response_model": "stand-in",
            "response_id": None,
            "latency_ms": 40,
        },
        "cost_micro_usd": "0",
    }


def cases_file(tmp_path: Path) -> Path:
    path = tmp_path / "cases.json"
    path.write_text(
        json.dumps(
            {
                "cases": [
                    {
                        "name": "short-stop",
                        "messages": [{"role": "user", "content": "Name a colour."}],
                        "max_output_tokens": 16,
                    },
                    {
                        "name": "non-ascii",
                        "messages": [{"role": "user", "content": "नमस्ते! こんにちは!"}],
                        "max_output_tokens": 32,
                        "temperature": 0,
                    },
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return path


def record(
    tmp_path: Path, *extra: str, stack: str = "dev", adapter: str = "local"
) -> int:
    out = tmp_path / "rec" / "recording.json"
    out.parent.mkdir(exist_ok=True, mode=0o700)
    return op.main(
        [
            "--stack",
            stack,
            "contract-record",
            "--adapter",
            adapter,
            "--out",
            str(out),
            "--reason",
            REASON,
            "--cases",
            str(cases_file(tmp_path)),
            *extra,
        ]
    )


def test_records_the_status_reads_and_every_case_into_a_new_private_file(
    home: Path, listener: Any, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    listener.answers[("GET", "/admin/status")] = (200, status("dev"))
    error = {
        "error": "provider_error",
        "kind": "timeout",
        "retryable": True,
        "possibly_billed": False,
        "status": None,
    }
    listener.queue = [(200, answer("Blue.")), (502, error)]
    assert record(tmp_path) == 0
    out = tmp_path / "rec" / "recording.json"
    assert stat.S_IMODE(out.stat().st_mode) == 0o600
    raw = out.read_bytes()
    raw.decode("ascii")  # what isn't ASCII is escaped
    recording = json.loads(raw)
    assert list(recording) == ["adapter", "statusBefore", "statusAfter", "cases"]
    assert recording["adapter"] == "local"
    assert recording["statusBefore"] == status("dev") == recording["statusAfter"]
    assert [(c["name"], c["status"]) for c in recording["cases"]] == [
        ("short-stop", 200),
        ("non-ascii", 502),
    ]
    assert recording["cases"][1]["body"] == error
    assert recording["cases"][1]["request"] == {
        "messages": [{"role": "user", "content": "नमस्ते! こんにちは!"}],
        "max_output_tokens": 32,
        "temperature": 0,
    }
    posts = [r for r in listener.requests if r["method"] == "POST"]
    assert [r["path"] for r in posts] == ["/admin/adapters/local/complete"] * 2
    assert all(
        r["body"]["purpose"] == "contract" and r["body"]["reason"] == REASON
        for r in posts
    )
    assert [r["method"] for r in listener.requests] == ["GET", "POST", "POST", "GET"]
    printed = capsys.readouterr()
    assert "2 cases, 1 answered, 1 provider errors" in printed.out
    assert token("dev") not in printed.out + printed.err + raw.decode("ascii")


def test_a_refusal_other_than_a_provider_error_stops_the_run_and_writes_nothing(
    home: Path, listener: Any, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    listener.answers[("GET", "/admin/status")] = (200, status("dev"))
    listener.queue = [
        (200, answer("Blue.")),
        (503, {"state": "degraded", "cause": "kill_switch_tripped"}),
    ]
    assert record(tmp_path) == 4  # a 5xx is no usable answer (operator-admin.md §6.2)
    assert not (tmp_path / "rec" / "recording.json").exists()
    listener.queue = [
        (
            400,
            {
                "error": "invalid_request",
                "field": "messages",
                "detail": "1 to 8 messages",
            },
        )
    ]
    assert record(tmp_path) == 1  # a 4xx is the gateway refusing
    assert not (tmp_path / "rec" / "recording.json").exists()
    # A 502 that isn't the gateway's provider-error answer is no case's answer either.
    listener.queue = [(502, {"error": "bad_gateway"})]
    assert record(tmp_path) == 4
    assert not (tmp_path / "rec" / "recording.json").exists()
    printed = capsys.readouterr()
    assert token("dev") not in printed.out + printed.err


@pytest.mark.parametrize(
    ("setup", "args", "why"),
    [
        # dev-cpu, which the sandbox's own operator calls may reach, so only contract-record's check refuses it.
        (
            "sandbox",
            ("--stack", "dev-cpu", "--adapter", "local"),
            "contract-record is the Author's",
        ),
        ("", ("--stack", "dev", "--adapter", "bedrock"), "needs --stack prod"),
        ("exists", (), "exists"),
        ("bad-cases", (), "no cases"),
        ("too-many", (), "more than 16"),
        ("no-dir", (), "not a directory this user can write"),
        ("read-only-dir", (), "not a directory this user can write"),
    ],
)
def test_refuses_what_isnt_the_authors_run(
    home: Path,
    listener: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    setup: str,
    args: tuple[str, ...],
    why: str,
) -> None:
    out = tmp_path / "rec" / "recording.json"
    out.parent.mkdir(mode=0o700)
    cases = cases_file(tmp_path)
    if setup == "sandbox":
        monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    if setup == "exists":
        out.write_text("{}", encoding="utf-8")
    if setup == "bad-cases":
        cases.write_text('{"cases": []}', encoding="utf-8")
    if setup == "too-many":
        one = json.loads(cases.read_text(encoding="utf-8"))["cases"][0]
        cases.write_text(json.dumps({"cases": [one] * 17}), encoding="utf-8")
    if setup == "no-dir":
        out.parent.rmdir()
    if setup == "read-only-dir":
        out.parent.chmod(0o500)
    stack, adapter = (args[1], args[3]) if args else ("dev", "local")
    code = op.main(
        [
            "--stack",
            stack,
            "contract-record",
            "--adapter",
            adapter,
            "--out",
            str(out),
            "--reason",
            REASON,
            "--cases",
            str(cases),
        ]
    )
    assert code == 2
    assert why in capsys.readouterr().err
    assert listener.requests == []


def test_the_committed_cases_file_reads_as_cases() -> None:
    cases = op.read_cases(op.LIVE_CASES)
    assert [c["name"] for c in cases] == [
        "hello-shape",
        "cap-length",
        "short-stop",
        "multi-turn",
        "non-ascii",
        "temperature-one",
        "system-only-once",
        "repeat-cost",
    ]


def test_a_recording_that_cant_be_written_is_exit_2_after_the_calls(
    home: Path,
    listener: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    listener.answers[("GET", "/admin/status")] = (200, status("dev"))
    listener.queue = [(200, answer("Blue.")), (200, answer("Hello."))]

    def full_disk(path: Path, text: str) -> None:
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(op, "write_new", full_disk)
    assert record(tmp_path) == 2
    err = capsys.readouterr().err
    assert (
        "couldn't be written (No space left on device), after the calls were made"
        in err
    )
    assert err.rstrip().endswith("operator.py: exit 2: usage")
