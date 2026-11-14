# Plan: hareet.ai's Corpus from the Film Scripts

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His item: "5. g) "hareet-ai corpus from film scripts". Corpus changes are proposals in `corpus/proposals/`, for his hand." Each clarification answer (spec.md, Q1 to Q6) is the recommended one, his to confirm or overturn on the morning page; an overturned answer is reworked before he merges.

Spec: [spec.md](spec.md) · Intent: [`intent/022-corpus-from-film-scripts.md`](../../intent/022-corpus-from-film-scripts.md) (draft) · Constitution: VII (ownership), VIII (the twin speaks only from the corpus), III (a human merges), VI (in the open).

## 1. What gets built

No product code. Three artifacts and one checker:

1. **The proposal**, `corpus/proposals/film-scripts-2026-11-14.md`: the Author's reading guide (what it is, what it carries, what it leaves out), the table of carried and left-out lines (FR-006), the new text for `08`, the new slots, the new Golden Q&A, the new "Do not claim" and gap lines, and Q6's two quotes "to confirm".
2. **The patch**, `docs/merge-requests/2026-11-14-corpus-film-scripts.patch`: `corpus/08-hareet-ai.md` and `corpus/facts/hareet-ai.yaml`, plus what they move (FR-009): `config/twin/corpus.json`, `apps/web/content/resume.lock.json`, the generated cases. Built from plain copies of `main`'s files (`git show refs/heads/main:<path>`, edited outside any checkout, `diff -u` with `a/`, `b/` labels), verified with `patch -p1` on a fresh `git archive` export, regenerated there by `npm run twin:pack -w apps/web` and `npm run content:lock -w apps/web`; never `git apply`, never a write into a worktree's `corpus/`.
3. **The human-patch note**, `docs/merge-requests/human-patches/022.md` (path, change, why, whether it is on `main` before the gate), and the branch's merge-request note.
4. **The checker**, `scripts/corpus/film_claims.py` with its test, `scripts/corpus/test_film_claims.py`: reads the proposal's table and `films/`, and fails on the rules in §3. Read-only, no network, no model, no project config; `scripts` is already in the Makefile's `PYTEST_DIRS`.

## 2. The content: how the scripts map to `08`

Source: `films/SCRIPTS.md` §1 to §6 (the `script.txt` files are the narration text of the same scripts; the checker compares them where a section matches). Q1's seven films; the comparison cuts are out.

| New `08` section | From | Carries | Leaves out |
|---|---|---|---|
| The cost meter | §1 | the sign reads the gateway's reply; every call carries provider, model, tokens, cost; local answers cost nothing; money counted in whole micro-dollars; Langfuse inside the stack, locked down; Grafana beside latency and errors; the meter is the control, the cloud bill the safety net | the prices and the run's cost (currency); the Haiku choice only as Q6's quote |
| Every data flow disclosed | §2 | the disclosure's columns; a service without a row refused; what leaves a device in a conversation and what never does; the guards withhold; the twin answers only from the corpus and says "I don't know yet" | the retention wording unless Q6 is accepted; the eval case counts as text (slots) |
| Tested every time it changes | §3 | cases from the corpus, golden and gap, two phrasings; graded by code, never by a model; guards fail closed; each miss becomes a fix; readiness locked to a hash | pass rates, the red team's latest run counts (stale; gap line) |
| Local models first | §4 | the stack runs on one laptop with one command; llama.cpp; local tried first; the paid fallback only when it's down; the EC2 order; production, not a demo; images pinned by digest | the Medic and Denver Local AI lines (already in `01` and `07`: a pointer, not a copy) |
| The stack, container by container | §5 | the door, the brain, the model, the eyes, the traces; what each does and what happens when it fails; every alert names its runbook | the daily CPU summary (unbuilt: gap line) |
| How it's built | §6 | intent, spec, plan, tasks, analyze, implement, review by an agent that didn't write it, the clean-room gate, a human merge; a bug starts as a failing test; incidents get a note | the pull deploys (unbuilt: gap line); the forbidden-action tally; "hundreds" stays out too |

Rules for every sentence: the corpus's third person, "he" and "his"; the ownership verbs of `01`; "we" expanded to who; each line tagged (`[P] <path>` for the system, `[A <date>]` for his quoted words, `[?]` for a gap); each number a `{{slot:…}}`. The new Golden Q&A (about eight, one per section and two on "what don't you know?") follow `08`'s form: the question italic, the answer in the corpus's words, `[A]` only where it is his. A Golden Q&A answer that isn't his words is tagged `[P]`, not `[A]`.

Slots (names are `site.*` like the existing one; each `tag: C`, `public_safe: true`, label "… as of 2026-11-13, from films/SCRIPTS.md §n"): the production stack's containers; the product cases and their golden and gap split; the red team's cases. Nothing else.

## 3. The checker's rules (the small test the work stands on)

