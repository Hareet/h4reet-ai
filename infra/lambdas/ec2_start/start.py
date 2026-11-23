#!/usr/bin/env python3
"""h4-ec2-start: starts EC2, prod's default host, when the laptop goes, the tunnel end returns, the hours open, or the
Author asks (spec 001 FR-065, FR-069, FR-070, FR-076; contracts/handover.md §3; contracts/aws-alerts.md §2; research.md
R-15, R-29; ADR 0027, ADR 0048 and ADR 0049, proposed; tasks.md T116, T122).

What invokes it, and how it knows which:

    the alarm's change     EventBridge's "CloudWatch Alarm State Change" for h4-laptop-away into ALARM
    the tunnel end's return {"from": "tunnel_end_back"}, prod's h4-tunnel-end-running rule
    the hours' open        {"from": "hours_open"}, the schedule h4-ec2-hours-open
    the Author's hand      {"manual": true}, his ec2-start and ec2-autostart targets; with "replace": "ec2" or
                           "tunnel_end" and "skip": [types], his replace (spec 032 FR-009)
    the tunnel end's check {"from": "tunnel_end_check"}, the schedule h4-tunnel-end-check, every 5 minutes (FR-013)

Its checks, in order, each refusing with its reason (ADR 0048, decision 3):

    1. paused                 /h4reet/prod/ec2-autostart isn't "on"
    2. outside_hours          the clock is outside H4_EC2_HOURS's window
    3. server_budget_stopped  h4-server-month's server action has run and isn't reversed
    4. tunnel_end_down        no instance named h4-prod-tunnel-end runs
    5. laptop_serving         by hand, on the tunnel end's return, or at the open: h4-laptop-away reads OK
    6. start_failed           the instance /h4reet/prod/ec2-instance-id names lacks Name = h4-prod-ec2, or AWS refuses
                              the start with a code that isn't a capacity code; the alert carries AWS's code

Step 6, from spec 032 (ADR 0057; plan.md §3): the named instance is started, as before, unless it is gone, of an
earlier generation (launched from a template no longer on EC2's list), stopped by AWS for capacity, or the Author asks
for a replace; then, or when AWS refuses the start for capacity (CAPACITY), the function replaces it: under the lock
/h4reet/prod/host-lock, it cancels the instance's spot request, terminates it, waits until it is gone, and launches
from EC2's list of launch templates in order, skipping the type that was short, until one launches; it writes the new
ID to the parameter at once, waits until it runs, and attaches h4-ec2-data at /dev/sdf. None launching refuses
start_failed with `- code: no_capacity` and every type's code; a live lock refuses with `- code: busy`. The alert
names the type that runs. The tunnel end's check replaces the tunnel end the same way from its own list after 10
minutes of a capacity stop, attaches h4-shared-state, points the VPC origin at the new instance, alerts
tunnel_end_back with its type, and then runs EC2's start as `tunnel_end_back`.

After the reviews of 52308132: every candidate's RunInstances is dry-run before anything is cancelled or terminated;
a tagged EC2 the parameter doesn't name, when the named one is gone, is adopted rather than launched again; the data
volume is attached before every start; the check repairs a running tunnel end's volume and VPC origin; a new
generation moves a stopped EC2 alone; and every wait ends MARGIN_S before Lambda's timeout. {"manual": true,
"replace": host, "dry_run": true} returns each type's dry run and changes nothing.

From fix/032-launch-policy (2026-11-22): a launch or dry run refused UnauthorizedOperation logs AWS's whole message,
its encoded part apart, on a line of its own (log_refusal), so the refusal decodes in one step; the alert, the metric,
and the result carry the code alone. The result carries a refusal's code (busy, no_capacity, AWS's), so the Author's
ec2_ops.py tells a busy refusal from a failed start: busy is alerted as start_failed with `- code: busy` (FR-011; the
5-minute check's alone isn't), while the run that holds the lock goes on. After the first real replace, which Lambda
killed at 900 s between the cancel and the terminate: the SDK's calls time out in seconds with at most 3 attempts, one
client a service; a call of a replace, its waits, or an attach starts only with CALL_S of the run's time left, and
the cancel only with COMMIT_S, else the step refuses wait_timeout (Budgeted); the function runs at 1024 MB. Each real
launch carries a client token of its host, type, and the lock's stamp (client_token), so a launch sent again after a
lost answer returns the instance it made; a dry run carries none.

A read that fails refuses at its own step, with `unread` among the facts, so EC2 starts only when every check passes.
It makes one pass and never retries a type; it raises nothing, so Lambda never retries it. Each outcome is one log line in
CloudWatch's embedded metric format (namespace h4reet/handover, dimensions Function, Trigger, and Outcome), and one alert on
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
import re
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
# Question 2, option A, the Author's answer ("2 A", 2026-11-12). A hand start outside the hours is refused
# as every start is. Options B and C set this True (B also needs the guard to spare a hand start until the close).
HAND_START_OUTSIDE_HOURS = False
# Question 3, option A, the Author's answer ("3 A", 2026-11-12). The scheduled open's outcomes are recorded
# and on the dashboard, and alerted only for these, which need him; a failed read always alerts. Option B alerts
# every outcome, as FR-065 says: this becomes every reason.
SCHEDULED_ALERTED = frozenset(
    {"start_failed", "server_budget_stopped", "tunnel_end_down"}
)
# The triggers that read the laptop's serving (step 5). The alarm's own change is the laptop going.
READS_LAPTOP = frozenset({"manual", "tunnel_end_back", "hours_open"})

# ----------------------------------------------------------------------------------------------------------------------
# Spec 032: each host's list of launch templates, and the replace from them (plan.md §3; ADR 0057).
HOSTS = ("ec2", "tunnel_end")
# Prod's String parameters, each a JSON list of {"type", "template"} in the list's order (infra/prod/ssm.tf).
TEMPLATES = {
    "ec2": "/h4reet/prod/ec2-launch-templates",
    "tunnel_end": "/h4reet/prod/tunnel-end-launch-templates",
}
# Each host's volume, by its Name tag, which a replace moves to the new instance at DEVICE.
VOLUMES = {"ec2": "h4-ec2-data", "tunnel_end": "h4-shared-state"}
DEVICE = "/dev/sdf"
VPC_ORIGIN_PARAMETER = "/h4reet/prod/relay-vpc-origin-id"
# The lock (FR-011): written only if absent, deleted after; one older than LOCK_STALE_S is taken over.
LOCK = "/h4reet/prod/host-lock"
LOCK_STALE_S = 1200
# AWS's codes that mean "not this type now" for a launch: the next listed type is tried.
CAPACITY = frozenset(
    {
        "InsufficientInstanceCapacity",
        "InsufficientCapacity",
        "SpotMaxPriceTooLow",
        "Unsupported",
    }
)
# The codes of a start that mean no capacity for the instance's type now, which a replace answers. Unsupported, or a
# price too low, can't come of a start of an existing instance, so they refuse as any other code (the rework's review).
START_CAPACITY = frozenset({"InsufficientInstanceCapacity", "InsufficientCapacity"})
# EC2 sets this tag on what it launches from a template; one not on the host's list is of an earlier generation.
TEMPLATE_TAG = "aws:ec2launchtemplate:id"
GONE = frozenset({"shutting-down", "terminated"})
# Each wait polls every POLL_S, for at most WAIT_S; the function's timeout is 900 s (infra/account/handover.tf).
POLL_S = 5
WAIT_S = 240
# Every wait also ends MARGIN_S before Lambda's own timeout, read from the context, so a run that runs out of time
# refuses wait_timeout and alerts, never dies unheard; BUDGET_S stands in when the context can't say (the tests).
MARGIN_S = 60
BUDGET_S = 840
# fix/032-launch-policy, from the first real replace on AWS (2026-11-22), which Lambda killed at 900 s between the
# cancel and the terminate: each SDK call has a 5 s connect and a 20 s read timeout, at most 3 attempts (BotoAws), and
# a call of a replace, its waits, or an attach starts only with CALL_S of the run's time left (Budgeted), one attempt's
# worst case; the cancel, from which there is no way back, only with COMMIT_S left, what the terminate, the launch,
# the wait until it runs, and the attach need in the usual case. Short of either, the step refuses wait_timeout.
# ATTEMPTS counts every attempt, the first included (botocore's total_max_attempts; its max_attempts would count the
# retries alone), so the last call Budgeted starts ends, at worst 3 x 25 s plus about 3 s of backoff, inside MARGIN_S.
CONNECT_S = 5
READ_S = 20
ATTEMPTS = 3
CALL_S = 30
COMMIT_S = 300
# The tunnel end's check (FR-013, Q-C4): AWS's own restart is waited for this long after a capacity stop.
TUNNEL_END_GRACE_S = 600
TYPE = re.compile(r"[a-z][a-z0-9]{1,7}\.[a-z0-9]{3,10}")
# After a replace, prod's rules and the server action still name the old instance until the Author's next prod plan
# and apply (spec 032 Assumptions, "The gap after a replace").
REPOINT = "the next prod plan and apply re-point the rules and the server action"

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


# The codes whose whole message BotoAws keeps: an UnauthorizedOperation's ends in AWS's encoded authorization message,
# which `aws sts decode-authorization-message` reads, and which CloudTrail cuts at 1,024 characters (fix/032-launch-
# policy, 2026-11-22).
KEEP_MESSAGE = frozenset({"UnauthorizedOperation"})
ENCODED = "Encoded authorization failure message: "


class AwsError(RuntimeError):
    """An AWS call that failed. Its code is AWS's error code alone, never a message that might hold an ID. For the codes
    in KEEP_MESSAGE, `message` keeps AWS's whole message, which names the role and the resource: log_refusal logs it,
    and it never reaches a fact, an alert, a metric, or the function's result."""

    def __init__(self, code: str, message: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.message = message


class BotoAws:
    """The Lambda runtime's AWS SDK, which its base image carries; this file imports it only here."""

    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        self.session = boto3.session.Session(region_name=REGION)
        self.config = Config(
            connect_timeout=CONNECT_S,
            read_timeout=READ_S,
            retries={"total_max_attempts": ATTEMPTS, "mode": "standard"},
        )
        self.clients: dict[str, object] = {}

    def call(self, service: str, op: str, **params: object) -> dict:
        from botocore.exceptions import BotoCoreError, ClientError

        # One client a service: building one loads the service's model, which costs seconds on a small function.
        client = self.clients.get(service)
        if client is None:
            client = self.clients[service] = self.session.client(
                service, region_name=REGION, config=self.config
            )
        name = "".join("_" + c.lower() if c.isupper() else c for c in op).lstrip("_")
        try:
            return getattr(client, name)(**params)
        except ClientError as exc:
            error = exc.response.get("Error", {})
            code = str(error.get("Code", "ClientError"))
            kept = error.get("Message") if code in KEEP_MESSAGE else None
            raise AwsError(code, str(kept) if kept else None) from None
        except BotoCoreError as exc:
            raise AwsError(type(exc).__name__) from None


# ----------------------------------------------------------------------------------------------------------------------
# The run.


@dataclass
class Outcome:
    trigger: str
    reason: str | None = None  # None: started (EC2) or replaced (the tunnel end)
    facts: list[tuple[str, str]] = field(default_factory=list)
    unread: bool = False
    host: str = "ec2"
    # The metric's Outcome when it isn't the reason: no_capacity, busy, tunnel_end_replaced (spec 032 FR-018).
    metric: str | None = None
    # Recorded, never alerted: the tunnel end's check's busy and failed reads.
    silent: bool = False
    # A plain log line alone, no metric and no alert: the tunnel end's check's no-op (FR-013).
    quiet: bool = False
    # The Author's hand dry run: each listed type and AWS's answer to RunInstances(DryRun=True).
    dry_run: dict[str, str] | None = None

    def refuse(self, reason: str, **facts: str) -> Outcome:
        self.reason = reason
        self.facts.extend(facts.items())
        return self

    def unreadable(self, reason: str, code: str) -> Outcome:
        self.unread = True
        return self.refuse(reason, unread=code)


class Clock:
    """The time and the waits: the real ones in Lambda, a stepped clock in the tests."""

    def __init__(
        self,
        now: Callable[[], datetime],
        sleep: Callable[[float], None],
        deadline: datetime | None = None,
    ) -> None:
        self.now = now
        self.sleep = sleep
        self.deadline = deadline or now() + timedelta(seconds=BUDGET_S)

    def until(self, seconds: float) -> datetime:
        """The end of a wait of `seconds`, or the run's own deadline, whichever comes first."""
        return min(self.now() + timedelta(seconds=seconds), self.deadline)

    def left(self) -> float:
        """The run's time left, in seconds, before its deadline (MARGIN_S before Lambda's own)."""
        return (self.deadline - self.now()).total_seconds()


class Budgeted:
    """AWS for a replace, its waits, and an attach: a call starts only with CALL_S of the run's time left, else it
    refuses wait_timeout without reaching AWS (fix/032-launch-policy)."""

    def __init__(self, aws, clock: Clock) -> None:
        self.aws = aws.aws if isinstance(aws, Budgeted) else aws
        self.clock = clock

    def call(self, service: str, op: str, **params: object) -> dict:
        if self.clock.left() < CALL_S:
            raise AwsError("wait_timeout")
        return self.aws.call(service, op, **params)


def trigger_of(event: object) -> str | None:
    if not isinstance(event, dict):
        return None
    if event.get("manual") is True:
        return "manual"
    if event.get("from") in ("tunnel_end_back", "hours_open", "tunnel_end_check"):
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


def hand_replace(event: dict) -> tuple[str | None, tuple[str, ...], bool]:
    """The Author's replace, {"manual": true, "replace": "ec2"|"tunnel_end", "skip": [types]} (spec 032 FR-009), or
    its dry run with "dry_run": true; a shape it can't read raises ValueError, an unknown trigger."""
    host = event.get("replace")
    skip = event.get("skip", [])
    dry = event.get("dry_run", False)
    if host is None and "skip" not in event and "dry_run" not in event:
        return None, (), False
    if host not in HOSTS or not isinstance(skip, list) or not isinstance(dry, bool):
        raise ValueError("replace")
    if not all(isinstance(t, str) and TYPE.fullmatch(t) for t in skip):
        raise ValueError("skip")
    return str(host), tuple(skip), dry


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


def state(instance: dict) -> str:
    return str((instance.get("State") or {}).get("Name", "unknown"))


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


# ----------------------------------------------------------------------------------------------------------------------
# Spec 032: the replace, from a host's list of launch templates (plan.md §3).


def templates_of(aws, host: str) -> list[tuple[str, str]]:
    """The host's (type, template ID) pairs, in order, from prod's String parameter."""
    try:
        listed = json.loads(parameter(aws, TEMPLATES[host]))
    except ValueError:
        raise AwsError("templates_unreadable") from None
    out = []
    for entry in listed if isinstance(listed, list) else [None]:
        if not (
            isinstance(entry, dict)
            and isinstance(entry.get("type"), str)
            and isinstance(entry.get("template"), str)
        ):
            raise AwsError("templates_unreadable")
        out.append((entry["type"], entry["template"]))
    if not out:
        raise AwsError("templates_unreadable")
    return out


def spot_status(aws, instance: dict) -> tuple[str, datetime | None]:
    """The instance's spot request's status code and its update time; ("", None) without one."""
    request = instance.get("SpotInstanceRequestId")
    if not isinstance(request, str):
        return "", None
    found = aws.call(
        "ec2", "DescribeSpotInstanceRequests", SpotInstanceRequestIds=[request]
    ).get("SpotInstanceRequests") or [{}]
    status = found[0].get("Status") or {}
    updated = status.get("UpdateTime")
    if isinstance(updated, str):
        updated = datetime.fromisoformat(updated.replace("Z", "+00:00"))
    return str(status.get("Code", "")), updated if isinstance(
        updated, datetime
    ) else None


def capacity_stop(code: str) -> bool:
    """AWS stopped it for capacity, price, or oversubscription: only AWS could restart it, as its own type."""
    return code.startswith("instance-stopped-") and code != "instance-stopped-by-user"


def live(aws, name: str) -> list[dict]:
    found = instances(
        aws.call(
            "ec2", "DescribeInstances", Filters=[{"Name": "tag:Name", "Values": [name]}]
        )
    )
    return [i for i in found if state(i) not in GONE and tag(i, "Name") == name]


def take_lock(aws, clock: Clock, owner: str) -> str | None:
    """The lock (FR-011): written only if absent; a lock older than LOCK_STALE_S is taken over. Its stamp, "<epoch
    seconds> <owner>", when this run holds it (one replace attempt's, which its launches' tokens carry); None when
    another run does."""
    now = int(clock.now().timestamp())
    stamp = f"{now} {owner}"
    try:
        aws.call(
            "ssm",
            "PutParameter",
            Name=LOCK,
            Value=stamp,
            Type="String",
            Overwrite=False,
        )
        return stamp
    except AwsError as exc:
        if exc.code != "ParameterAlreadyExists":
            raise
    held = parameter(aws, LOCK).split()
    at = int(held[0]) if held and held[0].isdigit() else 0
    if now - at < LOCK_STALE_S:
        return None
    aws.call(
        "ssm", "PutParameter", Name=LOCK, Value=stamp, Type="String", Overwrite=True
    )
    return stamp


def client_token(host: str, kind: str, stamp: str) -> str:
    """RunInstances' idempotency token for one launch of one replace attempt: the host, the type, and the lock's epoch
    seconds, at most 64 ASCII characters (EC2's limit). Sent again with the same token, as the SDK's retry does after an
    answer lost to the read timeout, the launch answers the instance it made rather than a second one, which EC2's fixed
    address or the tunnel end's interfaces would refuse (fix/032-launch-policy)."""
    epoch = stamp.split()[0] if stamp.split() else "0"
    return f"h4-{host}-{kind}-{epoch}"[:64]


def release_lock(aws) -> None:
    try:
        aws.call("ssm", "DeleteParameter", Name=LOCK)
    except AwsError:
        pass  # a lock left behind is taken over after LOCK_STALE_S


def wait_for(aws, clock: Clock, instance_id: str, want: str) -> None:
    aws = Budgeted(aws, clock)
    deadline = clock.until(WAIT_S)
    while True:
        try:
            found = instances(
                aws.call("ec2", "DescribeInstances", InstanceIds=[instance_id])
            )
        except AwsError as exc:
            if want == "terminated" and exc.code == "InvalidInstanceID.NotFound":
                return
            raise
        if found and state(found[0]) == want:
            return
        if clock.now() >= deadline:
            raise AwsError("wait_timeout")
        clock.sleep(POLL_S)


def attach(aws, clock: Clock, host: str, instance_id: str) -> bool:
    """The host's volume, by its Name tag, at /dev/sdf, once the old instance has let it go: True if this attached it,
    False if it was attached already. Called before every start too, so a replace that failed before its attach is
    repaired by the next trigger (the rework's review)."""
    aws = Budgeted(aws, clock)
    deadline = clock.until(WAIT_S)
    while True:
        volumes = (
            aws.call(
                "ec2",
                "DescribeVolumes",
                Filters=[{"Name": "tag:Name", "Values": [VOLUMES[host]]}],
            ).get("Volumes")
            or []
        )
        if len(volumes) != 1:
            raise AwsError("volume_count")
        volume = volumes[0]
        on = [a.get("InstanceId") for a in volume.get("Attachments") or []]
        if on == [instance_id]:
            return False
        if volume.get("State") == "available":
            aws.call(
                "ec2",
                "AttachVolume",
                Device=DEVICE,
                InstanceId=instance_id,
                VolumeId=volume["VolumeId"],
            )
            return True
        if clock.now() >= deadline:
            raise AwsError("wait_timeout")
        clock.sleep(POLL_S)


def log_refusal(exc: AwsError, op: str, kind: str, dry_run: bool) -> None:
    """One log line with AWS's whole message for a code in KEEP_MESSAGE, and its encoded part alone, ready for `aws sts
    decode-authorization-message --encoded-message`. Logged only: the outcome carries the code."""
    if not exc.message:
        return
    _, found, encoded = exc.message.partition(ENCODED)
    print(
        json.dumps(
            {
                "function": FUNCTION,
                "op": op,
                "type": kind,
                "dry_run": dry_run,
                "code": exc.code,
                "message": exc.message,
                "encoded": encoded.strip() if found else None,
            },
            sort_keys=True,
        )
    )


def dry_runs(aws, candidates: list[tuple[str, str]]) -> dict[str, str]:
    """Each candidate's RunInstances with DryRun, the exact launch: AWS's code, DryRunOperation when it would run. A dry
    run checks the role and the request's context (the template, the tags, the type, the market), never capacity."""
    answers: dict[str, str] = {}
    for kind, template in candidates:
        try:
            aws.call(
                "ec2",
                "RunInstances",
                LaunchTemplate={"LaunchTemplateId": template, "Version": "$Default"},
                MinCount=1,
                MaxCount=1,
                DryRun=True,
            )
            answers[kind] = "DryRunOperation"
        except AwsError as exc:
            log_refusal(exc, "RunInstances", kind, dry_run=True)
            answers[kind] = exc.code
    return answers


def replace(
    out: Outcome,
    aws,
    clock: Clock,
    host: str,
    old: dict | None,
    skip: tuple[str, ...],
) -> dict | None:
    """Under the lock: cancel the old instance's spot request, terminate it, wait until it is gone, launch from the
    host's templates in order (skipping `skip`; a capacity code moves on, any other stops), write EC2's ID's parameter
    at once, wait until it runs, and attach its volume (FR-007, FR-011, FR-012). The new instance, or None with `out`
    refused."""
    try:
        listed = templates_of(aws, host)
    except AwsError as exc:
        out.unreadable("start_failed", exc.code)
        return None
    try:
        stamp = take_lock(aws, clock, out.trigger)
    except AwsError as exc:
        out.unreadable("start_failed", exc.code)
        return None
    if stamp is None:
        out.metric = "busy"
        out.refuse("start_failed", code="busy")
        return None
    tried: list[str] = []
    step = "dry_run"
    # Every call from here starts only with CALL_S of the run's time left; the lock's write and release, and EC2's new
    # ID, which the next trigger needs to find and repair the instance, go straight to AWS (fix/032-launch-policy).
    timed = Budgeted(aws, clock)
    try:
        # Nothing is cancelled or terminated before a dry run proves a launch (the rework's review): a type the role
        # or the request's context refuses is passed over, and none passing refuses with the host as it was.
        answers = dry_runs(timed, [(k, t) for k, t in listed if k not in skip])
        tried += [
            f"{k} dry_run:{c}" for k, c in answers.items() if c != "DryRunOperation"
        ]
        ready = [(k, t) for k, t in listed if answers.get(k) == "DryRunOperation"]
        if not ready:
            codes = [c for c in answers.values() if c != "DryRunOperation"]
            out.refuse(
                "start_failed",
                code=codes[0] if codes else "no_candidates",
                step="dry_run",
                tried=", ".join(tried),
            )
            return None
        step = "cancel"
        # No way back from here: the cancel of a stopped spot instance's request terminates it. So the replace goes on
        # only with the time the rest needs in the usual case; short of it, the host stays as it was.
        if clock.left() < COMMIT_S:
            raise AwsError("wait_timeout")
        if old is not None:
            request = old.get("SpotInstanceRequestId")
            if isinstance(request, str):
                timed.call(
                    "ec2",
                    "CancelSpotInstanceRequests",
                    SpotInstanceRequestIds=[request],
                )
            step = "terminate"
            timed.call("ec2", "TerminateInstances", InstanceIds=[old["InstanceId"]])
            wait_for(timed, clock, old["InstanceId"], "terminated")
        step = "launch"
        new: dict | None = None
        for kind, template in ready:
            try:
                launched = instances(
                    {
                        "Reservations": [
                            timed.call(
                                "ec2",
                                "RunInstances",
                                LaunchTemplate={
                                    "LaunchTemplateId": template,
                                    "Version": "$Default",
                                },
                                MinCount=1,
                                MaxCount=1,
                                ClientToken=client_token(host, kind, stamp),
                            )
                        ]
                    }
                )
            except AwsError as exc:
                log_refusal(exc, "RunInstances", kind, dry_run=False)
                tried.append(f"{kind} {exc.code}")
                if exc.code in CAPACITY:
                    continue
                out.refuse("start_failed", code=exc.code, tried=", ".join(tried))
                return None
            new = launched[0] if launched else {}
            new.setdefault("InstanceType", kind)
            break
        if new is None or not isinstance(new.get("InstanceId"), str):
            out.metric = "no_capacity"
            out.refuse("start_failed", code="no_capacity", tried=", ".join(tried))
            return None
        if host == "ec2":
            step = "parameter"
            aws.call(
                "ssm",
                "PutParameter",
                Name=INSTANCE_PARAMETER,
                Value=new["InstanceId"],
                Type="String",
                Overwrite=True,
            )
        step = "run"
        wait_for(timed, clock, new["InstanceId"], "running")
        step = "attach"
        attach(timed, clock, host, new["InstanceId"])
    except AwsError as exc:
        facts = {"code": exc.code, "step": step}
        if tried:
            facts["tried"] = ", ".join(tried)
        out.refuse("start_failed", **facts)
        return None
    finally:
        release_lock(aws)
    out.facts.append(("type", str(new["InstanceType"])))
    if tried:
        out.facts.append(("tried", ", ".join(tried)))
    out.facts.append(("repoint", REPOINT))
    return new


# ----------------------------------------------------------------------------------------------------------------------
# EC2: checks 1 to 5, then step 6.


def decide(
    event: object,
    context: object,
    aws,
    clock: Clock,
    trigger: str | None = None,
    forced: bool = False,
    skip: tuple[str, ...] = (),
) -> Outcome:
    trigger = trigger or trigger_of(event)
    if trigger is None:
        return Outcome("unknown").refuse("start_failed", code="unknown_trigger")
    out = Outcome(trigger)
    now = clock.now()
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
    if not any(state(i) == "running" for i in found):
        return out.refuse("tunnel_end_down")
    # 5. The laptop, read from its alarm by name (research.md R-15, amended).
    if trigger in READS_LAPTOP:
        try:
            if laptop_serving(aws):
                return out.refuse("laptop_serving")
        except AwsError as exc:
            return out.unreadable("laptop_serving", exc.code)
    return step_6(out, aws, clock, forced, skip)


def step_6(
    out: Outcome, aws, clock: Clock, forced: bool, skip: tuple[str, ...]
) -> Outcome:
    """The instance the parameter names: started if it can be; replaced from the list if it is gone, of an earlier
    generation, stopped by AWS for capacity, refused for capacity, or the Author asks (spec 032 FR-005, FR-006)."""
    try:
        ec2_id = parameter(aws, INSTANCE_PARAMETER)
        try:
            named = instances(
                aws.call("ec2", "DescribeInstances", InstanceIds=[ec2_id])
            )
        except AwsError as exc:
            if exc.code != "InvalidInstanceID.NotFound":
                raise
            named = []
    except AwsError as exc:
        return out.unreadable("start_failed", exc.code)
    current = [i for i in named if state(i) not in GONE]
    if not current:
        # A replace that launched but never wrote the ID, or was cut off, leaves a tagged instance the parameter
        # doesn't name: adopt it rather than launch a second (the rework's review). Two such is the guard's case.
        try:
            found = live(aws, EC2_NAME)
        except AwsError as exc:
            return out.unreadable("start_failed", exc.code)
        if len(found) > 1:
            return out.refuse("start_failed", code="two_instances")
        if not found:
            replace(out, aws, clock, "ec2", None, skip)
            return out
        current = found
        ec2_id = str(found[0].get("InstanceId"))
        try:
            aws.call(
                "ssm",
                "PutParameter",
                Name=INSTANCE_PARAMETER,
                Value=ec2_id,
                Type="String",
                Overwrite=True,
            )
        except AwsError as exc:
            return out.refuse("start_failed", code=exc.code, step="parameter")
        out.facts.append(("adopted", str(found[0].get("InstanceType", "unknown"))))
    instance = current[0]
    if tag(instance, "Name") != EC2_NAME:
        return out.refuse("start_failed", code="untagged")
    kind = str(instance.get("InstanceType", "unknown"))
    if forced:
        out.facts.append(("replaced", f"{kind} by_hand"))
        replace(out, aws, clock, "ec2", instance, skip)
        return out
    template = tag(instance, TEMPLATE_TAG)
    # A new generation moves a stopped EC2 alone: a running one serves, and moves at its next start (the review).
    if template is not None and state(instance) == "stopped":
        try:
            listed = {t for _, t in templates_of(aws, "ec2")}
        except AwsError as exc:
            return out.unreadable("start_failed", exc.code)
        if template not in listed:
            out.facts.append(("replaced", f"{kind} earlier_generation"))
            replace(out, aws, clock, "ec2", instance, skip)
            return out
    if state(instance) == "stopped":
        try:
            code, _ = spot_status(aws, instance)
        except AwsError:
            code = ""  # the start below says what AWS thinks
        if capacity_stop(code):
            out.facts.append(("replaced", f"{kind} {code}"))
            replace(out, aws, clock, "ec2", instance, (*skip, kind))
            return out
    # Its data volume first, whatever stopped a replace before its attach: a no-op once attached.
    try:
        attach(aws, clock, "ec2", ec2_id)
    except AwsError as exc:
        return out.refuse("start_failed", code=exc.code, step="attach")
    try:
        started = aws.call("ec2", "StartInstances", InstanceIds=[ec2_id]).get(
            "StartingInstances"
        ) or [{}]
    except AwsError as exc:
        if exc.code in START_CAPACITY:
            out.facts.append(("replaced", f"{kind} {exc.code}"))
            replace(out, aws, clock, "ec2", instance, (*skip, kind))
            return out
        return out.refuse("start_failed", code=exc.code)
    out.facts.append(("type", kind))
    out.facts.append(
        ("state", str((started[0].get("CurrentState") or {}).get("Name", "unknown")))
    )
    return out


# ----------------------------------------------------------------------------------------------------------------------
# The tunnel end (spec 032 FR-013, FR-014).


def repoint(aws, account: str, instance_id: str) -> str:
    """The VPC origin the parameter names, at the new instance: "re-pointed", "unchanged", or AWS's code."""
    try:
        origin = parameter(aws, VPC_ORIGIN_PARAMETER)
        got = aws.call("cloudfront", "GetVpcOrigin", Id=origin)
        config = dict((got.get("VpcOrigin") or {}).get("VpcOriginEndpointConfig") or {})
        arn = f"arn:aws:ec2:{REGION}:{account}:instance/{instance_id}"
        if config.get("Arn") == arn:
            return "unchanged"
        config["Arn"] = arn
        aws.call(
            "cloudfront",
            "UpdateVpcOrigin",
            Id=origin,
            IfMatch=got.get("ETag", ""),
            VpcOriginEndpointConfig=config,
        )
        return "re-pointed"
    except AwsError as exc:
        return exc.code


def repair(out: Outcome, context: object, aws, clock: Clock, instance: dict) -> Outcome:
    """A running tunnel end's volume and VPC origin, which a replace cut short may have left behind (the rework's
    review): attached and re-pointed if not, alerted as its return when either was; a plain line when neither was. A
    repair that fails is recorded, never alerted every 5 minutes; the replace's own failure alerted it once."""
    iid = str(instance.get("InstanceId"))
    repaired = []
    try:
        if attach(aws, clock, "tunnel_end", iid):
            repaired.append("volume")
        origin = repoint(aws, account_of(context), iid)
    except AwsError as exc:
        out.silent = True
        out.metric = "tunnel_end_repair_failed"
        return out.refuse("tunnel_end_down", code=exc.code, step="repair")
    if origin == "re-pointed":
        repaired.append("origin")
    elif origin != "unchanged":
        out.silent = True
        out.metric = "tunnel_end_repair_failed"
        return out.refuse("tunnel_end_down", code=origin, step="origin")
    if not repaired:
        out.quiet = True
        out.facts.append(("tunnel_end", "running"))
        return out
    out.silent = False
    out.metric = "tunnel_end_repaired"
    out.facts += [
        ("type", str(instance.get("InstanceType", "unknown"))),
        ("repaired", ", ".join(repaired)),
    ]
    return out


def tunnel_end(
    trigger: str,
    context: object,
    aws,
    clock: Clock,
    forced: bool,
    skip: tuple[str, ...],
) -> list[Outcome]:
    out = Outcome(trigger, host="tunnel_end", silent=trigger == "tunnel_end_check")
    try:
        found = live(aws, TUNNEL_END_NAME)
    except AwsError as exc:
        return [out.unreadable("tunnel_end_down", exc.code)]
    if len(found) > 1:
        out.silent = False
        return [out.refuse("tunnel_end_down", code="two_instances")]
    old = found[0] if found else None
    if old is not None:
        kind = str(old.get("InstanceType", "unknown"))
        if forced:
            out.facts.append(("replaced", f"{kind} by_hand"))
        else:
            now_state = state(old)
            code, updated = "", None
            if now_state == "stopped":
                try:
                    code, updated = spot_status(aws, old)
                except AwsError as exc:
                    return [out.unreadable("tunnel_end_down", exc.code)]
            waited = (
                (clock.now() - updated).total_seconds() if updated is not None else 0
            )
            if now_state == "running" and not forced:
                return [repair(out, context, aws, clock, old)]
            if not (capacity_stop(code) and waited >= TUNNEL_END_GRACE_S):
                out.quiet = True
                out.facts.append(("tunnel_end", code or now_state))
                return [out]
            out.facts.append(("replaced", f"{kind} {code}"))
            skip = (*skip, kind)
    out.silent = False
    new = replace(out, aws, clock, "tunnel_end", old, skip)
    if new is None:
        busy = out.metric == "busy"
        out.silent = busy and trigger == "tunnel_end_check"
        out.reason = "tunnel_end_down"
        out.facts.insert(0, ("tunnel_end", "not replaced"))
        return [out]
    try:
        account = account_of(context)
        origin = repoint(aws, account, new["InstanceId"])
    except AwsError as exc:
        origin = exc.code
    out.facts.append(("origin", origin))
    out.metric = "tunnel_end_replaced"
    # The tunnel end's return: EC2's start, as h4-tunnel-end-running would invoke it, since that rule names the old
    # instance until prod's next plan.
    return [out, decide(None, context, aws, clock, trigger="tunnel_end_back")]


def run_all(event: object, context: object, aws, clock: Clock) -> list[Outcome]:
    trigger = trigger_of(event)
    if trigger is None:
        return [Outcome("unknown").refuse("start_failed", code="unknown_trigger")]
    host: str | None = None
    skip: tuple[str, ...] = ()
    if trigger == "manual":
        try:
            host, skip, dry = hand_replace(event)  # type: ignore[arg-type]
        except ValueError:
            return [Outcome("manual").refuse("start_failed", code="unknown_trigger")]
        if dry and host is not None:
            return [hand_dry_run(aws, host, skip)]
    if trigger == "tunnel_end_check" or host == "tunnel_end":
        return tunnel_end(trigger, context, aws, clock, host == "tunnel_end", skip)
    return [decide(event, context, aws, clock, trigger, host == "ec2", skip)]


def hand_dry_run(aws, host: str, skip: tuple[str, ...]) -> Outcome:
    """The Author's proof of the role before the 5-minute check goes live (the note's step 6): each listed type's
    dry run, no check, no lock, no change, no alert; the answers return to his ec2_ops.py."""
    out = Outcome("manual", host=host, quiet=True)
    try:
        listed = templates_of(aws, host)
    except AwsError as exc:
        out.dry_run = {}
        return out.refuse("dry_run", code=exc.code)
    out.dry_run = dry_runs(aws, [(k, t) for k, t in listed if k not in skip])
    out.facts += list(out.dry_run.items())
    return out.refuse("dry_run")


def message(out: Outcome) -> str:
    if out.host == "tunnel_end" and out.reason is None:
        head = f"{PREFIX} tunnel_end_back: the tunnel end runs again"
    elif out.reason is None:
        head = f"{PREFIX} ec2_started: EC2 started"
    else:
        head = f"{PREFIX} ec2_start_refused ({out.reason}): EC2 not started"
    return "\n".join(
        [head, f"- trigger: {out.trigger}", *(f"- {k}: {v}" for k, v in out.facts)]
    )


def alerted(out: Outcome) -> bool:
    if out.quiet or out.silent:
        return False
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
                    "Dimensions": [["Function", "Trigger", "Outcome"]],
                    "Metrics": [{"Name": "Outcomes", "Unit": "Count"}],
                }
            ],
        },
        "Function": FUNCTION,
        "Outcome": out.metric or out.reason or "started",
        "Trigger": out.trigger,
        "Outcomes": 1,
    }


