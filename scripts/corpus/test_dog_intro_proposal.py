"""Tests for scripts/corpus/dog_intro_proposal.py (spec 026, FR-017 to FR-023, SC-005's first half; plan.md R-13;
tasks.md T017; as amended (Q292), patch2-026).

The checker reads the dog-intro proposal and its patch, read-only, and refuses: a quoted span not found verbatim in its
named source (his consent read from main's spec 017, here a fixture copy, refused when it differs by a character); the
slot `hobbies.room_dog_name` in any form, in the patch or proposed in the proposal (dropped, Q292); a `<his answer>` or
`<his disclosure line>` placeholder in the patch; a
Golden answer not found verbatim inside a quotation on an "Answered:" line of the page's entry, or found only on its
"Recommended:" line or on an "Answered: recommended" line (Q143); a digit the patch adds outside a slot, a claim tag's
date, a Golden item's leading number, or a quoted span found verbatim in its named source (N-2); a touched human-only
path or `corpus/` file other than `04` (its facts file too, since Q292); and a patch reported buildable with no approval of the dog's
model carrying a line (FR-019). Every file here is made up at run time in a temporary directory.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "corpus" / "dog_intro_proposal.py"

CONSENT = "it's okay that we use the likeness of my dog"
ORDER = (
    "- The night's work, **the Author's words**: \"Okay, we want the night-shift ... and provide you photos of my dog "
    "to model and it's okay that we use the likeness of my dog.\"\n"
)
LINE = "The room's dog is an AI-made likeness of the Author's dog, made from 4 photos he chose."
FILE_04 = """# Hobbies and travel

Tags as defined in `01-ai-strategy-and-cht.md`. His interview of 2026-11-06 is his statement. In the room, the snowboard and the bicycle open this topic, and the snowboard leads with winter.

## Arya

- `[A 2026-11-06]` His dog, in his words: "Arya is a Nova Scotia Duck Tolling Retriever."

## Do not claim

None named for this topic: asked whether there was anything, he said "No" `[A 2026-11-06]`.

## Golden Q&A

1. *Where do you snowboard?* — We live in a city house in Denver. [A]
"""
FACTS = """topic: 04-hobbies-and-travel
facts:
  - id: hobbies.arya_age
    label: Arya's age in years
    value: "13"
    tag: A
    source: "The Author"
    public_safe: true
    phrasing: "{value}"
"""
PAGE = """# The night of 2026-11-14

