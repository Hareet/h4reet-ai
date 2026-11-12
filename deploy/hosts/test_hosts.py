"""The tunnel end's host (spec 001 tasks.md T044; FR-051, FR-052; contracts/tunnel.md §1 and §6; contracts/env-cloud.md
§1 to §3; research.md R-10, R-28; plan.md §4): deploy/hosts/tunnel-end/, read as text and data.

  - nftables and the security groups agree: from outside, 2222 and 8087 on the public interface, and 8080 on the private
    one, and nothing else; the security group holds 8087 to Route 53's health checkers;
  - out: only the egress proxy's user reaches beyond the VPC, on 443; root alone reaches the instance metadata; the
    containers reach nothing beyond the VPC;
  - the proxy's allowlist is the disclosure's, ECR (its deployer's pulls) and SNS (its alerts) among it, AWS's own
    endpoints only;
  - Docker's daemon: no userland proxy, the fixed address pool the chains name, pulls through the proxy;
  - the env file's template, the class's services (preflight.HOST_CLASSES), and the systemd units that order the boot.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
HOST = HERE / "tunnel-end"
NFT = (HOST / "nftables.nft").read_text(encoding="utf-8")
DISCLOSURE = (REPO / "docs" / "data-flow-disclosure.md").read_text(encoding="utf-8")
ALLOWLIST = HOST / "egress-allowlist.txt"
TEMPLATE = HOST / "tunnel-end.env.example"
UNITS = HOST / "systemd"
PUBLIC_IF, PRIVATE_IF = "ens5", "ens6"
POOL = "172.30.0.0/16"
VPC = "10.42.0.0/16"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


pf = _load("preflight_for_hosts", REPO / "deploy" / "scripts" / "preflight.py")
ip = _load("infra_policy_for_hosts", REPO / "tools" / "gates" / "infra_policy.py")
patches = _load("infra_w1_patches_for_hosts", REPO / "infra" / "test" / "patches.py")


def chain(name: str) -> str:
    m = re.search(rf"\n  chain {name} \{{\n(.*?)\n  \}}", NFT, re.DOTALL)
    assert m, f"no chain {name}"
    return m.group(1)


def rules(name: str) -> list[str]:
    return [
        line.strip()
        for line in chain(name).splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


# ----------------------------------------------------------------------------------------------------------------------
# In: nftables and the security groups.


def test_the_ruleset_replaces_only_its_own_table() -> None:
    lines = [ln for ln in NFT.splitlines() if ln and not ln.startswith("#")]
    assert lines[:3] == [
        "table inet h4reet",
        "delete table inet h4reet",
        "table inet h4reet {",
    ]
    assert "flush ruleset" not in NFT  # Docker's own tables stay


def test_new_inbound_reaches_2222_and_8087_publicly_and_8080_privately_only() -> None:
    pre = rules("prerouting")
    assert pre[0] == "type filter hook prerouting priority mangle; policy accept;"
    assert pre[1:] == [
        f'iifname "{PUBLIC_IF}" ct state new tcp dport {{ 2222, 8087 }} accept',
        f'iifname "{PUBLIC_IF}" ct state new drop',
        f'iifname "{PRIVATE_IF}" ct state new tcp dport 8080 accept',
        f'iifname "{PRIVATE_IF}" ct state new drop',
    ]


def groups() -> dict[str, set[tuple[int, str]]]:
    text = patches.patched_text("infra/prod/tunnel-end.tf")
    assert text is not None, "infra/prod/tunnel-end.tf"
    out: dict[str, set[tuple[int, str]]] = {}
    for b in ip.parse_hcl(text).blocks("resource"):
        if b.labels[0] != "aws_security_group":
            continue
        out[b.labels[1]] = {
            (
                ip.literal(i.attr("from_port")),
                re.sub(
                    r"\s+",
                    " ",
                    (i.attr("cidr_blocks") or i.attr("prefix_list_ids")).raw,
                ),
            )
            for i in b.blocks("ingress")
        }
    return out


def test_the_security_groups_admit_what_nftables_admits_and_route_53_alone_on_8087() -> (
    None
):
    found = groups()
    assert {port for port, _ in found["tunnel_end_public"]} == {2222, 8087}
    assert {port for port, _ in found["tunnel_end_private"]} == {8080}
    assert (8087, "data.aws_ip_ranges.route53_health_checks.cidr_blocks") in found[
        "tunnel_end_public"
    ]
    assert (2222, '["0.0.0.0/0"]') in found["tunnel_end_public"]
    assert (8080, "[data.aws_ec2_managed_prefix_list.cloudfront.id]") in found[
        "tunnel_end_private"
    ]


# ----------------------------------------------------------------------------------------------------------------------
# Out.


def test_only_the_proxys_user_reaches_beyond_the_vpc() -> None:
    out = rules("output")
    assert out[0] == "type filter hook output priority filter; policy drop;"
    assert out[1:] == [
        'oifname "lo" accept',
        "ct state established,related accept",
        "ip daddr 169.254.169.254 meta skuid 0 tcp dport 80 accept",
        "ip daddr 169.254.169.123 udp dport 123 accept",
        "ip daddr { 10.42.0.2, 169.254.169.253 } meta l4proto { tcp, udp } th dport 53 accept",
        f"ip daddr {VPC} accept",
        f"ip daddr {POOL} accept",
        'meta skuid "h4-egress" tcp dport 443 accept',
    ]


def test_containers_reach_nothing_beyond_the_vpc() -> None:
    fwd = rules("forward")
    assert fwd[0] == "type filter hook forward priority filter; policy accept;"
    assert fwd[1:] == [
        f"ip saddr {POOL} ct state new ip daddr != {{ {POOL}, {VPC} }} drop",
    ]


def allowlist() -> list[str]:
    return [
        line.strip()
        for line in ALLOWLIST.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]


def test_the_proxys_allowlist_is_awss_endpoints_ecr_and_sns_among_them() -> None:
    hosts = allowlist()
    assert len(hosts) == len(set(hosts))
    assert {
        "api.ecr.us-east-1.amazonaws.com",
        "*.dkr.ecr.us-east-1.amazonaws.com",
        "prod-us-east-1-starport-layer-bucket.s3.us-east-1.amazonaws.com",
        "sns.us-east-1.amazonaws.com",
    } <= set(hosts)
    for host in hosts:
        assert re.fullmatch(
            r"(\*\.|[a-z0-9-]+\*?\.)?[a-z0-9.-]+\.amazonaws\.com", host
        ), host


def disclosed() -> set[str]:
    names: set[str] = set()
    for line in DISCLOSURE.splitlines():
        if re.match(r"^\|\s*[A-Z][0-9]+\s*\|", line):
            names |= set(re.findall(r"`([^`]+)`", line))
    return names


def test_every_allowed_host_has_its_disclosure_row() -> None:
    assert [h for h in allowlist() if h not in disclosed()] == []


def test_dockers_daemon_pulls_through_the_proxy_with_the_pool_the_chains_name() -> None:
    daemon = json.loads((HOST / "daemon.json").read_text(encoding="utf-8"))
    assert daemon["userland-proxy"] is False
    assert daemon["default-address-pools"] == [{"base": POOL, "size": 24}]
    assert daemon["proxies"] == {
        "http-proxy": "http://127.0.0.1:3128",
        "https-proxy": "http://127.0.0.1:3128",
        "no-proxy": "169.254.169.254,10.42.0.0/16",
    }
    assert daemon["log-driver"] == "local"
    assert daemon["live-restore"] is True
    assert daemon["no-new-privileges"] is True


# ----------------------------------------------------------------------------------------------------------------------
# The class, the env file, and the boot.


def template() -> dict[str, str]:
    values, errors = pf.parse_env(TEMPLATE.read_text(encoding="utf-8"))
    assert errors == []
    return values


def test_the_env_files_template_names_the_tunnel_end() -> None:
    values = template()
    assert values["H4_HOST"] == "tunnel-end"
    assert values["H4_STACK"] == "prod" and values["H4_ENV"] == "prod"
    assert values["COMPOSE_PROFILES"] == "tunnel-end"
    assert values["COMPOSE_PROJECT_NAME"] == "h4reet-prod"
    assert values["H4_TUNNEL_KEYS_DIR"] == "/run/h4reet/tunnel-end/keys"
    # The secrets come from Parameter Store at boot, never from the template.
    assert values["TELEMETRY_BLOCK_TOKEN"] == "__PARAMETER__"


def test_the_class_is_the_tunnel_ends_four_services() -> None:
    assert pf.HOST_CLASSES["tunnel-end"] == (
        "tunnel-end",
        "relay",
        "snapshot-sink",
        "tunnel-end-collector",
    )
    raw = yaml.safe_load((REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8"))
    assert raw["services"]["tunnel"]["profiles"] == ["tunnel"]
    assert raw["services"]["tunnel-end"]["profiles"] == ["tunnel-end"]
    assert raw["services"]["tunnel-end"]["ports"] == [
        "10.42.0.10:2222:2222",
        "10.42.0.10:8087:2203",
    ]


def unit(name: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for line in (UNITS / name).read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith(("#", "[")):
            key, _, value = line.partition("=")
            out.setdefault(key.strip(), []).append(value.strip())
    return out


def test_the_units_order_the_boot() -> None:
    proxy = unit("h4-egress-proxy.service")
    assert proxy["User"] == ["h4-egress"]
    assert proxy["Before"] == [
        "docker.service h4-write-env.service amazon-ssm-agent.service"
    ]
    write_env = unit("h4-write-env.service")
    assert write_env["Type"] == ["oneshot"]
    assert write_env["After"] == ["h4-egress-proxy.service network-online.target"]
    stack = unit("h4-stack.service")
    assert stack["Requires"] == ["docker.service h4-write-env.service"]
    assert any(
        "deploy/scripts/deployer.py --host tunnel-end --boot" in v
        for v in stack["ExecStart"]
    )
    timer = unit("h4-deployer.timer")
    assert timer["OnUnitActiveSec"] == ["60"]
    deployer = unit("h4-deployer.service")
    assert any(
        "deploy/scripts/deployer.py --host tunnel-end" in v
        for v in deployer["ExecStart"]
    )
    for name in ("h4-write-env.service", "h4-stack.service", "h4-deployer.service"):
        assert unit(name)["Environment"] == [
            "HTTPS_PROXY=http://127.0.0.1:3128 NO_PROXY=169.254.169.254"
        ], name


def test_cloud_init_installs_the_host_and_loads_the_chains_before_anything_runs() -> (
    None
):
    text = (HOST / "cloud-init.yaml").read_text(encoding="utf-8")
    assert re.search(r"^packages:\n  - docker\n  - nftables\n", text, re.MULTILINE)
    run = text[text.index("\nruncmd:\n") :]
    order = [
        "nft -f /etc/h4reet/nftables.nft",
        "systemctl enable --now h4-egress-proxy.service",
        "systemctl enable --now docker.service",
        "systemctl enable --now h4-write-env.service",
        "systemctl enable --now h4-stack.service",
        "systemctl enable --now h4-deployer.timer",
    ]
    positions = [run.find(step) for step in order]
    assert -1 not in positions and positions == sorted(positions), positions
    assert not re.search(r"\b(curl|wget)\b", text)
