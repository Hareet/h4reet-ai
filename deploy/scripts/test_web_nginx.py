"""The web image's nginx configuration (spec 002, T006; contracts/web-serving.md §1 and §3), read with test_edge.py's
tokenizer: the headers on every response, the cache rule, the access log's fields, and a read-only root.

Spec 004's T214 (FR-079; Amendment B14; R-45; its contracts/serving.md §2.1 and §8): the content-addressed files at
/a/, every GLB as its build-time gzip-9 copy. The cache map gains one rule and the server one location, exactly as
§2.1 gives them; nothing is compressed per request, and nothing below the server adds a header. The location takes
gzip_proxied any, so a request through a proxy that adds Via gets the copy too (the Author's decision of 2026-11-07)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "test_edge_tokenizer", REPO / "deploy" / "scripts" / "test_edge.py"
)
assert SPEC and SPEC.loader
edge = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = edge
SPEC.loader.exec_module(edge)

CONF = REPO / "apps" / "web" / "nginx.conf"
TOP = edge.Directive("main", [], edge.parse(CONF.read_text(encoding="utf-8")))
HTTP = TOP.one("http")
(SERVER,) = HTTP.all("server")

# contracts/web-serving.md §3, as written there. The microphone stays () until push-to-talk's group builds capture.
CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; "
    "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)
HEADERS = {
    "Content-Security-Policy": CSP,
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "microphone=(), camera=(), geolocation=()",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "$h4_cache",
}


def every(directive):
    for child in directive.block or []:
        yield child
        yield from every(child)


def test_it_listens_on_8080_and_serves_the_built_site() -> None:
    assert SERVER.one("listen").args == ["8080"]
    assert SERVER.one("root").args == ["/usr/share/nginx/html"]
    assert HTTP.one("server_tokens").args == ["off"]


def test_every_response_carries_the_contracts_headers() -> None:
    added = {d.args[0]: d.args[1:] for d in SERVER.all("add_header")}
    assert added == {name: [value, "always"] for name, value in HEADERS.items()}
    # add_header in a nested block would replace these there: none may, so every response gets them.
    nested = [
        d
        for d in every(SERVER)
        if d.name == "add_header" and d not in SERVER.all("add_header")
    ]
    assert nested == []
    assert [
        d
        for d in every(TOP)
        if d.name == "add_header" and d not in SERVER.all("add_header")
    ] == []


def test_hashed_assets_are_immutable_and_everything_else_is_revalidated() -> None:
    # Vite's hashed assets and spec 003's content-addressed files under /a/ never change under their name (spec 004,
    # contracts/serving.md §2.1): exactly three rules, in this order.
    (cache,) = HTTP.all("map")
    assert cache.args == ["$uri", "$h4_cache"]
    rules = [(d.name, d.args) for d in cache.block]
    assert rules == [
        ("~^/assets/", ["public, max-age=31536000, immutable"]),
        ("~^/a/", ["public, max-age=31536000, immutable"]),
        ("default", ["no-cache"]),
    ]


def location(*args: str) -> edge.Directive:
    (found,) = [loc for loc in SERVER.all("location") if loc.args == list(args)]
    return found


def test_the_server_has_exactly_its_four_locations() -> None:
    # Spec 004 adds one, /a/ (contracts/serving.md §2.1: "gains one cache rule and one location; nothing else changes").
    assert sorted(tuple(loc.args) for loc in SERVER.all("location")) == [
        ("/",),
        ("=", "/healthz"),
        ("^~", "/a/"),
        ("~", r"\.pdf\.txt$"),
    ]


def test_no_cookie_and_nothing_but_get_and_head() -> None:
    assert not [
        d for d in every(TOP) if "cookie" in " ".join([d.name, *d.args]).lower()
    ]
    # limit_except GET allows GET and HEAD, and refuses every other method: on the site, and on /a/.
    for site in (location("/"), location("^~", "/a/")):
        (methods,) = site.all("limit_except")
        assert methods.args == ["GET"], site.args
        assert [(d.name, d.args) for d in methods.block] == [("deny", ["all"])]


# --------------------------------------------------------------------------------------------------
# Spec 004's /a/: each GLB as its build-time gzip-9 copy (contracts/serving.md §2.1 and §2.2)
# --------------------------------------------------------------------------------------------------
def directives(block: list[edge.Directive]) -> list[tuple]:
    """A block's directives in order, each (name, args), with a nested block's own directives after its args."""
    return [
        (d.name, d.args) if d.block is None else (d.name, d.args, directives(d.block))
        for d in block
    ]


def test_a_holds_exactly_the_contracts_directives() -> None:
    # gzip_static always serves <file>.gz for <file>, with Content-Encoding: gzip, whatever the client's Accept-Encoding,
    # and needs no plain file on disk; gunzip inflates it for a client that takes no gzip; gzip_proxied any lets a
    # request with Via take the copy; gzip_vary adds Vary. A types block in a location replaces the inherited map
    # there, so every extension /a/ serves is listed. The .gz URL answers 404: the copy has one public name, the .glb
    # one.
    assert directives(location("^~", "/a/").block) == [
        ("limit_except", ["GET"], [("deny", ["all"])]),
        (
            "types",
            [],
            [
                ("model/gltf-binary", ["glb"]),
                ("image/png", ["png"]),
                ("image/jpeg", ["jpg", "jpeg"]),
                ("image/webp", ["webp"]),
            ],
        ),
        ("default_type", ["application/octet-stream"]),
        ("gzip_static", ["always"]),
        ("gunzip", ["on"]),
        ("gzip_proxied", ["any"]),
        ("gzip_vary", ["on"]),
        ("location", ["~", r"\.gz$"], [("return", ["404"])]),
    ]


def test_a_sends_the_copy_to_a_request_through_a_proxy() -> None:
    # nginx's ngx_http_gzip_ok refuses gzip to a request that carries Via while gzip_proxied is off, its default, and
    # edge passes a client's Via through, so gunzip would inflate every GLB for a visitor behind a proxy that adds one.
    # The Author's answer of 2026-11-07: "go ahead with ... compression behind proxy" (contracts/serving.md §2.1). With
    # any, a request that carries Via takes the copy exactly when the same request without Via would.
    assert location("^~", "/a/").one("gzip_proxied").args == ["any"]


def test_a_has_no_fallback_and_adds_no_header() -> None:
    # Only the .gz copy exists on disk, so nothing under /a/ falls back to another file; an add_header there would
    # replace the server's security headers in it (Content-Encoding comes from gzip_static, Vary from gzip_vary, and
    # Cache-Control from the map).
    names = {d.name for d in every(location("^~", "/a/"))}
    assert "try_files" not in names
    assert "add_header" not in names


def test_nothing_is_compressed_per_request() -> None:
    # B14: the image "compresses no GLB per request", which would cost its 0.1 CPU and send bytes the caps don't
    # measure. No directive named gzip in any block; gzip_static, gunzip, gzip_proxied, and gzip_vary only where /a/
    # holds them.
    assert [d for d in every(TOP) if d.name == "gzip"] == []
    a = location("^~", "/a/")
    for name in ("gzip_static", "gunzip", "gzip_proxied", "gzip_vary"):
        assert [d for d in every(TOP) if d.name == name] == a.all(name), name


def test_the_a_location_carries_its_comment() -> None:
    # The block's comment, as contracts/serving.md §2.1 writes it, so a reader of the file sees why it holds no
    # add_header and no gzip.
    text = CONF.read_text(encoding="utf-8")
    comment = (
        "    # Spec 003's content-addressed files (spec 004, contracts/serving.md): every GLB as its build-time gzip-9 "
        "copy,\n"
        "    # never compressed per request, inflated only for a client that takes no gzip. No add_header here, so the\n"
        "    # server's headers stay on every response.\n"
        "    location ^~ /a/ {\n"
    )
    assert comment in text


def test_the_log_holds_method_path_status_and_duration_only() -> None:
    (log_format,) = HTTP.all("log_format")
    name, fmt = log_format.args[0], " ".join(log_format.args[1:])
    assert name == "h4web"
    assert fmt == "$time_iso8601 $request_method $uri $status $request_time"
    assert HTTP.one("access_log").args == ["/dev/stdout", "h4web"]


def test_nothing_is_written_outside_tmp() -> None:
    assert TOP.one("pid").args == ["/tmp/nginx.pid"]
    for name in (
        "client_body_temp_path",
        "proxy_temp_path",
        "fastcgi_temp_path",
        "uwsgi_temp_path",
        "scgi_temp_path",
    ):
        assert HTTP.one(name).args[0].startswith("/tmp/"), name


def test_the_health_check_is_a_static_file_without_a_log_line() -> None:
    (health,) = [loc for loc in SERVER.all("location") if loc.args == ["=", "/healthz"]]
    assert health.one("access_log").args == ["off"]
    assert not health.all("return")  # the file itself, which the Dockerfile writes
    assert "/healthz" in (REPO / "apps/web/Dockerfile").read_text(encoding="utf-8")


def test_the_pdfs_text_file_is_never_served() -> None:
    # The image leaves dist/resume.pdf.txt out (test_web_image.py); a 404 for any *.pdf.txt is the second layer.
    (text,) = [
        loc for loc in SERVER.all("location") if loc.args == ["~", r"\.pdf\.txt$"]
    ]
    assert [(d.name, d.args) for d in text.block] == [("return", ["404"])]
