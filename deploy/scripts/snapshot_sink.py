#!/usr/bin/env python3
"""snapshot-sink, the public view's sink on the tunnel end (spec 001 tasks.md T121, T126, T137; FR-057 to FR-060,
FR-065; contracts/public-view.md §2; data-model.md §5; plan.md §11 and §16, "Group 10, as built"; research.md R-15;
disclosure rows C4 and S21). One file, two parts, split by what each may hold:

    python3 -I -B snapshot_sink.py serve [--port 8080]      the snapshot-sink container: the publishers' one way in
    python3 -I -B snapshot_sink.py write [--once]           h4-snapshot-sink.timer, the tunnel end's host, every 2 min

serve:  holds the sink's token (SNAPSHOT_SINK_TOKEN) and nothing of AWS's or the store's. POST /v1/host takes the
        serving host's part (spec 000's FR-028 panels, numbers, states, and times only): it refuses a payload, a
        client identifier, an operator reason, a secret, or any field it doesn't know, by the field's name, never its
        value (FR-059); a part over 16 KiB, older than 5 minutes, or from a host the relay doesn't serve. GET
        /v1/serving answers the relay's `serving`, read on its internal listener (RELAY_STATUS_URL), for the
        publishers, which have no other way to it; GET /v1/host gives the host timer the last part.
write:  runs on the host as root with the tunnel end's instance role, which no container reaches (IMDSv2, one hop):
        the cloud reads below; the relay's status on 127.0.0.1:18505; the shared state's spend, kill switch, adapters'
        months, and last 10 handovers, as grafana_ro, over its socket inside its container, as the backup's dump goes;
        and the container's last part. It merges them, keeping the last host part with its own time while none arrives
        (FR-057), writes site/status/latest.json with the role's one-key grant (P-I6), through the egress proxy, and
        keeps the document on the host, so a restarted sink never empties the view. Whether or not a host serves.

The cloud reads, each exported as a metric through the tunnel end's collector (C15), which the serving host's
Prometheus keeps for the dashboard's Hosts row (contracts/handover.md §10; contracts/public-view.md §5):

    h4.ec2.state                    one-hot by `state`: EC2's, the instance tagged h4-prod-ec2, or `none`
    h4.ec2.spot_request             one-hot by `state`: its persistent spot request's
    h4.ec2.autostart                1 while /h4reet/prod/ec2-autostart is `on`, 0 while `off`
    h4.health_check.healthy_share   the share of Route 53's checkers that see the laptop's health block answer
    h4.server_action.executed       1 while the server action has run and isn't reversed
    h4.server.month_usd             the server budget's month to date, read once an hour
    h4.server.budget_usd            the server budget's figure, read with it
    h4.ec2.outcomes_last_hour       the start function's and the guard's outcomes in the last hour, by `function`,
                                    `trigger`, and `outcome`, from their embedded-metric lines, read once in 30 minutes
    h4.sink.read_errors             a counter of the reads that failed, by `read`
    h4.snapshot.writes              a count of each write, by `outcome` (written, failed, refused)
    h4.snapshot.age_seconds         the host part's age at the write

and one span, `snapshot.write`, with its outcome. A read that fails is counted as an error, and its metric gets no
point: a gauge never shows a stale or guessed value as fresh. No label, span, or line holds a secret, the account's
ID, an instance's ID, an address, or a value of the document.

AWS is reached through the AWS CLI, with the role's credentials; the tests give it a stub. The write's part keeps to
Python 3.9's syntax, Amazon Linux 2023's python3.
"""

from __future__ import annotations

import argparse
import calendar
import hmac
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

REGION = "us-east-1"
EC2_NAME = "h4-prod-ec2"
AUTOSTART = "/h4reet/prod/ec2-autostart"
HEALTH_CHECK_PARAMETER = "/h4reet/tunnel-end/HEALTH_CHECK_ID"
SERVER_BUDGET = "h4-server-month"
NAMESPACE = "h4reet/handover"
EVERY_S = 120
# FR-058's worst case (group 10's review, I3): a part a publisher's minute old, the write's run, its 2 minutes until
# the next document, and the edge's 60 s cache; the run's allowance is the figure test_snapshot.py holds it to.
WRITE_ALLOWANCE_S = 30
EDGE_CACHE_S = 60
BUDGET_EVERY_S = 3600
# The functions' outcomes, already a last-hour sum, once in 30 minutes: GetMetricData has no free tier and bills each
# metric its SEARCH returns (group 9's review A, I5): about 1,440 calls a month, not 21,600 at every 2 minutes.
OUTCOMES_EVERY_S = 1800
EC2_STATES = (
    "pending",
    "running",
    "stopping",
    "stopped",
    "shutting-down",
    "terminated",
    "none",
)
SPOT_STATES = ("open", "active", "disabled", "closed", "cancelled", "failed", "none")
CLEAR = frozenset({"STANDBY", "REVERSE_SUCCESS"})


class AwsError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class CliAws:
    """The AWS CLI, with the instance role's credentials; each call's JSON in and out."""

    def call(self, service: str, op: str, **params: object) -> dict:
        kebab = "".join("-" + c.lower() if c.isupper() else c for c in op).lstrip("-")
        done = subprocess.run(
            [
                "aws",
                service,
                kebab,
                "--cli-input-json",
                json.dumps(params),
                "--region",
                REGION,
                "--output",
                "json",
                "--no-cli-pager",
            ],
            capture_output=True,
            text=True,
            check=False,
            stdin=subprocess.DEVNULL,
            timeout=60,
        )
        if done.returncode != 0:
            text = done.stderr
            code = (
                text[text.find("(") + 1 : text.find(")")]
                if "(" in text and ")" in text
                else ""
            )
            raise AwsError(code if code.isalnum() else f"exit{done.returncode}")
        answer = json.loads(done.stdout or "{}")
        return answer if isinstance(answer, dict) else {}


