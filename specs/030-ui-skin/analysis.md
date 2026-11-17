# Analysis: spec 030 (the interface's skin)

`/speckit-analyze`'s pass over [spec.md](spec.md), [plan.md](plan.md), [tasks.md](tasks.md), and [studio-round-1.md](studio-round-1.md), by `spec-030` (spec-writer), night of 2026-11-17, at `ad8e31c7`. Non-destructive by its definition; the findings marked *fixed* were fixed in `ad8e31c7`, before this file, and each fix is named here. The intent is [`intent/030-ui-skin.md`](../../intent/030-ui-skin.md).

## Findings

| ID | Category | Severity | Where | Finding | State |
|---|---|---|---|---|---|
| A-1 | Inconsistency | HIGH | studio-round-1.md, the brief's notes | The first draft's state targets put primary normal (L 80 C 75) and hover (L 90 C 70) ΔE ≈ 11 apart, under the ΔE 15 the same brief and FR-022's judge require: a studio that hit the targets exactly would fail its own round. | *Fixed*: primary hover L 92 C 62, secondary hover L 38, pressed L 3; every two states of a variant now ≥ ΔE 17 apart by their targets (computed). The brief re-checked: `line.py brief` passes, SHA-256 `98eb47dd…1c4267`, pasted in studio-round-1.md and T-R1. |
| A-2 | Coverage gap | MEDIUM | tasks T-INT | FR-005's rule (raise an alpha if a ratio fails with B's buttons in place) had no task: A's contrast test runs on A's branch, before B's faces exist in its cascade. | *Fixed*: T-INT02a re-runs `hud-halves-contrast.test.ts` after the merges and applies the rule there, recorded. |
| A-3 | Underspecification | MEDIUM | spec FR-005; plan §R-A3 | In the column layout and the dock, the top half (`.hud-panels`) holds the conversation; making the half over-room always changes the conversation's look at rest there, which Q2's "the left panel unchanged" didn't say. | *Fixed*: FR-005 and §R-A3 say so; the split layout's left panel keeps 029's rule. Q2 on the page covers it (its option B keeps 029's geometry everywhere). |
| A-4 | Inconsistency | MEDIUM | plan §R-D4 against §R-A3 | D's frame image was to style "the halves' class", but only the bottom half had a class of its own (`.hud-half`); the top half is `.room-list` or `.hud-panels`. | *Fixed*: A sets `data-half="top|bottom"` on each half's element (§R-A3, T-A04); D styles `[data-half]`. |
| A-5 | Inconsistency | MEDIUM | plan §R-B4 | B's cascade test was to import 029's evaluator from `hud-over-layers.test.ts`, which would register that file's cases inside B's; A's extraction to `test/helpers/layers.ts` isn't on B's branch. | *Fixed*: B reads winners by jsdom's `getComputedStyle`, as spec 029's `talk-answer-shows.test.ts` does. |
| A-6 | Conflict | MEDIUM | spec FR-013 against spec 028 (A1-3) | "The button grow to hold them" can't hold for the split layout's tiles, whose grid rows are fixed at two lines of words (`compose/hud.ts`'s `tileRem`, from which the tiles' block's height and so the list's are computed). | *Fixed*: FR-013 bounds the growth there to the row's two lines; longer is a later spec's layout change. T-B01 (c)'s doubled label still asserts wrapping and no ellipsis. |
| A-7 | Coverage gap | LOW | tasks T-B01 (a) | FR-012's boundary ratio was computed against the over-room glass only; "Enter" stands on the dark pages' opaque ground. | *Fixed*: T-B01 (a) also computes against `rgb(16 20 26)`. |
| A-8 | Risk | LOW | plan §R-D4 | The panel frame's `border-image` width (24 CSS px) eats into each half's content box; a control could leave its half. | *Fixed in the plan*: T-DS checks with A's `hud-halves.test.ts` and falls back to `border-image-outset`, recorded. |
| A-9 | Risk | LOW | plan §R-B3 | A `clip-path` chamfer clips an outside focus ring. | Answered in the plan: the HUD's rings are inside (029's `outline-offset: -4px`); elsewhere a `::before` chamfer; T-B01 (c) asserts the ring visible per control. |
| A-10 | Test churn | LOW | T-A05 | `hud-split-contrast.test.ts` pins spec 018's 0.78 glass on the list and the bar, which Q2 changes, yet T-A05 ran it "unchanged". | *Fixed*: T-A05 defers to T-A01 (d), which decides and names it. |
| A-11 | Dependency | INFO | R-3 | The round's judge needs T-DJ's commits on the branch it runs from; without them `line.py` judges only bytes, tools, the record, and the arrival check. | Stated in studio-round-1.md's status line and R-3's row: no `--record` from a branch without T-DJ. |
| A-12 | Ambiguity | INFO | spec Q6 | "Selected" in the reference is the highlighted menu entry, which this spec's answer gives the glow while keeping a separate primary variant; his reading may be "selected = yellow". | On the page as Q6 with that reading as option B. |

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T-A01 (a), T-A02 |
| FR-002, FR-003, FR-004 | T-A01 (b), T-A03 |
| FR-005, FR-006, FR-007 | T-A01 (b) (c), T-A04, T-INT02a |
| FR-008 | T-B01 (b), T-B03 |
| FR-009, FR-010, FR-011 | T-B01 (a), T-B02, T-B04 |
| FR-012, FR-013, FR-014 | T-B01 (a) (b) (c), T-B02, T-B03 |
| FR-015, FR-016, FR-017 | T-C01, T-C02, T-C03 |
| FR-018 | T-C03, T-DS01 |
| FR-019 | R-1 (studio-round-1.md's scratch check done tonight) |
| FR-020, FR-021 | R-2, R-3 (the judge's checks), the brief |
| FR-022 | T-DJ01, T-DJ02, R-3 |
| FR-023 | R-3, his intake (plan §R-D3) |
| FR-024, FR-025 | T-DS01 to T-DS03, T-DS05 |
| FR-026 | every task's rules |
| SC-001 to SC-009 | as their FRs; SC-008 his look; SC-009 T-INT04 |

Every requirement has a task; every task names a requirement or a check. No task without a requirement but T-INT02 (dead declarations, a cleanup the cascade fight leaves) and T-INT03 (the ADR the Assumptions name).

## Constitution alignment

No CRITICAL finding. Principle I: no new request (Q13's inlining), degraded mode first (the fallback skin). Principle II: tests first; the telemetry deviation is named in spec.md's Assumptions with its clauses. Principle III: the intent is a draft; the plan and tasks carry the provisional approval line with his words. Principle IV: no human-only path is written; the intake into `assets/` is his patch; no `assets/policy/` patch is needed (Q12). Principle VII: the studio's own tools only, nothing from the reference image, the record names every step. Principle VIII: the disclosure stays in view on every dark page; each PNG carries the AI-made mark. ADR 0043 (status "proposed" in its own header) is changed by the blur's removal; T-INT03 writes ADR 0056.

## Departures from specs 018 to 029, each named

All in spec.md's Amendments table and Assumptions, each with its clause: 018 FR-014 (the split glass); 028 FR-007, FR-008 (the column's gap); 029 FR-002 (the blur kept), FR-005 (beside the room unchanged), FR-028 (the chosen card's look); and the earlier specs 005 (FR-006, FR-025, FR-058), 016 (FR-042's page look), 017 (the line's checks). Spec 024's and 026's clauses are unchanged (the "Eat" tile keeps its box and behaviour; only its look is the component's).

## Metrics

16 clarifications (all recommended, taken provisionally, on the page); 26 functional requirements; 9 success criteria; 32 tasks (A 5, B 4, C 3, DJ 2, the round 3, DS 5, INT 5) and his intake; 12 findings, 9 fixed, 3 answered in place; 0 unmapped requirements; 0 CRITICAL.

## Not checked here

The screenshots (`resume/` unreachable; spec.md's Assumptions). The brief on the real `/srv/studio/` folder (unreachable; R-1). Any code: this branch writes none.

## Re-run after the rework (rework-spec-030, from `35a75b2c`)

The same pass over spec.md, plan.md, tasks.md, and studio-round-1.md after `rv-spec-030`'s six blocking findings were fixed (S-1 to S-6; [notes.md](notes.md), "Rework"). What changed:

### The review's findings, each where it landed

| ID | Fix | Where |
|---|---|---|
| S-1 | "Close" is `.split-hint` (the pair of "Back") and `.resume-close`; Q5's premise ("the split layout has no other close") corrected as a named departure; Q51's recommended answer taken; both in the component's selectors and tests; `.resume-close`'s boundary computed against the resume panel's `#ffffff` | spec Readings, Q5, Q51, FR-008, Terms; plan §R-B3, §R-B4; tasks T-B01 (a) (b) (c), T-B03 |
| S-2 | `choice-cards.test.ts:425-436` rewritten in T-C01's RED, old and new assertion named (3:1 against `rgb(16 20 26)`); also `:459-463` (the card's focus ring), which the review didn't name and fails the same way; the file C's alone; T-C03 runs the rest unchanged | spec Assumptions, US3 scenario 3; plan §R-C2, §R-C3, §9; tasks T-C01, T-C02, T-C03 |
| S-3 | A `ui-assets` named context in `web_image.py` and an empty stage and copy in `apps/web/Dockerfile`, on `visitor-assets`' terms; its tests in `deploy/scripts/test_web_image.py` and `scripts/test_makefile.py`'s `WEB_BUILD`, RED first, T-DS's; SC-007 in the image | spec FR-027 (new), SC-007, Amendments; plan §1, §R-D4, §9; tasks T-DS01 (c), T-DS02 |
| S-4 | The chamfer on a `::before` for every control; nothing clips the box, outline, or glow; `button-states.test.ts` asserts no `clip-path` on any skinned control | spec FR-011, FR-013; plan §R-B3, §R-B4, §10; tasks T-B01 (c), T-B03 |
| S-5 | §9 names every file for one group, no search; B owns no earlier test file; `hud-contrast`, `hud-over-contrast`, `hud-look`, `hud-over-layers` (and `hud-split-contrast`) A's; `choice-cards` C's; B's cases in others' files go to T-INT02b (new), RED between A's merge and B's | spec Assumptions; plan §R-A4, §R-B5, §9; tasks T-A01 (d), T-B01 (d), T-INT01, T-INT02b |
| S-6 | `border-width` and `padding` stay the CSS skin's; `border-image-width` (insets ÷ 2) with `-outset: 0` draws the insets over the border and padding; buttons with `fill`, the panel frame without; T-DS01 checks the tiles', `.room-walk`'s, `.room-eat`'s, and the halves' content boxes equal under both skins | spec FR-024; plan §R-D4, §10; tasks T-DS01 (b), T-DS02 |

### New findings of this pass

| ID | Category | Severity | Where | Finding | State |
|---|---|---|---|---|---|
| R-1 | Inconsistency | HIGH | plan §R-B3 against §R-D4 | S-4's `::before` (`z-index: -1` in the control's own stacking context) paints after the context root's borders, so it would cover the image skin's `border-image` whole: the studio's images would never show. | *Fixed*: under `data-skin-kind="image"` the `::before` is off and `filter` `none`; the control's `background-color` is the fallback's face beneath the image, so a failed decode shows a flat face (spec's edge case amended); T-DS01 (b) asserts it. |
| R-2 | Inconsistency | MEDIUM | plan §R-B3; spec FR-012 | With the frame drawn by the `::before`, the control's own border must be transparent (a coloured one shows square corners round the chamfer), so "disabled by a dashed border" on the control would be unseen in the CSS skin too, not only under `border-image` (the review's I-2). | *Fixed*: the dashes are B's `::after`, in every skin, clipped to the octagon; D sets only its inset (`--btn-dash-inset`); T-B01 (c), T-DS01 (b). |
| R-3 | Coverage gap | MEDIUM | spec FR-024; tasks T-DS01 | The image skin's label colours weren't tied to `slices.json`'s, so the label drawn could differ from the one the judge measured (the review's I-2). | *Fixed*: the entry carries `labels`; the build sets them on every state; the schema refuses an image skin without them. |
| R-4 | Underspecification | LOW | plan §R-B2 | Which attributes the root carries on a fallback (the review's N-3). | *Fixed*: the resolved skin's `data-skin` and `data-skin-kind`, set only by the plugin. |
| R-5 | Inconsistency | LOW | plan §R-A1 | The `@supports not (backdrop-filter …)` block kept the glass opaque where the blur was missing, against FR-005's clear glass everywhere (the review's N-1). | *Fixed*: the block goes; `hud-no-blur.test.ts` refuses such a condition. |
| R-6 | Test design | LOW | plan §R-A3, §R-B4 | Two assertions checked the code against itself: the halves' boxes against `halves()`'s own output, and the swap's "inputs differ only by the YAML" (the review's N-2, as this pass reads it; its text wasn't reachable, only the page's summary). | *Fixed*: the boxes against numbers the test derives (and `halves()`'s own unit cases); the swap by its effect, T-B04's `git status` for "no source file". |
| R-7 | Risk | LOW | plan §R-C1 | The selection screen's first paint was light: the class came from script (the review's N-4). | *Fixed*: `index.html`'s root carries the class (C's file now); the no-script fallback is dark too, its text at 4.5:1 (spec's edge case amended; a question on the page). |
| R-8 | Inconsistency | LOW | plan §R-D3; studio-round-1.md R-4 row | The intake's route wasn't 021's (the review's N-5). | *Fixed*: `docs/merge-requests/human-patches/030.md`, 021's table; the R-4 row's path in studio-round-1.md updated, its brief's JSON block untouched (checked by `git diff`). |
| R-9 | Ambiguity | LOW | spec edge case against FR-013 | A label longer than two lines "grows" the button, but the split layout's tiles hold two lines (the review's I-3). | *Fixed in the text*: the edge case names the tiles' exception; the real labels' fit under `metal`'s uppercase is unmeasured (jsdom has no layout, and the plan adds no browser), so it is his look's (SC-008), named in notes.md. |

### Coverage and metrics after the rework

FR-027 (new) → T-DS01 (c), T-DS02. Every other row of the coverage table stands, with T-INT02b added to FR-008 and FR-012's (the cases B's look needs in A's files). 27 functional requirements; 9 success criteria; 17 clarifications (Q1 to Q16, Q51); 33 tasks (A 5, B 4, C 3, DJ 2, the round 3, DS 5, INT 6); the review's 6 blocking findings fixed, its 8 others in notes.md (7 fixed, 1 in part); this pass's 9 findings, all fixed in the text, R-1 and R-2 new. 0 unmapped requirements; 0 CRITICAL. §9's rows are disjoint but for the one sequential share by design: a script over §9's backticked paths finds only `build/ui-skins.ts` and `content/ui-skins.yaml` in two rows, B's and DS's, which DS edits after B on B's tip (its image case and the `metal-image` entry), never beside it.

### Still not checked

As above; and the S-6 look (the image's 12 px band over a 60 px tile's icon and words) is his, at SC-008.
