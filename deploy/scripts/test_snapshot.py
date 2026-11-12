"""Tests for the public view's sink and publishers (spec 001 tasks.md T135, T137; FR-057 to FR-059, SC-013;
contracts/public-view.md §1 and §2; data-model.md §5; plan.md §16, "Group 10, as built").

The sink is two parts of deploy/scripts/snapshot_sink.py:
  - `serve`, the tunnel end's snapshot-sink container: the publishers' one way in. It holds the sink's token and
    nothing of AWS's or the store's. It refuses each kind of field the document may never hold (a payload, a client
    identifier, an operator reason, a secret, or any field it doesn't know), a stale part, and a part from a host the
    relay doesn't serve; and it tells a publisher which host the relay serves;
  - `write`, the tunnel end's host timer, every 2 minutes, with the tunnel end's role: the cloud part (the serving
    host and its since, EC2's state, the shared state's spend, kill switch, and handovers, the server's month), merged
    with the last host part, kept with its own time, into site/status/latest.json, whether or not a host serves.
The publisher, deploy/scripts/snapshot_publisher.py, posts its host's panels only while the relay serves its host.

AWS, the relay, the store, Prometheus, and the sink are stubs; nothing here reaches the network.
"""

from __future__ import annotations

import ast
import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest
import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


sink = _load("h4_snapshot_sink_doc", HERE / "snapshot_sink.py")
publisher = _load("h4_snapshot_publisher", HERE / "snapshot_publisher.py")

TOKEN = "t" * 43
NOW = 1_800_000_000.0
ACCOUNT = "1" * 4 + "2" * 4 + "3" * 4
EC2_ID = "i-0" + "ab" * 8


def iso(epoch: float) -> str:
    return sink.iso(epoch)


def part(host: str = "laptop", at: float = NOW - 30, **over: object) -> dict:
    body = {
        "host": host,
        "taken_at": iso(at),
        "requests_per_s": 0.25,
        "error_rate": 0.0,
        "latency_p50_s": 0.4,
        "latency_p95_s": 1.4,
        "model_server_up": True if host == "laptop" else None,
        "degraded_causes": [],
        "ceilings": {"day_usd": 5.0, "month_usd": 20.0},
        "warnings": {"day_usd": 3.5, "month_usd": 14.0},
        "release": "0123456789ab",
    }
    body.update(over)
    return body


def receiver(serving: str | None = "laptop", clock: float = NOW):
    return sink.Receiver(TOKEN, lambda: serving, lambda: clock)


def post(r, body: object, token: str = TOKEN) -> tuple[int, dict | None]:
    raw = json.dumps(body).encode()
    return r.handle(
        "POST",
        "/v1/host",
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        raw,
    )


# ----------------------------------------------------------------------------------------------------------------------
# T135: the sink refuses each forbidden kind of field (FR-059).

FORBIDDEN = [
    # A payload: the visitor's words or the model's.
    ("message", "a visitor's words-qz"),
    ("prompt", "system: you are"),
    ("answer", "the twin's answer"),
    # A client identifier.
    ("client_label", "c-1"),
    ("address", "203.0.113.7"),
    ("user_agent", "Mozilla/5.0"),
    # An operator reason.
    ("reason", "paused it for the demo"),
    ("operator_reason", "testing"),
    # A secret.
    ("token", TOKEN),
    ("authorization", f"Bearer {TOKEN}"),
    # Any field it doesn't know.
    ("colour", "blue"),
]


@pytest.mark.parametrize(("field", "value"), FORBIDDEN)
def test_the_sink_refuses_each_forbidden_kind_of_field(field: str, value: str) -> None:
    r = receiver()
    status, answer = post(r, part(**{field: value}))
    assert status == 400
    assert answer == {"error": "invalid_snapshot", "field": field}
    assert value not in json.dumps(answer)
    assert r.part is None


