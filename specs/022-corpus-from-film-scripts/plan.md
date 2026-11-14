# Plan: hareet.ai's Corpus from the Film Scripts

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His item, in his words: g) "hareet-ai corpus from film scripts". His orders file lists it as item 5 and adds "Corpus changes are proposals in `corpus/proposals/`, for his hand.", which is the file's sentence, not his words; it restates the night's rule 2 ("corpus changes, which are proposals in `corpus/proposals/`"). Each clarification answer (spec.md, Q1 to Q6, with the review's Q95 to Q97 written in) is the recommended one, his to confirm or overturn on the morning page; an overturned answer is reworked before he merges.

Reworked 2026-11-14 after the Opus review rv-spec-022 (blocking): B-1 (§2's seventh row, §3's R1 and R2), B-2 (§3's R4 and R5), B-3 (§2's slots), C-1 to C-6.

Spec: [spec.md](spec.md) · Intent: [`intent/022-corpus-from-film-scripts.md`](../../intent/022-corpus-from-film-scripts.md) (draft) · Constitution: VII (ownership), VIII (the twin speaks only from the corpus), III (a human merges), VI (in the open).

## 1. What gets built

No product code. Three artifacts and one checker:

1. **The proposal**, `corpus/proposals/film-scripts-2026-11-14.md`: the Author's reading guide (what it is, what it carries, what it leaves out), the table of carried and left-out lines (FR-006), the new text for `08`, the one new slot, the new Golden Q&A, the new "Do not claim" and gap lines, Q6's two quotes "to confirm", and the suggested second sentence for Golden Q&A 5 (Q97).
2. **The patch**, `docs/merge-requests/2026-11-14-corpus-film-scripts.patch`: `corpus/08-hareet-ai.md` and `corpus/facts/hareet-ai.yaml`, plus what they move (FR-009): `config/twin/corpus.json`, `apps/web/content/resume.lock.json`, the generated cases. Built from plain copies of `main`'s files (`git show refs/heads/main:<path>`, edited outside any checkout, `diff -u` with `a/`, `b/` labels), verified with `patch -p1 --dry-run` then `patch -p1` on a fresh `git archive` export, regenerated there by `npm run twin:pack -w apps/web` and `npm run content:lock -w apps/web`, and checked there by `npm run content:check -w apps/web`; never `git apply`, never a write into a worktree's `corpus/`.
3. **The human-patch note**, `docs/merge-requests/human-patches/022.md` (path, change, why, whether it is on `main` before the gate), and the branch's merge-request note.
4. **The checker**, `scripts/corpus/film_claims.py` with its test, `scripts/corpus/test_film_claims.py`: reads the proposal's table and `films/`, and fails on the rules in §3. Read-only, no network, no model, no project config; `scripts` is already in the Makefile's `PYTEST_DIRS`.

## 2. The content: how the scripts map to `08`

Sources: `films/SCRIPTS.md` §1 to §6, by their numbered lines (the `script.txt` files of those six films are the narration text of the same scripts; the checker compares them where a section matches), and `films/kill-switch-b2/script.txt`, which `SCRIPTS.md` has no section for, by sentence, with each sentence's repository source from `films/kill-switch-b2/materials.md` (Q1, Q95). The comparison cuts are out. A script line that the films' note changed after his approval (`docs/merge-requests/2026-11-11-feat-015-explainer-films.md:41-48`) is marked so in the table (Q2).

| New `08` section | From | Carries | Leaves out |
|---|---|---|---|
| The kill switch | `films/kill-switch-b2/script.txt` | the gateway reads the kill switch first and, if it can't, assumes the worst; local answers cost nothing; paid ones are metered in the gateway's own database; a warning goes out on Telegram and email before the ceiling; at the ceiling it stops itself, the ceiling as the existing slot `site.kill_switch_daily`; one transaction sets the switch, opens an incident, and queues the alert; every request after that, local ones included, gets one line, quoted from `apps/web/content/messages.yaml:13`; a new day doesn't bring it back, only an operator reset, by a person with a reason in the audit log; the breach test trips it on purpose; no inbound ports, only an outbound tunnel, and only the gateway has a road out; the agents that built it are fenced in: the one that writes never reviews, and none can touch the budgets or the switch, push, merge, or apply | "five dollars a day", "At three fifty", "At five dollars...", "A five-dollar-a-day kill switch" (currency; the daily figure is the slot); "to the millionth of a dollar" (a word-currency form, FR-004); "fifty-two assertions, fifty-two passed" (a run's result: gap line); "And only Hareet runs the final gate." (carried only as `08`'s existing "only I merge": a duplicate); "Built in the open, at hareet dot A I." (a duplicate of `08`) |
| The cost meter | §1 | the sign reads the gateway's reply; every call carries provider, model, tokens, cost; local answers cost nothing; Langfuse inside the stack, locked down; Grafana beside latency and errors; the meter is the control, the cloud bill the safety net | the prices and the run's cost (currency); the meter's unit, "whole micro-dollars" (a word-currency form); the Haiku choice only as Q6's quote |
| Every data flow disclosed | §2 | the disclosure's columns; a service without a row refused; what leaves a device in a conversation and what never does; the guards withhold; the twin answers only from the corpus and says "I don't know yet" | the retention wording here: it goes to Golden Q&A 5's suggested second sentence (Q6, Q97); the eval case counts (moving: gap line) |
| Tested every time it changes | §3 | cases from the corpus, golden and gap, two phrasings; graded by code, never by a model; guards fail closed; each miss becomes a fix; readiness locked to a hash | the case counts and their split, the red team's case count (moving: gap lines, Q96); pass rates, the red team's latest run counts (run results: gap line) |
| Local models first | §4 | the stack runs on one laptop with one command; llama.cpp; local tried first; the paid fallback only when it's down; the EC2 order; production, not a demo; images pinned by digest | the local model's name (a digit in a product name, outside a slot, FR-003); the Medic and Denver Local AI lines (already in `01` and `07`: a pointer, not a copy) |
| The stack, container by container | §5 | prod's containers, as the one slot (fifteen, `deploy/compose.yaml`); the door, the brain, the model, the eyes, the traces; what each does and what happens when it fails; every alert names its runbook | Langfuse's "six containers" and the drops' "ten minutes" (numbers beyond the one slot); the daily CPU summary (unbuilt: gap line) |
| How it's built | §6 | intent, spec, plan, tasks, analyze, implement, review by an agent that didn't write it, the clean-room gate, a human merge; a bug starts as a failing test; incidents get a note | the pull deploys (unbuilt: gap line); the forbidden-action tally; "hundreds" stays out too (a number word) |

Rules for every sentence: the corpus's third person, "he" and "his"; the ownership verbs of `01`; "we" expanded to who; each line tagged (`[P]` with the file's URL under `https://github.com/hareet/h4reet-ai` for the system, `[A <date>]` for his quoted words, `[?]` for a gap); no number outside a `{{slot:…}}` (FR-003, with its exempt spans). The new Golden Q&A (about nine, one per section and two on "what don't you know?") follow `08`'s form: the question italic, the answer in the corpus's words, `[A]` only where it is his. A Golden Q&A answer that isn't his words is tagged `[P]`, not `[A]`.