## Questions
### Q171: What does the twin say when asked "Who's the dog in the room?"?
Blocks: patch 026 · Recommended: "That's a likeness of my dog." · Others: leave it out
Answered: recommended, the Author 2026-11-14 (the orders file's rule: "the recommended answer stands").

### Q172: What does the twin say when asked "Who's the dog in the room?", in his words?
Blocks: patch 026 · Recommended: "That's a likeness of my dog." · Others: leave it out
Answered: the Author 2026-11-15, in his words: "She's my dog Arya, as the studio made her." That is his answer.
"""


def approval(
    path: str = "assets/visitors/dog/dog.glb", line: str | None = LINE
) -> dict:
    return {
        "id": "A-20261115-dog",
        "path_when_approved": path,
        "kind": "visitor",
        "disclosure_line": line,
    }


def make_root(tmp: Path, approvals: list[dict] | None = None) -> Path:
    root = tmp / "repo"
    (root / "corpus" / "facts").mkdir(parents=True)
    (root / "corpus" / "04-hobbies-and-travel.md").write_text(FILE_04)
    (root / "corpus" / "facts" / "hobbies-and-travel.yaml").write_text(FACTS)
    (root / "assets" / "policy").mkdir(parents=True)
    body = {
        "schema": 1,
        "approvals": approvals if approvals is not None else [approval()],
    }
    (root / "assets" / "policy" / "approvals.json").write_text(
        json.dumps(body, indent=2) + "\n"
    )
    main = tmp / "main" / "specs" / "017-the-night-shift"
    main.mkdir(parents=True)
    (main / "spec.md").write_text("# Spec 017\n" + ORDER)
    (tmp / "page.md").write_text(PAGE)
    return root


def run(tmp: Path, *args: str) -> subprocess.CompletedProcess[str]:
    root = tmp / "repo"
    return subprocess.run(
        [
            sys.executable,
            "-I",
            str(SCRIPT),
            "--root",
            str(root),
            "--main-dir",
            str(tmp / "main"),
            *args,
        ],
        capture_output=True,
        text=True,
        check=False,
    )


# The proposal ---------------------------------------------------------------------------------------------------------

SOURCES_TABLE = """# Proposal: the dog in the room

## Sources

| Line | His words | Source |
|---|---|---|
| The dog in the room | "{consent}" | `main:specs/017-the-night-shift/spec.md`, his order of 2026-11-13 |
| The framing kept | "None named for this topic:" | `corpus/04-hobbies-and-travel.md`, the file's words |
| The disclosure | "{line}" | `assets/policy/approvals.json`, his approval's `disclosure_line` |
| The "Do not claim" line | the spec's reading | — |
"""


def proposal(
    tmp: Path,
    consent: str = CONSENT,
    line: str = LINE,
    framing: str = "None named for this topic:",
) -> Path:
    text = SOURCES_TABLE.format(consent=consent, line=line).replace(
        "None named for this topic:", framing
    )
    path = tmp / "proposal.md"
    path.write_text(text)
    return path


def test_proposal_passes_with_every_span_found(tmp_path: Path) -> None:
    make_root(tmp_path)
    r = run(tmp_path, "proposal", str(proposal(tmp_path)))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "OK" in r.stdout
    assert "buildable: yes" in r.stdout


def test_proposal_refuses_a_span_not_found_verbatim(tmp_path: Path) -> None:
    make_root(tmp_path)
    r = run(
        tmp_path,
        "proposal",
        str(proposal(tmp_path, framing="None named by him for this topic:")),
    )
    assert r.returncode == 1
    assert "None named by him for this topic:" in r.stdout
    assert "corpus/04-hobbies-and-travel.md" in r.stdout


def test_proposal_refuses_his_consent_off_by_one_character(tmp_path: Path) -> None:
    make_root(tmp_path)
    r = run(
        tmp_path,
        "proposal",
        str(proposal(tmp_path, consent="it's ok that we use the likeness of my dog")),
    )
    assert r.returncode == 1
    assert "main:specs/017-the-night-shift/spec.md" in r.stdout
    r = run(
        tmp_path,
        "proposal",
        str(
            proposal(tmp_path, consent="it's okay that we use the likeness of my dog.")
        ),
    )
    assert r.returncode == 0, r.stdout


def test_proposal_reports_not_buildable_without_the_approval(tmp_path: Path) -> None:
    make_root(tmp_path, approvals=[])
    # The disclosure's span has no source yet: the proposal says so, and the checker reports the patch unbuildable.
    text = proposal(tmp_path).read_text().replace(f'"{LINE}"', "the spec's reading")
    path = tmp_path / "proposal.md"
    path.write_text(text)
    r = run(tmp_path, "proposal", str(path))
    assert r.returncode == 0, r.stdout
    assert "buildable: no" in r.stdout
    assert "FR-019" in r.stdout


def test_never_reads_the_private_intake(tmp_path: Path) -> None:
    make_root(tmp_path)
    private = tmp_path / "repo" / "corpus" / "intake" / "private"
    private.mkdir(parents=True)
    (private / "notes.md").write_text(CONSENT)
    text = SOURCES_TABLE.format(consent=CONSENT, line=LINE).replace(
        "`main:specs/017-the-night-shift/spec.md`", "`corpus/intake/private/notes.md`"
    )
    path = tmp_path / "proposal.md"
    path.write_text(text)
    r = run(tmp_path, "proposal", str(path))
    assert r.returncode == 1
    assert "private" in r.stdout


# The patch ------------------------------------------------------------------------------------------------------------

ARYA_ADD = f'+- `[A 2026-11-13]` The dog in the room, in his words: "{CONSENT}". `[A 2026-11-15]` In his words: "{LINE}".\n'
#: The slot as impl-026 to patch-026 built it, null; the rework drops it (Q292), so the patch refuses it in any form.
SLOT_REF = "{{slot:hobbies.room_dog_name}}"
FACTS_DIFF = """diff --git a/corpus/facts/hobbies-and-travel.yaml b/corpus/facts/hobbies-and-travel.yaml
--- a/corpus/facts/hobbies-and-travel.yaml
+++ b/corpus/facts/hobbies-and-travel.yaml
@@ -8,1 +8,8 @@
     phrasing: "{{value}}"
+  - id: hobbies.room_dog_name
+    label: The name of his dog that the room's dog is a likeness of
+    value: {value}
+    tag: null
+    source: null
+    public_safe: null
+    phrasing: " It is a likeness of {{value}}."
"""


def patch_text(
    arya: str = ARYA_ADD,
    golden: str | None = None,
    lead_new: str = "the snowboard, the bicycle, and the dog (its desk sign, and the room's dog figure) open this topic",
    extra: str = "",
) -> str:
    lead_old = "the snowboard and the bicycle open this topic"
    old4 = (
        "Tags as defined in `01-ai-strategy-and-cht.md`. His interview of 2026-11-06 is his statement. In the room, "
        f"{lead_old}, and the snowboard leads with winter."
    )
    new4 = old4.replace(lead_old, lead_new)
    gold = f"+{golden}\n" if golden else ""
    return (
        "diff --git a/corpus/04-hobbies-and-travel.md b/corpus/04-hobbies-and-travel.md\n"
        "--- a/corpus/04-hobbies-and-travel.md\n"
        "+++ b/corpus/04-hobbies-and-travel.md\n"
        "@@ -1,9 +1,10 @@\n"
        " # Hobbies and travel\n"
        " \n"
        f"-{old4}\n"
        f"+{new4}\n"
        " \n"
        " ## Arya\n"
        " \n"
        ' - `[A 2026-11-06]` His dog, in his words: "Arya is a Nova Scotia Duck Tolling Retriever."\n'
        f"{arya}"
        "@@ -14,3 +15,4 @@\n"
        " ## Golden Q&A\n"
        " \n"
        " 1. *Where do you snowboard?* — We live in a city house in Denver. [A]\n"
        f"{gold}"
        f"{extra}"
    )


def write_patch(tmp: Path, text: str) -> Path:
    path = tmp / "dog-intro.patch"
    path.write_text(text)
    return path


def patch(tmp: Path, text: str, *more: str) -> subprocess.CompletedProcess[str]:
    return run(
        tmp, "patch", str(write_patch(tmp, text)), "--page", str(tmp / "page.md"), *more
    )


def test_patch_passes_with_no_slot_and_no_golden_answer(tmp_path: Path) -> None:
    # As amended (Q292): the patch touches `04` only, with no slot and no facts file.
    make_root(tmp_path)
    r = patch(tmp_path, patch_text())
    assert r.returncode == 0, r.stdout + r.stderr
    assert "buildable: yes" in r.stdout


def test_patch_refuses_the_dropped_slot_in_any_form(tmp_path: Path) -> None:
    # Q292: the slot `hobbies.room_dog_name` is dropped. Null or filled in the facts file, or referenced in `04`, the
    # patch is refused, and the refusal names it.
    make_root(tmp_path)
    for text in (
        patch_text(extra=FACTS_DIFF.format(value="null")),
        patch_text(extra=FACTS_DIFF.format(value='"Arya"')),
        patch_text(arya=ARYA_ADD.replace(".\n", f".{SLOT_REF}\n")),
    ):
        r = patch(tmp_path, text)
        assert r.returncode == 1, text
        assert "hobbies.room_dog_name" in r.stdout
        assert "Q292" in r.stdout


def test_patch_refuses_touching_the_facts_file(tmp_path: Path) -> None:
    # Q292: with the slot dropped, the patch has no reason to touch `04`'s facts file.
    make_root(tmp_path)
    path = "corpus/facts/hobbies-and-travel.yaml"
    extra = f"diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -1,1 +1,1 @@\n-a\n+b\n"
    r = patch(tmp_path, patch_text(extra=extra))
    assert r.returncode == 1
    assert path in r.stdout


def test_patch_refuses_each_placeholder(tmp_path: Path) -> None:
    make_root(tmp_path)
    for placeholder in ("<his answer>", "<his disclosure line>"):
        arya = ARYA_ADD.replace(LINE, placeholder)
        r = patch(tmp_path, patch_text(arya=arya))
        assert r.returncode == 1, placeholder
        assert placeholder in r.stdout


def test_patch_refuses_a_golden_answer_only_recommended(tmp_path: Path) -> None:
    make_root(tmp_path)
    golden = "9. *Who's the dog in the room?* — That's a likeness of my dog. [A]"
    # Q171: the answer is quoted on its "Recommended:" line, and its "Answered:" line reads "Answered: recommended".
    r = patch(tmp_path, patch_text(golden=golden), "--entry", "Q171")
    assert r.returncode == 1
    assert "Q171" in r.stdout
    # Q172 holds his own words, but not these.
    r = patch(tmp_path, patch_text(golden=golden), "--entry", "Q172")
    assert r.returncode == 1


def test_patch_refuses_a_golden_answer_from_the_rule_quoted_on_a_recommended_line(
    tmp_path: Path,
) -> None:
    make_root(tmp_path)
    golden = "9. *Who's the dog in the room?* — the recommended answer stands [A]"
    r = patch(tmp_path, patch_text(golden=golden), "--entry", "Q171")
    assert r.returncode == 1


def test_patch_accepts_a_golden_answer_in_his_own_words(tmp_path: Path) -> None:
    make_root(tmp_path)
    golden = "9. *Who's the dog in the room?* — She's my dog Arya, as the studio made her. [A]"
    r = patch(tmp_path, patch_text(golden=golden), "--entry", "Q172")
    assert r.returncode == 0, r.stdout


def test_patch_refuses_a_golden_answer_with_no_page_entry(tmp_path: Path) -> None:
    make_root(tmp_path)
    golden = "9. *Who's the dog in the room?* — She's my dog Arya, as the studio made her. [A]"
    r = patch(tmp_path, patch_text(golden=golden))
    assert r.returncode == 1
    assert "Golden" in r.stdout


def test_patch_digit_rule_accepts_its_exemptions(tmp_path: Path) -> None:
    # The approval's line holds a digit ("4 photos"), quoted and found verbatim in approvals.json; the tags' dates; the
    # Golden item's leading number; and the line's old digits (`01-…`, 2026-11-06), which the patch doesn't add.
    make_root(tmp_path)
    golden = "9. *Who's the dog in the room?* — She's my dog Arya, as the studio made her. [A]"
    r = patch(tmp_path, patch_text(golden=golden), "--entry", "Q172")
    assert r.returncode == 0, r.stdout


def test_patch_digit_rule_refuses_a_stray_digit(tmp_path: Path) -> None:
    make_root(tmp_path)
    for arya in (
        # The same digit outside the quotation.
        ARYA_ADD.replace("In his words:", "From 4 photos, in his words:"),
        # A quotation not found in its source.
        ARYA_ADD.replace(LINE, LINE.replace("4 photos", "5 photos")),
    ):
        r = patch(tmp_path, patch_text(arya=arya))
        assert r.returncode == 1, arya
        assert "digit" in r.stdout
    r = patch(
        tmp_path,
        patch_text(
            lead_new="the snowboard, the bicycle, and the dog (its desk sign, and the room's 3D dog) open this topic"
        ),
    )
    assert r.returncode == 1
    assert "digit" in r.stdout


def test_patch_refuses_touching_a_human_only_path_or_another_corpus_file(
    tmp_path: Path,
) -> None:
    make_root(tmp_path)
    for path in (
        "config/twin-readiness.yaml",
        ".claude/settings.json",
        "CLAUDE.md",
        "REVIEW.md",
        ".specify/memory/constitution.md",
        "tools/gates/gate",
        # The paths impl-026 added to FR-023's list (plan R-13, As built), untested until rework-026 (N-4).
        "evals/agent-config/cases.yaml",
        "redteam/forbidden-actions.sh",
        "assets/policy/approvals.json",
        "assets/visitors/dog/dog.glb",
        "corpus/00-profile.md",
        "corpus/facts/denver-local-ai.yaml",
    ):
        extra = f"diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -1,1 +1,1 @@\n-a\n+b\n"
        r = patch(tmp_path, patch_text(extra=extra))
        assert r.returncode == 1, path
        assert path in r.stdout
    # The regenerated files it carries are fine.
    extra = "diff --git a/config/twin/corpus.json b/config/twin/corpus.json\n--- a/config/twin/corpus.json\n+++ b/config/twin/corpus.json\n@@ -1,1 +1,1 @@\n-a\n+b\n"
    r = patch(tmp_path, patch_text(extra=extra))
    assert r.returncode == 0, r.stdout


def test_patch_refuses_to_report_buildable_without_the_dogs_approval(
    tmp_path: Path,
) -> None:
    for approvals in (
        [],
        [approval(line=None)],
        [approval(line="")],
        [approval(path="assets/visitors/dog/dog-idle.glb")],
        [approval(path="assets/twin/twin.glb")],
    ):
        make_root(tmp_path / str(len(list(tmp_path.iterdir()))), approvals=approvals)
    for sub in sorted(p for p in tmp_path.iterdir() if p.is_dir()):
        r = patch(sub, patch_text())
        assert r.returncode == 1, sub
        assert "FR-019" in r.stdout


def test_is_deterministic(tmp_path: Path) -> None:
    make_root(tmp_path)
    one = patch(tmp_path, patch_text(extra=FACTS_DIFF.format(value='"x"')))
    two = patch(tmp_path, patch_text(extra=FACTS_DIFF.format(value='"x"')))
    assert one.stdout == two.stdout


# rv-impl-026's B-1 (FR-023, Q143), and its class -----------------------------------------------------------------------
#
# A quoted span exempts its digits only where it is the dog's approval's `disclosure_line` itself, or lies inside his
# consent's own sentence in main's spec 017 (line 48): not another approval's line, not elsewhere in spec 017, and not a
# bare fragment of the dog's line. An "Answered:" line holding "recommended" in any case or spelling never fills Golden
# Q&A 9. An empty Golden Q&A 9 answer, or one with no word in it, matches nothing. A Golden item the checker can't read
# in Golden Q&A 9's one form is refused, not skipped.

TWIN_LINE = "The room's twin is an AI-made likeness of the Author, made from 12 photos he chose."
SPEC_017_MORE = (
    "- Rule 3 of his orders: few stacks, one gate; 12 tasks a night at most.\n"
    "- The night's work, **the Author's words**: see line 48.\n"
)


def twin_approval() -> dict:
    return {
        "id": "A-20261020-twin",
        "path_when_approved": "assets/twin/twin.glb",
        "kind": "twin",
        "disclosure_line": TWIN_LINE,
    }


def more_017(tmp: Path) -> None:
    spec = tmp / "main" / "specs" / "017-the-night-shift" / "spec.md"
    spec.write_text(spec.read_text() + SPEC_017_MORE)


def with_quote(quote: str) -> str:
    """The new "## Arya" line with one more quoted span, sourced as his words."""
    return ARYA_ADD.removesuffix("\n") + f' In his words, the count: "{quote}".\n'


def test_b1_a_quote_from_another_approvals_line_exempts_no_digit(
    tmp_path: Path,
) -> None:
    make_root(tmp_path, approvals=[approval(), twin_approval()])
    r = patch(tmp_path, patch_text(arya=with_quote("12 photos")))
    assert r.returncode == 1, r.stdout
    assert "digit" in r.stdout


def test_b1_a_quote_from_spec_017_outside_his_consent_exempts_no_digit(
    tmp_path: Path,
) -> None:
    make_root(tmp_path)
    more_017(tmp_path)
    for quote in ("3", "12", "12 tasks a night at most", "line 48"):
        r = patch(tmp_path, patch_text(arya=with_quote(quote)))
        assert r.returncode == 1, (quote, r.stdout)
        assert "digit" in r.stdout


def test_b1_a_bare_fragment_of_the_dogs_line_exempts_no_digit(tmp_path: Path) -> None:
    make_root(tmp_path)
    for quote in ("4", "4 photos", "made from 4 photos"):
        r = patch(tmp_path, patch_text(arya=with_quote(quote)))
        assert r.returncode == 1, (quote, r.stdout)
        assert "digit" in r.stdout


def test_b1_the_dogs_whole_line_and_his_consent_still_exempt(tmp_path: Path) -> None:
    make_root(tmp_path, approvals=[approval(), twin_approval()])
    more_017(tmp_path)
    r = patch(tmp_path, patch_text())
    assert r.returncode == 0, r.stdout


RECOMMENDED_SPELLINGS = (
    "Answered: Recommended, the Author 2026-11-14:",
    "Answered: RECOMMENDED:",
    "Answered: as recommended, in the Author's words:",
    "Answered: the Author 2026-11-14, as Recommended:",
    "Answered: recomended:",
    "Answered: reccommended:",
    "Answered: the recommendation stands:",
    "answered: recommended:",
    "**Answered:** Recommended:",
)


def page_with(tmp: Path, answered: str) -> None:
    (tmp / "page.md").write_text(
        PAGE
        + '\n### Q173: What does the twin say when asked "Who\'s the dog in the room?"?\n'
        + 'Blocks: patch 026 · Recommended: "That\'s a likeness of my dog." · Others: leave it out\n'
        + f'{answered} "That\'s a likeness of my dog."\n'
    )


def test_b1_an_answered_line_holding_recommended_in_any_spelling_fills_nothing(
    tmp_path: Path,
) -> None:
    make_root(tmp_path)
    golden = "9. *Who's the dog in the room?* — That's a likeness of my dog. [A]"
    for answered in RECOMMENDED_SPELLINGS:
        page_with(tmp_path, answered)
        r = patch(tmp_path, patch_text(golden=golden), "--entry", "Q173")
        assert r.returncode == 1, (answered, r.stdout)
        assert "Golden" in r.stdout, answered


def test_b1_his_own_answered_line_still_fills_it(tmp_path: Path) -> None:
    make_root(tmp_path)
    page_with(tmp_path, "Answered: the Author 2026-11-15, in his words:")
    golden = "9. *Who's the dog in the room?* — That's a likeness of my dog. [A]"
    r = patch(tmp_path, patch_text(golden=golden), "--entry", "Q173")
    assert r.returncode == 0, r.stdout


def test_b1_an_empty_golden_answer_is_refused(tmp_path: Path) -> None:
    make_root(tmp_path)
    for golden in (
        "9. *Who's the dog in the room?* — [A]",
        "9. *Who's the dog in the room?* —  [A]",
        "9. *Who's the dog in the room?* — . [A]",
        "9. *Who's the dog in the room?* — ",
    ):
        r = patch(tmp_path, patch_text(golden=golden), "--entry", "Q172")
        assert r.returncode == 1, (golden, r.stdout)
        assert "Golden" in r.stdout, golden


def test_b1_a_golden_item_in_another_form_is_refused_not_skipped(
    tmp_path: Path,
) -> None:
    make_root(tmp_path)
    for golden in (
        "9. Who's the dog in the room? — That's a likeness of my dog. [A]",
        "9. *Who's the dog in the room?* - That's a likeness of my dog. [A]",
        "9) *Who's the dog in the room?* — That's a likeness of my dog. [A]",
        "  9. *Who's the dog in the room?* -- That's a likeness of my dog.",
        "10. *Who's the dog in the room?* — That's a likeness of my dog. [A]",
    ):
        r = patch(tmp_path, patch_text(golden=golden), "--entry", "Q171")
        assert r.returncode == 1, (golden, r.stdout)
        assert "Golden" in r.stdout, golden


def test_b1_the_proposal_takes_approvals_spans_from_the_dogs_line_only(
    tmp_path: Path,
) -> None:
    make_root(tmp_path, approvals=[approval(), twin_approval()])
    r = run(tmp_path, "proposal", str(proposal(tmp_path, line=TWIN_LINE)))
    assert r.returncode == 1, r.stdout
    assert "assets/policy/approvals.json" in r.stdout


def test_b1_the_proposal_takes_spec_017_spans_from_his_consent_only(
    tmp_path: Path,
) -> None:
    make_root(tmp_path)
    more_017(tmp_path)
    r = run(
        tmp_path,
        "proposal",
        str(
            proposal(tmp_path, consent="few stacks, one gate; 12 tasks a night at most")
        ),
    )
    assert r.returncode == 1, r.stdout
    assert "main:specs/017-the-night-shift/spec.md" in r.stdout


# Q292: the slot is dropped from the proposal too ---------------------------------------------------------------------


def test_proposal_refuses_proposing_the_dropped_slot(tmp_path: Path) -> None:
    # The slot's facts entry, or its reference in a proposed line, is refused (Q292); the proposal may still name the
    # slot in prose, to say it was dropped.
    make_root(tmp_path)
    base = proposal(tmp_path).read_text()
    for block in (
        "```yaml\n  - id: hobbies.room_dog_name\n    value: null\n```\n",
        f'```markdown\n- The dog in the room: "{CONSENT}".{SLOT_REF}\n```\n',
    ):
        path = tmp_path / "proposal.md"
        path.write_text(base + "\n" + block)
        r = run(tmp_path, "proposal", str(path))
        assert r.returncode == 1, (block, r.stdout)
        assert "hobbies.room_dog_name" in r.stdout
        assert "Q292" in r.stdout
    path.write_text(base + "\nThe slot `hobbies.room_dog_name` is dropped (Q292).\n")
    r = run(tmp_path, "proposal", str(path))
    assert r.returncode == 0, r.stdout
