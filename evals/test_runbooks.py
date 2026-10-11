"""docs/runbooks/ against contracts/alerts.md §6 and plan §16 (spec 000; tasks.md T062, T082, T106, T111).

Every page alerts.md §6 names exists once the task that writes it is done; each covers the alerts and causes its
row names, in backticks; every runbook has plan §16's six sections in order (Symptoms · Impact · Act · Verify ·
Undo · Record); and every make target a runbook's commands name is one the Makefile has, or one a later task adds.
A later task's mark expires, as plan §11's do: once tasks.md marks the task done, what it adds is required. The two
Bedrock pages also quote their alerts as alerts.md §3's examples give them, and hello's degraded detail as
gateway-http.md §3 does, read from those files.

From T111: the folder holds exactly the pages plan §16 lists; the index, docs/runbooks/README.md, links each and
names the alerts and causes alerts.md §6 sends to it; the agents' engine's page quotes the messages the engine's code
prints and names the Author's commands its code takes; and the local gate's page names what make check prints. From
US6's review, it gives --host in the gate's own words, read from tools/gates/gate.
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
    # US3's targets, which the local gate's page names (T111); US3's branch adds them.
    "secrets": "T091",
    "publish-check": "T093",
    "evals-agent-config": "T094",
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


PLAN = (SPEC / "plan.md").read_text(encoding="utf-8")
INDEX = RUNBOOKS / "README.md"
# plan §16's runbooks, each by the page that is it (tasks.md T111).
PLAN_PAGES = {
    "cost warning": "cost-warning.md",
    "kill-switch trip": "kill-switch-trip.md",
    "kill-switch reset": "kill-switch-reset.md",
    "fallback renewal": "fallback-renewal.md",
    "store initialization": "store-initialization.md",
    "alert channel down": "alert-channel-down.md",
    "Bedrock credentials expiring": "bedrock-credentials-expiring.md",
    "Bedrock unavailable": "bedrock-unavailable.md",
    "model server down": "model-server-down.md",
    "store unreachable": "store-unreachable.md",
    "journal unwritable": "journal-unwritable.md",
    "gateway down": "gateway-down.md",
    "operator authentication failures": "operator-auth-failures.md",
    "rollback": "rollback.md",
    "the agents' engine": "agents-engine.md",
    "the local gate": "local-gate.md",
}


def plan_runbooks() -> list[str]:
    """The runbooks plan §16 lists: the items of the sub-list under its "Runbooks" bullet."""
    start = PLAN.index("\n## 16. ")
    section = PLAN[start : PLAN.index("\n## 17. ", start)].splitlines()
    first = next(
        i for i, line in enumerate(section) if line.startswith("- **Runbooks**")
    )
    names = []
    for line in section[first + 1 :]:
        if not line.startswith("  - "):
            break
        for item in line[4:].rstrip(";.").split(", "):
            names.append(item.removeprefix("and ").strip())
    return names


def test_the_folder_holds_exactly_the_pages_plan_16_lists() -> None:
    names = plan_runbooks()
    assert len(names) == 16  # not vacuous: the list parses
    assert sorted(names) == sorted(PLAN_PAGES)
    assert sorted(p.name for p in pages()) == sorted(PLAN_PAGES.values())


def index_line(page: str) -> str:
    """The index's line that links a page."""
    lines = [
        line
        for line in INDEX.read_text(encoding="utf-8").splitlines()
        if f"]({page})" in line
    ]
    assert len(lines) == 1, (page, lines)
    return lines[0]


def test_the_index_links_every_runbook() -> None:
    assert INDEX.is_file()
    text = INDEX.read_text(encoding="utf-8")
    assert not text.startswith(
        "# Runbook: "
    )  # the index isn't a runbook, and pages() leaves it out
    for page in pages():
        index_line(page.name)
    # And nothing in the folder that isn't there.
    linked = set(re.findall(r"\]\(([a-z0-9-]+\.md)\)", text))
    assert linked == {p.name for p in pages()}, linked ^ {p.name for p in pages()}


@pytest.mark.parametrize(("names", "page"), section6(), ids=lambda v: str(v))
def test_the_index_names_what_sends_you_to_each_page(
    names: list[str], page: str
) -> None:
    # An alert, or hello's degraded cause, is what an operator holds: the index finds its page from either.
    line = index_line(page)
    assert [n for n in names if f"`{n}`" not in line] == [], page


