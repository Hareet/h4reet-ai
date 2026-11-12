"""Tests for tools/gates/disclosure_check.py (spec 001 plan §8.3; FR-040; tasks.md T004): a change that adds an outward
kind of thing needs its row in docs/data-flow-disclosure.md. The kinds: a compose service on the egress network, an
sshd permit, an egress-proxy host, a CloudFront origin, an EventBridge API destination, and a security-group rule open
to an outside range."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "disclosure_check", REPO / "tools" / "gates" / "disclosure_check.py"
)
assert SPEC and SPEC.loader
dc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = dc
SPEC.loader.exec_module(dc)

HEADER = (
    "# Data-flow disclosure\n\n"
    "| ID | From → To | Trigger | Carries | Never carries | Why | Default | How to switch it off | FR |\n"
    "|---|---|---|---|---|---|---|---|---|\n"
)
ROWS = {
    "S2": "| S2 | `gateway` → the internet, through `egress` | x | x | x | x | on | x | FR-040 |\n",
    "S16": (
        "| S16 | `tunnel-end` → nothing beyond the listed forwards: listens `2201`, `2202`, and `2203`; opens"
        " `snapshot-sink:8080` and `db.internal:5432` | x | x | x | x | on | x | FR-052 |\n"
    ),
    "C7": "| C7 | the deployer → `api.anthropic.com` and `ecr.us-east-1.amazonaws.com` | x | x | x | x | on | x | FR-051 |\n",
    "C1": "| C1 | the edge → its origins `site` and `relay` | x | x | x | x | on | x | FR-027 |\n",
    "C9": "| C9 | EventBridge → `h4-telegram`, an API destination | x | x | x | x | on | x | FR-022 |\n",
    "S17": "| S17 | the tunnel end's port `2222` from anywhere, and egress on `443` | x | x | x | x | on | x | FR-052 |\n",
}

COMPOSE = """x-service: &service
  restart: unless-stopped

services:
  gateway:
    <<: *service
    networks: [internal, egress]
  web:
    <<: *service
    networks: [internal]
  model-server-gpu:
    networks:
      internal:
        aliases: [model-server]

networks:
  internal:
    internal: true
  egress: {}
"""

SSHD = "PermitListen 0.0.0.0:2201 0.0.0.0:2202 0.0.0.0:2203\nPermitOpen snapshot-sink:8080 db.internal:5432\n# PermitOpen commented:1\n"
ALLOW = "# the proxy's allowlist\napi.anthropic.com\necr.us-east-1.amazonaws.com\n"
EDGE = """
resource "aws_cloudfront_distribution" "site" {
  origin {
    origin_id   = "site"
    domain_name = aws_s3_bucket.site.bucket_regional_domain_name
  }
  origin {
    origin_id   = "relay"
    domain_name = aws_instance.tunnel_end.private_dns
  }
}
"""
ALERTS = """
resource "aws_cloudwatch_event_api_destination" "telegram" {
  name                = "h4-telegram"
  invocation_endpoint = "https://api.telegram.org/bot/sendMessage"
}
"""
NETWORK = """
resource "aws_security_group" "tunnel_end_public" {
  ingress {
    from_port   = 2222
    to_port     = 2222
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 5432
    to_port     = 5432
    cidr_blocks = ["10.40.0.0/16"]
  }
  egress {
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }
}
"""


def write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def disclosure(root: Path, *without: str) -> None:
    write(
        root,
        "docs/data-flow-disclosure.md",
        HEADER + "".join(v for k, v in ROWS.items() if k not in without),
    )


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    disclosure(tmp_path)
    write(tmp_path, "deploy/compose.yaml", COMPOSE)
    write(tmp_path, "deploy/tunnel/sshd_config", SSHD)
    write(tmp_path, "deploy/hosts/ec2/egress-allowlist.txt", ALLOW)
    write(tmp_path, "infra/prod/edge.tf", EDGE)
    write(tmp_path, "infra/account/alerts.tf", ALERTS)
    write(tmp_path, "infra/prod/network.tf", NETWORK)
    write(
        tmp_path,
        "infra/test/fixtures/x/edge.tf",
        EDGE.replace('"relay"', '"undisclosed"'),
    )
    return tmp_path


def kinds(root: Path) -> set[str]:
    return {f.kind for f in dc.check(root)}


def test_everything_disclosed_passes(tree: Path) -> None:
    assert dc.check(tree) == []


def test_a_compose_service_on_egress(tree: Path) -> None:
    disclosure(tree, "S2")
    found = dc.check(tree)
    assert {f.kind for f in found} == {"compose service on egress"}
    assert "`gateway`" in found[0].message


def test_a_compose_service_on_egress_in_block_form(tree: Path) -> None:
    write(
        tree,
        "deploy/compose.yaml",
        COMPOSE.replace(
            "  web:\n    <<: *service\n    networks: [internal]\n",
            "  web:\n    networks:\n      - internal\n      - egress\n",
        ),
    )
    assert kinds(tree) == {"compose service on egress"}


def test_an_sshd_permit(tree: Path) -> None:
    write(
        tree,
        "deploy/tunnel/sshd_config",
        SSHD.replace("db.internal:5432", "db.internal:5432 other:6379"),
    )
    found = dc.check(tree)
    assert {f.kind for f in found} == {"sshd permit"}
    assert "other:6379" in found[0].message


def test_an_egress_proxy_host(tree: Path) -> None:
    write(tree, "deploy/hosts/ec2/egress-allowlist.txt", ALLOW + "api.example.net\n")
    assert kinds(tree) == {"egress-proxy host"}


def test_a_cloudfront_origin(tree: Path) -> None:
    disclosure(tree, "C1")
    assert kinds(tree) == {"CloudFront origin"}


def test_an_eventbridge_api_destination(tree: Path) -> None:
    disclosure(tree, "C9")
    assert kinds(tree) == {"EventBridge API destination"}


def test_an_open_security_group_rule(tree: Path) -> None:
    disclosure(tree, "S17")
    found = dc.check(tree)
    assert {f.kind for f in found} == {"security-group rule open to an outside range"}
    assert (
        len(found) == 2
    )  # the ingress on 2222 and the egress on 443; the private 5432 needs no row


def test_infra_test_fixtures_are_never_read(tree: Path) -> None:
    assert all(not f.where.startswith("infra/test/") for f in dc.check(tree))


def test_nothing_outward_yet_passes(tmp_path: Path) -> None:
    disclosure(tmp_path)
    assert dc.check(tmp_path) == []


def test_main(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert dc.main(["--root", str(tree)]) == 0
    assert "disclosure-check: PASS" in capsys.readouterr().out
    disclosure(tree, "C7")
    assert dc.main(["--root", str(tree)]) == 1
    out = capsys.readouterr().out
    assert (
        "api.anthropic.com" in out and "deploy/hosts/ec2/egress-allowlist.txt:2" in out
    )


def test_main_without_the_disclosure(tmp_path: Path) -> None:
    assert dc.main(["--root", str(tmp_path)]) == 2


def test_an_open_rule_written_as_a_list_of_objects(tree: Path) -> None:
    # Group 3's finding (2026-11-10): ingress and egress may be written as attributes holding a list of objects.
    write(
        tree,
        "infra/prod/network.tf",
        'resource "aws_security_group" "x" {\n  egress = [\n    {\n      from_port   = 443\n'
        '      to_port     = 443\n      cidr_blocks = ["0.0.0.0/0"]\n    },\n  ]\n}\n',
    )
    disclosure(tree, "S17")
    found = dc.check(tree)
    assert [f.kind for f in found] == ["security-group rule open to an outside range"]
