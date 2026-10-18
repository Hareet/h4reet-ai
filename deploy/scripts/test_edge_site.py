"""The stack's x005 listener, the room's site (spec 002, T002; contracts/web-serving.md §2; room-events.md §2).

deploy/edge/nginx.conf's listener 8087, read with test_edge.py's tokenizer of nginx's syntax, and its publication
in deploy/compose.yaml: the room's static files from the web service (GET and HEAD only), the usage-event beacon to
the gateway (POST only, rate-limited per stack, 512 bytes), the rest of /api/ answered 404 until the conversation
exists, and a page of edge's own when web doesn't answer.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "test_edge_conf", REPO / "deploy" / "scripts" / "test_edge.py"
)
assert SPEC and SPEC.loader
edge = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = edge
SPEC.loader.exec_module(edge)

COMPOSE = yaml.safe_load((REPO / "deploy/compose.yaml").read_text(encoding="utf-8"))
HTTP = edge.HTTP
SITE = edge.SERVERS["8087"]
UNAVAILABLE = "The room is unavailable right now."


def location(*args: str):
    (found,) = [loc for loc in SITE.all("location") if loc.args == list(args)]
    return found


def test_the_site_listener_has_exactly_its_four_locations() -> None:
    assert sorted(tuple(loc.args) for loc in SITE.all("location")) == [
        ("/",),
        ("/api/",),
        ("=", "/api/room/events"),
        ("@site_unavailable",),
    ]


def test_the_site_is_the_web_service_get_and_head_only() -> None:
    site = location("/")
    assert site.one("set").args == ["$upstream", "web:8080"]
    assert site.one("proxy_pass").args == ["http://$upstream"]
    # limit_except GET allows GET and HEAD, and refuses every other method.
    (methods,) = site.all("limit_except")
    assert methods.args == ["GET"]
    assert [d.args for d in methods.block] == [["all"]]
    assert [d.name for d in methods.block] == ["deny"]
    headers = site.headers()
    assert headers["x-forwarded-for"] == "$remote_addr"
    for name in ("forwarded", "x-real-ip", "x-forwarded-host", "x-forwarded-proto"):
        assert headers[name] == "", name
    assert headers["x-request-id"] == "$request_id"


def test_no_cookie_ever_leaves_the_site() -> None:
    # web sets none (contracts/web-serving.md §3); edge drops one if it ever did.
    assert location("/").one("proxy_hide_header").args == ["Set-Cookie"]


def test_web_unreachable_is_edges_own_503_page() -> None:
    site = location("/")
    assert [d.args for d in site.all("error_page")] == [
        ["502", "504", "=", "@site_unavailable"]
    ]
    page = location("@site_unavailable")
    assert page.one("default_type").args == ["text/html"]
    status, body = page.one("return").args
    assert status == "503"
    assert UNAVAILABLE in body and body.lstrip().lower().startswith("<!doctype html>")
    headers = {d.args[0]: d.args[1:] for d in page.all("add_header")}
    assert headers["Cache-Control"] == ["no-store", "always"]
    assert headers["X-Content-Type-Options"] == ["nosniff", "always"]
    assert headers["Content-Security-Policy"][0].startswith("default-src 'none'")


def test_the_events_beacon_goes_to_the_gateway_post_only_capped_and_limited() -> None:
    events = location("=", "/api/room/events")
    assert events.one("set").args == ["$upstream", "gateway:8080"]
    assert events.one("proxy_pass").args == ["http://$upstream/room/events"]
    (methods,) = events.all("limit_except")
    assert methods.args == ["POST"]
    assert [(d.name, d.args) for d in methods.block] == [("deny", ["all"])]
    assert events.one("client_max_body_size").args == ["512"]
    assert events.one("limit_req").args == ["zone=room_events", "burst=20", "nodelay"]
    headers = events.headers()
    for name in ("traceparent", "tracestate", "baggage", "forwarded", "x-real-ip"):
        assert headers[name] == "", name
    assert headers["x-request-id"] == "$request_id"
    assert events.one("proxy_read_timeout").args == ["10s"]


def test_the_events_limit_is_one_zone_per_stack() -> None:
    # Every visitor's address on the local tier is the loopback, so the zone is keyed by the listener: one per stack.
    zones = [d.args for d in HTTP.all("limit_req_zone")]
    assert zones == [["$server_port", "zone=room_events:1m", "rate=10r/s"]]
    assert HTTP.one("limit_req_status").args == ["429"]


def test_the_rest_of_api_is_404_until_the_conversation_exists() -> None:
    api = location("/api/")
    assert api.one("return").args == ["404"]
    assert not api.all("proxy_pass")


def test_the_site_listener_takes_small_bodies_only() -> None:
    assert SITE.one("client_max_body_size").args == ["1k"]


def test_compose_publishes_it_on_the_loopback_as_x005() -> None:
    ports = COMPOSE["services"]["edge"]["ports"]
    assert ports[-1] == "127.0.0.1:${H4_SITE_PORT}:8087"
    assert [p for p in ports if p.endswith(":8087")] == [ports[-1]]
    assert all(p.startswith("127.0.0.1:") for p in ports)
