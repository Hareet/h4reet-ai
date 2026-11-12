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
    # Spec 001's tunnel end: write_env.py fills its template at boot (contracts/env-cloud.md §1).
    "tunnel-end": REPO / "deploy" / "hosts" / "tunnel-end" / "tunnel-end.env.example",
    # Spec 001's EC2 (group 7): its template, which write_env.py fills the same way.
    "ec2": REPO / "deploy" / "hosts" / "ec2" / "ec2.env.example",
}
# The keys the tunnel end's deployer writes to each release's env file: the release, and the digest of each image the
# release builds (deploy/scripts/deployer.py; spec 001 contracts/releases-deployer.md §1).
RELEASE_FILE_KEYS = {"H4_RELEASE", "H4_DIGEST_TUNNEL"}
# On EC2 (group 7), each shared service's upstream image runs as the account's registry's copy, which the deployer
# names in the release's env file alone; on every other host the pinned reference after ":-" runs as written.
MIRRORED = {
    "edge",
    "otel-collector",
    "prometheus",
    "loki",
    "grafana",
    "langfuse-web",
    "langfuse-worker",
    "langfuse-db",
    "clickhouse",
    "valkey",
    "seaweedfs",
}
RELEASE_FILE_KEYS |= {"H4_IMAGE_" + s.upper().replace("-", "_") for s in MIRRORED}
# The services spec 001 adds, each in its host's class (its contracts/env-cloud.md §3): the laptop's tunnel, and the
# tunnel end's.
SPEC_001 = {
    "tunnel",
    "tunnel-end",
    "tunnel-end-collector",
    "shared-state",
    "ec2-relay-block",
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
    """Each service's image as make pin-images writes it: repository:tag@digest, or the bare repository while the
    lock's line is still open (tag and digest "-", SeaweedFS's until T063)."""
    out = {}
    for line in (
        (REPO / "deploy" / "images.lock").read_text(encoding="utf-8").splitlines()
    ):
        if line.strip() and not line.startswith("#"):
            service, repository, tag, digest, *_ = line.split()
            open_pin = (tag, digest) == ("-", "-")
            out[service] = repository if open_pin else f"{repository}:{tag}@{digest}"
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
    assert (
        set(SERVICES)
        == {
            "edge",
            "gateway",
            "web",
            "gateway-state",
            "model-server-gpu",
            "model-server-cpu",
            "otel-collector",
            "prometheus",
            "loki",
            "grafana",
            "langfuse-web",
            "langfuse-worker",
            "langfuse-db",
            "clickhouse",
            "valkey",
            "seaweedfs",
            "telegram-standin",
            "mailpit",
            "breach-probe",
        }
        | SPEC_001
    )
    assert COMPOSE["networks"] == {
        "internal": {"internal": True},
        "edge": {"driver": "bridge"},
        "egress": {"driver": "bridge"},
    }
    assert COMPOSE["volumes"] == {
        "gateway-state-data": {},
        "prometheus-data": {},
        "loki-data": {},
        "grafana-data": {},
        "langfuse-db-data": {},
        "clickhouse-data": {},
        "valkey-data": {},
        "seaweedfs-data": {},
        "tunnel-end-collector-queue": {},
    }
    assert "name" not in COMPOSE  # make passes -p h4reet-<stack>


# Langfuse waits for its four stores (as Langfuse's own compose does), and nothing else waits on anything: least of
# all on the model server or the collector, so neither can block hello's degraded path (plan §1).
LANGFUSE_STORES = {
    "langfuse-db": {"condition": "service_healthy"},
    "clickhouse": {"condition": "service_healthy"},
    "valkey": {"condition": "service_healthy"},
    "seaweedfs": {"condition": "service_healthy"},
}


def test_only_langfuse_waits_and_only_on_its_stores() -> None:
    waiting = {n: s["depends_on"] for n, s in SERVICES.items() if "depends_on" in s}
    assert waiting == {
        "langfuse-web": LANGFUSE_STORES,
        "langfuse-worker": LANGFUSE_STORES,
    }


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
        "privileged",
        "devices",
    ):
        assert absent not in service, absent
    if name not in ("langfuse-web", "langfuse-worker"):
        assert "depends_on" not in service


def test_only_edge_publishes_and_only_on_loopback() -> None:
    assert SERVICES["edge"]["ports"] == [
        "127.0.0.1:${H4_API_PORT}:8080",
        "127.0.0.1:${H4_LANGFUSE_PORT}:8081",
        "127.0.0.1:${H4_GRAFANA_PORT}:8082",
        "127.0.0.1:${H4_ADMIN_PORT}:8083",
        "127.0.0.1:${H4_OTLP_PORT}:8084",
        "127.0.0.1:${H4_SITE_PORT}:8087",
    ]
    # Spec 001's tunnel end publishes the tunnel and the health port on its public interface's fixed address, a
    # literal no other host has (its contracts/tunnel.md §1), from the edge bridge; the laptop's tunnel dials out.
    assert [n for n, s in SERVICES.items() if s.get("ports")] == [
        "edge",
        "tunnel-end",
        "shared-state",
        "ec2-relay-block",
    ]
    # Group 7: EC2's relay block and its collector, on EC2's private address alone, a literal, in EC2's class alone.
    assert SERVICES["ec2-relay-block"]["ports"] == [
        "10.42.0.20:8085:8085",
        "10.42.0.20:4318:4318",
    ]
    assert SERVICES["ec2-relay-block"]["profiles"] == ["ec2"]
    assert SERVICES["tunnel-end"]["ports"] == [
        "10.42.0.10:2222:2222",
        "10.42.0.10:8087:2203",
    ]
    # Group 6's shared state, on the private interface's fixed address alone (its contracts/shared-state.md §1).
    assert SERVICES["shared-state"]["ports"] == ["10.42.1.10:5432:5432"]
    assert [n for n, s in SERVICES.items() if "edge" in s["networks"]] == [
        "edge",
        "tunnel-end",
        "shared-state",
        "ec2-relay-block",
    ]
    assert [n for n, s in SERVICES.items() if "egress" in s["networks"]] == [
        "gateway",
        "tunnel",
        "tunnel-end-collector",
    ]
    assert SERVICES["gateway-state"]["networks"] == ["internal"]


