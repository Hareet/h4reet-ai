"""The tunnel end's host (spec 001 tasks.md T044; FR-051, FR-052; contracts/tunnel.md §1 and §6; contracts/env-cloud.md
§1 to §3; research.md R-10, R-28; plan.md §4): deploy/hosts/tunnel-end/, read as text and data.

  - nftables and the security groups agree: from outside, 2222 and 8087 on the public interface, and 8080 on the private
    one, and nothing else; the security group holds 8087 to Route 53's health checkers;
  - out: only the egress proxy's user reaches beyond the VPC, on 443; root alone reaches the instance metadata; the
    containers reach nothing beyond the VPC;
  - the proxy's allowlist is the disclosure's, ECR (its deployer's pulls) and SNS (its alerts) among it, AWS's own
    endpoints only;
  - Docker's daemon: no userland proxy, the fixed address pool the chains name, pulls through the proxy;
  - the env file's template, the class's services (preflight.HOST_CLASSES), and the systemd units that order the boot;
  - the env file write_env.py writes from that template loads the class's services in Docker Compose, with the
    deployer's release env file and interpolation, offline (`docker compose config`; group 5's review, I5).
"""

from __future__ import annotations

import importlib.util
import json
import re
import secrets
import subprocess
import sys
from pathlib import Path

import pytest

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
        # Group 6's shared state on 5432 (tasks.md T163), from EC2 alone by the security group.
        f'iifname "{PRIVATE_IF}" ct state new tcp dport {{ 5432, 8080 }} accept',
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
                    (
                        i.attr("cidr_blocks")
                        or i.attr("prefix_list_ids")
                        or i.attr("security_groups")
                    ).raw,
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
    assert {port for port, _ in found["tunnel_end_private"]} == {5432, 8080}
    assert (5432, "[aws_security_group.ec2.id]") in found["tunnel_end_private"]
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
        # Group 6's backups (disclosure row C16): its own bucket, by the account's ID in its name.
        "h4reet-ai-shared-state-*.s3.us-east-1.amazonaws.com",
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
    # The secrets come from Parameter Store at boot, never from the template.
    assert values["TELEMETRY_BLOCK_TOKEN"] == "__PARAMETER__"


