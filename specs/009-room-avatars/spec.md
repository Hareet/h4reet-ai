# Feature Specification: The Room's Avatars: the Visitor's Chosen Avatar, and a Stand-In for the Twin

**Feature Branch**: `spec/009-room-avatars` (this spec; implementation on `feat/009-room-avatars`, stacked on `feat/008-walking`'s tip; the Author's intake of the files on `feat/009-avatar-intake`, from `main`: [plan.md](plan.md#4-the-order-of-work))

**Created**: 2026-11-08

**Status**: Draft. Specified overnight on 2026-11-08, while the Author was away, from the draft intent beside it. Clarified the same night: five questions, each taken with its recommended option at the Author's words "Let's finish this and keep going until you can", each provisional and his to overturn (Clarifications). Ten smaller defaults were taken the same way and wait for his yes or no (Open Questions). No needs-clarification marker is left open in the requirements; every provisional answer is named where it lands. Implemented ahead of his approval, on `feat/009-room-avatars`, at the main session's direction under the same words; nothing merges before the Author accepts the intent and approves this spec and its plan (T000; Assumptions, Deviations).

**Input**: [`intent.md`](intent.md) in this folder, with the Author's words as the main session relayed them on 2026-11-08, and the main session's later relay of the studio's file listing. Also read, on `main` at a33b4833: the [constitution](../../.specify/memory/constitution.md) 1.0.1 and `CLAUDE.md`; [spec 002](../002-the-room/spec.md) with its data model and its room-scene and room-events contracts; [spec 003](../003-studio-assets/spec.md) with its data model, tasks (Phase 5), and its [arrival-check](../003-studio-assets/contracts/arrival-check.md), [asset-record](../003-studio-assets/contracts/asset-record.md), [site-loading](../003-studio-assets/contracts/site-loading.md), and [asset-events](../003-studio-assets/contracts/asset-events.md) contracts; [spec 004](../004-room-composition/spec.md) with its room-data-files, room-bundle, serving, lookdev, and room-live-state-telemetry contracts; specs [007](../007-twin-conversation/spec.md) and [008](../008-visitor-movement/spec.md) with their intents, and spec 008's plan and tasks; the room's code (`src/choice/avatars.ts`, `src/room/scene/bundle3d.ts`, `scene/loader.ts`, `scene/gltf-images.ts`, `handoff.ts`, `app.ts`, `layout.ts`, `room.css`, `text-copy.ts`, `ui-keys.ts`, `events.ts`, `src/asset-events.ts`, `src/room/glb/fit.ts`), the compositor's `emit.ts`, `report.ts`, `policy.ts`, and checks `rk.ts` and `ri.ts`, the two figures' catalog entries, the scene file, and the UI words; `tools/gates/arrival_check.py` (read, not changed); [`assets/policy/caps.json`](../../assets/policy/caps.json) and the empty records under `assets/visitors/` and `assets/twin/`; [ADR 0010](../../docs/adr/0010-real-time-avatar-rig-and-art-direction.md); the [data-flow disclosure](../../docs/data-flow-disclosure.md); spec 000's [telemetry contract](../000-local-foundations/contracts/telemetry.md) §7.8; `deploy/scripts/web_image.py`, `apps/web/Dockerfile`, and `.dockerignore`; and the room report in `docs/merge-requests/2026-11-07-feat-004-room-models.md`. Spec 008's walking code on `feat/008-walking`, being built tonight, wasn't read: its driver interface is named from spec 008's plan (R-12), and [tasks.md](tasks.md)'s T009 confirms it before any code.

Summary: the visitor's figure shows the chosen avatar's model, and the twin's figure shows a visitor avatar, the man by default, as a stand-in that the room labels plainly as not the Author's likeness. Each avatar stands at its figure's place, on the floor, at the room's size for it, plays its idle, and holds the resume's paper once it has it. The files come through the room's own bundle and loader, from the site's own origin, with today's integrity, timeout, retry, and fallback: a figure whose file is missing or fails keeps today's flat shape or capsule, and the room goes on. When both avatars are ready, the hand-off plays between them with the studio's "idle-holding" and "take" clips; walking moves the avatar through spec 008's driver. The 2D room keeps its flat shapes. Nothing new leaves the device but the avatar requests, which row V1 names, and one usage event, once a visit, when an avatar fails to load.

## Clarifications

### Session 2026-11-08, taken while the Author was away, at his words: "Let's finish this and keep going until you can."

The main session relayed the Author's message and directed: "He is away, so take the recommended answer for each clarification, record each as provisional and his to overturn, and mark nothing as needing clarification." So each question below took its recommended option. None is the Author's answer. Each is provisional and his to overturn, and a no changes the requirements it names. The questions, with their options, are under Open Questions.

- Q1: Which avatar stands in for the twin, and what happens when the visitor chooses the same one? → Taken, not answered: the man, named as data in the scene's `figures` block; when the visitor also chooses the man, both figures show the man (option A). Reading: the Author's "the male one can act as my twin", read with the main session's reading; a data value, so the other reading (the woman stands in) is a data edit; two men in one visit is rare, and plain from where each stands and from the room's line under Q2, while a stand-in that changes with the visitor's choice would make the twin look different from visit to visit. (FR-011, FR-015, FR-037.) On a no (option B): the block takes an ordered list, and the twin shows the first avatar the visitor didn't choose.
- Q2: How does the room say that the twin's figure is a stand-in, and where? → Taken, not answered: a UI word, `twin.stand_in`, "The twin's figure is a stand-in, not the Author's likeness.", shown in the stage's note, in 3D and 2D, as text a screen reader reads, and as the first line of "Around the room", while the twin's figure shows anything but the twin's own avatar, which in this spec is always (option A). Reading: the stage's note is where the room already says that placeholders stand in, beside the figure; "Around the room" is where every visitor, a screen-reader user among them, finds the room's words; and the AI disclosure header stays as it is, so the 320 × 568 layout doesn't change. (FR-013, FR-039.) On a no (option B): a label over the twin's figure in the scene, which grows its framed box and moves the camera; or (option C) a second sentence in the header, which a 320-pixel screen wraps.
- Q3: How big is each avatar, and where does it stand? → Taken, not answered: at its figure's placement, the point between its feet on the floor at the placement's origin, facing as the placement turns it, scaled uniformly so its height is its target: for the visitor, the chosen avatar's height in the room's avatar table, the height the 2D room draws (woman 1.58 m, man 1.74 m, dinosaur 1.2 m, dog 0.62 m); for the twin, the twin figure's catalog height, 1.75 m; the figures' catalog boxes unchanged (option A). Reading: the composition was measured with those sizes (spec 004's per-avatar table at x −0.7, its Clarifications of 2026-10-30), the 3D and 2D rooms then agree on each avatar's size, and the framing, the pick areas, spec 004's checks, and spec 008's walkable floor read the boxes, never loaded geometry, so nothing moves when an avatar arrives or fails. (FR-016, FR-017.) On a no (option B): each at its model's own size, which nothing measured yet.
- Q4: When does the paper hand-off use the avatars' hands and clips? → Taken, not answered: the room waits for both avatars before the hand-off, at most the `figures` block's `wait_ms` (1,500 ms by default) after the 3D stage mounts; an avatar ready in time plays the hand-off with its clips and hand, and one that isn't keeps its fallback through the hand-off and swaps in when it ends; under reduced motion, no clip plays and the paper crossfades from hand to hand (option A). Reading: on the Author's machine the files arrive in a fraction of that time, so the demo shows the hand-off between the avatars; on a slow phone the room doesn't hold the visitor back longer than 1.5 s, inside spec 002's SC-005; and spec 004's rule that nothing parses during the hand-off stands. (FR-019, FR-020, FR-022, FR-037.) On a no (option B): never wait; the avatars always swap in after the hand-off, as Phase 1 builds it, so the hand-off is always between the fallbacks.
- Q5: How is the feature observed? → Taken, not answered: one usage event kind, `avatar_failed`, sent at most once a visit, with no identifier, when a figure's avatar file fails to load after its retry, on the room's existing beacon, with row V4 naming it and the dashboard's "Room" row gaining "Visits whose avatar failed"; and spec 003's asset events built for every avatar file and left switched off until spec 001 carries them (option A). Reading: the failure is the degraded path a visitor sees, the beacon already reaches every stack's gateway, and the asset events' route doesn't exist on the local tier yet; Principle II's telemetry and workflow step 7's graph are met with no new flow but one kind. (FR-031 to FR-036.) On a no (option B): asset events only, with no production series until spec 001, a deviation named as spec 004 named its own.

## Source: The Author's Words

Quoted as the main session relayed them, typing included. The reading beside each is this spec's, to correct where it's wrong; it never replaces the words.

- **The request**, 2026-11-08:

  > "Okay, what's your overnight plan? Let's finish this and keep going until you can. We should be able to put in one of the visitors as my twin as a stand-in, say the woman visitor and the male one can act as my twin for the full demo to see everything working that we envisioned. Is that possible for you to get to by the time I wake up?"

  The main session's reading, beside it: "in the full local demo, the visitor's figure shows the studio's woman avatar, and the twin's figure shows the studio's man avatar as a stand-in until the twin's own avatar exists."

  This spec's reading: "put in one of the visitors as my twin as a stand-in" is User Story 2 and FR-011; "say the woman visitor and the male one can act as my twin" is Q1's answer, the man as the stand-in, the woman being what the Author chooses at the door for his demo, which any visitor may also choose (User Story 1); "for the full demo to see everything working that we envisioned" reads as the room of specs 002 to 008 with avatars in it, the hand-off (User Story 3) and walking (User Story 4) included, and nothing breaking when a file fails (User Story 6); "Let's finish this and keep going until you can" is the direction under which the clarifications and defaults were taken provisionally, not his acceptance of the intent nor his approval of this spec (Assumptions, Deviations); "Is that possible for you to get to by the time I wake up?" is answered in order of work, not dates (plan.md §4).

- **Earlier words this spec relies on**, as specs 002 and 004 record them: "we can have the user slightly turn to recieve the resume paper when they walk in, so the hand-off seems like a natural video game hand-off" (2026-10-23, quoted in `apps/web/src/room/handoff.ts`), and "Move further left" (2026-10-30, the visitor's place, spec 004's FR-080). Reading: the hand-off keeps its turns and its timing when it plays between avatars (FR-019), and the avatars stand where the figures stand (FR-016).

- **Intent 000**, as spec 003 quotes it: "Avatars: placeholders for now — a generic woman, a generic man, a generic dinosaur, a generic dog — to be replaced with final characters later." Reading: the studio's four are still those placeholders, made as models; the twin's stand-in is one of them, and is no likeness of the Author (spec 003's FR-017: "THE VISITOR AVATARS SHALL be original characters that resemble no real person").

## User Scenarios & Testing *(mandatory)*

The users are visitors on desktop and phone, in 3D and in the 2D room, by pointer, touch, keyboard, and screen reader; and the Author, who brings the files in and judges them at lookdev. User Story 6, the degraded mode, is P1 and ships with User Stories 1 and 2, as Principle I asks ("Every user-facing capability MUST define its degraded mode before its happy path"); it is listed after them only because it adds no new sight, only the proof that a missing or failing file never breaks the room. User Story 7 is the Author's own, and runs beside Phase 1.

### User Story 1 - The Visitor Sees Their Chosen Avatar in the Room (Priority: P1)

As a visitor, I want my figure in the room to be the avatar I chose at the door, as a figure rather than a flat shape, so the room feels like mine.

**Why this priority**: The Author's "for the full demo to see everything working that we envisioned", and intent 000's "four pre-generated avatars". It is half of the smallest slice that shows the avatars.

**Independent Test**: With the woman's files in the tree, in 3D on the desktop, choose the woman and enter: when the hand-off ends, the visitor's figure is the woman's model, standing on the floor at the visitor's place, 1.58 m tall, facing the open front, its idle playing, the paper in its hand. Choose the dog, whose files aren't in: its flat shape stands there, as today.

**Acceptance Scenarios**:

1. **Given** the woman's model and idle clip in the tree, **When** a visitor chooses the woman and the hand-off ends, **Then** the visitor's figure shows the woman's model in place of its flat shape, its lowest point on the floor, its height 1.58 m, the point between its feet at the visitor's placement, facing as the placement turns it.
2. **Given** the woman's avatar is shown, **When** the room is idle, **Then** its idle clip loops; **When** the visitor holds the resume's paper, **Then** its "idle-holding" clip plays in the idle's place and the paper sits in its holding hand and moves with it.
3. **Given** the dog has no files in the tree, **When** a visitor chooses the dog, **Then** its flat shape stands at the visitor's place, as today, and no avatar file is fetched for it.
4. **Given** the choice screen, **When** it shows, **Then** it offers the four avatars with today's flat previews, and nothing is fetched until "Enter".
5. **Given** a visitor chose the woman, **When** the network log is read, **Then** the only avatar files requested are the woman's and the twin's stand-in's, each once, from the site's own origin, each with its integrity check.

---

### User Story 2 - The Twin's Figure Shows a Stand-In, Labelled as One (Priority: P1)

As a visitor, I want to see the twin as a figure, and to be told plainly that the figure is a stand-in, not the Author's likeness.

**Why this priority**: The Author's "put in one of the visitors as my twin as a stand-in", and Principle VIII's "never presented as the Author". It is the other half of the smallest slice.

**Independent Test**: With the man's files in the tree, enter as any visitor: the twin's figure is the man's model, 1.75 m tall, at the twin's place, its idle playing; the stage's note and "Around the room" both say "The twin's figure is a stand-in, not the Author's likeness."; the AI disclosure is unchanged; no file under `assets/twin/` is read for it. Change the scene's stand-in to `woman` and build: the twin is the woman, with no source change.

**Acceptance Scenarios**:

1. **Given** the man's model and idle clip in the tree and the scene naming `man` as the stand-in, **When** the room shows in 3D, **Then** the twin's figure shows the man's model in place of its capsule, its height 1.75 m, standing at the twin's placement, its idle playing.
2. **Given** any visit, in 3D or 2D, **When** the room shows, **Then** the stage's note holds the UI word `twin.stand_in` and "Around the room" holds it as its first line, both as text a screen reader reads, and the AI disclosure, "You're talking with an AI representation of the Author, not the Author.", is unchanged.
3. **Given** the stand-in is shown, **When** the page is read, **Then** spec 003's likeness line ("an AI-made, stylized likeness of the Author") appears nowhere.
4. **Given** the man's files aren't in the tree, **When** the room shows, **Then** the twin's figure shows its capsule stand-in as today, and the stand-in line still shows.
5. **Given** a visitor chooses the man, **When** the room shows, **Then** both figures show the man, each with its own pose and clip, and the man's files are fetched once.
6. **Given** the man's record says `likeness: true`, or names a photo as its source, **When** the room is composed, **Then** a strict build refuses it, naming rule RA3, and a lenient build shows the capsule in the twin's figure.

---

### User Story 3 - The Hand-Off Between the Two Avatars (Priority: P2)

As a visitor, I want the twin's figure to hand my figure the paper, hand to hand, as in a game.

**Why this priority**: Spec 002's FR-007, "the twin's avatar hands the visitor's avatar a paper", and the studio's "idle-holding" and "take" clips. It builds on User Stories 1 and 2.

**Independent Test**: With both avatars' files in the tree, on the Author's machine, enter as the woman: the twin, holding the paper, turns toward the visitor; the paper travels from the twin's hand to the woman's hand as she plays her take; she ends holding it, in "idle-holding"; the hand-off ends within 5 s of its start. With reduced motion: no clip plays, and the paper crossfades from hand to hand in 1 s.

**Acceptance Scenarios**:

1. **Given** both avatars are ready within `wait_ms` of the 3D stage's mount, **When** the hand-off starts, **Then** the paper starts in the twin's holding hand, and the twin plays "idle-holding" until the paper leaves it, then its idle.
2. **Given** the hand-off plays, **When** it ends, **Then** the paper is within 2 cm of the visitor's holding hand, the visitor's "take" clip has ended, and its "idle-holding" loops.
3. **Given** an avatar isn't ready when `wait_ms` has passed, **When** the hand-off starts, **Then** that figure plays it with its fallback, as today, and its avatar swaps in after the hand-off ends.
4. **Given** the device asks for reduced motion, **When** the hand-off plays, **Then** it lasts 1 s, no figure turns, no clip moves, the paper crossfades from the twin's hand to the visitor's, and the visitor shows "idle-holding"'s first frame at the end.
5. **Given** no avatar has files, or the device is below ADR 0010's capability floor, **When** the room mounts, **Then** the hand-off starts at once, as today.

---

### User Story 4 - Walking With the Avatar (Priority: P2)

As a visitor who walks around the room (spec 008), I want my avatar to walk, turned the way it goes, with the paper in its hand.

**Why this priority**: Spec 008's FR-034, "WHEN a rigged avatar (ADR 0010) takes the cut-out's place, IT SHALL take the same pose". It builds on User Story 1 and on spec 008's walking.

**Independent Test**: In 3D as the woman, press "Walk around", walk with W, A, S, D, and press "Stop walking": the avatar turns to its heading, with no mirroring or bob; with no walk clip it slides in "idle-holding"; the paper stays in its hand; at the end it stands at its place facing the open front.

**Acceptance Scenarios**:

1. **Given** the visitor's figure shows its avatar, **When** the visitor walks, **Then** the avatar stands at the pose's place, turned to its heading, never mirrored, with no step bob.
2. **Given** the avatar has no walk clip, as the woman's and the man's first sets have none, **When** it walks, **Then** it slides in "idle-holding", or its idle before it holds the paper.
3. **Given** an avatar with a walk clip, **When** it walks, **Then** the walk clip plays, weighted by its speed, and the idle returns when it stops.
4. **Given** the walking view, **When** the visitor leaves it, **Then** the avatar stands at its place facing as its placement turns it, with the paper in its hand.
5. **Given** the avatar swaps in, or falls back, while the visitor walks, **When** the next frame draws, **Then** the driver that shows the new picture takes the same pose, and the walk goes on.

---

### User Story 5 - The Phone and the Lighter Tiers (Priority: P3)

As a visitor on a phone, I want the avatars without the room stuttering.

**Why this priority**: Spec 002's FR-048 (30 frames a second on the reference phone) and spec 003's reduced tier. It comes after the desktop because it tunes what the desktop builds.

**Independent Test**: On the reference phone, the lookdev page's phone copy with both avatars loaded as candidates: the 2-minute run holds a median of 30 frames a second, with 95% of frames within 33 ms. Force the quality level to 1: only the twin's avatar animates, and the textures decode at half size.

**Acceptance Scenarios**:

1. **Given** the reference phone, **When** both avatars animate for the 2-minute run, **Then** the median frame rate is at least 30 and at least 95% of frames take 33 ms or less, the quality controller stepping down as today where it must.
2. **Given** quality level 1 or more, **When** the avatars show, **Then** the twin's avatar animates and the visitor's holds its current frame.
3. **Given** an avatar's texture larger than `texture_px` on a side, **When** it decodes, **Then** it is no larger than `texture_px` a side, and half that at quality 1 or more.
4. **Given** the reference phone's 320 × 568 smallest screen, **When** the room shows, **Then** the stand-in note doesn't push the text box or the talk button off screen.

---

### User Story 6 - Nothing Breaks When an Avatar Can't Show (Priority: P1)

As a visitor, I want the room to work whatever happens to an avatar's files, and whatever state the Author's machine or the budget is in.

**Why this priority**: Principle I, quoted above, and spec 003's FR-021 to FR-026.

**Independent Test**: With fault injection on each avatar file (blocked, timed out, failing integrity, not 200, corrupt, over the texture ledger), below the capability floor, in 2D, with a lost context, and with the live source off, the tier unknown, and the kill switch `degraded` (stubbed): every run ends with the figures showing an avatar or its fallback, the AI disclosure and the stand-in line visible, the list working, and the room drawing.

**Acceptance Scenarios**:

1. **Given** the kill switch is `degraded`, or the local tier is off, **When** a visitor enters, **Then** the avatars load and show as always, and only the conversation degrades.
2. **Given** an avatar's model is blocked, times out after 10 s, fails its integrity check, answers other than 200, or fails to parse, **When** its one retry fails too, **Then** its figure keeps its fallback, the room keeps drawing, and one `avatar_failed` event is sent in the visit, not two.
3. **Given** an avatar's model loads but its idle clip fails, **When** it swaps in, **Then** it stands still in its rest pose, and nothing else changes.
4. **Given** the room falls to 2D while an avatar loads, **When** the 2D room shows, **Then** nothing more is fetched or parsed, the 2D room draws both figures as today, and the visit is kept.
5. **Given** the 3D context is lost, **When** it's restored, **Then** the avatars show again from the HTTP cache, each with its fallback meanwhile; **When** it isn't, **Then** the room falls to 2D as today.
6. **Given** a visit that starts below the floor, or in 2D, **When** the network log is read, **Then** no avatar file was requested.

---

### User Story 7 - The Author Brings the Woman and the Man In (Priority: P1, the Author's)

As the Author, I want to bring the studio's woman and man into the repository through the arrival check, as I brought the room's pieces, with nothing that fails my gate on the night.

**Why this priority**: Without the files, User Stories 1 to 5 show only fallbacks. The intake runs beside Phase 1 and merges on its own.

**Independent Test**: On the intake branch, run the arrival check over the two folders: 0 findings; `make check` passes; the compositor's report shows each avatar's bytes, triangles, and texture memory, and the first visit; the gate is Ready.

**Acceptance Scenarios**:

1. **Given** each folder holds the model, its three clips, `records.json` (the model's kind `avatar`, each clip's `animation`, `likeness: false`, a prompt or design source), and `LICENSE.md` with its copyright line filled, **When** the arrival check runs, **Then** it reports 0 findings.
2. **Given** the studio's `HANDBACK.md` or `SHA256SUMS` placed in a folder, **When** it is committed, **Then** the arrival check refuses it (rule A3), so neither goes in.
3. **Given** a record that names a hosted service or a library a step used, **When** the service's disclosure row is missing, or the license isn't on `main`'s allowlist reading yes on FR-013's three terms, **Then** the arrival check refuses the file (rules R7, L1).
4. **Given** the intake merged before the code branch, **When** `make check` runs on `main`, **Then** it passes: the room ignores the files until the code branch merges, and RK3 counts the largest visitor avatar, as it does today.
5. **Given** the intake and the code branch both merged, **When** the room is built, **Then** the woman's and the man's files are in the 3D part's avatars and in `dist/a/`, and no test that reads the repository needs a change for them.

---

### Edge Cases

- **The visitor chooses the stand-in's avatar:** both figures show it, from one fetch, each with its own skeleton, pose, and clip (FR-015).
- **The stand-in names an avatar with no files:** the twin keeps its capsule, and the report says why; the build passes (FR-002, FR-040).
- **A file several placements could share:** an avatar's files are fetched once a visit, whichever figures show them (FR-015, FR-021).
- **An avatar arrives during the hand-off:** it waits for the hand-off's end to parse and swap, as spec 004's rule has it (FR-022).
- **An avatar arrives while the visitor walks:** the avatar's driver takes the pose on the next frame (FR-028).
- **The model's rest pose is a T-pose:** it shows only when its idle clip fails, standing still, as spec 003's edge case gives it ("stays visible in a neutral pose"); lookdev shows the Author which rest pose the files have (FR-003).
- **A clip names bones the model lacks:** the compositor refuses it in a strict build and drops it in a lenient one; the avatar stands in its rest pose if it was the idle (FR-003, FR-038).
- **An avatar with no hand bone** (the dog's and the dinosaur's rigs, when they come): the paper stays at the figure's hand anchor, as today (FR-018).
- **Two avatars' textures over the scene's texture cap:** RK3 counts them at their decoded size; a data edit lowers `texture_px`, or the Author raises the cap (FR-024, FR-038).
- **The dinosaur's roar, or any file with no role:** reported, never refused, and never fetched (FR-009, FR-038).
- **"Pause the room" during the hand-off:** the toolbar is inert until the offer is answered, as today; reduced motion still applies (spec 004's Clarifications, 2026-10-30, US2 · N3).
- **A reload:** a new visit at the choice; `avatar_failed` may be sent once more in the new visit (FR-032).
- **The twin's own avatar arrives under `assets/twin/`:** this spec doesn't show it; the stand-in stays until spec 003's Phase 5 gives the twin its own avatar with its approved line (FR-011, FR-012).

## Requirements *(mandatory)*

### Functional Requirements

Terms used below, beside spec 004's (a figure, a placement, the stand-in shape, the hand-off, the texture ledger, a strict and a lenient build) and spec 008's (the walking view, the figure's pose, the figure driver). **Avatar**: one of the four visitor avatars of the room's avatar table (`apps/web/src/choice/avatars.ts`): woman, man, dinosaur, dog. **An avatar's files**: its model and its clips (FR-009). **Clip role**: one of the closed list `idle`, `idle-holding`, `take`, and `walk`. **The stand-in avatar**: the avatar the scene's `figures` block names for the twin (FR-037). **The fallback**: what a figure shows when it shows no avatar: the visitor's figure, the chosen avatar's flat shape; the twin's figure, its stand-in shape, the capsule. **Ready**: an avatar's model and its idle clip have each loaded or failed, and the model is placed in its figure. **The holding hand**: the hand bone that holds the paper (FR-018). **The target height**: FR-016's. **The floor**: ADR 0010's capability floor, spec 004's `meetsModelFloor`. **The motion store animates**: spec 004's motion store, true only while the room isn't paused, the device doesn't ask for reduced motion, and the page is visible.

**Degraded mode** (defined before the happy paths, Principle I)

- **FR-001**: THE AVATARS SHALL be static files from the site's own origin. THE ROOM SHALL make no model call and no gateway call for them, and WHILE the local tier is off, the budget is spent, the kill switch is `degraded` or unknown, or the live source is off, THE ROOM SHALL load and show them exactly as at any other time; only the conversation SHALL degrade (spec 003 FR-025; spec 004 FR-062).
- **FR-002**: IF a figure's avatar has no model in the bundle, or its model is blocked, takes more than 10 seconds with its body, fails its integrity check, answers other than 200, fails to parse or decode, or would take the texture ledger over its limit, THEN, after the one retry the room's loader makes for each of these but the ledger, THE FIGURE SHALL keep its fallback, still at its place, and THE ROOM SHALL go on drawing and record the outcome (FR-031, FR-032).
- **FR-003**: IF an avatar's model loads but its idle clip is missing, fails to load, or targets bones the model lacks, THEN THE AVATAR SHALL stand still in its rest pose, and nothing else changes (spec 003's edge case, "stays visible in a neutral pose"). IF its "idle-holding" or "take" clip is missing or fails, THEN its idle SHALL play in that clip's place, and the paper SHALL still go to its holding hand where it has one.
- **FR-004**: IF the device is below the floor, or the room shows its 2D room from the start, THEN THE ROOM SHALL fetch no avatar file, and the figures SHALL show their fallbacks (spec 003 FR-023).
- **FR-005**: IF the room falls to 2D while avatars load or show, THEN THE ROOM SHALL fetch, parse, and swap nothing more for them (spec 004's loader stop), record each avatar load that hadn't ended as skipped, and draw the 2D room as today, with the conversation, the resume, and the visit's state kept (spec 004 FR-058).
- **FR-006**: WHILE the 3D context is lost, THE ROOM SHALL draw nothing new for the avatars. WHEN it is restored, THE AVATARS SHALL load again from the HTTP cache, each figure showing its fallback until its avatar is ready, as spec 004's loader reloads the room's models. IF it isn't restored, THEN THE ROOM SHALL fall to 2D as today, and FR-005 applies.
- **FR-007**: AN AVATAR'S FAILURE SHALL never leave a blank or frozen scene, never move the camera or a pick area, and never hide the AI disclosure or the stand-in line (spec 003 FR-026; spec 004 FR-062).

**The visitor's figure**

- **FR-008**: WHEN the chosen avatar has a model in the bundle, the room is in 3D, and the device is above the floor, THE VISITOR'S FIGURE SHALL show that model in place of its flat shape once it is ready, at the time FR-022 gives.
- **FR-009**: AN AVATAR'S FILES SHALL be its model, `assets/visitors/<id>/<id>.glb`, recorded in its folder's `records.json` with kind `avatar`, and its clips, `assets/visitors/<id>/<id>-<role>.glb` for a clip role, each recorded with kind `animation` (spec 003's contracts/asset-record.md). AN AVATAR SHALL have a model in the bundle only WHERE its model is recorded, readable, and within `main`'s caps for its kind (FR-038); a clip only WHERE it is recorded, readable, within its caps, and targets only bones its model has. A FILE IN THE FOLDER with no role SHALL be neither bundled nor fetched (Default D9).
- **FR-010**: THE CHOICE SCREEN SHALL stay as it is: the four avatars, with spec 002's flat previews, and nothing fetched before "Enter". THE ROOM SHALL fetch the chosen avatar's files and the stand-in avatar's, and no other avatar's (spec 003 FR-028, as Amendment M10 extends it).

**The twin's figure and its stand-in**

- **FR-011**: WHILE the bundle gives the twin no avatar of its own (in this spec, always), THE TWIN'S FIGURE SHALL show the stand-in avatar the scene's `figures` block names, WHERE that avatar has a model in the bundle, and its stand-in shape otherwise. THE DEFAULT SCENE SHALL name `man` (Clarifications, Q1).
- **FR-012**: THE ROOM SHALL read the stand-in avatar's files from `assets/visitors/<id>/` only. IT SHALL read no file under `assets/twin/` to show the stand-in, and the stand-in SHALL need no file, approval, or disclosure line there (spec 003's rules P1 and P3 hold for the twin's own files, untouched).
- **FR-013**: THE ROOM SHALL never present the stand-in as the Author's likeness. WHILE the twin's figure shows anything but the twin's own avatar:
  - (a) THE ROOM SHALL show the UI word `twin.stand_in`, by default "The twin's figure is a stand-in, not the Author's likeness.", in the stage's note, in 3D and in 2D, as text a screen reader reads, and as the first line of "Around the room" (Clarifications, Q2);
  - (b) THE ROOM SHALL NOT show spec 003's FR-034 likeness line, which would call the figure a likeness of the Author;
  - (c) THE AI DISCLOSURE SHALL stay as spec 002's FR-004 has it, visible in every mode.
- **FR-014**: THE STAND-IN AVATAR SHALL be an original character (spec 003 FR-017). THE COMPOSITOR SHALL refuse, in a strict build, a stand-in whose model's record says `likeness: true` or names a photo as its source (RA3), and a lenient build SHALL show the twin's stand-in shape instead.
- **FR-015**: WHEN the visitor chooses the stand-in avatar, BOTH FIGURES SHALL show it, each its own instance with its own skeleton, pose, and clip, from one fetch of each file (Clarifications, Q1).

**Size and placement**

- **FR-016**: EACH AVATAR SHALL stand at its figure's placement: its origin, the point between its feet, at the placement's origin; its lowest point in its rest pose on the floor; facing as the placement turns it, which for both figures today is toward the open front, as their flat shape and capsule face; and scaled uniformly so its height in its rest pose is its target height: for the visitor's figure, the chosen avatar's height in the room's avatar table, the height the 2D room draws (woman 1.58 m, man 1.74 m, dinosaur 1.2 m, dog 0.62 m); for the twin's figure, the twin figure's catalog height, 1.75 m (Clarifications, Q3).
- **FR-017**: THE FIGURES' CATALOG ENTRIES, FRAMED BOXES, AND PLACEMENTS SHALL stay as they are. THE CAMERA'S FRAMING, the pick areas, spec 004's checks, and spec 008's walkable floor SHALL read those boxes, never an avatar's geometry (spec 004 R-18), so an avatar arriving, swapping, or failing moves none of them.

**The paper**

- **FR-018**: WHEN the hand-off has ended and the visitor's figure shows an avatar with a holding hand, THE KEPT PAPER SHALL sit in that hand and move with it, and the avatar SHALL play "idle-holding" in its idle's place. THE HOLDING HAND SHALL be the hand bone of ADR 0010's humanoid skeleton (`mixamorig:RightHand` or `mixamorig:LeftHand`) that "idle-holding" moves farthest from where the idle holds it, the right on a tie, and the hand nearer the other figure where the avatar has no "idle-holding" (Default D2). WHERE the figure shows its fallback, or the avatar has neither hand bone, THE PAPER SHALL stay at the figure's hand anchor, as today (spec 004 FR-008).
- **FR-019**: WHEN the hand-off starts and a figure's avatar is ready, THE HAND-OFF SHALL use it (Clarifications, Q4):
  - (a) THE ROOM SHALL wait, before the hand-off, until both figures' avatars are ready or `wait_ms` has passed since the 3D stage mounted, whichever comes first, and SHALL not wait WHERE no avatar is loading;
  - (b) the paper SHALL start in the twin's holding hand, where the twin's figure shows its avatar, the twin playing "idle-holding" until the hand-off starts and its idle from then on;
  - (c) the paper SHALL end in the visitor's holding hand, where the visitor's figure shows its avatar, following that hand as it moves, the visitor playing "take" so that it ends as the hand-off ends, then "idle-holding";
  - (d) each figure's turn toward the other, and the hand-off's length and announcement, SHALL stay spec 002's (4.5 s, never more than 5 s);
  - (e) a figure whose avatar isn't ready SHALL play the hand-off with its fallback and its hand anchor, as today, and its avatar SHALL swap in after the hand-off ends.
- **FR-020**: WHERE the device asks for reduced motion, THE HAND-OFF SHALL last 1 second, as spec 002 has it: no figure turns, and the paper crossfades from the twin's hand to the visitor's. WHILE the motion store doesn't animate, for that or any other reason, NO CLIP SHALL move, and each figure's pose SHALL change at the hand-off's start and end as cuts (FR-026).

**Loading**

- **FR-021**: WHEN the 3D stage mounts above the floor, THE ROOM SHALL fetch the stand-in avatar's model and the chosen avatar's model at once, each file once, then their clips; and THE ROOM'S MODELS SHALL start fetching once both avatars' files have been fetched or have failed (spec 004 FR-056's "after the twin and the chosen avatar", as Amendment M17 reads it).
- **FR-022**: THE AVATARS' FILES SHALL load through the room's loader: same-origin, with `integrity` the plain file's SHA-256, no redirect, a 10-second timeout covering the body, one retry, at most four fetches at once, under the quality controller's hold from parse to two frames after the swap (spec 004's R-28; FR-055). AN AVATAR SHALL swap in only once it is ready, so it never shows its rest pose for a frame unless its idle failed. AN AVATAR SHALL parse and swap before the hand-off starts or after it ends, never during it; before the hand-off only within FR-019's wait (Phase 1 parses after it ends; plan.md §4). A parse already begun when the hand-off starts MAY finish, since a parse can't be stopped part-way; its avatar SHALL swap in only once the hand-off ends.
- **FR-023**: THE SITE SHALL serve each avatar file as spec 004's FR-079 serves a GLB: one gzip-9 copy at `a/<stem>.<hash16>.glb`, content-addressed, cached for a year, from the site's own origin. THE WEB IMAGE'S BUILD SHALL read the tree's `assets/visitors/`, so `make up` serves the avatars, and a build without them SHALL show the fallbacks and still build.
- **FR-024**: AN AVATAR'S TEXTURES SHALL decode at most `texture_px` pixels a side, keeping their aspect, and at half that WHILE the quality level is 1 or more as they decode (spec 004's R-28, step 6), and SHALL be uploaded through the texture ledger. RK3 SHALL count each avatar's texture memory at that decoded size (Default D5).

**Motion**

- **FR-025**: THE AVATARS' CLIPS SHALL play as follows: the idle loops; "idle-holding" loops in the idle's place while the figure holds the paper; "take" plays once, in the hand-off; "walk" plays while the figure walks (FR-028); a change of clip crossfades in at most 0.25 s WHILE the motion store animates.
- **FR-026**: WHILE the motion store doesn't animate (reduced motion, "Pause the room", or a hidden page), THE AVATARS SHALL hold a still pose: the first frame of the clip they show at entry, and the frame they had when the motion stopped; a change of clip SHALL be a cut (spec 004 FR-059, FR-060).
- **FR-027**: WHILE the quality level is 1 or more, AT MOST ONE AVATAR SHALL animate, the twin's, and the visitor's SHALL hold its current frame (spec 003's FR-024, "fewer simultaneous animations"; Default D6).

**Walking** (spec 008)

- **FR-028**: WHILE the visitor's figure shows its avatar, THE FIGURE DRIVER SHALL be the avatar's: it SHALL take spec 008's pose (its FR-034), stand the avatar at the pose's place turned to its heading, never mirror it or bob it, play its walk clip weighted by its speed WHERE it has one and slide it in "idle-holding", or in its idle before it holds the paper, WHERE it has none, and keep the paper in its holding hand. WHEN the figure's picture changes, THE DRIVER of the new picture SHALL take the same pose on the next frame.

**Accessibility and the 2D room**

- **FR-029**: THE AVATARS SHALL be pictures only: the canvas stays hidden from assistive technology, nothing new is focusable, and the "In the room" list stays the way to choose every piece. THE STAGE'S NOTE SHALL let a pointer or a touch pass through it to the scene. THE ROOM SHALL meet WCAG 2.2 level AA with the avatars and the note, and on a 320 × 568 screen SHALL keep the text box and the talk button on screen (spec 004 FR-065).
- **FR-030**: THE 2D ROOM SHALL keep its flat shapes: the visitor as the chosen avatar's flat polygons, and the twin as its catalog drawing, with the stand-in line in its note as in 3D (Default D7).

**Telemetry**

- **FR-031**: WHEN an avatar's file loads, retries, fails, or is skipped, THE ROOM SHALL record spec 003's asset event through the room's queue, as it does for the room's models, keyed by the file's record stem (spec 004 FR-071). THEY SHALL be sent only WHILE the index's `live.asset_events` is `site`, which spec 001's change turns on with row V6; this spec doesn't.
- **FR-032**: WHEN a figure's avatar file has failed after its retry for the first time in a visit, THE ROOM SHALL send one usage event of the new kind `avatar_failed`, with no identifier and nothing else, on today's beacon (spec 002's FR-054 and its contracts/room-events.md §1, as Amendment M4 extends them). LATER FAILURES in the visit SHALL send none, and a skip, a missing file, or a fallback below the floor or in 2D SHALL send none (Clarifications, Q5).
- **FR-033**: THE ROOM SHALL send nothing else for the avatars: no event for an avatar shown, a clip, a pose, or the stand-in, and nothing that names an avatar on the beacon. THE TELEMETRY SPAN of `avatar_failed` SHALL be the server span the gateway already makes for each `POST /room/events` request, holding its route, status, and outcome and never its body (spec 000's contracts/telemetry.md); the room adds no browser span (spec 004's contracts/room-live-state-telemetry.md §1).
- **FR-034**: THE DASHBOARD'S "Room" row SHALL gain the panel "Visits whose avatar failed": `avatar_failed` over `resume_opened` plus `resume_kept`, read as the 2D share is read (spec 000's contracts/telemetry.md §7.8, as Amendment M1 extends it).
- **FR-035**: IN A DRAFTS BUILD, THE FRAME LOG (spec 004's R-70) SHALL record each figure's picture changes (avatar shown, fallback kept, and why) and clip changes, in page memory only. A release build SHALL keep no log.

**Data flow**

- **FR-036**: THE DATA-FLOW DISCLOSURE'S ROW V1 SHALL name the avatar files among the static assets it carries, and that their paths show which avatar the visitor chose, in the change that first serves them; ROW V4 SHALL name `avatar_failed`'s trigger in the change that sends it (Amendment M6). IF the room would serve the avatars or send the event without its row, THEN it SHALL NOT be deployed. NOTHING ELSE this spec adds SHALL leave the visitor's device.

**As data, and the compositor** (spec 004's FR-001 and FR-006; the Author's "features should be modeled with that abstract perspective rather than one-off hard-coded")

- **FR-037**: THE SCENE FILE SHALL hold an optional `figures` block: `twin_stand_in`, an avatar of the room's avatar table, absent for none; `texture_px`, a power of two from 256 to 4,096, 1,024 by default; and `wait_ms`, an integer from 0 to 3,000, 1,500 by default. CHANGING ONE SHALL be a data edit, with no source file changed.
- **FR-038**: THE COMPOSITOR SHALL check the avatars, refusing in a strict build with `<rule> <file>:<path>: <reason>` (spec 004 FR-009), and, in a lenient build, warning and leaving the avatar or clip out of the bundle, so its figure shows its fallback and `make up` builds:
  - RI8, extended: a `twin_stand_in` that isn't an avatar of the table (in every build);
  - RA1: an avatar's model or clip not recorded in its folder's `records.json`, or recorded with another kind;
  - RA2: an avatar's file the GLB reader can't read, a clip with no animation, or a clip targeting a node its model doesn't name;
  - RA3: the stand-in's model recorded `likeness: true` or from a photo (FR-014);
  - RA4: an avatar's file over `main`'s `per_asset` cap for its kind, as spec 003's F2 measures it;
  - RA5: a file in a visitor's folder with no role, reported and never refused;
  - RK3, extended, failing every build as it does today: the twin's figure counted as the larger of its own models under `assets/twin/` and the stand-in avatar's files, the visitor's as the largest other visitor avatar's, as RK5 counts it, so the stand-in's folder never counts twice, and each avatar's texture memory at its decoded size (FR-024); `main` never holds a total over the cap, since whichever of the intake and the code merges second meets RK3 at its gate (plan.md §4.1);
  - RK5: the first visit with both figures' files (the room's set models, the stand-in avatar's files, and the largest other visitor avatar's files, by their gzip-9 copies) over `main`'s phase-3 budget, refused in a strict build and warned in a lenient one.
- **FR-039**: THE UI WORD `twin.stand_in`, with no slot, SHALL join spec 004's closed list (its contracts/room-data-files.md §9) and pass its checks. It states nothing about the Author but that the figure isn't the Author's likeness.
- **FR-040**: THE COMPOSITOR'S REPORT (spec 004 FR-073) SHALL give, for each avatar with files: each file's bytes, gzip-9 bytes, triangles, and texture memory at its own size and at its decoded size, its clips by role, the scale its reader's bounds imply, and whether it is bundled; which avatar the twin shows; RK3's figures with the stand-in; and the first visit with both figures' files beside the arrival check's F3 view.

**The lookdev page**

- **FR-041**: THE LOOKDEV PAGE, in drafts builds only (spec 004 FR-066), SHALL show the avatars in the figures, choose the visitor's avatar and the stand-in, play the hand-off normally and under reduced motion, show each clip by role, take an avatar's model and clips as candidates in memory only, through its file picker, for the phone copy (spec 004 FR-067, FR-069), and report the frame figures it reports for the room, with the avatars animating.

**The intake**

- **FR-042**: THE WOMAN'S AND THE MAN'S FILES SHALL enter the repository only by the Author's intake, through spec 003's arrival check: in `assets/visitors/woman/` and `assets/visitors/man/`, each folder holding its model, its clips, its `records.json`, and its `LICENSE.md` with the copyright line filled, and nothing else (rule A3); each record's model and tool licenses on `main`'s allowlist, reading yes on FR-013's three terms, public distribution among them, since the files sit in a public repository; and each hosted service a step used named in its record with its disclosure row (rule R7, spec 003 FR-040(c)). A visitor avatar from a prompt or a design SHALL need no approval in `approvals.json` (rule P1 holds a likeness, a photo source, a room file, and the twin's files); one recorded as a likeness or from a photo SHALL need the Author's approval on `main` first, and can't be the stand-in (FR-014).
- **FR-043**: EVERY TEST that reads the repository's tree SHALL compute the avatars from the tree, never list them, so an intake changes no test; and a test that pins today's state SHALL change in the same commit as the code that changes what it pins (plan.md §5.4 names them).

### Key Entities

- **Avatar**: one of the room's four visitor avatars, by its ID, with its height in the room's avatar table, its flat shape, and, where its files are in the tree, its model and clips (FR-009, FR-016).
- **An avatar's files**: the model and the clips by role, each with its URL, SHA-256, served bytes, and decoded texture memory (FR-009, FR-023, FR-024).
- **The figures block**: per scene, the stand-in avatar, the texture side cap, and the hand-off's wait (FR-037).
- **A figure's picture**: its fallback, or an avatar instance placed in it (FR-002, FR-016).
- **An avatar instance**: a model with its own skeleton, its clips' mixer, its current clip, and its holding hand (FR-015, FR-018, FR-025).
- **The stand-in line**: the UI word `twin.stand_in`, in the stage's note and first in "Around the room" (FR-013).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the 3D stage's tests, for each avatar and figure, the shown avatar's lowest point is within 0.5 cm of the floor, its height within 1% of its target height, its origin within 0.5 cm of its placement's origin, and its facing within 1° of its placement's turn, in 100% of cases; and the Author confirms the woman and the man at lookdev on both reference stages (L1).
- **SC-002**: In fault-injection runs for each of FR-002's faults on each figure, a failing idle clip, below the floor, in 2D, a lost and a restored context, and every degraded state of FR-001, 100% end with each figure showing its avatar or its fallback, the AI disclosure and the stand-in line visible, and the "In the room" list selecting every piece; 0 end blank or frozen; and the camera and the pick areas are unchanged in 100% of runs.
- **SC-003**: In 100% of visits, in 3D and 2D, the stand-in line is in the stage's note and first in "Around the room"; spec 003's likeness line appears in 0 pages; and the tests count 0 reads of a path under `assets/twin/` to build or show the stand-in.
- **SC-004**: In the network logs of the tests' visits, the avatar files requested are the chosen avatar's and the stand-in's, each once, from the site's own origin, each with its integrity, in 100% of visits; 0 are requested in a visit below the floor or in 2D from the start; and 0 requests go to a third-party host.
- **SC-005**: With the motion store animating, the idle loops in 100% of tests; with reduced motion, "Pause the room", or a hidden page, the avatars show 0 frames of clip motion and 0 crossfades; and at quality 1 or more exactly one avatar animates, the twin's.
- **SC-006**: In the hand-off's tests with both avatars ready, the paper ends within 2 cm of the visitor's holding hand, "take" ends with the hand-off, and the hand-off ends within 5 s of its start, in 100% of runs; the wait never exceeds `wait_ms`; and with an avatar late, the hand-off plays with that figure's fallback and the avatar swaps in after it, in 100% of runs.
- **SC-007**: Over seeded walks of 10,000 steps with the avatar's driver, the avatar's heading is within 1° of the pose's, its mirror and bob are 0 in every step, and the paper stays within 2 cm of the holding hand, in 100% of steps.
- **SC-008**: Each data-only change of the proof set (the stand-in to `woman`, `texture_px` to 512, `wait_ms` to 0) passes `make check` with 0 source files changed.
- **SC-009**: For the default scene with the woman's and the man's files, RK3's total is within the scene's texture cap and RK5's first visit within 25,000,000 bytes; each has a fixture over its limit that a strict build refuses; and the report prints both beside the arrival check's F3 view.
- **SC-010**: Each of RI8's new case and RA1 to RA4 refuses its known-bad fixture in a strict build, naming its rule, file, and path, and in a lenient build leaves the figure on its fallback; RA5 reports and refuses nothing; and a build with no avatar files builds, showing both fallbacks.
- **SC-011**: `avatar_failed` is sent once in 100% of the test visits with a failed avatar file and 0 times in the others, with no identifier; the gateway answers 204 to `{"kind": "avatar_failed"}` and counts it, and 400 to it with an `id`; the "Visits whose avatar failed" panel holds the contract's exact query; and rows V1 and V4 name the avatar paths and the trigger in the commits that serve and send them.
- **SC-012**: The automated check reports 0 WCAG 2.2 AA violations with the avatars and the stand-in note shown; on the 320 × 568 model the text box and the talk button stay on screen; a keyboard-only and a screen-reader visit each choose every piece from the list and hear the stand-in line.
- **SC-013**: On the reference phone, the lookdev phone copy's 2-minute run with both avatars animating holds a median of at least 30 frames a second with at least 95% of frames within 33 ms, and the report gives the quality level it settles at (the Author's run, L2).
- **SC-014**: The Author's intake of the woman and the man passes the arrival check with 0 findings, `make check`, and the gate; and its report gives the first visit with both avatars, under 25,000,000 bytes.

## Amendments to Specs 000, 002, 003, 004, and 008

As specs 004 and 008 did, this spec names the clauses it amends; their text stays as it is, and each amendment supersedes the clause it names from this spec's approval. Clauses were checked against `main` (a33b4833); spec 008's walking code wasn't read (Input).

| ID | Spec and clause | Change | Why |
|---|---|---|---|
| M1 | Spec 000, contracts/telemetry.md §7.8, "The room (spec 002)" | The row gains the panel "Visits whose avatar failed", a stat as a share, `sum(increase(h4_room_events_total{kind="avatar_failed"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened\|resume_kept"}[$__range]))`, and a bullet reading it as the 2D share is read. The dashboard gains it in the same change. | FR-034; Principle II. |
| M2 | Spec 002, FR-005 ("the twin's avatar standing at the computer desk") and FR-007 ("the twin's avatar hands the visitor's avatar a paper") | Until the twin's own avatar exists, the twin's figure shows the stand-in avatar, said to be a stand-in (FR-011, FR-013). The hand-off is between the avatars where they are ready, and between the fallbacks otherwise (FR-019). | User Stories 2 and 3. |
| M3 | Spec 002, data-model.md §5 (`avatars[]`, "until spec 003's avatars replace them"; `placeholders`), research R-11, and `src/choice/avatars.ts`'s comment | The four IDs stay. An avatar with files shows its model in 3D; its flat shape stays the choice screen's preview, the 2D room's figure, and the fallback. `placeholders` keeps its meaning, "true while any placeholder geometry or avatar is in use", and so stays true while the twin shows a stand-in (Default D10). | FR-008, FR-010, FR-030. |
| M4 | Spec 002, FR-054; contracts/room-events.md §1 (the kinds' table); data-model.md §8 | The moments gain "or a figure's avatar fails to load, once a visit"; the table gains `avatar_failed`, with no `id`. §3 is unchanged: only `object_selected` and `item_selected` take an ID. `config/room-events.yaml` gains the kind. | FR-032, FR-033. |
| M5 | Spec 002, contracts/room-scene.md §3 (the hand-off) and §4 (the `reduced` mode's "fewer simultaneous animations") | The hand-off may wait up to `wait_ms` for the avatars before it starts, and under reduced motion crossfades the paper from hand to hand with no clip motion. In `reduced`, one avatar animates, the twin's. | FR-019, FR-020, FR-027. |
| M6 | `docs/data-flow-disclosure.md`, rows V1 and V4 (spec 002's) | V1's Carries gains "the avatar files: the twin's stand-in's, and the chosen avatar's where it has files, whose paths show which avatar the visitor chose"; V4's Trigger gains "and a figure's avatar failing to load, once a visit". The other columns stay spec 002's words. | FR-036; Principle I; spec 003 FR-040(a). |
| M7 | Spec 003, FR-021 (the twin's still image) | Not for the stand-in: its fallback is the twin figure's stand-in shape, since a stand-in has no still. FR-021 stays for the twin's own avatar. | FR-002. |
| M8 | Spec 003, FR-022 ("its preview image, or without it") | The room's preview of a visitor avatar is its flat shape, spec 002's, until the studio's previews exist. | FR-002. |
| M9 | Spec 003, FR-032 and FR-034 | The stand-in isn't "the twin's avatar" in their sense: FR-034's likeness line isn't shown for it, since it would be false; the stand-in line is shown instead. FR-032's AI disclosure holds as always. | FR-013. |
| M10 | Spec 003, FR-028, and Confirmation 4 ("only the chosen avatar is fetched") | The stand-in avatar's files are fetched in every visit beside the chosen avatar's. The edge still learns the choice wherever it differs from the stand-in, and row V1 says so (M6). | FR-010, FR-021. |
| M11 | Spec 003, FR-039 and FR-040(b); contracts/asset-events.md §4 | An avatar file's asset event names the avatar in its `asset`, so the event shows the choice. Row V6, when spec 001 adds it, says so. | FR-031. |
| M12 | Spec 003, contracts/site-loading.md §1 to §3, and tasks.md Phase 5 (T040 to T049) | The local room's avatars come through the room's own bundle and loader (the 3D part's `avatars`), as spec 004's models do, not through `assets.json`; the order is FR-021's; a visitor avatar's failure keeps its flat shape. Phase 5 stays for the twin's own avatar, its still and line, the site's relay, the asset events' route, and the credits link; T044's visitor-avatar half is this spec's. | FR-021, FR-022; the main session's brief: "This spec is the local room's half." |
| M13 | Spec 003, contracts/arrival-check.md, F3's reading ("plus the largest visitor directory's GLBs") | A reading, for the Author's optional patch to `tools/gates/arrival_check.py`: with a stand-in, a first visit fetches two visitor folders, so F3 would count the two largest. Until then the compositor's RK5 enforces it in `make check` (Default D8). | FR-038; SC-009. |
| M14 | ADR 0010 ("their animations live under `assets/animations/dog/` and `assets/animations/dinosaur/`") and `assets/README.md`'s `animations/<rig>/` | A visitor avatar's clips sit beside its model in its own folder, as the studio delivered them (Default D1). The twin's own clips stay as ADR 0010 says. Both texts are the Author's to change. | FR-009. |
| M15 | Spec 004, FR-008 ("taking only their anchors … from data") | Where a figure shows an avatar with a holding hand, the hand-off's end at that figure is the hand; the scene's anchors stay the fallback. | FR-018, FR-019. |
| M16 | Spec 004, FR-071 ("with no new kind"), FR-059, FR-060 | "No new kind" is the selection's: `avatar_failed` is a kind of its own (M4). An avatar's clips are idle motion: still under reduced motion and "Pause the room". | FR-026, FR-032. |
| M17 | Spec 004, FR-056 ("after the twin and the chosen avatar"), and the loader's `figures` promise (R-28, step 2) | Read as: the room's models start fetching once both figures' avatar files have been fetched or have failed; the promise resolves then, at once where no avatar loads. | FR-021. |
| M18 | Spec 004, contracts/room-data-files.md §5 (the scene), §5.1 (`role`: "Their pictures come from spec 003's avatar loader"), §9 (UI words), §13 (rules); contracts/room-bundle.md §3.1 (`copy`), §3.2 (the 3D part), §3.4 (the models), §10 (the report) | The scene gains the optional `figures` block (FR-037); the figures' pictures come from this spec's avatars; the UI words gain `twin.stand_in`; §13 gains the RA family, RI8's case, RK3's figures, and RK5 (FR-038); `copy` gains the stand-in line first; the 3D part's `figures` gains the block resolved, and it gains `avatars`; the avatars' copies join §3.4's; the report gains FR-040's lines. | FR-037 to FR-040. |
| M19 | Spec 004, contracts/serving.md §1 ("The twin's and the avatars' copies are written by spec 003's site-loading group") and §3 | The avatars' copies are written by the room's build with the same pako call; `web_image.py` hands over `assets/visitors/` as a second named context, `visitor-assets`. | FR-023. |
| M20 | Spec 004, FR-067 and FR-069 (the lookdev page and its phone copy) | The page gains the avatars, the choices, the hand-off, the clips, and avatar candidates in memory (FR-041). | FR-041. |
| M21 | Spec 008, FR-034 and plan R-12 ("a rigged avatar's driver, later") and its Assumptions, "The rig" | The avatar's driver is FR-028's. The woman's and the man's first sets have "idle", "idle-holding", and "take", and no walk, so they slide; the kept paper rides the holding hand. ADR 0010 reads accepted in `assets/policy/caps.json` (Assumptions). | FR-028. |

## Assumptions

**Scope and order**

- **Scope.** This spec owns the local room's avatars: their place in the bundle and the loader, the two figures' pictures, the stand-in and its line, the size and placement, the paper's hand, the clips, the avatar's walking driver, the compositor's new checks, the telemetry, and the amendments above. Outside it: the twin's own avatar, its likeness, still, line, talking and listening clips, and lip-sync (spec 003's Phase 5 and the rig's spec); the site's relay and the asset events' route (spec 001); the dog's and the dinosaur's files, which come by a later intake through the same convention; the twin turning to follow the visitor; and a rig spec.
- **The base.** The implementation stacks on `feat/008-walking`'s tip, being built tonight, and merges after it (plan.md §4). If the night ends after Phase 1, the rest stacks on Phase 1's tip in a branch of its own.
- **The intake is the Author's,** by hand: scrub, records, notices, credits, and an intake branch, as for the room's 21 pieces. Agents read no studio folder, and name the files by their contract paths.

**Readings of the inputs**

- **What the main session relayed, unopened.** The woman's folder holds `visitor-woman.glb` (4,824,956 bytes), `visitor-woman-idle.glb` (77,876), `visitor-woman-idle-holding.glb` (77,748), and `visitor-woman-take.glb` (102,412); the man's, `visitor-man.glb` (4,753,560), `visitor-man-idle.glb` (77,356), `visitor-man-idle-holding.glb` (77,228), and `visitor-man-take.glb` (102,440). The studio was asked for records (kind `avatar` for a model, `animation` for a clip), `SHA256SUMS`, and a `HANDBACK.md` per folder. In the repository they become `assets/visitors/woman/woman.glb`, `woman-idle.glb`, `woman-idle-holding.glb`, and `woman-take.glb`, and the man's alike (FR-009). The earlier hand-back gives the dog a 21-bone rig named `dog`, an idle, and an in-place gallop, and the dinosaur 27 bones with a jaw, an idle, an in-place walk, and a 2.5-second roar, its model 69,994 triangles and 5.03 MB.
- **What the files are assumed to be, checked at intake** (plan.md §5.3, L1 and L4): binary glTF in metres with ADR 0010's Mixamo-named humanoid skeleton (`mixamorig:Hips` and the rest), the model's origin between its feet, facing +z, its rest pose standing (a T-pose or an A-pose); each clip's tracks naming the model's bones; "idle-holding" and "take" holding and taking a sheet with one hand; the clips in place, with no root motion. No rig spec exists; these are the bones and clips the room relies on. Where a file breaks one, the avatar stands still or keeps its fallback, and nothing breaks (FR-002, FR-003).
- **The rest pose.** A T-pose shows only when an idle fails (FR-003). Spec 003's edge case already accepts a neutral pose there.
- **ADR 0010's status.** Its file still reads "proposed", with its first caps, while `assets/policy/caps.json` on `main` reads `"adr_0010": "accepted"`, with larger caps: an avatar at most 6,000,000 bytes, 90,000 triangles, and 33,554,432 bytes of texture memory; an animation 1,000,000 bytes. The ADR says "Accepting it is the Author's patch to that file", so this spec reads the caps file as the acceptance and its caps as those in force. Bringing the ADR's status line and caps in line is the Author's.
- **The texture headroom.** The scene's texture memory stood at 158,626,181 of 200,000,000 bytes in the last room report (`docs/merge-requests/2026-11-07-feat-004-room-models.md`), leaving about 41.4 million bytes for both avatars. One avatar at its cap fits; two might not, which is why RK3 counts them at their decoded size (FR-024) and `texture_px` is data.
- **The first visit.** About 6.6 MB of room models, the arrival check's F3 view, and about 5.0 MB for each avatar folder: about 16.7 MB with both, under spec 003's 25 MB.
- **Hosted services and libraries.** A Mixamo-named skeleton doesn't say how it was made. If a step used a hosted service or a downloadable library (a rigging service, an animation library), its record names it, and its license reads yes on FR-013's three terms in `main`'s allowlist, public distribution included, since the files sit in a public repository; a hosted service also needs its disclosure row (rule R7). The Author reads those terms (FR-042).
- **The talking twin.** The stand-in plays no talking, listening, or greeting clip; spec 007's conversation is unchanged, and the twin's own avatar brings those clips (ADR 0010's first set).
- **Words.** The stand-in line, a UI word, is the room's own words, agent-written and the Author's to change (Default D3); it says only that the figure isn't the Author's likeness, which is true of every visitor avatar by spec 003's FR-017.

**Deviations** (named, as the constitution's Governance requires)

- **Principle III**: "Every change begins as an `intent.md` in the originator's own words … accepted or closed by the Author. An accepted intent becomes a specification". The intent beside this spec is a draft: this spec was written on the Author's "keep going until you can" before he accepted it, as specs 006 and 008 were written beside draft intents. Nothing merges before the Author accepts the intent and approves this spec and its plan. If he closes the intent, this folder closes with it.
- **`CLAUDE.md`: "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`"**, and the lifecycle's order. The code was built on `feat/009-room-avatars` ahead of that approval, at the main session's direction, under the Author's "Let's finish this and keep going until you can", which is not his approval. Nothing merges before T000 (his acceptance of the intent and approval of this spec and its plan); his merge reviews the branch as built, and a no to any provisional answer changes the branch before it merges.
- **Inherited: local until publication** (ADR 0013). This spec is reviewed as a branch with a note in `docs/merge-requests/`, as the earlier specs are.
- **Not a deviation:** the avatar requests and the one event kind ride existing flows, disclosed in rows V1 and V4 in the same change (FR-036). No permission, allowlist, sandbox domain, CSP, budget, cap, or human-only file changes; the arrival check's F3 patch (M13) and the ADR's and `assets/README.md`'s texts (M14) are left to the Author.

**Defaults taken** under "keep going until you can", each the Author's to overturn (Open Questions, D1 to D10).

## Expected Cost Impact

- **Model spend: $0.** No avatar calls a model (FR-001).
- **Cloud, transfer.** $0 before publication (ADR 0013). After it, a first visit fetches the stand-in's folder and the chosen avatar's, about 5.0 MB each as plain files and somewhat less as gzip-9 copies, cached for a year: about 10 MB more per first visit as the files stand, less for a visitor who chooses the man, the dog, or the dinosaur. At 1,000 first visits a month, about 10 GB, under $1 at typical CDN rates of under $0.10 per GB, possibly $0 inside the edge's free allowance. With the room's models, a first visit is about 16.7 MB, inside spec 003's 25 MB.
- **Cloud, requests.** At most one usage event per visit whose avatar fails, about 25 bytes of body; none otherwise.
- **Code.** An estimated 10 to 20 KB gzipped in the lazy 3D chunk (three's animation mixer and the skeleton clone, the avatar module, and the driver); under 1 KB in the entry chunk (one UI word, one copy entry), inside spec 002's 150 KB, which the build measures.
- **Local:** no new service, container, or port. `make up`'s web image takes `assets/visitors/` as a build context; its build time grows by the gzip of the avatar files.
- **The Author's time:** the intake, about an hour; lookdev on both stages and the phone run, about an hour.
- **Dev time:** the Claude Team plan.
- **Measurement:** the report's first visit and RK3 lines in each note (FR-040); the build's chunk sizes; the "Visits whose avatar failed" panel (FR-034).

## Degraded-Mode Behavior

| What is gone or off | The visitor's figure | The twin's figure | The rest of the room |
|---|---|---|---|
| The local tier off, the budget spent, the kill switch `degraded` or unknown, the live source off | its avatar, as always | its stand-in avatar, as always | as today; only the conversation degrades |
| The chosen avatar has no files (the dog and the dinosaur today) | its flat shape | – | as today |
| The stand-in avatar has no files | – | its capsule | the stand-in line still shows |
| A file blocked, timed out, failing integrity, not 200, or corrupt | its flat shape after one retry; the asset event `failed`; `avatar_failed` once a visit | its capsule after one retry; the same | keeps drawing |
| An avatar over the texture ledger | its flat shape; the asset event `skipped` | its capsule; the same | as today |
| The idle clip fails | its avatar, standing still in its rest pose | the same | – |
| "idle-holding" or "take" fails | its idle in that clip's place; the paper still in its hand | its idle | the hand-off plays without that motion |
| Below ADR 0010's floor | its flat shape; nothing fetched | its capsule; nothing fetched | the room's models skipped, as today |
| No WebGL 2, or the room falls to 2D | its 2D flat shape | its 2D drawing | the 2D room; the visit kept |
| The 3D context lost | holds; shows its avatar again from the cache after a restore | the same | as spec 002 |
| Reduced motion, "Pause the room", or a hidden page | a still pose | a still pose | final frames |
| Quality level 1 or more | holds its current frame; textures at half size | animates; textures at half size | as today |
| An avatar not ready within `wait_ms` | the hand-off with its fallback; swaps in after | the same | – |
| The beacon refused or failing | `avatar_failed` isn't retried, queued, or stored | – | as today |

## Data-Flow Disclosure Entries

For `docs/data-flow-disclosure.md`, each in the same change as its flow (FR-036).

| Row | From → To | Trigger | Carries | Never carries | Why | Default; how to switch it off |
|---|---|---|---|---|---|---|
| Spec 002's V1, amended (M6) | as before: the visitor's browser → the site's own origin | as before | as before, and the avatar files: the twin's stand-in's in every visit in 3D above the floor, and the chosen avatar's where it has files, so the paths show which avatar the visitor chose wherever it differs from the stand-in | as before: anything to a third-party host | as before: the room's static assets; the avatars are among them | as before |
| Spec 002's V4, amended (M6) | as before: the visitor's browser → `POST /api/room/events`, a beacon | as before, and a figure's avatar failing to load, once a visit | as before: usage events, kind, identifier, time; `avatar_failed` has no identifier | as before: text, audio, path, avatar, client address, visit identifier; and which avatar failed, or which figure | as before: the dashboard's use panels, now with "Visits whose avatar failed" (FR-034) | as before |

Not new rows: the asset events stay switched off (FR-031); when spec 001 switches them on, its row V6 says that an avatar file's event names the avatar (M11). The avatar module is same-origin static code (V1).

## Constitution Check

Applied with the `constitution-check` skill's eight questions against constitution 1.0.1.

| Principle | Touched | How it complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | The avatar requests are same-origin static files whose paths show the choice, disclosed in row V1 in the serving change; one event kind, no identifier, in row V4 in the sending change (FR-036); nothing stored. No biometrics: visitors still choose pre-generated avatars, and no camera is asked for. The degraded mode is defined first (FR-001 to FR-007; User Story 6, P1). |
| II. Production-grade or not shipped | Yes | SC-001 to SC-014, each with tests or the Author's run; asset events, one usage event, and a dashboard panel (FR-031 to FR-035); the cost estimate above and its measurement; no alert, so no runbook entry; no model, so no evals; an ADR and the room's README for a cold reader (plan.md). |
| III. Intent before spec, spec before code, humans merge | Yes | From the intent beside it, in the Author's words, readings marked; amendments named, not edited in. Deviation: the intent is a draft and the spec was written on "keep going until you can", and the code was built on a branch ahead of approval at the main session's direction; nothing merges before the Author accepts and approves (Deviations). |
| IV. Least privilege | No | No permission, allowlist, sandbox domain, CSP, credential, cap, or human-only path changes; the compositor's new rules only narrow what a build may hold. The arrival check's F3 patch is offered to the Author, not made. |
| V. Cost is a first-class signal | Yes | $0 model spend; about 10 MB more per first visit after publication, measured in the report; the caps on `main` bound it (Expected Cost Impact). |
| VI. Build in public, including failures | Yes | The spec, its provisional answers, the records, and the avatars' licenses are public; nothing private is added. |
| VII. Own the whole product, and say exactly what you owned | Yes | The product reasoning is in the spec: why the man stands in, why the line sits in the note, why the room's sizes, why the hand-off waits 1.5 s, why one event (Clarifications). The Author's words are quoted, never paraphrased. |
| VIII. Honest AI | Yes | The stand-in is never presented as the Author's likeness: the room says so in its note and its text copy, spec 003's likeness line is withheld for it, and the AI disclosure stays visible in every mode (FR-013, SC-003); RA3 keeps a likeness out of the stand-in's place (FR-014). No model call, so no corpus or refusal change. |
| Security & Agent Governance | No | No agent configuration changes; the implementer doesn't review its own work (plan.md). |

## Open Questions for `/speckit-clarify`

The five questions were taken with their recommended options on 2026-11-08 (Clarifications); each stays open for the Author's yes or no. The ten defaults after them were taken the same way.

### Q1: Which avatar stands in for the twin? (FR-011, FR-015, FR-037)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | The man, as data; both figures show the man when the visitor chooses him | Follows "the male one can act as my twin"; one value to change; two identical figures in a man's visit, told apart by place and by the line. |
| B | An ordered list, the twin showing the first avatar the visitor didn't choose | No two identical figures; the twin's look changes with the visitor's choice. |
| C | The woman, as data | The other reading of the Author's words; a data edit from A. |
| D | No avatar stand-in: the capsule until the twin's own avatar | Nothing to label; no hand-off between avatars. |

### Q2: How does the room say the figure is a stand-in? (FR-013, FR-039)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | `twin.stand_in` in the stage's note and first in "Around the room", in 3D and 2D | Beside the figure and in the room's words; the header and the 320 × 568 layout unchanged. |
| B | A label over the twin's figure in the scene | Closest to the figure; grows its framed box and moves the camera, re-measuring spec 004's checks. |
| C | A second sentence in the AI disclosure header | Most prominent; wraps on a 320-pixel screen and pushes the layout. |

### Q3: How big is each avatar, and where does it stand? (FR-016, FR-017)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | At its figure's place, feet on the floor, scaled to the room's height for it (the twin's catalog height for the stand-in); the boxes unchanged | The composition's measurements and the 2D room hold; nothing moves when an avatar arrives. |
| B | Each at its model's own size | Unmeasured sizes; the composition re-measured at lookdev. |
| C | Every visitor avatar at the visitor figure's catalog height, 1.74 m | A 1.74 m dog. |

### Q4: When does the hand-off use the avatars? (FR-019, FR-020, FR-022)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | Wait for both avatars, at most `wait_ms` (1,500 ms); late ones keep their fallback through the hand-off | The demo's hand-off is between the avatars; a slow phone waits at most 1.5 s. |
| B | Never wait: the avatars always swap in after the hand-off | Simplest; the hand-off is always between the fallbacks. |
| C | Wait for both, however long | Always between the avatars; a slow phone can stall the room, against spec 002's SC-005. |

### Q5: How is the feature observed? (FR-031 to FR-036)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | `avatar_failed` once a visit on the beacon, row V4, a "Room" panel; asset events built and off | A graph on every stack now; one kind, no identifier. |
| B | Asset events only, off until spec 001 | No new kind; no production series until spec 001, a deviation named as spec 004's. |
| C | Nothing new | A named deviation from Principle II and workflow step 7. |

### Defaults taken, for a yes or a no

- **D1. Where the clips live.** Beside their model, `assets/visitors/<id>/<id>-<role>.glb`, as the studio delivered them, with the roles `idle`, `idle-holding`, `take`, and `walk` a closed list in code (FR-009; M14). On a no: under `assets/animations/<rig>/`, which the arrival check's F3 counts in every first visit.
- **D2. The holding hand.** Found from the clips, the hand "idle-holding" moves farthest, the right on a tie; not set as data (FR-018). On a no: a value in the `figures` block.
- **D3. The stand-in line's words.** "The twin's figure is a stand-in, not the Author's likeness." (FR-013). On a no: the Author's words, a data edit.
- **D4. Phase 1's timing.** The avatars swap in after the hand-off, spec 004's rule, until Phase 2's wait lands (FR-022).
- **D5. The texture cap.** 1,024 pixels a side, as data, with RK3 counting the decoded size (FR-024, FR-037). On a no: the files' own sizes, which two avatars may push over the scene's cap.
- **D6. The reduced tier.** Only the twin's avatar animates (FR-027).
- **D7. The 2D room.** Its flat shapes and the twin's drawing stay; no avatar file and no asset event in a room that starts in 2D (FR-004, FR-030).
- **D8. The first visit.** Enforced by the compositor's RK5 until the Author's optional F3 patch counts the two largest visitor folders (FR-038; M13).
- **D9. A file with no role** (the dinosaur's roar, say): reported, never refused, never fetched (FR-009, FR-038).
- **D10. The placeholder note.** Its trigger and words stay spec 002's and spec 004's; the stand-in line sits beside it (M3).
