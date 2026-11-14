# Feature Specification: hareet.ai's Corpus from the Film Scripts

**Feature Branch**: `night/spec-022/spec-022` (the spec's branch); implementation later runs on one line, the implementer merging this branch first ([plan.md](plan.md) §6).

**Created**: 2026-11-14

**Status**: Draft, specified and clarified on 2026-11-14 from the draft intent ([`intent/022-corpus-from-film-scripts.md`](../../intent/022-corpus-from-film-scripts.md)). The clarification answers are the recommended ones, taken under the Author's order of 2026-11-13 (Clarifications), each provisional and his to overturn on the morning page. Nothing under `corpus/` is written by this spec or its build: the output is a proposal and a patch for his hand.

**Input**: the intent; `films/SCRIPTS.md` and each film's `script.txt`, `materials.md`; `films/README.md`, `films/BRIEF.md`; `corpus/README.md` (claim tags, role precision, public safety, plug-in numbers); `corpus/08-hareet-ai.md` and `corpus/facts/hareet-ai.yaml`; `corpus/tools/check_corpus.py`; `corpus/proposals/` (the earlier proposals' form); `apps/web/build/twin-pack.ts`; `config/twin/corpus.json`; the constitution's Principles VII and VIII; ADR 0050 and ADR 0030 (the films' licence and mark); `LICENSE`.

Summary: `corpus/08-hareet-ai.md` says little about how hareet.ai is built. The film scripts, written from the repository's own files and approved by the Author, say much more. This spec has an agent write a proposal for the Author's hand: new tagged sections for `08`, the slots for their numbers, new Golden Q&A, new "Do not claim" lines, and the gaps the scripts can't support, with every sentence traceable to a script line and the repository file under it. Nothing is quoted from any film that isn't the project's own.

## Clarifications

### Session 2026-11-14, taken under the Author's order of 2026-11-13

The order's rule 1: "the spec-writer takes the recommended answer at clarify and at the plan". Each answer below is the recommended one, provisional, his to overturn on the morning page; an overturned answer is reworked before he merges. Each is also in `/night/io/out/questions.md`.