# Built from this file's own tree, each from its Dockerfile on a pinned base; the gateway runs make up's one build per
# commit, outside compose (tasks.md T184), and so does the room's web service, whose tag ends in the env file's
# H4_WEB_SUFFIX, -drafts where the stack's image holds the room's drafts (spec 002, contracts/web-serving.md §1);
# every other service runs a pinned image.
BUILT = ("tunnel", "telegram-standin", "breach-probe")
# Spec 001's tunnel end runs its release's images from the account's registry: an image the release builds by the
# release's digest, which its deployer writes (deploy/scripts/deployer.py).
CLOUD = {
    "tunnel-end": "${H4_REGISTRY:-registry.invalid}/h4reet/tunnel@${H4_DIGEST_TUNNEL:-}",
    # An upstream image's copy, by the lock's own tag and digest.
    "tunnel-end-collector": "${H4_REGISTRY:-registry.invalid}/h4reet/otel-collector:0.162.0@"
    + "sha256:39923a8e431bd1f57be82411999d389fcfe40857492e4365456d97a4c1f74be6",
    # Group 6's shared state: gateway-state's Postgres, copied as h4reet/shared-state by the lock's tag and digest.
    "shared-state": "${H4_REGISTRY:-registry.invalid}/h4reet/shared-state:17.11-alpine3.24@"
    + "sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24",
    # Group 7's EC2 doors: edge's nginx, copied by the lock's own tag and digest.
    "ec2-relay-block": "${H4_REGISTRY:-registry.invalid}/h4reet/edge:1.30.5-alpine@"
    + "sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3",
}
SHARED = {
    "gateway": "h4reet-gateway:${H4_REF:-working-tree}",
    "web": "h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}",
}


def test_images_are_the_locked_pins() -> None:
    pins = lock()
    for name, service in SERVICES.items():
        if name in BUILT:
            assert "image" not in service  # built from this file's own tree
        elif name in SHARED:
            assert (service["image"], service["pull_policy"]) == (SHARED[name], "never")
        elif name in CLOUD:
            assert service["image"] == CLOUD[name], name
        elif name in MIRRORED:
            var = "H4_IMAGE_" + name.upper().replace("-", "_")
            assert service["image"] == f"${{{var}:-{pins[name]}}}", name
        else:
            assert service["image"] == pins[name], name
    assert [n for n, s in SERVICES.items() if "build" in s] == list(BUILT)


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


def test_the_web_service_runs_make_ups_build_and_reaches_nothing() -> None:
    # spec 002, contracts/web-serving.md §1: deploy/scripts/web_image.py builds it (test_web_image.py holds its
    # arguments), compose neither builds nor pulls it, and it takes nothing from the env file. It listens on the
    # internal network alone, behind edge's x005; nothing waits on it, and it waits on nothing.
    web = SERVICES["web"]
    assert "build" not in web
    assert (web["image"], web["pull_policy"]) == (SHARED["web"], "never")
    assert web["networks"] == ["internal"]
    for absent in (
        "environment",
        "volumes",
        "ports",
        "depends_on",
        "command",
        "entrypoint",
        "user",
    ):
        assert absent not in web, absent


def test_the_gateway_runs_make_ups_one_build_per_commit() -> None:
    # compose neither builds nor pulls it: deploy/scripts/gateway_image.py builds it, with the context and build
    # arguments compose's own builds use (test_gateway_image.py holds them), and a missing image stops the stack.
    gateway = SERVICES["gateway"]
    assert "build" not in gateway
    assert (gateway["image"], gateway["pull_policy"]) == (SHARED["gateway"], "never")


# The breach probe (plan §2 and §8; tasks.md T144, T080): a one-off client on the stack's internal network, where the
# operator CLI's dev-cpu hop runs (contracts/operator-admin.md §6), and the breach test's every call and assertion.


def test_the_breach_probe_builds_from_this_files_own_tree() -> None:
    # The same context and build arguments as the gateway's build in deploy/scripts/gateway_image.py: the agents'
    # engine builds through its proxy, and host stacks pass an empty H4_BUILD_PROXY (contracts/env-files.md §2).
    assert SERVICES["breach-probe"]["build"] == {
        "context": "..",
        "dockerfile": "evals/Dockerfile.probe",
        "args": {"HTTP_PROXY": "${H4_BUILD_PROXY}", "HTTPS_PROXY": "${H4_BUILD_PROXY}"},
    }


def test_the_breach_probe_is_a_one_off_on_internal_alone() -> None:
    probe = SERVICES["breach-probe"]
    # Only the breach profile, which no env file selects (preflight refuses it), so make up never starts it:
    # docker compose run --rm starts one per call and removes it.
    assert probe["profiles"] == ["breach"]
    assert probe["networks"] == ["internal"]
    assert probe["read_only"] is True
    assert probe["tmpfs"] == ["/tmp"]
    # It publishes nothing and mounts nothing. From the env file it takes only Langfuse's two API keys, which the
    # breach test's trace assertions read Langfuse's public API with (contracts/env-files.md §5); the operator token
    # reaches it on standard input (operator-admin.md §6). Each caller names its command, and nothing waits on a
    # one-off's health.
    assert probe["environment"] == {
        "LANGFUSE_PUBLIC_KEY": "${LANGFUSE_PUBLIC_KEY}",
        "LANGFUSE_SECRET_KEY": "${LANGFUSE_SECRET_KEY}",
    }
    for absent in (
        "ports",
        "expose",
        "volumes",
        "healthcheck",
        "depends_on",
        "command",
        "entrypoint",
        "user",
        "cap_add",
    ):
        assert absent not in probe, absent


