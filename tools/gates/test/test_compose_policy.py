"""Tests for tools/gates/compose_policy.py: fixture models for every refusal, and the real files end to end."""

from __future__ import annotations

import copy
import importlib.util
import json
import shutil
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "compose_policy", REPO / "tools" / "gates" / "compose_policy.py"
)
assert SPEC and SPEC.loader
cp = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = cp  # dataclasses look their module up here
SPEC.loader.exec_module(cp)

EDGE_DIGEST = "sha256:" + "1" * 64
DB_DIGEST = "sha256:" + "2" * 64
GPU_DIGEST = "sha256:" + "3" * 64
BASE_DIGEST = "sha256:" + "4" * 64
EDGE_IMAGE = f"ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine@{EDGE_DIGEST}"
DB_IMAGE = f"public.ecr.aws/docker/library/postgres:17.11-alpine3.24@{DB_DIGEST}"
GPU_IMAGE = f"ghcr.io/ggml-org/llama.cpp:server-cuda-b11459@{GPU_DIGEST}"
LOCK = {
    "edge": cp.LockEntry(
        "edge",
        "ghcr.io/nginx/nginx-unprivileged",
        "1.30.5-alpine",
        EDGE_DIGEST,
        "ghcr.io",
        "2026-10-08",
    ),
    "gateway-state": cp.LockEntry(
        "gateway-state",
        "public.ecr.aws/docker/library/postgres",
        "17.11-alpine3.24",
        DB_DIGEST,
        "public.ecr.aws",
        "2026-10-08",
    ),
    "model-server-gpu": cp.LockEntry(
        "model-server-gpu",
        "ghcr.io/ggml-org/llama.cpp",
        "server-cuda-b11459",
        GPU_DIGEST,
        "ghcr.io",
        "2026-10-08",
    ),
    "base:node": cp.LockEntry(
        "base:node",
        "public.ecr.aws/docker/library/node",
        "24.21.0-trixie-slim",
        BASE_DIGEST,
        "public.ecr.aws",
        "2026-10-08",
    ),
}
DISCLOSED = {"edge", "gateway", "gateway-state", "model-server-gpu"}


def service(**fields: object) -> dict:
    base: dict = {
        "restart": "unless-stopped",
        "security_opt": ["no-new-privileges:true"],
        "cap_drop": ["ALL"],
        "logging": {"driver": "local", "options": {"max-size": "10m", "max-file": "3"}},
        "networks": {"internal": None},
    }
    base.update(fields)
    return base


def good_model() -> dict:
    """What `docker compose config --no-interpolate --no-path-resolution --format json` renders for a valid stack."""
    return {
        "name": "h4reet-dev",
        "services": {
            "edge": service(
                image=EDGE_IMAGE,
                networks={"edge": None, "internal": None},
                ports=[
                    "127.0.0.1:${H4_API_PORT}:8080",
                    "127.0.0.1:${H4_ADMIN_PORT}:8083",
                ],
                volumes=[
                    {
                        "type": "bind",
                        "source": "${H4_TREE:?set by make up}/deploy/edge/nginx.conf",
                        "target": "/etc/nginx/nginx.conf",
                        "read_only": True,
                    }
                ],
                read_only=True,
                tmpfs=["/tmp"],
            ),
            "gateway": service(
                build={"context": "..", "dockerfile": "services/gateway/Dockerfile"},
                networks={"internal": None, "egress": None},
                environment={
                    "GATEWAY_TEST_CLOCK": "${GATEWAY_TEST_CLOCK:-0}",
                    "GATEWAY_TEST_SYNTHETIC_SPEND": "${GATEWAY_TEST_SYNTHETIC_SPEND:-0}",
                    "TELEMETRY_PAYLOAD_SAMPLING": "${TELEMETRY_PAYLOAD_SAMPLING}",
                    "AWS_PROFILE": "${GATEWAY_AWS_PROFILE:-none}",
                },
                volumes=[
                    {
                        "type": "bind",
                        "source": "${H4_STATE_DIR:?x}/gateway",
                        "target": "/var/lib/h4-gateway",
                    },
                    {
                        "type": "bind",
                        "source": "${H4_AWS_DIR:?x}",
                        "target": "/home/node/.aws",
                        "read_only": True,
                    },
                    {
                        "type": "bind",
                        "source": "${H4_TREE:?x}/config",
                        "target": "/app/config",
                        "read_only": True,
                    },
                ],
            ),
            "gateway-state": service(
                image=DB_IMAGE,
                cap_add=["CHOWN", "SETUID", "SETGID", "FOWNER", "DAC_OVERRIDE"],
                volumes=[
                    {
                        "type": "volume",
                        "source": "gateway-state-data",
                        "target": "/var/lib/postgresql/data",
                    }
                ],
            ),
            "model-server-gpu": service(
                image=GPU_IMAGE,
                profiles=["gpu"],
                volumes=[
                    {
                        "type": "bind",
                        "source": "${H4_MODEL_DIR}",
                        "target": "/models",
                        "read_only": True,
                    }
                ],
                deploy={
                    "resources": {
                        "reservations": {
                            "devices": [
                                {
                                    "driver": "nvidia",
                                    "count": 1,
                                    "capabilities": ["gpu"],
                                }
                            ]
                        }
                    }
                },
            ),
        },
        "networks": {
            "internal": {"internal": True},
            "edge": {"driver": "bridge"},
            "egress": {"driver": "bridge"},
        },
        "volumes": {"gateway-state-data": {}},
        "x-service": {"restart": "unless-stopped"},
    }


