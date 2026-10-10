#!/usr/bin/env python3
"""The breach test's probe (spec 000 FR-026, FR-036; plan §8; contracts/telemetry.md; tasks.md T071, T080).

    python3 -I /app/breach_probe.py <step> --stack dev|dev-cpu        in a one-off breach-probe container

evals/breach.py, the orchestrator, runs it on the stack's internal network, through
`docker compose --profile breach run --build --rm -T breach-probe`, once or twice a step. It is the only part of the
breach test that speaks HTTP, and only to its own stack's services, which no client outside the stack can reach
(plan §1): the gateway's api (8080) and admin (8081) listeners, the stand-ins, Prometheus, Loki, and Langfuse's public
API. So the agent sandbox never needs a stack port.

Standard input holds the stack's operator token on its first line (dev-cpu's committed dummy, or dev's from the
Author's token file; empty when no operation needs it), then one JSON document, {"ops": [...]}: the step's operations,
in order. Standard output gets one JSON object a line for each operation's result, then a last line saying the step is
done, each marked "h4_breach_probe": 1 so the orchestrator can tell them from anything else.

Operations are actions or checks:
  - actions: health, wait_health, admin, spend, hello, sleep. An action whose answer misses its "expect" fails the
    step: the operations after it are reported skipped, and the probe exits 1;
  - checks, each the source of an assertion: metric (M: a Prometheus instant query), log (L: Loki's records), trace
    (T: Langfuse's trace), and the L family's other records: telegram and mailpit (what the stand-ins received), audit
    (the store's audit row), and incident (the draft the gateway wrote). A check's window is timed from the action it
    measures, never from when the check gets its turn: it opens when that action starts, so nothing from before it
    counts, and closes "within_s" after the action ends. The action is an earlier operation of the call ("after"), a
    moment the orchestrator gives ("after_s" and "after_end_s", for an earlier call's operation or a lifecycle
    command), or else the call's last action. The check polls until its condition holds or the window closes; its
    last try waits a few seconds for late arrivals and asks the sources what they held at the deadline itself
    (Prometheus's evaluation time, Loki's end, the receivers' own receipt times), so a check that starts late still
    gets a fair verdict, and a value that came too late never passes. "fresh" also requires a metric's sample to be
    from after a named operation's start. A missed check doesn't stop the step.
A string field may name an earlier operation's result as {{<id>.<path>}}.

What never leaves it: the operator token; payloads (a hello's answer, a trace's input and output, an alert's or a
draft's text); client identifiers; secrets. Its results carry identifiers, figures, times, and booleans. HTTP goes
through urllib with an empty ProxyHandler and no redirects, so every request stays on the stack's network.

Standard library only, and loaded by path, as the operator CLI it imports for the admin listener is
(contracts/operator-admin.md §6). Exit codes: 0 every operation ran (a check may have missed); 1 an action failed;
2 usage. The orchestrator reads the results either way.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import datetime as dt
import http.client
import importlib.util
import io
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, NoReturn, TextIO

# The stack's services, as the probe reaches them on its internal network (plan §1, §2).
GATEWAY = "http://gateway:8080"
ADMIN = "http://gateway:8081"
PROMETHEUS = "http://prometheus:9090"
LOKI = "http://loki:3100"
LANGFUSE = "http://langfuse-web:3000"
TELEGRAM = "http://telegram-standin:8080"
MAILPIT = "http://mailpit:8025"

STACKS = ("dev", "dev-cpu")  # the breach test's only stacks (FR-036)
MARK = "h4_breach_probe"
HTTP_TIMEOUT_S = 15
MAX_BODY = 8 * 1024 * 1024
MAX_INPUT = 1024 * 1024
TOLERANCE = 1e-6  # USD and flags are compared to a millionth: a micro-USD
# Langfuse's v2 observations list, for one trace (T187): the field groups that carry the type, the cost (usage), and
# the span's attributes (metadata); the metadata key it returns whole, since it cuts longer values at 200 characters
# otherwise; its largest page; and the most pages one trace may take.
TRACE_FIELDS = "core,basic,usage,metadata"
TRACE_EXPAND = "attributes"
TRACE_LIMIT = 1000
TRACE_PAGES = 10
SLACK_S = 5.0  # a window starts this long before its action, for the clocks of two containers on one host
# A window's last try waits this long past its end, so a sample or record stamped by then has arrived: the collector's
# 2 s batch and Prometheus's under-1 s ingestion (contracts/telemetry.md §6.5). It still asks for the deadline itself.
SETTLE_S = 5.0
SYNTHETIC_BATCH = (
    50  # POST /admin/test/synthetic's largest count (contracts/operator-admin.md §3.2)
)
SPEND_WAIT_CAP_S = 150.0  # the global limit frees within 60 s; waiting longer means something else is wrong
SYNTHETIC_COST_MICRO = 100_000  # $0.10 a synthetic call (plan §5.2)
EVERY_S = {
    "metric": 2.0,
    "log": 2.0,
    "trace": 3.0,
    "telegram": 2.0,
    "mailpit": 2.0,
    "audit": 2.0,
    "incident": 3.0,
}
# Keys whose values could be a payload, wherever they arrive: dropped from every answer before it is printed.
PAYLOAD_KEYS = frozenset(
    {
        "answer",
        "content",
        "text",
        "input",
        "output",
        "messages",
        "prompt",
        "completion",
        "html",
    }
)
SAFE_VALUE = re.compile(r"[A-Za-z0-9:._-]{1,128}")
EVENT_RE = re.compile(r"[a-z][a-z0-9_.]{0,63}")
LABEL_RE = re.compile(r"[a-z_][a-z0-9_]{0,63}")
REF_RE = re.compile(
    r"\{\{([A-Za-z0-9_][A-Za-z0-9_.-]{0,200})\}\}"
)  # {{<id>.<path>}}; split_ref() splits them
ACTOR_RE = r"operator:{stack}#[0-9a-f]{{8}}"


class Usage(ValueError):
    """Exit 2: an operation the probe can't run as given."""


class SourceError(Exception):
    """A source answered, but not with what its API documents."""


class Unreachable(Exception):
    """A source didn't answer."""


# --- HTTP -----------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Response:
    status: int
    headers: Mapping[str, str]
    body: bytes

    def json(self) -> Any:
        try:
            return json.loads(self.body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise SourceError(f"HTTP {self.status}: the answer isn't JSON") from None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """No service in the stack redirects; an answer that does is reported as it is, and never followed."""

    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


class Http:
    """urllib with no proxy and no redirects, so every request stays on the stack's network."""

    def __init__(self, timeout_s: float = HTTP_TIMEOUT_S) -> None:
        self.timeout_s = timeout_s
        self._opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), _NoRedirect()
        )

    def request(
        self,
        method: str,
        url: str,
        *,
        body: Any = None,
        headers: Mapping[str, str] | None = None,
    ) -> Response:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Accept", "application/json")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            request.add_unredirected_header(key, value)
        try:
            with self._opener.open(request, timeout=self.timeout_s) as response:
                return Response(
                    response.status, dict(response.headers), response.read(MAX_BODY)
                )
        except urllib.error.HTTPError as answer:
            raw = b""
            with contextlib.suppress(OSError, http.client.HTTPException):
                raw = answer.read(MAX_BODY)
            answer.close()
            return Response(answer.code, dict(answer.headers or {}), raw)
        except (urllib.error.URLError, OSError, http.client.HTTPException) as failure:
            reason = getattr(failure, "reason", failure)
            raise Unreachable(
                f"{urllib.parse.urlsplit(url).netloc}: {getattr(reason, 'strerror', None) or reason}"
            ) from None


