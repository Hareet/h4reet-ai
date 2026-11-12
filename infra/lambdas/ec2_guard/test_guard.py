"""Tests for h4-ec2-guard, infra/lambdas/ec2_guard/guard.py (spec 001 tasks.md T117; FR-071, FR-072; contracts/handover.md
§4, amended; contracts/aws-alerts.md §2; research.md R-15, R-30; ADR 0048, proposed; the regrouping note's question
10, taken on its recommended option).

On `h4-ec2-running` (EC2 entering `running`) and at the hours' close (`from: hours_close`), the guard:

  1. reads /h4reet/prod/ec2-instance-id; unreadable, it stops nothing and alerts `ec2_guard_failed` once;
  2. lists the running instances tagged Name = h4-prod-ec2, stops each the parameter doesn't name, and alerts
     `ec2_unrecognised_instance` with its ID. It never stops the named one for being a second;
  3. applies its table to the named one, if it runs, in the start function's order: the switch `off`
     (`ec2_stopped_paused`); outside the hours (`ec2_stopped_outside_hours`; at the close, whatever the clock); the
     server action run and not reversed (`ec2_stopped_server_budget`); the laptop serving, read as h4-laptop-away in
     `OK` (`ec2_stopped_laptop_serving`). Otherwise, nothing. A read that fails counts as its condition holding.

Each stop is one embedded-metric line and one alert, but the close's routine stop (provisional: question 3,
recommended option A, until the Author's answer). The window is H4_EC2_HOURS, as the start function's (provisional:
question 1a, recommended option A).
"""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
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


guard = _load("h4_ec2_guard", HERE / "guard.py")
start = _load("h4_ec2_start_for_guard", HERE.parent / "ec2_start" / "start.py")

HOURS = "America/Denver 07:00-19:00"
ACCOUNT = "1" * 4 + "2" * 4 + "3" * 4
TOPIC = f"arn:aws:sns:us-east-1:{ACCOUNT}:h4-alerts"
EC2_ID = "i-0" + "ab" * 8
OTHER_ID = "i-0" + "ef" * 8
INSIDE = datetime(2026, 11, 18, 17, 0, tzinfo=timezone.utc)
OUTSIDE = datetime(2026, 11, 19, 4, 0, tzinfo=timezone.utc)


class Context:
    invoked_function_arn = f"arn:aws:lambda:us-east-1:{ACCOUNT}:function:h4-ec2-guard"


def instance(iid: str, state: str = "running") -> dict:
    return {
        "InstanceId": iid,
        "State": {"Name": state},
        "Tags": [{"Key": "Name", "Value": "h4-prod-ec2"}],
    }


class Aws:
    def __init__(self, over: dict | None = None) -> None:
        self.calls: list[tuple[str, str, dict]] = []
        self.answers: dict[tuple[str, str], object] = {
            ("ssm", "/h4reet/prod/ec2-autostart"): {"Parameter": {"Value": "on"}},
            ("ssm", "/h4reet/prod/ec2-instance-id"): {"Parameter": {"Value": EC2_ID}},
            ("budgets", "DescribeBudgetActionsForBudget"): {
                "Actions": [{"ActionType": "RUN_SSM_DOCUMENTS", "Status": "STANDBY"}]
            },
            ("ec2", "DescribeInstances"): {
                "Reservations": [{"Instances": [instance(EC2_ID)]}]
            },
            ("cloudwatch", "DescribeAlarms"): {
                "MetricAlarms": [{"AlarmName": "h4-laptop-away", "StateValue": "ALARM"}]
            },
            ("ec2", "StopInstances"): {"StoppingInstances": []},
            ("sns", "Publish"): {"MessageId": "m-1"},
        }
        self.answers.update(over or {})

    def call(self, service: str, op: str, **params: object) -> dict:
        self.calls.append((service, op, dict(params)))
        key = (service, str(params["Name"])) if op == "GetParameter" else (service, op)
        answer = self.answers.get(key)
        if isinstance(answer, BaseException):
            raise answer
        if answer is None:
            raise guard.AwsError("AccessDenied")
        return answer  # type: ignore[return-value]

    def ops(self) -> list[tuple[str, str]]:
        return [(s, o) for s, o, _ in self.calls]

    def stops(self) -> list[list[str]]:
        return [p["InstanceIds"] for s, o, p in self.calls if o == "StopInstances"]

    def alerts(self) -> list[str]:
        return [p["Message"] for s, o, p in self.calls if (s, o) == ("sns", "Publish")]


