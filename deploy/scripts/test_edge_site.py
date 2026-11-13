"""The stack's x005 listener, the room's site (spec 002, T002; contracts/web-serving.md §2; room-events.md §2).

deploy/edge/nginx.conf's listener 8087, read with test_edge.py's tokenizer of nginx's syntax, and its publication
in deploy/compose.yaml: the room's static files from the web service (GET and HEAD only), the usage-event beacon to
the gateway (POST only, rate-limited per stack, 512 bytes), the rest of /api/ answered 404 until the conversation
exists, and a page of edge's own when web doesn't answer.
"""

from __future__ import annotations

import importlib.util
import json
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


def test_the_site_listener_has_exactly_its_locations() -> None:
    # Spec 007 adds the twin's turn and its two answers of edge's own (its plan §2).
    assert sorted(tuple(loc.args) for loc in SITE.all("location")) == [
        ("/",),
        ("/api/",),
        ("=", "/api/room/events"),
        ("=", "/api/room/turn"),
        ("@site_unavailable",),
        ("@turn_too_large",),
        ("@turn_unavailable",),
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


def every(directive):
    for child in directive.block or []:
        yield child
        yield from every(child)


def test_the_site_passes_accept_encoding_to_web_and_content_encoding_back() -> None:
    # Spec 004 (T215; contracts/serving.md §4): web sends each GLB as its gzip-9 copy, the bytes the caps count, and
    # inflates it only for a client that takes no gzip. So x005's site location passes the client's Accept-Encoding to
    # web, setting none of its own, and passes web's Content-Encoding back, hiding none: at any level it inherits from.
    for level in (HTTP, SITE, location("/")):
        assert "accept-encoding" not in level.headers(), level.name
        hidden = [d.args[0].lower() for d in level.all("proxy_hide_header")]
        assert "content-encoding" not in hidden, level.name


def test_edge_neither_compresses_nor_inflates() -> None:
    # No gzip, gzip_static, or gunzip directive in any block of edge's configuration, so a GLB leaves edge as web sent
    # it, which edge streams with proxy_buffering off (contracts/serving.md §4 and §7).
    names = {d.name for d in every(edge.TOP)}
    assert not names & {"gzip", "gzip_static", "gunzip"}
    assert HTTP.one("proxy_buffering").args == ["off"]


def test_the_site_asks_web_over_http_1_1() -> None:
    # The review's Nit 1 on feat/004-us4-studio: web sends the gzip copy only to an HTTP/1.1 request, since nginx's
    # gzip_http_version defaults to 1.1, and nginx proxies over HTTP/1.0 unless told otherwise. So SC-006's "100% of GLB
    # responses carry Content-Encoding: gzip" rests on edge's proxy_http_version 1.1, which the site's levels inherit.
    assert HTTP.one("proxy_http_version").args == ["1.1"]
    for level in (SITE, location("/")):
        assert level.all("proxy_http_version") == [], level.name


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
    # The site's own headers, as the web image sends them (contracts/web-serving.md §3), on edge's page too.
    assert headers["Referrer-Policy"] == ["no-referrer", "always"]
    assert headers["Permissions-Policy"] == [
        "microphone=(), camera=(), geolocation=()",
        "always",
    ]


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


def test_events_reach_the_gateway_only_through_the_sites_limited_location() -> None:
    # x000 forwards everything else to the gateway, with neither the events' rate limit nor their 512-byte cap, so it
    # answers the room's routes itself, as the gateway answers an unknown route (room-events.md §2; review, item 1).
    api = edge.SERVERS["8080"]
    assert not [loc for loc in api.all("location") if loc.args[0] in ("~", "~*")]
    (room,) = [loc for loc in api.all("location") if loc.args == ["/room/"]]
    assert not room.all("proxy_pass")
    status, body = room.one("return").args
    assert status == "404"
    assert json.loads(body.replace("$request_id", "ab" * 16)) == {
        "error": "not_found",
        "request_id": "ab" * 16,
    }
    assert room.one("default_type").args == ["application/json"]
    headers = {d.args[0]: d.args[1:] for d in room.all("add_header")}
    assert headers["Cache-Control"] == ["no-store", "always"]
    assert headers["X-Content-Type-Options"] == ["nosniff", "always"]
    assert headers["X-Request-Id"] == ["$request_id", "always"]
    # With no regex location, nginx's longest matching prefix wins: /room/events, and every spelling nginx normalizes
    # to it (//room/events, /room/./events, /room/%65vents), lands in /room/, never in the proxied /.
    prefixes = [
        loc.args[0] for loc in api.all("location") if not loc.args[0].startswith("@")
    ]
    assert (
        max((p for p in prefixes if "/room/events".startswith(p)), key=len) == "/room/"
    )


def test_the_events_limit_is_one_zone_per_stack() -> None:
    # Every visitor's address on the local tier is the loopback, so the zone is keyed by the listener: one per stack.
    zones = [d.args for d in HTTP.all("limit_req_zone")]
    assert zones == [
        ["$server_port", "zone=room_events:1m", "rate=10r/s"],
        ["$server_port", "zone=room_turn:1m", "rate=1r/s"],
        # Spec 001's health block, 8088, for Route 53's checkers (deploy/edge/test_tunnel_blocks.py).
        ["$server_port", "zone=health_block:1m", "rate=10r/s"],
    ]
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


# --- Spec 007's turn (its FR-001, FR-028; plan §2; spec 002's T069) ---


def test_the_turn_goes_to_the_gateway_post_only_capped_and_limited() -> None:
    turn = location("=", "/api/room/turn")
    assert turn.one("set").args == ["$upstream", "gateway:8080"]
    assert turn.one("proxy_pass").args == ["http://$upstream/room/turn"]
    (methods,) = turn.all("limit_except")
    assert methods.args == ["POST"]
    assert [(d.name, d.args) for d in methods.block] == [("deny", ["all"])]
    assert turn.one("client_max_body_size").args == ["32k"]
    assert turn.one("limit_req").args == ["zone=room_turn", "burst=5", "nodelay"]
    headers = turn.headers()
    assert headers["x-forwarded-for"] == "$remote_addr"
    for name in (
        "traceparent",
        "tracestate",
        "baggage",
        "forwarded",
        "x-real-ip",
        "x-forwarded-host",
        "x-forwarded-proto",
    ):
        assert headers[name] == "", name
    assert headers["x-request-id"] == "$request_id"
    # Above the gateway's 20-second deadline, and below the room's 35-second timeout.
    assert turn.one("proxy_read_timeout").args == ["30s"]
    pages = {tuple(d.args[:-1]): d.args[-1] for d in turn.all("error_page")}
    assert pages == {
        ("502", "504", "="): "@turn_unavailable",
        ("413", "="): "@turn_too_large",
    }


def test_a_stopped_gateway_is_a_degraded_turn_the_room_reads_as_unavailable() -> None:
    page = location("@turn_unavailable")
    assert page.one("default_type").args == ["application/json"]
    headers = {d.args[0]: d.args[1:] for d in page.all("add_header")}
    assert headers["X-H4-Degraded-Cause"] == ["api_unavailable", "always"]
    assert headers["Cache-Control"] == ["no-store", "always"]
    status, body = page.one("return").args
    assert status == "503"
    parsed = json.loads(body.replace("$request_id", "ab" * 16))
    assert (parsed["state"], parsed["cause"]) == ("degraded", "api_unavailable")
    # x000's own answer, word for word, so both doors say the same (gateway-http.md §6).
    (x000,) = [
        loc
        for loc in edge.SERVERS["8080"].all("location")
        if loc.args == ["@api_unavailable"]
    ]
    assert body == x000.one("return").args[1]


def test_a_body_over_32_kib_is_a_json_413() -> None:
    page = location("@turn_too_large")
    status, body = page.one("return").args
    assert status == "413"
    assert json.loads(body) == {"error": "body_too_large", "limit_bytes": 32768}
    assert page.one("default_type").args == ["application/json"]


def test_the_turn_reaches_the_gateway_only_through_the_sites_location() -> None:
    # x000 answers /room/turn itself with 404, as it answers /room/events.
    api = edge.SERVERS["8080"]
    prefixes = [
        loc.args[0] for loc in api.all("location") if not loc.args[0].startswith("@")
    ]
    assert max((p for p in prefixes if "/room/turn".startswith(p)), key=len) == "/room/"
    # The site has no regex location, so an exact match on the normalized URI is the only way in: nginx merges
    # slashes, resolves dot segments, and decodes before it matches, so every such spelling lands in it.
    assert not [loc for loc in SITE.all("location") if loc.args[0] in ("~", "~*")]
    assert [d.args for d in HTTP.all("merge_slashes")] in ([], [["on"]])


def test_the_sites_gateway_locations_send_no_client_label_of_the_visitors() -> None:
    # The review of T066 (I5): the gateway keys a client by its address and X-H4-Client's label, so a visitor's own
    # label would buy fresh per-client buckets and put the visitor's string on prod's ledger: x005 sends none.
    for path in ("/api/room/turn", "/api/room/events"):
        assert location("=", path).headers().get("x-h4-client") == "", path
