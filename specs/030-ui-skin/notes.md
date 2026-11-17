# Notes: spec-030 (spec-writer, night of 2026-11-17)

Branch `night/spec-030/spec-030` from `b6b4d847` (F's first finished commit, `impl-f3`'s tip). Documents only.

## Done

- `intent/030-ui-skin.md`, `Status: draft`: his two quotes word for word; the screenshots' descriptions marked as the orders' words.
- `specs/030-ui-skin/`: spec.md (16 clarifications, each recommended and taken under his rule 1, others listed), plan.md and tasks.md (each with "Approved provisionally by the Author's order of 2026-11-16 (night 5)" and his words), studio-round-1.md (the `ui-buttons` brief, `line.py brief`: pass on a scratch folder, SHA-256 `98eb47dd…1c4267`), analysis.md (12 findings, 9 fixed).
- 16 questions in `/night/io/out/questions.md`, each with its recommended answer and the others.

## Findings worth his eye

- The blur he saw is spec 005's (`--hud-blur`, quality levels 0 and 1) and spec 018's split rule, which spec 029's FR-002 kept on purpose ("the blur (`data-blur`) applies as today"): not something 029 added.
- In the split layout the right column is already two glass boxes, 0.25rem apart, with the walking control and "Eat" on no glass of their own: the "two halves" are a bigger slice and one panel for the controls.
- Image buttons on the selection screen would be a fetch before "Enter" (spec 029's FR-029); the plan inlines them as `data:` URIs, which the CSP already admits (Q13).
- `line.py` judges only a PNG's bytes today; transparency, insets, distinct states, and label contrast are T-DJ's, needed before R-3 records.
- The set fits main's `still` cap (300,000 bytes a file); no `assets/policy/` patch.

## Interruptions

None refused. `resume/` isn't in this worktree and `/srv/studio/` isn't reachable from it; both said in the spec and the round's file. Two text replacements in `spec.md` were made with `sed -i` before its first commit (an untracked file then); every later change to a tracked file was by Edit or Write.

## Checks run

No code or test changed, so the checks are the brief's and lint's. `line.py brief` on the scratch folder: `line: pass`, exit 0 (studio-round-1.md). `make setup` (node_modules was missing), then `make lint` at `0a50a49c`, exit 0:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
915 files already formatted
… shellcheck over the repository's shell scripts, no finding
```

`make test` and `make evals` weren't run: this branch changes no code, test, or eval.

## What's left

The implementation (T-A, T-B, T-C, T-DJ at once; T-DS after T-B04; T-INT), the round (R-1 tonight from this branch, R-2 on his studio, R-3 after T-DJ), and his: the answers to the 16 questions, his look (SC-008), his intake of the set (plan §R-D3), and every merge.

# Rework: rework-spec-030 (spec-writer, night of 2026-11-17)

Branch `night/rework-spec-030/rework-spec-030` from `35a75b2c` (`brief-ui-r1`'s tip over `spec-030`'s). Documents only. The findings are `rv-spec-030`'s, from the decision page (`docs/night-shift/2026-11-17.md` on `night/supervisor/2026-11-17`, "Twenty-fifth wake"), S-1 to S-6, I-1 to I-3, N-1 to N-5, and Q51.

## The cited lines, confirmed at `35a75b2c`

| Finding | Cited | At the base |
|---|---|---|
| S-1 | `spec.md:55` (Q5), `:170` (FR-008), `plan.md:93` (R-B3), `tasks.md:35` (T-B01) | Each as cited. |
| S-1 | `src/room/hud/split.ts:140-148`, `:220`; `room/ui-words.yaml:94`; `src/resume/view.ts:44` | `labelled(...)` at `:140-150`, `labelled("split-hint", words.close, words.esc, "Escape")` at `:220`; `hud.close: Close` at `:94`; `el(doc, "button", { type: "button", class: "resume-close" }, "Close")` at `:44`. Also read: `.split-hint` styled beside `.split-back` (`split.css:216-217`), and `.resume-close` in `src/resume/resume.css:28-42` (a light panel, ground `#fff`, `:6`). |
| S-2 | `test/ui/choice-cards.test.ts:425-436`; `tasks.md:44`; `spec.md:233` | As cited: every hex of `.choice-card:has(input:checked)`'s `border-color` and `box-shadow`, `onWhite(c) >= 3` at `:435`. **Also found, not in the review**: `:459-463` needs the card's focus ring to be `<n>px solid #rrggbb` with that hex at 3:1 on white; a `var(--hud-focus)` ring fails the regex, and `#ffd23f` is about 1.5:1 on white. Both go into T-C01's rewrite. |
| S-3 | `apps/web/Dockerfile` with `deploy/scripts/web_image.py` (`:19-32`, `:79-85`) | The cited line numbers are the Dockerfile's: its empty `room-assets`, `visitor-assets`, `twin-assets` stages at `:19-32` and their `COPY --from` at `:79-85`. `web_image.py` names the contexts at `:91-99` and hands them over at `:324-363`; its tests at `deploy/scripts/test_web_image.py:1597-1700` (visitor-assets); `scripts/test_makefile.py:328-339` pins the dev-cpu build line's contexts. `.dockerignore` doesn't drop `assets/ui`, but no `COPY` takes it: `COPY apps/web apps/web` (`:62`) is the app alone. |
| S-4 | `plan.md:95-97` | As cited. |
| S-5 | `plan.md:172-182`, `:106` | As cited. `grep -ln "tile-face\|#555555\|#1a1a1a" test/` from `apps/web/` returns `test/room/hud-contrast.test.ts`, `test/room/highlight.test.ts` (the room's highlight edge `#1a1a1a`, no button), `test/ui/hud-look.test.ts`, `test/ui/hud-over-contrast.test.ts`; `choice-cards.test.ts` isn't among them at this base (it pins `#0b4f9c` through `onWhite`), but it is C's either way. |
| S-6 | `plan.md:162`; `compose/hud.ts:164` | As cited: `tiles: { rows: 2, perRow: 3, gapRem: 0.25, padRem: 0.25, tileRem: 3.75 }`, 60 CSS px at scale 1. The brief's insets: 24 image px on the buttons (12 CSS px), 48 on the panel frame (24 CSS px). |

## The blocking findings, each fixed

| ID | Fix taken | Where |
|---|---|---|
| S-1 | "Close" is the panels' own: `.split-hint` ("Close, Escape", the pair of "Back") and `.resume-close`, beside "Back" (`.split-back`). Q51's recommended answer taken under his rule 1; the header toggles stay as the spec's own reading. Q5's premise ("the split layout has no other close") corrected as a named departure. `.resume-close` stands on the resume panel's white ground, so its boundary is computed against `#ffffff` too. | spec.md Readings, Q5, Q51, Terms, FR-008; plan §R-B3, §R-B4; tasks T-B01 (a) (b) (c), T-B03 |
| S-2 | `choice-cards.test.ts:425-436` goes into T-C01's RED rewrite, its old assertion (every hex 3:1 on white) and its new one (each colour, `var()`s resolved through `dark.css` or their fallbacks, 3:1 against `rgb(16 20 26)`) named. Also `:459-463`, the card's focus ring, which fails the same way and the review didn't name. The file is C's alone. The Assumptions, US3's scenario 3, R-C2, R-C3 and T-C03 agree. | spec.md Assumptions, US3; plan §R-C2, §R-C3, §9; tasks T-C01 to T-C03 |
| S-3 | A `ui-assets` named context: `web_image.py` hands over `<tree>/assets/ui` on `visitor-assets`' terms; `apps/web/Dockerfile` gets an empty stage after `twin-assets` and a copy to `/src/assets/ui/` before the build. Its tests are RED first and T-DS's: `deploy/scripts/test_web_image.py` on the `visitor-assets` pattern, plus `scripts/test_makefile.py`'s `WEB_BUILD` pin, which names dev-cpu's contexts one by one and would break once `assets/ui` exists. SC-007 now holds in the image. | spec.md FR-027 (new), SC-007, Amendments; plan §1, §R-D4, §9; tasks T-DS01 (c), T-DS02 |
| S-4 | The chamfer goes on a `::before` layer behind the label for every control (`isolation: isolate`, `z-index: -1`, `clip-path` on the pseudo-element only). Nothing clips the box, the outline or the glow; the glow is `filter: drop-shadow` (or `box-shadow`) on the control. `button-states.test.ts` asserts no `clip-path` on any skinned control, in every layout, view and state. | spec.md FR-011, FR-013; plan §R-B3, §R-B4, §10; tasks T-B01 (c), T-B03 |
| S-5 | §9 gives every file to one group, by name; B's grep is gone and B owns no earlier test file. A owns `hud-contrast`, `hud-over-contrast`, `hud-look`, `hud-over-layers` (the import) and `hud-split-contrast`. C owns `choice-cards`. A case B's look needs in another group's file, or in one no group owns, is named in `impl-b.md` and rewritten in T-INT02b (new), RED between A's merge and B's. A file no row names is run, never edited, by every group. | spec.md Assumptions; plan §R-A4, §R-B5, §9; tasks T-A01 (d), T-B01 (d), T-INT01, T-INT02b |
| S-6 | `border-width` and `padding` stay the CSS skin's. `border-image-width` (insets ÷ 2) with `border-image-outset: 0` draws the insets over the border and padding, so no content box moves. The buttons use `fill`; the panel frame doesn't, so the half's own glass stays the only glass (no 0.51 stack). T-DS01 checks that the tiles', `.room-walk`'s, `.room-eat`'s and the halves' border and padding are equal under both skins, that the tiles' row still holds an icon and two lines, and that no control leaves its half. The brief's insets are unchanged. | spec.md FR-024; plan §R-D4, §10; tasks T-DS01 (b), T-DS02 |

## The non-blocking findings, each with the fix taken or not

The review's own text (`review.md` in its io folder) isn't reachable from this container; each is read from the page's one-line summary, and where that reading is a guess it says so.

| ID | Finding (the page's words) | Fix |
|---|---|---|
| I-1 | "FR-008's `ui-button` class and `data-variant` against the plan's 'no DOM change', unnamed" | **Taken.** The spec's Terms and FR-008 now say what the plan does: one rule set over the controls' existing selectors (named in FR-008), each variant fixed by its selector; `ui-button` and `data-variant` are only for a control added later. No markup changes. |
| I-2 | "FR-012 for the image skin (its label tokens aren't tied to `slices.json`'s, and disabled's dashed border is lost under `border-image`)" | **Taken.** (a) The `metal-image` entry carries `slices.json`'s `labels`, set on every state of their variant, so the label drawn is the one the judge measured. The schema refuses an image skin without them, and a test holds `metal`'s normal labels equal to the brief's (spec FR-024; plan §R-D4; T-DS01 (a)). (b) The dashes move to the control's `::after`, B's, in every skin. This rework's analysis (R-2) found the CSS skin lost them too once the `::before` draws the frame. D sets only the inset (plan §R-B3, §R-D4; T-B01 (c), T-DS01 (b)). |
| I-3 | "FR-013 against the edge case on labels longer than two lines, and the real labels' fit under `metal` unmeasured" | **Taken in part.** The edge case now names the split tiles' exception, matching FR-013. The fit of the real English labels under `metal`'s uppercase and 0.06em tracking is **not measured**: jsdom has no layout, and the plan adds no browser (no download). It stays for his look (SC-008); `rv-rework-spec-030` may judge whether a font-metric estimate belongs in T-B04. |
| N-1 | "the `@supports not (backdrop-filter …)` block still makes the glass opaque" | **Taken.** R-A1 removes the whole block (`room.css:189-200`); `hud-no-blur.test.ts` refuses any `@supports` condition on `backdrop-filter`; T-A01 (d), T-A02. |
| N-2 | "two assertions that check the code against itself" | **Taken, by this reading** (the review didn't name them on the page): T-A01 (b)'s "boxes equal to `halves()`'s" now checks against numbers the test derives, and `halves()` has its own unit cases; T-B01 (a)'s "the two builds' inputs differ only by the YAML" is dropped, and SC-004 is shown by T-B04's `git status`. If the review meant others, `rv-rework-spec-030` will say. |
| N-3 | "who sets `:root[data-skin-kind="image"]`, and which `data-skin` a fallback carries" | **Taken.** The Vite plugin alone sets both, from the resolved skin; on a fallback, `data-skin="metal" data-skin-kind="css"` (plan §R-B2; T-DS01 (a)). |
| N-4 | "the selection screen's first paint is light" | **Taken.** `index.html`'s `<html>` carries `class="dark-page"` (now C's file), and `choice.ts` removes it at "Enter". The no-script fallback goes dark too, at 4.5:1, which amends the edge case. That is a question on the page (below). |
| N-5 | "your intake's route, as `docs/merge-requests/human-patches/021.md` built it" | **Taken.** The intake is `docs/merge-requests/human-patches/030.md` with 021's table (binaries copied by his hand, no patch file; approvals none; tools none). The plan, tasks and `studio-round-1.md`'s R-4 row are updated. |

## This rework's own findings (analysis.md, R-1 to R-9)

- **R-1, HIGH, fixed**: S-4's `::before` at `z-index: -1` in the control's stacking context paints over the control's `border-image`, which would hide the studio's images. Under the image skin the `::before` is off, and the control's flat face sits beneath the image.
- **R-2, MEDIUM, fixed**: the disabled dashes, above (I-2 (b)).
- **The second `choice-cards` pin** (`:459-463`), above (S-2).
- R-3 to R-9 are the non-blocking findings as fixed above.

## The brief

`studio-round-1.md`'s JSON block is byte for byte as placed. The file changed only in its R-4 row's intake path (N-5): `git diff 35a75b2c -- specs/030-ui-skin/studio-round-1.md` shows that one line.

## Questions (in `/night/io/out/questions.md`)

Two, each taken provisionally with its recommended answer: the no-script fallback dark (N-4), and how the image's insets are drawn on the 60 px tiles (S-6). Q51 is the reviewer's, already on the page; its recommended answer is taken here.

## Interruptions

None refused. Every file change was made with Edit or Write. The review's own `review.md` isn't reachable, so the non-blocking findings are read from the page's summary (above).

## Checks run

No code or test changed (documents only), so the check is lint. The first `make lint` stopped at "node_modules is missing: run make setup"; `make setup` ran, exit 0 (it noted the shared `.git/hooks` isn't writable here, which is the Author's `make git-hooks`). Then `make lint` at `9f0cb10d`, exit 0:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
915 files already formatted
{ git ls-files -z '*.sh' … } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- … (the repository's shell scripts)
exit 0
```

`make test` and `make evals` weren't run: this branch changes no code, test, or eval.

## What's left

- `rv-rework-spec-030`, a reviewer who wrote none of spec 030, on `35a75b2c..` this branch's tip.
- The groups' rework on their tips once that review passes (the supervisor's queue): B for S-1, S-4, S-5 and the `::after` (R-2); C for S-2 (both `choice-cards` cases), S-5 and `index.html` (N-4); A for S-5's file list, N-1 and N-2's derived boxes; `impl-030ds` for S-3, S-6, I-2, N-3 and R-1, from B's reworked tip. T-INT02b goes between A's merge and B's.
- His part: Q51 and this rework's two questions, his look (SC-008: the halves, the skins, the dark pages, the image's band over the tiles, the real labels' fit), his intake (`docs/merge-requests/human-patches/030.md`, after R-3's pass), and every merge.

# Rework 2: rework2-spec-030 (spec-writer, night of 2026-11-17)

Branch `night/rework2-spec-030/rework2-spec-030` from `2dd4213f` (`rework-spec-030`'s tip). Documents only. The findings are `rv-rework-spec-030`'s (R-1 to R-9), from the decision page (`docs/night-shift/2026-11-17.md` on `night/supervisor/2026-11-17`, "Thirty-third wake"), and the page's Q71 to Q75. The review's own `review.md` isn't reachable from this container; each finding is read from the page's text, which gives file:line and the fix.

## The cited lines, confirmed at `2dd4213f`

| Finding | Cited | At the base |
|---|---|---|
| R-1 | `plan.md:176`, `:178`, `:194`; `tasks.md:61-62` | As cited: §R-D4's "`.dockerignore` already lets `assets/ui` in; nothing else changes" (`:176`), its tests' bullet (`:178`), §9's DS row (`:194`), T-DS01 (c) and T-DS02. |
| R-1 | `deploy/scripts/release.py:805-822`, `web_contexts()` | The function is `:807-822` (its `def` at `:807`; `:805-806` are the blank lines before it). It loads the export's `web_image.py` and loops over a hard-coded tuple of three pairs, `(wi.ROOM_ASSETS, wi.ROOM_ASSETS_CONTEXT)`, `(wi.VISITOR_ASSETS, …)`, `(wi.TWIN_ASSETS, …)` (`:815-819`), so a `UI_ASSETS` added to `web_image.py` alone never reaches the release's build. `release.run` takes it as `contexts=web_contexts` (`:865`). **No test calls `web_contexts` today** (`grep -rn web_contexts --include=*.py` names `release.py` alone); `deploy/scripts/test_release.py` is the file that loads `release.py` (as `rl`, `:31-37`) and holds the web image's release case (`:379`, `test_the_site_is_checked_in_the_web_image_built_from_the_export`), so T-DS01 (c)'s new case goes there. `release.py` isn't a human-only path (`.claude/settings.json` names no `release`); only running its target is the Author's. `web_image.py` itself, at this base: the constants at `:92-99`, the three `room_assets` checks at `:318-335`, the three `--build-context` pairs at `:357-370`; the plan's `:324` and `:363` are the visitor pair's, near enough to find, and are corrected below. |
| R-2 | `plan.md:59`, `:190`, `:198`; `tasks.md:29`, `:33`, `:70`; `plan.md:52` | As cited. |
| R-2 | `apps/web/test/ui/hud-over-room.test.ts:151`, `:182`, `:188` | `expect(want.size).toBe(0)` (`:151`, the split layout at the room's framing: "none is marked, no rule applies", with `:152-153` asserting no over-room rule matches any `.room` element); `expect(marked(v).size).toBe(0)` (`:182` and `:188`, the re-fit case at 1920 × 1080). The file's `expected()` (`:73-98`) marks a right-column part only where its box meets the room's, which A's "both halves always" changes for every case that calls it (`:147`, `:160`, `:163`, `:170`, `:186`). |
| R-2 | `hud-over-walking.test.ts:158`, `:163` | `:158` is the `it(` line of "offers the walk at the split windows with nothing marked: the offer isn't the walk"; `:163` its `expect(marked(v).size).toBe(0)`. Its `partBoxes`/`expected()` (`:35-87`) are the same geometry as above, so `:131-156` and `:170-194` change with it; `:177`'s "the case discriminates" (`pick(parts, frame)` against `rest`) must then compare the parts the geometry still decides (`.talk-sheet`). `:202` and `:206` (the stacked layout, nothing marked) stand: the stacked layout has no halves. |
| R-3 | `plan.md:171`, `spec.md:151`, `tasks.md:61` | As cited. Also read: the brief's geometry (`studio-round-1.md`'s block): 192 × 96 px buttons, a 16 px chamfer, the frame inside a 24 px margin, an outermost ring of alpha 0, and the selected glow "inside the image, fading to alpha 0 before the outermost pixel". So the transparent part of each image isn't only its corners: it is a ring along every edge, wider where the glow fades. That shapes R-3's fix (below). |
| R-4 | `plan.md:206`; `compose/hud.ts:161-164`; `split.css:102` | As cited (§10's S-6 risk; the tiles' table, `tileRem: 3.75`). |
| R-5 | `plan.md:137`, `tasks.md:44`; `choice.css:108-111` at `a9a7931c` | As cited: `border-color` and both `box-shadow` colours are `var(--btn-secondary-selected-glow, var(--hud-focus))`. Also read at `impl-030b`'s `0366e983`: `metal` secondary selected glow `#46d7f0`, `plain` `#ffd23f`; the cards' face is `var(--btn-frame, #1f252d)` (`choice.css:89`), `metal`'s frame `#2a3038`, `plain`'s `#10141a`. |
| R-7 | `src/resume/resume.css:28-42`; `spec.md:222-231` | As cited: `.resume-close` shares its rule with `.resume-pdf`; the Amendments table has no row for 002's or 018's Close. |
| R-8 | `tasks.md:37` | As cited. |
| R-9 | `plan.md:99` | As cited. |
| Q71, Q72 | `impl-030b`'s plan at `0366e983` | §R-B1 "As built" (`ring` per variant: `metal` `#14171c` primary, `#ffd23f` secondary) and §R-B4 "As built" (the boundary two-tone; the ring "drawn inside the face (§R-B3, as built)"). Its §R-B3 "As built" isn't written yet at that tip (`wip(impl-030b): T-B03, the component`); the page's Q72 says it will be. |

## The blocking findings, each fixed

| ID | Fix taken | Where |
|---|---|---|
| R-1 | `web_image.py` exports one tuple of (folder, context) pairs, `ASSET_CONTEXTS` (room, visitors, twin, ui, in the Dockerfile's stage order). Its own `main` builds its `--build-context` pairs from that tuple, and `release.py`'s `web_contexts()` loops over `wi.ASSET_CONTEXTS` instead of its own three (`:815-819`), so the released image gets `ui-assets` too. RED first, in `deploy/scripts/test_release.py`, the file that loads `release.py` (confirmed: no case anywhere calls `web_contexts` today). The new cases: `ui-assets=<src>/assets/ui` exactly when that folder is the tree's own directory; none when it is absent, a link, or a file, or when `assets/` is a link; every pair of `ASSET_CONTEXTS` the tree holds; `[]` for an image other than `web`. Also checked: F's `release.py` hunks (on `merge-f-4`'s branch) are all before `:750`, so none is in `web_contexts()`. | spec FR-027, SC-007; plan §1, §R-D4 (a new bullet, and the tests' bullet), §9's DS row; tasks T-DS01 (c), T-DS02 |
| R-2 | `hud-over-room.test.ts` and `hud-over-walking.test.ts` are A's. Both are rewritten in T-A01 (d)'s RED, with old and new assertions named. Their `expected()` now marks the right column's parts at rest and walking: split `.room-list`, `.hud-bar`, `.room-walk`, `.room-eat` where offered, and `.hud-half`; column and dock `.hud-panels`, `.hud-bar`, `.room-walk`, `.hud-half`. `.talk` and `.talk-sheet` still follow 029's geometry. The rewritten lines are `:151`, `:182`, `:188` and `:163`; `:177`'s discriminating check moves to `.talk-sheet`. **Also found by this rework**: `hud-split-dog.test.ts:96` (at least 1,601 split stages hold the five entries). I measured it with a scratch vitest under `/tmp`, outside the tree: with A's slice the count drops to about 1,558. So that file is A's too, its count is rewritten, the change is named as a departure, and it is Q76. Every other `hud-*` file is placed by name in §R-A4: A's already, or "run, untouched" with its reason. A "run, untouched" file that A's RED finds failing becomes A's in that commit, named. T-INT02b is now B's look's alone. | spec Assumptions, Amendments, Q76; plan §R-A4, §9's A row and its no-row rule (`:198`); tasks T-A01 (d), T-A05, T-INT02b |
| R-3 | **The reviewer's `::before` route, plus one change that I argue for.** Under the image skin the image is drawn on the `::before`, with `border-style: solid`, `border-width: 0`, `fill`, the insets ÷ 2, and `-outset: 0`. The `::before` keeps its own octagon `clip-path`, and its inset shadows are `none`. The control is `background: transparent` with `border-image: none`, so FR-013 still holds for it. **The change**: the face colour on the `::before` is clipped to the image's centre, by `padding` equal to the band and `background-clip: content-box`. The reviewer's version clips the face colour only to the octagon. But the brief's images have a transparent outermost ring along every edge, and a selected glow that fades to alpha 0 inside the image. An octagon-clipped face would still show under both as a flat strip along each straight edge. The centre is opaque by the brief, so the clipped colour never shows when the image decodes. When the image fails to decode, the label sits on a flat face the size of the centre, with the band clear over the glass. At the brief's numbers the centre's corner, (12, 12) CSS px, lies inside the 8 px chamfer's cut. T-DS01 (b) reads the `border-image-*`, `background-clip` and `padding` from the `::before` by the cascade, and checks that the control's own `background-color` is `transparent` and its `border-image-source` is `none` under both skins. | spec FR-024, the edge case, Degraded mode; plan §R-B3, §R-D4 (the "image on the `::before`" bullet replaces the first rework's), §10; tasks T-DS01 (b), T-DS02 |

## The others, each with the fix taken or not

| ID | Fix |
|---|---|
| R-4 (and Q74) | **Taken**, Q74's recommended answer. T-DS01 (b) lists, in `impl-ds.md`, each control whose content box crosses its image's band. The round measures each variant's label colour over the band's pixels of alpha ≥ 0.5, over white and over black, for each of its five files, and `#ffffff` over `panel-frame.png`'s band. R-3 does it if its session can; otherwise T-DS05 does, from the handoff, read-only. The numbers go in studio-round-1.md beside the centre's. It is never a `line.py` finding, and FR-022 is unchanged. A ratio under 4.5:1 goes to his look and to round 2's brief. `judge-ui-r1` was already queued with its own brief, so whether R-3 measures is the supervisor's call; T-DS05 covers the case where it doesn't. |
| R-5 | **Taken, the second of the review's two fixes**: T-B01 (a) checks, for every skin, `--btn-secondary-selected-glow` at 3:1 on `rgb(16 20 26)` and `--hud-text` at 4.5:1 on `--btn-frame`. These are the two tokens C's cards read (`choice.css:89`, `:108-111`). Today's values: the glow is `#46d7f0` in `metal` and `#ffd23f` in `plain`; the frame is `#2a3038` and `#10141a`. **Not taken**: T-INT02a rerunning `choice-cards.test.ts` with the built skins, because B's own test already covers every skin. C's file doesn't change. |
| R-6 (and Q75) | **Taken**, Q75's recommended answer. T-B04 estimates each tile label's lines from `IBMPlexSans-Bold.woff`'s advance widths, using inline `python3 -I -B -c` that writes nothing to the tree, at each split window's scale. A tile whose label runs past two lines keeps its words' own case under every skin, through a `button.css` rule naming the tile's own class. |
| R-7 | **Taken**: Amendments rows for 002's `.resume-close` (its shared rule with `.resume-pdf` named; `.resume-pdf` keeps 002's look) and 018's `.split-hint`. Also a row for 029's ring (Q71, Q72), and one for 026's count (Q76). |
| R-8 | **Taken**: T-B01 (d) runs the whole `apps/web` suite on B's GREEN tip, in place of its list. |
| R-9 | **Moot**, so not written into `impl-b.md`: with Q72 taken, the selected glow is an inset `box-shadow` on the `::before`, inside the face. No skinned control has a `filter`. T-B01 (c) asserts that. The forced-colours `filter: none` stays as a guard. |
| Q71 | **Taken**, as `impl-030b` built it: the boundary is two-tone. The border is 3:1 against the face, and the edge (border or face) is 3:1 against the glass at 0.3, 0.6, 0.78 and 1 over white and over black, the dark ground, and the resume panel's white. spec FR-012 and US2's scenario 2, plan §R-B4 and T-B01 (a) agree. |
| Q72 | **Taken**, as `impl-030b` built it: the ring is drawn inside the face, in the variant's `ring` colour, and the glow is drawn inside the face. The plan's first-rework line "B sets no `outline`" is replaced, as a named departure. I added one constraint for S-4's `::before` chamfer: the ring's `outline-offset` must put its outer corners inside the octagon (7 px at `metal`, 8 when selected). The chamfer stays on the `::before` (S-4), not on a `clip-path` on the control, so B's rework still moves it there. spec FR-009, FR-012, FR-013; plan §R-B1, §R-B3, §R-B4, §R-D4; T-B01 (c), T-B03. |
| Q73 | **Taken**: T-INT02 rewrites `hud-look.test.ts`'s "every HUD control a tile" (`:112-136`) and its resume case (`:138`, now `.resume-close` the skin's), and the tile colour pairs of `hud-contrast.test.ts` and `hud-over-contrast.test.ts`, to read the skin with `data-skin` set. The old assertions are seen failing and the new ones passing before the dead declarations are removed. Plan §9's INT row names those files. |

## Which group's rework each change reaches

| Group (state at this rework's base) | What reaches it |
|---|---|
| A, `impl-030a` (running; at `7727aef1`, "setup and reading") | R-2: rewrite `hud-over-room`, `hud-over-walking` and `hud-split-dog` in T-A01 (d); T-A05's run list, by name; §R-A4's placing of every `hud-*` file. Q76. If A's RED commit is already made by the time this lands, A adds these three as a second RED commit, each seen failing, before T-A04. |
| B, `impl-030b` (running; at `0366e983`, T-B03 begun) | Q71 and Q72 now agree with what B built; B changes nothing for them, except that the ring's offset must keep its corners inside the `::before`'s octagon, and the glow is an inset shadow on the `::before`, once S-4's rework moves the chamfer there. R-5: two more checks in T-B01 (a). R-8: the whole suite in T-B01 (d). R-9: no `filter`. Q75: T-B04's estimate, and maybe a `text-transform: none` rule for a tile. |
| C, `impl-030c` (done; tip `20da89f3`) | **Nothing from this rework.** R-5's fix is B's test, not C's file. C's rework for the first rework's S-2 and N-4, and anything `rv-030c` finds, are unchanged. |
| DJ, `impl-030dj` (done; reviewed, approved) | Nothing. |
| DS, `impl-030ds` (not started) | R-1: `ASSET_CONTEXTS`, `release.py`'s `web_contexts()`, `test_release.py`. R-3: the image on the `::before`, the face colour clipped to the centre, and T-DS01 (b)'s new reads. Q74: the band's crossings in T-DS01 (b), and the band measurement in T-DS05 if R-3 hasn't done it. |
| The round, `judge-ui-r1` (queued) | Q74: the band measurement, optional for it ("if this session can"). Its brief is the supervisor's. |
| INT, `int-030` (not started) | Q73 in T-INT02; R-2's narrowing of T-INT02b to B's look alone. |

## Questions (in `/night/io/out/questions.md`)

One, Q76 in the spec's text: A's slice costs the split list about 43 of the 1,601 stages that hold "Dog". Recommended: accept (the list scrolls), and rewrite `hud-split-dog.test.ts`'s count in A's RED. Others: a slice of `0.5rem × scale`, or taking the slice from the tiles' block. Taken provisionally under his rule 1. Q71 to Q75 are already on the page; their recommended answers are taken here.

## Interruptions

None refused. Every tracked file was changed with Edit or Write. Two scratch vitest files were written with the Write tool to `/tmp/rework2-spec-030/dog/` (outside the tree) and run with the root's `vitest --root` there, read-only on the tree. One run needed a longer `--testTimeout`. They are left there for the runner's cleanup, since a recursive delete outside the workspace is the bash gate's to refuse (the page's Q20). `make setup` ran first (`node_modules` was missing), exit 0; it noted the shared `.git/hooks` isn't writable here, which is the Author's `make git-hooks`. The review's own `review.md` isn't reachable from here; each finding is read from the page, which gives its file:line and fix.

## Checks run

Documents only, so the checks are lint and the analysis. `make lint` at `ef271eee`, exit 0:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
915 files already formatted
{ git ls-files -z '*.sh' … } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- … (the repository's shell scripts)
exit 0
```

`git diff 2dd4213f -- specs/030-ui-skin/studio-round-1.md` is empty: the brief's JSON block is byte for byte as before, and R-3's "The record" is left to `judge-ui-r1`. The analysis is re-run and appended to analysis.md ("Re-run after rework 2"): 5 new findings, 4 fixed in the text, 1 recorded; 0 CRITICAL; §9's rows disjoint except for the designed sequential shares. `make test` and `make evals` weren't run: this branch changes no code, test, or eval.

## What's left

- `rv-rework2-spec-030`, a reviewer who wrote none of spec 030, on `git diff 2dd4213f` this branch's tip.
- The groups' reworks on their tips once that review passes: A for R-2 and Q76, B for Q72's ring offset and `::before` glow, R-5, R-8 and Q75 (beside the first rework's S-1, S-4 and S-5), DS for R-1, R-3 and Q74, from B's reworked tip. C has nothing new from this rework.
- Not decided here: whether `judge-ui-r1` measures the labels over the band (Q74), which is the supervisor's brief; otherwise T-DS05 does.
- His part: Q71 to Q76, his look (SC-008: the halves, the skins, the inside ring and glow, the image on the `::before` in a browser, the tiles' labels' fit), his intake (`docs/merge-requests/human-patches/030.md`, after R-3's pass), and every merge.

# Rework 3: rework3-spec-030 (spec-writer, night of 2026-11-17)

Branch `night/rework3-spec-030/rework3-spec-030` from `8e83e7fc` (`rework2-spec-030`'s tip). Documents only. The findings are `rv-rework2-spec-030`'s, R-1 (blocking) to R-5, read from the decision page (`docs/night-shift/2026-11-17.md` on `night/supervisor/2026-11-17`, "Fortieth wake"), which gives each with its file:line and fix. Q76, the name rework 2 gave its own question, is the page's Q81 (R-4), and every mention below uses Q81.

**The tips read.** `impl-030a`: `7aad7cd9` when this rework started (a save point of T-A05), then `c0cd9826` (T-A05's notes, `tasks.md`'s T-A01 to T-A05 ticked), which this rework's placements and merge checks use; its RED commit `e053a0cd`, `impl-a.md`'s table, and its `plan.md` "As built" (§R-A2, T-A03's; §R-A3, T-A04's). `impl-030dsb`: `58cd74fc` at the start, then `7ac200da` (its notes, done).

## The cited lines, confirmed at `8e83e7fc` (and A's and DSB's tips)

| Finding | Cited | Found |
|---|---|---|
| R-1 | `plan.md:69` ("run, untouched": `hud-a11y`, `hud-notes`, `hud-model.test.ts`) | As cited. All three are rewritten in `e053a0cd` (`hud-a11y:197-198`, `hud-notes:94`, `hud-model.test:157`). |
| R-1 | `test/room/hud.test.ts` `:60`, `:81`, `:83-84`, `:87-89` | As cited. `:81`, `:83-84` and `:87-89` are rewritten in `e053a0cd`, and so are `:290` and `:314`. `:60` (the column band at 1920 × 1200) isn't: it would break under rework 2's `hudBoxes` reading of §R-A2, and doesn't break under A's built design, which this rework takes. |
| R-1 | `test/room/hud-split-geometry.test.ts` `:62`, `:66` | `:62` as cited. A rewrote `:62`, `:63` and `:65` (`c.all`); `:66` is the loop after them, which A left alone. |
| R-1 | `stages-checks.test.ts`, `test/ui/pick.test.ts`, the two snapshots (Q83); `hud-frame`, `hud-stats` unplaced | As cited. `stages-checks:152` and `pick:195`, `:201` are rewritten. `hud-frame` and `hud-stats` are under `test/room/`; neither reads a box from `compose/`. |
| R-1 | `tasks.md:31`'s valve | As cited. RED runs on the unchanged tree, where the old tests pass, so a valve placed in the RED run can't fire. |
| R-1 | `plan.md:65`, `tasks.md:31` (the over-room sets), `plan.md:47-48` | As cited, against `hud-over-room.test.ts:99-106` and `hud-over-walking.test.ts:81-93` at `e053a0cd` (split: `.room-list`, `.hud-bar`, `.room-walk`; column and dock: `.hud-panels`, `.hud-bar`; `ELEMENTS` unchanged) and A's §R-A2 "As built" (`compactBoxes`, the bar's cluster alone). |
| R-2 | `split.css:549-556`; `02a5c30a`'s `button.css:73` | The rule is `:548-556` (its selectors start at `:548`; `box-shadow: 0 0 0 0.25rem …` at `:554`). `button.css:73` is `box-shadow:` on the control, with the bevel and glow insets, as cited. |
| R-4 | the page's Q81 | As cited: the page's Q81 is rework 2's question, named "Q76" in spec.md. Q82 and Q85 are `impl-030a`'s. |
| R-5 | `web_contexts()` would raise `AttributeError` | As cited, at `impl-030dsb`'s `release.py:815` (`for folder_name, context in wi.ASSET_CONTEXTS:`). `run()` catches only `Refused`, `OSError` and `subprocess.TimeoutExpired` (`release.py:622-630`), so the result would be a traceback. |

## The blocking finding, fixed

| ID | Fix taken | Where |
|---|---|---|
| R-1 | **Every test file A's change reaches is placed, case by case, from what A actually committed rather than from reading the plan.** Plan §R-A4's closed list is replaced by a table with each case's file (and spec), line, old assertion, new assertion and placement. The "A's, rewritten" rows come from `impl-a.md`'s table at `e053a0cd`. `hud-a11y`, `hud-notes` and `hud-model.test.ts` move to A's. New A rows: `test/room/hud.test.ts`, `hud-split-geometry`, `stages-checks`, `test/ui/pick.test.ts`, and the two snapshots (Q83). `hud-frame` and `hud-stats` are "run, untouched". **Then a grep of `apps/web/test/` for every number and formula A's change moves.** The patterns are listed in plan §R-A4, and every hit is placed. It found three files that no list had named and that A hadn't rewritten: `test/lookdev/phone.test.ts`, `test/room/geometry.test.ts` and `test/room/report.test.ts`. **Run on an export of A's tip, all three fail: 14 cases** (pasted below; `geometry:376`'s and `report:393`'s "320 × 322 and 62 others" were found by the run, not the grep). It also found two files that will fail once A takes the first rework's N-1, which A's branch predates: `degraded:923-944` and `loading-a11y:174-185`, the `@supports` block, which is still at `room.css:190` on A's tip. **The valve is reworded:** A runs the whole suite on the GREEN step's tree before each GREEN commit, and a case that fails goes into a RED test commit made before that GREEN commit, named. For the GREEN commits A has already made, the cases go into one RED commit on A's tip, each with its old assertion's failing run pasted (T-INT02b's "found at integration" form). **A's "As built" is taken into the design**: plan §R-A2's bullets now state the column's slice in `compactBoxes` (`hudBoxes`' band unchanged, so `hud.test.ts:60` stands), `halves(HalvesInput)`, the column's bottom half as the bar's cluster alone (Q85), the dock's slice from the clear area (Q82), and the list clamped at 0. §R-A3 now has the `--half-border` edge (Q84) and "marked always" as built. The over-room sets in plan §R-A4, spec.md's Assumptions and tasks are A's. A's two "As built" lists stand in plan.md word for word. | spec Clarifications (Q81, the rework 3 session: Q82 to Q85), FR-004, Amendments (two rows), Assumptions; plan header, §R-A2, §R-A3, §R-A4 (the table, the untouched list, the grep, the run, the valve), §9 (A's row, DSB's "As built" paragraph, the no-row rule); tasks header, Group A (as A built it), Group A's rework (T-A06 to T-A08, new), T-INT02, Dependencies, the checks' table |

## The others, each with the fix taken

| ID | Fix |
|---|---|
| R-2 | **Taken.** Plan §R-B3: the control's own `box-shadow` is `none` in every skin, variant and state. Every shadow B draws (bevel, highlight, glow) belongs to the `::before`, inside the octagon. Two things the cascade could otherwise paint on the control are named: spec 029's plate (`split.css:548-556`), which A's halves now apply to "Back" at rest, and `impl-030b`'s bevel on the control (`02a5c30a`'s `button.css:73`). T-B01 (c) asserts each skinned control's winning `box-shadow` is `none`, with `.split-back` and `.split-hint` inside a panel marked over the room, and that every `box-shadow` B declares sits on a `::before` rule. Plan §R-D4 and T-DS01 (b) assert the same under both skins. |
| R-3 | **For his look (SC-008), no design change.** The brief has every PNG's outermost pixel ring at alpha 0, and the judge checks that (FR-022). `panel-frame.png` is drawn at twice the CSS size from each half's box edge inward (`border-image-outset: 0`), so along each edge of a half a strip about half a CSS pixel wide shows no frame. In that strip you see the half's own glass and its 1 px `--half-border` edge (Q84), not the frame's metal. He judges it at SC-008. If it shows, round 2 has two possible routes: exempt `panel-frame.png` from the transparent-ring rule in its brief and in the judge's check, or draw the frame with `border-image-outset: 0.5px` (out over the slice by half a pixel). Neither is taken tonight. |
| R-4 | **Taken.** spec.md's "Q76" is renamed Q81 (the page's number), with "rework 2's 'Q76'" beside it wherever it was named. Q82 to Q85 are a new "rework 3" Clarifications session, each with its recommended answer taken as the page records it. The Amendments gain rows for Q82 (spec 005's reference phone stage and spec 004's smallest 2D stage) and Q85 (spec 014's W19 compact column). The 026's r4 row now cites Q81. |
| R-5 | **Taken, and asked on the page.** Plan §R-D4, T-DS01 (c) and T-DS02: `web_contexts()` reads `getattr(wi, "ASSET_CONTEXTS", None)`. If the export's `web_image.py` has no such list, it raises `Refused`, naming the file and `ASSET_CONTEXTS`, before any build. `run()` prints that as its "refused" line. The consequence: this `release.py` releases no commit from before T-DS02. The question on the page is whether to refuse or fall back to the three old pairs; the recommended answer is to refuse. **What this adds for `impl-030dsb`** (done at `7ac200da`, from this rework's base): one RED case in `deploy/scripts/test_release.py`. The scratch tree's `web_image.py` is the tree's own copy without its `ASSET_CONTEXTS` assignment, and `rl.web_contexts("web", src)` must raise `rl.Refused` naming the file and the list. That case fails on DSB's tip with `AttributeError: module 'web_image_for_release' has no attribute 'ASSET_CONTEXTS'`. Then a GREEN of `release.py`: the guard in `web_contexts()`, a few lines. The rest of DSB's work is unchanged. This is a line for DS's rework, or for a follow-up on DSB's tip. |

## Which group's rework each change reaches

| Group (state now) | What reaches it |
|---|---|
| A, `impl-030a` (done; tip `c0cd9826`) | R-1: Group A's rework, T-A06 to T-A08. The 14 failing cases in `lookdev/phone`, `room/geometry` and `room/report`. The first rework's N-1 (the `@supports` block, and `degraded` and `loading-a11y`'s cases) and N-2 (`hud-halves` against numbers it derives itself, `halves.test.ts`), which A's branch predates. The whole suite before each GREEN commit, and again at T-A08. Q81, Q82, Q84 and Q85 change nothing A built: this rework takes A's design. |
| B, `impl-030b` (rework pending, from `02a5c30a`) | R-2: the control's own `box-shadow: none`, with the bevel moved to the `::before`, beside the first rework's S-4. T-B01 (c)'s new assertion. |
| C, `impl-030c` / `rework-030c` | Nothing. |
| DJ | Nothing. |
| DSB, `impl-030dsb` (done; `7ac200da`) | R-5: the one RED case and the guard in `web_contexts()` (above), for DS's rework or a DSB follow-up. |
| DS, `impl-030ds` (not started) | R-2 in T-DS01 (b) (the control's `box-shadow` under the image skin). R-5's line if DSB doesn't take it. |
| INT, `int-030` | T-INT's dependency is now T-A08. T-INT02's `hud-look` case starts from A's rewrite. |
| His look | R-3 (the frame's half-pixel strip), beside SC-008's list. |

## Merge checks (`git merge-tree --write-tree`, which ran here; the object store is writable, the refs untouched)

Base against each tip:

```
$ git merge-tree --write-tree 8e83e7fc c0cd9826
92db1f293ad05123bac3f9471967fe6417e3a40f
100644 0513ea22521fc04b195b094dbaee58871a64f238 1	specs/030-ui-skin/plan.md
100644 3424c4ea0836da6effd1426e130d349d88823f4c 2	specs/030-ui-skin/plan.md
100644 a9ac4470929cd867c9b16bc77af0574276e8df59 3	specs/030-ui-skin/plan.md
100644 d0d8e75b2a7cd990ca9e079336de260cfb12208a 1	specs/030-ui-skin/tasks.md
100644 883714a93aa33a4818b494f2adf9605be0c436cb 2	specs/030-ui-skin/tasks.md
100644 aa79c217d22e86eba76ac84d7553834314d99017 3	specs/030-ui-skin/tasks.md

Auto-merging specs/030-ui-skin/plan.md
CONFLICT (content): Merge conflict in specs/030-ui-skin/plan.md
Auto-merging specs/030-ui-skin/tasks.md
CONFLICT (content): Merge conflict in specs/030-ui-skin/tasks.md
exit 1
$ git merge-tree --write-tree 8e83e7fc 7ac200da
e483e2694f74f654a31e052bbdb56525dc5c0253
exit 0
```

At the base, `plan.md`'s conflict was one hunk: §R-A3's tests bullet (the first rework's N-2) against A's T-A04 "As built" list inserted before it. `tasks.md`'s was A's ticks on T-A01 to T-A05 against the reworks' text in T-A01, T-A02 and T-A05. **Made clean on this side.** Both "As built" lists are in plan.md as A wrote them. §R-A3's old tests bullet is kept word for word, with the reworked bullet after it, which says it replaces the old one. tasks.md's T-A01 to T-A05 are A's ticked lines byte for byte (checked line by line against `c0cd9826`). The reworks' changes to A are T-A06 to T-A08, in a section after Group B: anything placed beside A's ticks conflicts. DSB's "As built, the DS row" paragraph is in §9 as DSB wrote it. The rework's amendment to the no-row rule stands after "Cross-group reads", because the paragraph next to DSB's must stay as it was. **This branch's tip against each** (re-run at the last commit before this note, `wip(rework3-spec-030): R-1, the three grep-found files…`, and again at the final tip; notes.md is no other branch's file):

```
$ git merge-tree --write-tree HEAD c0cd9826   →  exit 0 (no conflict)
$ git merge-tree --write-tree HEAD 7ac200da   →  exit 0 (no conflict)
$ (both at once) git merge-tree --write-tree <HEAD merged with c0cd9826> 7ac200da  →  exit 0 (no conflict)
```

Nothing is left in conflict between these three. The other branches (`impl-030b`, `rework-030c`, `judge-ui-r1`, F's) weren't asked of this task. Q86's hunk in `studio-round-1.md` isn't touched here, since this rework leaves that file alone.

## The runs on A's export

The three files the grep found, run with this worktree's `node_modules` (from `make setup`, exit 0) on `git archive c0cd9826` extracted to `/tmp/rework3-a` (two symbolic links to the node_modules folders, nothing written to any tree). From `/tmp/rework3-a/apps/web`, `vitest run test/lookdev/phone.test.ts test/room/geometry.test.ts test/room/report.test.ts`:

```
 FAIL  test/lookdev/phone.test.ts > the probe's panel, the copy's first (§7.2) > shows each field, the room's stage at the viewport, and the floor, then starts the page with the probe
AssertionError: expected { w: 384, h: 410 } to deeply equal { w: 384, h: 422 }
 FAIL  test/room/geometry.test.ts > RG6: FR-064's carve-out for side-wall selectables > lists a side-wall selectable short of its core at larger stages there too, in 3D, and refuses nothing
 FAIL  test/room/geometry.test.ts > RG6: … > lists one short of its core in 2D at the scale of larger stages, and refuses nothing
 FAIL  test/room/geometry.test.ts > RG6: … > refuses a selectable with one member on a side wall and one on the desk, which isn't side-wall
 FAIL  test/room/geometry.test.ts > RG6: … > refuses a member on another placement's anchor that is also named left-wall
 FAIL  test/room/geometry.test.ts > RG6: … > refuses a shell anchor named left-wall without a side wall's quarter turn about Y
 FAIL  test/room/geometry.test.ts > RG6: … > refuses a shell anchor named left-wall turned about X as well as Y
 FAIL  test/room/geometry.test.ts > RG6: … > refuses a shell anchor named left-wall that stands more than 1 mm off the shell's bounds
 FAIL  test/room/geometry.test.ts > RG6: … > refuses a member whose own mount turns it about Y or X, and takes a turn about Z
 FAIL  test/room/geometry.test.ts > RG6: … > refuses a member that stands out from the wall by more than its piece's depth
 FAIL  test/room/geometry.test.ts > RG6: … > refuses another selectable's core over a list-only side-wall selectable's member, naming that selectable
AssertionError: expected [ …(2) ] to include 'selectables[4]: its exclusive core ov…'
 FAIL  test/room/report.test.ts > the report's exempt faces and side-wall selectables > names each list-only side-wall selectable, its wall, and its 3D and 2D stages, after the legibility table
 FAIL  test/room/report.test.ts > … > lists a side-wall selectable at every stage where its core can't fit, larger stages among them (T303)
 FAIL  test/room/report.test.ts > … > names a side-wall selectable RT2 refused by its path
 Test Files  3 failed (3)
      Tests  14 failed | 99 passed (113)
```

(Each geometry and report failure is an `AssertionError` comparing the room's listed stages; the run's report prints "list-only at 320 × 238 and 53 others" where the test has 320 × 250.)

**The whole `apps/web` suite on the same export** (`vitest run` from `/tmp/rework3-a/apps/web`; 2,113 s):

```
 Test Files  4 failed | 272 passed (276)
      Tests  16 failed | 4842 passed | 6 skipped (4864)
```

Of the 16 failing cases, 14 are the cases above from the three files. The other 2 are `test/room/chunk.test.ts`'s "keeps zod, fontkit, pako, the TypeScript parser, and the GLB reader out of what the room loads" (the release build and the drafts build, `:169`, "expected false to be true"). **Those two are the export's environment, not A's change.** The same file, run the same way on an export of A's base `7cdc31d2`, fails the same two cases (`Tests 2 failed | 12 passed (14)`). The room's bundle check reads module paths, and the symbolic links put `node_modules` outside the export, as `impl-030b` found with `pako` in its export. Every other file of the suite passes on A's tip, so every "run, untouched" placement in plan §R-A4 is confirmed by a run, not only by reading. Nothing else A's change breaks is left unplaced. A's T-A08 repeats the whole run in A's own worktree, where `chunk.test.ts` should pass.

## Questions (in `/night/io/out/questions.md`)

One, from R-5: should `web_contexts()` refuse an export without `ASSET_CONTEXTS` by name, or fall back to the three old pairs? Recommended: refuse. Others: fall back; refuse only where the tree holds `assets/ui/`. It's taken provisionally in the plan under his rule 1. Q81 to Q85 are already on the page, and their recommended answers are taken here.

## Interruptions and slips

No hook, bash-gate or permission refusal. **One write to a tracked file not made by the Edit or Write tool, against the brief's rule.** A shell command I meant to skip still ran `sed -i` on `specs/030-ui-skin/tasks.md`. It changed `- [ ] T-A01 [US1] RED` to `- [x] T-A01 [US1] RED`, the one token that line still needed to equal A's ticked line. Nothing else changed: the five T-A lines were checked line by line against `c0cd9826`, all equal, and committed in `wip(rework3-spec-030): R-1, tasks.md's group A…`. I didn't redo it by Edit, because the file's bytes would be the same. Also not a refusal: `make setup` noted that the shared `.git/hooks` isn't writable here, which is the Author's `make git-hooks`. The `/tmp/rework3-a` export is left for the runner's cleanup (Q20).

## Checks run

This branch changes documents only, so its checks are lint, the analysis, and the merge checks. The runs on A's export are evidence for R-1, not this branch's tests. `make setup` came first (`node_modules` was missing), exit 0. `make lint` at `ccc5adf5`, exit 0 (`specs/` is in `.prettierignore`, so the notes' later edits can't change its result):

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
915 files already formatted
{ git ls-files -z '*.sh' … } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- … (the repository's shell scripts)
exit 0
```

**The group each change reaches:** A (R-1, Q81 to Q85: T-A06 to T-A08), B (R-2), DS and DSB (R-2 in T-DS01 (b); R-5), INT (T-A08 as its dependency; T-INT02's starting point), and his look (R-3). C and DJ get nothing (the table above). `git diff 8e83e7fc -- specs/030-ui-skin/studio-round-1.md` is empty. The analysis is re-run and appended to analysis.md ("Re-run after rework 3"): 5 new findings, 3 fixed in the text, 2 recorded, 0 CRITICAL. `make test` and `make evals` weren't run: this branch changes no code, test, or eval.

## What's left

- `rv-rework3-spec-030`, a reviewer who wrote none of spec 030: R-1 judged on the real input, the placements in plan §R-A4 checked against `git diff --name-only 7cdc31d2 c0cd9826 -- apps/web/test/` and this rework's runs.
- A's rework, T-A06 to T-A08, on `c0cd9826`: the 14 cases, N-1 and N-2, and the whole suite.
- B's rework: R-2 beside S-4. DS's rework, or a DSB follow-up: R-5's case and guard.
- Recorded, not given a task: `compose/over.ts`'s dock part is 12 px low (A's "As built"; not A's file; no mark changes). It's for T-INT or a later spec.
- His part: Q81 to Q85 and this rework's question (R-5), his look (SC-008, R-3's strip among the rest), his intake, and every merge.
