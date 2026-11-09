# 0039: The walking view

Status: proposed · Spec: [008](../../specs/008-visitor-movement/spec.md) · Date: 2026-11-08 · Deciders: the Author (pending); drafted by the implementer agent from the spec's provisional answers

## Context

The Author asked, on 2026-11-07: "The visitor should be able to move around the room, and when targeting on an object, the object gains a highlight border until the user clicks on it." Until then the room was drawn from one camera, the production framing, which spec 004's checks judge: the legibility floor (RG7) and each selectable's 44 × 44 pick area (RG6) on the reference and supported stages. The visitor's figure is a flat cut-out of the avatar chosen at the door; ADR 0010 (proposed) plans rigged avatars with animation clips, which haven't arrived.

Spec 008's five questions were answered provisionally while the Author was away, each with its recommended option, and each is his to overturn (spec.md's Clarifications). This record holds the decisions they lead to, so a reader can see why the walking view is built the way it is.

## Decision

1. **A second view beside the production framing, entered by a control.** "Walk around", in the stage's bottom-right corner, enters the walking view; "Stop walking" or Escape leaves it. The production framing stays the view the room opens on, the hand-off plays in, spec 004's checks judge, and the walking view starts and ends at; leaving puts the camera back on it exactly and the figure back at its place in the scene (Q2, D3, D5).
2. **Third person: a follow camera.** The camera looks at the visitor's figure from the open front's side, within limits that are data (the scene's `walking` block): a yaw either side of straight into the room, a pitch down from level, and a distance from a minimum to the production framing's own, so the walking view never shows the room smaller. A region in front of the open face, inside the side walls, keeps every wall from standing between the camera and the room; a request outside it turns less, then tilts less (Q1).
3. **Solid walls and furniture, from the frame boxes.** The figure's footprint is a circle; the walkable floor is the shell's floor less the radius at its walls, and every placement within the figure's height is an obstacle, by rule, its floor-plane extent grown by the radius. Moves resolve one axis at a time, so a blocked diagonal slides. Moving, adding, or removing a piece in the data moves its obstacle with no source change; the compositor's RW1 refuses a scene whose figure would start off the walkable floor (Q3).
4. **Targeting by the room's own inputs, and reach.** A hovering pointer, a press, and keyboard focus on the "In the room" list target a piece everywhere; in the walking view, walking up to a piece and facing it ("reach") does too, and Enter opens it. There is no centre reticle, which in third person would sit on the figure (Q4).
5. **The highlight drawn at run time, as look data.** Two passes after the look's frame: the target's draws into the stencil, with no colour and no depth test; then a ring around their contour edges on screen, a capsule as wide as the yellow band and the ink edge together, drawn outside the stencil, each fragment coloured by its distance from its edge, the band within its width and the edge beyond, its depth that distance, nearer than the room. So the border is its data's widths on any mesh, hard-edged or smooth, and no surface hides it, not even the one the piece stands on; in materials of its own, so it draws in every look and at every quality level, and the stand-ins' labels draw after it. Its colours and widths are each look's `highlight`, held by RW2 to at least 3:1 for one of the two tones against every colour of the look's palette, and the band at least 9:1 lighter than its edge (Q5; Phase 1's review).
6. **One figure driver, which an avatar takes over.** Movement gives a pose: a place on the floor, a heading, a speed, and whether the figure walks. A driver shows it: the flat cut-out's stands at the place, turns to face the camera, mirrors toward its heading, and bobs while it walks; a rigged avatar's driver turns to the heading and plays idle and walk clips by the same pose, with no change to movement, collisions, reach, targeting, or the camera. What the figure holds, the resume's paper after the hand-off, moves with it.
7. **One usage event.** `walk_started`, once a visit, with no identifier, on the room's existing beacon, disclosed in row V4 in the change that sends it; nothing is sent for a target, a highlight, a step, the figure's place, or the camera.

## Alternatives considered

- **First person** (Q1, option B): the camera at the figure's eyes, a reticle to target. In a cube 1.22 m deep the camera would stand within about a metre of every wall, and the visitor would never see the avatar they chose. **No walking figure** (option C): the camera alone turns and zooms; not "move around the room".
- **Walking on by default** (Q2, option B): the first movement key, drag, or floor tap walks. The stage would take touch gestures from the start, so a phone's page could scroll only outside it, and the keys would need the stage focusable from the start.
- **Walls only, or the floor's edges only** (Q3, options B and C): simpler, the figure walking through the desk, the twin, and in C the walls.
- **A centre reticle in place of reach** (Q4, option B); **a border that stays on the last piece pointed at** (option C), a closer reading of "until the user clicks on it", with a border on a piece the pointer has left.
- **The page's focus blue framed in white** (Q5, option B): under 3:1 on both tones against the cement floor and the figures' grey, so RW2 refuses it with today's palette.
- **A back-face hull pushed out by its CSS pixels** for the highlight, the plan's first R-07, built in Phase 1: three's OutlineEffect's technique, two hull passes over the target's meshes alone. Phase 1's review found it narrower than its data wherever a hard edge met another, which a miter, built and measured, didn't mend, and hidden by any surface nearer the camera than the piece's foot; the mask and the contour ring took its place.
- **A screen-space outline from a mask and a dilation pass** for the highlight: exact in pixels for any geometry, but a render target, a full-screen pass, and the scene's depth to read, against the ring's quads around the contour edges alone.

## Consequences

- The production framing's guarantees hold unchanged; the walking control's box is reserved in RG6 at every supported stage, and the walking view makes no legibility promise beyond the production framing's: every drawn word stays in "Around the room", and the list's button is the equivalent control for a piece smaller than 44 × 44 there.
- A rigged avatar needs a walk clip, which ADR 0010's first set lacks; until it has one, an avatar standing in slides in its idle clip. The driver interface is what an avatar spec builds on.
- The cube is small: the walkable floor is a strip about 0.27 m deep in front of the desk. The walking data tunes the radius, the speed, and the camera, and lookdev judges them.
- One more usage event kind, and a dashboard panel, "Visits that walked".

## Links

- Intent and spec: [specs/008-visitor-movement/](../../specs/008-visitor-movement/), its Clarifications Q1 to Q5 and defaults D1 to D8.
- [ADR 0010](0010-real-time-avatar-rig-and-art-direction.md) (the rigged avatars) and [ADR 0036](0036-the-room-composed-from-data.md) (the room composed from data).
