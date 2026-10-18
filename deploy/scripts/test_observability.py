"""The observability configuration against contracts/telemetry.md §6 (spec 000 FR-026 to FR-029, FR-037).

deploy/otel/collector.yaml, deploy/prometheus/prometheus.yml, deploy/loki/loki.yaml, Grafana's provisioning, and
ClickHouse's settings files, read as data. The collector's copy of the secret patterns is held to the contract's table
and to the same recipes the gateway's redactor is tested with (services/gateway/test/fixtures/secret-shapes.json,
telemetry.md §6.3 and §8).
"""

from __future__ import annotations

import itertools
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
CONTRACT = (REPO / "specs/000-local-foundations/contracts/telemetry.md").read_text(
    encoding="utf-8"
)
COMPOSE = yaml.safe_load((REPO / "deploy/compose.yaml").read_text(encoding="utf-8"))
COLLECTOR_TEXT = (REPO / "deploy/otel/collector.yaml").read_text(encoding="utf-8")
COLLECTOR = yaml.safe_load(COLLECTOR_TEXT)
PROCESSORS = COLLECTOR["processors"]
SHAPES = json.loads(
    (REPO / "services/gateway/test/fixtures/secret-shapes.json").read_text(
        encoding="utf-8"
    )
)["cases"]


def section(heading: str) -> str:
    """The contract's text from a ### heading to the next one."""
    start = CONTRACT.index(f"\n### {heading}")
    end = CONTRACT.find("\n### ", start + 1)
    return CONTRACT[start : end if end > 0 else None]


def cells(line: str) -> list[str]:
    """A Markdown table row's cells, with the escaped pipes inside code put back."""
    return [
        c.strip().replace("\\|", "|")
        for c in re.split(r"(?<!\\)\|", line.strip())[1:-1]
    ]


def ottl_unquote(literal: str) -> str:
    """An OTTL string literal's value. OTTL unquotes strings as Go does, so the only escapes these use are \\\\ and
    \\"; any other backslash would be refused, or would reach the regular expression as something else."""
    out, chars = [], iter(literal)
    for char in chars:
        if char != "\\":
            out.append(char)
            continue
        nxt = next(chars)
        assert nxt in ('"', "\\"), (
            f"an OTTL escape that changes meaning: \\{nxt} in {literal!r}"
        )
        out.append(nxt)
    return "".join(out)


def assemble(parts: list) -> str:
    return "".join(p if isinstance(p, str) else p["repeat"] * p["times"] for p in parts)


# ---------------------------------------------------------------------------------------------------------------
# The collector: receivers, pipelines, processors, exporters (telemetry.md §6.1 to §6.4).


def test_the_receivers() -> None:
    otlp = COLLECTOR["receivers"]["otlp"]["protocols"]
    assert otlp["grpc"] == {"endpoint": "0.0.0.0:4317", "max_recv_msg_size_mib": 4}
    assert otlp["http"] == {
        "endpoint": "0.0.0.0:4318",
        "max_request_body_size": 4 * 2**20,
    }
    # x004's receiver: HTTP only, dev-time metrics only, 1 MiB like edge's limit.
    assert COLLECTOR["receivers"]["otlp/devtime"] == {
        "protocols": {
            "http": {"endpoint": "0.0.0.0:4319", "max_request_body_size": 2**20}
        }
    }


def contract_pipelines() -> dict[str, list[str]]:
    block = section("6.2 Pipelines").split("```text", 1)[1].split("```", 1)[0]
    out = {}
    for line in block.strip().splitlines():
        name, rest = line.split(None, 1)
        out[name] = [step.strip() for step in rest.split("→")]
    return out


def test_the_pipelines_are_the_contracts() -> None:
    pipelines = COLLECTOR["service"]["pipelines"]
    expected = contract_pipelines()
    assert (
        set(pipelines)
        == set(expected)
        == {"traces", "metrics", "metrics/devtime", "logs"}
    )
    for name, steps in expected.items():
        assert pipelines[name] == {
            "receivers": [steps[0]],
            "processors": steps[1:-1],
            "exporters": [steps[-1]],
        }, name


