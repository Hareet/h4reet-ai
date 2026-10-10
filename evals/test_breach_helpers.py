"""Tests for evals/breach_probe.py's assertion helpers (spec 000 FR-036; plan §8; tasks.md T071).

The probe runs inside a stack's network, where none of this can run, so every source here is a stand-in: Prometheus,
Loki, Langfuse, the stand-ins, and the admin listener answer from canned bodies through a fake HTTP client, and time
comes from a fake clock that moves only when the probe sleeps. One test runs the real HTTP client against a stub on
127.0.0.1, with a proxy set in the environment, to prove the probe ignores it.

The T, M, and L sources: Langfuse's traces, Prometheus's instant queries, and Loki's log records (with the stand-ins'
and the store's own records, which the L assertions also read). The timing windows: each check polls until its
condition holds or its window passes, never counts a record or a sample from before the action it follows, and
reports how long it waited.
"""

from __future__ import annotations

import base64
import http.server
import importlib.util
import io
import json
import sys
import threading
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "h4_breach_probe", REPO / "evals" / "breach_probe.py"
)
assert SPEC and SPEC.loader
probe = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = probe
SPEC.loader.exec_module(probe)
operator = probe.load_operator()

KEY = "dev-cpu:warn:day:2026-11-20"
TRACE = "4bf92f3577b34da6a3ce929d0e0e4736"
# The dev-cpu dummy's shape, built at run time: this file holds no token.
TOKEN = "h4op_devcpu_" + "A" * 43
QUERY = 'max(h4_meter_spend_usd{h4_meter="day"})'
REASON = "breach test step 6: a same-day renewal"
T0 = 1_800_000_001_000_000_000  # a record's time, in ns, just after the actions below
AT_START = {
    "after_s": 1_800_000_000.0,
    "after_end_s": 1_800_000_000.0,
}  # an action at the fake clock's start


class Clock:
    """Time that moves only when the probe sleeps."""

    def __init__(self, wall: float = 1_800_000_000.0) -> None:
        self.now = 0.0
        self.start_wall = wall
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def wall(self) -> float:
        return self.start_wall + self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


Handler = Callable[[str, str, dict[str, list[str]], Any, dict[str, str]], Any]


