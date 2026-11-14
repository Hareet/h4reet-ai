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
| F1 | `gateway` → Bedrock. The gateway signs each call. | the fallback |
| F3 | `gateway` → Anthropic, over HTTPS: `POST /v1/messages` for a call, and `GET /v1/models/claude-haiku-5-5` for the health check. The model is Claude Haiku 5.5, `claude-haiku-5-5`. A request its safety systems flag can be kept up to 2 years. Against my promise that a visitor's conversation isn't saved: this site saves none of it, and Anthropic may keep a turn it answered for up to 30 days, never for training. What a visitor types is sent as typed. | the fallback |
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
    # Fourteen lines, so `evals/run.md:12-14` names lines it holds (rv-rework3-022's B-5).
    "evals/run.md": "Scoring is deterministic: no model judges another.\n"
    + "".join(f"Step {n}.\n" for n in range(2, 15)),
    "config/budgets.yaml": "ceilings:\n  daily: slot\n  monthly: slot\n",
    "redteam/run.py": '"""The red team."""\n\n\ndef main():\n    pass\n',
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


# rv-rework4-022's F-1: FR-004 grants no exempt span. The three currency patterns read each new-prose line with only
# `{{slot:…}}` removed and the marks that can split a number from its unit dropped (quote marks of every kind,
# backticks, emphasis, brackets, entities, zero-width characters), and a block's lines read together, so an amount
# inside an accepted quote, a URL, or a setting, or split by a mark or a line break, is still an amount. The fixture's
# `evals/run.md` (a carried row's source) holds "5", and `docs/costs.md` is cited by a carried row.
COSTS = "One fallback call costs a few thousand micro-dollars. It costs 5 dollars a day. It costs 5 usd a day.\n"
GAP = "- `[?]` The daily summary of the CPU metrics."


@pytest.mark.parametrize(
    ("added", "needle"),
    [
        # The review's three: an amount in words inside an accepted quote, one in digits, one split by quote marks.
        ('"a few thousand micro-dollars"', "micro-dollars"),
        ('"It costs 5 dollars a day"', "5 dollars"),
        ('"5" dollars a day', "5 dollars"),
        # Siblings: digits the whole-file read misses, the other quote marks, backticks, emphasis, brackets, an
        # entity, a zero-width space, a line break, and amounts in a URL and a setting.
        ('"It costs 5 usd a day"', "5 usd"),
        ("“5” dollars a day", "5 dollars"),
        ("'5' dollars a day", "5 dollars"),
        ("‘5’ dollars a day", "5 dollars"),
        ("*5* dollars a day", "5 dollars"),
        ("**5** dollars a day", "5 dollars"),
        ("_5_ dollars a day", "5 dollars"),
        ("(5) dollars a day", "5 dollars"),
        ("[5] dollars a day", "5 dollars"),
        ("5&nbsp;dollars a day", "5"),
        ("5\u200bdollars a day", "5dollars"),
        ("it caps at 5\n  dollars a day", "5\\n"),
        ("https://example.com/ten-cents", "cents"),
        ("`CAP=cents`", "cents"),
    ],
    ids=[
        "accepted-quote-words",
        "accepted-quote-digits",
        "split-by-quote-marks",
        "accepted-quote-usd",
        "curly-quotes",
        "single-quotes",
        "curly-single-quotes",
        "emphasis",
        "strong",
        "underscores",
        "parentheses",
        "brackets",
        "an-entity",
        "zero-width-space",
        "a-line-break",
        "a-url",
        "a-setting",
    ],
)
def test_a_currency_amount_is_read_through_every_exempt_span_and_mark(
    repo: Path, added: str, needle: str
) -> None:
    (repo / "docs/costs.md").write_text(COSTS)
    cites = changed(*(s.format(source="docs/costs.md") for s in CARRIED_ROW))
    assert run(repo, cites) == []
    problems = run(repo, changed(GAP, f"{GAP} {added}", cites))
    assert failing(problems, "R4", "new text", "a currency amount", needle), problems


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
        "- `[A 2026-11-06]` As of 2026-11-13, one command, `docs/adr/0020-gateway-state-store-and-meter.md`, "
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
    paths = "`docs/adr/0020-gateway-state-store-and-meter.md`, deploy/compose.yaml, films/kill-switch-b2/, 2026-11-13/14\n"
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
    plain = "`05-mission.md`, `src/sign.md`, docs/adr/0020-gateway.md, `evals/run.md:12-14`\n"
    assert fc.numbers_in(fc.without_exempt(plain, quotes=(), root=repo)) == []
    # `docs/adr/0021-next.md` reads its number since rv-rework3-022's B-8 (Q216): the fixture holds no such file.
    assert fc.numbers_in(
        fc.without_exempt(
            "`07-other.md`, src/100-per-day, docs/adr/0021-next.md\n",
            quotes=(),
            root=repo,
        )
    ) == ["07", "100", "0021"]


