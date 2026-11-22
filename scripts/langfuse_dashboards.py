#!/usr/bin/env python3
"""The Langfuse dashboards, as code (spec 034; docs/runbooks/langfuse-dashboards.md).

    python3 -I -B -X pycache_prefix=/dev/null scripts/langfuse_dashboards.py --stack prod|dev|dev-cpu --env-file PATH [--apply]
    python3 -I -B -X pycache_prefix=/dev/null scripts/langfuse_dashboards.py --recipe

    make langfuse-dashboards ENV=prod|dev|dev-cpu [APPLY=1]       (the Author's)

It reads the dashboards in deploy/langfuse/dashboards/, one JSON file each, and holds every widget to aggregates of
fields that carry no payload and no client identifier (FR-002). Then, against the stack's own Langfuse on 127.0.0.1:

  1. it reads the instance's own API description and checks that it lists every operation and field name this command
     uses, since Langfuse marks its dashboard endpoints unstable (spec 034, research R-1);
  2. it runs each widget's query, read-only, through Langfuse's Metrics API v2 over the last 7 days;
  3. it reads the widgets and dashboards there, and prints the plan: what it would create, update, keep, and delete.

Without --apply it stops there and writes nothing. With --apply, and only when every check passed, it creates and
updates the widgets, then the dashboards with their layouts, then deletes the managed dashboards and widgets no file
names. It manages only what ends its description with its mark, "[h4 <dashboard>]" or "[h4 <dashboard>/<widget>]", so
anything made by hand in Langfuse without the mark is never touched.

From the env file it reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and H4_LANGFUSE_PORT, and nothing else; it prints
no key and no value. It calls http://127.0.0.1:<H4_LANGFUSE_PORT> only (edge's x001), with no proxy and no redirect
followed. --recipe prints the same dashboards as steps for Langfuse's UI, with no env file and no network.

Standard library only, run by path through PY_HOST and never with -m (spec 000's research R-35), as hello.py is.

Exit codes: 0 every check passed (and, with --apply, every write); 1 a check failed or Langfuse refused a request,
with Langfuse's answer; 2 usage, the dashboards' files, or the env file; 4 Langfuse didn't answer. On a failure the
last line names the code and its meaning, because make reports every failure as its own error 2.
"""

from __future__ import annotations

import argparse
import base64
import http.client
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, TextIO

ROOT = Path(__file__).resolve().parents[1]
DASHBOARDS_DIR = ROOT / "deploy" / "langfuse" / "dashboards"
FILES_SHOWN = "deploy/langfuse/dashboards"
STACKS = ("prod", "dev", "dev-cpu")
HOST = "127.0.0.1"  # a literal address, never looked up

# Langfuse's endpoints (spec 034, research R-1, R-2, R-4).
UNSTABLE = "/api/public/unstable"
WIDGETS = f"{UNSTABLE}/dashboard-widgets"
DASHBOARDS = f"{UNSTABLE}/dashboards"
METRICS = "/api/public/v2/metrics"
API_DESCRIPTIONS = ("/api/openapi.yaml", "/generated/api/openapi.yml")
# The operations the command uses, as the instance's API description must list them (path parameters as {}).
REQUIRED_OPERATIONS = (
    ("GET", WIDGETS),
    ("POST", WIDGETS),
    ("GET", f"{WIDGETS}/{{}}"),
    ("DELETE", f"{WIDGETS}/{{}}"),
    ("GET", DASHBOARDS),
    ("POST", DASHBOARDS),
    ("GET", f"{DASHBOARDS}/{{}}"),
    ("DELETE", f"{DASHBOARDS}/{{}}"),
    ("GET", METRICS),
)
# An update is whichever of these the description lists, the first first.
UPDATE_METHODS = ("PATCH", "PUT")
# The field names the command sends, each of which the description must name somewhere.
REQUIRED_FIELDS = (
    "chartType",
    "chartConfig",
    "dimensions",
    "metrics",
    "filters",
    "definition",
    "widgetId",
    "x_size",
    "y_size",
    "row_limit",
    "defaultSort",
    "bins",
)

TIMEOUT_S = 30
MAX_BODY = 8 * 1024 * 1024
CHECK_DAYS = 7
TRIES_429 = 5  # tries a request, the first included (FR-007)
RETRY_AFTER_MAX_S = 60
CREATED_WAIT_S = 6  # after creating widgets, before placing them (research R-3)
LAG_TRIES = 3  # a dashboard write answered 404 is tried again this many times
LAG_WAIT_S = 5
PAGE_LIMIT = 100
MAX_PAGES = 50
REFUSAL_CHARS = 300
SHOWN_CHARS = 120  # a name or an ID from Langfuse, as printed
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def _sleep(seconds: float) -> None:
    time.sleep(seconds)


def _now() -> datetime:
    return datetime.now(UTC)


# Every wait goes through SLEEP, and the clock through NOW; the tests replace both.
SLEEP: Callable[[float], None] = _sleep
NOW: Callable[[], datetime] = _now

# --- The files (FR-001, FR-002) -------------------------------------------------------------------------------------

