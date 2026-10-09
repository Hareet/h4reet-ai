"""docs/data-flow-disclosure.md against the code whose flows it lists (spec 000 FR-040; plan §17; tasks.md T083).

The compose policy already requires a row for every service (tools/gates/compose_policy.py). These hold three rows to
what the code does: the breach probe's row names exactly the services evals/breach_probe.py calls, and the alerts'
rows name the Telegram Bot API and the alerts mailbox, which the gateway's egress row points at.
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


def test_the_stand_ins_rows_point_at_the_probes() -> None:
    for row_id in ("S12", "S13"):
        assert "(S11)" in rows()[row_id][1]