def findings(model: dict, tree: Path, disclosed: set[str] = DISCLOSED) -> list:
    return cp.check_model(model, LOCK, tree, disclosed)


def rules(
    model: dict, tree: Path, disclosed: set[str] = DISCLOSED
) -> set[tuple[str, str]]:
    return {
        (f.where.rsplit(" ", 1)[-1], f.rule) for f in findings(model, tree, disclosed)
    }


def test_a_valid_stack_passes(tmp_path: Path) -> None:
    assert findings(good_model(), tmp_path) == []


@pytest.mark.parametrize(
    ("name", "field", "value", "rule"),
    [
        ("gateway", "privileged", True, "privileged"),
        ("gateway", "pid", "host", "pid"),
        ("gateway", "ipc", "service:gateway-state", "ipc"),
        ("gateway", "userns_mode", "host", "userns_mode"),
        ("gateway", "network_mode", "service:gateway-state", "network_mode"),
        ("gateway", "container_name", "gateway", "container_name"),
        ("gateway", "env_file", ["../x.vars"], "env_file"),
        (
            "gateway",
            "extra_hosts",
            ["host.docker.internal:host-gateway"],
            "extra_hosts",
        ),
        ("gateway", "volumes_from", ["gateway-state"], "volumes_from"),
        ("gateway", "devices", ["/dev/dxg:/dev/dxg"], "devices"),
        ("gateway", "device_cgroup_rules", ["c 1:3 mr"], "device_cgroup_rules"),
        ("gateway", "runtime", "nvidia", "runtime"),
        ("gateway", "gpus", "all", "devices"),
        ("gateway", "cap_drop", [], "cap_drop"),
        ("gateway-state", "cap_add", ["CHOWN", "SYS_ADMIN"], "cap_add"),
        ("gateway", "security_opt", [], "security_opt"),
        (
            "gateway",
            "security_opt",
            ["no-new-privileges:true", "seccomp:unconfined"],
            "security_opt",
        ),
        ("gateway", "restart", "always", "restart"),
        ("gateway", "logging", {"driver": "syslog"}, "logging"),
        # The socket and privilege under other names (review round 1 of feat/000-foundations).
        ("gateway", "use_api_socket", True, "use_api_socket"),
        (
            "gateway",
            "post_start",
            [{"command": ["sh", "-c", "id"], "user": "root", "privileged": True}],
            "post_start",
        ),
        ("gateway", "pre_stop", [{"command": ["true"]}], "pre_stop"),
        (
            "gateway",
            "develop",
            {"watch": [{"action": "sync", "path": "/", "target": "/host"}]},
            "develop",
        ),
    ],
)
def test_service_refusals(
    tmp_path: Path, name: str, field: str, value: object, rule: str
) -> None:
    model = good_model()
    model["services"][name][field] = value
    assert (name, rule) in rules(model, tmp_path)


