"""Tests for scripts/corpus/film_claims.py (spec 022, plan §3's R1 to R7; tasks.md T001 to T003).

The checker reads a corpus proposal's table of film-script lines and its new text, and the films' scripts, and fails
on the rules in plan §3: each row's script line found verbatim (R1); every line in scope accounted for once, with a
reason from the closed list (R2); nothing unbuilt or "shown as built" carried (R3); no number outside a slot and no
currency amount in the new prose (R4); no quote that isn't the Author's or a cited file's (R5); with --third-party,
no long quote from outside the repository (R6); and a summary that says the denylist wasn't applied (R7).

The fixtures are a small repository written into a temporary directory per test: a `SCRIPTS.md`-shaped file, a
`script.txt`-shaped file, a `materials.md`-shaped file, a disclosure with an F3 row, a few cited files, and a good
proposal; each bad proposal is the good one with one change. The parity tests read the real sources as text.
"""

from __future__ import annotations

import ast
import importlib.util
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "scripts" / "corpus" / "film_claims.py"


def _load():
    spec = importlib.util.spec_from_file_location("film_claims", CHECKER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["film_claims"] = module
    spec.loader.exec_module(module)
    return module


fc = _load()

SCRIPTS_MD = """# Scripts for the films (fixture)

## 1. A meter (`films/meter`)

1. Every answer has a price, and you can watch it.
2. A sign shows what each call cost, to the millionth of a dollar. It reads the gateway's own reply.
   - `src/sign.md`.
3. Why this model? In Hareet's words: "we chose haiku since our context base is small and manually evaluated haiku and sonnet."
   - **about you**: your words, 2026-11-10.
4. And every day, a summary reports the CPU metrics.
   - The Author's plan. Not in the repository yet; the film shows it as the Author describes it.

## 2. Tests (`films/tests`)

1. Every case comes from the corpus.
   - `evals/run.md`.
2. Hundreds of forbidden actions are tested on every run.
   - Its recorded run. The earlier "345" didn't hold up.
3. Deploys only pull.
   - Spec 001. Not built on main yet; the film shows it as specced.
4. Fifteen containers run it in production.
   - `deploy/compose.yaml`.
"""

SCRIPT_TXT = """Every answer can cost money. So it has a ceiling: five dollars a day.

The gateway reads the kill switch first.

At five dollars...

it stops itself.

"The twin can't talk right now. Today's budget for its answers is used."

From outside, there's no door: no inbound ports, only an outbound tunnel, and only the gateway has a road out.
"""

MATERIALS_MD = """# Materials (fixture)

| What | Source | Notes |
| --- | --- | --- |
| The state is read first | `src/gateway.md` | |
| "The twin can't talk right now. Today's budget for its answers is used." | `apps/web/content/messages.yaml:1` | |
| Networks: egress (gateway only) | `deploy/compose.yaml:8-9` | |
| The tunnel: no inbound ports, an outbound tunnel only | `specs/tunnel.md` | shown as built, per the Author |
"""

DISCLOSURE_MD = """# Data-flow disclosure (fixture)

| ID | From → to | Why |
|---|---|---|
| F3 | `gateway` → Anthropic. In the Author's words: this site saves none of it, and Anthropic may keep a turn it answered for up to 30 days, never for training. | the fallback |
"""

FACTS_YAML = """topic: 08-hareet-ai
facts:
  - id: site.kill_switch_daily
    label: The site's daily spend ceiling
    value: "$5"
    tag: C
    source: "config/budgets.yaml"
    public_safe: true
    phrasing: "{value}"
"""

FILES = {
    "films/SCRIPTS.md": SCRIPTS_MD,
    "films/kill-switch-b2/script.txt": SCRIPT_TXT,
    "films/kill-switch-b2/materials.md": MATERIALS_MD,
    "docs/data-flow-disclosure.md": DISCLOSURE_MD,
    "src/sign.md": "The sign reads the reply.\n",
    "src/gateway.md": "The gateway reads the switch first.\n",
    "evals/run.md": "Scoring is deterministic: no model judges another.\n",
    "deploy/compose.yaml": "networks:\n  egress: {}\n",
    "apps/web/content/messages.yaml": "text: The twin can't talk right now. Today's budget for its answers is used.\n",
    "specs/tunnel.md": "No inbound ports.\n",
    "docs/adr/0020-gateway.md": "The meter.\n",
    "corpus/08-hareet-ai.md": "# hareet.ai\n",
    "corpus/facts/hareet-ai.yaml": FACTS_YAML,
}

URL = "https://github.com/hareet/h4reet-ai/blob/main"

GOOD = f"""# Proposal (fixture)

## Reading guide

Prose about the scripts may cite "five dollars a day", fifteen, and 345 freely: R4 reads only the new text.

## The new text for 08

```corpus-08
## The meter

- `[P]` A sign in the room shows what each call cost. It reads the gateway's own reply. — {URL}/src/sign.md
- `[A 2026-11-10]` Why this model, in his words: "we chose haiku since our context base is small and manually evaluated haiku and sonnet."

## The kill switch

- `[P]` The gateway reads the kill switch first. — {URL}/src/gateway.md
- `[P]` So it has a ceiling, {{{{slot:site.kill_switch_daily}}}} a day; there it stops itself, and every request gets one line: "The twin can't talk right now. Today's budget for its answers is used." — {URL}/apps/web/content/messages.yaml
- `[P]` On the laptop's production stack, only the gateway has a road out. — {URL}/deploy/compose.yaml

## The tests

- `[P]` Every case comes from the corpus, as of 2026-11-13, and runs with one command. — {URL}/evals/run.md; see `docs/adr/0020-gateway.md`.

## The stack

- `[P]` The laptop's production stack runs [slot `site.prod_containers`]. — {URL}/deploy/compose.yaml

## What it doesn't know yet

- `[?]` The daily summary of the CPU metrics.

## Do not claim

- That the twin is a demo.

## Golden Q&A

9. *How does the kill switch stop spending?* — The gateway reads the kill switch first. [P]
```

The suggested second sentence for Golden Q&A 5:

```corpus-08-golden-5
"this site saves none of it, and Anthropic may keep a turn it answered for up to 30 days, never for training" [A 2026-11-09]
```

```facts
  - id: site.prod_containers
    label: "The laptop's production stack's containers (ENV=prod, COMPOSE_PROFILES=gpu), as of 2026-11-13"
    value: 15
    tag: C
    source: "deploy/compose.yaml"
    public_safe: true
    phrasing: "{{value}} containers"
```

## The table

| Script | Line | Script line | Status | Carried | Left out | Corpus line | Source | Tag | Mark |
|---|---|---|---|---|---|---|---|---|---|
| §1 | 1 | Every answer has a price, and you can watch it. | left out | — | a duplicate of `08-hareet-ai.md`: its real-time cost meter | — | `src/sign.md` | — | — |
| §1 | 2 | A sign shows what each call cost, to the millionth of a dollar. It reads the gateway's own reply. | in part | “A sign shows what each call cost”<br>“It reads the gateway's own reply.” | “to the millionth of a dollar” → a currency amount | The meter #1 | `src/sign.md` | `[P]` | — |
| §1 | 3 | Why this model? In Hareet's words: "we chose haiku since our context base is small and manually evaluated haiku and sonnet." | carried | whole | — | The meter #2 | `src/sign.md` | `[A 2026-11-10]` | — |
| §1 | 4 | And every day, a summary reports the CPU metrics. | left out | — | unbuilt: "Not in the repository yet" | What it doesn't know yet #1 | `evals/run.md` | — | changed after his approval (note, line 44) |
| §2 | 1 | Every case comes from the corpus. | carried | whole | — | The tests #1 | `evals/run.md` | `[P]` | — |
| §2 | 2 | Hundreds of forbidden actions are tested on every run. | left out | — | a recorded run's result | — | `evals/run.md` | — | — |
| §2 | 3 | Deploys only pull. | left out | — | unbuilt | — | `evals/run.md` | — | — |
| §2 | 4 | Fifteen containers run it in production. | in part | “Fifteen containers run it” | “in production” → contradicted by the repository: `deploy/compose.yaml` | The stack #1 | `deploy/compose.yaml` | `[P]` | — |
| kill-switch-b2 | S1 (file line 1) | Every answer can cost money. | left out | — | a duplicate of `08-hareet-ai.md` | — | `src/gateway.md` | — | — |
| kill-switch-b2 | S2 (file line 1) | So it has a ceiling: five dollars a day. | in part | “So it has a ceiling” | “five dollars a day” → a currency amount | The kill switch #2 | `src/gateway.md` | `[P]` | — |
| kill-switch-b2 | S3 (file line 3) | The gateway reads the kill switch first. | carried | whole | — | The kill switch #1; Golden Q&A #9 | `src/gateway.md` | `[P]` | — |
| kill-switch-b2 | S4 (file lines 5 and 7) | At five dollars... it stops itself. | in part | “it stops itself.” | “At five dollars...” → a currency amount | The kill switch #2 | `src/gateway.md` | `[P]` | — |
| kill-switch-b2 | S5 (file line 9) | "The twin can't talk right now. Today's budget for its answers is used." | carried | whole | — | The kill switch #2 | `apps/web/content/messages.yaml` | `[P]` | — |
| kill-switch-b2 | S6 (file line 11) | From outside, there's no door: no inbound ports, only an outbound tunnel, and only the gateway has a road out. | in part | “only the gateway has a road out” | “From outside, there's no door: no inbound ports, only an outbound tunnel” → unbuilt: `specs/tunnel.md` | The kill switch #3 | `deploy/compose.yaml` | `[P]` | — |
"""


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    for rel, text in FILES.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return tmp_path


def run(repo: Path, text: str, **kw) -> list[str]:
    proposal = repo / "proposal.md"
    proposal.write_text(text)
    return fc.check(proposal, root=repo, **kw)


def changed(old: str, new: str, text: str = GOOD) -> str:
    assert text.count(old) >= 1, old
    return text.replace(old, new, 1)


def failing(problems: list[str], rule: str, *needles: str) -> bool:
    return any(p.startswith(rule) and all(n in p for n in needles) for p in problems)


# ---- The good proposal ----


def test_good_proposal_passes(repo: Path) -> None:
    assert run(repo, GOOD) == []


# ---- R1: each row's script line, found verbatim ----


def test_sentence_split_joins_an_ellipsis_before_a_lower_case_word_and_keeps_a_quote_whole() -> (
    None
):
    got = [(s.text, s.first, s.last) for s in fc.split_sentences(SCRIPT_TXT)]
    assert got == [
        ("Every answer can cost money.", 1, 1),
        ("So it has a ceiling: five dollars a day.", 1, 1),
        ("The gateway reads the kill switch first.", 3, 3),
        ("At five dollars... it stops itself.", 5, 7),
        (
            "\"The twin can't talk right now. Today's budget for its answers is used.\"",
            9,
            9,
        ),
        (
            (
                "From outside, there's no door: no inbound ports, only an outbound tunnel, and only the gateway has a "
                "road out."
            ),
            11,
            11,
        ),
    ]


def test_scripts_md_lines_notes_and_markers() -> None:
    sections = fc.read_scripts_md(SCRIPTS_MD)
    assert list(sections) == ["§1", "§2"]
    assert [line.n for line in sections["§1"]] == [1, 2, 3, 4]
    assert sections["§1"][2].about_you is True
    assert sections["§1"][3].markers == {"unbuilt"}
    assert sections["§2"][1].markers == {"retracted"}
    assert sections["§2"][2].markers == {"unbuilt"}
    assert sections["§1"][0].markers == set()


def test_a_changed_script_line_in_the_table_fails_naming_it(repo: Path) -> None:
    bad = changed(
        "| Every case comes from the corpus. |", "| Every case comes from a corpus. |"
    )
    assert failing(run(repo, bad), "R1", "§2 line 1")


def test_a_script_edited_after_the_proposal_fails(repo: Path) -> None:
    (repo / "films/kill-switch-b2/script.txt").write_text(
        SCRIPT_TXT.replace("reads the kill", "checks the kill")
    )
    assert failing(run(repo, GOOD), "R1", "kill-switch-b2 S3")


def test_wrong_file_lines_fail(repo: Path) -> None:
    bad = changed("S4 (file lines 5 and 7)", "S4 (file line 5)")
    assert failing(run(repo, bad), "R1", "kill-switch-b2 S4")


def test_a_row_without_a_source_fails(repo: Path) -> None:
    bad = changed("| `evals/run.md` | `[P]` | — |", "| — | `[P]` | — |")
    assert failing(run(repo, bad), "R1", "§2 line 1")


def test_a_carried_source_that_doesnt_exist_fails(repo: Path) -> None:
    bad = changed(
        "| `evals/run.md` | `[P]` | — |", "| `evals/missing.md` | `[P]` | — |"
    )
    assert failing(run(repo, bad), "R1", "evals/missing.md")


def test_a_kill_switch_source_neither_materials_nor_scripts_md_lists_fails(
    repo: Path,
) -> None:
    # A path SCRIPTS.md's notes give passes (plan §9's departure: a sentence materials.md has no row for); one that
    # neither lists fails.
    ok = changed(
        "| The kill switch #1; Golden Q&A #9 | `src/gateway.md` |",
        "| The kill switch #1; Golden Q&A #9 | `evals/run.md` |",
    )
    assert run(repo, ok) == []
    bad = changed(
        "| The kill switch #1; Golden Q&A #9 | `src/gateway.md` |",
        "| The kill switch #1; Golden Q&A #9 | `docs/adr/0020-gateway.md` |",
    )
    assert failing(
        run(repo, bad), "R1", "kill-switch-b2 S3", "docs/adr/0020-gateway.md"
    )


def test_an_unknown_script_fails(repo: Path) -> None:
    bad = changed("| §2 | 3 | Deploys only pull. |", "| §7 | 3 | Deploys only pull. |")
    assert failing(run(repo, bad), "R1", "§7")


def test_a_corpus_line_that_names_nothing_in_the_new_text_fails(repo: Path) -> None:
    bad = changed("| The tests #1 |", "| The tests #4 |")
    assert failing(run(repo, bad), "R1", "The tests #4")


def test_a_tag_the_corpus_line_doesnt_carry_fails(repo: Path) -> None:
    bad = changed(
        "| The tests #1 | `evals/run.md` | `[P]` |",
        "| The tests #1 | `evals/run.md` | `[A 2026-11-06]` |",
    )
    assert failing(run(repo, bad), "R1", "[A 2026-11-06]")


def test_a_mark_in_another_form_fails(repo: Path) -> None:
    bad = changed("changed after his approval (note, line 44)", "changed later")
    assert failing(run(repo, bad), "R1", "§1 line 4")


# ---- R2: every line in scope, once, with a reason from the closed list ----


def test_a_kill_switch_sentence_missing_from_the_table_fails(repo: Path) -> None:
    row = next(
        line for line in GOOD.splitlines() if line.startswith("| kill-switch-b2 | S5")
    )
    assert failing(run(repo, GOOD.replace(row + "\n", "")), "R2", "kill-switch-b2 S5")


def test_a_line_twice_fails(repo: Path) -> None:
    row = next(line for line in GOOD.splitlines() if line.startswith("| §2 | 3 |"))
    assert failing(run(repo, GOOD.replace(row, row + "\n" + row)), "R2", "§2 line 3")


def test_a_left_out_span_not_in_its_line_fails(repo: Path) -> None:
    bad = changed(
        "“to the millionth of a dollar” →", "“to the billionth of a dollar” →"
    )
    assert failing(run(repo, bad), "R2", "§1 line 2", "to the billionth of a dollar")


def test_a_carried_span_not_in_its_line_fails(repo: Path) -> None:
    bad = changed("“So it has a ceiling”", "“So it has a limit”")
    assert failing(run(repo, bad), "R2", "kill-switch-b2 S2", "So it has a limit")


def test_a_reason_outside_the_closed_list_fails(repo: Path) -> None:
    bad = changed("| a recorded run's result |", "| too long |")
    assert failing(run(repo, bad), "R2", "§2 line 2", "too long")


def test_contradicted_by_the_repository_without_its_file_fails(repo: Path) -> None:
    bad = changed(
        "contradicted by the repository: `deploy/compose.yaml`",
        "contradicted by the repository",
    )
    assert failing(run(repo, bad), "R2", "§2 line 4")


def test_a_duplicate_without_its_corpus_file_fails(repo: Path) -> None:
    bad = changed("| a duplicate of `08-hareet-ai.md` |", "| a duplicate |")
    assert failing(run(repo, bad), "R2", "kill-switch-b2 S1")


def test_a_carried_row_without_a_corpus_line_fails(repo: Path) -> None:
    bad = changed("| The tests #1 |", "| — |")
    assert failing(run(repo, bad), "R2", "§2 line 1")


def test_an_about_you_line_carried_without_the_authors_tag_fails(repo: Path) -> None:
    bad = changed(
        "| The meter #2 | `src/sign.md` | `[A 2026-11-10]` |",
        "| The meter #2 | `src/sign.md` | `[P]` |",
    )
    problems = run(repo, bad)
    assert failing(problems, "R2", "§1 line 3", "about you")


# ---- R3: nothing unbuilt, retracted, or "shown as built" carried ----


def test_an_unbuilt_line_carried_fails(repo: Path) -> None:
    bad = changed(
        '| left out | — | unbuilt: "Not in the repository yet" | What it doesn\'t know yet #1 |',
        "| carried | whole | — | What it doesn't know yet #1 |",
    )
    assert failing(run(repo, bad), "R3", "§1 line 4")


def test_a_retracted_line_carried_fails(repo: Path) -> None:
    bad = changed(
        "| left out | — | a recorded run's result | — |",
        "| carried | whole | — | The tests #1 |",
    )
    assert failing(run(repo, bad), "R3", "§2 line 2")


def test_a_carried_sentence_citing_the_shown_as_built_row_fails(repo: Path) -> None:
    bad = changed(
        "| The kill switch #3 | `deploy/compose.yaml` |",
        "| The kill switch #3 | `deploy/compose.yaml`, `specs/tunnel.md` |",
    )
    assert failing(run(repo, bad), "R3", "kill-switch-b2 S6", "shown as built")


# ---- R4: numbers and money in the new prose ----


@pytest.mark.parametrize(
    ("old", "new", "needle"),
    [
        ("runs with one command", "runs with 3 commands", "3"),
        ("runs [slot `site.prod_containers`]", "runs fifteen containers", "fifteen"),
        (
            "So it has a ceiling,",
            "At three fifty, a warning goes out; so it has a ceiling,",
            "three",
        ),
        (
            "Every case comes from the corpus",
            "Hundreds of cases come from the corpus",
            "hundreds",
        ),
    ],
)
def test_a_number_outside_a_slot_fails(
    repo: Path, old: str, new: str, needle: str
) -> None:
    problems = run(repo, changed(old, new))
    assert failing(problems, "R4", "number", needle), problems


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ("shows what each call cost.", "shows what each call cost, ten cents at most."),
        (
            "shows what each call cost.",
            "shows what each call cost, metered to the millionth of a dollar.",
        ),
        (
            "shows what each call cost.",
            "shows what each call cost, in whole micro-dollars.",
        ),
        ("shows what each call cost.", "shows what each call cost, never over $5."),
    ],
)
def test_a_currency_amount_fails(repo: Path, old: str, new: str) -> None:
    problems = run(repo, changed(old, new))
    assert failing(problems, "R4", "currency"), problems


