"""deploy/grafana/dashboards/h4-runtime.json against contracts/telemetry.md §7 and §8 (spec 000 FR-028, FR-032, FR-034,
FR-037).

The expected panels and their exact queries are read from the contract's own tables, so a query changes in the
contract first and here never. Each of §7's sections is all or nothing, and every required one must be whole: US1's
three (§7.3 requests, §7.4 the model server, §7.6 telemetry health), US2's three (§7.1 state, §7.2 spend, §7.5 audit
and alerts), US3's dev-time row (§7.7, tasks.md T094), and spec 002's room row (§7.8, its tasks.md T061). Spec 004's
"Room live state" (§7.9, its tasks.md T007) is a section, so a partial row fails, but not yet a required one: its
series are spec 001's relay's, and the change that switches the room's live source on adds its panels and requires it
(spec 004, FR-072; contracts/room-live-state-telemetry.md §6).

How a row of the contract becomes panels:
  - a type that names two visualizations, "time series and stat" or "stat, and a state timeline", is two panels
    with the same queries: the first under the row's title, the second under the title with the second
    visualization in parentheses, as "Kill switch (state timeline)";
  - "time series, and a stat over the range" with a "; stat:" query (§7.3's request count) is a time series and a
    stat titled "... over the range", each with its own query;
  - "the same three with `h4_meter="month"`" is the row above's three queries with that label;
  - "table (SQL)" panels read the store through the `gateway` datasource, and their query is its SQL; "logs"
    panels read Loki; every other panel is PromQL on `prom` (§7's opening paragraph).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
CONTRACT = (REPO / "specs/000-local-foundations/contracts/telemetry.md").read_text(
    encoding="utf-8"
)
DASHBOARD = json.loads(
    (REPO / "deploy/grafana/dashboards/h4-runtime.json").read_text(encoding="utf-8")
)
# Spec 003's studio GPU window adds a row, its panel, and an annotation, in its own contract's §3 (FR-035, SC-011).
STUDIO = (REPO / "specs/003-studio-assets/contracts/gpu-window.md").read_text(
    encoding="utf-8"
)
STUDIO_ROW = "gpu-window §3"
# Spec 001's "Hosts" row (its plan §11): each group's panels land with its feature, in the contract that owns the
# feature. Group 5's, the tunnel's and the tunnel end's collector's, are contracts/tunnel.md §7's table (tasks.md T053).
TUNNEL = (REPO / "specs/001-cloud-elevation/contracts/tunnel.md").read_text(
    encoding="utf-8"
)
# Group 6's, the shared state's, are contracts/shared-state.md §10's (tasks.md T075).
SHARED_STATE = (REPO / "specs/001-cloud-elevation/contracts/shared-state.md").read_text(
    encoding="utf-8"
)
# Group 7's, the release's, are contracts/releases-deployer.md §6's (tasks.md T091).
RELEASES = (
    REPO / "specs/001-cloud-elevation/contracts/releases-deployer.md"
).read_text(encoding="utf-8")
# Group 8's, the relay's, are contracts/relay-http.md §9's (tasks.md T110).
RELAY = (REPO / "specs/001-cloud-elevation/contracts/relay-http.md").read_text(
    encoding="utf-8"
)
HANDOVER = (REPO / "specs/001-cloud-elevation/contracts/handover.md").read_text(
    encoding="utf-8"
)
# Group 10's, the public view's, are contracts/public-view.md §5's (tasks.md T137).
PUBLIC_VIEW = (REPO / "specs/001-cloud-elevation/contracts/public-view.md").read_text(
    encoding="utf-8"
)
HOSTS_ROW = "tunnel §7"
US1 = ("7.3", "7.4", "7.6")
US2 = ("7.1", "7.2", "7.5")
US3 = ("7.7",)
ROOM = ("7.8",)  # spec 002's usage events (contracts/room-events.md §4)
REQUIRED = US1 + US2 + US3 + ROOM
# §7.10, spec 007's conversation (its FR-045): whole, as its own tests below require.
# §7.9, spec 004's "Room live state": all or nothing now, required at its User Story 8 switch-on.
SECTIONS = ("7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "7.10")
DATASOURCES = {
    "prom": "prometheus",
    "loki": "loki",
    "gateway": "grafana-postgresql-datasource",
}
# A type cell that names two visualizations of the same queries.
TWO_KINDS = re.compile(r"(.+?),? and (?:an? )?(.+)")


def section(number: str) -> str:
    """§7.n's text, up to the next heading of its level or above: §7.7 ends where "## 8." begins."""
    start = CONTRACT.index(f"\n### {number} ")
    ends = [
        e for e in (CONTRACT.find(h, start + 1) for h in ("\n### ", "\n## ")) if e > 0
    ]
    return CONTRACT[start : min(ends) if ends else None]


def cells(line: str) -> list[str]:
    return [
        c.strip().replace("\\|", "|")
        for c in re.split(r"(?<!\\)\|", line.strip())[1:-1]
    ]


def expand(cell: str, previous: list[str]) -> list[str]:
    """A query cell's queries, with the contract's shorthands spelled out."""
    codes = re.findall(r"`([^`]+)`", cell)
    if "and the same with `0.95`" in cell:
        return [
            codes[0],
            codes[0].replace("histogram_quantile(0.50,", "histogram_quantile(0.95,"),
        ]
    # The collector's counters are pushed over OTLP, so they carry _total, as the gateway's do (telemetry.md §4.3,
    # T185). Scraped, they had none (T065).
    if "and the same for" in cell and re.search(r"_spans_total\b", codes[0]):
        base = codes[0]
        return [
            base,
            re.sub(r"_spans_total\b", "_metric_points_total", base),
            re.sub(r"_spans_total\b", "_log_records_total", base),
        ]
    if cell.startswith("the same three with "):
        (label,) = codes
        name = label.split("=", 1)[0]
        assert len(previous) == 3, cell
        return [re.sub(rf'{name}="[^"]*"', label, query) for query in previous]
    return [
        c
        for c in codes
        if re.search(r"[({\[]", c) or c.lstrip().upper().startswith("SELECT ")
    ]


def contract_panels(number: str) -> dict[str, tuple[str, list[str]]]:
    """Each panel of a section: its title (without the FR note), its type, and its queries."""
    out: dict[str, tuple[str, list[str]]] = {}
    previous: list[str] = []
    for line in section(number).splitlines():
        if not line.startswith("| ") or line.startswith("| Panel"):
            continue
        title, kind, query = cells(line)[
            :3
        ]  # §7.1 and §7.2 add a fourth column, what the panel shows
        title = re.sub(r"\s*\((?:FR|SC)-[^)]*\)$", "", title)
        if "; stat: " in query:  # a time series, and a stat of the same over the range
            series, stat = query.split("; stat: ", 1)
            out[title] = ("time series", expand(series, previous))
            out[f"{title} over the range"] = ("stat", expand(stat, previous))
            continue
        queries_ = expand(query, previous)
        two = TWO_KINDS.fullmatch(kind)
        if two:
            first, second = two.groups()
            out[title] = (first, queries_)
            out[f"{title} ({second})"] = (second, queries_)
        else:
            out[title] = (kind, queries_)
        previous = queries_
    return out


