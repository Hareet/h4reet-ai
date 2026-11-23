"""docs/runbooks/ against contracts/alerts.md §6 and plan §16 (spec 000; tasks.md T062, T082, T106, T111).

Every page alerts.md §6 names exists once the task that writes it is done; each covers the alerts and causes its
row names, in backticks; every runbook has plan §16's six sections in order (Symptoms · Impact · Act · Verify ·
Undo · Record); and every make target a runbook's commands name is one the Makefile has, or one a later task adds.
A later task's mark expires, as plan §11's do: once tasks.md marks the task done, what it adds is required. The two
Bedrock pages also quote their alerts as alerts.md §3's examples give them, and hello's degraded detail as
gateway-http.md §3 does, read from those files.

From T111: the folder holds exactly the pages plan §16 lists, and, from spec 003, the pages its own plan §8 lists, once
each exists (tasks.md T022, T037); the index, docs/runbooks/README.md, links each and
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


SPEC_003_PLAN = REPO / "specs" / "003-studio-assets" / "plan.md"
SPEC_010_PLAN = REPO / "specs" / "010-anthropic-provider" / "plan.md"


def spec_003_runbooks() -> set[str]:
    """The pages spec 003's plan §8 lists in its "Runbooks" bullet, each written by the task group that needs it."""
    text = SPEC_003_PLAN.read_text(encoding="utf-8")
    start = text.index("\n## 8. ")
    section = text[start : text.index("\n## 9. ", start)]
    (line,) = [ln for ln in section.splitlines() if ln.startswith("- **Runbooks:**")]
    return set(re.findall(r"`([a-z0-9-]+\.md)`", line))


def spec_010_runbooks() -> set[str]:
    """The new pages spec 010's plan §9 lists in its "Runbooks" paragraph (the Anthropic API's)."""
    text = SPEC_010_PLAN.read_text(encoding="utf-8")
    (line,) = [ln for ln in text.splitlines() if ln.startswith("**Runbooks**:")]
    return set(re.findall(r"`docs/runbooks/([a-z0-9-]+\.md)` \(new\)", line))


SPEC_017_PLAN = REPO / "specs" / "017-the-night-shift" / "plan.md"


def spec_017_runbooks() -> set[str]:
    """The new pages spec 017's plan lists in its "Runbooks" paragraph (the night shift's)."""
    text = SPEC_017_PLAN.read_text(encoding="utf-8")
    (line,) = [ln for ln in text.splitlines() if ln.startswith("**Runbooks**:")]
    return set(re.findall(r"`docs/runbooks/([a-z0-9-]+\.md)` \(new\)", line))


SPEC_034_PLAN = REPO / "specs" / "034-langfuse-dashboards" / "plan.md"


def spec_034_runbooks() -> set[str]:
    """The new pages spec 034's plan lists in its "Runbooks" paragraph (the Langfuse dashboards')."""
    text = SPEC_034_PLAN.read_text(encoding="utf-8")
    (line,) = [ln for ln in text.splitlines() if ln.startswith("**Runbooks**:")]
    return set(re.findall(r"`docs/runbooks/([a-z0-9-]+\.md)` \(new\)", line))


SPEC_001 = REPO / "specs" / "001-cloud-elevation"
SPEC_001_ALERTS = SPEC_001 / "contracts" / "aws-alerts.md"
# Spec 001's group 4 (its tasks.md T036): the pages of its alerts, and the laptop's, whose first part is the Bedrock
# profile that chains to h4-laptop-bedrock.
SPEC_001_GROUP_4 = (
    "aws-budget.md",
    "aws-budget-action.md",
    "server-budget.md",
    "aws-anomaly.md",
    "credential-audit.md",
    "laptop.md",
)


