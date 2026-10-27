"""The web image's nginx configuration (spec 002, T006; contracts/web-serving.md §1 and §3), read with test_edge.py's
tokenizer: the headers on every response, the cache rule, the access log's fields, and a read-only root."""

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
    (cache,) = HTTP.all("map")
    assert cache.args == ["$uri", "$h4_cache"]
    rules = {d.name: d.args[0] for d in cache.block}
    assert rules == {
        "~^/assets/": "public, max-age=31536000, immutable",
        "default": "no-cache",
    }


def test_no_cookie_and_nothing_but_get_and_head() -> None:
    assert not [
        d for d in every(TOP) if "cookie" in " ".join([d.name, *d.args]).lower()
    ]
    (site,) = [loc for loc in SERVER.all("location") if loc.args == ["/"]]
    (methods,) = site.all("limit_except")
    assert methods.args == ["GET"]
    assert [(d.name, d.args) for d in methods.block] == [("deny", ["all"])]


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
