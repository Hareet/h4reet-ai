"""Tests for the uptime probe, infra/lambdas/probe/probe.py (spec 001 tasks.md T032; FR-061; contracts/aws-alerts.md
§5, and September's §4 at 00309c47; research.md R-24).

h4-probe runs once a minute from AWS's side, once group 8's P-I5 enables its schedule. Each run makes two checks:

  - site:   GET https://hareet.ai/
  - status: GET https://hareet.ai/api/status

both with `X-H4-Probe: 1`. A check passes on a 200 within 5 s, and, for status, a JSON body with a `serving` field.
It never calls hello or a turn. A run that fails raises, so Lambda counts an error, which the probe's alarm (group 8)
reads; it logs one line per check, the name, the status, the duration, and pass or fail, never a body. The tests drive
it with a stub fetch and a stub clock, and its real fetch with a server on 127.0.0.1.
"""

from __future__ import annotations

import http.server
import importlib.util
import json
import socket
import sys
import threading
from pathlib import Path
from typing import ClassVar

import pytest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("h4_probe", HERE / "probe.py")
assert spec is not None and spec.loader is not None
probe = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = probe
spec.loader.exec_module(probe)

SITE = "https://hareet.ai"
# A marker built at run time, so no body's text can reach a log unnoticed.
MARK = "body-" + "".join(chr(97 + i) for i in range(8))


class Clock:
    """A monotonic clock each fetch advances by its own duration."""

    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


class Fetch:
    """Answers each URL from a table: (status, body, seconds), or an exception to raise. Records every call."""

    def __init__(self, clock: Clock, answers: dict[str, object]) -> None:
        self.clock, self.answers, self.calls = clock, answers, []

    def __call__(self, url: str, headers: dict[str, str], timeout: float):
        self.calls.append((url, dict(headers), timeout))
        answer = self.answers[url]
        if isinstance(answer, BaseException):
            self.clock.now += timeout
            raise answer
        status, body, seconds = answer  # type: ignore[misc]
        self.clock.now += seconds
        return status, body


def healthy(**override: object) -> dict[str, object]:
    answers: dict[str, object] = {
        f"{SITE}/": (200, f"<html>{MARK}</html>".encode(), 0.3),
        f"{SITE}/api/status": (
            200,
            json.dumps({"serving": "ec2", "note": MARK}).encode(),
            0.2,
        ),
    }
    answers.update({f"{SITE}{k}": v for k, v in override.items()})
    return answers


def run(answers: dict[str, object]) -> tuple[dict, Fetch]:
    clock = Clock()
    fetch = Fetch(clock, answers)
    return probe.run(SITE, fetch=fetch, clock=clock), fetch


def verdicts(result: dict) -> dict[str, bool]:
    return {c["check"]: c["pass"] for c in result["checks"]}


# ----------------------------------------------------------------------------------------------------------------------
# The two checks.


def test_both_checks_run_with_the_probe_header_and_pass_on_200s() -> None:
    result, fetch = run(healthy())
    assert result["pass"] is True
    assert verdicts(result) == {"site": True, "status": True}
    assert [c[0] for c in fetch.calls] == [f"{SITE}/", f"{SITE}/api/status"]
    for _, headers, timeout in fetch.calls:
        assert headers["X-H4-Probe"] == "1"
        assert timeout == 5
    # Nothing that names a visitor, and no credential, is sent.
    sent = {k.lower() for _, headers, _ in fetch.calls for k in headers}
    assert sent <= {"x-h4-probe", "user-agent", "accept"}


def test_a_check_that_isnt_a_200_fails_the_run() -> None:
    for status in (204, 301, 302, 404, 500, 502, 503, 504):
        result, _ = run(healthy(**{"/": (status, b"", 0.1)}))
        assert verdicts(result) == {"site": False, "status": True}, status
        assert result["pass"] is False


def test_a_200_slower_than_5_seconds_fails() -> None:
    result, _ = run(healthy(**{"/api/status": (200, b'{"serving": "none"}', 5.2)}))
    assert verdicts(result) == {"site": True, "status": False}
    result, _ = run(healthy(**{"/": (200, b"ok", 5.0)}))
    assert verdicts(result)["site"] is True  # within 5 s, the edge included


def test_a_fetch_that_raises_fails_its_check_and_the_other_still_runs() -> None:
    for exc in (TimeoutError("timed out"), OSError("unreachable")):
        result, fetch = run(healthy(**{"/": exc}))
        assert verdicts(result) == {"site": False, "status": True}
        assert len(fetch.calls) == 2
        site = next(c for c in result["checks"] if c["check"] == "site")
        assert site["status"] is None


def test_status_needs_a_json_object_with_a_serving_field() -> None:
    bodies = {
        b'{"serving": "laptop"}': True,
        b'{"serving": "none", "stack": null}': True,
        b'{"serving": null}': True,  # the field is there; its value is the relay's
        b'{"state": "normal"}': False,  # September's field, not this contract's
        b'["serving"]': False,
        b"serving": False,
        b"": False,
        b"\xff\xfe": False,
    }
    for body, want in bodies.items():
        result, _ = run(healthy(**{"/api/status": (200, body, 0.1)}))
        assert verdicts(result)["status"] is want, body


