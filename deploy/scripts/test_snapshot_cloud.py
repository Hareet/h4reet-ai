"""Tests for the sink's cloud reads, deploy/scripts/snapshot_sink.py (spec 001 tasks.md T121, T126; FR-060, FR-065;
contracts/public-view.md §2; contracts/handover.md §10; plan.md §11).

Each of the sink's cloud reads becomes its metric; a read that fails is counted as an error and its metric gets no
point, never a fresh-looking value; the server budget is read once an hour; and no label holds a secret, the
account's ID, an instance's ID, or an address. EC2, Systems Manager, Route 53, Budgets, and CloudWatch are stubs.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


sink = _load("h4_snapshot_sink", HERE / "snapshot_sink.py")
ACCOUNT = "1" * 4 + "2" * 4 + "3" * 4
EC2_ID = "i-0" + "ab" * 8
SPOT_ID = "sir-" + "q" * 8
CHECK_ID = "0" * 8 + "-1111-2222-3333-" + "4" * 12


class Aws:
    def __init__(self, over: dict | None = None) -> None:
        self.calls: list[tuple[str, str, dict]] = []
        self.answers: dict[str, object] = {
            "ec2 DescribeInstances": {
                "Reservations": [
                    {
                        "Instances": [
                            {
                                "InstanceId": EC2_ID,
                                "State": {"Name": "running"},
                                "SpotInstanceRequestId": SPOT_ID,
                                "PrivateIpAddress": "10.42.0.20",
                            }
                        ]
                    }
                ]
            },
            "ec2 DescribeSpotInstanceRequests": {
                "SpotInstanceRequests": [{"State": "active"}]
            },
            "ssm /h4reet/prod/ec2-autostart": {"Parameter": {"Value": "on"}},
            "ssm /h4reet/tunnel-end/HEALTH_CHECK_ID": {
                "Parameter": {"Value": CHECK_ID}
            },
            "route53 GetHealthCheckStatus": {
                "HealthCheckObservations": [
                    {
                        "IPAddress": "198.51.100.1",
                        "StatusReport": {"Status": "Success: HTTP Status Code 200, OK"},
                    },
                    {
                        "IPAddress": "198.51.100.2",
                        "StatusReport": {"Status": "Success: HTTP Status Code 200, OK"},
                    },
                    {
                        "IPAddress": "198.51.100.3",
                        "StatusReport": {"Status": "Failure: Connection timed out"},
                    },
                    {
                        "IPAddress": "198.51.100.4",
                        "StatusReport": {"Status": "Success: HTTP Status Code 200, OK"},
                    },
                ]
            },
            "budgets DescribeBudgetActionsForBudget": {
                "Actions": [{"ActionType": "RUN_SSM_DOCUMENTS", "Status": "STANDBY"}]
            },
            "budgets DescribeBudget": {
                "Budget": {
                    "BudgetLimit": {"Amount": "45.0", "Unit": "USD"},
                    "CalculatedSpend": {
                        "ActualSpend": {"Amount": "12.345", "Unit": "USD"}
                    },
                }
            },
            "cloudwatch GetMetricData": {
                "MetricDataResults": [
                    {"Label": "h4-ec2-start started hours_open", "Values": [1.0]},
                    {"Label": "h4-ec2-start outside_hours alarm", "Values": [1.0, 1.0]},
                    {
                        "Label": "h4-ec2-guard ec2_stopped_outside_hours hours_close",
                        "Values": [1.0],
                    },
                ]
            },
        }
        self.answers.update(over or {})

    def call(self, service: str, op: str, **params: object) -> dict:
        self.calls.append((service, op, dict(params)))
        key = (
            f"{service} {params['Name']}" if op == "GetParameter" else f"{service} {op}"
        )
        answer = self.answers.get(key)
        if isinstance(answer, BaseException):
            raise answer
        if answer is None:
            raise sink.AwsError("AccessDenied")
        return answer  # type: ignore[return-value]


class Clock:
    def __init__(self) -> None:
        self.t = 1_800_000_000.0

    def __call__(self) -> float:
        return self.t


def points(reads) -> dict[str, list[tuple[dict, float]]]:
    out: dict[str, list[tuple[dict, float]]] = {}
    for p in reads.points:
        out.setdefault(p.name, []).append((p.labels, p.value))
    return out


def test_each_read_becomes_its_metric() -> None:
    reads = sink.Sink(Aws(), ACCOUNT, Clock()).read()
    assert reads.errors == []
    got = points(reads)
    ones = [labels["state"] for labels, v in got["h4.ec2.state"] if v == 1]
    assert ones == ["running"]
    assert [labels["state"] for labels, v in got["h4.ec2.spot_request"] if v == 1] == [
        "active"
    ]
    assert got["h4.ec2.autostart"] == [({}, 1.0)]
    assert got["h4.health_check.healthy_share"] == [({}, 0.75)]
    assert got["h4.server_action.executed"] == [({}, 0.0)]
    assert got["h4.server.month_usd"] == [({}, 12.35)] or got[
        "h4.server.month_usd"
    ] == [({}, 12.34)]
    assert got["h4.server.budget_usd"] == [({}, 45.0)]
    assert (
        {"function": "h4-ec2-start", "outcome": "outside_hours", "trigger": "alarm"},
        2.0,
    ) in got["h4.ec2.outcomes_last_hour"]
    assert (
        {
            "function": "h4-ec2-guard",
            "outcome": "ec2_stopped_outside_hours",
            "trigger": "hours_close",
        },
        1.0,
    ) in got["h4.ec2.outcomes_last_hour"]


def test_ec2_with_no_tagged_instance_reads_none() -> None:
    reads = sink.Sink(
        Aws({"ec2 DescribeInstances": {"Reservations": []}}), ACCOUNT, Clock()
    ).read()
    got = points(reads)
    assert [labels["state"] for labels, v in got["h4.ec2.state"] if v == 1] == ["none"]
    assert [labels["state"] for labels, v in got["h4.ec2.spot_request"] if v == 1] == [
        "none"
    ]


def test_two_tagged_instances_are_an_error_never_the_first_one(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Group 10's review: a second instance tagged h4-prod-ec2 is the guard's case, not a state to show as EC2's.
    two = {
        "Reservations": [
            {
                "Instances": [
                    {"InstanceId": EC2_ID, "State": {"Name": "running"}},
                    {"InstanceId": "i-0" + "cd" * 8, "State": {"Name": "stopped"}},
                ]
            }
        ]
    }
    reads = sink.Sink(Aws({"ec2 DescribeInstances": two}), ACCOUNT, Clock()).read()
    assert "ec2" in reads.errors
    assert "h4.ec2.state" not in points(reads)
    assert reads.ec2_state == "unknown"


def test_an_executed_server_action_reads_1() -> None:
    over = {
        "budgets DescribeBudgetActionsForBudget": {
            "Actions": [
                {"ActionType": "RUN_SSM_DOCUMENTS", "Status": "EXECUTION_SUCCESS"}
            ]
        }
    }
    got = points(sink.Sink(Aws(over), ACCOUNT, Clock()).read())
    assert got["h4.server_action.executed"] == [({}, 1.0)]


@pytest.mark.parametrize(
    ("broken", "read", "metric"),
    [
        ("ec2 DescribeInstances", "ec2", "h4.ec2.state"),
        ("ec2 DescribeSpotInstanceRequests", "spot_request", "h4.ec2.spot_request"),
        ("ssm /h4reet/prod/ec2-autostart", "autostart", "h4.ec2.autostart"),
        (
            "route53 GetHealthCheckStatus",
            "health_check",
            "h4.health_check.healthy_share",
        ),
        (
            "budgets DescribeBudgetActionsForBudget",
            "server_action",
            "h4.server_action.executed",
        ),
        ("budgets DescribeBudget", "server_month", "h4.server.month_usd"),
        ("cloudwatch GetMetricData", "outcomes", "h4.ec2.outcomes_last_hour"),
    ],
)
def test_a_failed_read_is_an_error_never_a_fresh_value(
    broken: str, read: str, metric: str
) -> None:
    reads = sink.Sink(
        Aws({broken: sink.AwsError("ThrottlingException")}), ACCOUNT, Clock()
    ).read()
    assert read in reads.errors
    assert metric not in points(reads)


def test_the_server_budget_is_read_once_an_hour() -> None:
    aws, clock = Aws(), Clock()
    s = sink.Sink(aws, ACCOUNT, clock)
    s.read()
    clock.t += 120
    second = s.read()
    clock.t += 3600
    s.read()
    budget_reads = [c for c in aws.calls if c[:2] == ("budgets", "DescribeBudget")]
    assert len(budget_reads) == 2
    # Between its reads, the last good month stands, as it is: its read's own hourly value.
    assert "h4.server.month_usd" in points(second)


def test_the_outcomes_are_read_once_in_30_minutes() -> None:
    # Group 9's review A, I5: GetMetricData has no free tier and bills each metric its SEARCH returns, so the outcomes,
    # already a last-hour sum, are read once in 30 minutes, not every 2: about 1,440 calls a month, not 21,600.
    aws, clock = Aws(), Clock()
    s = sink.Sink(aws, ACCOUNT, clock)
    s.read()
    clock.t += 120
    second = s.read()
    clock.t += 1800
    s.read()
    reads = [c for c in aws.calls if c[:2] == ("cloudwatch", "GetMetricData")]
    assert len(reads) == 2
    assert sink.OUTCOMES_EVERY_S == 1800
    # Between its reads, the last good hour's sums stand, as the budget's month does.
    assert "h4.ec2.outcomes_last_hour" in points(second)


def test_the_reads_ask_by_name_and_tag_alone() -> None:
    aws = Aws()
    sink.Sink(aws, ACCOUNT, Clock()).read()
    by = {(s, o): p for s, o, p in aws.calls}
    assert by[("ec2", "DescribeInstances")] == {
        "Filters": [{"Name": "tag:Name", "Values": ["h4-prod-ec2"]}]
    }
    assert by[("budgets", "DescribeBudget")] == {
        "AccountId": ACCOUNT,
        "BudgetName": "h4-server-month",
    }
    assert "h4reet/handover" in json.dumps(by[("cloudwatch", "GetMetricData")])


def test_no_label_holds_a_secret_an_account_an_instance_or_an_address() -> None:
    reads = sink.Sink(Aws(), ACCOUNT, Clock()).read()
    payload = json.dumps(
        sink.otlp_payload(reads, {"ec2": 1}, 1_800_000_000.0, 1_800_000_120.0)
    )
    for value in (ACCOUNT, EC2_ID, SPOT_ID, CHECK_ID, "10.42.0.20", "198.51.100.1"):
        assert value not in payload
    assert not re.search(
        r"(?<![0-9])[0-9]{12}(?![0-9])",
        payload.replace("1800000000000000000", "").replace("1800000120000000000", ""),
    )


def test_the_payload_is_otlp_json_with_the_error_counter() -> None:
    reads = sink.Sink(
        Aws({"ec2 DescribeInstances": sink.AwsError("x")}), ACCOUNT, Clock()
    ).read()
    payload = sink.otlp_payload(
        reads, {"ec2": 3, "autostart": 0}, 1_800_000_000.0, 1_800_000_120.0
    )
    (rm,) = payload["resourceMetrics"]
    names = [m["name"] for m in rm["scopeMetrics"][0]["metrics"]]
    assert "h4.sink.read_errors" in names
    errors = next(
        m
        for m in rm["scopeMetrics"][0]["metrics"]
        if m["name"] == "h4.sink.read_errors"
    )
    counts = {
        p["attributes"][0]["value"]["stringValue"]: p["asInt"]
        for p in errors["sum"]["dataPoints"]
    }
    assert counts == {"autostart": "0", "ec2": "3"}
    resource = {
        a["key"]: a["value"]["stringValue"] for a in rm["resource"]["attributes"]
    }
    assert resource["service.name"] == "snapshot-sink"
