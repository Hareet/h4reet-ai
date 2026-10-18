"""deploy/grafana/dashboards/h4-runtime.json against contracts/telemetry.md §7 and §8 (spec 000 FR-028, FR-032, FR-034,
FR-037).

The expected panels and their exact queries are read from the contract's own tables, so a query changes in the
contract first and here never. Each of §7's sections is all or nothing, and every one must be whole: US1's three
(§7.3 requests, §7.4 the model server, §7.6 telemetry health), US2's three (§7.1 state, §7.2 spend, §7.5 audit and
alerts), and US3's dev-time row (§7.7, tasks.md T094).

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
US1 = ("7.3", "7.4", "7.6")
US2 = ("7.1", "7.2", "7.5")
US3 = ("7.7",)
REQUIRED = US1 + US2 + US3
SECTIONS = ("7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7")
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
    return expected


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
    assert expected["Alert log"][1] == [
        '{service_name="gateway"} | event=~"alert\\\\.(queued|delivered|retry|failed)"'
    ]
    # The collector's "and the same for" shorthand, spelled out with its pushed names (T185).
    assert expected["Export failures"][1] == [
        "sum by (exporter) (rate(otelcol_exporter_send_failed_spans_total[5m]))",
        "sum by (exporter) (rate(otelcol_exporter_send_failed_metric_points_total[5m]))",
        "sum by (exporter) (rate(otelcol_exporter_send_failed_log_records_total[5m]))",
    ]
    for _, found in expected.values():
        assert found, "a panel parsed with no query"


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


def test_every_metric_name_is_the_contracts() -> None:
    """telemetry.md §8: every metric name the dashboard queries appears in the contract, or is one of the "the same
    for" names it spells with _metric_points_total or _log_records_total in place of _spans_total (the collector's
    counters, pushed with _total since T185). The PromQL panels hold them all."""
    words = set(re.findall(r"[A-Za-z_:][A-Za-z0-9_:]*", CONTRACT))
    names = set()
    for panel in panels():
        if panel["datasource"]["uid"] != "prom":
            continue
        for expr in queries(panel):
            stripped = re.sub(r'"[^"]*"', '""', expr)  # label values
            stripped = re.sub(r"\[[^\]]*\]", "", stripped)  # ranges
            stripped = re.sub(
                r"\b(?:by|without|ignoring|on)\s*\([^)]*\)", "", stripped
            )  # label lists
            stripped = re.sub(
                r"[A-Za-z_][A-Za-z0-9_]*\s*(?:=~|!~|!=|=)", "", stripped
            )  # matchers' names
            for name in re.findall(r"[A-Za-z_:][A-Za-z0-9_:]*", stripped):
                if name not in FUNCTIONS:
                    names.add(name)
    assert names
    for name in names:
        spelled = re.sub(r"_(metric_points|log_records)_total$", "_spans_total", name)
        assert name in words or spelled in words, name


FUNCTIONS = {
    "sum",
    "max",
    "rate",
    "increase",
    "histogram_quantile",
    "time",
    "timestamp",
    "max_over_time",
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
    assert {p["title"] for p in sql} == {"Store state (authoritative)", "Audit log"}
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
# errors (Principle V), and the dev-time row last, apart from the production meter (FR-037).
ROWS = {
    "State": "7.1",
    "Spend": "7.2",
    "Requests": "7.3",
    "Model server": "7.4",
    "Audit and alerts": "7.5",
    "Telemetry health": "7.6",
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
        for title in contract_panels(ROWS[row["title"]]):
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
