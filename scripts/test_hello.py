"""Tests for scripts/hello.py and make hello (contracts/gateway-http.md §2 and §9; tasks.md T147).

Each runs against a stand-in api listener on 127.0.0.1, never a real stack: at port 0, with API_PORTS pointed at it,
or, for the one test that runs the script by path, at dev-cpu's own port in the test's network namespace, skipped
where something else holds that port. The dev-cpu hop runs against a stand-in runner, never docker.
"""

from __future__ import annotations

import http.server
import importlib.util
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("h4_hello", REPO / "scripts" / "hello.py")
assert SPEC and SPEC.loader
hello = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = hello
SPEC.loader.exec_module(hello)

# contracts/gateway-http.md §2.5.1's example, as dev-cpu's stand-in would answer it.
HELLO_BODY: dict[str, Any] = {
    "answer": "Hello! This is the h4reet.ai stack's hello test answering.",
    "route": "local",
    "route_reason": None,
    "provider": "local",
    "model": "qwen2.5-0.5b-instruct",
    "usage": {"input_tokens": 71, "output_tokens": 14},
    "cost_usd": 0,
    "cost_micro_usd": 0,
    "price_version": "2026-10-08.1",
    "latency_ms": 212,
    "stack": "dev-cpu",
    "request_id": "9c1e5b0a3f2d4e6b8a7c1d2e3f4a5b6c",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
}
# §2.5.2's degraded answer.
DEGRADED_BODY: dict[str, Any] = {
    "state": "degraded",
    "cause": "store_uninitialized",
    "detail": "The gateway's store holds no state yet. An operator initializes it.",
    "ceilings": None,
    "stack": "dev-cpu",
    "since": None,
    "request_id": "0d4f6e8a2b1c3d5e7f9a0b1c2d3e4f5a",
    "trace_id": "5a2c9e1b7d3f4a6c8e0b2d4f6a8c0e1b",
}


def printed(status: int, body: Any) -> str:
    """What hello.py prints for a JSON answer: the status, then the body, indented."""
    return f"HTTP {status}\n{json.dumps(body, indent=2, ensure_ascii=False)}\n"


def last_line(text: str) -> str:
    lines = [line for line in text.splitlines() if line.strip()]
    return lines[-1] if lines else ""


class Stub:
    """A stand-in api listener: one canned answer, and a record of every request it got."""

    def __init__(self, port: int = 0) -> None:
        self.status: int = 200
        self.body: bytes = json.dumps(HELLO_BODY).encode("utf-8")
        self.headers: dict[str, str] = {"Content-Type": "application/json"}
        self.delay = 0.0
        self.requests: list[dict[str, Any]] = []
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
                        "raw": raw,
                    }
                )
                if stub.delay:
                    time.sleep(stub.delay)
                self.send_response(stub.status)
                for key, value in stub.headers.items():
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(stub.body)))
                self.end_headers()
                self.wfile.write(stub.body)

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
        self, status: int, body: Any, headers: dict[str, str] | None = None
    ) -> None:
        self.status = status
        self.body = (
            body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        )
        self.headers = (
            headers if headers is not None else {"Content-Type": "application/json"}
        )

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def clean(monkeypatch: pytest.MonkeyPatch) -> None:
    """The Author's terminal: no sandbox, and nothing in the environment that hello.py could take a value from."""
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    monkeypatch.delenv("MESSAGE", raising=False)


@pytest.fixture
def stub(clean: None, monkeypatch: pytest.MonkeyPatch) -> Any:
    """A stand-in listener at port 0, with every stack's api port pointed at it."""
    listener = Stub()
    monkeypatch.setattr(hello, "API_PORTS", dict.fromkeys(hello.STACKS, listener.port))
    yield listener
    listener.close()


def run(
    argv: list[str], capsys: pytest.CaptureFixture[str], runner: Any = None
) -> tuple[int, str, str]:
    code = hello.main(argv, runner=runner)
    out, err = capsys.readouterr()
    return code, out, err


# --- the request (gateway-http.md §2.1) ---------------------------------------------------------------------------


