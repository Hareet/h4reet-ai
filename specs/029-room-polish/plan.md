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
- **T-B, the conversation**: from B0's note, a failing test first (type, send, see the answer in the log, through the real room and the real sender over a fake `fetch`, in five layouts and two modes), then the fix that makes it pass unchanged, and no silent send.
- **T-C, the words on the pieces**: two sign outlines set in code by the repository's converter (the paw in the dog sign's), a green `terminal` line with a blinking cursor on the monitor, and a drawn sheet with "RESUME" across it; data only, approved by his hash.
- **T-D, the selection screen**: two numbered steps of cards over the same native radio groups, an outcome card, character cards with the flat previews, a focus move to step 2 on a confirming choice.
- **T-INT**: merges A, B, C, D in that order, resolves the named shared files, runs the one full `make check`, and writes the stack's note.

## 2. Inputs: the three probes

| Probe | Branch | Note | What this plan takes from it |
|---|---|---|---|
| B0, `probe-chat-029` | `night/probe-chat-029/probe-chat-029` | `specs/029-room-polish/probe-chat.md` | §R-B1: the cause, or that his stack is needed (and its script) |
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

### R-A2. Writing it (`src/room/layout.ts`)

`applyHud` calls `overRoom` after it places the boxes and sets `data-over="room"` on each part's element (and removes it from the others); the walking view's switch (`layout.ts:329`, where `data-walk` is set) re-runs it. No other module changes; `app.ts` is not edited by group A.

### R-A3. The look (`src/room/room.css`, `src/room/hud/split.css`)

- `room.css`'s `:root` gains `--over-glass-alpha: 0.3` and `--over-plate-alpha: 0.5` (this plan's estimate, computed: with `--glass` 16 20 26, a 0.3 glass under a 0.5 plate holds `--hud-text` and `--split-muted` at 4.5:1 and `--split-accent` and `--hud-focus` at 3:1 over white and over black; a uniform alpha would need 0.65, Q1's option B). Under `prefers-reduced-transparency: reduce` and `prefers-contrast: more` both become 1, beside `--split-glass-alpha`'s rule; `forced-colors: active` draws parts as today (system colours, no alpha).
- `[data-over="room"]` rules: the part's background, the panel's frame path fill and title row, the bar's glass, the dock's sheet take `--over-glass-alpha`; the plates: `background: rgb(var(--glass) / var(--over-plate-alpha))`, `box-decoration-break: clone`, a small padding and radius, on `.talk-entry`, `.talk-message`, `.talk-status`, `.talk-form label`, `.split-stats > *`, `.talk-head`, `.split-hint`, `.split-back`, `.room-list-heading`, `.split-label`, `.room-list li button`, and the tiles' words (`.hud-tile span`); the text box and the tiles' faces unchanged (FR-006).
- The split layout's rules outrank room.css's (two root attributes, `split.css`'s header), so the split's `[data-over]` variants live in a block of their own **appended at the end of `hud/split.css`**, and the other layouts' in `room.css`. Group A edits no rule of `split.css` above its block (§9: group B may edit the panel's block).

### R-A4. Tests