@pytest.fixture(autouse=True)
def environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("H4_EC2_HOURS", HOURS)
    monkeypatch.setenv("H4_ALERTS_TOPIC_ARN", TOPIC)


RUNNING = {
    "source": "aws.ec2",
    "detail-type": "EC2 Instance State-change Notification",
    "detail": {"instance-id": EC2_ID, "state": "running"},
}
CLOSE = {"from": "hours_close"}


def run(event: object, aws: Aws, now: datetime = INSIDE) -> dict:
    return guard.handler(event, Context(), aws=aws, now=lambda: now)


def emf_lines(capsys: pytest.CaptureFixture[str]) -> list[dict]:
    return [
        doc
        for doc in (json.loads(line) for line in capsys.readouterr().out.splitlines())
        if "_aws" in doc
    ]


def with_alarm(state: str) -> dict:
    return {
        ("cloudwatch", "DescribeAlarms"): {
            "MetricAlarms": [{"AlarmName": "h4-laptop-away", "StateValue": state}]
        }
    }


# ----------------------------------------------------------------------------------------------------------------------
# Its table, on h4-ec2-running.


@pytest.mark.parametrize(
    ("over", "now", "kind"),
    [
        (with_alarm("OK"), INSIDE, "ec2_stopped_laptop_serving"),
        (
            {("ssm", "/h4reet/prod/ec2-autostart"): {"Parameter": {"Value": "off"}}},
            INSIDE,
            "ec2_stopped_paused",
        ),
        (
            {
                ("budgets", "DescribeBudgetActionsForBudget"): {
                    "Actions": [
                        {
                            "ActionType": "RUN_SSM_DOCUMENTS",
                            "Status": "EXECUTION_SUCCESS",
                        }
                    ]
                }
            },
            INSIDE,
            "ec2_stopped_server_budget",
        ),
        ({}, OUTSIDE, "ec2_stopped_outside_hours"),
    ],
)
def test_it_stops_the_named_instance_and_alerts_why(
    over: dict, now: datetime, kind: str, capsys: pytest.CaptureFixture[str]
) -> None:
    aws = Aws(over)
    result = run(RUNNING, aws, now=now)
    assert result["stopped"] == [EC2_ID] and result["outcome"] == kind
    assert aws.stops() == [[EC2_ID]]
    (alert,) = aws.alerts()
    assert alert.startswith(f"[hareet.ai aws] {kind}: ")
    (line,) = emf_lines(capsys)
    assert (line["Function"], line["Outcome"], line["Trigger"]) == (
        "h4-ec2-guard",
        kind,
        "running",
    )


def test_it_does_nothing_otherwise_and_writes_its_line(
    capsys: pytest.CaptureFixture[str],
) -> None:
    aws = Aws()
    result = run(RUNNING, aws)
    assert result["outcome"] == "nothing" and aws.stops() == [] and aws.alerts() == []
    (line,) = emf_lines(capsys)
    assert line["Outcome"] == "nothing"


def test_the_switch_wins_then_the_hours_then_the_budget_then_the_laptop() -> None:
    every = {
        ("ssm", "/h4reet/prod/ec2-autostart"): {"Parameter": {"Value": "off"}},
        ("budgets", "DescribeBudgetActionsForBudget"): {
            "Actions": [
                {"ActionType": "RUN_SSM_DOCUMENTS", "Status": "EXECUTION_SUCCESS"}
            ]
        },
        **with_alarm("OK"),
    }
    assert run(RUNNING, Aws(every), now=OUTSIDE)["outcome"] == "ec2_stopped_paused"
    del every[("ssm", "/h4reet/prod/ec2-autostart")]
    assert (
        run(RUNNING, Aws(every), now=OUTSIDE)["outcome"] == "ec2_stopped_outside_hours"
    )
    assert (
        run(RUNNING, Aws(every), now=INSIDE)["outcome"] == "ec2_stopped_server_budget"
    )