def all_contract_panels() -> dict[str, tuple[str, list[str]]]:
    expected: dict[str, tuple[str, list[str]]] = {}
    for number in SECTIONS:
        expected.update(contract_panels(number))
    expected.update(studio_panels())
    expected.update(hosts_panels())
    return expected


def contract_section(text: str, heading: str) -> str:
    start = text.index(f"\n## {heading} ")
    end = text.find("\n## ", start + 1)
    return text[start : end if end > 0 else None]


def hosts_section() -> str:
    """The Hosts row's panels: tunnel.md §7, group 5's, and shared-state.md §10, group 6's, each up to its next "## "
    heading."""
    return (
        contract_section(TUNNEL, "7.")
        + contract_section(SHARED_STATE, "10.")
        + contract_section(RELEASES, "6.")
        + contract_section(RELAY, "9.")
        # Group 9's (tasks.md T127): the handover's panels.
        + contract_section(HANDOVER, "10.")
        # Group 10's (tasks.md T137): the public view's.
        + contract_section(PUBLIC_VIEW, "5.")
    )


def hosts_panels() -> dict[str, tuple[str, list[str]]]:
    """tunnel.md §7's panel table, read as contract_panels reads telemetry.md §7's, its two-visualization rows too."""
    out: dict[str, tuple[str, list[str]]] = {}
    for line in hosts_section().splitlines():
        if not line.startswith("| ") or line.startswith("| Panel"):
            continue
        title, kind, query = cells(line)[:3]
        title = re.sub(r"\s*\((?:FR|SC)-[^)]*\)$", "", title)
        queries_ = expand(query, [])
        two = TWO_KINDS.fullmatch(kind)
        if two:
            first, second = two.groups()
            out[title] = (first, queries_)
            out[f"{title} ({second})"] = (second, queries_)
        else:
            out[title] = (kind, queries_)
    return out


def studio_section() -> str:
    """gpu-window.md §3, the studio window's dashboard, up to its next "## " heading."""
    start = STUDIO.index("\n## 3. ")
    end = STUDIO.find("\n## ", start + 1)
    return STUDIO[start : end if end > 0 else None]


def studio_panels() -> dict[str, tuple[str, list[str]]]:
    """gpu-window.md §3's panel table, read as contract_panels reads telemetry.md §7's."""
    out: dict[str, tuple[str, list[str]]] = {}
    for line in studio_section().splitlines():
        if not line.startswith("| ") or line.startswith("| Panel"):
            continue
        title, kind, query = cells(line)[:3]
        title = re.sub(r"\s*\((?:FR|SC)-[^)]*\)$", "", title)
        out[title] = (kind, expand(query, []))
    return out


def row_panels(key: str) -> dict[str, tuple[str, list[str]]]:
    """A row's panels: a section of telemetry.md §7, the studio window's, or spec 001's Hosts row."""
    if key == STUDIO_ROW:
        return studio_panels()
    if key == HOSTS_ROW:
        return hosts_panels()
    return contract_panels(key)


def panels() -> list[dict]:
    return [p for p in DASHBOARD["panels"] if p["type"] != "row"]


def by_title() -> dict[str, dict]:
    return {p["title"]: p for p in panels()}


def queries(panel: dict) -> list[str]:
    """Each target's query: SQL for the store's panels, PromQL or LogQL for the others."""
    return [t["rawSql"] if "rawSql" in t else t["expr"] for t in panel["targets"]]


def expected_uid(kind: str) -> str:
    if "(SQL)" in kind:
        return "gateway"
    if kind == "logs":
        return "loki"
    return "prom"


def test_the_contract_parses_as_this_file_reads_it() -> None:
    # Not vacuous: the shorthands and the two-visualization rows come out as panels with their queries.
    expected = all_contract_panels()
    assert expected["Spend month-to-date"][1] == [
        'max(h4_meter_spend_usd{h4_meter="month"})',
        'max(h4_meter_warn_usd{h4_meter="month"})',
        'max(h4_meter_ceiling_usd{h4_meter="month"})',
    ]
    assert expected["Kill switch"][0] == "stat"
    assert expected["Kill switch (state timeline)"] == (
        "state timeline",
        expected["Kill switch"][1],
    )
    assert expected["Spend today (stat)"][0] == "stat"
    assert expected["Fallback sub-budget remaining (time series)"][0] == "time series"
    assert expected["Store state (authoritative)"][1][0].startswith("SELECT stack, env")
    # Spec 011 (FR-046; its plan §9.4): the log panel gains the fallback record.
    assert expected["Alert log"][1] == [
        '{service_name="gateway"} | event=~"alert\\\\.(queued|delivered|retry|failed|fallback)"'
    ]
    # The collector's "and the same for" shorthand, spelled out with its pushed names (T185).
    assert expected["Export failures"][1] == [
        "sum by (exporter) (rate(otelcol_exporter_send_failed_spans_total[5m]))",
        "sum by (exporter) (rate(otelcol_exporter_send_failed_metric_points_total[5m]))",
        "sum by (exporter) (rate(otelcol_exporter_send_failed_log_records_total[5m]))",
    ]
    for _, found in expected.values():
        assert found, "a panel parsed with no query"


def test_the_alert_panels_show_each_form_and_every_fallback() -> None:
    # Spec 011 (FR-046; its plan §9.4): the outcomes table gains the form, and the fallback panel sits beside it, by
    # channel, kind, and reason, in the audit-and-alerts row, in the contract and on the dashboard alike.
    expected = contract_panels("7.5")
    assert expected["Alerts by channel and outcome"] == (
        "table",
        [
            (
                "sum by (h4_channel, h4_alert_kind, h4_outcome, h4_alert_form) "
                "(increase(h4_alerts_total[$__range]))"
            )
        ],
    )
    assert expected["Alerts sent as plain text by fallback"] == (
        "table",
        [
            (
                "sum by (h4_channel, h4_alert_kind, h4_alert_fallback_reason) "
                "(increase(h4_alert_fallbacks_total[$__range]))"
            )
        ],
    )
    found = by_title()
    outcomes = found["Alerts by channel and outcome"]
    fallbacks = found["Alerts sent as plain text by fallback"]
    assert fallbacks["type"] == "table"
    assert queries(fallbacks) == expected["Alerts sent as plain text by fallback"][1]
    # Beside each other: the same row's height, the fallback panel to the outcomes table's right.
    assert fallbacks["gridPos"]["y"] == outcomes["gridPos"]["y"]
    assert (
        fallbacks["gridPos"]["x"] >= outcomes["gridPos"]["x"] + outcomes["gridPos"]["w"]
    )


