#!/usr/bin/env python3
"""h4-ec2-guard: stops EC2 when it runs and shouldn't (spec 001 FR-071, FR-072; contracts/handover.md §4, amended;
contracts/aws-alerts.md §2; research.md R-15, R-30; ADR 0027, ADR 0048 and ADR 0049, proposed; tasks.md T117, T122).

What invokes it, and how it knows which:

    running        EventBridge's "EC2 Instance State-change Notification" into running, prod's h4-ec2-running rule
    hours_close    {"from": "hours_close"}, the schedule h4-ec2-hours-close

Each run:

    1. reads /h4reet/prod/ec2-instance-id; unreadable, it stops nothing and alerts ec2_guard_failed once;
    2. lists the pending and running instances tagged Name = h4-prod-ec2; stops each the parameter doesn't name and
       alerts ec2_unrecognised_instance with its ID (a replace's open spot request can launch a second; the
       regrouping note's question 10). It never stops the named one for being a second;
    3. applies its table to the named one, if it runs, in the start function's order, each a stop and its kind:
          the autostart switch isn't "on"                     ec2_stopped_paused
          outside H4_EC2_HOURS's window; at the close, always  ec2_stopped_outside_hours
          the server action has run and isn't reversed        ec2_stopped_server_budget
          h4-laptop-away reads OK (the laptop serves)          ec2_stopped_laptop_serving
       otherwise nothing. A read that fails counts as its condition holding, with `unread` among the facts.

It may stop only an instance tagged h4-prod-ec2 (its role's condition), and never starts one. It raises nothing, so
Lambda never retries it. Each stop, and each run that stops nothing, is one log line in CloudWatch's embedded metric
format, as the start function's; each stop is one alert on h4-alerts, but the close's routine stop
(SCHEDULED_ALERTED, as the start function's).

The hours and the AWS call below are the start function's, carried here too, since each image copies its one module;
a test holds the two alike (ec2_guard/test_guard.py).
"""

from __future__ import annotations

import json
import os
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

FUNCTION = "h4-ec2-guard"
REGION = "us-east-1"
AUTOSTART = "/h4reet/prod/ec2-autostart"
INSTANCE_PARAMETER = "/h4reet/prod/ec2-instance-id"
SERVER_BUDGET = "h4-server-month"
LAPTOP_ALARM = "h4-laptop-away"
EC2_NAME = "h4-prod-ec2"
NAMESPACE = "h4reet/handover"
PREFIX = "[hareet.ai aws]"
CLEAR = frozenset({"STANDBY", "REVERSE_SUCCESS"})
# Provisional: question 3, recommended option A, until the Author's answer: the start function's set. The close's
# outcome, ec2_stopped_outside_hours, isn't among them, so the close's routine stop is recorded and not alerted;
# ec2_unrecognised_instance and ec2_guard_failed always alert. Option B alerts every stop, as FR-071 says.
SCHEDULED_ALERTED = frozenset(
    {"start_failed", "server_budget_stopped", "tunnel_end_down"}
)
ALWAYS_ALERTED = frozenset({"ec2_unrecognised_instance", "ec2_guard_failed"})
# ----------------------------------------------------------------------------------------------------------------------
# The hours (ADR 0048, decision 1). Question 1a's two zones, by their rules: the offset from UTC in standard time, and
# for a zone with daylight saving, when it starts and ends, as (month, which Sunday) at 02:00 local. America/Denver:
# UTC−7, and UTC−6 from the second Sunday in March to the first Sunday in November (the US rule since 2007).
# Etc/GMT+7: UTC−7 all year (the IANA name's sign is inverted). Any other zone is unreadable, and refuses.
ZONES: dict[str, tuple[int, tuple[tuple[int, int], tuple[int, int]] | None]] = {
    "America/Denver": (-7, ((3, 2), (11, 1))),
    "Etc/GMT+7": (-7, None),
}


class HoursError(ValueError):
    """H4_EC2_HOURS can't be read as a carried zone and a window inside one day."""


