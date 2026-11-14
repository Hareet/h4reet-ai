# Feature Specification: The Twin and the Dog Run From the Dinosaur

**Feature Branch**: `night/spec-025/spec-025`, cut from `main` at 3c0e4cd0. The implementer merges this branch first, and the implementation runs on one line after it (plan.md §9).

**Created**: 2026-11-13

**Status**: Draft, specified, clarified, planned, tasked, and analyzed on the night of 2026-11-13 from the draft intent beside it ([`intent/025-twin-and-dog-run-from-dino.md`](../../intent/025-twin-and-dog-run-from-dino.md)). Approved provisionally by the Author's order of 2026-11-13 (plan.md, tasks.md). Six clarification questions took their recommended answers, each provisional and his to overturn on the morning page.

**Input**: the intent; the [constitution](../../.specify/memory/constitution.md); `CLAUDE.md`; [spec 016](../016-the-twins-own-avatar/spec.md) and its [twin-states](../016-the-twins-own-avatar/contracts/twin-states.md) contract (the twin's states, FR-019 to FR-024); [spec 008](../008-visitor-movement/spec.md) (the walkable floor and the figure driver); [spec 009](../009-room-avatars/spec.md) (the loader, the stand-ins); code read at `main`: `apps/web/src/room/scene/twin-states.ts`, `figure.ts`, `walking.ts`, `avatars.ts`, `loader.ts`, `walk/movement.ts`, `compose/floor.ts`, `motion.ts`, `a11y.ts`.

**Dependencies not on this branch**: specs 019 (walking legs), 020 (the dog), and 021 (the dinosaur) are being written in parallel and are not on `main`. This spec is written against their intents as the Author's order states them, and names the interfaces it assumes in §Assumed Interfaces. If a spec differs, this spec's FR numbers that rest on it (named there) are reworked; nothing else moves.

Summary: while the dinosaur is in the room, the twin and the dog move away from it along the walkable floor, the twin with spec 019's walking legs at a running pace, the dog with spec 020's run, both ahead of the dinosaur and never caught. They go back to their places when it leaves. Without any of the three items' files, or under reduced motion, nothing runs and the room is as it was.

## Clarifications

### Session 2026-11-13, taken under the Author's order of that date

The order: "For each item, the spec-writer takes the recommended answer at clarify and at the plan". Each answer is provisional and the Author's to overturn; the options are kept. None is his answer.

- Q1: What starts and ends the run? → Taken: the dinosaur's own presence. The run begins when spec 021's dinosaur reports it is in the room and ends a short time after it reports it is gone; there is no separate switch (option A). Others: B, a visitor control that calls the dinosaur; C, a timer of this spec's own. Reading: the item is the twin and the dog "running from dino", so the run is a response to the dinosaur, whatever brings it. (FR-001 to FR-003.)
- Q2: Does the dinosaur ever catch them? → Taken: never. They keep at least a stated distance ahead, and no contact or harm is shown (option A). Others: B, a comic near-miss; C, the dinosaur catches the dog. Reading: the Author's wording is "running from"; the dinosaur eating pieces of the room is item i, spec 026's. (FR-007.)
- Q3: Where do they run? → Taken: away from the dinosaur on the walkable floor, inside its bounds and around its obstacles, turning along the edges when cornered (option A). Others: B, out of the room's door; C, fixed waypoints. Reading: the floor is spec 008's data; steering on it needs no new scene data. (FR-004 to FR-006.)
- Q4: Does the visitor's figure run too? → Taken: no. The visitor's walking, camera, and controls are untouched (option A). Others: B, the visitor's figure flees on the same rule. Reading: the order names "twin and dog". (FR-012.)
- Q5: What does the twin do while it talks? → Taken: the conversation panel works as before and the answer shows as before; while the run lasts, the twin's figure runs, whatever its conversation state, and the talking, listening, and greeting clips wait until it ends (option A). Others: B, the twin stops running to talk. Reading: spec 016's states are the figure's; fleeing outranks them, and no word of the twin's changes. (FR-010, FR-011.)
- Q6: Do the twin and the dog run together? → Taken: each runs from the dinosaur on its own rule; the dog runs a little faster than the twin and ahead of it when the two are near each other, so it never trips the twin's path (option A). Others: B, the dog follows the twin at a leash's distance. (FR-005, FR-008.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Twin and the Dog Run From the Dinosaur (Priority: P1)

As a visitor in the 3D room, when the dinosaur comes in, I see the twin and the dog run away from it.

**Why this priority**: it is the item itself.

**Independent Test**: `vitest run apps/web/test/room/chase-steer.test.ts apps/web/test/room/chase-director.test.ts`, on numbers alone, with a fake floor and fake figures; then the Author's look.

**Acceptance Scenarios**:

1. **Given** the dinosaur reports it is in the room at a place on the floor, **When** the run starts, **Then** the twin and the dog each move away from it, at their own speeds, and each one's distance from the dinosaur never falls below the safe distance.
2. **Given** the dinosaur moves, **When** it comes toward one of them, **Then** that figure's heading follows the way it runs, and its walking or running clip plays by its speed (spec 019, spec 020).
3. **Given** the dinosaur reports it has gone, **When** the delay passes, **Then** each figure walks back to its own place and takes its resting clip, and the twin's conversation states apply again.

### User Story 2 - Nothing Breaks When a Piece Is Missing (Priority: P1)

As a visitor, I want the room to work whatever happens to the dinosaur's, the dog's, or the twin's walking files.

**Independent Test**: `vitest run apps/web/test/room/chase-degraded.test.ts`: each of the three missing, failing, or still loading, with reduced motion, below the floor, and the 2D room.

**Acceptance Scenarios**:

1. **Given** the dinosaur's model isn't showing, **When** the room runs, **Then** nothing flees: the twin and the dog keep their places.
2. **Given** the dinosaur shows but the dog's model doesn't, **When** it comes in, **Then** the twin runs alone, and the reverse for the dog.
3. **Given** the twin has no walking clip, **When** the dinosaur comes in, **Then** the twin stays at its place in its usual states; no sliding figure is shown.
4. **Given** reduced motion, **When** the dinosaur comes in, **Then** no figure moves: both stay at their places, and the announcement (User Story 3) still says what is happening.

### User Story 3 - The Run Is Told in Words (Priority: P2)

As a screen reader user, I want to be told that the twin and the dog are running from the dinosaur.

**Independent Test**: `vitest run apps/web/test/room/chase-notes.test.ts`.

**Acceptance Scenarios**:

1. **Given** a run starts, **When** the page is read, **Then** the room's polite live region says once, "The twin and the dog are running from the dinosaur", and once when it ends, with no repeat per frame.

### User Story 4 - The Conversation and the Visitor Are Untouched (Priority: P1)

As a visitor, I want to keep typing, reading the twin's answers, and walking while the chase goes on.

**Independent Test**: `vitest run apps/web/test/room/chase-states.test.ts apps/web/test/room/twin-states.test.ts`.

**Acceptance Scenarios**:

1. **Given** a run is on, **When** an answer arrives, **Then** it shows in the panel as before, the twin's state machine records it, and the figure keeps running.
2. **Given** the run ends, **When** the twin's last answer's time is not over, **Then** the talking clip plays for what is left of it.
3. **Given** the visitor walks, **When** the run is on, **Then** the visitor's figure moves as spec 008 has it, and no figure of the chase blocks it by more than its own footprint.

### Edge Cases

- The dinosaur stands still on the twin's spot: the twin and the dog run to the floor's farthest reachable point, then hold (no jitter: steering has a dead band).
- A cornered figure: it slides along the edge (spec 008's slide), turning away from the dinosaur along the edge; if no direction increases the distance, it holds at its place, facing the dinosaur.
- The dog and the twin on one spot: they are separated by the footprint's radius so they don't overlap.
- The dinosaur flickers in and out: the end delay (FR-003) keeps the run from stopping and starting each frame.
- The tab is hidden or paused (spec 002's pause): the run's clock is the room's clock and pauses with it.
- A frame of a very long time: steps are cut as spec 008's are, so nothing tunnels through an obstacle.
- The kill switch is `degraded` or the tier is unknown: no effect; nothing here calls the gateway.

## Requirements *(mandatory)*

### Functional Requirements

**The run**

- **FR-001**: The run MUST start only while the dinosaur's driver reports it is present with a floor position (§Assumed Interfaces, DinoPresence). Without that report, no figure of this spec moves.
- **FR-002**: The run MUST end FLEE_END_DELAY_S (data, default 2 s) after the dinosaur reports it is gone, then each figure walks back to its home at walking speed.
- **FR-003**: Presence reported again within the delay MUST continue the run without a restart.

**Steering**

- **FR-004**: Each frame, a fleeing figure's goal direction MUST be the direction that increases its distance from the dinosaur's position, blended with a pull toward the farthest open point of the floor, so a corner is escaped and not pinned. The steering is pure and deterministic.
- **FR-005**: The twin runs at TWIN_RUN_MPS and the dog at DOG_RUN_MPS, both scene data in a `chase` block, with the dog's the larger by default (Q6). Defaults are placeholders the Author's look sets: twin 3.0 m/s, dog 4.0 m/s, dinosaur's speed as spec 021 gives it, never above what keeps FR-007.
- **FR-006**: Movement MUST use spec 008's `step`/`slide` on the walkable floor, so no figure leaves the bounds or enters an obstacle.
- **FR-007**: No figure may be caught (Q2). A figure's distance from the dinosaur is kept at or above SAFE_M (data, default 1.5 m) by two rules: when the distance falls below SAFE_M + 1 m the figure's speed is raised to the dinosaur's reported speed plus a margin (data), and a figure that is cornered holds and faces the dinosaur. This spec never moves the dinosaur; it assumes spec 021's dinosaur does not enter a figure's footprint (§Assumed Interfaces, A021). A seeded test asserts the property while the dinosaur is slower than the margin allows, and names the case where A021 is broken.
- **FR-008**: Figures MUST keep a minimum separation (data, default 0.5 m) from one another; the dog yields along the perpendicular.
- **FR-009**: Each figure's heading MUST face the way it runs, turn-rate limited (data), and its clip MUST follow its speed: idle below a threshold, walk, then run (spec 019 and 020's clips, by role; §Assumed Interfaces). A missing run clip falls back to the walking clip at a raised time scale, up to 2; a missing walking clip means that figure does not run (User Story 2, scenario 3).

**The twin's states and the conversation**

- **FR-010**: Spec 016's state machine gains one state, `fleeing`, first in its order of precedence, with the clip role `walk` (and `run` when it exists). While the run lasts it holds; when it ends the other states apply from the machine's own timers, which kept running (User Story 4).
- **FR-011**: The conversation, the text box, the panel, the guards, and the twin's answers MUST NOT change. The run reads no conversation text and sends nothing.
- **FR-012**: The visitor's figure, camera, and controls MUST NOT change (Q4).

**Degraded mode**

- **FR-013**: A figure whose model shows its stand-in or capsule, or whose files failed, MUST NOT run (the stand-in's cut-out driver doesn't walk the floor on its own). The rest run per figure.
- **FR-014**: Under reduced motion or a paused room (spec 002's motion store), no figure moves for the chase; each holds at home in its usual state (User Story 2, scenario 4).
- **FR-015**: In the 2D room, below ADR 0010's floor, or with a lost context, the chase doesn't run and nothing else changes.

**Telling it in words**

- **FR-016**: The room's polite live region MUST say "The twin and the dog are running from the dinosaur" once at the run's start, and "The dinosaur has gone; the twin and the dog are back" once at its end, with the figures named by what is running (the twin alone, the dog alone).

**Cost, telemetry, and data**

- **FR-017**: A run adds no network request, no model call, no new file, and no byte leaving the device. The first visit's budget is spec 019 to 021's.
- **FR-018**: A telemetry span or frame-log record `room.chase` MUST carry start, end, and duration, and the minimum distance kept; no payload, and no visitor data (Constitution I). The room's dashboard panel for figures gains the run's count and minimum distance (docs only here).
- **FR-019**: The frame budget: the run's per-frame cost MUST stay under 0.2 ms on the reference desktop in a seeded benchmark of 600 frames, and add no allocation per frame (steering writes into reused vectors).

### Key Entities

- **Chase block**: scene data, `figures.chase`: `flee_end_delay_s`, `safe_m`, `separation_m`, `twin_run_mps`, `dog_run_mps`, `turn_rate_rad_s`, `clip_thresholds`.
- **Flee state**: per figure: home, position, heading, speed, phase (home, fleeing, returning).
- **Chase director**: the pure module that reads dinosaur presence and gives each figure a pose per frame.

## Assumed Interfaces (from specs 019, 020, 021; not on this branch)

Each is this spec's assumption from the Author's item text and the code on `main`; the spec for each item may name it differently, and the adapter in plan.md §4 is the one place to change.

- **A019 (walking legs)**: the twin's figure driver (`FigureDriver`, `scene/figure.ts`) already crossfades idle and walk by `pose.speed`; spec 019 makes the twin's model play a walk clip (role `walk`, optionally `run`) when `pose.walking` is true, and exports the role names from `scene/twin-states.ts`'s lists. If the twin's driver is not yet fed a pose from outside the walking view, this spec's director feeds it through the same `frame({pose, camera, animate, dt})` call.
- **A020 (the dog)**: a dog figure exists in the scene's `figures` block with a driver of the same `FigureDriver` shape, clip roles `idle`, `walk`, `run`, a home placement, and a footprint radius; it is `null` while its model isn't showing.
- **A021 (the dinosaur)**: a `DinoPresence` getter, `{ present: boolean, x: number, z: number, speed: number, radius: number } | null`, in the room's floor coordinates, read each frame; it is `null` while the dinosaur's model isn't showing. Its own movement and its not entering a figure's footprint are spec 021's.

## Success Criteria *(mandatory)*

- **SC-001**: In seeded runs of 600 frames on a fake floor (open, cornered, with an obstacle), no figure's distance from the dinosaur falls below SAFE_M, and none leaves the floor.
- **SC-002**: With the dinosaur gone, every figure is at home within 20 s at walking speed, facing as its placement turns it.
- **SC-003**: With any one of the three missing, the other figures behave per User Story 2; no exception is thrown.
- **SC-004**: Spec 016's twin-state tests pass unchanged except where FR-010 adds the state.
- **SC-005**: Steering adds under 0.2 ms a frame (FR-019) and no per-frame allocation.
- **SC-006**: The live region's two messages appear once each per run.
- **SC-007**: The Author's look at the run: twin and dog read as running, the legs plant without skating beyond what spec 019's own check allows (his, in the morning).

## Amendments to Earlier Specs

- **Spec 016, FR-021**: the state list gains `fleeing` first (M1). The closed list in `scene/twin-states.ts` changes; its contract is amended in the plan's §4.
- **Spec 008, FR-034**: the figure driver is also fed by the chase director for the twin and the dog (M2); the visitor's feed is unchanged.

## Assumptions

- Specs 019, 020, and 021 land before this one ships. This one can't build its tests on their code, so its tests use fakes of the interfaces above, and one integration task (T012) runs once they are on the line.
- The look approval of each model is those specs'; this one adds no asset and needs none (no `assets/**` or `assets/policy/**` change).
- No constitution control is deferred or dropped; no deviation to name.
- Speeds, distances, and the delay are placeholders, data, and the Author's to set at lookdev.

## Expected Cost Impact

Cloud: none. A pure client-side motion; no model call, no request. Dev-time: about one implementer session plus a review.

## Degraded-Mode Behavior

Written first (Principle I): the chase happens only when the dinosaur, and the figure's own model and clips, all show, with motion allowed, in the 3D room above the floor. Any other case: the room is as `main` has it. See FR-013 to FR-015 and User Story 2.

## Data-Flow Disclosure Entries

None: no byte leaves the visitor's device (FR-017). `docs/data-flow-disclosure.md` is unchanged.

## The "New Endpoint or Feature" List (`CLAUDE.md`)

- Telemetry span: FR-018.
- Dashboard panel: FR-018 (a docs change in the plan's file list).
- Cost estimate: above.
- Degraded-mode behavior: above.
- Data-flow disclosure entry: none needed.

## Constitution Check

| Principle | How this complies |
|---|---|
| I. Data-Local | No new byte leaves the device; no cloud. |
| II. Production-Grade | Tests first (tasks.md), a telemetry record, degraded modes, a frame budget. |
| III. Intent, Spec, Code, Humans Merge | The intent is a draft for the Author's acceptance; the Author merges. |
| IV. Least Privilege | No human-only path changes (docs/merge-requests/human-patches/025.md says so). |
| V. Cost | None; stated. |
| VI. Build in Public | Open questions on the morning page with recommendations. |
| VII. Own the Whole Product | Nothing about the Author is stated beyond his own words, quoted in the intent. |
| VIII. Honest AI | The twin's disclosure line is untouched; the run is a staged animation, announced in words, and it changes none of the twin's answers. |

## Open Questions

Q1 to Q6 above, each with its recommended answer, each also in `/night/io/out/questions.md` for the morning page. Further: **Q7**: if spec 021 reports no dinosaur presence interface of the shape assumed, the adapter changes, not this spec's requirements (no question for the Author).