@dataclass
class Point:
    name: str
    value: float
    labels: dict[str, str] = field(default_factory=dict)


@dataclass
class Reads:
    points: list[Point] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    # EC2's state for the document (group 10): the instance's, or `interrupted` while AWS holds it stopped after a spot
    # interruption, by the request's status code; `unknown` while unread.
    ec2_state: str = "unknown"


def one_hot(name: str, states: tuple[str, ...], now_state: str) -> list[Point]:
    state = now_state if now_state in states else "none"
    return [Point(name, 1.0 if s == state else 0.0, {"state": s}) for s in states]


def read_ec2(aws, out: Reads) -> None:
    try:
        answer = aws.call(
            "ec2",
            "DescribeInstances",
            Filters=[{"Name": "tag:Name", "Values": [EC2_NAME]}],
        )
    except AwsError:
        out.errors.append("ec2")
        return
    found = [
        i
        for r in answer.get("Reservations") or []
        for i in r.get("Instances") or []
        if isinstance(i, dict) and (i.get("State") or {}).get("Name") != "terminated"
    ]
    # Two tagged instances are the guard's case (ec2_unrecognised_instance), not a state to show as EC2's.
    if len(found) > 1:
        out.errors.append("ec2")
        return
    state = str((found[0].get("State") or {}).get("Name", "none")) if found else "none"
    out.points += one_hot("h4.ec2.state", EC2_STATES, state)
    out.ec2_state = state
    spot = found[0].get("SpotInstanceRequestId") if found else None
    if not isinstance(spot, str):
        out.points += one_hot("h4.ec2.spot_request", SPOT_STATES, "none")
        return
    try:
        reqs = aws.call(
            "ec2", "DescribeSpotInstanceRequests", SpotInstanceRequestIds=[spot]
        ).get("SpotInstanceRequests") or [{}]
    except AwsError:
        out.errors.append("spot_request")
        return
    out.points += one_hot(
        "h4.ec2.spot_request", SPOT_STATES, str(reqs[0].get("State", "none"))
    )
    code = str((reqs[0].get("Status") or {}).get("Code", ""))
    if (
        state == "stopped"
        and code.startswith("instance-stopped-")
        and code != "instance-stopped-by-user"
    ):
        out.ec2_state = "interrupted"


def read_autostart(aws, out: Reads) -> None:
    try:
        value = (
            aws.call("ssm", "GetParameter", Name=AUTOSTART)
            .get("Parameter", {})
            .get("Value")
        )
    except AwsError:
        out.errors.append("autostart")
        return
    if value not in ("on", "off"):
        out.errors.append("autostart")
        return
    out.points.append(Point("h4.ec2.autostart", 1.0 if value == "on" else 0.0))


def read_health_check(aws, out: Reads) -> None:
    try:
        check = (
            aws.call("ssm", "GetParameter", Name=HEALTH_CHECK_PARAMETER)
            .get("Parameter", {})
            .get("Value")
        )
        if not isinstance(check, str) or not check:
            raise AwsError("no_value")
        seen = (
            aws.call("route53", "GetHealthCheckStatus", HealthCheckId=check).get(
                "HealthCheckObservations"
            )
            or []
        )
    except AwsError:
        out.errors.append("health_check")
        return
    reports = [
        str((o.get("StatusReport") or {}).get("Status", ""))
        for o in seen
        if isinstance(o, dict)
    ]
    if not reports:
        out.errors.append("health_check")
        return
    share = sum(r.startswith("Success") for r in reports) / len(reports)
    out.points.append(Point("h4.health_check.healthy_share", round(share, 4)))


def read_server_action(aws, account: str, out: Reads) -> None:
    try:
        actions = aws.call(
            "budgets",
            "DescribeBudgetActionsForBudget",
            AccountId=account,
            BudgetName=SERVER_BUDGET,
        ).get("Actions")
    except AwsError:
        out.errors.append("server_action")
        return
    servers = [
        a
        for a in actions or []
        if isinstance(a, dict) and a.get("ActionType") == "RUN_SSM_DOCUMENTS"
    ]
    if not servers:
        out.errors.append("server_action")
        return
    executed = any(a.get("Status") not in CLEAR for a in servers)
    out.points.append(Point("h4.server_action.executed", 1.0 if executed else 0.0))


def read_server_month(aws, account: str, out: Reads) -> None:
    try:
        budget = (
            aws.call(
                "budgets", "DescribeBudget", AccountId=account, BudgetName=SERVER_BUDGET
            ).get("Budget")
            or {}
        )
        spent = float(
            ((budget.get("CalculatedSpend") or {}).get("ActualSpend") or {})["Amount"]
        )
        limit = float((budget.get("BudgetLimit") or {})["Amount"])
    except (AwsError, KeyError, TypeError, ValueError):
        out.errors.append("server_month")
        return
    out.points.append(Point("h4.server.month_usd", round(spent, 2)))
    out.points.append(Point("h4.server.budget_usd", round(limit, 2)))


SEARCH = "SEARCH('{h4reet/handover,Function,Outcome,Trigger} MetricName=\"Outcomes\"', 'Sum', 3600)"


def read_outcomes(aws, now: float, out: Reads) -> None:
    try:
        answer = aws.call(
            "cloudwatch",
            "GetMetricData",
            MetricDataQueries=[
                {"Id": "outcomes", "Expression": SEARCH, "ReturnData": True}
            ],
            StartTime=int(now - 3600),
            EndTime=int(now),
        )
    except AwsError:
        out.errors.append("outcomes")
        return
    for result in answer.get("MetricDataResults") or []:
        label = str(result.get("Label", ""))
        parts = label.split()
        if len(parts) != 3:
            continue
        function, outcome, trigger = parts
        values = [float(v) for v in result.get("Values") or []]
        out.points.append(
            Point(
                "h4.ec2.outcomes_last_hour",
                sum(values),
                {"function": function, "outcome": outcome, "trigger": trigger},
            )
        )