@pytest.mark.parametrize(
    ("over", "field"),
    [
        # A string where the schema wants a number, a state, or a time: no text rides in a known field either.
        ({"requests_per_s": "203.0.113.7"}, "requests_per_s"),
        ({"degraded_causes": ["kill_switch_tripped", TOKEN]}, "degraded_causes"),
        ({"degraded_causes": ["203.0.113.7"]}, "degraded_causes"),
        ({"release": "sk-ant-" + "x" * 30}, "release"),
        ({"host": "the Author's laptop"}, "host"),
        ({"taken_at": "yesterday"}, "taken_at"),
        (
            {"ceilings": {"day_usd": 5.0, "month_usd": 20.0, "note": "x"}},
            "ceilings.note",
        ),
        ({"error_rate": float("nan")}, "error_rate"),
        ({"latency_p95_s": -1.0}, "latency_p95_s"),
        ({"model_server_up": "yes"}, "model_server_up"),
    ],
)
def test_a_known_field_holds_only_its_kind_of_value(over: dict, field: str) -> None:
    status, answer = post(receiver(), part(**over))
    assert status == 400 and answer == {"error": "invalid_snapshot", "field": field}


def test_a_missing_field_is_refused_by_name() -> None:
    body = part()
    del body["latency_p50_s"]
    assert post(receiver(), body) == (
        400,
        {"error": "invalid_snapshot", "field": "latency_p50_s"},
    )


def test_a_valid_part_is_kept_and_answered_204() -> None:
    r = receiver()
    assert post(r, part()) == (204, None)
    assert r.part == part()


def test_the_token_is_checked_first_and_never_echoed() -> None:
    r = receiver()
    status, answer = post(r, part(message="x"), token="u" * 43)
    assert status == 401 and answer == {"error": "snapshot_auth"}
    status, _ = r.handle("POST", "/v1/host", {}, json.dumps(part()).encode())
    assert status == 401
    assert r.part is None and r.refusals["snapshot_auth"] == 2


def test_a_body_over_16_kib_is_refused_unread() -> None:
    r = receiver()
    status, answer = r.handle(
        "POST",
        "/v1/host",
        {"Authorization": f"Bearer {TOKEN}"},
        b"{" + b" " * (16 * 1024) + b"}",
    )
    assert status == 413 and answer == {"error": "body_too_large"}


@pytest.mark.parametrize("age", [301, -61])
def test_a_part_older_than_5_minutes_or_from_the_future_is_refused(age: int) -> None:
    status, answer = post(receiver(), part(at=NOW - age))
    assert status == 400 and answer == {"error": "stale_snapshot"}


# ----------------------------------------------------------------------------------------------------------------------
# T135: the publisher posts only while its host serves, read from the relay's status.


@pytest.mark.parametrize(
    ("serving", "host", "kept"),
    [
        ("laptop", "laptop", True),
        ("ec2", "ec2", True),
        ("ec2", "laptop", False),
        ("none", "laptop", False),
        (None, "ec2", False),
    ],
)
def test_the_sink_keeps_a_part_only_from_the_host_the_relay_serves(
    serving: str | None, host: str, kept: bool
) -> None:
    r = receiver(serving)
    status, answer = post(r, part(host))
    if kept:
        assert status == 204
    else:
        assert status == 409 and answer == {"error": "not_serving"}
        assert r.part is None


@pytest.mark.parametrize(
    ("serving", "said"),
    [
        ("laptop", "laptop"),
        ("ec2", "ec2"),
        ("none", "none"),
        (None, "unknown"),
        ("x", "unknown"),
    ],
)
def test_the_sink_tells_a_publisher_which_host_the_relay_serves(
    serving: str | None, said: str
) -> None:
    status, answer = receiver(serving).handle(
        "GET", "/v1/serving", {"Authorization": f"Bearer {TOKEN}"}, b""
    )
    assert status == 200 and answer == {"serving": said}


class SinkStub:
    def __init__(self, serving: str | None, answer: int = 204) -> None:
        self.serving_answer = serving
        self.answer = answer
        self.posted: list[dict] = []

    def serving(self) -> str | None:
        return self.serving_answer

    def post(self, body: dict) -> int:
        self.posted.append(body)
        return self.answer


