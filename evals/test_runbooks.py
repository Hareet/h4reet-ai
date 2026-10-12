"""docs/runbooks/ against contracts/alerts.md §6 and plan §16 (spec 000; tasks.md T062, T082, T106).

Every page alerts.md §6 names exists once the task that writes it is done; each covers the alerts and causes its
row names, in backticks; every runbook has plan §16's six sections in order (Symptoms · Impact · Act · Verify ·
Undo · Record); and every make target a runbook's commands name is one the Makefile has, or one a later task adds.
A later task's mark expires, as plan §11's do: once tasks.md marks the task done, what it adds is required.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
RUNBOOKS = REPO / "docs" / "runbooks"
SPEC = REPO / "specs" / "000-local-foundations"
ALERTS = (SPEC / "contracts" / "alerts.md").read_text(encoding="utf-8")
TASKS = (SPEC / "tasks.md").read_text(encoding="utf-8")
MAKEFILE = (REPO / "Makefile").read_text(encoding="utf-8")
SECTIONS = ["Symptoms", "Impact", "Act", "Verify", "Undo", "Record"]
# Pages a later task writes, and make targets a later task adds, each with that task.
LATER_PAGES = {
    "bedrock-credentials-expiring.md": "T106",
    "bedrock-unavailable.md": "T106",
}
LATER_TARGETS = {
    "operator-reset": "T075",
    "operator-renew": "T075",
    "operator-audit": "T075",
    "operator-incidents": "T075",
}
# tasks.md T082's nine.
US2_PAGES = (
    "cost-warning.md",
    "kill-switch-trip.md",
    "kill-switch-reset.md",
    "fallback-renewal.md",
    "alert-channel-down.md",
    "store-unreachable.md",
    "journal-unwritable.md",
    "operator-auth-failures.md",
    "gateway-down.md",
)


def done(task: str) -> bool:
    return re.search(rf"^- \[[Xx]\] {task}\b", TASKS, re.MULTILINE) is not None


def section6() -> list[tuple[list[str], str]]:
    """Each row of alerts.md §6's table: the names in backticks in its first column, and its page."""
    start = ALERTS.index("\n## 6. Runbooks")
    end = ALERTS.index("\n## 7.", start)
    rows = []
    for line in ALERTS[start:end].splitlines():
        if not line.startswith("| ") or line.startswith("| Alert or cause"):
            continue
        first, second = (c.strip() for c in line.strip().strip("|").split("|")[:2])
        (page,) = re.findall(r"`([a-z0-9-]+\.md)`", second)
        rows.append((re.findall(r"`([^`]+)`", first), page))
    return rows


def pages() -> list[Path]:
    return sorted(p for p in RUNBOOKS.glob("*.md") if p.name != "README.md")


def required(page: str) -> bool:
    return page not in LATER_PAGES or done(LATER_PAGES[page])


def test_the_table_parses() -> None:
    rows = section6()
    assert len(rows) >= 13
    assert (["trip", "kill_switch_tripped", "reminder"], "kill-switch-trip.md") in rows


def test_every_page_alerts_md_names_exists() -> None:
    missing = [
        page
        for _, page in section6()
        if required(page) and not (RUNBOOKS / page).is_file()
    ]
    assert not missing, missing


def test_the_us2_pages_exist() -> None:
    assert [p for p in US2_PAGES if not (RUNBOOKS / p).is_file()] == []


@pytest.mark.parametrize(("names", "page"), section6(), ids=lambda v: str(v))
def test_each_page_covers_what_its_row_names(names: list[str], page: str) -> None:
    path = RUNBOOKS / page
    if not path.is_file():
        assert not required(page), page
        pytest.skip(f"{page} arrives with tasks.md {LATER_PAGES[page]}")
    text = path.read_text(encoding="utf-8")
    assert [n for n in names if f"`{n}`" not in text] == [], page


def test_every_runbook_has_the_six_sections_in_order() -> None:
    assert pages()
    for path in pages():
        text = path.read_text(encoding="utf-8")
        assert text.startswith("# Runbook: "), path.name
        assert re.findall(r"^## (.+)$", text, re.MULTILINE) == SECTIONS, path.name


def code(text: str) -> str:
    """The commands a page gives: its fenced blocks, indented inside a list or not, and its inline code."""
    fence = r"^[ \t]*```[a-z]*\n(.*?)^[ \t]*```"
    blocks = re.findall(fence, text, re.MULTILINE | re.DOTALL)
    rest = re.sub(fence, "", text, flags=re.MULTILINE | re.DOTALL)
    return "\n".join(blocks + re.findall(r"`([^`\n]+)`", rest))


def test_every_make_target_a_runbook_names_exists() -> None:
    targets = set(re.findall(r"^([a-z][a-z0-9-]*):", MAKEFILE, re.MULTILINE))
    assert {"up", "status", "logs", "operator-status"} <= targets
    named: dict[str, set[str]] = {}
    for path in pages():
        for target in re.findall(
            r"\bmake ([a-z][a-z0-9-]*)", code(path.read_text(encoding="utf-8"))
        ):
            named.setdefault(target, set()).add(path.name)
    assert (
        "operator-reset" in named
    )  # not vacuous: the US2 pages name the targets T075 adds
    unknown = {
        target: sorted(where)
        for target, where in named.items()
        if target not in targets
        and not (target in LATER_TARGETS and not done(LATER_TARGETS[target]))
    }
    assert not unknown, unknown