VIEWS = ("observations",)
# Aggregates of fields that carry no payload: never input, output, or metadata (FR-002).
MEASURES = (
    "count",
    "latency",
    "totalCost",
    "inputCost",
    "outputCost",
    "totalTokens",
    "inputTokens",
    "outputTokens",
)
AGGREGATIONS = (
    "sum",
    "avg",
    "count",
    "max",
    "min",
    "p50",
    "p75",
    "p90",
    "p95",
    "p99",
    "histogram",
    "uniq",
)
# Fields a widget may group or filter by: none is a payload, a user, or a session (telemetry.md §1, rules 1 and 3).
FIELDS = (
    "providedModelName",
    "traceName",
    "traceId",
    "name",
    "type",
    "level",
    "environment",
)
FILTER_TYPES = ("string", "stringOptions", "number", "boolean")
CHART_TYPES = (
    "LINE_TIME_SERIES",
    "AREA_TIME_SERIES",
    "BAR_TIME_SERIES",
    "HORIZONTAL_BAR",
    "VERTICAL_BAR",
    "PIE",
    "NUMBER",
    "HISTOGRAM",
    "PIVOT_TABLE",
)
TIME_SERIES = ("LINE_TIME_SERIES", "AREA_TIME_SERIES", "BAR_TIME_SERIES")
GRID_COLUMNS = 12
KEY_RE = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?")
MARK_RE = re.compile(r"\[h4 ([a-z0-9-]+)(?:/([a-z0-9-]+))?\]\s*$")
DASHBOARD_FIELDS = {"schema", "key", "name", "description", "widgets"}
WIDGET_FIELDS = {
    "key",
    "name",
    "description",
    "view",
    "metric",
    "dimensions",
    "filters",
    "chartType",
    "chartConfig",
    "place",
}
FILTER_FIELDS = {"column", "operator", "value", "type"}
CHART_CONFIG_FIELDS = {"type", "row_limit", "bins", "show_value_labels", "defaultSort"}


class DefinitionError(Exception):
    """A dashboard file the command refuses, before any call."""


