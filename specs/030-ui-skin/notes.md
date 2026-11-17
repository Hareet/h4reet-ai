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

## What's left

The implementation (T-A, T-B, T-C, T-DJ at once; T-DS after T-B04; T-INT), the round (R-1 tonight from this branch, R-2 on his studio, R-3 after T-DJ), and his: the answers to the 16 questions, his look (SC-008), his intake of the set (plan §R-D3), and every merge.