@dataclass
class Sink:
    aws: object
    account: str
    clock: Callable[[], float] = time.time
    budget_at: float | None = None
    budget_points: list[Point] = field(default_factory=list)
    outcomes_at: float | None = None
    outcome_points: list[Point] = field(default_factory=list)

    def read(self) -> Reads:
        out = Reads()
        now = self.clock()
        read_ec2(self.aws, out)
        read_autostart(self.aws, out)
        read_health_check(self.aws, out)
        read_server_action(self.aws, self.account, out)
        if self.budget_at is None or now - self.budget_at >= BUDGET_EVERY_S:
            month = Reads()
            read_server_month(self.aws, self.account, month)
            out.errors += month.errors
            if not month.errors:
                self.budget_points, self.budget_at = month.points, now
            else:
                self.budget_points = []
        out.points += self.budget_points
        if self.outcomes_at is None or now - self.outcomes_at >= OUTCOMES_EVERY_S:
            hour = Reads()
            read_outcomes(self.aws, now, hour)
            out.errors += hour.errors
            if not hour.errors:
                self.outcome_points, self.outcomes_at = hour.points, now
            else:
                self.outcome_points = []
        out.points += self.outcome_points
        return out


def attrs(labels: dict[str, str]) -> list[dict]:
    return [{"key": k, "value": {"stringValue": v}} for k, v in sorted(labels.items())]


def otlp_payload(
    reads: Reads, errors_total: dict[str, int], start: float, at: float
) -> dict:
    stamp = str(int(at * 1_000_000_000))
    gauges: dict[str, list[dict]] = {}
    for p in reads.points:
        gauges.setdefault(p.name, []).append(
            {"asDouble": p.value, "timeUnixNano": stamp, "attributes": attrs(p.labels)}
        )
    metrics = [
        {"name": name, "gauge": {"dataPoints": points}}
        for name, points in sorted(gauges.items())
    ]
    metrics.append(
        {
            "name": "h4.sink.read_errors",
            "sum": {
                "aggregationTemporality": 2,
                "isMonotonic": True,
                "dataPoints": [
                    {
                        "asInt": str(count),
                        "startTimeUnixNano": str(int(start * 1_000_000_000)),
                        "timeUnixNano": stamp,
                        "attributes": attrs({"read": read}),
                    }
                    for read, count in sorted(errors_total.items())
                ],
            },
        }
    )
    resource = {"service.name": "snapshot-sink", "service.namespace": "h4reet"}
    return {
        "resourceMetrics": [
            {
                "resource": {"attributes": attrs(resource)},
                "scopeMetrics": [{"scope": {"name": "h4-sink"}, "metrics": metrics}],
            }
        ]
    }


READS = (
    "ec2",
    "spot_request",
    "autostart",
    "health_check",
    "server_action",
    "server_month",
    "outcomes",
)


def post(collector: str, payload: dict) -> None:
    request = urllib.request.Request(
        f"{collector.rstrip('/')}/v1/metrics",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
        request, timeout=10
    ).close()


# ----------------------------------------------------------------------------------------------------------------------
# The document (group 10; tasks.md T137; contracts/public-view.md §2; data-model.md §5): numbers, states, and times
# only. Every field is named here with its kind; anything else is refused by its name, never echoed.

HOSTS = ("laptop", "ec2")
SERVING = ("laptop", "ec2", "none")
DOC_EC2_STATES = ("pending", "running", "stopping", "stopped", "interrupted", "unknown")
KILL_SWITCH = ("normal", "degraded", "unknown")
# Spec 000's causes (its contracts/gateway-http.md §3), the relay's, and the edge's: the closed set a host's
# "why responses are degraded" panel may name.
CAUSES = (
    "store_unreachable",
    "store_uninitialized",
    "kill_switch_tripped",
    "no_fallback_in_stack",
    "meter_at_ceiling",
    "adapter_month_spent",
    "fallback_awaiting_renewal",
    "fallback_spent_today",
    "fallback_unavailable",
    "journal_unwritable",
    "no_host_serving",
    "host_error",
    "api_unavailable",
)
ADAPTERS = ("anthropic", "bedrock")
TIME_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z")
MONTH_RE = re.compile(r"[0-9]{4}-[0-9]{2}")
RELEASE_RE = re.compile(r"[0-9a-f]{12}|[0-9a-f]{40}")
MAX_BODY = 16 * 1024
FRESH_S = 300
SKEW_S = 60
DOCUMENT_KEY = "site/status/latest.json"


def iso(epoch: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def epoch(text: str) -> float:
    return float(calendar.timegm(time.strptime(text, "%Y-%m-%dT%H:%M:%SZ")))


class Invalid(ValueError):
    """A field that doesn't hold its kind of value: its path alone, never its value."""

    def __init__(self, field: str) -> None:
        super().__init__(field)
        self.field = field


def _number(
    value: object, field: str, nullable: bool = True, top: float | None = None
) -> None:
    if value is None and nullable:
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise Invalid(field)
    if not math.isfinite(value) or value < 0 or (top is not None and value > top):
        raise Invalid(field)


def _choice(value: object, field: str, choices: tuple, nullable: bool = False) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, str) or value not in choices:
        raise Invalid(field)


def _match(
    value: object, field: str, pattern: re.Pattern, nullable: bool = False
) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, str) or not pattern.fullmatch(value):
        raise Invalid(field)


