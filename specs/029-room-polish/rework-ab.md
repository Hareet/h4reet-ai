# Spec 029, the Rework of Groups A and B After rv-spec-029

**Task**: `rework-spec-029ab`, spec-writer, night 4 (2026-11-16). **Branch**: `night/rework-spec-029ab/rework-spec-029ab`, from spec-029's tip `c743e2da`. **Input**: rv-spec-029's findings as the decision page records them (`refs/heads/night/supervisor/2026-11-16`, `docs/night-shift/2026-11-16.md`, the seventh wake and Q20) and the supervisor's brief. The review's own file is in its io folder, outside this session's reach: every finding below is the page's and the brief's wording, checked against the code at the base (the line numbers are `c743e2da`'s, whose `apps/web/` is `f411d8e1`'s).

Documents only: `spec.md`, `plan.md`, `tasks.md`, this file. No code, no test, no human-only path.

**Not touched, as the brief says**: plan §R-B2's text and the selector's lines (FR-013's `> :not(.split-frame, .visually-hidden)` and "its specificity kept", §R-B3's first bullet), which `impl-029b` corrects for rv-chat-029's CH-1 (the specificity is 0,5,1, rv-spec-029's N-1) and CH-2 (`.talk-sheet`'s `display: contents`); every group C and D section (`rework-spec-029cd`'s). Where S-1 to S-3 change what §R-B2 says, the change is a new section, §R-B2a, which wins where the two differ, so `impl-029b`'s edit of §R-B2 and this one merge without overlap. FR-013 and §R-B3 are edited in other sentences and bullets than the selector's; FR-013 is one line in the markdown, so a merge with `impl-029b`'s edit of that line may conflict as text: keep both (the selector's words from `impl-029b`, the rows' sentence from this rework).

## The findings and where each is fixed

