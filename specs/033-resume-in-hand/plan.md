# Implementation Plan: The Resume in the Visitor's Hand

Approved provisionally by the Author's direction of 2026-11-22: "Go with your recommendations. Let's have you build it out in this session"

**Branch**: `feat/033-resume-in-hand` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md) | **Intent**: [intent.md](intent.md)

## Summary

Three changes in `apps/web`, each test-first: the hand-off's offer goes, and the room opens at the hand-off's end with `resume_kept` sent then (spec Q1, Q2); the kept paper in the 3D room becomes a pick target, `held-paper`, that reuses spec 008's targeting store and highlight and opens the resume through the same `openResume` the toolbar's "Resume" calls, with "Resume"'s focus as its keyboard path (Q3, Q4); and the paper's flicker is fixed at its cause, a sheet at opacity 0 still drawn and writing depth (spec, "The flicker's cause"). The records follow: the dashboard's five visit shares, spec 000's telemetry contract, the disclosure's row V4, and the amended passages of specs 002, 005, 008, 009, and 012.

## Technical Context

TypeScript in `apps/web` (vite, three r186, vitest 5 with jsdom); Python for `deploy/scripts/test_dashboard.py`. No new dependency, endpoint, asset, or room-data key. The room's data (`apps/web/room/`) doesn't change: the paper is code, as spec 004's FR-008 has the hand-off and its paper.

## Constitution Check

The spec's table holds: no new flow (I), tests and the flicker's regression test (II), the lifecycle and named amendments (III), no governance file touched (IV), $0 (V), the cause recorded (VI). No human-only path changes, so there is no patch for the Author's hand.

## Design

### D1. The offer goes (FR-001 to FR-005)

- `src/room/layout.ts`: `RoomLayout.offer` and its group (`.room-offer`, "The twin handed you the Author's resume.", the two buttons) are removed, with the header comment's sentence about it.
- `src/room/app.ts`: `offerResume` becomes `enterRoom`, the hand-off's `onDone`: it ends the hand-off (`handoffEnded()`), sets `visit.stage = "room"`, says the dog visitor's introduction, makes the room interactive, offers the walking control, and sends `resume_kept`. `offering` goes, so `open()` is `visit.stage === "room"`. Focus isn't moved (Q2). The header comment's "its end offers the resume now or later" changes with it.
- `src/choice/visit.ts`: `resumeKept` leaves `Visit` and `newVisit`.
- `src/room/room.css`: every `.room-offer` selector goes (its own rules, and its place in the shared lists at the pointer-events, focus-visible, button, hover, glass, and forced-colours rules).
- Comments that name the offer: `src/room/handoff.ts`'s header, `src/room/resume-port.ts`'s header, `src/room/events.ts` (the kind stays; its comment says when it's sent).

### D2. The held paper as a pick target (FR-006 to FR-010)

- `src/room/stage.ts`: `export const HELD_PAPER = "held-paper"`, the code's target ID for the kept sheet, shared by the entry chunk (app.ts) and the 3D chunk (scene.ts). No room data takes it (spec 004's scan refuses the clash).
- `src/room/scene/bundle3d.ts`: `heldPaperArea(room, camera, canvas, min = 44)`, the kept sheet's four corners projected by the camera into the canvas's CSS pixels, their bounds grown to at least `min` × `min` about their centre, or null where the sheet isn't drawn (FR-011's visibility, up its parents) or a corner is behind the camera; and `inRect`.
- `src/room/scene.ts`: the pointer's pick tests the paper first, once the hand-off has ended (`handedOff`), at the canvas point the pointer is at, after `inArea`'s HUD and frame-area refusal (FR-008); then the selectables' picker as before. The highlight is given `figures: (id) => id === HELD_PAPER ? [room.paper.kept] : []`, so spec 008's border draws round the sheet and its back.
- `src/room/app.ts`: `targetInput` takes `HELD_PAPER` while the room is open and the stage is the 3D one (FR-010); `selectObject(HELD_PAPER)` clears the target (`select`) and calls `openResume`, the toolbar's own handler, sending no `object_selected` (FR-007); "Resume"'s `focus` names `HELD_PAPER` with the `focus` input and its `blur` names none (FR-009).

