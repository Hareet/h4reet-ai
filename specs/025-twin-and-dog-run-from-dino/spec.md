# Feature Specification: The Twin and the Dog Run From the Dinosaur

**Feature Branch**: `night/spec-025/spec-025`, cut from `main` at 3c0e4cd0; reworked on `night/rework-spec-025/rework-spec-025` after the Opus review rv-spec-025, and again on `night/rework2-spec-025/rework2-spec-025` after the Opus review rv-rework-spec-025 (the order's rule 6). The implementer merges this branch first, and the implementation runs on one line after specs 019, 020, and 021 (plan.md §9).

**Created**: 2026-11-13 · **Reworked**: 2026-11-14 (twice)

**Status**: Draft, specified, clarified, planned, tasked, and analyzed on the night of 2026-11-13 from the draft intent beside it ([`intent/025-twin-and-dog-run-from-dino.md`](../../intent/025-twin-and-dog-run-from-dino.md)); reworked on 2026-11-14 on Opus 5.5 after rv-spec-025 (blocking: B1 to B3), and again after rv-rework-spec-025 (blocking: BLOCKING-1, the page's Q139). Approved provisionally by the Author's order of 2026-11-13 (plan.md, tasks.md). Every clarification answer is the recommended one, taken under the order's rule 1, provisional and his to overturn on the morning page; none is his answer. The page's Q110 to Q112, which rv-spec-025 raised, and Q139, which rv-rework-spec-025 raised, are among them, taken the same way.

**Input**: the intent; the [constitution](../../.specify/memory/constitution.md); `CLAUDE.md`; [spec 016](../016-the-twins-own-avatar/spec.md) and its [twin-states](../016-the-twins-own-avatar/contracts/twin-states.md) contract (the twin's states, FR-019 to FR-024); [spec 008](../008-visitor-movement/spec.md) (the walkable floor, the walking view's pose); [spec 009](../009-room-avatars/spec.md) (the figures, the loader, RK5); and the night's siblings at their latest branches (read with `git --no-replace-objects`): spec 019 at `night/rework-spec-019/rework-spec-019` (the gait; its Q2 and FR-014), spec 020 at `night/rework-spec-020/rework-spec-020` (the dog: its Q1, FR-007, FR-009, FR-017), spec 021 at `night/rework-spec-021/rework-spec-021` (the dinosaur: its Q1), spec 024 at `night/rework2-spec-024/rework2-spec-024` (the dinosaur eats; its Q117 and Q-R2c). The gait's code is read at `night/fix-019/fix-019` (`scene/gait.ts`, with the hips' lowering, `standingLift`, and `scene/avatars.ts`'s `stepGait`), which `fix-020` doesn't carry yet. The rest of the code is read on the line, `night/fix-020/fix-020` (specs 018 to 020 implemented) and `night/rework-018/rework-018`: `apps/web/src/room/stage.ts` (`FigureId`, `FigureSignal`), `scene/avatars.ts` (`wants`, `clipOf`, `place`, `instanceFor`, `OWN`, the visitor's gait), `scene/twin-states.ts` (`TWIN_CLIP_ROLES`, `TWIN_STATES`), `scene/loader.ts` (`figureEntries`) and its caller `src/lookdev/stage.ts`, `scene/walking.ts` (`startPose`), `walk/movement.ts`, `scene.ts` (the stage's frame), `likeness-line.ts`, `app.ts` (`figureSignal`), `choice/avatars.ts` (`CLIP_ROLES`, `AVATAR_SHAPES`), `compose/floor.ts`, `compose/vocabulary.ts`, `build/room/schema.ts`, `build/room/checks/ri.ts` (RI8), `build/room/emit.ts` (`twinBlockOf`), `build/room/reach.ts` (`playedRoles`), `build/room/checks/rk.ts` (RK5), `events.ts`, `apps/web/room/scene.yaml` and the catalog's `room-shell.yaml`, `work-desk.yaml`, and `twin-figure.yaml` (the room's floor, plan §3), `ui-words.yaml`, `ui-keys.ts`, `docs/data-flow-disclosure.md` (rows V1, V4), and `deploy/grafana/dashboards/h4-runtime.json`.

## Source: The Author's Words

His item, the letter and the title in his words, from his order of 2026-11-13, which the intent quotes whole:

> h) "twin and dog running from dino"

His orders file numbers it 8 and adds "Needs c, d, and e."; that number and note are the orders file's, not his words.

How far the night goes (2026-11-13), his: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over".

**Readings, beside his words, never in their place.**
- "dino" is the visitor's figure when the visitor chose the Dinosaur: spec 021's Q1 (the page's Q32, "Answered: recommended, the Author 2026-11-13") makes the dinosaur "the visitor's avatar only", and spec 024 reads item i's "dino" the same way. Nothing in the room moves the dinosaur but the visitor's walking.
- "dog" is the room's dog figure, which spec 020's Q1 (the page's Q69, "Answered: recommended, the Author 2026-11-13") leaves to this spec: "spec 025 owns the room figure, its placement, and the run".
- "twin" is the twin's figure in the room (spec 016), its own model or its stand-in.
- "running from" is read as moving away on the room's floor, never caught (Q2).

## Clarifications

### Session 2026-11-13, taken under the Author's order of that date

The order: "For each item, the spec-writer takes the recommended answer at clarify and at the plan". Each answer is provisional and the Author's to overturn; the options are kept. None is his answer. The rework of 2026-11-14 rewrote Q1, Q4, and Q5 and added Q7 to Q10; the second rework of that day rewrote Q2's reading and added Q11 to Q13. Each rewritten or added answer is the recommended one, taken the same way.

- Q1 (rewritten in the rework; the page's Q110): What starts and ends the run? → Taken: **the visitor's figure, as the dinosaur, in the walking view.** The run is on while the visitor's chosen avatar is the dinosaur, its model shows (spec 021), and the walking view is on; it ends a short delay after any of those stops holding (option A). Others: B, the dinosaur's flat cut-out counts too, so the run works before the model arrives; C, a control the visitor presses. Reading: there is no dinosaur in the room but the visitor's (spec 021's Q1); spec 024's FR-001 asks the same three things of its eating, so the two items start from one condition. (FR-001 to FR-003.)
- Q2: Does the dinosaur ever catch them? → Taken: **never.** They keep at least a stated distance from it, and no contact or harm is shown (option A). Others: B, a comic near-miss; C, the dinosaur catches the dog. Reading: the Author's wording is "running from"; the dinosaur eating pieces of the room is item i, spec 024's. Since the visitor walks the dinosaur where they like, "never" rests on no assumption about where it walks: the figures are faster than the walking speed by a margin the build checks, and a property test holds it on the room's own floor (FR-005, FR-007). "Never caught" has two clauses (Q11, rewritten in the second rework): a figure already under `safe_m` when the run starts, resumes, or the dinosaur jumps back to its start moves away, its distance never decreasing, until it reaches `safe_m`; from then it stays at or above it.
- Q3: Where do they run? → Taken: **away from the dinosaur on the walkable floor**, inside its bounds and around its obstacles, turning along the edges when cornered; beyond a stated distance they stand and watch it (option A). Others: B, out of the room's door; C, fixed waypoints. Reading: the floor is spec 008's data; steering on it needs no new scene data. (FR-004 to FR-006.)
- Q4 (rewritten in the rework; the page's Q110): Does the run change the visitor's walking? → Taken: **no.** The visitor's figure, the dinosaur, walks, turns, reaches, and frames the camera as spec 008 has it, on the same floor; the run only reads its pose, and the running figures are not obstacles to it (option A). Others: B, the running figures block the dinosaur as moving obstacles (spec 008's floor and movement change); C, the dinosaur slows near them. Reading: the visitor drives the dinosaur; the figures, not the visitor, do the running. (FR-016.)
- Q5 (reworded in the rework): What does the twin do while it talks? → Taken: the conversation panel works as before and the answer shows as before; while the run lasts, the twin's figure runs, whatever its conversation state, playing its idle with spec 019's gait over it (Q7), and the talking, listening, and greeting clips wait until it ends (option A). Others: B, the twin stops running to talk. Reading: spec 016's states are the figure's; fleeing outranks them, and no word of the twin's changes. (FR-013, FR-015.)
- Q6: Do the twin and the dog run together? → Taken: **each runs from the dinosaur on its own rule**; the dog runs a little faster than the twin, and the two keep a separation, the dog yielding (option A). Others: B, the dog follows the twin at a leash's distance. (FR-005, FR-008.)
- Q7 (added in the rework; the page's Q111): How do the twin's legs run? → Taken: **by spec 019's gait over the twin's idle**, where the model the twin shows (its own or its stand-in) has the six leg bones and the hips bone; where it doesn't, or the gait can't apply, the twin holds at its place in its usual states and the dog runs alone (option A). No `walk` or `run` joins `TWIN_CLIP_ROLES`. Others: B, the twin's own `walk` and `run` clips, a studio round and his look approval first; C, the twin slides in its idle. Reading: spec 019's Q2 says the twin running "can reuse the gait's pure part", and its FR-014 promises that part "reusable by a later figure (the twin running, his item h) without change to its tests". (FR-014.)
- Q8 (added in the rework; the page's Q112): What does the dog play when it has no `run` clip? → Taken: **its `walk` clip, at its own speed (time scale 1)**, while it moves at its run speed; with neither clip, the dog holds at its place (option A). Others: B, `walk` at a time scale raised with the speed, up to 2 (the first version of FR-009); C, the dog doesn't run without `run`. Reading: spec 019's Q8 (the page's Q63) dropped the time scale by speed for a `walk` clip; this keeps the same rule. (FR-010.)
- Q9 (added in the rework): Does the room's dog show beside a visitor who chose the dog? → Taken: **yes**: the room's dog is at its home for every visitor in the 3D room, whatever avatar they chose, and the likeness line shows once (spec 020's FR-007) (option A). Others: B, the room's dog is hidden while the visitor is the dog. Reading: the room already shows two figures of one model, the twin's stand-in the man beside a visitor who chose the man (spec 009's Q1); spec 020 leaves this to this spec ("Whether the room shows its dog figure beside a visitor who chose the dog is spec 025's"). (FR-018.)
- Q10 (added in the rework, from rv-spec-025's I2): How is the run observed in production? → Taken: **by no usage event**, a named deviation (Assumptions, Deviations): an event sent only when the run happens would tell the stack the visitor chose the dinosaur, and row V4 of the data-flow disclosure says the usage events never carry the avatar. The room's dog figure, which every 3D visit loads, is observed by the existing "Visits whose avatar failed" panel (FR-026) (option A). Others: B, a once-a-visit `chase_started` event with no identifier, row V4's "never carries" amended in his words to say this event shows the visitor was the dinosaur, a line in `config/room-events.yaml`, and a use panel in `h4-runtime.json` (the route the page's Q108 takes for spec 024); C, the event for every visit that walked, with a boolean, which carries the same. (FR-027.)
- Q11 (added in the second rework; the page's Q139, from rv-rework-spec-025's BLOCKING-1): What holds when a figure is already under `safe_m` at the run's first frame? → Taken: **two clauses** (option A, the recommended one). (a) A figure under `safe_m` when the run starts or resumes, or when the dinosaur's pose jumps rather than walks, moves away at its run speed from that frame, its distance never decreasing until it reaches `safe_m`. (b) From then it stays at or above `safe_m` while the run is on. The property test starts the pursuer at `floor.start` and at seeded starts and checks both clauses. A test over the room's data checks each home against `floor.start` and `safe_m`. Others: B, `safe_m` is checked only after a grace time from the run's start; C, the run can't start while a figure is under `safe_m`. Reading: every walk starts at `floor.start` (`walking.ts`'s `startPose`, at its entry and its leaving). On `fix-020` the `visitor-figure` (`[-0.7, 0, 0.58]`) and `twin-figure` (`[0.66, 0, 0.469]`) placements are 1.364 m apart, under the first default of 1.5 m, so the first FR-007 failed on frame 0. (FR-007, FR-009, SC-001.)
- Q12 (added in the second rework, found while recording Q11's numbers): The room's floor is far smaller than the first defaults assumed. Is a short run inside it what item h is here? → Taken: **yes, build the run on the room's floor as it is, with the defaults fitted to it** (option A). The look is the Author's (SC-008). Others: B, build it, but leave it off (no `figures.chase`) until the room has more floor, which is his to size; C, the figures leave through the room's open front and come back when the run ends (Q3's option B). Reading, the spec-writer's arithmetic from the catalog and `scene.yaml` (plan §3):
  - The room's shell is 2.13 m wide and 1.22 m deep (`room-shell.yaml`), and the work desk (1.5 × 0.8 m, against the back wall) fills most of it.
  - The dinosaur walks a strip in front of the desk about 1.1 m long and 0.27 m deep. The twin's obstacle closes the strip's right end at x ≈ 0.17. FR-017 keeps that obstacle while the twin's picture is away, so the dinosaur never enters the twin's corner.
  - The chase floor adds that corner, out to x ≈ 0.77. The farthest a figure can be from the dinosaur's reach is about 0.6 m.
  - So the first `safe_m`, 1.5 m, can't hold anywhere in the room: from the strip's middle, the dinosaur is within about 1.1 m of every point of the chase floor. `flee_m` 3 covers all of it, and with `separation_m` 0.5 the second figure in the corner stands about 0.2 m from the dinosaur's reach. The defaults become `flee_m` 1.0, `safe_m` 0.4, and `separation_m` 0.3, and the dog's home moves into the twin's corner.
  - In this room, the run is the twin and the dog backing into the twin's corner, a few tenths of a metre, facing the dinosaur. (FR-004, FR-007, FR-008, FR-018; plan §3.)
- Q13 (added in the second rework, to match spec 024's page Q-R2c): If Q10 stands, does its deviation get an ADR? → Taken: **yes**. The constitution's governance asks "an ADR if permanent". If the Author confirms Q10, an ADR records "no usage event, span, or panel for the run, since an event would carry the avatar". The docs role writes it, since this spec-writer's task can't, and it is on main before the implementation merges. It is one ADR with spec 024's where page Q-R2c takes that option, else its own (option A). Others: B, no ADR, the spec's justification alone. (Assumptions, Deviations.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Twin and the Dog Run From the Dinosaur (Priority: P1)

As a visitor who chose the Dinosaur, walking in the 3D room, I see the twin and the dog run away from me.

**Why this priority**: it is the item itself.

**Independent Test**: `vitest run apps/web/test/room/chase-steer.test.ts apps/web/test/room/chase-director.test.ts`, on numbers alone, with fake floors and the room's own floor composed from `scene.yaml`, a scripted visitor pose, and fake figures; then the Author's look.

**Acceptance Scenarios**:

1. **Given** the visitor is the dinosaur, its model shows, and the walking view is on, **When** the dinosaur comes within `flee_m` of the twin or the dog, **Then** that figure moves away from it at its run speed, in two clauses (Q11): (a) a figure already under `safe_m` when the run starts or resumes, or when the dinosaur jumps back to its start, moves away from that frame, its distance never decreasing until it reaches `safe_m`; (b) from then on, its distance from the dinosaur never falls below `safe_m` while the run is on.
2. **Given** the run is on, **When** the dinosaur turns toward one of them, **Then** that figure's heading follows the way it runs, the twin's legs step by spec 019's gait, and the dog plays `walk` or `run` by its speed.
3. **Given** the visitor leaves the walking view, **When** the delay passes, **Then** each figure walks back to its home at `walking.speed_mps`, takes its resting clip, and the twin's conversation states apply again.
4. **Given** the visitor chose the woman, the man, or the dog, **When** they walk, **Then** nothing runs: the twin and the dog stay at their places.

### User Story 2 - Nothing Breaks When a Piece Is Missing (Priority: P1)

As a visitor, I want the room to work whatever happens to the dinosaur's, the dog's, or the twin's files.

**Independent Test**: `vitest run apps/web/test/room/chase-degraded.test.ts`: each of the three missing, failing, or still loading; a twin model without the leg bones; reduced motion; a paused room; quality level 1; below the floor; the 2D room.

**Acceptance Scenarios**:

1. **Given** the dinosaur shows its flat cut-out (no model, or a failed one), **When** the visitor walks, **Then** nothing runs: the twin and the dog keep their places.
2. **Given** the dog's model isn't bundled or failed, **When** the dinosaur comes, **Then** no dog shows at its home and the twin runs alone.
3. **Given** the model the twin shows has no six leg bones or no hips bone (or the twin shows its capsule), **When** the dinosaur comes, **Then** the twin stays at its place in its usual states, no sliding figure is shown, and the dog runs alone.
4. **Given** reduced motion, a paused room, or quality level 1 or more, **When** the dinosaur comes, **Then** no figure moves for the run, and the live region says nothing of a run.

### User Story 3 - The Run Is Told in Words (Priority: P2)

As a screen reader user, I want to be told that the twin and the dog are running from the dinosaur.

**Independent Test**: `vitest run apps/web/test/room/chase-notes.test.ts`.

**Acceptance Scenarios**:

1. **Given** a run starts with figures moving, **When** the page is read, **Then** the room's polite live region says once "The twin and the dog are running from the dinosaur" (or names the one that runs), and once when they are back, with no repeat per frame.
2. **Given** no figure can move (US2 scenario 4, or both figures held), **When** the dinosaur walks, **Then** the live region says nothing of a run.

### User Story 4 - The Conversation and the Visitor Are Untouched (Priority: P1)

As a visitor, I want to keep typing, reading the twin's answers, and walking while the run goes on.

**Independent Test**: `vitest run apps/web/test/room/chase-states.test.ts apps/web/test/room/twin-states.test.ts`.

**Acceptance Scenarios**:

1. **Given** a run is on, **When** an answer arrives, **Then** it shows in the panel as before, the twin's state machine records it, and the figure keeps running.
2. **Given** the run ends, **When** the twin's last answer's time is not over, **Then** the talking clip plays for what is left of it.
3. **Given** the run is on, **When** the visitor walks, turns, or reaches, **Then** the dinosaur moves as spec 008 has it, on the same floor, with the same reach targets; the twin's home stays its pick area and reach target while its picture is away.

### User Story 5 - The Room's Dog (Priority: P1)

As any visitor in the 3D room, I see the Author's dog at its place, told in his line whose likeness it is.

**Independent Test**: `vitest run apps/web/test/room/dog-figure.test.ts apps/web/test/room/likeness-line-anywhere.test.ts`.

**Acceptance Scenarios**:

1. **Given** the bundle holds the dog's approved model and the scene has `figures.dog`, **When** any visitor enters the 3D room above the floor, **Then** the dog's model shows at its home, at the dog's height, playing `idle`, and the approval's line shows once in the room's note and "Around the room".
2. **Given** the visitor also chose the dog, **Then** both dogs show and the line shows once (Q9).
3. **Given** the dog's model isn't bundled, fails, or the room is 2D or below the floor, **Then** nothing shows at the dog's home, no line, and the room is as `main` has it.

### Edge Cases

- The dinosaur stands still beside a figure: the figure moves out to `flee_m`, or as far as the floor lets it, and stands, facing it (no jitter: steering has a dead band).
- A figure already under `safe_m` at the run's first frame: the dinosaur's model arrives late, mid-walk, or the run resumes after a pause. The figure moves away at once, its distance never decreasing until it reaches `safe_m` (FR-007's clause a). The turn rate bounds its facing, not its movement (FR-009).
- The visitor leaves the walking view mid-run: the dinosaur's pose jumps back to `floor.start` (`walking.ts`'s `startPose`), and the end delay runs (FR-002). A figure the jump leaves under `safe_m` is clause (a)'s.
- The room is small (Q12): the dinosaur's strip is about 1.1 m by 0.27 m, and the twin's corner beyond it about 0.6 m. The figures back into the corner, a few tenths of a metre, and stand facing the dinosaur. The dinosaur can't follow them there, since FR-017 keeps the twin's obstacle on its floor.
- A cornered figure: the lookahead steers it along the edge and around the dinosaur before it is pinned (FR-004); the property test (FR-007) holds the distance on the room's floor.
- The dog and the twin on one spot: they are kept `separation_m` apart; the dog yields.
- The visitor leaves and re-enters the walking view quickly: the end delay (FR-003) keeps the run from stopping and starting.
- The tab is hidden or the room paused (spec 002's pause): the run's clock is the room's clock and pauses with it; no figure moves while paused, and after the resume they walk back if the run has ended.
- Reduced motion or a quality drop mid-run: a figure away from home is put back at home at once (FR-024).
- A frame of a very long time: steps are cut as spec 008's are, so nothing tunnels through an obstacle.
- The twin's home while it's away: its placement keeps its obstacle on the visitor's floor, its pick area, label, frame box, and reach target; the visitor can select the twin from the list or its home and the conversation answers as ever.
- The dinosaur eats a chunk of a piece during the run (spec 024): both go on; see Interplay with Spec 024.
- A non-dinosaur visitor walks toward the dog at its home: the dog's default home is in the twin's corner, inside the twin's obstacle on the visitor's floor, so no visitor reaches it. If the Author moves the home onto the visitor's floor, the dog is still not an obstacle (Q4's floor stays spec 008's) and stays where it is; the overlap is his look to judge.
- The kill switch is `degraded` or the tier is unknown: no effect; nothing here calls the gateway.

## Requirements *(mandatory)*

### Functional Requirements

**The run**

- **FR-001**: THE RUN SHALL be on only WHILE the visitor's chosen avatar is `dinosaur`, the visitor's figure shows its model (its picture `avatar`, spec 021), and the walking view is on, in the 3D room (Q1). Its pursuer is the visitor's figure: the walking view's pose (spec 008's `Pose`: x, z, heading, speed, walking), read each frame. Otherwise no figure of this spec moves.
- **FR-002**: THE RUN SHALL end `flee_end_delay_s` (data, default 2 s) after FR-001 stops holding; then each figure walks back to its home at `walking.speed_mps`.
- **FR-003**: FR-001 holding again within the delay SHALL continue the run without a restart.

**Steering**

- **FR-004**: EACH FRAME, a figure within `flee_m` (data, default 1.0 m, fitted to the room, Q12) of the dinosaur SHALL take, from a fixed set of `headings` (data, default 16) on the chase floor (FR-006), the heading whose step leaves it farthest from where the dinosaur can be after `lookahead_s` (data, default 0.5 s) coming straight at it at `walking.speed_mps`, less a penalty near the floor's edges and obstacles, so a corner the dinosaur can enter is escaped and not entered. A corner it can't enter, such as the twin's (FR-017 keeps the twin's obstacle on its floor), is a refuge (Q12). a figure beyond `flee_m` stands, facing the dinosaur. The steering is pure and deterministic.
- **FR-005**: The twin runs at `twin_run_mps` and the dog at `dog_run_mps`, both data in the scene's `figures.chase` block, the dog's the larger by default (Q6); defaults are placeholders the Author's look sets (twin 2.0 m/s, dog 2.5 m/s). THE BUILD SHALL refuse a `figures.chase` whose `twin_run_mps` or `dog_run_mps` is not above `walking.speed_mps` + `speed_margin_mps` (data, default 0.5 m/s), the dinosaur's speed being the visitor's walking speed (Q2).
- **FR-006**: Movement SHALL use spec 008's `step` and `slide` on the chase floor: spec 008's walkable floor, composed by `compose/floor.ts` as the visitor's is, with the twin's own placement left out as the visitor's own is, so no figure leaves the bounds or enters an obstacle and the twin can leave and regain its home.
- **FR-007**: No figure SHALL be caught (Q2, Q11), with no assumption about where the visitor walks the dinosaur, in two clauses, each WHILE the run is on, with `safe_m` data (default 0.4 m, fitted to the room, Q12; plan §3):
  - (a) WHERE a figure's distance from the dinosaur is under `safe_m` when the run starts, when it resumes after the room's pause, or when the dinosaur's pose jumps rather than walks (leaving or entering the walking view puts it at `floor.start`, `walking.ts`'s `startPose`), the figure SHALL move away at its run speed from that frame, and its distance SHALL NOT decrease from one frame to the next until it reaches `safe_m`.
  - (b) WHILE a figure's distance is at or above `safe_m`, it SHALL stay at or above it.

  Its proof is a seeded property test. An adversarial pursuer (straight at the nearer figure, and seeded random turns), moved by spec 008's movement at `walking.speed_mps` on the visitor's floor, starts at `floor.start` and at 200 seeded walkable points of the visitor's floor, with seeded leaves and re-entries of the walking view that jump it back to `floor.start`. The figures start at their homes. Each start runs 600 frames, on the room's own floor composed from `scene.yaml` and on fake floors (open, a corner, an obstacle), and both clauses are checked each frame. The defaults of FR-004, FR-005, FR-007, and FR-008 are tuned until it holds on the room's floor, with `safe_m` never below 0.3 m (T002 stops and asks on the page if it can't hold there). A data change that breaks it fails the test.
- **FR-008**: Figures SHALL keep `separation_m` (data, default 0.3 m, fitted to the room, Q12) from one another; the dog yields along the perpendicular, but only among the headings FR-007 allows: FR-007's clauses outrank the separation.
- **FR-009**: Each frame, a moving figure SHALL step in the heading the steering chose (FR-004), at once, so the turn rate never slows an escape (FR-007's clause a). Its facing, the picture's turn, SHALL turn toward that heading at most `turn_rate_rad_s` (data) a second. At the default of 8 rad/s, the picture faces a reversed heading within 0.4 s.

**The dog's clips**

- **FR-010**: THE ROOM'S DOG SHALL play `idle` below `clip_thresholds.walk_mps`, `walk` up to `clip_thresholds.run_mps`, and `run` above it (data), each at time scale 1, `run` being spec 020's role in `CLIP_ROLES` (its FR-017), taken by `clipOf("dog", "run")`. A missing `run` SHALL play `walk` at time scale 1 (Q8); a missing `walk` SHALL play `run` below `run_mps` too; with neither, the dog SHALL hold at its home in `idle`.

**The twin's states, its legs, and the conversation**

- **FR-011**: Spec 016's state machine SHALL gain one state, `fleeing`, first in its order of precedence, set by an input `{ kind: "flee", on: boolean }`, its clip `idle`. `TWIN_CLIP_ROLES` SHALL NOT change (no `walk`, no `run`; Q7), and `fleeing` SHALL NOT be a key of the scene's `figures.twin.clips` map, since the gait runs over the idle only. RI8 (`build/room/checks/ri.ts`, its twin block) SHALL refuse it as a key, in strict and lenient builds alike, since it refuses state keys outside the closed list now and would accept `fleeing` once the state joins that list. The build's readers of the map, `emit.ts`'s `twinBlockOf` and `reach.ts`'s `playedRoles`, read `fleeing` through `TWIN_STATES`, so the emitted map gains `fleeing: "idle"`, its default. While the run lasts the state holds; when it ends the other states apply from the machine's own timers, which kept running (User Story 4).
- **FR-012**: `fleeing` SHALL be on only while the twin's figure moves for the run, going and coming back.
- **FR-013**: WHILE the twin's figure moves for the run, its legs SHALL step by spec 019's gait (`scene/gait.ts`: `cycleLength` at the twin's height in metres, which is the shown instance's measured height for the twin's own model and `part.figures.twin_height` for the stand-in; never the figure's `target`, which is `OWN` = -1 for the twin's own model (`scene/avatars.ts`); `advance` by the distance moved, `legOffsets`, `applyGait`, `clearGait`, and the hips' lowering of spec 019's FR-015) over its idle, through the same pure part spec 019's FR-014 makes reusable, with its tests unchanged.
- **FR-014**: WHERE the model the twin's figure shows lacks the six leg bones or the hips bone (`findLegRig` gives none), or shows its capsule, THE TWIN SHALL hold at its home in its usual states for the whole run (degraded, Q7), and the dog SHALL run alone.
- **FR-015**: The conversation, the text box, the panel, the guards, and the twin's answers SHALL NOT change. The run reads no conversation text and sends nothing.
- **FR-016**: The visitor's figure, its movement, camera, controls, reach, and the walkable floor SHALL NOT change (Q4): the run reads the visitor's pose and chosen avatar and writes nothing to them.
- **FR-017**: The twin's placement SHALL stay at its home: only its picture moves (the group spec 009's controller puts its avatar in); its pick area, label, frame box, obstacle, reach target, and hand anchors stay where the scene puts them.

**The room's dog figure** (B2; spec 020's Q1 leaves it here)

- **FR-018**: WHERE the scene has a `figures.dog` block (`home: { at: [x, z], heading_deg }`, `footprint_m`; data, its home an estimate the Author's look places, by default in the twin's corner, Q12) and the bundle holds the dog's model (spec 020's RA9: approved, with its line), THE 3D ROOM SHALL show the dog's model at its home on the floor, scaled to `AVATAR_SHAPES.dog.height` by the figure's `target` in `scene/avatars.ts`'s `instanceFor`, as the visitor's figure is (the loader fetches and parses; it doesn't scale), playing `idle`, for every visitor above the floor whatever avatar they chose (Q9). It is a figure, not a placement: no pick area, label, frame box, obstacle, reach target, stand-in, 2D drawing, or "In the room" entry. WHERE its model is not shown (not bundled, failed, loading, below the floor, 2D, a lost context), nothing SHALL show at its home.
- **FR-019**: `FigureId` (`src/room/stage.ts`) SHALL gain `"dog"`, and every record keyed by it (`AvatarFigures.wants`, the controller's figures in `scene/avatars.ts`) SHALL carry the dog: `wants.dog` is `"dog"` where FR-018's conditions hold, else null. The hand-off's wait and its two figures (spec 009) SHALL stay the twin's and the visitor's.
- **FR-020**: THE ROOM'S DOG'S PICTURE SIGNALS SHALL carry the bundle's `avatars.dog.line` while its model shows, as the visitor's do (spec 020's FR-007), and `app.ts` SHALL give them to spec 020's holder (`src/room/likeness-line.ts`), so the approval's line shows once while the room's dog, the visitor's dog, or both show the model, and not otherwise.
- **FR-021**: THE ROOM'S DOG'S FILES (`dog.glb`, `dog-idle.glb`, `dog-walk.glb`, `dog-run.glb`, where bundled) SHALL be fetched by spec 009's loader after "Enter" in every 3D visit above the floor, after the twin's and the visitor's files, once even where the visitor chose the dog, and counted by the loading screen as the other figures' files are (spec 012, its ceiling included). Its failure SHALL count in `avatar_failed` as a figure's avatar failing, once a visit, with no identifier (spec 009's FR-032).
- **FR-022**: RK5 (`build/room/checks/rk.ts`, spec 009's FR-038) SHALL count, in the first visit, the room's dog's files WHERE the scene has `figures.dog`: the room's set models and cards, the twin's files, the stand-in's, the room's dog's, and the largest other visitor avatar's other than the stand-in's and the dog's, against `main`'s `first_visit_bytes.phase3` (25,000,000); a strict build SHALL refuse over it and a lenient build warn, as RK5 does now.

**Degraded mode**

- **FR-023**: A figure whose model shows its fallback, or whose files failed, SHALL NOT run; the other figure runs alone.
- **FR-024**: Under reduced motion, a paused room (spec 002's motion store), or quality level 1 or more, no figure SHALL move for the run; each holds at home in its usual state, and FR-025 says nothing. WHEN reduced motion or quality level 1 or more begins mid-run, a figure away from home SHALL be put back at home at once (a cut, as reduced motion cuts clips); WHILE the room is paused mid-run, figures stay where they are and walk back after the resume. In the 2D room, below ADR 0010's floor, or with a lost context, the run doesn't happen and the room's dog doesn't show; nothing else changes.

**Telling it in words**

- **FR-025**: WHEN a run starts with at least one figure moving, the room's polite live region SHALL say once `chase.started_both`, `chase.started_twin`, or `chase.started_dog` ("The twin and the dog are running from the dinosaur", "The twin is running from the dinosaur", "The dog is running from the dinosaur"), by the figures that move; and WHEN they are back home, once `chase.ended_both`, `chase.ended_twin`, or `chase.ended_dog` ("The twin and the dog are back in their places", and the one-figure forms). The words are UI words (`apps/web/room/ui-words.yaml`, the closed list in `src/room/ui-keys.ts`). WHILE no figure can move (FR-014 for both, FR-023, FR-024), nothing is said.

**Cost, telemetry, and data**

- **FR-026**: The dashboard's "Visits whose avatar failed" panel (`deploy/grafana/dashboards/h4-runtime.json`) SHALL name the room's dog figure's files in its description among the files whose failure it counts.
- **FR-027**: A run SHALL add no network request, no model call, no usage event, and no byte leaving the device (Q10; Assumptions, Deviations). The draft build's frame log MAY record a run's start, end, and the least distance kept, as a development aid, with no payload.
- **FR-028**: THE DATA-FLOW DISCLOSURE'S ROW V1 SHALL name, among the avatar files fetched, the room's dog's model and clips in every 3D visit above the floor where the bundle has them, the same for every visitor; no new row (FR-021).
- **FR-029**: The run's per-frame cost SHALL stay under 0.2 ms on the reference desktop in a seeded benchmark of 600 frames, with no allocation per frame (steering writes into reused vectors).

### Key Entities

- **Chase block**: scene data, `figures.chase`: `flee_end_delay_s`, `flee_m`, `safe_m`, `separation_m`, `twin_run_mps`, `dog_run_mps`, `speed_margin_mps`, `turn_rate_rad_s`, `lookahead_s`, `headings`, `clip_thresholds` (`walk_mps`, `run_mps`). Optional; its absence means the defaults, fitted to the room (plan §3, Q12).
- **Dog block**: scene data, `figures.dog`: `home` (`at`, `heading_deg`), `footprint_m`. Optional; its absence means no room dog. Its home is on the chase floor, at least `safe_m` from `floor.start` and `separation_m` from the twin's home (plan R-09).
- **Flee state**: per figure: home, position, heading, speed, phase (`home`, `fleeing`, `returning`), gait state (the twin's).
- **Chase director**: the pure module that reads the visitor's pose and figure and gives each figure a pose per frame.
- **`TWIN_CLIP_ROLES`**: spec 016's closed list of the twin's clip roles, unchanged by this spec.

## Interfaces on the Line (from specs 008, 009, 016, 019, 020, 021)

No longer assumptions: each is named from its spec at its latest branch and from the line's code (`night/fix-020/fix-020`). Spec 021's code isn't on the line yet; it adds no interface this spec reads beyond the `dinosaur` avatar id and its picture, which spec 009's code already gives.

- **The pursuer (specs 008, 021)**: the walking view's `Pose` each frame, the visitor's chosen avatar (`AvatarId`, `choice/avatars.ts`), and whether the visitor's figure shows its model (`AvatarFigures.shows("visitor")`). The dinosaur's speed is the visitor's walking speed, `walking.speed_mps` in `scene.yaml` (1 m/s on the line).
- **The gait (spec 019)**, read at `night/fix-019/fix-019`: `scene/gait.ts`'s pure part (`cycleLength(heightM)`, `advance`, `legOffsets`, `standingLift`) and its bones' part (`findLegRig`, `applyGait`, `clearGait`, the hips' lowering through `applyGait`'s `lift`), with the rules of spec 019's FR-001 to FR-006 and FR-009 applied to the twin's figure as to the visitor's.
- **The dog (spec 020)**: the `dog` avatar's files in the bundle, gated by RA9, with `avatars.dog.line`; `run` in `CLIP_ROLES`; `AvatarFigures.clipOf(avatar, role)`; the holder `createLikenessLine()` in `src/room/likeness-line.ts`, fed by `app.ts`'s `figureSignal` from every figure but the twin's.
- **The twin (spec 016)**: `scene/twin-states.ts`'s `TWIN_STATES`, `TwinActivity`, `TWIN_CLIPS_DEFAULT`; its figure's picture group.

## Interplay with Spec 024 (item i, the dinosaur eats)

Both items act on the visitor's figure as the dinosaur, in the walking view, with its model shown, so they start from one condition (spec 024's FR-001, this spec's FR-001) and run at the same time. Neither stops the other: a bite (key B) doesn't end the run, and the run doesn't take the key, the "Eat" button, the reach, or the target. The twin's home keeps its pick area and reach target (FR-017), so spec 024's reach on the edible pieces is unchanged; the room's dog is no piece and never edible. Eating changes no frame box, so the walkable floor, and the chase floor with it, are unchanged by a bite (spec 024's FR-005). The two live-region lines are separate and each said once (spec 024's FR-010, this spec's FR-025). Spec 024's A7 leaves this spec any eaten-state signal; it needs none. Each spec's own: spec 024 the eating and its flight, this spec the figures' run.

## Success Criteria *(mandatory)*

- **SC-001**: Seeded runs with an adversarial pursuer at `walking.speed_mps`, on the room's own floor and on fake floors (open, cornered, with an obstacle). The pursuer starts at `floor.start` and at 200 seeded starts, with seeded jumps back to `floor.start`, and each run lasts 600 frames. In them, a figure under `safe_m` at a start, a resume, or a jump never comes closer to the dinosaur from one frame to the next until it reaches `safe_m` (clause a). No figure at or above `safe_m` falls below it (clause b). None leaves the floor. Each home is at least `safe_m` from `floor.start` in the room's data (R-09).
- **SC-002**: With the run over, every figure is at home within 20 s at walking speed, facing as its home turns it.
- **SC-003**: With any one of the three items' files missing, the twin's rig without leg bones, or each degraded setting, the other figure behaves per User Story 2; no exception is thrown.
- **SC-004**: Spec 016's twin-state tests pass unchanged except where FR-011 adds the state; spec 019's gait tests pass unchanged (FR-013).
- **SC-005**: Steering adds under 0.2 ms a frame (FR-029) and no per-frame allocation.
- **SC-006**: The live region's two messages appear once each per run, and none under reduced motion.
- **SC-007**: With fixture dog files and an approval, the room's dog shows for each of the four chosen avatars and the likeness line shows once; without them, nothing shows at its home and the build's output is unchanged; RK5 counts the dog's files once in the first visit.
- **SC-008**: The Author's look at the run: twin and dog read as running, the twin's legs step by the gait without skating beyond what spec 019's own check allows, the dog's home where he wants it (his, in the morning).

## Amendments to Earlier Specs

- **Spec 016, FR-021**: the state list gains `fleeing` first (M1); `TWIN_CLIP_ROLES` is unchanged. The closed list in `scene/twin-states.ts` changes; its contract is amended in the plan's §4.
- **Spec 016, FR-054 (RI8 over the twin block)**: RI8 also refuses `fleeing` as a key of `figures.twin.clips` (FR-011).
- **Spec 009, FR-032, FR-038, and its two figures**: `FigureId` gains the room's dog (FR-019); `avatar_failed` counts its failure (FR-021); RK5 counts its files (FR-022); the hand-off stays the two figures'.
- **Spec 020, FR-009**: "THE ROOM SHALL fetch the dog's files only when the visitor chose it" now reads: and for the room's dog figure in every 3D visit above the floor where the scene has `figures.dog` (FR-021); its FR-007 and FR-017 are met by this spec's FR-020 and FR-010.
- **Spec 019, FR-001**: the gait also applies to the twin's figure while it moves for the run (FR-013); the visitor's rules are unchanged.

## Assumptions

- Specs 019, 020, and 021 land on the line before this one's code starts (plan §9). Spec 021's model may not have arrived: until it does, the dinosaur is its cut-out and the run never starts (FR-001); the tests use fixtures and fakes, and the Author's look waits for the model.
- The look approval of each model is those specs'; this one adds no asset (no `assets/**` or `assets/policy/**` change). The dog's home and every number in the chase block are placeholders, data, the Author's at lookdev.
- **Deviations named** (CLAUDE.md, "Deferring or dropping a control the constitution requires"): **Principle II** ("telemetry that makes it observable in production") and **Development Workflow 7** ("A feature without a graph is not done") are not met for the run itself: it sends no usage event and has no panel (Q10), because an event sent only when it happens would tell the stack the visitor chose the dinosaur, which row V4 of the data-flow disclosure says the usage events never carry ("avatar"). The room's dog figure is observed by the "Visits whose avatar failed" panel (FR-026). If the Author takes Q10's option B, the event, its row amendment in his words, and its panel come with it. No accepted ADR is reversed. The constitution's governance says "Deviations require a written justification in the spec and an ADR if permanent". This paragraph is the justification. The deviation is provisional until he answers Q10; if he confirms it, it is permanent for this feature. Then an ADR recording it is on main before the implementation merges (Q13). The docs role writes it, since this task can't, as one ADR with spec 024's where page Q-R2c takes that option.
- **The room's floor** (Q12): the run happens on the floor the room has, a strip in front of the desk and the twin's corner (plan §3). No piece moves for it, and the room's size is the Author's.
- No other constitution control is deferred or dropped.

## Expected Cost Impact

Cloud: none. A client-side motion and the dog's static files; no model call. The first visit grows by the room's dog's files for every 3D visitor (spec 020 caps them; RK5 counts them, FR-022). Dev-time: about one implementer session plus a review.

## Degraded-Mode Behavior

Written first (Principle I): the run happens only when the visitor is the dinosaur with its model shown, in the walking view, with motion allowed at quality level 0 in the 3D room above the floor, and only for a figure whose model and legs or clips can show it. The room's dog shows only with its approved model. Any other case: the room is as `main` has it. See FR-014, FR-023, FR-024, and User Story 2.

## Data-Flow Disclosure Entries

No new row and no new destination. Row V1's list of avatar files fetched gains the room's dog's model and clips, in every 3D visit above the floor, the same for every visitor (FR-028). Row V4 is unchanged (Q10).

## The "New Endpoint or Feature" List (`CLAUDE.md`)

- Telemetry span: none for the run; a named deviation (Assumptions, Q10). The dog figure's failure is in `avatar_failed`.
- Dashboard panel: none new; FR-026's description line.
- Cost estimate: above.
- Degraded-mode behavior: above.
- Data-flow disclosure entry: V1's amendment (FR-028).

## Constitution Check

| Principle | How this complies |
|---|---|
| I. Data-Local | No new byte about the visitor leaves the device; the dog's files are the site's own (V1, amended); degraded mode first. |
| II. Production-Grade | Tests first (tasks.md), a frame budget, degraded modes; production telemetry for the run is a named deviation (Assumptions). |
| III. Intent, Spec, Code, Humans Merge | The intent is a draft for the Author's acceptance; the Author merges. |
| IV. Least Privilege | No human-only path changes (`docs/merge-requests/human-patches/025.md`). |
| V. Cost | None in the cloud; stated. |
| VI. Build in Public | Open questions on the morning page with recommendations. |
| VII. Own the Whole Product | Nothing about the Author is stated beyond his words, quoted. |
| VIII. Honest AI | The twin's disclosure line and answers are untouched; the run is a staged animation, said in words. The dog's likeness line, his approval's, shows wherever the room's dog shows the model (FR-020). |

## Open Questions

Q1 to Q13 above, each with its recommended answer, taken provisionally. Q1, Q4, Q7, and Q8 are the page's Q110 to Q112, and Q11 is its Q139. Q9 and Q10 went to `/night/io/out/questions.md` in the first rework. Q12 and Q13, and Q11 as taken, go there in the second.
