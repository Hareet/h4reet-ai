# Implementation Plan: Avatar Walking Legs

**Spec**: [spec.md](spec.md) · **Intent**: [intent/019-avatar-walking-legs.md](../../intent/019-avatar-walking-legs.md) · **Date**: 2026-11-14

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His item here: "avatar walking leg animations". Each clarify answer (spec.md Q1 to Q5) is provisional and on the morning page; an overturned answer is reworked before he merges.

## 1. Summary

Today: `walking.ts` gives the figure's pose each frame; the avatar controller's `driver` (`scene/avatars.ts`) places and turns the visitor's avatar and, on `pose.walking` changing, re-plays the clip for the role `roleFor` returns, which is `"walk"` only where a walk clip is loaded (`has("walk")`). The man and the woman have none, so the avatar slides in `idle`/`idle-holding`.

This plan: a **gait layer** over the playing clip. A new pure module (`scene/gait.ts`) gives six leg-bone rotation offsets from a phase and an amplitude; a small applier finds the six bones on the instance and, each frame after the mixer advances, composes the offsets onto the clip's rotations; it restores the clip's rotations whenever the gait isn't on. The controller feeds it the distance the figure walked (phase), the speed (amplitude), and the gates (clip role, animate, quality level). A shipped `walk` clip, when one arrives, still wins, and now plays at the figure's speed.

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
- The walk clip's speed (FR-007): when `roleFor` returns `"walk"`, the action's `timeScale` = clamp(speed / `walking.speed_mps`, 0.5, 1.5), set each frame in `update`. `walking.speed_mps` comes from the scene data the controller already holds.
- `roleFor` is unchanged: the gait doesn't change the clip role, so `idle-holding`, the paper's hand, and `take` behave exactly as before.
- `stage.ts`: `FigureSignal` gains `{ kind: "gait"; figure: FigureId; state: "unavailable" }`; the drafts build's frame log prints it. Nothing else of the stage changes.

### 2.4 Lookdev (P3, optional)

`apps/web/src/lookdev/` loads the same avatar controller for the Author's look pass. If its pose list can drive `driver.frame` with a synthetic walking pose in a few lines, a "walk" pose lets him judge the gait there (T010); if not, the task is dropped with a note and he judges in the room, which is where a gait is judged anyway. The look approval is his either way (SC-005).

## 3. Decisions

- **R-01 Distance, not time, drives the phase** (FR-002): feet don't skate at any speed; walk-to's slow arrival and diagonals come out right with no special case.
- **R-02 Layer, not clip, for tonight** (Q1): the studio has no walk clip, and the studio's tools list (P-7) forbids a new tool; a code gait needs no studio round. The `walk` role stays the upgrade path with no code change but the time scale.
- **R-03 Post-mixer composition with base tracking** (§2.2): one rule that covers pause, quality, swap, fallback, `mixer.update(0)` elsewhere in the controller.
- **R-04 Legs only** (Q4): matches his words and spec 009's "no bob"; protects the holding hand's grip.
- **R-05 No scene-data change** (Q5): two avatars; a constant in code is enough, and nothing in the compose, schema, or human-only paths moves.
- **R-06 The gate set equals the clips' set** (Q3): the same two inputs (`animate`, `level`) the controller already has in `update`.
- **R-07 The bone axis and sign are measured, not assumed:** T004 builds the studio rig's leg chain from the real GLBs' node data (JSON chunk only, no textures, no renderer) and checks that the gait's positive hip offset moves the ankle toward +z and the knee offset bends the shin backward.

## 4. Constitution and policy

No principle deferred. No endpoint, model call, or data-flow row (CLAUDE.md's "new feature" list: telemetry is the one frame-log signal; no panel, since nothing is measured in production; cost none; degraded mode in spec.md; disclosure none). No human-only path changes (docs/merge-requests/human-patches/019.md says so).

## 5. Files expected to touch

New: `apps/web/src/room/scene/gait.ts`; `apps/web/test/room/gait.test.ts`; `apps/web/test/room/gait-rig.test.ts`; `apps/web/test/room/avatar-gait.test.ts`.
Changed: `apps/web/src/room/scene/avatars.ts` (the controller: §2.3); `apps/web/src/room/stage.ts` (the signal's type only); `apps/web/test/helpers/glb.ts` (an opt-in `legs` option on the fixture rig at line 1174, which adds the six leg bones, so no other test's skeleton changes); `apps/web/test/room/avatar-driver.test.ts` (its "slides in idle-holding" expectations now hold for a model without leg bones only); `apps/web/README.md` (a short note); possibly `apps/web/src/lookdev/*` (T010).
Not touched: `scene/walking.ts`, `scene/figure.ts`, `walk/*`, `room/scene.yaml`, compose and build code, `assets/**`, `.claude/**`, CLAUDE.md, REVIEW.md, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `assets/policy/**`.

Overlap with the night's other items: `avatars.ts` and `stage.ts` are shared ground with the dog, dinosaur, and twin-running specs (d, e, h, i); this stack's edits to them are additive and small, and the implementer merges this branch first (the supervisor's one line).

## 6. Order of work, on one line

The implementer merges `night/spec-019/spec-019` into the night's line first, so its three planning artifacts are on the line, then T001 on, one commit per step, RED then GREEN. A reviewer who didn't write the code reviews the diff against REVIEW.md, spec.md, and this plan. If implementation departs from this plan, `plan.md` is updated in the same commit.

## 7. Verification

Small tests per task (tasks.md); the stack runs `make lint` per task. The full `make check` runs once, at the end of the night's stack by one task, and goes into that stack's merge-request note (the order's rule 4). `apps/web/test/room/twin-2d.test.ts` is a known flaky test under load. SC-004's chunk size is read from `make build`'s report in that run.

## 8. Risks

- The studio rig's local axes may differ from X-flexion: R-07's test catches it before any pixel is drawn.
- Real avatar legs and the dress or trousers meshes may clip at large angles: the amplitude constants are small and data-free; he tunes at lookdev.
- A later studio `walk` clip arrives with its own stride length: the time-scale clamp keeps it plausible; a per-clip `walk_clip_mps` can be a data field then, through the lifecycle.
