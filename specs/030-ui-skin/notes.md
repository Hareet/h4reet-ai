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
