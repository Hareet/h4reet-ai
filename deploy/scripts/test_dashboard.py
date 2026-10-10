"""deploy/grafana/dashboards/h4-runtime.json against contracts/telemetry.md §7 and §8 (spec 000 FR-028).

The expected panels and their exact queries are read from the contract's own tables, so a query changes in the
contract first and here never. Each of §7's sections is all or nothing: US1's three (§7.3 requests, §7.4 the model
server, §7.6 telemetry health) must be whole, and a later section is either absent or whole, so the task that adds
it (the spend, state, and audit panels; the dev-time row) needs nothing changed here to be held to the contract.
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
SECTIONS = ("7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7")
DATASOURCES = {
    "prom": "prometheus",
    "loki": "loki",
    "gateway": "grafana-postgresql-datasource",
}


def section(number: str) -> str:
    start = CONTRACT.index(f"\n### {number} ")
    end = CONTRACT.find("\n### ", start + 1)
    return CONTRACT[start : end if end > 0 else None]


def cells(line: str) -> list[str]:
    return [
        c.strip().replace("\\|", "|")
        for c in re.split(r"(?<!\\)\|", line.strip())[1:-1]
    ]


def expand(cell: str) -> list[str]:
    """A query cell's queries, with the contract's two shorthands spelled out."""
    codes = re.findall(r"`([^`]+)`", cell)
    if "and the same with `0.95`" in cell:
        return [
            codes[0],
            codes[0].replace("histogram_quantile(0.50,", "histogram_quantile(0.95,"),
        ]
    # The collector's counters carry no _total (telemetry.md §4.3; T065 found the panels empty with it).
    if "and the same for" in cell and re.search(r"_spans\b", codes[0]):
        base = codes[0]
        return [
            base,
            re.sub(r"_spans\b", "_metric_points", base),
            re.sub(r"_spans\b", "_log_records", base),
        ]
    return [c for c in codes if re.search(r"[({\[]", c)]


def contract_panels(number: str) -> dict[str, tuple[str, list[str]]]:
    """Each panel of a section: its title (without the FR note), its type cell, and its queries."""
    out: dict[str, tuple[str, list[str]]] = {}
    for line in section(number).splitlines():
        if not line.startswith("| ") or line.startswith("| Panel"):
            continue
        title, kind, query = cells(line)[
            :3
        ]  # §7.1 and §7.2 add a fourth column, what the panel shows
        title = re.sub(r"\s*\(FR-[^)]*\)$", "", title)
        if "; stat: " in query:  # a time series, and a stat of the same over the range
            series, stat = query.split("; stat: ", 1)
            out[title] = ("time series", expand(series))
            out[f"{title} over the range"] = ("stat", expand(stat))
            continue
        out[title] = (kind, expand(query))
    return out


def panels() -> list[dict]:
    return [p for p in DASHBOARD["panels"] if p["type"] != "row"]


def by_title() -> dict[str, dict]:
    return {p["title"]: p for p in panels()}


def queries(panel: dict) -> list[str]:
    return [t["expr"] for t in panel["targets"]]


def test_the_dashboard_itself() -> None:
    assert DASHBOARD["uid"] == "h4-runtime"
    assert DASHBOARD["title"] == "h4reet.ai runtime"
    assert DASHBOARD["timezone"] == "utc"  # the meter's days and months (FR-031)
    assert DASHBOARD["refresh"] == "10s"
    assert DASHBOARD["time"] == {"from": "now-6h", "to": "now"}
    assert DASHBOARD["templating"] == {"list": []}  # each stack has its own Grafana
    assert DASHBOARD["editable"] is False


@pytest.mark.parametrize("number", US1)
def test_every_us1_panel_has_the_contracts_exact_queries(number: str) -> None:
    # The parse of the contract mustn't come back empty, or the comparison below proves nothing.
    assert contract_panels(number), f"no panels parsed from telemetry.md §{number}"
    found = by_title()
    for title, (kind, expected) in contract_panels(number).items():
        assert title in found, f"§{number} {title}"
        assert queries(found[title]) == expected, title


def test_no_panel_outside_the_contract() -> None:
    expected = {}
    for number in SECTIONS:
        expected.update(contract_panels(number))
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
    if number in US1:
        assert present == titles


def test_each_panels_type_is_the_contracts() -> None:
    expected = {}
    for number in SECTIONS:
        expected.update(contract_panels(number))
    for panel in panels():
        kind = expected[panel["title"]][0]
        if kind.startswith("time series"):
            assert panel["type"] == "timeseries", panel["title"]
        elif kind.startswith("stat"):
            assert panel["type"] == "stat", panel["title"]
        elif kind.startswith("table"):
            assert panel["type"] == "table", panel["title"]
        elif kind == "bar chart":
            bars = panel["fieldConfig"]["defaults"].get("custom", {}).get("drawStyle")
            assert panel["type"] == "barchart" or (
                panel["type"] == "timeseries" and bars == "bars"
            ), panel["title"]
        else:
            pytest.fail(f"{panel['title']}: no rule for the contract's type {kind!r}")


def test_every_metric_name_is_the_contracts() -> None:
    """telemetry.md §8: every metric name the dashboard queries appears in the contract, or is one of the "the same
    for" names it spells with _metric_points or _log_records in place of _spans."""
    words = set(re.findall(r"[A-Za-z_:][A-Za-z0-9_:]*", CONTRACT))
    names = set()
    for panel in panels():
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
        spelled = re.sub(r"_(metric_points|log_records)$", "_spans", name)
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


def test_every_datasource_is_one_of_the_three() -> None:
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
    # US1's panels are all PromQL.
    assert {p["datasource"]["uid"] for p in panels()} == {"prom"}


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
    assert rows == ["Requests", "Model server", "Telemetry health"]


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


def test_the_dashboards_folder_is_documented() -> None:
    readme = (REPO / "deploy/grafana/dashboards/README.md").read_text(encoding="utf-8")
    assert "deploy/scripts/test_dashboard.py" in readme
