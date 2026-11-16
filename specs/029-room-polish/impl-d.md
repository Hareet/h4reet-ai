# Group D of spec 029: the selection screen, game-like (`impl-029d`)

Night 4 (2026-11-16), implementer, branch `night/impl-029d/impl-029d`, from spec-029's tip `c743e2da`, after merging `night/rework-spec-029cd/rework-spec-029cd` (`287acd27`, a fast-forward: S-8, S-9) and `night/probe-pick-029/probe-pick-029` (`928916b7`, its note only). Tasks T-D01 to T-D04 of `tasks.md`, plan §R-D1 to §R-D6. Approved provisionally by the Author's order of 2026-11-15 (night 4); every word on the cards is a draft for his look.

## What changed

| File | What |
|---|---|
| `apps/web/test/ui/choice-cards.test.ts` (new, T-D01) | 26 cases: the legends, the instruction, the hint, the cards in order with names, lines, marks, and pictures; the outcome card's three states; `aria-describedby`; "Selected" `aria-hidden`; the focus move by a pointer (`pointerdown`, `pointerup`, `click` with `detail: 1` on the label, then the radio focused as the label's activation does; focus asserted after the click's task, and still in step 1 after `pointerup` alone), by Enter (default prevented: no submit), and by Space (`keydown`, the browser's `click` with `detail: 0`, `keyup`); arrow keys keeping focus in step 1 (`keydown` ArrowDown, the next radio focused, a `click` with `detail: 0`, a `change`, `keyup`, two tasks run); no move from step 2; nothing fetched, sent, or stored before "Enter"; axe in three states; the CSS (chosen by more than colour, the card's focus ring, hover and focus distinct from chosen, forced colours, motion only under `no-preference` at most 150 ms and 2 px, the three layouts at 1280, 600, and 320 px, no sideways track, the 64rem page, every card 44 × 44 px); the dinosaur's line held to the composed room, and no piece's or placement's ID in any card's words (spec 004's FR-007) |
| `apps/web/test/ui/choice.test.ts` (T-D01) | `:44-47`, the legends' case: **old** "Your path", "Your avatar"; **new** "Step 1: Select your role", "Step 2: Select your avatar" (the named departure, spec.md's Assumptions). No other case changed |
| `apps/web/src/choice/cards.ts` (new, T-D02) | The words: `STEPS`, `ROLE_CARDS`, `ROLE_COMMON`, `ROLE_EMPTY`, `AVATAR_LINES`, `SELECTED`, `HINT` |
| `apps/web/src/choice/choice.ts` (T-D02) | Two `fieldset`s of cards over the same radios and values; the outcome card; the focus move (§R-D3); `renderChoice`'s signature unchanged |
| `apps/web/src/choice/choice.css` (T-D02) | The cards, the chosen look, the ring, forced colours, motion under `no-preference`, the three layouts, `body:has(.choice) { max-width: 64rem }` |
| `apps/web/room/hints.yaml` (T-D03) | `your-path`: "Your role sets the twin's depth: …", the rest unchanged |
| `specs/012-loading-screen/spec.md` (T-D03) | The Hint Copy, row 6, the same one word (see "Departures") |
| `specs/029-room-polish/spec.md`, `plan.md`, `tasks.md` | The Amendments row for spec 012's row 6; plan §R-D1 (the dinosaur's line), §R-D2, §R-D5, §9; T-D03's line; T-D01 to T-D04 checked |

Not touched (§R-D6): `choice/visit.ts`, `choice/avatars.ts`, `room/app.ts`, `room/room.css`, `test/helpers/room.ts`, `test/ui/a11y.test.ts`. No human-only path.

## The cards' words as shipped (T-D04, for the page)

Taken provisionally under rule 1: the page's Q11 (native radio groups as cards), Q12 (with S-9's events), Q13 (the role cards), Q14 (the flat shapes, larger, nothing fetched before "Enter"), Q15 (the woman's, the man's, and the dinosaur's lines), Q16 (the hint), Q19 (the dog's line).