def test_the_dashboard_itself() -> None:
    assert DASHBOARD["uid"] == "h4-runtime"
    assert DASHBOARD["title"] == "h4reet.ai runtime"
    assert DASHBOARD["timezone"] == "utc"  # the meter's days and months (FR-031)
    assert DASHBOARD["refresh"] == "10s"
    assert DASHBOARD["time"] == {"from": "now-6h", "to": "now"}
    assert DASHBOARD["templating"] == {"list": []}  # each stack has its own Grafana
    assert DASHBOARD["editable"] is False


@pytest.mark.parametrize("number", REQUIRED)
def test_every_required_panel_has_the_contracts_exact_queries(number: str) -> None:
    # The parse of the contract mustn't come back empty, or the comparison below proves nothing.
    assert contract_panels(number), f"no panels parsed from telemetry.md §{number}"
    found = by_title()
    for title, (kind, expected) in contract_panels(number).items():
        assert title in found, f"§{number} {title}"
        assert queries(found[title]) == expected, title


def test_no_panel_outside_the_contract() -> None:
    expected = all_contract_panels()
    for panel in panels():
        assert panel["title"] in expected, panel["title"]
        assert queries(panel) == expected[panel["title"]][1], panel["title"]


@pytest.mark.parametrize("number", SECTIONS)
def test_each_section_is_all_or_nothing(number: str) -> None:
    titles = set(contract_panels(number))
    present = titles & set(by_title())
    assert present in (set(), titles), (
        f"§{number} is partial: missing {sorted(titles - present)}"
    )
    if number in REQUIRED:
        assert present == titles


def test_each_panels_type_is_the_contracts() -> None:
    expected = all_contract_panels()
    for panel in panels():
        kind = expected[panel["title"]][0]
        if kind == "state timeline":  # before "stat", which it starts with
            assert panel["type"] == "state-timeline", panel["title"]
        elif kind.startswith("time series"):
            assert panel["type"] == "timeseries", panel["title"]
        elif kind.startswith("stat"):
            assert panel["type"] == "stat", panel["title"]
        elif kind.startswith("table"):
            assert panel["type"] == "table", panel["title"]
        elif kind == "logs":
            assert panel["type"] == "logs", panel["title"]
        elif kind == "bar chart":
            bars = panel["fieldConfig"]["defaults"].get("custom", {}).get("drawStyle")
            assert panel["type"] == "barchart" or (
                panel["type"] == "timeseries" and bars == "bars"
            ), panel["title"]
        else:
            pytest.fail(f"{panel['title']}: no rule for the contract's type {kind!r}")


def metric_names(expr: str) -> set[str]:
    """The metric names a PromQL query reads: what's left once label values, ranges, label lists, matchers' names, and
    functions are taken out."""
    stripped = re.sub(r'"[^"]*"', '""', expr)  # label values
    stripped = re.sub(r"\[[^\]]*\]", "", stripped)  # ranges
    stripped = re.sub(
        r"\b(?:by|without|ignoring|on)\s*\([^)]*\)", "", stripped
    )  # label lists
    stripped = re.sub(
        r"[A-Za-z_][A-Za-z0-9_]*\s*(?:=~|!~|!=|=)", "", stripped
    )  # matchers' names
    return {
        name
        for name in re.findall(r"[A-Za-z_:][A-Za-z0-9_:]*", stripped)
        if name not in FUNCTIONS
    }


def test_every_metric_name_is_the_contracts() -> None:
    """telemetry.md §8: every metric name the dashboard queries appears in the contract, or is one of the "the same
    for" names it spells with _metric_points_total or _log_records_total in place of _spans_total (the collector's
    counters, pushed with _total since T185). The PromQL panels hold them all."""
    words = set(re.findall(r"[A-Za-z_:][A-Za-z0-9_:]*", CONTRACT + hosts_section()))
    names = set()
    for panel in panels():
        if panel["datasource"]["uid"] != "prom":
            continue
        for expr in queries(panel):
            names |= metric_names(expr)
    assert names
    for name in names:
        spelled = re.sub(r"_(metric_points|log_records)_total$", "_spans_total", name)
        assert name in words or spelled in words, name


FUNCTIONS = {
    "sum",
    "max",
    "avg",
    "rate",
    "increase",
    "histogram_quantile",
    "time",
    "timestamp",
    "max_over_time",
    "avg_over_time",
    "le",
}


# The collector's two gauges; every other otelcol_ metric a panel reads is a counter.
COLLECTOR_GAUGES = {"otelcol_exporter_queue_size", "otelcol_exporter_queue_capacity"}


def test_the_collectors_counters_are_the_pushed_ones() -> None:
    """T185: the collector pushes its own metrics over OTLP, and its scrape keeps only up (telemetry.md §4.3, §6.6).
    So each otelcol_ counter a panel reads has the _total that Prometheus's OTLP translation appends, and no otelcol_
    query selects the scrape's job, which no longer holds one."""
    found = set()
    for panel in panels():
        if panel["datasource"]["uid"] != "prom":
            continue
        for expr in queries(panel):
            names = set(re.findall(r"\botelcol_[a-z_]+", expr))
            for name in names - COLLECTOR_GAUGES:
                assert name.endswith("_total"), (panel["title"], name)
            assert not names or "job" not in expr, (panel["title"], expr)
            found |= names
    # Every panel of §7.6 that reads the collector: three failures, three drops, two gauges, one sent, three refused.
    assert len(found) == 12, sorted(found)
    assert COLLECTOR_GAUGES <= found


def test_every_datasource_is_the_one_its_query_language_needs() -> None:
    expected = all_contract_panels()
    for panel in panels():
        uids = {
            panel["datasource"]["uid"],
            *(t["datasource"]["uid"] for t in panel["targets"]),
        }
        assert len(uids) == 1, panel["title"]
        (uid,) = uids
        assert uid in DATASOURCES and panel["datasource"]["type"] == DATASOURCES[uid], (
            panel["title"]
        )
        assert uid == expected_uid(expected[panel["title"]][0]), panel["title"]
    assert {p["datasource"]["uid"] for p in panels()} == set(DATASOURCES)


def test_the_store_panels_read_their_sql_as_a_table() -> None:
    # The audit panel and the store's state read gateway.audit_log and gateway.v_state through grafana_ro, so they
    # still work when telemetry is down (telemetry.md §7.1, §7.5; research.md R-10).
    sql = [p for p in panels() if p["datasource"]["uid"] == "gateway"]
    assert {p["title"] for p in sql} == {
        "Store state (authoritative)",
        "Audit log",
        "Fallback spend in studio windows",
        # Spec 007's model panel reads gateway.v_twin_models (its departure D7).
        "The model each turn used",
        # Spec 010's table of the paid adapters' months reads gateway.v_adapter_months (its FR-036).
        "Paid adapters' months (authoritative)",
        # Spec 001 group 8's handovers read the shared state's gateway.v_handovers (contracts/relay-http.md §9).
        "Handovers and their gaps",
    }
    for panel in sql:
        (target,) = panel["targets"]
        assert target["format"] == "table" and target["rawQuery"] is True, panel[
            "title"
        ]
        assert target["editorMode"] == "code", panel["title"]


