# Intent: The visitor moves around the room, and a targeted piece shows a highlight border
Author: the Author (drafted by Claude from the Author's messages, as the main session relayed them on 2026-11-07). Status: draft. Specified the same night under the Author's "Keep going!", while he was away; he accepts or closes it. Created: 2026-11-07, in the spec's folder rather than `intent/`, as the main session asked, so it moves nowhere when accepted.

## Problem

- **The visitor stands still, and so does the camera.** The room is drawn from one camera, the production framing: straight into the cube's open front from x = 0, at an eye height of 1.15 m, as close as the framed pieces allow (spec 004's `compose/framing.ts`, judged on the stages of `compose/stages.ts`). The visitor's figure is a flat cut-out of the chosen avatar, placed at x −0.7 near the open front (spec 004's FR-080), and it moves only to turn for the hand-off's paper (spec 004's FR-008).
- **Nothing shows what a click will open.** A mouse over a piece gets a pointer cursor and nothing else (`apps/web/src/room/objects.ts`'s `over-object` class, which the code's own comment calls "only an extra"). A finger gets nothing until the tap ends. Keyboard focus on a button of the "In the room" list shows no link to the piece in the scene. The 2D room shows a dashed cue around every selectable at once (`flat.ts`).
- **Some pieces are hard to see from where the camera stands.** The chalkboard hangs on the side wall, seen at a steep angle, which the Author accepted as built on 2026-10-30 ("Those are fine."); a side-wall board that can't keep its own tap area at a stage is reached only from the "In the room" list there (spec 004's FR-064, as T302 amended it).
- **The rig isn't there yet.** ADR 0010 (proposed) makes the visitors rigged avatars with animation clips, and spec 003's avatar loader is unbuilt, so no avatar can enter the repository until the Author accepts that ADR.

## Proposed outcome

In the Author's words, as the main session relayed them on 2026-11-07:

> "The visitor should be able to move around the room, and when targeting on an object, the object gains a highlight border until the user clicks on it. Also finish this out, and see what can be done in parallel"

Earlier (the date isn't in the relay):

> "Now i want to see the full rigging and game movement that is allowed, when will that be there in the demo?"

Asked to start:

> "Keep going!"

Read as a list, for the spec. This is Claude's reading, to correct where it's wrong; it sits beside the words and never replaces them:

- **"move around the room"**: the visitor's figure walks on the cube's floor, as in a game, and the view follows it. The production framing stays the room's own view: the room opens there, the hand-off plays there, and the visitor can always go back to it.
- **"when targeting on an object, the object gains a highlight border"**: one piece at a time is the target, chosen by what the visitor points at, presses, or focuses in the list, or, while walking, by walking up to it. The target shows a border around its outline.
- **"until the user clicks on it"**: the click opens what a click opens today (a topic, or the resume), and the border goes at once. It comes back only when the visitor targets the piece again.
- **"Also finish this out"**: the whole feature, through its accessibility, its 2D room, its degraded mode, its telemetry, and its phone runs, not a prototype.
- **"see what can be done in parallel"**: the plan names the work that can run side by side, and the tasks mark it.
- **"the full rigging and game movement that is allowed"**: "game movement" is this intent. "Full rigging" is ADR 0010's rigged avatars. Movement doesn't wait for them: the flat cut-out moves now, through one interface a rigged avatar can take over later with its walk and idle clips. When the rig arrives depends on ADR 0010's acceptance, the studio's avatars, and spec 003's loader, none of which this intent changes.
- **"when will that be there in the demo?"**: a question for the main session. The plan answers it in order of work: the highlight first, on the fixed camera, then walking on the desktop, then on the phone.

## Affected users and systems

- **Visitors**, on desktop and phone, in 3D and in the 2D room, by pointer, touch, keyboard, and screen reader.
- **`apps/web`**: the room's runtime (`app.ts`, `stage.ts`, `scene.ts`, `objects.ts`, `flat.ts`, `a11y.ts`, `layout.ts`, `room.css`), the shared kernel's `compose/pick.ts`, the 3D part's interpreter, new modules for input, movement, the camera, targeting, and the highlight; the compositor's schemas and checks; the looks, the scene file, and the UI words; the lookdev page.
- **Telemetry:** the usage events (spec 002's contracts/room-events.md), the generated `config/room-events.yaml` the gateway reads, and the dashboard's "Room" row.
- **The data-flow disclosure:** row V4, if a usage event is added.
- **The Author:** his acceptance of this intent and of the spec's provisional answers; his runs on the reference phone and in lookdev; his gate and merges.
- **Specs 002 and 004**, whose requirements this amends by name, and ADR 0010, whose visitor clips a rigged avatar would need for walking.
- **Intent 005** (the room filling the window, a draft): if it lands first, it re-measures where the walking control sits.

## Constraints

- **Degraded mode first (Principle I).** Movement and targeting must work whatever is off: the local tier, the budget, the kill switch, the live status. Only what a click opens may degrade, as it does today.
- **Data-local (Principle I).** No new byte may leave the visitor's device without a disclosure row with its reason. Nothing is stored on the device.
- **Production-grade (Principle II).** Tests for every behaviour, telemetry with no payloads, a dashboard panel, a cost estimate, and documentation.
- **The production framing keeps its guarantees.** Spec 004 judges the legibility floor (9 CSS px of cap height) and each selectable's 44 × 44 px pick area at the production framing, on the reference stages and the supported stages. Moving must not weaken those checks.
- **Accessibility.** WCAG 2.2 AA, as specs 002 and 004 require. The "In the room" list stays the way to choose any piece without moving. Reduced motion and "Pause the room" are honoured.
- **Phones.** The reference phone (ADR 0010's Galaxy A54 class) holds at least 30 frames a second, as spec 002's FR-048 requires.
- **The local tier is production.** `make up` must keep working; nothing here touches the stack's services.
- **The lifecycle.** No code before an approved spec and plan. Agents never edit `corpus/`, `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `tools/gates/**`, `evals/agent-config/**`, or `assets/**`.

## Expected cost impact

- **Model spend:** none. Moving, targeting, and highlighting call no model.
- **Cloud:** at most one more small usage event per visit, if the spec adds one, on the beacon the room already sends; a few kilobytes of code in the lazy 3D chunk. Close to $0.
- **Dev time:** the Claude Team plan. The Author's time: the phone and lookdev runs.

## Data-flow impact

Moving and targeting run on the visitor's device. If the spec adds a usage event for the walking view's use, it rides the existing beacon (spec 002's row V4) with no identifier and no payload, and row V4 names it in the same change. Nothing else leaves the device.

## Open questions

For the spec, which answers them provisionally under "Keep going!":

1. First person, or third person?
2. Movement on by default, or entered by a control?
3. Collisions: solid furniture and walls, walls only, or none?
4. Targeting: by pointer hover, by a centre reticle, or by walking up to a piece?
5. The highlight's colour.