def _text(value: Any, where: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise DefinitionError(f"{where} must be text of 1 to {limit} characters")
    return value


def _validate_filter(f: Any, where: str) -> None:
    if not isinstance(f, dict):
        raise DefinitionError(f"{where}: a filter is an object")
    unknown = set(f) - FILTER_FIELDS
    if unknown:
        raise DefinitionError(
            f"{where}: filter fields {sorted(unknown)} aren't allowed (no metadata keys)"
        )
    if f.get("column") not in FIELDS:
        raise DefinitionError(
            f"{where}: filter column {f.get('column')!r} isn't one of {', '.join(FIELDS)}"
        )
    if f.get("type") not in FILTER_TYPES:
        raise DefinitionError(
            f"{where}: filter type {f.get('type')!r} isn't one of {', '.join(FILTER_TYPES)}"
        )
    if not isinstance(f.get("operator"), str) or "value" not in f:
        raise DefinitionError(f"{where}: a filter has an operator and a value")
    if f["type"] == "stringOptions" and not (
        isinstance(f["value"], list)
        and f["value"]
        and all(isinstance(v, str) for v in f["value"])
    ):
        raise DefinitionError(
            f"{where}: a stringOptions filter's value is a list of text"
        )


def _validate_widget(w: Any, where: str) -> dict[str, Any]:
    if not isinstance(w, dict):
        raise DefinitionError(f"{where}: a widget is an object")
    unknown = set(w) - WIDGET_FIELDS
    if unknown:
        raise DefinitionError(f"{where}: unknown fields {sorted(unknown)}")
    missing = WIDGET_FIELDS - set(w) - {"chartConfig"}
    if missing:
        raise DefinitionError(f"{where}: missing fields {sorted(missing)}")
    if not isinstance(w["key"], str) or not KEY_RE.fullmatch(w["key"]):
        raise DefinitionError(
            f"{where}: key {w['key']!r} isn't 1 to 40 of a-z, 0-9, and -"
        )
    where = f"{where.rsplit(' ', 1)[0]} {w['key']}"
    _text(w["name"], f"{where}: name", 100)
    _text(w["description"], f"{where}: description", 800)
    if w["view"] not in VIEWS:
        raise DefinitionError(
            f"{where}: view {w['view']!r} isn't one of {', '.join(VIEWS)}"
        )
    metric = w["metric"]
    if not isinstance(metric, dict) or set(metric) != {"measure", "agg"}:
        raise DefinitionError(
            f"{where}: metric is one {{measure, agg}}: Langfuse draws only the first"
        )
    if metric["measure"] not in MEASURES:
        raise DefinitionError(
            f"{where}: measure {metric['measure']!r} isn't one of {', '.join(MEASURES)}"
        )
    if metric["agg"] not in AGGREGATIONS:
        raise DefinitionError(
            f"{where}: aggregation {metric['agg']!r} isn't one of {', '.join(AGGREGATIONS)}"
        )
    chart = w["chartType"]
    if chart not in CHART_TYPES:
        raise DefinitionError(
            f"{where}: chart type {chart!r} isn't one of {', '.join(CHART_TYPES)}"
        )
    dims = w["dimensions"]
    if not isinstance(dims, list) or any(d not in FIELDS for d in dims):
        raise DefinitionError(f"{where}: each dimension is one of {', '.join(FIELDS)}")
    if len(dims) > (2 if chart == "PIVOT_TABLE" else 1):
        raise DefinitionError(f"{where}: at most one dimension, two in a PIVOT_TABLE")
    config = w.get("chartConfig", {"type": chart})
    if (
        not isinstance(config, dict)
        or config.get("type") != chart
        or set(config) - CHART_CONFIG_FIELDS
    ):
        raise DefinitionError(
            f"{where}: chartConfig's type is the chart type, with only {sorted(CHART_CONFIG_FIELDS)}"
        )
    if "traceId" in dims and not (
        chart == "PIVOT_TABLE"
        and isinstance(config.get("row_limit"), int)
        and isinstance(config.get("defaultSort"), dict)
    ):
        raise DefinitionError(
            f"{where}: traceId groups only in a PIVOT_TABLE with a row_limit and a defaultSort (top-N)"
        )
    if not isinstance(w["filters"], list):
        raise DefinitionError(f"{where}: filters is a list")
    for f in w["filters"]:
        _validate_filter(f, where)
    place = w["place"]
    if (
        not isinstance(place, dict)
        or set(place) != {"x", "y", "w", "h"}
        or not all(
            isinstance(v, int) and not isinstance(v, bool) for v in place.values()
        )
        or place["x"] < 0
        or place["y"] < 0
        or place["w"] < 1
        or place["h"] < 1
        or place["x"] + place["w"] > GRID_COLUMNS
    ):
        raise DefinitionError(
            f"{where}: place is {{x, y, w, h}} inside the {GRID_COLUMNS}-column grid"
        )
    return {**w, "chartConfig": config}


def _overlap(a: dict[str, int], b: dict[str, int]) -> bool:
    return (
        a["x"] < b["x"] + b["w"]
        and b["x"] < a["x"] + a["w"]
        and a["y"] < b["y"] + b["h"]
        and b["y"] < a["y"] + a["h"]
    )


def validate_dashboard(data: Any, source: str) -> dict[str, Any]:
    """One file's dashboard, checked whole (FR-001, FR-002), with the file's name kept for the mark's sentence."""
    if not isinstance(data, dict):
        raise DefinitionError(f"{source}: a dashboard file holds one object")
    if data.get("schema") != 1:
        raise DefinitionError(f"{source}: schema is 1")
    unknown = set(data) - DASHBOARD_FIELDS
    missing = DASHBOARD_FIELDS - set(data)
    if unknown or missing:
        raise DefinitionError(
            f"{source}: unknown fields {sorted(unknown)}, missing {sorted(missing)}"
        )
    if not isinstance(data["key"], str) or not KEY_RE.fullmatch(data["key"]):
        raise DefinitionError(
            f"{source}: key {data['key']!r} isn't 1 to 40 of a-z, 0-9, and -"
        )
    _text(data["name"], f"{source}: name", 100)
    _text(data["description"], f"{source}: description", 800)
    if not isinstance(data["widgets"], list) or not data["widgets"]:
        raise DefinitionError(f"{source}: widgets is a list of at least one")
    widgets = [
        _validate_widget(w, f"{source}: widget {i}")
        for i, w in enumerate(data["widgets"])
    ]
    seen: set[str] = set()
    for w in widgets:
        if w["key"] in seen:
            raise DefinitionError(f"{source}: widget key {w['key']} appears twice")
        seen.add(w["key"])
    for i, a in enumerate(widgets):
        for b in widgets[i + 1 :]:
            if _overlap(a["place"], b["place"]):
                raise DefinitionError(
                    f"{source}: widgets {a['key']} and {b['key']} overlap on the grid"
                )
    return {**data, "widgets": widgets, "_file": source}


def load_definitions(directory: Path) -> list[dict[str, Any]]:
    """Every dashboard file in the folder, by file name, each checked (FR-001, FR-002)."""
    found: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, ValueError) as error:
            raise DefinitionError(
                f"{path.name}: can't be read as JSON ({type(error).__name__})"
            ) from None
        found.append(validate_dashboard(data, path.name))
    if not found:
        raise DefinitionError(f"{directory} holds no dashboard file")
    keys = [d["key"] for d in found]
    for key in keys:
        if keys.count(key) > 1:
            raise DefinitionError(f"dashboard key {key} appears twice")
    return found


# --- The bodies and the mark (FR-006; plan D4) ----------------------------------------------------------------------


def mark(dashboard_key: str, widget_key: str | None = None) -> str:
    return (
        f"[h4 {dashboard_key}/{widget_key}]" if widget_key else f"[h4 {dashboard_key}]"
    )


def _described(text: str, source: str, tag: str) -> str:
    return f"{text}\n\nManaged by {FILES_SHOWN}/{source}; make langfuse-dashboards puts it back. {tag}"


def widget_body(dashboard: dict[str, Any], widget: dict[str, Any]) -> dict[str, Any]:
    """The widget as Langfuse's dashboard-widgets endpoint takes it (research R-2)."""
    return {
        "name": widget["name"],
        "description": _described(
            widget["description"],
            dashboard["_file"],
            mark(dashboard["key"], widget["key"]),
        ),
        "view": widget["view"],
        "dimensions": [{"field": d} for d in widget["dimensions"]],
        "metrics": [
            {"measure": widget["metric"]["measure"], "agg": widget["metric"]["agg"]}
        ],
        "filters": widget["filters"],
        "chartType": widget["chartType"],
        "chartConfig": widget["chartConfig"],
    }