def dev_time_row() -> str:
    """§7.7's row title, as the contract quotes it: what the row is, said where the panels are (FR-037)."""
    found = re.search(r'The row\'s title says what it is: "([^"]+)"', section("7.7"))
    assert found, "telemetry.md §7.7 quotes the row's title"
    return found.group(1)


# Each row's title and its section of §7, in §7's order: the state and spend first, next to the requests' latency and
# errors (Principle V), the room's use after the stack's own rows, and the dev-time row last, apart from the production
# meter (FR-037).
ROWS = {
    "State": "7.1",
    "Spend": "7.2",
    "Requests": "7.3",
    "Model server": "7.4",
    "Audit and alerts": "7.5",
    "Telemetry health": "7.6",
    "Room": "7.8",
    "Room conversation": "7.10",
    # Spec 001's hosts, below the room's rows; the studio's window stays just above the dev-time row.
    "Hosts": HOSTS_ROW,
    "Studio GPU windows": STUDIO_ROW,
    dev_time_row(): "7.7",
}


def test_the_panels_fit_the_grid_and_have_their_own_ids() -> None:
    ids = [p["id"] for p in DASHBOARD["panels"]]
    assert len(ids) == len(set(ids))
    for panel in DASHBOARD["panels"]:
        grid = panel["gridPos"]
        assert grid["x"] >= 0 and grid["w"] > 0 and grid["x"] + grid["w"] <= 24, panel[
            "title"
        ]
        assert grid["h"] > 0 and grid["y"] >= 0, panel["title"]
    rows = [p["title"] for p in DASHBOARD["panels"] if p["type"] == "row"]
    assert rows == list(ROWS)
    assert dev_time_row() == (
        "Development time on the Team plan: notional cost, outside the production meter"
    )


def test_the_panels_follow_their_rows() -> None:
    # Each panel sits below its row's header and above the next row's.
    rows = sorted(
        (p for p in DASHBOARD["panels"] if p["type"] == "row"),
        key=lambda p: p["gridPos"]["y"],
    )
    for i, row in enumerate(rows):
        top = row["gridPos"]["y"]
        bottom = rows[i + 1]["gridPos"]["y"] if i + 1 < len(rows) else float("inf")
        for title in row_panels(ROWS[row["title"]]):
            y = by_title()[title]["gridPos"]["y"]
            assert top < y < bottom, (row["title"], title)


def test_spend_freshness_is_red_at_60_seconds_and_on_no_data() -> None:
    panel = by_title()["Spend freshness"]
    defaults = panel["fieldConfig"]["defaults"]
    assert defaults["unit"] == "s"
    assert defaults["thresholds"] == {
        "mode": "absolute",
        "steps": [
            {"color": "green", "value": None},
            {"color": "orange", "value": 30},
            {"color": "red", "value": 60},
        ],
    }
    (no_data,) = [m for m in defaults["mappings"] if m["type"] == "special"]
    assert no_data["options"]["match"] == "null+nan"
    assert no_data["options"]["result"]["color"] == "red"


@pytest.mark.parametrize("title", ["Model-server health", "Backends up"])
def test_up_and_down_read_as_words(title: str) -> None:
    (mapping,) = by_title()[title]["fieldConfig"]["defaults"]["mappings"]
    assert mapping["options"]["0"] == {"text": "down", "color": "red", "index": 0}
    assert mapping["options"]["1"] == {"text": "up", "color": "green", "index": 1}


def overrides(panel: dict) -> dict[str, dict]:
    """Each override's matcher option, with its properties by id."""
    return {
        o["matcher"]["options"]: {p["id"]: p["value"] for p in o["properties"]}
        for o in panel["fieldConfig"]["overrides"]
    }


@pytest.mark.parametrize("title", ["Kill switch", "Kill switch (state timeline)"])
def test_the_kill_switch_is_green_when_normal_and_red_when_degraded(title: str) -> None:
    # telemetry.md §7.1: "the stack and its state; `normal` green, `degraded` red".
    panel = by_title()[title]
    assert (
        panel["targets"][0]["legendFormat"]
        == "{{deployment_environment_name}} {{h4_state}}"
    )
    found = overrides(panel)
    assert found[" normal$"]["color"] == {"mode": "fixed", "fixedColor": "green"}
    assert found[" degraded$"]["color"] == {"mode": "fixed", "fixedColor": "red"}


def test_the_degraded_cause_reads_none_in_green() -> None:
    # §7.1: the cause a hello would get now; `none` green, and every cause red.
    panel = by_title()["Why responses are degraded"]
    assert panel["options"]["textMode"] == "name"
    assert panel["fieldConfig"]["defaults"]["color"] == {
        "mode": "fixed",
        "fixedColor": "red",
    }
    assert overrides(panel)["none"]["color"] == {"mode": "fixed", "fixedColor": "green"}
    assert (
        panel["targets"][0]["instant"] is True
    )  # the cause now, not every cause in the range


@pytest.mark.parametrize(
    "title",
    ["Fallback sub-budget remaining", "Fallback sub-budget remaining (time series)"],
)
def test_the_sub_budget_reads_to_the_micro_dollar(title: str) -> None:
    # quickstart.md §4.2 (SC-005) reads a fallback call's cost off this panel, and a Bedrock call costs a fraction
    # of a cent: at two decimals, $2.00 less 27 micro-dollars still read $2.00 (the Author's run, 2026-10-12).
    defaults = by_title()[title]["fieldConfig"]["defaults"]
    assert defaults["unit"] == "currencyUSD" and defaults["decimals"] == 6


@pytest.mark.parametrize(
    "title",
    [
        "Spend today",
        "Spend today (stat)",
        "Spend month-to-date",
        "Spend month-to-date (stat)",
    ],
)
def test_spend_reads_to_the_micro_dollar(title: str) -> None:
    # FR-028's spend panels read the meter, which keeps integer micro-USD, and one Bedrock fallback call cost 27
    # micro-dollars (the Author's run, 2026-10-12): at two decimals, a day or a month of a few such calls read $0.00
    # (docs/000-closeout's backlog). Six, as the sub-budget and the cost table read.
    defaults = by_title()[title]["fieldConfig"]["defaults"]
    assert defaults["unit"] == "currencyUSD" and defaults["decimals"] == 6


def test_the_renewal_flag_reads_as_a_whole_number() -> None:
    # The time series' B is 0 or 1, on its own right axis. The panel's 6 decimals are for dollars and would label
    # that axis 0.000000 to 1.000000, so B's override sets its own (docs/000-closeout's review).
    panel = by_title()["Fallback sub-budget remaining (time series)"]
    assert overrides(panel)["B"]["decimals"] == 0


