"""The tunnel end's collector (spec 001 tasks.md T045; FR-060; research.md R-25; plan.md §11; disclosure row C15):
deploy/otel/collector-tunnel-end.yaml, read as data.

  - a routing connector sends what concerns the laptop (h4.relay.host = laptop) to the laptop's collector, through the
    tunnel's reverse forward 2202 to the laptop edge's telemetry block, and what concerns EC2 or no host (ec2, none) to
    EC2's collector in the VPC; the tunnel end's own telemetry, which names no host, goes to both;
  - each exporter has a file-backed queue, so a host that is gone delays its telemetry rather than losing it, up to the
    queue's bound;
  - spec 000's redaction runs again here, the same processors with the same statements as deploy/otel/collector.yaml's,
    so no payload, address, or client identifier leaves;
  - the queues' and the exporters' counters are the collector's own metrics, pushed through its own pipeline, so they
    reach whichever host is up, labelled as this collector's.
"""

from __future__ import annotations

from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CONFIG = yaml.safe_load(
    (HERE / "collector-tunnel-end.yaml").read_text(encoding="utf-8")
)
SPEC_000 = yaml.safe_load((HERE / "collector.yaml").read_text(encoding="utf-8"))
COMPOSE = yaml.safe_load((REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8"))
SIGNALS = ("traces", "metrics", "logs")
REDACTION = ("transform/payloads", "redaction", "transform/redact-text")


def test_two_exporters_the_laptops_through_the_tunnel_and_ec2s_in_the_vpc() -> None:
    exporters = CONFIG["exporters"]
    assert set(exporters) == {"otlphttp/laptop", "otlphttp/ec2"}
    assert exporters["otlphttp/laptop"]["endpoint"] == "http://tunnel-end:2202"
    assert exporters["otlphttp/ec2"]["endpoint"] == "${env:EC2_COLLECTOR_ENDPOINT}"
    # The telemetry block's token is the laptop's 8086 block's alone: EC2 holds none, and its collector in the VPC
    # takes none, so the token never goes there (contracts/env-cloud.md §2; group 5's review, nits).
    assert exporters["otlphttp/laptop"]["headers"] == {
        "Authorization": "Bearer ${env:TELEMETRY_BLOCK_TOKEN}"
    }
    assert "headers" not in exporters["otlphttp/ec2"]
    assert "TELEMETRY_BLOCK_TOKEN" not in str(exporters["otlphttp/ec2"])
    for name, exporter in exporters.items():
        assert exporter["compression"] == "gzip", name


def test_each_exporter_queues_to_a_file() -> None:
    assert (
        CONFIG["extensions"]["file_storage/queue"]["directory"]
        == "/var/lib/otelcol/queue"
    )
    for name, exporter in CONFIG["exporters"].items():
        queue = exporter["sending_queue"]
        assert queue["enabled"] is True, name
        assert queue["storage"] == "file_storage/queue", name
        assert queue["sizer"] == "bytes" and queue["queue_size"] == 33554432, name
        assert exporter["retry_on_failure"]["enabled"] is True, name
        assert exporter["retry_on_failure"]["max_elapsed_time"] == "0s", name
    assert "file_storage/queue" in CONFIG["service"]["extensions"]


def test_the_routing_connector_sends_each_host_its_own() -> None:
    for signal in SIGNALS:
        routing = CONFIG["connectors"][f"routing/{signal}"]
        assert routing["default_pipelines"] == [f"{signal}/laptop", f"{signal}/ec2"], (
            signal
        )
        table = [(r["condition"], r["pipelines"]) for r in routing["table"]]
        assert table == [
            ('attributes["h4.relay.host"] == "laptop"', [f"{signal}/laptop"]),
            (
                'attributes["h4.relay.host"] == "ec2" or attributes["h4.relay.host"] == "none"',
                [f"{signal}/ec2"],
            ),
        ], signal


def test_the_pipelines_redact_before_they_route() -> None:
    pipelines = CONFIG["service"]["pipelines"]
    for signal in SIGNALS:
        intake = pipelines[signal]
        assert intake["receivers"] == ["otlp"], signal
        assert intake["exporters"] == [f"routing/{signal}"], signal
        processors = intake["processors"]
        assert processors[0] == "memory_limiter", signal
        wanted = ["redaction"] if signal == "metrics" else list(REDACTION)
        assert [p for p in processors if p in REDACTION] == wanted, signal
        assert processors[-2:] == ["resource", "batch"], signal
        for host in ("laptop", "ec2"):
            out = pipelines[f"{signal}/{host}"]
            assert out["receivers"] == [f"routing/{signal}"], (signal, host)
            assert out["exporters"] == [f"otlphttp/{host}"], (signal, host)


def test_spec_000s_redaction_again_statement_for_statement() -> None:
    for name in REDACTION:
        assert CONFIG["processors"][name] == SPEC_000["processors"][name], name


def test_the_resource_names_this_collector_and_host() -> None:
    attributes = {
        a["key"]: a
        for a in CONFIG["processors"]["resource"]["attributes"]
        if "key" in a
    }
    assert attributes["h4.host"] == {
        "key": "h4.host",
        "value": "tunnel-end",
        "action": "upsert",
    }
    assert attributes["host.name"]["action"] == "delete"


def test_its_own_counters_go_through_its_own_pipeline_labelled_as_its_own() -> None:
    telemetry = CONFIG["service"]["telemetry"]
    resource = {a["name"]: a["value"] for a in telemetry["resource"]["attributes"]}
    assert resource["service.name"] == "tunnel-end-collector"
    (reader,) = telemetry["metrics"]["readers"]
    exporter = reader["periodic"]["exporter"]["otlp"]
    assert exporter["endpoint"] == "http://127.0.0.1:4318/v1/metrics"
    assert exporter["protocol"] == "http/protobuf"
    assert telemetry["metrics"]["level"] == "normal"


def test_the_receiver_is_the_tunnel_ends_own_services_only() -> None:
    assert set(CONFIG["receivers"]) == {"otlp"}
    assert CONFIG["receivers"]["otlp"]["protocols"] == {
        "http": {"endpoint": "0.0.0.0:4318", "max_request_body_size": 4194304}
    }


def test_the_service_runs_in_the_tunnel_ends_profile_with_its_queue_volume() -> None:
    service = COMPOSE["services"]["tunnel-end-collector"]
    assert service["profiles"] == ["tunnel-end"]
    assert service["image"].startswith(
        "${H4_REGISTRY:-registry.invalid}/h4reet/otel-collector:"
    )
    assert service["command"] == ["--config=/etc/otelcol/config.yaml"]
    volumes = {v["target"]: v for v in service["volumes"]}
    assert volumes["/etc/otelcol/config.yaml"]["source"].endswith(
        "/deploy/otel/collector-tunnel-end.yaml"
    )
    assert volumes["/etc/otelcol/config.yaml"]["read_only"] is True
    assert volumes["/var/lib/otelcol/queue"] == {
        "type": "volume",
        "source": "tunnel-end-collector-queue",
        "target": "/var/lib/otelcol/queue",
    }
    assert service["environment"] == {
        "TELEMETRY_BLOCK_TOKEN": "${TELEMETRY_BLOCK_TOKEN:-}",
        "EC2_COLLECTOR_ENDPOINT": "${EC2_COLLECTOR_ENDPOINT:-}",
        # spec 000's switch, from the env file: off on prod, whose file the compose policy never lets set it on.
        "TELEMETRY_PAYLOAD_SAMPLING": "${TELEMETRY_PAYLOAD_SAMPLING:-off}",
    }
    assert set(service["networks"]) == {"internal", "egress"}
    assert "tunnel-end-collector-queue" in COMPOSE["volumes"]