def _bool(value: object, field: str, nullable: bool = False) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, bool):
        raise Invalid(field)


def _object(value: object, field: str, keys: tuple) -> dict:
    """An object with exactly these keys: an unknown one is refused by its name, a missing one by its own."""
    if not isinstance(value, dict):
        raise Invalid(field)
    prefix = f"{field}." if field else ""
    for key in value:
        if key not in keys:
            raise Invalid(f"{prefix}{key}")
    for key in keys:
        if key not in value:
            raise Invalid(f"{prefix}{key}")
    return value


HOST_PART = (
    "host",
    "taken_at",
    "requests_per_s",
    "error_rate",
    "latency_p50_s",
    "latency_p95_s",
    "model_server_up",
    "degraded_causes",
    "ceilings",
    "warnings",
    "release",
    # FR-059's tunnel state (group 10's review, I2).
    "tunnel_up",
)


def check_host_part(body: object, field: str = "") -> dict:
    """The serving host's panels (spec 000's FR-028), as the publisher posts them, or Invalid."""
    p = _object(body, field, HOST_PART)
    at = f"{field}." if field else ""
    _choice(p["host"], f"{at}host", HOSTS)
    _match(p["taken_at"], f"{at}taken_at", TIME_RE)
    _number(p["requests_per_s"], f"{at}requests_per_s")
    _number(p["error_rate"], f"{at}error_rate", top=1.0)
    _number(p["latency_p50_s"], f"{at}latency_p50_s")
    _number(p["latency_p95_s"], f"{at}latency_p95_s")
    _bool(p["model_server_up"], f"{at}model_server_up", nullable=True)
    causes = p["degraded_causes"]
    if not isinstance(causes, list) or len(causes) > len(CAUSES):
        raise Invalid(f"{at}degraded_causes")
    for cause in causes:
        _choice(cause, f"{at}degraded_causes", (*CAUSES, "none"))
    # `none` is the cause gauge's own "nothing degraded", dropped (group 10's review, I1).
    p["degraded_causes"] = [c for c in causes if c != "none"]
    for name in ("ceilings", "warnings"):
        money = _object(p[name], f"{at}{name}", ("day_usd", "month_usd"))
        for key in ("day_usd", "month_usd"):
            _number(money[key], f"{at}{name}.{key}")
    _match(p["release"], f"{at}release", RELEASE_RE, nullable=True)
    _bool(p["tunnel_up"], f"{at}tunnel_up", nullable=True)
    return p


def check_document(doc: object) -> None:
    """The whole document, as the sink writes it, or Invalid: the write refuses its own mistake, too."""
    d = _object(
        doc,
        "",
        (
            "schema",
            "written_at",
            "serving",
            "spend",
            "server",
            "handovers",
            "host_panels",
            "releases",
        ),
    )
    if d["schema"] != 1:
        raise Invalid("schema")
    _match(d["written_at"], "written_at", TIME_RE)
    s = _object(d["serving"], "serving", ("host", "since", "ec2_state", "taken_at"))
    _choice(s["host"], "serving.host", SERVING)
    _match(s["since"], "serving.since", TIME_RE, nullable=True)
    _choice(s["ec2_state"], "serving.ec2_state", DOC_EC2_STATES)
    _match(s["taken_at"], "serving.taken_at", TIME_RE)
    if d["spend"] is not None:
        sp = _object(
            d["spend"],
            "spend",
            (
                "kill_switch",
                "today_usd",
                "month_usd",
                "fallback_remaining_usd",
                "fallback_awaiting_renewal",
                "adapter_months",
                "taken_at",
            ),
        )
        _choice(sp["kill_switch"], "spend.kill_switch", KILL_SWITCH)
        for key in ("today_usd", "month_usd"):
            _number(sp[key], f"spend.{key}", nullable=False)
        _number(sp["fallback_remaining_usd"], "spend.fallback_remaining_usd")
        _bool(sp["fallback_awaiting_renewal"], "spend.fallback_awaiting_renewal")
        if not isinstance(sp["adapter_months"], list) or len(sp["adapter_months"]) > 4:
            raise Invalid("spend.adapter_months")
        for row in sp["adapter_months"]:
            a = _object(row, "spend.adapter_months", ("adapter", "month", "spent_usd"))
            _choice(a["adapter"], "spend.adapter_months.adapter", ADAPTERS)
            _match(a["month"], "spend.adapter_months.month", MONTH_RE)
            _number(a["spent_usd"], "spend.adapter_months.spent_usd", nullable=False)
        _match(sp["taken_at"], "spend.taken_at", TIME_RE)
    if d["server"] is not None:
        sv = _object(
            d["server"], "server", ("month_to_date_usd", "budget_usd", "as_of")
        )
        _number(sv["month_to_date_usd"], "server.month_to_date_usd", nullable=False)
        _number(sv["budget_usd"], "server.budget_usd", nullable=False)
        _match(sv["as_of"], "server.as_of", TIME_RE)
    if d["handovers"] is not None:
        h = _object(d["handovers"], "handovers", ("events", "taken_at"))
        if not isinstance(h["events"], list) or len(h["events"]) > 10:
            raise Invalid("handovers.events")
        for row in h["events"]:
            e = _object(row, "handovers.events", ("at", "from", "to", "gap_s"))
            _match(e["at"], "handovers.events.at", TIME_RE)
            _choice(e["from"], "handovers.events.from", SERVING)
            _choice(e["to"], "handovers.events.to", SERVING)
            _number(e["gap_s"], "handovers.events.gap_s")
        _match(h["taken_at"], "handovers.taken_at", TIME_RE)
    if d["host_panels"] is not None:
        check_host_part(d["host_panels"], "host_panels")
    releases = _object(d["releases"], "releases", HOSTS)
    for host in HOSTS:
        if releases[host] is not None:
            r = _object(releases[host], f"releases.{host}", ("release", "taken_at"))
            _match(r["release"], f"releases.{host}.release", RELEASE_RE, nullable=True)
            _match(r["taken_at"], f"releases.{host}.taken_at", TIME_RE)