### D3. The flicker (FR-011)

- `src/room/scene/bundle3d.ts`: `fadePaper(paper, atTwin, atVisitor)` sets both sheets' opacities and each sheet's `visible` to `opacity > 0`; `showHandoff`'s three branches write through it; `keptPaper(room)` = `fadePaper(room.paper, 0, 1)`, the hand-off's end.
- `src/room/scene/avatars.ts`: `keepPaper` writes through `fadePaper`; `handoffEnded` calls `keptPaper` before it, so the kept sheet is the drawn one whether or not the avatar has a hand.
- `src/room/scene.ts`: where no figures run (no avatar in the part, below the floor, or the figures' chunk failed), the hand-off's end calls `keptPaper(room)` too (its existing `handoffEnded.then`).

### D4. Records (FR-012, FR-013; Amendments A1 to A7)

- `deploy/grafana/dashboards/h4-runtime.json`: the five panels' denominator `kind="resume_kept"`, and their descriptions; `specs/000-local-foundations/contracts/telemetry.md` §7.8's five rows and readings the same, which `deploy/scripts/test_dashboard.py` compares.
- `docs/data-flow-disclosure.md` row V4 (FR-012).
- Specs 002 (spec.md, contracts/room-scene.md, contracts/room-events.md, data-model.md, quickstart.md), 005, 008, 009, 012: each passage edited in place with "(spec 033)" and a link.

## Files That Change

| File | Change |
|---|---|
| `apps/web/src/room/app.ts` | D1, D2 |
| `apps/web/src/room/layout.ts` | D1 |
| `apps/web/src/choice/visit.ts` | D1 |
| `apps/web/src/room/room.css` | D1 |
| `apps/web/src/room/handoff.ts`, `resume-port.ts`, `events.ts` | comments (D1) |
| `apps/web/src/room/stage.ts` | D2 |
| `apps/web/src/room/scene.ts` | D2, D3 |
| `apps/web/src/room/scene/bundle3d.ts` | D2, D3 |
| `apps/web/src/room/scene/avatars.ts` | D3 |
| `deploy/grafana/dashboards/h4-runtime.json`, `deploy/scripts/test_dashboard.py` | D4 |
| `docs/data-flow-disclosure.md` | D4 |
| `specs/000/…/telemetry.md`, `specs/002/…`, `specs/005/spec.md`, `specs/008/spec.md`, `specs/009/spec.md`, `specs/012/spec.md` | D4 |

## New Tests (RED first)

| Test | Proves |
|---|---|
| `apps/web/test/room/paper-steady.test.ts` | SC-003 with the real man and woman and their clips: over 8 s of "idle-holding" no drawn sheet hides a sample of the held sheet; at the hand-off's end exactly one sheet is drawn, the kept one, in travel, appear, reduced-motion, and handless (dinosaur) endings (FR-011) |
| `apps/web/test/ui/handoff.test.ts` (its "after the hand-off" block rewritten) | FR-001 to FR-005: no offer in 3D, reduced motion, 2D; focus on the heading; `resume_kept` once; the room open at once |
| `apps/web/test/ui/held-paper.test.ts` | FR-006, FR-007, FR-009, FR-010 at the room: the stage's `held-paper` target and selection open the resume as "Resume" does, events `[resume_kept, resume_opened]`; "Resume"'s focus targets the paper; nothing during the hand-off or in 2D |
| `apps/web/test/room/held-paper-pick.test.ts` | FR-008 at the 3D stage with a stand-in renderer: a tap at the paper's projected centre selects `held-paper` after the hand-off and not before; a hover targets it and adds `over-object`; the area is at least 44 × 44; the highlight's draws are the kept sheet's |

## Existing Tests That Change With the Amendments

Every test that encodes the offer, found by grepping `apps/web/test` for "Keep it for later", "Read the resume now", "handed you", `room-offer`, `resume_kept`, and `resumeKept` (59 lines in 35 files), and `deploy/scripts/test_dashboard.py` for `resume_kept`:

| Test | Why it changes |
|---|---|
| `test/helpers/room.ts` (`intoRoom`), `test/helpers/button-room.ts` (comment) | the click on "Keep it for later" goes: the room is open at the hand-off's end (FR-001) |
| `test/ui/{eat-button,eat-degraded,eat-fall,eat-hidden,eat-reduced,hud-halves,hud-halves-contrast,hud-over-layers,hud-split,hud-split-a11y,loading-faults,loading-page,narration-room,notes-causes,pause,talk,talk-turns,talk-answer-shows,walking,choice,highlight}.test.ts`, `test/room/{dog-selectable,events,pet-dormant}.test.ts`; `test/ui/{split-no-still,hud-wall-dom}.test.ts` (their own finder) | the same click, one line each (FR-001) |
| `test/ui/handoff.test.ts` | rewritten for FR-001 to FR-005 (above) |
| `test/ui/choice.test.ts:157`, `test/ui/walking.test.ts:92`, `test/room/quality.test.ts:635` | `resumeKept` leaves the visit (FR-004) |
| `test/room/quality.test.ts:582-586` | the offer surviving a fall to 2D: now no offer at all (FR-001) |
| `test/room/hud-contrast.test.ts:282, 401` | `.room-offer button:focus-visible` leaves room.css's focus and forced-colours rules (D1) |
| `test/ui/talk.test.ts:307, 337`, `test/ui/resume-room.test.ts:77` | `resume_kept` now arrives at the hand-off's end, not after a click: the expected order may shift (FR-003) |
| `deploy/scripts/test_dashboard.py:844-882, 1124` | the descriptions' words, and the denominator `kind="resume_kept"` (FR-013) |
| `test/events.test.ts:84`, `test/manifest.test.ts:98` | unchanged: the kind stays in the vocabulary |
| `test/ui/hud-look.test.ts:528` | unchanged: an allowlist regex naming `room-offer` among others; a selector that no longer exists can't fail it |

Any further test the full suite shows encoding the offer is added here, with its reason, in the commit that changes it.

## Order of Work

1. RED: the four new tests and the rewritten hand-off block, run and pasted failing.
2. GREEN, D3 (flicker) then D1 (offer) then D2 (paper), each with its tests passing.
3. The existing tests above, in the commit with the code that changes their behaviour.
4. D4's records; `make -f Makefile lint`; the whole `apps/web` suite once; the dashboard's test.
5. The merge-request note.

## Risks

- **Many UI tests pass through the offer**: each loses one line; the full suite run catches any missed.
- **The visit stand-in's history**: a dashboard range reaching back before the merge reads high for that span (Q1); each description says so.
- **Focus on "Resume" now sets a target**: a test asserting the exact list of targets after closing the resume sees `held-paper` in 3D; that is FR-009's behaviour.
- **Pick precedence**: the paper's 44 px area can overlap a selectable's core near the visitor; the paper wins there, since it stands in front (FR-008). RG6's cores are measured without it; a later piece placed right behind the visitor's hand would be reached through the list there.
- **No WebGL in the tests**: the flicker's test measures the cause geometrically (the draw order three uses, and the depth each drawn sheet writes), not pixels; the Author's 30-second look is the pixel check (SC-004).

## Proof

`make -f Makefile lint` clean; the new and changed tests passing; the whole `apps/web` suite's summary; `deploy/scripts/test_dashboard.py`; the Author's look list in the note. Skipped in this sandbox: anything needing Docker, the GPU, a browser, or the network (`make check`'s container stages, evals, red team): the change touches no model path, so evals aren't owed (the gate runs them only for agent-config changes).

## Cost and Degraded Mode

$0 at runtime. Degraded mode as the spec: nothing here depends on the tier, the switch, or the budget.