def test_the_proposal_file_as_a_whole_holds_no_currency_in_digits(repo: Path) -> None:
    # corpus-check reads corpus/proposals/ too, so the reading guide and the table may not hold "$5" either.
    bad = changed('cite "five dollars a day"', 'cite "$5 a day"')
    assert failing(run(repo, bad), "R4", "currency")


def test_an_unknown_slot_fails(repo: Path) -> None:
    bad = changed("runs [slot `site.prod_containers`]", "runs {{slot:site.prod_boxes}}")
    assert failing(run(repo, bad), "R4", "site.prod_boxes")


def test_exempt_spans_read_no_number() -> None:
    text = (
        "9. *How does the kill switch stop spending?* — The gateway reads the kill switch first. [P]\n"
        "- `[A 2026-11-06]` As of 2026-11-13, one command, `docs/adr/0020-gateway.md`, "
        "https://github.com/hareet/h4reet-ai/blob/main/docs/adr/0044-ec2.md, {{slot:site.prod_containers}}.\n"
    )
    assert fc.numbers_in(fc.without_exempt(text, quotes=())) == []


@pytest.mark.parametrize(
    ("old", "new", "needle"),
    [
        # rv-impl-022's I-2: a bracketed span that isn't a claim tag is prose, not a tag.
        (
            "The gateway reads the kill switch first. — ",
            "The gateway reads the kill switch first [fifty-two assertions, fifty-two passed]. — ",
            "fifty-two",
        ),
        # A ratio isn't a path, bare or in backticks.
        ("runs with one command", "runs with one command, and passed 52/52", "52"),
        ("runs with one command", "runs with one command, and passed `52/52`", "52"),
        (
            "runs with one command",
            "runs with one command, and passed fifty-two/fifty-two",
            "fifty-two",
        ),
    ],
)
def test_a_number_in_brackets_or_a_ratio_fails(
    repo: Path, old: str, new: str, needle: str
) -> None:
    problems = run(repo, changed(old, new))
    assert failing(problems, "R4", "number", needle), problems