def validate_document(doc: object) -> str | None:
    """The first field that isn't its kind, or None."""
    try:
        check_document(doc)
    except Invalid as exc:
        return exc.field
    return None


# ----------------------------------------------------------------------------------------------------------------------
# `serve`: the tunnel end's snapshot-sink container, the publishers' one way in. It holds the sink's token alone.


class Receiver:
    """POST /v1/host, GET /v1/serving, GET /v1/host, GET /health/live: each answer as (status, body or None)."""

    def __init__(
        self,
        token: str,
        relay_serving: Callable[[], str | None],
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.token = token.encode()
        self.relay_serving = relay_serving
        self.clock = clock
        self.part: dict | None = None
        self.refusals: dict[str, int] = {}

    def _refuse(self, status: int, error: str, **extra: str) -> tuple[int, dict]:
        self.refusals[error] = self.refusals.get(error, 0) + 1
        return status, {"error": error, **extra}

    def _authorized(self, headers: dict) -> bool:
        given = ""
        for key, value in headers.items():
            if key.lower() == "authorization":
                given = str(value)
        scheme, _, presented = given.partition(" ")
        return (
            bool(self.token)
            and scheme == "Bearer"
            and hmac.compare_digest(presented.encode(), self.token)
        )

    def serving(self) -> str:
        try:
            host = self.relay_serving()
        except Exception:  # noqa: BLE001 - an unreadable relay is unknown, never a host
            host = None
        return host if host in SERVING else "unknown"

    def handle(
        self, method: str, path: str, headers: dict, body: bytes
    ) -> tuple[int, dict | None]:
        if (method, path) == ("GET", "/health/live"):
            return 200, {"live": True}
        if (method, path) not in (
            ("POST", "/v1/host"),
            ("GET", "/v1/serving"),
            ("GET", "/v1/host"),
        ):
            return 404, {"error": "not_found"}
        if not self._authorized(headers):
            return self._refuse(401, "snapshot_auth")
        if method == "GET" and path == "/v1/serving":
            return 200, {"serving": self.serving()}
        if method == "GET":
            refusals = dict(sorted(self.refusals.items()))
            return 200, {"part": self.part, "refusals": refusals}
        if len(body) > MAX_BODY:
            return self._refuse(413, "body_too_large")
        try:
            doc = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return self._refuse(400, "invalid_snapshot", field="")
        try:
            p = check_host_part(doc)
        except Invalid as exc:
            return self._refuse(400, "invalid_snapshot", field=exc.field)
        age = self.clock() - epoch(p["taken_at"])
        if age > FRESH_S or age < -SKEW_S:
            return self._refuse(400, "stale_snapshot")
        if self.serving() != p["host"]:
            return self._refuse(409, "not_serving")
        # Kept with the sink's own time of receipt: the publisher's time bounds the skew above, and never makes the
        # page's ages (group 10's review; WSL's clock steps back).
        p["taken_at"] = iso(self.clock())
        self.part = p
        return 204, None


def relay_serving(url: str) -> str | None:
    """The relay's `serving`, from its internal listener's status; None if it can't be read."""
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url, timeout=5) as response:
            doc = json.loads(response.read(65536).decode("utf-8"))
    except (OSError, ValueError):
        return None
    serving = doc.get("serving") if isinstance(doc, dict) else None
    return serving if isinstance(serving, str) else None


def make_handler(receiver: Receiver):
    from http.server import BaseHTTPRequestHandler

    class Handler(BaseHTTPRequestHandler):
        server_version = "snapshot-sink"
        sys_version = ""
        # A stalled client holds its thread no longer than this (group 10's review).
        timeout = 10

        def _answer(self, method: str) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY:
                status, doc = receiver._refuse(413, "body_too_large")
            else:
                body = self.rfile.read(length) if length > 0 else b""
                status, doc = receiver.handle(
                    method, self.path, dict(self.headers.items()), body
                )
            data = b"" if doc is None else json.dumps(doc).encode()
            self.send_response(status)
            self.send_header("Cache-Control", "no-store")
            if doc is not None:
                self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            self._answer("GET")

        def do_POST(self) -> None:
            self._answer("POST")

        def log_message(self, format: str, *args: object) -> None:
            # No address and no path's query: the method, the path, and the status alone.
            if len(args) >= 2:
                print(
                    f"snapshot-sink: {str(args[0]).split(' ')[0]} {self.path.split('?')[0]} {args[1]}",
                    flush=True,
                )

    return Handler


def serve(receiver: Receiver, port: int) -> None:
    from http.server import ThreadingHTTPServer

    ThreadingHTTPServer(("0.0.0.0", port), make_handler(receiver)).serve_forever()


# ----------------------------------------------------------------------------------------------------------------------
# `write`: the tunnel end's host timer, every 2 minutes, with the tunnel end's role (plan.md §16, "Group 10, as built").