DASHBOARD = json.loads(
    (REPO / "deploy" / "grafana" / "dashboards" / "h4-runtime.json").read_text(
        encoding="utf-8"
    )
)


class Prometheus:
    """Each query's answer, as /api/v1/query's result vector, by the query's text."""

    def __init__(self) -> None:
        self.asked: list[str] = []

    def __call__(self, query: str) -> list[dict]:
        self.asked.append(query)
        if "h4_degraded_cause" in query:
            return [
                {"metric": {"h4_cause": "kill_switch_tripped"}, "value": [NOW, "1"]}
            ]
        if 'job="model-server"' in query:
            return [{"metric": {}, "value": [NOW, "1"]}]
        if "h4_adapter_healthy" in query:
            return []
        if "h4_release_info" in query:
            return [
                {
                    "metric": {
                        "h4_host": "laptop",
                        "h4_release": "0123456789ab",
                        "h4_commit": "0123456789ab" * 3 + "0123",
                    },
                    "value": [NOW, "1"],
                },
                {
                    "metric": {"h4_host": "ec2", "h4_release": "ba9876543210"},
                    "value": [NOW, "1"],
                },
            ]
        if "h4_meter_ceiling_usd" in query:
            return [{"metric": {}, "value": [NOW, "5" if "day" in query else "20"]}]
        if "h4_meter_warn_usd" in query:
            return [{"metric": {}, "value": [NOW, "3.5" if "day" in query else "14"]}]
        if "histogram_quantile(0.50" in query:
            return [{"metric": {}, "value": [NOW, "0.4"]}]
        if "histogram_quantile(0.95" in query:
            return [{"metric": {}, "value": [NOW, "1.4"]}]
        if 'h4_outcome="error"' in query:
            return [{"metric": {}, "value": [NOW, "NaN"]}]
        if "h4_gateway_requests_total" in query:
            return [
                {"metric": {"h4_route_decision": "local"}, "value": [NOW, "0.2"]},
                {"metric": {"h4_route_decision": "degraded"}, "value": [NOW, "0.05"]},
            ]
        return []


def make_publisher(host: str, stub: SinkStub, prom: Prometheus | None = None):
    return publisher.Publisher(
        host=host,
        sink=stub,
        prometheus=prom or Prometheus(),
        dashboard=DASHBOARD,
        clock=lambda: NOW,
    )


@pytest.mark.parametrize(
    ("host", "serving", "posted"),
    [
        ("laptop", "laptop", True),
        ("ec2", "ec2", True),
        ("laptop", "ec2", False),
        ("ec2", "laptop", False),
        ("laptop", "none", False),
        ("ec2", None, False),
    ],
)
def test_the_publisher_posts_only_while_the_relay_serves_its_host(
    host: str, serving: str | None, posted: bool
) -> None:
    stub = SinkStub(serving)
    prom = Prometheus()
    outcome = make_publisher(host, stub, prom).once()
    assert bool(stub.posted) is posted
    if not posted:
        # Not serving, it doesn't even ask its Prometheus.
        assert prom.asked == []
        assert outcome == ("unread" if serving is None else "not_serving")
    else:
        assert outcome == "posted"


def test_the_posted_part_is_the_one_the_sink_takes() -> None:
    stub = SinkStub("laptop")
    make_publisher("laptop", stub).once()
    (body,) = stub.posted
    r = receiver("laptop")
    assert post(r, body) == (204, None)
    assert body["host"] == "laptop" and body["taken_at"] == iso(NOW)
    assert body["requests_per_s"] == pytest.approx(0.25)
    assert (
        body["error_rate"] is None
    )  # no requests in the window: no rate, never a 0 that isn't one
    assert (body["latency_p50_s"], body["latency_p95_s"]) == (0.4, 1.4)
    assert body["model_server_up"] is True
    assert body["degraded_causes"] == ["kill_switch_tripped"]
    assert body["ceilings"] == {"day_usd": 5.0, "month_usd": 20.0}
    assert body["release"] == "0123456789ab"