@pytest.mark.parametrize(
    ("title", "ref"),
    [
        ("Spend today", "B"),
        ("Spend today", "C"),
        ("Spend today (stat)", "B"),
        ("Spend today (stat)", "C"),
        ("Spend month-to-date", "B"),
        ("Spend month-to-date", "C"),
        ("Spend month-to-date (stat)", "B"),
        ("Spend month-to-date (stat)", "C"),
        ("Fallback sub-budget remaining (time series)", "C"),
    ],
)
def test_the_warning_and_ceiling_lines_read_in_cents(title: str, ref: str) -> None:
    # The warning and ceiling lines are whole cents ($3.50, $5, $14, $20). With the panels at 6 decimals for the
    # meter's micro-dollars they read $3.500000, so their own overrides keep 2 (fix/000-spend-decimals's review).
    assert overrides(by_title()[title])[ref]["decimals"] == 2


@pytest.mark.parametrize(
    "title",
    ["Fallback sub-budget remaining", "Fallback sub-budget remaining (time series)"],
)
def test_awaiting_renewal_reads_in_red(title: str) -> None:
    # §7.2: "B maps 1 to "awaiting renewal" in red".
    panel = by_title()[title]
    renewal = {
        p["id"]: p["value"]
        for o in panel["fieldConfig"]["overrides"]
        if o["matcher"] == {"id": "byFrameRefID", "options": "B"}
        for p in o["properties"]
    }
    (mapping,) = renewal["mappings"]
    assert mapping["options"]["1"] == {
        "text": "awaiting renewal",
        "color": "red",
        "index": 1,
    }
    assert mapping["options"]["0"]["text"] == "available"


@pytest.mark.parametrize("meter", ["today", "month-to-date"])
def test_spend_shows_its_warning_and_ceiling(meter: str) -> None:
    # §7.2: today's spend against $3.50 and $5.00, the month's against $14.00 and $20.00, from the gateway's own
    # gauges (B and C), so the lines follow config/budgets.yaml.
    for title in (f"Spend {meter}", f"Spend {meter} (stat)"):
        legends = [t["legendFormat"] for t in by_title()[title]["targets"]]
        assert legends == ["spent", "warning", "ceiling"], title
        assert by_title()[title]["fieldConfig"]["defaults"]["unit"] == "currencyUSD"


def test_bedrocks_cost_reads_beside_locals_zero() -> None:
    # §7.2: "Bedrock's fallback and test cost beside local's zero" (FR-023, SC-005; tasks.md T106). One row per
    # provider, model, and attribution over the dashboard's range, with the gateway's own values, as quickstart.md
    # §4.2 reads them ("aws.bedrock with fallback"), in USD to the micro-dollar the meter keeps: one Bedrock call
    # costs at most about $0.0026 (plan §5.4), which two decimals would show as 0.00.
    panel = by_title()["Cost by provider and attribution"]
    (target,) = panel["targets"]
    assert target["instant"] is True and target["format"] == "table"
    defaults = panel["fieldConfig"]["defaults"]
    assert defaults["unit"] == "currencyUSD" and defaults["decimals"] == 6
    (organize,) = [t for t in panel["transformations"] if t["id"] == "organize"]
    assert organize["options"]["renameByName"] == {
        "gen_ai_provider_name": "Provider",
        "gen_ai_request_model": "Model",
        "h4_meter_attribution": "Attribution",
        "Value": "Cost",
    }
    assert panel["options"]["sortBy"] == [{"displayName": "Cost", "desc": True}]
    # The description names what Bedrock's rows mean (provider-adapter.md §3.2; data-model.md §2.5).
    for words in ("aws.bedrock", "fallback", "test", "local", "none"):
        assert words in panel["description"], words


RUNBOOKS = REPO / "docs" / "runbooks"


def test_bedrocks_health_reads_on_its_own_tile() -> None:
    # §7.4's B, `max by (h4_adapter) (h4_adapter_healthy)`: each configured adapter is its own tile, up or down, so
    # prod shows bedrock beside local (tasks.md T106). Its description says what down means for Bedrock, and names
    # the runbooks for each, which must exist.
    panel = by_title()["Model-server health"]
    adapters = [t for t in panel["targets"] if "h4_adapter_healthy" in t["expr"]]
    (target,) = adapters
    assert "{{h4_adapter}}" in target["legendFormat"]
    description = panel["description"]
    for words in ("bedrock", "credentials", "circuit"):
        assert words in description, words
    named = re.findall(r"docs/runbooks/([a-z0-9-]+\.md)", description)
    assert {"model-server-down.md", "bedrock-unavailable.md"} <= set(named)
    assert [n for n in named if not (RUNBOOKS / n).is_file()] == []


def test_every_dev_time_panel_says_its_cost_is_notional() -> None:
    # §7.7 and plan §6: dev-time usage is labelled as the Team plan's notional cost, outside the production meter
    # (FR-037; research.md R-28), on each panel of the row, not only its title; and a cost reads in dollars.
    titles = contract_panels("7.7")
    assert len(titles) == 6  # five rows of the contract, one of them a table and a stat
    for title in titles:
        panel = by_title()[title]
        assert "notional" in panel["description"], title
        assert "outside the production meter" in panel["description"], title
        if "cost" in title:
            assert panel["fieldConfig"]["defaults"]["unit"] == "currencyUSD", title


def test_each_eval_run_reads_with_its_verdict() -> None:
    # §7.7's last row: a line per history entry the gate posted (telemetry.md §4.4), named by the entry's file and
    # showing its verdict beside its cost, over the dashboard's range.
    panel = by_title()["Agent-config eval runs"]
    (target,) = panel["targets"]
    assert target["instant"] is True and target["format"] == "table"
    (organize,) = [t for t in panel["transformations"] if t["id"] == "organize"]
    assert organize["options"]["renameByName"] == {
        "h4_eval_run": "Run",
        "h4_eval_verdict": "Verdict",
        "Value": "Notional cost",
    }
    assert panel["options"]["sortBy"] == [{"displayName": "Run", "desc": True}]
    assert "evals/agent-config/history/" in panel["description"]


def test_the_dashboards_folder_is_documented() -> None:
    readme = (REPO / "deploy/grafana/dashboards/README.md").read_text(encoding="utf-8")
    assert "deploy/scripts/test_dashboard.py" in readme
    assert (
        "(state timeline)" in readme
    )  # how a two-visualization row becomes two panels
    assert "§7.7" in readme  # US3's dev-time row is required too


# --------------------------------------------------------------------------------------------------
# Spec 002's room (telemetry.md §7.8; contracts/room-events.md §4; its tasks.md T061)
# --------------------------------------------------------------------------------------------------

ROOM_SERIES = {"h4_room_events_total", "h4_room_events_refused_total"}


def test_the_room_row_is_whole_and_sits_above_the_dev_time_row() -> None:
    expected = contract_panels("7.8")
    assert list(expected) == [
        "Use per object per day",
        "Use per item per day",
        "PDF downloads per day",
        "Visits shown the 2D mode",
        # Spec 009's (its FR-034; Amendment M1).
        "Visits whose avatar failed",
        "Turns sent and talk presses",
        "Events refused",
        "Visits that walked",
        # Spec 005's (its FR-062; Amendment H8).
        "Visits in full screen",
        # Spec 012's (its FR-048; Amendment L4).
        "Visits whose loading was cut short",
    ]
    # After the stack's own rows and before the dev-time row. Not necessarily right above it: spec 003's studio row
    # (its gpu-window.md §3) goes there, and asks for that place itself.
    rows = [p["title"] for p in DASHBOARD["panels"] if p["type"] == "row"]
    assert (
        rows.index("Telemetry health") < rows.index("Room") < rows.index(dev_time_row())
    )


