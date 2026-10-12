"""docs/runbooks/ against contracts/alerts.md §6 and plan §16 (spec 000; tasks.md T062, T082, T106).

Every page alerts.md §6 names exists once the task that writes it is done; each covers the alerts and causes its
row names, in backticks; every runbook has plan §16's six sections in order (Symptoms · Impact · Act · Verify ·
Undo · Record); and every make target a runbook's commands name is one the Makefile has, or one a later task adds.
A later task's mark expires, as plan §11's do: once tasks.md marks the task done, what it adds is required. The two
Bedrock pages also quote their alerts as alerts.md §3's examples give them, and hello's degraded detail as
gateway-http.md §3 does, read from those files.
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


GATEWAY_HTTP = (SPEC / "contracts" / "gateway-http.md").read_text(encoding="utf-8")
BEDROCK_PAGES = [
    ("credentials_expiring", "bedrock-credentials-expiring.md"),
    ("fallback_unavailable", "bedrock-unavailable.md"),
]


def example(kind: str) -> list[str]:
    """alerts.md §3's example message for a kind: its lines, the stack's prefix taken off the first."""
    start = ALERTS.index(f"\n**`{kind}`:**")
    block = re.search(r"```text\n(.*?)```", ALERTS[start:], re.DOTALL)
    assert block, kind
    lines = block.group(1).splitlines()
    lines[0] = lines[0].split("] ", 1)[1]
    return lines


def degraded_detail(cause: str) -> str:
    """gateway-http.md §3's fixed `detail` text for a degraded cause: the table's last column."""
    start = GATEWAY_HTTP.index("\n## 3. ")
    for line in GATEWAY_HTTP[
        start : GATEWAY_HTTP.index("\n## 4. ", start)
    ].splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[0] == f"`{cause}`":
            return cells[-1]
    raise AssertionError(f"gateway-http.md §3 has no cause {cause}")


@pytest.mark.parametrize(("kind", "page"), BEDROCK_PAGES)
def test_the_bedrock_pages_show_their_alert_as_it_arrives(kind: str, page: str) -> None:
    # tasks.md T106: each page quotes its alert from alerts.md §3's example, which this reads, not a copy: the
    # headline up to its variable part (the session's end, or the health reason), the kind's fixed sentence, and the
    # alert's id with the stack and adapter filled in, as alerts.md §2's dedupe key gives it on prod.
    if not required(page):
        pytest.skip(f"{page} arrives with tasks.md {LATER_PAGES[page]}")
    lines = example(kind)
    assert lines[-1] == f"Runbook: docs/runbooks/{page}"
    headline = re.split(r" (?=\d|\()", lines[0], maxsplit=1)[0]
    text = (RUNBOOKS / page).read_text(encoding="utf-8")
    assert headline in text
    assert lines[-2] in text  # the kind's fixed sentence
    assert f"`prod:{kind}:bedrock:" in text


def test_the_bedrock_pages_point_at_each_other_and_the_fix() -> None:
    # The expiring session's fix is make aws-login (alerts.md §3); an expired one shows as Bedrock unhealthy with
    # `credentials`, and hello's degraded answer quotes gateway-http.md §3's detail for `fallback_unavailable`.
    if not all(required(page) for _, page in BEDROCK_PAGES):
        pytest.skip("the Bedrock pages arrive with tasks.md T106")
    expiring = (RUNBOOKS / "bedrock-credentials-expiring.md").read_text(
        encoding="utf-8"
    )
    unavailable = (RUNBOOKS / "bedrock-unavailable.md").read_text(encoding="utf-8")
    assert "make aws-login" in code(expiring)
    assert "bedrock-unavailable.md" in expiring
    assert "bedrock-credentials-expiring.md" in unavailable
    assert "`credentials`" in unavailable and "`circuit_open`" in unavailable
    assert degraded_detail("fallback_unavailable") in unavailable