def test_the_class_is_the_tunnel_ends_five_services() -> None:
    assert pf.HOST_CLASSES["tunnel-end"] == (
        "tunnel-end",
        "relay",
        "snapshot-sink",
        "tunnel-end-collector",
        "shared-state",
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
    # Docker starts after the env file and key files are back on tmpfs, so no container it restarts at boot finds its
    # key files gone; ordering alone, so restarting the env file's unit never restarts Docker (group 5's review, I4).
    assert write_env["Before"] == ["docker.service h4-stack.service"]
    assert "docker.service" not in " ".join(
        write_env.get("Requires", []) + write_env.get("BindsTo", [])
    )
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
    text = (HOST / "cloud-init.yaml.tftpl").read_text(encoding="utf-8")
    assert re.search(r"^packages:\n  - docker\n  - nftables\n", text, re.MULTILINE)
    run = text[text.index("\nruncmd:\n") :]
    order = [
        "nft -f /etc/h4reet/nftables.nft",
        "systemctl enable --now h4-egress-proxy.service",
        "systemctl enable --now h4-write-env.service",
        "systemctl enable --now docker.service",
        "systemctl enable --now h4-stack.service",
        "systemctl enable --now h4-deployer.timer",
    ]
    positions = [run.find(step) for step in order]
    assert -1 not in positions and positions == sorted(positions), positions
    assert not re.search(r"\b(curl|wget)\b", text)


HOST_SCRIPTS = ("write_env.py", "egress_proxy.py", "deployer.py")


def test_the_host_scripts_run_on_amazon_linux_2023s_python() -> None:
    # Amazon Linux 2023's python3 is 3.9: each script the tunnel end runs keeps to its syntax.
    import ast

    for name in HOST_SCRIPTS:
        text = (REPO / "deploy" / "scripts" / name).read_text(encoding="utf-8")
        ast.parse(text, filename=name, feature_version=(3, 9))
        assert text.startswith("#!/usr/bin/env python3\n"), name


def test_the_deployers_class_is_preflights() -> None:
    deployer = _load("deployer_for_hosts", REPO / "deploy" / "scripts" / "deployer.py")
    assert deployer.HOST_CLASSES == pf.HOST_CLASSES


def test_the_user_data_carries_every_host_file_the_units_run() -> None:
    text = patches.patched_text("infra/prod/tunnel-end.tf")
    assert text is not None
    for name in HOST_SCRIPTS:
        assert f'"/opt/h4reet/deploy/scripts/{name}"' in text, name
        assert f'source = "deploy/scripts/{name}"' in text, name
    for unit in sorted(p.name for p in UNITS.iterdir()):
        assert f'source = "deploy/hosts/tunnel-end/systemd/{unit}"' in text, unit
    for name in (
        "nftables.nft",
        "egress-allowlist.txt",
        "tunnel-end.env.example",
        "daemon.json",
    ):
        assert f'source = "deploy/hosts/tunnel-end/{name}"' in text, name


def rendered_user_data() -> str:
    """cloud-init's user data as prod's templatefile() renders it: each host file, by its place, as a block scalar."""
    text = patches.patched_text("infra/prod/tunnel-end.tf")
    assert text is not None
    files = {
        m.group(1): (m.group(2), m.group(3))
        for m in re.finditer(
            r'"([^"]+)"\s*=\s*\{ source = "([^"]+)", mode = "([0-9]+)" \}', text
        )
    }
    template = (HOST / "cloud-init.yaml.tftpl").read_text(encoding="utf-8")
    loop = re.search(
        r"%\{ for path, file in files ~\}\n(.*?)%\{ endfor ~\}\n", template, re.DOTALL
    )
    assert loop and files
    entries = []
    for path, (source, mode) in sorted(files.items()):
        lines = (REPO / source).read_text(encoding="utf-8").split("\n")
        indented = "\n".join(
            [lines[0], *((" " * 6 + ln) if ln else ln for ln in lines[1:])]
        )
        entries.append(
            loop.group(1)
            .replace("${path}", path)
            .replace("${file.mode}", mode)
            .replace("${indent(6, file.content)}", indented)
        )
    return template[: loop.start()] + "".join(entries) + template[loop.end() :]


def test_the_user_data_renders_each_host_file_whole_and_fits_ec2s_limit() -> None:
    import gzip

    text = rendered_user_data()
    document = yaml.safe_load(text)
    for item in document["write_files"]:
        assert item["owner"] == "root:root", item["path"]
    tf = patches.patched_text("infra/prod/tunnel-end.tf") or ""
    sources = dict(re.findall(r'"([^"]+)"\s*=\s*\{ source = "([^"]+)"', tf))
    for item in document["write_files"]:
        assert item["content"] == (REPO / sources[item["path"]]).read_text(
            encoding="utf-8"
        )
    # EC2 takes 16 KB of user data before its base64; ec2-market.tf sends it gzipped. Later groups' host files would
    # pass it: they come from the release's tree instead (the note's backlog).
    assert len(gzip.compress(text.encode())) < 15 * 1024


# ----------------------------------------------------------------------------------------------------------------------
# The env file in Compose (group 5's review, I5): the file write_env.py renders from the template, with stand-in
# parameters of their shapes, and the deployer's release env file, load the class's services as the deployer runs
# compose on the host (DockerCli.compose: the tree's compose file, both env files, H4_TREE, and nothing else of the
# environment). `docker compose config` reads and interpolates offline, with no engine.


def compose_cli() -> list[str]:
    try:
        done = subprocess.run(
            ["docker", "compose", "version"],
            capture_output=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        done = None
    if done is None or done.returncode != 0:
        pytest.skip("no Docker Compose CLI here, which this check needs, offline")
    return ["docker", "compose"]


def test_the_env_file_loads_the_class_in_compose(tmp_path: Path) -> None:
    we = _load("write_env_for_hosts", REPO / "deploy" / "scripts" / "write_env.py")
    dp = _load("deployer_for_compose", REPO / "deploy" / "scripts" / "deployer.py")

    def fetch(names: list[str]) -> dict[str, str]:
        return {
            n: ("h4reet-ai-releases-" + secrets.token_hex(4))
            if n.endswith("RELEASE_BUCKET")
            else secrets.token_urlsafe(32)
            for n in names
        }

    text, _ = we.render(
        "tunnel-end", TEMPLATE.read_text(encoding="utf-8"), fetch, lambda: "1" * 12
    )
    env_file = tmp_path / "tunnel-end.env"
    env_file.write_text(text, encoding="utf-8")
    services = yaml.safe_load(
        (REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8")
    )["services"]
    mine = [s for s in dp.HOST_CLASSES["tunnel-end"] if s in services]
    # Each image's repository in the account's registry (infra/account/registry.tf), as the release names it.
    repositories = {
        "tunnel-end": "h4reet/tunnel",
        "tunnel-end-collector": "h4reet/otel-collector",
        "shared-state": "h4reet/shared-state",
    }
    assert set(mine) <= set(repositories), mine
    release = {
        "release": "r1",
        "commit": secrets.token_hex(20),
        "tree": {"key": "trees/r1.tar.gz", "sha256": secrets.token_hex(32)},
        "compose": {"key": "tools/docker-compose", "sha256": secrets.token_hex(32)},
        "services": {
            name: {
                "repository": repositories[name],
                "digest": "sha256:" + secrets.token_hex(32),
                "hosts": ["tunnel-end"],
            }
            for name in mine
        },
    }
    deployer = dp.Deployer(
        "tunnel-end", env_file, tmp_path / "state", None, None, tmp_path / "p", str
    )
    release_env = deployer.release_env(release)
    done = subprocess.run(
        [
            *compose_cli(),
            "-f",
            str(REPO / "deploy" / "compose.yaml"),
            "--env-file",
            str(env_file),
            "--env-file",
            str(release_env),
            "config",
            "--format",
            "json",
            *mine,
        ],
        cwd=REPO,
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(tmp_path), "H4_TREE": str(REPO)},
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    errors = [line for line in done.stderr.splitlines() if "level=warning" not in line]
    assert done.returncode == 0, errors
    loaded = json.loads(done.stdout)["services"]
    assert sorted(loaded) == sorted(mine)
    registry = "1" * 12 + ".dkr.ecr.us-east-1.amazonaws.com/h4reet/"
    for name in mine:
        assert loaded[name]["image"].startswith(registry), (name, loaded[name]["image"])
    # The release-built image by the release's own digest (group 5's departure 6).
    assert loaded["tunnel-end"]["image"] == (
        registry + "tunnel@" + release["services"]["tunnel-end"]["digest"]
    )