def test_real_paths_with_numbers_in_them_read_no_number() -> None:
    paths = (
        "`docs/adr/0020-gateway-state-store-and-meter.md`, `evals/product/history/2026-11-09/run.json`, `redteam/run.py:267-299`, "
        "`ENV=prod`, `COMPOSE_PROFILES=gpu`, films/kill-switch-b2/, specs/001-cloud-elevation/spec.md, 2026-11-13/14\n"
    )
    assert fc.numbers_in(fc.without_exempt(paths, quotes=())) == []


# rv-rework3-022's B-5: a backticked line suffix is exempt only on a file under the root that holds every line it
# names; on a directory, a missing file, a glob, or past the file's end, its numbers count. The fixture's
# config/budgets.yaml has 3 lines, redteam/run.py 5, evals/run.md 14, specs/tunnel.md 1.
@pytest.mark.parametrize(
    ("token", "needle"),
    [
        # The review's four.
        ("`config/budgets.yaml:5000`", "5000"),
        ("`docs/adr:100`", "100"),
        ("`films/kill-switch-b2:100`", "100"),
        ("`redteam/run.py:1-1000000`", "1000000"),
        # Siblings: line 0, a range backwards, a list with one line past the end, one past a one-line file, a glob,
        # a file that isn't there, a file found under a top-level directory past its end, and a path outside.
        ("`redteam/run.py:0`", "0"),
        ("`redteam/run.py:4-2`", "4"),
        ("`redteam/run.py:2,9000`", "9000"),
        ("`specs/tunnel.md:2`", "2"),
        ("`docs/adr/*.md:1`", "1"),
        ("`docs/missing.md:1`", "1"),
        ("`08-hareet-ai.md:300`", "300"),
        ("`../plain.txt:1`", "1"),
    ],
    ids=[
        "past-the-end",
        "a-directory",
        "a-film-directory",
        "a-range-past-the-end",
        "line-zero",
        "backwards",
        "a-list-past-the-end",
        "one-line-file",
        "a-glob",
        "no-such-file",
        "found-under-corpus-past-the-end",
        "outside",
    ],
)
def test_a_line_suffix_counts_unless_its_file_holds_every_line(
    repo: Path, token: str, needle: str
) -> None:
    problems = run(repo, changed(RUNS, RUNS + f", {token}"))
    assert failing(problems, "R4", "number", f"'{needle}'"), problems


def test_a_line_suffix_its_file_holds_reads_no_number(repo: Path) -> None:
    good = "`config/budgets.yaml:3`, `redteam/run.py:1-5`, `redteam/run.py:1,3-4`, `evals/run.md:12-14`, `08-hareet-ai.md:1`"
    assert run(repo, changed(RUNS, RUNS + f", {good}")) == []


def test_a_line_suffix_against_this_repository() -> None:
    # The review's four, read against the real root; `redteam/run.py:267-299` (866 lines) stays exempt.
    assert fc.numbers_in(
        fc.without_exempt(
            "`config/budgets.yaml:5000` `docs/adr:100` `films/kill-switch-b2:100` `redteam/run.py:1-1000000`\n",
            quotes=(),
        )
    ) == ["5000", "100", "100", "1", "1000000"]
    assert (
        fc.numbers_in(fc.without_exempt("`redteam/run.py:267-299`\n", quotes=())) == []
    )


