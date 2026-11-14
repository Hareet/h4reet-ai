# Notes: spec-026 and its rework (2026-11-14)

## The rework (rework-spec-026, on `night/rework-spec-026/rework-spec-026`, from a7c78a6f)

Rule 6's rework after the Opus review rv-spec-026 (blocking: B1 to B4; also I1 to I6, N1 to N5). No code. Files: `intent/026-twin-pets-dog.md`, `specs/026-twin-pets-dog/` (spec, plan, tasks, analysis, these notes), `docs/merge-requests/human-patches/026.md`.

The page's Q140 to Q143 (the review's) and Q144, Q145 (spec 027's review's, which bear on this patch) read "Answered: recommended" under the orders file's rule. Each recommended answer is taken **provisionally**, not as his answer; the spec says so in a second clarification session, and the plan and tasks in their rework notes.

- **B1 (Q140)**: built on spec 025 as reworked, read at `rework2-spec-025` (7ead9819, still running; earlier tip c73cee1d): `FigureId` `dog` (`stage.ts`, carried by `scene/avatars.ts`), `figures.dog: { home, footprint_m }`, the pictures placed by `scene/chase-figures.ts` from the director's poses, `pictureOf`/`legsOf`, the head point from the dog's picture and `AVATAR_SHAPES.dog`. FR-001 at quality level 0 only. FR-003: the spot computed from `figures.dog.home` at `reach_m`; "fits" (walkable, clearance ≥ `footprint_m`, no overlap) and "occupied" (the walking pose within `footprint_m + separation_m`) defined. R-06: `visiting` in `chase.ts` and `chase-figures.ts`, now definite; R-07: `faceTwin` into the director, so `chase-figures.ts` stays the one writer of the twin's heading. FR-014 and M5: a pick for the `dog` piece only, dog at home, amending 025's FR-018. R-09, plan §4, §5 (conflict watch with `stage.ts`, `chase-figures.ts`, spec 018's `app.ts` and `src/talk/talk.ts`), T011, T013, T014.
- **B2 (Q142)**: no usage event, no dashboard count; the Principle II and Development Workflow 7 deviation named in Assumptions; the New Endpoint list, Constitution row II, R-11, T010, T020, analysis A5. The frame log keeps a `twin-pet` record (N5: hyphenated, as `twin-state`), a development aid never sent.
- **B3 (Q141, Q144)**: the "Do not claim" line, kept, changes every topic's hash (`apps/web/build/twin-pack.ts`, line 17 and lines 220 to 228), so the patch closes mission, work projects, and hobbies and travel; he applies 022's and 026's back to back and evaluates once. It takes hobbies and travel past ADR 0054's T1 (20,916 of 21,182 on main; 266 left). The line's wording now puts its claim before the colon (N3: C9's key phrase stops at the first ", "): "That the dog in the room is a real dog: it is an AI-made likeness, not a photo or a recording." (on the page as RQ2). Q7, FR-021, FR-022, User Story 4, §Degraded-Mode, Assumptions, analysis A2 and A4, T018, plan §7, patch lead and items 1 and 5.
- **B4 (Q143)**: Golden Q&A 9 and the slot take only his own words; "Answered: recommended" never fills them. FR-018, FR-020, FR-023, R-13; T017's failing fixture (an "Answered: recommended" entry, the text on its "Recommended:" line) the checker refuses; T019.
- **I1** `content:lock`, `content:check`, `narration.test.ts` in T019, FR-022, SC-005, plan §3 and §6, patch item 1. **I2** `04`'s line 4 (FR-019, plan §3, patch item 1). **I3** fill the slot before his runs (FR-018, T018, patch item 1). **I4** his consent from main's `specs/017-the-night-shift/spec.md`, line 48 (FR-019, FR-023, R-13, T017). **I5** an approved `petting.glb` is a first-visit file, row V1 already covers it, RK5 counts it (FR-025, §Data-Flow, R-14, T020, patch item 3). **I6** the spec's Input names the branches read. **Q145** `docs/corpus-size.json` in FR-022 and patch item 1. **N1** the intent names its drafter. **N2** item i is spec 024's. **N4** FR-023 and R-13 allow Golden `9.`.
- **Found while reworking**: the twin's product cases read only their own file's and `00`'s "Do not claim" lines (`forbiddenFor`), so only `twin-04-*` cases change, not every topic's; the resume's lock pins no `04` file, so `content:lock` should leave it unchanged. The analysis re-run found F1 (T007 still tested the active-conversation check the rework moved to `app.ts`), fixed.
- **Questions**: two new, with recommended answers, in `/night/io/out/questions.md`: RQ1 (the pet spot computed from the dog's home), RQ2 (the "Do not claim" line's wording).

### Small runs (rule 4)

```
$ python3 -m pytest -q evals/test_docs_links.py
............................................                             [100%]
44 passed in 0.87s

$ python3 -I evals/docs_links.py
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2409 relative links in 384 files

$ python3 -m pytest -q evals/test_repository_docs.py
.................                                                        [100%]
17 passed in 0.04s

$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this container (no `node_modules`); this task changed only Markdown.

### Interruptions

None: no hook or bash-gate refusal was hit (also on the questions file).

### What's left

Implementation T001 to T020 on the line after spec 025's code (this branch merged first), T011 reading spec 025's final text (its rework2 was still running: if it differs from A025, only the adapter and T011 change); the review T022; the Author's T023: Q120 to Q127, Q140 to Q145, RQ1 and RQ2 on the page, his look, the studio round's intake and approval, the corpus patch once spec 020's approval is on main (applied back to back with spec 022's, the slot and any Golden Q&A 9 in his own words before he regenerates), his one evaluation of the three topics and their readiness marks, the merge.

## The first pass (spec-026, on `night/spec-026/spec-026`, from main at 3c0e4cd0)

Intent, spec (Q1 to Q8 taken as recommended), plan R-01 to R-14, tasks T001 to T023, analysis A1 to A12, the human-patches note, nine page questions. Its small runs: `evals/test_docs_links.py` and `evals/test_repository_docs.py`, 61 passed; `make lint` stopped at "node_modules is missing". No refusal hit.