def test_every_processor_of_the_contract_and_no_other() -> None:
    table = section("6.3 Processors").split("**The secret patterns**", 1)[0]
    names = {
        cells(line)[0].strip("`").split("`")[0]
        for line in table.splitlines()
        if line.startswith("| `")
    }
    assert set(PROCESSORS) == names
    assert len(names) == 10
    assert PROCESSORS["memory_limiter"] == {
        "check_interval": "1s",
        "limit_mib": 200,
        "spike_limit_mib": 50,
    }
    assert PROCESSORS["batch"] == {
        "timeout": "2s",
        "send_batch_size": 512,
        "send_batch_max_size": 1024,
    }
    assert PROCESSORS["deltatocumulative"] == {"max_stale": "10m", "max_streams": 1000}


def test_probes_never_reach_langfuse() -> None:
    probes = PROCESSORS["filter/probes"]
    assert probes["error_mode"] == "ignore"
    pattern = "^/(health(/live)?|metrics|ping)$"
    assert probes["traces"]["span"] == [
        'attributes["h4.probe"] == true',
        f'IsMatch(attributes["url.path"], "{pattern}")',
        f'IsMatch(attributes["http.route"], "{pattern}")',
    ]
    assert probes["traces"]["spanevent"] == ['IsMatch(name, "^gen_ai\\\\.")']
    probe = re.compile(pattern)
    for path in ("/health", "/health/live", "/metrics", "/ping"):
        assert probe.match(path), path
    for path in ("/hello", "/healthz", "/admin/status", "/health/live/x"):
        assert not probe.match(path), path


def test_the_stack_label_is_the_collectors() -> None:
    assert PROCESSORS["resource"]["attributes"] == [
        {"key": "service.namespace", "value": "h4reet", "action": "upsert"},
        {
            "key": "deployment.environment.name",
            "value": "${env:H4_STACK}",
            "action": "upsert",
        },
        {"key": "host.name", "action": "delete"},
        {"pattern": "^process\\..*", "action": "delete"},
    ]


def test_the_exporters_and_extensions() -> None:
    exporters = COLLECTOR["exporters"]
    assert exporters["otlphttp/langfuse"] == {
        "traces_endpoint": "http://langfuse-web:3000/api/public/otel/v1/traces",
        "auth": {"authenticator": "basicauth/langfuse"},
        "compression": "gzip",  # Langfuse 4.54.0 takes it (telemetry.md §6.4, T149)
        "timeout": "10s",
        "retry_on_failure": {
            "enabled": True,
            "initial_interval": "5s",
            "max_interval": "30s",
            "max_elapsed_time": "600s",
        },
        "sending_queue": {"enabled": True, "num_consumers": 2, "queue_size": 600},
    }
    assert exporters["otlphttp/prometheus"] == {
        "metrics_endpoint": "http://prometheus:9090/api/v1/otlp/v1/metrics",
        "compression": "gzip",
        "retry_on_failure": {"enabled": True, "max_elapsed_time": "120s"},
        "sending_queue": {"enabled": True, "queue_size": 120},
    }
    assert exporters["otlphttp/loki"] == {
        "logs_endpoint": "http://loki:3100/otlp/v1/logs",
        "compression": "gzip",
        "retry_on_failure": {"enabled": True, "max_elapsed_time": "300s"},
        "sending_queue": {"enabled": True, "queue_size": 300},
    }
    assert COLLECTOR["extensions"] == {
        "health_check": {"endpoint": "0.0.0.0:13133"},
        "basicauth/langfuse": {
            "client_auth": {
                "username": "${env:LANGFUSE_PUBLIC_KEY}",
                "password": "${env:LANGFUSE_SECRET_KEY}",
            }
        },
    }
    service = COLLECTOR["service"]
    assert service["extensions"] == ["health_check", "basicauth/langfuse"]
    # The collector's own metrics: pushed to Prometheus over OTLP, with the stack's labels, and still served on 8888
    # for the scrape's up (telemetry.md §6.4, T185).
    assert service["telemetry"] == {
        "logs": {"level": "info"},
        "resource": {
            "attributes": [
                {"name": "service.name", "value": "otel-collector"},
                {"name": "service.namespace", "value": "h4reet"},
                {"name": "deployment.environment.name", "value": "${env:H4_STACK}"},
                {
                    "name": "service.instance.id",
                    "value": "${env:H4_STACK}-otel-collector",
                },
            ]
        },
        "metrics": {
            "level": "normal",
            "readers": [
                {
                    "pull": {
                        "exporter": {"prometheus": {"host": "0.0.0.0", "port": 8888}}
                    }
                },
                {
                    "periodic": {
                        "interval": 10000,
                        "exporter": {
                            "otlp": {
                                "protocol": "http/protobuf",
                                "endpoint": "http://prometheus:9090/api/v1/otlp/v1/metrics",
                                "compression": "gzip",
                                "temporality_preference": "cumulative",
                            }
                        },
                    }
                },
            ],
        },
    }