def test_it_stops_only_tagged_instances_found_by_their_tag() -> None:
    aws = Aws()
    run(RUNNING, aws)
    asked = [p for s, o, p in aws.calls if o == "DescribeInstances"]
    assert asked == [
        {
            "Filters": [
                {"Name": "tag:Name", "Values": ["h4-prod-ec2"]},
                {"Name": "instance-state-name", "Values": ["pending", "running"]},
            ]
        }
    ]


def test_an_untagged_named_instance_isnt_stopped() -> None:
    # The parameter names an instance the tag filter doesn't find: the guard may stop only a tagged one.
    aws = Aws({("ec2", "DescribeInstances"): {"Reservations": []}, **with_alarm("OK")})
    result = run(RUNNING, aws)
    assert result["outcome"] == "nothing" and aws.stops() == []


# ----------------------------------------------------------------------------------------------------------------------
# More than one tagged instance (contracts/handover.md §4, amended; question 10).


def test_a_second_tagged_instance_is_stopped_and_alerted_with_its_id_then_the_table_runs() -> (
    None
):
    aws = Aws(
        {
            ("ec2", "DescribeInstances"): {
                "Reservations": [
                    {"Instances": [instance(OTHER_ID)]},
                    {"Instances": [instance(EC2_ID)]},
                ]
            },
            **with_alarm("OK"),
        }
    )
    result = run(RUNNING, aws)
    assert aws.stops() == [[OTHER_ID], [EC2_ID]]
    first, second = aws.alerts()
    assert first.startswith("[hareet.ai aws] ec2_unrecognised_instance: ")
    assert f"- instance: {OTHER_ID}" in first.splitlines()
    assert second.startswith("[hareet.ai aws] ec2_stopped_laptop_serving: ")
    assert result["stopped"] == [OTHER_ID, EC2_ID]


def test_it_never_stops_the_named_one_for_being_a_second() -> None:
    aws = Aws(
        {
            ("ec2", "DescribeInstances"): {
                "Reservations": [{"Instances": [instance(EC2_ID), instance(OTHER_ID)]}]
            }
        }
    )
    run(RUNNING, aws)
    assert aws.stops() == [[OTHER_ID]]


def test_the_unrecognised_one_is_alerted_at_the_close_too() -> None:
    aws = Aws(
        {
            ("ec2", "DescribeInstances"): {
                "Reservations": [{"Instances": [instance(OTHER_ID)]}]
            }
        }
    )
    run(CLOSE, aws)
    (alert,) = aws.alerts()
    assert alert.startswith("[hareet.ai aws] ec2_unrecognised_instance: ")


def test_with_the_parameter_unreadable_it_stops_nothing_and_alerts_once() -> None:
    aws = Aws(
        {("ssm", "/h4reet/prod/ec2-instance-id"): guard.AwsError("ParameterNotFound")}
    )
    result = run(RUNNING, aws)
    assert aws.stops() == [] and result["outcome"] == "ec2_guard_failed"
    (alert,) = aws.alerts()
    assert alert.startswith("[hareet.ai aws] ec2_guard_failed: ")
    assert "- unread: ParameterNotFound" in alert.splitlines()


def test_with_the_listing_unreadable_it_stops_nothing_and_alerts_once() -> None:
    aws = Aws({("ec2", "DescribeInstances"): guard.AwsError("UnauthorizedOperation")})
    run(CLOSE, aws)
    assert aws.stops() == []
    (alert,) = aws.alerts()
    assert alert.startswith("[hareet.ai aws] ec2_guard_failed: ")


@pytest.mark.parametrize(
    ("broken", "kind"),
    [
        (("ssm", "/h4reet/prod/ec2-autostart"), "ec2_stopped_paused"),
        (("budgets", "DescribeBudgetActionsForBudget"), "ec2_stopped_server_budget"),
        (("cloudwatch", "DescribeAlarms"), "ec2_stopped_laptop_serving"),
    ],
)
def test_a_failed_read_of_a_condition_counts_as_it_holding(
    broken: tuple[str, str], kind: str
) -> None:
    aws = Aws({broken: guard.AwsError("ThrottlingException")})
    result = run(RUNNING, aws)
    assert result["outcome"] == kind and aws.stops() == [[EC2_ID]]
    (alert,) = aws.alerts()
    assert "- unread: ThrottlingException" in alert.splitlines()


