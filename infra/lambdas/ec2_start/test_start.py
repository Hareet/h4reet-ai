"""Tests for h4-ec2-start, infra/lambdas/ec2_start/start.py (spec 001 tasks.md T116; FR-065, FR-069, FR-070, FR-076;
contracts/handover.md §3; contracts/aws-alerts.md §2; research.md R-15, R-29; ADR 0048, proposed; ADR 0049, proposed).

The function makes one attempt per invocation and never loops. Its checks, in order (ADR 0048, decision 3):

  1. `paused`, while the autostart switch, /h4reet/prod/ec2-autostart, isn't `on`;
  2. `outside_hours`, outside the window H4_EC2_HOURS names, which infra/account/handover.tf's local.ec2_hours sets.
     Provisional: question 1a, recommended option A (America/Denver, 07:00-19:00), until the Author's answer; and,
     for a hand start, question 2, recommended option A (refused like every start), until his answer;
  3. `server_budget_stopped`, while the server action on h4-server-month has run and isn't reversed;
  4. `tunnel_end_down`, while no instance named h4-prod-tunnel-end runs (FR-076);
  5. `laptop_serving`, by hand, `from: tunnel_end_back`, or `from: hours_open`, while h4-laptop-away reads OK
     (research.md R-15, amended: the alarm by its name, never the health check);
  6. the start of the instance /h4reet/prod/ec2-instance-id names, only if it carries Name = h4-prod-ec2; or
     `start_failed`, with AWS's code.

A read that fails refuses at its own step, with `unread` among the facts, and is always alerted: the function starts
EC2 only on checks that all pass. Each outcome is one embedded-metric log line and, but for the scheduled open's
routine outcomes (provisional: question 3, recommended option A, until the Author's answer), one alert on h4-alerts in
contracts/aws-alerts.md §2's format. AWS is a stub here; the window is checked against the machine's time-zone
database, which the function itself doesn't need.
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


start = _load("h4_ec2_start", HERE / "start.py")

# Provisional: question 1a, recommended option A, until the Author's answer. Option B is "Etc/GMT+7 07:00-19:00".
HOURS = "America/Denver 07:00-19:00"
ACCOUNT = "1" * 4 + "2" * 4 + "3" * 4
TOPIC = f"arn:aws:sns:us-east-1:{ACCOUNT}:h4-alerts"
EC2_ID = "i-0" + "ab" * 8
TUNNEL_ID = "i-0" + "cd" * 8
# A Wednesday in November, 10:00 in Denver (UTC−7): inside the hours.
INSIDE = datetime(2026, 11, 18, 17, 0, tzinfo=timezone.utc)
# The same day, 21:00 in Denver: outside.
OUTSIDE = datetime(2026, 11, 19, 4, 0, tzinfo=timezone.utc)


class Context:
    invoked_function_arn = f"arn:aws:lambda:us-east-1:{ACCOUNT}:function:h4-ec2-start"


class Aws:
    """AWS's APIs as the function calls them: each answer by (service, operation), an AwsError where the test says."""

    def __init__(self, over: dict | None = None) -> None:
        self.calls: list[tuple[str, str, dict]] = []
        self.answers: dict[tuple[str, str], object] = {
            ("ssm", "GetParameter:/h4reet/prod/ec2-autostart"): {
                "Parameter": {"Value": "on"}
            },
            ("ssm", "GetParameter:/h4reet/prod/ec2-instance-id"): {
                "Parameter": {"Value": EC2_ID}
            },
            ("budgets", "DescribeBudgetActionsForBudget"): {
                "Actions": [
                    {"ActionType": "RUN_SSM_DOCUMENTS", "Status": "STANDBY"},
                ]
            },
            ("ec2", "DescribeInstances:tunnel"): {
                "Reservations": [
                    {
                        "Instances": [
                            {"InstanceId": TUNNEL_ID, "State": {"Name": "running"}}
                        ]
                    }
                ]
            },
            ("ec2", "DescribeInstances:ec2"): {
                "Reservations": [
                    {
                        "Instances": [
                            {
                                "InstanceId": EC2_ID,
                                "State": {"Name": "stopped"},
                                "Tags": [{"Key": "Name", "Value": "h4-prod-ec2"}],
                            }
                        ]
                    }
                ]
            },
            ("cloudwatch", "DescribeAlarms"): {
                "MetricAlarms": [{"AlarmName": "h4-laptop-away", "StateValue": "ALARM"}]
            },
            ("ec2", "StartInstances"): {
                "StartingInstances": [
                    {"InstanceId": EC2_ID, "CurrentState": {"Name": "pending"}}
                ]
            },
            ("sns", "Publish"): {"MessageId": "m-1"},
        }
        self.answers.update(over or {})

    def key(self, service: str, op: str, params: dict) -> tuple[str, str]:
        if op == "GetParameter":
            return (service, f"{op}:{params.get('Name')}")
        if op == "DescribeInstances":
            if params.get("InstanceIds"):
                return (service, f"{op}:ec2")
            return (service, f"{op}:tunnel")
        return (service, op)

    def call(self, service: str, op: str, **params: object) -> dict:
        self.calls.append((service, op, dict(params)))
        answer = self.answers.get(self.key(service, op, params))
        if isinstance(answer, BaseException):
            raise answer
        if answer is None:
            raise start.AwsError("AccessDenied")
        return answer  # type: ignore[return-value]

    def ops(self) -> list[tuple[str, str]]:
        return [(s, o) for s, o, _ in self.calls]

    def alerts(self) -> list[str]:
        return [p["Message"] for s, o, p in self.calls if (s, o) == ("sns", "Publish")]


