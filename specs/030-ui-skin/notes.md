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