def test_a_failed_stop_is_alerted_as_the_guards_failure() -> None:
    aws = Aws(
        {
            ("ec2", "StopInstances"): guard.AwsError("IncorrectInstanceState"),
            **with_alarm("OK"),
        }
    )
    result = run(RUNNING, aws)
    assert result["outcome"] == "ec2_guard_failed"
    (alert,) = aws.alerts()
    assert "- code: IncorrectInstanceState" in alert.splitlines()


def test_an_unexpected_error_is_one_alert_never_a_raise() -> None:
    aws = Aws({("ec2", "StopInstances"): RuntimeError("boom"), **with_alarm("OK")})
    assert run(RUNNING, aws)["outcome"] == "ec2_guard_failed"


# ----------------------------------------------------------------------------------------------------------------------
# The close (ADR 0048, decision 4).


def test_the_close_stops_ec2_if_it_runs_whatever_the_clock_says(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # The schedule's invocation is the close, even a second early.
    aws = Aws()
    result = run(CLOSE, aws, now=INSIDE)
    assert result["outcome"] == "ec2_stopped_outside_hours"
    assert aws.stops() == [[EC2_ID]]
    (line,) = emf_lines(capsys)
    assert (line["Outcome"], line["Trigger"]) == (
        "ec2_stopped_outside_hours",
        "hours_close",
    )


def test_the_closes_routine_stop_isnt_alerted_provisionally_question_3() -> None:
    assert guard.SCHEDULED_ALERTED == start.SCHEDULED_ALERTED
    aws = Aws()
    run(CLOSE, aws)
    assert aws.alerts() == []


def test_the_close_writes_only_its_line_while_ec2_is_stopped(
    capsys: pytest.CaptureFixture[str],
) -> None:
    aws = Aws({("ec2", "DescribeInstances"): {"Reservations": []}})
    result = run(CLOSE, aws)
    assert result["outcome"] == "nothing" and aws.stops() == [] and aws.alerts() == []
    (line,) = emf_lines(capsys)
    assert (line["Outcome"], line["Trigger"]) == ("nothing", "hours_close")


def test_an_unknown_event_stops_nothing_and_alerts() -> None:
    aws = Aws()
    result = run({"from": "elsewhere"}, aws)
    assert result["outcome"] == "ec2_guard_failed" and aws.stops() == []
    assert "- code: unknown_trigger" in aws.alerts()[0].splitlines()


def test_each_stop_is_one_line_and_the_namespace_is_the_start_functions(
    capsys: pytest.CaptureFixture[str],
) -> None:
    aws = Aws(
        {
            ("ec2", "DescribeInstances"): {
                "Reservations": [{"Instances": [instance(OTHER_ID), instance(EC2_ID)]}]
            },
            **with_alarm("OK"),
        }
    )
    run(RUNNING, aws)
    lines = emf_lines(capsys)
    assert [line["Outcome"] for line in lines] == [
        "ec2_unrecognised_instance",
        "ec2_stopped_laptop_serving",
    ]
    for line in lines:
        (directive,) = line["_aws"]["CloudWatchMetrics"]
        assert directive["Namespace"] == "h4reet/handover"
        assert directive["Dimensions"] == [["Function", "Outcome"]]


# ----------------------------------------------------------------------------------------------------------------------
# One window, as the start function's: both read H4_EC2_HOURS with the same rules.


def test_the_guard_and_the_start_function_read_the_window_alike() -> None:
    assert guard.ZONES == start.ZONES
    for value in ("America/Denver 07:00-19:00", "Etc/GMT+7 07:00-19:00"):
        g, s = guard.parse_hours(value), start.parse_hours(value)
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        while now < datetime(2028, 1, 1, tzinfo=timezone.utc):
            assert g.inside(now) is s.inside(now), (value, now)
            now += timedelta(minutes=30)


def test_an_unreadable_window_counts_as_outside(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("H4_EC2_HOURS", "Mars/Olympus 07:00-19:00")
    aws = Aws()
    assert run(RUNNING, aws)["outcome"] == "ec2_stopped_outside_hours"
    assert "- unread: hours" in aws.alerts()[0].splitlines()
