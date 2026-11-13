#!/usr/bin/env python3
"""snapshot-publisher, each serving host's part of the public view (spec 001 tasks.md T137; FR-057 to FR-059;
contracts/public-view.md §1; data-model.md §5; plan.md §16, "Group 10, as built"; disclosure row C4).

Every 2 minutes, in its host's stack (the laptop's prod, in the tunnel profile, as `snapshot-publisher`; EC2's, as
`ec2-snapshot-publisher`):
  1. it asks the sink which host the relay serves (GET /v1/serving, the relay's own status, which the sink reads on
     its internal listener); unless that is its own H4_HOST, it posts nothing, and doesn't ask its Prometheus;
  2. it evaluates spec 000's FR-028 panels against its own Prometheus, at one instant, each query read from the
     provisioned dashboard's panel of that title, so the view and Grafana can't drift;
  3. it posts the part, with the time it was taken and its H4_HOST, to the sink (POST /v1/host) with the sink's
     token: the laptop's through the tunnel's -L 2301, EC2's inside the VPC.
It logs each outcome, never a value, and sends one span, `snapshot.publish`, and a count by outcome to its stack's
collector. A failed post is tried again at the next run; nothing queues.

    python3 -I -B snapshot_publisher.py [--once]

The standard library alone. The tests give it stubs for the sink and Prometheus.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path

# Every minute (group 10's review, I3, FR-058): with the write's 2 minutes and the edge's 60 s, the view stays under
# 5 minutes old (test_snapshot.py's worst case). Each run at a fixed rate: the period less the run's own time.
EVERY_S = 60
DASHBOARD = Path("/etc/h4reet/dashboards/h4-runtime.json")
RATE_WINDOW = "5m"
# Each field of the host part, from its dashboard panel: (the panel's title, its query's refId).
PANELS = {
    "requests_per_s": ("Request count", "A"),
    "error_rate": ("Error rate", "A"),
    "latency_p50_s": ("Latency p50 and p95", "A"),
    "latency_p95_s": ("Latency p50 and p95", "B"),
    "model_server_up": ("Model-server health", "A"),
    "degraded_causes": ("Why responses are degraded", "A"),
    "ceiling_day": ("Spend today (stat)", "C"),
    "warning_day": ("Spend today (stat)", "B"),
    "ceiling_month": ("Spend month-to-date (stat)", "C"),
    "warning_month": ("Spend month-to-date (stat)", "B"),
    "release": ("The release on each host", "A"),
    # FR-059's tunnel state (group 10's review, I2): up while every end the panel reads says up.
    "tunnel_up": ("Tunnel up", "A"),
}


def next_sleep(period: float, started: float, now: float) -> float:
    """A fixed rate: the period less what the run took, never below 0."""
    return max(0.0, period - (now - started))


def iso(epoch: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def panel_queries(dashboard: dict) -> dict[str, str]:
    """Each field's PromQL, as the dashboard's panel holds it, with Grafana's rate interval made a fixed window."""
    by_title: dict[str, dict] = {}

    def walk(panels: list) -> None:
        for p in panels or []:
            if isinstance(p, dict):
                by_title.setdefault(str(p.get("title")), p)
                walk(p.get("panels") or [])

    walk(dashboard.get("panels") or [])
    out = {}
    for field, (title, ref) in PANELS.items():
        panel = by_title.get(title) or {}
        for target in panel.get("targets") or []:
            if target.get("refId") == ref and isinstance(target.get("expr"), str):
                out[field] = target["expr"].replace("$__rate_interval", RATE_WINDOW)
    return out


def _value(sample: dict) -> float | None:
    try:
        value = float(sample["value"][1])
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def scalar(result: list, total: bool = False) -> float | None:
    values = [v for v in (_value(s) for s in result or []) if v is not None]
    if not values:
        return None
    return sum(values) if total else max(values)