def test_the_docker_socket_is_refused(tmp_path: Path) -> None:
    model = good_model()
    model["services"]["gateway"]["volumes"].append(
        {
            "type": "bind",
            "source": "/var/run/docker.sock",
            "target": "/var/run/docker.sock",
        }
    )
    assert ("gateway", "docker.sock") in rules(model, tmp_path)


def test_the_gpu_reservation_is_model_server_gpus_alone(tmp_path: Path) -> None:
    gpu = good_model()["services"]["model-server-gpu"]["deploy"]
    model = good_model()
    model["services"]["gateway"]["deploy"] = copy.deepcopy(gpu)
    assert ("gateway", "devices") in rules(model, tmp_path)
    model = good_model()
    model["services"]["model-server-gpu"]["profiles"] = ["cpu"]
    assert ("model-server-gpu", "devices") in rules(model, tmp_path)
    model = good_model()
    model["services"]["model-server-gpu"]["deploy"]["resources"]["reservations"][
        "devices"
    ][0]["count"] = "all"
    assert ("model-server-gpu", "devices") in rules(model, tmp_path)


@pytest.mark.parametrize(
    ("volume", "rule"),
    [
        ({"type": "bind", "source": "/home/h4reet", "target": "/h"}, "binds"),
        (
            {"type": "bind", "source": "${H4_TREE}", "target": "/t", "read_only": True},
            "binds",
        ),
        (
            {
                "type": "bind",
                "source": "${H4_TREE}/deploy/../..",
                "target": "/t",
                "read_only": True,
            },
            "binds",
        ),
        (
            {
                "type": "bind",
                "source": "${H4_TREE:-/}/deploy",
                "target": "/t",
                "read_only": True,
            },
            "binds",
        ),
        ({"type": "bind", "source": "${H4_TREE}/config", "target": "/c"}, "binds"),
        ({"type": "bind", "source": "${H4_STATEDIR}/x", "target": "/s"}, "binds"),
        (
            {
                "type": "volume",
                "source": "${H4_TREE}/deploy",
                "target": "/d",
                "volume": {},
            },
            "volumes",
        ),
        ({"type": "volume", "source": "undeclared", "target": "/u"}, "volumes"),
        ({"type": "npipe", "source": "x", "target": "/x"}, "volumes"),
        ("/etc:/host-etc:ro", "binds"),
    ],
)
def test_bind_and_volume_refusals(tmp_path: Path, volume: object, rule: str) -> None:
    model = good_model()
    model["services"]["gateway"]["volumes"].append(volume)
    assert ("gateway", rule) in rules(model, tmp_path)


def test_binds_under_the_roots_pass_and_only_state_is_writable(tmp_path: Path) -> None:
    model = good_model()
    model["services"]["gateway"]["volumes"] += [
        {"type": "bind", "source": "${H4_STATE_DIR}/gateway/journal", "target": "/j"},
        {
            "type": "bind",
            "source": "${H4_TREE}/deploy/otel/collector.yaml",
            "target": "/o",
            "read_only": True,
        },
        {"type": "tmpfs", "target": "/run"},
        "${H4_TREE}/config:/app/config2:ro",
    ]
    assert findings(model, tmp_path) == []


@pytest.mark.parametrize(
    ("name", "ports"),
    [
        ("gateway", ["127.0.0.1:${H4_API_PORT}:8080"]),
        ("edge", ["${H4_API_PORT}:8080"]),
        ("edge", ["8080"]),
        ("edge", ["0.0.0.0:${H4_API_PORT}:8080"]),
        ("edge", ["${H4_HOST:-127.0.0.1}:18000:8080"]),
        ("edge", [{"target": 8080, "published": "18000", "host_ip": "0.0.0.0"}]),
        ("edge", [{"target": 8080, "published": "18000"}]),
    ],
)
def test_port_refusals(tmp_path: Path, name: str, ports: list) -> None:
    model = good_model()
    model["services"][name]["ports"] = ports
    assert (name, "ports") in rules(model, tmp_path)


