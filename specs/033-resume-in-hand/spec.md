# Feature Specification: The Resume in the Visitor's Hand

**Feature Branch**: `feat/033-resume-in-hand`, from `main`'s `f1abe245`.

**Created**: 2026-11-22

**Status**: Draft, clarified the same day. Specified, clarified, planned, tasked, analyzed, and built in one session from the accepted intent [`intent.md`](intent.md), under the Author's direction of 2026-11-22: "Go with your recommendations. Let's have you build it out in this session". Every clarification below takes its recommended answer under that direction, provisionally; each is his to overturn.

**Input**: the intent; the [constitution](../../.specify/memory/constitution.md) (1.1.0); `CLAUDE.md`; the specs this amends: [002](../002-the-room/spec.md) (the hand-off and its offer, FR-007 to FR-009; contracts/room-scene.md §1, §3; contracts/room-events.md §1, §4; data-model.md §8, §9; quickstart.md), [000](../000-local-foundations/contracts/telemetry.md) (§7.8, the room's panels), [005](../005-full-window-room/spec.md), [008](../008-visitor-movement/spec.md), [009](../009-room-avatars/spec.md), and [012](../012-loading-screen/spec.md) (each names the offer or the panels' denominator); and `docs/data-flow-disclosure.md` (row V4).

## Source: The Author's Words

From the intent, 2026-11-22, verbatim:

> "Let's remove the box and option selection "The twin handed you the Author's resume." with the buttons "Read the
> resume now" "Keep it for later". We dont' need that option anymore, we can have the visitor drop right into being
> able to click around the room or start the conversation. We already have the resume button in our UI clearly
> labeled. 2) Let's have the resume paper that is in the hand of the visitor be highlightable when hovered over and
> clickable that laucnhes the same link as the resume ui button. 2) The resume asset flickers when it is in the hand
> of the visitor. The top half of the resume paper flickers and goes blank every 2 seconds."

His direction for this session, 2026-11-22, verbatim: "Go with your recommendations. Let's have you build it out in this session".

**Readings, beside his words, never in their place.**

- "the resume button in our UI" is the toolbar's "Resume" tile (`apps/web/src/room/layout.ts`, `resumeButton`). It is not a link: it opens the room's resume panel in the page (`app.ts`'s `openResume`), which counts `resume_opened`. "the same link as the resume ui button" is read as that same action, through the same function, so there is one source of truth for what the paper opens.
- His two items numbered "2)" are read as items 2 and 3: the paper clickable, and the flicker.
- "the resume paper that is in the hand of the visitor" is the 3D room's kept sheet (`bundle3d.ts`'s `room.paper.kept`), held in the avatar's holding hand (spec 014's grip) or at the visitor's hand anchor where the avatar has no hand. The 2D room draws the paper too; Q5 below keeps it a drawing in this spec.

## Clarifications

### Session 2026-11-22, taken under the Author's direction "Go with your recommendations"