def test_the_room_row_reads_only_the_events_counters_by_their_own_labels() -> None:
    # FR-054: the counters carry the kind and the ID, or a refusal's reason, and nothing about the visitor, so no panel
    # can split them by anything else: every grouping and matcher is one of those labels.
    for title in contract_panels("7.8"):
        for expr in queries(by_title()[title]):
            names = set(re.findall(r"\bh4_[a-z_]+\b", expr))
            assert names and names <= ROOM_SERIES, (title, names)
            for group in re.findall(r"\bby\s*\(([^)]*)\)", expr):
                assert {g.strip() for g in group.split(",")} <= {
                    "id",
                    "kind",
                    "reason",
                }, title
            for label in re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*(?:=~|!~|!=|=)", expr):
                assert label == "kind", (title, label)


@pytest.mark.parametrize("title", ["Use per object per day", "Use per item per day"])
def test_the_rooms_use_reads_the_last_day_at_the_ranges_end(title: str) -> None:
    # One bar per object or item: an instant query over the 24 hours before the range's end, named by its ID.
    panel = by_title()[title]
    (target,) = panel["targets"]
    assert target["instant"] is True and target["range"] is False, title
    assert "[1d]" in target["expr"], title
    assert target["legendFormat"] == "{{id}}", title
    assert "24 hours" in panel["description"], title


def test_pdf_downloads_read_per_day() -> None:
    panel = by_title()["PDF downloads per day"]
    assert panel["options"]["reduceOptions"]["calcs"] == ["lastNotNull"]
    assert "24 hours" in panel["description"]


def test_the_2d_share_reads_as_a_percentage_of_a_stand_in_for_visits() -> None:
    panel = by_title()["Visits shown the 2D mode"]
    assert panel["fieldConfig"]["defaults"]["unit"] == "percentunit"
    for words in ("resume_opened", "resume_kept", "stand-in"):
        assert words in panel["description"], words


def test_the_walked_share_reads_as_a_percentage_of_a_stand_in_for_visits() -> None:
    # Spec 008's Amendment M1 (FR-053): walk_started over the same stand-in for visits as the 2D share.
    panel = by_title()["Visits that walked"]
    assert panel["fieldConfig"]["defaults"]["unit"] == "percentunit"
    (target,) = panel["targets"]
    assert 'kind="walk_started"' in target["expr"]
    for words in ("walk_started", "resume_opened", "resume_kept", "stand-in"):
        assert words in panel["description"], words


def test_the_full_screen_share_reads_as_a_percentage_of_a_stand_in_for_visits() -> None:
    # Spec 005's Amendment H8 (FR-062): fullscreen_entered over the same stand-in for visits as the walked share.
    panel = by_title()["Visits in full screen"]
    assert panel["fieldConfig"]["defaults"]["unit"] == "percentunit"
    (target,) = panel["targets"]
    assert 'kind="fullscreen_entered"' in target["expr"]
    for words in ("fullscreen_entered", "resume_opened", "resume_kept", "stand-in"):
        assert words in panel["description"], words
    # Beside "Visits that walked", in the Room row.
    walked = by_title()["Visits that walked"]
    assert panel["gridPos"]["y"] == walked["gridPos"]["y"]
    assert panel["gridPos"]["x"] >= walked["gridPos"]["x"] + walked["gridPos"]["w"]


def test_the_cut_short_share_reads_as_a_percentage_of_a_stand_in_for_visits() -> None:
    # Spec 012's Amendment L4 (FR-048): loading_cut_short over the same stand-in for visits as the walked share, its
    # description saying that 2D visits, which never show the loader, count in the denominator, so the share reads low.
    panel = by_title()["Visits whose loading was cut short"]
    assert panel["fieldConfig"]["defaults"]["unit"] == "percentunit"
    (target,) = panel["targets"]
    assert 'kind="loading_cut_short"' in target["expr"]
    for words in (
        "loading_cut_short",
        "resume_opened",
        "resume_kept",
        "stand-in",
        "2D",
    ):
        assert words in panel["description"], words
    # T037, the review's N3: the kind is sent before the hand-off, so a visit cut short that leaves before its offer
    # counts above the line alone, and the share isn't only low.
    assert "reads low rather than high" not in panel["description"]
    assert "before the hand-off" in panel["description"]
    # Beside "Visits in full screen", in the Room row.
    full = by_title()["Visits in full screen"]
    assert panel["gridPos"]["y"] == full["gridPos"]["y"]
    assert panel["gridPos"]["x"] >= full["gridPos"]["x"] + full["gridPos"]["w"]


def test_refused_events_read_by_their_reason() -> None:
    panel = by_title()["Events refused"]
    (target,) = panel["targets"]
    assert target["legendFormat"] == "{{reason}}"
    for reason in ("content_type", "shape", "kind", "id"):
        assert reason in panel["description"], reason


# --------------------------------------------------------------------------------------------------
# Spec 003's studio GPU window (contracts/gpu-window.md §3; tasks.md T036)
# --------------------------------------------------------------------------------------------------


def test_the_studio_windows_panel_is_whole_and_in_its_row() -> None:
    expected = studio_panels()
    assert list(expected) == ["Fallback spend in studio windows"]
    (title,) = expected
    panel = by_title()[title]
    assert expected[title][0] == "table (SQL)"
    assert queries(panel) == expected[title][1]
    assert queries(panel)[0].startswith('SELECT started_at AS "time"')
    assert "gateway.v_studio_windows" in queries(panel)[0]


def test_the_studio_windows_spend_reads_in_dollars_to_the_micro_dollar() -> None:
    # One Bedrock fallback call costs a few thousand micro-dollars (plan §5.4), which two decimals would show as 0.00.
    # The columns are named by overrides, not an organize step: an override matches the field's name before its own
    # displayName applies, where a rename would have changed the name it matches.
    panel = by_title()["Fallback spend in studio windows"]
    assert overrides(panel) == {
        "time": {"displayName": "Started"},
        "ended_at": {"displayName": "Ended"},
        "fallback_usd": {
            "displayName": "Fallback spend",
            "unit": "currencyUSD",
            "decimals": 6,
        },
        "fallback_calls": {"displayName": "Fallback calls"},
    }
    assert "transformations" not in panel
    for words in ("SC-011", "docs/runbooks/studio-gpu-window.md", "sub-budget"):
        assert words in panel["description"], words
    assert (REPO / "docs/runbooks/studio-gpu-window.md").is_file()


def studio_annotation() -> str:
    """gpu-window.md §3's annotation query: the backticked PromQL on the annotation's line."""
    (line,) = [x for x in studio_section().splitlines() if "**An annotation,**" in x]
    (query,) = [c for c in re.findall(r"`([^`]+)`", line) if "h4_studio_window" in c]
    return query