# rv-rework3-022's B-8 (page Q216, the recommended answer): a path token that holds a number (a digit, or one of
# G1's words, outside a date) is a path only if it names an entry the root holds, itself or under a top-level
# directory; a glob that holds a number names none. Otherwise its number counts.
@pytest.mark.parametrize(
    ("token", "needle"),
    [
        # The review's four, bare.
        ("docs/adr/0100-per-day.md", "0100"),
        ("docs/five-dollars.md", "five"),
        ("docs/*100-per-day*.md", "100"),
        ("films/100.txt", "100"),
        # Siblings: the four in backticks, a glob with a number that matches a real file, a directory that isn't
        # there, a file name found nowhere under a top-level directory, and a number word in a directory segment.
        ("`docs/adr/0100-per-day.md`", "0100"),
        ("`docs/five-dollars.md`", "five"),
        ("`docs/*100-per-day*.md`", "100"),
        ("`films/100.txt`", "100"),
        ("`docs/adr/0020-*.md`", "0020"),
        ("`docs/twelve-cases/`", "twelve"),
        ("`0100-per-day.md`", "0100"),
        ("`docs/five-runs/notes.md`", "five"),
    ],
    ids=[
        "adr-0100",
        "five-dollars",
        "a-glob",
        "films-100",
        "adr-0100-backticked",
        "five-dollars-backticked",
        "a-glob-backticked",
        "films-100-backticked",
        "a-glob-matching-a-real-file",
        "a-missing-directory",
        "a-bare-file-name",
        "a-number-word-directory",
    ],
)
def test_a_path_holding_a_number_names_a_real_entry_or_its_number_counts(
    repo: Path, token: str, needle: str
) -> None:
    problems = run(repo, changed(RUNS, RUNS + f", {token} and more"))
    assert failing(problems, "R4", "number", f"'{needle}'"), problems


def test_a_path_holding_a_number_against_this_repository() -> None:
    made_up = "docs/adr/0100-per-day.md docs/five-dollars.md `docs/*100-per-day*.md` `films/100.txt` docs/adr/0020-gateway.md\n"
    assert fc.numbers_in(fc.without_exempt(made_up, quotes=())) == [
        "0100",
        "five",
        "100",
        "100",
        "0020",
    ]
    real = (
        "`docs/adr/0020-gateway-state-store-and-meter.md` `proposals/film-scripts-2026-11-14.md` `05-mission.md` "
        "films/kill-switch-b2/ evals/product/history/2026-11-10T063144Z-anthropic.json\n"
    )
    assert fc.numbers_in(fc.without_exempt(real, quotes=())) == []


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


# rv-rework3-022's B-6: F3's words are one sentence, after "Against my promise that a visitor's conversation isn't
# saved:" in row F3, on the checker's fixed list; R5 reads no other part of the row, as F3's words or through a cited
# disclosure. The disclosure's other rows are a cited file's text as before.
F3_CLAUSES = [
    "The model is Claude Haiku 5.5, `claude-haiku-5-5`.",
    "A request its safety systems flag can be kept up to 2 years.",
    "and `GET /v1/models/claude-haiku-5-5` for the health check",
    "What a visitor types is sent as typed.",
]
DISCLOSURE_CITES = [
    None,
    "docs/data-flow-disclosure.md",
    "./docs/data-flow-disclosure.md",
    "docs/adr/../data-flow-disclosure.md",
    "docs/disclosure-link.md",
]
DISCLOSURE_IDS = ["not-cited", "cited", "dot-slash", "climb-back", "a-link"]


def _citing_the_disclosure(repo: Path, source: str | None) -> str:
    (repo / "docs/disclosure-link.md").symlink_to("data-flow-disclosure.md")
    if source is None:
        return GOOD
    return changed(*(s.format(source=source) for s in CARRIED_ROW))


