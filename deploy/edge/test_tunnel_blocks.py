"""The hosts' three blocks on `edge` (spec 001 tasks.md T042; FR-053, FR-054; contracts/tunnel.md §4; research.md
R-12), read from deploy/edge/nginx.conf with spec 000's tokenizer (deploy/scripts/test_edge.py), and the entrypoint
that writes the blocks' token maps.

  - 8085, the relay block: POST /hello, /room/turn, and /room/events, and GET /health, each behind the relay's bearer
    token for this host, 401 otherwise, logged by the stack's log format, which holds no address; it moves X-H4-Viewer
    into the one X-Forwarded-For it sends on, and keeps traceparent;
  - 8086, the telemetry block: POST /v1/traces, /v1/metrics, and /v1/logs to the collector, behind its own token;
  - 8088, the health block: GET /health only, no token, an empty body, 200 or 503 as the gateway's
    GET /health/serving says, rate-limited to 10 a second. The contract's 8087 is the tunnel end's public port; on
    edge, 8087 is spec 002's site, x005, so the block listens on 8088 and the tunnel's -R 2203 leads there;
  - every other path on the three gets 404, and compose publishes none of them.

The entrypoint, deploy/edge/entrypoint.sh, writes /tmp/h4-blocks/tokens.conf from the two tokens in edge's
environment, each a map whose only match is "Bearer <token>", exactly, case and all: a regular expression, since nginx
matches a map's plain strings without case, and hashes them in buckets a long token overflows (group 5's review, its
nit and I2's nginx -t, deploy/edge/test_edge_on_engine.py); with no token, nothing matches. A token outside its shape
stops edge, naming the key and never the value. Test tokens are built at run time.
"""

from __future__ import annotations

import importlib.util
import os
import re
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
ENTRYPOINT = HERE / "entrypoint.sh"
COMPOSE = REPO / "deploy" / "compose.yaml"
TOKENS_FILE = "/tmp/h4-blocks/tokens.conf"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


edge = _load("edge_conf_reader", REPO / "deploy" / "scripts" / "test_edge.py")
HTTP = edge.HTTP
SERVERS = edge.SERVERS


def locations(port: str) -> dict[str, object]:
    return {" ".join(loc.args): loc for loc in SERVERS[port].all("location")}


def guarded(loc, variable: str) -> bool:
    """The location's first directive refuses with 401 unless the token's map matched."""
    first = (loc.block or [None])[0]
    return (
        first is not None
        and first.name == "if"
        and first.args == ["(" + variable, "!=", "1)"]
        and [(d.name, d.args) for d in first.block] == [("return", ["401", ""])]
    )


def methods(loc) -> list[str]:
    (only,) = loc.all("limit_except")
    assert [(d.name, d.args) for d in only.block] == [("deny", ["all"])]
    return only.args


# ----------------------------------------------------------------------------------------------------------------------
# 8085, the relay block.

RELAY_ROUTES = {
    "= /hello": ("POST", "http://$upstream/hello", "16k"),
    "= /room/turn": ("POST", "http://$upstream/room/turn", "32k"),
    "= /room/events": ("POST", "http://$upstream/room/events", "512"),
    "= /health": ("GET", "http://$upstream/health/serving", None),
}


def test_the_three_blocks_listen_and_nothing_publishes_them() -> None:
    for port in ("8085", "8086", "8088"):
        assert port in SERVERS, port
    ports = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]["edge"][
        "ports"
    ]
    published = {str(p).rsplit(":", 1)[-1] for p in ports}
    assert published.isdisjoint({"8085", "8086", "8088"})


def test_the_token_maps_come_from_the_entrypoints_file() -> None:
    assert [d.args for d in HTTP.all("include")] == [[TOKENS_FILE]]