| Finding | Checked at the base | Where fixed |
|---|---|---|
| **S-10** (A): the walking view's switch is `setWalking`, not `setWalkOffered`; outside the split layout the wall box lives only in `app.ts`'s re-fit, never passed to `applyHud` | `layout.ts:327-330`: `setWalkOffered` sets `data-walk` from whether the control is offered; `:336`: `setWalking(on)`, called at `app.ts:367` and `:383`. `app.ts:254`: `const hudOption = { eat: protect?.eat, wall: protect ?? flatProtect }`; the `applyHud` call (`:266-288`) passes `split: splitAt` (null outside the split layout) and `frame`, not the wall source. `test/ui/eat-place.test.ts` calls `applyHud` directly. | plan §R-A1 (a new paragraph: the room's box computed in the re-fit and passed as an optional `HudApplied.room`, so `eat-place.test.ts` stays unchanged), §R-A2 (`setWalking` at `:336`, `setWalkOffered` named as not the hook; `app.ts`'s re-fit group A's), §9 (the `app.ts` row; A's files); tasks T-A02 (the `app.ts` re-fit and `setWalking`; `eat-place.test.ts` added to its run), the "Who" line |
| **S-1** (B): after FR-013's fix the frame (`position: absolute; z-index: 0`) paints over `.talk-sheet`'s rows, which are static | `split.css:273-276`: `.talk[data-panel="open"] > * { position: relative; z-index: 1 }` reaches the panel's own children only; `:278-280`: `.talk-sheet { display: contents }`, so its children (`talk.ts:207`'s `head`, `log`, `status`, and `split.ts:241-242`'s `.split-top`) are grid items left `static`; `:357-370`: `.split-frame { position: absolute; …; z-index: 0 }`; `:70-72`: `.talk` absolute at `z-index: 3`, a stacking context. A positioned box at `z-index: 0` paints after in-flow static blocks, so the frame would cover the log. | spec FR-011 (the rows paint above the frame, either route), FR-013 (the fix lifts them), the amendments table's 018 row; plan §R-B2a (the assertion: computed `position` and `z-index` of each row against the frame's, in `.talk`'s stacking context; RED on `f411d8e1` and RED after the selector alone), §R-B3 (a new bullet: `.talk-sheet > *` at `z-index: 1`, this plan's choice, or the frame at `z-index: -1`; the Files bullet), §R-B5 (`document.elementFromPoint` at the log's centre returns the log or a descendant), §10 (the same read-only line beside B0's DevTools snippet), §9 (B's `split.css` regions); tasks T-B01, T-B02, T-B04 |
| **S-2** (B): the test sends only through free talk, which his readiness never opens; add a ready topic with free talk closed: select its piece, see the opening answer, then type, send, and see the answer | `test/ui/talk-turns.test.ts:43-47`: `ready()` marks every topic ready; `:60-75`: `room(index, { freeTalk })`; `:125`: a ready piece's opening; `talk.ts:367`: with no conversation, the feature is free talk only when `freeTalkReady`; `talk.ts:482-505`: a selection opens the topic's conversation, so typed text then goes to it. | spec FR-010 (two rooms, (a) free talk ready and (b) a topic ready with free talk closed, the free-talk case kept beside it), US2 AS4, AS6 (new), SC-003; plan §1, §R-B2a; tasks T-B01 |
| **S-3** (B): FR-012, Q4's message, US2 AS5, and T-B02 follow Q20's recommended answer (the draft only while a topic is ready; otherwise `cannot_talk.unavailable`), provisional | `talk.ts:116-117`: `renderTalk` learns `freeTalkReady` only; a topic's readiness reaches it only at a selection (`topicSelected`, `:482-486`); `app.ts:808` passes `freeTalkReady: content.manifest.free_talk.ready`; `deps.room.topics` carries `ready` (`compose/bundle.ts:116`). So the rule needs one new option, passed from `app.ts` (RW-2 below). | spec Q4, Q20 (a new clarify entry, provisional under rule 1, the others kept), US2 AS5, FR-012, the amendments table's 007 row, Open Questions; plan §1, §R-B2a, §R-B3 (the FR-012 bullet; a new bullet, `topicReady`); tasks T-B01, T-B02 |
| **S-4** (B): `readiness.ts` exports one function giving each entry's reason, `twinReadiness` derives its booleans from it; FR-014a adds the whole-file reasons; `readiness.ts` joins B's files | `readiness.ts:116-131`: `twinReadiness` returns `NOTHING` at `:121` (the pack, the prompt, the lines, or the readiness file missing; the pack also when `packOf` refuses it, `:83-96`), `:122` (the prompt or the lines unusable), `:124` (the readiness file unparsable), else one boolean per entry from `ready`, `pack_sha256`, and `prompt_sha256` (`:127-128`). Its readers: `plugin.ts`, `hints.ts`, `checks/family.ts`, `test/helpers/room.ts`, `test/room/manifest-readiness.test.ts`, `hints-compose.test.ts`, `image-inputs.test.ts`. | spec FR-014a; plan §R-B4 (rewritten: `readinessReasons`, its two kinds and every reason; `twinReadiness` its projection, signature and answers unchanged; the report reads it alone; the test, one fixture per reason), §9 (`readiness.ts` B's); tasks T-B03 (the files, and the readers' tests run unedited) |
| **N-2**: the walking view runs in 3D only (`layout.ts:98`): FR-010 and SC-003 count eleven runs | `layout.ts:97-98`: "Offers the walking control, in 3D after the hand-off's offer, or takes it away, in 2D." Six layouts and views in 3D, five in 2D. | spec FR-010, SC-003, US2 AS4; plan §1, §R-B2a, §R-A4 (group A's 2D runs are in the room only); tasks T-B01 |
| **N-3**, **N-5** | Not this rework's: to the backlog as rv-spec-029 wrote them (the page has both: N-3, no visitor can send before the room takes input, `app.ts:911`, `:1250`; N-5, `turn_sent` counts refused sends too). | No change here. |

## Found by this rework, checking the fixes against the code

| ID | Finding | Where fixed |
|---|---|---|
| **RW-1** | FR-012's change turns two earlier tests red, and T-B02, the fix task, may not edit a test: `test/ui/talk-turns.test.ts:357-366` sends typed text in `room(ready(), { freeTalk: false })` (topics ready, free talk closed) and expects `cannot_talk.unavailable`, which becomes `cannot_talk.free_talk_closed`; `test/manifest.test.ts:215-234` lists every message id exactly, which gains `cannot_talk.free_talk_closed` and `turn_wait.room`. spec-029's draft had the same gap (a wider one: the draft in every case). The other pins of `cannot_talk.unavailable` (`test/ui/talk.test.ts:164`, `:267`, `:300`, `:319`; `test/room/flat.test.ts:821`) run on rooms with nothing ready and stay right under Q20. | spec Assumptions (a departure named for group B); plan §R-B2a (the two cases, and the ones that stay); tasks T-B01 (rewrites both, test-first, named in `impl-b.md`), T-B02 (runs `test/manifest.test.ts` and `test/room/flat.test.ts`; another pin found → stop, a test task T-B01a, or the page) |
| **RW-2** | S-3 needs group B to edit one line of `app.ts`, against the brief's "no other group edits `app.ts`" (S-10): the panel can't tell whether a topic is ready without a new option from its caller. The line sits in the `renderTalk` call (`:796-834`), over 500 lines from group A's re-fit (`:240-295`). Taken: the one line, B's; on the page with a recommended answer (rule 1). | plan §R-B3 (the `topicReady` bullet), §9 (the `app.ts` row, B's files); tasks "Who", T-B02, T-INT; `/night/io/out/questions.md` |

## The question on the page

One, in `/night/io/out/questions.md`: may group B add the one `topicReady` line to `app.ts` (RW-2)? Recommended: yes. Q20 itself is the supervisor's, already on the page; its recommended answer is taken provisionally (spec Q20).

## Refusals

None this session.

## `make lint`

`make setup` first (exit 0; its last line: "git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks"). Then `make lint` with this file in the tree, exit 0 (shellcheck's file list cut):

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
878 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh … (cut)
```

## What's left

- `rework-029a` (S-10) and `rework-029b` (S-1 to S-4, RW-1, RW-2) apply this on `impl-029a`'s and `impl-029b`'s lines, each merging this branch first; `impl-029b` keeps CH-1 and CH-2 (§R-B2, the selector's words).
- His answers: Q20 and RW-2's question; an answer he overturns is reworked before he merges.
- N-3 and N-5 to the backlog (the supervisor's).
