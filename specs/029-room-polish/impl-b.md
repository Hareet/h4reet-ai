# Group B's notes (impl-029b): the conversation

Night 2026-11-16, task `impl-029b` (implementer), branch `night/impl-029b/impl-029b`, from spec-029's tip `c743e2da`.
Tasks T-B01 to T-B04 of [tasks.md](tasks.md), against [plan.md](plan.md) §R-B1 to §R-B5. B0's note:
[probe-chat.md](probe-chat.md) (merged in T-B01).

## T-B01

- Merged `night/probe-chat-029/probe-chat-029` (`0c641530`, its note only) as `a0a9fa64`.
- Installed the workspace's packages for vitest: `npm ci --ignore-scripts` at the worktree's root (no lifecycle
  scripts; `node_modules/` is ignored by git).
- Wrote `apps/web/test/ui/talk-answer-shows.test.ts` (plan §R-B2), seen failing on the tree (`c743e2da`'s code, which
  is `f411d8e1`'s: spec 029's branch changes only documents), committed, and not edited after this task.

### What the test does

- The room as `main.ts` starts it (`test/helpers/room.ts`'s `start()`), with the real `renderTalk`, `app.ts`,
  `split.ts`, `layout.ts`, and `createTurnSender({ fetch, clock: v.clock })` over a fake `fetch` that answers
  `POST /api/room/turn` (`200 {text}`, a rejection, never (the 35-second timeout on the room's clock), `503 degraded`
  for each of `RESTING_CAUSES`, `BUDGET_CAUSES`, and an unknown cause, `429`, `400`, `409`). No module of the panel is
  mocked.
- The stylesheets go into the document in the bundle's order (`style.css`, `room.css`, `talk/talk.css`,
  `hud/split.css`, `bubble.css`) before the visit starts.
- The visitor finds the text box by its label "Your message", types "What is this", sends by Enter (the key events,
  then `form.requestSubmit()`, the implicit submission jsdom doesn't run on its own) and by "Send". With no clock step
  (within 100 ms) the line shows under "You" and the field is empty. After the reply: the answer under "AI twin", or
  the failure's fixed message, matched by its words in `content/messages.yaml`, with the words back in the field.
- Twelve runs: the split layout at 1920 × 1080 and 1366 × 768, the split layout in the walking view, the column layout
  (1280 × 720), the dock (390 × 844), the stacked layout (300 × 400), each in 3D and 2D. Each asserts its `data-hud`
  and `data-split`, so no run lands in another layout unnoticed. The walking view is 3D's (spec 008): its 2D run is the
  split layout's at 1920 × 1080, with the walking control asserted not offered.
- Three cases a run (36): the answers and the failures, with the layout's clauses after each answer and at the end;
  `turn_wait.room` at the hand-off's offer, then the kept words sent from the room; `cannot_talk.free_talk_closed`
  with every topic and free talk closed, and not `cannot_talk.unavailable`'s words. The RED assertion and each of the
  two messages fail in cases of their own, so none hides another.

### rv-chat-029's CH-2: the reading of FR-011's clause

FR-011's "every child that holds no grid row of its own" is read as **the boxes the grid places**: each child whose
computed `display` is `contents` is expanded into its children, as B0's harness's `items()` does, and makes no box
itself. `.talk-sheet` (`display: contents`, `grid-row: auto`, `position: relative` before and after the fix) is
therefore not asserted on. Its children each hold a row. The frame's SVG and the hidden heading, FR-011's own
examples, are what the clause catches. Recorded in plan §R-B2 in this commit.

### A clause added: the frame behind the body (FR-013)

B0's selector takes the frame out of the log's row, but by CSS's painting order (CSS 2.1 Appendix E; css-grid §9.5:
a grid item's `z-index` applies whatever its `position`) an absolute frame with `z-index: 0` paints **over** every
grid item whose `z-index` is `auto`. The sheet's children are such items: `.talk-sheet`'s `z-index: 1` from
`split.css:273` makes nothing, because a `display: contents` element makes no box. With B0's line alone, the log would
get its height back and sit under the frame's 0.78 glass, along with the stats and the status. So the test also
asserts that every box the grid places in a row has a computed `z-index` above the frame's, and T-B02 gives the
sheet's children one (plan §R-B2 records it; §R-B3 changes in T-B02's commit). jsdom computes `z-index` through its
cascade (checked below).

### jsdom's cascade on the new selectors (rv-chat-029's ask)

A scratch check (`/tmp/b029/cascade.mjs`, not committed), with the worktree's jsdom: both `> :not(.f, .vh)` and
`> :not(:where(.f, .vh))` exclude the frame and the hidden heading, and `z-index` is computed through the cascade,
for a `display: contents` element's child too:

```
$ node /tmp/b029/cascade.mjs "$PWD/../../node_modules/jsdom/lib/api.js"
t I vh absolute "auto" "auto"
t I f absolute "0" "0"
t B x relative "1" "1"
u I vh absolute "auto" "auto"
u I f absolute "0" "0"
u B x relative "1" "1"
u DIV s relative "1" "1"
s EM  static "1" "1"
```

So a single `:not()` with a selector list is enough in jsdom. Two `:not()`s aren't needed.

### The RED run

```
$ cd apps/web && npx vitest run --maxWorkers=2 test/ui/talk-answer-shows.test.ts
 FAIL  … the split layout at 1920 × 1080, 3D … > types, sends by Enter and by Send, and shows each answer and each failure's message in the log, the log shown
   (and the same case at 1920 × 1080 2D, 1366 × 768 3D and 2D, the walking view 3D and 2D)
AssertionError: boxes in the grid's flow without a row of their own: expected [ …(2) ] to deeply equal []
+ [
+   "svg.split-frame: position=relative grid-row=auto z-index=1",
+   "h2#talk-heading.visually-hidden: position=relative grid-row=auto z-index=1",
+ ]
 ❯ expectLogShown test/ui/talk-answer-shows.test.ts:250:75

 FAIL  … > says why while the room doesn't take input yet, keeps the words, and sends them once the visitor is in the room
   (all twelve runs)
AssertionError: content/messages.yaml has turn_wait.room: expected undefined to deeply equal Any<String>

 FAIL  … > says free talk is closed, not that the service is unavailable, when every topic and free talk are closed
   (all twelve runs)
AssertionError: content/messages.yaml has cannot_talk.free_talk_closed: expected undefined to deeply equal Any<String>

 Test Files  1 failed (1)
      Tests  30 failed | 6 passed (36)
   Duration  80.93s (import 88%, tests 9%, transform 3%)
```

(Condensed: one block per failing assertion, each block's twelve or six case names folded.) The six that pass are the
first case in the column layout, the dock, and the stacked layout, 3D and 2D: there the answer and every failure's
message already show, as B0 found (§2b). One mistake of the test's own, fixed before this run: counting the log's
lines to find the new one fails once the log holds its 20 (`LOG_LIMIT`), so the test marks the lines it has seen.

```
$ make lint
…
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
879 files already formatted
…
make lint exit 0
```