def test_the_relay_block_takes_its_four_routes_behind_its_token() -> None:
    locs = locations("8085")
    assert set(locs) == set(RELAY_ROUTES) | {"/", "@relay_health_down"}
    for path, (method, upstream, cap) in RELAY_ROUTES.items():
        loc = locs[path]
        assert guarded(loc, "$h4_relay_authorized"), path
        assert methods(loc) == [method], path
        assert loc.one("set").args == ["$upstream", "gateway:8080"], path
        assert loc.one("proxy_pass").args == [upstream], path
        if cap is not None:
            assert loc.one("client_max_body_size").args == [cap], path
    assert [(d.name, d.args) for d in locs["/"].block] == [("return", ["404"])]


def test_the_relay_block_moves_the_viewer_into_the_one_forwarded_for_and_keeps_the_trace() -> (
    None
):
    for path in RELAY_ROUTES:
        headers = locations("8085")[path].headers()
        assert headers["x-forwarded-for"] == "$http_x_h4_viewer", path
        assert headers["x-h4-viewer"] == "", path
        assert headers["authorization"] == "", path
        for name in ("x-real-ip", "forwarded", "x-forwarded-host", "x-forwarded-proto"):
            assert headers[name] == "", (path, name)
        for name in ("traceparent", "tracestate"):
            assert name not in headers, (path, name)
        assert headers["x-request-id"] == "$request_id", path


def test_the_blocks_log_with_the_stacks_format_which_holds_no_address() -> None:
    (fmt,) = HTTP.all("log_format")
    text = " ".join(fmt.args)
    for variable in (
        "$remote_addr",
        "$http_x_h4_viewer",
        "$http_x_forwarded_for",
        "$http_authorization",
    ):
        assert variable not in text
    for port in ("8085", "8086"):
        assert SERVERS[port].all("access_log") == [], port


def test_the_relay_blocks_health_answers_503_with_no_body_when_the_gateway_is_down() -> (
    None
):
    loc = locations("8085")["= /health"]
    assert loc.one("error_page").args == ["502", "504", "=503", "@relay_health_down"]
    down = locations("8085").get("@relay_health_down") or {
        " ".join(x.args): x for x in SERVERS["8085"].all("location")
    }.get("@relay_health_down")
    assert down is not None
    assert [(d.name, d.args) for d in down.block] == [("return", ["503", ""])]


# ----------------------------------------------------------------------------------------------------------------------
# 8086, the telemetry block.


def test_the_telemetry_block_takes_otlp_behind_its_own_token() -> None:
    locs = locations("8086")
    assert set(locs) == {"~ ^/v1/(traces|metrics|logs)$", "/"}
    loc = locs["~ ^/v1/(traces|metrics|logs)$"]
    assert guarded(loc, "$h4_telemetry_authorized")
    assert methods(loc) == ["POST"]
    assert loc.one("set").args == ["$upstream", "otel-collector:4318"]
    assert loc.one("proxy_pass").args == ["http://$upstream"]
    assert loc.headers()["authorization"] == ""
    assert [(d.name, d.args) for d in locs["/"].block] == [("return", ["404"])]


def test_the_two_tokens_have_their_own_maps() -> None:
    # Each block reads its own variable, so one host's relay token never opens the telemetry block, or the reverse.
    assert not guarded(
        locations("8086")["~ ^/v1/(traces|metrics|logs)$"], "$h4_relay_authorized"
    )
    assert not guarded(locations("8085")["= /hello"], "$h4_telemetry_authorized")


# ----------------------------------------------------------------------------------------------------------------------
# 8088, the health block.


def test_the_health_block_answers_get_health_only_unauthenticated_and_rate_limited() -> (
    None
):
    locs = locations("8088")
    assert set(locs) == {"= /health", "/", "@health_down"}
    loc = locs["= /health"]
    assert not loc.all("if")
    assert methods(loc) == ["GET"]
    assert loc.one("limit_req").args == ["zone=health_block", "burst=10", "nodelay"]
    assert loc.one("proxy_pass").args == ["http://$upstream/health/serving"]
    assert loc.one("set").args == ["$upstream", "gateway:8080"]
    assert loc.one("proxy_pass_request_body").args == ["off"]
    assert loc.one("error_page").args == ["502", "504", "=503", "@health_down"]
    assert [(d.name, d.args) for d in locs["@health_down"].block] == [
        ("return", ["503", ""])
    ]
    assert [(d.name, d.args) for d in locs["/"].block] == [("return", ["404"])]
    zones = [d.args for d in HTTP.all("limit_req_zone")]
    assert ["$server_port", "zone=health_block:1m", "rate=10r/s"] in zones