class Clock:
    def monotonic(self) -> float:
        return time.monotonic()

    def wall(self) -> float:
        return time.time()

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)


# --- the timing windows ---------------------------------------------------------------------------------------------


@dataclass
class Outcome:
    ok: bool
    value: Any = None
    waited_s: float = 0.0
    attempts: int = 0
    error: str | None = None
    cutoff_s: float | None = None  # the moment the last try asked the sources about


@dataclass(frozen=True)
class Window:
    """A check's window, timed from the action it measures: it opens when the action starts, so nothing from before
    it counts, and closes within_s after the action ends."""

    opens_s: float
    anchor_s: float  # the action's end, which the deadline is timed from
    due_s: float


def poll(
    attempt: Callable[[float], tuple[bool, Any]],
    *,
    due_s: float,
    every_s: float,
    clock: Any,
    settle_s: float = 0.0,
) -> Outcome:
    """attempt(cutoff_s) → (ok, evidence), tried now and every every_s until it holds or the window closes at due_s, a
    wall-clock time the caller timed from the action, never from this check's start. A try may count only what the
    sources held by cutoff_s: now, while the window is open; then its end. When the window closes, one last try waits
    settle_s past the end, for what was stamped in time but arrives late, and asks for the deadline itself. A check
    that starts after its window has closed gets that one try. A source that doesn't answer, or answers wrongly, is a
    miss for that try."""
    start = clock.monotonic()
    attempts, value, error = 0, None, None
    while True:
        closing = clock.wall() >= due_s
        if closing and clock.wall() < due_s + settle_s:
            clock.sleep(due_s + settle_s - clock.wall())
        cutoff = min(clock.wall(), due_s)
        attempts += 1
        try:
            ok, value = attempt(cutoff)
            error = None
        except (SourceError, Unreachable) as failure:
            ok, error = False, f"{type(failure).__name__}: {failure}"
        waited = round(clock.monotonic() - start, 3)
        if ok:
            return Outcome(True, value, waited, attempts, cutoff_s=cutoff)
        if closing:
            return Outcome(False, value, waited, attempts, error, cutoff_s=cutoff)
        clock.sleep(min(every_s, max(due_s - clock.wall(), 0.0)))


def ns(wall_s: float) -> int:
    """A wall-clock time in Loki's nanoseconds, to the millisecond."""
    return round(wall_s * 1000) * 1_000_000


def since_ns(wall_s: float, slack_s: float = SLACK_S) -> int:
    """A window's start, in Loki's nanoseconds: a little before the action it follows."""
    return ns(wall_s) - round(slack_s * 1000) * 1_000_000


TIME_RE = re.compile(
    r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})"
)


def epoch_s(text: object) -> float | None:
    """An RFC 3339 time, as the stand-in and Mailpit write their receipt times, in epoch seconds; None if it isn't one.
    Fractions are kept to the microsecond: Mailpit writes nanoseconds."""
    match = TIME_RE.fullmatch(text.strip()) if isinstance(text, str) else None
    if match is None:
        return None
    base, fraction, zone = match.groups()
    try:
        moment = dt.datetime.fromisoformat(base + ("+00:00" if zone == "Z" else zone))
    except ValueError:
        return None
    return moment.timestamp() + (float(fraction[:7]) if fraction else 0.0)


def iso(ns: int) -> str:
    return (
        dt.datetime.fromtimestamp(ns / 1e9, dt.timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


# --- M: Prometheus ----------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Sample:
    labels: dict[str, str]
    value: float


def number(text: object) -> float:
    if isinstance(text, bool) or not isinstance(text, (str, int, float)):
        raise SourceError("a value that isn't a number")
    try:
        return float(text)
    except ValueError:
        raise SourceError("a value that isn't a number") from None


def prom_samples(body: object) -> list[Sample]:
    """An instant query's answer (GET /api/v1/query): its vector's samples, or a scalar as one sample."""
    if (
        not isinstance(body, dict)
        or body.get("status") != "success"
        or not isinstance(body.get("data"), dict)
    ):
        raise SourceError("Prometheus didn't answer success")
    data = body["data"]
    kind, result = data.get("resultType"), data.get("result")
    if kind == "scalar" and isinstance(result, list) and len(result) == 2:
        return [Sample({}, number(result[1]))]
    if kind != "vector" or not isinstance(result, list):
        raise SourceError(f"Prometheus answered a {kind!r}, not a vector")
    out = []
    for item in result:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("metric"), dict)
            or not isinstance(item.get("value"), list)
        ):
            raise SourceError("a vector sample without its labels and value")
        out.append(
            Sample(
                {str(k): str(v) for k, v in item["metric"].items()},
                number(item["value"][1]),
            )
        )
    return out


def single(samples: list[Sample]) -> float | None:
    """The one sample's value, None when there is none. Several are ambiguous: a miss, never a guess."""
    if len(samples) > 1:
        raise SourceError(f"{len(samples)} series, where the query gives one")
    return samples[0].value if samples else None


def label_set(samples: list[Sample], label: str) -> set[str]:
    return {s.labels.get(label, "") for s in samples}


def close(a: float | None, b: float) -> bool:
    return a is not None and not math.isnan(a) and abs(a - b) <= TOLERANCE


# --- L: Loki, the receivers, and the store's records -------------------------------------------------------------


@dataclass(frozen=True)
class LogRecord:
    ts_ns: int
    fields: dict[str, str]


def loki_records(body: object) -> list[LogRecord]:
    """A range query's records (GET /loki/api/v1/query_range), oldest first. The OTLP fields are Loki's structured
    metadata: merged into each stream's labels by default, or beside each line when Loki categorizes them."""
    if (
        not isinstance(body, dict)
        or body.get("status") != "success"
        or not isinstance(body.get("data"), dict)
    ):
        raise SourceError("Loki didn't answer success")
    data = body["data"]
    if data.get("resultType") != "streams" or not isinstance(data.get("result"), list):
        raise SourceError("Loki answered no streams")
    out = []
    for stream in data["result"]:
        if not isinstance(stream, dict) or not isinstance(stream.get("values"), list):
            raise SourceError("a stream without values")
        labels = {str(k): str(v) for k, v in (stream.get("stream") or {}).items()}
        for value in stream["values"]:
            if not isinstance(value, list) or len(value) < 2:
                raise SourceError("a record without its time and line")
            fields = dict(labels)
            if len(value) > 2 and isinstance(value[2], dict):
                extra = value[2]
                groups = [extra.get("structuredMetadata"), extra.get("parsed")]
                if not any(isinstance(g, dict) for g in groups):
                    groups = [extra]
                for group in groups:
                    if isinstance(group, dict):
                        fields.update({str(k): str(v) for k, v in group.items()})
            try:
                ts = int(value[0])
            except (TypeError, ValueError):
                raise SourceError("a record whose time isn't nanoseconds") from None
            out.append(LogRecord(ts, fields))
    return sorted(out, key=lambda r: r.ts_ns)


