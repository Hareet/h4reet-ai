# Feature Specification: The Dinosaur, Modeled and Brought In

**Feature Branch**: `night/spec-021/spec-021` (the night shift's branch for this task), `base: refs/heads/main` at 3c0e4cd0

**Created**: 2026-11-14

**Status**: Draft, specified on the night of 2026-11-13 under the Author's order of that date (below). Every clarification answer is the recommended one, taken provisionally; each goes on the morning page.

**Input**: [`intent/021-dinosaur-modeled-and-brought-in.md`](../../intent/021-dinosaur-modeled-and-brought-in.md) (draft). Also read at this base: the [constitution](../../.specify/memory/constitution.md), `CLAUDE.md`, `REVIEW.md`, [spec 009](../009-room-avatars/spec.md) (the visitor avatars: FR-008 to FR-043), [spec 003](../003-studio-assets/spec.md) (the studio's intake), [spec 017](../017-the-night-shift/spec.md) and [ADR 0053](../../docs/adr/0053-the-studio-line.md) (the studio line), [ADR 0010](../../docs/adr/0010-real-time-avatar-rig-and-art-direction.md) (the rig, the caps), and `assets/policy/{caps,studio-tools,approvals}.json` on `main`.

Summary: the visitor's fourth avatar, the dinosaur, today a flat green cut-out in both modes, becomes a 3D model with an idle clip, a walk clip, and a "take" clip, made in a studio round from the studio's shipped tools only, passed through the intake's checks, and shown in the room by the code spec 009 already put there. This spec adds the dinosaur's brief and rig, the few checks and tests that make a non-humanoid avatar safe to bring in, and a build that works with or without the files, so the local stack never waits on the asset. The model itself comes in only after the Author's look approval.

## Source: The Author's Words

His item, word for word (the order of 2026-11-13, "improvements, in your words", item 4):

> 4. e) "dinosaur modeled and brought in"

The order that carries it:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

How far the night goes (2026-11-13):

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His studio-tools answer (spec 017's P-7, on `main`): "It's the same license that we've used for all the other avatars adn motions, so copy it from there".

Earlier words this spec rests on (spec 009's source, intent 000): "Avatars: placeholders for now — a generic woman, a generic man, a generic dinosaur, a generic dog — to be replaced with final characters later."

**Readings, beside his words, never in their place.**
- "dinosaur" is the visitor's existing fourth avatar (`AVATARS`'s `dinosaur`, "a generic dinosaur"), to be "replaced with final characters" (intent 000). His items i and h ("dino being able to eat chunks of assets…", "twin and dog running from dino") are separate items later in his order; this spec leaves room for them (the rig) and builds none of them (Q1).
- "modeled" is the studio's work, a studio round (spec 017, User Story 4); "brought in" is the intake and the room code. His photos are for the dog, not the dinosaur; no photo and no likeness are used here (FR-007).
- No sentence of his gives the dinosaur's look, size, or colour. Those come from the cut-out already in the room (green `#4f8a3c`, 1.2 m high, 1.1 m wide) and ADR 0010's art direction, and are for his look approval.

## Clarifications

Taken under the Author's order of 2026-11-13, rule 1: the recommended answer at clarify, provisional, each on the morning page; an overturned one is reworked before he merges. Asked of no one tonight.

- Q1: Is the dinosaur only the visitor's avatar here, or also a character in the room (for items i and h)? → Taken, not answered: the visitor's avatar only. The rig carries a `Jaw` bone and a tail chain so a later spec can add bite and run clips without a second model; the closed clip-role list (`CLIP_ROLES`) doesn't grow here. *Others: also build a free-roaming dinosaur now; leave the rig simple (no jaw).*
- Q2: The dinosaur has no hands. Where does the resume's paper go? → Taken, not answered: nowhere new. Spec 009's FR-018 already says an avatar with neither hand bone leaves the paper at the figure's hand anchor, and FR-028 slides the idle. No code. *Others: the paper in its mouth at a `Jaw` grip (spec 014's grips would need a non-hand slot); the paper at its feet.*
- Q3: Which clips? → Taken, not answered: `idle`, `walk`, and `take` (a head-dip toward the paper). No `idle-holding`. `idle` and `walk` are required for the intake; a missing `take` leaves the dinosaur in its idle during the hand-off, as FR-019 allows. *Others: idle only; all four roles, `idle-holding` a copy of the idle.*
- Q4: What look? → Taken, not answered: an original, friendly, upright-posed theropod in ADR 0010's stylized illustrative realism, green near `#4f8a3c`, no film or franchise creature's design, no text or marks. Its pose has the tail low and the head forward so it fits the cut-out's box (FR-004). *Others: a long-necked sauropod; a cartoon with big eyes.*
- Q5: What budgets does the brief ask for, under `main`'s avatar caps (6,000,000 bytes, 90,000 triangles, 33,554,432 bytes of texture; 1,000,000 an animation)? → Taken, not answered: model at most 3,000,000 bytes and 30,000 triangles, one 1,024-pixel-side texture set (the room's avatar side), each clip at most 300,000 bytes. Smaller than the caps so the first visit stays under F3's 25,000,000 with the twin's files, the largest visitor's, and the room's. *Others: the caps themselves; 60,000 triangles.*
- Q6: What stands in until he approves the model? → Taken, not answered: what stands in today: the flat cut-out in 2D and as the 3D fallback, and the note "Placeholder shapes stand in for the room's pieces until their models arrive" (spec 014's `avatarsPlaceholder`) while any avatar lacks its model. Tests use a generated fixture, never the asset. No new art. *Others: a low-poly 3D stand-in made in code; hide the dinosaur from the choice screen until it arrives.*
- Q7: Is the rig check shared with the dog's? → Taken, not answered: the two non-humanoid avatars share one rig table (FR-005): avatar id → required bones, one rule, a row each. This spec owns the table; the dog's spec adds its row on rebase. *Others: each spec its own rule.*

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The visitor who chose the dinosaur sees it in 3D (Priority: P1)

A visitor chooses the dinosaur on the choice screen. In the 3D room their figure is the modeled dinosaur, idling, at the figure's place, and it walks when they walk.

**Why this priority**: it is the item.

**Independent Test**: with a fixture dinosaur folder in a temporary tree (generated, not the asset), the compositor bundles it and the stage shows it for the `dinosaur` choice, plays `idle` and `walk`, and keeps the paper at the anchor; `vitest run` over the avatar files named in tasks.md.

**Acceptance Scenarios**:
1. **Given** `assets/visitors/dinosaur/` holds a model, `idle` and `walk` clips, their records and a licence, **When** the room builds, **Then** the dinosaur's files are in the 3D part's avatars and `dist/a/`, and the choice screen is unchanged.
2. **Given** the dinosaur is chosen and ready, **When** the visitor walks, **Then** the walk clip plays weighted by speed and the figure turns to its heading (spec 009's FR-028).
3. **Given** the hand-off, **When** the dinosaur is the visitor, **Then** the paper stays at the hand anchor and no console error shows (FR-008).

### User Story 2 - Nothing changes until the model arrives (Priority: P1)

**Independent Test**: build on `main`'s tree (no dinosaur folder): the output is byte for byte as before; the local stack builds.

**Acceptance Scenarios**:
1. **Given** no files, **When** the room builds, **Then** the cut-out shows in both modes, the note still shows, and the report lists no dinosaur.
2. **Given** a dinosaur whose files fail a check, **When** the build is lenient, **Then** it warns and shows the cut-out; **When** strict, **Then** it refuses with `<rule> <file>:<path>: <reason>`.

### User Story 3 - The studio makes it, and the intake checks it (Priority: P2)

A later studio task writes the brief, drives Blender and ComfyUI with the shipped tools only, and hands a candidate back; `line.py` and the arrival check judge it in at most three rounds.

**Independent Test**: `pytest scripts/studio/test_line.py` with the dinosaur's brief as a fixture passes `line.py brief`; a brief naming a tool with `outputs_ship: false` fails.

**Acceptance Scenarios**:
1. **Given** the brief in `contracts/dinosaur-brief.md`, **When** `line.py brief` runs, **Then** it passes with `main`'s tools list.
2. **Given** a candidate whose rig lacks a required bone, **When** `line.py candidate` runs, **Then** it names the bone.
3. **Given** three failed rounds, **When** the line stops, **Then** the asset is on the decision page with three findings lists.

### User Story 4 - The Author approves its look, then it comes in (Priority: P2, the Author's)

**Acceptance Scenarios**:
1. **Given** a passing candidate, **When** the Author judges the look, **Then** only his word brings it in, by his intake commit, with an `approvals.json` entry where the gate wants one (his hand, FR-015).
2. **Given** he declines, **Then** the next round carries his words as findings, or the asset stays the cut-out.

### Edge Cases

- The model is taller or wider than the cut-out's box: RA9 (FR-004) refuses it strictly. Spec 004's Clarification on "Where the visitor stands" records the cut-out hiding 56% of the monitor screen at the visitor's place; a larger body hides more than the Author accepted.
- A clip moves a bone the model lacks: RA2 already refuses it.
- The model's skin lacks a required rig bone (`Jaw`, say): RA10 (FR-005) refuses it. A humanoid `mixamorig:` skeleton is not required of it, nor forbidden.
- Reduced motion, pause, quality level 1: spec 009's FR-026 and FR-027 hold unchanged.
- A visitor who chose the dinosaur and falls to 2D: the flat cut-out, as today.
- The record names a tool not on `main`'s list, or `likeness: true`: the intake refuses it.

## Requirements *(mandatory)*

### Functional Requirements

**The files and their checks**

- **FR-001**: THE DINOSAUR'S FILES SHALL be `assets/visitors/dinosaur/dinosaur.glb` (kind `avatar`) and `dinosaur-idle.glb`, `dinosaur-walk.glb`, `dinosaur-take.glb` (kind `animation`), recorded in the folder's `records.json` with `likeness: false`, and a `LICENSE.md` copied from the shipped avatars' (his answer), as spec 009's FR-009 has it. The room's code SHALL read them from the tree, and no test SHALL list them (spec 009's FR-043).
- **FR-002**: THE ROOM SHALL show the model WHERE it is recorded, readable, and within `main`'s caps for its kind, and SHALL otherwise show the cut-out, with the failure paths of spec 009's FR-002 to FR-007 unchanged.
- **FR-003** (RA11): `idle` AND `walk` SHALL be required: WHEN the folder has a model without them, THE COMPOSITOR SHALL, strictly, refuse and, leniently, show the cut-out.
- **FR-004** (RA9): THE MODEL, scaled uniformly to the dinosaur's room height, 1.2 m (spec 009's FR-016 does that scaling; the height measured in the rest pose), SHALL measure at most 1.1 m along x and 1.1 m along z, with 5% slack: the cut-out's width, 1.1 m, in either direction, since it faces +z as every avatar does and turns when the visitor walks. A model that is too long for its height (a body, with its tail, over 1.1 m long at 1.2 m high) is refused strictly and left out, with a warning, leniently.
- **FR-005** (RA10): THE DINOSAUR'S SKELETON SHALL be the `dinosaur` rig of `contracts/dinosaur-rig.md`; the compositor SHALL require its bones by name (`Hips`, `Spine`, `Neck`, `Head`, `Jaw`, `Tail1`, the legs, and the rest of the contract), and SHALL NOT require Mixamo's. THE CHECK SHALL be one rig-table rule keyed by avatar id, so the dog's spec adds a row, not a rule (Q7).
- **FR-006**: THE ARRIVAL CHECK (`tools/gates/**`, the Author's) SHALL stay unchanged; RA9 to RA11 SHALL live in the compositor's checks (`apps/web/build/room/checks/ra.ts`) and the studio line's candidate check (`scripts/studio/line.py`, bone names), so no human-only file is touched.
- **FR-007**: THE DINOSAUR SHALL be an original character: no photo, no film or franchise creature, no logo or text; its record's source is a prompt (like the shipped avatars'), `likeness: false`. THE INTAKE SHALL refuse `likeness: true` or a photo source (spec 009's FR-014 reasoning).

**The code that brings it in**

- **FR-008**: WHERE the dinosaur has no hand bone, THE FIGURE SHALL leave the paper at the hand anchor (spec 009's FR-018) WITHOUT a console error or a failed load, and `take` (where present) SHALL play once in the hand-off.
- **FR-009**: THE FIGURE'S HEIGHT, ORIGIN, FACING, AND PLACEMENT SHALL stay as spec 009's FR-016 and FR-017 have them: the catalog entries, the camera's framing, the pick areas, and the walkable floor SHALL NOT change.
- **FR-010**: THE NOTE `Placeholder shapes stand in …` SHALL stop showing for the dinosaur once its model arrives, and SHALL keep showing while any avatar choice lacks one (spec 014's `avatarsPlaceholder`, computed from the tree).
- **FR-011**: THE ROOM SHALL send no new event, make no model or gateway call, and fetch the dinosaur's files only for the visitor who chose it, after "Enter" (spec 009's FR-010, FR-021).
- **FR-012**: THE FIRST VISIT SHALL stay within F3's budget with the dinosaur at its brief's targets; the compositor's report SHALL list the dinosaur's bytes, triangles, and texture memory (spec 009's FR-040).

**The studio round and the intake**

- **FR-013**: THE DINOSAUR'S BRIEF (`contracts/dinosaur-brief.md`) SHALL name, in `tools`, only IDs on `main`'s `studio-tools.json` with `outputs_ship: true`, and its limits SHALL be at or under `main`'s caps (Q5). The studio round runs as a later studio task, never in this spec's session; the list is on `main` (at 3c0e4cd0).
- **FR-014**: THE STUDIO SHALL install no node and download no weight; a tool it lacks goes on the decision page (spec 017's FR-030). Qwen-Image-2.1, FLUX [dev], and every tool marked `UNREVIEWED` are out.
- **FR-015**: THE AUTHOR'S LOOK APPROVAL SHALL come last and be his: the candidate comes in on an intake branch with its record; the intake commit and any `approvals.json` entry the gate wants are his hand. NO agent writes `assets/**` or `assets/policy/**` for it.

**Tests, docs, telemetry**

- **FR-016**: EVERY TASK SHALL name the small test files it adds or changes and run only those and `make lint` (the Author's rule 4); the full `make check` SHALL run once, at the end of the stack, by one task.
- **FR-017**: THE DATA-FLOW DISCLOSURE SHALL gain no row: the dinosaur's files are static assets from the site's own origin and row V1 already names the avatar files (spec 009's FR-036); a one-sentence check that V1 still reads right is a task.
- **FR-018**: THE DASHBOARD'S "Visits whose avatar failed" panel (spec 009's FR-034) SHALL cover the dinosaur with no change; its description is checked, not edited.

### Key Entities

- **Dinosaur avatar**: model + clips + record in `assets/visitors/dinosaur/`, one of `AVATARS`.
- **Rig table**: avatar id → required bone names; `dinosaur` first, `dog` by the dog's spec.
- **Brief**: the studio line's request for the dinosaur (`contracts/dinosaur-brief.md`).

## Success Criteria *(mandatory)*

- **SC-001**: With a fixture dinosaur folder, the build's report lists it and `dist/a/` holds its files; with none, the build is byte for byte unchanged (US2).
- **SC-002**: RA9, RA10, RA11 each fail a fixture that breaks only that rule and pass the good fixture.
- **SC-003**: The dinosaur's walk, idle, and `take` play in the stage's tests with no hand bone and no console error.
- **SC-004**: `line.py brief` passes the dinosaur's brief on `main`'s lists and fails it with one `outputs_ship: false` tool added.
- **SC-005**: The first visit with the brief's targets is under F3's 25,000,000 bytes in the report.
- **SC-006**: No file under `.claude/**`, `tools/gates/**`, `corpus/**`, `assets/**`, or `assets/policy/**` is changed by an agent (`git diff --stat` shows none).

## Assumptions

- The studio line works as ADR 0053 and spec 017 describe, and `line.py` and `studio-tools.json` are on `main`. The studio round is a later task; if it fails three rounds, the dinosaur stays the cut-out and this spec's code stays correct (US2).
- The dinosaur's brief names these shipped tools only, from `main`'s list, as the Author's answer asks ("the same license that we've used for all the other avatars adn motions"): `blender-5.2.3`, `comfyui-core`, `flux.2-klein-4b-base`, `qwen3-4b-its-text-encoder`, `flux.2-vae`, `birefnet`, `moge-2-vit-l-with-normals`, `pixal3d-int8`, `trellis.2-shape-vae`, `trellis.2-texture-vae`, `gltf-exporter-bundled-with-blender`, `numpy-bundled-with-blender`. The round's record names the ones used; the studio picks, and a tool off the list is the Author's to add.
- No constitution control is deferred or dropped; no deviation to name.
- The visitor-avatar code (spec 009, 016) is on `main` and handles a model with no hand bone; the plan's first task proves it with a test before relying on it.
- The dog's spec runs in parallel; the rig table is this spec's, the dog's spec adds its row on rebase (Q7). Interface: `RIG_BONES: Record<AvatarId, readonly string[] | null>`, `null` for the humanoids.

## Expected Cost Impact

$0 cloud and $0 model-API spend: the models run on the local GPU through the studio; the cost is the Author's GPU time and dev-time model tokens for the spec and the implementation, order of $10. The first visit grows by the dinosaur's files only for visitors who choose it (about 3.9 MB at the targets, before gzip) and not at all for others.

## Degraded-Mode Behavior

No model, a failed file, a failed check, a failed decode, 2D mode, the floor: the cut-out (FR-002; spec 009's FR-002 to FR-007). Kill switch or local tier off: no effect; the files are static (FR-011).

## Data-Flow Disclosure Entries

None new: same-origin static files, row V1 (FR-017). No byte leaves the device that didn't before.

## Constitution Check

| Principle | Result |
|---|---|
| I. Disclosure; degraded mode first | Pass: no new flow; the cut-out is the degraded mode |
| II. Tests, telemetry, cost, docs | Pass: SC-001 to SC-006, small tests per task; no new endpoint; cost above |
| III. Spec before code; humans merge | Pass: this spec and its plan precede code; plan provisionally approved by order; the Author merges |
| IV. Least privilege | Pass: FR-006, FR-015: no human-only file written |
| V. Cost | Pass: $0 cloud |
| VI. Public | Pass: an original character; no photo; no corpus claim about the Author |
| VII. Whole product | Pass: the local stack builds with or without the files |
| VIII. Honest AI | Pass: the dinosaur is not the twin; the stand-in note stays honest |

## Open Questions

None open after the clarifications above; each is on the morning page with its recommended answer.