# The stand-ins (plan §2 and §8; contracts/alerts.md §4.3; tasks.md T079): dev's and dev-cpu's alert receivers in
# stand-in mode, which the breach test reads from inside the stack.
STANDINS = ("telegram-standin", "mailpit")
# Mailpit's settings, and nothing else: its version check off; any SMTP login taken, over the plain connection the
# gateway's stand-in mode uses; and no reverse lookups of the gateway's address. No relay, forwarding, webhook, or
# UI login is configured, so it sends nothing anywhere.
MAILPIT_ENVIRONMENT = {
    "MP_DISABLE_VERSION_CHECK": "true",
    "MP_SMTP_AUTH_ACCEPT_ANY": "true",
    "MP_SMTP_AUTH_ALLOW_INSECURE": "true",
    "MP_SMTP_DISABLE_RDNS": "true",
}


@pytest.mark.parametrize("name", STANDINS)
def test_the_stand_ins_are_dev_receivers_on_internal_alone(name: str) -> None:
    service = SERVICES[name]
    # COMPOSE_PROFILES names dev-receivers on dev and dev-cpu only (contracts/env-files.md §2), so prod never runs them.
    assert service["profiles"] == ["dev-receivers"]
    assert service["networks"] == ["internal"]
    # They publish nothing, mount nothing, and wait on nothing; each runs its image's own command.
    for absent in (
        "ports",
        "expose",
        "volumes",
        "depends_on",
        "command",
        "entrypoint",
        "user",
        "cap_add",
    ):
        assert absent not in service, absent


def test_the_stand_ins_take_nothing_from_the_env_file() -> None:
    assert "environment" not in SERVICES["telegram-standin"]
    assert SERVICES["mailpit"]["environment"] == MAILPIT_ENVIRONMENT
    # Nothing but the build's proxy arguments, which never reach the container (contracts/env-files.md §2).
    for name in STANDINS:
        running = {k: v for k, v in SERVICES[name].items() if k != "build"}
        assert not [text for text in strings(running) if VAR.search(text)], name


def test_mailpit_relays_nothing() -> None:
    # Its release, auto-relay, forwarding, and webhook features each need a setting: none is set.
    for key in SERVICES["mailpit"]["environment"]:
        assert not key.startswith(
            ("MP_SMTP_RELAY", "MP_SMTP_FORWARD", "MP_WEBHOOK", "MP_POP3", "MP_UI_AUTH")
        ), key


def test_the_telegram_standin_builds_from_this_files_own_tree() -> None:
    assert SERVICES["telegram-standin"]["build"] == {
        "context": "..",
        "dockerfile": "evals/standins/Dockerfile",
        "args": {"HTTP_PROXY": "${H4_BUILD_PROXY}", "HTTPS_PROXY": "${H4_BUILD_PROXY}"},
    }


def dockerfile(path: Path) -> list[tuple[str, str]]:
    """(INSTRUCTION, arguments) for each instruction, with continuations joined and comments dropped."""
    out, pending = [], ""
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not pending and (not line or line.startswith("#")):
            continue
        if line.endswith("\\"):
            pending += line[:-1] + " "
            continue
        word, _, rest = (pending + line).strip().partition(" ")
        pending = ""
        out.append((word.upper(), rest.strip()))
    return out


def test_the_probe_image() -> None:
    path = REPO / "evals" / "Dockerfile.probe"
    steps = dockerfile(path)
    words = [word for word, _ in steps]
    # The pinned base:python of deploy/images.lock, by digest, as the compose policy requires (plan §11), and no
    # `# syntax=` line, which would pull an unpinned frontend image.
    assert [args for word, args in steps if word == "FROM"] == [lock()["base:python"]]
    text = path.read_text(encoding="utf-8")
    assert not re.search(r"^\s*#\s*syntax\s*=", text, re.IGNORECASE | re.MULTILINE)
    # The CLI at the path the dev-cpu hop runs: python3 -I /app/operator.py (operator-admin.md §6); and the breach
    # test's probe beside it, which loads that copy of the CLI from its own folder (plan §8).
    assert ("COPY", "scripts/operator.py /app/operator.py") in steps
    assert ("COPY", "evals/breach_probe.py /app/breach_probe.py") in steps
    # Nothing runs at build time but creating the user: no package manager, no ADD (which can fetch a URL), and no
    # other RUN. No ENTRYPOINT either, so the command each caller names is the one that runs.
    runs = [args for word, args in steps if word == "RUN"]
    assert len(runs) == 1 and runs[0].startswith("useradd "), runs
    for fetcher in ("apt", "pip", "uv ", "curl", "wget", "npm", "&&", ";", "|"):
        assert fetcher not in runs[0], fetcher
    assert not {"ADD", "ENTRYPOINT", "ONBUILD"} & set(words)
    # The scripts run as that user, never as root: one USER, after the user exists.
    users = [args for word, args in steps if word == "USER"]
    assert len(users) == 1 and users[0] not in ("root", "0", "0:0"), users
    assert words.index("USER") > words.index("RUN")
    assert users[0] in runs[0].split()