- **Q1: What are "film scripts"?** → Taken: the repository's own explainer films' scripts, the seven films `films/README.md` lists (`kill-switch-b2`, `cost-meter`, `data-flows`, `evals`, `local-first`) and `films/SCRIPTS.md` sections 5 and 6 (`stack`, `lifecycle`), that is `SCRIPTS.md` and each of those folders' `script.txt`. Not the comparison cuts (`kill-switch`, `kill-switch-b`, `kill-switch-mix`: "kept for the record, not for the resume"). Others: any third-party screenplay (then reference only, never quoted: FR-012); both. Reading: the item sits beside "re-do PDF resume with links from films", which is these films, and the item names "hareet-ai corpus", which `08` is.
- **Q2: Which script lines may enter?** → Taken: only the lines `SCRIPTS.md` sources to a repository file on `main` or to the Author's own words, and only after he applies the proposal, which is his approval of each. Lines the scripts themselves mark as not built (the daily CPU summary, "Not in the repository yet"; the pull deploys, "Not built on main yet"), as retracted (the earlier "345"), or as a recorded run's result are left out of the corpus text and listed in the proposal's table of left-out lines with the reason (FR-006, FR-007). Others: include them tagged `[?]`; include nothing from sections not yet approved. Reading: `SCRIPTS.md`'s own header says "for the Author's review", and what I read records the Author's approval of the films' language (2026-11-10) but not a per-script approval; a table of the lines, by script, lets him approve or strike each.
- **Q3: How are the facts tagged?** → Taken: a statement about how the system is built is `[P]` with the repository path, as `corpus/README.md` allows ("Enough for facts about systems and organizations; never enough on its own for a claim about the Author's role"); the Author's own quoted words are `[A <date>]`; any number is a facts slot tagged `C` (the Author's approved script, supported by the repository's artifact), `public_safe: true` once he attests it by applying the patch. Others: tag everything `[A-DOC films/SCRIPTS.md]`; leave every number as text (refused by the corpus's own rule that every number is a slot). Reading: Principle VII: nothing in the proposal says what the Author owned beyond what `08` and `01` already rule ("AI agents in named roles do most of the typing, and only I merge").
- **Q4: Which numbers enter?** → Taken: only structural counts that describe the design and that a script gives with its source (the production stack's containers, the cases and their split, the red team's cases), each in a slot whose label carries "as of" and its source; none of the run results (pass rates, a run's cost, the forbidden-action tallies, the latest red-team pass counts), which go stale with the next run and live in `evals/*/history`; and no currency amount of any kind (corpus rule 3: the Haiku prices and a run's cost in cents stay out, and `08`'s existing "Do not claim: any spend, traffic, or cost figure for the site that isn't in a filled slot" holds). Others: include the run results with as-of dates; include none. Reading: the twin's guards check every number against the corpus, so a stale number would be a wrong answer.
- **Q5: Where does it go?** → Taken: into `08-hareet-ai.md` as new sections and into `facts/hareet-ai.yaml` as new slots. No new topic file: a new `NN-` file would need `config/room-topics.yaml`, the grounding pack's code, and the readiness gate to know it. Others: a new `09-how-its-built.md`; a facts file of its own. `08`'s changes also move the resume's lock and the twin's pack and cases (FR-009).
- **Q6: Which of the Author's words from the scripts enter?** → Taken: the two quotes the scripts attribute to him that the corpus doesn't hold, each exactly as `SCRIPTS.md` quotes it: the reason for Haiku, "we chose haiku since our context base is small and manually evaluated haiku and sonnet." (this session, 2026-11-10), and the data-retention wording of row F3 of `docs/data-flow-disclosure.md` ("up to 30 days"), in the disclosure's wording. His 2026-11-10 words about the daily CPU summary stay out until it is built. Others: leave both out; add both and the CPU summary as `[?]`. Reading: the first is a statement about him ("about you" in the script) that no corpus file holds; the proposal asks him to confirm that he said it and wants it public, since a statement tagged `[A 2026-11-10]` must be one.

## Source: The Author's Words

- **His item**, word for word: "5. g) "hareet-ai corpus from film scripts". Corpus changes are proposals in `corpus/proposals/`, for his hand."
  Reading: Q1 to Q6 above; the proposal is the deliverable.
- **How far the night goes**: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over".
  Reading: one proposal and one patch, not several; small tests, run by file (plan §5).
- **The corpus's rule** (`corpus/README.md`): "Humans. Agents may read it and propose changes in `proposals/`". And `CLAUDE.md`: "Editing `corpus/`, or stating a number about the Author that isn't in the corpus or a filled `facts/` slot" is one of the things Claude gets wrong.

## What may be quoted, and what is only referenced

This is the licensing section the Author's item needs; each row is a rule the proposal's checker enforces.

| Source | In the corpus | Why |
|---|---|---|
| The project's own film scripts and their `SCRIPTS.md` | Facts in the corpus's own sentences, each with its source path. Quoted only where the sentence is the Author's. | The repository is MIT-licensed (`LICENSE`: "Copyright (c) 2026 Hareet"); ADR 0050 calls the films code; the narration is a synthetic voice (Kokoro), disclosed in the README and on each landing page. A script line written by an agent is not "the Author's words", so it is never put in quotation marks as his. |
| The Author's own words in a script | Verbatim, in quotation marks, "in his words", with the date. | `CLAUDE.md`: his words are quoted, never paraphrased. |
| The repository's own files the scripts cite (the constitution, ADRs, config) | A short quote where it is the point; otherwise the path. | The same licence. |
| Anthropic's terms, a model maker's or a service's text | Only as the Author wrote it into the disclosure (row F3). Never from the vendor's own page. | Not ours to quote or to restate. |
| Any third-party film script or screenplay (if Q1 turns out to mean those) | Referenced only: a title, a year, and what it is. Not one line quoted, no excerpt, no "in the style of" text. | Copyrighted text. The twin would repeat it to a visitor, and a corpus line is public. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Author Applies One Proposal (Priority: P1)

As the Author, I want a single proposal and a patch, built so that I can read each new line beside the script line and the repository file it came from, and apply it in one commit.

**Why this priority**: it is the item. Everything else in this spec serves it.

**Independent Test**: `pytest scripts/corpus/test_film_claims.py` (plan §5), which checks the proposal's table: each corpus line has a source script line, and each script line is found verbatim in `films/`. Then, on a plain export with the patch applied, `corpus-check` says OK.

**Acceptance Scenarios**:

1. **Given** the proposal, **When** the Author reads a new corpus line, **Then** the proposal's table gives its script, its script line number, and the file under it.
2. **Given** the patch built from plain copies, **When** it is applied to a fresh `git archive` export of `main`, **Then** `git apply --check` and `git apply` are clean, `corpus-check` passes, and the pack, the resume's lock, and the generated cases are current.

---

### User Story 2 - A Visitor Gets Better Answers About How It's Built (Priority: P1)

As a visitor, I want the twin to answer questions about the cost meter, the data flows, the evals, local-first, the stack, and the lifecycle from what the project's own films say, and to say "I don't know yet" where the corpus doesn't.

**Why this priority**: the reason for the item. The degraded side: a visitor's question the corpus doesn't hold still gets "I don't know yet".

**Independent Test**: the new Golden Q&A generate cases in the plain export (`npm run twin:pack`); `pytest evals/test_twin_readiness.py` and the pack's `vitest run apps/web/test/twin-pack.test.ts` pass; each new gap line generates a gap case.

**Acceptance Scenarios**:

1. **Given** a new Golden Q&A about the cost meter, **When** the case runs on the fake adapter, **Then** its `contains` terms are in the answer and its `not_contains` terms (every "Do not claim" line) are not.
2. **Given** a question about a result the corpus leaves out (the latest pass rate, a run's cost), **When** it is asked, **Then** the expected answer is "I don't know yet", from the gap line.

---

### User Story 3 - Nothing Unbuilt or Stale Becomes a Claim (Priority: P1)

As the Author, I want the twin never to state as built what is only planned, and never to state a number that moves.

**Independent Test**: the checker fails on a line that cites a "not built" script line, on a digit outside a slot, and on a currency amount.

**Acceptance Scenarios**:

1. **Given** the CPU-summary line and the pull-deploy line in `SCRIPTS.md`, **When** the checker runs on a proposal that includes them as claims, **Then** it fails; as rows in the left-out table, it passes.
2. **Given** a digit in a proposed sentence outside a `{{slot:…}}`, **Then** the checker names the line and fails.

### Edge Cases

- The Author overturns a clarification answer: the proposal is regenerated for that answer; the checker is unchanged.
- A script is edited after the proposal: the checker compares each cited script line verbatim and fails on a changed one, naming it.
- A line "about you" in a script that no corpus file holds: it stays out unless it is the Author's quoted words (Q6).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The deliverable is `corpus/proposals/film-scripts-2026-11-14.md` (the proposal, for his hand) and a patch built from plain copies of `main`'s files, `docs/merge-requests/2026-11-14-corpus-film-scripts.patch`. No file under `corpus/` outside `proposals/` is written in any worktree. (`CLAUDE.md`.)
- **FR-002**: The proposal adds sections to `corpus/08-hareet-ai.md` for the films' topics: the cost meter, the data flows, the evals and guards, local-first, the stack, and how it's built (the lifecycle). Each sentence carries a claim tag (Q3), and none says what the Author owned beyond `08`'s and `01`'s rulings (Principle VII).
- **FR-003**: Every number is a slot in `corpus/facts/hareet-ai.yaml` with `tag: C`, a source, and `public_safe: true`, and its label carries "as of" and the source path (Q4). No digit stands in corpus Markdown outside a slot, except in product names the corpus already spells with one ("Qwen3") and in the spelled-out numbers' words, which the twin's guards check against the slots.
- **FR-004**: No currency amount (corpus rule 3): the Haiku prices and a run's cost in cents are not carried; the kill switch's daily figure stays the existing slot `site.kill_switch_daily`.
- **FR-005**: The Author's words enter verbatim, in quotation marks, with their date, and only Q6's two quotes (FR-010).
- **FR-006**: A table in the proposal lists, per script, each line carried (with the corpus line it became), and each line left out with the reason: unbuilt, retracted, a recorded run's result, a currency amount, a statement about the Author that no corpus file holds, or a duplicate of what `08` already says.
- **FR-007**: A line that a script marks as unbuilt or retracted is not a claim in the corpus; each becomes a gap line, "[?]", so the twin says "I don't know yet" (the daily CPU summary; the pull deploys; the forbidden-action tally; the current pass rates).
- **FR-008**: New "Do not claim" lines (public-safe; each becomes a refusal case): that the paid fallback's data is kept by this site; that the evals are graded by a model; that the twin is a demo; that the meter is the cloud's bill; and that the Author alone wrote the code (`08`'s Golden Q&A 4 holds: "AI agents in named roles do most of the typing, and only I merge").
- **FR-009**: The patch carries what the corpus change moves, in the same commit, as the earlier patches did: `config/twin/corpus.json` (`npm run twin:pack -w apps/web`), `apps/web/content/resume.lock.json` (`npm run content:lock -w apps/web`, which pins `08`), the new and changed cases in `evals/product/cases/` and `evals/narration/cases/` (a new "Do not claim" line changes every narration case's `not_contains`), each regenerated by the commands, never by hand, in a plain export. The resume itself belongs to the resume item's own spec, not this one; the lock moves only for `08`'s hash.
- **FR-010**: Q6's two quotes are in the proposal as "to confirm", each with the line of `SCRIPTS.md` they come from; the Author's approval of the patch is his confirmation that he said them and wants them public.
- **FR-011**: The proposal is checked by a deterministic script (plan §3), not by a model: it reads the proposal's table and the scripts, never the denylist (it can't read it: `intake/private/` is the Author's), and says so in its summary, as `corpus-check` does.
- **FR-012**: If Q1 turns out to mean third-party screenplays: nothing is quoted. A title, a year, and one line saying what it is. The checker fails any proposed span longer than a title that matches no corpus source.
- **FR-013**: Degraded and failure behavior: if the Author doesn't apply the proposal, `08` and the twin are unchanged; if he applies it partly, `corpus-check`, `twin-pack.test.ts`, and readiness name what is stale. Nothing in this change adds an endpoint, a model call, a byte leaving a device, a span, or a panel; the corpus-to-evals loop (`corpus/README.md`) is the telemetry.

### Key Entities

- **The proposal**: a Markdown file with a table: corpus line, script, script line, repository source, tag.
- **The patch**: a unified diff of `corpus/08-hareet-ai.md`, `corpus/facts/hareet-ai.yaml`, and the regenerated files, built from plain copies.
- **The checker**: `scripts/corpus/film_claims.py`, a read-only script run on the proposal.

## Success Criteria *(mandatory)*

- **SC-001**: The checker passes on the proposal: every carried line has a script line found verbatim, every number is a slot, no currency amount, no unbuilt or retracted line carried, no span from a third-party script. (`pytest scripts/corpus/test_film_claims.py`.)
- **SC-002**: On a fresh plain export of `main` with the patch applied: `git apply` clean; `python3 corpus/tools/check_corpus.py` OK; `vitest run apps/web/test/twin-pack.test.ts` passes; `pytest evals/test_twin_readiness.py` passes.
- **SC-003**: The proposal's left-out table accounts for every numbered line of the scripts in scope: each is carried or left out with a reason. (The checker counts them.)
- **SC-004**: The Author can read the proposal and the patch in one sitting: the table, one patch, one commit.
- **Cost estimate**: none at run time; no model call. The spec-writer, implementer, and reviewer tokens only. The evals run on the fake adapter in `make evals`; his live runs, which score real answers, are his, and the Anthropic route's cost per case is in `config/prices.yaml` (not repeated here).

## Assumptions

- The Author applies the patch by his own hand, on a short branch, then gates and merges (ADR 0017). It is not on `main` before the gate.
- `corpus/proposals/` accepts an agent's write. If this container refuses it, the proposal goes to `docs/merge-requests/2026-11-14-corpus-film-scripts-proposal.md` and the human-patch note says so.
- The generated files regenerate in a plain export, not in a checkout an agent can write to, as the earlier patches did.
- **Deviations from the constitution**: none. Principles VII and VIII are the reason for FR-002, FR-005, and FR-007.

## Open Questions

Q1 to Q6 above, each carried to `/night/io/out/questions.md` with its recommendation.