Golden Q&A 5 (Q97): the proposal suggests, after his existing answer and leaving it unchanged, a second sentence in his F3 words of 2026-11-09, quoted exactly from `docs/data-flow-disclosure.md` row F3: "this site saves none of it, and Anthropic may keep a turn it answered for up to 30 days, never for training", tagged `[A 2026-11-09]`. Its lower-case first letter is his text's; the proposal says so, and a capital is his edit to make. "your conversation is not saved" stays in `08` as `twin-pack.ts`'s `PRIVACY_SPANS` requires.

Slots (Q4, Q96): one new slot, `site.prod_containers`: `value: 15`, `tag: C`, `source: "deploy/compose.yaml (prod's services under COMPOSE_PROFILES=gpu); films/SCRIPTS.md §5, line 1"`, `public_safe: true`, `label: "The production stack's containers, as of 2026-11-13, from deploy/compose.yaml"`, `phrasing: "{value} containers"`. Nothing else: the product cases, their split, and the red team's cases are gap lines, because the patch's own Golden Q&A, gap, and "Do not claim" lines change them.

## 3. The checker's rules (the small test the work stands on)

`scripts/corpus/film_claims.py <proposal>`, exit 0 clean, 1 with one line per problem:

- **R1** each table row names a script (one of the seven sections), a line number, and a repository source; the script line is found verbatim (whitespace-normalised) in its script: for §1 to §6 in `films/SCRIPTS.md`, and where that film's `script.txt` has the sentence, there too; for the seventh, in `films/kill-switch-b2/script.txt`, its lines numbered by sentence (a sentence ends at `.`, `?`, `!` or `...` followed by a space or the end of a paragraph; the quoted message in its line 15 is one line), and its source one that `films/kill-switch-b2/materials.md` lists.
- **R2** every line in scope appears in the table as carried or left out with a reason from the closed list (FR-006): `SCRIPTS.md` §1 to §6's numbered lines and every sentence of `films/kill-switch-b2/script.txt`; SC-003's count.
- **R3** no carried line is one `SCRIPTS.md` marks "Not in the repository yet", "Not built on main yet", or retracted ("didn't hold up"), by the marker strings.
- **R4** numbers and money, in the proposal's new prose (the `08` text, the Golden Q&A, the gap and "Do not claim" lines; not the reading guide or the table, which cite the scripts):
  - no number outside a `{{slot:…}}`: a digit run, or a number word from `guards.ts`'s G1 (its `UNITS`, `TENS`, `SCALES`, with plurals; "one" isn't one);
  - exempt spans are removed before the read: claim tags (`` `[A 2026-11-06]` ``, `[P]`, `[?]`), ISO dates, repository paths and URLs, `{{slot:…}}` references, and the quoted spans R5 accepts;
  - no currency amount, read with three patterns carried in the checker's own source: `corpus/tools/check_corpus.py`'s `CURRENCY`, and `guards.ts`'s `AMOUNT_WORDS_PY_SOURCE` and `EXTRA_PATTERN` (word forms: "ten cents", "micro-dollars", "a dollar"). It imports nothing from `corpus/tools` or the gateway; a parity test holds each copy equal to its source's text, read as a file (as `guards.ts`'s own test does for `CURRENCY_PY_SOURCE`).
- **R5** every quotation mark in proposed text encloses a span that is found verbatim in `SCRIPTS.md` as the Author's quoted words, in `docs/data-flow-disclosure.md`'s row F3 as his words, or in the repository file the row cites; no other quote.
- **R6** with `--third-party`, any quoted span not matching a corpus or repository source fails (FR-012).
- **R7** the summary line says the denylist was not applied.

Why a script: Principle VIII and CLAUDE.md ("Paraphrasing a source") make the traceability the point; a model reviewing a model's paraphrase is the thing the evals' "no model grades another" rejects.

## 4. Order of work (implementation, later)

Test first, RED then GREEN, one commit each, a save point per task: the checker's tests (fixtures: a good proposal, a proposal with an unbuilt line, a stray digit, "fifteen containers" outside a slot, "ten cents", a claim tag and a date and an F3 quote that must pass, a changed script line, a stray quote, a `kill-switch-b2` sentence missing from the table); the checker; the proposal's draft, checked; the patch from plain copies, verified on an export; the notes. A reviewer that didn't write it checks the proposal against `SCRIPTS.md` and `films/kill-switch-b2/script.txt` line by line, not only the checker.

## 5. Tests (small ones, by file; the full suite once, by the stack's last task)

- `pytest scripts/corpus/test_film_claims.py` (the checker: R1 to R7, SC-003's count, the three parity tests).
- On a plain export with the patch applied: `python3 corpus/tools/check_corpus.py`; `vitest run apps/web/test/twin-pack.test.ts apps/web/test/content/narration.test.ts`; `npm run content:check -w apps/web`; `pytest evals/test_twin_readiness.py corpus/tools/test_check_corpus.py`; `npm run content:lock -w apps/web -- --check` if it has such a mode (else the lock's own test in `apps/web/test/content/`).
- `make lint`.
- `make check` is not this task's: the stack runs it once, at its end, and the stack's merge-request note carries it. `apps/web/test/room/twin-2d.test.ts` is known flaky under load.

## 6. Files I expect to touch (the implementer merges this branch first)

Added: `corpus/proposals/film-scripts-2026-11-14.md`; `scripts/corpus/film_claims.py`; `scripts/corpus/test_film_claims.py`; `scripts/corpus/fixtures/*` (small proposals and a copy of a few script lines, `SCRIPTS`-shaped and `script.txt`-shaped); `docs/merge-requests/2026-11-14-corpus-film-scripts.patch`; `docs/merge-requests/2026-11-14-night-spec-022-spec-022.md`; `docs/merge-requests/human-patches/022.md`; `specs/022-corpus-from-film-scripts/*`; `intent/022-corpus-from-film-scripts.md`.

Through the patch only (his hand; never written in a worktree): `corpus/08-hareet-ai.md`, `corpus/facts/hareet-ai.yaml`, `config/twin/corpus.json`, `apps/web/content/resume.lock.json`, `evals/product/cases/twin-08-*.yaml` (new and changed), `evals/narration/cases/*.yaml` (each case's `not_contains`, if a "Do not claim" line is added).

C9 (FR-009): each new "Do not claim" line's key phrase joins the forbidden list that `content:check` (`apps/web/build/narration.ts`) holds the resume's items and header, the resume's PDF built from them, and the narration scripts to (`specs/002-the-room/contracts/resume-source.md` §2, C9; `contracts/narration.md` N3). The proposal's key phrases are chosen so none of those already says one; a clash is fixed in the proposal, never in the resume or a script, and `content:check` and `apps/web/test/content/narration.test.ts` on the export prove it.

Overlap to watch: the resume item (b) re-does the resume and reads `08`; its lock pins `08`, so the two stacks' patches touch `apps/web/content/resume.lock.json`, and its new resume text is checked against this patch's C9 phrases. Whichever the Author merges second regenerates the lock and re-runs `content:check`; the human-patch note says so.

No change to: `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `tools/gates/**`, `config/twin/prompt.md`, `config/room-topics.yaml`, `config/twin-readiness.yaml`, any service or the web app's source.

## 7. Cost, telemetry, degraded mode, disclosure

No endpoint, no feature, no new model call: none of CLAUDE.md's "new endpoint or feature" additions apply, and no byte leaves a device, so no disclosure row. Cost: tokens only. `08` is read by free talk alone, and free talk is `ready: false` (`config/twin-readiness.yaml`), so the new text reaches no visitor, and adds no visitor-paid call, until the Author opens free talk or a topic that reads `08` on his evidence runs. If he doesn't apply the patch, the twin is unchanged. If the corpus moves and the pack, the lock, or the cases aren't regenerated, `twin-pack.test.ts`, the narration lock, and `content:check` fail in `make test` and name the file.

## 8. Risks

| Risk | Handling |
|---|---|
| A script line the Author hasn't approved enters the public corpus | his approval of the scripts is recorded (`docs/merge-requests/2026-11-11-feat-015-explainer-films.md:4`); lines changed after it are marked (Q2); his applying the patch is the approval of each; the table lets him strike lines |
| A number goes stale | one slot, for a design count; moving counts and run results are gap lines (Q4, Q96) |
| A number or an amount in words slips through | R4 reads `guards.ts`'s number words and word-currency forms as well as `check_corpus.py`'s `CURRENCY`, with parity tests |
| A seventh script read by nothing | `films/kill-switch-b2/script.txt` is R1's and R2's seventh section (Q95) |
| An unbuilt feature stated as built | R3; gap lines (FR-007) |
| A paraphrase of his words | R5; Q6 quotes exact; Golden Q&A 5's sentence unchanged (Q97) |
| The lock, the pack, the cases, or C9 drift from the corpus | regenerated and checked in one patch (FR-009), on an export |
| `corpus/proposals/` refuses an agent's write | fall back to `docs/merge-requests/` (spec Assumptions) |
| The resume stack's lock or C9 collides | the note says which regenerates and re-checks |