def host_part(
    host: str, queries: dict[str, str], prometheus: Callable[[str], list], now: float
) -> dict:
    """spec 000's FR-028 panels, as numbers, states, and a release: the sink's schema (snapshot_sink.check_host_part)."""

    def ask(field: str) -> list:
        query = queries.get(field)
        if query is None:
            return []
        try:
            return prometheus(query)
        except Exception:  # noqa: BLE001 - a query that fails is no value, never a guess
            return []

    def money(field: str) -> float | None:
        value = scalar(ask(field))
        return None if value is None or value < 0 else round(value, 2)

    def nonneg(value: float | None, places: int) -> float | None:
        return None if value is None or value < 0 else round(value, places)

    up = scalar(ask("model_server_up"))
    error_rate = scalar(ask("error_rate"))
    causes = sorted(
        {
            str((s.get("metric") or {}).get("h4_cause"))
            for s in ask("degraded_causes")
            if _value(s) == 1.0
        }
        # The gauge holds `none` = 1 while nothing is degraded (spec 000's h4.degraded.cause): no cause, not a cause
        # (group 10's review, I1).
        - {"none"}
    )
    tunnel = [v for v in (_value(s) for s in ask("tunnel_up")) if v is not None]
    # The running release, by its commit's first 12 hex, as the deployer labels it (h4.commit): hex alone, never the
    # release's free-form name.
    release = None
    for s in ask("release"):
        metric = s.get("metric") or {}
        commit = metric.get("h4_commit")
        if (
            metric.get("h4_host") == host
            and isinstance(commit, str)
            and len(commit) >= 12
        ):
            release = commit[:12].lower()
    return {
        "host": host,
        "taken_at": iso(now),
        "requests_per_s": nonneg(scalar(ask("requests_per_s"), total=True), 4),
        "error_rate": None
        if error_rate is None
        else round(min(max(error_rate, 0.0), 1.0), 4),
        "latency_p50_s": nonneg(scalar(ask("latency_p50_s")), 3),
        "latency_p95_s": nonneg(scalar(ask("latency_p95_s")), 3),
        "model_server_up": None if up is None or host != "laptop" else up >= 1.0,
        "degraded_causes": causes,
        "ceilings": {
            "day_usd": money("ceiling_day"),
            "month_usd": money("ceiling_month"),
        },
        "warnings": {
            "day_usd": money("warning_day"),
            "month_usd": money("warning_month"),
        },
        "release": release,
        "tunnel_up": all(v >= 1.0 for v in tunnel) if tunnel else None,
    }


