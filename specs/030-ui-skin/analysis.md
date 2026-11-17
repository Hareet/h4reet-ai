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