def placement_id(dashboard_key: str, widget_key: str) -> str:
    return f"h4-{dashboard_key}-{widget_key}"


def dashboard_body(
    dashboard: dict[str, Any], widget_ids: dict[str, str]
) -> dict[str, Any]:
    """The dashboard with its full layout, each widget placed by its Langfuse ID (research R-2's stored form)."""
    return {
        "name": dashboard["name"],
        "description": _described(
            dashboard["description"], dashboard["_file"], mark(dashboard["key"])
        ),
        "definition": {
            "widgets": [
                {
                    "id": placement_id(dashboard["key"], w["key"]),
                    "type": "widget",
                    "widgetId": widget_ids[w["key"]],
                    "x": w["place"]["x"],
                    "y": w["place"]["y"],
                    "x_size": w["place"]["w"],
                    "y_size": w["place"]["h"],
                }
                for w in dashboard["widgets"]
            ]
        },
    }


# --- The checks (plan D3) -------------------------------------------------------------------------------------------


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def metrics_query(
    widget: dict[str, Any], start: datetime, end: datetime
) -> dict[str, Any]:
    """The widget's query for the read-only Metrics API v2 (research R-4). A histogram is asked as a p50 of its measure:
    the check proves that Langfuse knows the view, the measure, the dimensions, and the filters."""
    measure, agg = widget["metric"]["measure"], widget["metric"]["agg"]
    query: dict[str, Any] = {
        "view": widget["view"],
        "dimensions": [{"field": d} for d in widget["dimensions"]],
        "metrics": [
            {"measure": measure, "aggregation": "p50" if agg == "histogram" else agg}
        ],
        "filters": widget["filters"],
    }
    if widget["chartType"] in TIME_SERIES:
        query["timeDimension"] = {"granularity": "auto"}
    query["fromTimestamp"] = _iso(start)
    query["toTimestamp"] = _iso(end)
    if widget["chartType"] == "PIVOT_TABLE" and "row_limit" in widget["chartConfig"]:
        query["orderBy"] = [{"field": f"{agg}_{measure}", "direction": "desc"}]
        query["config"] = {"row_limit": widget["chartConfig"]["row_limit"]}
    return query


METHODS = ("get", "put", "post", "patch", "delete", "head", "options")


def _normalized(path: str) -> str:
    return re.sub(r"\{[^}/]*\}", "{}", path)


def api_operations(text: str) -> set[tuple[str, str]]:
    """(METHOD, path) for each operation an OpenAPI description lists, its path parameters as {}. JSON is read as
    JSON; YAML by the `paths:` block's indentation, the path keys at its first level and the methods at the next."""
    ops: set[tuple[str, str]] = set()
    if text.lstrip().startswith("{"):
        try:
            paths = json.loads(text).get("paths", {})
        except (ValueError, AttributeError):
            return ops
        for path, item in paths.items() if isinstance(paths, dict) else []:
            for method in item if isinstance(item, dict) else []:
                if method.lower() in METHODS:
                    ops.add((method.upper(), _normalized(path)))
        return ops
    lines = text.splitlines()
    start = next(
        (i for i, line in enumerate(lines) if re.fullmatch(r"paths:\s*", line)), None
    )
    if start is None:
        return ops
    path_indent: int | None = None
    method_indent: int | None = None
    current: str | None = None
    for line in lines[start + 1 :]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent == 0:
            break
        if path_indent is None:
            path_indent = indent
        key = line.strip().split(":", 1)[0].strip().strip("'\"")
        if indent == path_indent:
            current, method_indent = key, None
            continue
        if current is None or indent < path_indent:
            continue
        if method_indent is None:
            method_indent = indent
        if indent == method_indent and key.lower() in METHODS:
            ops.add((key.upper(), _normalized(current)))
    return ops


def check_api(text: str) -> tuple[list[str], dict[str, str]]:
    """What the instance's API description lacks, and the update method it lists for widgets and dashboards."""
    ops = api_operations(text)
    missing = [f"{m} {p}" for m, p in REQUIRED_OPERATIONS if (m, p) not in ops]
    methods: dict[str, str] = {}
    for name, path in (
        ("widget", f"{WIDGETS}/{{}}"),
        ("dashboard", f"{DASHBOARDS}/{{}}"),
    ):
        found = next((m for m in UPDATE_METHODS if (m, path) in ops), None)
        if found is None:
            missing.append(f"{' or '.join(UPDATE_METHODS)} {path}")
        else:
            methods[name] = found
    missing += [
        f"the field {f}"
        for f in REQUIRED_FIELDS
        if not re.search(rf"\b{re.escape(f)}\b", text)
    ]
    return missing, methods


# --- The env file (FR-003, FR-008) ----------------------------------------------------------------------------------

WANTED = ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "H4_LANGFUSE_PORT")
PLACEHOLDERS = ("__GENERATE__", "__PARAMETER__")


class EnvProblem(Exception):
    """The env file can't give the three values; the message names a key, never a value."""


@dataclass(frozen=True)
class Settings:
    public_key: str
    secret_key: str
    port: int


