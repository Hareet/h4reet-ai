"""Tests for scripts/langfuse_dashboards.py, deploy/langfuse/dashboards/, and make langfuse-dashboards (spec 034).

Every run is against a stand-in Langfuse on 127.0.0.1 at port 0, never a real stack. The stand-in implements the
dashboard endpoints, the Metrics API v2, and the API description as spec 034's research.md (R-1 to R-4) reads Langfuse
4.54.0's, keeps its widgets and dashboards in memory, and records every request, so a test can count the writes.
"""

from __future__ import annotations

import base64
import http.server
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import urllib.parse
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "h4_langfuse_dashboards", REPO / "scripts" / "langfuse_dashboards.py"
)
assert SPEC and SPEC.loader
ld = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ld
SPEC.loader.exec_module(ld)

FILES = REPO / "deploy" / "langfuse" / "dashboards"
BUDGETS = REPO / "config" / "budgets.yaml"
GRAFANA = REPO / "deploy" / "grafana" / "dashboards" / "h4-runtime.json"
MAKEFILE = REPO / "Makefile"

# The stand-in's keys: plain words, so no secret scanner reads them as a key, and distinctive, so a test can look
# for them in the output.
PUBLIC = "standin-public-word"
SECRET = "standin-secret-word"
PREFIX = "/api/public/unstable"

# The API description, as research R-2 reads Langfuse's: the operations the command uses, and the field names it sends.
SPEC_YAML = """\
openapi: 3.0.1
info:
  title: langfuse
  version: ''
paths:
  /api/public/unstable/dashboard-widgets:
    get:
      operationId: unstable_dashboardWidgets_list
      parameters:
        - name: page
          in: query
    post:
      operationId: unstable_dashboardWidgets_create
  '/api/public/unstable/dashboard-widgets/{widgetId}':
    get:
      operationId: unstable_dashboardWidgets_get
    patch:
      operationId: unstable_dashboardWidgets_update
    delete:
      operationId: unstable_dashboardWidgets_delete
  /api/public/unstable/dashboards:
    get:
      operationId: unstable_dashboards_list
    post:
      operationId: unstable_dashboards_create
  /api/public/unstable/dashboards/{dashboardId}:
    get:
      operationId: unstable_dashboards_get
    patch:
      operationId: unstable_dashboards_update
    delete:
      operationId: unstable_dashboards_delete
  /api/public/unstable/dashboards/{dashboardId}/placements:
    post:
      operationId: unstable_dashboards_addPlacement
  /api/public/v2/metrics:
    get:
      operationId: metricsV2_metrics
components:
  schemas:
    DashboardWidget:
      properties:
        name: {type: string}
        view: {type: string}
        dimensions: {type: array}
        metrics: {type: array}
        filters: {type: array}
        chartType: {type: string}
        chartConfig:
          properties:
            row_limit: {type: integer}
            bins: {type: integer}
            defaultSort: {type: object}
    Dashboard:
      properties:
        definition:
          properties:
            widgets:
              items:
                properties:
                  id: {type: string}
                  type: {type: string}
                  widgetId: {type: string}
                  x: {type: integer}
                  y: {type: integer}
                  x_size: {type: integer}
                  y_size: {type: integer}
"""

MEASURES = {
    "count",
    "latency",
    "totalCost",
    "inputCost",
    "outputCost",
    "totalTokens",
    "inputTokens",
    "outputTokens",
}
FIELDS = {
    "providedModelName",
    "traceName",
    "traceId",
    "name",
    "type",
    "level",
    "environment",
}


# --- The stand-in Langfuse ------------------------------------------------------------------------------------------