def logql(stack: str, event: str, **filters: object) -> str:
    """The gateway's records of one event on one stack, with exact field filters (contracts/telemetry.md §5.1). A
    filter's value is a plain identifier or number, or exactly one {{<id>.<path>}} reference, which resolve() checks
    is one when the probe runs the query."""
    if not EVENT_RE.fullmatch(event) or stack not in STACKS + ("prod",):
        raise Usage(f"not an event name: {event!r}")
    query = f'{{service_name="gateway", deployment_environment_name="{stack}"}} | event="{event}"'
    for key, value in filters.items():
        text = str(value)
        plain = SAFE_VALUE.fullmatch(text) or REF_RE.fullmatch(text)
        if not LABEL_RE.fullmatch(key) or not plain:
            raise Usage(f"not a field filter: {key}")
        query += f' | {key}="{text}"'
    return query


def token_match(text: str, key: str) -> bool:
    """An alert's id is the token after "id " on its runtime line, whole: :g1 never matches :g12."""
    return re.search(rf"(?:^|\s)id {re.escape(key)}(?:\s|$)", text) is not None


def telegram_find(body: object, key: str) -> dict[str, Any] | None:
    """The Telegram stand-in's GET /messages: the first message whose text names the alert."""
    messages = body.get("messages") if isinstance(body, dict) else None
    if not isinstance(messages, list):
        raise SourceError("the Telegram stand-in answered no messages")
    for message in messages:
        if (
            isinstance(message, dict)
            and isinstance(message.get("text"), str)
            and token_match(message["text"], key)
        ):
            return {
                "message_id": message.get("message_id"),
                "received_at": message.get("received_at"),
            }
    return None


def mailpit_messages(body: object) -> list[dict[str, Any]]:
    messages = body.get("messages") if isinstance(body, dict) else None
    if not isinstance(messages, list):
        raise SourceError("Mailpit answered no messages")
    return [m for m in messages if isinstance(m, dict) and isinstance(m.get("ID"), str)]


def header_matches(headers: object, key: str) -> bool:
    """A message's X-H4-Alert-Id header (contracts/alerts.md §4.1) is the alert's id."""
    if not isinstance(headers, dict):
        return False
    for name, values in headers.items():
        if str(name).lower() == "x-h4-alert-id":
            values = values if isinstance(values, list) else [values]
            return any(str(v).strip() == key for v in values)
    return False


def text_matches(message: object, key: str) -> bool:
    text = message.get("Text") if isinstance(message, dict) else None
    return isinstance(text, str) and token_match(text, key)


EVIDENCE = {
    "meters": "Meters at the crossing",
    "crossing": "The crossing",
    "last_10": "The last 10 metered calls",
    "hourly": "Hourly totals, the 24 hours before the crossing (UTC)",
    "audit": "Audit trail, this ",
    "configuration": "Configuration",
    "alerts": "Alerts",
    "links": "Links",
}


def sections(content: str) -> dict[str, str]:
    """A draft's ### sections: heading to body."""
    out: dict[str, str] = {}
    for part in re.split(r"^### ", content, flags=re.MULTILINE)[1:]:
        heading, _, body = part.partition("\n")
        out[heading.strip()] = body
    return out


def section(found: dict[str, str], heading: str) -> str:
    for name, body in found.items():
        if name == heading or (heading.endswith(" ") and name.startswith(heading)):
            return body
    return ""


def table_rows(body: str) -> list[str]:
    """A section's table rows, without its header and separator."""
    rows = [line for line in body.splitlines() if line.startswith("|")]
    return [row for row in rows[2:] if not re.fullmatch(r"\|[-| :]+\|", row)]


def incident_checks(
    incident: Mapping[str, Any],
    *,
    ceiling: str,
    period_key: str,
    trace_id: str,
    trip_key: str,
) -> dict[str, bool]:
    """alerts.md §7's evidence fields, each with at least the crossing call's row filled (plan §8 step 8)."""
    content = (
        incident.get("content") if isinstance(incident.get("content"), str) else ""
    )
    found = sections(content)
    meters = section(found, EVIDENCE["meters"])
    configuration = section(found, EVIDENCE["configuration"])
    links = section(found, EVIDENCE["links"])
    meter_name = "day" if ceiling == "day" else "month"
    return {
        "written": incident.get("status") == "written",
        "sha256_matches": incident.get("sha256_matches") is True,
        "meters": any(
            row.startswith(f"| {meter_name} | {period_key} |")
            for row in table_rows(meters)
        ),
        "crossing": trace_id in section(found, EVIDENCE["crossing"]),
        "last_10": any(
            trace_id in row for row in table_rows(section(found, EVIDENCE["last_10"]))
        ),
        "hourly": bool(table_rows(section(found, EVIDENCE["hourly"]))),
        "audit": bool(table_rows(section(found, EVIDENCE["audit"]))),
        "routing_sha": re.search(r"SHA-256 [0-9a-f]{64}\b", configuration) is not None,
        "price_version": "Prices: version " in configuration,
        "alerts": any(
            trip_key in row for row in table_rows(section(found, EVIDENCE["alerts"]))
        ),
        "grafana_link": "/d/h4-runtime?from=" in links,
        "langfuse_link": f"/traces/{trace_id}" in links,
    }


# --- T: Langfuse ---------------------------------------------------------------------------------------------------


def langfuse_observations(body: object) -> list[dict[str, Any]]:
    """A page of observations: the v2 list's `data` (GET /api/public/v2/observations, T187), or the `observations`
    of a v1 trace, which Langfuse v4 no longer serves."""
    if isinstance(body, dict):
        for key in ("observations", "data"):
            if isinstance(body.get(key), list):
                return [o for o in body[key] if isinstance(o, dict)]
    raise SourceError("Langfuse answered no observations")


