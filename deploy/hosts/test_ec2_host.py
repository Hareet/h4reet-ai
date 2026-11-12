"""EC2's host (spec 001 tasks.md T081, T086, T087; FR-043, FR-044, FR-050, FR-051; contracts/tunnel.md §4 and §6;
contracts/env-cloud.md §1 to §3; research.md R-10, R-15, R-28; plan.md §5.1 and §16, "Group 7, as built"):
deploy/hosts/ec2/, read as text and data, and the compose file's ec2 class.

  - nftables and the security group agree: from outside, the relay block's 8085 and the collector's 4318 alone; each
    container's 443 and 465 go to the gateway's proxy; only the proxies' user reaches beyond the VPC, on 443 and 465;
  - the two allowlists are the disclosure's (T086): the host's, for ECR, S3, Systems Manager, STS, and SNS; the
    gateway's, for the Anthropic API, Bedrock, and Telegram; every name in a row, and row C18 naming each;
  - Docker's data root is the data volume's mount, which Docker requires before it starts;
  - the env file's template names EC2 with its class's profile alone: no model server and no local store;
  - the class (preflight.HOST_CLASSES, the deployer's, and compose's) is the stack but the model server and the
    local store, with ec2-relay-block, which publishes on EC2's private address alone, a literal;
  - the units order the boot, and the user data carries every host file and fits EC2's limit;
  - the env file write_env.py writes loads the class in Docker Compose with the deployer's release env file, offline,
    every upstream image the account's registry's copy by its lock's digest, and passes the class's preflight;
  - the host step writes the gateway's Bedrock profile as a credential_process document, the gateway's alone to read.
"""

from __future__ import annotations