@pytest.mark.parametrize("source", DISCLOSURE_CITES, ids=DISCLOSURE_IDS)
@pytest.mark.parametrize(
    "clause",
    F3_CLAUSES,
    ids=["model-and-version", "years-kept", "health-check", "sent-as-typed"],
)
def test_r5_reads_no_part_of_row_f3_but_his_one_sentence(
    repo: Path, clause: str, source: str | None
) -> None:
    cites = _citing_the_disclosure(repo, source)
    assert run(repo, cites) == []
    bad = changed(
        "- `[?]` The daily summary of the CPU metrics.",
        f'- `[?]` The daily summary of the CPU metrics. The disclosure: "{clause}"',
        cites,
    )
    assert failing(run(repo, bad), "R5", clause[:20]), run(repo, bad)


@pytest.mark.parametrize("source", DISCLOSURE_CITES, ids=DISCLOSURE_IDS)
def test_his_f3_sentence_stands_and_the_disclosures_other_rows_only_when_cited(
    repo: Path, source: str | None
) -> None:
    cites = _citing_the_disclosure(repo, source)
    other_row = "The gateway signs each call."
    bad = changed(
        "- `[?]` The daily summary of the CPU metrics.",
        f'- `[?]` The daily summary of the CPU metrics. The disclosure: "{other_row}"',
        cites,
    )
    assert failing(run(repo, bad), "R5", other_row) is (source is None)
    assert '"this site saves none of it' in cites and run(repo, cites) == []


