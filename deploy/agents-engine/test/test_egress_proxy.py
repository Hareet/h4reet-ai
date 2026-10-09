"""Tests for deploy/agents-engine/egress-proxy.py (spec 000, FR-039; contracts/agents-engine.md §4).

The decision logic is pure, so most cases are unit-level. The sandbox allows binding 127.0.0.1, so a
loopback server test proves the refusal path end to end without any egress, and a loopback socket pair
proves the tunnel's byte pump. No real DNS and no external host is contacted. The module is loaded by
path and registered in sys.modules, as the engine's tests must.
"""

from __future__ import annotations

import importlib.util
import json
import socket
import sys
import threading
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "egress_proxy", REPO / "deploy" / "agents-engine" / "egress-proxy.py"
)
assert SPEC and SPEC.loader
ep = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ep
SPEC.loader.exec_module(ep)


def fake_resolver(address: str):
    """A resolver that returns one address in getaddrinfo's shape, without touching DNS."""

    def resolve(_host: str):
        family = socket.AF_INET6 if ":" in address else socket.AF_INET
        return [(family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 0))]

    return resolve


GLOBAL = fake_resolver("93.184.216.34")  # a stand-in global-unicast address


# --------------------------------------------------------------------------------------------------
# parse_domains: keep hostnames only (§4)
# --------------------------------------------------------------------------------------------------
def test_parse_domains_keeps_hostnames() -> None:
    kept = ep.parse_domains(
        ["registry.npmjs.org", "pypi.org", "files.pythonhosted.org", "ghcr.io"]
    )
    assert kept == [
        "registry.npmjs.org",
        "pypi.org",
        "files.pythonhosted.org",
        "ghcr.io",
    ]


def test_parse_domains_drops_ip_and_host_port() -> None:
    # The opening 198.18.0.1:2376 and any IP literal must never become a destination.
    kept = ep.parse_domains(
        ["198.18.0.1:2376", "1.2.3.4", "10.0.0.1", "::1", "ghcr.io"]
    )
    assert kept == ["ghcr.io"]


def test_parse_domains_keeps_wildcards_and_lowercases() -> None:
    assert ep.parse_domains(["*.Example.COM"]) == ["*.example.com"]


def test_parse_domains_of_nonlist_is_empty() -> None:
    assert ep.parse_domains(None) == []
    assert ep.parse_domains("registry.npmjs.org") == []


# --------------------------------------------------------------------------------------------------
# Settings.load: fail closed (§4)
# --------------------------------------------------------------------------------------------------
def _write_settings(
    tmp_path: Path, allowed: list[str], denied: list[str] | None = None
) -> Path:
    data = {"sandbox": {"network": {"allowedDomains": allowed}}}
    if denied is not None:
        data["sandbox"]["network"]["deniedDomains"] = denied
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_settings_load_valid(tmp_path: Path) -> None:
    settings = ep.Settings.load(
        _write_settings(tmp_path, ["registry.npmjs.org"], ["bad.com"])
    )
    assert settings.ok
    assert settings.allowed == ["registry.npmjs.org"]
    assert settings.denied == ["bad.com"]


def test_settings_load_missing_file_fails_closed(tmp_path: Path) -> None:
    assert not ep.Settings.load(tmp_path / "nope.json").ok