def test_the_collector_reads_only_its_four_variables() -> None:
    """Compose never interpolates the file (it is a read-only bind); the collector expands ${env:...} itself, and
    compose gives it exactly these four."""
    referenced = set(re.findall(r"\$\{env:([A-Z_][A-Z0-9_]*)\}", COLLECTOR_TEXT))
    assert referenced == set(COMPOSE["services"]["otel-collector"]["environment"])
    assert referenced == {
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "TELEMETRY_PAYLOAD_SAMPLING",
        "H4_STACK",
    }
    # Every expansion names its provider; and no $$ escape, which the collector would turn into $.
    assert not re.search(r"\$\{(?!env:)", COLLECTOR_TEXT)
    assert "$$" not in COLLECTOR_TEXT


# ---------------------------------------------------------------------------------------------------------------
# The secret patterns (telemetry.md §6.3): two copies in the collector, one table in the contract, one set of recipes.


def contract_patterns() -> list[str]:
    table = section("6.3 Processors").split("**The secret patterns**", 1)[1]
    rows = [
        cells(line)
        for line in table.splitlines()
        if line.startswith("| ") and "`" in line
    ]
    return [row[1].strip("`") for row in rows]


BLOCKED = PROCESSORS["redaction"]["blocked_values"]


def test_the_redaction_processor_holds_the_contracts_patterns() -> None:
    redaction = PROCESSORS["redaction"]
    assert redaction["allow_all_keys"] is True and redaction["summary"] == "info"
    assert sorted(BLOCKED) == sorted(contract_patterns())
    assert len(BLOCKED) == len(set(BLOCKED)) == 9
    # The PEM block first, as in the gateway's redactor: it spans lines and holds text the others would split.
    assert BLOCKED[0].startswith("-----BEGIN ")


@pytest.mark.parametrize("pattern", BLOCKED)
def test_each_pattern_is_re2(pattern: str) -> None:
    """RE2 has no lookaround and no backreference; Python's re reads the rest the same way here."""
    assert not re.search(r"\(\?[=!<]|\\[1-9]", pattern), pattern
    re.compile(pattern)


def redact(text: str, patterns: list[str]) -> str:
    for pattern in patterns:
        text = re.sub(pattern, "****", text)
    return text


@pytest.mark.parametrize("case", SHAPES, ids=[c["shape"] for c in SHAPES])
def test_the_collector_masks_every_shape_the_gateway_masks(case: dict) -> None:
    secret = assemble(case["parts"])
    text = f"{case['before']}{secret}{case['after']}"
    assert redact(text, BLOCKED) == f"{case['before']}****{case['after']}"
    # Exactly one pattern matches each shape, so the processor's order of applying them can't change the result.
    assert sum(bool(re.search(p, text)) for p in BLOCKED) == 1, case["shape"]