import gzip
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
HOST = HERE / "ec2"
NFT = (HOST / "nftables.nft").read_text(encoding="utf-8")
DISCLOSURE = (REPO / "docs" / "data-flow-disclosure.md").read_text(encoding="utf-8")
TEMPLATE = HOST / "ec2.env.example"
UNITS = HOST / "systemd"
COMPOSE = yaml.safe_load((REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8"))
POOL = "172.30.0.0/16"
VPC = "10.42.0.0/16"
ADDRESS = "10.42.0.20"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


pf = _load("preflight_for_ec2", REPO / "deploy" / "scripts" / "preflight.py")
dp = _load("deployer_for_ec2", REPO / "deploy" / "scripts" / "deployer.py")
we = _load("write_env_for_ec2", REPO / "deploy" / "scripts" / "write_env.py")
ep = _load("egress_proxy_for_ec2", REPO / "deploy" / "scripts" / "egress_proxy.py")
eh = _load("ec2_host_for_tests", HOST / "ec2_host.py")


def chain(name: str) -> list[str]:
    m = re.search(rf"\n  chain {name} \{{\n(.*?)\n  \}}", NFT, re.DOTALL)
    assert m, f"no chain {name}"
    return [
        ln.strip()
        for ln in m.group(1).splitlines()
        if ln.strip() and not ln.strip().startswith("#")
    ]


# ----------------------------------------------------------------------------------------------------------------------
# In and out.


def test_from_outside_8085_and_4318_alone() -> None:
    assert chain("prerouting") == [
        "type filter hook prerouting priority mangle; policy accept;",
        'iifname "ens5" ct state new tcp dport { 4318, 8085 } accept',
        'iifname "ens5" ct state new drop',
    ]


def test_each_containers_tls_goes_to_the_gateways_proxy() -> None:
    assert chain("gateway") == [
        "type nat hook prerouting priority dstnat - 10; policy accept;",
        f'iifname "br-*" tcp dport 443 dnat ip to {ADDRESS}:3129',
        f'iifname "br-*" tcp dport 465 dnat ip to {ADDRESS}:3130',
    ]
    unit = (HOST / "release" / "h4-sni-proxy.service").read_text(encoding="utf-8")
    assert f"--listen {ADDRESS}:3129=443 --listen {ADDRESS}:3130=465" in unit
    assert "User=h4-egress" in unit


def test_only_the_proxies_user_reaches_beyond_the_vpc_and_no_container_does() -> None:
    assert chain("output") == [
        "type filter hook output priority filter; policy drop;",
        'oifname "lo" accept',
        "ct state established,related accept",
        "ip daddr 169.254.169.254 meta skuid 0 tcp dport 80 accept",
        "ip daddr 169.254.169.123 udp dport 123 accept",
        "ip daddr { 10.42.0.2, 169.254.169.253 } meta l4proto { tcp, udp } th dport 53 accept",
        f"ip daddr {VPC} accept",
        f"ip daddr {POOL} accept",
        'meta skuid "h4-egress" tcp dport { 443, 465 } accept',
    ]
    assert chain("forward")[1:] == [
        f"ip saddr {POOL} ct state new ip daddr != {{ {POOL}, {VPC} }} drop"
    ]


def test_the_security_group_admits_what_nftables_admits() -> None:
    text = (REPO / "infra" / "prod" / "network.tf").read_text(encoding="utf-8")
    group = text[text.index('resource "aws_security_group" "ec2"') :]
    ports = sorted(
        int(p)
        for p in re.findall(r"from_port\s*=\s*(\d+)", group.split("egress", 1)[0])
    )
    assert ports == [4318, 8085]


# ----------------------------------------------------------------------------------------------------------------------
# The allowlists, from the disclosure (T086).


def names(path: Path) -> list[str]:
    return [
        line.split("#", 1)[0].strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.split("#", 1)[0].strip()
    ]


def rows() -> dict[str, str]:
    out = {}
    for line in DISCLOSURE.splitlines():
        m = re.match(r"^\|\s*([A-Z][0-9]+)\s*\|", line)
        if m:
            out[m.group(1)] = line
    return out


HOSTISH = re.compile(r"(\*\.)?[a-z0-9*-]+(\.[a-z0-9*-]+)+")


def test_the_hosts_allowlist_is_awss_endpoints_and_the_gateways_its_providers() -> None:
    host = names(HOST / "egress-allowlist.txt")
    assert set(host) == {
        "api.ecr.us-east-1.amazonaws.com",
        "*.dkr.ecr.us-east-1.amazonaws.com",
        "prod-us-east-1-starport-layer-bucket.s3.us-east-1.amazonaws.com",
        "h4reet-ai-releases-*.s3.us-east-1.amazonaws.com",
        "ssm.us-east-1.amazonaws.com",
        "ssmmessages.us-east-1.amazonaws.com",
        "ec2messages.us-east-1.amazonaws.com",
        "sts.us-east-1.amazonaws.com",
        "sns.us-east-1.amazonaws.com",
    }
    assert names(HOST / "release" / "gateway-allowlist.txt") == [
        "api.anthropic.com",
        "bedrock-runtime.us-east-1.amazonaws.com",
        "api.telegram.org",
    ]
    for path in ("egress-allowlist.txt", "release/gateway-allowlist.txt"):
        ep.load_allowlist(HOST / path)


def test_each_allowed_name_is_the_disclosures_and_row_c18_names_them_all() -> None:
    allowed = names(HOST / "egress-allowlist.txt") + names(
        HOST / "release" / "gateway-allowlist.txt"
    )
    every = set()
    for line in rows().values():
        every |= set(re.findall(r"`([^`]+)`", line))
    assert [a for a in allowed if a not in every] == []
    c18 = rows().get("C18", "")
    named = {n for n in re.findall(r"`([^`]+)`", c18) if HOSTISH.fullmatch(n)}
    assert named == set(allowed), named ^ set(allowed)
    # The SMTP host is the Author's, by its env file's key (A2), and the ports the group opens are named (465, 443).
    assert "`SMTP_HOST`" in c18 and "`465`" in c18 and "`443`" in c18


# ----------------------------------------------------------------------------------------------------------------------
# Docker, the template, and the class.


def test_dockers_data_root_is_the_data_volumes_mount_which_it_requires() -> None:
    daemon = json.loads((HOST / "daemon.json").read_text(encoding="utf-8"))
    assert daemon["data-root"] == "/srv/h4reet/data/docker"
    assert daemon["userland-proxy"] is False and daemon["live-restore"] is True
    assert daemon["default-address-pools"] == [{"base": POOL, "size": 24}]
    assert "RequiresMountsFor=/srv/h4reet/data" in (
        UNITS / "docker-data.conf"
    ).read_text(encoding="utf-8")
    cloud = (HOST / "cloud-init.yaml.tftpl").read_text(encoding="utf-8")
    boot = cloud[cloud.index("bootcmd:") : cloud.index("packages:")]
    # Formatted only when blkid finds no filesystem (exit 2), never over one it can't read.
    assert (
        'if [ "$s" = 2 ]; then mkfs.xfs' in boot
        and 'elif [ "$s" != 0 ]; then exit 1' in boot
    )
    assert "mount -o nodev,nosuid /dev/sdf /srv/h4reet/data" in boot


def template() -> dict[str, str]:
    values, errors = pf.parse_env(TEMPLATE.read_text(encoding="utf-8"))
    assert errors == []
    return values


def test_the_template_names_ec2_with_its_class_alone() -> None:
    v = template()
    assert (v["H4_HOST"], v["H4_STACK"], v["H4_ENV"], v["COMPOSE_PROFILES"]) == (
        "ec2",
        "prod",
        "prod",
        "ec2",
    )
    assert (
        v["GATEWAY_DB_URL"]
        == "postgres://gateway@10.42.1.10:5432/h4reet?sslmode=verify-full"
    )
    assert (v["SMTP_PORT"], v["SMTP_TLS"]) == ("465", "implicit")
    assert v["GATEWAY_ANTHROPIC_API_KEY"] == "__PARAMETER__"
    assert not [k for k in v if k.startswith("H4_IMAGE_")]
    secret = ("PASSWORD", "TOKEN", "SECRET", "KEY", "SALT")
    for key, value in v.items():
        if any(s in key for s in secret) and key not in ("LANGFUSE_PUBLIC_KEY",):
            assert value.startswith("__PARAMETER"), key


def test_the_class_is_the_stack_but_the_model_server_and_the_local_store() -> None:
    mine = pf.HOST_CLASSES["ec2"]
    assert mine == dp.HOST_CLASSES["ec2"]
    assert "gateway-state" not in mine
    assert not [s for s in mine if s.startswith("model-server")]
    assert set(mine) == {
        n for n, s in COMPOSE["services"].items() if not s.get("profiles")
    } - {"gateway-state"} | {"ec2-relay-block"}
    block = COMPOSE["services"]["ec2-relay-block"]
    assert block["profiles"] == ["ec2"]
    assert block["ports"] == [f"{ADDRESS}:8085:8085", f"{ADDRESS}:4318:4318"]
    assert COMPOSE["services"]["edge"]["ports"][0].startswith("127.0.0.1:")
    assert not [
        p
        for p in COMPOSE["services"]["edge"]["ports"]
        if not p.startswith("127.0.0.1:")
    ]


def unit(name: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for line in (UNITS / name).read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith(("#", "[")):
            key, _, value = line.partition("=")
            out.setdefault(key.strip(), []).append(value.strip())
    return out


def test_the_units_order_the_boot() -> None:
    assert unit("h4-egress-proxy.service")["User"] == ["h4-egress"]
    write_env = unit("h4-write-env.service")
    assert "--host ec2" in write_env["ExecStart"][0]
    assert write_env["Before"] == ["docker.service h4-stack.service"]
    sni = unit("../release/h4-sni-proxy.service")
    assert sni["User"] == ["h4-egress"] and sni["Before"] == ["docker.service"]
    # The proxy never reads the env file: a root step copies the SMTP host alone into its own runtime folder.
    assert "--smtp-host-file /run/h4-sni-proxy/smtp-host" in sni["ExecStart"][0]
    assert sni["ExecStartPre"][0].startswith(
        '+/bin/sh -c \'sed -n "s/^SMTP_HOST=//p" /run/h4reet/ec2.env'
    )
    stack = unit("h4-stack.service")
    assert stack["Requires"] == ["docker.service"] and stack["Wants"] == [
        "h4-write-env.service"
    ]
    assert any(
        "deploy_first_step.py --host ec2 --boot" in v for v in stack["ExecStart"]
    )
    assert stack["ExecStop"] == ["/usr/bin/docker compose -p h4reet-prod stop"]
    deployer = unit("h4-deployer.service")
    assert deployer["Wants"] == ["h4-write-env.service"]
    assert any("deploy_first_step.py --host ec2" in v for v in deployer["ExecStart"])
    assert unit("h4-deployer.timer")["OnUnitActiveSec"] == ["60"]
    cloud = (HOST / "cloud-init.yaml.tftpl").read_text(encoding="utf-8")
    run = cloud[cloud.index("\nruncmd:\n") :]
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
    assert "systemctl disable --now sshd.service" in run
    assert not re.search(r"\b(curl|wget)\b", cloud)


HOST_SCRIPTS = (
    "write_env.py",
    "egress_proxy.py",
    "deploy_first_step.py",
)


def test_the_host_scripts_run_on_amazon_linux_2023s_python() -> None:
    import ast

    # The release's part too: the host step and the gateway's proxy it installs.
    for path in [
        REPO / "deploy" / "scripts" / n for n in (*HOST_SCRIPTS, "sni_proxy.py")
    ] + [HOST / "ec2_host.py"]:
        text = path.read_text(encoding="utf-8")
        ast.parse(text, filename=path.name, feature_version=(3, 9))
        assert text.startswith("#!/usr/bin/env python3\n"), path.name


def ec2_tf() -> str:
    return (REPO / "infra" / "prod" / "ec2.tf").read_text(encoding="utf-8")


def test_the_user_data_carries_every_host_file_and_not_the_deployer() -> None:
    text = ec2_tf()
    for name in HOST_SCRIPTS:
        assert f'source = "deploy/scripts/{name}"' in text, name
    assert 'source = "deploy/scripts/deployer.py"' not in text
    for path in sorted(UNITS.iterdir()):
        assert f'source = "deploy/hosts/ec2/systemd/{path.name}"' in text, path.name
    for name in (
        "nftables.nft",
        "egress-allowlist.txt",
        "ec2.env.example",
        "daemon.json",
    ):
        assert f'source = "deploy/hosts/ec2/{name}"' in text, name
    # The host step, the gateway's proxy, and their units come from the release's tree, never the user data.
    code = re.sub(r"(?m)^\s*#.*$", "", text)
    assert "ec2_host.py" not in code and "sni_proxy.py" not in code
    assert 'source = "deploy/hosts/ec2/release/' not in text


def rendered_user_data() -> str:
    text = ec2_tf()
    files = {
        m.group(1): (m.group(2), m.group(3))
        for m in re.finditer(
            r'"([^"]+)"\s*=\s*\{ source = "([^"]+)", mode = "([0-9]+)" \}', text
        )
    }
    template_text = (HOST / "cloud-init.yaml.tftpl").read_text(encoding="utf-8")
    loop = re.search(
        r"%\{ for path, file in files ~\}\n(.*?)%\{ endfor ~\}\n",
        template_text,
        re.DOTALL,
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
    return (
        template_text[: loop.start()] + "".join(entries) + template_text[loop.end() :]
    )


def test_the_user_data_renders_each_host_file_whole_and_fits_ec2s_limit() -> None:
    text = rendered_user_data()
    document = yaml.safe_load(text)
    sources = dict(re.findall(r'"([^"]+)"\s*=\s*\{ source = "([^"]+)"', ec2_tf()))
    for item in document["write_files"]:
        assert item["owner"] == "root:root", item["path"]
        assert item["content"] == (REPO / sources[item["path"]]).read_text(
            encoding="utf-8"
        )
    # Terraform's base64gzip writes at level 6: under EC2's 16,384 bytes, with 768 to spare for Go's encoder. 14,781
    # bytes on 2026-11-13, with the gateway's proxy and the credential timer from the release's tree (ec2_host.py).
    size = len(gzip.compress(text.encode(), 6))
    assert size < 15616, f"EC2's user data is {size} bytes gzipped at level 6"


# ----------------------------------------------------------------------------------------------------------------------
# The env file, the release's env file, and compose, offline; and the class's preflight.


def fetch(names_: list[str]) -> dict[str, str]:
    dashes = "-" * 5
    out = {}
    for n in names_:
        if n.endswith("RELEASE_BUCKET"):
            out[n] = "h4reet-ai-releases-" + secrets.token_hex(4)
        elif n.endswith("SHARED_STATE_TLS_CA"):
            import base64

            pem = f"{dashes}BEGIN CERTIFICATE{dashes}\nQUJD\n{dashes}END CERTIFICATE{dashes}\n"
            out[n] = base64.b64encode(pem.encode()).decode()
        elif n.endswith(("SMTP_HOST",)):
            out[n] = "smtp.example.invalid"
        elif n.endswith(("ALERT_EMAIL_FROM", "ALERT_EMAIL_TO")):
            out[n] = "alerts@example.invalid"
        else:
            out[n] = secrets.token_urlsafe(32)
    return out


def rendered_env(tmp_path: Path) -> Path:
    text, keys = we.render(
        "ec2", TEMPLATE.read_text(encoding="utf-8"), fetch, lambda: "1" * 12
    )
    assert keys == {}
    env_file = tmp_path / "ec2.env"
    env_file.write_text(text, encoding="utf-8")
    env_file.chmod(0o600)
    return env_file


def lock() -> dict[str, tuple[str, str]]:
    return dp.read_lock(REPO)


def release_for(mine: list[str]) -> dict:
    commit = secrets.token_hex(20)
    services = {}
    pins = lock()
    for name in mine:
        if name in dp.RELEASE_TAGS:
            services[name] = {
                "repository": f"h4reet/{name}",
                "digest": "sha256:" + secrets.token_hex(32),
                "hosts": ["ec2", "laptop"],
            }
        else:
            tag, digest = pins[dp.COPIES.get(name, name)]
            services[name] = {
                "repository": f"h4reet/{dp.COPIES.get(name, name)}",
                "tag": tag,
                "digest": digest,
                "hosts": ["ec2"],
            }
    return {
        "release": "r1",
        "commit": commit,
        "tree": {"key": f"trees/{commit}.tar.gz", "sha256": secrets.token_hex(32)},
        "compose": {"key": "tools/docker-compose", "sha256": secrets.token_hex(32)},
        "services": services,
    }


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


def test_the_env_file_loads_the_class_in_compose_every_image_the_accounts_copy(
    tmp_path: Path,
) -> None:
    env_file = rendered_env(tmp_path)
    mine = list(dp.HOST_CLASSES["ec2"])
    release = release_for(mine)
    deployer = dp.Deployer(
        "ec2", env_file, tmp_path / "state", None, None, tmp_path / "p", str
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
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "H4_TREE": str(REPO),
        },
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
    pins = lock()
    for name in mine:
        image = loaded[name]["image"]
        if name in dp.RELEASE_TAGS:
            # The laptop's build names, which the deployer tags from the release's digest for its commit.
            assert image.startswith(f"{dp.RELEASE_TAGS[name]}:{release['commit']}"), (
                name,
                image,
            )
        else:
            tag, digest = pins[dp.COPIES.get(name, name)]
            assert image == f"{registry}{dp.COPIES.get(name, name)}:{tag}@{digest}", (
                name,
                image,
            )
    assert loaded["gateway"]["environment"]["H4_HOST"] == "ec2"
    assert loaded["gateway"]["environment"]["GATEWAY_DB_URL"].startswith(
        "postgres://gateway@10.42.1.10:5432/"
    )


def test_the_rendered_env_file_passes_ec2s_preflight(tmp_path: Path) -> None:
    env_file = rendered_env(tmp_path)
    aws = tmp_path / "aws"
    aws.mkdir()
    (aws / "config").write_text(eh.CONFIG, encoding="utf-8")
    (aws / "credentials.json").write_text(
        json.dumps({"Version": 1, "Expiration": "2999-01-01T00:00:00Z"}),
        encoding="utf-8",
    )
    (aws / "credentials.json").chmod(0o400)
    results = pf.ec2_checks(REPO, env_file, aws, name_tag=lambda: "h4-prod-ec2")
    assert [(r.check, r.status) for r in results] == [
        (f"E{n}", "PASS") for n in range(1, 7)
    ], [r.line() for r in results]


# ----------------------------------------------------------------------------------------------------------------------
# The host step: the gateway's Bedrock profile.


class Done:
    def __init__(self, code: int, out: str = "") -> None:
        self.returncode, self.stdout = code, out


def test_the_host_step_writes_the_gateways_profile_for_its_user_alone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / "ec2.env"
    env_file.write_text(
        "H4_REGISTRY=" + "2" * 12 + ".dkr.ecr.us-east-1.amazonaws.com\n",
        encoding="utf-8",
    )
    owned = []
    monkeypatch.setattr(
        eh.os, "chown", lambda path, uid, gid: owned.append((Path(path).name, uid))
    )
    key = secrets.token_hex(10)
    answer = {
        "Credentials": {
            "AccessKeyId": "A" + key,
            "SecretAccessKey": key,
            "SessionToken": key,
            "Expiration": "2026-11-13T02:00:00Z",
        }
    }
    asked = []

    def run(argv, **kwargs):
        asked.append(argv)
        return Done(0, json.dumps(answer))

    assert eh.credentials(env_file, tmp_path / "aws", run) == 0
    (argv,) = asked
    assert (
        argv[argv.index("--role-arn") + 1]
        == f"arn:aws:iam::{'2' * 12}:role/h4-prod-gateway"
    )
    document = json.loads((tmp_path / "aws" / "credentials.json").read_text())
    assert document["Version"] == 1 and document["Expiration"] == "2026-11-13T02:00:00Z"
    assert (tmp_path / "aws" / "credentials.json").stat().st_mode & 0o777 == 0o400
    assert (
        "credential_process = /bin/cat /home/node/.aws/credentials.json"
        in (tmp_path / "aws" / "config").read_text()
    )
    assert ("credentials.json", 1000) in [
        (n.lstrip(".").replace(".tmp", ""), u) for n, u in owned
    ]


def test_a_failed_assume_writes_nothing_and_fails_the_step(tmp_path: Path) -> None:
    env_file = tmp_path / "ec2.env"
    env_file.write_text(
        "H4_REGISTRY=" + "2" * 12 + ".dkr.ecr.us-east-1.amazonaws.com\n",
        encoding="utf-8",
    )
    assert eh.credentials(env_file, tmp_path / "aws", lambda argv, **k: Done(255)) == 1
    assert not (tmp_path / "aws").exists()


def test_the_credential_timer_comes_from_the_release() -> None:
    timer = (HOST / "release" / "h4-gateway-credentials.timer").read_text(
        encoding="utf-8"
    )
    assert "OnUnitActiveSec=900" in timer
    service = (HOST / "release" / "h4-gateway-credentials.service").read_text(
        encoding="utf-8"
    )
    assert "/opt/h4reet/release/ec2_host.py credentials" in service
    assert dp.HOST_STEPS["ec2"] == ("deploy/hosts/ec2/ec2_host.py", "prepare")


def test_every_parameter_ec2s_template_reads_is_one_the_secrets_check_lists() -> None:
    # The Author's T096 writes EC2's secrets by the names infra/parameters.txt lists, which his secrets check reads.
    listed = {
        line.split()[0]
        for line in (REPO / "infra" / "parameters.txt")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.startswith("/h4reet/")
    }
    wanted = set(we.wanted("ec2", template()).values())
    assert wanted <= listed, sorted(wanted - listed)


# ----------------------------------------------------------------------------------------------------------------------
# Group 7's review B (the note's "Group 7's review B, and what was done"): B1, I1, I2, I4.


def assume_answer() -> dict:
    key = secrets.token_hex(10)
    return {
        "Credentials": {
            "AccessKeyId": "A" + key,
            "SecretAccessKey": key,
            "SessionToken": key,
            "Expiration": "2026-11-13T02:00:00Z",
        }
    }


def prepared(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, assume: int = 0
) -> tuple[int, Path, list[tuple[str, int, int]], list[list[str]]]:
    """The host step's prepare, from the repository's own tree, with the host's paths under tmp_path."""
    state = tmp_path / "srv" / "h4reet" / "data" / "state"
    env_file = tmp_path / "ec2.env"
    env_file.write_text(
        "H4_REGISTRY="
        + "2" * 12
        + ".dkr.ecr.us-east-1.amazonaws.com\n"
        + f"H4_STATE_DIR={state}\n",
        encoding="utf-8",
    )
    owned: list[tuple[str, int, int]] = []
    monkeypatch.setattr(
        eh.os, "chown", lambda path, uid, gid: owned.append((str(path), uid, gid))
    )
    monkeypatch.setattr(eh, "INSTALLED", tmp_path / "opt" / "release" / "ec2_host.py")
    units = tmp_path / "units"
    units.mkdir()
    asked: list[list[str]] = []

    def run(argv, **kwargs):
        asked.append(list(argv))
        if argv[:2] == ["aws", "sts"]:
            return Done(assume, json.dumps(assume_answer()) if assume == 0 else "")
        return Done(0)

    code = eh.prepare(REPO, env_file, tmp_path / "aws", units, run)
    return code, state, owned, asked


def test_the_host_step_makes_the_gateways_journal_folder_on_the_data_volume(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # B1: compose's long-syntax bind of ${H4_STATE_DIR}/gateway never makes its source, and nothing else on EC2 did, so
    # the gateway couldn't start. The journal lives on the data volume, which outlives a replace; the root volume doesn't.
    assert template()["H4_STATE_DIR"] == "/srv/h4reet/data/state"
    gateway = COMPOSE["services"]["gateway"]
    binds = [v for v in gateway["volumes"] if v.get("target") == "/var/lib/h4-gateway"]
    assert binds and binds[0]["source"].endswith("/gateway")
    code, state, owned, _ = prepared(tmp_path, monkeypatch)
    assert code == 0
    journal = state / "gateway"
    assert journal.is_dir() and journal.stat().st_mode & 0o777 == 0o700
    assert (str(journal), 1000, 1000) in owned


def test_the_host_step_refuses_an_env_file_without_its_state_folder(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / "ec2.env"
    env_file.write_text(
        "H4_REGISTRY=" + "2" * 12 + ".dkr.ecr.us-east-1.amazonaws.com\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(eh, "INSTALLED", tmp_path / "opt" / "ec2_host.py")
    monkeypatch.setattr(eh.os, "chown", lambda *a: None)
    (tmp_path / "units").mkdir()
    assert (
        eh.prepare(
            REPO, env_file, tmp_path / "aws", tmp_path / "units", lambda a, **k: Done(0)
        )
        == 1
    )


def test_a_failed_assume_degrades_bedrock_and_never_the_stack(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # I4: the outage that hides the bucket usually hides STS too, and Bedrock is EC2's second route alone. A failed
    # assume leaves the profile in place without its document, so the gateway answers from the Anthropic API, and
    # the timer tries again in 15 minutes; the host step, and so the stack's start, goes on.
    code, state, _, asked = prepared(tmp_path, monkeypatch, assume=255)
    assert code == 0
    assert (state / "gateway").is_dir()
    assert "credential_process" in (tmp_path / "aws" / "config").read_text()
    assert not (tmp_path / "aws" / "credentials.json").exists()
    assert ["systemctl", "enable", "--now", "h4-gateway-credentials.timer"] in asked
    assert ["systemctl", "restart", "h4-sni-proxy.service"] in asked
    assert "Bedrock answers degraded" in capsys.readouterr().err


def dropin() -> dict[str, list[str]]:
    return unit("docker-data.conf")


def test_docker_refuses_to_start_without_the_data_volume_mounted(
    tmp_path: Path,
) -> None:
    # I1: RequiresMountsFor= gives Requires= only for a mount unit with a unit file or an fstab line, which the boot
    # command's hand mount has neither of. So Docker's start runs mountpoint itself, and fails while the path isn't one.
    (guard,) = [v for v in dropin().get("ExecStartPre", []) if "mountpoint" in v]
    argv = guard.split()
    assert argv == ["/usr/bin/mountpoint", "-q", "/srv/h4reet/data"]
    assert subprocess.run([*argv[:-1], str(tmp_path)], check=False).returncode != 0
    assert subprocess.run([*argv[:-1], "/"], check=False).returncode == 0


def test_docker_requires_the_packet_filter_not_only_its_order() -> None:
    # I2: with no inet h4reet table, masquerade sends every container's 443 straight out, past the proxy (FR-051).
    d = dropin()
    assert "h4-nftables.service" in " ".join(d.get("Requires", [])).split()
    assert "h4-nftables.service" in " ".join(d.get("After", [])).split()
    # The filter replaces its own table whole, so loading it again (cloud-init's runcmd, then the unit) is safe.
    assert "delete table inet h4reet" in NFT or "destroy table inet h4reet" in NFT


def test_the_gateways_proxy_holds_its_connections_under_its_file_limit() -> None:
    # Review B, nit 4: no connection cap and no idle timeout let a container exhaust the proxy's descriptors.
    sni = unit("../release/h4-sni-proxy.service")
    (limit,) = sni["LimitNOFILE"]
    sp = _load("sni_proxy_for_ec2", REPO / "deploy" / "scripts" / "sni_proxy.py")
    # Two descriptors a connection, and room for the listeners and the resolver.
    assert 2 * sp.MAX_CONNECTIONS + 64 <= int(limit)
    assert 0 < sp.IDLE_SECONDS <= 900