class Http:
    """A fake HTTP client: (method, URL prefix) to a handler, which returns (status, JSON) or raises Unreachable."""

    def __init__(self) -> None:
        self.routes: dict[tuple[str, str], Handler] = {}
        self.calls: list[dict[str, Any]] = []

    def on(self, method: str, url: str, handler: Handler) -> None:
        self.routes[(method, url)] = handler

    def request(
        self,
        method: str,
        url: str,
        *,
        body: Any = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        parts = urllib.parse.urlsplit(url)
        base = f"{parts.scheme}://{parts.netloc}{parts.path}"
        query = urllib.parse.parse_qs(parts.query)
        self.calls.append(
            {
                "method": method,
                "url": base,
                "query": query,
                "body": body,
                "headers": headers or {},
            }
        )
        for (m, prefix), handler in self.routes.items():
            if m == method and base.startswith(prefix):
                status, payload = handler(method, base, query, body, headers or {})
                data = (
                    payload
                    if isinstance(payload, bytes)
                    else json.dumps(payload).encode()
                )
                return probe.Response(status, {}, data)
        raise probe.Unreachable(f"nothing at {base}")


def fixed(status: int, payload: Any) -> Handler:
    return lambda *_: (status, payload)


def sequence(*answers: Any) -> Callable[..., Any]:
    """Each call takes the next answer; the last repeats."""
    queue = list(answers)

    def handler(*_: Any) -> Any:
        return queue.pop(0) if len(queue) > 1 else queue[0]

    return handler


def vector(*samples: tuple[dict[str, str], str]) -> dict[str, Any]:
    return {
        "status": "success",
        "data": {
            "resultType": "vector",
            "result": [
                {"metric": m, "value": [1_800_000_000.0, v]} for m, v in samples
            ],
        },
    }


def streams(
    *records: tuple[int, dict[str, str]], third: bool = False
) -> dict[str, Any]:
    result = []
    for ts, fields in records:
        if third:
            values = [[str(ts), "a fixed sentence", {"structuredMetadata": fields}]]
            result.append({"stream": {"service_name": "gateway"}, "values": values})
        else:
            stream = {"service_name": "gateway", **fields}
            result.append({"stream": stream, "values": [[str(ts), "a fixed sentence"]]})
    return {"status": "success", "data": {"resultType": "streams", "result": result}}


@dataclass
class Rig:
    probe: Any
    http: Http
    clock: Clock
    out: io.StringIO

    def run(self, ops: list[dict[str, Any]], step: str = "x") -> int:
        return self.probe.run(ops, step)

    def results(self) -> list[dict[str, Any]]:
        lines = [json.loads(line) for line in self.out.getvalue().splitlines() if line]
        assert all(line[probe.MARK] == 1 for line in lines)
        return [line["result"] for line in lines if "result" in line]

    def result(self) -> dict[str, Any]:
        (only,) = self.results()
        return only


def make(
    *,
    admin: Any = None,
    keys: tuple[str, str] | None = ("pk-lf-public", "sk-lf-secret"),
) -> Rig:
    clock, http, out = Clock(), Http(), io.StringIO()
    p = probe.Probe(
        "dev-cpu",
        http=http,
        admin=admin,
        clock=clock,
        langfuse_auth=keys,
        out=out,
        admin_error=operator.AdminError,
    )
    return Rig(p, http, clock, out)


# --- the timing windows ---------------------------------------------------------------------------------------------


def test_poll_tries_until_the_condition_holds() -> None:
    clock = Clock()
    seen: list[float] = []

    def attempt(cutoff: float) -> tuple[bool, Any]:
        seen.append(clock.now)
        assert (
            cutoff == clock.wall()
        )  # inside the window, a try sees the sources as they are now
        return clock.now >= 9, clock.now

    outcome = probe.poll(attempt, due_s=clock.wall() + 60, every_s=3, clock=clock)
    assert outcome.ok and outcome.value == 9 and outcome.waited_s == 9
    assert seen == [0, 3, 6, 9]
    assert outcome.attempts == 4


def test_poll_tries_last_at_the_deadline_and_reports_the_miss() -> None:
    clock = Clock()
    seen: list[tuple[float, float]] = []

    def attempt(cutoff: float) -> tuple[bool, Any]:
        seen.append((clock.now, cutoff - clock.start_wall))
        return False, "observed"

    outcome = probe.poll(attempt, due_s=clock.wall() + 10, every_s=3, clock=clock)
    assert not outcome.ok
    # Never past the window, and once at its end.
    assert seen == [(0, 0), (3, 3), (6, 6), (9, 9), (10, 10)]
    assert outcome.waited_s == 10 and outcome.value == "observed"


def test_the_last_try_waits_for_late_arrivals_and_asks_for_the_deadline() -> None:
    # A sample or record stamped before the deadline can arrive seconds after it (contracts/telemetry.md §6.5: the
    # collector's 2 s batch, then ingestion). The last try waits settle_s past the end, and still asks the sources what
    # they held at the deadline itself.
    clock = Clock()
    seen: list[tuple[float, float]] = []

    def attempt(cutoff: float) -> tuple[bool, Any]:
        seen.append((clock.now, cutoff - clock.start_wall))
        return False, None

    probe.poll(attempt, due_s=clock.wall() + 4, every_s=3, clock=clock, settle_s=5)
    assert seen == [(0, 0), (3, 3), (9, 4)]


def test_a_check_that_starts_after_its_deadline_tries_once_as_of_the_deadline() -> None:
    clock = Clock()
    cutoffs: list[float] = []

    def attempt(cutoff: float) -> tuple[bool, Any]:
        cutoffs.append(cutoff)
        return True, "it held then"

    deadline = clock.wall() - 40  # the window closed 40 s before the check began
    outcome = probe.poll(attempt, due_s=deadline, every_s=2, clock=clock, settle_s=5)
    assert outcome.ok and cutoffs == [deadline] and clock.sleeps == []


def test_poll_with_no_window_tries_once() -> None:
    clock = Clock()
    outcome = probe.poll(
        lambda cutoff: (False, None), due_s=clock.wall(), every_s=2, clock=clock
    )
    assert outcome.attempts == 1 and clock.sleeps == []


def test_poll_counts_an_unreachable_source_as_a_miss_and_tries_again() -> None:
    clock = Clock()

    def attempt(cutoff: float) -> tuple[bool, Any]:
        if clock.now < 4:
            raise probe.Unreachable("connection refused")
        return True, "up"

    assert probe.poll(attempt, due_s=clock.wall() + 30, every_s=2, clock=clock).ok

    def broken(cutoff: float) -> tuple[bool, Any]:
        raise probe.SourceError("not JSON")

    failed = probe.poll(broken, due_s=clock.wall() + 2, every_s=1, clock=clock)
    assert not failed.ok and failed.error == "SourceError: not JSON"


def test_a_window_starts_a_little_before_its_action() -> None:
    assert probe.since_ns(1_800_000_000.0, slack_s=2) == 1_799_999_998_000_000_000


# --- windows timed from the action, not from the check (round 1's review) -----------------------------------------


def test_a_check_is_timed_from_the_action_it_follows_not_from_its_own_start() -> None:
    # US2-1: the daily meter shows 0.10 "within 60 s" of the call. A trace that takes 55 s to reach Langfuse mustn't
    # give the meter's check a window of its own from then: 2b closes 60 s after the call, whether the operation names
    # the call or just follows it. A meter that shows 0.10 only at 110 s misses.
    for anchor in ({}, {"after": "s2.spend"}):
        admin, _ = synthetic([batch(1)])
        rig = make(admin=admin)
        start = rig.clock.wall()

        def trace(*_: Any, rig: Rig = rig, start: float = start) -> tuple[int, Any]:
            if rig.clock.wall() < start + 55:
                return 200, page()
            return 200, page(generation(**{"h4.cost.usd": 0.1}))

        def meter(
            method: str,
            url: str,
            query: dict[str, list[str]],
            body: Any,
            headers: dict[str, str],
            rig: Rig = rig,
            start: float = start,
        ) -> tuple[int, Any]:
            at = float(query["time"][0]) if "time" in query else rig.clock.wall()
            return 200, vector(({}, "0.1" if at >= start + 110 else "0"))

        rig.http.on("GET", TRACE_URL, trace)
        rig.http.on("GET", f"{probe.PROMETHEUS}/api/v1/query", meter)
        ops = [
            {**spend_op(1, answered=1, stopped=None), "id": "s2.spend"},
            {
                "op": "trace",
                "assert": "2a",
                "trace_id": TRACE,
                "expect": {"h4.cost.usd": 0.1},
                "within_s": 60,
            },
            {
                "op": "metric",
                "assert": "2b",
                "query": QUERY,
                "expect": {"value": 0.1},
                "within_s": 60,
                **anchor,
            },
        ]
        rig.run(ops, "2")
        spent, traced, metered = rig.results()
        assert spent["ok"] and traced["ok"] and traced["waited_s"] == 57
        assert not metered["ok"], (anchor, metered)
        # Its last try asked for the meter as it stood 60 s after the call.
        assert float(rig.http.calls[-1]["query"]["time"][0]) == pytest.approx(
            start + 60
        )


def test_a_check_with_no_action_to_be_timed_from_is_refused() -> None:
    # Never its own start: a check that names no action, in a call that ran none, is a usage error and a miss.
    rig = make()
    rig.http.on(
        "GET", f"{probe.PROMETHEUS}/api/v1/query", fixed(200, vector(({}, "0.1")))
    )
    rig.run(
        [{"op": "metric", "assert": "2b", "query": QUERY, "expect": {"value": 0.1}}],
        "2",
    )
    result = rig.result()
    assert not result["ok"] and result["error"].startswith(
        "usage: a check is timed from the action it measures"
    )
    assert rig.http.calls == []


@pytest.mark.parametrize(("appears_s", "ok"), [(30, True), (80, False)])
def test_a_late_check_asks_prometheus_what_it_showed_at_the_deadline(
    appears_s: int, ok: bool
) -> None:
    # A check that starts after its window has closed, behind slower ones, still asks what held by the deadline:
    # Prometheus evaluates the query at that moment, so a value that came too late misses though it shows now.
    rig = make()
    action = rig.clock.wall() - 100  # the action ended 100 s before the check began

    def meter(
        method: str,
        url: str,
        query: dict[str, list[str]],
        body: Any,
        headers: dict[str, str],
    ) -> tuple[int, Any]:
        at = float(query["time"][0]) if "time" in query else rig.clock.wall()
        return 200, vector(({}, "0.1" if at >= action + appears_s else "0"))

    rig.http.on("GET", f"{probe.PROMETHEUS}/api/v1/query", meter)
    op = {
        "op": "metric",
        "assert": "2b",
        "query": QUERY,
        "expect": {"value": 0.1},
        "after_s": action,
        "after_end_s": action,
        "within_s": 60,
    }
    rig.run([op], "2")
    assert rig.result()["ok"] is ok
    asked = [float(c["query"].get("time", ["0"])[0]) for c in rig.http.calls]
    assert asked == [pytest.approx(action + 60)]


def test_a_late_log_check_counts_no_record_from_after_its_deadline() -> None:
    # An alert delivered 400 s after its action is late (FR-032: within 5 minutes), however short its own lag: the
    # window ends at the deadline, in Loki's query and in what the probe keeps.
    rig = make()
    action = rig.clock.wall() - 450
    records = [
        delivered(int((action + 10) * 1e9), "telegram", lag="1.0"),
        delivered(int((action + 400) * 1e9), "email", lag="1.0"),
    ]

    def loki(
        method: str,
        url: str,
        query: dict[str, list[str]],
        body: Any,
        headers: dict[str, str],
    ) -> tuple[int, Any]:
        start, end = int(query["start"][0]), int(query["end"][0])
        return 200, streams(*[r for r in records if start <= r[0] <= end])

    rig.http.on("GET", LOKI_URL, loki)
    rig.run([{**delivery_op(), "after_s": action, "after_end_s": action}], "3")
    result = rig.result()
    assert not result["ok"]
    assert [r["channel"] for r in result["records"]] == ["telegram"]
    end = int(rig.http.calls[-1]["query"]["end"][0])
    assert end == round((action + 300) * 1000) * 1_000_000


def test_a_log_check_drops_late_records_whatever_its_source_returns() -> None:
    # Loki's end bounds what it returns; the probe holds the window's end itself as well, against a source, a proxy,
    # or a Loki version that returns later entries anyway (round 2's review).
    rig = make()
    action = rig.clock.wall() - 450
    late = streams(
        delivered(int((action + 10) * 1e9), "telegram", lag="1.0"),
        delivered(int((action + 400) * 1e9), "email", lag="1.0"),
    )
    rig.http.on("GET", LOKI_URL, fixed(200, late))  # whatever start and end say
    rig.run([{**delivery_op(), "after_s": action, "after_end_s": action}], "3")
    result = rig.result()
    assert not result["ok"]
    assert [r["channel"] for r in result["records"]] == ["telegram"]


@pytest.mark.parametrize(("arrived_s", "ok"), [(200, True), (320, False)])
def test_a_receiver_holds_an_alert_only_if_it_arrived_by_the_deadline(
    arrived_s: int, ok: bool
) -> None:
    # plan §8 step 3: both stand-ins show the warning within 300 s of the action, by their own receipt times.
    rig = make()
    action = rig.clock.wall() - 400
    received = probe.iso(round((action + arrived_s) * 1000) * 1_000_000)
    message = {"message_id": 9, "text": alert_text(KEY), "received_at": received}
    rig.http.on(
        "GET", f"{probe.TELEGRAM}/messages", fixed(200, {"messages": [message]})
    )
    created = (
        received[:19] + ".123456789+00:00"
    )  # Mailpit's RFC 3339, to the nanosecond
    rig.http.on(
        "GET",
        f"{probe.MAILPIT}/api/v1/messages",
        fixed(200, {"messages": [{"ID": "m1", "Created": created}], "total": 1}),
    )
    rig.http.on(
        "GET",
        f"{probe.MAILPIT}/api/v1/message/m1/headers",
        fixed(200, {"X-H4-Alert-Id": [KEY]}),
    )
    window = {"after_s": action, "after_end_s": action, "within_s": 300}
    rig.run(
        [
            {"op": "telegram", "assert": "3b", "key": KEY, **window},
            {"op": "mailpit", "assert": "3b", "key": KEY, **window},
        ],
        "3",
    )
    assert [r["ok"] for r in rig.results()] == [ok, ok]


def test_an_rfc3339_time_reads_to_the_second_in_any_zone() -> None:
    assert probe.epoch_s("2027-01-15T08:00:00Z") == 1_800_000_000.0
    assert probe.epoch_s("2027-01-15T09:00:00.5+01:00") == 1_800_000_000.5
    assert probe.epoch_s("2027-01-15T08:00:00.123456789+00:00") == pytest.approx(
        1_800_000_000.123456
    )
    for bad in ("t1", "", None, 5, "2027-01-15 08:00:00"):
        assert probe.epoch_s(bad) is None


# --- M: Prometheus ------------------------------------------------------------------------------------------------


def test_prometheus_vectors_and_scalars_parse() -> None:
    samples = probe.prom_samples(vector(({"h4_meter": "day"}, "0.1")))
    assert samples == [probe.Sample({"h4_meter": "day"}, 0.1)]
    assert probe.single(samples) == 0.1
    assert probe.single([]) is None
    scalar = {
        "status": "success",
        "data": {"resultType": "scalar", "result": [1.0, "12.5"]},
    }
    assert probe.single(probe.prom_samples(scalar)) == 12.5
    with pytest.raises(probe.SourceError):
        probe.single(probe.prom_samples(vector(({"a": "1"}, "1"), ({"a": "2"}, "2"))))
    matrix = {"status": "success", "data": {"resultType": "matrix", "result": []}}
    for bad in ({"status": "error", "error": "parse error"}, {"data": {}}, [], matrix):
        with pytest.raises(probe.SourceError):
            probe.prom_samples(bad)


def test_a_one_hot_query_gives_its_labels() -> None:
    labels = {"deployment_environment_name": "dev-cpu", "h4_state": "degraded"}
    samples = probe.prom_samples(vector((labels, "1")))
    assert probe.label_set(samples, "h4_state") == {"degraded"}


def test_a_metric_check_waits_for_its_value() -> None:
    rig = make()
    zero, tenth = (200, vector(({}, "0"))), (200, vector(({}, "0.1")))
    rig.http.on("GET", f"{probe.PROMETHEUS}/api/v1/query", sequence(zero, zero, tenth))
    op = {
        "op": "metric",
        **AT_START,
        "id": "m",
        "assert": "2b",
        "query": QUERY,
        "expect": {"value": 0.1},
        "within_s": 60,
    }
    rig.run([op], "2")
    result = rig.result()
    assert result["ok"] and result["observed"] == 0.1 and result["assert"] == "2b"
    assert result["waited_s"] == 4  # three tries, two seconds apart
    assert rig.http.calls[0]["query"]["query"] == [QUERY]


def test_a_metric_check_that_never_holds_misses_at_its_window() -> None:
    rig = make()
    rig.http.on(
        "GET", f"{probe.PROMETHEUS}/api/v1/query", fixed(200, vector(({}, "0.2")))
    )
    op = {
        "op": "metric",
        **AT_START,
        "assert": "2b",
        "query": QUERY,
        "expect": {"value": 0.1},
        "within_s": 60,
    }
    code = rig.run([op], "2")
    result = rig.result()
    # Its last try, 5 s past the window for samples still arriving, asks for the window's end.
    assert not result["ok"] and result["observed"] == 0.2 and result["waited_s"] == 65
    assert float(rig.http.calls[-1]["query"]["time"][0]) == rig.clock.start_wall + 60
    assert code == 0  # a missed check doesn't stop the step; only a failed action does


def test_metric_expectations() -> None:
    rig = make()
    warn = 'max(h4_meter_warn_usd{h4_meter="day"})'
    answers = {
        QUERY: vector(({}, "3.5")),
        warn: vector(({}, "3.5")),
        "one-hot": vector(({"h4_state": "normal"}, "1")),
    }
    rig.http.on(
        "GET",
        f"{probe.PROMETHEUS}/api/v1/query",
        lambda m, u, q, b, h: (200, answers[q["query"][0]]),
    )
    rig.run(
        [
            {
                "op": "metric",
                **AT_START,
                "query": QUERY,
                "expect": {"at_least": warn},
                "within_s": 0,
            },
            {
                "op": "metric",
                **AT_START,
                "query": "one-hot",
                "expect": {"labels": {"h4_state": ["normal"]}},
                "within_s": 0,
            },
            {
                "op": "metric",
                **AT_START,
                "query": "one-hot",
                "expect": {"labels": {"h4_state": ["degraded"]}},
                "within_s": 0,
            },
        ]
    )
    assert [r["ok"] for r in rig.results()] == [True, True, False]


def one_check(answer: dict[str, Any], expect: dict[str, Any], *queries: str) -> bool:
    """One metric check against fixed answers by query: whether it held."""
    rig = make()
    rig.http.on(
        "GET",
        f"{probe.PROMETHEUS}/api/v1/query",
        lambda m, u, q, b, h: (200, answer[q["query"][0]]),
    )
    op = {"op": "metric", "query": queries[0], "expect": expect, "within_s": 0}
    rig.run([{**op, **AT_START}])
    return bool(rig.result()["ok"])


def test_a_one_hot_row_needs_exactly_its_labels() -> None:
    # The kill switch both normal and degraded at once isn't normal: the labels must be the expected set, not hold it.
    both = vector(({"h4_state": "normal"}, "1"), ({"h4_state": "degraded"}, "1"))
    labels = {"labels": {"h4_state": ["normal"]}}
    assert not one_check({"one-hot": both}, labels, "one-hot")
    assert not one_check({"one-hot": vector()}, labels, "one-hot")


@pytest.mark.parametrize(
    ("spent", "ok"),
    [("3.5", True), ("3.4999995", True), ("3.499998", False), ("2.6", False)],
)
def test_at_least_holds_to_the_micro_usd(spent: str, ok: bool) -> None:
    # 3c: today's spend at or over its warning line, to a millionth of a dollar, the meters' own unit.
    warn = 'max(h4_meter_warn_usd{h4_meter="day"})'
    answers = {QUERY: vector(({}, spent)), warn: vector(({}, "3.5"))}
    assert one_check(answers, {"at_least": warn}, QUERY) is ok


def test_a_metric_check_ignores_samples_from_before_its_action() -> None:
    # After a restart the old process's last sample still holds the right value; only a sample taken after the action
    # proves the new one reports it (plan §8 step 5).
    rig = make()
    after = rig.clock.wall()
    stamps = iter(["1700000000", str(after + 1)])

    def answer(
        method: str,
        url: str,
        query: dict[str, list[str]],
        body: Any,
        headers: dict[str, str],
    ) -> tuple[int, Any]:
        if query["query"][0].startswith("max(timestamp("):
            return 200, vector(({}, next(stamps)))
        return 200, vector(({}, "1.5"))

    rig.http.on("GET", f"{probe.PROMETHEUS}/api/v1/query", answer)
    selector = 'h4_meter_spend_usd{h4_meter="fallback_day"}'
    op = {
        "op": "metric",
        **AT_START,
        "assert": "5a",
        "query": f"max({selector})",
        "expect": {"value": 1.5},
        "fresh": {"selector": selector, "after_s": after},
        "within_s": 60,
    }
    rig.run([op], "5")
    result = rig.result()
    assert result["ok"] and result["waited_s"] == 2
    assert result["fresh_s"] == pytest.approx(after + 1)


# --- L: Loki ------------------------------------------------------------------------------------------------------


def test_loki_records_parse_with_metadata_in_the_labels_or_beside_each_line() -> None:
    fields = {"event": "alert.delivered", "dedupe_key": KEY, "channel": "telegram"}
    for third in (False, True):
        (record,) = probe.loki_records(streams((T0, fields), third=third))
        assert record.ts_ns == T0
        assert {k: record.fields[k] for k in fields} == fields
    with pytest.raises(probe.SourceError):
        probe.loki_records(
            {"status": "success", "data": {"resultType": "matrix", "result": []}}
        )


def delivered(
    ts: int, channel: str, *, lag: str = "1.25", ref: str = "7"
) -> tuple[int, dict[str, str]]:
    return ts, {
        "event": "alert.delivered",
        "dedupe_key": KEY,
        "channel": channel,
        "attempt": "1",
        "lag_s": lag,
        "provider_ref": ref,
    }


def delivery_op(**extra: Any) -> dict[str, Any]:
    return {
        "op": "log",
        "id": "d",
        "assert": "3a",
        "query": probe.logql("dev-cpu", "alert.delivered", dedupe_key=KEY),
        "after_s": 1_800_000_000.0,
        "expect": {
            "each": {"channel": ["telegram", "email"]},
            "max": {"lag_s": 300},
            **extra,
        },
        "fields": ["channel", "attempt", "lag_s", "provider_ref"],
        "within_s": 300,
    }


LOKI_URL = f"{probe.LOKI}/loki/api/v1/query_range"


def test_a_log_check_waits_for_each_channel() -> None:
    rig = make()
    one = (200, streams(delivered(T0, "telegram")))
    both = (200, streams(delivered(T0, "telegram"), delivered(T0 + 9, "email")))
    rig.http.on("GET", LOKI_URL, sequence(one, both))
    rig.run([delivery_op()], "3")
    result = rig.result()
    assert result["ok"] and result["waited_s"] == 2
    assert [r["channel"] for r in result["records"]] == ["telegram", "email"]
    assert all("lag_s" in r and "ts" in r for r in result["records"])
    query = rig.http.calls[0]["query"]
    expected = (
        '{service_name="gateway", deployment_environment_name="dev-cpu"} '
        '| event="alert.delivered" | dedupe_key="dev-cpu:warn:day:2026-11-20"'
    )
    assert query["query"] == [expected]
    assert query["direction"] == ["forward"]
    assert int(query["start"][0]) == probe.since_ns(1_800_000_000.0)


def test_a_log_check_misses_one_channel_and_a_late_one() -> None:
    rig = make()
    rig.http.on("GET", LOKI_URL, fixed(200, streams(delivered(T0, "telegram"))))
    rig.run([delivery_op()], "3")
    result = rig.result()
    assert not result["ok"] and result["waited_s"] == 305  # the last try settles 5 s
    # A delivery that took longer than 300 s misses too (FR-032), however it ended.
    rig = make()
    late = streams(delivered(T0, "telegram"), delivered(T0, "email", lag="301.5"))
    rig.http.on("GET", LOKI_URL, fixed(200, late))
    rig.run([delivery_op()], "3")
    assert not rig.result()["ok"]


def test_a_log_check_never_counts_a_record_from_before_its_action() -> None:
    rig = make()
    before = probe.since_ns(1_800_000_000.0) - 1
    stale = streams(delivered(before, "telegram"), delivered(before, "email"))
    rig.http.on("GET", LOKI_URL, fixed(200, stale))
    rig.run([{**delivery_op(), "within_s": 4}], "3")
    assert not rig.result()["ok"]


def test_real_delivery_needs_telegrams_message_id_and_smtps_250() -> None:
    # plan §8: --delivery real asserts Telegram's message_id and SMTP's 250 reply in the L records.
    refs = {
        "each_regex": {
            "provider_ref": {"telegram": r"^[0-9]+$", "email": r"(^|\D)250(\D|$)"}
        }
    }
    for email_ref, ok in (
        ("250 2.0.0 OK 1712 queued as 4ZK1", True),
        ("550 rejected", False),
    ):
        rig = make()
        records = streams(
            delivered(T0, "telegram", ref="4321"), delivered(T0, "email", ref=email_ref)
        )
        rig.http.on("GET", LOKI_URL, fixed(200, records))
        # The records are stamped a second after the window opens, inside its 5 s.
        rig.run([{**delivery_op(**refs), "within_s": 5}], "3")
        assert rig.result()["ok"] is ok


def test_the_gap_between_two_records() -> None:
    # SC-002: degraded is active within 60 s of the ceiling: killswitch.tripped against the crossing call's record.
    crossing = 1_800_000_010_000_000_000
    for gap_s, ok in ((0.4, True), (61, False)):
        rig = make()
        answers = {
            "call.completed": streams(
                (crossing, {"event": "call.completed", "trace_id": TRACE})
            ),
            "killswitch.tripped": streams(
                (
                    crossing + int(gap_s * 1e9),
                    {"event": "killswitch.tripped", "ceilings": "day"},
                )
            ),
        }

        def answer(*args: Any, answers: dict[str, Any] = answers) -> tuple[int, Any]:
            event = args[2]["query"][0].split('event="')[1].split('"')[0]
            return 200, answers[event]

        rig.http.on("GET", LOKI_URL, answer)
        rig.run(
            [
                {
                    "op": "log",
                    "id": "crossing",
                    "query": probe.logql("dev-cpu", "call.completed", trace_id=TRACE),
                    "after_s": 1_800_000_000.0,
                    "within_s": 120,  # the crossing at 10 s, the trip at 10.4 s or 71 s
                },
                {
                    "op": "log",
                    "query": probe.logql("dev-cpu", "killswitch.tripped"),
                    "after_s": 1_800_000_000.0,
                    "expect": {"gap": {"from": "crossing", "max_s": 60}},
                    "within_s": 120,
                },
            ],
            "7",
        )
        assert [r["ok"] for r in rig.results()] == [True, ok]


def test_logql_quotes_its_values() -> None:
    assert probe.logql("dev", "operator.renew", audit_id=42) == (
        '{service_name="gateway", deployment_environment_name="dev"} '
        '| event="operator.renew" | audit_id="42"'
    )
    with pytest.raises(probe.Usage):
        probe.logql("dev", 'alert.delivered" or 1', dedupe_key=KEY)
    with pytest.raises(probe.Usage):
        probe.logql("dev", "alert.delivered", dedupe_key='k" or "1')
    # A value may be an earlier operation's result, which the probe resolves, and checks, when the query runs.
    query = probe.logql("dev", "operator.renew", audit_id="{{renew.body.audit_id}}")
    assert probe.resolve(query, {"renew": {"body": {"audit_id": 42}}}).endswith(
        '| audit_id="42"'
    )
    with pytest.raises(probe.Usage):
        probe.resolve(query, {"renew": {"body": {"audit_id": '42" or "1'}}})
    with pytest.raises(probe.Usage):
        probe.logql("dev", "operator.renew", audit_id="{{renew}} x")


# --- T: Langfuse --------------------------------------------------------------------------------------------------


def generation(**attributes: Any) -> dict[str, Any]:
    """One observation as Langfuse's v2 list gives it (T187): the core, basic, and usage groups' keys, as one real
    answer on dev-cpu had them (2026-10-10), and the metadata group. A stray input stands in for a payload the probe
    must never print, though it doesn't ask for the io group."""
    return {
        "id": "obs-1",
        "traceId": TRACE,
        "type": "GENERATION",
        "name": "chat metered-test",
        "startTime": "2026-11-20T08:01:00.000Z",
        "endTime": "2026-11-20T08:01:00.250Z",
        "projectId": "h4reet",
        "parentObservationId": "obs-0",
        "isRootObservation": False,
        "level": "DEFAULT",
        "statusMessage": None,
        "version": None,
        "environment": "default",
        "bookmarked": False,
        "public": False,
        "userId": None,
        "sessionId": None,
        "usageDetails": {"input": 12, "output": 8, "total": 20},
        "inputUsage": 12,
        "outputUsage": 8,
        "totalUsage": 20,
        "costDetails": {},
        "inputCost": None,
        "outputCost": None,
        "totalCost": None,
        "usagePricingTierName": None,
        "input": "a payload that never leaves the probe",
        "metadata": {
            "attributes": attributes,
            "resourceAttributes": {"service.name": "gateway"},
        },
    }


def page(*observations: dict[str, Any], cursor: str | None = None) -> dict[str, Any]:
    """A page of Langfuse's v2 list: its data, and a cursor while more pages follow."""
    return {"data": list(observations), "meta": {"cursor": cursor} if cursor else {}}


def test_span_attributes_are_found_wherever_langfuse_keeps_them() -> None:
    assert probe.attribute(generation(**{"h4.cost.usd": 0.1}), "h4.cost.usd") == 0.1
    nested = {
        "type": "GENERATION",
        "metadata": {"attributes": {"h4": {"cost": {"usd": "0.1"}}}},
    }
    assert probe.attribute(nested, "h4.cost.usd") == "0.1"
    top = {"type": "GENERATION", "metadata": {"h4.cost.usd": 0.1}}
    assert probe.attribute(top, "h4.cost.usd") == 0.1
    assert probe.attribute(generation(), "h4.cost.usd") is None
    # A resource attribute isn't the span's.
    assert probe.attribute(generation(), "service.name") is None


def test_observations_come_from_a_trace_or_a_list() -> None:
    assert probe.langfuse_observations(
        {"id": TRACE, "observations": [generation()]}
    ) == [generation()]
    assert probe.langfuse_observations({"data": [generation()], "meta": {}}) == [
        generation()
    ]
    with pytest.raises(probe.SourceError):
        probe.langfuse_observations({"id": TRACE})


def trace_op(**expect: Any) -> dict[str, Any]:
    return {
        "op": "trace",
        **AT_START,
        "assert": "2a",
        "trace_id": TRACE,
        "expect": expect or {"h4.cost.usd": 0.1},
        "within_s": 60,
    }


TRACE_URL = f"{probe.LANGFUSE}/api/public/v2/observations"


def test_a_trace_check_waits_for_langfuse_to_ingest_it() -> None:
    rig = make()
    expect = {"h4.cost.usd": 0.1, "gen_ai.provider.name": "synthetic"}
    found = (200, page(generation(**expect)))
    rig.http.on("GET", TRACE_URL, sequence((200, page()), found))
    rig.run([trace_op(**expect)], "2")
    result = rig.result()
    assert result["ok"] and result["waited_s"] == 3
    assert result["observed"] == expect
    # One trace, the groups that carry the type, the cost, and the attributes, and the attributes whole.
    assert rig.http.calls[0]["query"] == {
        "traceId": [TRACE],
        "fields": ["core,basic,usage,metadata"],
        "expandMetadata": ["attributes"],
        "limit": ["1000"],
    }
    auth = rig.http.calls[0]["headers"]["Authorization"]
    assert (
        base64.b64decode(auth.removeprefix("Basic ")).decode()
        == "pk-lf-public:sk-lf-secret"
    )
    assert (
        "payload" not in rig.out.getvalue()
    )  # a trace's input and output never leave the probe


def test_a_trace_check_misses_the_wrong_cost() -> None:
    rig = make()
    rig.http.on("GET", TRACE_URL, fixed(200, page(generation(**{"h4.cost.usd": 0.2}))))
    rig.run([trace_op()], "2")
    assert not rig.result()["ok"]


def test_the_cost_langfuse_derived_from_h4_cost_usd_stands_in_for_the_attribute() -> (
    None
):
    # The collector copies h4.cost.usd into Langfuse's own cost (telemetry.md §3.5); if Langfuse keeps the cost but not
    # the attribute, the cost is still the gateway's.
    rig = make()
    observation = {**generation(), "costDetails": {"total": 0.1}, "totalCost": 0.1}
    observation["metadata"] = {}
    rig.http.on("GET", TRACE_URL, fixed(200, page(observation)))
    rig.run([trace_op()], "2")
    result = rig.result()
    assert result["ok"] and result["via"] == {"h4.cost.usd": "costDetails.total"}


def test_a_trace_check_without_langfuses_keys_says_so() -> None:
    rig = make(keys=None)
    rig.run([trace_op()], "2")
    result = rig.result()
    assert not result["ok"] and "LANGFUSE_PUBLIC_KEY" in result["error"]


def test_a_trace_check_follows_the_lists_cursor() -> None:
    # A trace's spans can fill a page before its generation comes (T187).
    rig = make()
    span = {**generation(), "id": "obs-0", "type": "SPAN"}

    def listed(
        method: str, url: str, query: dict[str, list[str]], *_: Any
    ) -> tuple[int, Any]:
        if "cursor" not in query:
            return 200, page(span, cursor="page-2")
        return 200, page(generation(**{"h4.cost.usd": 0.1}))

    rig.http.on("GET", TRACE_URL, listed)
    rig.run([trace_op()], "2")
    assert rig.result()["ok"]
    assert [call["query"].get("cursor") for call in rig.http.calls] == [
        None,
        ["page-2"],
    ]


def test_a_trace_check_reads_metadata_given_as_json_text() -> None:
    # The v2 list may give metadata, or its attributes, as JSON text (T187).
    for metadata in (
        {"attributes": json.dumps({"h4.cost.usd": 0.1}), "resourceAttributes": "{}"},
        json.dumps({"attributes": {"h4.cost.usd": 0.1}}),
    ):
        rig = make()
        rig.http.on(
            "GET", TRACE_URL, fixed(200, page({**generation(), "metadata": metadata}))
        )
        rig.run([trace_op()], "2")
        assert rig.result()["ok"], metadata


def test_a_langfuse_error_is_a_miss_that_names_its_status() -> None:
    # Langfuse v4 answers 404 to the v1 endpoints; any status but 200 from the v2 list is a source error.
    rig = make()
    rig.http.on("GET", TRACE_URL, fixed(500, {"message": "internal"}))
    rig.run([trace_op()], "2")
    result = rig.result()
    assert not result["ok"] and "Langfuse answered 500" in result["error"]


def test_a_trace_too_long_to_page_through_is_a_miss() -> None:
    rig = make()
    rig.http.on(
        "GET",
        TRACE_URL,
        fixed(200, page({**generation(), "type": "SPAN"}, cursor="again")),
    )
    rig.run([trace_op()], "2")
    result = rig.result()
    assert (
        not result["ok"] and f"more than {probe.TRACE_PAGES} pages" in result["error"]
    )


# --- the receivers -------------------------------------------------------------------------------------------------


def alert_text(key: str) -> str:
    return (
        "[dev-cpu] WARNING: daily meter at 70%\n"
        "Daily: 3.50 / 5.00 USD (warning 3.50) · Month: 3.50 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 "
        "(grant 1) (synthetic spend)\n"
        f"Runtime: normal · Fallback: available · 2026-11-20T08:01:30Z (test clock) · id {key}\n"
        "Runbook: docs/runbooks/cost-warning.md"
    )


def test_the_telegram_stand_in_holds_the_alert_by_its_whole_id() -> None:
    body = {
        "messages": [
            {
                "message_id": 3,
                "chat_id": 0,
                "text": alert_text(KEY + "x"),
                "received_at": "t1",
            },
            {
                "message_id": 4,
                "chat_id": 0,
                "text": alert_text(KEY),
                "received_at": "t2",
            },
        ]
    }
    assert probe.telegram_find(body, KEY) == {"message_id": 4, "received_at": "t2"}
    assert probe.telegram_find(body, "dev-cpu:warn:day") is None
    g1 = "dev-cpu:warn:fallback_day:2026-11-21:g1"
    assert (
        probe.telegram_find(
            {"messages": [{"message_id": 1, "text": alert_text(g1 + "2")}]}, g1
        )
        is None
    )


def test_a_telegram_check_polls_the_stand_in() -> None:
    rig = make()
    arrived = {
        "messages": [{"message_id": 9, "text": alert_text(KEY), "received_at": "t"}]
    }
    rig.http.on(
        "GET",
        f"{probe.TELEGRAM}/messages",
        sequence((200, {"messages": []}), (200, arrived)),
    )
    rig.run(
        [{"op": "telegram", "assert": "3b", "key": KEY, "within_s": 300, **AT_START}],
        "3",
    )
    result = rig.result()
    assert result["ok"] and result["message_id"] == 9 and "text" not in result


def test_mailpit_holds_the_alert_by_its_header_or_its_text() -> None:
    assert probe.header_matches({"X-H4-Alert-Id": [KEY], "Subject": ["x"]}, KEY)
    assert probe.header_matches({"x-h4-alert-id": [KEY]}, KEY)
    assert not probe.header_matches({"X-H4-Alert-Id": [KEY + "x"]}, KEY)
    assert probe.text_matches({"Text": alert_text(KEY)}, KEY)
    assert not probe.text_matches({"Text": alert_text(KEY + "x")}, KEY)


def test_a_mailpit_check_reads_each_message_once() -> None:
    rig = make()
    listing = {
        "messages": [{"ID": "m2", "Created": "t2"}, {"ID": "m1", "Created": "t1"}],
        "total": 2,
    }
    rig.http.on("GET", f"{probe.MAILPIT}/api/v1/messages", fixed(200, listing))
    rig.http.on(
        "GET",
        f"{probe.MAILPIT}/api/v1/message/m1/headers",
        fixed(200, {"X-H4-Alert-Id": ["other"]}),
    )
    rig.http.on(
        "GET",
        f"{probe.MAILPIT}/api/v1/message/m2/headers",
        fixed(200, {"X-H4-Alert-Id": [KEY]}),
    )
    rig.run(
        [{"op": "mailpit", "assert": "3b", "key": KEY, "within_s": 300, **AT_START}],
        "3",
    )
    result = rig.result()
    assert (
        result["ok"]
        and result["matched_by"] == "header"
        and result["received_at"] == "t2"
    )


@pytest.mark.parametrize(("held", "ok"), [(KEY, False), (KEY + "x", True)])
def test_a_real_run_holds_that_neither_stand_in_received_the_alert(
    held: str, ok: bool
) -> None:
    # With --delivery real, Telegram's message_id and SMTP's 250 have the stand-ins' shapes too, so the run also checks
    # that neither stand-in holds the alert. One look: by then the delivery records say it went out (round 1's review).
    rig = make()
    message = {"message_id": 3, "text": alert_text(held), "received_at": "t"}
    rig.http.on(
        "GET", f"{probe.TELEGRAM}/messages", fixed(200, {"messages": [message]})
    )
    listing = {"messages": [{"ID": "m1", "Created": "t"}], "total": 1}
    rig.http.on("GET", f"{probe.MAILPIT}/api/v1/messages", fixed(200, listing))
    rig.http.on(
        "GET",
        f"{probe.MAILPIT}/api/v1/message/m1/headers",
        fixed(200, {"X-H4-Alert-Id": [held]}),
    )
    rig.http.on(
        "GET",
        f"{probe.MAILPIT}/api/v1/message/m1",
        fixed(200, {"Text": alert_text(held)}),
    )
    absent = {"key": KEY, "absent": True, "within_s": 300, **AT_START}
    rig.run(
        [
            {"op": "telegram", "assert": "3b", **absent},
            {"op": "mailpit", "assert": "3b", **absent},
        ],
        "3",
    )
    assert [r["ok"] for r in rig.results()] == [ok, ok]
    assert rig.clock.sleeps == []


# --- the store's own records: the audit row, the incident draft ---------------------------------------------------


class Admin:
    """A fake admin listener: (method, path) to the answer, a dict or an AdminError to raise."""

    def __init__(self) -> None:
        self.routes: dict[tuple[str, str], Callable[[Any], Any]] = {}
        self.calls: list[tuple[str, str, Any]] = []

    def on(self, method: str, path: str, answer: Any) -> None:
        self.routes[(method, path)] = (
            answer if callable(answer) else (lambda body, a=answer: a)
        )

    def request(self, method: str, path: str, body: Any = None) -> Any:
        self.calls.append((method, path, body))
        answer = self.routes[(method, path.split("?", 1)[0])](body)
        if isinstance(answer, Exception):
            raise answer
        return answer


def renew_row(**after: Any) -> dict[str, Any]:
    return {
        "id": 42,
        "ts": "2026-11-21T08:09:10Z",
        "recorded_at": "2026-10-09T12:00:00Z",
        "actor": "operator:dev-cpu#a2d31213",
        "action": "renew",
        "reason": REASON,
        "before": {},
        "after": {"fallback_day": {"allowance_micro": 4000000, "grant_no": 2, **after}},
        "detail": {},
    }


def audit_op(within_s: int = 10) -> dict[str, Any]:
    return {
        "op": "audit",
        **AT_START,
        "assert": "6a",
        "action": "renew",
        "audit_id": 42,
        "reason": REASON,
        "expect": {
            "after.fallback_day.allowance_micro": 4000000,
            "after.fallback_day.grant_no": 2,
        },
        "within_s": within_s,
    }


def test_an_audit_check_finds_its_row_and_checks_who_when_and_why() -> None:
    admin = Admin()
    admin.on("GET", "/admin/audit", {"entries": [renew_row()], "next_before_id": None})
    rig = make(admin=admin)
    rig.run([audit_op()], "6")
    result = rig.result()
    assert result["ok"], result
    assert admin.calls[0][1] == "/admin/audit?action=renew&limit=20"
    assert result["actor"] == "operator:dev-cpu#a2d31213"


@pytest.mark.parametrize(
    "row",
    [
        renew_row(allowance_micro=6000000),
        {**renew_row(), "reason": "other words entirely"},
        {**renew_row(), "actor": "gateway"},
        {**renew_row(), "ts": None},
    ],
)
def test_an_audit_row_with_the_wrong_figure_reason_actor_or_time_misses(
    row: dict[str, Any],
) -> None:
    admin = Admin()
    admin.on("GET", "/admin/audit", {"entries": [row]})
    rig = make(admin=admin)
    rig.run([audit_op(0)], "6")
    assert not rig.result()["ok"]


def draft(trace: str = TRACE, *, hourly: bool = True) -> str:
    """alerts.md §7's template, filled as a breach run's day trip would be."""
    hourly_rows = (
        "| 2026-11-22T08 | synthetic | metered-test | metered | 50 | 0 | 50000 | 5.000000 |\n"
        if hourly
        else ""
    )
    return f"""# Intent: Respond to the daily ceiling breach on dev-cpu, 2026-11-22
Author: the gateway (automated draft). Status: draft. Created: 2026-11-22.

## Evidence

### Meters at the crossing
| Meter | Period | Spent | Reserved | Ceiling or allowance | Warning |
|---|---|---|---|---|---|
| day | 2026-11-22 | 5.000000 | 0.000000 | 5.000000 | 3.500000 |
| month | 2026-11 | 12.500000 | 0.000000 | 20.000000 | 14.000000 |
| fallback_day | 2026-11-22 | 0.000000 | 0.000000 | 2.000000 (grant 2) | 1.400000 |

### The crossing
- Ceiling: day 2026-11-22. Spend before the call: 4.900000 USD; after: 5.000000 USD.
- The crossing call: ledger 5d1c, trace {trace}, synthetic metered-test, attribution metered, cost 0.100000 USD.

### The last 10 metered calls
| Time | Route | Provider | Model | Attribution | Cost (USD) | Trace |
|---|---|---|---|---|---|---|
| 2026-11-22T08:20:01Z | metered | synthetic | metered-test | metered | 0.100000 | {trace} |

### Hourly totals, the 24 hours before the crossing (UTC)
| Hour | Provider | Model | Route | Calls | Input tokens | Output tokens | Cost (USD) |
|---|---|---|---|---|---|---|---|
{hourly_rows}
### Audit trail, this day
| Time | Actor | Action | Reason |
|---|---|---|---|
| 2026-11-22T08:15:00Z | operator:dev-cpu#a2d31213 | renew | breach test step 6: the next day's renewal |

### Configuration
- Routing: config/routing.yaml, SHA-256 {"ab" * 32}
- Prices: version 2026-10-08.1, effective from 2026-10-08
- Budgets: day 5.00 USD, month 20.00 USD, fallback 2.00 USD a grant, warning ratio 0.70

### Alerts
| Alert | Telegram | Email |
|---|---|---|
| dev-cpu:trip:day:2026-11-22 | delivered at 2026-11-22T08:20:02Z (message 31) | delivered at 2026-11-22T08:20:02Z (250 OK) |

### Links
- Grafana: http://localhost:18302/d/h4-runtime?from=1&to=2&tz=UTC
- The crossing call in Langfuse: http://localhost:18301/project/h4reet-dev-cpu/traces/{trace}
"""


def incident(content: str | None, **extra: Any) -> dict[str, Any]:
    return {
        "id": 2,
        "ceiling": "day",
        "period_key": "2026-11-22",
        "status": "written",
        "path": "incidents/2026-11-22-dev-cpu-day.intent.md",
        "sha256": "cd" * 32,
        "sha256_matches": True,
        "content": content,
        **extra,
    }


def checks(content: str, **extra: Any) -> dict[str, bool]:
    return probe.incident_checks(
        incident(content, **extra),
        ceiling="day",
        period_key="2026-11-22",
        trace_id=TRACE,
        trip_key="dev-cpu:trip:day:2026-11-22",
    )


def test_a_draft_with_every_evidence_field_passes_each_check() -> None:
    found = checks(draft())
    assert found and all(found.values()), found


def test_a_draft_missing_a_field_or_its_row_misses() -> None:
    assert not checks(draft(hourly=False))["hourly"]
    assert not checks(draft(trace="0" * 32))["crossing"]
    assert not checks(draft(), status="queued")["written"]
    assert not checks(draft(), sha256_matches=False)["sha256_matches"]


def test_an_incident_check_waits_for_the_draft_and_never_prints_it() -> None:
    admin = Admin()
    queued = {"incidents": [incident(None, status="queued")]}
    admin.on(
        "GET", "/admin/incidents", sequence(queued, {"incidents": [incident(draft())]})
    )
    rig = make(admin=admin)
    op = {
        "op": "incident",
        **AT_START,
        "assert": "8b",
        "ceiling": "day",
        "period_key": "2026-11-22",
        "trace_id": TRACE,
        "trip_key": "dev-cpu:trip:day:2026-11-22",
        "within_s": 330,
    }
    rig.run([op], "8")
    result = rig.result()
    assert result["ok"] and result["id"] == 2 and result["sha256"] == "cd" * 32
    assert result["waited_s"] == 3
    assert "Intent: Respond" not in rig.out.getvalue()


# --- actions: spend, hello, health, admin -------------------------------------------------------------------------


def calls(start: int, count: int, route: str = "metered") -> list[dict[str, Any]]:
    return [
        {
            "n": n,
            "status": 200,
            "route": route,
            "cost_micro_usd": 100000,
            "trace_id": f"{n:032x}",
        }
        for n in range(start, start + count)
    ]


def synthetic(answers: list[dict[str, Any]]) -> tuple[Admin, list[Any]]:
    admin, bodies = Admin(), []
    queue = list(answers)

    def answer(body: Any) -> Any:
        bodies.append(body)
        return queue.pop(0)

    admin.on("POST", "/admin/test/synthetic", answer)
    return admin, bodies


def spend_op(count: int, **expect: Any) -> dict[str, Any]:
    return {
        "op": "spend",
        "id": "s",
        "attribution": "metered",
        "route": "metered",
        "count": count,
        "reason": "breach test step 3: metered calls to 3.50 today",
        "expect": expect,
    }


def batch(
    answered: int, stopped: Any = None, audit_id: int = 1, **extra: Any
) -> dict[str, Any]:
    return {
        "requested": answered,
        "answered": answered,
        "calls": calls(1, answered),
        "stopped": stopped,
        "meters": {},
        "audit_id": audit_id,
        **extra,
    }


def test_spend_splits_into_the_endpoints_batches_of_50() -> None:
    last = batch(5, audit_id=2, meters={"day": {"spent_micro_usd": 5500000}})
    admin, bodies = synthetic([batch(50), last])
    rig = make(admin=admin)
    assert rig.run([spend_op(55, answered=55, stopped=None)], "3") == 0
    result = rig.result()
    assert result["ok"] and [b["count"] for b in bodies] == [50, 5]
    assert [c["n"] for c in result["calls"]] == list(
        range(1, 56)
    )  # numbered across the batches
    assert result["audit_ids"] == [1, 2]
    assert result["meters"] == {"day": {"spent_micro_usd": 5500000}}


def test_spend_waits_out_the_global_limit_and_goes_on() -> None:
    limit = {
        "n": 21,
        "status": 429,
        "error": "metered_capacity_exceeded",
        "retry_after_s": 7,
    }
    admin, bodies = synthetic([batch(20, stopped=limit), batch(30, audit_id=2)])
    rig = make(admin=admin)
    rig.run([spend_op(50, answered=50, stopped=None)], "7")
    result = rig.result()
    assert result["ok"] and [b["count"] for b in bodies] == [50, 30]
    assert result["waits"] == [8] and rig.clock.sleeps == [8]


def limited(n: int, retry_after_s: int) -> dict[str, Any]:
    return {
        "n": n,
        "status": 429,
        "error": "metered_capacity_exceeded",
        "retry_after_s": retry_after_s,
    }


def test_step_10s_pace_waits_out_each_429_and_lands_on_plan_8s_figures() -> None:
    # Step 10 spends 49 metered calls, then 26 more, against the gateway's 60 a minute (data-model.md §7.2): the third
    # spend is refused with 429 and its retry_after_s, more than once. Each is a wait, not a miss, and the call it
    # refused is made again, so the month still lands on $20.00 (plan §8).
    month = {
        "month": {"spent_micro_usd": 20_000_000},
        "day": {"spent_micro_usd": 2_600_000},
    }
    admin, bodies = synthetic(
        [
            batch(11, stopped=limited(12, 40)),
            batch(10, stopped=limited(11, 5), audit_id=2),
            batch(5, audit_id=3, meters=month),
        ]
    )
    rig = make(admin=admin)
    figures = {
        "meters.month.spent_micro_usd": 20_000_000,
        "meters.day.spent_micro_usd": 2_600_000,
    }
    rig.run([spend_op(26, answered=26, stopped=None, **figures)], "10")
    result = rig.result()
    assert result["ok"], result
    assert [b["count"] for b in bodies] == [26, 15, 5]  # never more than what is left
    assert result["waits"] == [41, 6] and rig.clock.sleeps == [41, 6]
    assert [c["n"] for c in result["calls"]] == list(range(1, 27))
    assert result["audit_ids"] == [1, 2, 3]


def test_spend_holds_the_stores_figures_to_plan_8() -> None:
    # The same calls, answered, with the store's month a call short: an action that misses its figures stops the step.
    short = {"month": {"spent_micro_usd": 19_900_000}}
    admin, _ = synthetic([batch(26, meters=short)])
    rig = make(admin=admin)
    figures = {"meters.month.spent_micro_usd": 20_000_000}
    assert rig.run([spend_op(26, answered=26, stopped=None, **figures)], "10") == 1
    result = rig.result()
    assert not result["ok"] and result["misses"] == ["meters.month.spent_micro_usd"]


def test_spend_gives_up_on_a_limit_that_never_frees() -> None:
    admin, bodies = synthetic([batch(0, stopped=limited(1, 60))] * 5)
    rig = make(admin=admin)
    rig.run([spend_op(26, answered=26, stopped=None)], "10")
    result = rig.result()
    assert not result["ok"] and result["stopped"]["status"] == 429
    assert sum(result["waits"]) <= probe.SPEND_WAIT_CAP_S and len(bodies) == 3


def test_spend_stops_at_once_on_a_batch_cut_short_for_no_reason() -> None:
    # contracts/operator-admin.md §3.2: stopped is null only when every call was answered. An answer with fewer calls
    # and no reason is a broken gateway: the probe says so and stops, rather than asking again with no pause
    # (round 1's review: 5,000 audited POSTs).
    admin, bodies = synthetic(
        [{"calls": [], "stopped": None, "meters": {}, "audit_id": 1}] * 3
    )
    rig = make(admin=admin)
    assert rig.run([spend_op(34, answered=34, stopped=None)], "3") == 1
    result = rig.result()
    assert len(bodies) == 1 and rig.clock.sleeps == []
    assert not result["ok"]
    assert result["error"] == (
        "the gateway answered 0 of 34 calls and named no reason "
        "(contracts/operator-admin.md §3.2)"
    )


def test_spend_stops_at_a_degraded_answer_and_holds_it_to_the_expectation() -> None:
    stop = {"n": 6, "status": 503, "cause": "fallback_awaiting_renewal"}
    answer = {**batch(5, stopped=stop, audit_id=3), "calls": calls(1, 5, "fallback")}
    expect = {"answered": 5, "stopped.cause": "fallback_awaiting_renewal"}
    op = {**spend_op(6, **expect), "attribution": "fallback", "route": "fallback"}
    admin, _ = synthetic([answer])
    rig = make(admin=admin)
    assert rig.run([op], "5") == 0
    assert rig.result()["ok"]
    # The same answer misses an expectation of six answered calls, and a failed action ends the step.
    admin, _ = synthetic([answer])
    rig = make(admin=admin)
    later = {
        "op": "metric",
        "assert": "5e",
        "query": QUERY,
        "expect": {"value": 1},
        "within_s": 0,
    }
    assert (
        rig.run([{**op, "expect": {"answered": 6, "stopped": None}}, later], "5") == 1
    )
    first, second = rig.results()
    assert not first["ok"] and first["failed"]
    assert second["skipped"] and not second["ok"]


@pytest.mark.parametrize(
    ("route", "cost"),
    [
        # Fallback calls answered locally cost nothing and prove nothing: the step's spend would never happen.
        ("local", 0),
        # The right price on the wrong route is another meter: metered calls never touch the sub-budget.
        ("metered", 100000),
        ("fallback", 99999),
    ],
)
def test_spend_checks_each_call_is_the_route_and_price_it_should_be(
    route: str, cost: int
) -> None:
    wrong = [{**c, "route": route, "cost_micro_usd": cost} for c in calls(1, 3)]
    admin, _ = synthetic([{**batch(3), "calls": wrong}])
    rig = make(admin=admin)
    op = {**spend_op(3, answered=3), "attribution": "fallback", "route": "fallback"}
    assert rig.run([op], "4") == 1
    assert not rig.result()["ok"]


def test_hello_reports_its_route_and_cause_never_its_answer() -> None:
    rig = make()
    degraded = {
        "state": "degraded",
        "cause": "kill_switch_tripped",
        "detail": "…",
        "ceilings": ["day"],
        "stack": "dev-cpu",
        "since": "t",
        "request_id": "r",
        "trace_id": TRACE,
    }
    rig.http.on("POST", f"{probe.GATEWAY}/hello", fixed(503, degraded))
    rig.run(
        [
            {
                "op": "hello",
                "id": "h",
                "expect": {"status": 503, "cause": "kill_switch_tripped"},
            }
        ],
        "7",
    )
    result = rig.result()
    assert result["ok"] and result["trace_id"] == TRACE
    rig = make()
    answered = {
        "answer": "a model's words",
        "route": "local",
        "provider": "local",
        "model": "m",
        "cost_micro_usd": 0,
        "trace_id": TRACE,
        "stack": "dev-cpu",
    }
    rig.http.on("POST", f"{probe.GATEWAY}/hello", fixed(200, answered))
    rig.run([{"op": "hello", "expect": {"status": 200, "route": "local"}}], "9")
    assert rig.result()["ok"] and "a model's words" not in rig.out.getvalue()
    assert rig.http.calls[0]["body"] == {}  # the default message, and no client label


def health(**overrides: Any) -> dict[str, Any]:
    body = {
        "status": "ok",
        "stack": "dev-cpu",
        "env": "dev",
        "time": "2026-10-09T12:00:00.000Z",
        "real_time": "2026-10-09T12:00:00.000Z",
        "store": "ok",
        "state": "normal",
        "degraded_cause": None,
        "fallback": {
            "adapter": "synthetic",
            "awaiting_renewal": False,
            "awaiting_since": None,
        },
        "adapters": [
            {"id": "local", "role": "primary", "healthy": True, "reason": None},
            {"id": "synthetic", "role": "fallback", "healthy": True, "reason": None},
        ],
        "journal": "ok",
        "test_machinery": {"clock": True, "synthetic": True, "clock_offset_ms": None},
    }
    body.update(overrides)
    return body


def test_wait_health_retries_while_the_gateway_restarts() -> None:
    rig = make()
    down = [
        {"id": "local", "role": "primary", "healthy": False, "reason": "unreachable"},
        {"id": "synthetic", "role": "fallback", "healthy": True, "reason": None},
    ]
    answers = iter(
        [probe.Unreachable("refused"), (200, health()), (200, health(adapters=down))]
    )

    def answer(*_: Any) -> tuple[int, Any]:
        item = next(answers)
        if isinstance(item, Exception):
            raise item
        return item

    rig.http.on("GET", f"{probe.GATEWAY}/health", answer)
    expect = {"adapter.local.healthy": False, "adapter.synthetic.healthy": True}
    rig.run([{"op": "wait_health", "expect": expect, "within_s": 60}], "4")
    result = rig.result()
    assert result["ok"] and result["waited_s"] == 2
    assert result["health"]["adapter"]["local"]["healthy"] is False


def test_an_admin_refusal_is_reported_by_its_status_and_error() -> None:
    admin = Admin()
    admin.on(
        "POST",
        "/admin/renew",
        operator.AdminError(409, "not_awaiting_renewal", "nothing to renew"),
    )
    rig = make(admin=admin)
    op = {
        "op": "admin",
        "method": "POST",
        "path": "/admin/renew",
        "body": {"reason": REASON},
        "expect": {"status": 200},
    }
    assert rig.run([op], "6") == 1
    result = rig.result()
    assert (result["status"], result["error"]) == (
        409,
        "not_awaiting_renewal",
    ) and not result["ok"]


def test_admin_answers_lose_any_payload_shaped_field() -> None:
    body = {"a": 1, "content": "draft", "nested": [{"answer": "x", "b": 2}]}
    assert probe.sanitize(body) == {"a": 1, "nested": [{"b": 2}]}


# --- references between operations, and the output ----------------------------------------------------------------


def test_a_later_operation_takes_an_earlier_ones_result() -> None:
    earlier = {
        "renew": {"body": {"audit_id": 42, "fallback": {"grant": 2}}},
        "s": {"calls": [{"trace_id": "a" * 32}, {"trace_id": TRACE}]},
    }
    assert probe.resolve("{{renew.body.audit_id}}", earlier) == 42
    assert probe.resolve("x {{renew.body.fallback.grant}} y", earlier) == "x 2 y"
    assert probe.resolve({"t": ["{{s.calls.-1.trace_id}}"]}, earlier) == {"t": [TRACE]}
    with pytest.raises(probe.Usage):
        probe.resolve("{{nothing.here}}", earlier)
    with pytest.raises(probe.Usage):
        probe.resolve("{{bad.v}}", {"bad": {"v": 'a" or "1'}})


def test_main_reads_the_token_then_the_operations_and_never_prints_the_token() -> None:
    stdin = io.StringIO(
        TOKEN + "\n" + json.dumps({"ops": [{"op": "health", "expect": {"env": "dev"}}]})
    )
    out, clock, http = io.StringIO(), Clock(), Http()
    http.on("GET", f"{probe.GATEWAY}/health", fixed(200, health()))
    made: list[str] = []

    def admin_factory(stack: str, token: str) -> Any:
        made.append(stack)
        return Admin()

    code = probe.main(
        ["0", "--stack", "dev-cpu"],
        stdin=stdin,
        stdout=out,
        http=http,
        clock=clock,
        environ={},
        admin_factory=admin_factory,
    )
    assert code == 0 and made == ["dev-cpu"]
    lines = [json.loads(line) for line in out.getvalue().splitlines()]
    assert lines[-1] == {probe.MARK: 1, "step": "0", "done": True, "exit": 0}
    assert lines[0]["result"]["ok"] and TOKEN not in out.getvalue()


@pytest.mark.parametrize(
    ("argv", "document"),
    [
        (["1", "--stack", "prod"], {"ops": []}),  # the probe never runs on prod
        (["1", "--stack", "dev"], "not json"),
        (["1", "--stack", "dev"], {"ops": [{"op": "shell"}]}),
        (["1", "--stack", "dev"], {"steps": []}),
        (
            ["1", "--stack", "dev"],
            {"ops": [{"op": "renew-without-a-token", "method": "POST"}]},
        ),
    ],
)
def test_main_refuses_what_it_can_t_run(argv: list[str], document: Any) -> None:
    text = document if isinstance(document, str) else json.dumps(document)
    out = io.StringIO()
    code = probe.main(
        argv,
        stdin=io.StringIO("\n" + text),
        stdout=out,
        http=Http(),
        clock=Clock(),
        environ={},
    )
    assert code == 2


def test_a_refusal_says_why_on_its_done_line_cleaned() -> None:
    # The orchestrator reads only standard output's marked lines, so the reason goes there, with control characters
    # replaced, and not only to standard error (round 1's review).
    out = io.StringIO()
    document = {"ops": [{"op": "shell\x1b[31m\x7f\x9b"}]}  # ESC, DEL, and CSI
    code = probe.main(
        ["1", "--stack", "dev"],
        stdin=io.StringIO("\n" + json.dumps(document)),
        stdout=out,
        http=Http(),
        clock=Clock(),
        environ={},
    )
    assert code == 2
    done = json.loads(out.getvalue().splitlines()[-1])
    assert done == {
        probe.MARK: 1,
        "step": "1",
        "done": True,
        "exit": 2,
        "error": "no such operation: shell?[31m??",
    }


def test_shorten_replaces_every_control_character_by_unicode_category() -> None:
    # Category Cc, as scripts/operator.py's clean() has it: C0, DEL, and C1, whose U+009B is a terminal's CSI on its
    # own. Printable text, ASCII or not, stays (round 2's review).
    controls = "\x00\x07\t\n\x1b\x7f\x80\x85\x9b\x9f"
    assert probe.shorten(f"a{controls}b") == "a" + "?" * len(controls) + "b"
    assert probe.shorten("Daily: 3.50 · café … ok") == "Daily: 3.50 · café … ok"
    assert probe.shorten("x" * 300) == "x" * 199 + "…"


def test_an_admin_operation_needs_the_token() -> None:
    document = {"ops": [{"op": "admin", "method": "GET", "path": "/admin/status"}]}
    code = probe.main(
        ["1", "--stack", "dev"],
        stdin=io.StringIO("\n" + json.dumps(document)),
        stdout=io.StringIO(),
        http=Http(),
        clock=Clock(),
        environ={},
    )
    assert code == 2


def test_the_real_admin_client_talks_to_the_admin_listener_in_network() -> None:
    client = probe.make_admin("dev-cpu", TOKEN)
    assert client.url == "http://gateway:8081" and client.stack == "dev-cpu"
    assert TOKEN not in repr(client)


# --- the real HTTP client ------------------------------------------------------------------------------------------


def test_the_http_client_ignores_proxies_and_refuses_redirects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    hits: list[str] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            hits.append(self.path)
            if self.path == "/moved":
                self.send_response(302)
                self.send_header("Location", "/elsewhere")
                self.end_headers()
                return
            data = b'{"status": "success"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format: str, *args: Any) -> None:
            return

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(
        target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True
    )
    thread.start()
    try:
        # A proxy that doesn't exist: a client that used it would get no answer.
        for name in ("HTTP_PROXY", "http_proxy"):
            monkeypatch.setenv(name, "http://127.0.0.1:9")
        for name in ("NO_PROXY", "no_proxy"):
            monkeypatch.delenv(name, raising=False)
        client = probe.Http()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        assert client.request("GET", f"{base}/ok").json() == {"status": "success"}
        assert client.request("GET", f"{base}/moved").status == 302
        assert hits == ["/ok", "/moved"]  # never /elsewhere
        server.shutdown()
        server.server_close()
        with pytest.raises(probe.Unreachable):
            client.request("GET", f"{base}/ok")
    finally:
        server.server_close()