@pytest.fixture(autouse=True)
def environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("H4_EC2_HOURS", HOURS)
    monkeypatch.setenv("H4_ALERTS_TOPIC_ARN", TOPIC)


def run(event: object, aws: Aws, now: datetime = INSIDE, capsys=None) -> dict:
    return start.handler(event, Context(), aws=aws, now=lambda: now)


ALARM = {
    "source": "aws.cloudwatch",
    "detail-type": "CloudWatch Alarm State Change",
    "detail": {"alarmName": "h4-laptop-away", "state": {"value": "ALARM"}},
}
MANUAL = {"manual": True}
BACK = {"from": "tunnel_end_back"}
OPEN = {"from": "hours_open"}
TRIGGERS = {
    "alarm": ALARM,
    "manual": MANUAL,
    "tunnel_end_back": BACK,
    "hours_open": OPEN,
}


def emf_lines(capsys: pytest.CaptureFixture[str]) -> list[dict]:
    out = []
    for line in capsys.readouterr().out.splitlines():
        doc = json.loads(line)
        if "_aws" in doc:
            out.append(doc)
    return out


# ----------------------------------------------------------------------------------------------------------------------
# The steps, in order.


def test_it_starts_the_named_tagged_instance_once_and_alerts_ec2_started(
    capsys: pytest.CaptureFixture[str],
) -> None:
    aws = Aws()
    result = run(ALARM, aws)
    assert result["outcome"] == "started", result
    starts = [p for s, o, p in aws.calls if (s, o) == ("ec2", "StartInstances")]
    assert starts == [{"InstanceIds": [EC2_ID]}]
    (alert,) = aws.alerts()
    assert alert.startswith("[hareet.ai aws] ec2_started: ")
    assert "- trigger: alarm" in alert.splitlines()
    (line,) = emf_lines(capsys)
    assert (line["Function"], line["Outcome"], line["Trigger"]) == (
        "h4-ec2-start",
        "started",
        "alarm",
    )


