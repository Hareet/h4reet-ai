# Implementation Plan: The Room's Polish After the Author's Review of the 028 Line

**Approved provisionally by the Author's order of 2026-11-15 (night 4)**, with his words. His review of `feat/028-room-after-review-p`, 2026-11-15 about 21:00 his time, verbatim:

> Okay feedback: Looks great! Dinosaur is in there and the scene of the twin and dog leaving the bicycle works, along with the eating of the desk! A few things to improve: 1) The Interface on both sides of the room looks great, but when walking around or using a smaller browser window, the interface overlaps with the room, i think we could make the interface have an opaque or transparent background, so that it way in those conditions the interface won't block the room visibility. You can see this in the latest screenshot in resume/ 2) We seem to have broken the conversation chat, let's ensure we test it, from the latest screenshot in resume/ you can see that we can't see the chat output in the box below the input text field of "your message" 3) Tying up some last asset polishing, let's add "I AM VERY BUSY" to the desk-sign, let's add "My dog things I'm cool" with a paw print to the dog sign, and let's make the resume paper that the visitor holds into a drawn asset paper that says "RESUME" in diagonal. The monitor should say "Applied AI Engineer" with the cursor in green font

His added item, verbatim:

> Oh one more item we want to add to that spec: Let's make the character selection screen more Game-like. "Step 1: Select your role" and then a card that displays the output of that selection, The twin will describe projects and goals as if talking to a non-technical person, etc". "Step 2: Select your avatar' And then game-character like selection cards for our choices

His answer (2026-11-15), as his orders record it: "Drawn in the room's code (Recommended)": the text and the paw print are drawn as textures on the existing pieces (no studio round, no new model); the monitor reads "Applied AI Engineer" with a green cursor.

His rule for night 4, from the brief's words: "**Approval, given ahead.** The spec-writer takes the recommended answer at clarify and at the plan, as for nights 1 to 3, and records at the top of `plan.md` and `tasks.md`: "Approved provisionally by the Author's order of 2026-11-15 (night 4)", with his words above. Each question still goes on the morning page with its recommended answer; an answer he overturns is reworked before he merges." Every decision below that isn't his is a recommended answer taken under that rule, or this plan's reading, marked as such.

**Branch**: `night/spec-029/spec-029` (documents), from `f411d8e1`. **Spec**: [spec.md](spec.md). **Tasks**: [tasks.md](tasks.md). Paths are under `apps/web/` unless they start otherwise.

## 1. Summary

Four groups beside each other, each from this branch's tip on its own branch, and one integration task:

- **T-A, the side panels see-through**: a pure function marks each HUD part whose box meets the room's on-screen box (the whole stage in the walking view, the wall box otherwise) with `data-over="room"`; under it the part's glass goes translucent and each run of words sits on its own plate, every text at WCAG AA over white and black beneath; parts in the grey bands are unchanged.
- **T-B, the conversation**: B0 found two faults: his regenerated pack closed every topic (content, his: re-mark readiness), and the split panel's frame took the log's grid row (code). A failing test first (type, send, see the answer in the log, through free talk and through a ready topic's piece with free talk closed; the panel's row-less children out of flow and the sheet's rows above the frame; through the real room and the real sender over a fake `fetch`, in eleven runs: six layouts and views, 3D and 2D, the walking view in 3D only), then B0's one-selector fix with the rows lifted above the frame, no silent send (two new fixed messages, the closed-free-talk one only while a topic is ready, Q20), and a readiness section in the room report from `readiness.ts`'s one rule.
- **T-C, the words on the pieces**: two sign outlines set in code by the repository's converter (the paw in the dog sign's), a green `terminal` line with a blinking cursor on the monitor, and a drawn sheet with "RESUME" across it; data only, approved by his hash.
- **T-D, the selection screen**: two numbered steps of cards over the same native radio groups, an outcome card, character cards with the flat previews, a focus move to step 2 on a confirming choice.
- **T-INT**: merges A, B, C, D in that order, resolves the named shared files, runs the one full `make check`, and writes the stack's note.

## 2. Inputs: the three probes

| Probe | Branch | Note | What this plan takes from it |
|---|---|---|---|
| B0, `probe-chat-029` | `night/probe-chat-029/probe-chat-029` (`0c641530`) | `specs/029-room-polish/probe-chat.md` | §R-B1 to §R-B5: the two faults (readiness, his; the log's row, code), the RED assertion, the stylesheets in the test's document, no ops batch, the DevTools snippet, the browser test's needs |
| `probe-words-029` | `night/probe-words-029/probe-words-029` (`84f3d45a`) | `specs/029-room-polish/probe-words.md` | §R-C1 to §R-C6: the room-text route, RT13, the converter, the paw's path (`hud/icons.ts:76`), the terminal's cursor, the paper's two materials, spec 024's set-aside face, the scan's rule on IDs |
| `probe-pick-029` | `night/probe-pick-029/probe-pick-029` (`928916b7`) | `specs/029-room-polish/probe-pick.md` | §R-D1 to §R-D6: native radios kept, the card drafts, the focus move, no narration approved for release, the files D touches and shares |

Each task that builds on a probe merges that probe's branch first (its note only), so the note travels with the code it explains: T-B01 merges `probe-chat-029`, T-C01 `probe-words-029`, T-D01 `probe-pick-029`.

## 3. Technical Context

TypeScript 5 (strict), Vite, three.js in the lazy 3D chunk, vitest with jsdom and axe; build-time fontkit 2.0.4 (already a dependency) for the signs' outlines. No new dependency, no browser download (Q5). No cloud, no gateway change, no model call. Performance: the over-room flag is computed once per re-fit and on the walking view's change, never per frame; the monitor's face redraws only at the cursor's phase changes (about twice a second) while the room animates; the paper's texture is drawn once.

## 4. Constitution Check

See spec.md's table. Gate: passes, with one named deviation (Principle II and Development Workflow 7 for groups A, C, and D: no telemetry span or panel, as spec.md's Assumptions say). Re-checked after design: unchanged.