def test_the_publishers_queries_are_the_dashboards_own() -> None:
    # The panels' queries are read from the provisioned dashboard, so the view and Grafana can't drift (contract §1).
    queries = publisher.panel_queries(DASHBOARD)
    titles = {t for t, _ in publisher.PANELS.values()}
    found = set()

    def walk(ps: list) -> None:
        for p in ps:
            found.add(p.get("title"))
            walk(p.get("panels") or [])

    walk(DASHBOARD["panels"])
    assert titles <= found
    for field, query in queries.items():
        assert "$__" not in query, field
    assert set(queries) == set(publisher.PANELS)


def test_a_refused_or_failed_post_is_its_outcome_never_a_raise() -> None:
    assert make_publisher("laptop", SinkStub("laptop", answer=409)).once() == "refused"
    assert make_publisher("laptop", SinkStub("laptop", answer=0)).once() == "failed"


# ----------------------------------------------------------------------------------------------------------------------
# T135: the cloud part is written while no host serves, and a stale host part keeps its time (FR-057, FR-058).


class Store:
    def __init__(self, broken: bool = False) -> None:
        self.broken = broken

    def __call__(self) -> dict | None:
        if self.broken:
            return None
        return {
            "state": {
                "state": "normal",
                "day_spent_micro": 1_234_567,
                "month_spent_micro": 7_654_321,
                "fallback_spent_micro": 100_000,
                "fallback_reserved_micro": 0,
                "fallback_allowance_micro": 2_000_000,
                "fallback_awaiting_renewal": False,
            },
            "adapters": [
                {"adapter": "anthropic", "month": "2027-01", "spent_micro": 3_210_000}
            ],
            "handovers": [
                {
                    "at": "2027-01-15T08:00:00Z",
                    "from_host": "none",
                    "to_host": "laptop",
                    "gap_ms": 95_000,
                },
                {
                    "at": "2027-01-15T07:58:25Z",
                    "from_host": "ec2",
                    "to_host": "none",
                    "gap_ms": None,
                },
            ],
        }


class Puts:
    def __init__(self) -> None:
        self.docs: list[dict] = []

    def __call__(self, doc: dict) -> bool:
        self.docs.append(json.loads(json.dumps(doc)))
        return True


class Aws:
    """The cloud reads' answers, as test_snapshot_cloud.py's stub gives them."""

    def __init__(self, ec2: str = "stopped") -> None:
        self.ec2 = ec2

    def call(self, service: str, op: str, **params: object) -> dict:
        if op == "DescribeInstances":
            return {
                "Reservations": [
                    {"Instances": [{"InstanceId": EC2_ID, "State": {"Name": self.ec2}}]}
                ]
            }
        if op == "DescribeBudget":
            return {
                "Budget": {
                    "BudgetLimit": {"Amount": "45.0"},
                    "CalculatedSpend": {"ActualSpend": {"Amount": "12.345"}},
                }
            }
        if op == "GetParameter":
            return {"Parameter": {"Value": "on"}}
        raise sink.AwsError("AccessDenied")


def writer(
    tmp_path: Path,
    serving: dict | None,
    host_part: dict | None,
    clock: list[float],
    store: Store | None = None,
    puts: Puts | None = None,
):
    return sink.Writer(
        cloud=sink.Sink(Aws(), ACCOUNT, lambda: clock[0]),
        relay_status=lambda: serving,
        store=store or Store(),
        host_part=lambda: host_part,
        put=puts or Puts(),
        state_dir=tmp_path,
        clock=lambda: clock[0],
    )


NONE_SERVES = {"serving": "none", "since": "2027-01-15T07:58:25Z"}


