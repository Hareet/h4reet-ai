# Feature Specification: The Dinosaur Eats Chunks of the Room's Assets

**Feature Branch**: `night/spec-024/spec-024` (documents only); the implementation branch is named in [plan.md](plan.md) §1.

**Created**: 2026-11-13. **Status**: Clarified provisionally (Q1 to Q6), planned, and tasked by the Author's order of 2026-11-13 ([plan.md](plan.md), [tasks.md](tasks.md)). Each answer goes on the morning page with its recommendation; he confirms or overturns it there, and an overturned answer is reworked before he merges. Nothing here is the Author's approval of the spec itself.

**Input**: [`intent/024-dino-eats-room-assets.md`](../../intent/024-dino-eats-room-assets.md) (draft). Also read: the constitution and `CLAUDE.md`; the Spec Kit templates; spec 004 (the room's data: `apps/web/room/scene.yaml`, `build/room/schema.ts`, the bundle), spec 008 (walking, reach, the target), spec 009 (avatars, clip roles), spec 014 (the sign labels, stand-ins); the code `src/choice/avatars.ts`, `src/room/scene/loader.ts`, `scene/bundle3d.ts`, `scene/highlight.ts`, `scene/walking.ts`, `scene/figure.ts`, `walk/reach.ts`, `motion.ts`, `a11y.ts`, `ui-keys.ts`; `docs/data-flow-disclosure.md`; `config/room-events.yaml`.

**Needs**: spec 021 (item e, "dinosaur modeled and brought in"). It is not on this branch. This spec is written against the intent as the Author stated it (a modelled dinosaur brought into the room) and names the interface it assumes, in Assumptions A1.

Summary: a visitor who has chosen the Dinosaur can walk up to the desk, the busy sign, the laptop, or the chalkboard and eat a chunk of it. The piece's own model is split into a handful of chunks, by shape, at the first bite; the dinosaur's bite takes one chunk, which flies to its mouth and is gone; the rest of the piece stays where it was. The room is never left broken: pieces grow back by themselves, one chunk at a time, and a piece is never eaten whole, so what the visitor can select, read, and ask the twin about is always there. Every degraded path (2D room, reduced motion, a failed or missing model, a dinosaur still without its model) removes the eating and nothing else. Cloud cost: $0. No byte leaves the device (Q3).

## Clarifications

### Session 2026-11-13 (`/speckit-clarify`, provisional)

Each answer takes the recommended option, by the Author's order of 2026-11-13 (rule 1). Each is also a question on the morning page, with its recommendation.

- **Q1: Who makes the dinosaur eat?** Options: A) the visitor, who chose the Dinosaur, by an "Eat" action on the piece they have walked up to (recommended); B) the room, on its own, as a scripted gag; C) both. → **A**. It uses what spec 008 built (reach, the target) and asks nothing of the twin or the corpus. The action is key **B** ("Bite"; E is already the walking view's turn-right, `walk/input.ts`), and an "Eat" button shown in the walking view only while the figure is the dinosaur, reaches an edible piece, and the piece isn't resting. (The key and the button are the session's choice; the intent doesn't name them.)
- **Q2: What is a chunk, and what stays after?** Options: A) the piece's own mesh split by shape into a fixed number of chunks (6 for the desk, 4 for each of the others), at the first bite; a bite removes one; the rest stays; pieces grow back (recommended); B) pre-modelled broken pieces from the studio (an asset per piece; waits for the Author's look approval and the studio's tools list); C) a shader's bite-shaped hole. → **A**. No new asset, no studio round, nothing for the Author's look approval but the effect itself. The cut faces show a flat colour taken from the piece's material (FR-006). B stays open for later as a look upgrade.
- **Q3: Does a bite send a usage event?** Options: A) no; nothing leaves the device (recommended); B) one `piece_eaten` event with the piece's ID, as `object_selected` has. → **A**. It saves a row in the data-flow disclosure, a kind in `config/room-events.yaml` (generated), and a gateway change. CLAUDE.md asks a new feature for a telemetry span and a dashboard panel; with no byte leaving, there is neither, and Assumptions A5 names that as the deviation.
- **Q4: Which pieces, and what is protected?** Options: A) the four he names, and no more (recommended); B) every piece. → **A**, with the protections in FR-004 and FR-005: a mesh that carries a face (the laptop's screen) or has a piece mounted on it (the desk's top under the monitor, the signs, and the laptop's stand) is never a chunk to eat, and at least one chunk of each piece always stays. His list says "like", so more pieces are a config line later (FR-002), not code.
- **Q5: Does a piece come back?** Options: A) yes, one chunk at a time, 20 s after the last bite, in the order they were eaten (recommended); B) at the next load; C) never in the visit. → **A**, so the room, which is the product's face, is whole again without a reload or a control. The 20 s is configuration (FR-011).
- **Q6: What do reduced motion and a screen reader get?** Options: A) the chunk vanishes at the bite with no flight and no regrowth animation; one polite line is said per piece's first bite in a visit, "The dinosaur ate part of the {name}." (recommended); B) the feature is off under reduced motion. → **A**. The eating is the feature; a flight is the only motion, so only the flight goes.

