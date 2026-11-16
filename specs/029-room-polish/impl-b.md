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

## T-B02, its test-first part: earlier specs' cases that pin FR-012's subject (a departure)

Running T-B02's list with the fix in place (before any commit of it) gave 8 failures outside T-B01's file, all on
FR-012's subject. Three came from the order of my refusals: free talk closed was checked before no route. I put
no route or no sender first (`cannot_talk.unavailable`: no turn can go, a piece's neither, so "select a piece" would
mislead), which keeps `talk.test.ts`'s "sends no turn while the turn route is off or no sender exists: the turn is
cannot_talk.unavailable" and two more cases green unchanged. Five remained. Plan.md didn't name them and T-B02 edits no
test, so I set the fix aside (copies in `/tmp/b029/fix/`, the four files restored from `HEAD`). I rewrote the five here,
test-first, in a test commit before T-B02, and recorded the departure in plan §R-B3. The question is on the page (Q-B-1).

| File | Old name | New name | What changed |
|---|---|---|---|
| `test/ui/talk.test.ts` | is topic_not_ready for every unready topic, with no request but its usage event and no turn | (unchanged) | the last typed turn's message: `cannot_talk.unavailable` → `cannot_talk.free_talk_closed` |
| `test/ui/talk.test.ts` | hold every message data-model.md §7 names, each written in advance | (unchanged) | the closed list gains `cannot_talk.free_talk_closed`, `turn_wait.room` |
| `test/ui/talk-turns.test.ts` | shows cannot_talk.unavailable, sends nothing, and leaves the words in the box when free talk isn't ready | shows cannot_talk.free_talk_closed, sends nothing, and leaves the words in the box when free talk isn't ready (spec 029, FR-012) | the message |
| `test/ui/talk-turns.test.ts` | shows topic_not_ready for a 409 and ends that conversation | (unchanged) | the typed turn after the 409's message |
| `test/manifest.test.ts` | parses into every fixed message | (unchanged) | the list gains the two IDs |

Seen failing on the tree without the fix:

```
$ cd apps/web && npx vitest run --maxWorkers=2 test/ui/talk.test.ts test/ui/talk-turns.test.ts test/manifest.test.ts
 FAIL  test/manifest.test.ts > content/messages.yaml > parses into every fixed message
 FAIL  test/ui/talk-turns.test.ts > free talk from the text box (T050; FR-032) > shows cannot_talk.free_talk_closed, sends nothing, and leaves the words in the box when free talk isn't ready (spec 029, FR-012)
 FAIL  test/ui/talk-turns.test.ts > when the twin can't answer (T060; FR-036, FR-054) > shows topic_not_ready for a 409 and ends that conversation
 FAIL  test/ui/talk.test.ts > a selectable's action (T205) > is topic_not_ready for every unready topic, with no request but its usage event and no turn
 FAIL  test/ui/talk.test.ts > the fixed messages > hold every message data-model.md §7 names, each written in advance
AssertionError: expected 'cannot_talk.unavailable' to be 'cannot_talk.free_talk_closed' // Object.is equality
AssertionError: expected [ 'cannot_talk.budget', …(11) ] to deeply equal [ 'cannot_talk.budget', …(13) ]
AssertionError: expected [ 'topic_not_ready', …(11) ] to deeply equal [ 'topic_not_ready', …(13) ]
 Test Files  3 failed (3)
      Tests  5 failed | 78 passed (83)
   Duration  187.60s (tests 78%, import 21%, transform 1%)
```

