# Implementation Plan: Avatar Walking Legs

**Spec**: [spec.md](spec.md) · **Intent**: [intent/019-avatar-walking-legs.md](../../intent/019-avatar-walking-legs.md) · **Date**: 2026-11-14

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His item here: "avatar walking leg animations". Each clarify answer (spec.md Q1 to Q5) is provisional and on the morning page; an overturned answer is reworked before he merges.

**Reworked on 2026-11-14** (rule 6: rv-spec-019 and review-019 on Opus, neither blocking) by his answers on the morning page to Q61 to Q63 (spec.md Q6 to Q8), each "Answered: recommended, the Author 2026-11-13.": the hips bone lowered by the standing leg's lift (§2.6), no time scale for a `walk` clip (§2.3), and the gait's frame made allocation-free (§2.7). The rework's tasks are T013 to T020.

## 1. Summary

Today: `walking.ts` gives the figure's pose each frame; the avatar controller's `driver` (`scene/avatars.ts`) places and turns the visitor's avatar and, on `pose.walking` changing, re-plays the clip for the role `roleFor` returns, which is `"walk"` only where a walk clip is loaded (`has("walk")`). The man and the woman have none, so the avatar slides in `idle`/`idle-holding`.

This plan: a **gait layer** over the playing clip. A new pure module (`scene/gait.ts`) gives six leg-bone rotation offsets from a phase and an amplitude; a small applier finds the six bones on the instance and, each frame after the mixer advances, composes the offsets onto the clip's rotations, and lowers the hips bone by the standing leg's lift (§2.6); it restores the clip's rotations and the hips' position whenever the gait isn't on. The controller feeds it the distance the figure walked (phase), the speed (amplitude), and the gates (clip role, animate, quality level). A shipped `walk` clip, when one arrives, still wins, and plays as spec 009 has it (no time scale, Q8).

No scene-data, schema, compose, asset, policy, or human-only change. No new byte on the wire.

## 2. Design

### 2.1 The pure part (`scene/gait.ts`, no three import in the math)

- `GAIT` constants, named and tested: `CYCLE_PER_HEIGHT = 0.7`, `EASE_S = 0.15`, `DT_MAX_S = 0.1`, `HIP_MAX`, `KNEE_MAX`, `ANKLE_GAIN` (radians; about 0.45, 0.9, 0.3 to start, tuned at lookdev, each a one-line edit).
- `cycleLength(heightM)` = 0.7 × height.
- `advance(state, distanceM, speedShare, dt, on)` → state `{ phase, amp }`: phase += distance / cycle (mod 1); amp eases toward `on ? min(1, speedShare) : 0` at rate 1/EASE_S, dt clamped to DT_MAX_S.
- `legOffsets(phase, amp)` → `{ left: {hip, knee, ankle}, right: {...} }` in radians: hip = amp·HIP_MAX·sin(2πφ); right at φ + ½; knee = amp·KNEE_MAX·max(0, …) with its flexion during the forward swing only, so never negative; ankle = −ANKLE_GAIN·hip. Pure and total, so SC-001 is a loop over seeded inputs.

### 2.2 The rig and the applier (`scene/gait.ts`, three part)

- `findLegRig(root)` → the six bones by their sanitized names (`mixamorigLeftUpLeg`, `mixamorigLeftLeg`, `mixamorigLeftFoot`, right alike) or `null` if any is missing (FR-008). Found once when an instance becomes ready.
- `applyGait(rig, offsets)`: for each bone, `quaternion = base · Qx(offset)` (flexion about the bone's local X, the studio's rig convention, checked by the real-rig test in T004; the sign is fixed by that test so that a positive hip offset swings the foot toward the avatar's front, glTF +z).
- Robust against the mixer: the applier keeps, per bone, `base` and `applied`; on each call, if the bone's quaternion still equals `applied` (the mixer didn't write this frame), `base` is kept, else `base` takes the bone's value (the clip's). `clearGait(rig)` writes `base` back. So a frame without a mixer update, a swap, a fallback, a pause, or the walking view's leaving leaves no residue (FR-006, SC-002).
- No allocation per frame: the quaternions and the axis are module-level scratch.

### 2.3 The controller's wiring (`scene/avatars.ts`)

