"""Tests for scripts/operator.py (contracts/operator-admin.md §6, §6.1, §6.2; data-model.md §5, §8).

Each runs against a temporary HOME and a stand-in admin listener on 127.0.0.1, never a real stack: at port 0, with
ADMIN_PORTS pointed at it, or, for the one test that runs the script by path, at dev-cpu's own port in the test's
network namespace, skipped where something else holds that port. Tokens are built at run time, so this file holds
none.
"""

from __future__ import annotations

import base64
import hashlib
import http.server
import importlib.util
import io
import json
import os
import re
import socket
import stat
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "h4_operator", REPO / "scripts" / "operator.py"
)
assert SPEC and SPEC.loader
op = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = op
SPEC.loader.exec_module(op)

B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def token(scope: str, seed: int = 0) -> str:
    """A token in the credential's shape (data-model.md §5), assembled here so the file holds none."""
    return f"h4op_{scope}_" + "".join(B64URL[(seed + i * 7) % 64] for i in range(43))


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def mode(path: Path) -> int:
    return stat.S_IMODE(path.lstat().st_mode)


def last_line(text: str) -> str:
    lines = [line for line in text.splitlines() if line.strip()]
    return lines[-1] if lines else ""


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    monkeypatch.delenv("H4_OPERATOR_TOKEN", raising=False)
    return home


def plant(
    home: Path, stack: str, text: str, *, file_mode: int = 0o600, dir_mode: int = 0o700
) -> Path:
    """~/.config/h4reet-ai/operator/<stack>.token as make operator-token leaves it, or as a test spoils it."""
    base = home / ".config" / "h4reet-ai"
    base.mkdir(parents=True, exist_ok=True)
    base.chmod(0o700)
    directory = base / "operator"
    directory.mkdir(exist_ok=True)
    directory.chmod(dir_mode)
    path = directory / f"{stack}.token"
    path.write_text(text, encoding="utf-8")
    path.chmod(file_mode)
    return path