(Lines sorted and deduplicated from the run's output.)

## T-B02 GREEN: the fix

Files (plan §R-B3): `apps/web/src/room/hud/split.css` (the panel's block only), `src/talk/talk.ts`,
`src/talk/messages.ts`, `content/messages.yaml`. No test edited in this commit.

- `split.css:273`: `> :not(:where(.split-frame, .visually-hidden))`. **rv-chat-029's CH-1:** B0's
  `:not(.split-frame, .visually-hidden)` is 0,5,1, since a `:not()` takes its most specific argument's specificity.
  `:not(:where(…))` is 0,4,1, the `> *` rule's. I chose `:where()` to keep spec 018's specificity. No winner changes
  either way. §R-B3's words are corrected in this commit. FR-013's parenthesis in spec.md still says
  "`> :not(.split-frame, .visually-hidden)`, its specificity kept". That file is the spec-writer's, so it's left for
  `rv-spec-029` or the spec's next pass.
- A rule after it: `.talk[data-panel="open"] > .talk-sheet > * { z-index: 1; }` (the frame behind the body; T-B01's
  last clause; §R-B3; Q-B-2 on the page).
- `talk.ts`'s submit handler (FR-012), in order:
  1. An empty field does nothing, as before.
  2. While `enabled()` is false (the hand-off and its offer): `turn_wait.room`, the words left in the field, no
     `turn_sent` (there was none before either).
  3. Then `turn_sent`, as before.
  4. No route or no sender: `cannot_talk.unavailable`, unchanged.
  5. Free talk closed and no conversation open: `cannot_talk.free_talk_closed`.

  The header comment says so.
- `messages.ts`'s `MESSAGE_IDS` and `content/messages.yaml` gain `cannot_talk.free_talk_closed` ("The twin isn't
  taking open questions yet. Select a piece in the room to talk about it.") and `turn_wait.room` ("The twin will answer
  once you're in the room."), the spec's drafts (Q4), for his words. `cannot_talk.free_talk_closed` is a
  `cannot_talk.*` message, so the resume and the PDF links follow it on screen, as the file's header says of every one.
- FR-014: the turn's request, its route, and the sender are unchanged (`turn-client.ts` not touched).

```
$ cd apps/web && npx vitest run --maxWorkers=2 test/ui/talk-answer-shows.test.ts test/ui/talk.test.ts test/ui/talk-turns.test.ts test/ui/talk-activity.test.ts test/ui/hud-split*.test.ts test/ui/hud-look.test.ts test/ui/hud-a11y.test.ts test/manifest.test.ts test/room/data-only.test.ts test/ui/a11y.test.ts test/ui/hud-wall-dom.test.ts test/room/hud-wall-geometry.test.ts

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/impl-029b/apps/web

 Test Files  19 passed (19)
      Tests  355 passed (355)
   Start at  05:08:35
   Duration  385.44s (tests 74%, import 26%)
```

`test/ui/hud-split*.test.ts` expands to eight files (`-a11y`, `-contrast`, `-dog`, `-fallback`, `-list`, `-model`,
`-rest-row`, the base file). The messages' tests: no `test/content/*messages*` exists, so `test/manifest.test.ts` (its
`content/messages.yaml` block) and `test/room/data-only.test.ts` (which reads the file) ran in their place. Beside
tasks.md's list, `test/ui/hud-wall-dom.test.ts` and `test/room/hud-wall-geometry.test.ts` read `split.css`'s rules, so
they ran too. T-B01's file passed unchanged, all 36 cases, in the twelve layout-and-mode runs (SC-003).

```
$ make lint
…
ruff format --check --no-cache --extend-exclude corpus .
879 files already formatted
…
make lint exit 0
```

## T-B03: the room report's readiness section (FR-014a)

RED (`854c7e54`): `apps/web/test/room/report-readiness.test.ts`, 9 cases.

```
$ cd apps/web && npx vitest run --maxWorkers=2 test/room/report-readiness.test.ts
 FAIL  test/room/report-readiness.test.ts > the room report's readiness section (FR-014a) > says every topic and free talk are ready, with no line for a closed one, when the file marks the running hashes
TypeError: readinessLines is not a function
 FAIL  … > names a topic whose pack hash changed, and only it
TypeError: readinessLines is not a function
 FAIL  … > names a topic whose prompt hash changed, and one with both
TypeError: readinessLines is not a function
 FAIL  … > says free talk is closed and why when the file doesn't mark it
TypeError: readinessLines is not a function
 FAIL  … > names the pack's hash for free talk, and a topic not marked
 …
 Test Files  1 failed (1)
      Tests  8 failed | 1 passed (9)
   Duration  92.64s (tests 94%, transform 3%, import 2%)
```

On the RED commit, `tsc` refused the missing export (`TS2305: … has no exported member 'readinessLines'`). So the
lint target was red there, by that export alone. It is green at GREEN.

GREEN (`52f9aff1`): `apps/web/build/room/report.ts` only (`build/room/readiness.ts` read, not changed):
`readinessLines(tree)`, which `roomReport` pushes after the walking lines, before the findings. Plan §R-B4 records
what was built. One departure: on the repository's own tree the test asserts agreement with `twinReadiness`, not
`f411d8e1`'s state, which would fail the day he re-marks readiness. That state is pasted below.

```
$ cd apps/web && npx vitest run --maxWorkers=2 test/room/report-readiness.test.ts test/room/report.test.ts test/room/report-split.test.ts
 Test Files  3 passed (3)
      Tests  38 passed (38)
   Duration  116.36s (tests 64%, import 35%, transform 2%)
```

`npm run room:report -w apps/web` on the repository's tree, its head and its readiness section. The tree's `config/`
is `f411d8e1`'s: spec 029's branch changes no file under it.

```
$ npm run room:report -w apps/web
> @h4reet/web@0.1.0 room:report
> node --import tsx build/room/cli.ts report

## Room report

Bundle 161eb35506b0da2e · release build · caps: main, assets/policy/caps.json 181c38be9ce67249
…
### The twin's readiness (spec 029, FR-014a)

0 of 3 topics ready; free talk closed.

- `hobbies-and-travel`: closed, pack hash changed.
- `mission`: closed, pack hash changed.
- `work-projects`: closed, pack hash changed.
- free talk: closed, not marked ready.

Findings: none.
exit 0
```

This is what tasks.md expected at `f411d8e1`: the three topics' `pack hash changed`, free talk `not marked ready`.

The lint target after GREEN: exit 0 (`ruff format`: 879 files already formatted; the rest as in T-B02's paste).

## Refusals

- **T-B03, the bash gate** (`.claude/hooks/bash-gate.sh`): "Blocked by .claude/hooks/bash-gate.sh — an Author-only
  make target (spec 001). Route: the Author runs it in his terminal (spec 001 research.md R-32); ask the Author". The
  refused command was a heredoc appending these notes, then `git add` and `git commit`. It ran no make target. The
  gate matched words in the notes' text. Nothing ran (`git status` showed the two files unstaged and the notes
  unchanged). Route taken, as the brief says for a false match on text being written: the notes went in with the Edit
  tool, the commit in a command of its own. The command wasn't respelled. On the page as Q-B-3. The T-B03 commit
  (`52f9aff1`) went in before these notes, whose first Edit failed on a stale read; they follow in their own commit.