def test_the_site_check_reads_no_field() -> None:
    result, _ = run(healthy(**{"/": (200, b"not json at all", 0.1)}))
    assert verdicts(result)["site"] is True


def test_it_never_calls_hello_or_a_turn() -> None:
    _, fetch = run(healthy())
    urls = [c[0] for c in fetch.calls]
    assert not [u for u in urls if "hello" in u or "turn" in u or "/room/" in u]
    assert probe.PATHS == ("/", "/api/status")
    # The module's text holds no other path a run could take.
    text = (HERE / "probe.py").read_text(encoding="utf-8")
    assert "/hello" not in text and "/turn" not in text


# ----------------------------------------------------------------------------------------------------------------------
# The handler: one log line per check, and an error on a failed run.


def test_the_handler_passes_quietly_and_logs_one_line_per_check(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("H4_PROBE_SITE", SITE)
    clock = Clock()
    fetch = Fetch(clock, healthy())
    result = probe.handler({}, None, fetch=fetch, clock=clock)
    assert result["pass"] is True
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == 2
    logged = [json.loads(line) for line in lines]
    assert [x["check"] for x in logged] == ["site", "status"]
    for x in logged:
        assert set(x) == {"check", "status", "ms", "pass"}
    assert MARK not in "\n".join(lines)


def test_the_handler_raises_on_a_failed_run_so_lambda_counts_an_error(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("H4_PROBE_SITE", SITE)
    clock = Clock()
    fetch = Fetch(clock, healthy(**{"/api/status": (503, MARK.encode(), 0.1)}))
    with pytest.raises(probe.ProbeFailed) as raised:
        probe.handler({}, None, fetch=fetch, clock=clock)
    assert "status" in str(raised.value) and MARK not in str(raised.value)
    out = capsys.readouterr().out
    assert '"pass": false' in out and MARK not in out
    assert len(fetch.calls) == 2  # one attempt a check: the next minute is the retry


def test_the_handler_takes_only_an_https_site(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("H4_PROBE_SITE", raising=False)
    assert probe.site_from_env() == "https://hareet.ai"
    for bad in ("http://hareet.ai", "hareet.ai", "https://hareet.ai/path", "ftp://x"):
        monkeypatch.setenv("H4_PROBE_SITE", bad)
        with pytest.raises(ValueError):
            probe.site_from_env()
    monkeypatch.setenv("H4_PROBE_SITE", "https://www.hareet.ai/")
    assert probe.site_from_env() == "https://www.hareet.ai"


# ----------------------------------------------------------------------------------------------------------------------
# The real fetch, against a server on 127.0.0.1: what it sends, and that it follows no redirect.


class Handler(http.server.BaseHTTPRequestHandler):
    seen: ClassVar[list[tuple[str, str, dict[str, str], bytes]]] = []

    def do_GET(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        Handler.seen.append(
            (
                self.command,
                self.path,
                {k.lower(): v for k, v in self.headers.items()},
                self.rfile.read(length) if length else b"",
            )
        )
        if self.path == "/moved":
            self.send_response(302)
            self.send_header("Location", "/")
            self.end_headers()
            return
        body = (
            b"x" * (probe.MAX_BODY * 2)
            if self.path == "/big"
            else b'{"serving": "ec2"}'
        )
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        pass


@pytest.fixture
def server():
    try:
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    except OSError as exc:  # a sandbox without a loopback socket
        pytest.skip(f"no loopback socket here: {exc.__class__.__name__}")
    Handler.seen = []
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()
    httpd.server_close()


def test_the_real_fetch_sends_a_plain_get_with_the_probe_header(server: str) -> None:
    status, body = probe.http_fetch(f"{server}/api/status", probe.HEADERS, 5)
    assert status == 200 and json.loads(body) == {"serving": "ec2"}
    ((method, path, headers, sent),) = Handler.seen
    assert (method, path, sent) == ("GET", "/api/status", b"")
    assert headers["x-h4-probe"] == "1"
    assert "cookie" not in headers and "authorization" not in headers


def test_the_real_fetch_follows_no_redirect_and_reads_a_bounded_body(
    server: str,
) -> None:
    status, _ = probe.http_fetch(f"{server}/moved", probe.HEADERS, 5)
    assert status == 302
    assert [p for _, p, _, _ in Handler.seen] == ["/moved"]
    status, body = probe.http_fetch(f"{server}/big", probe.HEADERS, 5)
    assert status == 200 and len(body) == probe.MAX_BODY


def test_the_real_fetch_times_out() -> None:
    try:
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
    except OSError as exc:
        pytest.skip(f"no loopback socket here: {exc.__class__.__name__}")
    try:
        port = listener.getsockname()[1]
        with pytest.raises(OSError):
            probe.http_fetch(f"http://127.0.0.1:{port}/", probe.HEADERS, 0.3)
    finally:
        listener.close()