def test_the_cloud_part_is_written_while_no_host_serves(tmp_path: Path) -> None:
    clock, puts = [NOW], Puts()
    w = writer(tmp_path, NONE_SERVES, None, clock, puts=puts)
    assert w.write() == "written"
    (doc,) = puts.docs
    assert sink.validate_document(doc) is None
    assert doc["serving"] == {
        "host": "none",
        "since": "2027-01-15T07:58:25Z",
        "ec2_state": "stopped",
        "taken_at": iso(NOW),
    }
    assert doc["spend"]["today_usd"] == 1.23 and doc["spend"]["month_usd"] == 7.65
    assert doc["spend"]["kill_switch"] == "normal"
    assert doc["spend"]["fallback_remaining_usd"] == 1.9
    assert doc["spend"]["adapter_months"] == [
        {"adapter": "anthropic", "month": "2027-01", "spent_usd": 3.21}
    ]
    assert doc["spend"]["taken_at"] == iso(NOW)
    assert doc["server"]["month_to_date_usd"] == pytest.approx(12.35, abs=0.011)
    assert doc["server"]["budget_usd"] == 45.0
    assert doc["handovers"]["events"][0] == {
        "at": "2027-01-15T08:00:00Z",
        "from": "none",
        "to": "laptop",
        "gap_s": 95.0,
    }
    assert doc["host_panels"] is None


def test_a_stale_host_part_keeps_its_time(tmp_path: Path) -> None:
    clock, puts = [NOW], Puts()
    laptop = part("laptop", at=NOW - 30)
    serving = {"serving": "laptop", "since": "2027-01-15T08:00:00Z"}
    writer(tmp_path, serving, laptop, clock, puts=puts).write()
    # Ten minutes later no host serves and no part arrives: the last part stays, with its own time, as last-known.
    clock[0] = NOW + 600
    writer(tmp_path, NONE_SERVES, None, clock, puts=puts).write()
    first, second = puts.docs
    assert first["host_panels"] == laptop
    assert second["host_panels"] == laptop
    assert second["host_panels"]["taken_at"] == iso(NOW - 30)
    assert second["serving"]["host"] == "none"
    assert second["written_at"] == iso(NOW + 600)
    # And an older part than the one kept never replaces it.
    clock[0] = NOW + 720
    writer(tmp_path, serving, part("laptop", at=NOW - 300), clock, puts=puts).write()
    assert puts.docs[-1]["host_panels"]["taken_at"] == iso(NOW - 30)


def test_each_hosts_release_is_kept_from_its_own_last_part(tmp_path: Path) -> None:
    clock, puts = [NOW], Puts()
    writer(
        tmp_path, {"serving": "laptop", "since": None}, part("laptop"), clock, puts=puts
    ).write()
    clock[0] = NOW + 120
    writer(
        tmp_path,
        {"serving": "ec2", "since": None},
        part("ec2", at=NOW + 100, release="ba9876543210"),
        clock,
        puts=puts,
    ).write()
    releases = puts.docs[-1]["releases"]
    assert releases["laptop"]["release"] == "0123456789ab"
    assert releases["ec2"]["release"] == "ba9876543210"


def test_an_unread_store_or_relay_is_named_never_guessed(tmp_path: Path) -> None:
    clock, puts = [NOW], Puts()
    writer(tmp_path, None, None, clock, store=Store(broken=True), puts=puts).write()
    (doc,) = puts.docs
    assert sink.validate_document(doc) is None
    # No relay answer: no host serves, as the page says (FR-057); the store unread: no spend part, never zeros.
    assert doc["serving"]["host"] == "none" and doc["serving"]["since"] is None
    assert doc["spend"] is None and doc["handovers"] is None


def test_the_document_holds_no_address_id_account_or_token(tmp_path: Path) -> None:
    clock, puts = [NOW], Puts()
    writer(
        tmp_path, {"serving": "laptop", "since": None}, part(), clock, puts=puts
    ).write()
    text = json.dumps(puts.docs[0])
    for value in (EC2_ID, ACCOUNT, TOKEN, "10.42.", "203.0.113."):
        assert value not in text
    assert not re.search(r"(?<![0-9])[0-9]{12}(?![0-9])", text)