def test_hello_posts_the_message_and_prints_the_status_and_body(
    stub: Stub, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    # hello needs no token, so none is sent, even with one in the environment.
    monkeypatch.setenv("H4_OPERATOR_TOKEN", "h4op_dev_" + "x" * 43)
    code, out, err = run(["--stack", "dev", "--message", "Say hello."], capsys)
    assert code == 0, err
    assert out == printed(200, HELLO_BODY)
    assert err == ""
    (request,) = stub.requests
    assert (request["method"], request["path"]) == ("POST", "/hello")
    assert request["headers"]["content-type"] == "application/json"
    assert json.loads(request["raw"]) == {"message": "Say hello."}
    assert "authorization" not in request["headers"]
    assert "cookie" not in request["headers"]
    assert "x-h4-client" not in request["headers"]


def test_without_a_message_it_sends_an_empty_object(
    stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    # The gateway's default, "Hello.", applies (§2.1).
    code, _, _ = run(["--stack", "prod"], capsys)
    assert code == 0
    assert json.loads(stub.requests[0]["raw"]) == {}


@pytest.mark.parametrize(
    "message",
    [
        "-n Say hello.",
        "Spent $4.80 of the $5 day; $(shell echo RAN) `id` \"quoted\" 'single'",
        "  héllo — ✓ 你好  ",
        "",
    ],
)
def test_the_message_is_sent_as_typed(
    stub: Stub, capsys: pytest.CaptureFixture[str], message: str
) -> None:
    # The gateway validates it (1 to 500 code points once trimmed); the client neither trims nor checks it.
    code, _, _ = run(["--stack", "dev-cpu", f"--message={message}"], capsys)
    assert code == 0
    assert json.loads(stub.requests[0]["raw"]) == {"message": message}


def test_a_message_that_isnt_text_is_usage(
    stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    # Bytes that aren't UTF-8 reach argv as lone surrogates; JSON can't carry them as text.
    code, _, err = run(["--stack", "dev", "--message", "bad \udcff byte"], capsys)
    assert code == 2
    assert stub.requests == []
    assert last_line(err) == f"hello.py: exit 2: {hello.EXIT_MEANINGS[2]}"


# --- the answer (§2.5) --------------------------------------------------------------------------------------------


def test_a_degraded_answer_prints_its_status_and_body_and_exits_1(
    stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    stub.answer(
        503,
        DEGRADED_BODY,
        {
            "Content-Type": "application/json",
            "X-H4-Degraded-Cause": "store_uninitialized",
        },
    )
    code, out, err = run(["--stack", "dev-cpu"], capsys)
    assert code == 1
    assert out == printed(503, DEGRADED_BODY)
    assert last_line(err) == f"hello.py: exit 1: {hello.EXIT_MEANINGS[1]}"


@pytest.mark.parametrize(
    ("status", "body"),
    [
        (
            400,
            {
                "error": "invalid_request",
                "field": "message",
                "detail": "at most 500 characters",
            },
        ),
        (415, {"error": "unsupported_media_type"}),
        (
            429,
            {"error": "client_cap_exceeded", "limit": "per_minute", "retry_after_s": 3},
        ),
        (502, {"error": "local_error", "kind": "provider_error"}),
        (500, {"error": "internal_error"}),
    ],
)
def test_every_other_answer_prints_and_exits_1(
    stub: Stub, capsys: pytest.CaptureFixture[str], status: int, body: dict
) -> None:
    stub.answer(status, body)
    code, out, err = run(["--stack", "prod"], capsys)
    assert code == 1
    assert out == printed(status, body)
    assert last_line(err) == f"hello.py: exit 1: {hello.EXIT_MEANINGS[1]}"


def test_a_body_that_isnt_json_is_printed_as_text(
    stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    stub.answer(502, b"upstream down\n", {"Content-Type": "text/plain"})
    code, out, _ = run(["--stack", "dev"], capsys)
    assert code == 1
    assert out == "HTTP 502\nupstream down\n"


def test_control_characters_from_the_listener_are_not_printed(
    stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    # The answer is the model's text: an escape sequence in it must not reach the terminal as one.
    tricky = HELLO_BODY | {
        "answer": "red\u001b[31m bell\u0007 csi\u009b2J del\u007f end"
    }
    stub.answer(200, tricky)
    code, out, _ = run(["--stack", "dev-cpu"], capsys)
    assert code == 0
    for raw in ("\u001b", "\u0007", "\u009b", "\u007f"):
        assert raw not in out
    # Still JSON, with the same text, escaped.
    assert json.loads(out.split("\n", 1)[1]) == tricky
    stub.answer(503, b"oops\x1b]0;title\x07\n\tend\n", {"Content-Type": "text/plain"})
    code, out, _ = run(["--stack", "dev-cpu"], capsys)
    assert code == 1
    assert out == "HTTP 503\noops?]0;title?\n\tend\n"


def test_a_long_body_is_cut(
    stub: Stub, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(hello, "MAX_BODY", 64)
    stub.answer(200, b"x" * 200, {"Content-Type": "text/plain"})
    code, out, err = run(["--stack", "dev"], capsys)
    assert code == 0
    assert out == "HTTP 200\n" + "x" * 64 + "\n"
    assert "cut at 64 bytes" in err


# --- the transport ------------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("stack", "url"),
    [
        ("prod", "http://127.0.0.1:18000"),
        ("dev", "http://127.0.0.1:18100"),
        ("dev-cpu", "http://127.0.0.1:18300"),
    ],
)
def test_each_stack_has_its_api_port(stack: str, url: str) -> None:
    assert hello.target(stack, None) == url


def test_nothing_listening_is_exit_4(
    clean: None, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    monkeypatch.setattr(hello, "API_PORTS", dict.fromkeys(hello.STACKS, port))
    code, out, err = run(["--stack", "dev"], capsys)
    assert code == 4
    assert out == ""
    assert f"http://127.0.0.1:{port}" in err
    assert last_line(err) == f"hello.py: exit 4: {hello.EXIT_MEANINGS[4]}"


def test_a_timeout_is_exit_4(
    stub: Stub, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(hello, "TIMEOUT_S", 0.2)
    stub.delay = 1.0
    code, out, err = run(["--stack", "dev"], capsys)
    assert code == 4
    assert out == ""
    assert last_line(err) == f"hello.py: exit 4: {hello.EXIT_MEANINGS[4]}"


def test_the_timeout_outlasts_the_gateways_deadline_and_edges_read() -> None:
    # The gateway answers within its 20 s deadline, and edge within its 30 s read timeout (gateway-http.md §7).
    assert hello.TIMEOUT_S > 30


def test_a_redirect_is_not_followed(
    stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    elsewhere = Stub()
    try:
        stub.answer(302, b"", {"Location": f"{elsewhere.url}/hello"})
        code, out, _ = run(["--stack", "dev", "--message", "Say hello."], capsys)
    finally:
        elsewhere.close()
    assert code == 1
    assert out == "HTTP 302\n"
    assert elsewhere.requests == []  # the message goes nowhere else


def test_proxy_settings_are_ignored(
    stub: Stub, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    proxy = Stub()
    try:
        for key in (
            "HTTP_PROXY",
            "http_proxy",
            "HTTPS_PROXY",
            "https_proxy",
            "ALL_PROXY",
        ):
            monkeypatch.setenv(key, proxy.url)
        monkeypatch.delenv("NO_PROXY", raising=False)
        monkeypatch.delenv("no_proxy", raising=False)
        code, _, _ = run(["--stack", "dev", "--message", "Say hello."], capsys)
    finally:
        proxy.close()
    assert code == 0
    assert proxy.requests == []
    assert len(stub.requests) == 1


@pytest.mark.parametrize("stack", ["prod", "dev", "dev-cpu"])
def test_a_url_on_this_host_is_the_stacks_own_port(stack: str) -> None:
    port = hello.API_PORTS[stack]
    for host in ("127.0.0.1", "localhost"):
        assert (
            hello.check_url(f"http://{host}:{port}", stack) == f"http://{host}:{port}"
        )
        assert (
            hello.check_url(f"http://{host}:{port}/", stack) == f"http://{host}:{port}"
        )
    for other in sorted(set(hello.API_PORTS.values()) - {port}) + [8080, 18303]:
        with pytest.raises(hello.Usage, match="own api port"):
            hello.check_url(f"http://127.0.0.1:{other}", stack)


@pytest.mark.parametrize("stack", ["dev", "dev-cpu"])
def test_an_in_network_host_is_the_gateways_api_port(stack: str) -> None:
    # Inside a container on a dev-class stack's network: dev-cpu's hop, and dev's breach probe (T080).
    assert hello.check_url("http://gateway:8080", stack) == "http://gateway:8080"
    for url in ("http://gateway:8081", "http://gateway", "http://edge:18100"):
        with pytest.raises(hello.Usage, match="8080"):
            hello.check_url(url, stack)


def test_prod_never_takes_an_in_network_host() -> None:
    with pytest.raises(hello.Usage, match="prod"):
        hello.check_url("http://gateway:8080", "prod")


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:18100",
        "http://127.0.0.1:18100/hello",
        "http://127.0.0.1:18100?x=1",
        "http://127.0.0.1:18100#x",
        "http://user:pw@127.0.0.1:18100",
        "http://2130706433:8080",
        "http://gateway.example:8080",
        "http://10.0.0.5:8080",
        "http://[::1]:18100",
        "http://127.0.0.1:99999",
        "gateway:8080",
    ],
)
def test_any_other_url_is_refused(url: str) -> None:
    with pytest.raises(hello.Usage):
        hello.check_url(url, "dev")


def test_a_refused_url_is_usage_and_sends_nothing(
    stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    code, _, err = run(["--stack", "dev", "--url", "http://example.com:80"], capsys)
    assert code == 2
    assert stub.requests == []
    assert last_line(err) == f"hello.py: exit 2: {hello.EXIT_MEANINGS[2]}"


def test_a_url_override_is_called(
    stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    code, _, _ = run(
        ["--stack", "dev", "--url", f"http://localhost:{stub.port}"], capsys
    )
    assert code == 0
    assert len(stub.requests) == 1


def test_usage_errors_are_exit_2(
    clean: None, capsys: pytest.CaptureFixture[str]
) -> None:
    for argv in ([], ["--stack", "staging"], ["--stack", "dev", "--json"]):
        code, _, err = run(argv, capsys)
        assert code == 2, argv
        assert last_line(err) == f"hello.py: exit 2: {hello.EXIT_MEANINGS[2]}"


# --- agent sessions: dev-cpu only, through the hop ----------------------------------------------------------------


class Runner:
    """Stands in for the docker compose hop: records what it was given, and answers as the probe would.

    It keeps the environment's keys, but no value except SANDBOX_RUNTIME's and LC_ALL's: HTTPS_PROXY holds the sandbox
    proxy's credentials, and a failing assertion prints whatever it compares.
    """

    def __init__(
        self, code: int = 0, last: str = "", error: OSError | None = None
    ) -> None:
        self.code, self.last, self.error = code, last, error
        self.calls: list[dict[str, Any]] = []

    def __call__(self, command: list[str], env: dict[str, str]) -> tuple[int, str]:
        kept = {
            k: v if k in ("SANDBOX_RUNTIME", "LC_ALL") else "..."
            for k, v in env.items()
        }
        self.calls.append({"command": command, "env": kept})
        if self.error is not None:
            raise self.error
        return self.code, self.last


@pytest.fixture
def sandbox(clean: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """An agent session (SANDBOX_RUNTIME=1)."""
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")


def hop_command(inner: list[str]) -> list[str]:
    return [
        str(hello.ROOT / "deploy" / "agents-engine" / "docker-relay"),
        "docker",
        "compose",
        "-p",
        "h4reet-dev-cpu",
        "-f",
        str(hello.ROOT / "deploy" / "compose.yaml"),
        "--env-file",
        str(hello.ROOT / "deploy" / "env.agents" / "dev-cpu.vars"),
        "--profile",
        "breach",
        "run",
        "--rm",
        "-T",
        "breach-probe",
        "python3",
        "-I",
        "/app/hello.py",
        "--stack",
        "dev-cpu",
        "--url",
        "http://gateway:8080",
        *inner,
    ]


@pytest.mark.parametrize("stack", ["prod", "dev"])
def test_agent_sessions_reach_dev_cpu_only(
    stub: Stub, sandbox: None, capsys: pytest.CaptureFixture[str], stack: str
) -> None:
    runner = Runner()
    code, out, err = run(["--stack", stack, "--message", "Say hello."], capsys, runner)
    assert code == 2
    assert out == ""
    assert "dev-cpu" in err
    assert stub.requests == [] and runner.calls == []
    assert last_line(err) == f"hello.py: exit 2: {hello.EXIT_MEANINGS[2]}"
    # A URL doesn't change whose stack it is.
    code, _, _ = run(["--stack", stack, "--url", stub.url], capsys, runner)
    assert code == 2 and stub.requests == []


def test_dev_cpu_hops_through_a_probe_container(
    sandbox: None, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    # compose would let the shell override the env file (contracts/env-files.md §10, P5).
    monkeypatch.setenv("H4_STACK", "prod")
    monkeypatch.setenv("COMPOSE_PROFILES", "gpu")
    monkeypatch.setenv("COMPOSE_FILE", "/elsewhere/compose.yaml")
    monkeypatch.setenv("GATEWAY_DB_PASSWORD", "from-the-shell")
    runner = Runner()
    code, out, err = run(
        ["--stack", "dev-cpu", "--message", "-n Say hello."], capsys, runner
    )
    assert code == 0, err
    assert (out, err) == ("", "")  # the probe's own output passes straight through
    (call,) = runner.calls
    # One argument, with = so a message that starts with - stays a value.
    assert call["command"] == hop_command(["--message=-n Say hello."])
    assert not any(k.startswith(("H4_", "COMPOSE_")) for k in call["env"])
    assert "GATEWAY_DB_PASSWORD" not in call["env"]
    assert set(call["env"]) <= set(hello.HOP_ENV) | {"LC_ALL"}
    assert call["env"]["SANDBOX_RUNTIME"] == "1"  # the relay runs only in the sandbox
    assert call["env"]["LC_ALL"] == "C"


def test_dev_cpu_hop_without_a_message(
    sandbox: None, capsys: pytest.CaptureFixture[str]
) -> None:
    runner = Runner()
    assert run(["--stack", "dev-cpu"], capsys, runner)[0] == 0
    assert runner.calls[0]["command"] == hop_command([])


@pytest.mark.parametrize("code", [1, 2, 4])
def test_dev_cpu_hop_passes_the_probes_exit_code(
    sandbox: None, capsys: pytest.CaptureFixture[str], code: int
) -> None:
    runner = Runner(code, f"hello.py: exit {code}: {hello.EXIT_MEANINGS[code]}")
    assert run(["--stack", "dev-cpu"], capsys, runner)[:3] == (code, "", "")


@pytest.mark.parametrize(
    ("code", "last"),
    [
        (1, 'service "breach-probe" is not defined'),
        (125, "Error response from daemon"),
        (2, "docker-relay runs only 'docker' or 'make'"),
        (3, "hello.py: exit 3: none"),
        (1, "hello.py: exit 4: no answer"),
    ],
)
def test_dev_cpu_hop_failing_before_the_probe_answers_is_exit_4(
    sandbox: None, capsys: pytest.CaptureFixture[str], code: int, last: str
) -> None:
    code_out, _, err = run(["--stack", "dev-cpu"], capsys, Runner(code, last))
    assert code_out == 4
    assert f"exited {code}" in err
    assert last_line(err) == f"hello.py: exit 4: {hello.EXIT_MEANINGS[4]}"


def test_dev_cpu_hop_that_cant_start_the_relay_is_exit_4(
    sandbox: None, capsys: pytest.CaptureFixture[str]
) -> None:
    runner = Runner(error=FileNotFoundError(2, "No such file or directory"))
    code, _, err = run(["--stack", "dev-cpu"], capsys, runner)
    assert code == 4
    assert "docker-relay" in err and "No such file or directory" in err
    assert last_line(err) == f"hello.py: exit 4: {hello.EXIT_MEANINGS[4]}"


def test_dev_cpu_with_a_url_makes_no_hop(
    stub: Stub, sandbox: None, capsys: pytest.CaptureFixture[str]
) -> None:
    # The CLI inside the probe gets --url, and calls it; so does a session that names one, as operator.py does.
    runner = Runner()
    code, _, _ = run(["--stack", "dev-cpu", "--url", stub.url], capsys, runner)
    assert code == 0
    assert runner.calls == [] and len(stub.requests) == 1


def test_from_the_authors_terminal_dev_cpu_goes_straight_to_its_port(
    stub: Stub, capsys: pytest.CaptureFixture[str]
) -> None:
    # Outside the sandbox there is no hop: docker there is the host's rootful engine, where agent-written images must
    # never be built or run (FR-039). The engine publishes dev-cpu's api port on the host's 127.0.0.1.
    runner = Runner()
    code, out, _ = run(["--stack", "dev-cpu"], capsys, runner)
    assert code == 0
    assert out == printed(200, HELLO_BODY)
    assert runner.calls == [] and len(stub.requests) == 1


def test_run_hop_streams_and_keeps_the_last_line(
    capfd: pytest.CaptureFixture[str],
) -> None:
    child = """
import sys
print("HTTP 503")
print("the probe ran", file=sys.stderr)
print("hello.py: exit 1: the stack answered", file=sys.stderr)
sys.exit(1)
"""
    env = {"PATH": os.environ.get("PATH", "")}
    code, last = hello.run_hop([sys.executable, "-I", "-c", child], env)
    assert (code, last) == (1, "hello.py: exit 1: the stack answered")
    out, err = capfd.readouterr()
    assert out == "HTTP 503\n"
    assert "the probe ran" in err


def test_run_hop_gives_the_probe_no_input() -> None:
    env = {"PATH": os.environ.get("PATH", "")}
    command = [
        sys.executable,
        "-I",
        "-c",
        "import sys; sys.exit(len(sys.stdin.read()))",
    ]
    assert hello.run_hop(command, env) == (0, "")


def test_the_probe_image_holds_hello_where_the_hop_runs_it() -> None:
    lines = (
        (REPO / "evals" / "Dockerfile.probe").read_text(encoding="utf-8").splitlines()
    )
    assert "COPY scripts/hello.py /app/hello.py" in lines
    assert hop_command([])[15:18] == ["python3", "-I", "/app/hello.py"]


def test_the_script_runs_by_path_through_py_host(tmp_path: Path) -> None:
    # As make runs it: isolated, blind to bytecode, by path; nothing it needs comes from its own directory. A child
    # process can't see a patched API_PORTS, so the stand-in listens on dev-cpu's own port, in this test's network
    # namespace (the sandbox's or the devcontainer's). Outside the sandbox, dev-cpu goes there.
    port = hello.API_PORTS["dev-cpu"]
    try:
        listener = Stub(port)
    except OSError as error:
        pytest.skip(f"127.0.0.1:{port} is taken here: {error.strerror}")
    try:
        env = {k: v for k, v in os.environ.items() if k != "SANDBOX_RUNTIME"}
        env["HOME"] = str(tmp_path)
        script = str(REPO / "scripts" / "hello.py")
        flags = ["-I", "-B", "-X", "pycache_prefix=/dev/null"]
        done = subprocess.run(
            [
                sys.executable,
                *flags,
                script,
                "--stack",
                "dev-cpu",
                "--message",
                "Say hello.",
            ],
            capture_output=True,
            text=True,
            env=env,
            timeout=60,
            check=False,
        )
    finally:
        listener.close()
    assert done.returncode == 0, done.stderr
    assert done.stdout == printed(200, HELLO_BODY)
    (request,) = listener.requests
    assert json.loads(request["raw"]) == {"message": "Say hello."}


# --- make hello (§9) ----------------------------------------------------------------------------------------------

MAKE_VARIABLES = (
    "MAKEFLAGS",
    "MAKELEVEL",
    "MFLAGS",
    "MAKEOVERRIDES",
    "ENV",
    "SANDBOX_RUNTIME",
    "MESSAGE",
    "HELLO",
)
PY_HOST = "python3 -I -B -X pycache_prefix=/dev/null"


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


def hello_line(done: subprocess.CompletedProcess[str]) -> str:
    (line,) = [ln for ln in done.stdout.splitlines() if "scripts/hello.py" in ln]
    return line


def output_lines(done: subprocess.CompletedProcess[str]) -> list[str]:
    return [line.strip() for line in (done.stdout + done.stderr).splitlines()]


@pytest.fixture
def argv_stub(tmp_path: Path) -> str:
    """A HELLO for make that prints the arguments it was given, and nothing else."""
    stub = tmp_path / "argv.py"
    stub.write_text(
        "import json, sys\nprint('ARGV', json.dumps(sys.argv[1:]))\n", encoding="utf-8"
    )
    return f"{sys.executable} -I {stub}"


def argv_of(done: subprocess.CompletedProcess[str]) -> list[str]:
    (line,) = [ln for ln in done.stdout.splitlines() if ln.startswith("ARGV ")]
    return json.loads(line.removeprefix("ARGV "))


@pytest.mark.parametrize("stack", ["prod", "dev", "dev-cpu"])
def test_make_hello_runs_the_script_by_path_through_py_host(
    tmp_path: Path, stack: str
) -> None:
    done = make(tmp_path, "-n", "hello", f"ENV={stack}")
    assert done.returncode == 0, done.stderr
    assert hello_line(done) == f"{PY_HOST} scripts/hello.py --stack {stack}"


def test_make_hello_passes_the_message_through_the_shell(tmp_path: Path) -> None:
    done = make(tmp_path, "-n", "hello", "ENV=dev", "MESSAGE=Say hello.")
    assert (
        hello_line(done)
        == f'{PY_HOST} scripts/hello.py --stack dev --message="$MESSAGE"'
    )


def test_make_hello_hands_the_script_the_message_as_typed(
    tmp_path: Path, argv_stub: str
) -> None:
    # Run, not -n: make expands a command-line value wherever it's used, and again when it exports it to a recipe, so
    # "$5" would vanish and "$(shell ...)" would run (T056's review).
    message = "Spent $4.80 of the $5 day ceiling; $(shell echo RAN >&2) `echo RAN`"
    done = make(
        tmp_path,
        "hello",
        "ENV=dev-cpu",
        f"MESSAGE={message}",
        f"HELLO={argv_stub}",
        sandbox=True,
    )
    assert done.returncode == 0, done.stderr
    assert argv_of(done) == [f"--message={message}"]
    assert "RAN" not in output_lines(done)


def test_make_hello_takes_the_message_from_the_command_line_only(
    tmp_path: Path, argv_stub: str
) -> None:
    done = make(
        tmp_path,
        "hello",
        "ENV=prod",
        f"HELLO={argv_stub}",
        MESSAGE="From the environment.",
    )
    assert done.returncode == 0, done.stderr
    assert argv_of(done) == []


@pytest.mark.parametrize("stack", ["prod", "dev"])
def test_make_hello_keeps_agent_sessions_off_prod_and_dev(
    tmp_path: Path, argv_stub: str, stack: str
) -> None:
    done = make(tmp_path, "hello", f"ENV={stack}", f"HELLO={argv_stub}", sandbox=True)
    assert done.returncode == 2
    assert "dev-cpu" in done.stderr
    assert not [ln for ln in done.stdout.splitlines() if ln.startswith("ARGV ")]
    # The same refusal as the operator targets', in the same words about whose stacks they are.
    assert f"make hello ENV={stack}: agent sessions" in done.stderr


def test_make_help_lists_hello(tmp_path: Path) -> None:
    out = make(tmp_path, "help").stdout
    assert re.search(r"^\s+hello\s", out, re.MULTILINE)