def test_the_studio_window_is_an_annotation_from_the_gauge() -> None:
    (annotation,) = [
        a for a in DASHBOARD["annotations"]["list"] if a["name"] == "Studio GPU windows"
    ]
    assert annotation["datasource"] == {"type": "prometheus", "uid": "prom"}
    assert annotation["enable"] is True and annotation["hide"] is False
    assert annotation["target"]["expr"] == studio_annotation()
    assert annotation["target"]["expr"] == "max(h4_studio_window) > 0"
    # Its metric is the contract's: spec 003's §1 names the gauge it adds to spec 000's §4.1.
    assert "h4_studio_window" in STUDIO


def test_the_studio_row_sits_above_the_dev_time_row() -> None:
    rows = [p for p in DASHBOARD["panels"] if p["type"] == "row"]
    titles = [r["title"] for r in rows]
    assert titles.index("Studio GPU windows") == titles.index(dev_time_row()) - 1


# --------------------------------------------------------------------------------------------------
# Spec 004's "Room live state" (telemetry.md §7.9; FR-072, SC-014; its contracts/room-live-state-telemetry.md §5
# and §6; its tasks.md T007)
# --------------------------------------------------------------------------------------------------

LIVE_SERIES = {
    "h4_relay_requests_total",
    "h4_relay_cap_refusals_total",
    "h4_relay_status_class",
}


def test_room_live_state_is_a_section_but_not_yet_required() -> None:
    # Its series are spec 001's relay's (Amendment A2): until the room's live source is switched on, the section is
    # held all or nothing, and the dashboard has none of it.
    assert "7.9" in SECTIONS
    assert REQUIRED == US1 + US2 + US3 + ROOM
    assert "7.9" not in REQUIRED


def test_room_live_state_parses_as_three_panels_each_with_one_query() -> None:
    expected = contract_panels("7.9")
    assert list(expected) == [
        "Status requests a minute",
        "Status 429s a minute",
        "Time in each class",
    ]
    assert [kind for kind, _ in expected.values()] == [
        "time series",
        "time series",
        "bar chart",
    ]
    assert [found for _, found in expected.values()] == [
        [
            'sum(rate(h4_relay_requests_total{h4_relay_route="status"}[$__rate_interval])) * 60'
        ],
        [
            'sum(rate(h4_relay_cap_refusals_total{h4_relay_route="status"}[$__rate_interval])) * 60'
        ],
        ["avg by (h4_class) (avg_over_time(h4_relay_status_class[$__range]))"],
    ]


def test_room_live_states_metrics_are_named_in_the_contracts_text() -> None:
    words = set(re.findall(r"[A-Za-z_:][A-Za-z0-9_:]*", CONTRACT))
    names: set[str] = set()
    for _, found in contract_panels("7.9").values():
        (query,) = found
        names |= metric_names(query)
    assert names == LIVE_SERIES
    assert names <= words
    # Every matcher is the route, and every grouping the class: nothing about a visitor can split a series.
    for _, found in contract_panels("7.9").values():
        for query in found:
            for label in re.findall(
                r"([A-Za-z_][A-Za-z0-9_]*)\s*(?:=~|!~|!=|=)", query
            ):
                assert label == "h4_relay_route", query
            for group in re.findall(r"\bby\s*\(([^)]*)\)", query):
                assert {g.strip() for g in group.split(",")} == {"h4_class"}, query


def test_the_dashboard_holds_none_of_room_live_state_yet() -> None:
    # The section is all or nothing (test_each_section_is_all_or_nothing), and nothing yet: no panel by its titles,
    # no query of its series as the room's live state reads them, and no row named for it. Spec 001 group 8's relay
    # brings h4_relay_requests_total itself, which its own Hosts panel reads by host and outcome (contracts/relay-
    # http.md §9); the room's live state reads it by its route label, which spec 004's Amendment A2 adds later.
    assert not set(contract_panels("7.9")) & set(by_title())
    for panel in panels():
        for expr in queries(panel):
            names = set(re.findall(r"\bh4_[a-z_]+\b", expr))
            assert not (LIVE_SERIES - {"h4_relay_requests_total"}) & names, panel[
                "title"
            ]
            assert "h4_relay_route" not in names, panel["title"]
    rows = [p["title"] for p in DASHBOARD["panels"] if p["type"] == "row"]
    assert "Room live state" not in rows


# --------------------------------------------------------------------------------------------------
# Spec 007's conversation (telemetry.md §7.10; its FR-045, Amendment 0-5; tasks.md T045)
# --------------------------------------------------------------------------------------------------

CONVERSATION_SERIES = {
    "h4_twin_turns_total",
    "h4_twin_turn_duration_seconds_bucket",
    "h4_twin_turn_duration_seconds_count",
    "h4_twin_withheld_total",
    # Spec 007's plan, D41: the answers delivered with a sentence removed, by the guard that removed it.
    "h4_twin_redacted_total",
    "h4_cost_usd_total",
}


def test_the_conversation_row_has_the_contracts_exact_queries() -> None:
    assert contract_panels("7.10"), "no panels parsed from telemetry.md §7.10"
    found = by_title()
    for title, (_kind, expected) in contract_panels("7.10").items():
        assert title in found, f"§7.10 {title}"
        assert queries(found[title]) == expected, title


def test_the_conversation_row_is_whole_and_sits_below_the_room_row() -> None:
    expected = contract_panels("7.10")
    assert list(expected) == [
        "Turns per feature, by outcome",
        "Cost per feature, today",
        "Turn latency, p95 by feature",
        "Cost per feature, 30 days",
        "Turn errors by feature",
        "Degraded turns by cause",
        "Answers withheld, by guard",
        "Answered locally",
        "The model each turn used",
    ]
    rows = [p["title"] for p in DASHBOARD["panels"] if p["type"] == "row"]
    assert rows.index("Room") + 1 == rows.index("Room conversation")


def test_the_conversation_reads_only_the_twins_series_and_never_a_visitor_label() -> (
    None
):
    # FR-043: no series holds the visitor's words, the answer, the path, or a client identifier, so no panel can
    # split by one: every grouping is the feature, the outcome, the cause, the guard, the decision, or a bucket.
    allowed = {"h4_room_feature", "h4_outcome", "h4_cause", "h4_twin_guard", "le"}
    for title in contract_panels("7.10"):
        panel = by_title()[title]
        if panel["datasource"]["uid"] != "prom":
            continue
        for expr in queries(panel):
            names = metric_names(expr)
            assert names and names <= CONVERSATION_SERIES, (title, names)
            for group in re.findall(r"\bby\s*\(([^)]*)\)", expr):
                assert {g.strip() for g in group.split(",")} <= allowed, title
            assert "path" not in expr and "client" not in expr, title