class Stub:
    """A stand-in admin listener: canned answers by (method, path), and a record of every request it got."""

    def __init__(self, port: int = 0) -> None:
        self.answers: dict[tuple[str, str], tuple[int, Any, dict[str, str]]] = {}
        self.requests: list[dict[str, Any]] = []
        self.delay = 0.0
        stub = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def handle_one(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                stub.requests.append(
                    {
                        "method": self.command,
                        "path": self.path,
                        "headers": {k.lower(): v for k, v in self.headers.items()},
                        "body": json.loads(raw) if raw else None,
                    }
                )
                if stub.delay:
                    time.sleep(stub.delay)
                status, body, headers = stub.answers.get(
                    (self.command, self.path), (404, {"error": "not_found"}, {})
                )
                data = (
                    body.encode("utf-8")
                    if isinstance(body, str)
                    else json.dumps(body).encode("utf-8")
                )
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                for key, value in headers.items():
                    self.send_header(key, value)
                self.end_headers()
                self.wfile.write(data)

            do_GET = handle_one
            do_POST = handle_one

            def log_message(self, format: str, *args: Any) -> None:
                return

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
        # A client that gave up (the timeout test) leaves a handler writing to a closed socket: not worth a traceback.
        self.server.handle_error = lambda request, client_address: None
        self.thread = threading.Thread(
            target=self.server.serve_forever,
            kwargs={"poll_interval": 0.02},
            daemon=True,
        )
        self.thread.start()
        self.port = self.server.server_address[1]
        self.url = f"http://127.0.0.1:{self.port}"

    def answer(
        self,
        method: str,
        path: str,
        status: int,
        body: Any,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.answers[(method, path)] = (status, body, headers or {})

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def stub(monkeypatch: pytest.MonkeyPatch) -> Any:
    """A stand-in listener at port 0, with every stack's admin port pointed at it: a token goes only to its own
    stack's port (check_url)."""
    listener = Stub()
    monkeypatch.setattr(op, "ADMIN_PORTS", dict.fromkeys(op.STACKS, listener.port))
    yield listener
    listener.close()


# contracts/operator-admin.md §4.1's example, with the adapters filled in as GET /health reports them.
STATUS_BODY: dict[str, Any] = {
    "stack": "prod",
    "env": "prod",
    "time": "2026-10-28T14:02:11.004Z",
    "real_time": "2026-10-28T14:02:11.004Z",
    "store": "ok",
    "initialized_at": "2026-10-20T09:12:40Z",
    "initialized_by": "operator:prod#0a1b2c3d",
    "state": "normal",
    "since": "2026-10-20T09:12:40Z",
    "crossed": [],
    "degraded_cause": None,
    "periods": {"day": "2026-10-28", "month": "2026-10"},
    "meters": {
        "day": {
            "spent_micro_usd": 3520000,
            "reserved_micro_usd": 0,
            "ceiling_micro_usd": 5000000,
            "warn_micro_usd": 3500000,
        },
        "month": {
            "spent_micro_usd": 9100000,
            "reserved_micro_usd": 0,
            "ceiling_micro_usd": 20000000,
            "warn_micro_usd": 14000000,
        },
        "fallback_day": {
            "spent_micro_usd": 400000,
            "reserved_micro_usd": 0,
            "allowance_micro_usd": 2000000,
            "warn_micro_usd": 1400000,
            "grant": 1,
            "available_micro_usd": 1480000,
        },
    },
    "fallback": {
        "adapter": "bedrock",
        "awaiting_renewal": False,
        "awaiting_since": None,
    },
    "adapters": [
        {
            "id": "local",
            "role": "primary",
            "provider": "local",
            "kind": "local",
            "model": "qwen3-30b-a3b-instruct",
            "healthy": True,
            "reason": None,
            "checked_at": "2026-10-28T14:02:10Z",
        },
        {
            "id": "bedrock",
            "role": "fallback",
            "provider": "aws.bedrock",
            "kind": "paid",
            "model": "us.anthropic.claude-haiku",
            "healthy": True,
            "reason": None,
            "checked_at": "2026-10-28T14:02:10Z",
            "credentials_expire_at": "2026-10-28T18:00:00Z",
        },
    ],
    "limits": {"metered_in_flight": 0, "metered_last_minute": 2},
    "journal": {"status": "ok", "file": "journal/2026-10.jsonl"},
    "alerts": {"pending": 0, "failed_last_24h": 0},
    "config": {"routing_sha": "0" * 64, "price_version": "2026-10-08.1"},
    "test_machinery": {"clock": False, "synthetic": False, "clock_offset_ms": None},
}

# The summary §6 prints for that body, line for line.
STATUS_SUMMARY = [
    "prod  state normal since 2026-10-20T09:12:40Z · store ok · time 2026-10-28T14:02:11Z",
    "day            3.52 / 5.00 USD   (warning 3.50)",
    "month          9.10 / 20.00 USD  (warning 14.00)",
    "fallback today 0.40 / 2.00 USD   (grant 1, warning 1.40, available 1.48) · awaiting renewal: no",
    "adapters       local healthy · bedrock healthy, SSO session ends 2026-10-28T18:00Z",
]

# contracts/operator-admin.md §2.3's 200 example.
INIT_BODY: dict[str, Any] = {
    "action": "init",
    "audit_id": 1,
    "state": "normal",
    "fallback_awaiting_renewal": True,
    "periods": {"day": "2026-10-28", "month": "2026-10"},
    "meters": {
        "day": {
            "spent_micro_usd": 1500000,
            "sources": {"ledger": 0, "journal": 1500000, "stated": 1200000},
        },
        "month": {
            "spent_micro_usd": 9400000,
            "sources": {"ledger": 0, "journal": 8100000, "stated": 9400000},
        },
        "fallback_day": {
            "spent_micro_usd": 300000,
            "allowance_micro_usd": 2000000,
            "grant": 1,
            "sources": {"ledger": 0, "journal": 300000, "stated": 300000},
        },
    },
    "journal": {
        "files_read": ["journal/2026-10.jsonl", "journal/2026-09.jsonl"],
        "records": 214,
        "lines_skipped": 0,
    },
    "confirm_zero": False,
    "renewed": False,
    "clock_offset_ms": None,
}

REASON = "New host; the journal survived on the bind mount."


def run(
    argv: list[str], capsys: pytest.CaptureFixture[str], stdin: str | None = None
) -> tuple[int, str, str]:
    code = op.main(argv, stdin=io.StringIO(stdin) if stdin is not None else None)
    out, err = capsys.readouterr()
    return code, out, err


# --- mint (§6, steps 1-6) -----------------------------------------------------------------------------------------


def test_mint_writes_the_token_file_and_prints_only_its_hash(
    home: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out, err = run(["--stack", "prod", "mint"], capsys)
    assert code == 0, err
    path = home / ".config/h4reet-ai/operator/prod.token"
    assert mode(path) == 0o600
    assert mode(path.parent) == 0o700
    assert mode(path.parent.parent) == 0o700
    text = path.read_text(encoding="ascii")
    assert re.fullmatch(r"h4op_prod_[A-Za-z0-9_-]{43}\n", text)
    minted = text[:-1]
    digest = sha(minted)  # over the token alone, without the newline (data-model.md §5)
    assert minted not in out + err
    assert minted[10:] not in out + err
    assert str(path) in out
    assert f"sha256: {digest}" in out
    assert f"fingerprint: {digest[:8]}" in out
    assert (
        f"Set OPERATOR_TOKEN_SHA256={digest} in ~/.config/h4reet-ai/env/prod.env, then run make up ENV=prod, "
        "which recreates the gateway with the new hash." in out
    )


def test_minted_tokens_are_256_random_bits_per_stack(
    home: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run(["--stack", "prod", "mint"], capsys)[0] == 0
    assert run(["--stack", "dev", "mint"], capsys)[0] == 0
    directory = home / ".config/h4reet-ai/operator"
    prod = (directory / "prod.token").read_text(encoding="ascii").strip()
    dev = (directory / "dev.token").read_text(encoding="ascii").strip()
    assert dev.startswith("h4op_dev_")
    assert re.fullmatch(r"h4op_dev_[A-Za-z0-9_-]{43}", dev)
    for minted, prefix in ((prod, "h4op_prod_"), (dev, "h4op_dev_")):
        assert len(base64.urlsafe_b64decode(minted[len(prefix) :] + "=")) == 32
    assert prod[10:] != dev[9:]


def test_mint_json_prints_the_path_and_hash(
    home: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out, _ = run(["--stack", "dev", "--json", "mint"], capsys)
    assert code == 0
    report = json.loads(out)
    path = home / ".config/h4reet-ai/operator/dev.token"
    minted = path.read_text(encoding="ascii").strip()
    assert report == {
        "path": str(path),
        "sha256": sha(minted),
        "fingerprint": sha(minted)[:8],
    }


def test_mint_refuses_dev_cpu(home: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code, _, err = run(["--stack", "dev-cpu", "mint"], capsys)
    assert code == 2
    assert "committed" in err
    assert "dev-cpu.vars" in err
    assert last_line(err) == "operator.py: exit 2: usage"
    assert not (home / ".config").exists()


def test_mint_refuses_an_existing_file(
    home: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = plant(home, "prod", "mine\n")
    code, _, err = run(["--stack", "prod", "mint"], capsys)
    assert code == 5
    assert "delete it first" in err
    assert last_line(err) == "operator.py: exit 5: a token problem"
    assert path.read_text(encoding="utf-8") == "mine\n"


def test_mint_refuses_a_link_in_its_place(
    home: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = plant(home, "dev", "x")
    path.unlink()
    target = tmp_path / "elsewhere"
    path.symlink_to(target)
    assert run(["--stack", "dev", "mint"], capsys)[0] == 5
    assert not target.exists()


@pytest.mark.parametrize("loose", [0o750, 0o755, 0o711])
def test_mint_refuses_a_loose_directory(
    home: Path, capsys: pytest.CaptureFixture[str], loose: int
) -> None:
    directory = home / ".config/h4reet-ai/operator"
    directory.mkdir(parents=True)
    directory.parent.chmod(0o700)
    directory.chmod(loose)
    code, _, err = run(["--stack", "prod", "mint"], capsys)
    assert code == 5
    assert f"mode {loose:04o}; it must be 0700" in err
    assert list(directory.iterdir()) == []


def test_mint_creates_the_base_directory_private(
    home: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # make init-env holds ~/.config/h4reet-ai to 0700 too, so minting first mustn't leave it looser.
    assert run(["--stack", "dev", "mint"], capsys)[0] == 0
    assert mode(home / ".config/h4reet-ai") == 0o700


def test_mint_refuses_another_owner(
    home: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    (home / ".config/h4reet-ai/operator").mkdir(parents=True, mode=0o700)
    (home / ".config/h4reet-ai").chmod(0o700)
    real = os.getuid()
    monkeypatch.setattr(op.os, "getuid", lambda: real + 1)
    code, _, err = run(["--stack", "prod", "mint"], capsys)
    assert code == 5
    assert "belongs to another user" in err


def test_mint_refuses_inside_the_sandbox(
    home: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    assert run(["--stack", "prod", "mint"], capsys)[0] == 2
    assert not (home / ".config").exists()


@pytest.mark.parametrize("extra", [["--url", "http://127.0.0.1:1"], ["--token-stdin"]])
def test_mint_calls_nothing(
    home: Path, capsys: pytest.CaptureFixture[str], extra: list[str]
) -> None:
    assert run(["--stack", "prod", *extra, "mint"], capsys)[0] == 2
    assert not (home / ".config").exists()


# --- the token: where it comes from (§6) --------------------------------------------------------------------------


def test_status_sends_the_token_from_its_file(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    secret = token("prod", 3)
    plant(home, "prod", secret + "\n")
    stub.answer("GET", "/admin/status", 200, STATUS_BODY)
    code, out, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert code == 0, err
    (request,) = stub.requests
    assert request["method"] == "GET"
    assert request["path"] == "/admin/status"
    assert request["headers"]["authorization"] == f"Bearer {secret}"
    assert request["headers"]["accept"] == "application/json"
    assert request["body"] is None
    assert secret not in out + err


def test_a_token_file_with_mode_0400_is_accepted(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "dev", token("dev") + "\n", file_mode=0o400)
    stub.answer("GET", "/admin/status", 200, STATUS_BODY | {"stack": "dev"})
    assert run(["--stack", "dev", "--url", stub.url, "status"], capsys)[0] == 0


@pytest.mark.parametrize("loose", [0o644, 0o640, 0o604, 0o700, 0o660, 0o200])
def test_a_token_file_with_another_mode_is_refused(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str], loose: int
) -> None:
    plant(home, "prod", token("prod") + "\n", file_mode=loose)
    code, _, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert code == 5
    assert f"mode {loose:04o}" in err
    assert stub.requests == []


@pytest.mark.parametrize("loose", [0o750, 0o755, 0o701])
def test_a_loose_token_directory_is_refused(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str], loose: int
) -> None:
    plant(home, "prod", token("prod") + "\n", dir_mode=loose)
    code, _, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert code == 5
    assert "must be 0700" in err
    assert stub.requests == []


def test_a_token_file_of_another_owner_is_refused(
    home: Path,
    stub: Stub,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    plant(home, "prod", token("prod") + "\n")
    real = os.getuid()
    monkeypatch.setattr(op.os, "getuid", lambda: real + 1)
    assert run(["--stack", "prod", "--url", stub.url, "status"], capsys)[0] == 5
    assert stub.requests == []


def test_a_missing_token_file_names_make_operator_token(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    code, _, err = run(["--stack", "dev", "--url", stub.url, "status"], capsys)
    assert code == 5
    assert "make operator-token ENV=dev" in err
    assert stub.requests == []


def test_a_linked_token_directory_is_refused(
    home: Path, tmp_path: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    real = tmp_path / "real-operator"
    real.mkdir()
    real.chmod(0o700)
    (real / "prod.token").write_text(token("prod") + "\n", encoding="ascii")
    (real / "prod.token").chmod(0o600)
    base = home / ".config/h4reet-ai"
    base.mkdir(parents=True)
    base.chmod(0o700)
    (base / "operator").symlink_to(real)
    code, _, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert code == 5
    assert "isn't a directory" in err
    assert stub.requests == []


def test_a_linked_token_file_is_refused(
    home: Path, tmp_path: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    real = tmp_path / "real.token"
    real.write_text(token("prod") + "\n", encoding="ascii")
    real.chmod(0o600)
    path = plant(home, "prod", "x")
    path.unlink()
    path.symlink_to(real)
    code, _, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert code == 5
    assert "link" in err
    assert stub.requests == []


def test_a_token_file_swapped_after_its_check_is_refused(
    home: Path,
    stub: Stub,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Between the lstat and the open, another file takes the token file's place: the check of the file opened
    # (fstat) catches it.
    path = plant(home, "prod", token("prod") + "\n")
    swapped = path.with_name("swapped")
    swapped.write_text(token("prod") + "\n", encoding="ascii")
    swapped.chmod(0o644)
    real_open = os.open

    def swap_then_open(file: Any, flags: int, *args: Any, **kwargs: Any) -> int:
        if os.fspath(file) == os.fspath(path) and swapped.exists():
            os.replace(swapped, path)
        return real_open(file, flags, *args, **kwargs)

    monkeypatch.setattr(op.os, "open", swap_then_open)
    stub.answer("GET", "/admin/status", 200, STATUS_BODY)
    code, _, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert not swapped.exists()  # the swap happened
    assert code == 5
    assert "mode 0644" in err
    assert stub.requests == []


@pytest.mark.parametrize(
    "text",
    [
        token("dev") + "\n",  # another stack's token
        token("devcpu") + "\n",
        token("prod")[:-1] + "\n",  # 42 characters
        token("prod") + "A\n",  # 44
        token("prod") + " \n",
        token("prod") + "\r\n",
        token("prod") + "\n" + token("prod") + "\n",
        "h4op_prod_" + "!" * 43 + "\n",
        "",
    ],
    # Named, so no token-shaped text lands in a test ID, a log, or a pasted make check output.
    ids=[
        "dev",
        "devcpu",
        "42-characters",
        "44-characters",
        "trailing-space",
        "crlf",
        "two-lines",
        "not-base64url",
        "empty",
    ],
)
def test_a_malformed_token_is_refused_without_echoing_it(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str], text: str
) -> None:
    plant(home, "prod", text)
    code, out, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert code == 5
    assert "h4op_" not in (out + err).replace("h4op_prod_ and", "")
    assert stub.requests == []


@pytest.mark.parametrize("stack", ["prod", "dev"])
def test_agent_sessions_reach_dev_cpu_only(
    home: Path,
    stub: Stub,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    stack: str,
) -> None:
    # The make targets refuse first; the CLI and AdminClient refuse too, for a direct call (FR-008).
    plant(home, stack, token(stack) + "\n")
    stub.answer("GET", "/admin/status", 200, STATUS_BODY | {"stack": "dev-cpu"})
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    for extra, piped in (([], None), (["--token-stdin"], token(stack) + "\n")):
        code, _, err = run(
            ["--stack", stack, "--url", stub.url, *extra, "status"], capsys, stdin=piped
        )
        assert code == 2
        assert "dev-cpu" in err
    with pytest.raises(op.Usage):
        op.AdminClient(stack, url=stub.url)
    assert stub.requests == []
    code, _, err = run(["--stack", "dev-cpu", "--url", stub.url, "status"], capsys)
    assert code == 0, err


def test_the_token_never_comes_from_the_environment(
    home: Path,
    stub: Stub,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("H4_OPERATOR_TOKEN", token("prod"))
    assert run(["--stack", "prod", "--url", stub.url, "status"], capsys)[0] == 5
    assert stub.requests == []


def test_dev_cpu_reads_the_committed_dummy_as_data(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    values = dict(
        line.split("=", 1)
        for line in (REPO / "deploy/env.agents/dev-cpu.vars")
        .read_text(encoding="utf-8")
        .splitlines()
        if line and not line.startswith("#")
    )
    stub.answer("GET", "/admin/status", 200, STATUS_BODY | {"stack": "dev-cpu"})
    code, _, err = run(["--stack", "dev-cpu", "--url", stub.url, "status"], capsys)
    assert code == 0, err
    (request,) = stub.requests
    dummy = request["headers"]["authorization"].removeprefix("Bearer ")
    assert dummy == values["H4_DEVCPU_OPERATOR_TOKEN"]
    assert sha(dummy) == values["OPERATOR_TOKEN_SHA256"]


@pytest.mark.parametrize(
    ("text", "ok"),
    [
        ("# a comment\nH4_DEVCPU_OPERATOR_TOKEN={t}\n", True),
        ("H4_DEVCPU_OPERATOR_TOKEN='{t}'\n", True),
        ("H4_DEVCPU_OPERATOR_TOKEN={t}\nH4_DEVCPU_OPERATOR_TOKEN={t}\n", False),
        ("export H4_DEVCPU_OPERATOR_TOKEN={t}\n", False),
        ("H4_DEVCPU_OPERATOR_TOKEN = {t}\n", False),
        ("H4_STACK=dev-cpu\n", False),
        ("H4_DEVCPU_OPERATOR_TOKEN={t}x\n", False),
    ],
)
def test_the_dev_cpu_file_is_parsed_by_the_env_grammar(
    tmp_path: Path, text: str, ok: bool
) -> None:
    path = tmp_path / "dev-cpu.vars"
    path.write_text(text.format(t=token("devcpu", 5)), encoding="utf-8")
    if ok:
        assert op.read_devcpu_token(path) == token("devcpu", 5)
    else:
        with pytest.raises(op.TokenProblem):
            op.read_devcpu_token(path)


def test_token_stdin_reads_one_line(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    stub.answer("GET", "/admin/status", 200, STATUS_BODY | {"stack": "dev"})
    piped = token("dev", 9)
    code, _, err = run(
        ["--stack", "dev", "--url", stub.url, "--token-stdin", "status"],
        capsys,
        stdin=piped + "\nanything after the first line\n",
    )
    assert code == 0, err
    assert stub.requests[0]["headers"]["authorization"] == f"Bearer {piped}"


@pytest.mark.parametrize(
    "piped",
    ["", "\n", token("prod") + "\n", "h4op_dev_short\n"],
    ids=["nothing", "blank", "prods-token", "short"],
)
def test_token_stdin_refuses_a_malformed_line(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str], piped: str
) -> None:
    code, _, _ = run(
        ["--stack", "dev", "--url", stub.url, "--token-stdin", "status"],
        capsys,
        stdin=piped,
    )
    assert code == 5
    assert stub.requests == []


def test_the_script_runs_by_path_through_py_host(home: Path) -> None:
    # As make runs it: isolated, blind to bytecode, by path; nothing it needs comes from its own directory. A child
    # process can't see a patched ADMIN_PORTS, so the stand-in listens on dev-cpu's own port, in this test's network
    # namespace (the sandbox's or the devcontainer's). Outside the sandbox, dev-cpu goes there with the dummy (§6).
    port = op.ADMIN_PORTS["dev-cpu"]
    try:
        listener = Stub(port)
    except OSError as error:
        pytest.skip(f"127.0.0.1:{port} is taken here: {error.strerror}")
    try:
        listener.answer("GET", "/admin/status", 200, STATUS_BODY | {"stack": "dev-cpu"})
        env = {k: v for k, v in os.environ.items() if k != "SANDBOX_RUNTIME"}
        env["HOME"] = str(home)
        script = str(REPO / "scripts" / "operator.py")
        flags = ["-I", "-B", "-X", "pycache_prefix=/dev/null"]
        done = subprocess.run(
            [sys.executable, *flags, script, "--stack", "dev-cpu", "status"],
            capture_output=True,
            text=True,
            env=env,
            timeout=60,
            check=False,
        )
    finally:
        listener.close()
    assert done.returncode == 0, done.stderr
    first = "dev-cpu" + STATUS_SUMMARY[0].removeprefix("prod")
    assert done.stdout.splitlines() == [first, *STATUS_SUMMARY[1:]]
    (request,) = listener.requests
    dummy = op.read_devcpu_token(op.DEVCPU_VARS)
    assert request["headers"]["authorization"] == f"Bearer {dummy}"


# --- transport (§6) -----------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("stack", "url"),
    [
        ("prod", "http://127.0.0.1:18003"),
        ("dev", "http://127.0.0.1:18103"),
        ("dev-cpu", "http://127.0.0.1:18303"),
    ],
)
def test_each_stack_has_its_admin_port(home: Path, stack: str, url: str) -> None:
    piped = io.StringIO(token(op.SCOPES[stack]) + "\n")
    assert op.AdminClient(stack, token_stdin=True, stdin=piped).url == url


@pytest.mark.parametrize("stack", ["prod", "dev", "dev-cpu"])
@pytest.mark.parametrize(
    ("url", "stdin"),
    [
        ("http://127.0.0.1:{port}", False),
        ("http://localhost:{port}", False),
        ("http://127.0.0.1:{port}/", False),
        ("http://localhost:{port}", True),
    ],
)
def test_a_url_override_on_this_host_is_the_stacks_own_port(
    home: Path,
    stub: Stub,
    capsys: pytest.CaptureFixture[str],
    stack: str,
    url: str,
    stdin: bool,
) -> None:
    # The stub fixture points every stack's port at the stand-in, so each stack's own port is the stand-in's.
    scope = op.SCOPES[stack]
    if stack != "dev-cpu":
        plant(home, stack, token(scope) + "\n")
    stub.answer("GET", "/admin/status", 200, STATUS_BODY | {"stack": stack})
    argv = ["--stack", stack, "--url", url.format(port=stub.port)]
    code, _, err = run(
        [*argv, *(["--token-stdin"] if stdin else []), "status"],
        capsys,
        stdin=token(scope) + "\n" if stdin else None,
    )
    assert code == 0, err
    assert len(stub.requests) == 1


ANOTHER_STACKS_PORT = [
    (stack, other) for stack in op.STACKS for other in op.STACKS if other != stack
]


@pytest.mark.parametrize(("stack", "other"), ANOTHER_STACKS_PORT)
@pytest.mark.parametrize("host", ["127.0.0.1", "localhost"])
@pytest.mark.parametrize("token_stdin", [False, True])
def test_check_url_on_this_host_takes_the_stacks_own_port_only(
    stack: str, other: str, host: str, token_stdin: bool
) -> None:
    # The real ports. Above all, prod's or dev's token never goes to 18303, where dev-cpu's agent-built gateway
    # listens (T056's review). A pure function: nothing here can connect anywhere.
    own = op.ADMIN_PORTS[stack]
    # localhost is connected as 127.0.0.1, never looked up (T056's review, round 2).
    assert (
        op.check_url(f"http://{host}:{own}/", stack, token_stdin=token_stdin)
        == f"http://127.0.0.1:{own}"
    )
    for url in (
        f"http://{host}:{op.ADMIN_PORTS[other]}",
        f"http://{host}",
        f"http://{host}:80",
        f"http://{host}:8081",
        f"http://{host}:{own + 1}",
    ):
        with pytest.raises(op.Usage, match=f"{stack}'s own admin port, {own}"):
            op.check_url(url, stack, token_stdin=token_stdin)


@pytest.mark.parametrize("stack", ["prod", "dev"])
def test_a_token_never_reaches_another_stacks_listener(
    home: Path,
    stub: Stub,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    stack: str,
) -> None:
    # The stand-in holds dev-cpu's port, as dev-cpu's gateway would; prod's and dev's ports are elsewhere.
    ports = {"prod": free_port(), "dev": free_port(), "dev-cpu": stub.port}
    monkeypatch.setattr(op, "ADMIN_PORTS", ports)
    plant(home, stack, token(stack) + "\n")
    stub.answer("GET", "/admin/status", 200, STATUS_BODY | {"stack": "dev-cpu"})
    for host in ("127.0.0.1", "localhost"):
        for extra, piped in (([], None), (["--token-stdin"], token(stack) + "\n")):
            url = f"http://{host}:{stub.port}"
            argv = ["--stack", stack, "--url", url, *extra, "status"]
            code, _, err = run(argv, capsys, stdin=piped)
            assert code == 2
            assert f"{stack}'s own admin port, {ports[stack]}" in err
            assert last_line(err) == "operator.py: exit 2: usage"
    assert stub.requests == []
    # dev-cpu's own token does go there.
    code, _, err = run(["--stack", "dev-cpu", "--url", stub.url, "status"], capsys)
    assert code == 0, err
    assert len(stub.requests) == 1


@pytest.mark.parametrize(("stack", "scope"), [("dev", "dev"), ("dev-cpu", "devcpu")])
def test_an_in_network_host_takes_the_token_on_stdin_only(
    home: Path, stack: str, scope: str
) -> None:
    # Inside a container on a dev-class stack's network (dev's breach probe, dev-cpu's hop): a single-label service
    # name, with the token on standard input.
    client = op.AdminClient(
        stack,
        url="http://gateway:8081",
        token_stdin=True,
        stdin=io.StringIO(token(scope) + "\n"),
    )
    assert client.url == "http://gateway:8081"
    with pytest.raises(op.Usage, match="--token-stdin"):
        op.check_url("http://gateway:8081", stack, token_stdin=False)


def test_prod_never_takes_an_in_network_host(
    home: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # No prod caller runs in a container on prod's network (T056's review): prod's token stays on this host's 18003.
    with pytest.raises(op.Usage, match="no prod caller runs in a container"):
        op.AdminClient(
            "prod",
            url="http://gateway:8081",
            token_stdin=True,
            stdin=io.StringIO(token("prod") + "\n"),
        )
    argv = ["--stack", "prod", "--url", "http://gateway:8081", "--token-stdin"]
    code, _, err = run([*argv, "status"], capsys, stdin=token("prod") + "\n")
    assert code == 2
    assert last_line(err) == "operator.py: exit 2: usage"


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:18003",
        "http://10.0.0.1:18003",
        "http://192.168.1.1:80",
        "http://example.com:8081",
        "http://gateway.example:8081",
        "http://2130706433:8081",  # 127.0.0.1 as one number, which the resolver would accept
        "http://0x7f000001:8081",
        "http://167772161:8081",  # 10.0.0.1
        "http://[::1]:18003",
        "http://user:pw@127.0.0.1:18003",
        "http://127.0.0.1:18003/admin",
        "http://127.0.0.1:18003?x=1",
        "http://-gateway:8081",
        "http://gateway-:8081",
        "http://127.0.0.1:99999",
        "ftp://127.0.0.1:21",
        "127.0.0.1:18003",
        "http://gateway:8081",  # a single-label host with the token from its file
    ],
)
def test_a_url_override_elsewhere_is_refused(
    home: Path, capsys: pytest.CaptureFixture[str], url: str
) -> None:
    plant(home, "prod", token("prod") + "\n")
    code, _, err = run(["--stack", "prod", "--url", url, "status"], capsys)
    assert code == 2
    assert last_line(err) == "operator.py: exit 2: usage"


def test_proxy_settings_never_see_the_token(
    home: Path,
    stub: Stub,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    dead = "http://127.0.0.1:9"
    for name in (
        "HTTP_PROXY",
        "http_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
    ):
        monkeypatch.setenv(name, dead)
    monkeypatch.delenv("NO_PROXY", raising=False)
    monkeypatch.delenv("no_proxy", raising=False)
    plant(home, "prod", token("prod") + "\n")
    stub.answer("GET", "/admin/status", 200, STATUS_BODY)
    assert run(["--stack", "prod", "--url", stub.url, "status"], capsys)[0] == 0
    assert len(stub.requests) == 1


def test_a_redirect_is_not_followed(
    home: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    first, second = Stub(), Stub()
    try:
        monkeypatch.setitem(op.ADMIN_PORTS, "prod", first.port)
        plant(home, "prod", token("prod") + "\n")
        first.answer(
            "GET",
            "/admin/status",
            302,
            {},
            {"Location": second.url + "/admin/status"},
        )
        second.answer("GET", "/admin/status", 200, STATUS_BODY)
        code, _, _ = run(["--stack", "prod", "--url", first.url, "status"], capsys)
        assert code == 4
        assert second.requests == []
    finally:
        first.close()
        second.close()


def test_the_token_is_an_unredirected_header(
    home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # urllib copies a request's ordinary headers onto a redirect's request, and leaves its unredirected ones behind.
    # The opener is replaced, so nothing is sent anywhere.
    secret = token("prod", 13)
    plant(home, "prod", secret + "\n")
    client = op.AdminClient("prod")
    built: list[urllib.request.Request] = []

    def capture(request: urllib.request.Request, *args: Any, **kwargs: Any) -> Any:
        built.append(request)
        raise urllib.error.URLError("captured")

    monkeypatch.setattr(client._opener, "open", capture)
    with pytest.raises(op.AdminError):
        client.status()
    (request,) = built
    assert request.unredirected_hdrs.get("Authorization") == f"Bearer {secret}"
    assert "Authorization" not in request.headers
    assert request.headers.get("Accept") == "application/json"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_nothing_listening_is_exit_4(
    home: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    monkeypatch.setitem(op.ADMIN_PORTS, "prod", free_port())
    url = f"http://127.0.0.1:{op.ADMIN_PORTS['prod']}"
    code, _, err = run(["--stack", "prod", "--url", url, "status"], capsys)
    assert code == 4
    assert "can't reach" in err
    assert (
        last_line(err)
        == "operator.py: exit 4: no usable answer from the admin listener"
    )


def test_a_timeout_is_exit_4(
    home: Path,
    stub: Stub,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(op, "TIMEOUT_S", 0.2)
    stub.delay = 1.0
    stub.answer("GET", "/admin/status", 200, STATUS_BODY)
    plant(home, "prod", token("prod") + "\n")
    assert run(["--stack", "prod", "--url", stub.url, "status"], capsys)[0] == 4


def test_the_timeout_is_30_seconds() -> None:
    assert op.TIMEOUT_S == 30


# --- exit codes (§6.2) --------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "body", "code", "shown"),
    [
        (
            400,
            {
                "error": "invalid_request",
                "field": "reason",
                "detail": "at least 10 characters",
            },
            1,
            "invalid_request",
        ),
        (403, {"error": "test_machinery_refused"}, 1, "test_machinery_refused"),
        (404, {"error": "unknown_adapter"}, 1, "unknown_adapter"),
        (409, {"error": "already_initialized"}, 1, "already_initialized"),
        (415, {"error": "unsupported_media_type"}, 1, "unsupported_media_type"),
        (401, {"error": "unauthorized"}, 3, "unauthorized"),
        (500, {"error": "internal"}, 4, "internal"),
        (502, "<html>bad gateway</html>", 4, "502"),
        (503, {"error": "store_unreachable"}, 4, "store_unreachable"),
        (503, {"error": "admin_unavailable"}, 4, "admin_unavailable"),
        (200, "not json", 4, "JSON"),
        (200, [1, 2], 4, "JSON"),
    ],
)
def test_each_answer_has_its_exit_code(
    home: Path,
    stub: Stub,
    capsys: pytest.CaptureFixture[str],
    status: int,
    body: Any,
    code: int,
    shown: str,
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer("GET", "/admin/status", status, body)
    got, _, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert got == code
    assert shown in err
    assert last_line(err) == f"operator.py: exit {code}: {op.EXIT_MEANINGS[code]}"


def test_a_401_names_the_token_file_and_its_fingerprint(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    secret = token("prod", 11)
    plant(home, "prod", secret + "\n")
    stub.answer("GET", "/admin/status", 401, {"error": "unauthorized"})
    code, out, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert code == 3
    assert sha(secret)[:8] in err
    assert "OPERATOR_TOKEN_SHA256" in last_line(err)
    assert secret not in out + err


def test_a_refusal_prints_its_error_and_detail(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    detail = "no ledger rows, no journal records, nothing stated"
    stub.answer(
        "POST", "/admin/init", 409, {"error": "confirm_zero_required", "detail": detail}
    )
    code, _, err = run(
        ["--stack", "prod", "--url", stub.url, "init", "--reason", REASON], capsys
    )
    assert code == 1
    assert "HTTP 409 confirm_zero_required" in err
    assert detail in err


def test_json_prints_a_refusals_body(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    body = {"error": "already_initialized"}
    stub.answer("POST", "/admin/init", 409, body)
    code, out, _ = run(
        ["--stack", "prod", "--url", stub.url, "--json", "init", "--reason", REASON],
        capsys,
    )
    assert code == 1
    assert json.loads(out) == body


def test_control_characters_from_the_listener_are_not_printed(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer(
        "GET", "/admin/status", 409, {"error": "x\x1b]0;owned\x07", "detail": "a\nb"}
    )
    _, out, err = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert "\x1b" not in out + err
    assert "\x07" not in out + err


# The stack another listener's answer might name: a real one, and one that would stand out if it were printed.
OTHER_STACKS = ["dev-cpu", "qa-elsewhere"]


@pytest.mark.parametrize("named", [*OTHER_STACKS, None, "missing"])
def test_status_refuses_an_answer_that_isnt_its_stacks(
    home: Path,
    stub: Stub,
    capsys: pytest.CaptureFixture[str],
    named: str | None,
) -> None:
    # GET /admin/status always names its stack (§4.1): one that names another, or none, is another listener's.
    plant(home, "prod", token("prod") + "\n")
    body = {k: v for k, v in STATUS_BODY.items() if k != "stack"}
    if named != "missing":
        body["stack"] = named
    stub.answer("GET", "/admin/status", 200, body)
    for extra in ([], ["--json"]):
        argv = ["--stack", "prod", *extra, "--url", stub.url, "status"]
        code, out, err = run(argv, capsys)
        assert code == 4
        assert out == ""  # neither the summary nor, with --json, the body
        assert "HTTP 200 wrong_stack" in err
        assert last_line(err) == f"operator.py: exit 4: {op.EXIT_MEANINGS[4]}"
        if named in OTHER_STACKS:
            assert named not in err


@pytest.mark.parametrize("named", [*OTHER_STACKS, None])
def test_init_refuses_an_answer_that_names_another_stack(
    home: Path,
    stub: Stub,
    capsys: pytest.CaptureFixture[str],
    named: str | None,
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer("POST", "/admin/init", 200, INIT_BODY | {"stack": named})
    for extra in ([], ["--json"]):
        argv = ["--stack", "prod", *extra, "--url", stub.url, "init"]
        code, out, err = run([*argv, "--reason", REASON], capsys)
        assert code == 4
        assert out == ""
        assert "HTTP 200 wrong_stack" in err
        if named in OTHER_STACKS:
            assert named not in err


def test_init_takes_an_answer_that_names_its_own_stack_or_none(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    # §2.3's answer has no stack field.
    plant(home, "prod", token("prod") + "\n")
    for body in (INIT_BODY, INIT_BODY | {"stack": "prod"}):
        stub.answer("POST", "/admin/init", 200, body)
        argv = ["--stack", "prod", "--url", stub.url, "init", "--reason", REASON]
        code, _, err = run(argv, capsys)
        assert code == 0, err


def test_admin_client_refuses_another_stacks_answer(home: Path, stub: Stub) -> None:
    plant(home, "prod", token("prod") + "\n")
    client = op.AdminClient("prod")
    stub.answer("GET", "/admin/status", 200, STATUS_BODY | {"stack": "qa-elsewhere"})
    stub.answer(
        "POST",
        "/admin/adapters/bedrock/complete",
        200,
        {"stack": "qa-elsewhere", "result": {"text": "x"}},
    )
    calls = [
        client.status,
        lambda: client.adapter_complete(
            "bedrock",
            [{"role": "user", "content": "x"}],
            max_output_tokens=8,
            purpose="eval",
            reason="evals product hello-case",
        ),
    ]
    for call in calls:
        with pytest.raises(op.AdminError) as caught:
            call()
        assert (caught.value.status, caught.value.error) == (200, "wrong_stack")
        assert caught.value.body is None
        assert "qa-elsewhere" not in str(caught.value)


@pytest.mark.parametrize(
    "argv",
    [
        ["status"],  # no --stack
        ["--stack", "staging", "status"],
        ["--stack", "prod"],  # no command
        ["--stack", "prod", "reboot"],
        ["--stack", "prod", "init"],  # no --reason
        ["--stack", "prod", "status", "--bogus"],
        ["--stack", "prod", "init", "--reas", REASON],  # no abbreviations
    ],
)
def test_usage_errors_are_exit_2(
    home: Path, capsys: pytest.CaptureFixture[str], argv: list[str]
) -> None:
    code, _, err = run(argv, capsys)
    assert code == 2
    assert last_line(err) == "operator.py: exit 2: usage"


# --- status (§4.1, §6) --------------------------------------------------------------------------------------------


def test_status_prints_the_contracts_summary(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer("GET", "/admin/status", 200, STATUS_BODY)
    code, out, _ = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert code == 0
    assert out.splitlines() == STATUS_SUMMARY


def test_status_json_prints_the_body(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer("GET", "/admin/status", 200, STATUS_BODY)
    code, out, _ = run(
        ["--stack", "prod", "--json", "--url", stub.url, "status"], capsys
    )
    assert code == 0
    assert json.loads(out) == STATUS_BODY


def test_status_after_the_command_takes_the_common_options_too(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer("GET", "/admin/status", 200, STATUS_BODY)
    code, out, _ = run(
        ["status", "--stack", "prod", "--url", stub.url, "--json"], capsys
    )
    assert code == 0
    assert json.loads(out)["stack"] == "prod"


def test_status_of_a_tripped_dev_stack(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    body = json.loads(json.dumps(STATUS_BODY))
    body.update(
        stack="dev",
        env="dev",
        state="degraded",
        crossed=["day"],
        degraded_cause="kill_switch_tripped",
        time="2026-10-27T09:12:04.512Z",
        real_time="2026-10-08T16:31:40.019Z",
        journal={"status": "unwritable", "file": "journal/2026-10.jsonl"},
        alerts={"pending": 2, "failed_last_24h": 1},
        test_machinery={
            "clock": True,
            "synthetic": True,
            "clock_offset_ms": 1528824493,
        },
        fallback={
            "adapter": "synthetic",
            "awaiting_renewal": True,
            "awaiting_since": "2026-10-27T08:40:00Z",
        },
    )
    body["meters"]["day"].update(spent_micro_usd=5000000, reserved_micro_usd=2600)
    body["adapters"] = [
        {"id": "local", "healthy": False, "reason": "unreachable"},
        {"id": "synthetic", "healthy": True, "reason": None},
    ]
    plant(home, "dev", token("dev") + "\n")
    stub.answer("GET", "/admin/status", 200, body)
    code, out, _ = run(["--stack", "dev", "--url", stub.url, "status"], capsys)
    assert code == 0
    lines = out.splitlines()
    assert lines[0] == (
        "dev  state degraded since 2026-10-20T09:12:40Z (crossed day) · store ok · cause kill_switch_tripped"
        " · time 2026-10-27T09:12:04Z (real 2026-10-08T16:31:40Z)"
    )
    assert (
        lines[1] == "day            5.00 / 5.00 USD   (warning 3.50, reserved 0.0026)"
    )
    assert lines[3].endswith("· awaiting renewal: yes, since 2026-10-27T08:40:00Z")
    assert (
        lines[4] == "adapters       local unhealthy (unreachable) · synthetic healthy"
    )
    assert "journal        unwritable (journal/2026-10.jsonl)" in lines
    assert "alerts         2 pending, 1 failed in the last 24 h" in lines
    assert "test machinery clock on (offset 1528824493 ms) · synthetic on" in lines


def test_status_of_an_uninitialized_store(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    body = {
        "stack": "prod",
        "time": "2026-10-28T14:02:11.004Z",
        "store": "uninitialized",
        "state": None,
        "since": None,
        "crossed": None,
        "degraded_cause": "store_uninitialized",
        "adapters": [{"id": "local", "healthy": True}],
    }
    plant(home, "prod", token("prod") + "\n")
    stub.answer("GET", "/admin/status", 200, body)
    code, out, _ = run(["--stack", "prod", "--url", stub.url, "status"], capsys)
    assert code == 0
    assert out.splitlines()[0] == (
        "prod  state - · store uninitialized · cause store_uninitialized · time 2026-10-28T14:02:11Z"
    )
    assert "meters         none while the store is uninitialized" in out
    assert 'make operator-init ENV=prod REASON="' in out


@pytest.mark.parametrize("named", ["qa-elsewhere", "prod", None])
def test_status_summary_names_the_clis_own_stack(named: str | None) -> None:
    # Not the answer's stack field: the first line and the suggested command are the CLI's (T056's review). status()
    # refuses another stack's answer before this; the summary doesn't rely on that.
    body = {
        "stack": named,
        "time": "2026-10-28T14:02:11.004Z",
        "store": "uninitialized",
        "state": None,
    }
    lines = op.status_lines("dev", body)
    assert lines[0].startswith("dev  state -")
    assert 'make operator-init ENV=dev REASON="' in lines[-1]
    assert named is None or not any(named in line for line in lines)


@pytest.mark.parametrize(
    ("micro", "text"),
    [
        (0, "0.00"),
        (5000000, "5.00"),
        (1480000, "1.48"),
        (2600, "0.0026"),
        (4999999, "4.999999"),
        (20000000, "20.00"),
        (None, "?"),
        ("12", "?"),
        (True, "?"),
    ],
)
def test_usd(micro: Any, text: str) -> None:
    assert op.usd(micro) == text


# --- init (§2.3; data-model.md §8) --------------------------------------------------------------------------------


def test_init_posts_the_stated_values_exactly(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer("POST", "/admin/init", 200, INIT_BODY)
    code, _, err = run(
        [
            "--stack",
            "prod",
            "--url",
            stub.url,
            "init",
            "--reason",
            REASON,
            "--day-usd",
            "1.20",
            "--month-usd",
            "9.40",
            "--fallback-today-usd",
            "0.30",
        ],
        capsys,
    )
    assert code == 0, err
    (request,) = stub.requests
    assert request["method"] == "POST"
    assert request["path"] == "/admin/init"
    assert request["headers"]["content-type"] == "application/json"
    assert request["body"] == {
        "reason": REASON,
        "stated": {
            "day_usd": "1.20",
            "month_usd": "9.40",
            "fallback_today_usd": "0.30",
        },
        "confirm_zero": False,
        "renew": False,
    }


def test_init_flags_and_no_stated_values(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer(
        "POST", "/admin/init", 200, INIT_BODY | {"confirm_zero": True, "renewed": True}
    )
    reason = "  First start on this host; no earlier records.  "
    code, _, _ = run(
        [
            "--stack",
            "prod",
            "--url",
            stub.url,
            "init",
            "--reason",
            reason,
            "--confirm-zero",
            "--renew",
        ],
        capsys,
    )
    assert code == 0
    assert stub.requests[0]["body"] == {
        "reason": reason.strip(),
        "confirm_zero": True,
        "renew": True,
    }


def test_init_prints_a_summary(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer("POST", "/admin/init", 200, INIT_BODY)
    code, out, _ = run(
        ["--stack", "prod", "--url", stub.url, "init", "--reason", REASON], capsys
    )
    assert code == 0
    assert out.splitlines() == [
        "prod  initialized · audit #1 · state normal · periods 2026-10-28 and 2026-10",
        "day            1.50 USD          (ledger 0.00, journal 1.50, stated 1.20)",
        "month          9.40 USD          (ledger 0.00, journal 8.10, stated 9.40)",
        "fallback today 0.30 / 2.00 USD   (grant 1; ledger 0.00, journal 0.30, stated 0.30)",
        "journal        2 files read, 214 records, 0 lines skipped",
        'fallback       awaiting renewal: refused until make operator-renew ENV=prod REASON="..."',
    ]


def test_init_summary_of_a_dev_rebuild(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    body = json.loads(json.dumps(INIT_BODY))
    body.update(
        fallback_awaiting_renewal=False,
        renewed=True,
        confirm_zero=True,
        clock_offset_ms=1611568796,
    )
    body["meters"]["day"]["sources"]["stated"] = None
    body["journal"]["files_read"] = ["journal/2026-11.jsonl"]
    plant(home, "dev", token("dev") + "\n")
    stub.answer("POST", "/admin/init", 200, body)
    code, out, _ = run(
        ["--stack", "dev", "--url", stub.url, "init", "--reason", REASON], capsys
    )
    assert code == 0
    lines = out.splitlines()
    assert lines[0].startswith("dev  initialized")
    assert (
        lines[1]
        == "day            1.50 USD          (ledger 0.00, journal 1.50, stated none)"
    )
    assert "journal        1 file read, 214 records, 0 lines skipped" in lines
    assert "fallback       renewed: grant 1 passes today" in lines
    assert "confirm zero   yes: no earlier records and nothing stated" in lines
    assert "test clock     offset 1611568796 ms, restored from the journal" in lines


@pytest.mark.parametrize("named", ["qa-elsewhere", "prod"])
def test_init_summary_names_the_clis_own_stack(named: str) -> None:
    # As for status: the first line and the suggested renewal are the CLI's stack, whatever the answer says.
    lines = op.init_lines("dev", INIT_BODY | {"stack": named})
    assert lines[0].startswith("dev  initialized · audit #1")
    assert 'make operator-renew ENV=dev REASON="..."' in lines[-1]
    assert not any(named in line for line in lines)


@pytest.mark.parametrize(
    "reason",
    [
        "too short",  # 9 characters
        "   short   ",
        "x" * 501,
        "line one\nline two",
        "a bell\x07 rings here",
        "",
    ],
)
def test_init_holds_the_reason_to_the_rule(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str], reason: str
) -> None:
    plant(home, "prod", token("prod") + "\n")
    code, _, err = run(
        ["--stack", "prod", "--url", stub.url, "init", "--reason", reason], capsys
    )
    assert code == 2
    assert "reason" in err
    assert stub.requests == []


@pytest.mark.parametrize(
    "reason", ["ten chars!", "é" * 500, "- starts with a dash, still a reason"]
)
def test_init_takes_any_reason_within_the_rule(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str], reason: str
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer("POST", "/admin/init", 200, INIT_BODY)
    code, _, err = run(
        ["--stack", "prod", "--url", stub.url, "init", f"--reason={reason}"], capsys
    )
    assert code == 0, err
    assert stub.requests[0]["body"]["reason"] == reason


@pytest.mark.parametrize(
    "value", ["-1", "1.1234567", "1e3", "", "abc", "1,5", ".5", "1.", "+2", " 1"]
)
def test_init_refuses_a_stated_value_out_of_shape(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str], value: str
) -> None:
    plant(home, "prod", token("prod") + "\n")
    code, _, err = run(
        [
            "--stack",
            "prod",
            "--url",
            stub.url,
            "init",
            "--reason",
            REASON,
            f"--day-usd={value}",
        ],
        capsys,
    )
    assert code == 2
    assert "--day-usd" in err
    assert stub.requests == []


@pytest.mark.parametrize("value", ["0", "2", "0.000001", "12.5", "1.20"])
def test_init_sends_a_stated_value_as_its_decimal_string(
    home: Path, stub: Stub, capsys: pytest.CaptureFixture[str], value: str
) -> None:
    plant(home, "prod", token("prod") + "\n")
    stub.answer("POST", "/admin/init", 200, INIT_BODY)
    code, _, _ = run(
        [
            "--stack",
            "prod",
            "--url",
            stub.url,
            "init",
            "--reason",
            REASON,
            "--month-usd",
            value,
        ],
        capsys,
    )
    assert code == 0
    assert stub.requests[0]["body"]["stated"] == {"month_usd": value}


# --- the dev-cpu hop (§6, Transport) ------------------------------------------------------------------------------


class Runner:
    """Stands in for the docker compose hop: records what it was given, and answers as the probe would.

    It keeps the environment's keys, but no value except SANDBOX_RUNTIME's: HTTPS_PROXY holds the sandbox proxy's
    credentials, and a failing assertion prints whatever it compares.
    """

    def __init__(self, code: int = 0, last: str = "") -> None:
        self.code, self.last = code, last
        self.calls: list[dict[str, Any]] = []

    def __call__(
        self, command: list[str], stdin_text: str, env: dict[str, str]
    ) -> tuple[int, str]:
        kept = {k: v if k == "SANDBOX_RUNTIME" else "..." for k, v in env.items()}
        self.calls.append({"command": command, "stdin": stdin_text, "env": kept})
        return self.code, self.last


@pytest.fixture
def probe_image(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A stand-in for evals/Dockerfile.probe, in a temporary tree (tasks.md T144 adds the real one)."""
    dockerfile = tmp_path / "tree" / "evals" / "Dockerfile.probe"
    dockerfile.parent.mkdir(parents=True)
    dockerfile.write_text("FROM scratch\n", encoding="utf-8")
    monkeypatch.setattr(op, "PROBE_DOCKERFILE", dockerfile)
    return dockerfile


@pytest.fixture
def probe(home: Path, probe_image: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """An agent session (SANDBOX_RUNTIME=1), the only place the hop runs, with the probe image."""
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    return probe_image


def hop_command(inner: list[str]) -> list[str]:
    return [
        str(op.ROOT / "deploy" / "agents-engine" / "docker-relay"),
        "docker",
        "compose",
        "-p",
        "h4reet-dev-cpu",
        "-f",
        str(op.ROOT / "deploy" / "compose.yaml"),
        "--env-file",
        str(op.DEVCPU_VARS),
        "--profile",
        "breach",
        "run",
        "--rm",
        "-T",
        "breach-probe",
        "python3",
        "-I",
        "/app/operator.py",
        "--stack",
        "dev-cpu",
        "--url",
        "http://gateway:8081",
        "--token-stdin",
        *inner,
    ]


def test_dev_cpu_hops_through_a_probe_container(
    home: Path,
    probe: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv(
        "H4_STACK", "prod"
    )  # compose would let the shell override the env file (P5)
    monkeypatch.setenv("COMPOSE_PROFILES", "gpu")
    monkeypatch.setenv("GATEWAY_DB_PASSWORD", "from-the-shell")
    runner = Runner()
    code = op.main(
        [
            "--stack",
            "dev-cpu",
            "init",
            "--reason",
            "  Agents' first start on the engine.  ",
            "--confirm-zero",
            "--renew",
            "--day-usd",
            "0.10",
        ],
        runner=runner,
    )
    assert code == 0
    (call,) = runner.calls
    assert call["command"] == hop_command(
        [
            "init",
            "--reason=Agents' first start on the engine.",
            "--renew",
            "--confirm-zero",
            "--day-usd=0.10",
        ]
    )
    dummy = op.read_devcpu_token(op.DEVCPU_VARS)
    assert call["stdin"] == dummy + "\n"
    assert all(dummy not in part for part in call["command"])
    assert not any(k.startswith(("H4_", "COMPOSE_")) for k in call["env"])
    assert "GATEWAY_DB_PASSWORD" not in call["env"]


def test_dev_cpu_status_and_json_go_through_the_hop(home: Path, probe: Path) -> None:
    runner = Runner()
    assert op.main(["--stack", "dev-cpu", "--json", "status"], runner=runner) == 0
    assert runner.calls[0]["command"] == hop_command(["--json", "status"])


def test_dev_cpu_hop_runs_through_the_relay_inside_the_sandbox(
    home: Path, probe: Path
) -> None:
    # The relay reaches the agents' engine and nothing else, and needs SANDBOX_RUNTIME=1 (FR-039).
    runner = Runner()
    assert op.main(["--stack", "dev-cpu", "status"], runner=runner) == 0
    command = runner.calls[0]["command"]
    assert command[0] == str(op.ROOT / "deploy" / "agents-engine" / "docker-relay")
    assert command[1:3] == ["docker", "compose"]
    assert runner.calls[0]["env"]["SANDBOX_RUNTIME"] == "1"


def test_dev_cpu_from_the_authors_terminal_goes_straight_to_its_port(
    home: Path,
    stub: Stub,
    probe_image: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Outside the sandbox there is no hop, even with the probe image: docker there is the host's rootful engine, where
    # agent-written images must never be built or run (FR-039), and the hop would skip preflight's P11 (T056's review).
    monkeypatch.setitem(op.ADMIN_PORTS, "dev-cpu", stub.port)
    stub.answer("GET", "/admin/status", 200, STATUS_BODY | {"stack": "dev-cpu"})
    stub.answer("POST", "/admin/init", 200, INIT_BODY)
    runner = Runner()
    code = op.main(["--stack", "dev-cpu", "status"], runner=runner)
    assert code == 0, capsys.readouterr().err
    reason = ["--reason", REASON, "--confirm-zero"]
    assert op.main(["--stack", "dev-cpu", "init", *reason], runner=runner) == 0
    hops = [call["command"] for call in runner.calls]
    assert hops == []
    dummy = op.read_devcpu_token(op.DEVCPU_VARS)
    assert [request["path"] for request in stub.requests] == [
        "/admin/status",
        "/admin/init",
    ]
    for request in stub.requests:
        assert request["headers"]["authorization"] == f"Bearer {dummy}"


def test_dev_cpu_hop_passes_the_probes_exit_code(
    home: Path, probe: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    runner = Runner(3, f"operator.py: exit 3: {op.EXIT_MEANINGS[3]}")
    assert op.main(["--stack", "dev-cpu", "status"], runner=runner) == 3
    # The CLI in the probe printed the last line already.
    assert capsys.readouterr().err == ""


@pytest.mark.parametrize(
    ("code", "last"),
    [
        (1, 'service "breach-probe" is not defined'),
        (125, "Error response from daemon"),
        (2, "docker-relay runs only 'docker' or 'make'"),
        (6, "operator.py: exit 6: none"),
    ],
)
def test_dev_cpu_hop_failing_before_the_probe_answers_is_exit_4(
    home: Path, probe: Path, capsys: pytest.CaptureFixture[str], code: int, last: str
) -> None:
    runner = Runner(code, last)
    assert op.main(["--stack", "dev-cpu", "status"], runner=runner) == 4
    err = capsys.readouterr().err
    assert f"exited {code}" in err
    assert last_line(err) == f"operator.py: exit 4: {op.EXIT_MEANINGS[4]}"


def test_dev_cpu_hop_needs_the_probe_image(
    home: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    monkeypatch.setattr(
        op, "PROBE_DOCKERFILE", tmp_path / "missing" / "Dockerfile.probe"
    )
    runner = Runner()
    assert op.main(["--stack", "dev-cpu", "status"], runner=runner) == 4
    assert runner.calls == []
    err = capsys.readouterr().err
    assert "evals/Dockerfile.probe" in err and "T144" in err
    # The Author's terminal needs no --url for dev-cpu: it goes straight to 127.0.0.1:18303.
    assert "the Author's terminal" in err
    assert "--url" not in err


def test_the_hop_finds_the_real_probe_image(home: Path) -> None:
    # tasks.md T144 brought the probe's image forward from T080: this tree's own, which holds this CLI where the hop
    # runs it, python3 -I /app/operator.py.
    assert op.PROBE_DOCKERFILE == op.ROOT / "evals" / "Dockerfile.probe"
    assert op.PROBE_DOCKERFILE.is_file()
    lines = op.PROBE_DOCKERFILE.read_text(encoding="utf-8").splitlines()
    assert "COPY scripts/operator.py /app/operator.py" in lines
    assert hop_command([])[15:18] == ["python3", "-I", "/app/operator.py"]


def test_dev_cpu_hops_with_the_real_probe_image(
    home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    runner = Runner()
    assert op.main(["--stack", "dev-cpu", "status"], runner=runner) == 0
    assert [call["command"] for call in runner.calls] == [hop_command(["status"])]


def test_dev_cpu_hop_checks_the_arguments_first(
    home: Path, probe: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    runner = Runner()
    assert (
        op.main(["--stack", "dev-cpu", "init", "--reason", "short"], runner=runner) == 2
    )
    assert runner.calls == []


def test_run_hop_feeds_the_token_and_keeps_the_last_line(
    capfd: pytest.CaptureFixture[str],
) -> None:
    child = """
import sys
line = sys.stdin.readline()
print("the probe read", len(line), file=sys.stderr)
print("operator.py: exit 3: authentication failed", file=sys.stderr)
sys.exit(3)
"""
    env = {"PATH": os.environ.get("PATH", "")}
    code, last = op.run_hop([sys.executable, "-I", "-c", child], "h4op_devcpu_x\n", env)
    assert (code, last) == (3, "operator.py: exit 3: authentication failed")
    assert "the probe read 14" in capfd.readouterr().err


def test_run_hop_survives_a_probe_that_never_reads() -> None:
    env = {"PATH": os.environ.get("PATH", "")}
    command = [sys.executable, "-I", "-c", "import sys; sys.exit(7)"]
    assert op.run_hop(command, "x" * 200_000 + "\n", env) == (7, "")


# --- AdminClient, for other tools (§6) ----------------------------------------------------------------------------


def test_adapter_complete_posts_section_5s_body(home: Path, stub: Stub) -> None:
    plant(home, "prod", token("prod") + "\n")
    answer = {
        "adapter": "bedrock",
        "attribution": "test",
        "result": {"text": "One, two,"},
        "cost_micro_usd": 31,
    }
    stub.answer("POST", "/admin/adapters/bedrock/complete", 200, answer)
    stub.answer("POST", "/admin/adapters/local/complete", 200, answer)
    client = op.AdminClient("prod", url=stub.url)
    messages = [
        {"role": "system", "content": "You are a contract test. Answer in one word."},
        {"role": "user", "content": "Count from one to one hundred in words."},
    ]
    got = client.adapter_complete(
        "bedrock",
        messages,
        max_output_tokens=8,
        purpose="contract",
        reason="contract-live bedrock, 2026-10-28",
    )
    assert got == answer
    assert stub.requests[0]["body"] == {
        "messages": messages,
        "max_output_tokens": 8,
        "purpose": "contract",
        "reason": "contract-live bedrock, 2026-10-28",
    }
    client.adapter_complete(
        "local",
        messages[1:],
        max_output_tokens=8,
        purpose="eval",
        reason="evals product hello-fake",
        temperature=0,
    )
    assert stub.requests[1]["body"]["temperature"] == 0


def test_admin_error_holds_the_status_and_error_but_never_the_token(
    home: Path, stub: Stub
) -> None:
    secret = token("prod", 21)
    plant(home, "prod", secret + "\n")
    stub.answer(
        "POST",
        "/admin/adapters/bedrock/complete",
        409,
        {"error": "store_uninitialized"},
    )
    client = op.AdminClient("prod", url=stub.url)
    assert secret not in repr(client)
    with pytest.raises(op.AdminError) as caught:
        client.adapter_complete(
            "bedrock",
            [{"role": "user", "content": "hello"}],
            max_output_tokens=8,
            purpose="eval",
            reason="evals product hello-case",
        )
    error = caught.value
    assert (error.status, error.error) == (409, "store_uninitialized")
    held = [
        str(error),
        repr(error),
        *map(str, error.args),
        *map(str, vars(error).values()),
    ]
    assert not any(secret in text or "hello" in text for text in held)
    assert error.__cause__ is None
    assert error.__suppress_context__


@pytest.mark.parametrize(
    "adapter_id", ["../status", "bedrock/complete?x", "", "Bedrock", "a b"]
)
def test_adapter_ids_are_checked(home: Path, stub: Stub, adapter_id: str) -> None:
    plant(home, "prod", token("prod") + "\n")
    client = op.AdminClient("prod", url=stub.url)
    with pytest.raises(op.Usage):
        client.adapter_complete(
            adapter_id,
            [{"role": "user", "content": "x"}],
            max_output_tokens=8,
            purpose="eval",
            reason="evals product hello-case",
        )
    assert stub.requests == []


# --- the make targets (§6.1) --------------------------------------------------------------------------------------

MAKE_VARIABLES = (
    "MAKEFLAGS",
    "MAKELEVEL",
    "MFLAGS",
    "MAKEOVERRIDES",
    "ENV",
    "SANDBOX_RUNTIME",
    "REASON",
    "RENEW",
    "CONFIRM_ZERO",
    "DAY_USD",
    "MONTH_USD",
    "FALLBACK_TODAY_USD",
)


def make(
    home: Path, *args: str, sandbox: bool = False, **environ: str
) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if k not in MAKE_VARIABLES}
    env |= {"HOME": str(home), **environ}
    if sandbox:
        env["SANDBOX_RUNTIME"] = "1"
    return subprocess.run(
        ["make", "--no-print-directory", "-C", str(REPO), *args],
        capture_output=True,
        text=True,
        env=env,
        timeout=120,
        check=False,
    )


PY_HOST = "python3 -I -B -X pycache_prefix=/dev/null"


def cli_line(done: subprocess.CompletedProcess[str]) -> str:
    (line,) = [ln for ln in done.stdout.splitlines() if "scripts/operator.py" in ln]
    return line


def test_make_targets_run_the_cli_by_path_through_py_host(home: Path) -> None:
    status = make(home, "-n", "operator-status", "ENV=prod")
    assert cli_line(status) == f"{PY_HOST} scripts/operator.py --stack prod status"
    mint = make(home, "-n", "operator-token", "ENV=dev")
    assert cli_line(mint) == f"{PY_HOST} scripts/operator.py --stack dev mint"


def test_make_operator_init_passes_each_value_through_the_shell(home: Path) -> None:
    done = make(
        home,
        "-n",
        "operator-init",
        "ENV=prod",
        "REASON=First start on this host; no earlier records.",
        "RENEW=1",
        "CONFIRM_ZERO=1",
        "DAY_USD=1.20",
        "MONTH_USD=9.40",
        "FALLBACK_TODAY_USD=0.30",
    )
    assert done.returncode == 0, done.stderr
    assert cli_line(done) == (
        f'{PY_HOST} scripts/operator.py --stack prod init --reason="$REASON" --renew --confirm-zero'
        ' --day-usd="$DAY_USD" --month-usd="$MONTH_USD" --fallback-today-usd="$FALLBACK_TODAY_USD"'
    )


def output_lines(done: subprocess.CompletedProcess[str]) -> list[str]:
    return [line.strip() for line in (done.stdout + done.stderr).splitlines()]


def test_make_operator_init_hands_the_cli_each_value_as_typed(
    home: Path, tmp_path: Path
) -> None:
    # Run, not -n: make expands a command-line value wherever it's used, and again when it exports it to a recipe, so
    # "$5" would vanish and "$(shell ...)" would run (T056's review). OPERATOR is a stub that prints its arguments.
    stub = tmp_path / "argv.py"
    stub.write_text(
        "import json, sys\nprint('ARGV', json.dumps(sys.argv[1:]))\n", encoding="utf-8"
    )
    reason = "Spent $4.80 of the $5 day ceiling; $(shell echo RAN >&2)"
    done = make(
        home,
        "operator-init",
        "ENV=dev-cpu",
        f"REASON={reason}",
        "DAY_USD=$1.00",
        f"OPERATOR={sys.executable} -I {stub}",
        sandbox=True,
    )
    assert done.returncode == 0, done.stderr
    (line,) = [ln for ln in done.stdout.splitlines() if ln.startswith("ARGV ")]
    assert json.loads(line.removeprefix("ARGV ")) == [
        "init",
        f"--reason={reason}",
        "--day-usd=$1.00",
    ]
    assert "RAN" not in output_lines(done)


def test_make_refuses_make_code_in_env_without_running_it(home: Path) -> None:
    done = make(home, "help", "ENV=$(shell echo RAN >&2)")
    assert done.returncode == 2
    assert (
        'ENV must be prod, dev, or dev-cpu, not "$(shell echo RAN >&2)"' in done.stderr
    )
    assert "RAN" not in output_lines(done)


def test_make_operator_init_takes_flags_from_the_command_line_only(home: Path) -> None:
    done = make(
        home,
        "-n",
        "operator-init",
        "ENV=prod",
        "REASON=First start on this host.",
        RENEW="1",
        CONFIRM_ZERO="1",
        DAY_USD="1.20",
    )
    assert (
        cli_line(done)
        == f'{PY_HOST} scripts/operator.py --stack prod init --reason="$REASON"'
    )


@pytest.mark.parametrize("flag", ["RENEW", "CONFIRM_ZERO"])
def test_make_operator_init_refuses_a_flag_that_isnt_1(home: Path, flag: str) -> None:
    done = make(
        home,
        "-n",
        "operator-init",
        "ENV=prod",
        "REASON=First start on this host.",
        f"{flag}=yes",
    )
    assert done.returncode == 2
    assert f'{flag} is 1 or unset, not "yes"' in done.stderr
    assert "scripts/operator.py" not in done.stdout


def test_make_operator_init_without_a_reason_stops_before_the_cli(home: Path) -> None:
    for done in (
        make(home, "operator-init", "ENV=dev"),
        make(home, "operator-init", "ENV=dev", "REASON="),
        make(
            home,
            "operator-init",
            "ENV=dev",
            REASON="From the environment, not the command line.",
        ),
    ):
        assert done.returncode == 2
        assert 'needs REASON="' in done.stderr
        assert "operator.py" not in done.stderr


def test_make_keeps_agent_sessions_off_prod_and_dev(home: Path) -> None:
    for target in ("operator-status", "operator-token", "operator-init"):
        for stack in ("prod", "dev"):
            done = make(
                home,
                target,
                f"ENV={stack}",
                "REASON=First start on this host.",
                sandbox=True,
            )
            assert done.returncode == 2
            assert "dev-cpu" in done.stderr
            assert "operator.py" not in done.stderr
    assert not (home / ".config").exists()


def test_make_operator_token_mints_and_refuses_dev_cpu(home: Path) -> None:
    done = make(home, "operator-token", "ENV=dev")
    assert done.returncode == 0, done.stderr
    minted = (
        (home / ".config/h4reet-ai/operator/dev.token")
        .read_text(encoding="ascii")
        .strip()
    )
    assert minted not in done.stdout + done.stderr
    assert f"sha256: {sha(minted)}" in done.stdout
    refused = make(home, "operator-token", "ENV=dev-cpu")
    assert refused.returncode == 2
    assert last_line(refused.stderr).startswith("make: ***")
    assert "operator.py: exit 2: usage" in refused.stderr


def test_make_help_lists_the_operator_targets(home: Path) -> None:
    out = make(home, "help").stdout
    for target in ("operator-token", "operator-status", "operator-init"):
        assert re.search(rf"^\s+{target}\s", out, re.MULTILINE), target


@pytest.mark.parametrize(
    "url", ["http://gateway:9999", "http://gateway", "http://gateway:18103"]
)
def test_an_in_network_host_is_the_admin_listeners_port_only(url: str) -> None:
    with pytest.raises(op.Usage, match="at port 8081"):
        op.check_url(url, "dev", token_stdin=True)
    assert (
        op.check_url("http://gateway:8081", "dev", token_stdin=True)
        == "http://gateway:8081"
    )