- Step 1's legend: "Step 1: Select your role". Its instruction: "Choosing a role takes you to step 2."
- Engineer (outcome card and the radio's description): "The twin answers at each topic's full depth: the architecture, the trade-offs, and how the systems work. The facts are the same on either role; only the depth changes."
- Not an engineer: "The twin will describe projects and goals as if talking to a non-technical person: what the work does and why it matters, without jargon. The facts are the same on either role; only the depth changes."
- Under both: "You choose once for this visit; reload the page to choose again."
- Before a choice: "Choose a role to see how the twin will talk with you."
- Step 2's legend: "Step 2: Select your avatar".
- Woman: "A generic woman. She takes the twin's paper and, in the 3D room, walks where you steer."
- Man: "A generic man. He takes the twin's paper and, in the 3D room, walks where you steer."
- Dinosaur: "A generic dinosaur. In the 3D room it can eat chunks of the desk and a few other things in the room, and they grow back." (not the page's Q15 draft: see "Departures", 4; asked)
- Dog: "A dog. It walks the room and talks with the twin like any visitor." (Q19; no breed; the approval's disclosure line stays whole on the credits page)
- A chosen card's word: "Selected".
- The hint under the steps: "Choose a role and an avatar to enter." (FR-024's words)
- The loader's hint 6: "Your role sets the twin's depth: "Engineer" for each topic's detail, "Not an engineer" for the overview, with the same facts in both."

**One difference between the page and the spec, asked.** The page's Q13 quotes the "Not an engineer" draft as "The twin describes the projects and goals …" (`probe-pick-029`'s N1); spec 029's Q11, which this task follows, has "The twin will describe projects and goals …", which is the Author's example word for word ("The twin will describe projects and goals as if talking to a non-technical person"). CLAUDE.md keeps a quote in its source's words, so the card ships the spec's. Asked on the page (`/night/io/out/questions.md`), recommended: his words, as shipped.

**The dinosaur's line, asked.** The page's Q15 draft can't ship: "laptop" and "chalkboard" are piece IDs (departure 4). Asked, with the shipped line recommended.

**The intro, asked.** FR-024 keeps the intro, "Choose your path and an avatar, then enter. …", which still says "path" where everything around it now says "role". Shipped unchanged; asked on the page, recommended: "Choose your role and an avatar, then enter. …".

## Departures from the plan, each recorded in `plan.md` in the commit that made it

1. **The role cards' descriptions live once, in the outcome card** (§R-D2). The plan's card holds "the line (span with an id)"; for a role, the line is its two-sentence description, which the outcome card also shows. Printed in both, it would show twice side by side. So each role's description is a `p` in the outcome card (`#choice-role-<id>`), the unchosen one `hidden`, and the role radio's `aria-describedby` points to it (an accessible description reads hidden text; axe passes it in three states). The role card shows its mark, its name, and the chosen mark and word. Each radio is named by `aria-labelledby` its name's `span`, so the line and "Selected" don't join its name (`nameOf` still gives "Engineer", …, as every test that names the radios expects).
2. **The test's pending task** (§R-D5): the plan said "fake timers". `renderChoice` takes no clock (its signature stays, `app.ts:549`), so the move uses the page window's `setTimeout(…, 0)`; the test runs one task of the jsdom window's own timers (`tasks(v)`), which come in order after the move's. No `vi.useFakeTimers`, which would patch node's timers, not the jsdom window's.
3. **The hint's test reads spec 012's The Hint Copy** (§R-D5, §9, T-D03). The plan said `hints.test.ts` would keep passing on the names alone. It doesn't: its first case (`hintCopy()`) reads each hint's words from `specs/012-loading-screen/spec.md`'s table, so changing `hints.yaml` alone failed it (output below). Row 6 of that table changes with the hint (the one word), and spec 029's Amendments gains the row. The test is unchanged. If he overturns Q16, both go back together.
4. **The dinosaur's line names no piece by its ID** (§R-D1, §R-D5; commits `bd94dda5`, the test, and `32b1e820`, the line). The R-6 sweep of `test/ui` and `test/room` found one failure: the source scan (spec 004's FR-007, `build/room/scan.ts`, `test/room/scan.test.ts`), which refuses any ID only the room's data defines in code. The Q15 draft's "the laptop" and "the chalkboard" are piece IDs (`laptop`, `chalkboard`), in `cards.ts:47` and in the test (with "bicycle" in the test's negative check). The scan's own fix, "takes the value from the bundle", isn't open to the choice screen: which pieces are edible is in the lazy 3D part (`RoomScene`'s placements), not in the page's index, and nothing loads before "Enter". I didn't respell the words around the scan. The line now names only the desk ("A generic dinosaur. In the 3D room it can eat chunks of the desk and a few other things in the room, and they grow back."), the test holds it to the composed room (the model bundled, the desk edible, at least two more), and a new case asserts that no placement's or piece's ID stands in any card's words. Test first: the reworked cases were committed failing (output below), then `cards.ts`. Asked on the page, with this line recommended and, as the other option, a later spec that puts the edible pieces' names in the index.

## Gotchas met

- `instanceof Element` and `new Event(…)` are the page's realm's; the tests' documents are jsdom windows under vitest's node environment, so `choice.ts` duck-types the target (`closest`) and dispatches `new win.Event("change")`.
- `room.css`'s reduced-motion rule (`.choice *`) sets `transition: none !important` but not `transform`, so a hover lift outside `no-preference` would still move a card under reduced motion; the lift and its transition are both inside `@media (prefers-reduced-motion: no-preference)`, and the test refuses `transition`, `transform`, or `animation` anywhere else in `choice.css`.
- `room.css`'s focus ring is on the radio (`.choice input:focus-visible`), which now sits under its card at opacity 0; the card takes the same ring (`.choice-card:has(input:focus-visible)`, 2 px `#0b4f9c`). `a11y.test.ts`'s ring case still finds room.css's rule on the radio.
- jsdom implements neither the label's focus on activation nor a radio group's arrow keys; the tests do what a browser does, step by step, as plan §R-D3 describes.

## For his look: what only a real browser can show

- **The arrow keys' synthetic click.** That an arrow key in the role group fires `click` with `event.detail` 0 (so focus stays in step 1) in Chrome, Firefox, and Safari. jsdom can't fire it; the test dispatches it by hand.
- **The pointer's click and the label's activation.** That a mouse click and a tap on a role card land focus on step 2's card (the label's activation focuses the radio in step 1 first; the move runs a task later). Also a tap's `click` carrying `detail` 1 on iOS Safari and Android Chrome.
- **Space.** That Space on a role radio checks it and moves focus once keyup is done, in each browser (Chrome activates on keyup; the move is a task later, so either order works).
- **A screen reader**: the step's legend, the card's name, its checked state, and the description (the role's from the hidden outcome paragraph); "Selected" not read twice.
- **Forced colours** (Windows High Contrast): the chosen card's `Highlight` border and its check and word.
- **Hover and the 2 px lift**, and none under reduced motion.
- **The phone**: the steps at 390 and 320 px (one column below 22rem, two avatar columns to 40rem); every card's 44 × 44 px, nothing sideways.
- **`:has()`**: the chosen look, the ring, and the 64rem page need it (Chrome 105, Safari 15.4, Firefox 121). In an older browser the radio stays focusable and checkable but the card shows no chosen look; the outcome card still changes.
- The words, the marks (a code bracket, a speech bubble), the colours, and the card's look: his.

## Commands and their output

Every vitest run from `apps/web/` with `--maxWorkers=2`.

### T-D01, RED (commit `81058c2d`)

```
$ npx vitest run --maxWorkers=2 test/ui/choice-cards.test.ts test/ui/choice.test.ts
     × asks for a path, engineer or not, and one of intent 000's four placeholder avatars, named, with previews
     × numbers the steps in his words, with step 1's instruction, the hint, and Enter after them
     × gives step 1 a card per role, each a label holding its radio, its mark, and its name
     × describes each role's radio by its description, and its outcome card isn't a live region
     × shows the outcome card's three states: before a choice, and each role's description and the line under both
     × gives step 2 a character card per visitor: its picture, its name, and its line, in the code's order
     × chooses nothing for the visitor, and each card's 'Selected' word is hidden from assistive technology
     × moves on a pointer's click on a role card, after the click and the label's activation, not on pointerup
     × moves to step 2's chosen card, if one is chosen, else its first
     × moves on Enter on a role card, choosing it, and Enter in step 1 submits nothing
     × moves on Space on a role card (the browser's own click, detail 0, between keydown and keyup)
     × keeps focus in step 1 on the arrow keys, whose click (detail 0) and change choose the next role
     × shows a chosen card by more than colour: a border at 3:1, a check mark, and the word 'Selected'
     × keeps the radio behind its card focusable and in the accessibility tree, and rings the card on focus
     × gives hover and focus looks of their own, distinct from the chosen one
     × keeps a chosen card's system-colour border, its check mark, and its word in forced colours
     × moves a card only under prefers-reduced-motion: no-preference, at most 150 ms
     × puts step 1's cards and the outcome card in a row, and step 2's four cards in a row, at 1280 px
     × stacks step 1 and takes two columns for step 2 below 40rem (600 px)
     × takes one column below 22rem (320 px), with no track or width that scrolls sideways
     × widens the page to 64rem for the choice screen alone, and keeps every card at least 44 × 44 px
     × names eating only while the room's bundle carries its model, and names the pieces it can eat
 Test Files  2 failed (2)
      Tests  22 failed | 12 passed (34)
```

The dinosaur's case failed on the card's line (`expected '' to contain 'the desk, the laptop, the busy sign, …'`), its bundle half passing. The 12 that passed on the old screen are guards that hold before and after: the 8 other cases of `choice.test.ts`, no move from step 2, nothing sent before "Enter", axe in three states, and room.css's reduced-motion rule.

### T-D02, GREEN (commit `356eb7ba`)

```
$ npx vitest run --maxWorkers=2 test/ui/choice-cards.test.ts test/ui/choice.test.ts
 Test Files  2 passed (2)
      Tests  34 passed (34)

$ npx vitest run --maxWorkers=2 test/ui/choice-cards.test.ts test/ui/choice.test.ts test/ui/a11y.test.ts test/ui/pdf-download.test.ts test/room/hints.test.ts test/ui/loading.test.ts test/room/quality.test.ts test/ui/pause.test.ts
 Test Files  8 passed (8)
      Tests  155 passed (155)
   Duration  159.38s (tests 69%, import 30%, transform 1%)
```

### T-D03, the hint

`hints.yaml` alone:

```
$ npx vitest run --maxWorkers=2 test/room/hints.test.ts
     × are fifteen, in The Hint Copy's order and words, each built into the index
 FAIL  test/room/hints.test.ts > the repository's hints (T019) > are fifteen, in The Hint Copy's order and words, each built into the index
AssertionError: expected [ …(15) ] to deeply equal [ …(15) ]
-   "Your path sets the twin's depth: \"Engineer\" for each topic's detail, \"Not an engineer\" for the overview, with the same facts in both.",
+   "Your role sets the twin's depth: \"Engineer\" for each topic's detail, \"Not an engineer\" for the overview, with the same facts in both.",
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```

With spec 012's row 6 (commit `58a353d5`):

```
$ npx vitest run --maxWorkers=2 test/room/hints.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### R-6: all of `test/ui` and `test/room`, once, on the T-D03 tree (commit `69ee6e00`)

```
$ npx vitest run --maxWorkers=2 test/ui test/room
     × finds 0 IDs only the room's data defines in the room's code
 FAIL  test/room/scan.test.ts > the committed tree (T107; FR-007, SC-001, User Story 1 scenario 4) > finds 0 IDs only the room's data defines in the room's code
+     "FR-007 apps/web/src/choice/cards.ts:47: holds \"chalkboard\", which only the room's data defines",
+     "FR-007 apps/web/src/choice/cards.ts:47: holds \"laptop\", which only the room's data defines",
+     "FR-007 apps/web/test/ui/choice-cards.test.ts:65: holds \"chalkboard\", which only the room's data defines",
+     "FR-007 apps/web/test/ui/choice-cards.test.ts:65: holds \"laptop\", which only the room's data defines",
+     "FR-007 apps/web/test/ui/choice-cards.test.ts:576: holds \"chalkboard\", which only the room's data defines",
+     "FR-007 apps/web/test/ui/choice-cards.test.ts:576: holds \"laptop\", which only the room's data defines",
+     "FR-007 apps/web/test/ui/choice-cards.test.ts:579: holds \"bicycle\", which only the room's data defines",
 Test Files  1 failed | 229 passed (230)
      Tests  1 failed | 4093 passed | 1 skipped (4095)
   Duration  2513.98s (tests 68%, import 32%)
```

(The scan's hit lines are from the same failure, run alone with `npx vitest run --maxWorkers=1 test/room/scan.test.ts`.) No other test pins the screen's old words: besides `choice.test.ts:44-47` and the hint (T-D03), the new words broke nothing (plan R-6). `twin-2d.test.ts` didn't flake in this run.

### The dinosaur's line, reworked (departure 4)

The test first (commit `bd94dda5`), on the old `cards.ts`:

```
$ npx vitest run --maxWorkers=2 test/ui/choice-cards.test.ts test/room/scan.test.ts
     × finds 0 IDs only the room's data defines in the room's code
     × gives step 2 a character card per visitor: its picture, its name, and its line, in the code's order
     × names eating only while the room's bundle carries its model and the desk is edible, with others besides
     × names no piece or placement by its ID on any card (spec 004's FR-007: a piece's move stays a data edit)
+     "FR-007 apps/web/src/choice/cards.ts:47: holds \"chalkboard\", which only the room's data defines",
+     "FR-007 apps/web/src/choice/cards.ts:47: holds \"laptop\", which only the room's data defines",
 Test Files  2 failed (2)
      Tests  4 failed | 39 passed (43)
```

Then the line (commit `32b1e820`):

```
$ npx vitest run --maxWorkers=2 test/ui/choice-cards.test.ts test/ui/choice.test.ts test/room/scan.test.ts
 Test Files  3 passed (3)
      Tests  52 passed (52)
```

### At the tip: the files this group adds or changes, those covering them, and the scan

```
$ npx vitest run --maxWorkers=2 test/ui/choice-cards.test.ts test/ui/choice.test.ts test/ui/a11y.test.ts test/ui/pdf-download.test.ts test/room/hints.test.ts test/ui/loading.test.ts test/room/quality.test.ts test/ui/pause.test.ts test/room/scan.test.ts
 Test Files  9 passed (9)
      Tests  173 passed (173)
   Duration  176.63s (tests 69%, import 30%, transform 1%)
```

### `make lint` (from the worktree's root, at the tip; `make setup` first, exit 0, "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks"), exit 0, shellcheck's file list cut

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
880 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- …
```

`make test` and `make evals` were not run: the brief's rule 4 gives the one full `make check` to T-INT, and each group its own files and `make lint`.

## Refusals

None: no hook or bash-gate refusal in this session.

## What's left

- The review, by a worker who wrote none of it.
- The Author's answers on the page: Q11 to Q16 and Q19, and the three questions above (the "Not an engineer" wording; the intro's "path"; the dinosaur's line). An overturned answer is reworked before he merges.
- His look (SC-008), with the real-browser list above.
- T-INT: the merge with groups A to C (no file shared with them) and the one `make check`.