class StandIn:
    """Langfuse's dashboard API, Metrics API v2, and API description, in memory."""

    def __init__(self) -> None:
        self.spec: str | None = SPEC_YAML
        self.widgets: dict[str, dict[str, Any]] = {}
        self.dashboards: dict[str, dict[str, Any]] = {}
        self.requests: list[tuple[str, str, dict[str, str], Any]] = []
        self.refuse_measure: str | None = (
            None  # the metrics API refuses a query with this measure
        )
        self.throttle = 0  # answer this many requests 429 first
        self.retry_after = "2"
        self.lag = 0  # answer this many dashboard writes 404, as a fresh widget's placement does (research R-3)
        self.page_size = 4
        self.omit_descriptions = False
        self.next_id = 0
        self.server: http.server.ThreadingHTTPServer | None = None

    # -- helpers for the tests
    def writes(self) -> list[tuple[str, str]]:
        return [
            (m, p)
            for m, p, _, _ in self.requests
            if m in ("POST", "PATCH", "PUT", "DELETE")
        ]

    def new_id(self, prefix: str) -> str:
        self.next_id += 1
        return f"{prefix}{self.next_id:03d}"

    def managed(self, table: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        return [o for o in table.values() if "[h4 " in o.get("description", "")]

    # -- the server
    def start(self) -> int:
        standin = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args: Any) -> None:
                pass

            def answer(
                self,
                status: int,
                body: Any = None,
                headers: dict[str, str] | None = None,
            ) -> None:
                data = (
                    b""
                    if body is None
                    else (
                        body if isinstance(body, bytes) else json.dumps(body).encode()
                    )
                )
                self.send_response(status)
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def handle_any(self, method: str) -> None:
                url = urllib.parse.urlsplit(self.path)
                query = dict(urllib.parse.parse_qsl(url.query))
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                body = json.loads(raw) if raw else None
                standin.requests.append((method, url.path, query, body))
                expected = (
                    "Basic " + base64.b64encode(f"{PUBLIC}:{SECRET}".encode()).decode()
                )
                if self.headers.get("Authorization") != expected:
                    return self.answer(401, {"message": "Unauthorized"})
                if standin.throttle > 0:
                    standin.throttle -= 1
                    return self.answer(
                        429,
                        {"message": "rate limited"},
                        {"Retry-After": standin.retry_after},
                    )
                status, payload = standin.route(method, url.path, query, body)
                if isinstance(payload, str):
                    return self.answer(status, payload.encode())
                return self.answer(status, payload)

            def do_GET(self) -> None:
                self.handle_any("GET")

            def do_POST(self) -> None:
                self.handle_any("POST")

            def do_PATCH(self) -> None:
                self.handle_any("PATCH")

            def do_PUT(self) -> None:
                self.handle_any("PUT")

            def do_DELETE(self) -> None:
                self.handle_any("DELETE")

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self.server.server_address[1]

    def stop(self) -> None:
        if self.server:
            self.server.shutdown()
            self.server.server_close()

    def page(
        self, items: list[dict[str, Any]], query: dict[str, str]
    ) -> dict[str, Any]:
        page = int(query.get("page", "1"))
        size = min(int(query.get("limit", "50")), self.page_size)
        chunk = items[(page - 1) * size : page * size]
        if self.omit_descriptions:
            chunk = [{k: v for k, v in o.items() if k != "description"} for o in chunk]
        pages = max(1, -(-len(items) // size))
        return {
            "data": chunk,
            "meta": {
                "page": page,
                "limit": size,
                "totalItems": len(items),
                "totalPages": pages,
            },
        }

    def route(
        self, method: str, path: str, query: dict[str, str], body: Any
    ) -> tuple[int, Any]:
        if path == "/api/openapi.yaml":
            return (
                (200, self.spec)
                if self.spec is not None
                else (404, {"message": "Not Found"})
            )
        if path == "/api/public/v2/metrics" and method == "GET":
            return self.metrics(json.loads(query["query"]))
        widgets = f"{PREFIX}/dashboard-widgets"
        dashboards = f"{PREFIX}/dashboards"
        if path == widgets:
            if method == "GET":
                return 200, self.page(list(self.widgets.values()), query)
            if method == "POST":
                problem = self.bad_widget(body)
                if problem:
                    return 400, {"message": problem}
                obj = {"id": self.new_id("w"), "owner": "PROJECT", **body}
                self.widgets[obj["id"]] = obj
                return 200, obj
        if path.startswith(widgets + "/"):
            wid = path.rsplit("/", 1)[1]
            if wid not in self.widgets:
                return 404, {"message": "widget not found"}
            if method == "GET":
                return 200, self.widgets[wid]
            if method == "PATCH":
                problem = self.bad_widget(body)
                if problem:
                    return 400, {"message": problem}
                self.widgets[wid].update(body)
                return 200, self.widgets[wid]
            if method == "DELETE":
                del self.widgets[wid]
                return 200, {"message": "deleted"}
        if path == dashboards:
            if method == "GET":
                listed = [
                    {k: v for k, v in d.items() if k != "definition"}
                    for d in self.dashboards.values()
                ]
                return 200, self.page(listed, query)
            if method == "POST":
                lag = self.lagging(body)
                if lag:
                    return lag
                obj = {
                    "id": self.new_id("d"),
                    "owner": "PROJECT",
                    "filters": [],
                    **body,
                }
                self.dashboards[obj["id"]] = obj
                return 200, obj
        if path.startswith(dashboards + "/"):
            did = path.rsplit("/", 1)[1]
            if did not in self.dashboards:
                return 404, {"message": "dashboard not found"}
            if method == "GET":
                return 200, self.dashboards[did]
            if method == "PATCH":
                lag = self.lagging(body)
                if lag:
                    return lag
                self.dashboards[did].update(body)
                return 200, self.dashboards[did]
            if method == "DELETE":
                del self.dashboards[did]
                return 200, {"message": "deleted"}
        return 404, {"message": f"no route {method} {path}"}

    def lagging(self, body: Any) -> tuple[int, Any] | None:
        if self.lag > 0:
            self.lag -= 1
            return 404, {"message": "widget not found"}
        for placement in body.get("definition", {}).get("widgets", []):
            if placement.get("widgetId") not in self.widgets:
                return 404, {"message": f"widget {placement.get('widgetId')} not found"}
        return None

    @staticmethod
    def bad_widget(body: Any) -> str | None:
        for key in ("name", "view", "dimensions", "metrics", "filters", "chartType"):
            if key not in body:
                return f"{key} is required"
        if body["chartConfig"]["type"] != body["chartType"]:
            return "chartConfig.type must match chartType"
        return None

    def metrics(self, query: dict[str, Any]) -> tuple[int, Any]:
        if query.get("view") != "observations":
            return 400, {"message": "Invalid view"}
        for metric in query["metrics"]:
            if (
                metric["measure"] not in MEASURES
                or metric["measure"] == self.refuse_measure
            ):
                return 400, {
                    "message": f"Invalid measure {metric['measure']} for view observations"
                }
            if "aggregation" not in metric:
                return 400, {"message": "aggregation is required"}
        for dim in query.get("dimensions", []):
            if dim["field"] not in FIELDS:
                return 400, {"message": f"Invalid dimension {dim['field']}"}
            if dim["field"] == "traceId" and (
                "timeDimension" in query
                or not query.get("orderBy")
                or "row_limit" not in query.get("config", {})
            ):
                return 400, {"message": "traceId groups only in a top-N query"}
        for f in query.get("filters", []):
            if f["column"] not in FIELDS:
                return 400, {
                    "message": f"Unsupported filter column for view observations: {f['column']}"
                }
        return 200, {"data": [{"providedModelName": "local", "sum_totalCost": 0}]}


@pytest.fixture
def standin():
    s = StandIn()
    s.start()
    yield s
    s.stop()


@pytest.fixture(autouse=True)
def no_waits(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    waits: list[float] = []
    monkeypatch.setattr(ld, "SLEEP", waits.append)
    return waits


def env_file(tmp_path: Path, port: int, **over: str) -> Path:
    values = {
        "H4_STACK": "dev",
        "H4_LANGFUSE_PORT": str(port),
        "LANGFUSE_PUBLIC_KEY": PUBLIC,
        "LANGFUSE_SECRET_KEY": SECRET,
        "LANGFUSE_SALT": "not-read",
    }
    values.update(over)
    path = tmp_path / "dev.env"
    path.write_text(
        "# a stack's env file\n" + "".join(f"{k}={v}\n" for k, v in values.items())
    )
    return path


def run(
    standin: StandIn, tmp_path: Path, *extra: str, capsys: pytest.CaptureFixture[str]
) -> tuple[int, str]:
    assert standin.server
    path = env_file(tmp_path, standin.server.server_address[1])
    code = ld.main(["--stack", "dev", "--env-file", str(path), *extra])
    captured = capsys.readouterr()
    out = captured.out + captured.err
    assert PUBLIC not in out and SECRET not in out  # SC-003
    return code, out


def dashboards() -> list[dict[str, Any]]:
    return ld.load_definitions(FILES)


def widget(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "key": "w",
        "name": "A widget",
        "description": "What it counts, in USD.",
        "view": "observations",
        "metric": {"measure": "totalCost", "agg": "sum"},
        "dimensions": ["providedModelName"],
        "filters": [],
        "chartType": "BAR_TIME_SERIES",
        "chartConfig": {"type": "BAR_TIME_SERIES"},
        "place": {"x": 0, "y": 0, "w": 6, "h": 5},
    }
    base.update(over)
    return base


def board(*widgets: dict[str, Any], **over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "schema": 1,
        "key": "b",
        "name": "h4 · B",
        "description": "A dashboard.",
        "widgets": list(widgets) or [widget()],
    }
    base.update(over)
    return base


# --- The files (FR-001, FR-002, FR-013, FR-014) ----------------------------------------------------------------------


def test_the_files_load_as_two_dashboards_of_ten_and_seven_widgets() -> None:
    found = dashboards()
    assert [(d["key"], d["name"], len(d["widgets"])) for d in found] == [
        ("model-calls", "h4 · Model calls", 10),
        ("traces", "h4 · Traces", 7),
    ]


def test_each_dashboard_shows_spend_next_to_latency_and_failures() -> None:
    # Principle V: every dashboard shows spend next to latency and errors (spec FR-013; analysis A-4).
    for d in dashboards():
        measures = {w["metric"]["measure"] for w in d["widgets"]}
        failed = [
            w
            for w in d["widgets"]
            if any(
                f["column"] == "level" and f["value"] == ["ERROR"] for f in w["filters"]
            )
        ]
        assert {"totalCost", "latency"} <= measures, d["key"]
        assert failed, d["key"]


def test_the_widgets_are_the_plans_list() -> None:
    # plan D1's tables: each widget's chart, measure, aggregation, dimension, and place.
    got = {
        (d["key"], w["key"]): (
            w["chartType"],
            w["metric"]["measure"],
            w["metric"]["agg"],
            tuple(w["dimensions"]),
            (w["place"]["x"], w["place"]["y"], w["place"]["w"], w["place"]["h"]),
        )
        for d in dashboards()
        for w in d["widgets"]
    }
    assert got == {
        ("model-calls", "spend"): ("NUMBER", "totalCost", "sum", (), (0, 0, 3, 3)),
        ("model-calls", "calls"): ("NUMBER", "count", "count", (), (3, 0, 3, 3)),
        ("model-calls", "failed"): ("NUMBER", "count", "count", (), (6, 0, 3, 3)),
        ("model-calls", "latency-p95"): ("NUMBER", "latency", "p95", (), (9, 0, 3, 3)),
        ("model-calls", "spend-by-model"): (
            "BAR_TIME_SERIES",
            "totalCost",
            "sum",
            ("providedModelName",),
            (0, 3, 6, 5),
        ),
        ("model-calls", "calls-by-model"): (
            "BAR_TIME_SERIES",
            "count",
            "count",
            ("providedModelName",),
            (6, 3, 6, 5),
        ),
        ("model-calls", "latency-p50-by-model"): (
            "LINE_TIME_SERIES",
            "latency",
            "p50",
            ("providedModelName",),
            (0, 8, 6, 5),
        ),
        ("model-calls", "latency-p95-by-model"): (
            "LINE_TIME_SERIES",
            "latency",
            "p95",
            ("providedModelName",),
            (6, 8, 6, 5),
        ),
        ("model-calls", "failed-by-model"): (
            "BAR_TIME_SERIES",
            "count",
            "count",
            ("providedModelName",),
            (0, 13, 6, 5),
        ),
        ("model-calls", "tokens-by-model"): (
            "LINE_TIME_SERIES",
            "totalTokens",
            "sum",
            ("providedModelName",),
            (6, 13, 6, 5),
        ),
        ("traces", "costliest"): (
            "PIVOT_TABLE",
            "totalCost",
            "sum",
            ("traceId",),
            (0, 0, 6, 6),
        ),
        ("traces", "slowest"): (
            "PIVOT_TABLE",
            "latency",
            "max",
            ("traceId",),
            (6, 0, 6, 6),
        ),
        ("traces", "spend-by-endpoint"): (
            "HORIZONTAL_BAR",
            "totalCost",
            "sum",
            ("traceName",),
            (0, 6, 4, 5),
        ),
        ("traces", "latency-spread"): (
            "HISTOGRAM",
            "latency",
            "histogram",
            (),
            (4, 6, 4, 5),
        ),
        ("traces", "failed-by-endpoint"): (
            "HORIZONTAL_BAR",
            "count",
            "count",
            ("traceName",),
            (8, 6, 4, 5),
        ),
        ("traces", "input-tokens-spread"): (
            "HISTOGRAM",
            "inputTokens",
            "histogram",
            (),
            (0, 11, 6, 5),
        ),
        ("traces", "output-tokens-spread"): (
            "HISTOGRAM",
            "outputTokens",
            "histogram",
            (),
            (6, 11, 6, 5),
        ),
    }


def test_model_calls_are_generations_and_failures_are_errors() -> None:
    generation = {
        "column": "type",
        "operator": "any of",
        "value": ["GENERATION"],
        "type": "stringOptions",
    }
    error = {
        "column": "level",
        "operator": "any of",
        "value": ["ERROR"],
        "type": "stringOptions",
    }
    for d in dashboards():
        for w in d["widgets"]:
            title = w["name"].lower()
            if "model call" in title or "latency" in title or "tokens" in title:
                assert generation in w["filters"], (d["key"], w["key"])
            assert (error in w["filters"]) == title.startswith("failed"), (
                d["key"],
                w["key"],
            )


def ceilings() -> list[str]:
    """prod's day and month ceilings and its fallback sub-budget, from config/budgets.yaml, as "$5.00"."""
    text = BUDGETS.read_text(encoding="utf-8")
    prod = text[text.index("\n  prod:") : text.index("\n  dev:")]
    found = []
    for key in ("daily_usd", "monthly_usd", "fallback_daily_usd"):
        (value,) = re.findall(rf"\n\s+{key}: ([0-9.]+)", prod)
        found.append(f"${float(value):.2f}")
    return found


def grafana_titles() -> set[str]:
    def walk(panels: list[dict[str, Any]]) -> set[str]:
        titles: set[str] = set()
        for p in panels:
            titles.add(p.get("title", ""))
            titles |= walk(p.get("panels", []))
        return titles

    return walk(json.loads(GRAFANA.read_text(encoding="utf-8"))["panels"])


def test_spend_widgets_name_the_ceilings_and_grafanas_spend_row() -> None:
    # FR-014: the cost is the gateway's price; the meter and its ceilings are Grafana's "Spend" row.
    assert ceilings() == ["$5.00", "$20.00", "$2.00"]  # not vacuous: the file parses
    for d in dashboards():
        for w in d["widgets"]:
            if w["metric"]["measure"] != "totalCost":
                continue
            text = w["description"]
            assert all(c in text for c in ceilings()), (d["key"], w["key"])
            assert "config/budgets.yaml" in text and 'Grafana\'s "Spend" row' in text, (
                d["key"],
                w["key"],
            )
            assert "0 for local" in text, (d["key"], w["key"])


def test_every_grafana_panel_a_description_names_exists() -> None:
    titles = grafana_titles()
    named = [
        (d["key"], w["key"], t)
        for d in dashboards()
        for w in d["widgets"]
        for t in re.findall(r"Grafana's \"([^\"]+)\"", w["description"])
    ]
    assert named  # not vacuous
    assert [n for n in named if n[2] not in titles] == []


def test_every_description_says_its_unit() -> None:
    for d in dashboards():
        for w in d["widgets"]:
            unit = {
                "totalCost": "USD",
                "latency": "milliseconds",
                "count": "calls",
            }.get(w["metric"]["measure"], "tokens")
            assert unit in w["description"], (d["key"], w["key"])


@pytest.mark.parametrize(
    ("change", "words"),
    [
        ({"view": "traces"}, "view"),
        ({"metric": {"measure": "input", "agg": "count"}}, "measure"),
        ({"metric": {"measure": "totalCost", "agg": "median"}}, "aggregation"),
        ({"dimensions": ["metadata"]}, "dimension"),
        ({"dimensions": ["userId"]}, "dimension"),
        ({"dimensions": ["sessionId"]}, "dimension"),
        (
            {
                "filters": [
                    {
                        "column": "output",
                        "operator": "=",
                        "value": "x",
                        "type": "string",
                    }
                ]
            },
            "filter",
        ),
        (
            {
                "filters": [
                    {
                        "column": "metadata",
                        "operator": "=",
                        "value": "x",
                        "type": "stringObject",
                        "key": "k",
                    }
                ]
            },
            "filter",
        ),
        ({"dimensions": ["providedModelName", "traceName"]}, "dimension"),
        (
            {"chartType": "SPARKLINE", "chartConfig": {"type": "SPARKLINE"}},
            "chart type",
        ),
        ({"chartConfig": {"type": "LINE_TIME_SERIES"}}, "chartConfig"),
        ({"place": {"x": 8, "y": 0, "w": 6, "h": 5}}, "grid"),
        ({"place": {"x": 0, "y": -1, "w": 6, "h": 5}}, "grid"),
        ({"key": "Bad Key"}, "key"),
        ({"dimensions": ["traceId"]}, "traceId"),
        ({"metrics": [{"measure": "count", "agg": "count"}]}, "unknown"),
    ],
)
def test_the_validator_refuses(change: dict[str, Any], words: str) -> None:
    # FR-002: aggregates of non-payload fields only; one metric; the grid; keys.
    with pytest.raises(ld.DefinitionError, match=words):
        ld.validate_dashboard(board(widget(**change)), "b.json")


def test_the_validator_refuses_overlaps_duplicates_and_a_wrong_schema() -> None:
    a = widget(key="a")
    b = widget(key="b", place={"x": 3, "y": 2, "w": 6, "h": 5})
    with pytest.raises(ld.DefinitionError, match="overlap"):
        ld.validate_dashboard(board(a, b), "b.json")
    with pytest.raises(ld.DefinitionError, match="twice"):
        ld.validate_dashboard(
            board(a, widget(key="a", place={"x": 6, "y": 0, "w": 6, "h": 5})), "b.json"
        )
    with pytest.raises(ld.DefinitionError, match="schema"):
        ld.validate_dashboard(board(a, schema=2), "b.json")


def test_a_pivot_may_group_by_trace_with_its_top_n() -> None:
    pivot = widget(
        dimensions=["traceId"],
        chartType="PIVOT_TABLE",
        chartConfig={
            "type": "PIVOT_TABLE",
            "row_limit": 20,
            "defaultSort": {"column": "sum_totalCost", "order": "DESC"},
        },
    )
    ld.validate_dashboard(board(pivot), "b.json")
    no_limit = dict(pivot, chartConfig={"type": "PIVOT_TABLE"})
    with pytest.raises(ld.DefinitionError, match="traceId"):
        ld.validate_dashboard(board(no_limit), "b.json")


def test_two_files_with_one_key_are_refused(tmp_path: Path) -> None:
    for name in ("one.json", "two.json"):
        (tmp_path / name).write_text(json.dumps(board()))
    with pytest.raises(ld.DefinitionError, match="twice"):
        ld.load_definitions(tmp_path)


def test_a_file_that_isnt_json_names_itself(tmp_path: Path) -> None:
    (tmp_path / "broken.json").write_text("{")
    with pytest.raises(ld.DefinitionError, match="broken.json"):
        ld.load_definitions(tmp_path)


# --- The bodies and the mark (FR-006; plan D4) -----------------------------------------------------------------------


def test_a_widgets_body_is_langfuses_shape_with_the_mark_last() -> None:
    d = dashboards()[0]
    w = d["widgets"][4]
    body = ld.widget_body(d, w)
    assert body == {
        "name": w["name"],
        "description": body["description"],
        "view": "observations",
        "dimensions": [{"field": "providedModelName"}],
        "metrics": [{"measure": "totalCost", "agg": "sum"}],
        "filters": w["filters"],
        "chartType": "BAR_TIME_SERIES",
        "chartConfig": {"type": "BAR_TIME_SERIES"},
    }
    assert body["description"].startswith(w["description"])
    assert body["description"].endswith("[h4 model-calls/spend-by-model]")
    assert "deploy/langfuse/dashboards/model-calls.json" in body["description"]
    assert ld.MARK_RE.search(body["description"]).groups() == (
        "model-calls",
        "spend-by-model",
    )


def test_a_dashboards_body_places_each_widget_by_its_id() -> None:
    d = dashboards()[1]
    ids = {w["key"]: f"id-{w['key']}" for w in d["widgets"]}
    body = ld.dashboard_body(d, ids)
    assert body["name"] == "h4 · Traces"
    assert body["description"].endswith("[h4 traces]")
    assert body["definition"]["widgets"][0] == {
        "id": "h4-traces-costliest",
        "type": "widget",
        "widgetId": "id-costliest",
        "x": 0,
        "y": 0,
        "x_size": 6,
        "y_size": 6,
    }
    assert len(body["definition"]["widgets"]) == 7


# --- The metrics checks (plan D3.2) ---------------------------------------------------------------------------------


def test_a_time_series_is_checked_with_its_time_dimension() -> None:
    d = dashboards()[0]
    w = next(w for w in d["widgets"] if w["key"] == "latency-p95-by-model")
    end = datetime(2026, 11, 22, 12, tzinfo=UTC)
    q = ld.metrics_query(w, end - timedelta(days=7), end)
    assert q == {
        "view": "observations",
        "dimensions": [{"field": "providedModelName"}],
        "metrics": [{"measure": "latency", "aggregation": "p95"}],
        "filters": w["filters"],
        "timeDimension": {"granularity": "auto"},
        "fromTimestamp": "2026-11-15T12:00:00Z",
        "toTimestamp": "2026-11-22T12:00:00Z",
    }


def test_a_top_n_is_checked_with_its_limit_and_order_and_no_time() -> None:
    w = next(w for w in dashboards()[1]["widgets"] if w["key"] == "costliest")
    end = datetime(2026, 11, 22, tzinfo=UTC)
    q = ld.metrics_query(w, end - timedelta(days=7), end)
    assert "timeDimension" not in q
    assert q["config"] == {"row_limit": 20}
    assert q["orderBy"] == [{"field": "sum_totalCost", "direction": "desc"}]


def test_a_histogram_is_checked_as_a_p50_of_its_measure() -> None:
    w = next(w for w in dashboards()[1]["widgets"] if w["key"] == "latency-spread")
    end = datetime(2026, 11, 22, tzinfo=UTC)
    q = ld.metrics_query(w, end - timedelta(days=7), end)
    assert q["metrics"] == [{"measure": "latency", "aggregation": "p50"}]
    assert "timeDimension" not in q and q["dimensions"] == []


# --- The API description (plan D3.1) --------------------------------------------------------------------------------


def test_the_yaml_reader_finds_every_operation() -> None:
    ops = ld.api_operations(SPEC_YAML)
    assert ("PATCH", "/api/public/unstable/dashboard-widgets/{}") in ops
    assert ("DELETE", "/api/public/unstable/dashboards/{}") in ops
    assert ("GET", "/api/public/v2/metrics") in ops
    assert ("GET", "/api/public/unstable/dashboard-widgets") in ops
    assert all(
        m in ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS")
        for m, _ in ops
    )


def test_the_json_reader_finds_the_same() -> None:
    as_json = json.dumps(
        {
            "openapi": "3.0.1",
            "paths": {
                "/api/public/unstable/dashboards/{id}": {
                    "get": {},
                    "put": {},
                    "parameters": [],
                },
            },
        }
    )
    assert ld.api_operations(as_json) == {
        ("GET", "/api/public/unstable/dashboards/{}"),
        ("PUT", "/api/public/unstable/dashboards/{}"),
    }


def test_check_api_names_what_is_missing_and_picks_the_update_method() -> None:
    missing, methods = ld.check_api(SPEC_YAML)
    assert missing == [] and methods == {"widget": "PATCH", "dashboard": "PATCH"}
    put = SPEC_YAML.replace(
        "    patch:\n      operationId: unstable_dashboardWidgets_update",
        "    put:\n      operationId: x",
    )
    assert ld.check_api(put) == ([], {"widget": "PUT", "dashboard": "PATCH"})
    gone = SPEC_YAML.replace(
        "  /api/public/v2/metrics:\n    get:\n      operationId: metricsV2_metrics\n",
        "",
    )
    assert ld.check_api(gone)[0] == ["GET /api/public/v2/metrics"]
    no_size = SPEC_YAML.replace("x_size", "width")
    assert ld.check_api(no_size)[0] == ["the field x_size"]


# --- The env file (FR-003, FR-008) ----------------------------------------------------------------------------------


def test_the_env_file_gives_three_values(tmp_path: Path) -> None:
    got = ld.read_env(env_file(tmp_path, 18101))
    assert (got.public_key, got.secret_key, got.port) == (PUBLIC, SECRET, 18101)


@pytest.mark.parametrize(
    ("over", "words"),
    [
        ({"LANGFUSE_SECRET_KEY": ""}, "LANGFUSE_SECRET_KEY"),
        ({"LANGFUSE_PUBLIC_KEY": "__GENERATE__"}, "LANGFUSE_PUBLIC_KEY"),
        ({"H4_LANGFUSE_PORT": "80"}, "H4_LANGFUSE_PORT"),
        ({"H4_LANGFUSE_PORT": "a-port"}, "H4_LANGFUSE_PORT"),
    ],
)
def test_the_env_file_problems_name_the_key_never_a_value(
    tmp_path: Path, over: dict[str, str], words: str
) -> None:
    with pytest.raises(ld.EnvProblem) as caught:
        ld.read_env(env_file(tmp_path, 18101, **over))
    assert words in str(caught.value)
    assert SECRET not in str(caught.value) and PUBLIC not in str(caught.value)


def test_single_quotes_are_the_env_files_grammar(tmp_path: Path) -> None:
    path = env_file(tmp_path, 18101, LANGFUSE_SECRET_KEY=f"'{SECRET}'")
    assert ld.read_env(path).secret_key == SECRET


def test_a_missing_env_file_is_exit_2(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = ld.main(["--stack", "dev", "--env-file", str(tmp_path / "nowhere.env")])
    assert code == 2
    assert "nowhere.env" in capsys.readouterr().err


# --- The plan (FR-004 to FR-006) ------------------------------------------------------------------------------------


def test_the_plan_creates_everything_on_an_empty_project() -> None:
    plan = ld.make_plan(dashboards(), [], [])
    assert [a.kind for a in plan.widgets] == ["create"] * 17
    assert [a.kind for a in plan.dashboards] == ["create", "create"]
    assert plan.deletions == []


def test_the_plan_keeps_updates_deletes_and_leaves_unmarked_objects_alone() -> None:
    d = dashboards()
    same = {"id": "w1", **ld.widget_body(d[0], d[0]["widgets"][0])}
    changed = {
        "id": "w2",
        **ld.widget_body(d[0], d[0]["widgets"][1]),
        "name": "Edited in the UI",
    }
    stale = {"id": "w3", "name": "Gone", "description": "x\n\n[h4 model-calls/gone]"}
    mine = {"id": "w4", "name": "The Author's own", "description": "no mark"}
    twin = {
        "id": "w5",
        **ld.widget_body(d[0], d[0]["widgets"][0]),
    }  # a second object with one mark
    plan = ld.make_plan(d, [same, changed, stale, mine, twin], [])
    kinds = {(a.kind, a.mark): a.id for a in plan.widgets + plan.deletions}
    assert kinds[("keep", "model-calls/spend")] == "w1"
    assert kinds[("update", "model-calls/calls")] == "w2"
    assert kinds[("delete", "model-calls/gone")] == "w3"
    assert kinds[("delete", "model-calls/spend")] == "w5"
    assert "w4" not in {a.id for a in plan.widgets + plan.deletions}


def test_a_dashboard_with_its_layout_is_kept_and_one_moved_is_updated() -> None:
    d = dashboards()
    ids = {w["key"]: f"w-{w['key']}" for w in d[1]["widgets"]}
    found = [
        {"id": f"w-{w['key']}", **ld.widget_body(d[1], w)} for w in d[1]["widgets"]
    ]
    body = ld.dashboard_body(d[1], ids)
    plan = ld.make_plan([d[1]], found, [{"id": "d1", **body}])
    assert [(a.kind, a.id) for a in plan.dashboards] == [("keep", "d1")]
    moved = json.loads(json.dumps(body))
    moved["definition"]["widgets"][0]["x"] = 3
    plan = ld.make_plan([d[1]], found, [{"id": "d1", **moved}])
    assert [(a.kind, a.id) for a in plan.dashboards] == [("update", "d1")]


def test_fields_langfuse_adds_dont_count_as_a_change() -> None:
    d = dashboards()[0]
    w = d["widgets"][0]
    found = {
        "id": "w1",
        "owner": "PROJECT",
        "createdAt": "2026-11-22T00:00:00Z",
        **ld.widget_body(d, w),
    }
    found["chartConfig"] = {**found["chartConfig"], "show_value_labels": False}
    found["filters"] = [{**f, "key": None} for f in found["filters"]]
    plan = ld.make_plan([d], [found], [])
    assert next(a for a in plan.widgets if a.id == "w1").kind == "keep"


# --- Runs against the stand-in (SC-001, SC-002, SC-003; FR-007, FR-009, FR-012) --------------------------------------


def test_a_read_only_run_checks_plans_and_writes_nothing(
    standin: StandIn, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out = run(standin, tmp_path, capsys=capsys)
    assert code == 0, out
    assert standin.writes() == []
    assert out.count("ok ") >= 17 and "FAIL" not in out
    assert out.count("create widget") == 17 and out.count("create dashboard") == 2
    assert "Read-only: nothing was written." in out
    assert "make langfuse-dashboards ENV=dev APPLY=1" in out


def test_apply_makes_seventeen_widgets_and_two_dashboards_then_nothing(
    standin: StandIn,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    no_waits: list[float],
) -> None:
    code, out = run(standin, tmp_path, "--apply", capsys=capsys)
    assert code == 0, out
    assert len(standin.managed(standin.widgets)) == 17
    assert len(standin.managed(standin.dashboards)) == 2
    # Widgets first, a wait, then the dashboards (FR-007; research R-3).
    order = [p for m, p in standin.writes()]
    assert all(p.endswith("dashboard-widgets") for p in order[:17])
    assert all(p.endswith("/dashboards") for p in order[17:])
    assert 6 in no_waits
    # Every placement names a widget the stand-in holds.
    for d in standin.dashboards.values():
        assert {p["widgetId"] for p in d["definition"]["widgets"]} <= set(
            standin.widgets
        )
    for did in standin.dashboards:
        assert (
            f"http://localhost:{standin.server.server_address[1]}/project/h4reet-dev/dashboards/{did}"
            in out
        )
    before = len(standin.requests)
    code, out = run(standin, tmp_path, "--apply", capsys=capsys)
    assert code == 0, out
    assert [r for r in standin.requests[before:] if r[0] != "GET"] == []
    assert "nothing to write" in out


def test_apply_puts_an_edited_widget_back_and_removes_a_stale_one(
    standin: StandIn, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run(standin, tmp_path, "--apply", capsys=capsys)
    edited = next(
        w
        for w in standin.widgets.values()
        if w["description"].endswith("[h4 traces/slowest]")
    )
    edited["name"] = "Renamed in the UI"
    standin.widgets["w900"] = {
        "id": "w900",
        "name": "Old",
        "description": "x\n\n[h4 traces/old]",
    }
    standin.widgets["w901"] = {"id": "w901", "name": "Mine", "description": "his own"}
    standin.dashboards["d900"] = {
        "id": "d900",
        "name": "Old",
        "description": "[h4 old]",
        "definition": {"widgets": []},
    }
    code, out = run(standin, tmp_path, "--apply", capsys=capsys)
    assert code == 0, out
    assert edited["name"] == "The slowest traces"
    assert "w900" not in standin.widgets and "d900" not in standin.dashboards
    assert "w901" in standin.widgets
    deletes = [p for m, p in standin.writes() if m == "DELETE"]
    assert deletes == [f"{PREFIX}/dashboards/d900", f"{PREFIX}/dashboard-widgets/w900"]


def test_a_missing_operation_stops_the_run_before_any_write(
    standin: StandIn, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert standin.spec
    standin.spec = standin.spec.replace(
        "    delete:\n      operationId: unstable_dashboards_delete\n", ""
    )
    code, out = run(standin, tmp_path, "--apply", capsys=capsys)
    assert code == 1
    assert "DELETE /api/public/unstable/dashboards/{}" in out
    assert standin.writes() == []


def test_a_missing_field_stops_the_run_before_any_write(
    standin: StandIn, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert standin.spec
    standin.spec = standin.spec.replace("defaultSort", "sort")
    code, out = run(standin, tmp_path, "--apply", capsys=capsys)
    assert code == 1 and "defaultSort" in out
    assert standin.writes() == []


def test_no_api_description_is_a_failure_not_a_guess(
    standin: StandIn, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    standin.spec = None
    code, out = run(standin, tmp_path, "--apply", capsys=capsys)
    assert code == 1 and "API description" in out
    assert standin.writes() == []


def test_a_refused_query_names_the_widget_and_writes_nothing(
    standin: StandIn, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    standin.refuse_measure = "totalTokens"
    code, out = run(standin, tmp_path, "--apply", capsys=capsys)
    assert code == 1
    assert re.search(
        r"FAIL\s+model-calls/tokens-by-model.*Invalid measure totalTokens", out
    )
    assert standin.writes() == []


def test_a_429_waits_as_retry_after_says(
    standin: StandIn,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    no_waits: list[float],
) -> None:
    standin.throttle, standin.retry_after = 2, "7"
    code, out = run(standin, tmp_path, capsys=capsys)
    assert code == 0, out
    assert no_waits[:2] == [7, 7]


def test_retry_after_is_bounded_and_the_tries_too(
    standin: StandIn,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    no_waits: list[float],
) -> None:
    standin.throttle, standin.retry_after = 99, "3600"
    code, out = run(standin, tmp_path, capsys=capsys)
    assert code == 1
    assert no_waits == [60, 60, 60, 60]
    assert "429" in out


def test_a_dashboard_write_answered_404_is_tried_again(
    standin: StandIn,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    no_waits: list[float],
) -> None:
    standin.lag = 2
    code, out = run(standin, tmp_path, "--apply", capsys=capsys)
    assert code == 0, out
    assert no_waits.count(5) == 2
    assert len(standin.managed(standin.dashboards)) == 2


def test_the_lists_are_read_page_by_page(
    standin: StandIn, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run(standin, tmp_path, "--apply", capsys=capsys)
    before = len(standin.requests)
    code, out = run(standin, tmp_path, capsys=capsys)
    assert code == 0 and "create" not in out
    pages = [
        q.get("page")
        for m, p, q, _ in standin.requests[before:]
        if p == f"{PREFIX}/dashboard-widgets"
    ]
    assert pages == ["1", "2", "3", "4", "5"]  # 17 widgets, 4 a page


def test_a_list_without_descriptions_reads_each_widget(
    standin: StandIn, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run(standin, tmp_path, "--apply", capsys=capsys)
    standin.omit_descriptions = True
    before = len(standin.requests)
    code, out = run(standin, tmp_path, "--apply", capsys=capsys)
    assert code == 0, out
    assert [r for r in standin.requests[before:] if r[0] != "GET"] == []
    single = [
        p
        for m, p, _, _ in standin.requests[before:]
        if re.fullmatch(rf"{PREFIX}/dashboard-widgets/w\d+", p)
    ]
    assert len(single) == 17


def test_no_answer_is_exit_4(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    s = StandIn()
    port = s.start()
    s.stop()  # nothing listens there now
    code = ld.main(["--stack", "dev", "--env-file", str(env_file(tmp_path, port))])
    out = capsys.readouterr()
    assert code == 4
    assert f"http://127.0.0.1:{port}" in out.err and "didn't answer" in out.err


def test_a_refused_answer_is_trimmed_and_its_control_characters_replaced() -> None:
    long = json.dumps({"message": "\x1b[31mred\x1b[0m " + "x" * 600}).encode()
    text = ld.refusal_text(long)
    assert len(text) <= 300 and "\x1b" not in text and text.startswith("?[31mred")


def test_the_requests_carry_no_proxy_and_follow_no_redirect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("http_proxy", "http://127.0.0.1:9")
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:9")
    opener = ld.opener()
    handlers = {type(h).__name__ for h in opener.handlers}
    assert "ProxyHandler" in handlers
    proxy = next(h for h in opener.handlers if type(h).__name__ == "ProxyHandler")
    assert proxy.proxies == {}
    assert "NoRedirect" in handlers


# --- The recipe (FR-010) --------------------------------------------------------------------------------------------


def test_the_recipe_needs_no_env_file_and_names_every_widget(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert ld.main(["--recipe"]) == 0
    out = capsys.readouterr().out
    for d in dashboards():
        assert f"## {d['name']}" in out
        for w in d["widgets"]:
            assert f"### {w['name']}" in out
    assert "type any of GENERATION" in out and "level any of ERROR" in out
    assert (
        "PIVOT_TABLE" in out and "rows: 20" in out and "x 0, y 0, 3 wide, 3 high" in out
    )


# --- The make target (FR-011) ---------------------------------------------------------------------------------------


MAKE_TEXT = MAKEFILE.read_text(encoding="utf-8")


def test_the_target_is_the_authors_and_passes_the_env_file() -> None:
    (line,) = [
        ln for ln in MAKE_TEXT.splitlines() if ln.startswith("langfuse-dashboards:")
    ]
    assert "## (the Author)" in line and "APPLY=1" in line
    recipe = MAKE_TEXT.split(line, 1)[1].split("\n\n", 1)[0]
    assert "$(call AUTHOR_ONLY," in recipe
    assert (
        "scripts/langfuse_dashboards.py --stack $(ENV) --env-file $(ENVFILE)" in recipe
    )
    assert re.search(r"^LITERAL_VARS := .*\bAPPLY\b", MAKE_TEXT, re.MULTILINE)


@pytest.mark.skipif(shutil.which("make") is None, reason="no make")
def test_the_target_refuses_in_the_sandbox_and_a_bad_apply() -> None:
    env = {
        k: v
        for k, v in os.environ.items()
        if k not in ("ENV", "APPLY", "MAKEFLAGS", "MFLAGS")
    }
    sandbox = subprocess.run(
        [
            "make",
            "-f",
            "Makefile",
            "--no-print-directory",
            "langfuse-dashboards",
            "ENV=dev-cpu",
        ],
        cwd=REPO,
        env={**env, "SANDBOX_RUNTIME": "1"},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert sandbox.returncode == 2
    assert "make langfuse-dashboards is the Author's" in sandbox.stderr
    outside = {k: v for k, v in env.items() if k != "SANDBOX_RUNTIME"}
    bad = subprocess.run(
        [
            "make",
            "-f",
            "Makefile",
            "--no-print-directory",
            "langfuse-dashboards",
            "ENV=dev-cpu",
            "APPLY=yes",
        ],
        cwd=REPO,
        env=outside,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert bad.returncode == 2
    assert "APPLY is 1 or unset" in bad.stderr


# --- The runbook (FR-015) and the disclosure (FR-016) ---------------------------------------------------------------


RUNBOOK = REPO / "docs" / "runbooks" / "langfuse-dashboards.md"


def test_the_runbook_says_how_to_apply_read_change_and_remove_them() -> None:
    text = RUNBOOK.read_text(encoding="utf-8")
    headings = re.findall(r"^## (\w+)", text, re.MULTILINE)
    assert headings == ["Symptoms", "Impact", "Act", "Verify", "Undo", "Record"]
    for words in (
        "make langfuse-dashboards ENV=dev",
        "APPLY=1",
        "--recipe",
        "deploy/langfuse/dashboards/",
        "[h4 ",
        "Grafana",
    ):
        assert words in text, words
    index = (REPO / "docs" / "runbooks" / "README.md").read_text(encoding="utf-8")
    assert "](langfuse-dashboards.md)" in index


def test_the_disclosure_names_the_command_on_x001() -> None:
    text = (REPO / "docs" / "data-flow-disclosure.md").read_text(encoding="utf-8")
    (s9,) = [ln for ln in text.splitlines() if ln.startswith("| S9 |")]
    assert "make langfuse-dashboards" in s9
