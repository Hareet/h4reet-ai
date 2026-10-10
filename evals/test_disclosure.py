"""docs/data-flow-disclosure.md against the code whose flows it lists (spec 000 FR-040; plan §17; tasks.md T083, T106).

The compose policy already requires a row for every service (tools/gates/compose_policy.py). These hold rows to what
the code does: the breach probe's row names exactly the services evals/breach_probe.py calls, and the alerts' rows
name the Telegram Bot API and the alerts mailbox, which the gateway's egress row points at. Bedrock's two rows keep
plan §17's words, name the region config/routing.yaml must use, and name the SSO token's refresh while prod runs.
"""

from __future__ import annotations

import importlib.util
import re
import sys
import urllib.parse
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]
TEXT = (REPO / "docs" / "data-flow-disclosure.md").read_text(encoding="utf-8")
SERVICES = set(
    yaml.safe_load((REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8"))[
        "services"
    ]
)
SPEC = importlib.util.spec_from_file_location(
    "h4_breach_probe_disclosed", REPO / "evals" / "breach_probe.py"
)
assert SPEC and SPEC.loader
probe = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = probe
SPEC.loader.exec_module(probe)


def rows() -> dict[str, list[str]]:
    """Each table row by its ID: its cells, the From → To first."""
    found = {}
    for line in TEXT.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if (
            line.startswith("| ")
            and len(cells) == 9
            and re.fullmatch(r"[A-Z]\d+", cells[0])
        ):
            found[cells[0]] = cells[1:]
    return found


def named(cell: str) -> set[str]:
    return set(re.findall(r"`([a-z0-9][a-z0-9-]*)`", cell))


def called_hosts() -> set[str]:
    """Every host a URL in breach_probe.py's source names, constant or not, and those its module constants hold."""
    source = (REPO / "evals" / "breach_probe.py").read_text(encoding="utf-8")
    urls = set(re.findall(r"""https?://[^\s"'/{}]+""", source))
    urls |= {v for v in vars(probe).values() if isinstance(v, str) and "://" in v}
    return {urllib.parse.urlsplit(url).hostname or "" for url in urls}


def test_the_probe_row_names_exactly_the_services_the_probe_calls() -> None:
    called = called_hosts()
    # The hosts of its service constants are among them: the scan misses none of the ones it calls.
    assert {
        urllib.parse.urlsplit(url).hostname
        for url in (probe.GATEWAY, probe.PROMETHEUS, probe.LANGFUSE, probe.MAILPIT)
    } <= called
    assert (
        called <= SERVICES
    )  # every host the probe calls is one of the stack's own services
    from_to = rows()["S11"][0]
    assert named(from_to) & SERVICES == called | {"breach-probe"}


def test_the_alert_channels_have_their_rows() -> None:
    found = rows()
    telegram = [
        r
        for r in found.values()
        if named(r[0].split("→", 1)[0]) == {"gateway"} and "`api.telegram.org`" in r[0]
    ]
    email = [
        r
        for r in found.values()
        if named(r[0].split("→", 1)[0]) == {"gateway"} and "`SMTP_HOST`" in r[0]
    ]
    assert len(telegram) == 1 and len(email) == 1
    for row in (*telegram, *email):
        assert "FR-032" in row[-1] and "FR-040" in row[-1]
    # The gateway's egress row points at them, by ID.
    ids = [i for i, r in found.items() if r in (*telegram, *email)]
    assert all(i in found["S2"][1] for i in ids), found["S2"][1]


SPEC_DIR = REPO / "specs" / "000-local-foundations"
PLAN = (SPEC_DIR / "plan.md").read_text(encoding="utf-8")


def plan_row(flow: str) -> list[str]:
    """plan §17's row for a flow: its cells after the flow's name (destination, carries, when, control)."""
    start = PLAN.index("\n## 17. ")
    for line in PLAN[start : PLAN.index("\n## 18. ", start)].splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells and cells[0] == flow:
            return cells[1:]
    raise AssertionError(f"plan §17 has no row {flow!r}")


def test_bedrock_and_its_credentials_have_their_rows() -> None:
    # plan §17's two AWS rows (tasks.md T106). A row is a privacy promise, so the plan's own words are in it, each
    # cell's beside the reading the row adds (CLAUDE.md): the destination in From → To, When in Trigger, Carries in
    # Carries, and the control in How to switch it off.
    found = rows()
    for row_id, flow in (
        ("F1", "Bedrock fallback"),
        ("F2", "AWS SSO credential exchange"),
    ):
        destination, carries, when, control = plan_row(flow)
        from_to, trigger, carried, _never, _why, _default, off, fr = found[row_id]
        assert destination in from_to, row_id
        assert when in trigger, row_id
        assert carries in carried, row_id
        assert control in off, row_id
        assert "FR-040" in fr and "FR-022" in fr, row_id
    assert named(found["F1"][0].split("→", 1)[0]) == {"gateway"}
    assert "`bedrock-runtime.us-east-1.amazonaws.com`" in found["F1"][0]
    assert "FR-013" in found["F2"][-1]


def test_the_sso_row_names_the_refresh_until_the_author_decides() -> None:
    # plan §5.2's correction (2026-10-10): the SDK refreshes the SSO token in memory in its last 5 minutes, through
    # oidc.us-east-1.amazonaws.com, while prod runs. T102 keeps that default until the Author decides, so the row
    # names the host both at login and while running, and says the decision could narrow it to login only.
    from_to = rows()["F2"][0]
    assert "`oidc.us-east-1.amazonaws.com`" in from_to
    assert "at login, and while running" in from_to
    assert "T102" in from_to and "login only" in from_to
    assert "last 5 minutes" in from_to


def test_bedrocks_region_is_the_one_routing_must_name() -> None:
    # contracts/config-files.md §1.1: `region` must be "the region the data-flow disclosure lists" (rule R7), so the
    # contract's region, and any bedrock-converse adapter's in config/routing.yaml, is the host F1 names.
    config_files = (SPEC_DIR / "contracts" / "config-files.md").read_text(
        encoding="utf-8"
    )
    (region,) = re.findall(
        r"\| `region` \| string \| `([a-z0-9-]+)`, the region the data-flow disclosure lists",
        config_files,
    )
    routing = yaml.safe_load(
        (REPO / "config" / "routing.yaml").read_text(encoding="utf-8")
    )
    regions = {region} | {
        adapter["region"]
        for adapter in routing["adapters"].values()
        if adapter.get("type") == "bedrock-converse"
    }
    assert regions == {"us-east-1"}
    assert f"`bedrock-runtime.{region}.amazonaws.com`" in rows()["F1"][0]


def test_the_gateways_egress_row_points_at_the_aws_rows() -> None:
    trigger = rows()["S2"][1]
    assert "F1" in trigger and "F2" in trigger
    assert "get their rows with the code that calls them" not in trigger


def test_the_stand_ins_rows_point_at_the_probes() -> None:
    for row_id in ("S12", "S13"):
        assert "(S11)" in rows()[row_id][1]


def test_the_telegram_row_carries_what_an_operator_actions_alert_does() -> None:
    # contracts/alerts.md §3: "The headline names the action and the actor's fingerprint, never the reason". The row
    # that lists what leaves names it too (round 1's review).
    alerts = (
        REPO / "specs" / "000-local-foundations" / "contracts" / "alerts.md"
    ).read_text(encoding="utf-8")
    assert "operator #<8 hex>" in alerts
    carries = rows()["A1"][2]
    assert "`operator #<8 hex>`" in carries and "fingerprint" in carries


def test_the_telegram_row_says_what_puts_dev_back_on_the_stand_ins() -> None:
    # "success or not" doesn't hold for a run killed outright: the row says which ends put dev back, and what does
    # when the run can't (round 1's review).
    off = rows()["A1"][6]  # how to switch it off
    assert "success or not" not in off
    assert "SIGKILL" in off and "`make up ENV=dev`" in off