def test_f3s_words_are_the_checkers_fixed_sentence_verbatim_in_row_f3() -> None:
    marker, sentence = fc.F3_WORDS
    assert marker == "Against my promise that a visitor's conversation isn't saved:"
    assert sentence == (
        "this site saves none of it, and Anthropic may keep a turn it answered for up to 30 days, never for training."
    )
    rows = [
        raw
        for raw in (ROOT / "docs/data-flow-disclosure.md").read_text().splitlines()
        if raw.startswith("| F3 |")
    ]
    assert len(rows) == 1
    assert f"{marker} {sentence}" in rows[0]
    assert fc.read_context(ROOT).f3 == sentence


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
IN_PART_ROW = (
    "| The meter #1 | `src/sign.md` |",
    "| The meter #1 | `src/sign.md`, `{source}` |",
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


# rv-rework3-022's B-7: a glob (`*`, `?`, `[`) is a repository source only if something matches and every match
# resolves inside the root, on every row, carried, in part, or left out. The checkout's `docs/outside.txt` links to a
# file outside, and `docs/ext` to a directory outside.
@pytest.mark.parametrize(
    ("row_old", "row_new"),
    [CARRIED_ROW, IN_PART_ROW, LEFT_OUT_ROW],
    ids=["carried", "in-part", "left-out"],
)
@pytest.mark.parametrize(
    "glob",
    [
        # The review's three, each matching only the link out.
        "docs/out?ide.txt",
        "docs/outsid[e].txt",
        "docs/outside*",
        # Siblings: a glob through the directory link out, one matching files inside and the link out, one matching
        # nothing, and a `?` in a directory segment.
        "docs/ext/*.txt",
        "docs/*",
        "docs/nothing-*.md",
        "doc?/outside.txt",
    ],
)
def test_a_glob_with_a_match_outside_or_none_inside_fails_r1_on_every_row(
    checkout: Path, row_old: str, row_new: str, glob: str
) -> None:
    problems = run(checkout, changed(row_old, row_new.format(source=glob)))
    assert failing(problems, "R1", f"`{glob}`", "isn't in the repository"), problems


@pytest.mark.parametrize(
    ("row_old", "row_new"),
    [CARRIED_ROW, IN_PART_ROW, LEFT_OUT_ROW],
    ids=["carried", "in-part", "left-out"],
)
def test_a_glob_every_match_of_which_is_inside_is_a_source(
    checkout: Path, row_old: str, row_new: str
) -> None:
    assert run(checkout, changed(row_old, row_new.format(source="docs/adr/*.md"))) == []


def test_a_glob_is_read_against_the_root_through_a_link_to_it(checkout: Path) -> None:
    # The scratch root given through a link: a match inside is inside, the link out is still out.
    linked = checkout.parent / "linked-root"
    linked.symlink_to(checkout, target_is_directory=True)
    inside = changed(*(s.format(source="docs/adr/*.md") for s in LEFT_OUT_ROW))
    assert run(linked, inside) == []
    out = changed(*(s.format(source="docs/outside*") for s in LEFT_OUT_ROW))
    assert failing(run(linked, out), "R1", "`docs/outside*`", "isn't in the repository")


# rv-rework3-022's B-4 (page Q217, the recommended answer): R5 reads only carried and in-part rows' sources, never the
# proposal being checked (by where its path resolves), and no file under films/, corpus/proposals/,
# docs/merge-requests/, specs/, or intent/: the agents' own notes, drafts, and plans, not a source's text.
NOTE_TEXT = "It caps at five dollars a day, the note says.\n"
EXCLUDED_FILES = (
    "docs/merge-requests/2026-11-14-night-stack.md",
    "corpus/proposals/other-2026-11-14.md",
    "specs/022-x/spec.md",
    "intent/022-x.md",
    "films/meter/notes.md",
)


@pytest.fixture
def trees(repo: Path) -> Path:
    """The fixture repository with the amount's sentence in a file under each excluded tree and in a plain file, and
    links inside the root: to a spec, to the merge-request directory, and to the proposal."""
    for rel in (*EXCLUDED_FILES, "docs/plain-notes.md"):
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(NOTE_TEXT)
    (repo / "docs/spec-link.md").symlink_to("../specs/022-x/spec.md")
    (repo / "docs/mr-link").symlink_to("merge-requests", target_is_directory=True)
    (repo / "docs/self-link.md").symlink_to("../proposal.md")
    return repo


@pytest.mark.parametrize(
    ("row_old", "row_new"),
    [CARRIED_ROW, IN_PART_ROW, LEFT_OUT_ROW],
    ids=["carried", "in-part", "left-out"],
)
@pytest.mark.parametrize(
    "source",
    [
        # The review's: the night stack note, and the proposal citing itself.
        "docs/merge-requests/2026-11-14-night-stack.md",
        "proposal.md",
        # One per excluded tree.
        "corpus/proposals/other-2026-11-14.md",
        "specs/022-x/spec.md",
        "intent/022-x.md",
        "films/meter/notes.md",
        # Siblings of other spellings: a leading ./, a climb back in, a link to a file in a tree, a link to a tree's
        # directory, and the proposal by another spelling and through a link.
        "./specs/022-x/spec.md",
        "docs/adr/../../intent/022-x.md",
        "docs/spec-link.md",
        "docs/mr-link/2026-11-14-night-stack.md",
        "./proposal.md",
        "docs/../proposal.md",
        "docs/self-link.md",
    ],
)
def test_r5_reads_no_excluded_tree_and_not_the_proposal_itself(
    trees: Path, row_old: str, row_new: str, source: str
) -> None:
    cites = changed(row_old, row_new.format(source=source))
    assert run(trees, cites) == []
    bad = changed(
        "- `[?]` The daily summary of the CPU metrics.",
        f'- `[?]` The daily summary of the CPU metrics. The note says "{OUTSIDE_QUOTE}"',
        cites,
    )
    problems = run(trees, bad)
    assert failing(problems, "R5", OUTSIDE_QUOTE[:20]), problems
    assert failing(problems, "R4", "currency"), problems


@pytest.mark.parametrize(
    ("row_old", "row_new", "quotable"),
    [(*CARRIED_ROW, True), (*IN_PART_ROW, True), (*LEFT_OUT_ROW, False)],
    ids=["carried", "in-part", "left-out"],
)
def test_r5_reads_a_plain_file_only_from_a_carried_or_in_part_row(
    trees: Path, row_old: str, row_new: str, quotable: bool
) -> None:
    # B-4: a left-out row's source backs no quote; a carried or in-part row's plain file still does.
    cites = changed(row_old, row_new.format(source="docs/plain-notes.md"))
    assert run(trees, cites) == []
    quote = "the note says"
    bad = changed(
        "- `[?]` The daily summary of the CPU metrics.",
        f'- `[?]` The daily summary of the CPU metrics. The note: "{quote}".',
        cites,
    )
    assert failing(run(trees, bad), "R5", quote) is not quotable, run(trees, bad)


# rv-rework4-022's F-2 (page Q233, the recommended answer): a quote is accepted, and so exempt, only if it is found in
# its source on word boundaries (no word character, and no number glued on by `.`, `,`, `:`, `/`, `-`, or an
# apostrophe, on either side) and holds at least one word that isn't a number; a quote of numbers alone reads its
# numbers. `docs/counts.md` is cited by a carried row.
COUNTS = (
    "It allows 100 requests a day and keeps logs 30 days; a thousand visitors came. It runs Haiku 5.5, step 2,000, "
    "and a hundred cases; five-hundred runs; 5k calls; twenty-one tests. It allows 1000 calls.\n"
)


@pytest.mark.parametrize(
    ("added", "quote", "needle"),
    [
        # The review's four.
        ('"5" dollars a day', "5", "'5'"),
        ('"100" requests a day', "100", "'100'"),
        ('"30" days', "30", "'30'"),
        ('"thousand" visitors', "thousand", "'thousand'"),
        # Siblings: curly quotes, an article with a number, a hyphenated number, digits with a letter, number words,
        # a number with its punctuation, a substring of a longer number, and a quote cut from a decimal and from a
        # number with a thousands separator.
        ("“100” requests a day", "100", "'100'"),
        ('"a hundred" cases', "a hundred", "'hundred'"),
        ('"five-hundred" runs', "five-hundred", "'five'"),
        ('"5k" calls', "5k", "'5'"),
        ('"twenty-one" tests', "twenty-one", "'twenty'"),
        ('"100 requests a day" and "30" days', "30", "'30'"),
        ('"30;" days', "30;", "'30'"),
        ('"10" requests', "10", "'10'"),
        ('"It runs Haiku 5" now', "It runs Haiku 5", "'5'"),
        ('"step 2" of many', "step 2", "'2'"),
    ],
    ids=[
        "five",
        "a-hundred-digits",
        "thirty",
        "thousand",
        "curly",
        "a-hundred-words",
        "hyphenated",
        "five-k",
        "twenty-one",
        "beside-an-accepted-quote",
        "with-punctuation",
        "a-substring",
        "cut-from-a-decimal",
        "cut-from-a-separated-number",
    ],
)
def test_a_quote_of_numbers_alone_or_off_word_boundaries_reads_its_numbers(
    repo: Path, added: str, quote: str, needle: str
) -> None:
    (repo / "docs/counts.md").write_text(COUNTS)
    cites = changed(*(s.format(source="docs/counts.md") for s in CARRIED_ROW))
    assert run(repo, cites) == []
    problems = run(repo, changed(GAP, f"{GAP} {added}", cites))
    assert failing(problems, "R5", f"“{quote}”"), problems
    assert failing(problems, "R4", "number", needle), problems


def test_a_quote_with_a_word_found_on_word_boundaries_stands(repo: Path) -> None:
    # The control: a phrase from the cited file, its numbers inside it, stands, and R4 reads none of them.
    (repo / "docs/counts.md").write_text(COUNTS)
    cites = changed(*(s.format(source="docs/counts.md") for s in CARRIED_ROW))
    good = '"It allows 100 requests a day" and "keeps logs 30 days" and "It runs Haiku 5.5"'
    assert run(repo, changed(GAP, f"{GAP} {good}", cites)) == []


# rv-rework4-022's F-4 (page Q235, the recommended answer): scripts/corpus/ holds the checker and its tests, whose
# fixtures and patterns quote amounts and numbers; R5 reads no file there, by any spelling or link.
CHECKER_FILES = {
    "scripts/corpus/test_film_claims.py": "A request its safety systems flag can be kept up to 2 years.\n",
    "scripts/corpus/film_claims.py": 'NUMBER_WORDS = "a hundred|hundred"  # Exit 0 when clean\n',
}


@pytest.mark.parametrize(
    ("row_old", "row_new"), [CARRIED_ROW, IN_PART_ROW], ids=["carried", "in-part"]
)
@pytest.mark.parametrize(
    ("source", "quote", "needle"),
    [
        # The review's two.
        ("scripts/corpus/test_film_claims.py", "kept up to 2 years", "'2'"),
        ("scripts/corpus/film_claims.py", "a hundred", "'hundred'"),
        # Siblings: a quote with words, a leading ./, a climb back in, a link to the file, a link to the directory.
        ("scripts/corpus/film_claims.py", "Exit 0 when clean", "'0'"),
        ("./scripts/corpus/test_film_claims.py", "kept up to 2 years", "'2'"),
        ("scripts/corpus/../corpus/film_claims.py", "Exit 0 when clean", "'0'"),
        ("docs/checker-link.py", "Exit 0 when clean", "'0'"),
        ("docs/checker-dir/test_film_claims.py", "kept up to 2 years", "'2'"),
    ],
    ids=[
        "test-file",
        "checker",
        "checker-words",
        "dot-slash",
        "climb-back",
        "a-link",
        "a-directory-link",
    ],
)
def test_r5_reads_no_file_under_scripts_corpus(
    repo: Path, row_old: str, row_new: str, source: str, quote: str, needle: str
) -> None:
    for rel, text in CHECKER_FILES.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)
    (repo / "docs/checker-link.py").symlink_to("../scripts/corpus/film_claims.py")
    (repo / "docs/checker-dir").symlink_to(
        "../scripts/corpus", target_is_directory=True
    )
    cites = changed(row_old, row_new.format(source=source))
    assert run(repo, cites) == []
    problems = run(repo, changed(GAP, f'{GAP} It says "{quote}".', cites))
    assert failing(problems, "R5", quote), problems
    assert failing(problems, "R4", "number", needle), problems


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