class Publisher:
    def __init__(
        self,
        host: str,
        sink,
        prometheus: Callable[[str], list],
        dashboard: dict,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.host, self.sink, self.prometheus, self.dashboard, self.clock = (
            host,
            sink,
            prometheus,
            dashboard,
            clock,
        )

    def once(self) -> str:
        """One run's outcome: posted, refused, failed, not_serving, or unread (the relay's status couldn't be read)."""
        try:
            serving = self.sink.serving()
        except Exception:  # noqa: BLE001 - an unread status is no post
            serving = None
        if serving not in ("laptop", "ec2", "none"):
            return "unread"
        if serving != self.host:
            return "not_serving"
        part = host_part(
            self.host, panel_queries(self.dashboard), self.prometheus, self.clock()
        )
        try:
            status = self.sink.post(part)
        except Exception:  # noqa: BLE001 - a failed post is tried again at the next run
            status = 0
        if status == 204:
            return "posted"
        return "refused" if 400 <= status < 500 else "failed"


class HttpSink:
    """The sink, over HTTP, with the token; the laptop's through the tunnel's forward, EC2's inside the VPC."""

    def __init__(self, url: str, token: str) -> None:
        self.url, self.token = url.rstrip("/"), token
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def _request(
        self, method: str, path: str, body: dict | None = None
    ) -> tuple[int, dict | None]:
        request = urllib.request.Request(
            f"{self.url}{path}",
            data=None if body is None else json.dumps(body).encode(),
            headers={
                "Authorization": f"Bearer {self.token}",
                **({"Content-Type": "application/json"} if body is not None else {}),
            },
            method=method,
        )
        try:
            with self.opener.open(request, timeout=10) as response:
                raw = response.read(65536)
                return response.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as exc:
            return exc.code, None

    def serving(self) -> str | None:
        status, doc = self._request("GET", "/v1/serving")
        if status != 200 or not isinstance(doc, dict):
            return None
        return doc.get("serving") if isinstance(doc.get("serving"), str) else None

    def post(self, part: dict) -> int:
        return self._request("POST", "/v1/host", part)[0]


def prometheus_query(base: str) -> Callable[[str], list]:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def ask(query: str) -> list:
        url = f"{base.rstrip('/')}/api/v1/query?" + urllib.parse.urlencode(
            {"query": query}
        )
        with opener.open(url, timeout=10) as response:
            doc = json.loads(response.read(1 << 20))
        if doc.get("status") != "success":
            return []
        return list((doc.get("data") or {}).get("result") or [])

    return ask


def telemetry(
    host: str,
    outcome: str,
    start: float,
    end: float,
    counts: dict[str, int],
    since: float,
) -> tuple[dict, dict]:
    """One span, `snapshot.publish`, and `h4.snapshot.publishes`, each outcome's count since `since`, cumulative, as
    the collector passes counters on to Prometheus unconverted: no value of the part."""

    def attrs(labels: dict[str, str]) -> list[dict]:
        return [
            {"key": k, "value": {"stringValue": v}} for k, v in sorted(labels.items())
        ]

    resource = {
        "attributes": attrs(
            {
                "service.name": "snapshot-publisher",
                "service.namespace": "h4reet",
                "h4.host": host,
            }
        )
    }
    spans = {
        "resourceSpans": [
            {
                "resource": resource,
                "scopeSpans": [
                    {
                        "scope": {"name": "h4-publisher"},
                        "spans": [
                            {
                                "traceId": os.urandom(16).hex(),
                                "spanId": os.urandom(8).hex(),
                                "name": "snapshot.publish",
                                "kind": 1,
                                "startTimeUnixNano": str(int(start * 1e9)),
                                "endTimeUnixNano": str(int(end * 1e9)),
                                "attributes": attrs({"h4.snapshot.outcome": outcome}),
                                "status": {
                                    "code": 2 if outcome in ("failed", "refused") else 1
                                },
                            }
                        ],
                    }
                ],
            }
        ]
    }
    metrics = {
        "resourceMetrics": [
            {
                "resource": resource,
                "scopeMetrics": [
                    {
                        "scope": {"name": "h4-publisher"},
                        "metrics": [
                            {
                                "name": "h4.snapshot.publishes",
                                "sum": {
                                    "aggregationTemporality": 2,
                                    "isMonotonic": True,
                                    "dataPoints": [
                                        {
                                            "asInt": str(n),
                                            "startTimeUnixNano": str(int(since * 1e9)),
                                            "timeUnixNano": str(int(end * 1e9)),
                                            "attributes": attrs({"outcome": name}),
                                        }
                                        for name, n in sorted(counts.items())
                                    ],
                                },
                            }
                        ],
                    }
                ],
            }
        ]
    }
    return spans, metrics


def export(endpoint: str, spans: dict, metrics: dict) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for path, payload in (("/v1/traces", spans), ("/v1/metrics", metrics)):
        request = urllib.request.Request(
            f"{endpoint.rstrip('/')}{path}",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            opener.open(request, timeout=5).close()
        except OSError:
            print(
                f"snapshot-publisher: the collector didn't take {path}",
                file=sys.stderr,
                flush=True,
            )


def run_publishes(
    once: Callable[[], str],
    after: Callable[[str], None],
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> None:
    """The publisher's loop, every EVERY_S at a fixed rate by a monotonic clock (the final review, nits 1 and 3)."""
    while True:
        started = clock()
        after(once())
        sleep(next_sleep(EVERY_S, started, clock()))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="snapshot_publisher.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args(argv)
    host = os.environ.get("H4_HOST", "")
    token = os.environ.get("SNAPSHOT_SINK_TOKEN", "")
    if host not in ("laptop", "ec2"):
        print("snapshot-publisher: H4_HOST is neither laptop nor ec2", file=sys.stderr)
        return 2
    if not token:
        print(
            "snapshot-publisher: no SNAPSHOT_SINK_TOKEN; the tunnel-keys target writes it",
            file=sys.stderr,
        )
        return 2
    dashboard = json.loads(
        Path(os.environ.get("DASHBOARD", str(DASHBOARD))).read_text(encoding="utf-8")
    )
    publisher = Publisher(
        host,
        HttpSink(os.environ.get("SNAPSHOT_SINK_URL", ""), token),
        prometheus_query(os.environ.get("PROMETHEUS_URL", "http://prometheus:9090")),
        dashboard,
    )
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    since = time.time()
    counts: dict[str, int] = {}
    round_started = [time.time()]

    def once() -> str:
        round_started[0] = time.time()
        return publisher.once()

    def after(outcome: str) -> None:
        counts[outcome] = counts.get(outcome, 0) + 1
        print(f"snapshot-publisher: {outcome}", flush=True)
        if endpoint:
            export(
                endpoint,
                *telemetry(host, outcome, round_started[0], time.time(), counts, since),
            )

    if args.once:
        after(once())
        return 0
    run_publishes(once, after)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