## Source: The Author's Words

> 7. i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard". Needs e.

Reading, beside his words and never in place of them: "dino" is the room's Dinosaur avatar (`dinosaur` in `src/choice/avatars.ts`), as spec 021 brings it in. "eat" is the dinosaur's act, shown in the 3D room. "chunks of assets" is parts of the room's studio pieces. "like desk, busy sign, laptop, chalkboard" is read as those four now, with more as configuration (Q4). "Needs e" is the dependency in Needs, above. The Author's separate item h ("twin and dog running from dino") isn't this spec's: here the dinosaur is the visitor's figure and eats on the visitor's action; nothing runs from it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Eat a Chunk of a Piece (Priority: P1)

As a visitor who chose the Dinosaur, I want to walk up to the desk and bite a piece out of it.

**Why this priority**: it is the Author's item.

**Independent Test**: `vitest run` on the chunker and the eating driver, with a stub piece, a stub dinosaur, and a stub stage: split a stub mesh, take one chunk, and read the piece's meshes: one fewer chunk, the other chunks' vertices unchanged. By hand, on a dev-cpu stack with the dinosaur's model: walk to the desk, press B.

**Acceptance Scenarios**:

1. **Given** the figure is the dinosaur and has walked up to the desk, **When** the visitor presses B, **Then** one of the desk's edible chunks flies to the dinosaur's mouth over at most 600 ms and is gone, the dinosaur holds its idle (FR-013), and the rest of the desk is where it was.
2. **Given** the figure is the woman, the man, or the dog, **When** the visitor presses B at the desk, **Then** nothing happens and no "Eat" button shows.
3. **Given** the figure has reached the monitor (not edible), **When** the visitor presses B, **Then** nothing happens.
4. **Given** the desk has one chunk left, **When** the visitor presses B, **Then** nothing is eaten and the "Eat" button hides.

### User Story 2 - The Room Is Never Left Broken (Priority: P1)

As the Author and as any visitor, I want the room to stay whole where it matters, so the twin, the labels, the laptop's state, and the picking always work.

**Why this priority**: constitution II (production-grade), and the room carries the tier sentence and the sign words.

**Independent Test**: `vitest run` on the regrowth and protection tests: for each of the four pieces, eat every edible chunk, then select the piece, read its label, and read the laptop's face; wait the regrowth timer and read the chunks back in order.

**Acceptance Scenarios**:

