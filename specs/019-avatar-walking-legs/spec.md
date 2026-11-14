# Feature Specification: Avatar Walking Legs

**Feature Branch**: `night/spec-019/spec-019` carries the spec; implementation on one line with the night's other items (plan.md §6).

**Created**: 2026-11-14

**Status**: Draft, with the Author's approval given ahead: "Approved provisionally by the Author's order of 2026-11-13" (plan.md, tasks.md). Five clarification questions took their recommended answers, each provisional and his to overturn on the morning page (Clarifications). Reworked on 2026-11-14 after rule 6's Opus reviews (rv-spec-019, review-019, neither blocking) by his answers to Q61 to Q63 on the morning page (Clarifications, second session). Nothing merges before he confirms.

**Input**: [`intent.md`](../../intent/019-avatar-walking-legs.md) (to move here as `intent.md` once he accepts it). Also read, at `main`'s 3c0e4cd0: the [constitution](../../.specify/memory/constitution.md), `CLAUDE.md`; [spec 009](../009-room-avatars/spec.md) (FR-025 clips, FR-028 walking with the avatar, User Story 4) and its code `apps/web/src/room/scene/avatars.ts` (the controller's `driver`, `roleFor`, `update`), `scene/figure.ts` (`FigureDriver`, `figureDriverFor`); [spec 008](../008-visitor-movement/spec.md) and `walk/movement.ts` (`Pose`), `scene/walking.ts`; `choice/avatars.ts` (`CLIP_ROLES` already lists `walk`; `AVATAR_SHAPES` heights); `apps/web/room/scene.yaml` (`walking.speed_mps: 1`); `assets/visitors/{man,woman}/` (each holds a model and `idle`, `idle-holding`, `take`; no `walk`); `assets/policy/studio-tools.json`; `apps/web/test/room/avatar-driver.test.ts`.

Summary: when the visitor's avatar walks in the walking view, its legs walk. The studio hasn't made a walk clip for the man or the woman, so today the avatar slides across the floor in its idle with its legs still. This spec adds a code-driven gait, a small layer over the playing clip that swings the avatar's leg bones by the distance walked, so the steps keep pace with the distance walked and the legs stop when the figure stops; the hips bone lowers by the standing leg's lift, so the standing foot stays on the floor (Q7). A studio `walk` clip, where one arrives, takes precedence over the gait and plays as spec 009 already has it. Nothing leaves the visitor's device; no asset is added.

## Clarifications

### Session 2026-11-14, taken under the Author's order of 2026-11-13

The order directs that the spec-writer "takes the recommended answer at clarify and at the plan". Each answer below is the recommended option, provisional and his to overturn; each also stands in `/night/io/out/questions.md` for the morning page, with its other options.