def read_env(path: Path) -> Settings:
    """The three values, from KEY=VALUE data with the env files' grammar (contracts/env-files.md §1.1). Every other
    line is skipped unread."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        reason = getattr(error, "strerror", None) or type(error).__name__
        raise EnvProblem(f"{path} can't be read: {reason}") from None
    values: dict[str, str] = {}
    for line in text.splitlines():
        key, sep, value = line.rstrip("\r").partition("=")
        if not sep or key not in WANTED:
            continue
        if key in values:
            raise EnvProblem(f"{path}: {key} appears twice")
        if len(value) >= 2 and value[0] == value[-1] == "'":
            value = value[1:-1]
        values[key] = value
    for key in WANTED:
        if not values.get(key) or values[key] in PLACEHOLDERS:
            raise EnvProblem(f"{path}: {key} is missing, empty, or still a placeholder")
    port = values["H4_LANGFUSE_PORT"]
    if not port.isdigit() or not 1024 <= int(port) <= 65535:
        raise EnvProblem(f"{path}: H4_LANGFUSE_PORT isn't a port from 1024 to 65535")
    return Settings(
        values["LANGFUSE_PUBLIC_KEY"], values["LANGFUSE_SECRET_KEY"], int(port)
    )


# --- HTTP (plan D5) -------------------------------------------------------------------------------------------------


class Refused(Exception):
    def __init__(self, what: str, status: int, message: str) -> None:
        super().__init__(f"{what}: {status} {message}")
        self.what, self.status, self.message = what, status, message


class NoAnswer(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect is never followed: it comes back as the refusal it is."""

    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


def opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def refusal_text(raw: bytes) -> str:
    """Langfuse's answer to a refused request: its message, trimmed, its control characters replaced (FR-008)."""
    text = raw.decode("utf-8", errors="replace")
    try:
        body = json.loads(text)
    except ValueError:
        body = None
    if isinstance(body, dict):
        for key in ("message", "error"):
            if isinstance(body.get(key), str):
                text = body[key]
                break
    return shown(text, REFUSAL_CHARS)


def shown(value: object, limit: int = SHOWN_CHARS) -> str:
    """Text from Langfuse as the terminal may show it: its C0 and C1 control characters replaced, so no escape
    sequence it carries reaches the terminal (an OSC 52 sets the clipboard), and trimmed (FR-008; review F5)."""
    return CONTROL_RE.sub("?", str(value))[:limit]


def retry_after(value: str | None) -> float:
    try:
        seconds = float(value or "")
    except ValueError:
        return 1
    return min(seconds, RETRY_AFTER_MAX_S) if seconds >= 0 else 1


class Langfuse:
    """The stack's Langfuse, by its public API's basic authentication."""

    def __init__(self, base: str, public_key: str, secret_key: str) -> None:
        self.base = base
        token = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode("ascii")
        self._auth = f"Basic {token}"
        self._opener = opener()

    def call(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: Any = None,
        text: bool = False,
    ) -> Any:
        url = self.base + path + (f"?{urllib.parse.urlencode(query)}" if query else "")
        data = None if body is None else json.dumps(body).encode("utf-8")
        what = f"{method} {path}"
        for attempt in range(1, TRIES_429 + 1):
            request = urllib.request.Request(url, data=data, method=method)
            request.add_header("Authorization", self._auth)
            request.add_header("Accept", "application/json")
            if data is not None:
                request.add_header("Content-Type", "application/json")
            try:
                with self._opener.open(request, timeout=TIMEOUT_S) as response:
                    raw = response.read(MAX_BODY + 1)
            except urllib.error.HTTPError as error:
                try:
                    raw = error.read(MAX_BODY + 1)
                except (OSError, http.client.HTTPException):
                    raw = b""
                if error.code == 429 and attempt < TRIES_429:
                    SLEEP(retry_after(error.headers.get("Retry-After")))
                    continue
                raise Refused(what, error.code, refusal_text(raw)) from None
            except (urllib.error.URLError, OSError, http.client.HTTPException) as error:
                raise NoAnswer(f"{type(error).__name__}") from None
            if len(raw) > MAX_BODY:
                raise Refused(what, 200, f"an answer over {MAX_BODY} bytes")
            if text:
                return raw.decode("utf-8", errors="replace")
            try:
                return json.loads(raw) if raw else None
            except ValueError:
                raise Refused(what, 200, "an answer that isn't JSON") from None
        raise AssertionError("unreachable")  # pragma: no cover

    def list_all(self, path: str) -> list[dict[str, Any]]:
        """Every item of a list endpoint: page by page while meta says there are more, or by cursor, or a bare list."""
        items: list[dict[str, Any]] = []
        query: dict[str, Any] = {"page": 1, "limit": PAGE_LIMIT}
        for _ in range(MAX_PAGES):
            body = self.call("GET", path, query=query)
            if isinstance(body, list):
                return items + [o for o in body if isinstance(o, dict)]
            data = body.get("data") if isinstance(body, dict) else None
            if not isinstance(data, list):
                raise Refused(f"GET {path}", 200, "an answer without a data list")
            items += [o for o in data if isinstance(o, dict)]
            meta = body.get("meta") if isinstance(body.get("meta"), dict) else {}
            cursor = meta.get("cursor") or meta.get("nextCursor")
            pages = meta.get("totalPages")
            if isinstance(cursor, str) and cursor:
                query = {"cursor": cursor, "limit": PAGE_LIMIT}
            elif isinstance(pages, int) and query.get("page", pages) < pages:
                query = {"page": query["page"] + 1, "limit": PAGE_LIMIT}
            else:
                return items
        raise Refused(f"GET {path}", 200, f"more than {MAX_PAGES} pages")