def test_claim_tags_and_paths_read_no_number_but_brackets_and_ratios_do() -> None:
    tags = "- `[P]` `[?][A]` [A 2026-11-06] [?] [A] [slot `site.prod_containers`] [A][A 2026-11-09]\n"
    assert fc.numbers_in(fc.without_exempt(tags, quotes=())) == []
    paths = "`docs/adr/0020-gateway.md`, deploy/compose.yaml, films/kill-switch-b2/, 2026-11-13/14\n"
    assert fc.numbers_in(fc.without_exempt(paths, quotes=())) == []
    # `v2/notes` is no path since rv2-rework2-022's B-1: the repository has no top-level `v2`.
    prose = "[3 runs] [twelve cases] 24/7 `52/52` `v2/notes`\n"
    assert fc.numbers_in(fc.without_exempt(prose, quotes=())) == [
        "3",
        "twelve",
        "24",
        "7",
        "52",
        "52",
        "2",
    ]


@pytest.mark.parametrize(
    ("old", "new", "needle"),
    [
        # rv-rework-022's F-2: a segment that is a number makes the token no path, and a token with whitespace is
        # never one.
        ("runs with one command", "runs with one command. It caps at 100/day.", "100"),
        ("runs with one command", "runs with one command. It passed 52/run.", "52"),
        (
            "runs with one command",
            "runs with one command, `fifty-two of fifty-two passed/run`",
            "fifty-two",
        ),
        # Siblings the review didn't name: a number word as the segment, the same in backticks, and a number as an
        # assignment's value.
        ("runs with one command", "runs with one command, twelve/hour", "twelve"),
        ("runs with one command", "runs with one command, `100/day`", "100"),
        ("runs with one command", "runs with one command, `DAILY_CAP=100`", "100"),
    ],
)
def test_a_number_as_a_path_segment_fails(
    repo: Path, old: str, new: str, needle: str
) -> None:
    problems = run(repo, changed(old, new))
    assert failing(problems, "R4", "number", needle), problems