STORE_SQL = """BEGIN READ ONLY;
SET LOCAL ROLE grafana_ro;
SELECT json_build_object(
  'state', (SELECT row_to_json(v) FROM (SELECT state, day_spent_micro, month_spent_micro, fallback_spent_micro,
            fallback_reserved_micro, fallback_allowance_micro, fallback_awaiting_renewal FROM gateway.v_state) v),
  'adapters', (SELECT coalesce(json_agg(a), '[]'::json) FROM (SELECT adapter, month, spent_micro
               FROM gateway.v_adapter_months WHERE month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
               ORDER BY adapter) a),
  'handovers', (SELECT coalesce(json_agg(h), '[]'::json) FROM (SELECT to_char(at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, from_host, to_host, gap_ms FROM gateway.v_handovers
                ORDER BY v_handovers.at DESC LIMIT 10) h));
COMMIT;
"""
STORE_CONTAINER = "h4reet-prod-shared-state-1"
SINK_CONTAINER = "h4reet-prod-snapshot-sink-1"
COLLECTOR_CONTAINER = "h4reet-prod-tunnel-end-collector-1"
RELAY_INTERNAL = "http://127.0.0.1:18505/api/status"
ENV_FILE = Path("/run/h4reet/tunnel-end.env")
STATE_DIR = Path("/var/lib/h4reet/snapshot")


def usd(micro: object) -> float:
    """Money in USD with two decimals, rounded down: the view isn't the meter."""
    return math.floor(float(micro) / 10_000) / 100  # type: ignore[arg-type]


def spend_part(store: dict | None, now: float) -> dict | None:
    state = (store or {}).get("state")
    if not isinstance(state, dict):
        return None
    try:
        allowance = state.get("fallback_allowance_micro")
        remaining = (
            None
            if allowance is None
            else usd(
                max(
                    0,
                    int(allowance)
                    - int(state["fallback_spent_micro"])
                    - int(state["fallback_reserved_micro"]),
                )
            )
        )
        part = {
            "kill_switch": state["state"]
            if state.get("state") in KILL_SWITCH
            else "unknown",
            "today_usd": usd(state["day_spent_micro"]),
            "month_usd": usd(state["month_spent_micro"]),
            "fallback_remaining_usd": remaining,
            "fallback_awaiting_renewal": bool(state["fallback_awaiting_renewal"]),
            "adapter_months": [
                {
                    "adapter": a["adapter"],
                    "month": a["month"],
                    "spent_usd": usd(a["spent_micro"]),
                }
                for a in (store or {}).get("adapters") or []
                if isinstance(a, dict) and a.get("adapter") in ADAPTERS
            ],
            "taken_at": iso(now),
        }
    except (KeyError, TypeError, ValueError):
        return None
    return part


def handover_part(store: dict | None, now: float) -> dict | None:
    rows = (store or {}).get("handovers")
    if not isinstance(rows, list):
        return None
    events = []
    for row in rows[:10]:
        if not isinstance(row, dict):
            continue
        gap = row.get("gap_ms")
        events.append(
            {
                "at": row.get("at"),
                "from": row.get("from_host"),
                "to": row.get("to_host"),
                "gap_s": None if gap is None else round(float(gap) / 1000, 1),
            }
        )
    return {"events": events, "taken_at": iso(now)}


def doc_ec2_state(state: str) -> str:
    if state in ("pending", "running", "stopping", "stopped", "interrupted"):
        return state
    return "unknown"


