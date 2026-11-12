#!/usr/bin/env python3
"""h4-ec2-start: starts EC2, prod's default host, when the laptop goes, the tunnel end returns, the hours open, or the
Author asks (spec 001 FR-065, FR-069, FR-070, FR-076; contracts/handover.md §3; contracts/aws-alerts.md §2; research.md
R-15, R-29; ADR 0027, ADR 0048 and ADR 0049, proposed; tasks.md T116, T122).

What invokes it, and how it knows which:

    the alarm's change     EventBridge's "CloudWatch Alarm State Change" for h4-laptop-away into ALARM
    the tunnel end's return {"from": "tunnel_end_back"}, prod's h4-tunnel-end-running rule
    the hours' open        {"from": "hours_open"}, the schedule h4-ec2-hours-open
    the Author's hand      {"manual": true}, his ec2-start and ec2-autostart targets

Its checks, in order, each refusing with its reason (ADR 0048, decision 3):

    1. paused                 /h4reet/prod/ec2-autostart isn't "on"
    2. outside_hours          the clock is outside H4_EC2_HOURS's window
    3. server_budget_stopped  h4-server-month's server action has run and isn't reversed
    4. tunnel_end_down        no instance named h4-prod-tunnel-end runs
    5. laptop_serving         by hand, on the tunnel end's return, or at the open: h4-laptop-away reads OK
    6. start_failed           the instance /h4reet/prod/ec2-instance-id names lacks Name = h4-prod-ec2, or AWS refuses
                              the start; the alert carries AWS's code

A read that fails refuses at its own step, with `unread` among the facts, so EC2 starts only when every check passes.
It makes one attempt and never loops; it raises nothing, so Lambda never retries it. Each outcome is one log line in
CloudWatch's embedded metric format (namespace h4reet/handover, dimensions Function and Outcome), and one alert on
h4-alerts in contracts/aws-alerts.md §2's format, but the scheduled open's routine outcomes (SCHEDULED_ALERTED).

The window is one environment value, H4_EC2_HOURS, "<zone> <HH:MM>-<HH:MM>", which infra/account/handover.tf's
local.ec2_hours sets; nothing else holds a copy. The zone's rules are carried here (ZONES), so the function needs no
time-zone database in its base. The tests hold the rules to the machine's database. The guard, ec2_guard/guard.py,
carries the same code, and a test holds the two alike.

The standard library, and the AWS SDK the Lambda runtime's base carries (imported only in BotoAws). The function runs
on python3.14, arm64 (research.md R-02); this file holds to 3.12's syntax, the tests' interpreter.
"""

from __future__ import annotations

import json
import os
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

FUNCTION = "h4-ec2-start"
REGION = "us-east-1"
AUTOSTART = "/h4reet/prod/ec2-autostart"
INSTANCE_PARAMETER = "/h4reet/prod/ec2-instance-id"
SERVER_BUDGET = "h4-server-month"
LAPTOP_ALARM = "h4-laptop-away"
EC2_NAME = "h4-prod-ec2"
TUNNEL_END_NAME = "h4-prod-tunnel-end"
NAMESPACE = "h4reet/handover"
PREFIX = "[hareet.ai aws]"
# The server action's statuses that leave EC2 free to start: waiting for its threshold, or reversed by the Author's
# server-budget-restore. Anything else, an unknown status among them, refuses (fail closed).
CLEAR = frozenset({"STANDBY", "REVERSE_SUCCESS"})
# Provisional: question 2, recommended option A, until the Author's answer. A hand start outside the hours is refused
# as every start is. Options B and C set this True (B also needs the guard to spare a hand start until the close).
HAND_START_OUTSIDE_HOURS = False
# Provisional: question 3, recommended option A, until the Author's answer. The scheduled open's outcomes are recorded
# and on the dashboard, and alerted only for these, which need him; a failed read always alerts. Option B alerts
# every outcome, as FR-065 says: this becomes every reason.
SCHEDULED_ALERTED = frozenset(
    {"start_failed", "server_budget_stopped", "tunnel_end_down"}
)
# The triggers that read the laptop's serving (step 5). The alarm's own change is the laptop going.
READS_LAPTOP = frozenset({"manual", "tunnel_end_back", "hours_open"})

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
class Outcome:
    trigger: str
    reason: str | None = None  # None: started
    facts: list[tuple[str, str]] = field(default_factory=list)
    unread: bool = False

    def refuse(self, reason: str, **facts: str) -> Outcome:
        self.reason = reason
        self.facts.extend(facts.items())
        return self

    def unreadable(self, reason: str, code: str) -> Outcome:
        self.unread = True
        return self.refuse(reason, unread=code)


def trigger_of(event: object) -> str | None:
    if not isinstance(event, dict):
        return None
    if event.get("manual") is True:
        return "manual"
    if event.get("from") in ("tunnel_end_back", "hours_open"):
        return str(event["from"])
    detail = event.get("detail")
    if (
        event.get("detail-type") == "CloudWatch Alarm State Change"
        and isinstance(detail, dict)
        and detail.get("alarmName") == LAPTOP_ALARM
        and isinstance(detail.get("state"), dict)
        and detail["state"].get("value") == "ALARM"
    ):
        return "alarm"
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