@pytest.mark.parametrize("trigger", sorted(TRIGGERS))
def test_step_1_refuses_paused_while_the_switch_is_off(trigger: str) -> None:
    aws = Aws(
        {
            ("ssm", "GetParameter:/h4reet/prod/ec2-autostart"): {
                "Parameter": {"Value": "off"}
            }
        }  # type: ignore[arg-type]
    )
    result = run(TRIGGERS[trigger], aws)
    assert (result["outcome"], result["reason"]) == ("refused", "paused")
    assert ("ec2", "StartInstances") not in aws.ops()
    # Paused comes first: nothing else is read.
    assert [o for _, o in aws.ops()] == ["GetParameter"] + (
        [] if trigger == "hours_open" else ["Publish"]
    )


@pytest.mark.parametrize("trigger", sorted(TRIGGERS))
def test_step_2_refuses_outside_hours_after_paused_and_before_the_budget(
    trigger: str,
) -> None:
    aws = Aws()
    result = run(TRIGGERS[trigger], aws, now=OUTSIDE)
    assert (result["outcome"], result["reason"]) == ("refused", "outside_hours")
    assert ("budgets", "DescribeBudgetActionsForBudget") not in aws.ops()
    assert ("ec2", "StartInstances") not in aws.ops()


def test_a_hand_start_outside_the_hours_is_refused_too_provisionally_question_2() -> (
    None
):
    # Provisional: question 2, recommended option A, until the Author's answer. Options B and C would let it run.
    assert start.HAND_START_OUTSIDE_HOURS is False
    aws = Aws()
    result = run(MANUAL, aws, now=OUTSIDE)
    assert result["reason"] == "outside_hours"
    (alert,) = aws.alerts()
    assert alert.startswith("[hareet.ai aws] ec2_start_refused (outside_hours): ")


@pytest.mark.parametrize(
    "status",
    [
        "EXECUTION_IN_PROGRESS",
        "EXECUTION_SUCCESS",
        "EXECUTION_FAILURE",
        "REVERSE_IN_PROGRESS",
        "REVERSE_FAILURE",
        "PENDING",
        "SOMETHING_NEW",
    ],
)
def test_step_3_refuses_server_budget_stopped_unless_the_action_waits_or_is_reversed(
    status: str,
) -> None:
    aws = Aws(
        {
            ("budgets", "DescribeBudgetActionsForBudget"): {
                "Actions": [{"ActionType": "RUN_SSM_DOCUMENTS", "Status": status}]
            }
        }  # type: ignore[arg-type]
    )
    result = run(ALARM, aws)
    assert (result["outcome"], result["reason"]) == ("refused", "server_budget_stopped")
    asked = [p for s, o, p in aws.calls if o == "DescribeBudgetActionsForBudget"]
    assert asked == [{"AccountId": ACCOUNT, "BudgetName": "h4-server-month"}]


@pytest.mark.parametrize("status", ["STANDBY", "REVERSE_SUCCESS"])
def test_step_3_passes_while_the_action_waits_or_was_reversed(status: str) -> None:
    aws = Aws(
        {
            ("budgets", "DescribeBudgetActionsForBudget"): {
                "Actions": [
                    # The month's other actions don't count: only the server's, which runs a document.
                    {"ActionType": "APPLY_IAM_POLICY", "Status": "EXECUTION_SUCCESS"},
                    {"ActionType": "RUN_SSM_DOCUMENTS", "Status": status},
                ]
            }
        }  # type: ignore[arg-type]
    )
    assert run(ALARM, aws)["outcome"] == "started"


def test_step_3_refuses_when_the_budget_holds_no_server_action() -> None:
    aws = Aws(
        {("budgets", "DescribeBudgetActionsForBudget"): {"Actions": []}}  # type: ignore[arg-type]
    )
    result = run(ALARM, aws)
    assert result["reason"] == "server_budget_stopped"