def engine_message(path: Path, pattern: str) -> str:
    (found,) = re.findall(pattern, path.read_text(encoding="utf-8"))
    return found


def test_the_engines_page_quotes_what_the_engine_prints() -> None:
    # Read from the code, not copied: a message that changes fails here until the page follows it.
    engine_dir = REPO / "deploy" / "agents-engine"
    messages = [
        engine_message(
            engine_dir / "docker-relay",
            r'echo "(the engine\'s opening isn\'t reachable[^"]*)"',
        ),
        engine_message(
            engine_dir / "engine.sh", r'echo "(engine: unreachable \([^"]*\))"'
        ),
        engine_message(
            REPO / "Makefile",
            r'echo "(image: the agents\' engine didn\'t build the images[^"]*)"',
        ),
        engine_message(
            REPO / "deploy" / "scripts" / "preflight.py",
            r'seed = "(ask the Author to run [^"]*)"',
        ),
    ]
    text = (RUNBOOKS / "agents-engine.md").read_text(encoding="utf-8")
    assert [m for m in messages if m not in text] == []


def test_the_engines_page_names_the_authors_commands_directly() -> None:
    # engine.sh's main() gives its Author subcommands; the page names each as the command the Author runs, directly,
    # and the two make targets agents have.
    engine = (REPO / "deploy" / "agents-engine" / "engine.sh").read_text(
        encoding="utf-8"
    )
    (authors,) = re.findall(r"^\t(setup \| [a-z |]+)\)$", engine, re.MULTILINE)
    subcommands = authors.split(" | ")
    assert {"setup", "up", "down", "reset", "destroy", "seed", "prove"} <= set(
        subcommands
    )
    text = (RUNBOOKS / "agents-engine.md").read_text(encoding="utf-8")
    commands = code(text)
    missing = [
        s
        for s in [*subcommands, "status"]
        if f"deploy/agents-engine/engine.sh {s}" not in commands
    ]
    assert missing == []
    assert "make engine-status" in commands and "make engine-smoke" in commands
    assert "never through make" in text


def test_the_gates_page_names_what_make_check_prints() -> None:
    runner = (REPO / "tools" / "gates" / "run_checks.py").read_text(encoding="utf-8")
    (order,) = re.findall(r"^ORDER = \[(.*)\]$", runner, re.MULTILINE)
    statuses = re.findall(r'"([A-Z]+)"', order)
    assert statuses == ["FAIL", "PENDING", "PLANNED", "SKIP", "PASS"]
    assert 'f"make check: {parts}{tail}"' in runner
    text = (RUNBOOKS / "local-gate.md").read_text(encoding="utf-8")
    assert [s for s in statuses if f"**{s}" not in text and f"`{s}`" not in text] == []
    assert "`make check: " in text  # the summary line, as it starts
    commands = code(text)
    for command in (
        "tools/gates/gate <branch>",
        "tools/gates/gate --host",
        "make check",
        "make evals-agent-config",
    ):
        assert command in commands, command
    image_fail = engine_message(
        REPO / "Makefile",
        r'echo "(image: the agents\' engine didn\'t build the images[^"]*)"',
    )
    assert image_fail.split(": ", 1)[1] in text
    assert "agents-engine.md" in text  # where an engine that's down sends you


def test_the_gates_page_gives_the_host_gate_in_its_own_words() -> None:
    # tools/gates/gate's docstring on what --host leaves out, and its summary line's DEGRADED mark, read from the gate,
    # not the plan's "runs on host tools" (US6's review, finding 2).
    gate = (REPO / "tools" / "gates" / "gate").read_text(encoding="utf-8")
    (nowhere,) = re.findall(
        r"Lint, [^.]*? run nowhere: [^.]*\.", " ".join(gate.split('"""')[1].split())
    )
    (degraded,) = re.findall(r'"; (DEGRADED \(--host\): [^"]*)"', gate)
    text = " ".join((RUNBOOKS / "local-gate.md").read_text(encoding="utf-8").split())
    assert nowhere in text and degraded in text
    assert "host tools" not in text