def test_the_write_is_the_one_key_with_its_type_and_60_s_cache() -> None:
    argv = sink.put_argv(ACCOUNT, Path("/var/lib/h4reet/snapshot/latest.json"))
    assert argv[:3] == ["aws", "s3", "cp"]
    assert f"s3://h4reet-ai-site-{ACCOUNT}/site/status/latest.json" in argv
    assert argv[argv.index("--content-type") + 1] == "application/json"
    assert argv[argv.index("--cache-control") + 1] == "max-age=60"


def test_a_failed_put_is_its_outcome_and_keeps_the_document_for_the_next(
    tmp_path: Path,
) -> None:
    clock = [NOW]
    failing = lambda doc: False
    w = writer(tmp_path, {"serving": "laptop", "since": None}, part(), clock)
    w.put = failing
    assert w.write() == "failed"
    # The next write still has the part: the kept document is the host's file, not the bucket.
    clock[0] = NOW + 120
    puts = Puts()
    writer(tmp_path, NONE_SERVES, None, clock, puts=puts).write()
    assert puts.docs[0]["host_panels"] == part()


def test_the_writes_metrics_and_span_hold_no_value_of_the_document(
    tmp_path: Path,
) -> None:
    clock = [NOW]
    w = writer(tmp_path, {"serving": "laptop", "since": None}, part(), clock)
    w.write()
    payload = json.dumps(w.telemetry(NOW - 120, NOW))
    assert "h4.snapshot.writes" in payload and "h4.snapshot.age_seconds" in payload
    assert '"snapshot.write"' in payload
    for value in (TOKEN, ACCOUNT, EC2_ID):
        assert value not in payload


# ----------------------------------------------------------------------------------------------------------------------
# Where they run (T137): the host timer's Python, the services, and the image.


def test_the_sink_runs_on_the_tunnel_ends_python_3_9() -> None:
    # The write runs on the host, Amazon Linux 2023's python3, 3.9; the serve in the image's 3.12.
    ast.parse(
        (HERE / "snapshot_sink.py").read_text(encoding="utf-8"), feature_version=(3, 9)
    )