@pytest.mark.parametrize("state", ["stopped", "stopping", "pending", "shutting-down"])
def test_step_4_refuses_tunnel_end_down_while_it_isnt_running(state: str) -> None:
    aws = Aws(
        {
            ("ec2", "DescribeInstances:tunnel"): {
                "Reservations": [
                    {"Instances": [{"InstanceId": TUNNEL_ID, "State": {"Name": state}}]}
                ]
            }
        }  # type: ignore[arg-type]
    )
    result = run(ALARM, aws)
    assert result["reason"] == "tunnel_end_down"
    (alert,) = aws.alerts()
    assert alert.startswith("[hareet.ai aws] ec2_start_refused (tunnel_end_down): ")
    asked = [
        p
        for s, o, p in aws.calls
        if o == "DescribeInstances" and not p.get("InstanceIds")
    ]
    assert asked == [
        {"Filters": [{"Name": "tag:Name", "Values": ["h4-prod-tunnel-end"]}]}
    ]


@pytest.mark.parametrize("trigger", ["manual", "tunnel_end_back", "hours_open"])
def test_step_5_refuses_laptop_serving_by_hand_on_return_and_at_the_open(
    trigger: str,
) -> None:
    aws = Aws(
        {
            ("cloudwatch", "DescribeAlarms"): {
                "MetricAlarms": [{"AlarmName": "h4-laptop-away", "StateValue": "OK"}]
            }
        }  # type: ignore[arg-type]
    )
    result = run(TRIGGERS[trigger], aws)
    assert result["reason"] == "laptop_serving"
    asked = [p for s, o, p in aws.calls if o == "DescribeAlarms"]
    assert asked == [{"AlarmNames": ["h4-laptop-away"]}]
    assert ("ec2", "StartInstances") not in aws.ops()


def test_step_5_is_skipped_on_the_alarms_own_change() -> None:
    # The alarm's change into ALARM is the laptop going: nothing to read.
    aws = Aws(
        {
            ("cloudwatch", "DescribeAlarms"): {
                "MetricAlarms": [{"AlarmName": "h4-laptop-away", "StateValue": "OK"}]
            }
        }  # type: ignore[arg-type]
    )
    assert run(ALARM, aws)["outcome"] == "started"
    assert ("cloudwatch", "DescribeAlarms") not in aws.ops()


def test_the_order_is_paused_hours_budget_tunnel_end_laptop_then_the_start() -> None:
    aws = Aws()
    run(MANUAL, aws)
    reads = [
        (s, o)
        for s, o, p in aws.calls
        if (s, o) != ("sns", "Publish")
        and not (
            o == "GetParameter" and p.get("Name") == "/h4reet/prod/ec2-instance-id"
        )
        and not (o == "DescribeInstances" and p.get("InstanceIds"))
    ]
    assert reads == [
        ("ssm", "GetParameter"),
        ("budgets", "DescribeBudgetActionsForBudget"),
        ("ec2", "DescribeInstances"),
        ("cloudwatch", "DescribeAlarms"),
        ("ec2", "StartInstances"),
    ]


def test_step_6_reads_the_instance_by_its_parameter_and_needs_its_tag() -> None:
    aws = Aws(
        {
            ("ec2", "DescribeInstances:ec2"): {
                "Reservations": [
                    {
                        "Instances": [
                            {
                                "InstanceId": EC2_ID,
                                "State": {"Name": "stopped"},
                                "Tags": [{"Key": "Name", "Value": "someone-else"}],
                            }
                        ]
                    }
                ]
            }
        }  # type: ignore[arg-type]
    )
    result = run(ALARM, aws)
    assert (result["outcome"], result["reason"]) == ("refused", "start_failed")
    assert ("ec2", "StartInstances") not in aws.ops()
    (alert,) = aws.alerts()
    assert "- code: untagged" in alert.splitlines()