RUNS = "runs with one command"


@pytest.mark.parametrize(
    ("new", "needle"),
    [
        # rv2-rework2-022's B-1: a segment with a letter beside its number, a number word that isn't the whole
        # segment, a number in a later segment, and a setting whose value holds a number or a number word.
        (", 5k/day", "5"),
        (", 100ms/run", "100"),
        (", twelve-hundred/day", "twelve"),
        (", day/100-requests", "100"),
        (", `cap/100-per-day`", "100"),
        (", `CAP=100k`", "100"),
        (", `CAP=five-dollars`", "five"),
        # Siblings of other shapes: a token rooted at a real top-level entry that names no file, the same in
        # backticks with a number word, a bare file name no directory holds, a token that climbs out of the root, a
        # setting whose number isn't at its start, and a file name with a number in a directory that doesn't exist.
        (", docs/100-per-day", "100"),
        (", `docs/twelve-hundred`", "twelve"),
        (", 100-per-day.md", "100"),
        (", ../5k/day", "5"),
        (", `LIMIT=per-100`", "100"),
        (", docs/caps/100-per-day.md", "100"),
    ],
    ids=[
        "5k-per-day",
        "100ms-per-run",
        "twelve-hundred-per-day",
        "day-per-100-requests",
        "backticked-cap",
        "setting-100k",
        "setting-five-dollars",
        "docs-100-per-day",
        "backticked-docs-twelve-hundred",
        "bare-file-name",
        "climbs-out",
        "setting-per-100",
        "file-in-no-directory",
    ],
)
def test_a_number_is_a_path_only_under_the_root(
    repo: Path, new: str, needle: str
) -> None:
    problems = run(repo, changed(RUNS, RUNS + new))
    assert failing(problems, "R4", "number", needle), problems


def test_a_path_is_read_against_the_root_it_is_given(repo: Path) -> None:
    # B-1's rule: the first segment is a top-level entry of the root, or the token is found under the root (at it, or
    # under one of its top-level directories); a token holding a number must be found, or be a file name in a
    # directory that exists. `corpus/05-mission.md` is cited bare as `05-mission.md` in the real proposal.
    (repo / "corpus/05-mission.md").write_text("# Mission\n")
    plain = "`05-mission.md`, `src/sign.md`, docs/adr/0020-gateway.md, docs/adr/0021-next.md, `evals/run.md:12-14`\n"
    assert fc.numbers_in(fc.without_exempt(plain, quotes=(), root=repo)) == []
    assert fc.numbers_in(
        fc.without_exempt("`07-other.md`, src/100-per-day\n", quotes=(), root=repo)
    ) == ["07", "100"]


def test_real_paths_with_numbers_in_them_read_no_number() -> None:
    paths = (
        "`docs/adr/0020-gateway.md`, `evals/product/history/2026-11-09/run.json`, `redteam/run.py:267-299`, "
        "`ENV=prod`, `COMPOSE_PROFILES=gpu`, films/kill-switch-b2/, specs/001-cloud-elevation/spec.md, 2026-11-13/14\n"
    )
    assert fc.numbers_in(fc.without_exempt(paths, quotes=())) == []


def test_number_words_are_g1s() -> None:
    assert fc.numbers_in("one command and a first run") == []
    assert fc.numbers_in("twenty-one of twenty-four, a dozen, thousands") == [
        "twenty",  # G1 reads "twenty-one" as twenty: its UNITS has no "one"
        "twenty-four",
        "dozen",
        "thousands",
    ]


# ---- R5: quotes ----


def test_a_stray_quote_fails(repo: Path) -> None:
    bad = changed(
        "The gateway reads the kill switch first. — ",
        'The gateway "reads the switch at once". — ',
    )
    assert failing(run(repo, bad), "R5", "reads the switch at once")


def test_a_paraphrased_f3_quote_fails(repo: Path) -> None:
    bad = changed(
        'up to 30 days, never for training" [A', 'up to a month, never for training" [A'
    )
    assert failing(run(repo, bad), "R5", "up to a month")


@pytest.mark.parametrize(
    ("row_old", "row_new", "quote"),
    [
        # rv-impl-022's I-2: a row may cite `films/SCRIPTS.md` (§1 line 3 does, for his words), but a script line the
        # agents wrote isn't his words, so quoting one, amount and all, fails.
        (
            "| The meter #2 | `src/sign.md` | `[A 2026-11-10]` |",
            "| The meter #2 | `films/SCRIPTS.md` | `[A 2026-11-10]` |",
            "A sign shows what each call cost, to the millionth of a dollar.",
        ),
        # The same for a film's script.txt, cited by a row.
        (
            "| The tests #1 | `evals/run.md` | `[P]` |",
            "| The tests #1 | `evals/run.md`, `films/kill-switch-b2/script.txt` | `[P]` |",
            "So it has a ceiling: five dollars a day.",
        ),
    ],
)
def test_a_quoted_script_line_isnt_a_cited_files_text(
    repo: Path, row_old: str, row_new: str, quote: str
) -> None:
    cites = changed(row_old, row_new)
    assert run(repo, cites) == []
    bad = changed(
        "- `[?]` The daily summary of the CPU metrics.",
        f'- `[?]` The daily summary of the CPU metrics. The film says "{quote}"',
        cites,
    )
    problems = run(repo, bad)
    assert failing(problems, "R5", quote[:20]), problems
    assert failing(problems, "R4", "currency"), problems