- `test/ui/hud-over-room.test.ts` (new): `overRoom` on fixture boxes (none, sliver, whole); then through the real room (`test/helpers/room.ts`'s `intoRoom`) at 1366 × 768, 1440 × 900, 1920 × 1080, 390 × 844, in the room and in the walking view, in 3D, and 1366 × 768 and 390 × 844 in 2D: the parts marked are exactly those whose boxes meet the room's box (the expectation computed from `compactBoxes`/`wallBoxes` and the protector, not hand-written); at the split windows at the room's framing none is marked, and each part's style declarations equal `f411d8e1`'s (SC-001, FR-005).
- `test/ui/hud-over-contrast.test.ts` (new), modelled on `test/ui/hud-split-contrast.test.ts`: reads the alphas from the stylesheets; every text colour over its plate over the translucent glass over white and black reaches its ratio, every mark 3:1; `--over-plate-alpha` is the lowest 5% step at which all hold; both alphas are 1 under the visitor's asks (FR-003, FR-004, SC-002).
- Run beside them: `test/ui/hud-split-contrast.test.ts`, `test/room/hud-contrast.test.ts`, `test/ui/hud-split*.test.ts`, `test/ui/hud-look.test.ts`, `test/ui/hud-a11y.test.ts`, `test/ui/resize.test.ts`, `test/room/stages*.test.ts` (no box moves).

## 6. Group B design

### R-B1. B0's result (`probe-chat-029`)

B0 runs the panel's send path against a fake gateway on exports of `f411d8e1` and of `main`'s `a36f98ec` (spec FR-009). **Its finding is recorded here by T-B01, verbatim from the note, before T-B02 starts** (see §R-B1's addendum below, if the note had landed when this plan was committed). Two cases:

- **(i) The page broke it**: the note names the commit and the line (a candidate this spec's readings leave open: `app.ts`'s `open()` false where the visitor can type, the split panel's grid squeezing or hiding the log, a walking-view rule hiding the sheet, `room.css:972`'s `html[data-hud="dock"][data-walk="on"] .talk-sheet`). T-B01 writes the failing test that shows it; T-B02 fixes that line.
- **(ii) His stack is needed** (the page sends and shows answers on both trees): T-B01 still writes FR-010's test, which then passes on the page and pins it; T-B02 ships FR-011 and FR-012 (the log shown, no silent send), which make a failing stack visible as a message; the note's batched script goes to his morning (§10), and the cause's fix waits for its output.

### R-B2. The test (`test/ui/talk-answer-shows.test.ts`, new; T-B01)

- Through the real room: `intoRoom` with `deps.sendTurn = createTurnSender({ fetch: fake, clock })`, `fake` answering as `/api/room/turn` does (`200 {"text": "…"}`; a rejected promise; never, for the 35-second timeout on the room's fake clock; `503 {"state":"degraded","cause":…}` for each cause; `429`; `400`; `409`), so `renderTalk`, `app.ts`, `split.ts`, `layout.ts`, and `turn-client.ts` run as they ship. No module of the panel is mocked.
- The visitor's act: focus `#talk-text`, type "What is this" (input events), press Enter on it (a `submit` from the form's implicit submission, as `test/ui/talk.test.ts` does), and again by clicking "Send".
- What it sees: within 100 ms (fake clock) "You: What is this" in `#talk-log` and the field empty; at the answer, an `.talk-entry[data-speaker="twin"]` whose words are the answer's text; for each failure, the `.talk-message[data-message=…]` of spec 007's classes and the words back in the field; while `open()` is false, `turn_wait.room`'s.
- The log is shown (FR-011): for `#talk-log` and each ancestor up to `html`, no `hidden`, no `.visually-hidden` in effect, and no rule of `room.css`, `hud/split.css`, or `talk/talk.css` that matches it (the sheets parsed with `test/helpers/room.ts`'s `parseCss`, matched with `Element.matches`, as `test/ui/around.test.ts` does) sets `display: none`, `visibility: hidden`, the visually-hidden declarations, or `height`/`max-height: 0`.
- Where: `describe.each` over the split layout (1920 × 1080), the split layout in the walking view, the column layout (1280 × 720), the dock (390 × 844), and the stacked layout (a 300 × 400 window), each in 3D and 2D.
- It is committed seen failing on the tree before T-B02 (case (i)), or seen failing for FR-012's case alone (case (ii): `turn_wait.room` doesn't exist yet), and is then not edited (Development Workflow 4).

### R-B3. The fix and no silent send (T-B02)

- The cause's line, as B0 names it (case (i)).
- FR-012: `talk.ts`'s submit handler, where `!options.enabled()` returns silently today, shows `turn_wait.room` (a new message id in `content/messages.yaml` and `talk/messages.ts`'s `MessageId`), leaving the words in the field. `messages.yaml` is content, not corpus; its build checks (the messages' schema, spec 007's) take the new id.
- FR-011: whatever B0 finds hides the log, removed; the `.talk-log` stays the log in every layout.
- Files: `src/talk/talk.ts`, `src/talk/messages.ts`, `src/talk/talk.css`, `content/messages.yaml`, and where B0's cause is, `src/room/app.ts` or `src/room/hud/split.ts` or the panel's block of `hud/split.css` (lines 225 to 380 at `f411d8e1`) or `room.css`'s walking rules (lines 960 to 990); §9.

### R-B4. A real-browser test, for a later spec (Q5)

Not added tonight. What it needs on the page: a pinned Playwright (a dev dependency) and its Chromium baked into the devcontainer image (CI builds the image; his approval of the image change); `vite preview` of the built site with a fake `/api/room/turn` (a small Node handler in the test, never the gateway); one target, `make test-browser`, and a line in `tools/gates/gate` (human-only: his patch). It would type, send, and assert the answer's text is visible by layout (bounding box non-zero, inside the viewport, not covered: `elementFromPoint` at its centre returns the line), which jsdom can't.

### R-B5. His morning script (case (ii) only)

The note's script, in `.claude/agents/ops.md`'s form: one bash file he runs from his checkout, read-only, printing only names, states, status codes, and timings: `make ps ENV=prod`-style service states; the relay's and the gateway's health routes' status codes; the tier signal's state as the page reads it; one `POST /api/room/turn` with a fixed test body (`{"feature":"free_talk","path":"engineer","turns":[{"role":"visitor","text":"What is this"}]}`) and its status code, its `content-type`, its body's keys (never its values), and its time; `config/routing.yaml`'s active route names for the laptop host. Nothing secret: no environment value, key, token, header value, or answer text. T-B02 copies it to `docs/merge-requests/2026-11-16-029-chat-diagnosis.sh` and names it in the stack's note.

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
| `src/room/hud/split.css` | **B** (only if B0's cause is in the panel's block, lines 225 to 380 at `f411d8e1`) | **A** (a new block appended at the end) | disjoint regions; T-INT merges A after B |
| `src/room/room.css` | **B** (only if B0's cause is a walking rule, lines 960 to 990) | **A** (`:root`'s two alphas, the over-room block appended before the media blocks) | disjoint regions; T-INT merges |
| `apps/web/room/ui-words.yaml`, `src/room/ui-keys.ts` | **C** (`paper.word`) | none | — |
| `content/messages.yaml`, `src/talk/messages.ts` | **B** (`turn_wait.room`) | none | — |
| `src/room/layout.ts` | **A** | none (B only if B0's cause is there: then B first, A merges B's commit named in its notes) | — |
| `src/room/app.ts` | **B** (only if B0's cause is there) | none | — |

Group A owns: `compose/over.ts`, `layout.ts`, the appended blocks of `room.css` and `hud/split.css`, its two tests. Group B owns: `talk/*`, `content/messages.yaml`, the cause's line, its test, the diagnosis script. Group C owns: `build/room/lettering.ts`, `build/room/schema.ts` (the two keys), `content/lettering/*`, `content/room/outlines/*` (new files), `content/room/monitor-line.yaml`, `room/scene.yaml`, `room/catalog/busy-sign.yaml`, `dog-sign.yaml` (comments, names), `room/looks/inked-cel.yaml`, `faces/terminal.ts`, `scene/faces3d.ts`, `src/room/paper.ts`, `scene/bundle3d.ts`, `flat.ts`, `ui-words.yaml`, `ui-keys.ts`, its tests. Group D owns: `src/choice/choice.ts`, `choice.css`, `cards.ts`, `room/hints.yaml`, `test/ui/choice-cards.test.ts`, `test/ui/choice.test.ts`.

## 10. What waits for his hand

- **The room-text approvals** (R-C5): three SHA-256 entries in `assets/policy/content-approvals.json`, a patch for him; the dog sign's after his answer to Q6, recorded verbatim in the intent.
- **The intent's move**: on accepting it, `git mv intent/029-room-polish.md specs/029-room-polish/intent.md` and the two outlines' `intent_ref` in the same commit (R-1 below).
- **His morning script** (case (ii) of §R-B1): `docs/merge-requests/2026-11-16-029-chat-diagnosis.sh`, run in his terminal; its output to the page.
- **His look** (SC-008): the panels over the room while walking, the alphas, the signs, the paw, the paper, the monitor's green, the cards.
- **The real-browser test** (R-B4): a later spec, with his approval of the devcontainer image.

## 11. Risks

- **R-1** The intent's move breaks RT13 (R-C1): the stack's note gives him the one commit.
- **R-2** RG7 fails for a sign's small type at a reference stage (FR-022): stop and ask; never lower the floor (recommended then: the sign's words on two lines larger, else fewer words is his call).
- **R-3** B0's cause is in a file group A also edits (`layout.ts`, `room.css`, `split.css`): §9's order; T-INT resolves the rest.
- **R-4** The plates make a busy panel look striped: the alphas are data for his look (FR-008).
- **R-5** `apps/web/test/room/twin-2d.test.ts` flakes under load: rerun it alone before reporting a failure.
- **R-6** A test elsewhere pins the choice screen's old words (beyond `choice.test.ts:44-47`): T-D01's first run of the whole `test/ui` and `test/room` finds it; each is named in its notes and rewritten test-first, or asked on the page.

## 12. Tests run per task

Each task runs the test files it adds or changes, those covering the files it changes (`npx vitest run <files>` from `apps/web/`), and `make lint`, and pastes them in its group's notes (`specs/029-room-polish/impl-{a,b,c,d}.md`). T-INT runs the one full `make check` and pastes it in the stack's note.