def test_settings_load_invalid_json_fails_closed(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    path.write_text("{not json", encoding="utf-8")
    assert not ep.Settings.load(path).ok


def test_settings_load_empty_list_fails_closed(tmp_path: Path) -> None:
    assert not ep.Settings.load(_write_settings(tmp_path, [])).ok


@pytest.mark.parametrize(
    "text",
    [
        "[]",
        '["registry.npmjs.org"]',
        '"registry.npmjs.org"',
        "42",
        "null",
        "true",
        '{"sandbox": ["registry.npmjs.org"]}',
        '{"sandbox": {"network": "registry.npmjs.org"}}',
        '{"sandbox": {"network": ["registry.npmjs.org"]}}',
    ],
)
def test_settings_load_valid_json_of_the_wrong_shape_fails_closed(
    tmp_path: Path, text: str
) -> None:
    # Valid JSON that isn't a settings object, at any level, is no_list, never an exception (§4).
    path = tmp_path / "settings.json"
    path.write_text(text, encoding="utf-8")
    settings = ep.Settings.load(path)
    assert not settings.ok
    assert (
        ep.classify("CONNECT", "pypi.org:443", settings, GLOBAL).reason == ep.R_NO_LIST
    )


def test_settings_load_a_denied_list_that_is_not_a_list_fails_closed(
    tmp_path: Path,
) -> None:
    # The proxy can't honour a deniedDomains it can't read, so it serves nothing rather than ignore it.
    path = tmp_path / "settings.json"
    path.write_text(
        json.dumps(
            {
                "sandbox": {
                    "network": {
                        "allowedDomains": ["pypi.org"],
                        "deniedDomains": "github.com",
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    assert not ep.Settings.load(path).ok


def test_settings_digest_is_stable(tmp_path: Path) -> None:
    one = ep.Settings.load(_write_settings(tmp_path, ["a.com", "b.com"]))
    two = ep.Settings.load(_write_settings(tmp_path, ["b.com", "a.com"]))
    assert one.digest() == two.digest()


# --------------------------------------------------------------------------------------------------
# host_listed: wildcard and exact (§4)
# --------------------------------------------------------------------------------------------------
def test_host_listed_exact() -> None:
    assert ep.host_listed("registry.npmjs.org", ["registry.npmjs.org"])
    assert not ep.host_listed("evil.org", ["registry.npmjs.org"])


def test_host_listed_wildcard_matches_subdomains_only() -> None:
    # §4: an entry starting with `*.` matches any subdomain of its base, and not the base itself, as the
    # sandbox's own allowedDomains matcher does.
    patterns = ["*.example.com"]
    assert ep.host_listed("a.example.com", patterns)
    assert ep.host_listed("deep.a.example.com", patterns)
    assert not ep.host_listed("example.com", patterns)
    assert not ep.host_listed("example.com.", patterns)
    assert not ep.host_listed("notexample.com", patterns)
    assert not ep.host_listed("example.com.evil.net", patterns)


def test_wildcard_entry_refuses_its_apex_and_allows_a_subdomain() -> None:
    settings = ep.Settings(allowed=["*.example.com"], ok=True)
    apex = ep.classify("CONNECT", "example.com:443", settings, GLOBAL)
    assert not apex.ok
    assert apex.reason == ep.R_NOT_ON_LIST
    sub = ep.classify("CONNECT", "a.example.com:443", settings, GLOBAL)
    assert sub.ok
    assert sub.reason == ep.R_ALLOWED


def test_wildcard_denied_entry_spares_its_apex() -> None:
    # The same rule holds in deniedDomains: `*.example.com` there refuses the subdomains only.
    settings = ep.Settings(
        allowed=["example.com", "a.example.com"], denied=["*.example.com"], ok=True
    )
    assert ep.classify("CONNECT", "example.com:443", settings, GLOBAL).ok
    assert (
        ep.classify("CONNECT", "a.example.com:443", settings, GLOBAL).reason
        == ep.R_DENIED
    )


# --------------------------------------------------------------------------------------------------
# is_global_unicast (§4)
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "address", ["93.184.216.34", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946"]
)
def test_is_global_unicast_accepts_global(address: str) -> None:
    assert ep.is_global_unicast(address)


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.2",
        "172.16.5.5",
        "192.168.1.1",
        "169.254.169.254",  # the instance-metadata address
        "100.64.0.1",  # carrier-grade NAT
        "198.18.0.1",  # the engine's own address
        "224.0.0.1",  # multicast
        "0.0.0.0",
        "::1",
        "fe80::1",
        "fc00::1",
    ],
)
def test_is_global_unicast_rejects_non_global(address: str) -> None:
    assert not ep.is_global_unicast(address)


# --------------------------------------------------------------------------------------------------
# classify (§4)
# --------------------------------------------------------------------------------------------------
@pytest.fixture
def settings() -> ep.Settings:
    return ep.Settings(
        allowed=["registry.npmjs.org", "*.example.com"],
        denied=["bad.example.com"],
        ok=True,
    )


def test_classify_connect_allowed(settings: ep.Settings) -> None:
    verdict = ep.classify("CONNECT", "registry.npmjs.org:443", settings, GLOBAL)
    assert verdict.ok
    assert verdict.reason == ep.R_ALLOWED
    assert verdict.address == "93.184.216.34"
    assert verdict.port == 443


def test_classify_connect_wrong_port(settings: ep.Settings) -> None:
    assert (
        ep.classify("CONNECT", "registry.npmjs.org:80", settings, GLOBAL).reason
        == ep.R_PORT
    )


def test_classify_connect_ip_literal(settings: ep.Settings) -> None:
    assert (
        ep.classify("CONNECT", "1.2.3.4:443", settings, GLOBAL).reason
        == ep.R_IP_LITERAL
    )


def test_classify_connect_denied(settings: ep.Settings) -> None:
    assert (
        ep.classify("CONNECT", "bad.example.com:443", settings, GLOBAL).reason
        == ep.R_DENIED
    )


def test_classify_connect_not_on_list(settings: ep.Settings) -> None:
    assert (
        ep.classify("CONNECT", "evil.org:443", settings, GLOBAL).reason
        == ep.R_NOT_ON_LIST
    )


def test_classify_connect_non_global_address(settings: ep.Settings) -> None:
    # A listed name that resolves to a non-global address is refused, so a rebinding name can't
    # swap it afterwards.
    rebind = fake_resolver("127.0.0.1")
    assert (
        ep.classify("CONNECT", "registry.npmjs.org:443", settings, rebind).reason
        == ep.R_NON_GLOBAL
    )


def test_classify_connect_metadata_address_refused(settings: ep.Settings) -> None:
    metadata = fake_resolver("169.254.169.254")
    assert (
        ep.classify("CONNECT", "registry.npmjs.org:443", settings, metadata).reason
        == ep.R_NON_GLOBAL
    )


def test_classify_unresolvable_name_is_unreachable_not_non_global(
    settings: ep.Settings,
) -> None:
    # A listed name that doesn't resolve has no address at all: that's an upstream failure, and the log
    # says so, rather than blaming an address it never saw.
    def no_such_name(_host: str):
        raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")

    verdict = ep.classify("CONNECT", "registry.npmjs.org:443", settings, no_such_name)
    assert not verdict.ok
    assert verdict.reason == ep.R_UPSTREAM_UNREACHABLE


def test_classify_get_absolute_form_allowed(settings: ep.Settings) -> None:
    verdict = ep.classify(
        "GET", "http://a.example.com/path?token=secret", settings, GLOBAL
    )
    assert verdict.ok
    assert verdict.path == "/path"  # the query is dropped from the log
    assert verdict.request_path == "/path?token=secret"  # and kept for the upstream


def test_classify_get_with_a_control_character_refused(settings: ep.Settings) -> None:
    # The request-target goes upstream as it came, so it may hold no space or control character.
    assert (
        ep.classify("GET", "http://a.example.com/x\ry", settings, GLOBAL).reason
        == ep.R_METHOD
    )


def test_classify_get_origin_form_refused(settings: ep.Settings) -> None:
    assert ep.classify("GET", "/path", settings, GLOBAL).reason == ep.R_METHOD


def test_classify_get_wrong_port_refused(settings: ep.Settings) -> None:
    assert (
        ep.classify("GET", "http://a.example.com:8080/x", settings, GLOBAL).reason
        == ep.R_PORT
    )


def test_classify_other_method_refused(settings: ep.Settings) -> None:
    assert (
        ep.classify("POST", "http://a.example.com/x", settings, GLOBAL).reason
        == ep.R_METHOD
    )
    assert (
        ep.classify("CONNECT", "a.example.com:22", settings, GLOBAL).reason == ep.R_PORT
    )


def test_classify_fails_closed_without_list() -> None:
    closed = ep.Settings(ok=False)
    assert (
        ep.classify("CONNECT", "registry.npmjs.org:443", closed, GLOBAL).reason
        == ep.R_NO_LIST
    )


# --------------------------------------------------------------------------------------------------
# The log never carries a payload (§4)
# --------------------------------------------------------------------------------------------------
def test_log_fields_and_no_query(tmp_path: Path, settings: ep.Settings) -> None:
    log = ep.EgressLog(str(tmp_path / "egress.jsonl"))
    verdict = ep.classify(
        "GET", "http://a.example.com/path?token=secret", settings, GLOBAL
    )
    log.record(verdict, bytes_up=10, bytes_down=20, duration_ms=5)
    line = json.loads(
        (tmp_path / "egress.jsonl").read_text(encoding="utf-8").splitlines()[0]
    )
    assert line["decision"] == "allowed"
    assert line["reason"] == "allowed"
    assert line["host"] == "a.example.com"
    assert line["path"] == "/path"
    assert "secret" not in json.dumps(line)
    assert set(line) == {
        "ts",
        "decision",
        "reason",
        "method",
        "host",
        "port",
        "path",
        "bytes_up",
        "bytes_down",
        "duration_ms",
    }


# --------------------------------------------------------------------------------------------------
# Loopback: the refusal path end to end, and the tunnel's byte pump. All on 127.0.0.1.
# --------------------------------------------------------------------------------------------------
def _loopback_pair() -> tuple[socket.socket, socket.socket]:
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    left = socket.create_connection(listener.getsockname())
    right, _ = listener.accept()
    listener.close()
    return left, right


def test_server_refuses_unlisted_without_egress(
    tmp_path: Path, settings: ep.Settings
) -> None:
    log = ep.EgressLog(str(tmp_path / "egress.jsonl"))

    # A resolver that raises if ever called: a refusal must never resolve or connect.
    def no_resolve(_host: str):
        raise AssertionError("a refused request must not resolve")

    proxy = ep.EgressProxy(settings, log, resolver=no_resolve)
    thread = threading.Thread(target=proxy.serve, args=(("127.0.0.1", 0),), daemon=True)
    thread.start()
    while proxy._server_socket is None:  # wait for bind
        pass
    address = proxy._server_socket.getsockname()
    client = socket.create_connection(address)
    client.sendall(b"CONNECT evil.org:443 HTTP/1.1\r\nHost: evil.org:443\r\n\r\n")
    response = client.recv(200)
    client.close()
    assert response.startswith(b"HTTP/1.1 403")
    log_path = tmp_path / "egress.jsonl"
    # The handler writes the log after it answers, and the file exists a moment before its line does,
    # so wait for a whole line.
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        if log_path.exists() and log_path.read_text(encoding="utf-8").endswith("\n"):
            break
        time.sleep(0.01)
    proxy.shutdown()
    logged = json.loads(log_path.read_text(encoding="utf-8").splitlines()[-1])
    assert logged["reason"] == "not_on_list"


def test_tunnel_pumps_both_ways() -> None:
    client, client_peer = _loopback_pair()
    upstream, upstream_peer = _loopback_pair()

    def echo_once() -> None:
        data = upstream_peer.recv(64)
        upstream_peer.sendall(b"pong:" + data)

    echo = threading.Thread(target=echo_once, daemon=True)
    echo.start()
    result: dict[str, tuple[int, int]] = {}

    def run_tunnel() -> None:
        result["counts"] = ep.tunnel(client, upstream, idle=2.0)

    pump = threading.Thread(target=run_tunnel, daemon=True)
    pump.start()

    client_peer.sendall(b"ping")
    assert client_peer.recv(64) == b"pong:ping"
    client_peer.close()  # closing the client side ends the tunnel
    pump.join(timeout=3)
    up, down = result["counts"]
    assert up == len(b"ping")
    assert down == len(b"pong:ping")
    for sock in (client, client_peer, upstream, upstream_peer):
        try:
            sock.close()
        except OSError:
            pass


# --------------------------------------------------------------------------------------------------
# One connection through `handle`, with the upstream injected: still no egress (§4)
# --------------------------------------------------------------------------------------------------
def _read_until(sock: socket.socket, marker: bytes, timeout: float = 2.0) -> bytes:
    """Read until `marker` arrives, the peer closes, or `timeout` passes; return what came."""
    sock.settimeout(timeout)
    data = b""
    try:
        while marker not in data:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
    except TimeoutError:
        pass
    return data


def _read_all(sock: socket.socket, timeout: float = 3.0) -> bytes:
    return _read_until(sock, b"\x00never\x00", timeout)


def _log_lines(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def _never_resolve(_host: str):
    raise AssertionError("this request must not resolve")


def _never_connect(*_args, **_kwargs):
    raise AssertionError("this request must not connect")


def _serve_one(proxy: ep.EgressProxy, request: bytes) -> bytes:
    """Hand the proxy one client connection carrying `request`, and return all it answered."""
    client, accepted = _loopback_pair()
    worker = threading.Thread(target=proxy.handle, args=(accepted,), daemon=True)
    worker.start()
    client.sendall(request)
    response = _read_all(client)
    worker.join(timeout=3)
    client.close()
    return response


CONNECT_NPM = (
    b"CONNECT registry.npmjs.org:443 HTTP/1.1\r\nHost: registry.npmjs.org:443\r\n\r\n"
)


def test_no_list_is_logged_at_most_once_a_minute(tmp_path: Path) -> None:
    log_path = tmp_path / "egress.jsonl"
    now = [1000.0]
    proxy = ep.EgressProxy(
        ep.Settings(ok=False),
        ep.EgressLog(str(log_path)),
        resolver=_never_resolve,
        connect=_never_connect,
        clock=lambda: now[0],
    )
    for at in (1000.0, 1010.0, 1059.9):
        now[0] = at
        # Every request is still refused...
        assert _serve_one(proxy, CONNECT_NPM).startswith(b"HTTP/1.1 503")
    # ...but the minute holds one line.
    lines = _log_lines(log_path)
    assert [line["reason"] for line in lines] == ["no_list"]
    now[0] = 1060.0
    assert _serve_one(proxy, CONNECT_NPM).startswith(b"HTTP/1.1 503")
    assert [line["reason"] for line in _log_lines(log_path)] == ["no_list", "no_list"]


def test_tunnel_cap_is_logged_as_its_own_reason(
    tmp_path: Path, settings: ep.Settings
) -> None:
    log_path = tmp_path / "egress.jsonl"
    proxy = ep.EgressProxy(
        settings,
        ep.EgressLog(str(log_path)),
        resolver=GLOBAL,
        connect=_never_connect,
        max_tunnels=1,
    )
    assert proxy._active.acquire(blocking=False)  # the one tunnel there is, in use
    assert _serve_one(proxy, CONNECT_NPM).startswith(b"HTTP/1.1 503")
    (line,) = _log_lines(log_path)
    assert line["decision"] == "refused"
    assert line["reason"] == "tunnel_cap"
    assert (line["host"], line["port"]) == ("registry.npmjs.org", 443)


def test_failed_upstream_connect_is_logged_as_unreachable(
    tmp_path: Path, settings: ep.Settings
) -> None:
    log_path = tmp_path / "egress.jsonl"

    def refused(*_args, **_kwargs):
        raise ConnectionRefusedError("connection refused")

    proxy = ep.EgressProxy(
        settings,
        ep.EgressLog(str(log_path)),
        resolver=GLOBAL,
        connect=refused,
        max_tunnels=1,
    )
    assert _serve_one(proxy, CONNECT_NPM).startswith(b"HTTP/1.1 502")
    (line,) = _log_lines(log_path)
    assert line["reason"] == "upstream_unreachable"
    assert (line["host"], line["port"]) == ("registry.npmjs.org", 443)
    assert proxy._active.acquire(blocking=False)  # the failure gave its slot back


def test_get_forwards_its_query_and_the_end_to_end_headers(
    tmp_path: Path, settings: ep.Settings
) -> None:
    log_path = tmp_path / "egress.jsonl"
    upstream, upstream_peer = _loopback_pair()
    dialled: list[tuple[str, int]] = []

    def connect(address, timeout=None):
        dialled.append(address)
        return upstream

    proxy = ep.EgressProxy(
        settings, ep.EgressLog(str(log_path)), resolver=GLOBAL, connect=connect
    )
    client, accepted = _loopback_pair()
    worker = threading.Thread(target=proxy.handle, args=(accepted,), daemon=True)
    worker.start()
    client.sendall(
        b"GET http://a.example.com/simple/pkg/?token=secret&x=1 HTTP/1.1\r\n"
        b"Host: other.example.org\r\n"
        b"User-Agent: pip/24.2\r\n"
        b"Accept: text/html\r\n"
        b"Connection: keep-alive, X-Hop\r\n"
        b"X-Hop: dropped\r\n"
        b"Keep-Alive: timeout=5\r\n"
        b"Proxy-Authorization: Basic\r\n"
        b" dXNlcjpwYXNz\r\n"
        b"Proxy-Connection: keep-alive\r\n"
        b"TE: trailers\r\n"
        b"Upgrade: h2c\r\n"
        b"X-Custom: kept\r\n"
        b"X-Folded: one\r\n"
        b"\ttwo\r\n"
        b"\r\n"
    )
    forwarded = _read_until(upstream_peer, b"\r\n\r\n").decode("latin-1")
    upstream_peer.sendall(
        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
    )
    upstream_peer.close()
    response = _read_all(client)
    worker.join(timeout=3)
    client.close()

    assert dialled == [("93.184.216.34", 80)]
    request_line, *fields = forwarded.split("\r\n\r\n")[0].split("\r\n")
    assert request_line == "GET /simple/pkg/?token=secret&x=1 HTTP/1.1"
    names = [f.split(":", 1)[0].strip().lower() for f in fields]
    assert fields.count("Host: a.example.com") == 1
    assert names.count("host") == 1
    assert fields.count("Connection: close") == 1
    assert names.count("connection") == 1
    for kept in ("User-Agent: pip/24.2", "Accept: text/html", "X-Custom: kept"):
        assert kept in fields
    assert "X-Folded: one two" in fields  # a folded value travels joined, on one line
    for dropped in ("x-hop", "keep-alive", "proxy-authorization", "proxy-connection"):
        assert dropped not in names
    assert "te" not in names
    assert "upgrade" not in names
    assert (
        "dXNlcjpwYXNz" not in forwarded
    )  # a folded line goes with the field it continues
    assert response.endswith(b"\r\n\r\nok")
    (line,) = _log_lines(log_path)
    assert line["reason"] == "allowed"
    assert line["path"] == "/simple/pkg/"
    assert "secret" not in json.dumps(line)


def test_connect_forwards_bytes_that_came_with_the_request(
    tmp_path: Path, settings: ep.Settings
) -> None:
    upstream, upstream_peer = _loopback_pair()
    proxy = ep.EgressProxy(
        settings,
        ep.EgressLog(str(tmp_path / "egress.jsonl")),
        resolver=GLOBAL,
        connect=lambda *_args, **_kwargs: upstream,
    )
    client, accepted = _loopback_pair()
    worker = threading.Thread(target=proxy.handle, args=(accepted,), daemon=True)
    worker.start()
    client.sendall(
        CONNECT_NPM + b"early-hello"
    )  # a client that doesn't wait for the 200
    assert _read_until(upstream_peer, b"early-hello").endswith(b"early-hello")
    assert _read_until(client, b"\r\n\r\n").startswith(b"HTTP/1.1 200")
    client.close()
    worker.join(timeout=3)
    upstream_peer.close()


def test_a_head_without_its_end_is_refused(
    tmp_path: Path, settings: ep.Settings
) -> None:
    # A head longer than the limit never ends where the proxy can see it, so nothing of it goes upstream.
    # The client never reads: the proxy closes with bytes unread, which may reset the connection.
    log_path = tmp_path / "egress.jsonl"
    proxy = ep.EgressProxy(
        settings,
        ep.EgressLog(str(log_path)),
        resolver=GLOBAL,
        connect=_never_connect,
    )
    client, accepted = _loopback_pair()
    client.sendall(b"GET http://a.example.com/ HTTP/1.1\r\nX-Pad: " + b"a" * 20000)
    proxy.handle(accepted)
    client.close()
    (line,) = _log_lines(log_path)
    assert line["decision"] == "refused"
    assert line["reason"] == "method"