COMPOSE = yaml.safe_load((REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8"))
SNAPSHOT_IMAGE = (
    "${H4_REGISTRY:-registry.invalid}/h4reet/snapshot@${H4_DIGEST_SNAPSHOT:-}"
)


def test_the_sinks_service_holds_its_token_and_nothing_of_aws_or_the_store() -> None:
    s = COMPOSE["services"]["snapshot-sink"]
    assert s["profiles"] == ["tunnel-end"]
    assert s["image"] == SNAPSHOT_IMAGE
    assert s["command"] == ["snapshot_sink.py", "serve"]
    assert s["ports"] == ["10.42.1.10:2301:8080"]
    assert set(s["networks"]) == {"internal", "edge"}
    env = s["environment"]
    assert env["SNAPSHOT_SINK_TOKEN"] == "${SNAPSHOT_SINK_TOKEN:-}"
    assert env["RELAY_STATUS_URL"] == "http://relay:8081/api/status"
    assert not [k for k in env if k.startswith(("AWS_", "DB_", "RELAY_TOKEN"))]
    assert not s.get("volumes")
    assert s["read_only"] is True and s["user"] == "10001:10001"


@pytest.mark.parametrize(
    ("name", "profile", "host", "url", "networks"),
    [
        ("snapshot-publisher", "tunnel", "laptop", "http://tunnel:2301", {"internal"}),
        (
            "ec2-snapshot-publisher",
            "ec2",
            "ec2",
            "http://10.42.1.10:2301",
            {"internal", "egress"},
        ),
    ],
)
def test_each_hosts_publisher(
    name: str, profile: str, host: str, url: str, networks: set
) -> None:
    s = COMPOSE["services"][name]
    assert s["profiles"] == [profile]
    assert s["command"] == ["snapshot_publisher.py"]
    env = s["environment"]
    assert env["H4_HOST"] == host and env["SNAPSHOT_SINK_URL"] == url
    assert env["SNAPSHOT_SINK_TOKEN"] == "${SNAPSHOT_SINK_TOKEN:-}"
    assert env["PROMETHEUS_URL"] == "http://prometheus:9090"
    assert set(s["networks"]) == networks
    (bind,) = s["volumes"]
    assert bind["source"] == "${H4_TREE:?set by make up}/deploy/grafana/dashboards"
    assert bind["read_only"] is True
    assert s["read_only"] is True and s["user"] == "10001:10001"
    if name == "snapshot-publisher":
        assert s["build"] == {
            "context": "..",
            "dockerfile": "deploy/snapshot/Dockerfile",
        }
    else:
        assert s["image"] == SNAPSHOT_IMAGE


def test_the_image_holds_the_two_scripts_on_the_pinned_python() -> None:
    text = (REPO / "deploy" / "snapshot" / "Dockerfile").read_text(encoding="utf-8")
    lock = {
        line.split()[0]: line.split()
        for line in (REPO / "deploy" / "images.lock")
        .read_text(encoding="utf-8")
        .splitlines()
        if line and not line.startswith("#")
    }
    _, repository, tag, digest = lock["base:python"][:4]
    assert f"FROM {repository}:{tag}@{digest}" in text
    assert "deploy/scripts/snapshot_sink.py" in text
    assert "deploy/scripts/snapshot_publisher.py" in text
    assert "USER 10001" in text
    assert (
        "RUN " not in text
    )  # nothing fetched at build: the two files and the base alone


def test_the_host_service_runs_the_write_and_keeps_running() -> None:
    # One long-lived process, so the hourly budget read and the half-hourly outcomes read keep their own cadence
    # (group 9's review A, I5); systemd restarts it if it stops.
    units = REPO / "deploy" / "hosts" / "tunnel-end" / "release"
    service = (units / "h4-snapshot-sink.service").read_text(encoding="utf-8")
    assert (
        "ExecStart=/usr/bin/python3 -I -B /opt/h4reet/snapshot/snapshot_sink.py write\n"
        in service
    )
    assert "Restart=always" in service
    assert "HTTPS_PROXY=http://127.0.0.1:3128" in service
    assert "NO_PROXY=169.254.169.254" in service
    assert not (units / "h4-snapshot-sink.timer").exists()


def test_the_writes_count_is_cumulative_from_the_process_start(tmp_path: Path) -> None:
    # The collector passes counters on to Prometheus unconverted, so each outcome's count is the process's own total.
    clock = [NOW]
    w = writer(tmp_path, {"serving": "laptop", "since": None}, part(), clock)
    w.write()
    clock[0] = NOW + 120
    w.write()
    metrics = w.telemetry(NOW, NOW + 120)["resourceMetrics"][0]["scopeMetrics"][0][
        "metrics"
    ]
    (writes,) = [m for m in metrics if m["name"] == "h4.snapshot.writes"]
    assert writes["sum"]["aggregationTemporality"] == 2
    (point,) = writes["sum"]["dataPoints"]
    assert point["asInt"] == "2"
    assert point["attributes"] == [
        {"key": "outcome", "value": {"stringValue": "written"}}
    ]


def test_the_publishers_span_and_count_hold_no_value_of_the_part() -> None:
    spans, metrics = publisher.telemetry(
        "laptop", "posted", NOW - 1, NOW, {"posted": 3, "not_serving": 2}, NOW - 600
    )
    text = json.dumps([spans, metrics])
    assert '"snapshot.publish"' in text and '"h4.snapshot.publishes"' in text
    (metric,) = metrics["resourceMetrics"][0]["scopeMetrics"][0]["metrics"]
    assert metric["sum"]["aggregationTemporality"] == 2
    counts = {
        p["attributes"][0]["value"]["stringValue"]: p["asInt"]
        for p in metric["sum"]["dataPoints"]
    }
    assert counts == {"not_serving": "2", "posted": "3"}
    for value in ("0.25", "kill_switch_tripped", "0123456789ab", TOKEN):
        assert value not in text