def test_long_syntax_ports_on_loopback_pass(tmp_path: Path) -> None:
    model = good_model()
    model["services"]["edge"]["ports"] = [
        {
            "mode": "ingress",
            "host_ip": "127.0.0.1",
            "target": 8080,
            "published": "18100",
            "protocol": "tcp",
        }
    ]
    assert findings(model, tmp_path) == []


@pytest.mark.parametrize(
    ("name", "networks"),
    [
        ("gateway-state", {"internal": None, "egress": None}),
        ("gateway", {"internal": None, "egress": None, "edge": None}),
        ("gateway-state", {}),
        ("gateway-state", {"default": None}),
        ("edge", {"edge": None}),
    ],
)
def test_network_refusals(tmp_path: Path, name: str, networks: dict) -> None:
    model = good_model()
    model["services"][name]["networks"] = networks
    assert (name, "networks") in rules(model, tmp_path)


def test_top_level_network_and_volume_refusals(tmp_path: Path) -> None:
    model = good_model()
    model["networks"]["internal"] = {}
    model["networks"]["egress"] = {"driver": "host"}
    model["networks"]["shared"] = {"external": True}
    model["volumes"]["gateway-state-data"] = {
        "driver_opts": {"type": "none", "o": "bind", "device": "/home"}
    }
    model["volumes"]["other"] = {"external": True}
    model["secrets"] = {"s": {"file": "/etc/shadow"}}
    got = {(f.rule, f.detail.split(":")[0]) for f in findings(model, tmp_path)}
    assert ("networks", "internal must be internal") in got
    assert ("networks", "network 'egress' uses driver 'host'") in got
    assert ("external", "network 'shared' is external") in got
    assert ("volumes", "volume 'gateway-state-data'") in got
    assert ("external", "volume 'other' is external") in got
    assert (
        "secrets",
        "top-level secrets bring in host files outside the bind roots",
    ) in got


@pytest.mark.parametrize(
    "image",
    [
        "ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine",
        "ghcr.io/nginx/nginx-unprivileged:latest@" + "sha256:" + "f" * 64,
        "ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine@sha256:" + "f" * 64,
        "docker.io/nginxinc/nginx-unprivileged:1.30.5-alpine@" + EDGE_DIGEST,
    ],
)
def test_images_must_be_pinned_and_match_the_lock(tmp_path: Path, image: str) -> None:
    model = good_model()
    model["services"]["edge"]["image"] = image
    assert ("edge", "image") in rules(model, tmp_path)


def test_an_image_with_no_lock_line_is_refused(tmp_path: Path) -> None:
    model = good_model()
    model["services"]["loki"] = service(
        image="docker.io/grafana/loki:3.7.8@sha256:" + "5" * 64
    )
    assert ("loki", "image") in rules(model, tmp_path, DISCLOSED | {"loki"})


@pytest.mark.parametrize(
    ("build", "rule"),
    [
        ({"context": "/home/h4reet/elsewhere"}, "build.context"),
        ({"context": "../.."}, "build.context"),
        ({"context": "${H4_TREE}"}, "build.context"),
        ({"context": "https://example.invalid/repo.git"}, "build.context"),
        ({"context": "..", "dockerfile": "../Dockerfile"}, "build.dockerfile"),
        (
            {"context": "..", "dockerfile_inline": "FROM busybox"},
            "build.dockerfile_inline",
        ),
        (
            {"context": "..", "additional_contexts": {"x": "/etc"}},
            "build.additional_contexts",
        ),
        ({"context": "..", "network": "host"}, "build.network"),
        ({"context": "..", "entitlements": ["network.host"]}, "build.entitlements"),
        ({"context": "..", "ssh": ["default"]}, "build.ssh"),
        ({"context": "..", "secrets": ["aws"]}, "build.secrets"),
        ({"context": "..", "cache_from": ["type=local,src=/home"]}, "build.cache_from"),
        ({"context": "..", "cache_to": ["type=local,dest=/home"]}, "build.cache_to"),
        ({"context": "..", "extra_hosts": ["x:host-gateway"]}, "build.extra_hosts"),
    ],
)
def test_build_refusals(tmp_path: Path, build: dict, rule: str) -> None:
    model = good_model()
    model["services"]["gateway"]["build"] = build
    assert ("gateway", rule) in rules(model, tmp_path)


