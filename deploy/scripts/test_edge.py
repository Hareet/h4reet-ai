"""deploy/edge/nginx.conf against plan §2 ("Edge"), contracts/gateway-http.md §1 and §6, contracts/operator-admin.md §1,
and contracts/telemetry.md §6.1, read with a small tokenizer of nginx's syntax."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import pytest

CONF = Path(__file__).resolve().parents[2] / "deploy" / "edge" / "nginx.conf"


@dataclass
class Directive:
    name: str
    args: list[str]
    block: list[Directive] | None = None
    children: list[Directive] = field(default_factory=list)

    def all(self, name: str) -> list[Directive]:
        return [d for d in (self.block or []) if d.name == name]

    def one(self, name: str) -> Directive:
        (found,) = self.all(name)
        return found

    def headers(self) -> dict[str, str]:
        return {d.args[0].lower(): d.args[1] for d in self.all("proxy_set_header")}


def tokens(text: str):
    i = 0
    while i < len(text):
        c = text[i]
        if c.isspace():
            i += 1
        elif c == "#":
            while i < len(text) and text[i] != "\n":
                i += 1
        elif c in "{};":
            yield c
            i += 1
        elif c in "'\"":
            quote, j, out = c, i + 1, []
            while text[j] != quote:
                if text[j] == "\\":
                    j += 1
                out.append(text[j])
                j += 1
            yield ("str", "".join(out))
            i = j + 1
        else:
            j = i
            while j < len(text) and not text[j].isspace() and text[j] not in "{};":
                j += 1
            yield ("str", text[i:j])
            i = j


def parse(text: str) -> list[Directive]:
    stack: list[list[Directive]] = [[]]
    words: list[str] = []
    for token in tokens(text):
        if token == ";":
            stack[-1].append(Directive(words[0], words[1:]))
            words = []
        elif token == "{":
            directive = Directive(words[0], words[1:], [])
            stack[-1].append(directive)
            stack.append(directive.block)
            words = []
        elif token == "}":
            assert not words, f"unterminated directive {words}"
            stack.pop()
        else:
            words.append(token[1])
    assert len(stack) == 1 and not words, "unbalanced braces"
    return stack[0]


TOP = Directive("main", [], parse(CONF.read_text(encoding="utf-8")))
HTTP = TOP.one("http")
SERVERS = {s.one("listen").args[0]: s for s in HTTP.all("server")}
UPSTREAMS = {
    "8080": "gateway:8080",
    "8081": "langfuse-web:3000",
    "8082": "grafana:3000",
    "8083": "gateway:8081",
    "8084": "otel-collector:4319",
}


def proxied(port: str) -> list[Directive]:
    return [loc for loc in SERVERS[port].all("location") if loc.all("proxy_pass")]


def test_the_listeners() -> None:
    assert sorted(SERVERS) == ["8080", "8081", "8082", "8083", "8084", "8090"]


@pytest.mark.parametrize("port", sorted(UPSTREAMS))
def test_each_listener_resolves_its_upstream_per_request(port: str) -> None:
    (location,) = proxied(port)
    assert location.one("set").args == ["$upstream", UPSTREAMS[port]]
    assert location.one("proxy_pass").args == ["http://$upstream"]
    headers = location.headers()
    assert headers["x-forwarded-for"] == "$remote_addr"


def test_docker_dns_per_request_and_nothing_written_outside_tmp() -> None:
    assert HTTP.one("resolver").args == ["127.0.0.11", "valid=10s", "ipv6=off"]
    assert TOP.one("pid").args == ["/tmp/nginx.pid"]
    for name in (
        "client_body_temp_path",
        "proxy_temp_path",
        "fastcgi_temp_path",
        "uwsgi_temp_path",
        "scgi_temp_path",
    ):
        assert HTTP.one(name).args[0].startswith("/tmp/"), name


@pytest.mark.parametrize("port", ["8080", "8083"])
def test_trace_context_and_forwarding_headers_are_edges_own(port: str) -> None:
    headers = proxied(port)[0].headers()
    for name in (
        "traceparent",
        "tracestate",
        "baggage",
        "forwarded",
        "x-real-ip",
        "x-forwarded-host",
    ):
        assert headers[name] == "", name
    assert headers["x-request-id"] == "$request_id"


@pytest.mark.parametrize(
    ("port", "limit"), [("8080", "16k"), ("8083", "4k"), ("8084", "1m")]
)
def test_body_limits(port: str, limit: str) -> None:
    assert SERVERS[port].one("client_max_body_size").args == [limit]


@pytest.mark.parametrize("port", ["8080", "8083"])
def test_timeouts_to_the_gateway(port: str) -> None:
    location = proxied(port)[0]
    assert location.one("proxy_connect_timeout").args == ["2s"]
    assert location.one("proxy_read_timeout").args == ["30s"]


def named(port: str, name: str) -> Directive:
    (found,) = [loc for loc in SERVERS[port].all("location") if loc.args == [name]]
    return found


def returned(location: Directive, request_id: str = "0" * 32) -> tuple[str, dict]:
    status, body = location.one("return").args
    return status, json.loads(body.replace("$request_id", request_id))


def test_the_api_unavailable_body_is_the_contracts() -> None:
    server = SERVERS["8080"]
    assert [d.args for d in server.all("error_page")] == [
        ["502", "504", "=", "@api_unavailable"],
        ["413", "=", "@body_too_large"],
    ]
    location = named("8080", "@api_unavailable")
    status, body = returned(location, "ab" * 16)
    assert status == "503"
    assert body == {
        "state": "degraded",
        "cause": "api_unavailable",
        "detail": "The gateway is not answering. The stack edge proxy answered instead.",
        "ceilings": None,
        "stack": None,
        "since": None,
        "request_id": "ab" * 16,
        "trace_id": None,
    }
    headers = {d.args[0]: d.args[1:] for d in location.all("add_header")}
    assert headers["X-H4-Degraded-Cause"] == ["api_unavailable", "always"]
    assert headers["Cache-Control"] == ["no-store", "always"]
    assert location.one("default_type").args == ["application/json"]
    assert returned(named("8080", "@body_too_large")) == (
        "413",
        {"error": "body_too_large", "limit_bytes": 16384},
    )


def test_the_admin_listeners_own_answers() -> None:
    assert returned(named("8083", "@admin_unavailable")) == (
        "503",
        {"error": "admin_unavailable"},
    )
    assert returned(named("8083", "@body_too_large")) == (
        "413",
        {"error": "body_too_large", "limit_bytes": 4096},
    )


def every(directive: Directive):
    for child in directive.block or []:
        yield child
        yield from every(child)


def test_the_gateways_own_errors_pass_through() -> None:
    """proxy_intercept_errors stays off (its default), so error_page only answers nginx's own errors."""
    assert [d.args for d in every(TOP) if d.name == "proxy_intercept_errors"] == []
    assert [
        d.args for d in every(TOP) if d.name == "error_page"
    ]  # the walk sees the blocks