def test_each_features_cost_sits_beside_its_latency_and_errors() -> None:
    # Principle V: "every dashboard shows spend next to latency and errors".
    cost = by_title()["Cost per feature, today"]["gridPos"]
    latency = by_title()["Turn latency, p95 by feature"]["gridPos"]
    errors = by_title()["Turn errors by feature"]["gridPos"]
    month = by_title()["Cost per feature, 30 days"]["gridPos"]
    assert cost["y"] == latency["y"] and month["y"] == errors["y"]


def test_the_model_panel_reads_the_view_and_no_visit() -> None:
    (target,) = by_title()["The model each turn used"]["targets"]
    assert "gateway.v_twin_models" in target["rawSql"]
    for column in ("client_label", "request_id", "trace_id"):
        assert column not in target["rawSql"]


def test_the_avatar_failure_share_reads_as_the_2d_share_reads() -> None:
    # Spec 009's FR-034: avatar_failed over the same stand-in for visits, as a percentage.
    panel = by_title()["Visits whose avatar failed"]
    assert panel["fieldConfig"]["defaults"]["unit"] == "percentunit"
    for words in ("avatar_failed", "resume_opened", "resume_kept", "stand-in"):
        assert words in panel["description"], words


def test_the_avatar_failure_panel_is_the_twins_graph_too() -> None:
    # Spec 016's FR-051: the same panel, no new one, its reading naming the twin's own files among those it counts.
    panel = by_title()["Visits whose avatar failed"]
    for words in ("the twin's own model", "its clips", "spec 016"):
        assert words in panel["description"], words


# Spec 010 (FR-036; its plan §9): the paid adapter's month beside its cap and its warning, in the Spend row, and the
# adapters' months as the store holds them, beside the store-state panel.
ADAPTER_MONTH_PANEL = "Paid adapter's month against its cap"
ADAPTER_MONTHS_TABLE = "Paid adapters' months (authoritative)"


def test_the_paid_adapters_month_has_its_panels() -> None:
    found = by_title()
    month = found[ADAPTER_MONTH_PANEL]
    assert queries(month) == [
        "max by (h4_adapter) (h4_adapter_month_spend_usd)",
        "max by (h4_adapter) (h4_adapter_month_warn_usd)",
        "max by (h4_adapter) (h4_adapter_month_cap_usd)",
    ]
    table = found[ADAPTER_MONTHS_TABLE]
    assert queries(table) == [
        (
            "SELECT adapter, month, spent_micro / 1e6 AS spent_usd, reserved_micro / 1e6 AS reserved_usd, warned_at, "
            "reached_at FROM gateway.v_adapter_months ORDER BY month DESC, adapter"
        )
    ]
    assert table["type"] == "table"
    assert table["datasource"]["uid"] == "gateway"


def test_the_hosts_row_holds_group_5s_panels_whole() -> None:
    # Spec 001 tasks.md T053: the tunnel's state and reconnects, and telemetry delayed or lost on its way from the
    # tunnel end (its collector's queue and drops), each with the contract's exact queries, in their row.
    expected = hosts_panels()
    assert set(expected) == {
        "Tunnel up",
        "Tunnel up (state timeline)",
        "Tunnel reconnects",
        "Telemetry delayed at the tunnel end",
        "Telemetry lost at the tunnel end",
        # Group 6's (tasks.md T075; contracts/shared-state.md §10).
        "Shared state latency, p95",
        "Shared state errors",
        "Last good backup's age",
        # Group 7's (tasks.md T091; contracts/releases-deployer.md §6).
        "The release on each host",
        "Deployments",
        # Group 8's (tasks.md T110; contracts/relay-http.md §9).
        "Which host serves",
        "Handovers and their gaps",
        "The relay's requests by host and outcome",
        "The public cap's refusals",
        # Group 9's (tasks.md T127; contracts/handover.md §10).
        "EC2's state",
        "EC2's spot request",
        "EC2's starts, refusals, and the guard's stops",
        "The hours' scheduled starts and stops",
        "The autostart switch",
        "The laptop's health check",
        "The handover window",
        "The server's month against its budget",
        # Group 10's (tasks.md T137; contracts/public-view.md §5).
        "The public view's age",
        "The public view's writes and posts",
    }
    found = by_title()
    for title, (kind, queries_) in expected.items():
        assert title in found, title
        assert queries(found[title]) == queries_, title
    # Group 7's review A, nit 6: the release table shows what each host's deployer said in its last few runs, so the old
    # release's row goes within minutes, not an hour.
    assert expected["The release on each host"][1] == [
        "max by (h4_host, h4_release, h4_commit, h4_started_by) (last_over_time(h4_release_info[5m]))"
    ]
    assert expected["Telemetry lost at the tunnel end"][1] == [
        'sum by (exporter) (rate(otelcol_exporter_enqueue_failed_spans_total{service_name="tunnel-end-collector"}[5m]))',
        'sum by (exporter) (rate(otelcol_exporter_enqueue_failed_metric_points_total{service_name="tunnel-end-collector"}[5m]))',
        'sum by (exporter) (rate(otelcol_exporter_enqueue_failed_log_records_total{service_name="tunnel-end-collector"}[5m]))',
    ]


def test_the_tunnel_reads_up_and_down_as_words() -> None:
    for title in ("Tunnel up", "Tunnel up (state timeline)"):
        mappings = by_title()[title]["fieldConfig"]["defaults"]["mappings"]
        words = {
            m["options"][k]["text"]
            for m in mappings
            if m["type"] == "value"
            for k in m["options"]
        }
        assert words == {"up", "down"}, title


def test_which_host_serves_reads_none_in_red() -> None:
    # Spec 001 group 8 (contracts/relay-http.md §9): the timeline shows each host's one-hot series, none's in red.
    panel = by_title()["Which host serves"]
    assert panel["type"] == "state-timeline"
    steps = panel["fieldConfig"]["defaults"]["thresholds"]["steps"]
    assert steps[0]["color"] == "transparent" and steps[-1] == {
        "color": "green",
        "value": 1,
    }
    (override,) = panel["fieldConfig"]["overrides"]
    assert override["matcher"] == {"id": "byName", "options": "none"}
    # Group 8's review A, I4: a value mapping's colour wins over a field's, so none's own mapping paints its 1 red; a
    # colour override alone would leave it the default mapping's green.
    (mapping,) = [p["value"] for p in override["properties"] if p["id"] == "mappings"]
    ones = [
        m["options"]["1"]
        for m in mapping
        if m["type"] == "value" and "1" in m["options"]
    ]
    assert [o["color"] for o in ones] == ["red"]
    # Its series are labelled by h4.serving, which the tunnel end's collector doesn't route on, so the one-hot set
    # reaches either host's Prometheus whole.
    assert queries(panel) == ["max by (h4_serving) (h4_serving_host)"]
    assert panel["targets"][0]["legendFormat"] == "{{h4_serving}}"


def test_the_relays_panels_read_no_address() -> None:
    for title in (
        "The relay's requests by host and outcome",
        "The public cap's refusals",
        "Handovers and their gaps",
    ):
        for query in queries(by_title()[title]):
            assert "address" not in query and "client" not in query, title
