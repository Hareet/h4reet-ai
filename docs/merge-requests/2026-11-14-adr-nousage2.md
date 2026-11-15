# adr-nousage2: rv-docs3's part A findings on ADR 0055, and Q306's recommended answer

Branch `night/adr-nousage2/adr-nousage2`, from adr-nousage's tip `90633b57` (which this task didn't write). Documents only: no code, test, scene, asset, or human-only path changes; nothing merged or pushed. merge-3 takes this branch's tip. Reviewer: rv-docs4, on another worker.

## Why

Tonight's page (`refs/heads/night/supervisor/2026-11-14`, `docs/night-shift/2026-11-14.md`): Stacks, rv-docs3's row ("**not blocking**", "**adr-nousage2** (A's I-1 to I-3, N-1 to N-3) … fix them, documents only"); "rv-docs3's findings, its words", part A; Q305 and Q306, each "Answered: recommended".

## What changed, finding by finding

| Finding | File | Change |
|---|---|---|
| I-1 | `docs/adr/0055-no-usage-event-for-what-only-the-dinosaur-causes.md` | Spec 026 cited by section, not line number, as the fix says: Assumptions, the "Deviation named" bullet (Context, the table's "What is observed", and "What would reverse it"); Degraded-Mode Behavior and Data-Flow Disclosure Entries (the table, and Decision 4); the "New Endpoint or Feature" list's "Telemetry span" line (Context). Context's spec 026 bullet now says it cites by section and that each quoted line is the same on rework5-026 (215b4eea) and amend-026 (4ac61609). Links names both branches. No quoted word changed. |
| I-1 | `docs/merge-requests/2026-11-14-adr-nousage.md` | "For merge-3": the pointer goes "immediately after the "- **Deviation named**" bullet … and before "- No other constitution control is deferred or dropped.", found by those words, not by line number", from whichever of the two branches merge-3 takes; the paragraph after it lists the ADR's anchors instead of line numbers. |
| I-2 (Q306) | the ADR, Decision 5 | "It is the second: …" dropped. Decision 5 now quotes Q149's answer as its source ("No worker merges, so the ADR is drafted as proposed on the line when item 7's code is queued, and waits for your hand on main with the stack") and Q306's recommended answer, in its words. |
| I-3 | the ADR, Alternatives, "No ADR" | The review's fix, word for word: "Rejected provisionally: taken on Q116's, Q117's, and Q142's recommended answers, the deviation is permanent for each feature once he confirms them (specs 024 and 025: "if he confirms it, it is permanent for this feature"; spec 026: "permanent for this feature if he confirms it")." |
| N-1 | the ADR, Alternatives | "**An ADR per spec** (Q149's and Q161's others)" → "**A separate ADR for spec 026** (Q161's other; spec 025's Q13: "else its own (option A)")." Checked: night 1's page `:744`, Q161's Others, "a separate ADR for spec 026; no ADR, the spec's written justification alone"; `specs/025-twin-and-dog-run-from-dino/spec.md:50` holds "else its own (option A)". The sentence after it ("The reason is one, so the record is one. Rejected provisionally.") stays. |
| N-2 | the ADR (Status, Decision 2, Links); `docs/adr/README.md`, the 0055 row | Decision 2: "That reading is Q305 on the page of 2026-11-14". The Status line's and the index row's "after his answers to …" lists, and Links, now end "Q300, Q305, and Q306" (Q306 by the brief's instruction, since Decision 5 now rests on it). |
| N-3 | `docs/merge-requests/2026-11-14-adr-nousage.md` | Says adr-nousage's runs of the number checks, and its "827 files" run, weren't kept, and points here, where the number checks are run again (below). |

## Not on this branch: the hand-over's step 3 (Q306), for the integration task

Q306's answer: "the hand-over's step 3 is on handover-prep's branch, which only the integration task merges and completes, so it changes step 3 there." The line, on `refs/heads/night/handover-prep/handover-prep` (b122afb7), `docs/merge-requests/2026-11-14-night-stack.md:4773`, begins:

> 3. **The "no usage event" ADR, on main before items 7 and 8 merge** (Q149: "a docs-role ADR on main before impl-024 merges"; …). No such ADR is on the line at `ce3f6305` (`docs/adr/` ends at 0054). A gap: question HP-2 below.

The change Q306's recommended answer names: step 3 drops "before items 7 and 8 merge" (the ADR reaches `main` in the same merge, with the stack, as Decision 5 now says, quoting Q149's answer), and, since the ADR now exists, the "No such ADR is on the line … A gap: question HP-2 below" sentence (and HP-2 at `:4851`) would name ADR 0055 (`proposed`) instead. That second part is my reading, not Q306's words; the integration task decides it.

One more thing beside it, not changed (the brief changes no spec): specs 024 (A5), 025 (`spec.md:239`), and 026 (Assumptions, "Deviation named") each still say the ADR is "on main before" the implementation merges. Under Q306's answer they reach `main` in the same merge as the ADR. If the Author wants the specs' words to match, that is a spec edit for a later task.

## Checks

**I-1, the anchors**, each found once and byte-for-byte the same on both branches (spec 026 exported with `git show <ref>:specs/026-twin-pets-dog/spec.md` to two files in `/tmp`; each anchor `grep`ped, counted, and its line's SHA-256 prefix taken):

```text
FR-026\*\*: | amend-026: 1 42262eba7298 | rework5-026: 1 42262eba7298
^- \*\*Deviation named\*\* | amend-026: 1 e7d0046a0635 | rework5-026: 1 e7d0046a0635
^Written first (Principle I) | amend-026: 1 53927f084a73 | rework5-026: 1 53927f084a73
^None new: the petting | amend-026: 1 6cc43d0dcd70 | rework5-026: 1 6cc43d0dcd70
^- Telemetry span: none for the petting | amend-026: 1 ed0b02b74f20 | rework5-026: 1 ed0b02b74f20
^- No other constitution control | amend-026: 1 52aaf8d7da8e | rework5-026: 1 52aaf8d7da8e
```

The refs at the time: amend-026 `4ac61609`, rework5-026 `215b4eea`. On amend-026 the "Deviation named" bullet is line 232 and "No other constitution control" line 233; on rework5-026, 231 and 232. The ADR names neither number now.

**N-3, the number 0055** (run by adr-nousage2; adr-nousage's own runs weren't kept):

```text
$ git ls-tree --name-only refs/heads/main docs/adr/ | tail -2
docs/adr/0053-the-studio-line.md
docs/adr/README.md
$ git ls-tree --name-only ce3f6305 docs/adr/ | tail -2
docs/adr/0054-when-file-context-stops-being-enough.md
docs/adr/README.md
$ for r in $(git for-each-ref --format='%(refname)' refs/heads/night/ 'refs/heads/feat*' refs/heads/main); do git ls-tree --name-only "$r" docs/adr/ | grep '^docs/adr/005[5-9]' | sed "s|^|$r: |"; done
refs/heads/night/adr-nousage/adr-nousage: docs/adr/0055-no-usage-event-for-what-only-the-dinosaur-causes.md
refs/heads/night/adr-nousage2/adr-nousage2: docs/adr/0055-no-usage-event-for-what-only-the-dinosaur-causes.md
```

The scan covered 184 refs. The only 0055 files are this ADR's, on adr-nousage and this branch.

**Quotes.** Every quote added comes from its source: Q149's answer from night 1's page `:685`; Q306's recommended answer from tonight's page `:80` ("in the same merge, with the stack, which is what Q149's answer already says ("waits for your hand on main with the stack")"); I-3's and N-1's words from the review's fixes (tonight's page, "rv-docs3's findings, its words"). No fact about the Author is stated. Where the Author's answers come up, they are given as the pages record them: recommended, taken provisionally.

## Small tests and lint (rule 4)

The worktree had no `node_modules`; the setup target ran first (exit 0; its last line: "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks"). Then, with this note in the tree:

`python3 -I -m pytest -q -p no:cacheprovider evals/test_docs_links.py`:

```text
RUN-PYTEST
```

The lint target (the shellcheck lines, which list the repository's `.sh` files, left out here):

```text
RUN-LINT
```

The full check isn't run here (rule 4: once, at the end of the stack).

## Questions and interruptions

No new question: Q305 and Q306 are on the page already. No hook or bash-gate refusal was hit, and no request was made to the runner.

## What's left

- rv-docs4 (another worker) reviews this branch beside claudemd3.
- merge-3 takes this tip, and adds spec 026's pointer by its words (`2026-11-14-adr-nousage.md`, "For merge-3").
- The integration task changes the hand-over's step 3 (above, Q306).
- The Author: Q305 and Q306 on the page; ADR 0055 is accepted, amended, or rejected when he merges the stack.