@dataclass
class Writer:
    """Each write: the cloud part, read now, beside the last host part, with its own time; written whether or not a
    host serves (FR-057). The document is kept on the host too, so a sink that restarted, or a part that is late,
    never empties the view."""

    cloud: Sink
    relay_status: Callable[[], dict | None]
    store: Callable[[], dict | None]
    host_part: Callable[[], dict | None]
    put: Callable[[dict], bool]
    state_dir: Path = STATE_DIR
    clock: Callable[[], float] = time.time
    last: Reads | None = None
    outcome: str = "none"
    age_s: float | None = None
    errors_total: dict[str, int] = field(default_factory=dict)
    writes_total: dict[str, int] = field(default_factory=dict)
    started: float = field(default_factory=time.time)
    round_started: float = 0.0
    cadence_loaded: bool = False

    def previous(self) -> dict | None:
        try:
            doc = json.loads(
                (self.state_dir / "latest.json").read_text(encoding="utf-8")
            )
        except (OSError, ValueError):
            return None
        return doc if validate_document(doc) is None else None

    def keep(self, doc: dict) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.state_dir / ".latest.json"
        tmp.write_text(json.dumps(doc, sort_keys=True), encoding="utf-8")
        os.replace(str(tmp), str(self.state_dir / "latest.json"))

    def load_cadence(self) -> None:
        """The hourly and half-hourly reads' last times and points, so a restart doesn't read them again early (group
        10's review: a restart would otherwise run GetMetricData each time)."""
        self.cadence_loaded = True
        try:
            kept = json.loads(
                (self.state_dir / "cloud.json").read_text(encoding="utf-8")
            )
            for at_key, points_key in (
                ("budget_at", "budget_points"),
                ("outcomes_at", "outcome_points"),
            ):
                at = kept.get(at_key)
                if isinstance(at, (int, float)) and getattr(self.cloud, at_key) is None:
                    setattr(self.cloud, at_key, float(at))
                    setattr(
                        self.cloud,
                        points_key,
                        [
                            Point(
                                str(n),
                                float(v),
                                {str(k): str(x) for k, x in labels.items()},
                            )
                            for n, v, labels in kept.get(points_key) or []
                        ],
                    )
        except (OSError, ValueError, TypeError, AttributeError):
            pass

    def keep_cadence(self) -> None:
        state = {
            "budget_at": self.cloud.budget_at,
            "budget_points": [
                [p.name, p.value, p.labels] for p in self.cloud.budget_points
            ],
            "outcomes_at": self.cloud.outcomes_at,
            "outcome_points": [
                [p.name, p.value, p.labels] for p in self.cloud.outcome_points
            ],
        }
        try:
            self.state_dir.mkdir(parents=True, exist_ok=True)
            tmp = self.state_dir / ".cloud.json"
            tmp.write_text(json.dumps(state, sort_keys=True), encoding="utf-8")
            os.replace(str(tmp), str(self.state_dir / "cloud.json"))
        except OSError:
            pass

    def document(self) -> dict:
        now = self.clock()
        if not self.cadence_loaded:
            self.load_cadence()
        reads = self.cloud.read()
        self.keep_cadence()
        self.last = reads
        for read in reads.errors:
            self.errors_total[read] = self.errors_total.get(read, 0) + 1
        status = None
        try:
            status = self.relay_status()
        except Exception:  # noqa: BLE001 - an unreadable relay is no host serving, never a guess
            status = None
        status = status if isinstance(status, dict) else {}
        host = status.get("serving") if status.get("serving") in SERVING else "none"
        since = (
            status.get("since")
            if isinstance(status.get("since"), str)
            and TIME_RE.fullmatch(status["since"])
            else None
        )
        try:
            store = self.store()
        except Exception:  # noqa: BLE001 - an unread store is no spend part, never zeros
            store = None
        previous = self.previous() or {}
        kept = previous.get("host_panels")
        try:
            fresh = self.host_part()
            fresh = check_host_part(fresh) if fresh is not None else None
        except (Invalid, Exception):  # noqa: BLE001 - a part that can't be read or checked keeps the last
            fresh = None
        panels = kept
        if fresh is not None and (
            kept is None or epoch(fresh["taken_at"]) > epoch(kept["taken_at"])
        ):
            panels = fresh
        releases = dict(previous.get("releases") or {"laptop": None, "ec2": None})
        if panels is not None:
            mine = releases.get(panels["host"])
            if mine is None or epoch(panels["taken_at"]) >= epoch(mine["taken_at"]):
                releases[panels["host"]] = {
                    "release": panels["release"],
                    "taken_at": panels["taken_at"],
                }
        # A failed hourly read keeps the last server part, with its own as_of (group 10's review).
        server = previous.get("server")
        if self.cloud.budget_at is not None and self.cloud.budget_points:
            month = {p.name: p.value for p in self.cloud.budget_points}
            server = {
                "month_to_date_usd": month.get("h4.server.month_usd", 0.0),
                "budget_usd": month.get("h4.server.budget_usd", 0.0),
                "as_of": iso(self.cloud.budget_at),
            }
        self.age_s = (
            None if panels is None else round(now - epoch(panels["taken_at"]), 1)
        )
        return {
            "schema": 1,
            "written_at": iso(now),
            "serving": {
                "host": host,
                "since": since,
                "ec2_state": doc_ec2_state(reads.ec2_state),
                "taken_at": iso(now),
            },
            "spend": spend_part(store, now),
            "server": server,
            "handovers": handover_part(store, now),
            "host_panels": panels,
            "releases": {h: releases.get(h) for h in HOSTS},
        }

    def write(self) -> str:
        self.round_started = self.clock()
        doc = self.document()
        if validate_document(doc) is not None:
            self.outcome = "refused"
        else:
            self.keep(doc)
            try:
                ok = self.put(doc)
            except Exception:  # noqa: BLE001 - a failed put is its outcome; the next run tries again
                ok = False
            self.outcome = "written" if ok else "failed"
        self._count()
        return self.outcome

    def _count(self) -> None:
        self.writes_total[self.outcome] = self.writes_total.get(self.outcome, 0) + 1

    def telemetry(self, start: float, at: float) -> dict:
        """The cloud reads' metrics, the write's outcome and the host part's age, and one span, `snapshot.write`:
        numbers and states alone."""
        payload = otlp_payload(self.last or Reads(), self.errors_total, start, at)
        stamp = str(int(at * 1_000_000_000))
        metrics = payload["resourceMetrics"][0]["scopeMetrics"][0]["metrics"]
        # Cumulative since this process started, as the collector passes counters on to Prometheus unconverted.
        metrics.append(
            {
                "name": "h4.snapshot.writes",
                "sum": {
                    "aggregationTemporality": 2,
                    "isMonotonic": True,
                    "dataPoints": [
                        {
                            "asInt": str(n),
                            "startTimeUnixNano": str(int(self.started * 1_000_000_000)),
                            "timeUnixNano": stamp,
                            "attributes": attrs({"outcome": outcome}),
                        }
                        for outcome, n in sorted(self.writes_total.items())
                    ],
                },
            }
        )
        if self.age_s is not None:
            metrics.append(
                {
                    "name": "h4.snapshot.age_seconds",
                    "unit": "s",
                    "gauge": {
                        "dataPoints": [{"asDouble": self.age_s, "timeUnixNano": stamp}]
                    },
                }
            )
        trace = os.urandom(16).hex()
        payload["resourceSpans"] = [
            {
                "resource": {
                    "attributes": attrs(
                        {"service.name": "snapshot-sink", "service.namespace": "h4reet"}
                    )
                },
                "scopeSpans": [
                    {
                        "scope": {"name": "h4-sink"},
                        "spans": [
                            {
                                "traceId": trace,
                                "spanId": os.urandom(8).hex(),
                                "name": "snapshot.write",
                                "kind": 1,
                                "startTimeUnixNano": str(int(start * 1_000_000_000)),
                                "endTimeUnixNano": stamp,
                                "attributes": attrs(
                                    {"h4.snapshot.outcome": self.outcome}
                                ),
                                "status": {
                                    "code": 1 if self.outcome == "written" else 2
                                },
                            }
                        ],
                    }
                ],
            }
        ]
        return payload