def test_the_otlp_listener_forwards_only_post_v1_metrics() -> None:
    server = SERVERS["8084"]
    locations = {tuple(loc.args): loc for loc in server.all("location")}
    assert set(locations) == {("=", "/v1/metrics"), ("/",)}
    metrics = locations[("=", "/v1/metrics")]
    (guard,) = metrics.all("if")
    assert guard.args == ["($request_method", "!=", "POST)"]
    assert guard.one("return").args == ["404"]
    assert locations[("/",)].one("return").args == ["404"]
    assert not locations[("/",)].all("proxy_pass")


def test_the_health_check_listener() -> None:
    locations = {tuple(loc.args): loc for loc in SERVERS["8090"].all("location")}
    assert locations[("=", "/ping")].one("return").args[0] == "200"
    assert locations[("/",)].one("return").args == ["404"]
    assert SERVERS["8090"].one("access_log").args == ["off"]


def test_the_access_log_carries_no_payload_or_client_identity() -> None:
    (log_format,) = HTTP.all("log_format")
    name, fmt = log_format.args[0], " ".join(log_format.args[1:])
    assert name == "h4"
    for field_ in (
        "$request_method",
        "$uri",
        "$status",
        "$request_time",
        "$request_id",
    ):
        assert field_ in fmt, field_
    for forbidden in (
        "$remote_addr",
        "$http_",
        "$request_body",
        "$args",
        "$query_string",
        "$request_uri",
        "$request ",
    ):
        assert forbidden not in fmt + " ", forbidden
    assert HTTP.one("access_log").args == ["/dev/stdout", "h4"]