def _nth_sunday(year: int, month: int, n: int) -> int:
    first = datetime(year, month, 1, tzinfo=timezone.utc).weekday()  # Monday is 0
    return 1 + (6 - first) % 7 + 7 * (n - 1)


def _minutes(text: str) -> int:
    hh, sep, mm = text.partition(":")
    if not (sep and len(hh) == 2 and len(mm) == 2 and hh.isdigit() and mm.isdigit()):
        raise HoursError("a time isn't HH:MM")
    h, m = int(hh), int(mm)
    if h > 23 or m > 59:
        raise HoursError("a time isn't HH:MM")
    return h * 60 + m


@dataclass(frozen=True)
class Hours:
    zone: str
    open_min: int
    close_min: int

    def offset(self, now: datetime) -> timedelta:
        """The zone's offset from UTC at the instant now."""
        std, dst = ZONES[self.zone]
        if dst is None:
            return timedelta(hours=std)
        (m1, n1), (m2, n2) = dst
        y = now.year
        # Each change at 02:00 local: the start by the standard clock, the end by the daylight one.
        begins = datetime(
            y, m1, _nth_sunday(y, m1, n1), 2, tzinfo=timezone.utc
        ) - timedelta(hours=std)
        ends = datetime(
            y, m2, _nth_sunday(y, m2, n2), 2, tzinfo=timezone.utc
        ) - timedelta(hours=std + 1)
        return timedelta(hours=std + 1 if begins <= now < ends else std)

    def inside(self, now: datetime) -> bool:
        local = now.astimezone(timezone.utc) + self.offset(now.astimezone(timezone.utc))
        minute = local.hour * 60 + local.minute
        return self.open_min <= minute < self.close_min


def parse_hours(value: str | None) -> Hours:
    """H4_EC2_HOURS: "<zone> <HH:MM>-<HH:MM>", a zone ZONES carries and a window that opens before it closes."""
    parts = (value or "").split()
    if len(parts) != 2 or parts[0] not in ZONES:
        raise HoursError("not a carried zone and a window")
    opens, sep, closes = parts[1].partition("-")
    if not sep:
        raise HoursError("the window isn't open-close")
    hours = Hours(parts[0], _minutes(opens), _minutes(closes))
    if hours.open_min >= hours.close_min:
        raise HoursError("the window doesn't open before it closes")
    return hours


# ----------------------------------------------------------------------------------------------------------------------
# AWS, as one call: the runtime's SDK in Lambda, a stub in the tests.


class AwsError(RuntimeError):
    """An AWS call that failed. Its code is AWS's error code alone, never a message that might hold an ID."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class BotoAws:
    """The Lambda runtime's AWS SDK, which its base image carries; this file imports it only here."""

    def __init__(self) -> None:
        import boto3

        self.session = boto3.session.Session(region_name=REGION)
        self.clients: dict[str, object] = {}

    def call(self, service: str, op: str, **params: object) -> dict:
        from botocore.exceptions import BotoCoreError, ClientError

        client = self.clients.setdefault(
            service, self.session.client(service, region_name=REGION)
        )
        name = "".join("_" + c.lower() if c.isupper() else c for c in op).lstrip("_")
        try:
            return getattr(client, name)(**params)
        except ClientError as exc:
            raise AwsError(
                str(exc.response.get("Error", {}).get("Code", "ClientError"))
            ) from None
        except BotoCoreError as exc:
            raise AwsError(type(exc).__name__) from None


# ----------------------------------------------------------------------------------------------------------------------
# The run.


@dataclass
class Run:
    trigger: str
    stopped: list[str] = field(default_factory=list)
    # Each outcome in turn: (kind, facts, unread).
    outcomes: list[tuple[str, list[tuple[str, str]], bool]] = field(
        default_factory=list
    )

    def record(self, kind: str, unread: bool = False, **facts: str) -> None:
        self.outcomes.append((kind, list(facts.items()), unread))