def test_a_built_service_names_no_image(tmp_path: Path) -> None:
    model = good_model()
    model["services"]["gateway"]["image"] = "h4reet/gateway:local"
    assert ("gateway", "build") in rules(model, tmp_path)


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("GATEWAY_TEST_CLOCK", "1"),
        ("GATEWAY_TEST_SYNTHETIC_SPEND", "${GATEWAY_TEST_SYNTHETIC_SPEND:-1}"),
        ("TELEMETRY_PAYLOAD_SAMPLING", "on"),
        ("TELEMETRY_PAYLOAD_SAMPLING", "${H4_SAMPLING}"),
    ],
)
def test_compose_never_sets_a_dev_only_switch_itself(
    tmp_path: Path, key: str, value: str
) -> None:
    model = good_model()
    model["services"]["gateway"]["environment"][key] = value
    assert ("gateway", "dev-only switch") in rules(model, tmp_path)


def test_aws_settings_belong_to_the_gateway_alone(tmp_path: Path) -> None:
    model = good_model()
    model["services"]["gateway-state"]["environment"] = ["AWS_REGION=us-east-1"]
    assert ("gateway-state", "environment") in rules(model, tmp_path)


def test_every_service_needs_a_disclosure_row(tmp_path: Path) -> None:
    assert ("gateway-state", "disclosure") in rules(
        good_model(), tmp_path, DISCLOSED - {"gateway-state"}
    )


def test_disclosed_services_read_the_from_cell_only(tmp_path: Path) -> None:
    disclosure = tmp_path / "flows.md"
    disclosure.write_text(
        "| ID | From → To | Trigger |\n|---|---|---|\n"
        "| S1 | `edge` → nothing | – |\n"
        "| S2 | `gateway` → `gateway-state` and the internet | `loki` |\n"
        "| P1 | the host → `ghcr.io` | – |\n",
        encoding="utf-8",
    )
    assert cp.disclosed_services(disclosure) == {"edge", "gateway"}


# ---------------------------------------------------------------------------------------------------------------
# The env files.


def env_findings(tmp_path: Path, text: str) -> list[str]:
    path = tmp_path / "x.vars"
    path.write_text(text, encoding="utf-8")
    values, errors = cp.parse_env_file(path)
    return errors + [f.detail for f in cp.check_env_values("x.vars", values)]


def test_the_prod_template_has_no_dev_only_switch(tmp_path: Path) -> None:
    prod = "H4_ENV=prod\nTELEMETRY_PAYLOAD_SAMPLING=off\n"
    assert env_findings(tmp_path, prod) == []
    assert any(
        "on outside H4_ENV=dev" in f
        for f in env_findings(tmp_path, "H4_ENV=prod\nTELEMETRY_PAYLOAD_SAMPLING=on\n")
    )
    assert any(
        "on outside H4_ENV=dev" in f
        for f in env_findings(tmp_path, "H4_ENV=prod\nGATEWAY_TEST_CLOCK=1\n")
    )
    assert any(
        "exists only in dev" in f
        for f in env_findings(tmp_path, "H4_ENV=prod\nGATEWAY_TEST_SYNTHETIC_SPEND=0\n")
    )


def test_dev_may_switch_them_on_but_only_to_known_values(tmp_path: Path) -> None:
    dev = "H4_ENV=dev\nGATEWAY_TEST_CLOCK=1\nGATEWAY_TEST_SYNTHETIC_SPEND=1\nTELEMETRY_PAYLOAD_SAMPLING=on\n"
    assert env_findings(tmp_path, dev) == []
    assert any(
        "takes" in f
        for f in env_findings(tmp_path, "H4_ENV=dev\nGATEWAY_TEST_CLOCK=yes\n")
    )


def test_env_files_may_not_redirect_compose(tmp_path: Path) -> None:
    got = env_findings(
        tmp_path,
        "H4_ENV=dev\nCOMPOSE_FILE=evil.yaml\nDOCKER_HOST=tcp://x:2375\nCOMPOSE_PROFILES=cpu\n",
    )
    assert any("COMPOSE_FILE" in f for f in got)
    assert any("DOCKER_HOST" in f for f in got)
    assert not any("COMPOSE_PROFILES" in f for f in got)