def handler(
    event: object,
    context: object,
    aws=None,
    now: Callable[[], datetime] | None = None,
    sleep: Callable[[float], None] | None = None,
) -> dict:
    """h4-ec2-start's entry. One pass; never raises."""
    tell = now or (lambda: datetime.fromtimestamp(time.time(), tz=timezone.utc))
    at = tell()
    remaining = getattr(context, "get_remaining_time_in_millis", None)
    budget = remaining() / 1000 - MARGIN_S if callable(remaining) else BUDGET_S
    clock = Clock(tell, sleep or time.sleep, at + timedelta(seconds=max(budget, 0)))
    try:
        aws = aws or BotoAws()
        outcomes = run_all(event, context, aws, clock)
    # One refusal, never a raise: a raise would let Lambda retry the invocation, a second attempt (FR-065).
    except Exception as exc:  # noqa: BLE001 - any failure is one refusal
        outcomes = [
            Outcome(trigger_of(event) or "unknown").refuse(
                "start_failed", code=type(exc).__name__
            )
        ]
    for out in outcomes:
        if out.quiet:
            print(
                json.dumps(
                    {"function": FUNCTION, "trigger": out.trigger, **dict(out.facts)},
                    sort_keys=True,
                )
            )
            continue
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
    last = outcomes[-1]
    result: dict[str, object] = {
        "outcome": "started" if last.reason is None else "refused",
        "trigger": last.trigger,
    }
    if last.reason is not None:
        result["reason"] = last.reason
        code = dict(last.facts).get("code")
        if code:
            result["code"] = code
    if last.dry_run is not None:
        result["dry_run"] = last.dry_run
    return result