def flatten(node: object, prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    if isinstance(node, dict):
        for key, value in node.items():
            name = f"{prefix}.{key}" if prefix else str(key)
            if isinstance(value, dict):
                out.update(flatten(value, name))
            else:
                out[name] = value
    return out


def json_or_same(value: Any) -> Any:
    """value parsed, when it is JSON text for an object; otherwise value itself."""
    if isinstance(value, str):
        with contextlib.suppress(ValueError):
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
    return value


def attribute(observation: Mapping[str, Any], key: str) -> Any:
    """A span attribute Langfuse kept in the observation's metadata: under "attributes", nested by its dots, or at
    the top. The resource's attributes aren't the span's. The v2 list may give metadata, or its "attributes", as JSON
    text (T187), which is read as the object it holds."""
    metadata = json_or_same(observation.get("metadata"))
    if not isinstance(metadata, dict):
        return None
    metadata = {k: json_or_same(v) for k, v in metadata.items()}
    attributes = metadata.get("attributes")
    if isinstance(attributes, dict) and key in attributes:
        return attributes[key]
    for name, value in flatten(
        {k: v for k, v in metadata.items() if k != "resourceAttributes"}
    ).items():
        if name in (key, f"attributes.{key}"):
            return value
    return None


COST_FIELDS = ("costDetails.total", "calculatedTotalCost", "totalCost")


def derived_cost(observation: Mapping[str, Any]) -> tuple[Any, str] | None:
    """The cost Langfuse shows, which the collector derives from h4.cost.usd (contracts/telemetry.md §3.5)."""
    flat = flatten(dict(observation))
    for name in COST_FIELDS:
        if flat.get(name) is not None:
            return flat[name], name
    return None


def same(found: Any, expected: Any) -> bool:
    if isinstance(expected, bool):
        return found is expected or str(found).lower() == str(expected).lower()
    if isinstance(expected, (int, float)):
        try:
            return close(number(found), float(expected))
        except SourceError:
            return False
    return found == expected


def generation_match(
    observation: Mapping[str, Any], expected: Mapping[str, Any]
) -> tuple[bool, dict, dict]:
    """Whether a generation carries every expected attribute: (ok, what it carries, where a derived value came from)."""
    observed: dict[str, Any] = {}
    via: dict[str, str] = {}
    ok = str(observation.get("type", "")).upper() == "GENERATION"
    for key, value in expected.items():
        found = attribute(observation, key)
        if found is None and key == "h4.cost.usd":
            derived = derived_cost(observation)
            if derived is not None:
                found, via[key] = derived
        observed[key] = found
        ok = ok and same(found, value)
    return ok, observed, via


# --- references, expectations, and what leaves the probe ----------------------------------------------------------


MISSING = object()


def dig(node: Any, path: str) -> Any:
    for part in path.split("."):
        if isinstance(node, dict):
            if part not in node:
                return MISSING
            node = node[part]
        elif isinstance(node, list) and re.fullmatch(r"-?\d+", part):
            index = int(part)
            if not -len(node) <= index < len(node):
                return MISSING
            node = node[index]
        else:
            return MISSING
    return node


def split_ref(name: str, results: Mapping[str, Any]) -> tuple[str, str] | None:
    """A reference's operation and path: the longest leading part that names an operation, since an id may hold dots
    (s6.renew), and the rest, which can't be empty."""
    parts = name.split(".")
    for end in range(len(parts) - 1, 0, -1):
        head = ".".join(parts[:end])
        if head in results:
            return head, ".".join(parts[end:])
    return None


def resolve(value: Any, results: Mapping[str, Any]) -> Any:
    """{{<id>.<path>}} in a string, as the earlier result's value: the value itself when it is the whole string."""
    if isinstance(value, dict):
        return {k: resolve(v, results) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve(v, results) for v in value]
    if not isinstance(value, str) or "{{" not in value:
        return value

    def lookup(match: re.Match[str]) -> Any:
        split = split_ref(match.group(1), results)
        found = MISSING if split is None else dig(results[split[0]], split[1])
        if found is MISSING or isinstance(found, (dict, list)) or found is None:
            raise Usage(f"{match.group(0)} names nothing an earlier operation answered")
        if isinstance(found, bool) or not SAFE_VALUE.fullmatch(str(found)):
            raise Usage(f"{match.group(0)} isn't a plain identifier or number")
        return found

    whole = REF_RE.fullmatch(value)
    if whole:
        return lookup(whole)
    text = REF_RE.sub(lambda m: str(lookup(m)), value)
    if "{{" in text:
        raise Usage("a reference that isn't {{<id>.<path>}}")
    return text


def misses(result: Mapping[str, Any], expect: Mapping[str, Any]) -> list[str]:
    """Each dotted path whose value isn't the one expected: None means null or absent."""
    out = []
    for path, wanted in expect.items():
        found = dig(result, path)
        if wanted is None:
            if found not in (None, MISSING):
                out.append(path)
        elif found is MISSING or not same(found, wanted):
            out.append(path)
    return out


def sanitize(node: Any) -> Any:
    if isinstance(node, dict):
        return {k: sanitize(v) for k, v in node.items() if k not in PAYLOAD_KEYS}
    if isinstance(node, list):
        return [sanitize(v) for v in node]
    return node


def shorten(text: str, limit: int = 200) -> str:
    """Text safe for a terminal, cut at limit: every control character, by Unicode category (Cc: C0, DEL, and C1, whose
    U+009B is CSI on its own), becomes ?, as scripts/operator.py's clean() has it."""
    text = "".join("?" if unicodedata.category(ch) == "Cc" else ch for ch in text)
    return text if len(text) <= limit else text[: limit - 1] + "…"


# --- the probe ------------------------------------------------------------------------------------------------------


ACTIONS = ("health", "wait_health", "admin", "spend", "hello", "sleep")
CHECKS = ("metric", "log", "trace", "telegram", "mailpit", "audit", "incident")
NEEDS_ADMIN = ("admin", "spend", "audit", "incident")


@dataclass
class Probe:
    stack: str
    http: Any
    admin: Any
    clock: Any
    langfuse_auth: tuple[str, str] | None
    out: TextIO
    admin_error: type[Exception]
    results: dict[str, dict[str, Any]] = field(default_factory=dict)
    last_action: dict[str, Any] | None = (
        None  # what a check that names no action is timed from
    )

    def run(self, ops: list[dict[str, Any]], step: str) -> int:
        failed: str | None = None
        for index, op in enumerate(ops):
            if failed is not None:
                result = {
                    **self.base(op),
                    "ok": False,
                    "skipped": True,
                    "after": failed,
                }
            else:
                result = self.one(op)
                if op.get("op") in ACTIONS:
                    self.last_action = result
                if not result["ok"] and op.get("op") in ACTIONS:
                    result["failed"] = True
                    failed = str(op.get("id") or index)
            self.emit({"step": step, "index": index, "result": result})
        code = 1 if failed is not None else 0
        self.emit({"step": step, "done": True, "exit": code})
        return code

    def emit(self, line: dict[str, Any]) -> None:
        print(json.dumps({MARK: 1, **line}), file=self.out, flush=True)

    def base(self, op: Mapping[str, Any]) -> dict[str, Any]:
        return {"op": op.get("op"), "id": op.get("id"), "assert": op.get("assert")}

    def one(self, op: dict[str, Any]) -> dict[str, Any]:
        started = self.clock.wall()
        result = {**self.base(op), "started_s": round(started, 3)}
        try:
            resolved = resolve(op, self.results)
            result.update(getattr(self, f"op_{resolved['op']}")(resolved, started))
        except Usage as problem:
            result.update(ok=False, error=f"usage: {problem}")
        except Exception as problem:  # noqa: BLE001 — a defect in one operation is that operation's result
            # Its class and a short message, never a traceback, which could show a value.
            result.update(
                ok=False, error=f"{type(problem).__name__}: {shorten(str(problem))}"
            )
        result.setdefault("ok", False)
        result["ended_s"] = round(self.clock.wall(), 3)
        if op.get("id"):
            self.results[str(op["id"])] = result
        return result

    def earlier(self, ident: Any) -> tuple[float, float]:
        """An earlier operation of this call: when it started and when it ended."""
        found = self.results.get(str(ident))
        if not found or "started_s" not in found:
            raise Usage(f"after names no earlier operation: {ident}")
        start = float(found["started_s"])
        return start, float(found.get("ended_s", start))

    def opens_s(self, spec: Mapping[str, Any], started: float) -> float:
        """When a "fresh" requirement starts: an earlier operation's start, a time given, or this operation's start."""
        if "after" in spec:
            return self.earlier(spec["after"])[0]
        return float(spec.get("after_s", started))

    def window(self, op: Mapping[str, Any], started: float, within_s: float) -> Window:
        """The check's window, timed from the action it measures: the operation it names ("after"), the moments the
        orchestrator gives ("after_s", "after_end_s"), or this call's last action. A check with none of them is
        refused, never timed from its own start: that is the window round 1's review found too long."""
        within = max(float(op.get("within_s", within_s)), 0.0)
        if "after" in op:
            opens, anchor = self.earlier(op["after"])
        elif "after_s" in op:
            opens = float(op["after_s"])
            anchor = float(op.get("after_end_s", opens))
        elif self.last_action is not None:
            opens = float(self.last_action["started_s"])
            anchor = float(self.last_action.get("ended_s", opens))
        else:
            raise Usage(
                "a check is timed from the action it measures: name it with after, or after_s and after_end_s"
            )
        if anchor < opens:
            raise Usage("a window's action can't end before it starts")
        return Window(opens, anchor, anchor + within)

    def timing(self, window: Window, outcome: Outcome) -> dict[str, Any]:
        """How long the check waited, and, when it held, how long after its action the try that saw it looked."""
        timed: dict[str, Any] = {
            "waited_s": outcome.waited_s,
            "within_s": round(window.due_s - window.anchor_s, 3),
        }
        if outcome.ok and outcome.cutoff_s is not None:
            timed["seen_after_s"] = round(
                max(outcome.cutoff_s - window.anchor_s, 0.0), 3
            )
        return timed

    # --- actions ------------------------------------------------------------------------------------------------

    def health_now(self) -> dict[str, Any]:
        response = self.http.request("GET", f"{GATEWAY}/health")
        if response.status != 200:
            raise SourceError(f"/health answered {response.status}")
        body = response.json()
        if not isinstance(body, dict):
            raise SourceError("/health didn't answer an object")
        adapters = {
            str(a.get("id")): {
                "healthy": a.get("healthy"),
                "reason": a.get("reason"),
                "role": a.get("role"),
            }
            for a in body.get("adapters") or []
            if isinstance(a, dict)
        }
        keep = ("status", "stack", "env", "time", "real_time", "store", "state", "since", "crossed",
                "degraded_cause", "journal", "fallback", "test_machinery")  # fmt: skip
        return {**{k: body.get(k) for k in keep}, "adapter": adapters}

    def op_health(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        try:
            health = self.health_now()
        except (SourceError, Unreachable) as problem:
            return {"ok": False, "error": f"the gateway's /health: {problem}"}
        wrong = misses(health, op.get("expect", {}))
        return {
            "ok": not wrong,
            "health": health,
            **({"misses": wrong} if wrong else {}),
        }

    def op_wait_health(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        expect = op.get("expect", {})

        def attempt(cutoff: float) -> tuple[bool, Any]:
            health = self.health_now()
            return not misses(health, expect), health

        # An action's own wait, from its own start.
        outcome = poll(
            attempt,
            due_s=started + max(float(op.get("within_s", 60)), 0.0),
            every_s=1.0,
            clock=self.clock,
        )
        result = {
            "ok": outcome.ok,
            "health": outcome.value,
            "waited_s": outcome.waited_s,
        }
        if not outcome.ok:
            result["misses"] = (
                misses(outcome.value or {}, expect) if outcome.value else list(expect)
            )
            result["error"] = outcome.error
        return result

    def admin_raw(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
        """One call through the operator CLI's AdminClient: its status, error, and body, as the listener sent them.
        Only admin_call's sanitized copy is ever printed."""
        if self.admin is None:
            raise Usage("no operator token on the first line of standard input")
        try:
            answer = self.admin.request(method, path, body)
        except self.admin_error as problem:
            return {
                "status": getattr(problem, "status", None),
                "error": getattr(problem, "error", None),
                "detail": getattr(problem, "detail", None),
                "body": getattr(problem, "body", None),
            }
        return {"status": 200, "error": None, "body": answer}

    def admin_call(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
        answer = self.admin_raw(method, path, body)
        return {**answer, "body": sanitize(answer["body"])}

    def op_admin(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        method, path = str(op.get("method", "GET")), str(op.get("path", ""))
        if not path.startswith("/admin/"):
            raise Usage("an admin operation's path starts with /admin/")
        result = self.admin_call(method, path, op.get("body"))
        wrong = misses(result, op.get("expect", {"status": 200}))
        return {"ok": not wrong, **result, **({"misses": wrong} if wrong else {})}

    def op_spend(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        """POST /admin/test/synthetic, in batches of at most 50, until the count is spent or a call is refused otherwise.
        The global limit's 429 (operator-admin.md §3.2: "pace at most 60 metered calls a minute"; 60 a minute and 4 in
        flight, data-model.md §7.2) is a wait of its retry_after_s and a second, not a miss: the next POST asks only for
        what is left, so the meters still land where plan §8 says. The waits stop at SPEND_WAIT_CAP_S, and a batch cut
        short with no reason, which §3.2 rules out, stops the spend at once rather than asking again."""
        count, attribution = int(op["count"]), str(op["attribution"])
        if not 1 <= count <= 1000 or attribution not in ("metered", "fallback"):
            raise Usage(
                "spend takes a count from 1 to 1000 and the attribution metered or fallback"
            )
        calls: list[dict[str, Any]] = []
        audit_ids: list[Any] = []
        waits: list[float] = []
        stopped: Any = None
        meters: Any = None
        waited = 0.0
        while len(calls) < count:
            batch = min(count - len(calls), SYNTHETIC_BATCH)
            body = {"attribution": attribution, "count": batch, "reason": op["reason"]}
            answer = self.admin_call("POST", "/admin/test/synthetic", body)
            if answer["status"] != 200 or not isinstance(answer["body"], dict):
                return {
                    "ok": False,
                    "answered": len(calls),
                    "calls": calls,
                    "refused": answer,
                    "audit_ids": audit_ids,
                }
            reply = answer["body"]
            answered = [c for c in reply.get("calls") or [] if isinstance(c, dict)]
            for item in answered:
                calls.append(
                    {
                        **{
                            k: item.get(k)
                            for k in ("status", "route", "cost_micro_usd", "trace_id")
                        },
                        "n": len(calls) + 1,
                    }
                )
            audit_ids.append(reply.get("audit_id"))
            meters = reply.get("meters")
            stopped = reply.get("stopped")
            if stopped is None:
                if len(answered) < batch:
                    return {
                        "ok": False,
                        "answered": len(calls),
                        "calls": calls,
                        "meters": meters,
                        "audit_ids": audit_ids,
                        "waits": waits,
                        "error": f"the gateway answered {len(answered)} of {batch} calls and named no reason "
                        "(contracts/operator-admin.md §3.2)",
                    }
                continue
            if isinstance(stopped, dict) and stopped.get("status") == 429:
                pause = float(stopped.get("retry_after_s") or 4) + 1
                if waited + pause <= SPEND_WAIT_CAP_S:
                    waits.append(pause)
                    waited += pause
                    self.clock.sleep(pause)
                    stopped = None
                    continue
            break
        result = {
            "requested": count,
            "answered": len(calls),
            "calls": calls,
            "stopped": stopped,
            "meters": meters,
            "audit_ids": audit_ids,
            "waits": waits,
        }
        wrong = misses(result, op.get("expect", {"answered": count, "stopped": None}))
        route, price = (
            op.get("route"),
            int(op.get("cost_micro_usd", SYNTHETIC_COST_MICRO)),
        )
        for call in calls:
            if (
                call["status"] != 200
                or call["cost_micro_usd"] != price
                or (route and call["route"] != route)
            ):
                wrong.append(f"calls.{call['n'] - 1}")
                break
        return {"ok": not wrong, **result, **({"misses": wrong} if wrong else {})}

    def op_hello(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        """POST /hello with the default message and no client label (gateway-http.md §2.1): its route or its cause,
        never its answer."""
        try:
            response = self.http.request("POST", f"{GATEWAY}/hello", body={})
            body = response.json()
        except (SourceError, Unreachable) as problem:
            return {"ok": False, "error": f"hello: {problem}"}
        body = body if isinstance(body, dict) else {}
        keep = (
            "route",
            "route_reason",
            "provider",
            "model",
            "cost_micro_usd",
            "cause",
            "trace_id",
            "stack",
        )
        result = {
            "status": response.status,
            **{k: body.get(k) for k in keep},
            "header_cause": {k.lower(): v for k, v in response.headers.items()}.get(
                "x-h4-degraded-cause"
            ),
        }
        wrong = misses(result, op.get("expect", {}))
        return {"ok": not wrong, **result, **({"misses": wrong} if wrong else {})}

    def op_sleep(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        seconds = float(op.get("s", 0))
        if not 0 <= seconds <= 300:
            raise Usage("sleep takes 0 to 300 seconds")
        self.clock.sleep(seconds)
        return {"ok": True, "slept_s": seconds}

    # --- checks -------------------------------------------------------------------------------------------------

    def prom(self, query: str, at_s: float) -> list[Sample]:
        """An instant query, evaluated at at_s: the dashboard's value at that moment."""
        params = {"query": query, "time": f"{at_s:.3f}"}
        url = f"{PROMETHEUS}/api/v1/query?" + urllib.parse.urlencode(params)
        response = self.http.request("GET", url)
        if response.status != 200:
            raise SourceError(f"Prometheus answered {response.status}")
        return prom_samples(response.json())

    def op_metric(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        query, expect = str(op["query"]), op.get("expect", {})
        window = self.window(op, started, 60)
        fresh = op.get("fresh")
        fresh_after = self.opens_s(fresh, started) if isinstance(fresh, dict) else None
        seen: dict[str, Any] = {}

        def attempt(cutoff: float) -> tuple[bool, Any]:
            samples = self.prom(query, cutoff)
            if "labels" in expect:
                ((label, values),) = expect["labels"].items()
                found = label_set(samples, label)
                observed: Any = sorted(found)
                ok = found == set(values)
            elif "at_least" in expect:
                value, floor = (
                    single(samples),
                    single(self.prom(str(expect["at_least"]), cutoff)),
                )
                observed = [value, floor]
                ok = (
                    value is not None
                    and floor is not None
                    and value >= floor - TOLERANCE
                )
            else:
                observed = single(samples)
                ok = close(observed, float(expect["value"]))
            if fresh_after is not None:
                stamp = single(
                    self.prom(f"max(timestamp({fresh['selector']}))", cutoff)
                )
                seen["fresh_s"] = stamp
                ok = ok and stamp is not None and stamp >= fresh_after
            return ok, observed

        outcome = poll(
            attempt,
            due_s=window.due_s,
            every_s=EVERY_S["metric"],
            clock=self.clock,
            settle_s=SETTLE_S,
        )
        result = {
            "ok": outcome.ok,
            "query": query,
            "observed": outcome.value,
            **self.timing(window, outcome),
            **seen,
        }
        if outcome.error:
            result["error"] = outcome.error
        return result

    def loki(self, query: str, start_ns: int, end_ns: int) -> list[LogRecord]:
        """The records from start_ns to end_ns, and none outside them, whatever Loki returns."""
        params = {
            "query": query,
            "start": str(start_ns),
            "end": str(end_ns),
            "limit": "500",
            "direction": "forward",
        }
        response = self.http.request(
            "GET", f"{LOKI}/loki/api/v1/query_range?" + urllib.parse.urlencode(params)
        )
        if response.status != 200:
            raise SourceError(f"Loki answered {response.status}")
        return [
            r for r in loki_records(response.json()) if start_ns <= r.ts_ns <= end_ns
        ]

    def op_log(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        query, expect = str(op["query"]), op.get("expect", {})
        window = self.window(op, started, 60)
        start_ns = since_ns(window.opens_s)
        fields = list(op.get("fields", []))
        gap = expect.get("gap")
        anchor_ns = None
        if gap:
            anchor = self.results.get(str(gap["from"]), {}).get("records") or []
            anchor_ns = anchor[0]["ts_ns"] if anchor else None

        def chosen(records: list[LogRecord]) -> tuple[bool, list[LogRecord]]:
            records = [
                r
                for r in records
                if all(
                    r.fields.get(k) == str(v)
                    for k, v in expect.get("match", {}).items()
                )
            ]
            picked: list[LogRecord] = []
            ok = bool(records)
            if "each" in expect:
                ((name, values),) = expect["each"].items()
                for value in values:
                    hit = next(
                        (r for r in records if r.fields.get(name) == value), None
                    )
                    if hit is None:
                        ok = False
                        continue
                    picked.append(hit)
                    pattern = expect.get("each_regex", {})
                    for key, by_value in pattern.items():
                        if value in by_value and not re.search(
                            by_value[value], hit.fields.get(key, "")
                        ):
                            ok = False
            else:
                picked = records[:1]
            for key, ceiling in expect.get("max", {}).items():
                for record in picked:
                    try:
                        if number(record.fields.get(key)) > float(ceiling):
                            ok = False
                    except SourceError:
                        ok = False
            if gap:
                ok = (
                    ok
                    and bool(picked)
                    and anchor_ns is not None
                    and abs(picked[0].ts_ns - anchor_ns) <= gap["max_s"] * 1e9
                )
            return ok, picked

        def attempt(cutoff: float) -> tuple[bool, Any]:
            return chosen(self.loki(query, start_ns, ns(cutoff)))

        outcome = poll(
            attempt,
            due_s=window.due_s,
            every_s=EVERY_S["log"],
            clock=self.clock,
            settle_s=SETTLE_S,
        )
        records = [
            {
                "ts": iso(r.ts_ns),
                "ts_ns": r.ts_ns,
                **{k: r.fields.get(k) for k in fields},
            }
            for r in outcome.value or []
        ]
        result = {
            "ok": outcome.ok,
            "records": records,
            **self.timing(window, outcome),
        }
        if gap and records and anchor_ns is not None:
            result["gap_s"] = round(abs(records[0]["ts_ns"] - anchor_ns) / 1e9, 3)
        if outcome.error:
            result["error"] = outcome.error
        return result

    def op_trace(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        if not self.langfuse_auth:
            return {
                "ok": False,
                "error": "no Langfuse API keys: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are unset in the probe's "
                "environment (contracts/env-files.md §5)",
            }
        trace_id = str(op["trace_id"])
        if not re.fullmatch(r"[0-9a-f]{32}", trace_id):
            raise Usage("a trace ID is 32 lowercase hex characters")
        token = base64.b64encode(":".join(self.langfuse_auth).encode("utf-8")).decode(
            "ascii"
        )
        headers = {"Authorization": f"Basic {token}"}
        expect = op.get("expect", {})
        via: dict[str, str] = {}

        def observations() -> list[dict[str, Any]]:
            # Langfuse v4 runs in events_only mode, where /api/public/traces and /api/public/observations answer 404
            # (research.md, from T149). Its v2 list answers, filtered to the trace, with only the field groups asked
            # for: usage carries the cost, and metadata the span's attributes (T187). Until the trace is ingested,
            # the list is empty.
            found: list[dict[str, Any]] = []
            cursor: str | None = None
            for _ in range(TRACE_PAGES):
                query = {
                    "traceId": trace_id,
                    "fields": TRACE_FIELDS,
                    "expandMetadata": TRACE_EXPAND,
                    "limit": TRACE_LIMIT,
                }
                if cursor is not None:
                    query["cursor"] = cursor
                url = (
                    f"{LANGFUSE}/api/public/v2/observations?"
                    + urllib.parse.urlencode(query)
                )
                response = self.http.request("GET", url, headers=headers)
                if response.status != 200:
                    raise SourceError(f"Langfuse answered {response.status}")
                body = response.json()
                found.extend(langfuse_observations(body))
                meta = body.get("meta") if isinstance(body, dict) else None
                cursor = meta.get("cursor") if isinstance(meta, dict) else None
                if not isinstance(cursor, str) or not cursor:
                    return found
            raise SourceError(
                f"Langfuse listed more than {TRACE_PAGES} pages of one trace's observations"
            )

        # A trace's window is the time Langfuse may take to ingest it, from the call: it has no evaluation time to ask
        # for, so a try counts what is there.
        window = self.window(op, started, 60)

        def attempt(cutoff: float) -> tuple[bool, Any]:
            first: dict[str, Any] | None = None
            for observation in observations():
                ok, observed, derived = generation_match(observation, expect)
                if ok:
                    via.clear()
                    via.update(derived)
                    return True, observed
                if (
                    first is None
                    and str(observation.get("type", "")).upper() == "GENERATION"
                ):
                    first = observed
            return False, first

        outcome = poll(
            attempt,
            due_s=window.due_s,
            every_s=EVERY_S["trace"],
            clock=self.clock,
        )
        result = {
            "ok": outcome.ok,
            "trace_id": trace_id,
            "observed": outcome.value,
            "via": dict(via),
            **self.timing(window, outcome),
        }
        if outcome.error:
            result["error"] = outcome.error
        return result

    def arrived_by(self, received: object, cutoff: float) -> bool:
        """A receiver's own receipt time is by the cutoff. One it doesn't give counts as now, so it holds only while the
        window is open."""
        at = epoch_s(received)
        return (self.clock.wall() if at is None else at) <= cutoff

    def due(self, op: Mapping[str, Any], window: Window) -> float:
        """A receiver check's deadline; with "absent", now: the alert must not be there at all, and one look is enough,
        since the delivery records already say it went out (--delivery real)."""
        return self.clock.wall() if op.get("absent") is True else window.due_s

    def op_telegram(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        key = str(op["key"])
        absent = op.get("absent") is True
        window = self.window(op, started, 300)

        def attempt(cutoff: float) -> tuple[bool, Any]:
            response = self.http.request("GET", f"{TELEGRAM}/messages")
            if response.status != 200:
                raise SourceError(f"the Telegram stand-in answered {response.status}")
            found = telegram_find(response.json(), key)
            if absent or found is None:
                return absent and found is None, found
            return self.arrived_by(found.get("received_at"), cutoff), found

        outcome = poll(
            attempt,
            due_s=self.due(op, window),
            every_s=EVERY_S["telegram"],
            clock=self.clock,
        )
        found = outcome.value or {}
        result = {
            "ok": outcome.ok,
            "key": key,
            **({"absent": True} if absent else {}),
            **found,
            **self.timing(window, outcome),
        }
        if outcome.error:
            result["error"] = outcome.error
        return result

    def op_mailpit(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        key = str(op["key"])
        absent = op.get("absent") is True
        headers_of: dict[str, Any] = {}
        texts_of: dict[str, Any] = {}

        def get(path: str) -> Any:
            response = self.http.request("GET", f"{MAILPIT}{path}")
            if response.status != 200:
                raise SourceError(f"Mailpit answered {response.status}")
            return response.json()

        window = self.window(op, started, 300)

        def attempt(cutoff: float) -> tuple[bool, Any]:
            messages = mailpit_messages(get("/api/v1/messages?limit=200"))
            found: dict[str, Any] | None = None
            for message in messages:
                ident = message["ID"]
                if ident not in headers_of:
                    headers_of[ident] = get(
                        f"/api/v1/message/{urllib.parse.quote(ident)}/headers"
                    )
                if header_matches(headers_of[ident], key):
                    found = {
                        "matched_by": "header",
                        "received_at": message.get("Created"),
                    }
                    break
            for message in messages if found is None else []:
                ident = message["ID"]
                if ident not in texts_of:
                    texts_of[ident] = get(
                        f"/api/v1/message/{urllib.parse.quote(ident)}"
                    )
                if text_matches(texts_of[ident], key):
                    found = {
                        "matched_by": "text",
                        "received_at": message.get("Created"),
                    }
                    break
            if absent or found is None:
                return absent and found is None, found
            return self.arrived_by(found["received_at"], cutoff), found

        outcome = poll(
            attempt,
            due_s=self.due(op, window),
            every_s=EVERY_S["mailpit"],
            clock=self.clock,
        )
        result = {
            "ok": outcome.ok,
            "key": key,
            **({"absent": True} if absent else {}),
            **(outcome.value or {}),
            **self.timing(window, outcome),
        }
        if outcome.error:
            result["error"] = outcome.error
        return result

    def op_audit(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        """The store's audit row for an operator action: its actor, time, reason, and figures (FR-034)."""
        action, audit_id = str(op["action"]), op["audit_id"]
        if not LABEL_RE.fullmatch(action):
            raise Usage("not an audit action")
        actor = re.compile(ACTOR_RE.format(stack=re.escape(self.stack)))
        expect = op.get("expect", {})
        window = self.window(op, started, 10)

        def attempt(cutoff: float) -> tuple[bool, Any]:
            answer = self.admin_call("GET", f"/admin/audit?action={action}&limit=20")
            if answer["status"] != 200:
                raise SourceError(
                    f"/admin/audit answered {answer['status']} {answer['error']}"
                )
            entries = (answer["body"] or {}).get("entries")
            if not isinstance(entries, list):
                raise SourceError("/admin/audit answered no entries")
            entry = next(
                (e for e in entries if isinstance(e, dict) and e.get("id") == audit_id),
                None,
            )
            if entry is None:
                return False, None
            ok = (
                entry.get("action") == action
                and isinstance(entry.get("actor"), str)
                and actor.fullmatch(entry["actor"]) is not None
                and isinstance(entry.get("ts"), str)
                and bool(entry["ts"])
                and ("reason" not in op or entry.get("reason") == op["reason"])
                and not misses(entry, expect)
            )
            return ok, {
                "id": entry.get("id"),
                "actor": entry.get("actor"),
                "ts": entry.get("ts"),
            }

        outcome = poll(
            attempt,
            due_s=window.due_s,
            every_s=EVERY_S["audit"],
            clock=self.clock,
        )
        result = {
            "ok": outcome.ok,
            **(outcome.value or {}),
            **self.timing(window, outcome),
        }
        if outcome.error:
            result["error"] = outcome.error
        return result

    def op_incident(self, op: dict[str, Any], started: float) -> dict[str, Any]:
        """GET /admin/incidents' draft for the ceiling and period: written, unchanged, with every evidence field."""
        ceiling, period_key = str(op["ceiling"]), str(op["period_key"])
        kwargs = {
            "ceiling": ceiling,
            "period_key": period_key,
            "trace_id": str(op["trace_id"]),
            "trip_key": str(op["trip_key"]),
        }
        window = self.window(op, started, 330)

        def attempt(cutoff: float) -> tuple[bool, Any]:
            # The drafts' content is read raw and checked here, and never printed: only the checks' booleans are.
            answer = self.admin_raw("GET", "/admin/incidents?limit=5")
            if answer["status"] != 200:
                raise SourceError(
                    f"/admin/incidents answered {answer['status']} {answer['error']}"
                )
            raw = answer["body"]
            incidents = raw.get("incidents") if isinstance(raw, dict) else None
            if not isinstance(incidents, list):
                raise SourceError("/admin/incidents answered no incidents")
            for incident in incidents:
                if (
                    isinstance(incident, dict)
                    and incident.get("ceiling") == ceiling
                    and incident.get("period_key") == period_key
                ):
                    found = incident_checks(incident, **kwargs)
                    summary = {
                        k: incident.get(k) for k in ("id", "status", "sha256", "path")
                    }
                    return all(found.values()), {**summary, "checks": found}
            return False, None

        outcome = poll(
            attempt,
            due_s=window.due_s,
            every_s=EVERY_S["incident"],
            clock=self.clock,
        )
        result = {
            "ok": outcome.ok,
            **(outcome.value or {}),
            **self.timing(window, outcome),
        }
        if outcome.error:
            result["error"] = outcome.error
        return result


# --- the operator CLI, for the admin listener -----------------------------------------------------------------------


def load_operator() -> Any:
    """scripts/operator.py by path: /app/operator.py beside this file in the probe's image, or the tree's copy."""
    here = Path(__file__).resolve().parent
    for candidate in (here / "operator.py", here.parent / "scripts" / "operator.py"):
        if candidate.is_file():
            spec = importlib.util.spec_from_file_location("h4_operator", candidate)
            if spec is None or spec.loader is None:
                break
            module = importlib.util.module_from_spec(spec)
            sys.modules.setdefault("h4_operator", module)
            spec.loader.exec_module(module)
            return module
    raise Usage(
        "the operator CLI isn't beside the probe (evals/Dockerfile.probe copies it to /app/operator.py)"
    )


def make_admin(stack: str, token: str, operator: Any = None) -> Any:
    """The stack's admin listener in the stack's network, with the token from standard input (operator-admin.md §6)."""
    operator = operator or load_operator()
    return operator.AdminClient(
        stack, url=ADMIN, token_stdin=True, stdin=io.StringIO(token + "\n")
    )


# --- the command line -----------------------------------------------------------------------------------------------


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        raise Usage(message)


def read_ops(document: str) -> list[dict[str, Any]]:
    try:
        parsed = json.loads(document)
    except ValueError:
        raise Usage("the operations aren't JSON") from None
    ops = parsed.get("ops") if isinstance(parsed, dict) else None
    if not isinstance(ops, list) or not all(isinstance(op, dict) for op in ops):
        raise Usage('standard input holds the token line, then {"ops": [...]}')
    for op in ops:
        if op.get("op") not in ACTIONS + CHECKS:
            raise Usage(f"no such operation: {shorten(str(op.get('op')), 40)}")
    return ops


def main(
    argv: list[str] | None = None,
    *,
    stdin: TextIO | None = None,
    stdout: TextIO | None = None,
    http: Any = None,
    clock: Any = None,
    environ: Mapping[str, str] | None = None,
    admin_factory: Callable[[str, str], Any] | None = None,
) -> int:
    out = stdout or sys.stdout
    environ = os.environ if environ is None else environ
    step = "?"
    operator: Any = None
    try:
        parser = Parser(
            prog="breach_probe.py",
            description="The breach test's probe (plan §8).",
            allow_abbrev=False,
        )
        parser.add_argument("step", help="the breach test's step, for the output")
        parser.add_argument("--stack", choices=STACKS, required=True)
        args = parser.parse_args(argv)
        step = args.step if re.fullmatch(r"[0-9a-z]{1,8}", args.step) else "?"
        raw = (stdin or sys.stdin).read(MAX_INPUT)
        token, _, document = raw.partition("\n")
        token = token.strip()
        ops = read_ops(document)
        if not token and any(op["op"] in NEEDS_ADMIN for op in ops):
            raise Usage(
                "an admin operation needs the operator token on the first line of standard input"
            )
        admin = None
        if token and admin_factory is not None:
            admin = admin_factory(args.stack, token)
        elif token:
            operator = load_operator()
            admin = make_admin(args.stack, token, operator)
        public = environ.get("LANGFUSE_PUBLIC_KEY", "")
        secret = environ.get("LANGFUSE_SECRET_KEY", "")
        probe = Probe(
            args.stack,
            http=http or Http(),
            admin=admin,
            clock=clock or Clock(),
            langfuse_auth=(public, secret) if public and secret else None,
            out=out,
            admin_error=operator.AdminError if operator else _NeverRaised,
        )
    except startup_errors(operator) as problem:
        # The CLI's token problems name the file or line, never the token (operator-admin.md §6). The reason goes on the
        # done line too, the only output the orchestrator reads, with control characters replaced.
        reason = shorten(str(problem))
        print(f"breach_probe.py: {reason}", file=sys.stderr)
        done = {MARK: 1, "step": step, "done": True, "exit": 2, "error": reason}
        print(json.dumps(done), file=out, flush=True)
        return 2
    return probe.run(ops, step)


def startup_errors(operator: Any) -> tuple[type[BaseException], ...]:
    """What can stop the probe before its first operation: its own usage, its input, and the operator CLI's refusals
    of the token line or the stack (its Usage is a ValueError)."""
    found: tuple[type[BaseException], ...] = (Usage, ValueError, OSError)
    return found + ((operator.TokenProblem,) if operator is not None else ())


class _NeverRaised(Exception):
    """A stand-in admin client's errors: with no operator CLI loaded, nothing raises its AdminError."""


if __name__ == "__main__":
    sys.exit(main())