@pytest.mark.parametrize(
    "line",
    [
        "export A=1",
        "A = 1",
        "a=1",
        "A=has space",
        "A=$HOME",
        "A=${B}",
        "A='open",
        "A=x#y",
    ],
)
def test_the_env_grammar(tmp_path: Path, line: str) -> None:
    path = tmp_path / "x.vars"
    path.write_text(f"# a comment\n\n{line}\n", encoding="utf-8")
    _, errors = cp.parse_env_file(path)
    assert errors and "line 3" in errors[0]


def test_the_env_grammar_allows_single_quotes_and_names_no_value(
    tmp_path: Path,
) -> None:
    path = tmp_path / "x.vars"
    path.write_text("A='p$ss #1'\nB=\nB=again\n", encoding="utf-8")
    values, errors = cp.parse_env_file(path)
    assert values == {"A": "p$ss #1", "B": ""}
    assert errors == ["line 3: B appears twice"]


# ---------------------------------------------------------------------------------------------------------------
# The files in the tree.


def write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def test_env_files_anywhere_in_the_tree_are_refused(tmp_path: Path) -> None:
    for rel in (
        "deploy/env/prod.env",
        "services/x/.env",
        "a/.env.local",
        "deep/ignored/real.env",
    ):
        write(tmp_path / rel, "A=1\n")
    for rel in (
        "deploy/env.example/prod.env.example",
        ".env.example",
        "deploy/env.agents/dev-cpu.vars",
    ):
        write(tmp_path / rel, "A=1\n")
    write(tmp_path / "node_modules/pkg/.env", "A=1\n")
    found, _ = cp.check_tree(tmp_path, LOCK)
    assert sorted(f.where for f in found if f.rule == "env file") == [
        "a/.env.local",
        "deep/ignored/real.env",
        "deploy/env/prod.env",
        "services/x/.env",
    ]


def test_dockerfile_from_lines(tmp_path: Path) -> None:
    write(
        tmp_path / "services/gateway/Dockerfile",
        "# syntax comment\n"
        "ARG NODE=24.21.0\n"
        f"FROM --platform=linux/amd64 public.ecr.aws/docker/library/node:${{NODE}}-trixie-slim@{BASE_DIGEST} AS build\n"
        "RUN echo \\\n  hi\n"
        "FROM build AS test\n"
        "FROM scratch\n",
    )
    write(
        tmp_path / "evals/Dockerfile.probe",
        "FROM public.ecr.aws/docker/library/python:3.12.15-slim-trixie\n",
    )
    write(
        tmp_path / "x/y.Dockerfile",
        f"FROM public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:{'9' * 64}\n",
    )
    write(
        tmp_path / "z/Dockerfile",
        "ARG LATER\nFROM ghcr.io/x/y:${LATER}@" + BASE_DIGEST + "\n",
    )
    found, _ = cp.check_tree(tmp_path, LOCK)
    got = {(f.where, f.detail.rsplit(": ", 1)[-1]) for f in found if f.rule == "FROM"}
    assert got == {
        ("evals/Dockerfile.probe:1", "not pinned by digest"),
        ("x/y.Dockerfile:1", "not in deploy/images.lock"),
        ("z/Dockerfile:2", "a build argument without a default"),
    }


def test_the_devcontainer_rules(tmp_path: Path) -> None:
    write(
        tmp_path / cp.DEVCONTAINER_FILE,
        json.dumps(
            {
                "features": {"ghcr.io/devcontainers/features/node:1": {}},
                "initializeCommand": "id",
                "mounts": ["source=/home,target=/h,type=bind"],
                "runArgs": [
                    "--cap-drop=ALL",
                    "--security-opt=no-new-privileges",
                    "--privileged",
                    "--security-opt=seccomp=unconfined",
                    "--network=host",
                    "--env-file=/home/h4reet/.config/h4reet-ai/env/prod.env",
                ],
                "containerEnv": {"T": "${localEnv:TELEGRAM_BOT_TOKEN}"},
            }
        ),
    )
    found, _ = cp.check_tree(tmp_path, LOCK)
    got = sorted((f.rule, f.detail.split(":")[0]) for f in found)
    assert got == [
        ("features", "features are fetched unpinned (plan §9)"),
        ("initializeCommand", "initializeCommand runs on the host"),
        ("localEnv", "${localEnv"),
        ("mounts", "host mounts reach the Author's files"),
        ("runArgs", "--env-file=/home/h4reet/.config/h4reet-ai/env/prod.env"),
        ("runArgs", "--network=host"),
        ("runArgs", "--privileged"),
        ("runArgs", "--security-opt=seccomp=unconfined"),
    ]