`scripts/corpus/film_claims.py <proposal>`, exit 0 clean, 1 with one line per problem:

- **R1** each table row names a script, a line number, and a repository source; the script line is found verbatim (whitespace-normalised) in `films/SCRIPTS.md`, and where a `script.txt` has the sentence, there too.
- **R2** every numbered script line in scope appears in the table as carried or left out with a reason from the closed list (FR-006); SC-003's count.
- **R3** no carried line is one `SCRIPTS.md` marks "not built", "Not in the repository yet", or retracted ("didn't hold up"), by the marker strings.
- **R4** no digit in proposed Markdown outside a slot or an allowed product name; no currency amount (it imports nothing from `corpus/tools`: it carries its own pattern, tested against `check_corpus.py`'s cases by a second test that runs both on the same strings).
- **R5** every quotation mark in proposed text encloses a span that is found verbatim in `SCRIPTS.md` as the Author's quoted words, or in the repository file it cites; no other quote.
- **R6** with `--third-party`, any quoted span not matching a corpus or repository source fails (FR-012).
- **R7** the summary line says the denylist was not applied.

Why a script: Principle VIII and CLAUDE.md ("Paraphrasing a source") make the traceability the point; a model reviewing a model's paraphrase is the thing the evals' "no model grades another" rejects.

## 4. Order of work (implementation, later)

Test first, RED then GREEN, one commit each, a save point per task: the checker's tests (fixtures: a good proposal, a proposal with an unbuilt line, a stray digit, a currency amount, a changed script line, a stray quote); the checker; the proposal's draft, checked; the patch from plain copies, verified on an export; the notes. A reviewer that didn't write it checks the proposal against `SCRIPTS.md` line by line, not only the checker.

## 5. Tests (small ones, by file; the full suite once, by the stack's last task)

- `pytest scripts/corpus/test_film_claims.py` (the checker: R1 to R7, SC-003's count, the currency parity test).
- On a plain export with the patch applied: `python3 corpus/tools/check_corpus.py`; `vitest run apps/web/test/twin-pack.test.ts`; `pytest evals/test_twin_readiness.py corpus/tools/test_check_corpus.py`; `npm run content:lock -w apps/web -- --check` if it has such a mode (else its own test in `apps/web/test/` that reads the lock).
- `make lint`.
- `make check` is not this task's: the stack runs it once, at its end, and the stack's merge-request note carries it. `apps/web/test/room/twin-2d.test.ts` is known flaky under load.

## 6. Files I expect to touch (the implementer merges this branch first)

Added: `corpus/proposals/film-scripts-2026-11-14.md`; `scripts/corpus/film_claims.py`; `scripts/corpus/test_film_claims.py`; `scripts/corpus/fixtures/*` (small proposals and a copy of a few script lines); `docs/merge-requests/2026-11-14-corpus-film-scripts.patch`; `docs/merge-requests/2026-11-14-night-spec-022-spec-022.md`; `docs/merge-requests/human-patches/022.md`; `specs/022-corpus-from-film-scripts/*`; `intent/022-corpus-from-film-scripts.md`.

Through the patch only (his hand; never written in a worktree): `corpus/08-hareet-ai.md`, `corpus/facts/hareet-ai.yaml`, `config/twin/corpus.json`, `apps/web/content/resume.lock.json`, `evals/product/cases/twin-08-*.yaml` (new and changed), `evals/narration/cases/*.yaml` (each case's `not_contains`, if a "Do not claim" line is added).

Overlap to watch: the resume item (b) re-does the resume and reads `08`; its lock pins `08`, so the two stacks' patches touch `apps/web/content/resume.lock.json`. Whichever the Author merges second regenerates the lock; the human-patch note says so.

No change to: `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `tools/gates/**`, `config/twin/prompt.md`, `config/room-topics.yaml`, any service or the web app's source.

## 7. Cost, telemetry, degraded mode, disclosure

No endpoint, no feature, no new model call: none of CLAUDE.md's "new endpoint or feature" additions apply, and no byte leaves a device, so no disclosure row. Cost: tokens only. If the Author doesn't apply the patch, the twin is unchanged. If the corpus moves and the pack or the lock isn't regenerated, `twin-pack.test.ts` and the narration lock fail in `make test` and name the file.

## 8. Risks

| Risk | Handling |
|---|---|
| A script line the Author hasn't approved enters the public corpus | his applying the patch is the approval; the table lets him strike lines; Q2 |
| A number goes stale | slots with "as of"; run results excluded (Q4) |
| An unbuilt feature stated as built | R3; gap lines (FR-007) |
| A paraphrase of his words | R5; Q6 quotes exact |
| The lock, the pack, or the cases drift from the corpus | regenerated in one patch (FR-009), checked on an export |
| `corpus/proposals/` refuses an agent's write | fall back to `docs/merge-requests/` (spec Assumptions) |
| The resume stack's lock collides | the note says which regenerates |