def test_the_standin_image() -> None:
    path = REPO / "evals" / "standins" / "Dockerfile"
    steps = dockerfile(path)
    words = [word for word, _ in steps]
    # The pinned base:python, by digest, and no `# syntax=` line, as for the probe (plan §11).
    assert [args for word, args in steps if word == "FROM"] == [lock()["base:python"]]
    text = path.read_text(encoding="utf-8")
    assert not re.search(r"^\s*#\s*syntax\s*=", text, re.IGNORECASE | re.MULTILINE)
    assert (
        "COPY",
        "evals/standins/telegram_standin.py /app/telegram_standin.py",
    ) in steps
    runs = [args for word, args in steps if word == "RUN"]
    assert len(runs) == 1 and runs[0].startswith("useradd "), runs
    for fetcher in ("apt", "pip", "uv ", "curl", "wget", "npm", "&&", ";", "|"):
        assert fetcher not in runs[0], fetcher
    assert not {"ADD", "ENTRYPOINT", "ONBUILD", "EXPOSE"} & set(words)
    users = [args for word, args in steps if word == "USER"]
    assert len(users) == 1 and users[0] not in ("root", "0", "0:0"), users
    assert words.index("USER") > words.index("RUN")
    assert users[0] in runs[0].split()
    # It runs isolated, writes no bytecode on its read-only root, and listens on the port standin.telegram_base names.
    assert [args for word, args in steps if word == "CMD"] == [
        '["python3", "-I", "-B", "/app/telegram_standin.py", "--host", "0.0.0.0", "--port", "8080"]'
    ]


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
        ),
        # Spec 001's hosts' blocks: the entrypoint that writes their token maps (its contracts/tunnel.md §4).
        (
            "${H4_TREE:?set by make up}/deploy/edge/entrypoint.sh",
            "/etc/nginx/h4-entrypoint.sh",
            True,
        ),
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
    # The observability services: their configuration, read-only from this file's tree, and their own volumes.
    tree = "${H4_TREE:?set by make up}/deploy"
    assert binds("otel-collector") == [
        (f"{tree}/otel/collector.yaml", "/etc/otelcol-contrib/config.yaml", True)
    ]
    assert binds("prometheus") == [
        (f"{tree}/prometheus/prometheus.yml", "/etc/prometheus/prometheus.yml", True)
    ]
    assert binds("loki") == [(f"{tree}/loki/loki.yaml", "/etc/loki/loki.yaml", True)]
    assert binds("grafana") == [
        (
            f"{tree}/grafana/provisioning/datasources",
            "/etc/grafana/provisioning/datasources",
            True,
        ),
        (
            f"{tree}/grafana/provisioning/dashboards",
            "/etc/grafana/provisioning/dashboards",
            True,
        ),
        (f"{tree}/grafana/dashboards", "/etc/grafana/dashboards", True),
    ]
    # Langfuse's stores: ClickHouse's three settings files into config.d, and SeaweedFS's entrypoint.
    config_d = "/etc/clickhouse-server/config.d"
    assert binds("clickhouse") == [
        (f"{tree}/clickhouse/{f}.xml", f"{config_d}/{f}.xml", True)
        for f in ("low-memory", "no-crash-reports", "prometheus")
    ]
    assert binds("seaweedfs") == [
        (f"{tree}/seaweedfs/entrypoint.sh", "/h4/entrypoint.sh", True)
    ]
    for name in (
        "langfuse-web",
        "langfuse-worker",
        "langfuse-db",
        "valkey",
        "telegram-standin",
        "mailpit",
    ):
        assert binds(name) == [], name
    for name, volume, target in (
        ("prometheus", "prometheus-data", "/prometheus"),
        ("loki", "loki-data", "/loki"),
        ("grafana", "grafana-data", "/var/lib/grafana"),
        ("langfuse-db", "langfuse-db-data", "/var/lib/postgresql/data"),
        ("clickhouse", "clickhouse-data", "/var/lib/clickhouse"),
        ("valkey", "valkey-data", "/data"),
        ("seaweedfs", "seaweedfs-data", "/data"),
    ):
        assert [
            (v["source"], v["target"])
            for v in SERVICES[name]["volumes"]
            if v["type"] == "volume"
        ] == [(volume, target)], name
    for name in ("otel-collector", "langfuse-web", "langfuse-worker"):
        assert not [
            v for v in SERVICES[name].get("volumes", []) if v["type"] == "volume"
        ], name
    # Every bind source names a file or folder this tree holds, so the long syntax, which never creates a missing
    # source, finds it on the engine and in every export.
    for name in SERVICES:
        for source, _, _ in binds(name):
            if source.startswith("${H4_TREE"):
                assert (REPO / source.split("}/", 1)[1]).exists(), (name, source)


def test_the_observability_services_commands() -> None:
    assert SERVICES["otel-collector"]["command"] == [
        "--config=/etc/otelcol-contrib/config.yaml"
    ]
    # Plan §6: the OTLP receiver on, 30 days or 2 GB, neither the admin nor the lifecycle API, and a 0 at each series'
    # start, so a new counter's first increment counts (T149).
    assert SERVICES["prometheus"]["command"] == [
        "--config.file=/etc/prometheus/prometheus.yml",
        "--storage.tsdb.path=/prometheus",
        "--storage.tsdb.retention.time=30d",
        "--storage.tsdb.retention.size=2GB",
        "--web.enable-otlp-receiver",
        "--enable-feature=created-timestamp-zero-ingestion",
    ]
    assert SERVICES["loki"]["command"] == ["-config.file=/etc/loki/loki.yaml"]
    assert "command" not in SERVICES["grafana"]