- On the instance becoming ready (the same place `hand` is found, R-08 of spec 009), `figure.legs = findLegRig(instance)`; null emits one `gait` signal, `unavailable` (FR-008). On `fallBack`/swap, `clearGait` and drop.
- `driver.frame({ pose })`: the distance since the last frame (from the pose's x, z, never from `speed × dt`), kept in the figure's gait state; the first frame after `rest()` has distance 0. `rest()` clears.
- `update(dtMs, animate, level)`: after `mixer.update` for the visitor's figure, `const on = animate && level === 0 && pose.walking && legs && (role is idle or idle-holding) && !has("walk")`; `advance(...)`, then `applyGait` when `amp > 0` (else `clearGait`). When `!animate || level >= 1` the gait is cleared and not advanced (FR-009).
- ~~The walk clip's speed (FR-007): the action's `timeScale` = clamp(speed / `walking.speed_mps`, 0.5, 1.5), set each frame in `update`.~~ Dropped by Q8 (rework, T015, T016): a loaded `walk` clip plays at its own speed, as spec 009 has it; `update` sets no `timeScale`.
- `roleFor` is unchanged: the gait doesn't change the clip role, so `idle-holding`, the paper's hand, and `take` behave exactly as before.
- `stage.ts`: `FigureSignal` gains `{ kind: "gait"; figure: FigureId; state: "unavailable" }`; `signals/frame-log.ts` gains the event kind `gait`, and `app.ts` records the signal in the frame log (`figure`, `state`). Nothing else of the stage changes.

### 2.4 Lookdev (P3, optional)

`apps/web/src/lookdev/` loads the same avatar controller for the Author's look pass. If its pose list can drive `driver.frame` with a synthetic walking pose in a few lines, a "walk" pose lets him judge the gait there (T009); if not, the task is dropped with a note and he judges in the room, which is where a gait is judged anyway. The look approval is his either way (SC-005).

### 2.5 Departures found in implementation (T001 to T010)

- `advance(state, distanceM, speedShare, dt, on, cycleM)` takes the cycle's length as its sixth argument, so the pure part never needs a height; the controller passes `cycleLength(figure.target)`.
- The controller reads `part.walking.speed_mps`, so `createAvatarFigures`' `part` is `Pick<RoomScene, "figures" | "avatars" | "walking">` (the scene already carries it).
- `AvatarFigures` gains `clipScale(figure)`, the walk clip's time scale or `null`, so FR-007 is testable without reaching into the mixer. After Q8 it stays as the test's window onto the clip playing at its own speed (it reads 1).
- The `gait` signal reaches the frame log: `signals/frame-log.ts` gains the event kind `gait` and `app.ts` records it (`figure`, `state`). Both additive.
- The sign convention measured on the real models (R-07): the chain turns about local X; a positive rotation about X swings a hanging foot toward −z, so the applier turns the hip and the ankle by the negative of their offsets and the knee by its offset (`HIP_SIGN`, `KNEE_SIGN`, `ANKLE_SIGN` in `gait.ts`).
- The real files' rotations aren't exactly unit, so tests compare quaternion components, not `angleTo`.
- The fixture's `legs` option appends the four lower-leg bones after every other bone (the two thighs already exist), resolving parents by name, so no existing index moves.
- T009 (lookdev) is dropped: lookdev's hands page drives its own mixer, not the room's controller, so a synthetic walking pose doesn't fit in a few lines. The gait is judged in the room (README says so).

### 2.6 The hips lowered by the standing leg's lift (rework, Q7; FR-005, FR-015, SC-006)

- Why: with the hips bone still, a leg swung off vertical reaches less far down than a straight one, so at each step both ankles rise off the floor (about 7 cm at `HIP_MAX` 0.45, the page's Q62) and the avatar hovers.
- The pure part: `standingLift(offsets, thighM, shinM)` → the lift, from the same frame's angles. Each leg's ankle sits below its hip by `thigh·cos(hip) + shin·cos(hip − knee)` in the leg's swing plane (with the signs the applier uses, §2.5); its lift is `thigh + shin` less that; the standing leg is the one whose ankle is lower, so the lift is the smaller of the two, never negative, and 0 at amplitude 0. It returns a number, so it allocates nothing; pure, so FR-010 and FR-014 hold and the twin's later run can reuse it.
- The rig: `findLegRig` also finds `mixamorigHips` (missing: `null`, FR-008), and measures, once, in the hips bone's parent space: the thigh's length (hip joint to knee), the shin's (knee to ankle), and the avatar's down (the instance root's −Y expressed in that space, with that space's scale in it). So a lift computed in those units lands in the units `Hips.position` uses, whatever the armature's scale or turn. Measured on the real GLBs by the test (R-08), as R-07 measured the axis.
- The applier: `applyGait(rig, offsets, lift)` sets `Hips.position = base + down · lift`, with the same base/applied tracking as the rotations (the idle clips write a `Hips` position track, so a frame the mixer wrote gives the clip's new position as base); `clearGait` puts the base back. The hips bone's rotation is never written. The body above it (spine, arms, the holding hand and the paper in it, the head) rides it down; none of their rotations changes.
- The 2 cm test (SC-006): on the real man and woman rigs at their room heights (`AVATAR_SHAPES`), through a cycle at amplitude 1 in 1/64 steps, the lower ankle's height in the instance root's frame stays within 2 cm of its standing height; the same run with no lowering rises past 2 cm (the control, so the test can see a hover). Spec 009's SC-007 "bob 0" measures the placement group, which doesn't move (spec.md's amendment).
- The README's "Nothing above the hips moves" and `gait.ts`'s "feet don't skate" are reworded in T015 to say what the code gives: the steps keep pace with the distance, the standing foot stays down within 2 cm, and a foot's slide along the floor is tuned at the look pass.
- **Departures found in T014, T015** (measured on the real GLBs, as R-08 has it; §8's "a measured-length fix, not a design change"):
  - The real legs don't hang straight at the clip's pose: the man's thigh leans back 0.06 rad and his shin 0.18 rad from down; the woman's 0.14 and 0.31 (her knee is bent). The straight-leg formula above was off from the ankles' real rise by up to 4.3 cm (man) and 7.5 cm (woman), so it couldn't meet SC-006. So `standingLift(offsets, shape)` takes, per leg, a `LegShape` `{ thigh, shin, thighAngle, shinAngle }`: the thigh's and the shin's lengths in the plane of the avatar's down and front, and each one's angle from down toward the front at the clip's pose. A leg's ankle hangs `thigh·cos(thighAngle + hip) + shin·cos(shinAngle + hip − knee)` below its hip joint; its lift is that at zero offsets less that now; the standing leg's lift is the smaller of the two, clamped at 0. With both angles 0 it is the straight-leg formula, which `gait.test.ts` checks; still pure and a number (FR-010, FR-011, FR-014).
  - `findLegRig` measures the shape once, at the pose the model holds when it is found (the bind pose; the idle and idle-holding clips hold all six leg bones exactly there, constant tracks, read from the files), in the hips bone's parent space, with `down` (the root's −y, unit) and the front (the root's +z, made square to down). The lengths are the in-plane ones, within 3% of the bones' own lengths in the node data (the legs splay a little out of the plane); `gait-rig.test.ts` checks both.
  - `applyGait(rig, offsets, lift = 0)`: the lift defaults to 0, so T004's calls stand.
  - Measured (SC-006, at the room's heights, a cycle at amplitude 1 in 1/64 steps): with the lowering, the lower ankle's worst offset from its standing height is −0.6 cm (man) and −1.9 cm (woman), a sink, from the clamp: where the standing leg passes under the hip it reaches deeper than at the clip's pose (her bent knee), and a lift below 0 would raise the hips, which Q7's "lower" doesn't give. Without the lowering the lower ankle rises up to 5.6 cm (man) and 7.0 cm (woman), the control. The woman's 1 mm margin is deterministic (file data only); the choice to let the hips rise there instead is on the morning page.

### 2.7 No allocation in a frame's gait (rework, Q6; FR-011, SC-007)

- `advance(state, distanceM, speedShare, dt, on, cycleM, out?)` and `legOffsets(phase, amp, out?)` take an optional `out` and write into it, returning it; with no `out` they return a new object as now, so T002's pure tests stand unchanged and FR-010 holds (the result is a function of the inputs alone; `out` may be `state` itself).
- `applyGait` and `clearGait` walk the six bones by name (`rig.left.hip`, …), with no array literal per call.
- The controller keeps, for the visitor, one `gait.state`, one `gait.offsets` (both legs), and one `gait.last` `{ x, z }` with a `has` flag, each made once; `driver.frame` writes the pose's place into `gait.last`, and `stepGait` writes the phase, amplitude, offsets, and lift in place: no object literal on the gait's frame path. The driver's own scratch for the feet's place (`new Vector3()` in `driver.frame`, spec 009's code) is outside the gait and outside FR-011, and is left as it is.
- The test (`test/room/gait-alloc.test.ts`): identity first: with `out`, `advance` and `legOffsets` return `out`, and its `left` and `right` are the same objects frame after frame, with values equal to the fresh-object calls'. Then a count: Node's `PerformanceObserver` on `gc` entries over 200,000 frames of `advance` → `legOffsets` → `standingLift` → `applyGait` (and `clearGait` every tenth) on the fixture rig with legs counts at most one minor collection; the same loop that also makes one `{}` a frame counts several (the control, which shows the probe sees allocation). Through the controller: the frame path (`driver.frame` then `update`) with the gait on counts no more minor collections than with a model without leg bones (gait off), within one. If the count proves unsteady on the runner, the identity part stands alone and the count's removal is recorded as a departure here, never loosened in a fix.

- **Departures found in T017, T018** (the escape hatch above, taken):
  - The gc count couldn't see allocation: over 200,000 frames, the code before T018 counted 1 to 2 minor collections and the control that makes one `{}` a frame counted 1, because the young generation holds that much without a collection. A sharper probe replaced it in T017's RED: the young heap's growth a frame, read in windows no collection ran in, warmed, the least of five. It saw the old code clearly (200 to 500 bytes a frame on the pure path; 540 to 880 more on the controller's frame with the gait on than off), and one `{}` a frame as 32.
  - After T018 the same probe still read 95 to 120 bytes a frame on the pure path and 176 more with the gait on: not objects the gait makes but numbers V8 boxes on the heap when a computed number crosses a call it doesn't inline, here inside three's own setters (`Quaternion.set`, the Euler update that `quaternion.copy` triggers). Writing the gait's helpers so its own numbers cross calls in a scratch object's fields brought that to 49 to 84 and 96, unsteady from run to run, since it moves with V8's inlining budget. So no byte bound can tell "no object" from that noise, and the measure was removed rather than loosened. The scratch-field rewrite was reverted too: the code stays plain, and FR-011 is about objects.
  - What stands, all deterministic (`test/room/gait-alloc.test.ts`): the identity of `advance`'s and `legOffsets`' outs; `applyGait` and `clearGait` holding no array literal (their source, read at run time); and, through the controller, `gait.state`, `gait.offsets` (its `left` and `right`), and `gait.last` the same objects through a walk, its stops, a `rest()`, and a fallback, written in place. For that last check, `AvatarFigures` gains `gaitFrame()`, a read-only window onto those three objects, as `clipScale` is FR-007's.
  - SC-007's "no more minor collections than the same run with the gait off" is so read as: the gait's frame creates no object of its own (FR-011); V8's boxing of numbers is outside what the code controls and isn't counted.

### 2.8 SC-004 measured (rework)

The 3D chunk's gzip size is read from the web app's build (Vite's report prints each chunk's gzip size; the build is the workspace's `build` script, or the repository's build target for `BUILD OK`) at this line's tip and at impl-018's tip (b9378980), both built the same way; the difference is at most 2 KB. The two numbers and the difference go here, under this heading, and into the stack note.

## 3. Decisions

- **R-01 Distance, not time, drives the phase** (FR-002): the steps keep pace with the distance at any speed, so walk-to's slow arrival and diagonals come out right with no special case. (Corrected in the rework: this alone doesn't keep a foot from sliding or lifting; §2.6.)
- **R-02 Layer, not clip, for tonight** (Q1): the studio has no walk clip, and the studio's tools list (P-7) forbids a new tool; a code gait needs no studio round. The `walk` role stays the upgrade path with no code change (Q8 dropped the time scale).
- **R-03 Post-mixer composition with base tracking** (§2.2): one rule that covers pause, quality, swap, fallback, `mixer.update(0)` elsewhere in the controller.
- **R-04 Legs only** (Q4): matches his words and spec 009's "no bob"; protects the holding hand's grip. One exception, by his answer to Q62 (spec.md Q7): the hips bone's position lowers by the standing leg's lift; its rotation, and every bone above it, stays the clip's.
- **R-05 No scene-data change** (Q5): two avatars; a constant in code is enough, and nothing in the compose, schema, or human-only paths moves.
- **R-06 The gate set equals the clips' set** (Q3): the same two inputs (`animate`, `level`) the controller already has in `update`.
- **R-07 The bone axis and sign are measured, not assumed:** T004 builds the studio rig's leg chain from the real GLBs' node data (JSON chunk only, no textures, no renderer) and checks that the gait's positive hip offset moves the ankle toward +z and the knee offset bends the shin backward, for each leg on its own (T013 adds the right leg's check beside T004's left).
- **R-08 The hips' lowering is measured, not assumed** (rework, Q7): the thigh's and shin's lengths and the avatar's down in the hips bone's parent space come from the rig, and the 2 cm test on the real GLBs (SC-006) checks the pure lift against where the ankles actually are.
- **R-09 No time scale on a `walk` clip** (rework, Q8): his item is legs; no walk clip exists; spec 009's FR-025 stands. A per-clip speed, if a clip ever needs one, is a later spec.

## 4. Constitution and policy

No principle deferred. No endpoint, model call, or data-flow row (CLAUDE.md's "new feature" list: telemetry is the one frame-log signal; no panel, since nothing is measured in production; cost none; degraded mode in spec.md; disclosure none). No human-only path changes (docs/merge-requests/human-patches/019.md says so).

## 5. Files expected to touch

New: `apps/web/src/room/scene/gait.ts`; `apps/web/test/room/gait.test.ts`; `apps/web/test/room/gait-rig.test.ts`; `apps/web/test/room/avatar-gait.test.ts`; in the rework, `apps/web/test/room/gait-alloc.test.ts`.
Changed: `apps/web/src/room/scene/avatars.ts` (the controller: §2.3, §2.6, §2.7); `apps/web/src/room/stage.ts` (the signal's type only); `apps/web/src/room/signals/frame-log.ts` (the event kind `gait`); `apps/web/src/room/app.ts` (records the `gait` signal in the frame log); `apps/web/test/helpers/glb.ts` (an opt-in `legs` option on the fixture rig at line 1174, which adds the six leg bones, so no other test's skeleton changes); `apps/web/test/room/avatar-driver.test.ts` (its "slides in idle-holding" expectations now hold for a model without leg bones only); `apps/web/README.md` (a short note; reworded by T015 and T016); not `apps/web/src/lookdev/*` (T009 dropped, §2.5).
Not touched, by the rework either: `scene/walking.ts`, `scene/figure.ts`, `walk/*`, `room/scene.yaml`, compose and build code, `assets/**`, `.claude/**`, CLAUDE.md, REVIEW.md, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `assets/policy/**`.

Overlap with the night's other items: `avatars.ts` and `stage.ts` are shared ground with the dog, dinosaur, and twin-running specs (d, e, h, i); this stack's edits to them are additive and small, and the implementer merges this branch first (the supervisor's one line).

## 6. Order of work, on one line

The implementer merges `night/spec-019/spec-019` into the night's line first, so its three planning artifacts are on the line, then T001 on, one commit per step, RED then GREEN. A reviewer who didn't write the code reviews the diff against REVIEW.md, spec.md, and this plan. If implementation departs from this plan, `plan.md` is updated in the same commit.

## 7. Verification

Small tests per task (tasks.md); the stack runs `make lint` per task. The full `make check` runs once, at the end of the night's stack by one task, and goes into that stack's merge-request note (the order's rule 4). `apps/web/test/room/twin-2d.test.ts` is a known flaky test under load. SC-004's chunk size is measured by T019 (§2.8), not left to the end.

## 8. Risks

- The studio rig's local axes may differ from X-flexion: R-07's test catches it before any pixel is drawn.
- Real avatar legs and the dress or trousers meshes may clip at large angles: the amplitude constants are small and data-free; he tunes at lookdev.
- A later studio `walk` clip arrives with its own stride length: it plays at its own speed (Q8), so its feet may slide at speeds far from its own; a per-clip speed can be a data field then, through the lifecycle.
- The pure lift is a planar two-bone reading of a real rig whose bones aren't exactly in one plane: SC-006's 2 cm test on the real GLBs is the check; a miss is a constant or a measured-length fix, not a design change.
- A gc-count test can be unsteady on a loaded runner: §2.7's identity part is deterministic and stands alone if the count must go, as a departure recorded here.