- Q1: The box's "Keep it for later" sends `resume_kept`, and five dashboard panels ("Visits shown the 2D mode", "Visits whose avatar failed", "Visits that walked", "Visits in full screen", "Visits whose loading was cut short") count visits as `resume_opened` plus `resume_kept`, because every visit ended its offer with one of the two. With no offer, what becomes of `resume_kept`? Options: A (recommended): the room sends `resume_kept` once a visit, at the hand-off's end, when the paper is kept in the visitor's hand, and the five panels' denominator becomes `resume_kept` alone, exactly one a visit that reaches the room; B: the room stops sending it, and the panels count `resume_opened` alone, which misses every visit that never opens the resume, so each share reads high; C: a new kind, `room_entered`, with the gateway's configuration, the dashboard, and the disclosure's row changed for it. → A: **A (recommended)**. Reading: the kind, its body (`{kind}`), and the count a visit (one at the hand-off's end) stay as they were; only the moment changes, from a visitor's choice to the hand-off's end. No new byte leaves the device; the disclosure's row V4 is reworded (FR-012). A range on the dashboard that reaches back before the release that carries this change to the serving host counts the visits that chose "Read the resume now" then in no denominator, so those panels read high for that span; each panel's description says so.
- Q2: Where is focus when the hand-off ends, with no offer to take it? Options: A (recommended): where it was through the hand-off, on the room's heading (spec 012's giving way puts it there), so the next Tab reaches "Resume", the bar's first control, and nothing new is announced: the hand-off's line was announced at its start; B: focus moves to "Resume"; C: the polite region says a new line, "The room is yours." → A: **A (recommended)**. Reading: a visitor who never touches the keyboard sees the room open; a keyboard visitor's next Tab is "Resume"; a screen-reader visitor heard the hand-off's line and reads on from the heading.
- Q3: How is the paper reached by keyboard, and what is its name? Options: A (recommended): the toolbar's "Resume" is the paper's keyboard path and its name: focusing "Resume" shows the paper's highlight in 3D, as focusing an "In the room" entry shows its piece's (spec 008's `focus` input), and pressing it opens the resume; the canvas stays hidden from assistive technology (R-13); B: a new "In the room" entry for the paper, a second Tab stop for the same action, whose selection would send `object_selected` with a new ID. → A: **A (recommended)**.
- Q4: What does the paper's highlight look like, and how big is its pick area? Options: A (recommended): spec 008's highlight, the look's band and edge around the held sheet's outline, the same border every clickable piece shows, from a hovering pointer, a press, or the focus of "Resume"; the pick area is the sheet's bounds on screen, grown to at least 44 × 44 CSS pixels about its centre (spec 004's RG6 floor for a selectable's core), and the paper is picked ahead of the selectables, since it stands in front of them; B: a glow of its own. → A: **A (recommended)**.
- Q5: The 2D room draws the paper in the visitor's hands too. Is it clickable there? Options: A (recommended): not in this spec: in 2D the paper stays a drawing and "Resume" stays the way to the resume; the 2D paper is 8 × 11 view-box units of 320 × 200, about 32 × 44 CSS pixels at a 1280-pixel drawing and 10 × 13 on a 390-pixel phone, so it needs a pick area grown far past what it draws, which the Author may want to see first; B: the same pick area and highlight in 2D now. → A: **A (recommended)**. Reading: a follow-up intent, if he wants it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Straight Into the Room (Priority: P1)

As a visitor, when the twin has handed me the resume, I want the room to be mine at once, so that I can click around or start talking without answering a box first.

**Why this priority**: It is the Author's first item and removes a step from every visit.

**Independent Test**: Enter the room in 3D and in 2D, let the hand-off end, and confirm that no box or button about the resume appears, the room's controls and pieces respond at once, focus is on the room's heading, and `resume_kept` was sent once.

**Acceptance Scenarios**:

1. **Given** the hand-off is playing, **When** it ends, **Then** no box saying "The twin handed you the Author's resume." appears and no "Read the resume now" or "Keep it for later" button exists, in 3D, under reduced motion, and in 2D.
2. **Given** the hand-off has ended, **When** the visitor clicks a piece, presses an "In the room" entry, types in the text box, or presses "Resume", **Then** it works at once, with no other step.
3. **Given** the hand-off has ended, **Then** focus is on the room's heading, where it was during the hand-off, and the next Tab reaches "Resume".
4. **Given** the hand-off has ended, **Then** the room has sent `resume_kept` once, and sends it no more that visit.

---

### User Story 2 - The Paper in Hand Opens the Resume (Priority: P1)

As a visitor in the 3D room, I want the paper in my avatar's hand to light up when I point at it and to open the resume when I click or tap it, as the room's other pieces do.

**Why this priority**: The Author's second item; the paper is the room's most visible link to the resume.

**Independent Test**: In 3D after the hand-off, hover the held paper (the highlight shows), move off (it clears), click or tap it (the resume opens, as "Resume" opens it, and `resume_opened` is sent once), and focus "Resume" with Tab (the paper shows the highlight).

**Acceptance Scenarios**:

1. **Given** the 3D room after the hand-off, **When** a mouse hovers the held paper, **Then** the paper shows the room's highlight border and the pointer becomes a hand; **When** the mouse leaves it, **Then** the border clears.
2. **Given** the same, **When** the visitor clicks or taps the paper, **Then** the room's resume panel opens with focus on its heading, exactly as "Resume" opens it, and the room sends `resume_opened`, and nothing else (no `object_selected`).
3. **Given** the same, **When** keyboard focus reaches "Resume", **Then** the paper shows the highlight until focus leaves it; **When** the visitor presses Enter or Space, **Then** the resume opens.
4. **Given** the hand-off is playing, **When** the pointer moves over or taps the paper, **Then** nothing is highlighted or opened.
5. **Given** the walking view, **When** the visitor taps the paper in the figure's hand, **Then** the resume opens, as it does from the room's view.
6. **Given** a phone, **When** the visitor taps within the paper's pick area, at least 44 × 44 CSS pixels, **Then** the resume opens.

---

### User Story 3 - A Steady Paper (Priority: P1)

As a visitor holding the resume, I want the paper to show its whole face, steadily.

**Why this priority**: The Author's third item; the flicker reads as a fault.

**Independent Test**: Hold the paper for 30 seconds with each holding avatar (the man, the woman) and with the cut-out; its face never goes blank, in whole or in part.

**Acceptance Scenarios**:

1. **Given** the hand-off has ended, **When** the visitor's avatar plays its "idle-holding" loop, **Then** no other sheet hides any part of the held sheet, at any frame of the loop.
2. **Given** the hand-off has ended, **Then** exactly one paper sheet is drawn, the kept one, at the visitor's hand, in every way the hand-off ends: travelling, appearing (the twin's own model), under reduced motion, with a holding hand or without one.