def test_the_real_devcontainer_passes() -> None:
    assert cp.check_devcontainer(REPO / cp.DEVCONTAINER_FILE) == []


def test_npmrc_keys(tmp_path: Path) -> None:
    write(tmp_path / ".npmrc", "fund=false\nignore-scripts=true\n; a comment\n")
    write(
        tmp_path / "services/x/.npmrc",
        "node-options=--require /tmp/x.js\nscript-shell=/tmp/sh\nignore-scripts=false\n",
    )
    found, _ = cp.check_tree(tmp_path, LOCK)
    assert sorted(f.where for f in found if f.rule == ".npmrc") == [
        "services/x/.npmrc:1",
        "services/x/.npmrc:2",
        "services/x/.npmrc:3",
    ]


# ---------------------------------------------------------------------------------------------------------------
# Parsers.


def test_the_lock_parser(tmp_path: Path) -> None:
    good = f"# header\nedge ghcr.io/nginx/nginx-unprivileged 1.30.5-alpine {EDGE_DIGEST} ghcr.io 2026-10-08\nseaweedfs docker.io/chrislusf/seaweedfs - - docker.io -\n"
    path = write(tmp_path / "images.lock", good)
    entries = cp.parse_lock(path)
    assert entries["edge"].digest == EDGE_DIGEST and entries["seaweedfs"].tag == "-"
    for bad in (
        good + "edge a b c d e\n",
        "edge a b\n",
        "edge r t sha256:abc ghcr.io 2026-10-08\n",
    ):
        write(path, bad)
        with pytest.raises(cp.PolicyError):
            cp.parse_lock(path)


def test_references_and_names() -> None:
    assert cp.split_reference(EDGE_IMAGE) == (
        "ghcr.io/nginx/nginx-unprivileged",
        "1.30.5-alpine",
        EDGE_DIGEST,
    )
    assert cp.split_reference("localhost:5000/x@" + EDGE_DIGEST) == (
        "localhost:5000/x",
        None,
        EDGE_DIGEST,
    )
    assert cp.split_reference("busybox") == ("busybox", None, None)
    assert cp.normalize_repository("nvidia/cuda") == "docker.io/nvidia/cuda"
    assert cp.normalize_repository("postgres") == "docker.io/library/postgres"
    assert (
        cp.normalize_repository("quay.io/prometheus/prometheus")
        == "quay.io/prometheus/prometheus"
    )
    assert cp.strip_required("${H4_TREE:?set by make up}/deploy") == "${H4_TREE}/deploy"
    assert cp.strip_required("${H4_TREE?x}") == "${H4_TREE}"


# ---------------------------------------------------------------------------------------------------------------
# The real files: through PyYAML, and end to end through docker compose config where the CLI is installed.

REAL_FILES = (
    cp.COMPOSE_FILE,
    cp.LOCK_FILE,
    cp.DISCLOSURE_FILE,
    cp.DEVCONTAINER_FILE,
    ".devcontainer/Dockerfile",
    *(env for _, env in cp.ENV_FILES),
)
needs_compose = pytest.mark.skipif(
    not cp.compose_available(), reason="the docker CLI with compose isn't installed"
)


def test_the_real_compose_file_passes_as_written() -> None:
    """The raw file, through PyYAML (short-syntax ports, anchors), meets every compose rule too."""
    model = yaml.safe_load((REPO / cp.COMPOSE_FILE).read_text(encoding="utf-8"))
    lock = cp.parse_lock(REPO / cp.LOCK_FILE)
    disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
    assert cp.check_model(model, lock, REPO, disclosed) == []


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    for rel in REAL_FILES:
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / rel, tmp_path / rel)
    return tmp_path