def test_every_pattern_has_a_recipe_and_ordinary_text_is_left_alone() -> None:
    for pattern in BLOCKED:
        assert any(re.search(pattern, assemble(c["parts"])) for c in SHAPES), pattern
    for text in (
        "Hello! This is the h4reet.ai stack's hello test answering.",
        "http://model-server:8080/v1/chat/completions",
        "the token count was 128, and the password field is empty",
        "Bearer of good news",
        "chat qwen2.5-0.5b-instruct",
        "",
    ):
        assert redact(text, BLOCKED) == text


def replace_patterns(
    context: str, target: str, kind: str = "trace_statements"
) -> list[str]:
    """The patterns transform/redact-text applies to one text field, in order, OTTL-unquoted."""
    guard = " where IsString(body)" if target == "body" else ""
    shape = re.compile(
        rf'replace_pattern\({re.escape(target)}, "((?:[^"\\]|\\.)*)", "\*\*\*\*"\){re.escape(guard)}'
    )
    out = []
    for group in PROCESSORS["transform/redact-text"][kind]:
        if group["context"] != context:
            continue
        for statement in group["statements"]:
            found = shape.fullmatch(statement)
            if found:
                out.append(ottl_unquote(found[1]))
    return out


@pytest.mark.parametrize(
    ("context", "target", "kind"),
    [
        ("span", "name", "trace_statements"),
        ("span", "status.message", "trace_statements"),
        ("spanevent", "name", "trace_statements"),
        ("log", "body", "log_statements"),
    ],
)
def test_the_text_fields_get_the_same_patterns_in_the_same_order(
    context: str, target: str, kind: str
) -> None:
    assert replace_patterns(context, target, kind) == BLOCKED


def test_redact_text_holds_nothing_else_and_strips_query_strings() -> None:
    redact_text = PROCESSORS["transform/redact-text"]
    assert redact_text["error_mode"] == "ignore"
    statements = [
        s for group in redact_text["trace_statements"] for s in group["statements"]
    ]
    statements += [
        s for group in redact_text["log_statements"] for s in group["statements"]
    ]
    assert len(statements) == 9 * 4 + 1
    assert 'replace_pattern(attributes["url.full"], "\\\\?.*$", "")' in statements
    assert (
        re.sub(ottl_unquote("\\\\?.*$"), "", "https://h/x?token=1&a=2") == "https://h/x"
    )


# ---------------------------------------------------------------------------------------------------------------
# Payloads and client identifiers (telemetry.md §3.4, §6.3; FR-029).

PAYLOAD_KEYS = [
    "gen_ai.input.messages",
    "gen_ai.output.messages",
    "gen_ai.system_instructions",
    "gen_ai.prompt",
    "gen_ai.prompt.0.content",
    "gen_ai.completion.0.content",
    "langfuse.observation.input",
    "langfuse.observation.output",
    "input.value",
    "output.value",
    "http.request.body",
    "http.response.body.size",
]
KEPT_KEYS = [
    "gen_ai.usage.input_tokens",
    "gen_ai.request.model",
    "gen_ai.response.finish_reasons",
    "h4.cost.usd",
    "h4.payload.sampled",
    "http.request.method",
    "http.route",
    "url.path",
    "messages_total",
]
CLIENT_KEYS = [
    "client.address",
    "client.port",
    "network.peer.address",
    "network.peer.port",
    "user_agent.original",
    "url.query",
    "authorization",
    "cookie",
]
SAMPLED = '"${env:TELEMETRY_PAYLOAD_SAMPLING}" == "on"'


def statements(context: str, kind: str) -> list[str]:
    groups = PROCESSORS["transform/payloads"][kind]
    return [s for g in groups if g["context"] == context for s in g["statements"]]


def deleted_pattern(statement: str) -> re.Pattern[str]:
    found = re.match(
        r'delete_matching_keys\(attributes, "((?:[^"\\]|\\.)*)"\)', statement
    )
    assert found, statement
    return re.compile(ottl_unquote(found[1]))


