# Notes: spec 027, the reworks after rv-spec-027 and rv-rework-spec-027

2026-11-14, spec-writer (rework-spec-027), on `night/rework-spec-027/rework-spec-027`, based on `night/spec-027/spec-027` at 0f61b8db.

## What the review asked, and where it went

- **B1** (Q144, Q145): spec 026's corpus patch (read at `night/rework-spec-026/rework-spec-026`, 2924cc4d, whose spec, plan, and `human-patches/026.md` are spec-026's at a7c78a6f, since the rework had only started) is named beside spec 022's (read at `night/rework2-spec-022/rework2-spec-022`, 74853b8a, with `--no-replace-objects`), in the spec (Q144, Q145, Edge Cases, Assumptions), plan §7 and §8 (R-3, R-6), T001, T007, ADR 0054's Decision 1 and Consequences, the index row, `human-patches/027.md`, and analysis A2. The figures, as first measured here from 026's old bullet (91 characters, a7c78a6f), were 133, mission 4, and −4; **corrected in rework2** (below) to 026's FR-021 bullet as it stands: `[04-hobbies-and-travel] Do not claim:` plus its line break is 38 characters; the bullet is 94; the block is 136 (`renderRules`). Mission keeps 137 − 136 = 1. 026's Arya line's fixed words, a 10-character date, and its line break are at least 137 characters, so hobbies and travel goes to 266 − 136 − 137 = −7 before his disclosure line. 022's five `08` lines cost their text plus 3 each. Plan §7's "rewrites `docs/corpus-size.json` too" is replaced by **T008**, after T004. The line's order is after item f (spec 026).
- **I1**: FR-010, Key Entities, plan §2 and §4 (`model`), and the ADR's "What these figures are" now say the figures are the fit check's model (spec 007, D5, D20), and name what it leaves out: the lead (`renderLead`; 41 characters today for the snowboard), JSON escaping beyond `PER_TURN_CHARS`, and the 400 framing estimate against `CONVERSATION_HEAD` (147) and `CONVERSATION_TAIL` (177). Each topic's lead is counted as information (`lead`, `margin_after_lead`), not in T1.
- **I2**: `stageOf`'s T1 is now per pack topic (`pack.topics[].files`), and the per-file figures are information (`by_file`, `in_topics`). Room parity uses a two-file fixture topic, and a lead case is added.
- **I3**: Decision 1's fourth reason now says the bound sets the reservation (3,350 micro-USD), not the billed cost (`commit.ts:15-17`, quoted). The billed cost is about 1,050 micro-USD at most, from D43, marked as an estimate. Stage 1's possible saving (about 900 micro-USD at most a turn, at one token a character; its spec's to estimate; "under 900" corrected in rework2) is in Consequences.
- **I4**: T005 moves "Measured on `main` at 3c0e4cd0" to the line's commit that carries the check. The ADR's status line and "How to rerun it" already say the pack's figures rerun by the check only from that commit on.
- **N1** dev's slot comparison is marked as inferred, with its arithmetic. **N2** the T1 note prints beside `twin:pack`'s existing fit note (FR-011, plan §4, ADR Decision 4). **N3** the header's 38 characters are in the Edge Case and Consequences. **N4** the ADR status and its index row add "after his answers to Q1 to Q8 on the morning page".

Q144 and Q145's answers are taken under the orders file's rule ("Every question, new ones included: the recommended answer stands"). They are provisional, his to overturn on the morning page.

## Rework2, after rv-rework-spec-027

2026-11-14, spec-writer (rework2-spec-027), on `night/rework2-spec-027/rework2-spec-027`, based on `night/rework-spec-027/rework-spec-027` at bc4989bf.

- **I-1**: spec 026's patch reread at `refs/heads/night/rework2-spec-026/rework2-spec-026`, b12ac0ba, with `git --no-replace-objects` (its tree equals `rework-spec-026`'s at 3417bff2; b12ac0ba is that rework's start commit). FR-021's line, "That the dog in the room is a real dog: it is an AI-made likeness, not a photo or a recording.", is 94 characters, so `04`'s first block is 38 + 2 + 94 + 2 = 136 (`renderRules`, `apps/web/build/twin-pack.ts:713-719`). Mission keeps 1; hobbies and travel keeps 130 before its Arya line and is at −7 after it. The Arya line (026's plan §3) is 137 with a 10-character `YYYY-MM-DD` date standing in for his approval's and its line break (the review's "11-character" counts the same 137; 136 without the line break). Conclusions hold. Corrected in ADR 0054 Decision 1 and Consequences; spec Q144, Edge Cases, Assumptions; plan §7, R-3; T007, T008; `human-patches/027.md`; analysis; these notes. T005 (and plan §7's new paragraph) now takes the final figures from T008's records and corrects each of those places before the line is named for his merge.
- **I-2**: `human-patches/027.md`, the spec's Status line, plan §7, and tasks' rules line say `corpus/**` outside `proposals/`, and name what T008 writes there: each proposal's recorded blob ID and SHA-256 (`corpus/proposals/film-scripts-2026-11-14.md`, `corpus/proposals/dog-intro-2026-11-14.md`, or 026's FR-017 fallback, `docs/merge-requests/<date>-corpus-dog-intro-proposal.md`).
- **Nit 1**: the index row reads "after his answers to Q1 to Q8, Q144, Q145, and Q157". **Nit 2**: "about 900 micro-USD at most", with the ratio (one token a character: 9,023 characters, 902). **Nit 3**: the Edge Case cites Q157, its recommended answer (no) standing; T000 adds Q157. **Nit 4**: FR-002 names 3c0e4cd0 as drafted, then T005's line commit, in `main`'s history only if he merges without squash or rebase (T007's note says so). **Nit 5**: T008's order clause dropped; each patch is applied alone on its own fresh export.
- Analysis rerun: A12 to A16 (analysis.md); nothing blocking.

## Small runs (rework2)

```
$ python3 -I -m pytest -q -p no:cacheprovider evals/test_docs_links.py
............................................                             [100%]
44 passed in 0.87s
```

```
$ python3 -I evals/docs_links.py
PASS  every relative link resolves: 2406 links in 385 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 51 of 51
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2406 relative links in 385 files
```

```
$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this container (no `node_modules`). This rework changed no code, only Markdown. The first rework's runs gave the same results (44 passed; 0 failed in 384 files).

## Interruptions

None, in either rework. No hook or bash-gate refusal was hit.

## What's left

T000 is the Author's answers (Q1 to Q8, Q144, Q145, and Q157, the lead in T1). Then T001 to T008 run on the line after spec 026, in the order T001 → T002 → T003 → T004 → T008 → T005 → T006 → T007. T005 takes the pending patches' final figures from T008's records and corrects each place they appear. Nothing more is built tonight (Q144). Stage 1's spec is the next item once he applies either corpus patch and the record reads "stage 1 due".

## impl-027 (2026-11-14), on `night/impl-027/impl-027`

From rework2-spec-027's tip (13e1da8c), the supervisor's steps 1 to 5.

### T001: the merge of the line's verified tip

`git merge refs/heads/night/verify2-020/verify2-020` (3767859f, items 1 to 3): no conflict; merge commit a90b0e82. The merge brought 95 files, 8,807 insertions, 57 deletions (`git diff --shortstat HEAD^1 HEAD`), none under `specs/027-*` and no section of the stack note in conflict. The supervisor moved this merge ahead of item f's, so the line's tip doesn't carry spec 026 yet.

What moved since 3c0e4cd0 in what the record measures:

```
$ git diff --stat 3c0e4cd0 HEAD -- corpus/ config/twin/ config/budgets.yaml
(no output)
```

Nothing, not even under `corpus/proposals/`. Neither pending corpus patch is on the line's tip: no `docs/merge-requests/2026-11-14-corpus-film-scripts.patch` (spec 022's) and no `docs/merge-requests/*-corpus-dog-intro.patch` (spec 026's); impl-022 and impl-026 build them beside this task. So T008, T005's patch figures, and T007's patch figures wait (Q171).

`node_modules` was missing; `make setup` installed it (`npm ci --ignore-scripts`; the git hooks step reports the sandbox can't write `.git/hooks`, the Author's).

### T002 to T004, test-first

- **T002** (57dc60ff): `apps/web/test/corpus-size.test.ts`, every case of plan §5 (fresh; deterministic, with the record's key order; room parity with a two-file topic; T1 at the room and one past it, and the band's start; a file past the room no topic holds; the lead, and its template held equal to `render.ts`'s; T2 at 5% and under, and its band; T3's bytes and sections at their edges and halves; the highest crossed sets the stage; the defaults; reads only; words). RED:

  ```
  $ cd apps/web && npx vitest run test/corpus-size.test.ts
  Error: Cannot find module '../build/corpus-size' imported from …/apps/web/test/corpus-size.test.ts
   Test Files  1 failed (1)
        Tests  no tests
  ```

  `make lint` failed on tsc, as a RED test must (`TS2307: Cannot find module '../build/corpus-size'`).

- **T003** (c4464ffc): `apps/web/build/corpus-size.ts`; `twin-pack.ts` unchanged. Departures D1 to D5 in plan §9 (`computeRecord`; the budgets' source read with the workspace's `yaml`; the import path; small exports; the stage's edges). GREEN but "fresh", as the task says:

  ```
  $ npx vitest run test/corpus-size.test.ts test/twin-pack.test.ts
       × is fresh: the committed record is what the repository computes
  AssertionError: docs/corpus-size.json is missing or stale: run npm run twin:pack -w apps/web and commit it: expected null to be '{\n  "schema": 1, …
   Test Files  1 failed | 1 passed (2)
        Tests  1 failed | 43 passed (44)
  ```

  `make lint`: exit 0.

- **T004** (0d257fe6): `twin:pack` is now `node --import tsx build/twin-pack.ts && node --import tsx build/corpus-size.ts`. Run, from the worktree's root:

  ```
  $ npm run twin:pack -w apps/web
  twin:pack: wrote config/twin/corpus.json: 131 sections, 3 topics; 186 cases
  corpus:size: T1 band: the topic hobbies-and-travel is within 266 characters of T1 (20,916 of the room's 21,182; ADR 0054)
  corpus:size: T1 band: the topic mission is within 137 characters of T1 (21,045 of the room's 21,182; ADR 0054)
  corpus:size: wrote docs/corpus-size.json: stage 0; mission 21,045 of 21,182
  $ git diff --exit-code --stat -- config/twin/ evals/product/cases/
  (no output; exit 0)
  ```

  The pack and the cases didn't move (SC-004, FR-013). As expected: stage 0, T1 in band for mission and for hobbies and travel; no fit note (no topic past the room). Every figure of the record equals the replica's in ADR 0054 at 3c0e4cd0: the files (9 topic files, 96,567 bytes, 15,089 words, 96,128 characters; 11 facts files, 17,556, 2,312, 17,544; together 114,123, 17,401, 113,672); the room (6,290, 400, 4,128, 21,182); the base (5,833 + 6,189 = 12,022); each topic and each file row (mission 21,045, margin 137; hobbies and travel 20,916, 266, its lead 41, 225 after it; work projects 19,643, 1,539; `01` 42,081, −20,899; `02` 19,478; `03` 14,071; `07` 20,819; `08` 16,325); free talk (9,160 of 78,202, 0.1171); the pack (131 sections, 153,697 bytes, 84,391 rendered, the longest 3,140). So T005 has no replica-versus-check difference to record (R-1).

  ```
  $ npx vitest run test/corpus-size.test.ts test/twin-pack.test.ts
   Test Files  2 passed (2)
        Tests  44 passed (44)
     Duration  43.26s (tests 44%, import 39%, transform 16%, worker 1%)
  ```

  `make lint`, exit 0:

  ```
  node_modules/.bin/eslint --max-warnings 0 .
  for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
  node_modules/.bin/prettier --check .
  Checking formatting...
  All matched files use Prettier code style!
  ruff check .
  All checks passed!
  ruff format --check --no-cache --extend-exclude corpus .
  779 files already formatted
  (shellcheck over the repository's shell files: no finding)
  ```

### What waits (Q171)

- **T008** (the record in both pending corpus patches) needs spec 022's `docs/merge-requests/2026-11-14-corpus-film-scripts.patch` and spec 026's dog-intro patch on the line; impl-022 and impl-026 build them beside this task, and neither is on the line's tip (T001). A later task runs T008 once they are.
- **T005**: the ADR's file and pack figures need no change (the check equals the replica), but its measurement commit moves to T004's (0d257fe6, or its hash on the line), and its pending patches' figures come from T008's records. rework2-spec-027 read 026's patch at b12ac0ba; 026's final tip (9bba8f36) changed `04`'s framing line, not FR-021's bullet, so T005's final figures still come from T008's records. T005 waits with T008.
- **T007**: the patches' stages and figures (T008's records) wait; item 10's section of the stack note carries the rest now.
- **T006**: the review, by another worker (the reviewer follows this task).