def instances(answer: dict) -> list[dict]:
    return [
        i
        for r in answer.get("Reservations") or []
        for i in r.get("Instances") or []
        if isinstance(i, dict)
    ]


def tag(instance: dict, key: str) -> str | None:
    return next(
        (t.get("Value") for t in instance.get("Tags") or [] if t.get("Key") == key),
        None,
    )


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


def decide(event: object, context: object, aws, now: datetime) -> Outcome:
    trigger = trigger_of(event)
    if trigger is None:
        return Outcome("unknown").refuse("start_failed", code="unknown_trigger")
    out = Outcome(trigger)
    # 1. The autostart switch.
    try:
        if parameter(aws, AUTOSTART) != "on":
            return out.refuse("paused")
    except AwsError as exc:
        return out.unreadable("paused", exc.code)
    # 2. The hours.
    try:
        hours = parse_hours(os.environ.get("H4_EC2_HOURS"))
    except HoursError:
        return out.unreadable("outside_hours", "hours")
    if not hours.inside(now) and not (trigger == "manual" and HAND_START_OUTSIDE_HOURS):
        return out.refuse("outside_hours")
    # 3. The server action.
    try:
        if not server_action_clear(aws, account_of(context)):
            return out.refuse("server_budget_stopped")
    except AwsError as exc:
        return out.unreadable("server_budget_stopped", exc.code)
    # 4. The tunnel end.
    try:
        found = instances(
            aws.call(
                "ec2",
                "DescribeInstances",
                Filters=[{"Name": "tag:Name", "Values": [TUNNEL_END_NAME]}],
            )
        )
    except AwsError as exc:
        return out.unreadable("tunnel_end_down", exc.code)
    if not any((i.get("State") or {}).get("Name") == "running" for i in found):
        return out.refuse("tunnel_end_down")
    # 5. The laptop, read from its alarm by name (research.md R-15, amended).
    if trigger in READS_LAPTOP:
        try:
            if laptop_serving(aws):
                return out.refuse("laptop_serving")
        except AwsError as exc:
            return out.unreadable("laptop_serving", exc.code)
    # 6. The start, of the instance the parameter names, only if it carries the tag.
    try:
        ec2_id = parameter(aws, INSTANCE_PARAMETER)
        named = instances(aws.call("ec2", "DescribeInstances", InstanceIds=[ec2_id]))
    except AwsError as exc:
        return out.unreadable("start_failed", exc.code)
    if len(named) != 1 or tag(named[0], "Name") != EC2_NAME:
        return out.refuse("start_failed", code="untagged")
    try:
        started = aws.call("ec2", "StartInstances", InstanceIds=[ec2_id]).get(
            "StartingInstances"
        ) or [{}]
    except AwsError as exc:
        return out.refuse("start_failed", code=exc.code)
    out.facts.append(
        ("state", str((started[0].get("CurrentState") or {}).get("Name", "unknown")))
    )
    return out


def message(out: Outcome) -> str:
    if out.reason is None:
        head = f"{PREFIX} ec2_started: EC2 started"
    else:
        head = f"{PREFIX} ec2_start_refused ({out.reason}): EC2 not started"
    return "\n".join(
        [head, f"- trigger: {out.trigger}", *(f"- {k}: {v}" for k, v in out.facts)]
    )


def alerted(out: Outcome) -> bool:
    if out.trigger != "hours_open" or out.unread:
        return True
    return out.reason in SCHEDULED_ALERTED


def emf(out: Outcome, now: datetime) -> dict:
    return {
        "_aws": {
            "Timestamp": int(now.timestamp() * 1000),
            "CloudWatchMetrics": [
                {
                    "Namespace": NAMESPACE,
                    "Dimensions": [["Function", "Outcome"]],
                    "Metrics": [{"Name": "Outcomes", "Unit": "Count"}],
                }
            ],
        },
        "Function": FUNCTION,
        "Outcome": out.reason or "started",
        "Trigger": out.trigger,
        "Outcomes": 1,
    }


def handler(
    event: object, context: object, aws=None, now: Callable[[], datetime] | None = None
) -> dict:
    """h4-ec2-start's entry. One attempt; never raises."""
    clock = now or (lambda: datetime.fromtimestamp(time.time(), tz=timezone.utc))
    at = clock()
    try:
        aws = aws or BotoAws()
        out = decide(event, context, aws, at)
    # One refusal, never a raise: a raise would let Lambda retry the invocation, a second attempt (FR-065).
    except Exception as exc:  # noqa: BLE001 - any failure is one refusal
        out = Outcome(trigger_of(event) or "unknown").refuse(
            "start_failed", code=type(exc).__name__
        )
    print(json.dumps(emf(out, at), sort_keys=True))
    if alerted(out):
        topic = os.environ.get("H4_ALERTS_TOPIC_ARN", "")
        try:
            aws.call("sns", "Publish", TopicArn=topic, Message=message(out))
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
    result: dict[str, object] = {
        "outcome": "started" if out.reason is None else "refused",
        "trigger": out.trigger,
    }
    if out.reason is not None:
        result["reason"] = out.reason
    return result