@pytest.mark.parametrize(
    ("note", "quote"),
    [
        # rv-rework-022's F-3: a review note of SCRIPTS.md line 67's shape names the Author, but its quote is the
        # review's, not his.
        (
            '   - Review of 2026-11-11: "every live run" was too strong (two runs in the Author\'s checkout failed).',
            "every live run",
        ),
        # Siblings the review didn't name: the Author named with no date, and a quote before a his-words marker.
        (
            '   - Checked with the Author: "every route passed" is the committed history\'s.',
            "every route passed",
        ),
        (
            '   - "the cheaper model" was the draft\'s. In Hareet\'s words: "we chose haiku since our context base is small and manually evaluated haiku and sonnet."',
            "the cheaper model",
        ),
        # rv2-rework2-022's B-3: the six notes, each a marker the scan took as his words, though the note says the
        # words aren't his or are the review's.
        (
            '   - **about you**: "every live run" was the review\'s phrase.',
            "every live run",
        ),
        ('   - Not the Author\'s wording: "every route passed".', "every route passed"),
        (
            '   - Not in Hareet\'s words: "a cheaper model answers".',
            "a cheaper model answers",
        ),
        (
            '   - Asked the Author, 2026-11-11, and the review said: "too strong".',
            "too strong",
        ),
        (
            '   - Not the Author, 2026-11-12, but the review: "the latest committed run".',
            "the latest committed run",
        ),
        (
            '   - The draft, not **about you**, said: "the meter is the bill".',
            "the meter is the bill",
        ),
        # A sibling: the marker itself, on a line the checker's fixed list doesn't name, gives no words of his.
        (
            '   - In Hareet\'s words: "the twin is cheap to run."',
            "the twin is cheap to run.",
        ),
    ],
    ids=[
        "review-note",
        "the-author-no-date",
        "a-quote-before-the-marker",
        "about-you",
        "not-the-authors-wording",
        "not-in-hareets-words",
        "asked-the-author-dated",
        "not-the-author-dated",
        "not-about-you",
        "a-marker-on-an-unlisted-line",
    ],
)
def test_a_quote_in_scripts_md_is_his_only_if_the_checker_lists_it(
    repo: Path, note: str, quote: str
) -> None:
    anchor = '   - Its recorded run. The earlier "345" didn\'t hold up.\n'
    scripts = SCRIPTS_MD.replace(anchor, anchor + note + "\n", 1)
    assert scripts != SCRIPTS_MD
    (repo / "films/SCRIPTS.md").write_text(scripts)
    assert not any(quote in q for q in fc.read_context(repo).author_quotes)
    bad = changed(
        "- `[?]` The daily summary of the CPU metrics.",
        f'- `[?]` The daily summary of the CPU metrics. In his words, "{quote}".',
    )
    assert failing(run(repo, bad), "R5", quote), run(repo, bad)


def test_his_words_are_the_checkers_fixed_list_each_verbatim_on_its_scripts_md_line() -> (
    None
):
    # rv2-rework2-022's B-3 (page Q213, the recommended answer): FR-005's Q6 quotes from SCRIPTS.md are a fixed list
    # in the checker, the Haiku reason on line 18 (F3's words come from the disclosure); no marker scan.
    assert fc.HIS_WORDS == (
        (
            18,
            "we chose haiku since our context base is small and manually evaluated haiku and sonnet.",
        ),
    )
    lines = (ROOT / "films/SCRIPTS.md").read_text().splitlines()
    for n, quote in fc.HIS_WORDS:
        line = lines[n - 1]
        marker = "In Hareet's words: "
        assert marker in line, (n, line)
        assert line.split(marker, 1)[1].startswith(f'"{quote}"'), (n, line)
    assert fc.read_context(ROOT).author_quotes == [q for _, q in fc.HIS_WORDS]
    assert not hasattr(fc, "his_quotes")
    # Line 46's "up to 30 days" and line 121's daily-summary words aren't in the list: F3's words come from the
    # disclosure, and the summary stays out until it is built (Q6).
    quotes = fc.read_context(ROOT).author_quotes
    assert "up to 30 days" not in quotes
    assert not any(q.startswith("We will get a daily summary") for q in quotes)


FILM_FILES = {
    "films/kill-switch-b2/captions.srt": (
        "1\n00:00:01,000 --> 00:00:04,000\nSo it has a ceiling: five dollars a day.\n"
    ),
    "films/meter/notes.md": "A sign shows what each call cost, to the millionth of a dollar.\n",
}


@pytest.mark.parametrize(
    ("source", "quote"),
    [
        # rv-rework-022's F-1: a film's other files are the agents' text too, and a leading ./ is the same file.
        (
            "films/kill-switch-b2/captions.srt",
            "So it has a ceiling: five dollars a day.",
        ),
        (
            "./films/kill-switch-b2/script.txt",
            "So it has a ceiling: five dollars a day.",
        ),
        # Siblings the review didn't name: a path that normalises into a film's script, and another film's notes.
        (
            "films/meter/../kill-switch-b2/script.txt",
            "So it has a ceiling: five dollars a day.",
        ),
        (
            "films/meter/notes.md",
            "A sign shows what each call cost, to the millionth of a dollar.",
        ),
    ],
)
def test_no_file_under_films_is_a_cited_files_text(
    repo: Path, source: str, quote: str
) -> None:
    for rel, text in FILM_FILES.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)
    cites = changed(
        "| The tests #1 | `evals/run.md` | `[P]` |",
        f"| The tests #1 | `evals/run.md`, `{source}` | `[P]` |",
    )
    assert run(repo, cites) == []
    bad = changed(
        "- `[?]` The daily summary of the CPU metrics.",
        f'- `[?]` The daily summary of the CPU metrics. The film says "{quote}"',
        cites,
    )
    problems = run(repo, bad)
    assert failing(problems, "R5", quote[:20]), problems
    assert failing(problems, "R4", "currency"), problems


OUTSIDE_TEXT = "It caps at five dollars a day, the other checkout says.\n"
OUTSIDE_QUOTE = "It caps at five dollars a day"
KS_QUOTE = "So it has a ceiling: five dollars a day."


@pytest.fixture
def checkout(tmp_path: Path) -> Path:
    """The fixture repository at `<tmp>/checkout`, with another checkout beside it (`<tmp>/other`, its own films), a
    plain file above it (`<tmp>/plain.txt`), and three links inside it: to a file outside, to a directory outside, and
    into its own `films/`."""
    root = tmp_path / "checkout"
    for rel, text in FILES.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    other = tmp_path / "other"
    (other / "films/kill-switch-b2").mkdir(parents=True)
    (other / "films/kill-switch-b2/script.txt").write_text(SCRIPT_TXT)
    (other / "plain.txt").write_text(OUTSIDE_TEXT)
    (tmp_path / "plain.txt").write_text(OUTSIDE_TEXT)
    (root / "docs/outside.txt").symlink_to(other / "plain.txt")
    (root / "docs/ext").symlink_to(other, target_is_directory=True)
    (root / "docs/script-link.txt").symlink_to("../films/kill-switch-b2/script.txt")
    return root