def test_payloads_are_deleted_unless_the_span_opts_in_and_sampling_is_on() -> None:
    span = statements("span", "trace_statements")
    event = statements("spanevent", "trace_statements")
    assert span[0].endswith(
        f' where not (attributes["h4.payload.sampled"] == true and {SAMPLED})'
    )
    assert len(event) == 1
    assert event[0].endswith(
        f' where not (span.attributes["h4.payload.sampled"] == true and {SAMPLED})'
    )
    for statement in (span[0], event[0]):
        pattern = deleted_pattern(statement)
        for key in PAYLOAD_KEYS:
            assert pattern.fullmatch(key), key
        for key in KEPT_KEYS:
            assert not pattern.fullmatch(key), key


def test_logs_lose_every_payload_key_whatever_the_setting() -> None:
    logs = statements("log", "log_statements")
    pattern = deleted_pattern(logs[0])
    assert " where " not in logs[0]
    for key in [*PAYLOAD_KEYS, "messages", "prompt", "completion"]:
        assert pattern.fullmatch(key), key
    for key in KEPT_KEYS:
        assert not pattern.fullmatch(key), key


@pytest.mark.parametrize(
    ("context", "kind"), [("span", "trace_statements"), ("log", "log_statements")]
)
def test_client_identifiers_are_always_deleted(context: str, kind: str) -> None:
    found = statements(context, kind)
    for key in CLIENT_KEYS:
        assert f'delete_key(attributes, "{key}")' in found, key
    headers = 'delete_matching_keys(attributes, "^http\\\\.(request|response)\\\\.header\\\\..*$")'
    assert headers in found
    pattern = deleted_pattern(headers)
    assert pattern.fullmatch(
        "http.request.header.authorization"
    ) and not pattern.fullmatch("http.request.method")


def test_the_cost_attribute_langfuse_reads() -> None:
    # Langfuse 4.54.0 reads both; the plain number stays, and the JSON one goes (telemetry.md §3.5, T149).
    span = statements("span", "trace_statements")
    assert (
        'set(attributes["gen_ai.usage.cost"], attributes["h4.cost.usd"]) where attributes["h4.cost.usd"] != nil'
        in span
    )
    assert not [s for s in span if "langfuse.observation.cost_details" in s]


def test_every_ottl_string_unquotes_cleanly() -> None:
    """No OTTL string literal anywhere in the file holds an escape OTTL would refuse or read differently."""
    texts = []
    for name in (
        "filter/probes",
        "transform/payloads",
        "transform/redact-text",
        "filter/devtime",
        "transform/devtime",
    ):
        texts += list(walk_strings(PROCESSORS[name]))
    assert texts
    for text in texts:
        for literal in re.findall(r'"((?:[^"\\]|\\.)*)"', text):
            ottl_unquote(literal)