def test_start_failed_carries_awss_code_and_makes_one_attempt() -> None:
    aws = Aws(
        {("ec2", "StartInstances"): start.AwsError("InsufficientInstanceCapacity")}  # type: ignore[arg-type]
    )
    result = run(ALARM, aws)
    assert (result["outcome"], result["reason"]) == ("refused", "start_failed")
    assert aws.ops().count(("ec2", "StartInstances")) == 1
    (alert,) = aws.alerts()
    assert alert.startswith("[hareet.ai aws] ec2_start_refused (start_failed): ")
    assert "- code: InsufficientInstanceCapacity" in alert.splitlines()


# ----------------------------------------------------------------------------------------------------------------------
# Fail closed: a read that fails refuses at its step, and is always alerted, the scheduled open's too.


@pytest.mark.parametrize(
    ("broken", "reason"),
    [
        (("ssm", "GetParameter:/h4reet/prod/ec2-autostart"), "paused"),
        (("budgets", "DescribeBudgetActionsForBudget"), "server_budget_stopped"),
        (("ec2", "DescribeInstances:tunnel"), "tunnel_end_down"),
        (("cloudwatch", "DescribeAlarms"), "laptop_serving"),
        (("ssm", "GetParameter:/h4reet/prod/ec2-instance-id"), "start_failed"),
        (("ec2", "DescribeInstances:ec2"), "start_failed"),
    ],
)
def test_a_failed_read_refuses_at_its_step_and_alerts(
    broken: tuple[str, str], reason: str
) -> None:
    aws = Aws({broken: start.AwsError("ThrottlingException")})  # type: ignore[arg-type]
    result = run(OPEN, aws)
    assert (result["outcome"], result["reason"]) == ("refused", reason)
    assert ("ec2", "StartInstances") not in aws.ops()
    (alert,) = aws.alerts()
    assert "- unread: ThrottlingException" in alert.splitlines()