1. **Given** every edible chunk of each of the four pieces is eaten, **When** the visitor selects the piece from the scene or the "In the room" list, **Then** it selects as before, with its label and topic, and its pick area is unchanged.
2. **Given** the laptop's screen carries the tier's state, **When** its other chunks are eaten, **Then** the screen is still there and still reads the state.
3. **Given** a chunk was eaten, **When** 20 s pass with no bite on that piece, **Then** the earliest eaten chunk grows back over 400 ms (or appears at once under reduced motion), and the next regrows 20 s after, until the piece is whole.
4. **Given** the desk's top carries the monitor, the signs, and the laptop's stand, **When** every edible chunk is eaten, **Then** nothing floats: each thing mounted stays on a chunk that stays.

### User Story 3 - Degraded Modes Remove the Eating and Nothing Else (Priority: P1)

As a visitor on any device, I want the room to work as it did, whatever the eating can't do.

**Why this priority**: Principle I: the degraded mode ships with the happy path.

**Independent Test**: `vitest run` on the degraded-mode test: in each degraded state (the 2D room; the dinosaur's model absent or failed; a piece on its stand-in; reduced motion; paused room), read the "Eat" button, the key, and the room's other behaviour.

**Acceptance Scenarios**:

1. **Given** the 2D room, **When** the Dinosaur is chosen, **Then** its flat figure shows as today, with no "Eat" button, and B does nothing.
2. **Given** the dinosaur has no model (spec 021's file absent or failed, so the flat fallback shows), **When** the figure walks, **Then** the eating is off, as in the 2D room.
3. **Given** a piece shows its stand-in shape (its model failed, or is skipped on a weak device), **When** the figure reaches it, **Then** it isn't offered to eat.
4. **Given** reduced motion, **When** B is pressed at the desk, **Then** the chunk vanishes at once, with no flight, and one polite line is said (Q6).
5. **Given** the room is paused (spec 002, FR-060), **When** B is pressed, **Then** nothing happens, and a regrowth timer in progress waits.

### Edge Cases

- B pressed again while a chunk is in flight: ignored until it lands (one bite at a time).
- A piece is selected, or targeted, while a chunk of it is in flight: the border (spec 008) follows the meshes that stand; the highlight is refreshed at each bite and regrowth.
- The visitor leaves walking (Escape) during a flight: the chunk lands at once.
- The visitor changes avatar: not in the room today (the choice is made at the door); if a later spec adds it, the eaten state stays with the pieces, not the avatar.
- The model of a piece swaps in after the first bite was impossible (it wasn't a model yet): the chunker runs on the model only, when it shows.
- A phone with a low texture cap: chunk meshes reuse the piece's materials and textures, so the texture ledger (spec 004, FR-053) counts the same bytes.
- Two bites in the same frame from two inputs: one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The eating MUST be offered only in the 3D walking view, only while the visitor's figure is the dinosaur and shows its model, only on an edible piece the figure has reached (spec 008's reach), and only when the piece shows its model and more than one of its chunks stands, one of them edible (FR-004, FR-005).
- **FR-002**: Which pieces are edible, and into how many chunks, MUST be room data, an `edible` key on a placement in `apps/web/room/scene.yaml` (`edible: { chunks: 6 }`), checked by the compositor (`build/room/schema.ts`): a count from 2 to 12, on a placement that has a `piece`, and never on `room-shell`. The starting data names `work-desk` (6), `busy-sign` (4), `laptop` (4), and `chalkboard` (4).
- **FR-003**: At the first bite on a piece, the room MUST split its model's meshes by shape into the placement's chunk count: the triangles grouped by the nearest of N seed points spread over the piece's bounds (a k-means pass of a fixed iteration count over the triangles' centres, seeded by the piece's ID so the split is the same on every device and every visit), each group a mesh sharing the original's material, with no texture added. The result is memoized per piece.
- **FR-004**: A mesh that carries a face (spec 004's `faces` regions) MUST never be eaten, and a chunk MUST NOT be eaten while its footprint carries a mounted piece (any placement whose `mount.on` is this piece, or, transitively, rests on one that does). The chunks that qualify are decided at the split from the bundle's mounts and are the piece's edible chunks; the rest are fixed.
- **FR-005**: At least one chunk of every piece MUST always stay. A piece's pick area, its frame box, its label, its topic, its selection, and its place in the "In the room" list MUST NOT change by eating.
- **FR-006**: A cut face (a chunk's boundary created by the split) MUST be a flat colour: the piece's material's base colour, darkened by 30%, unlit, so no new texture or lighting cost.
- **FR-007**: A bite MUST be the nearest edible chunk to the dinosaur's mouth (A1), ties going to the lowest index; the eaten chunk flies to the mouth over at most 600 ms on a fixed ease and is hidden at its end, and a chunk's geometry MUST be disposed when it regrows no more. Only one bite at a time.
- **FR-008**: The 3D highlight (spec 008) MUST be refreshed at each bite's end and each regrowth, so a border follows the meshes that stand.
- **FR-009**: The eating MUST NOT run, or schedule anything, while the room is paused, while the loader shows, or after the room has fallen to 2D.
- **FR-010**: Under reduced motion (spec 002's `reducedMotion`, read throughout the visit), the flight and the regrowth's fade MUST be replaced by an immediate hide and an immediate return; One polite live-region line, "The dinosaur ate part of the {name}.", MUST be said at a piece's first bite of a visit, from `ui-words.yaml` (`eat.first_bite`, slot `{name}`, the piece's label); the "Eat" button's label is `eat.button`, and its disabled-state hint `eat.none_left`.
- **FR-011**: A chunk MUST regrow `eat.regrow_s` seconds (starting value 20, room data: a top-level `eating: { regrow_s: 20 }` in `apps/web/room/scene.yaml`, checked by the compositor and carried in the bundle) after the last bite on its piece, earliest-eaten first, one at a time, each next one that long after the last. The timer stops while paused and restarts at the resume.
- **FR-012**: The key B and the "Eat" button MUST be the only inputs; the key MUST NOT act while a text field has focus (the twin's chat), and the button MUST be a real button, reachable by keyboard, named by `eat.button`, shown only when FR-001 holds, in the walking view's controls, not over the AI disclosure or the stand-in line.
- **FR-013**: The first version MUST NOT add a clip role. The dinosaur holds its idle (or its walk's rest pose) while the chunk flies, which is the whole feature. A `bite` clip is a later, separate change: a new role in `CLIP_ROLES` is also a new file in the loader's lists, the build's avatar checks, and the loading bar's counts (`scene/loader.ts`, `build/room/avatars.ts`), which this spec doesn't touch. If spec 021 delivers a bite clip, it is a follow-up task, not this one.
- **FR-014**: The feature MUST add no network request and no usage event, and MUST NOT change `config/room-events.yaml` or `docs/data-flow-disclosure.md` (Q3).
- **FR-015**: A bite MUST cost less than 2 ms of main-thread time at the frame it starts, after the first on its piece; the first bite's split MUST take less than 50 ms for the starting pieces (measured on the test fixtures' triangle counts, at the room's phone budget), and MUST be a single pass, not spread over frames.
- **FR-016**: The eaten state is the visit's, in memory only; it is never stored, never sent, and a reload starts whole (Q5).
- **FR-017**: The twin's replies MUST NOT mention the eaten state; the twin is told nothing of it (spec 007), and no corpus change is proposed.

### Key Entities

- **Edible placement**: a placement with `edible.chunks`, from `scene.yaml`, validated at the build.
- **Chunk**: a mesh from the split, with an index, a state (standing, flying, eaten, regrowing), and the time it was eaten.
- **Meal ledger**: per piece, the chunks' states and the regrowth order, in memory (FR-016).
- **Mouth**: the dinosaur figure's anchor for a bite (A1).

## Success Criteria *(mandatory)*

- **SC-001**: In the small tests, for each of the four pieces, the split is the same on 100 runs with the same seed, and every triangle of the original is in exactly one chunk (no loss, no overlap).
- **SC-002**: For each of the four pieces, eating every edible chunk leaves the piece selectable, labelled, with its pick area unchanged and with at least one chunk standing; no placement mounted on it loses its supporting chunk.
- **SC-003**: Every piece is whole again `edible.chunks × eat.regrow_s` seconds after its last bite, in the tests' fake clock.
- **SC-004**: In each degraded state (US3), the room's output other than the eating is byte-identical to the room without this feature (the room's existing snapshots pass unchanged).
- **SC-005**: The first split is under 50 ms and a later bite under 2 ms on the fixtures; the build's entry-chunk and 3D-chunk budgets (`test/room/chunk.test.ts`) pass with the code added.
- **SC-006**: Cloud cost is $0, and the data-flow disclosure's test passes with no new row (`apps/web/test/disclosure.test.ts`).
- **SC-007**: By hand, on the dev-cpu stack with spec 021's model, the Author sees the dinosaur eat chunks of the desk, the busy sign, the laptop, and the chalkboard (the look approval is his).

## Cost Estimate

Cloud: $0. Model spend: $0 at run time. Dev-time: a spec-writer, an implementer, and a reviewer on one web-only feature: a few dollars of Claude spend, which the night's budget carries.

## Degraded Mode

See User Story 3 and FR-001, FR-009, FR-010. With the feature failing in any way (an exception in the split, a missing mouth), the eating turns itself off for the visit, the piece stays whole as loaded, and the room carries on; one `console.warn` per visit, no payload.

## Assumptions

- **A1 (the interface assumed from spec 021)**: spec 021 brings in the dinosaur as `assets/visitors/dinosaur/dinosaur.glb`, with the clips `idle` and `walk` under spec 009's `CLIP_ROLES`, and the model's scene graph holds a node named `mouth` at the bite's end (a node, so no new bone). Absent a `mouth` node, the figure's head is taken as the point 0.8 of the figure's height up, 0.3 of its height ahead of its feet along the heading (an estimate, said so in the plan). No `bite` clip is assumed (FR-013). If spec 021 names any of these otherwise, this spec's plan follows its names; the change is one constant.
- **A2**: the Dinosaur remains a choice at the door (`choice/avatars.ts`); the eating is tied to `avatarId === "dinosaur"`.
- **A3**: the chunking is code and data, no asset: Q2's option A. If the Author prefers pre-modelled chunks (Q2 B), they are a studio round on the tools list of P-7 (his answer: "It's the same license that we've used for all the other avatars adn motions, so copy it from there"); it isn't this spec's.
- **A4**: the Author's look approval of the effect (the cut colour, the flight, the regrowth) is his, on the dev-cpu stack, and no asset record is made (there is no new asset). The approval of the dinosaur's model is spec 021's.
- **A5 (a deviation from CLAUDE.md, named)**: "New endpoint or feature → also: telemetry span, dashboard panel, cost estimate in the spec, degraded-mode behavior, data-flow disclosure entry if a byte leaves the device". This spec has the cost estimate and the degraded mode; it has no span, no panel, and no disclosure entry, because it adds no endpoint, no server contact, and no byte leaving the device (FR-014). If the Author takes Q3 B, the span, the panel, and the disclosure row come with it.
- **A6**: the constitution's principles are met as follows: I (degraded mode, US3); II (small tests, the room's gates, FR-015); V (cost $0); VIII (the twin says nothing of the eating, FR-017). No principle is deferred.
- **A7**: item h of the Author's list ("twin and dog running from dino") builds on the dinosaur's own figure and may later want an eaten-state signal; this spec exposes none and leaves it to that spec.

## Revision, 2026-11-13 (analysis)

The analysis found that **E** is the walking view's turn-right key (`apps/web/src/room/walk/input.ts`, `HELD`; W A S D Q E R F, the arrows, Enter, and Escape are taken). The action key is **B**, free there, and the spec, plan, and tasks say B. Recorded in [analysis.md](analysis.md) A-1.