def trigger_of(event: object) -> str | None:
    if not isinstance(event, dict):
        return None
    if event.get("from") == "hours_close":
        return "hours_close"
    detail = event.get("detail")
    if (
        event.get("detail-type") == "EC2 Instance State-change Notification"
        and isinstance(detail, dict)
        and detail.get("state") == "running"
    ):
        return "running"
    return None


def account_of(context: object) -> str:
    arn = str(getattr(context, "invoked_function_arn", "") or "")
    parts = arn.split(":")
    if len(parts) < 5 or not parts[4].isdigit():
        raise AwsError("no_account")
    return parts[4]


def parameter(aws, name: str) -> str:
    value = aws.call("ssm", "GetParameter", Name=name).get("Parameter", {}).get("Value")
    if not isinstance(value, str):
        raise AwsError("no_value")
    return value


def server_action_clear(aws, account: str) -> bool:
    actions = aws.call(
        "budgets",
        "DescribeBudgetActionsForBudget",
        AccountId=account,
        BudgetName=SERVER_BUDGET,
    ).get("Actions")
    servers = [
        a
        for a in actions or []
        if isinstance(a, dict) and a.get("ActionType") == "RUN_SSM_DOCUMENTS"
    ]
    return bool(servers) and all(a.get("Status") in CLEAR for a in servers)


def laptop_serving(aws) -> bool:
    alarms = (
        aws.call("cloudwatch", "DescribeAlarms", AlarmNames=[LAPTOP_ALARM]).get(
            "MetricAlarms"
        )
        or []
    )
    states = [a.get("StateValue") for a in alarms if a.get("AlarmName") == LAPTOP_ALARM]
    if len(states) != 1:
        raise AwsError("no_alarm")
    return states[0] == "OK"


def why(
    trigger: str, aws, context: object, now: datetime
) -> tuple[str, str | None] | None:
    """The table, in the start function's order: the stop's kind, and the code of a read that failed; or None."""
    try:
        if parameter(aws, AUTOSTART) != "on":
            return ("ec2_stopped_paused", None)
    except AwsError as exc:
        return ("ec2_stopped_paused", exc.code)
    if trigger == "hours_close":
        return ("ec2_stopped_outside_hours", None)
    try:
        if not parse_hours(os.environ.get("H4_EC2_HOURS")).inside(now):
            return ("ec2_stopped_outside_hours", None)
    except HoursError:
        return ("ec2_stopped_outside_hours", "hours")
    try:
        if not server_action_clear(aws, account_of(context)):
            return ("ec2_stopped_server_budget", None)
    except AwsError as exc:
        return ("ec2_stopped_server_budget", exc.code)
    try:
        if laptop_serving(aws):
            return ("ec2_stopped_laptop_serving", None)
    except AwsError as exc:
        return ("ec2_stopped_laptop_serving", exc.code)
    return None


def stop(
    aws, run: Run, instance_id: str, kind: str, unread: str | None = None, **facts: str
) -> None:
    try:
        aws.call("ec2", "StopInstances", InstanceIds=[instance_id])
    except AwsError as exc:
        run.record("ec2_guard_failed", code=exc.code, step="stop")
        return
    run.stopped.append(instance_id)
    if unread is not None:
        facts["unread_code"] = unread
    run.record(kind, unread=unread is not None, **facts)