CARRIED_ROW = (
    "| The tests #1 | `evals/run.md` |",
    "| The tests #1 | `evals/run.md`, `{source}` |",
)
LEFT_OUT_ROW = (
    "a recorded run's result | — | `evals/run.md` |",
    "a recorded run's result | — | `evals/run.md`, `{source}` |",
)


@pytest.mark.parametrize(
    ("row_old", "row_new"), [CARRIED_ROW, LEFT_OUT_ROW], ids=["carried", "left-out"]
)
@pytest.mark.parametrize(
    ("source", "quote"),
    [
        # rv2-rework2-022's B-2: another checkout's films, an absolute path, and a plain file above the root.
        ("../other/films/kill-switch-b2/script.txt", KS_QUOTE),
        ("{other}/plain.txt", OUTSIDE_QUOTE),
        ("../plain.txt", OUTSIDE_QUOTE),
        # Siblings of other shapes: a path that climbs out after a real directory, a link inside the root to a file
        # outside it, and a link inside the root to a directory outside it.
        ("docs/../../plain.txt", OUTSIDE_QUOTE),
        ("docs/outside.txt", OUTSIDE_QUOTE),
        ("docs/ext/plain.txt", OUTSIDE_QUOTE),
    ],
    ids=[
        "other-checkouts-films",
        "absolute",
        "above-the-root",
        "climbs-out",
        "link-out",
        "linked-directory-out",
    ],
)
def test_a_path_outside_the_repository_is_no_source_and_no_quote(
    checkout: Path, row_old: str, row_new: str, source: str, quote: str
) -> None:
    source = source.format(other=checkout.parent / "other")
    cites = changed(row_old, row_new.format(source=source))
    problems = run(checkout, cites)
    assert failing(problems, "R1", source, "isn't in the repository"), problems
    bad = changed(
        "- `[?]` The daily summary of the CPU metrics.",
        f'- `[?]` The daily summary of the CPU metrics. The file says "{quote}"',
        cites,
    )
    problems = run(checkout, bad)
    assert failing(problems, "R5", quote[:20]), problems
    assert failing(problems, "R4", "currency"), problems


def test_a_link_inside_the_root_into_films_is_a_source_but_no_quote(
    checkout: Path,
) -> None:
    # rv2-rework2-022's N-1: the link is in the repository, so R1 takes it; it resolves under films/, so R5 doesn't.
    cites = changed(*(s.format(source="docs/script-link.txt") for s in CARRIED_ROW))
    assert run(checkout, cites) == []
    bad = changed(
        "- `[?]` The daily summary of the CPU metrics.",
        f'- `[?]` The daily summary of the CPU metrics. The file says "{KS_QUOTE}"',
        cites,
    )
    problems = run(checkout, bad)
    assert failing(problems, "R5", KS_QUOTE[:20]), problems
    assert failing(problems, "R4", "currency"), problems


@pytest.mark.parametrize(
    ("old", "new", "rule", "needle"),
    [
        # Siblings: a glob outside the root, and a contradicting file outside it.
        (
            *(s.format(source="../other/*.txt") for s in CARRIED_ROW),
            "R1",
            "../other/*.txt",
        ),
        (
            "contradicted by the repository: `deploy/compose.yaml`",
            "contradicted by the repository: `../plain.txt`",
            "R2",
            "contradicted by the repository",
        ),
    ],
    ids=["glob-out", "contradicted-by-a-file-outside"],
)
def test_a_glob_or_a_contradicting_file_outside_the_repository_fails(
    checkout: Path, old: str, new: str, rule: str, needle: str
) -> None:
    problems = run(checkout, changed(old, new))
    assert failing(problems, rule, needle), problems


# ---- R6: third-party text ----


def test_third_party_mode_fails_a_long_quote_from_outside(repo: Path) -> None:
    text = changed(
        "R4 reads only the new text.",
        'R4 reads only the new text. "It was a dark and stormy night, and the rain fell in torrents."',
    )
    assert run(repo, text) == []
    assert failing(run(repo, text, third_party=True), "R6", "dark and stormy")


def test_third_party_mode_passes_a_short_title(repo: Path) -> None:
    text = changed(
        "R4 reads only the new text.",
        'R4 reads only the new text. "Casablanca" (1942) is a film.',
    )
    assert run(repo, text, third_party=True) == []


# ---- R7 and the command line ----