# --- The plan (FR-004 to FR-006; plan D4) ---------------------------------------------------------------------------


@dataclass
class Action:
    kind: str  # create, update, keep, delete
    what: str  # widget, dashboard
    mark: str  # "<dashboard>/<widget>" or "<dashboard>"
    name: str
    id: str | None = None
    dashboard: dict[str, Any] | None = None
    widget: dict[str, Any] | None = None


@dataclass
class Plan:
    widgets: list[Action] = field(default_factory=list)
    dashboards: list[Action] = field(default_factory=list)
    deletions: list[Action] = field(default_factory=list)

    def writes(self) -> int:
        return sum(a.kind != "keep" for a in self.widgets + self.dashboards) + len(
            self.deletions
        )


def same(want: Any, have: Any) -> bool:
    """want's fields equal have's; a dict is compared on want's own keys, so fields Langfuse adds don't count."""
    if isinstance(want, dict):
        return isinstance(have, dict) and all(
            same(v, have.get(k)) for k, v in want.items()
        )
    if isinstance(want, list):
        return (
            isinstance(have, list)
            and len(want) == len(have)
            and all(same(a, b) for a, b in zip(want, have))
        )
    return want == have


def _marked(
    objects: list[dict[str, Any]], widgets: bool
) -> dict[str, list[dict[str, Any]]]:
    found: dict[str, list[dict[str, Any]]] = {}
    for obj in objects:
        match = MARK_RE.search(str(obj.get("description") or ""))
        if not match or bool(match.group(2)) != widgets:
            continue
        found.setdefault(mark(match.group(1), match.group(2))[4:-1], []).append(obj)
    for group in found.values():
        group.sort(key=lambda o: str(o.get("id")))
    return found


def _same_dashboard(body: dict[str, Any], have: dict[str, Any]) -> bool:
    if body["name"] != have.get("name") or body["description"] != have.get(
        "description"
    ):
        return False
    definition = have.get("definition")
    placed = definition.get("widgets") if isinstance(definition, dict) else None
    if not isinstance(placed, list):
        return False
    by_id = {p.get("id"): p for p in placed if isinstance(p, dict)}
    wanted = body["definition"]["widgets"]
    return set(by_id) == {p["id"] for p in wanted} and all(
        same(p, by_id[p["id"]]) for p in wanted
    )


def make_plan(
    definitions: list[dict[str, Any]],
    widgets_found: list[dict[str, Any]],
    dashboards_found: list[dict[str, Any]],
) -> Plan:
    plan = Plan()
    widgets = _marked(widgets_found, widgets=True)
    boards = _marked(dashboards_found, widgets=False)
    deletions_w: list[Action] = []
    for d in definitions:
        ids: dict[str, str] = {}
        for w in d["widgets"]:
            tag = f"{d['key']}/{w['key']}"
            objects = widgets.pop(tag, [])
            if not objects:
                plan.widgets.append(
                    Action("create", "widget", tag, w["name"], dashboard=d, widget=w)
                )
                continue
            first, extra = objects[0], objects[1:]
            kind = "keep" if same(widget_body(d, w), first) else "update"
            plan.widgets.append(
                Action(kind, "widget", tag, w["name"], str(first["id"]), d, w)
            )
            ids[w["key"]] = str(first["id"])
            deletions_w += [
                Action("delete", "widget", tag, str(o.get("name")), str(o["id"]))
                for o in extra
            ]
        objects = boards.pop(d["key"], [])
        first = objects[0] if objects else None
        if first is None:
            plan.dashboards.append(
                Action("create", "dashboard", d["key"], d["name"], dashboard=d)
            )
        else:
            known = len(ids) == len(d["widgets"])
            kind = (
                "keep"
                if known and _same_dashboard(dashboard_body(d, ids), first)
                else "update"
            )
            plan.dashboards.append(
                Action(kind, "dashboard", d["key"], d["name"], str(first["id"]), d)
            )
            plan.deletions += [
                Action(
                    "delete", "dashboard", d["key"], str(o.get("name")), str(o["id"])
                )
                for o in objects[1:]
            ]
    for tag, objects in sorted(boards.items()):
        plan.deletions += [
            Action("delete", "dashboard", tag, str(o.get("name")), str(o["id"]))
            for o in objects
        ]
    for tag, objects in sorted(widgets.items()):
        deletions_w += [
            Action("delete", "widget", tag, str(o.get("name")), str(o["id"]))
            for o in objects
        ]
    plan.deletions += (
        deletions_w  # dashboards first: a widget goes once nothing places it
    )
    return plan


# --- The run (plan D2 to D4) ----------------------------------------------------------------------------------------


def _read_api_description(client: Langfuse) -> str | None:
    for path in API_DESCRIPTIONS:
        try:
            return client.call("GET", path, text=True)
        except Refused as error:
            if error.status != 404:
                raise
    return None