- Q1: Legs by code, by a studio clip, or both? → Taken, not answered: **both, in that order of arrival**. A code-driven gait ships now and works with the files that are in the repository; a studio `walk` clip, when the studio makes one and the Author approves its look, takes precedence where it exists, through the clip role that already exists (spec 009, FR-025). Others: a studio clip only (nothing moves until the studio delivers and he approves the look); code only (a later studio clip would need a change). Reading: his word is "leg animations", and he wants the night's items finished; the code needs no asset, so no look approval and no studio round.
- Q2: Which figures? → Taken: **the visitor's avatars that show a model with leg bones named as the studio's rig names them (man, woman)**. The twin's figure doesn't walk in the walking view; the twin running from the dinosaur is his item h, a later spec, which can reuse the gait's pure part. The dog and the dinosaur have no models yet (his items d, e). Others: include the twin now (nothing walks it, so nothing could be seen).
- Q3: Reduced motion and the quality tiers? → Taken: **the gait follows the rule the clips follow** (spec 009, FR-025 and the degraded table): no leg motion while the motion store doesn't animate (reduced motion, "Pause the room", a hidden page), and none at quality level 1 or more, where the visitor's mixer holds its frame; the avatar slides, as today. Others: legs always move when walking, whatever the setting (breaks the room's rule on motion).
- Q4: Do the arms, the hips, and the spine move? → Taken: **legs only**: hips, knees, ankles of both legs. No arm swing (the holding hand keeps the paper still), no body bob (spec 009's driver says "no mirroring or bob"), no spine. Others: arm swing on the free arm too; a hip bob. Either is a later data-free code edit. Changed by Q7 below: the hips bone lowers by the standing leg's lift, the one exception.
- Q5: How is the stride's length set? → Taken: **from the avatar's height in the room's table**: one gait cycle covers 0.7 × the avatar's height in metres (about 1.2 m for the man), a constant in code, so a step's length is about the legs' sweep at the walking speed of `scene.yaml` (1 m/s), and the cycle follows the figure's real speed, never a fixed rate. Others: a scene-data value per avatar (a schema and compose change; none is needed for two avatars). Reading, corrected in the rework: this keeps the steps in pace with the distance; it doesn't by itself stop a foot sliding. The standing foot's height is held by Q7's hips lowering (within 2 cm, SC-006); its slide along the floor isn't zero, and `HIP_MAX` and `CYCLE_PER_HEIGHT` are what the Author tunes at the look pass (SC-005).

### Session 2026-11-14, the rework: his answers on the morning page

Rule 6's Opus reviews of this spec (rv-spec-019) and of its code (review-019) found nothing blocking; three questions went to the morning page as Q61 to Q63. Each is recorded with its question and the recommended answer word for word from the page, and the page's record of his answer under each: "Answered: recommended, the Author 2026-11-13." Numbered on here as Q6 to Q8.

- Q6 (page Q61): "Spec 019's FR-011 says a frame's gait allocates nothing, and the code allocates small objects per frame. Fix the code, or relax FR-011?" Recommended: "fix it: reuse two state and offset objects in gait.ts and avatars.ts, and add a small allocation-free test". Answered: recommended. → FR-011 stays; tasks.md T017 and T018 make the gait's frame allocation-free and test it.
- Q7 (page Q62): "Spec 019's gait keeps the hips still, so at each step both feet lift about 7 cm off the floor and the avatar looks like it hovers. May the gait also lower the hips bone by exactly the standing leg's lift (no other body motion)?" Recommended: "yes; lower `mixamorig:Hips` by the standing leg's lift, from the same angles; arms, spine, head and the holding hand stay as the clip has them; FR-005 amended for this one exception, with a test that no standing foot rises more than 2 cm". Answered: recommended. → FR-005 amended, FR-015 and SC-006 added; Q4's "no body bob" now has this one exception.
- Q8 (page Q63): "Spec 019 also changes spec 009 so that a future studio "walk" clip plays faster or slower with the avatar's speed (FR-007). Your item named leg animations only, and no walk clip exists yet. Keep that change?" Recommended: "no; drop the time-scale part of FR-007 and its amendment to spec 009; a loaded walk clip still plays instead of the gait, as spec 009 has it". Answered: recommended. → FR-007's time scale and the amendment to spec 009's FR-025 are dropped.

## Source: The Author's Words

- **His item**, word for word: "2. c) "avatar walking leg animations"", from his order of 2026-11-13, which the intent quotes. Reading: User Stories 1 and 2. His words say legs; Q4 keeps to them.
- **How far the night goes**, his: "finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". Reading: the plan touches few files, adds no human-only change, and names each task's small tests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Legs Walk When the Figure Walks (Priority: P1)

As a visitor in the walking view in 3D, I want my avatar's legs to step as it crosses the floor, and to stop when it stops.

**Why this priority**: the Author's item, and the whole feature.

**Independent Test**: in a Node test over the fixture room with a fixture avatar rig (three's objects, no renderer), drive the visitor's driver over a seeded walk: while `pose.walking`, the leg bones' rotations differ from the clip's pose, left and right half a cycle apart; after the walk ends and the ease-out, every leg bone equals the clip's pose again.

**Acceptance Scenarios**:

1. **Given** the man or the woman shows and walks at full speed, **When** a distance of one cycle is walked, **Then** each leg completes one swing, the legs in opposite phase.
2. **Given** a walk, **When** the figure stops, **Then** the legs ease back to the clip's pose within 0.2 s and stay there.
3. **Given** a slower walk (a diagonal at the same speed, or a walk-to's arrival), **When** the speed falls, **Then** the cycle advances by the distance walked, never by time, and the swing's size follows the speed's share of the walking speed.
4. **Given** the avatar holds the paper in `idle-holding`, **When** it walks, **Then** the holding hand, arm, spine, and head turn as the clip has them; only the legs move, and the hips bone lowers by the standing leg's lift, carrying the body above it down with it (Q7).
5. **Given** a walk at full speed, **When** any frame of a cycle draws, **Then** the lower of the two feet is within 2 cm of its standing height (Q7).

### User Story 2 - Nothing Breaks When the Legs Can't Move (Priority: P1)

As a visitor, I want the room to keep working whatever the avatar's rig, the setting, or the tier.

**Why this priority**: Principle I.

**Independent Test**: for each of: a model without the leg bones, reduced motion, "Pause the room", quality level 1, a shipped `walk` clip, the `take` clip playing, an avatar that falls back mid-walk: the walk goes on, no error is thrown, no leg bone is left rotated, and the figure moves as today (slides, or the clip plays).

**Acceptance Scenarios**:

1. **Given** a model missing any of the six leg bones, **When** it walks, **Then** no gait applies and it slides as today; one frame-log signal says so.
2. **Given** the motion store doesn't animate, or the quality level is 1 or more, **When** the visitor walks, **Then** the legs stay in the clip's pose.
3. **Given** a studio `walk` clip is loaded for the avatar, **When** it walks, **Then** that clip plays at its own speed, as spec 009 has it, and the gait doesn't apply (Q8).
4. **Given** the avatar swaps for its fallback, or the walking view is left, mid-stride, **When** the next frame draws, **Then** no residue stays on the bones or on the hips' position.

### User Story 3 - The Author Can Judge It at Lookdev (Priority: P3)

As the Author, I want to see the walk on the real models before I merge.

**Independent Test**: the lookdev page (`apps/web/src/lookdev/`) can run the gait on a loaded avatar, or the plan's note says why it can't (plan.md §2.5: it can't; lookdev's hands page drives its own mixer, so the gait is judged in the room). His look approval of the gait is on the morning page.

## Edge Cases

- **A key held while turning, direction reversals:** the cycle advances by the distance walked and is never reset; the swing's size follows speed; no pop.
- **A long frame (a hidden tab returning):** a frame's dt is clamped to 0.1 s for the gait, so a returned tab doesn't spin the legs.
- **The first frame after `rest()` or a swap:** the gait starts at amplitude 0 and eases in over 0.15 s.
- **Walking begins during the hand-off's `take`:** the gait applies only while the avatar's clip is `idle` or `idle-holding`.
- **Walk-to's arrival slows to zero:** the ease-out takes the legs to rest; `pose.walking` false is the end.
- **A rig whose bones carry the studio's names with a different prefix:** matched by the sanitized `mixamorigLeftUpLeg` names only; anything else counts as missing.
- **Both feet, with a clip that already moves legs:** idle clips are near-still on legs; the gait adds to the clip's rotation, so it never replaces it.
- **The clip moves the hips:** the idle clips carry a `mixamorig:Hips` position track; the lowering is added to the position the clip gives, and given back as the rotations are (FR-006).

## Requirements *(mandatory)*

Terms: **the gait** is the code-driven leg layer of this spec; **the six leg bones** are `mixamorig:LeftUpLeg`, `LeftLeg`, `LeftFoot`, and the right three, as three sanitizes their names (spec 009, R-08); **the hips bone** is `mixamorig:Hips`, the thighs' parent; **the cycle** is one full step of both legs; **the standing leg's lift** is how far the lower of the two ankles has risen above its standing height, from the leg angles of the same frame.

### Functional Requirements

- **FR-001**: WHEN the visitor's avatar shows, its clip is `idle` or `idle-holding`, the figure's pose is walking, the motion store animates, and the quality level is 0, THE ROOM SHALL swing the six leg bones by the gait, added to the rotations the playing clip gives them.
- **FR-002**: THE GAIT'S PHASE SHALL advance by the distance the figure walked divided by the cycle's length, 0.7 × the avatar's height in the room's table (Q5), never by time.
- **FR-003**: THE GAIT'S SWING SHALL scale by the speed's share of `walking.speed_mps`, capped at 1, and ease in from 0 over 0.15 s and out to 0 over 0.15 s as walking starts and stops.
- **FR-004**: THE TWO LEGS SHALL be half a cycle apart. THE KNEE SHALL never bend backward; the hip's swing, the knee's flex, and the ankle's counter-rotation SHALL stay within limits kept as named constants and tested.
- **FR-005**: THE GAIT SHALL turn only the six leg bones, and move only the hips bone's position, by FR-015 alone. THE HOLDING HAND, THE ARMS, THE SPINE, THE HEAD, THE HIPS BONE'S ROTATION, AND THE FIGURE'S PLACEMENT AND HEIGHT SHALL stay as the clip and the driver give them (Q4, amended by Q7: the body above the hips rides the hips bone down; none of its bones turns).
- **FR-006**: WHEN the gait ends, or the figure falls back, swaps, rests, or the walking view is left, EVERY LEG BONE SHALL return to exactly the rotation the clip gave it, and THE HIPS BONE to exactly the position the clip gave it, with no residue.
- **FR-007**: WHERE a studio `walk` clip is loaded for the avatar, THE ROOM SHALL play it while the figure walks, as spec 009 has it (its FR-025 and FR-028, unchanged), and THE GAIT SHALL NOT apply. (The time scale by speed this FR first carried is dropped, Q8.)
- **FR-008**: WHERE the model lacks any of the six leg bones or the hips bone, THE ROOM SHALL apply no gait, keep the avatar sliding as spec 009's FR-028 has it, and emit one frame-log signal for it.
- **FR-009**: WHILE the motion store doesn't animate, or the quality level is 1 or more, THE GAIT SHALL NOT apply (Q3).
- **FR-010**: THE GAIT'S POSE SHALL be a pure function of its phase and amplitude, so a seeded walk is reproducible bit for bit (Principle II).
- **FR-011**: A FRAME'S GAIT SHALL allocate nothing: the phase and amplitude, the leg offsets, the last place, and the hips' lowering are written into objects kept from one frame to the next (Q6). The code SHALL stay in the 3D chunk with the avatar controller; the gzip size added SHALL be at most 2 KB, and no asset, texture, or file is added to the first visit.
- **FR-012**: THE FEATURE SHALL add no DOM, no announcement, no key, and no setting; a screen reader's and a keyboard's room are unchanged.
- **FR-013**: AN AGENT SHALL NOT edit `assets/**`. A studio `walk` clip for the man or the woman comes only by the Author's intake, with his look approval, made with the studio's tools list (P-7) alone.
- **FR-014**: THE MODULE'S PURE PART SHALL be reusable by a later figure (the twin running, his item h) without change to its tests.
- **FR-015**: WHILE the gait applies, THE HIPS BONE SHALL be lowered, along the avatar's down, by the standing leg's lift, computed by a pure function from the frame's leg angles and the thigh's and shin's lengths measured on the rig (Q7); at amplitude 0 the lowering is 0.

### Key Entities

- **Gait**: phase, amplitude, the six bones' offsets, and the hips' lowering. **Leg rig**: the six bones and the hips bone found on a model, with the thigh's and shin's lengths and the avatar's down in the hips bone's parent space, or none.

## Success Criteria

- **SC-001**: a seeded 10,000-frame walk gives leg offsets identical on two runs, every angle within its limits, the knees never negative, and the legs half a cycle apart at every frame.
- **SC-002**: after any walk, stop, swap, fallback, or leave, the six bones equal the clip's rotations, and the hips bone the clip's position, to 1e-9.
- **SC-003**: over a walk of N cycles' distance, the phase advanced equals N, whatever the frame times.
- **SC-004**: the 3D chunk grows by at most 2 KB gzip, measured against impl-018's tip (b9378980, the line before this spec's code); the first visit's report lines (RK3 and the budgets) are unchanged.
- **SC-005**: the Author's look approval in the room (lookdev has no walking pose, plan §2.5), on the morning page.
- **SC-006**: on the real man and woman rigs, at the room's height, through a full cycle at amplitude 1, the lower of the two ankles never rises more than 2 cm above its standing height (Q7); the test reads it within 2 cm either way, so an over-lowered hips bone, which would sink the foot, fails too.
- **SC-007**: over a seeded walk, after the first frames, the gait's frame creates no object: the pure functions write into the objects passed to them, and a run of the frame's path shows no more minor collections than the same run with the gait off (Q6).

## Amendments to Earlier Specs

- **Spec 009, FR-028, User Story 4 scenario 2**: "with no walk clip it slides in "idle-holding"" now reads: with no walk clip it walks by the gait where its leg bones are found and the setting allows; it slides otherwise.
- **Spec 009, FR-028, User Story 4 scenario 1, and SC-007** ("never mirror it or bob it", "no step bob", "its mirror and bob are 0"): the avatar's placement still never bobs: its group keeps its height. Inside the body, the hips bone lowers by the standing leg's lift while the gait applies (FR-015 here, Q7), the one exception.
- (Dropped by Q8: the amendment to spec 009's FR-025 that had a `walk` clip's time scale follow the figure's speed. FR-025 stands as written.)

## Assumptions

- No clause of the constitution is deferred or dropped. Principle V's cost and budget: none spent, none at risk.
- Walking is spec 008's, unchanged; `Pose` already gives `speed` and `walking`.
- The studio's rig names its bones `mixamorig:*` for both visitors (spec 009 R-08 reads `mixamorig:RightHand`); tasks.md's T004 confirms the six leg bones on the shipped models in a test, from the files.
- The Author's look approval of the gait is his; the build doesn't gate on it, since it's code (his item is a behaviour, not an asset).

## Expected Cost Impact

- **Cloud**: none. **Per-visit**: a few bone rotations a frame. **Dev**: one stack of small tasks.

## Degraded-Mode Behavior

| What is gone or off | The visitor's figure walking |
|---|---|
| A model without the six leg bones or the hips bone | slides in its idle, as today; one signal |
| The `walk` clip loaded | the clip plays at its own speed; no gait |
| Reduced motion, "Pause the room", a hidden page | slides, legs in the clip's pose |
| Quality level 1 or more | slides, legs in the clip's pose |
| The avatar failed or below the floor | its flat shape, as today |
| 2D room, no WebGL 2 | the 2D figure, as today |
| The twin, the local tier off, the kill switch `degraded` | unrelated; the walk is local |

## Data-Flow Disclosure Entries

None: no byte leaves the device. A later studio walk clip comes from the site's own origin under row V1 as the other clips do.

## Telemetry, Dashboard, Endpoint

No endpoint, no model call. The frame log's signal for FR-008 is the telemetry the feature adds; the dashboard's "Visits whose avatar failed" panel is unchanged, and no panel is added, since the signal is a development aid in the frame log (spec 009, FR-031 to FR-036 style).

## Constitution Check

Principle I (data-local; degraded modes first): no byte leaves the device, so no disclosure row; the table above, with the gait as an optional layer. II (production-grade: tests, telemetry, a cost estimate and measurement): FR-010, SC-001, SC-006, SC-007, the frame-log signal, and SC-004's measured size (T019). IV (least privilege): the implementer doesn't review (T011, T020). V (cost): none. Accessibility: FR-012. The human-only paths: none changes (docs/merge-requests/human-patches/019.md).

## Open Questions

Q1 to Q5 above, each taken provisionally and on the morning page; Q6 to Q8 (the page's Q61 to Q63), answered by the Author.