def test_read_only_roots_where_the_image_allows() -> None:
    # plan §1: edge, the gateway, the collector, the stand-ins, and the probe.
    read_only = [
        "edge",
        "gateway",
        "web",
        "otel-collector",
        "telegram-standin",
        "mailpit",
        "breach-probe",
    ]
    for name in read_only:
        assert SERVICES[name]["read_only"] is True
        assert SERVICES[name]["tmpfs"] == ["/tmp"]
    # Spec 001's tunnel, both ends, with their state on tmpfs owned by the image's user.
    tunnel = {
        "tunnel": ["/run/tunnel:uid=10001,gid=10001,mode=0700"],
        "tunnel-end": ["/run:uid=10001,gid=10001,mode=0700"],
        "tunnel-end-collector": ["/tmp"],
        "ec2-relay-block": ["/tmp"],
    }
    for name, tmpfs in tunnel.items():
        assert SERVICES[name]["read_only"] is True and SERVICES[name]["tmpfs"] == tmpfs
    assert sorted(n for n, s in SERVICES.items() if s.get("read_only")) == sorted(
        read_only + list(tunnel)
    )
    # SeaweedFS's root stays writable, but its S3 keys file goes to a tmpfs, never the image's layer.
    assert SERVICES["seaweedfs"]["tmpfs"] == ["/tmp"]


def test_only_the_entrypoints_that_take_ownership_add_capabilities_back() -> None:
    # The two Postgres and Valkey: their entrypoints chown their data, then drop to their own user (plan §1).
    for name in ("gateway-state", "langfuse-db", "valkey", "shared-state"):
        assert SERVICES[name]["cap_add"] == [
            "CHOWN",
            "SETUID",
            "SETGID",
            "FOWNER",
            "DAC_OVERRIDE",
        ], name
    assert [n for n, s in SERVICES.items() if "cap_add" in s] == [
        "gateway-state",
        "langfuse-db",
        "valkey",
        "shared-state",
    ]
    # ClickHouse and SeaweedFS run as their images' own users instead, with nothing added back (plan §1 and §2).
    # ClickHouse's is how Langfuse's compose runs it, so its entrypoint changes no ownership. SeaweedFS's, seaweed, owns
    # /data: our entrypoint replaces the image's, which chowns it and drops to that user, and root with every
    # capability dropped couldn't write it. The master died at "mkdir /data/m9333: permission denied" (T065's second
    # prod start, 2026-10-09).
    assert SERVICES["clickhouse"]["user"] == "101:101"
    assert SERVICES["seaweedfs"]["user"] == "1000:1000"
    # Spec 001's tunnel runs as its image's one user, both ends (deploy/tunnel/Dockerfile).
    assert SERVICES["tunnel"]["user"] == SERVICES["tunnel-end"]["user"] == "10001:10001"
    assert [n for n, s in SERVICES.items() if "user" in s] == [
        "clickhouse",
        "seaweedfs",
        "tunnel",
        "tunnel-end",
    ]