@pytest.mark.parametrize(
    "value",
    [
        "",
        "America/Denver",
        "Mars/Olympus 07:00-19:00",
        "America/Denver 19:00-07:00",
        "x 7-19",
    ],
)
def test_an_unreadable_window_refuses_outside_hours_and_alerts(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("H4_EC2_HOURS", value)
    aws = Aws()
    result = run(OPEN, aws)
    assert result["reason"] == "outside_hours"
    (alert,) = aws.alerts()
    assert "- unread: hours" in alert.splitlines()


def test_an_unknown_event_starts_nothing_and_alerts() -> None:
    aws = Aws()
    result = run({"from": "somewhere"}, aws)
    assert (result["outcome"], result["reason"]) == ("refused", "start_failed")
    assert ("ec2", "StartInstances") not in aws.ops()
    (alert,) = aws.alerts()
    assert "- code: unknown_trigger" in alert.splitlines()


def test_an_unexpected_error_is_one_refusal_never_a_raise() -> None:
    # A raise would let Lambda retry the invocation, a second attempt (FR-065: one per invocation).
    aws = Aws({("ec2", "StartInstances"): RuntimeError("boom")})  # type: ignore[arg-type]
    result = run(ALARM, aws)
    assert (result["outcome"], result["reason"]) == ("refused", "start_failed")
    assert "- code: RuntimeError" in aws.alerts()[0].splitlines()


# ----------------------------------------------------------------------------------------------------------------------
# One embedded-metric line per outcome; one alert per outcome but the scheduled open's routine ones (question 3).


@pytest.mark.parametrize("trigger", sorted(TRIGGERS))
def test_one_embedded_metric_line_per_outcome(
    trigger: str, capsys: pytest.CaptureFixture[str]
) -> None:
    run(TRIGGERS[trigger], Aws())
    (line,) = emf_lines(capsys)
    (directive,) = line["_aws"]["CloudWatchMetrics"]
    assert directive["Namespace"] == "h4reet/handover"
    assert directive["Dimensions"] == [["Function", "Trigger", "Outcome"]]
    assert directive["Metrics"] == [{"Name": "Outcomes", "Unit": "Count"}]
    assert line["Outcomes"] == 1 and line["Trigger"] == trigger


def test_the_alerted_set_at_the_scheduled_open_is_one_constant_provisionally_question_3() -> (
    None
):
    # Provisional: question 3, recommended option A, until the Author's answer. Option B alerts every outcome.
    assert start.SCHEDULED_ALERTED == frozenset(
        {"start_failed", "server_budget_stopped", "tunnel_end_down"}
    )


@pytest.mark.parametrize(
    ("over", "reason", "alerted"),
    [
        ({}, "started", False),
        (
            {
                ("ssm", "GetParameter:/h4reet/prod/ec2-autostart"): {
                    "Parameter": {"Value": "off"}
                }
            },
            "paused",
            False,
        ),
        (
            {
                ("cloudwatch", "DescribeAlarms"): {
                    "MetricAlarms": [
                        {"AlarmName": "h4-laptop-away", "StateValue": "OK"}
                    ]
                }
            },
            "laptop_serving",
            False,
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
            "server_budget_stopped",
            True,
        ),
        (
            {("ec2", "DescribeInstances:tunnel"): {"Reservations": []}},
            "tunnel_end_down",
            True,
        ),
        (
            {("ec2", "StartInstances"): start.AwsError("InsufficientInstanceCapacity")},
            "start_failed",
            True,
        ),
    ],
)
def test_the_scheduled_open_alerts_only_what_needs_the_author(
    over: dict, reason: str, alerted: bool, capsys: pytest.CaptureFixture[str]
) -> None:
    aws = Aws(over)
    result = run(OPEN, aws)
    assert result.get("reason", result["outcome"]) == reason
    assert bool(aws.alerts()) is alerted
    # Recorded either way, for the dashboard.
    assert len(emf_lines(capsys)) == 1


@pytest.mark.parametrize("trigger", ["alarm", "manual", "tunnel_end_back"])
def test_every_other_trigger_alerts_each_outcome_as_fr_065_says(trigger: str) -> None:
    aws = Aws(
        {
            ("ssm", "GetParameter:/h4reet/prod/ec2-autostart"): {
                "Parameter": {"Value": "off"}
            }
        }  # type: ignore[arg-type]
    )
    run(TRIGGERS[trigger], aws)
    assert len(aws.alerts()) == 1


def test_an_alert_carries_no_account_no_instance_beyond_ec2s_and_no_address() -> None:
    aws = Aws()
    run(ALARM, aws)
    (alert,) = aws.alerts()
    assert ACCOUNT not in alert and TUNNEL_ID not in alert
    publish = next(p for s, o, p in aws.calls if o == "Publish")
    assert publish["TopicArn"] == TOPIC


def test_a_failed_publish_is_logged_and_never_raised() -> None:
    aws = Aws({("sns", "Publish"): start.AwsError("AuthorizationError")})  # type: ignore[arg-type]
    assert run(ALARM, aws)["outcome"] == "started"


# ----------------------------------------------------------------------------------------------------------------------
# The window (ADR 0048, decision 1). The function carries both of question 1a's zones by their rules, so it needs no
# time-zone database in its base: whether AWS's python3.14 base for arm64 carries one couldn't be confirmed from the
# agents' engine, which can't pull it. The tests hold the rules to the machine's database instead.


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    ("hours", "now", "inside"),
    [
        # Option A, America/Denver. Winter, UTC−7: 07:00 is 14:00 UTC, 19:00 is 02:00 UTC the next day.
        (HOURS, utc(2026, 1, 14, 13, 59, 59), False),
        (HOURS, utc(2026, 1, 14, 14, 0, 0), True),
        (HOURS, utc(2026, 1, 15, 1, 59, 59), True),
        (HOURS, utc(2026, 1, 15, 2, 0, 0), False),
        # Summer, UTC−6: 07:00 is 13:00 UTC, 19:00 is 01:00 UTC.
        (HOURS, utc(2026, 7, 15, 12, 59, 59), False),
        (HOURS, utc(2026, 7, 15, 13, 0, 0), True),
        (HOURS, utc(2026, 7, 16, 0, 59, 59), True),
        (HOURS, utc(2026, 7, 16, 1, 0, 0), False),
        # The spring change, 8 March 2026 at 02:00 local: the Saturday before by the winter clock, the Sunday after
        # by the summer one, and the Monday.
        (HOURS, utc(2026, 3, 7, 13, 30), False),
        (HOURS, utc(2026, 3, 7, 14, 0), True),
        (HOURS, utc(2026, 3, 8, 13, 0), True),
        (HOURS, utc(2026, 3, 8, 12, 59), False),
        (HOURS, utc(2026, 3, 9, 1, 0), False),
        (HOURS, utc(2026, 3, 9, 0, 59), True),
        # The autumn change, 1 November 2026 at 02:00 local: the Saturday by the summer clock, the Sunday and Monday
        # by the winter one.
        (HOURS, utc(2026, 10, 31, 13, 0), True),
        (HOURS, utc(2026, 10, 31, 12, 59), False),
        (HOURS, utc(2026, 11, 1, 13, 30), False),
        (HOURS, utc(2026, 11, 1, 14, 0), True),
        (HOURS, utc(2026, 11, 2, 1, 59), True),
        (HOURS, utc(2026, 11, 2, 2, 0), False),
        # Option B, Etc/GMT+7: 14:00 to 02:00 UTC all year, so 8am to 8pm by Denver's summer clock.
        ("Etc/GMT+7 07:00-19:00", utc(2026, 7, 15, 13, 30), False),
        ("Etc/GMT+7 07:00-19:00", utc(2026, 7, 15, 14, 0), True),
        ("Etc/GMT+7 07:00-19:00", utc(2026, 7, 16, 1, 59), True),
        ("Etc/GMT+7 07:00-19:00", utc(2026, 7, 16, 2, 0), False),
        ("Etc/GMT+7 07:00-19:00", utc(2026, 3, 8, 13, 0), False),
        ("Etc/GMT+7 07:00-19:00", utc(2026, 11, 1, 14, 0), True),
    ],
)
def test_each_edge_of_the_window_in_both_zones_and_each_side_of_each_change(
    hours: str, now: datetime, inside: bool
) -> None:
    assert start.parse_hours(hours).inside(now) is inside


