#!/usr/bin/env python3
"""snapshot-sink's cloud reads (spec 001 tasks.md T121, T126; FR-060, FR-065; contracts/public-view.md §2; plan.md §11;
research.md R-15). Group 10 adds the sink's document part, `site/status/latest.json` (T137).

Every 2 minutes, whether or not a host serves, the sink reads AWS's side of the handover with the tunnel end's role,
and exports each read as a metric through the tunnel end's collector (C15), which the serving host's Prometheus keeps
for the dashboard's Hosts row (contracts/handover.md §10):

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

A read that fails is counted as an error, and its metric gets no point: a gauge never shows a stale or guessed value
as fresh. No label holds a secret, the account's ID, an instance's ID, or an address.

    python3 -I -B deploy/scripts/snapshot_sink.py cloud --collector http://tunnel-end-collector:4318 [--once]

AWS is reached through the AWS CLI, with the role's credentials; the tests give it a stub.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field

REGION = "us-east-1"
EC2_NAME = "h4-prod-ec2"
AUTOSTART = "/h4reet/prod/ec2-autostart"
HEALTH_CHECK_PARAMETER = "/h4reet/tunnel-end/HEALTH_CHECK_ID"
SERVER_BUDGET = "h4-server-month"
NAMESPACE = "h4reet/handover"
EVERY_S = 120
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
    state = str((found[0].get("State") or {}).get("Name", "none")) if found else "none"
    out.points += one_hot("h4.ec2.state", EC2_STATES, state)
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


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="snapshot_sink.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("command", choices=("cloud",))
    parser.add_argument("--collector", required=True)
    parser.add_argument("--account", default=os.environ.get("H4_ACCOUNT_ID", ""))
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args(argv)
    if not args.account.isdigit():
        print("snapshot-sink: H4_ACCOUNT_ID isn't set", file=sys.stderr)
        return 2
    sink = Sink(CliAws(), args.account)
    start = time.time()
    errors_total = dict.fromkeys(READS, 0)
    while True:
        reads = sink.read()
        for read in reads.errors:
            errors_total[read] = errors_total.get(read, 0) + 1
        try:
            post(args.collector, otlp_payload(reads, errors_total, start, time.time()))
        except (OSError, urllib.error.URLError):
            print(
                "snapshot-sink: the collector didn't take the cloud reads",
                file=sys.stderr,
            )
        if args.once:
            return 0
        time.sleep(EVERY_S)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