def guard(event: object, context: object, aws, now: datetime) -> Run:
    trigger = trigger_of(event)
    if trigger is None:
        run = Run("unknown")
        run.record("ec2_guard_failed", code="unknown_trigger")
        return run
    run = Run(trigger)
    # 1. The instance Terraform made, by its parameter (research.md R-15, amended).
    try:
        named = parameter(aws, INSTANCE_PARAMETER)
    except AwsError as exc:
        run.record("ec2_guard_failed", unread=True, unread_code=exc.code)
        return run
    # 2. Every pending or running instance that carries the tag.
    try:
        answer = aws.call(
            "ec2",
            "DescribeInstances",
            Filters=[
                {"Name": "tag:Name", "Values": [EC2_NAME]},
                {"Name": "instance-state-name", "Values": ["pending", "running"]},
            ],
        )
    except AwsError as exc:
        run.record("ec2_guard_failed", unread=True, unread_code=exc.code)
        return run
    found = [
        i.get("InstanceId")
        for r in answer.get("Reservations") or []
        for i in r.get("Instances") or []
        if isinstance(i, dict) and isinstance(i.get("InstanceId"), str)
    ]
    for other in [i for i in found if i != named]:
        stop(aws, run, other, "ec2_unrecognised_instance", instance=other)
    # 3. The table, for the named one if it runs.
    if named in found:
        reason = why(trigger, aws, context, now)
        if reason is not None:
            kind, unread = reason
            stop(aws, run, named, kind, unread=unread)
    if not run.outcomes:
        run.record("nothing")
    return run


def message(trigger: str, kind: str, facts: list[tuple[str, str]]) -> str:
    summary = {
        "ec2_stopped_paused": "EC2 stopped: autostart is off",
        "ec2_stopped_outside_hours": "EC2 stopped: outside its hours",
        "ec2_stopped_server_budget": "EC2 stopped: the server action has run",
        "ec2_stopped_laptop_serving": "EC2 stopped: the laptop serves",
        "ec2_unrecognised_instance": "a second instance tagged h4-prod-ec2 stopped",
        "ec2_guard_failed": "the guard couldn't act; EC2 left as it is",
    }[kind]
    lines = [f"{PREFIX} {kind}: {summary}", f"- trigger: {trigger}"]
    for key, value in facts:
        lines.append(f"- {'unread' if key == 'unread_code' else key}: {value}")
    return "\n".join(lines)


def alerted(trigger: str, kind: str, unread: bool) -> bool:
    if kind == "nothing":
        return False
    if trigger != "hours_close" or unread or kind in ALWAYS_ALERTED:
        return True
    return kind in SCHEDULED_ALERTED


def emf(trigger: str, kind: str, now: datetime) -> dict:
    return {
        "_aws": {
            "Timestamp": int(now.timestamp() * 1000),
            "CloudWatchMetrics": [
                {
                    "Namespace": NAMESPACE,
                    "Dimensions": [["Function", "Trigger", "Outcome"]],
                    "Metrics": [{"Name": "Outcomes", "Unit": "Count"}],
                }
            ],
        },
        "Function": FUNCTION,
        "Outcome": kind,
        "Trigger": trigger,
        "Outcomes": 1,
    }


def handler(
    event: object, context: object, aws=None, now: Callable[[], datetime] | None = None
) -> dict:
    """h4-ec2-guard's entry. Never raises."""
    clock = now or (lambda: datetime.fromtimestamp(time.time(), tz=timezone.utc))
    at = clock()
    try:
        aws = aws or BotoAws()
        run = guard(event, context, aws, at)
    # Never a raise: a raise would let Lambda retry, and a retry could stop what a later state no longer wants stopped.
    except Exception as exc:  # noqa: BLE001 - any failure is one alert
        run = Run(trigger_of(event) or "unknown")
        run.record("ec2_guard_failed", code=type(exc).__name__)
    topic = os.environ.get("H4_ALERTS_TOPIC_ARN", "")
    for kind, facts, unread in run.outcomes:
        print(json.dumps(emf(run.trigger, kind, at), sort_keys=True))
        if alerted(run.trigger, kind, unread):
            try:
                aws.call(
                    "sns",
                    "Publish",
                    TopicArn=topic,
                    Message=message(run.trigger, kind, facts),
                )
            # The line above is the record; a lost alert is logged, never retried.
            except Exception as exc:  # noqa: BLE001 - any failure to publish is logged alone
                print(
                    json.dumps(
                        {
                            "function": FUNCTION,
                            "alert": "unsent",
                            "code": getattr(exc, "code", type(exc).__name__),
                        }
                    )
                )
    return {
        "trigger": run.trigger,
        "outcome": run.outcomes[-1][0],
        "stopped": run.stopped,
    }