def spec_001_kinds() -> list[tuple[list[str], list[str]]]:
    """contracts/aws-alerts.md §2's table: each row's kinds, the names in backticks in its first column, and its
    pages, those in its last."""
    text = SPEC_001_ALERTS.read_text(encoding="utf-8")
    start = text.index("\n## 2. ")
    rows = []
    for line in text[start : text.index("\n## 3. ", start)].splitlines():
        if not line.startswith("| `"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        kinds = re.findall(r"`([a-z0-9_]+)", cells[0])
        rows.append((kinds, re.findall(r"`([a-z0-9-]+\.md)`", cells[-1])))
    return rows


def spec_001_runbooks() -> set[str]:
    """The pages spec 001 writes, each with the group that needs it: those contracts/aws-alerts.md §2 names, and those
    its tasks.md names under docs/runbooks/."""
    tasks = (SPEC_001 / "tasks.md").read_text(encoding="utf-8")
    named = set(re.findall(r"`docs/runbooks/([a-z0-9-]+\.md)`", tasks))
    return named | {page for _, pages in spec_001_kinds() for page in pages}


def test_spec_001s_group_4_pages_cover_their_alerts_and_the_index_names_them() -> None:
    assert set(SPEC_001_GROUP_4) <= spec_001_runbooks()
    for page in SPEC_001_GROUP_4:
        assert (RUNBOOKS / page).is_file(), page
    for kinds, pages_ in spec_001_kinds():
        for page in set(pages_) & set(SPEC_001_GROUP_4):
            # A row with two pages sends its last kind to the second ("for the last").
            mine = kinds if len(pages_) == 1 or page == pages_[0] else kinds[-1:]
            text = (RUNBOOKS / page).read_text(encoding="utf-8")
            assert [k for k in mine if f"`{k}`" not in text] == [], page
            assert [k for k in mine if f"`{k}`" not in index_line(page)] == [], page


# Spec 001's group 5 (its tasks.md T054, T159): the tunnel end's page, and the alert bridge's, whose failure queue's
# alarm W1 adds. The credential audit's page is group 4's, and the test above holds it to its new kind.
SPEC_001_GROUP_5 = ("tunnel-end.md", "alert-bridge.md")


def test_spec_001s_group_5_pages_cover_their_alerts_and_the_index_names_them() -> None:
    assert set(SPEC_001_GROUP_5) <= spec_001_runbooks()
    for page in SPEC_001_GROUP_5:
        assert (RUNBOOKS / page).is_file(), page
    for kinds, pages_ in spec_001_kinds():
        for page in set(pages_) & set(SPEC_001_GROUP_5):
            mine = kinds if len(pages_) == 1 or page == pages_[0] else kinds[-1:]
            text = (RUNBOOKS / page).read_text(encoding="utf-8")
            assert [k for k in mine if f"`{k}`" not in text] == [], page
            assert [k for k in mine if f"`{k}`" not in index_line(page)] == [], page


# Spec 001's deployer (the deployer's review, 1: the bridge names deploy.md, which didn't exist): the deploy page holds
# the deployer's three kinds and the manual retry.
SPEC_001_DEPLOYER = ("deploy.md",)


def test_spec_001s_deploy_page_covers_its_alerts_and_the_manual_retry() -> None:
    assert set(SPEC_001_DEPLOYER) <= spec_001_runbooks()
    for page in SPEC_001_DEPLOYER:
        assert (RUNBOOKS / page).is_file(), page
    for kinds, pages_ in spec_001_kinds():
        for page in set(pages_) & set(SPEC_001_DEPLOYER):
            mine = kinds if len(pages_) == 1 or page == pages_[0] else kinds[-1:]
            text = (RUNBOOKS / page).read_text(encoding="utf-8")
            assert [k for k in mine if f"`{k}`" not in text] == [], page
            assert [k for k in mine if f"`{k}`" not in index_line(page)] == [], page
    deploy = (RUNBOOKS / "deploy.md").read_text(encoding="utf-8")
    # The manual retry of a release the deployer won't try again until its backoff ends (the review's 1).
    assert "attempts.json" in deploy and "h4-deployer.service" in deploy


# Group 7's EC2 page (its tasks.md T092), restored (group 7's review A, I-C). c8571b3e's RED named ec2.md beside deploy.md,
# a page of group 7, which hadn't been written; b10e8446, a GREEN, then dropped it from the test, where it should have
# been left failing until group 7 wrote the page. contracts/aws-alerts.md §2 sends no kind to ec2.md, so the kinds it
# holds are those EC2's boot sends itself (contracts/releases-deployer.md §3): `deploy_refused`, reasons `unreachable`
# and `bucket`, which deploy.md, holding every reason, names too.
def test_spec_001s_ec2_page_covers_its_boots_alerts_and_the_index_names_them() -> None:
    assert "ec2.md" in spec_001_runbooks()
    ec2 = (RUNBOOKS / "ec2.md").read_text(encoding="utf-8")
    assert "`deploy_refused`" in ec2 and "`deploy_refused`" in index_line("ec2.md")
    for reason in ("unreachable", "bucket"):
        assert f"`{reason}`" in ec2, reason
    deploy = (RUNBOOKS / "deploy.md").read_text(encoding="utf-8")
    assert "`unreachable`" in deploy and "E1 to E6" in deploy


# Spec 001's group 9 (its tasks.md T128): the handover's page, EC2's spot interruption's, and EC2's page, which gains
# the guard's kinds from P-I6's contract row (as the tree holds it, or as the patch leaves it). Each kind its row sends
# to a page is on the page and on the index's line for it; and the hours' open, close, and change are on EC2's.
SPEC_001_GROUP_9 = ("handover.md", "spot-interruption.md", "ec2.md")


def test_spec_001s_group_9_pages_cover_their_alerts_and_the_index_names_them() -> None:
    assert set(SPEC_001_GROUP_9) <= spec_001_runbooks()
    for page in SPEC_001_GROUP_9:
        assert (RUNBOOKS / page).is_file(), page
    for kinds, pages_ in spec_001_kinds():
        for page in set(pages_) & set(SPEC_001_GROUP_9):
            mine = kinds if len(pages_) == 1 or page == pages_[0] else kinds[-1:]
            text = (RUNBOOKS / page).read_text(encoding="utf-8")
            assert [k for k in mine if f"`{k}`" not in text] == [], page
            assert [k for k in mine if f"`{k}`" not in index_line(page)] == [], page
    ec2 = (RUNBOOKS / "ec2.md").read_text(encoding="utf-8")
    for kind in (
        "ec2_stopped_outside_hours",
        "ec2_unrecognised_instance",
        "ec2_guard_failed",
    ):
        assert f"`{kind}`" in ec2 and f"`{kind}`" in index_line("ec2.md"), kind
    for words in (
        "h4-ec2-hours-open",
        "h4-ec2-hours-close",
        "local.ec2_hours",
        "`start_failed`",
    ):
        assert words in ec2, words
    handover = (RUNBOOKS / "handover.md").read_text(encoding="utf-8")
    assert "`outside_hours`" in handover and "handover_stop_failed" in handover


def test_the_folder_holds_exactly_the_pages_plan_16_lists() -> None:
    names = plan_runbooks()
    assert len(names) == 16  # not vacuous: the list parses
    assert sorted(names) == sorted(PLAN_PAGES)
    # Spec 003 adds its own pages, each with its task group (asset-withdrawal.md in Phase 2, studio-gpu-window.md in
    # Phase 4); nothing else may be there.
    later = spec_003_runbooks()
    assert later == {
        "asset-withdrawal.md",
        "studio-gpu-window.md",
    }  # not vacuous: spec 003's list parses
    # Spec 010 adds the Anthropic API's page (its plan §9).
    assert spec_010_runbooks() == {
        "anthropic-unavailable.md"
    }  # not vacuous: spec 010's list parses
    later |= spec_010_runbooks()
    # Spec 017 adds the night shift's page (its plan's "Runbooks" paragraph).
    assert spec_017_runbooks() == {
        "night-shift.md"
    }  # not vacuous: spec 017's line parses
    later |= spec_017_runbooks()
    # Spec 034 adds the Langfuse dashboards' page (its plan's "Runbooks" paragraph).
    assert spec_034_runbooks() == {
        "langfuse-dashboards.md"
    }  # not vacuous: spec 034's line parses
    later |= spec_034_runbooks()
    # Spec 001 adds its pages with the groups that need them (contracts/aws-alerts.md §2; its tasks.md).
    assert (
        set(SPEC_001_GROUP_4) <= spec_001_runbooks()
    )  # not vacuous: spec 001's lists parse
    later |= spec_001_runbooks()
    found = {p.name for p in pages()}
    assert set(PLAN_PAGES.values()) <= found
    assert found - set(PLAN_PAGES.values()) <= later, (
        found - set(PLAN_PAGES.values()) - later
    )


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
    # Spec 006's interim patch adds WARN, between PLANNED and SKIP as in the gate's summary line; this branch's merge
    # comes before the patch, so the runner reads either way here, and the page names every status it has.
    assert statuses in (
        ["FAIL", "PENDING", "PLANNED", "SKIP", "PASS"],
        ["FAIL", "PENDING", "PLANNED", "WARN", "SKIP", "PASS"],
    )
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


def test_the_gates_page_reads_publish_checks_end_from_its_summary_line() -> None:
    # make exits 2 whenever a recipe fails, so publish-check's own 1 and 3 reach the Author as make's 2; the page
    # quotes the summary lines tools/gates/publish_check.py prints, which say which (US6's review).
    source = (REPO / "tools" / "gates" / "publish_check.py").read_text(encoding="utf-8")
    (codes,) = re.findall(
        r"^CLEAN, FINDINGS, CANNOT_CERTIFY = (\d+), (\d+), (\d+)$", source, re.MULTILINE
    )
    (verdicts,) = re.findall(
        r'\{CLEAN: "([^"]+)", FINDINGS: "([^"]+)", CANNOT_CERTIFY: "([^"]+)"\}', source
    )
    assert 'f"publish-check: {verdict} (exit {code}) — "' in source
    text = (RUNBOOKS / "local-gate.md").read_text(encoding="utf-8")
    for verdict, exit_code in list(zip(verdicts, codes, strict=True))[1:]:
        assert f"`publish-check: {verdict} (exit {exit_code})`" in text, verdict
    assert "`make publish-check` exits" not in text
    assert "exits 2" in text


def test_the_gates_page_says_what_pending_and_the_eval_history_warn_mean() -> None:
    # As the code has them (US6's review): the behavioral tier's two PENDING lines, which it prints whenever no
    # attested entry has the tree's trigger hash (none at all, or only unattested ones), and the gate's eval-history
    # WARN, for a post prod's collector didn't take. The gate posts every entry the branch adds on every run, not once.
    tier = (REPO / "evals" / "agent-config" / "behavioral.py").read_text(
        encoding="utf-8"
    )
    pending = re.findall(r'f"(PENDING \(behavioral tier\): [^{"]*)\{', tier)
    gate = re.sub(
        r'"\s*\n\s*f?"',
        "",
        (REPO / "tools" / "gates" / "gate").read_text(encoding="utf-8"),
    )
    (warn,) = re.findall(r"; (the dashboard misses them, [^\"]*)\"", gate)
    text = " ".join((RUNBOOKS / "local-gate.md").read_text(encoding="utf-8").split())
    assert len(pending) == 2 and all(line.strip() in text for line in pending)
    assert "trigger hash" in text and "the branch changed `CLAUDE.md`" not in text
    assert warn in text
    assert "posted only once" not in text and "every entry the branch adds" in text


def test_the_gates_page_says_prove_resets_the_engine() -> None:
    # The gates change nothing they check, but --prove's engine.sh prove resets and reseeds the agents' engine, which
    # can't be undone, by design: Impact and Undo both say so (US6's review).
    text = (RUNBOOKS / "local-gate.md").read_text(encoding="utf-8")
    for heading in ("## Impact", "## Undo"):
        start = text.index(f"\n{heading}\n")
        part = text[start : text.index("\n## ", start + 1)]
        assert "`tools/gates/gate --prove`" in part, heading


def test_the_tunnel_ends_page_covers_each_case_t054_names() -> None:
    # Spec 001 tasks.md T054: a restart; a crash, a failed deploy, or a revoked key; a key's revocation; its loss; a spot
    # interruption; a move to another zone. And the laptop's page has its tunnel part.
    text = (RUNBOOKS / "tunnel-end.md").read_text(encoding="utf-8")
    for case in (
        "### A restart",
        "### A crash, a failed deploy, or a revoked key",
        "### Revoking the laptop's key",
        "### The tunnel end lost",
        "### A spot interruption",
        "### A move to another zone",
    ):
        assert case in text, case
    laptop = (RUNBOOKS / "laptop.md").read_text(encoding="utf-8")
    assert "### The tunnel" in laptop
    for name in ("make tunnel-keys", "COMPOSE_PROFILES=gpu,tunnel", "P22"):
        assert name in laptop, name


# Spec 001's group 6 (its tasks.md T076; contracts/shared-state.md §8): the shared state's page, its alert, the cases T076
# names, the restore in its five steps, and the laptop's sentence that prod needs the network.
def test_the_shared_states_page_covers_its_alert_and_each_case_t076_names() -> None:
    assert "shared-state.md" in spec_001_runbooks()
    text = (RUNBOOKS / "shared-state.md").read_text(encoding="utf-8")
    assert "`shared_state_backup_failed`" in text
    assert "`shared_state_backup_failed`" in index_line("shared-state.md")
    for case in (
        "### The store unreachable",
        "### The backup failed",
        "### A restore from the last backup",
        "### A move to another zone",
    ):
        assert case in text, case
    restore = text[
        text.index("### A restore from the last backup") : text.index(
            "### A move to another zone"
        )
    ]
    assert [n for n in range(1, 6) if f"\n{n}. **" not in restore] == []
    for name in (
        "shared-state-restore",
        "operator-restore ENV=shared",
        "operator-init ENV=shared",
    ):
        assert f"make {name}" in restore, name
    laptop = (RUNBOOKS / "laptop.md").read_text(encoding="utf-8")
    assert "### The shared state" in laptop and "make up ENV=dev" in laptop


# Spec 001's F7, part 5 (night 5): make cloud-session is a Systems Manager port-forward to one listener
# (scripts/infra/cloud_session.py, AWS-StartPortForwardingSession), which the AWS CLI runs through AWS's Session
# Manager plugin. It gives no shell; the console's Session Manager does.
CLOUD_SESSION = re.compile(r"make cloud-session[^.\n]*")


def test_no_runbook_calls_make_cloud_session_a_shell() -> None:
    said = []
    for page in sorted(RUNBOOKS.glob("*.md")):
        text = page.read_text(encoding="utf-8")
        for match in CLOUD_SESSION.finditer(text):
            sentence = text[match.start() : text.find(".", match.end()) + 1]
            if re.search(
                r"opens a (?:shell|session)\b|that shell's|\bin a session\b", sentence
            ):
                said.append(f"{page.name}: {sentence[:120]}")
        if re.search(r"In a session \(`make cloud-session", text):
            said.append(f"{page.name}: runs commands in a cloud-session")
    assert said == []


def test_the_ec2_page_says_what_cloud_session_is_and_where_the_shell_is() -> None:
    text = (RUNBOOKS / "ec2.md").read_text(encoding="utf-8")
    act = text[text.index("## Act") : text.index("## Verify")]
    for words in (
        "port-forward",
        "Session Manager plugin",
        "18503",
        "Connect",
        "Session Manager",
    ):
        assert words in act, words
    assert "EC2 console" in act
    script = (REPO / "scripts" / "infra" / "cloud_session.py").read_text(
        encoding="utf-8"
    )
    assert "AWS-StartPortForwardingSession" in script