## 5. Group A design

### R-A1. The over-room flag (`src/room/compose/over.ts`, new, pure)

`overRoom(parts: ReadonlyMap<PartId, Box>, room: Box): Set<PartId>`: a part is over the room where its box and the room's box overlap with positive area (no threshold; spec edge case). `PartId` is the closed list `talk`, `list`, `bar`, `walk`, `eat`, `column`, `dock`, `sheet`, `larger`. The room's box: `stageBox` while the walking view is on; else the protector's `wall(area)` at the frame area the re-fit just took (spec 028's `compose/frame.ts` `Protect.wall`, the 3D stage's or, before a stage and in 2D, `flatProtectorFor`'s); with no wall source, the frame area itself (the room's stage). The parts' boxes are the ones `compactBoxes` and `wallBoxes` already return for the layout (`compose/hud.ts`), so nothing is measured in the DOM.

**Where the wall box comes from** (rv-spec-029, S-10). Outside the split layout, the wall source lives only in the re-fit, `app.ts:254` (`const hudOption = { eat: protect?.eat, wall: protect ?? flatProtect }`), and is never passed to `applyHud` (`app.ts:266-288`): `HudApplied` carries `split` (null outside the split layout) and `frame`, not the wall box. So group A edits `app.ts`'s re-fit: it computes the room's box at the framing, `hudOption.wall?.wall?.(framed?.area ?? boxes.clear) ?? null` (the frame area itself where that is null), and passes it in the `applyHud` call as a new optional field of `HudApplied` (`layout.ts`), `room?: Box | null`; optional, so `test/ui/eat-place.test.ts`'s direct `applyHud` calls stay unchanged. `applyHud` keeps it for the walking view's switch (§R-A2). That region of `app.ts` (`:240-295`) is group A's alone (§9).

### R-A2. Writing it (`src/room/layout.ts`)

`applyHud` calls `overRoom` after it places the boxes and sets `data-over="room"` on each part's element (and removes it from the others), with `applied.room` (§R-A1) as the room's box outside the walking view; the walking view's switch, `setWalking(on)` (`layout.ts:336`, called by `app.ts:367` and `:383`), re-runs it from the last `HudApplied`, with the stage's box while `on`. (`setWalkOffered`, `layout.ts:329`, where `data-walk` is set, says only whether the walking control is offered, not whether the visitor walks: it is not the hook.) Modules changed: `compose/over.ts` (new), `layout.ts`, and `app.ts`'s re-fit (§R-A1), which no other group edits.

### R-A3. The look (`src/room/room.css`, `src/room/hud/split.css`)

- `room.css`'s `:root` gains `--over-glass-alpha: 0.3` and `--over-plate-alpha: 0.5` (this plan's estimate, computed: with `--glass` 16 20 26, a 0.3 glass under a 0.5 plate holds `--hud-text` and `--split-muted` at 4.5:1 and `--split-accent` and `--hud-focus` at 3:1 over white and over black; a uniform alpha would need 0.65, Q1's option B). Under `prefers-reduced-transparency: reduce` and `prefers-contrast: more` both become 1, beside `--split-glass-alpha`'s rule; `forced-colors: active` draws parts as today (system colours, no alpha).
- `[data-over="room"]` rules: the part's background, the panel's frame path fill and title row, the bar's glass, the dock's sheet take `--over-glass-alpha`; the plates: `background: rgb(var(--glass) / var(--over-plate-alpha))`, `box-decoration-break: clone`, a small padding and radius, on `.talk-entry`, `.talk-message`, `.talk-status`, `.talk-form label`, `.split-stats > *`, `.talk-head`, `.split-hint`, `.split-back`, `.room-list-heading`, `.split-label`, `.room-list li button`, and the tiles' words (`.hud-tile span`); the text box and the tiles' faces unchanged (FR-006).
- The split layout's rules outrank room.css's (two root attributes, `split.css`'s header), so the split's `[data-over]` variants live in a block of their own **appended at the end of `hud/split.css`**, and the other layouts' in `room.css`. Group A edits no rule of `split.css` above its block (§9: group B may edit the panel's block).

### R-A4. Tests

- `test/ui/hud-over-room.test.ts` (new): `overRoom` on fixture boxes (none, sliver, whole); then through the real room (`test/helpers/room.ts`'s `intoRoom`) at 1366 × 768, 1440 × 900, 1920 × 1080, 390 × 844, in the room and in the walking view, in 3D, and 1366 × 768 and 390 × 844 in 2D, in the room only (the walking view is offered in 3D alone, `layout.ts:98`): the parts marked are exactly those whose boxes meet the room's box (the expectation computed from `compactBoxes`/`wallBoxes` and the protector, not hand-written); at the split windows at the room's framing none is marked, so no `[data-over]` rule applies to any part (SC-001, FR-005); the text box's declarations are the same over the room as beside it (FR-006).
- `test/ui/hud-over-contrast.test.ts` (new), modelled on `test/ui/hud-split-contrast.test.ts`: reads the alphas from the stylesheets; every text colour over its plate over the translucent glass over white and black reaches its ratio, every mark 3:1; `--over-plate-alpha` is the lowest 5% step at which all hold; both alphas are 1 under the visitor's asks (FR-003, FR-004, SC-002).
- Run beside them: `test/ui/hud-split-contrast.test.ts`, `test/room/hud-contrast.test.ts`, `test/ui/hud-split*.test.ts`, `test/ui/hud-look.test.ts`, `test/ui/hud-a11y.test.ts`, `test/ui/resize.test.ts`, `test/room/stages*.test.ts` (no box moves).

## 6. Group B design

### R-B1. B0's result (`probe-chat-029`, `0c641530`)

Its words: "Two separate faults, and one display that isn't a fault. His stack isn't needed to explain the screenshot."

- **Fault 1, content, his:** `f411d8e1` regenerated `config/twin/corpus.json`; the three topics' pack hashes no longer match `config/twin-readiness.yaml`, so the build closes every topic, and free talk is closed on both commits. Spec 007's FR-030 working as designed. The file is his alone (its header: "only his hand changes it"; `.claude/settings.json:52` denies its edit). His step: re-run his evaluations and the red-team on the regenerated pack and mark the three new hashes (B0's Q-B0-1; §10). Group B adds FR-012's message and FR-014a's report line, so that state is visible, not silent.
- **Fault 2, code:** `hud/split.css:273`, `.talk[data-panel="open"] > * { position: relative }` (0,4,1, spec 018's `bbe6c98f`), outranks `.split-frame { position: absolute }` (`:357`) and `.visually-hidden`, so the frame's SVG (`split.ts:264`, `d4e0b83d`) and `h2#talk-heading` are in-flow grid items without a row; auto-placement puts them after the form; spec 028's `055ec7fc` (one column, always open) gives the frame's auto row the height the log's `minmax(0, 1fr)` row needed: the log is 0 px, and the empty frame below the form is "the box below the input text field".
- **"SERVING Unknown":** `scene.yaml:25`'s `live.source: off` → `not-live` → "Unknown". Not a fault; no change.
- **No ops batch.** B0's read-only DevTools snippet (its §4, boxes and computed styles only) confirms fault 2 in his browser; the stack's note carries it for his morning.

### R-B2. The test (`test/ui/talk-answer-shows.test.ts`, new; T-B01)

- Through the real room: `test/helpers/room.ts`'s room with free talk ready (the fixture's readiness, as `test/ui/talk-turns.test.ts`'s `room({ freeTalk: true })`), `deps.sendTurn = createTurnSender({ fetch: fake, clock })`, `fake` answering as `/api/room/turn` does (`200 {"text": "…"}`; a rejected promise; never, for the 35-second timeout on the room's fake clock; `503 {"state":"degraded","cause":…}` for each cause; `429`; `400`; `409`), so `renderTalk`, `app.ts`, `split.ts`, `layout.ts`, and `turn-client.ts` run as they ship. No module of the panel is mocked.
- The stylesheets in the document (B0's harness: vitest loads CSS imports as empty, so the test inserts `room.css`, `hud/split.css`, `talk/talk.css`, and `style.css` as `<style>` elements), so `getComputedStyle` gives the cascade's `position`, `display`, and `grid-row`.
- The visitor's act: focus `#talk-text` (by its label "Your message"), type "What is this", press Enter (the form's implicit submission), and again by "Send".
- What it sees: within 100 ms "You: What is this" in `[role="log"]` and the field empty; at the answer, the answer's text under "AI twin"; for each failure, its fixed message and the words back in the field; with free talk closed (every topic closed, as the repository's readiness at `f411d8e1`), `cannot_talk.free_talk_closed`'s words; while `open()` is false, `turn_wait.room`'s.
- The log shown (FR-011): in the open split panel, every child whose computed `grid-row` is `auto` has `position` `absolute` or `fixed` (**the RED assertion on `f411d8e1`**: `svg.split-frame` and `h2#talk-heading` are `relative`); the log's `grid-row` before `.talk-form`'s; no `hidden` or `inert` ancestor, and no `display: none`, `visibility: hidden`, visually-hidden declarations, or zero `height`/`max-height` in effect on the log or an ancestor.
- Where: `describe.each` over the split layout (1920 × 1080, 1366 × 768), the split layout in the walking view, the column layout (1280 × 720), the dock (390 × 844), and the stacked layout (300 × 400), each in 3D and 2D.
- Committed seen failing on the tree (the RED assertion, and the two new messages), then not edited (Development Workflow 4).

### R-B2a. The test, after rv-spec-029 (S-1, S-2, S-3, N-2; this section adds to §R-B2 and wins where they differ)

§R-B2 is left as it is for group B's implementer, who corrects its `display: contents` reading (rv-chat-029's CH-2). These add to it:

- **Two rooms** (S-2): (a) free talk ready, `room(ready(), { freeTalk: true })`, as §R-B2 has it; (b) **a topic ready with free talk closed**, `room(ready(), { freeTalk: false })` (the fixture's `ready()` marks every topic ready, `talk-turns.test.ts:43-47`), the repository's shape once he re-marks the three pack hashes. In (b) the visitor selects that topic's piece (as `talk-turns.test.ts:125`'s case does), the fake route answers the opening, and its text shows under "AI twin"; then the visitor types "What is this", sends by Enter and by "Send", and sees "You: What is this" and the next answer's text. The failures' messages run in both rooms.
- **The messages** (S-3, Q20): typed text with no conversation open, in a room with free talk closed and a topic ready (b), shows `cannot_talk.free_talk_closed`; in a room with free talk closed and every topic closed (`room(ready(fixture().index, { topics: false }), { freeTalk: false })`, the repository's readiness at `f411d8e1`), shows `cannot_talk.unavailable`, never the draft. §R-B2's line "with free talk closed (every topic closed …), `cannot_talk.free_talk_closed`'s words" is replaced by these two.
- **The rows above the frame** (S-1): in the open split panel, for each of `.talk-sheet`'s children (`.talk-head`, `.split-top`, `#talk-log`, `.talk-status`), the computed `position` and `z-index` of the row and of `svg.split-frame` show the row painted above the frame within `.talk`'s stacking context: either the row is positioned (not `static`) with a `z-index` greater than the frame's, or the frame's `z-index` is negative; and `.talk` is a stacking context (positioned with a non-`auto` `z-index`, or `isolation: isolate`). RED on `f411d8e1` (the rows are `static`, the frame `relative` at `z-index: 1` by the `> *` rule) and RED after a fix of the selector alone (the frame `absolute` at `z-index: 0`, the rows `static`): the assertion that keeps S-1's fault from shipping. jsdom computes no paint order, so this is the cascade's reading; the paint itself is checked by `document.elementFromPoint` in a browser (§R-B5 and the DevTools snippet, §10).
- **Eleven runs** (N-2): the six layouts and views of §R-B2 in 3D, and in 2D all but the walking view, which is offered in 3D alone (`layout.ts:98`).
- **Earlier tests that pin what FR-012 changes** (this rework's own check, RW-1 in [rework-ab.md](rework-ab.md)): `test/ui/talk-turns.test.ts:357-366` sends typed text in `room(ready(), { freeTalk: false })` (topics ready) and expects `cannot_talk.unavailable`, which becomes `cannot_talk.free_talk_closed`; `test/manifest.test.ts:215-234` lists every message id exactly, which gains two. T-B02 edits no test, so T-B01 rewrites both, test-first (a named departure, spec.md's Assumptions). The cases with no topic ready (`test/ui/talk.test.ts:164`, `:267`, `:300`, `:319`; `test/room/flat.test.ts:821`, on the fixture's room with nothing ready) keep `cannot_talk.unavailable` under Q20 and stay unedited.

### R-B3. The fix (T-B02)

- `hud/split.css:273`: `html[data-split="on"][data-hud="column"] .talk[data-panel="open"] > :not(.split-frame, .visually-hidden)` (B0's line; `:not()` keeps the 0,4,1 specificity). The frame then takes its own absolute box from `split.css:357-367` behind the body; the title row keeps its own glass (`:284`). No other rule of the panel's block changes.
- FR-012: `talk.ts`'s submit handler (`:361-372`): where `!options.enabled()` returns silently, show `turn_wait.room`; where the feature is null because free talk is closed and no conversation is open, show `cannot_talk.free_talk_closed` while at least one topic is ready, and `cannot_talk.unavailable` while none is (Q20, provisional: no message points to a piece that would refuse); the no-route and no-sender cases keep `cannot_talk.unavailable`; the words stay in the field. Two new message ids in `content/messages.yaml` and `talk/messages.ts`'s `MessageId`; the messages' build checks take them.
- Whether a topic is ready (S-3): `renderTalk` today learns only `freeTalkReady` (`talk.ts:116-117`); a topic's readiness reaches it only at a selection (`topicSelected`, `:482-486`). So `renderTalk`'s options gain `topicReady: boolean` (whether any topic of the room is ready), documented beside `freeTalkReady`, and the room passes it on the line after `freeTalkReady` in its `renderTalk` call: `topicReady: deps.room.topics.some((t) => t.ready)` (`app.ts:808`). That one line is group B's only edit of `app.ts`, inside the `renderTalk` call (`:796-834`), far from group A's re-fit (`:240-295`; §9); its departure from "no other group edits `app.ts`" is on the page ([rework-ab.md](rework-ab.md)). Absent (an older caller, a test), it counts as false, so the panel never points to a piece it can't vouch for.
- The rows above the frame (S-1; FR-011, FR-013): once the selector lets the frame take `position: absolute; z-index: 0` (`split.css:357-370`), the frame, a positioned box, paints over `.talk-sheet`'s rows, which are grid items of the panel (the sheet is `display: contents`, `:278-280`) left `static` by the narrowed `> …` rule, which reaches only the panel's own children: the log's answer would sit under the dark glass. The fix lifts them: `html[data-split="on"][data-hud="column"] .talk[data-panel="open"] .talk-sheet > * { position: relative; z-index: 1; }`, a rule of the panel's block after the sheet's `display: contents` rule (this plan's choice: it lifts the rows as the `> *` rule lifts the panel's own); or, the implementer's other route, `z-index: -1` on `.split-frame` (in `.talk`'s stacking context, `.talk` being absolute at `z-index: 3`, `split.css:70-72`, so the frame stays above the panel's own transparent background). Either passes §R-B2a's assertion; the implementer names which in `impl-b.md`.
- Files: `src/room/hud/split.css` (one selector, and the rows' rule, or the frame's `z-index`), `src/talk/talk.ts`, `src/talk/messages.ts`, `content/messages.yaml`, `src/room/app.ts` (the one `topicReady` line).

### R-B4. The room report's readiness line (T-B03; FR-014a)

**One rule, two readers** (rv-spec-029, S-4). A report that re-derived the reasons from `twinReadiness`'s inputs would copy the build's rule, and the two could drift. So `build/room/readiness.ts` (group B's file now, §9) exports one function, `readinessReasons(tree: Pick<Tree, "read">): ReadinessReasons`, and `twinReadiness` becomes its projection:

- `ReadinessReasons` is either `{ kind: "closed", reason }`, a whole-file reason that closes every topic and free talk (`readiness.ts:121-124` today returns `NOTHING` for each): `pack missing or unusable` (`config/twin/corpus.json` absent, not UTF-8, unparsable, or failing its own hashes: `packOf`'s nulls, `:83-96`), `prompt missing or unusable` (`config/twin/prompt.md` absent or failing `promptUsable`), `lines missing or unusable` (`config/twin/lines.yaml`, `linesUsable`), `readiness file missing` (`config/twin-readiness.yaml` absent), `readiness file unparsable` (it fails `READINESS`'s schema); or `{ kind: "entries", topics: Map<string, EntryReason>, freeTalk: EntryReason }`, one reason per topic of the pack and for free talk, in the order the rule tests them: `ready`, `not in the readiness file` (no entry), `not marked ready` (`ready: false`), `pack hash changed` (the entry's `pack_sha256` isn't the topic's, or the pack's for free talk), `prompt hash changed` (its `prompt_sha256` isn't `promptHash(prompt, lines)`).
- `twinReadiness(tree)` returns `NOTHING` for `closed` and, for `entries`, each topic `true` exactly where its reason is `ready`: its signature, its type, and every answer unchanged (`test/room/manifest-readiness.test.ts`, `hints-compose.test.ts`, `image-inputs.test.ts`, and `test/helpers/room.ts`'s `twinReadiness(tree)` stay green unedited; `plugin.ts`, `hints.ts`, and `checks/family.ts` are not edited).
- `build/room/report.ts`: a "Readiness" section, "N of M topics ready; free talk ready|closed", then one line per closed topic, and free talk if closed, with its reason from `readinessReasons`; for `closed`, one line with the whole-file reason. It reads no readiness file itself.

Test: `test/room/report-readiness.test.ts` (new): `readinessReasons` and the report section on fixture trees, one per reason (all ready; a topic not in the file; one not marked ready; one pack hash changed; the prompt hash changed; free talk not marked; and each whole-file reason: no pack, a pack failing its hash, no prompt, an unusable prompt, no lines, no readiness file, an unparsable one); `twinReadiness` equal, on each fixture, to the booleans read off `readinessReasons`; and the repository's tree, where at `f411d8e1` it names the three topics' `pack hash changed` (B0's finding) and free talk's reason as the tree has it. `test/room/report.test.ts` unchanged (a section of its own, after the existing ones).

### R-B5. A real-browser test, for a later spec (Q5; B0's Q-B0-4)

Not added tonight. What it needs: Playwright with a Chromium pinned in the devcontainer image (`.devcontainer/`, his change, and its download his network rule); a test-build input that marks readiness, refused in a release build like the drafts flag (readiness is computed at build from the tree, `virtual:room-content`); the turn route faked by `page.route("/api/room/turn", …)`; one new target in the Makefile for it, and a line in `tools/gates/gate` (human-only: his patch). The page needs nothing new: `role="log"`, `#talk-text` with its label "Your message", and the "Enter" button are its hooks. It would assert that the answer's text node has a client rect inside the log's and the viewport's, with non-zero height, and that `document.elementFromPoint` at the log's centre returns the log or a descendant of it (never `svg.split-frame` or its path: the paint order §R-B2a reads from the cascade, rv-spec-029's S-1), at 1920 × 1080 and at the smallest split window.

## 7. Group C design

### R-C1. The signs' outlines (`build/room/lettering.ts`, `content/lettering/`, `content/room/outlines/`)

The converter (spec 016's, today the shirt's) is generalised: a source file per sign in `content/lettering/` (the shirt's pattern) names the words, the typeface (IBM Plex Sans Bold from `fonts/fonts.lock`, read with fontkit as `build/room/typefaces.ts` does), the line breaks ("I AM / VERY BUSY"; "My dog thinks / I'm cool"), and for the dog sign the paw's path (copied from `src/room/hud/icons.ts:76`'s `EMBLEM_ICONS.paw` into the source file as data, scaled into the view box, filled). It writes `content/room/outlines/<stem>.outline.json` in spec 004 §8's format: `words`, `intent_ref: intent/029-room-polish.md`, `source: { type: design, id: D-0003 / D-0004 }`, `tool: { name: "the room's outline converter", version, license: mit }`, `view_box`, `cap_height`, `advance`, `paths`. The shirt's output stays byte for byte (`test/room/lettering.test.ts`, `twin-shirt.test.ts`). Stems hold no piece, placement, selectable, or topic ID (the source scan, `build/room/scan.ts`): `lettering-busy`, `lettering-cool` (T-C01 checks them with the scan).

**Risk R-3**: `intent_ref` names the intent's path; when he accepts the intent and `git mv`s it into `specs/029-room-polish/intent.md` (intent/README.md, step 2), the outlines' `intent_ref` must follow in the same commit, or RT13 fails. The stack's note tells him.

### R-C2. The scene's bindings (`apps/web/room/scene.yaml`)

`busy-sign`: `faces: { lettering: { regions: [{ rect: [0, 0, 1, 1], renderer: sign, text: lettering-busy }] } }`; `dog-sign`: the same with `lettering-cool`; `desk-screen`: `faces: { screen: { regions: [{ rect: [0, 0, 1, 1], renderer: terminal, text: monitor-line }] } }` (the stem T-C01 checks). The neon sign's entry is not touched (a test pins it byte for byte against `f411d8e1`). The catalog comments and `name:`s of `busy-sign.yaml` and `dog-sign.yaml` name the old words; they change with the data (FR-015).

### R-C3. The monitor's line and its cursor (`content/room/monitor-line.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `build/room/schema.ts`)

- The block: `renderer: terminal`, `lines: ["Applied AI Engineer"]`, `words_from` quoting his review ("The monitor should say "Applied AI Engineer" with the cursor in green font", in intent-029), `about_author: true`, `claims: [{ file: corpus/07-denver-local-ai.md, quote: "Applied AI Engineer" }]`, `ink: green`, `cursor: blink` (two new optional keys of the room-text schema, default the terminal's ink and its typing cursor, so every other block is unchanged).
- `faces/terminal.ts`: `ink: green` takes the look's green (`room/looks/inked-cel.yaml` gains `terminal-green`, e.g. `#4be37a`, at least 4.5:1 on `#0f1419`); `cursor: blink` keeps a block cursor after the last character once typing ends, shown in phase `on`, hidden in `off`; the final frame (2D, reduced motion, quality 3) shows it.
- `scene/faces3d.ts`: while `motion().animate`, a face with `cursor: blink` redraws at each phase change (530 ms on, 530 ms off: this plan's choice, under 1 Hz, far from WCAG 2.3.1's three flashes); otherwise it holds `on`. Paused, reduced, and hidden all clear `animate` (`motion.ts:27`), which is what 2.2.2 needs.
- `around.illustration` comes in with the binding (`text-copy.ts:14`); FR-023a keeps it.

### R-C4. The paper (`src/room/paper.ts` new, `scene/bundle3d.ts`, `flat.ts`)

- `paper.ts` (pure): `paperOps(word, w, h)`: an off-white page (`#f7f3ea`), a thin rule border inset 4%, and `word` centred and rotated to the sheet's diagonal (lower left to upper right, `atan2(h, w)`), in Patrick Hand at the size that fills 80% of the diagonal, ink `#2a2f3a` (at least 3:1 on the page). The word is the UI word `paper.word` ("RESUME"; `ui-keys.ts`, `ui-words.yaml`).
- `bundle3d.ts`: draws the ops once to a canvas (512 × 724, the sheet's ratio) after `faces/fonts.ts`'s wait, sets it as `map` on both materials (`atTwin`, `atVisitor`), keeping their colours, opacities, and the cross-fade (`test/room/avatar-handoff.test.ts:171-172` stay green); `SHEET` and `scene/grip.ts`'s `SHEET_SIZE` unchanged.
- `flat.ts`: the 2D paper's page draws the same ops as SVG (`faces/svg.ts`'s conversion; a `text` with a `transform="rotate(…)"`, which T-C04 adds to the 2D drawing's allowlist if it isn't there).

### R-C5. The approvals (his hand)

`assets/policy/content-approvals.json` gains three `room-text` entries by SHA-256 (the two outlines, the monitor's block): a patch from plain copies of `refs/heads/main`, `docs/merge-requests/2026-11-16-029-room-text-approvals.patch`, checked with `patch -p1 --dry-run` on a fresh export, written by T-INT once the hashes are final; the dog sign's entry is a second hunk he applies after his answer to Q6 is recorded verbatim in the intent (RT13). Until then a release build shows the three faces plain; a drafts build shows them marked "Draft" (spec 004's FR-030).

### R-C6. Tests

`test/room/piece-words.test.ts` (new): the composed room binds the three faces; each outline's `words` and `intent_ref`; RT13 passes for the busy sign and, in strict mode, refuses the dog sign until the intent quotes his answer; the monitor's block passes RT3 to RT5 and RT9; the shirt's outline unchanged; the neon sign's scene entry unchanged; "Around the room" holds the words and `around.illustration`; no piece ID in the new code (the scan). `test/room/monitor-cursor.test.ts` (new): the terminal's ops at typing, at `on`, at `off`, and the final frame; `faces3d.ts` redraws only at phase changes while animating and holds `on` otherwise. `test/room/paper-sheet.test.ts` (new): `paperOps` (the word, its angle, its contrast), both materials carry the map, the cross-fade's opacities, the 2D paper's SVG. Run beside them: `faces.test.ts`, `words.test.ts`, `text.test.ts`, `legibility.test.ts`, `lettering.test.ts`, `twin-shirt.test.ts`, `dist.test.ts`, `schema.test.ts`, `bundle.test.ts`, `scene.test.ts`, `compose.test.ts`, `determinism.test.ts`, `generated.test.ts`, `scan.test.ts`, `eat-chunker.test.ts`, `avatar-handoff.test.ts`, `twin-handoff.test.ts`, `grip.test.ts`, `avatars.test.ts`, `flat.test.ts`, `flat-frame.test.ts`, `motion.test.ts`, `test/ui/pause.test.ts`, `test/ui/around.test.ts`, `test/ui/text-copy.test.ts`; `npm run room:check -w apps/web` (RG7 at the reference stages: FR-022; if it fails, stop and ask).

## 8. Group D design

### R-D1. The words (`src/choice/cards.ts`, new)

`STEPS` (the two legends, step 1's instruction), `ROLE_CARDS` (`engineer`, `non-engineer`: each its description, Q11's drafts), `ROLE_COMMON` (the line under both), `ROLE_EMPTY`, `AVATAR_LINES` (`woman`, `man`, `dinosaur`, `dog`: Q13's drafts), `SELECTED` ("Selected"), and the hint's new words. `PATHS` and `AVATARS` stay as they are (`hints.test.ts`, `build/credits.ts`, `build/room/*` read them).

### R-D2. The DOM (`src/choice/choice.ts`)

- The form keeps its two `fieldset`s, legends "Step 1: Select your role" and "Step 2: Select your avatar"; step 1 holds its instruction (a `p`, the first child after the legend) and its cards and the outcome card (`div.choice-outcome`, not a live region); step 2 its cards. "Enter", the hint (`#choice-hint`), and the links unchanged in place and name.
- A card is `label.choice-option.choice-card` holding the native radio (visually under the card, focusable, in the accessibility tree), a mark or picture (`aria-hidden`), the name, the line (`span` with an id), and the "Selected" word (`aria-hidden`); the radio's `aria-describedby` is its line's id. Role cards' marks are small glyphs drawn in code (two SVG paths); avatar cards' pictures are `avatarPreview(id)` at 6rem.
- The outcome card shows the checked role's description and `ROLE_COMMON`, or `ROLE_EMPTY`.
- `renderChoice(doc, { onEnter, onPdf })`'s signature and export unchanged (`app.ts:549` not edited).

### R-D3. The focus move (Q10)

**Gotcha**: in browsers, an arrow key on a radio group fires `click` (and `change`) on the radio it selects, so the move can't listen to `click` or `change`. It listens to `pointerup` on a role card (a pointer or a touch) and to `keydown` Enter (default prevented: no implicit submission in step 1) and `keyup` Space on a role radio; each checks that radio, then focuses step 2's checked radio, else its first. Arrow keys are left to the browser. Enter in step 2 keeps the browser's implicit submission, which "Enter"'s disabled state guards.

### R-D4. The look (`src/choice/choice.css`)

Cards: a ground of their own, a 2 px border, a 0.75rem radius, at least 44 × 44 px; chosen (`:has(input:checked)`): a border at 3:1 or more, the check mark and "Selected" shown; hover and focus-within looks distinct from chosen; `@media (forced-colors: active)`: `Highlight` border for chosen, the mark and word kept; motion (a 2 px lift, at most 150 ms) only under `@media (prefers-reduced-motion: no-preference)`. Layout: a grid; step 1 `repeat(2, 1fr) 1.4fr` (cards, outcome) on a wide window; step 2 `repeat(4, 1fr)`; below 40rem step 1 one column and step 2 two; below 22rem one. The body's `max-width: 48rem` (`style.css`) is widened for `.choice` to 64rem, `choice.css` only.

### R-D5. Tests

- `test/ui/choice-cards.test.ts` (new): the legends, the instruction, the cards in order with names, lines, and pictures; nothing checked at first; the outcome card's three states; `aria-describedby`; the "Selected" word `aria-hidden` and the radio's state; the focus move on `pointerup` and on Enter and Space, not on an arrow's synthetic `click`/`change`, and no submit on Enter in step 1; the CSS: chosen look by more than colour, forced colours, motion only under `no-preference`, the three layouts' grid rules at 1280, 600, and 320 px (the rules evaluated as `a11y.test.ts` does); axe with no violation empty, step 1 chosen, both chosen; no fetch, event, or storage before "Enter"; the dinosaur's line held to the composed room (its model bundled, its edible pieces' labels named; FR-031).
- `test/ui/choice.test.ts`: the legends' case (`:44-47`) rewritten test-first for the new legends; no other case changes (a named departure, spec.md's Assumptions).
- `room/hints.yaml`'s `your-path` text (FR-036): `test/room/hints.test.ts` keeps passing (the names are unchanged).
- Run beside them: `test/ui/a11y.test.ts` (unchanged; its choice cases must pass on the new DOM), `test/ui/pdf-download.test.ts`, `test/room/hints.test.ts`, and a sample of `enter()`'s callers (`test/ui/loading.test.ts`, `test/room/quality.test.ts`, `test/ui/pause.test.ts`).

### R-D6. What D doesn't touch

`choice/visit.ts`, `choice/avatars.ts`, `room/app.ts`, `room/room.css`, `test/helpers/room.ts`, `test/ui/a11y.test.ts` (`probe-pick-029` §5).

## 9. Shared files, and who edits first

Each group edits only the files its tasks list. Where two touch one file:

| File | First | Second | How |
|---|---|---|---|
| `src/room/hud/split.css` | **B** (one selector, line 273, and the sheet's rows' rule after `:278-280` or the frame's `z-index` at `:357-370`, T-B02) | **A** (a new block appended at the end, T-A02) | disjoint regions; T-INT merges B, then A; A's contrast test reads the frame as B leaves it |
| `src/room/app.ts` | **A** (the re-fit, `:240-295`: the room's box into `applyHud`, T-A02; §R-A1) | **B** (one line in the `renderTalk` call, `topicReady`, after `:808`, T-B02; §R-B3) | disjoint regions, over 500 lines apart; T-INT merges B, then A; the departure is on the page |
| `apps/web/room/ui-words.yaml`, `src/room/ui-keys.ts` | **C** (`paper.word`) | none | — |
| `content/messages.yaml`, `src/talk/messages.ts` | **B** (`turn_wait.room`, `cannot_talk.free_talk_closed`) | none | — |

No other file is edited by two groups: `room.css` is A's alone, `layout.ts` A's, `app.ts` A's re-fit and B's one `renderTalk` line only (rv-spec-029's S-10 gives A the re-fit; S-3's `topicReady` needs B's line; C's blink is in `faces3d.ts`, D's screen in `choice.ts`, neither edits `app.ts`), `build/room/report.ts` and `build/room/readiness.ts` B's.

Group A owns: `compose/over.ts`, `layout.ts` (`HudApplied`'s `room`, `applyHud`, `setWalking`), `app.ts`'s re-fit (`:240-295`), `room.css` (`:root`'s two alphas, the over-room block), the appended block of `hud/split.css`, its two tests. Group B owns: `talk/talk.ts`, `talk/messages.ts`, `content/messages.yaml`, `hud/split.css:273` and the rows' rule (or the frame's `z-index`), `app.ts`'s one `topicReady` line in the `renderTalk` call, `build/room/readiness.ts` (`readinessReasons`; `twinReadiness` its projection), `build/room/report.ts` (the readiness section), its two tests. Group C owns: `build/room/lettering.ts`, `build/room/schema.ts` (the two keys), `content/lettering/*`, `content/room/outlines/*` (new files), `content/room/monitor-line.yaml`, `room/scene.yaml`, `room/catalog/busy-sign.yaml`, `dog-sign.yaml` (comments, names), `room/looks/inked-cel.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `src/room/paper.ts`, `scene/bundle3d.ts`, `flat.ts`, `ui-words.yaml`, `ui-keys.ts`, its tests. Group D owns: `src/choice/choice.ts`, `choice.css`, `cards.ts`, `room/hints.yaml`, `test/ui/choice-cards.test.ts`, `test/ui/choice.test.ts`.

## 10. What waits for his hand

- **The room-text approvals** (R-C5): three SHA-256 entries in `assets/policy/content-approvals.json`, a patch for him; the dog sign's after his answer to Q6, recorded verbatim in the intent.
- **The intent's move**: on accepting it, `git mv intent/029-room-polish.md specs/029-room-polish/intent.md` and the two outlines' `intent_ref` in the same commit (R-1 below).
- **The twin's readiness** (B0's fault 1, Q-B0-1): re-run his evaluations and the red-team on `f411d8e1`'s regenerated pack and mark the three new pack hashes in `config/twin-readiness.yaml` (his file alone); until then the room sends no turn and, after T-B02, says so. FR-014a's report line shows the state in his terminal.
- **B0's DevTools snippet** (its §4): read-only, in his browser, after one send in a wide window; it confirms the log's 0 px row before the fix and its height after. Beside it, one more read-only line (rv-spec-029's S-1): `document.elementFromPoint` at the centre of `#talk-log`'s client rect returns the log or a descendant of it, never the frame (boxes and node names only, never the log's words); `impl-b.md` carries it after the snippet.
- **His look** (SC-008): the panels over the room while walking, the alphas, the signs, the paw, the paper, the monitor's green, the cards.
- **The real-browser test** (R-B5): a later spec, with his approval of the devcontainer image.

## 11. Risks

- **R-1** The intent's move breaks RT13 (R-C1): the stack's note gives him the one commit.
- **R-2** RG7 fails for a sign's small type at a reference stage (FR-022): stop and ask; never lower the floor (recommended then: the sign's words on two lines larger, else fewer words is his call).
- **R-3** `hud/split.css` is edited by B (line 273) and A (its appended block): §9's order; and the frame, out of flow after B's fix, changes what lies behind the log, so A's contrast test runs on the merged tree in T-INT too.
- **R-4** The plates make a busy panel look striped: the alphas are data for his look (FR-008).
- **R-5** `apps/web/test/room/twin-2d.test.ts` flakes under load: rerun it alone before reporting a failure.
- **R-6** A test elsewhere pins the choice screen's old words (beyond `choice.test.ts:44-47`): T-D01's first run of the whole `test/ui` and `test/room` finds it; each is named in its notes and rewritten test-first, or asked on the page.

## 12. Tests run per task

Each task runs the test files it adds or changes, those covering the files it changes (`npx vitest run <files>` from `apps/web/`), and `make lint`, and pastes them in its group's notes (`specs/029-room-polish/impl-{a,b,c,d}.md`). T-INT runs the one full `make check` and pastes it in the stack's note.