def zoneinfo_or_skip(zone: str):
    zoneinfo = pytest.importorskip("zoneinfo")
    try:
        return zoneinfo.ZoneInfo(zone)
    except zoneinfo.ZoneInfoNotFoundError:
        pytest.skip(f"the machine has no time-zone database for {zone}")


@pytest.mark.parametrize("zone", ["America/Denver", "Etc/GMT+7"])
def test_the_carried_rules_match_the_time_zone_database_every_half_hour_to_2036(
    zone: str,
) -> None:
    tz = zoneinfo_or_skip(zone)
    hours = start.parse_hours(f"{zone} 07:00-19:00")
    now = utc(2026, 1, 1)
    end = utc(2036, 12, 31)
    wrong = []
    while now < end:
        local = now.astimezone(tz)
        want = 7 <= local.hour < 19
        if hours.inside(now) is not want:
            wrong.append(now.isoformat())
        now += timedelta(minutes=30)
    assert wrong == []


def test_the_window_comes_from_the_one_environment_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("H4_EC2_HOURS", "Etc/GMT+7 07:00-19:00")
    # 13:30 UTC in July is 07:30 in Denver, but 06:30 by a fixed UTC−7.
    assert run(OPEN, Aws(), now=utc(2026, 7, 15, 13, 30))["reason"] == "outside_hours"
    monkeypatch.setenv("H4_EC2_HOURS", HOURS)
    assert run(OPEN, Aws(), now=utc(2026, 7, 15, 13, 30))["outcome"] == "started"


def test_the_carried_zones_are_question_1as_two() -> None:
    assert set(start.ZONES) == {"America/Denver", "Etc/GMT+7"}