def walk_strings(node: object):
    if isinstance(node, dict):
        for value in node.values():
            yield from walk_strings(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk_strings(value)
    elif isinstance(node, str):
        yield node


# ---------------------------------------------------------------------------------------------------------------
# Dev-time metrics (telemetry.md §4.4, §6.3; FR-037).


def test_x004_writes_dev_time_metrics_only_and_no_identity() -> None:
    (condition,) = PROCESSORS["filter/devtime"]["metrics"]["metric"]
    assert condition == (
        'not (IsMatch(name, "^(claude_code|h4\\\\.devtime)\\\\.") and (resource.attributes["service.name"] == '
        '"claude-code" or resource.attributes["service.name"] == "h4-gate"))'
    )
    kept = re.compile(ottl_unquote("^(claude_code|h4\\\\.devtime)\\\\."))
    assert kept.match("claude_code.cost.usage") and kept.match("h4.devtime.eval.tokens")
    assert not kept.match("h4.gateway.requests") and not kept.match("h4_devtime")
    groups = PROCESSORS["transform/devtime"]["metric_statements"]
    assert [g["context"] for g in groups] == ["resource", "datapoint"]
    for group in groups:
        (statement,) = group["statements"]
        pattern = deleted_pattern(statement)
        for key in (
            "user.email",
            "user.account_uuid",
            "organization.id",
            "terminal.type",
            "app.version",
            "host.arch",
            "os.type",
        ):
            assert pattern.fullmatch(key), key
        for key in ("model", "type", "session.id", "service.name"):
            assert not pattern.fullmatch(key), key


# ---------------------------------------------------------------------------------------------------------------
# Prometheus, Loki, and Grafana (telemetry.md §6.6).

PROMETHEUS = yaml.safe_load(
    (REPO / "deploy/prometheus/prometheus.yml").read_text(encoding="utf-8")
)
CONTRACT_PROMETHEUS = yaml.safe_load(
    section("6.6 Prometheus, Loki, and Grafana")
    .split("```yaml", 1)[1]
    .split("```", 1)[0]
)


def scraped_service(job: dict) -> str:
    host = job["static_configs"][0]["targets"][0].split(":")[0]
    return {"localhost": "prometheus", "model-server": "model-server-gpu"}.get(
        host, host
    )


def test_prometheus_is_the_contracts() -> None:
    assert PROMETHEUS["otlp"] == CONTRACT_PROMETHEUS["otlp"]
    assert PROMETHEUS["storage"] == CONTRACT_PROMETHEUS["storage"]
    assert PROMETHEUS["global"] == {
        "scrape_interval": "15s",
        "evaluation_interval": "15s",
    }
    jobs = {job["job_name"]: job for job in PROMETHEUS["scrape_configs"]}
    contract = {job["job_name"]: job for job in CONTRACT_PROMETHEUS["scrape_configs"]}
    # Every job of the contract whose service this compose file runs, exactly as the contract writes it, and no other.
    present = {
        name
        for name, job in contract.items()
        if scraped_service(job) in COMPOSE["services"]
    }
    assert set(jobs) == present
    for name in present:
        assert jobs[name] == contract[name], name
    assert jobs["model-server"]["scrape_interval"] == "5s"


def test_loki() -> None:
    loki = yaml.safe_load((REPO / "deploy/loki/loki.yaml").read_text(encoding="utf-8"))
    assert loki["auth_enabled"] is False
    assert loki["analytics"] == {"reporting_enabled": False}
    (schema,) = loki["schema_config"]["configs"]
    assert (schema["store"], schema["object_store"], schema["schema"]) == (
        "tsdb",
        "filesystem",
        "v13",
    )
    limits = loki["limits_config"]
    assert (
        limits["retention_period"] == "720h"
        and limits["allow_structured_metadata"] is True
    )
    assert limits["otlp_config"]["resource_attributes"]["attributes_config"] == [
        {
            "action": "index_label",
            "attributes": [
                "service.name",
                "service.namespace",
                "deployment.environment.name",
            ],
        }
    ]
    assert loki["compactor"]["retention_enabled"] is True
    assert loki["compactor"]["delete_request_store"] == "filesystem"
    # Everything Loki writes lands on its volume, mounted at /loki.
    paths = [p for p in walk_strings(loki) if p.startswith("/")]
    assert paths and all(p.startswith("/loki") for p in paths), paths


GRAFANA_DIR = REPO / "deploy/grafana/provisioning"


def test_grafanas_datasources() -> None:
    text = (GRAFANA_DIR / "datasources/h4.yaml").read_text(encoding="utf-8")
    sources = {d["uid"]: d for d in yaml.safe_load(text)["datasources"]}
    assert set(sources) == {"prom", "loki", "gateway"}
    assert [uid for uid, d in sources.items() if d.get("isDefault")] == ["prom"]
    assert (sources["prom"]["type"], sources["prom"]["url"]) == (
        "prometheus",
        "http://prometheus:9090",
    )
    assert (sources["loki"]["type"], sources["loki"]["url"]) == (
        "loki",
        "http://loki:3100",
    )
    assert sources["loki"]["jsonData"]["derivedFields"] == [
        {
            "name": "Langfuse trace",
            "matcherType": "label",
            "matcherRegex": "trace_id",
            "url": "http://localhost:${H4_LANGFUSE_PORT}/project/h4reet-${H4_STACK}/traces/$${__value.raw}",
            "urlDisplayLabel": "Open in Langfuse",
        }
    ]
    gateway = sources["gateway"]
    assert gateway["type"] == "grafana-postgresql-datasource"
    assert (gateway["url"], gateway["user"]) == ("gateway-state:5432", "grafana_ro")
    assert gateway["jsonData"] == {
        "database": "gateway",
        "sslmode": "disable",
        "postgresVersion": 1700,
    }
    assert gateway["secureJsonData"] == {"password": "${GATEWAY_GRAFANA_RO_PASSWORD}"}
    for source in sources.values():
        assert source["editable"] is False and source["access"] == "proxy"
    # Grafana expands these from its own environment, which compose gives it ($$ keeps Grafana's own literal).
    referenced = set(re.findall(r"(?<!\$)\$\{([A-Z_][A-Z0-9_]*)\}", text))
    assert referenced == {"H4_LANGFUSE_PORT", "H4_STACK", "GATEWAY_GRAFANA_RO_PASSWORD"}
    assert referenced <= set(COMPOSE["services"]["grafana"]["environment"])


def test_grafanas_dashboard_provider() -> None:
    (provider,) = yaml.safe_load(
        (GRAFANA_DIR / "dashboards/h4.yaml").read_text(encoding="utf-8")
    )["providers"]
    assert provider["type"] == "file"
    assert provider["options"]["path"] == "/etc/grafana/dashboards"
    assert provider["allowUiUpdates"] is False and provider["disableDeletion"] is True
    assert provider["updateIntervalSeconds"] == 30
    # The folder it reads is the one compose mounts there.
    targets = {
        v["target"]: v["source"] for v in COMPOSE["services"]["grafana"]["volumes"]
    }
    assert targets["/etc/grafana/dashboards"].endswith("/deploy/grafana/dashboards")


def test_every_file_here_parses() -> None:
    for path in itertools.chain(
        (REPO / "deploy/otel").glob("*.yaml"),
        (REPO / "deploy/prometheus").glob("*.yml"),
        (REPO / "deploy/loki").glob("*.yaml"),
        GRAFANA_DIR.glob("*/*.yaml"),
    ):
        assert yaml.safe_load(path.read_text(encoding="utf-8")), path


CLICKHOUSE = REPO / "deploy/clickhouse"


def clickhouse(name: str) -> ET.Element:
    root = ET.parse(CLICKHOUSE / f"{name}.xml").getroot()
    assert root.tag == "clickhouse", name
    return root


def test_clickhouses_three_settings_files() -> None:
    """plan §6 and research.md R-08: crash reports off, the Prometheus endpoint on 9363, and a small footprint."""
    assert sorted(p.stem for p in CLICKHOUSE.glob("*.xml")) == [
        "low-memory",
        "no-crash-reports",
        "prometheus",
    ]
    assert (
        clickhouse("no-crash-reports").findtext("send_crash_reports/enabled") == "false"
    )
    prometheus = clickhouse("prometheus")
    assert prometheus.findtext("prometheus/port") == "9363"
    assert prometheus.findtext("prometheus/endpoint") == "/metrics"
    low = clickhouse("low-memory")
    assert float(low.findtext("max_server_memory_usage_to_ram_ratio")) <= 0.8
    assert int(low.findtext("mark_cache_size")) <= 512 * 2**20
    # Logs go to the console, which Docker's local driver keeps, never to files inside the container.
    logger = low.find("logger")
    assert logger.findtext("console") == "1"
    assert {e.tag for e in logger if e.get("remove") == "remove"} == {"log", "errorlog"}
    # The system log tables it drops are dropped, not reconfigured.
    for element in low:
        if element.tag.endswith("_log"):
            assert element.get("remove") == "remove" and not len(element), element.tag
    # The scrape job and the endpoint agree.
    jobs = {job["job_name"]: job for job in PROMETHEUS["scrape_configs"]}
    assert jobs["clickhouse"]["static_configs"] == [{"targets": ["clickhouse:9363"]}]