@pytest.mark.parametrize(
    ("name", "cpus", "memory"),
    [
        ("edge", "0.25", "64M"),
        ("gateway", "1", "512M"),
        ("web", "0.1", "32M"),
        ("gateway-state", "0.5", "256M"),
        ("model-server-gpu", "4", "8G"),
        ("model-server-cpu", "4", "2G"),
        ("otel-collector", "0.5", "256M"),
        ("prometheus", "0.5", "1G"),
        ("loki", "0.5", "512M"),
        ("grafana", "0.5", "512M"),
        ("langfuse-web", "1", "1536M"),
        ("langfuse-worker", "1", "1G"),
        ("langfuse-db", "0.5", "512M"),
        ("clickhouse", "2", "4G"),
        ("valkey", "0.5", "384M"),
        ("seaweedfs", "0.5", "512M"),
        ("telegram-standin", "0.1", "64M"),
        ("mailpit", "0.1", "64M"),
        ("breach-probe", "0.25", "128M"),
        ("shared-state", "0.5", "256M"),
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
    # The room's site: a static file in the web image (contracts/web-serving.md §1), with the image's busybox wget.
    assert SERVICES["web"]["healthcheck"]["test"] == [
        "CMD",
        "wget",
        "-qO-",
        "http://127.0.0.1:8080/healthz",
    ]
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
    # Plan §2: the images' own busybox wget.
    for name, url in (
        ("prometheus", "http://127.0.0.1:9090/-/ready"),
        ("grafana", "http://127.0.0.1:3000/api/health"),
    ):
        assert SERVICES[name]["healthcheck"]["test"] == ["CMD", "wget", "-qO-", url]
    # The collector's and Loki's images have no shell and no wget, so they have no health check, and only Prometheus's
    # scrape watches them (plan §2). Loki's wget check could never run (T065's second prod start, 2026-10-09).
    for name in ("otel-collector", "loki"):
        assert "healthcheck" not in SERVICES[name], name
    # Langfuse and its stores (plan §2).
    web = SERVICES["langfuse-web"]["healthcheck"]
    assert web["test"] == [
        "CMD",
        "wget",
        "-qO-",
        "http://127.0.0.1:3000/api/public/health",
    ]
    assert web["start_period"] == "180s"
    for name, url in (
        ("langfuse-worker", "http://127.0.0.1:3030/api/health"),
        ("clickhouse", "http://127.0.0.1:8123/ping"),
    ):
        assert SERVICES[name]["healthcheck"]["test"] == ["CMD", "wget", "-qO-", url]
    assert SERVICES["langfuse-db"]["healthcheck"]["test"] == [
        "CMD",
        "pg_isready",
        "-U",
        "langfuse",
        "-d",
        "langfuse",
    ]
    # Valkey answers PONG to its own password, which the container's shell reads ($$ is compose's escape).
    assert SERVICES["valkey"]["healthcheck"]["test"] == [
        "CMD-SHELL",
        'valkey-cli --no-auth-warning -a "$$VALKEY_PASSWORD" ping | grep -qx PONG',
    ]
    # SeaweedFS is healthy once the master answers and the entrypoint has made the bucket (research.md R-09).
    assert SERVICES["seaweedfs"]["healthcheck"]["test"] == [
        "CMD-SHELL",
        "test -f /tmp/h4-bucket-ready && wget -qO- http://127.0.0.1:9333/cluster/status >/dev/null",
    ]
    # plan §2's stand-ins: Mailpit with its image's busybox wget, and the Telegram stand-in with its own python3,
    # which evals/standins/test_telegram_standin.py runs as written, against the stand-in.
    assert SERVICES["mailpit"]["healthcheck"]["test"] == [
        "CMD",
        "wget",
        "-qO-",
        "http://127.0.0.1:8025/livez",
    ]
    check = SERVICES["telegram-standin"]["healthcheck"]["test"]
    assert check[:4] == ["CMD", "python3", "-I", "-c"] and len(check) == 5
    assert "http://127.0.0.1:8080/healthz" in check[4]
    # No proxy setting can take the check of its own loopback anywhere else.
    assert "ProxyHandler({})" in check[4]


def test_valkey_and_seaweedfs_run_as_plan_6_says() -> None:
    assert SERVICES["valkey"]["command"] == [
        "valkey-server",
        "--requirepass",
        "${VALKEY_PASSWORD}",
        "--maxmemory",
        "256mb",
        "--maxmemory-policy",
        "noeviction",
        "--appendonly",
        "yes",
    ]
    assert SERVICES["seaweedfs"]["entrypoint"] == ["/bin/sh", "/h4/entrypoint.sh"]
    assert "command" not in SERVICES["seaweedfs"]


def test_edge_runs_nginx_without_the_entrypoint_scripts() -> None:
    # Spec 001 (its tasks.md T048): our few lines of sh write the hosts' blocks' token maps, then exec nginx.
    assert SERVICES["edge"]["entrypoint"] == ["/bin/sh", "/etc/nginx/h4-entrypoint.sh"]
    assert SERVICES["edge"]["command"] == ["nginx", "-g", "daemon off;"]


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
    "GATEWAY_ANTHROPIC_API_KEY": "${GATEWAY_ANTHROPIC_API_KEY:-}",  # spec 010, FR-030
    # Spec 001 group 6 (its contracts/env-cloud.md §2): the host, and the shared state's connection, empty until the
    # Author's move, so prod keeps its local store meanwhile.
    "H4_HOST": "${H4_HOST:-laptop}",
    "GATEWAY_DB_URL": "${GATEWAY_DB_URL:-}",
    "GATEWAY_DB_TLS_SERVERNAME": "${GATEWAY_DB_TLS_SERVERNAME:-}",
    "GATEWAY_DB_TLS_CA": "${GATEWAY_DB_TLS_CA:-}",
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
    for name in ("prometheus", "loki"):
        assert "environment" not in SERVICES[name], name
    # edge holds the hosts' blocks' two tokens alone (spec 001 contracts/tunnel.md §4), each from the env file.
    assert SERVICES["edge"]["environment"] == {
        "RELAY_TOKEN_SELF": "${RELAY_TOKEN_SELF:-}",
        "TELEMETRY_BLOCK_TOKEN": "${TELEMETRY_BLOCK_TOKEN:-}",
    }


def test_the_collector_receives_its_four_variables_and_nothing_else() -> None:
    # contracts/env-files.md §6 and telemetry.md §6: its own configuration expands them.
    assert SERVICES["otel-collector"]["environment"] == {
        "LANGFUSE_PUBLIC_KEY": "${LANGFUSE_PUBLIC_KEY}",
        "LANGFUSE_SECRET_KEY": "${LANGFUSE_SECRET_KEY}",
        "TELEMETRY_PAYLOAD_SAMPLING": "${TELEMETRY_PAYLOAD_SAMPLING}",
        "H4_STACK": "${H4_STACK}",
    }


# Grafana: contracts/env-files.md §6 ("Fixed in compose on Grafana"), the provisioning files' three variables
# (telemetry.md §6.6), and the admin password, exactly.
GRAFANA_ENVIRONMENT = {
    "H4_STACK": "${H4_STACK}",
    "H4_LANGFUSE_PORT": "${H4_LANGFUSE_PORT}",
    "GATEWAY_GRAFANA_RO_PASSWORD": "${GATEWAY_GRAFANA_RO_PASSWORD}",
    "GF_SECURITY_ADMIN_USER": "admin",
    "GF_SECURITY_ADMIN_PASSWORD": "${GF_SECURITY_ADMIN_PASSWORD}",
    "GF_SERVER_ROOT_URL": "http://localhost:${H4_GRAFANA_PORT}/",
    "GF_USERS_ALLOW_SIGN_UP": "false",
    "GF_AUTH_ANONYMOUS_ENABLED": "false",
    "GF_UNIFIED_ALERTING_ENABLED": "false",
    # The phone-homes of plan §6, every one off (FR-040).
    "GF_ANALYTICS_REPORTING_ENABLED": "false",
    "GF_ANALYTICS_CHECK_FOR_UPDATES": "false",
    "GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES": "false",
    "GF_NEWS_NEWS_FEED_ENABLED": "false",
    "GF_SECURITY_DISABLE_GRAVATAR": "true",
    "GF_PLUGINS_PUBLIC_KEY_RETRIEVAL_DISABLED": "true",
    "GF_PLUGINS_PREINSTALL_DISABLED": "true",
    "GF_SNAPSHOTS_EXTERNAL_ENABLED": "false",
}


def test_grafana_receives_exactly_its_variables() -> None:
    assert SERVICES["grafana"]["environment"] == GRAFANA_ENVIRONMENT
    # Nothing that would install a plugin from the internet.
    assert "GF_INSTALL_PLUGINS" not in SERVICES["grafana"]["environment"]


# Langfuse 4.54.0: contracts/env-files.md §5 ("Fixed in compose, on web and worker" and "on web only"), exactly.
LANGFUSE_S3 = {
    "BUCKET": "langfuse",
    "REGION": "auto",
    "ENDPOINT": "http://seaweedfs:8333",
    "ACCESS_KEY_ID": "${SEAWEEDFS_S3_ACCESS_KEY}",
    "SECRET_ACCESS_KEY": "${SEAWEEDFS_S3_SECRET_KEY}",
    "FORCE_PATH_STYLE": "true",
}
LANGFUSE_SHARED = {
    "DATABASE_URL": "postgresql://langfuse:${LANGFUSE_DB_PASSWORD}@langfuse-db:5432/langfuse",
    "SALT": "${LANGFUSE_SALT}",
    "ENCRYPTION_KEY": "${LANGFUSE_ENCRYPTION_KEY}",
    "TELEMETRY_ENABLED": "false",
    "CLICKHOUSE_URL": "http://clickhouse:8123",
    "CLICKHOUSE_MIGRATION_URL": "clickhouse://clickhouse:9000",
    "CLICKHOUSE_USER": "clickhouse",
    "CLICKHOUSE_PASSWORD": "${CLICKHOUSE_PASSWORD}",
    "CLICKHOUSE_CLUSTER_ENABLED": "false",
    "REDIS_HOST": "valkey",
    "REDIS_PORT": "6379",
    "REDIS_AUTH": "${VALKEY_PASSWORD}",
    **{f"LANGFUSE_S3_EVENT_UPLOAD_{k}": v for k, v in LANGFUSE_S3.items()},
    "LANGFUSE_S3_EVENT_UPLOAD_PREFIX": "events/",
    **{f"LANGFUSE_S3_MEDIA_UPLOAD_{k}": v for k, v in LANGFUSE_S3.items()},
    "LANGFUSE_S3_MEDIA_UPLOAD_PREFIX": "media/",
    "LANGFUSE_S3_BATCH_EXPORT_ENABLED": "false",
    "LANGFUSE_IN_APP_AGENT_ENABLED": "false",
    # No exception to Langfuse's block on internal addresses for an LLM connection (contracts/env-files.md §5, T149).
    "LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST": "",
    "LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS": "",
    "LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS": "",
    # Both listen on $HOSTNAME, which Docker sets to the container's ID (contracts/env-files.md §5, tasks.md T180).
    "HOSTNAME": "0.0.0.0",
}
LANGFUSE_WEB_ONLY = {
    "NODE_OPTIONS": "--max-old-space-size=1024",
    "NEXTAUTH_URL": "http://localhost:${H4_LANGFUSE_PORT}",
    "NEXTAUTH_SECRET": "${LANGFUSE_NEXTAUTH_SECRET}",
    "AUTH_DISABLE_SIGNUP": "true",
    "LANGFUSE_S3_MEDIA_UPLOAD_INTERNAL_ENDPOINT": "http://seaweedfs:8333",
    "LANGFUSE_INIT_ORG_ID": "h4reet",
    "LANGFUSE_INIT_ORG_NAME": "h4reet.ai",
    "LANGFUSE_INIT_PROJECT_ID": "h4reet-${H4_STACK}",
    "LANGFUSE_INIT_PROJECT_NAME": "h4reet-${H4_STACK}",
    "LANGFUSE_INIT_PROJECT_PUBLIC_KEY": "${LANGFUSE_PUBLIC_KEY}",
    "LANGFUSE_INIT_PROJECT_SECRET_KEY": "${LANGFUSE_SECRET_KEY}",
    "LANGFUSE_INIT_USER_EMAIL": "${LANGFUSE_INIT_USER_EMAIL}",
    "LANGFUSE_INIT_USER_NAME": "operator",
    "LANGFUSE_INIT_USER_PASSWORD": "${LANGFUSE_INIT_USER_PASSWORD}",
}


def test_langfuse_receives_exactly_its_variables() -> None:
    assert SERVICES["langfuse-web"]["environment"] == {
        **LANGFUSE_SHARED,
        **LANGFUSE_WEB_ONLY,
    }
    assert SERVICES["langfuse-worker"]["environment"] == {
        **LANGFUSE_SHARED,
        "NODE_OPTIONS": "--max-old-space-size=768",
    }


@pytest.mark.parametrize("name", ["langfuse-web", "langfuse-worker"])
def test_langfuse_keeps_off_everything_that_reaches_out(name: str) -> None:
    """contracts/env-files.md §5's "Kept off" table: none of these keys is set to switch anything on."""
    environment = SERVICES[name]["environment"]
    for key, value in environment.items():
        assert not key.startswith(("LANGFUSE_AI_", "AWS_")), key
        assert key not in (
            "SMTP_CONNECTION_URL",
            "EMAIL_FROM_ADDRESS",
            "LANGFUSE_USE_AZURE_BLOB",
            "LANGFUSE_USE_OCI_NATIVE_OBJECT_STORAGE",
        ), key
        assert "MCP" not in key, key
        if key.startswith("LANGFUSE_LLM_CONNECTION_WHITELISTED_"):
            assert value == "", key
    assert environment["LANGFUSE_IN_APP_AGENT_ENABLED"] == "false"
    assert environment["LANGFUSE_S3_BATCH_EXPORT_ENABLED"] == "false"
    assert environment["TELEMETRY_ENABLED"] == "false"


def test_langfuses_stores_receive_only_their_own() -> None:
    assert SERVICES["langfuse-db"]["environment"] == {
        "POSTGRES_DB": "langfuse",
        "POSTGRES_USER": "langfuse",
        "POSTGRES_PASSWORD": "${LANGFUSE_DB_PASSWORD}",
    }
    assert SERVICES["clickhouse"]["environment"] == {
        "CLICKHOUSE_DB": "default",
        "CLICKHOUSE_USER": "clickhouse",
        "CLICKHOUSE_PASSWORD": "${CLICKHOUSE_PASSWORD}",
    }
    assert SERVICES["valkey"]["environment"] == {
        "VALKEY_PASSWORD": "${VALKEY_PASSWORD}"
    }
    assert SERVICES["seaweedfs"]["environment"] == {
        "SEAWEEDFS_S3_ACCESS_KEY": "${SEAWEEDFS_S3_ACCESS_KEY}",
        "SEAWEEDFS_S3_SECRET_KEY": "${SEAWEEDFS_S3_SECRET_KEY}",
    }


def test_each_secret_reaches_only_the_services_that_use_it() -> None:
    """contracts/env-files.md §1: a container never sees a key it doesn't consume."""
    expected = {
        "GATEWAY_DB_PASSWORD": {"gateway", "gateway-state"},
        "GATEWAY_GRAFANA_RO_PASSWORD": {"gateway", "grafana"},
        "LANGFUSE_PUBLIC_KEY": {"otel-collector", "langfuse-web", "breach-probe"},
        "LANGFUSE_SECRET_KEY": {"otel-collector", "langfuse-web", "breach-probe"},
        "LANGFUSE_SALT": {"langfuse-web", "langfuse-worker"},
        "LANGFUSE_ENCRYPTION_KEY": {"langfuse-web", "langfuse-worker"},
        "LANGFUSE_NEXTAUTH_SECRET": {"langfuse-web"},
        "LANGFUSE_DB_PASSWORD": {"langfuse-web", "langfuse-worker", "langfuse-db"},
        "LANGFUSE_INIT_USER_PASSWORD": {"langfuse-web"},
        "CLICKHOUSE_PASSWORD": {"langfuse-web", "langfuse-worker", "clickhouse"},
        "VALKEY_PASSWORD": {"langfuse-web", "langfuse-worker", "valkey"},
        "SEAWEEDFS_S3_ACCESS_KEY": {"langfuse-web", "langfuse-worker", "seaweedfs"},
        "SEAWEEDFS_S3_SECRET_KEY": {"langfuse-web", "langfuse-worker", "seaweedfs"},
        "GF_SECURITY_ADMIN_PASSWORD": {"grafana"},
        "TELEGRAM_BOT_TOKEN": {"gateway"},
        "SMTP_PASSWORD": {"gateway"},
    }
    for key, services in expected.items():
        readers = {
            name
            for name, service in SERVICES.items()
            if f"${{{key}}}" in " ".join(strings(service))
        }
        assert readers == services, key


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


# What EC2's deployer writes to each release's env file besides the images (deploy/scripts/deployer.py).
EC2_RELEASE_KEYS = {"H4_REF", "H4_WEB_SUFFIX"}
EC2_CLASS = (
    "edge",
    "web",
    "gateway",
    "otel-collector",
    "prometheus",
    "loki",
    "grafana",
    "langfuse-web",
    "langfuse-worker",
    "langfuse-db",
    "clickhouse",
    "valkey",
    "seaweedfs",
    "ec2-relay-block",
)


def read_by_ec2(name: str) -> bool:
    return any(
        any(name in found for found, _ in VAR.findall(text))
        for service in EC2_CLASS
        for text in strings(COMPOSE["services"][service])
    )


def test_every_variable_compose_reads_is_in_the_env_files() -> None:
    """A variable without a default is in every env file (H4_TREE comes from the run file on host stacks); one
    with a default is in at least one, or is a run-file key (H4_REF, the gateway's tag on host stacks: tasks.md T184),
    so a misspelled name can't silently take its default."""
    every = {stack: keys(path) for stack, path in ENV_FILES.items()}
    used: dict[str, bool] = {}
    for text in strings(COMPOSE["services"]):
        for name, modifier in VAR.findall(text):
            has_default = modifier.startswith((":-", "-"))
            used[name] = used.get(name, True) and has_default
    assert used, "compose reads no variables?"
    assert (
        used.get("H4_WEB_SUFFIX") is False
    )  # in every env file: no default could pick prod's tag on dev
    for name, has_default in sorted(used.items()):
        holders = [stack for stack, found in every.items() if name in found]
        if has_default:
            assert holders or name in RUN_FILE_KEYS | RELEASE_FILE_KEYS, (
                f"{name}: in no env file"
            )
        else:
            # The tunnel end's file is read by its own class alone, whose services read no default-less name; EC2's by
            # its own class alone too, whose names are in its file or in the deployer's release env file (H4_WEB_SUFFIX).
            missing = [
                s
                for s in every
                if s != "tunnel-end"
                and name not in every[s]
                and not (name in RUN_FILE_KEYS and s != "dev-cpu")
                and not (
                    s == "ec2" and (name in EC2_RELEASE_KEYS or not read_by_ec2(name))
                )
            ]
            assert not missing, f"{name}: missing from {missing}"