def put_argv(account: str, path: Path) -> list[str]:
    return [
        "aws",
        "s3",
        "cp",
        str(path),
        f"s3://h4reet-ai-site-{account}/{DOCUMENT_KEY}",
        "--content-type",
        "application/json",
        "--cache-control",
        "max-age=60",
        "--region",
        REGION,
        "--only-show-errors",
        "--no-cli-pager",
    ]


def env_value(key: str, path: Path = ENV_FILE) -> str:
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            name, sep, value = line.partition("=")
            if sep and name == key:
                return value
    except OSError:
        pass
    return ""


def run(
    argv: list[str], data: bytes | None = None, timeout: int = 60
) -> tuple[int, bytes]:
    try:
        done = subprocess.run(
            argv, input=data, capture_output=True, check=False, timeout=timeout
        )
    except (OSError, subprocess.TimeoutExpired):
        return 127, b""
    return done.returncode, done.stdout


def read_store() -> dict | None:
    """The shared state's spend, kill switch, adapters' months, and last 10 handovers, as grafana_ro: over the store's
    socket inside its container, as the backup's dump goes, in a read-only transaction under grafana_ro's role."""
    code, out = run(
        [
            "docker",
            "exec",
            "-i",
            "-u",
            "postgres",
            STORE_CONTAINER,
            "psql",
            "-X",
            "-q",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
            "--dbname=h4reet",
        ],
        STORE_SQL.encode(),
    )
    if code != 0:
        return None
    for line in out.decode("utf-8", "replace").splitlines():
        if line.startswith("{"):
            try:
                doc = json.loads(line)
            except ValueError:
                return None
            return doc if isinstance(doc, dict) else None
    return None


def container_address(container: str, network: str) -> str:
    code, out = run(
        [
            "docker",
            "inspect",
            "--format",
            '{{(index .NetworkSettings.Networks "' + network + '").IPAddress}}',
            container,
        ]
    )
    return out.decode().strip() if code == 0 else ""


def fetch_host_part(token: str) -> dict | None:
    """The sink container's last part, asked at its address on the stack's edge bridge, as the backup finds the
    collector."""
    address = container_address(SINK_CONTAINER, "h4reet-prod_edge")
    if not address:
        return None
    request = urllib.request.Request(
        f"http://{address}:8080/v1/host",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=10) as response:
        doc = json.loads(response.read(MAX_BODY * 2).decode("utf-8"))
    return doc.get("part") if isinstance(doc, dict) else None


def relay_status_doc() -> dict | None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(RELAY_INTERNAL, timeout=5) as response:
        doc = json.loads(response.read(65536).decode("utf-8"))
    return doc if isinstance(doc, dict) else None


def put_document(account: str, state_dir: Path) -> Callable[[dict], bool]:
    def put(doc: dict) -> bool:
        return run(put_argv(account, state_dir / "latest.json"))[0] == 0

    return put


def post_otlp(payload: dict) -> None:
    address = container_address(COLLECTOR_CONTAINER, "h4reet-prod_egress")
    if not address:
        return
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for signal, key in (("metrics", "resourceMetrics"), ("traces", "resourceSpans")):
        request = urllib.request.Request(
            f"http://{address}:4318/v1/{signal}",
            data=json.dumps({key: payload.get(key, [])}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            opener.open(request, timeout=10).close()
        except OSError:
            print(
                f"snapshot-sink: the collector didn't take the write's {signal}",
                file=sys.stderr,
            )


def next_sleep(period: float, started: float, now: float) -> float:
    """A fixed rate: the period less what the run took, never below 0 (group 10's review, I3)."""
    return max(0.0, period - (now - started))


def run_writes(
    write: Callable[[], str],
    after: Callable[[], None],
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> None:
    """The write's loop, every EVERY_S at a fixed rate by a monotonic clock (the final review, nit 3); one round's error is said and the loop goes on, never a
    restart that would read everything again (group 10's review)."""
    while True:
        started = clock()
        try:
            print(f"snapshot-sink: {write()}", flush=True)
        except Exception as exc:  # noqa: BLE001 - one round's failure, by its class alone
            print(
                f"snapshot-sink: the write failed ({type(exc).__name__})",
                file=sys.stderr,
                flush=True,
            )
        try:
            after()
        except Exception as exc:  # noqa: BLE001 - telemetry never stops the write
            print(
                f"snapshot-sink: its telemetry failed ({type(exc).__name__})",
                file=sys.stderr,
                flush=True,
            )
        sleep(next_sleep(EVERY_S, started, clock()))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="snapshot_sink.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("command", choices=("serve", "write"))
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args(argv)
    if args.command == "serve":
        token = os.environ.get("SNAPSHOT_SINK_TOKEN", "")
        if not token:
            print(
                "snapshot-sink: no SNAPSHOT_SINK_TOKEN; the tunnel-keys target writes it",
                file=sys.stderr,
            )
            return 2
        url = os.environ.get("RELAY_STATUS_URL", "http://relay:8081/api/status")
        serve(Receiver(token, lambda: relay_serving(url)), args.port)
        return 0
    account = env_value("H4_REGISTRY").split(".", 1)[0]
    token = env_value("SNAPSHOT_SINK_TOKEN")
    if not (len(account) == 12 and account.isdigit()):
        print(
            "snapshot-sink: the env file names no account's registry", file=sys.stderr
        )
        return 2
    writer = Writer(
        cloud=Sink(CliAws(), account),
        relay_status=relay_status_doc,
        store=read_store,
        host_part=lambda: fetch_host_part(token) if token else None,
        put=put_document(account, STATE_DIR),
    )
    if args.once:
        print(f"snapshot-sink: {writer.write()}", flush=True)
        post_otlp(writer.telemetry(writer.round_started, time.time()))
        return 0
    run_writes(
        writer.write,
        lambda: post_otlp(writer.telemetry(writer.round_started, time.time())),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
