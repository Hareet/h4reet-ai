"""deploy/compose.yaml against plan §1 and §2 and contracts/env-files.md §2–§6: each service, and what it reads.

The compose policy (tools/gates/compose_policy.py) holds the rules every service shares; this file checks what each
service of the topology is: its image, binds, health check, limits, and exactly the variables it receives.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
COMPOSE = yaml.safe_load((REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8"))
SERVICES = COMPOSE["services"]
ENV_FILES = {
    "prod": REPO / "deploy" / "env.example" / "prod.env.example",
    "dev": REPO / "deploy" / "env.example" / "dev.env.example",
    "dev-cpu": REPO / "deploy" / "env.agents" / "dev-cpu.vars",
}
RUN_FILE_KEYS = {
    "H4_TREE",
    "H4_REF",
    "H4_REF_BRANCH",
    "H4_REF_PREVIOUS",
}  # contracts/env-files.md §12
VAR = re.compile(r"\$\{([A-Z_][A-Z0-9_]*)(:?[-?][^}]*)?\}")


def keys(path: Path) -> set[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return {ln.split("=", 1)[0] for ln in lines if ln and not ln.startswith("#")}


def lock() -> dict[str, str]:
    out = {}
    for line in (
        (REPO / "deploy" / "images.lock").read_text(encoding="utf-8").splitlines()
    ):
        if line.strip() and not line.startswith("#"):
            service, repository, tag, digest, *_ = line.split()
            out[service] = f"{repository}:{tag}@{digest}"
    return out


def strings(node: object):
    if isinstance(node, dict):
        for value in node.values():
            yield from strings(value)
    elif isinstance(node, list):
        for value in node:
            yield from strings(value)
    elif isinstance(node, str):
        yield node


def test_the_topology_of_this_branch() -> None:
    assert set(SERVICES) == {
        "edge",
        "gateway",
        "gateway-state",
        "model-server-gpu",
        "model-server-cpu",
    }
    assert COMPOSE["networks"] == {
        "internal": {"internal": True},
        "edge": {"driver": "bridge"},
        "egress": {"driver": "bridge"},
    }
    assert COMPOSE["volumes"] == {"gateway-state-data": {}}
    assert "name" not in COMPOSE  # make passes -p h4reet-<stack>


@pytest.mark.parametrize("name", sorted(SERVICES))
def test_every_service_follows_plan_1(name: str) -> None:
    service = SERVICES[name]
    assert service["restart"] == "unless-stopped"
    assert service["security_opt"] == ["no-new-privileges:true"]
    assert service["cap_drop"] == ["ALL"]
    assert service["logging"] == {
        "driver": "local",
        "options": {"max-size": "10m", "max-file": "3"},
    }
    assert "internal" in service["networks"]
    for absent in (
        "env_file",
        "container_name",
        "network_mode",
        "depends_on",
        "privileged",
        "devices",
    ):
        assert absent not in service, absent


def test_only_edge_publishes_and_only_on_loopback() -> None:
    assert SERVICES["edge"]["ports"] == [
        "127.0.0.1:${H4_API_PORT}:8080",
        "127.0.0.1:${H4_LANGFUSE_PORT}:8081",
        "127.0.0.1:${H4_GRAFANA_PORT}:8082",
        "127.0.0.1:${H4_ADMIN_PORT}:8083",
        "127.0.0.1:${H4_OTLP_PORT}:8084",
    ]
    assert [n for n, s in SERVICES.items() if s.get("ports")] == ["edge"]
    assert [n for n, s in SERVICES.items() if "edge" in s["networks"]] == ["edge"]
    assert [n for n, s in SERVICES.items() if "egress" in s["networks"]] == ["gateway"]
    assert SERVICES["gateway-state"]["networks"] == ["internal"]


def test_images_are_the_locked_pins() -> None:
    pins = lock()
    for name in ("edge", "gateway-state", "model-server-gpu", "model-server-cpu"):
        assert SERVICES[name]["image"] == pins[name], name
    assert "image" not in SERVICES["gateway"]


# plan §3: the one llama.cpp build, b11459, in two variants; the flags each runs with, and those it never does.
MODEL_SERVER_FLAGS = [
    "-m",
    "/models/${MODEL_FILE}",
    "--alias",
    "${MODEL_ALIAS}",
    "--host",
    "0.0.0.0",
    "--port",
    "8080",
    "-c",
    "${MODEL_CTX_SIZE}",
    "-np",
    "${MODEL_PARALLEL}",
]
MODEL_SERVER_SWITCHES = ["--jinja", "--metrics", "--no-webui", "--no-slots"]


def test_the_model_servers() -> None:
    gpu, cpu = SERVICES["model-server-gpu"], SERVICES["model-server-cpu"]
    assert gpu["profiles"] == ["gpu"] and cpu["profiles"] == ["cpu"]
    assert gpu["command"] == [
        *MODEL_SERVER_FLAGS,
        "-ngl",
        "999",
        *MODEL_SERVER_SWITCHES,
    ]
    assert cpu["command"] == [
        *MODEL_SERVER_FLAGS,
        "-ngl",
        "0",
        "-t",
        "${MODEL_THREADS}",
        *MODEL_SERVER_SWITCHES,
    ]
    for server in (gpu, cpu):
        # The gateway's LOCAL_MODEL_BASE_URL names model-server, whichever variant runs.
        assert server["networks"] == {"internal": {"aliases": ["model-server"]}}
        # It never downloads, never logs prompts, shows no slots, and has no key: only this stack reaches it.
        for absent in ("-hf", "--hf-repo", "-v", "--verbose", "--slots", "--api-key"):
            assert absent not in server["command"], absent
        # It reads nothing from the env file but its command line.
        assert "environment" not in server
    # The GPU is reserved in the gpu profile only.
    assert gpu["deploy"]["resources"]["reservations"] == {
        "devices": [{"driver": "nvidia", "count": 1, "capabilities": ["gpu"]}]
    }
    assert "reservations" not in cpu["deploy"]["resources"]
    assert [
        n
        for n, s in SERVICES.items()
        if "reservations" in s.get("deploy", {}).get("resources", {})
    ] == ["model-server-gpu"]
    # Same server, same image build: only the backend differs (ADR 0019).
    assert gpu["image"].startswith("ghcr.io/ggml-org/llama.cpp:server-cuda-b11459@")
    assert cpu["image"].startswith("ghcr.io/ggml-org/llama.cpp:server-b11459@")


def test_the_gateway_builds_from_this_files_own_tree() -> None:
    assert SERVICES["gateway"]["build"] == {
        "context": "..",
        "dockerfile": "services/gateway/Dockerfile",
        "args": {"HTTP_PROXY": "${H4_BUILD_PROXY}", "HTTPS_PROXY": "${H4_BUILD_PROXY}"},
    }


def binds(name: str) -> list[tuple[str, str, bool]]:
    return [
        (v["source"], v["target"], bool(v.get("read_only")))
        for v in SERVICES[name].get("volumes", [])
        if v["type"] == "bind"
    ]


def test_binds_and_volumes() -> None:
    assert binds("edge") == [
        (
            "${H4_TREE:?set by make up}/deploy/edge/nginx.conf",
            "/etc/nginx/nginx.conf",
            True,
        )
    ]
    assert binds("gateway") == [
        ("${H4_STATE_DIR:?set by the env file}/gateway", "/var/lib/h4-gateway", False),
        ("${H4_AWS_DIR:?set by the env file}", "/home/node/.aws", True),
        ("${H4_TREE:?set by make up}/config", "/app/config", True),
    ]
    assert SERVICES["gateway-state"]["volumes"] == [
        {
            "type": "volume",
            "source": "gateway-state-data",
            "target": "/var/lib/postgresql/data",
        }
    ]
    for name in ("model-server-gpu", "model-server-cpu"):
        # The read-only model cache, shared by prod and dev (plan §1).
        assert binds(name) == [
            ("${H4_MODEL_DIR:?set by the env file}", "/models", True)
        ]


def test_read_only_roots_where_the_image_allows() -> None:
    for name in ("edge", "gateway"):
        assert SERVICES[name]["read_only"] is True
        assert SERVICES[name]["tmpfs"] == ["/tmp"]
    assert "read_only" not in SERVICES["gateway-state"]


def test_only_the_database_adds_capabilities_back() -> None:
    assert SERVICES["gateway-state"]["cap_add"] == [
        "CHOWN",
        "SETUID",
        "SETGID",
        "FOWNER",
        "DAC_OVERRIDE",
    ]
    assert "cap_add" not in SERVICES["edge"] and "cap_add" not in SERVICES["gateway"]


@pytest.mark.parametrize(
    ("name", "cpus", "memory"),
    [
        ("edge", "0.25", "64M"),
        ("gateway", "1", "512M"),
        ("gateway-state", "0.5", "256M"),
        ("model-server-gpu", "4", "8G"),
        ("model-server-cpu", "4", "2G"),
    ],
)
def test_limits_are_plan_2s(name: str, cpus: str, memory: str) -> None:
    assert SERVICES[name]["deploy"]["resources"]["limits"] == {
        "cpus": cpus,
        "memory": memory,
    }


def test_health_checks() -> None:
    assert SERVICES["edge"]["healthcheck"]["test"] == [
        "CMD",
        "wget",
        "-qO-",
        "http://127.0.0.1:8090/ping",
    ]
    probe = SERVICES["gateway"]["healthcheck"]["test"]
    assert (
        probe[:3] == ["CMD", "node", "-e"]
        and "http://127.0.0.1:8080/health/live" in probe[3]
    )
    assert SERVICES["gateway-state"]["healthcheck"]["test"] == [
        "CMD",
        "pg_isready",
        "-U",
        "gateway",
        "-d",
        "gateway",
    ]
    # The model server's /health is 503 while the model loads, 200 once it's ready (plan §3).
    for name, start in (("model-server-gpu", "300s"), ("model-server-cpu", "60s")):
        check = SERVICES[name]["healthcheck"]
        assert check["test"] == ["CMD", "curl", "-fsS", "http://127.0.0.1:8080/health"]
        assert check["start_period"] == start, name


def test_edge_runs_nginx_without_the_entrypoint_scripts() -> None:
    assert SERVICES["edge"]["entrypoint"] == ["nginx"]
    assert SERVICES["edge"]["command"] == ["-g", "daemon off;"]


# The gateway's environment: contracts/env-files.md §2 and §4 ("Set by compose on the gateway") and
# contracts/telemetry.md §3.1, exactly, and nothing else.
GATEWAY_FROM_ENV_FILE = {
    "H4_STACK": "${H4_STACK}",
    "H4_ENV": "${H4_ENV}",
    "H4_LANGFUSE_PORT": "${H4_LANGFUSE_PORT}",
    "H4_GRAFANA_PORT": "${H4_GRAFANA_PORT}",
    "GATEWAY_DB_PASSWORD": "${GATEWAY_DB_PASSWORD}",
    "GATEWAY_GRAFANA_RO_PASSWORD": "${GATEWAY_GRAFANA_RO_PASSWORD}",
    "LOCAL_MODEL_BASE_URL": "${LOCAL_MODEL_BASE_URL}",
    "LOCAL_MODEL_NAME": "${MODEL_ALIAS}",
    "OPERATOR_TOKEN_SHA256": "${OPERATOR_TOKEN_SHA256}",
    "ALERT_DELIVERY": "${ALERT_DELIVERY}",
    "TELEGRAM_API_BASE": "${TELEGRAM_API_BASE}",
    "TELEGRAM_BOT_TOKEN": "${TELEGRAM_BOT_TOKEN}",
    "TELEGRAM_CHAT_ID": "${TELEGRAM_CHAT_ID}",
    "SMTP_HOST": "${SMTP_HOST}",
    "SMTP_PORT": "${SMTP_PORT}",
    "SMTP_TLS": "${SMTP_TLS}",
    "SMTP_USER": "${SMTP_USER}",
    "SMTP_PASSWORD": "${SMTP_PASSWORD}",
    "ALERT_EMAIL_FROM": "${ALERT_EMAIL_FROM}",
    "ALERT_EMAIL_TO": "${ALERT_EMAIL_TO}",
    "GATEWAY_TEST_CLOCK": "${GATEWAY_TEST_CLOCK:-0}",
    "GATEWAY_TEST_SYNTHETIC_SPEND": "${GATEWAY_TEST_SYNTHETIC_SPEND:-0}",
    "TELEMETRY_PAYLOAD_SAMPLING": "${TELEMETRY_PAYLOAD_SAMPLING}",
    "AWS_PROFILE": "${GATEWAY_AWS_PROFILE:-none}",
}
GATEWAY_FIXED = {
    "GATEWAY_STATE_DIR": "/var/lib/h4-gateway",
    "GATEWAY_DB_HOST": "gateway-state",
    "GATEWAY_DB_PORT": "5432",
    "GATEWAY_DB_NAME": "gateway",
    "GATEWAY_DB_USER": "gateway",
    "AWS_EC2_METADATA_DISABLED": "true",
    "HOME": "/home/node",
    "TZ": "UTC",
    "NODE_ENV": "production",
    "OTEL_SERVICE_NAME": "gateway",
    "OTEL_RESOURCE_ATTRIBUTES": "service.namespace=h4reet,deployment.environment.name=${H4_STACK},service.instance.id=${H4_STACK}-gateway",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://otel-collector:4318",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_TIMEOUT": "5000",
    "OTEL_TRACES_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_METRIC_EXPORT_INTERVAL": "10000",
    "OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE": "cumulative",
    "OTEL_NODE_RESOURCE_DETECTORS": "env",
    "OTEL_TRACES_SAMPLER": "parentbased_always_on",
}


def test_the_gateway_receives_exactly_its_variables() -> None:
    assert SERVICES["gateway"]["environment"] == {
        **GATEWAY_FROM_ENV_FILE,
        **GATEWAY_FIXED,
    }


def test_the_database_receives_only_its_own() -> None:
    assert SERVICES["gateway-state"]["environment"] == {
        "POSTGRES_DB": "gateway",
        "POSTGRES_USER": "gateway",
        "POSTGRES_PASSWORD": "${GATEWAY_DB_PASSWORD}",
    }
    assert "environment" not in SERVICES["edge"]


def test_no_aws_key_outside_the_gateway() -> None:
    for name, service in SERVICES.items():
        if name != "gateway":
            assert not [
                k for k in service.get("environment", {}) if k.startswith("AWS_")
            ], name


def test_the_build_proxy_is_a_build_argument_never_a_variable() -> None:
    for name, service in SERVICES.items():
        environment = service.get("environment", {})
        assert not {"HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"} & set(
            environment
        ), name
        assert "H4_BUILD_PROXY" not in str(environment), name


def test_every_variable_compose_reads_is_in_the_env_files() -> None:
    """A variable without a default is in every env file (H4_TREE comes from the run file on host stacks); one
    with a default is in at least one, so a misspelled name can't silently take its default."""
    every = {stack: keys(path) for stack, path in ENV_FILES.items()}
    used: dict[str, bool] = {}
    for text in strings(COMPOSE["services"]):
        for name, modifier in VAR.findall(text):
            has_default = modifier.startswith((":-", "-"))
            used[name] = used.get(name, True) and has_default
    assert used, "compose reads no variables?"
    for name, has_default in sorted(used.items()):
        holders = [stack for stack, found in every.items() if name in found]
        if has_default:
            assert holders, f"{name}: in no env file"
        else:
            missing = [
                s
                for s in every
                if name not in every[s]
                and not (name in RUN_FILE_KEYS and s != "dev-cpu")
            ]
            assert not missing, f"{name}: missing from {missing}"