def test_main_prints_one_line_per_problem_and_a_summary_naming_the_denylist(
    repo: Path,
) -> None:
    proposal = repo / "proposal.md"
    proposal.write_text(changed("runs with one command", "runs with 3 commands"))
    out = subprocess.run(
        [sys.executable, "-I", str(CHECKER), "--root", str(repo), str(proposal)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert out.returncode == 1
    lines = out.stdout.strip().splitlines()
    assert lines[0].startswith("R4")
    assert lines[-1].startswith("film-claims: FAIL")
    assert "the denylist was not applied" in lines[-1]


def test_main_passes_the_good_proposal_and_counts_the_lines(repo: Path) -> None:
    proposal = repo / "proposal.md"
    proposal.write_text(GOOD)
    out = subprocess.run(
        [sys.executable, "-I", str(CHECKER), "--root", str(repo), str(proposal)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert out.returncode == 0, out.stdout
    assert out.stdout.startswith("film-claims: OK")
    assert "14 lines in scope" in out.stdout
    assert "the denylist was not applied" in out.stdout


def test_rules_can_be_limited(repo: Path) -> None:
    bad = changed("runs with one command", "runs with 3 commands")
    assert run(repo, bad, rules={"R1", "R2", "R3"}) == []


# ---- Parity: the checker's copies of the sources' patterns and words (plan §3 R4) ----


def _assigned(path: Path, name: str) -> ast.expr:
    for node in ast.parse(path.read_text()).body:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == name for t in node.targets
        ):
            return node.value
    raise AssertionError(f"{path} assigns no {name}")


def _compiled_text(node: ast.expr, names: dict[str, str]) -> str:
    assert isinstance(node, ast.Call), "expected re.compile(...)"
    arg = node.args[0]
    if isinstance(arg, ast.Constant):
        return arg.value
    assert isinstance(arg, ast.JoinedStr)
    out = []
    for part in arg.values:
        if isinstance(part, ast.Constant):
            out.append(part.value)
        else:
            assert isinstance(part, ast.FormattedValue) and isinstance(
                part.value, ast.Name
            )
            out.append(names[part.value.id])
    return "".join(out)


def test_currency_is_check_corpus_pys() -> None:
    source = ROOT / "corpus" / "tools" / "check_corpus.py"
    assert fc.CURRENCY.pattern == _compiled_text(_assigned(source, "CURRENCY"), {})


def test_amount_words_are_redteam_run_pys_with_its_number_words_filled_in() -> None:
    source = ROOT / "redteam" / "run.py"
    words = _assigned(source, "_NUMBER_WORDS")
    assert isinstance(words, ast.Constant)
    assert "a couple of" in words.value
    assert fc.NUMBER_WORDS_PY == words.value
    assert fc.AMOUNT_WORDS.pattern == _compiled_text(
        _assigned(source, "AMOUNT_WORDS"), {"_NUMBER_WORDS": words.value}
    )
    assert fc.AMOUNT_WORDS.flags & re.IGNORECASE


GUARDS = ROOT / "services" / "gateway" / "src" / "twin" / "guards.ts"


def _ts_keys(name: str) -> list[str]:
    m = re.search(
        rf"const {name}: Record<string, number> = \{{(.*?)\}};",
        GUARDS.read_text(),
        re.DOTALL,
    )
    assert m, name
    return re.findall(r"^\s*(\w+):", m.group(1), re.MULTILINE)


def test_number_words_are_guards_ts_g1s() -> None:
    assert list(fc.UNITS) == _ts_keys("UNITS")
    assert list(fc.TENS) == _ts_keys("TENS")
    assert list(fc.SCALES) == _ts_keys("SCALES")


def test_word_is_guards_ts_g1s() -> None:
    # rv-impl-022's N-4: G1's WORD, its template filled in from its own UNITS, TENS, and SCALES keys, with its groups
    # made non-capturing, is the checker's WORD; and the units it allows after a tens word are those under ten.
    m = re.search(
        r"const WORD = new RegExp\(\n\s*`(.*?)`,\n\s*\"(\w+)\",\n\);",
        GUARDS.read_text(),
        re.DOTALL,
    )
    assert m, "guards.ts's WORD"
    template, flags = m.group(1), m.group(2)
    parts = re.split(r"\$\{(.*?)\}", template, flags=re.DOTALL)
    expressions = parts[1::2]
    assert [re.sub(r"\s+", "", e) for e in expressions] == [
        'Object.keys(TENS).join("|")',
        'Object.keys(UNITS).filter((u)=>UNITS[u]!==undefined&&(UNITS[u]??0)<10).join("|")',
        'Object.keys(UNITS).join("|")',
        'Object.keys(SCALES).join("|")',
    ]
    fills = [
        "|".join(_ts_keys("TENS")),
        "|".join(u for u in _ts_keys("UNITS") if fc.UNITS[u] < 10),
        "|".join(_ts_keys("UNITS")),
        "|".join(_ts_keys("SCALES")),
    ]
    filled = "".join(
        part if i % 2 == 0 else fills[i // 2] for i, part in enumerate(parts)
    )
    as_python = re.sub(r"\((?!\?)", "(?:", filled.replace("\\\\", "\\"))
    assert fc.WORD.pattern == as_python
    assert "i" in flags and fc.WORD.flags & re.IGNORECASE


def test_extra_patterns_fixed_words_are_guards_ts() -> None:
    m = re.search(
        r"export const EXTRA_PATTERN = pythonPattern\((.*?)\n\);",
        GUARDS.read_text(),
        re.DOTALL,
    )
    assert m
    definition = m.group(1)
    assert "Object.keys(UNITS)" in definition and "Object.keys(TENS)" in definition
    for word in fc.EXTRA_LEADING_WORDS:
        assert f'"{word}"' in definition, word
    for word in (*fc.EXTRA_AFTER_WORD, *fc.EXTRA_AFTER_DIGITS):
        assert word in definition, word
    assert set(fc.EXTRA_LEADING_WORDS) == {"one", "a hundred", "a thousand"}
    assert fc.EXTRA_AFTER_WORD == ("cents?", "dollars?", "bucks?")
    assert fc.EXTRA_AFTER_DIGITS == ("cents?", "dollars?", "usd", "bucks?")
    assert (
        fc.EXTRA.search("five dollars")
        and fc.EXTRA.search("10 usd")
        and not fc.EXTRA.search("one command")
    )


def test_three_fifty_is_a_number_not_a_currency_match() -> None:
    assert not fc.CURRENCY.search("At three fifty")
    assert not fc.AMOUNT_WORDS.search("At three fifty")
    assert not fc.EXTRA.search("At three fifty")
    assert fc.numbers_in("At three fifty") == ["three", "fifty"]


def test_the_checker_imports_nothing_from_the_sources_it_copies() -> None:
    text = CHECKER.read_text()
    assert not re.search(
        r"^\s*(?:from|import)\s+(?:corpus|redteam|services|check_corpus|run)\b",
        text,
        re.MULTILINE,
    )


# ---- T003: the real scripts, read-only ----


def test_real_scripts_md_numbered_lines() -> None:
    sections = fc.read_scripts_md((ROOT / "films" / "SCRIPTS.md").read_text())
    assert {k: len(v) for k, v in sections.items()} == {
        "§1": 12,
        "§2": 10,
        "§3": 10,
        "§4": 10,
        "§5": 13,
        "§6": 14,
    }
    for key, lines in sections.items():
        assert [x.n for x in lines] == list(range(1, len(lines) + 1)), key


def test_real_markers_and_about_you_lines() -> None:
    sections = fc.read_scripts_md((ROOT / "films" / "SCRIPTS.md").read_text())
    marked = {
        (k, x.n): x.markers for k, lines in sections.items() for x in lines if x.markers
    }
    assert marked == {
        ("§5", 9): {"unbuilt"},
        ("§6", 12): {"retracted"},
        ("§6", 13): {"unbuilt"},
    }
    about = {(k, x.n) for k, lines in sections.items() for x in lines if x.about_you}
    assert about == {("§1", 5), ("§4", 7), ("§4", 8), ("§4", 9)}


def test_real_kill_switch_sentences() -> None:
    text = (ROOT / "films" / "kill-switch-b2" / "script.txt").read_text()
    sentences = fc.split_sentences(text)
    assert len(sentences) == 21
    joined = next(s for s in sentences if s.text.startswith("At five dollars"))
    assert joined.text == "At five dollars... it stops itself."
    assert fc.file_lines(text, joined) == "file lines 9 and 11"
    quote = next(s for s in sentences if s.text.startswith('"'))
    assert (
        quote.text
        == "\"The twin can't talk right now. Today's budget for its answers is used.\""
    )
    assert fc.file_lines(text, quote) == "file line 15"
    assert sentences[-1].text == "Built in the open, at hareet dot A I."
    assert [s.first for s in sentences].count(23) == 4


def test_real_materials_sources_and_the_shown_as_built_row() -> None:
    listed, shown = fc.read_materials(
        (ROOT / "films" / "kill-switch-b2" / "materials.md").read_text()
    )
    assert shown == {
        "specs/001-cloud-elevation/spec.md",
        "docs/adr/0044-ec2-as-prods-default-host.md",
    }
    assert {
        "apps/web/content/messages.yaml",
        "deploy/compose.yaml",
        "config/budgets.yaml",
        "services/gateway/src/core/gateway.ts",
        "docs/adr/0020-gateway-state-store-and-meter.md",
        ".claude/agents/*.md",
    } <= listed
    # Every source materials.md lists is in the repository, but the Author's untracked resume sources and the film's
    # own font folder (films/kill-switch-b2/assets/fonts/), none of them a claim's source; R1 requires that a carried
    # row's source exists, so none of these can stand under a carried line.
    missing = {p for p in listed if not fc.exists(ROOT, p)}
    assert missing == {
        "resume/source/twin.html",
        "resume/source/fonts.css",
        "assets/fonts/",
    }


def test_real_scope_is_ninety_lines() -> None:
    ctx = fc.read_context(ROOT)
    assert ctx.scope() == {
        "§1": 12,
        "§2": 10,
        "§3": 10,
        "§4": 10,
        "§5": 13,
        "§6": 14,
        "kill-switch-b2": 21,
    }
    assert ctx.dirs == {
        "§1": "films/cost-meter",
        "§2": "films/data-flows",
        "§3": "films/evals",
        "§4": "films/local-first",
        "§5": "films/stack",
        "§6": "films/lifecycle",
    }
    assert any(
        "we chose haiku since our context base is small" in q for q in ctx.author_quotes
    )
    assert "up to 30 days, never for training" in ctx.f3


# ---- T004 to T006: the real proposal ----

PROPOSAL = ROOT / "corpus" / "proposals" / "film-scripts-2026-11-14.md"


def test_the_real_proposal_passes_every_rule() -> None:
    assert fc.check(PROPOSAL) == []


def test_the_real_proposal_marks_the_four_lines_the_films_note_changed() -> None:
    # docs/merge-requests/2026-11-11-feat-015-explainer-films.md, lines 41, 44, 47, and 48 (spec Q2).
    rows, problems = fc.read_table(PROPOSAL.read_text())
    assert problems == []
    marked = {(r.script, r.line): r.mark for r in rows if r.mark not in fc.NONE}
    assert marked == {
        ("§3", "6"): "changed after his approval (note, line 41)",
        ("§3", "8"): "changed after his approval (note, line 47)",
        ("§5", "5"): "changed after his approval (note, line 48)",
        ("§5", "9"): "changed after his approval (note, line 44)",
    }


def test_the_real_proposal_adds_one_slot_the_laptops_stack_count() -> None:
    yaml = pytest.importorskip("yaml")
    facts = fc.blocks(PROPOSAL.read_text())["facts"]
    assert len(facts) == 1
    (slot,) = yaml.safe_load(facts[0])
    assert slot["id"] == "site.prod_containers"
    assert (
        slot["tag"] == "C"
        and slot["public_safe"] is True
        and "{value}" in slot["phrasing"]
    )
    for words in (
        "laptop's production stack",
        "ENV=prod",
        "COMPOSE_PROFILES=gpu",
        "as of 2026-11-13",
    ):
        assert words in slot["label"], words
    compose = yaml.safe_load((ROOT / "deploy" / "compose.yaml").read_text())["services"]
    gpu = [
        n
        for n, s in compose.items()
        if s.get("profiles") is None or "gpu" in s["profiles"]
    ]
    assert slot["value"] == len(gpu)
    assert [n for n in gpu if "egress" in (compose[n].get("networks") or {})] == [
        "gateway"
    ]


def test_the_real_proposal_names_the_laptops_stack_with_the_count_and_the_road_out() -> (
    None
):
    text = "\n".join(fc.blocks(PROPOSAL.read_text())["corpus-08"])
    lines = [
        line
        for line in text.splitlines()
        if "site.prod_containers" in line or "road out" in line
    ]
    assert lines
    for line in lines:
        assert "laptop" in line, line


def test_a_number_outside_a_slot_is_a_reason(repo: Path) -> None:
    # FR-003's rule as a left-out reason (plan §9): "thirty days", "six ports", "within seven days".
    assert (
        run(repo, changed("| a recorded run's result |", "| a number outside a slot |"))
        == []
    )


def test_a_tag_needs_to_be_on_one_of_its_corpus_lines(repo: Path) -> None:
    ok = changed(
        "| The meter #2 | `src/sign.md` | `[A 2026-11-10]` |",
        "| The meter #2; The tests #1 | `src/sign.md` | `[A 2026-11-10]` |",
    )
    assert run(repo, ok) == []


def test_a_new_slot_is_written_in_its_display_form_until_it_exists(repo: Path) -> None:
    # corpus-check reads corpus/proposals/ too, and fails a {{slot:…}} whose fact doesn't exist yet; a slot the
    # proposal adds is written [slot `id`], as the earlier proposals wrote theirs, and the patch writes {{slot:id}}.
    bad = changed(
        "runs [slot `site.prod_containers`]", "runs {{slot:site.prod_containers}}"
    )
    assert failing(run(repo, bad), "R4", "site.prod_containers", "corpus-check")
    unknown = changed(
        "runs [slot `site.prod_containers`]", "runs [slot `site.prod_boxes`]"
    )
    assert failing(run(repo, unknown), "R4", "unknown slot site.prod_boxes")


def test_the_real_proposal_leaves_the_road_out_line_out() -> None:
    # Q115 (rv-rework2-spec-022's F-1), answered with its recommendation: "only the gateway has a road out" is left out
    # as contradicted by the repository (`tunnel` and `ec2-snapshot-publisher` join `egress` too), and the count's label
    # says "before the tunnel profile is added".
    text = "\n".join(fc.blocks(PROPOSAL.read_text())["corpus-08"]).lower()
    for claim in ("road out", "only the gateway leaves", "only `gateway` joins"):
        assert claim not in text, claim
    rows, _ = fc.read_table(PROPOSAL.read_text())
    s15 = next(
        r for r in rows if r.script == "kill-switch-b2" and r.line.startswith("S15 ")
    )
    assert s15.status == "left out"
    assert (
        "“and only the gateway has a road out.” → contradicted by the repository: `deploy/compose.yaml`"
        in s15.left
    )


def test_the_real_proposal_leaves_no_route_out_for_every_container_out() -> None:
    # rv-impl-022's I-1 and page Q192, answered with its recommendation: `deploy/compose.yaml` puts `gateway` on
    # `egress`, so §5 line 12's "on a network with no route out" is left out as contradicted by the repository, and the
    # line carries "Every container runs with no new privileges" and "Only the edge listens".
    text = "\n".join(fc.blocks(PROPOSAL.read_text())["corpus-08"])
    for line in text.splitlines():
        if "every container" in line.lower():
            assert "route out" not in line.lower(), line
    stack = fc.new_text_items([text])["The stack, container by container"]
    assert "Every container runs with no new privileges" in stack[12]
    assert "only the edge listens" in stack[12]
    rows, _ = fc.read_table(PROPOSAL.read_text())
    row = next(r for r in rows if (r.script, r.line) == ("§5", "12"))
    assert row.status == "in part"
    assert "“Every container runs with no new privileges,”" in row.carried
    assert "“Only the edge listens,”" in row.carried
    assert (
        "“on a network with no route out.” → contradicted by the repository: `deploy/compose.yaml`"
        in row.left
    )
    assert "“and only the gateway leaves.” → contradicted by the repository" in row.left


def test_the_real_proposal_names_the_host_that_tries_the_local_model_first() -> None:
    # rv-impl-022's N-2: Local models first #3 names its host, as Golden Q&A 13 does ("On the laptop, every question
    # tries llama.cpp"), since on the cloud server the Anthropic API answers first.
    items = fc.new_text_items(fc.blocks(PROPOSAL.read_text())["corpus-08"])
    assert (
        "On the laptop, every question tries the local model first"
        in items["Local models first"][3]
    )
    assert "On the laptop, every question tries" in items["Golden Q&A"][13]