# ----------------------------------------------------------------------------------------------------------------------
# The entrypoint and compose.


def run_entrypoint(
    tmp_path: Path, **env: str
) -> tuple[subprocess.CompletedProcess, Path]:
    out = tmp_path / "blocks" / "tokens.conf"
    sh = shutil.which("sh")
    assert sh is not None
    done = subprocess.run(
        [sh, str(ENTRYPOINT), "true"],
        env={
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "H4_EDGE_TOKENS_FILE": str(out),
            **env,
        },
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    return done, out


def token() -> str:
    return secrets.token_urlsafe(32)


def test_the_entrypoint_writes_a_map_per_token(tmp_path: Path) -> None:
    relay, telemetry = token(), token()
    done, out = run_entrypoint(
        tmp_path, RELAY_TOKEN_SELF=relay, TELEMETRY_BLOCK_TOKEN=telemetry
    )
    assert done.returncode == 0, done.stderr
    text = out.read_text(encoding="utf-8")
    assert text == (
        "map $http_authorization $h4_relay_authorized {\n"
        "  default 0;\n"
        f'  "~^Bearer {relay}$" 1;\n'
        "}\n"
        "map $http_authorization $h4_telemetry_authorized {\n"
        "  default 0;\n"
        f'  "~^Bearer {telemetry}$" 1;\n'
        "}\n"
    )
    assert out.stat().st_mode & 0o077 == 0
    assert relay not in done.stdout + done.stderr


def test_with_no_token_nothing_matches(tmp_path: Path) -> None:
    done, out = run_entrypoint(tmp_path)
    assert done.returncode == 0, done.stderr
    assert "Bearer" not in out.read_text(encoding="utf-8")
    assert out.read_text(encoding="utf-8").count("default 0;") == 2


@pytest.mark.parametrize(
    "bad",
    [
        "short",
        "has space " + "x" * 40,
        'quote"' + "x" * 40,
        "semi;" + "x" * 40,
        "x" * 129,
        "{" + "x" * 40,
    ],
)
def test_a_token_outside_its_shape_stops_edge_naming_the_key_only(
    tmp_path: Path, bad: str
) -> None:
    done, out = run_entrypoint(tmp_path, RELAY_TOKEN_SELF=bad)
    assert done.returncode == 78
    assert "RELAY_TOKEN_SELF" in done.stderr
    assert bad not in done.stderr + done.stdout
    assert not out.exists()


def test_edge_runs_the_entrypoint_with_the_two_tokens_and_nothing_else_new() -> None:
    service = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]["edge"]
    assert service["entrypoint"] == ["/bin/sh", "/etc/nginx/h4-entrypoint.sh"]
    assert service["command"] == ["nginx", "-g", "daemon off;"]
    assert service["environment"] == {
        "RELAY_TOKEN_SELF": "${RELAY_TOKEN_SELF:-}",
        "TELEMETRY_BLOCK_TOKEN": "${TELEMETRY_BLOCK_TOKEN:-}",
    }
    binds = {v["target"]: v for v in service["volumes"]}
    assert binds["/etc/nginx/h4-entrypoint.sh"]["source"].endswith(
        "/deploy/edge/entrypoint.sh"
    )
    assert binds["/etc/nginx/h4-entrypoint.sh"]["read_only"] is True


def test_the_entrypoint_drops_the_tokens_from_nginxs_environment() -> None:
    text = ENTRYPOINT.read_text(encoding="utf-8")
    assert re.search(
        r"^unset RELAY_TOKEN_SELF TELEMETRY_BLOCK_TOKEN$", text, re.MULTILINE
    )