@needs_compose
def test_the_real_files_pass(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert cp.run(tree) == 0
    assert "compose policy: PASS" in capsys.readouterr().out


@needs_compose
def test_end_to_end_refusals(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    compose = tree / cp.COMPOSE_FILE
    # gateway-state's own networks line, the first after its name: it alone joins egress below.
    head, name, tail = compose.read_text(encoding="utf-8").partition(
        "  gateway-state:\n"
    )
    assert name and "networks: [internal]\n" in tail
    compose.write_text(
        head
        + name
        + tail.replace("networks: [internal]\n", "networks: [internal, egress]\n", 1),
        encoding="utf-8",
    )
    write(tree / "deploy/stray.env", "A=1\n")
    assert cp.run(tree) == 1
    out = capsys.readouterr().out
    assert (
        "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress"
        in out
    )
    assert "FAIL deploy/stray.env: env file" in out
    assert "compose policy: 2 refusal(s)" in out


def test_the_callers_environment_never_reaches_compose(
    tree: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """compose gets PATH, HOME, and LC_ALL alone: a COMPOSE_* or H4_* variable in the shell can't override a file."""
    calls: list[dict] = []

    def fake_run(command: list[str], **kwargs: object) -> object:
        calls.append({"command": command, **kwargs})
        return cp.subprocess.CompletedProcess(command, 0, json.dumps(good_model()), "")

    monkeypatch.setenv("COMPOSE_FILE", "/elsewhere/override.yaml")
    monkeypatch.setenv("H4_TREE", "/")
    monkeypatch.setattr(cp.subprocess, "run", fake_run)
    model = cp.compose_config(tree, "dev-cpu", "deploy/env.agents/dev-cpu.vars")
    assert model["services"]["edge"]["image"] == EDGE_IMAGE
    (call,) = calls
    assert set(call["env"]) == {"PATH", "HOME", "LC_ALL"}
    assert call["command"][:5] == ["docker", "compose", "-p", "h4reet-dev-cpu", "-f"]
    assert call["command"][-7:] == [
        "--env-file",
        str(tree / "deploy/env.agents/dev-cpu.vars"),
        "config",
        "--no-interpolate",
        "--no-path-resolution",
        "--format",
        "json",
    ]


def test_without_compose_it_skips(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cp, "compose_available", lambda: False)
    assert cp.run(REPO) == 0
    assert capsys.readouterr().out.startswith("SKIP: ")


def test_the_state_root_is_the_gateways_corner_only(tmp_path: Path) -> None:
    # The run file and the exports sit beside it, and the Author's terminal runs the exports' scripts.
    for source in (
        "${H4_STATE_DIR}/tree",
        "${H4_STATE_DIR}/run.env",
        "${H4_STATE_DIR}",
    ):
        model = good_model()
        model["services"]["gateway"]["volumes"].append(
            {"type": "bind", "source": source, "target": "/s", "read_only": True}
        )
        assert ("gateway", "binds") in rules(model, tmp_path), source


def test_a_network_or_volume_named_for_another_stack_is_refused(tmp_path: Path) -> None:
    model = good_model()
    model["networks"]["internal"]["name"] = (
        "h4reet-prod_internal"  # good_model is the dev stack
    )
    model["volumes"]["gateway-state-data"] = {"name": "h4reet-prod_gateway-state-data"}
    details = {f.detail for f in findings(model, tmp_path) if f.rule == "name"}
    assert any("network 'internal'" in d for d in details)
    assert any("volume 'gateway-state-data'" in d for d in details)
    own = good_model()
    own["networks"]["internal"]["name"] = (
        "h4reet-dev_internal"  # its own name, as compose renders it
    )
    assert not [f for f in findings(own, tmp_path) if f.rule == "name"]


def test_provider_services_and_models_are_refused(tmp_path: Path) -> None:
    model = good_model()
    model["services"]["gateway"]["provider"] = {"type": "model"}
    model["services"]["gateway"]["models"] = ["m"]
    model["models"] = {"m": {"model": "ai/x"}}
    got = rules(model, tmp_path)
    assert ("gateway", "provider") in got and ("gateway", "models") in got
    assert any(
        f.rule == "models" and "top-level" in f.detail
        for f in findings(model, tmp_path)
    )
