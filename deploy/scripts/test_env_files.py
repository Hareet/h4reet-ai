"""The committed env files against contracts/env-files.md §1–§7: the two templates and dev-cpu's dummies."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
FILES = {
    "prod": REPO / "deploy" / "env.example" / "prod.env.example",
    "dev": REPO / "deploy" / "env.example" / "dev.env.example",
    "dev-cpu": REPO / "deploy" / "env.agents" / "dev-cpu.vars",
}
PLACEHOLDERS = ("__GENERATE__", "__ASK__", "__REPO__", "__HOME__")


def parse(path: Path) -> dict[str, str]:
    """contracts/env-files.md §1.1, strictly: these files use no quotes at all."""
    values: dict[str, str] = {}
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        assert sep and re.fullmatch(r"[A-Z][A-Z0-9_]*", key), f"{path.name}:{number}"
        assert key not in values, f"{path.name}:{number}: {key} twice"
        assert not re.search(r"[\s$\"'`\\#]", value), f"{path.name}:{number}: {key}"
        values[key] = value
    return values


ENV = {stack: parse(path) for stack, path in FILES.items()}
TEST_SWITCHES = {"GATEWAY_TEST_CLOCK", "GATEWAY_TEST_SYNTHETIC_SPEND"}
GENERATED = {
    "GATEWAY_DB_PASSWORD",
    "GATEWAY_GRAFANA_RO_PASSWORD",
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "LANGFUSE_SALT",
    "LANGFUSE_ENCRYPTION_KEY",
    "LANGFUSE_NEXTAUTH_SECRET",
    "LANGFUSE_DB_PASSWORD",
    "LANGFUSE_INIT_USER_PASSWORD",
    "CLICKHOUSE_PASSWORD",
    "VALKEY_PASSWORD",
    "SEAWEEDFS_S3_ACCESS_KEY",
    "SEAWEEDFS_S3_SECRET_KEY",
    "GF_SECURITY_ADMIN_PASSWORD",
}
CHANNELS = {
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "ALERT_EMAIL_FROM",
    "ALERT_EMAIL_TO",
}


def test_the_key_sets_differ_only_where_the_contract_says() -> None:
    dev = set(ENV["dev"])
    assert set(ENV["dev-cpu"]) == dev | {
        "H4_TREE",
        "H4_DEVCPU_OPERATOR_TOKEN",
    }  # §6.1, P4
    assert set(ENV["prod"]) == (dev - TEST_SWITCHES) | {
        "GATEWAY_AWS_PROFILE"
    }  # §4, §7.1
    assert (
        "H4_TREE" not in ENV["prod"] and "H4_TREE" not in ENV["dev"]
    )  # from the run file (§12)


STACK_KEYS = {
    "prod": {
        "H4_STACK": "prod",
        "H4_ENV": "prod",
        "COMPOSE_PROJECT_NAME": "h4reet-prod",
        "COMPOSE_PROFILES": "gpu",
        "H4_MODEL_DIR": "__HOME__/.local/share/h4reet/models",
        "H4_STATE_DIR": "__HOME__/.local/state/h4reet/prod",
        "H4_AWS_DIR": "__HOME__/.config/h4reet-ai/aws-home/.aws",
        "H4_VHDX_MOUNT": "/mnt/c",
        "H4_BUILD_PROXY": "",
    },
    "dev": {
        "H4_STACK": "dev",
        "H4_ENV": "dev",
        "COMPOSE_PROJECT_NAME": "h4reet-dev",
        "COMPOSE_PROFILES": "gpu,dev-receivers",
        "H4_MODEL_DIR": "__HOME__/.local/share/h4reet/models",
        "H4_STATE_DIR": "__HOME__/.local/state/h4reet/dev",
        "H4_AWS_DIR": "__REPO__/deploy/aws-none",
        "H4_VHDX_MOUNT": "/mnt/c",
        "H4_BUILD_PROXY": "",
    },
    "dev-cpu": {
        "H4_STACK": "dev-cpu",
        "H4_ENV": "dev",
        "COMPOSE_PROJECT_NAME": "h4reet-dev-cpu",
        "COMPOSE_PROFILES": "cpu,dev-receivers",
        "H4_TREE": "/run/h4agents/tree",
        "H4_MODEL_DIR": "/run/h4agents/models",
        "H4_STATE_DIR": "/var/lib/h4agents/state/dev-cpu",
        "H4_AWS_DIR": "/run/h4agents/tree/deploy/aws-none",
        "H4_VHDX_MOUNT": "/mnt/c",
        "H4_BUILD_PROXY": "http://198.18.0.1:3128",
    },
}
BASE_PORT = {"prod": 18000, "dev": 18100, "dev-cpu": 18300}
PORT_KEYS = (
    "H4_API_PORT",
    "H4_LANGFUSE_PORT",
    "H4_GRAFANA_PORT",
    "H4_ADMIN_PORT",
    "H4_OTLP_PORT",
    # x005, the room's site (spec 002, contracts/web-serving.md §4).
    "H4_SITE_PORT",
)
# The web image's tag suffix, which says whether it holds the room's drafts (spec 002, contracts/web-serving.md §1 and
# §4): never on prod.
WEB_SUFFIX = {"prod": "", "dev": "-drafts", "dev-cpu": "-drafts"}


@pytest.mark.parametrize("stack", sorted(FILES))
def test_the_stack_keys(stack: str) -> None:
    env = ENV[stack]
    assert {k: env[k] for k in STACK_KEYS[stack]} == STACK_KEYS[stack]
    assert [env[k] for k in PORT_KEYS] == [str(BASE_PORT[stack] + i) for i in range(6)]
    assert env["H4_WEB_SUFFIX"] == WEB_SUFFIX[stack]


# Prod's two slots of 16,384 tokens each hold a spec 007 twin turn (contracts/env-files.md §3; spec 007's plan, D27).
MODEL = {
    "prod": ("Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf", "32768", "2"),
    "dev": ("qwen2.5-0.5b-instruct-q4_k_m.gguf", "8192", "2"),
    "dev-cpu": ("qwen2.5-0.5b-instruct-q4_k_m.gguf", "8192", "2"),
}


@pytest.mark.parametrize("stack", sorted(FILES))
def test_the_model_keys(stack: str) -> None:
    env = ENV[stack]
    assert (env["MODEL_FILE"], env["MODEL_CTX_SIZE"], env["MODEL_PARALLEL"]) == MODEL[
        stack
    ]
    assert int(env["MODEL_CTX_SIZE"]) % int(env["MODEL_PARALLEL"]) == 0
    assert env["MODEL_THREADS"] == "4"
    assert env["LOCAL_MODEL_BASE_URL"] == "http://model-server:8080/v1"
    assert re.fullmatch(r"[a-z0-9][a-z0-9.-]*", env["MODEL_ALIAS"])
    assert (
        ENV["dev"]["MODEL_ALIAS"]
        == ENV["dev-cpu"]["MODEL_ALIAS"]
        != ENV["prod"]["MODEL_ALIAS"]
    )


def test_prods_gateway_keys() -> None:
    env = ENV["prod"]
    assert env["ALERT_DELIVERY"] == "real"
    assert env["TELEGRAM_API_BASE"] == "https://api.telegram.org"
    assert env["GATEWAY_AWS_PROFILE"] == "h4reet-bedrock"
    assert env["TELEMETRY_PAYLOAD_SAMPLING"] == "off"
    assert env["OPERATOR_TOKEN_SHA256"] == "__ASK__"
    assert {k: env[k] for k in CHANNELS | {"SMTP_TLS"}} == dict.fromkeys(
        CHANNELS | {"SMTP_TLS"}, "__ASK__"
    )


def test_devs_gateway_keys() -> None:
    env = ENV["dev"]
    assert env["ALERT_DELIVERY"] == "standin"
    assert env["TELEGRAM_API_BASE"] == "https://api.telegram.org"
    assert env["OPERATOR_TOKEN_SHA256"] == "__ASK__"
    assert {k: env[k] for k in CHANNELS} == dict.fromkeys(
        CHANNELS, ""
    )  # optional until the recorded run
    assert env["SMTP_TLS"] in ("implicit", "starttls")
    assert {k: env[k] for k in TEST_SWITCHES} == dict.fromkeys(TEST_SWITCHES, "1")
    assert env["TELEMETRY_PAYLOAD_SAMPLING"] == "off"


@pytest.mark.parametrize("stack", ["prod", "dev"])
def test_the_templates_generate_every_secret_and_hold_no_value(stack: str) -> None:
    env = ENV[stack]
    assert {k: env[k] for k in GENERATED} == dict.fromkeys(GENERATED, "__GENERATE__")
    assert env["LANGFUSE_INIT_USER_EMAIL"] == "operator@h4reet.local"


def test_dev_cpus_keys() -> None:
    env = ENV["dev-cpu"]
    assert env["ALERT_DELIVERY"] == "standin"
    assert env["TELEGRAM_API_BASE"] == "http://telegram-standin:8080"
    assert (env["SMTP_HOST"], env["SMTP_PORT"], env["SMTP_TLS"]) == (
        "mailpit",
        "1025",
        "none",
    )
    assert env["TELEGRAM_CHAT_ID"] == "0"
    assert (env["ALERT_EMAIL_FROM"], env["ALERT_EMAIL_TO"]) == (
        "alerts@h4reet.local",
        "operator@h4reet.local",
    )
    assert {k: env[k] for k in TEST_SWITCHES} == dict.fromkeys(TEST_SWITCHES, "1")
    assert env["TELEMETRY_PAYLOAD_SAMPLING"] == "off"


def test_dev_cpus_dummies_have_their_keys_shapes() -> None:
    """§6.1: the same validators pass, and each dummy is plainly a dummy: devcpu..., or a repeated pattern."""
    env = ENV["dev-cpu"]
    assert not any(p in v for v in env.values() for p in PLACEHOLDERS)
    uuid = r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
    assert re.fullmatch(rf"pk-lf-{uuid}", env["LANGFUSE_PUBLIC_KEY"])
    assert re.fullmatch(rf"sk-lf-{uuid}", env["LANGFUSE_SECRET_KEY"])
    assert re.fullmatch(r"[0-9A-F]{20}", env["SEAWEEDFS_S3_ACCESS_KEY"])
    hex_keys = GENERATED - {
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "SEAWEEDFS_S3_ACCESS_KEY",
    }
    for key in hex_keys:
        value = env[key]
        assert re.fullmatch(r"[0-9a-f]{64}", value), key
        assert len(set(value)) <= 2, f"{key}: a dummy is a repeated pattern"
    assert len({env[k] for k in hex_keys}) == len(hex_keys), "each dummy differs"
    for key in ("SMTP_USER", "SMTP_PASSWORD"):
        assert env[key].startswith("devcpu"), key
    assert re.fullmatch(r"[0-9]{5,16}:[A-Za-z0-9_-]{35}", env["TELEGRAM_BOT_TOKEN"])
    assert "devcpu-dummy" in env["TELEGRAM_BOT_TOKEN"]


def test_dev_cpus_operator_token_is_the_published_dummy() -> None:
    env = ENV["dev-cpu"]
    token = env["H4_DEVCPU_OPERATOR_TOKEN"]
    assert re.fullmatch(r"h4op_devcpu_[A-Za-z0-9_-]{43}", token)
    assert token.startswith("h4op_devcpu_devcpu")
    assert hashlib.sha256(token.encode()).hexdigest() == env["OPERATOR_TOKEN_SHA256"]


@pytest.mark.parametrize("stack", sorted(FILES))
def test_only_the_two_compose_keys(stack: str) -> None:
    assert {k for k in ENV[stack] if k.startswith(("COMPOSE_", "DOCKER_"))} == {
        "COMPOSE_PROJECT_NAME",
        "COMPOSE_PROFILES",
    }


def test_aws_none_holds_only_its_readme() -> None:
    assert sorted(p.name for p in (REPO / "deploy" / "aws-none").iterdir()) == [
        "README.md"
    ]


# Spec 010 (FR-030; contracts/env-files.md §4, amended): the Anthropic API key is prod's alone, empty in its template;
# no env file holds a variable the SDK reads on its own; compose passes the key to the gateway alone, from the env file.
def test_the_anthropic_key_is_prods_alone_and_empty_in_its_template() -> None:
    assert ENV["prod"].get("GATEWAY_ANTHROPIC_API_KEY") == ""
    for stack, values in ENV.items():
        if stack != "prod":
            assert "GATEWAY_ANTHROPIC_API_KEY" not in values, stack
        assert not [k for k in values if k.startswith("ANTHROPIC_")], stack


def test_compose_passes_the_anthropic_key_to_the_gateway_alone() -> None:
    import yaml

    compose = yaml.safe_load((REPO / "deploy/compose.yaml").read_text(encoding="utf-8"))
    for name, service in compose["services"].items():
        environment = service.get("environment") or {}
        if isinstance(environment, list):
            environment = dict(item.split("=", 1) for item in environment)
        assert not [k for k in environment if k.startswith("ANTHROPIC_")], name
        if name == "gateway":
            assert environment.get("GATEWAY_ANTHROPIC_API_KEY") == "${GATEWAY_ANTHROPIC_API_KEY:-}"
        else:
            assert "GATEWAY_ANTHROPIC_API_KEY" not in environment, name