def _complete(
    client: Langfuse, path: str, objects: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Objects whose list entry has no description are read by their ID, so their mark can be seen."""
    found = []
    for o in objects:
        if "description" not in o and "id" in o:
            o = _read_one(client, path, str(o["id"]))
        found.append(o)
    return found


def _read_one(client: Langfuse, path: str, ident: str) -> dict[str, Any]:
    obj = client.call("GET", f"{path}/{_quoted(ident)}")
    if not isinstance(obj, dict):
        raise Refused(f"GET {path}/{{}}", 200, "an answer that isn't an object")
    return obj


def _write_dashboard(
    client: Langfuse, method: str, path: str, body: dict[str, Any]
) -> Any:
    for attempt in range(LAG_TRIES + 1):
        try:
            return client.call(method, path, body=body)
        except Refused as error:
            if error.status != 404 or attempt == LAG_TRIES:
                raise
            SLEEP(LAG_WAIT_S)
    raise AssertionError("unreachable")  # pragma: no cover


def _quoted(value: str) -> str:
    return urllib.parse.quote(value, safe="")


def run(
    client: Langfuse,
    definitions: list[dict[str, Any]],
    stack: str,
    apply: bool,
    out: TextIO,
) -> int:
    # 1. The API description (plan D3.1).
    description = _read_api_description(client)
    if description is None:
        out.write(
            f"  FAIL  the API description: none at {' or '.join(API_DESCRIPTIONS)}; Langfuse 4.36.0 and later serve one\n"
        )
        out.write("Nothing was written.\n")
        return 1
    missing, methods = check_api(description)
    out.writelines(
        f"  FAIL  the API description doesn't list {item}\n" for item in missing
    )
    if missing:
        out.write(
            "Nothing was written: this command was written for another version of the dashboard API.\n"
        )
        return 1
    out.write(
        f"  ok    the API description lists every operation and field this uses (update: {methods['widget']})\n"
    )

    # 2. Each widget's query, read-only (plan D3.2).
    end = NOW()
    start = end - timedelta(days=CHECK_DAYS)
    failed = 0
    for d in definitions:
        for w in d["widgets"]:
            tag = f"{d['key']}/{w['key']}"
            query = json.dumps(metrics_query(w, start, end), separators=(",", ":"))
            try:
                answer = client.call("GET", METRICS, query={"query": query})
            except Refused as error:
                failed += 1
                out.write(f"  FAIL  {tag:<36} {error.status}: {error.message}\n")
                continue
            rows = answer.get("data") if isinstance(answer, dict) else None
            count = len(rows) if isinstance(rows, list) else 0
            rows_said = "1 row" if count == 1 else f"{count} rows"
            out.write(
                f"  ok    {tag:<36} {rows_said} over the last {CHECK_DAYS} days\n"
            )
    if failed:
        queries = "query" if failed == 1 else "queries"
        out.write(f"Nothing was written: Langfuse refused {failed} widget {queries}.\n")
        return 1

    # 3. What is there, and the plan (plan D4).
    widgets_found = _complete(client, WIDGETS, client.list_all(WIDGETS))
    boards_listed = _complete(client, DASHBOARDS, client.list_all(DASHBOARDS))
    managed = [
        o for o in boards_listed if MARK_RE.search(str(o.get("description") or ""))
    ]
    boards_found = [_read_one(client, DASHBOARDS, str(o["id"])) for o in managed]
    plan = make_plan(definitions, widgets_found, boards_found)
    out.write("Plan:\n")
    for a in plan.widgets + plan.dashboards + plan.deletions:
        ident = f" ({shown(a.id)})" if a.id else ""
        out.write(f'  {a.kind} {a.what}: {a.mark}{ident}, "{shown(a.name)}"\n')
    if not plan.writes():
        out.write(
            "Plan: nothing to write: every widget and dashboard matches its file.\n"
        )
    if not apply:
        out.write("Read-only: nothing was written.")
        out.write(
            f" To write it: make langfuse-dashboards ENV={stack} APPLY=1\n"
            if plan.writes()
            else "\n"
        )
        return 0

    # 4. The writes: widgets, a wait, dashboards, then what no file names (plan D4).
    ids: dict[str, str] = {}
    created = False
    for a in plan.widgets:
        assert a.dashboard is not None and a.widget is not None
        body = widget_body(a.dashboard, a.widget)
        if a.kind == "create":
            obj = client.call("POST", WIDGETS, body=body)
            if not isinstance(obj, dict) or not obj.get("id"):
                raise Refused(
                    f"POST {WIDGETS}", 200, "an answer without the new widget's id"
                )
            ids[a.mark] = str(obj["id"])
            created = True
            out.write(f"  created widget {a.mark} ({shown(ids[a.mark])})\n")
        else:
            assert a.id is not None
            ids[a.mark] = a.id
            if a.kind == "update":
                client.call(methods["widget"], f"{WIDGETS}/{_quoted(a.id)}", body=body)
                out.write(f"  updated widget {a.mark} ({shown(a.id)})\n")
    if created and any(a.kind != "keep" for a in plan.dashboards):
        SLEEP(CREATED_WAIT_S)
    addresses: list[str] = []
    for a in plan.dashboards:
        d = a.dashboard
        assert d is not None
        body = dashboard_body(
            d, {w["key"]: ids[f"{d['key']}/{w['key']}"] for w in d["widgets"]}
        )
        if a.kind == "create":
            obj = _write_dashboard(client, "POST", DASHBOARDS, body)
            if not isinstance(obj, dict) or not obj.get("id"):
                raise Refused(
                    f"POST {DASHBOARDS}",
                    200,
                    "an answer without the new dashboard's id",
                )
            did = str(obj["id"])
            out.write(f"  created dashboard {a.mark} ({shown(did)})\n")
        else:
            assert a.id is not None
            did = a.id
            if a.kind == "update":
                _write_dashboard(
                    client, methods["dashboard"], f"{DASHBOARDS}/{_quoted(did)}", body
                )
                out.write(f"  updated dashboard {a.mark} ({shown(did)})\n")
        addresses.append(
            f"  {d['name']}: {client.base.replace(HOST, 'localhost', 1)}/project/h4reet-{stack}/dashboards/{shown(did)}"
        )
    for a in plan.deletions:
        assert a.id is not None
        path = DASHBOARDS if a.what == "dashboard" else WIDGETS
        client.call("DELETE", f"{path}/{_quoted(a.id)}")
        out.write(f"  deleted {a.what} {a.mark} ({shown(a.id)})\n")
    out.write("Open them at:\n" + "\n".join(addresses) + "\n")
    return 0


# --- The recipe (FR-010; plan D6) -----------------------------------------------------------------------------------


def _filter_words(f: dict[str, Any]) -> str:
    value = ", ".join(f["value"]) if isinstance(f["value"], list) else str(f["value"])
    return f"{f['column']} {f['operator']} {value}"


def recipe(definitions: list[dict[str, Any]]) -> str:
    lines = [
        "# The Langfuse dashboards, by hand",
        "",
        f"From {FILES_SHOWN}/ (spec 034). In Langfuse: Dashboards, then New dashboard with the name and description",
        "below; then for each widget, a new widget with these settings, placed on the 12-column grid as given. Paste each",
        "description whole: its last words are the mark that lets make langfuse-dashboards manage it later.",
    ]
    for d in definitions:
        lines += [
            "",
            f"## {d['name']}",
            "",
            f"Description: {_described(d['description'], d['_file'], mark(d['key']))}",
        ]
        for w in sorted(d["widgets"], key=lambda w: (w["place"]["y"], w["place"]["x"])):
            config = w["chartConfig"]
            options = []
            if "row_limit" in config:
                options.append(f"rows: {config['row_limit']}")
            if isinstance(config.get("defaultSort"), dict):
                sort = config["defaultSort"]
                options.append(f"sorted by {sort.get('column')} {sort.get('order')}")
            if "bins" in config:
                options.append(f"bins: {config['bins']}")
            p = w["place"]
            lines += [
                "",
                f"### {w['name']}",
                "",
                f"- View: {w['view']}",
                f"- Metric: {w['metric']['measure']}, {w['metric']['agg']}",
                f"- Dimension: {', '.join(w['dimensions']) or 'none'}",
                f"- Filters: {'; '.join(_filter_words(f) for f in w['filters']) or 'none'}",
                f"- Chart: {w['chartType']}{' (' + '; '.join(options) + ')' if options else ''}",
                f"- Place: x {p['x']}, y {p['y']}, {p['w']} wide, {p['h']} high",
                f"- Description: {_described(w['description'], d['_file'], mark(d['key'], w['key']))}",
            ]
    return "\n".join(lines) + "\n"


# --- main -----------------------------------------------------------------------------------------------------------

MEANINGS = {
    1: "a check failed or Langfuse refused a request",
    2: "usage, the dashboards' files, or the env file",
    4: "Langfuse didn't answer",
}


def main(
    argv: list[str] | None = None, out: TextIO | None = None, err: TextIO | None = None
) -> int:
    out = out or sys.stdout
    err = err or sys.stderr
    parser = argparse.ArgumentParser(
        prog="langfuse_dashboards.py", description=(__doc__ or "").split("\n\n", 1)[0]
    )
    parser.add_argument("--stack", choices=STACKS)
    parser.add_argument("--env-file")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--recipe", action="store_true")
    args = parser.parse_args(argv)

    def finish(code: int, message: str = "") -> int:
        if message:
            err.write(f"langfuse-dashboards: {message}\n")
        if code:
            err.write(f"langfuse-dashboards: exit {code}: {MEANINGS[code]}\n")
        return code

    try:
        definitions = load_definitions(DASHBOARDS_DIR)
    except DefinitionError as error:
        return finish(2, str(error))
    if args.recipe:
        if args.stack or args.env_file or args.apply:
            return finish(2, "--recipe takes no stack, env file, or --apply")
        out.write(recipe(definitions))
        return 0
    if not args.stack or not args.env_file:
        return finish(2, "--stack and --env-file are both needed, or --recipe")
    try:
        settings = read_env(Path(args.env_file))
    except EnvProblem as error:
        return finish(2, str(error))
    base = f"http://{HOST}:{settings.port}"
    client = Langfuse(base, settings.public_key, settings.secret_key)
    out.write(
        f"Langfuse at {base}, project h4reet-{args.stack}{' (apply)' if args.apply else ' (read-only)'}\n"
    )
    try:
        code = run(client, definitions, args.stack, args.apply, out)
    except NoAnswer as error:
        return finish(
            4,
            f"Langfuse at {base} didn't answer ({error}); is the stack up? make status ENV={args.stack}",
        )
    except Refused as error:
        return finish(
            1, f"Langfuse refused {error.what}: {error.status} {error.message}"
        )
    return finish(code)


if __name__ == "__main__":
    sys.exit(main())