---

### Edge Cases

- **The fall to 2D during the hand-off:** the hand-off finishes in 2D and the room opens as in 3D, with no offer; `resume_kept` is sent once, at its end.
- **The fall to 2D after the hand-off:** the paper's highlight and pick go with the 3D stage; "Resume" stays.
- **The resume already open:** a click on the paper focuses the panel's heading again and sends nothing, as "Resume" does.
- **A pointer over both the paper and a piece behind it:** the paper is picked, since it stands in front.
- **A paused room:** the paper still highlights and opens the resume; pausing stops motion, not input.
- **No avatar shows (a failed file, below ADR 0010's floor, the dinosaur or dog with no hand bone):** the kept sheet is at the visitor's hand anchor, drawn, and it is the one picked and highlighted; it walks with the cut-out.
- **The twin's own model (the paper appears with the visitor):** the same: one drawn sheet at the visitor's hand once the hand-off ends.

## Requirements *(mandatory)*

### Functional Requirements

**The box (User Story 1).**

- **FR-001**: WHEN the hand-off ends, THE ROOM SHALL make its controls, its pieces, the "In the room" list, the conversation, and the resume available at once, and SHALL show no offer: no "The twin handed you the Author's resume." text, and no "Read the resume now" or "Keep it for later" control, in any mode. (Amends spec 002's FR-009; FR-007's "available when it ends" stands.)
- **FR-002**: WHEN the hand-off ends, THE ROOM SHALL leave focus where it was, on the room's heading, and SHALL announce nothing beyond the hand-off's own line. (Amends contracts/room-scene.md §3's "At its end, focus moves to 'Read the resume now'".)
- **FR-003**: WHEN the hand-off ends, THE ROOM SHALL send `resume_kept` once, with no identifier; THE ROOM SHALL send it at no other time. (Amends contracts/room-events.md §1's row.)
- **FR-004**: THE VISIT SHALL hold no `resumeKept` field: nothing reads it once the offer is gone. (Amends data-model.md §9.)
- **FR-005**: THE ROOM SHALL keep "Resume" one action away for the rest of the visit, from the hand-off's end, as before.

**The paper (User Story 2).**

- **FR-006**: WHILE the 3D room is open after the hand-off, WHEN a pointer hovers the held paper's pick area, or a press starts on it, THE ROOM SHALL target the paper with spec 008's targeting inputs (`pointer`, `press`), and the 3D stage SHALL draw spec 008's highlight around the held sheet; WHEN the input names nothing, the target SHALL clear as spec 008's rules clear it.
- **FR-007**: WHEN a tap or click selects the held paper, THE ROOM SHALL run the same function "Resume" runs, opening the resume panel, focusing its heading, and sending `resume_opened` only where the panel wasn't open; it SHALL send no `object_selected`, and the selection SHALL clear the target in the same call (spec 008, FR-011).
- **FR-008**: THE PAPER'S PICK AREA SHALL be the held sheet's bounds on the canvas, from the camera drawing the room (the room's view or the walking view's), grown to at least 44 × 44 CSS pixels about its centre; THE 3D STAGE SHALL test it before the selectables' areas, and SHALL pick nothing there under a HUD box or outside the frame area, as for the selectables (spec 005, PD-13; spec 014, FR-014).
- **FR-009**: WHILE "Resume" has keyboard focus in the 3D room after the hand-off, THE ROOM SHALL target the paper with spec 008's `focus` input; WHEN it loses focus, that target SHALL clear. "Resume" stays the paper's name and keyboard path; the canvas stays hidden from assistive technology.
- **FR-010**: THE PAPER SHALL be neither targeted nor picked during the hand-off, in 2D, or by the walking view's reach.

**The flicker (User Story 3).**

- **FR-011**: THE 3D ROOM SHALL draw no paper sheet whose opacity is 0, and WHEN the hand-off ends, by any of its ways, SHALL draw the kept sheet at full opacity and hide the travelling one, so one sheet is drawn at the visitor's hand. (The cause this fixes is under "The flicker's cause" below.)

**Records.**

- **FR-012**: THE DATA-FLOW DISCLOSURE'S row V4 SHALL say that `resume_kept` is sent automatically, once a visit, when the hand-off ends, with no choice of the visitor's, where it says "opening the resume or keeping it for later".
- **FR-013**: THE DASHBOARD'S five panels named in Q1 SHALL count visits as `resume_kept` alone, and each description SHALL say so, with the reading for a range that reaches back before this change (Q1).

### Key Entities

- **The held paper**: the kept sheet (`room.paper.kept`), its back sheet as its child, in the avatar's holding hand or at the visitor's hand anchor. Code, not room data (spec 004's FR-008: "the hand-off and its paper" are code), so its target ID is the code's own, `held-paper`, which no room data defines (spec 004's FR-007 scan refuses a code string that a data ID takes).
- **`resume_kept`**: a usage event, `{kind: "resume_kept"}`, once a visit, at the hand-off's end.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the room's tests, at the hand-off's end in 3D, under reduced motion, and in 2D, the document holds no element with the texts "The twin handed you the Author's resume.", "Read the resume now", or "Keep it for later", and every control of the room is out of `[inert]`.
- **SC-002**: A click on the held paper's pick area in the 3D stage selects `held-paper`; the room then opens the resume with the events `[resume_kept, resume_opened]` for the visit, the same as a press on "Resume".
- **SC-003**: With the repository's holding avatars (the man and the woman) and their real clips, over 8 seconds of "idle-holding" after the hand-off, sampled every 50 ms, no drawn sheet hides any sample of the held sheet from the room's camera: 0 hidden samples, where `main` gives 92 of 160 frames with up to 200 of 441 samples hidden for the man (the probe below).
- **SC-004**: The Author's look: no box at a wide window, a narrow one, and a phone; the paper's hover, focus of "Resume", and click; no flicker over at least 30 seconds held.

## The Flicker's Cause

**Reproduced** with the repository's man and woman, their models and their "idle", "take", and "idle-holding" clips, through the real `buildRoom` and `createAvatarFigures` (a scratch probe, now `apps/web/test/room/paper-steady.test.ts`), the hand-off played to its end, then 8 s of "idle-holding" at 50 ms steps, seen from the room's camera at 16:9:

- After the hand-off, the travelling sheet (`room.paper.sheet`) is still in the scene, `visible: true`, its material at opacity 0, `transparent: true`, `depthWrite: true`, at the visitor's grip where the hand-off left it; the kept sheet is in the left hand (`mixamorigLeftHand`) at opacity 1.
- The two sheets sit 0.6 mm to 11.5 mm apart as the hand moves, turned a little against each other. The man: 92 of 160 frames had the invisible sheet drawn first (farther from the camera) with 168 to 200 of the held sheet's 441 samples behind its plane, all but at most 9 in the sheet's top half. The woman: 86 of 160 frames, 168 to 197 samples. The blank spans run about 1 s on and 1 s off: 0 to 1,000 ms, 1,900 to 3,000 ms, 3,900 to 5,000 ms, and so on.

**Cause**, with the code that makes it:

1. `bundle3d.ts:337-356` makes two sheets at the hand-off, each `MeshBasicMaterial({ transparent: true, opacity })`, with three's default `depthWrite: true`.
2. At the hand-off's end the avatars' `keepPaper` (`avatars.ts:673-680`) sets the travelling sheet's opacity to 0 and the kept one's to 1, but leaves the travelling sheet in the scene and visible, where `showHandoff` last put it (`avatars.ts:1157-1161`: the visitor's grip at the hand-off's end).
3. Three draws any visible mesh whatever its opacity (`WebGLRenderer.projectObject`, `three/src/renderers/WebGLRenderer.js:1862-1906`, r186: it checks `object.visible` and `material.visible`, never the opacity), and sorts transparent meshes back to front by their centres' depth (`WebGLRenderLists.js:31-47`, `reversePainterSortStable`, `b.z - a.z`).
4. So whenever the invisible sheet's centre is farther than the held sheet's, it is drawn first, writes depth at opacity 0, and the held sheet's pixels behind its plane fail the depth test: they show the room behind, "blank". The held sheet tilts against it with the hand, so the part behind is its top half.
5. The period: "idle-holding" is a 4 s loop (`assets/visitors/man/man-idle-holding.glb`, its sampler inputs end at 4.0; the woman's the same), and the hand passes back and forth through the invisible sheet's plane twice a loop (0.6 mm apart at 0 s, 1.2 mm at 2 s, 1.0 mm at 4 s), so the draw order flips about every 2 s: "goes blank every 2 seconds".

Not the cause: the camera's near plane (the room's camera stands metres away), a texture swap (the canvas is drawn once, and again only when the chalk face's family changes), or a keyframe (the clip's own motion is smooth; it only moves the sheet through the plane).

**A second fault of the same kind**, found reading the cause: where the hand-off travels and the visitor's figure has no holding hand (a cut-out, the dog or the dinosaur, a failed avatar), the travelling sheet ends at opacity 1 and the kept sheet at 0; walking then carries the invisible kept sheet with the figure and leaves the visible one in the air. FR-011's second clause fixes both.

**The fix**: FR-011, test-first: a sheet at opacity 0 is not drawn (`visible: false`), and the hand-off's end makes the kept sheet the drawn one.

## Amendments to Earlier Specs

| ID | Amends | Change | Why |
|---|---|---|---|
| A1 | Spec 002, spec.md FR-009, User Story 2's Independent Test and scenario 4 | No offer at the hand-off's end; the room opens at once and "Resume" is one action away | FR-001 |
| A2 | Spec 002, contracts/room-scene.md §1 (the screens' table, "After the hand-off") and §3 ("Announced") | No buttons after the hand-off; focus stays on the heading | FR-001, FR-002 |
| A3 | Spec 002, contracts/room-events.md §1 (`resume_kept`'s row) and §4 (the 2D share) | `resume_kept` is sent at the hand-off's end, once a visit; the 2D share counts visits as `resume_kept` | FR-003, FR-013 |
| A4 | Spec 002, data-model.md §8 and §9 | `resume_kept`'s meaning; the visit loses `resumeKept` | FR-003, FR-004 |
| A5 | Spec 002, quickstart.md's hand-off step | No offer; the room opens | FR-001 |
| A6 | Spec 000, contracts/telemetry.md §7.8 | The five panels' denominator is `resume_kept`; the readings say so | FR-013 |
| A7 | Specs 005 (FR-019, FR-062; Key Entities' "The HUD"; edge case "Full screen during the hand-off"), 008 (FR-010, FR-020, FR-053; User Story 1's scenarios 1 and 7, User Story 2's scenario 1), 009 (FR-034; edge case "Pause the room"), 012 (FR-048; its scenario), 014 (FR-022, FR-023; scenario 3), 016 (Q2's reading, FR-031 (e), Amendment M2's row; contracts/twin-states.md §5), 029 (Q4's reading; User Story's scenario 3) | Each names the offer or the old denominator; each gets a note pointing here | FR-001, FR-013 |

Each amended passage is edited in place with a pointer to this spec, so no spec contradicts the code. The specs' plans, tasks, merge-request notes, and ADR 0046 are records of what was built then and stay as written.

## Assumptions

- The hand-off itself is unchanged: its length, its line, its inert controls, and nothing skipping it (spec 002's FR-007, FR-008).
- The paper's target ID, `held-paper`, is the code's (Key Entities); it never leaves the device: a selection of the paper sends `resume_opened`, never `object_selected`.
- The forced-colours mode remaps the page's colours, not a canvas's: the paper's border in 3D keeps the look's colours, as every piece's does; its keyboard path, "Resume", draws the system's focus ring in forced colours (room.css's existing rules).
- Reduced motion: the highlight doesn't move, so nothing changes under it.
- No deviation from the constitution's clauses is taken.

## Expected Cost Impact

None at runtime: no model call, request, or asset. The paper's pick projects four corners a pointer event; its highlight is spec 008's, drawn only while targeted. Dev-time model spend for this session only.

## Degraded-Mode Behavior

Everything here is the static room's, so the kill switch, the tier, and the budget change nothing: with the local tier off or the switch degraded, the room opens at the hand-off's end, the paper opens the resume, and the resume is static. Where the 3D stage can't run, the 2D room opens the same way, and "Resume" is the way to the resume (Q5).

## Data-Flow Disclosure Entries

No new byte leaves the visitor's device. The paper opens the same panel "Resume" opens, from the same static `room-data.json`, and sends the same `resume_opened`. `resume_kept` keeps its body and its count (one a visit that reaches the room); only its moment changes, so row V4's words change (FR-012), not its fields.

## The "New Endpoint or Feature" List (`CLAUDE.md`)

- **Telemetry span**: none; the room's usage events are its telemetry (unchanged kinds).
- **Dashboard panel**: no new panel; five panels' denominator changes (FR-013).
- **Cost estimate**: $0 (above).
- **Degraded mode**: above.
- **Data-flow disclosure entry**: V4 reworded (FR-012).

## Constitution Check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local | yes | No new flow; V4's words follow the event's new moment |
| II. Production-grade | yes | Tests for each FR, the flicker's test from its reproduction, the dashboard's queries amended with their test |
| III. Intent → spec → code | yes | Accepted intent; this spec and plan before code; amendments named |
| IV. Least privilege | no | No hook, agent, or permission changes |
| V. Cost | yes | $0 runtime, stated |
| VI. Build in public | yes | The flicker's cause recorded with its evidence |
| VII. Own and say exactly | no | No claim about the Author |
| VIII. Honest AI | no | The twin's disclosure is untouched |

## Open Questions

None blocking. Each clarification's answer is provisional; Q1 and Q5 are the ones most worth his look.
