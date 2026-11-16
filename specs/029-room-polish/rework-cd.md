# Rework of spec 029's groups C and D (`rework-spec-029cd`)

Night 4 (2026-11-16), spec-writer, from spec-029's tip `c743e2da`, after `rv-spec-029` blocked it (the decision page, the seventh wake, Q12, Q19). Documents only: `spec.md`, `plan.md`, `tasks.md`, and this file. No group A or B section touched (`rework-spec-029ab` reworks those beside this). Each fix was checked against the code at the base before it was written.

## The findings, and where each is fixed

| Finding | What the code at `c743e2da` shows | Where fixed |
|---|---|---|
| **S-5** (C): an outline's `intent_ref` is `intent-029`, not a path; the intent's move breaks nothing | `apps/web/build/room/schema.ts:36` (`INTENT_REF = /^intent-\d{3}$/`) and `:849` (refused under RD3, "not intent-NNN"); the shirt's outline holds `"intent_ref": "intent-016"`; `build/room/checks/rt.ts:738-742` (`intentsOf`) reads `intent/<NNN>-*.md` and `specs/<NNN>-*/intent.md` both | spec Q8, FR-021; plan §R-C1 (`intent_ref: intent-029`; its "Risk R-3" paragraph replaced by why the move needs nothing), §10 (the intent's move, the outlines' step dropped), §11 R-1 (withdrawn, its number kept); tasks T-C01 (the `intent_ref` named), T-C02, T-INT (the stack's note no longer carries the outlines' `intent_ref` step) |
| **S-6** (C): RT13 passes the dog sign today; the hold is his approval | `rt.ts:775-778`: in strict mode RT13 only checks that the collapsed words stand between quotation marks in an intent of that number; the intent's reading holds `"My dog thinks I'm cool"` between quotation marks at `intent/029-room-polish.md:24` and `:44` (beside his words, not in them), so the check passes | spec Q6's consequence (RT13 passes; the hold is his approval entry; a release build plain until it exists; drafts marked "Draft"), FR-021; plan §R-C5, §R-C6 (what the test asserts; the backlog line), §10; tasks T-C02 (asserts RT13 passes and the release build shows the dog sign plain until its entry), T-INT (the dog sign's hunk its only hold) |
| **S-7** (C): `D-0003` is the dinosaur's design; the outlines take the next free IDs | `assets/visitors/dinosaur/records.json:13`, `:187`, `:361`, `:535` and `assets/CREDITS.md:409` to `:451` hold `D-0003`; `D-0001` and `D-0002` are taken (`assets/room/records.json`, `CREDITS.md`, the shirt's outline); no `D-0004` or `D-0005` anywhere in `assets/**` or `apps/web/content/**` | spec FR-021 (`source.id` the next free design ID); plan §R-C1 (`D-0004` the busy sign's, `D-0005` the dog sign's, at the base); tasks T-C01 (searches both trees again and records the two), T-C02 (asserts them) |
| **N-4** (C): the paper's word is in the `chalk` face; the looks have no heading face | `apps/web/room/looks/inked-cel.yaml:54-59`: `terminal`, `desktop-session`, `chalk` (Patrick Hand, `:57`), `neon`, `counters` | spec FR-020; plan §R-C4 |
| **S-8** (D): the dog card's line takes Q19's recommended answer | Q19's recommended: "A dog. It walks the room and talks with the twin like any visitor."; the dog's approval's `disclosure_line` stays whole on the credits page, which carries each visitor's line (`apps/web/build/credits.ts:65-77`) | spec Q13 (the dog's line, provisional under rule 1, the others kept with the first draft and S-8's reason), FR-031 (no breed or likeness on the card); FR-027 takes it through Q13; plan §R-D1; tasks T-D02, T-D04 |
| **S-9** (D): the acts that move focus to step 2, named by event; the move after the pointer's own click | `apps/web/src/choice/choice.ts:21-22`: each radio sits inside its `label`, so a pointer's click on the card is followed by the label's activation, which clicks and focuses the radio in step 1 | spec Q10, US4 AS2 and AS3, FR-032, SC-005 (a pointer activation, a `click` with `event.detail > 0`; Enter; Space; never the `click` an arrow key fires); plan §R-D3 (the two gotchas; the pointer's move scheduled after its click, `pointerup` no longer listened to; Enter; Space), §R-D5; tasks T-D01 (dispatches `pointerdown`, `pointerup`, `click` on the label, focuses the radio as the label's activation would, asserts focus in step 2 after the click's task; arrow keys keep focus in step 1) |

The page's answers are unchanged by this rework: Q12's recommended answer stands, named by event; Q19's recommended answer is the dog's line, taken provisionally as every answer in this spec (the Author's rule 1 for night 4). No new question: Q12 and Q19 are already on the page, so `/night/io/out/questions.md` gets none from this task.

## Non-blocking notes

- `assets/CREDITS.md:81` gives `dog-sign.glb`'s source as design `D-0002`, the ID the shirt's outline also carries. Not this rework's to settle (assets are his); the dog sign's outline takes `D-0005` as the supervisor's brief says, since its words are new, drawn from his order rather than traced from that design. T-C01 may note it for the review.
- `analysis.md:41` still says the intent's move must carry the outlines' `intent_ref` (plan R-1); S-5 supersedes it. This rework edits only `spec.md`, `plan.md`, and `tasks.md`, as its brief says, so that line stays, superseded by this table.
- Backlog (plan §R-C6): RT13 can't tell his words from a reading beside them.
- `tasks.md`'s T-INT line is shared with group A and B's rework; this rework changed only its stack-note clause (the intent's move and `intent_ref` out, the dog sign's hunk in). A merge conflict on that line keeps both edits.

## Refusals

None: no hook or bash-gate refusal in this session.

## `make lint`

`make setup` first (the worktree had no `node_modules`; exit 0, "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks"). Then `make lint`, exit 0 (shellcheck's file list cut):

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
878 files already formatted
… | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit … tools/gates/secrets.sh
```

## What's left

Nothing for groups C and D's documents: S-5 to S-9 and N-4 are fixed in spec.md, plan.md, and tasks.md. Left for others: the review of this rework, by a worker that wrote none of it; T-C and T-D's implementers; and the Author's answers to Q6, Q12, Q13, Q19 on the page, any overturned one reworked before he merges.