REAL_GAP = (
    "- `[?]` A daily summary of the stack's CPU metrics, with alerts based on them."
)
REAL_CARRIED = "| The cost meter #1 | `apps/web/src/room/faces/neon.ts` |"


def real_with(tmp_path: Path, added: str, source: str | None = None) -> list[str]:
    """A copy of the real proposal, outside the root, with text added to its first gap line and a source added to
    `SCRIPTS.md` §1 line 1's carried row, checked against this repository."""
    text = changed(REAL_GAP, f"{REAL_GAP} {added}", PROPOSAL.read_text())
    if source is not None:
        text = changed(
            REAL_CARRIED, REAL_CARRIED.replace("` |", f"`, `{source}` |"), text
        )
    copy = tmp_path / "probe.md"
    copy.write_text(text)
    return fc.check(copy)


@pytest.mark.parametrize(
    ("source", "quote", "needle"),
    [
        ("scripts/corpus/test_film_claims.py", "kept up to 2 years", "'2'"),
        ("scripts/corpus/film_claims.py", "Exit 0 when clean", "'0'"),
    ],
    ids=["test-file", "checker"],
)
def test_r5_reads_no_file_under_scripts_corpus_in_this_repository(
    tmp_path: Path, source: str, quote: str, needle: str
) -> None:
    assert real_with(tmp_path, "", source) == []
    problems = real_with(tmp_path, f'It says "{quote}".', source)
    assert failing(problems, "R5", quote), problems
    assert failing(problems, "R4", "number", needle), problems


@pytest.mark.parametrize(
    ("added", "quote", "needle"),
    [
        ('"5" dollars a day', "5", "'5'"),
        ('"100" requests a day', "100", "'100'"),
        ('"30" days', "30", "'30'"),
        ('"thousand" visitors', "thousand", "'thousand'"),
        ('"a hundred" cases', "a hundred", "'hundred'"),
    ],
    ids=["five", "a-hundred-digits", "thirty", "thousand", "a-hundred-words"],
)
def test_a_quote_of_numbers_alone_reads_its_numbers_in_this_repository(
    tmp_path: Path, added: str, quote: str, needle: str
) -> None:
    problems = real_with(tmp_path, added)
    assert failing(problems, "R5", f"“{quote}”"), problems
    assert failing(problems, "R4", "number", needle), problems


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
