# Feature Specification: The Dinosaur, Modeled and Brought In

**Feature Branch**: `night/spec-021/spec-021` (the night shift's branch for this task), reworked on `night/rework-spec-021/rework-spec-021` after the Opus review rv-spec-021 (rule 6). Written against the night's line, not `main`: `night/impl-020/impl-020` at 384a0db8 (specs 018 to 020 implemented), with spec 020's rework read at `night/rework-spec-020/rework-spec-020` 7a002a6a. impl-021 merges this branch into the line.

**Created**: 2026-11-14 · **Reworked**: 2026-11-14

**Status**: Draft, specified on the night of 2026-11-13 under the Author's order of that date (below). Every clarification answer is the recommended one; the page records each as answered so by the Author (Q32 to Q38, Q73, Q75).

**Input**: [`intent/021-dinosaur-modeled-and-brought-in.md`](../../intent/021-dinosaur-modeled-and-brought-in.md) (draft). Also read, on the line: the [constitution](../../.specify/memory/constitution.md), `CLAUDE.md`, `REVIEW.md`, [spec 009](../009-room-avatars/spec.md) (the visitor avatars: FR-003, FR-008 to FR-043), [spec 014](../014-room-after-the-demo/spec.md) (FR-053, FR-054: the placeholder note's two causes), spec 019, `specs/019-avatar-walking-legs/spec.md` on the line (FR-008: no gait without the six Mixamo leg bones), spec 020, `specs/020-dog-modeled-and-brought-in/spec.md` on the line (RA9: a visitor's likeness held to main's approval), spec 004's Clarification "Where the visitor stands", [spec 003](../003-studio-assets/spec.md) (the studio's intake), [spec 017](../017-the-night-shift/spec.md) and [ADR 0053](../../docs/adr/0053-the-studio-line.md) (the studio line), [ADR 0010](../../docs/adr/0010-real-time-avatar-rig-and-art-direction.md) (the rig, the art direction), `apps/web/build/room/avatars.ts`, `checks/family.ts`, `test/room/compose.test.ts`, `src/room/scene/gait.ts`, `scripts/studio/line.py`, `tools/gates/arrival_check.py`'s header, and `assets/policy/{caps,studio-tools,approvals}.json` and `assets/visitors/{woman,man}/records.json` on `main` (3c0e4cd0).

Summary: the visitor's fourth avatar, the dinosaur, today a flat green cut-out in both modes, becomes a 3D model with an idle clip, a walk clip, and a "take" clip, made in a studio round from the tools and models the shipped avatars' records name, passed through the intake's checks, and shown in the room by the code spec 009 already put there. This spec adds the dinosaur's brief and rig, three compositor rules and the tests that make a non-humanoid avatar safe to bring in, and a build that works with or without the files, so the local stack never waits on the asset. The model itself comes in only after the Author's look approval.

## Source: The Author's Words

His item, word for word (the order of 2026-11-13, "improvements, in your words", item 4):

> 4. e) "dinosaur modeled and brought in"

The order that carries it:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

How far the night goes (2026-11-13):

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His studio-tools answer (spec 017's P-7, on `main`): "It's the same license that we've used for all the other avatars adn motions, so copy it from there".

Earlier words this spec rests on (spec 009's source, intent 000): "Avatars: placeholders for now — a generic woman, a generic man, a generic dinosaur, a generic dog — to be replaced with final characters later." And intent 000's art direction: "Inspired-by only — no Rockstar assets, logos, typefaces, or character likenesses; everything is original."

**Readings, beside his words, never in their place.**
- "dinosaur" is the visitor's existing fourth avatar (`AVATARS`'s `dinosaur`, "a generic dinosaur"), to be "replaced with final characters" (intent 000). His items i and h ("dino being able to eat chunks of assets…", "twin and dog running from dino") are separate items later in his order; this spec leaves room for them (the rig) and builds none of them (Q1).
- "modeled" is the studio's work, a studio round (spec 017, User Story 4); "brought in" is the intake and the room code. His photos are for the dog, not the dinosaur; no photo and no likeness are used here (FR-007).
- No sentence of his gives the dinosaur's look, size, or colour. Those come from the cut-out already in the room (`AVATAR_SHAPES.dinosaur`: green `#4f8a3c`, 1.2 m high, 1.1 m wide) and ADR 0010's art direction, and are for his look approval.

## Clarifications

Taken under the Author's order of 2026-11-13, rule 1: the recommended answer at clarify. Each went on the morning page; the page records each as "Answered: recommended, the Author 2026-11-13" (page numbers in brackets). rv-spec-021's rework (2026-11-14) reworded Q6 and Q7 to the line's terms without changing what was answered, and added Q8 and Q9 from the page.

- Q1 [page Q32]: Is the dinosaur only the visitor's avatar here, or also a character in the room (for items i and h)? → Answered, recommended: the visitor's avatar only. The rig carries a `Jaw` bone and a tail chain so a later spec can add bite and run clips without a second model; the closed clip-role list (`CLIP_ROLES`) doesn't grow here. *Others: also build a free-roaming dinosaur now; leave the rig simple (no jaw).*
- Q2 [page Q33]: The dinosaur has no hands. Where does the resume's paper go? → Answered, recommended: nowhere new. Spec 009's FR-018 already says an avatar with neither hand bone leaves the paper at the figure's hand anchor, and FR-028 slides the idle. No code. *Others: the paper in its mouth at a `Jaw` grip (spec 014's grips would need a non-hand slot); the paper at its feet.*
- Q3 [page Q34]: Which clips? → Answered, recommended: `idle`, `walk`, and `take` (a head-dip toward the paper). No `idle-holding`. `idle` and `walk` are required for the intake (RA12); a missing or failed `take` leaves the dinosaur in its idle in the hand-off, as spec 009's FR-003 has it ("its idle SHALL play in that clip's place"). *Others: idle only; all four roles, `idle-holding` a copy of the idle.*
- Q4 [page Q35]: What look? → Answered, recommended: an original, friendly, upright-posed theropod in ADR 0010's stylized illustrative realism, green near `#4f8a3c`, no film or franchise creature's design, no text or marks. Its pose has the tail low and the head forward so it fits the cut-out's box (FR-004). *Others: a long-necked sauropod; a cartoon with big eyes.*
- Q5 [page Q36]: What budgets does the brief ask for, under `main`'s caps (`assets/policy/caps.json`: `per_asset.avatar` `{"bytes": 21000000, "triangles": 180000, "texture_bytes": 46000000}`, `per_asset.animation` `{"bytes": 1000000}`, `first_visit_bytes.phase3` 25000000)? → Answered, recommended: model at most 3,000,000 bytes and 30,000 triangles, one 1,024-pixel-side texture set (the room's avatar side), each clip at most 300,000 bytes. Well under the caps so the first visit stays under F3's 25,000,000 with the twin's files, the largest visitor's, and the room's. *Others: the caps themselves; 60,000 triangles.* (Reworked: the first version quoted caps that aren't `main`'s; rv-spec-021's I1.)
- Q6 [page Q37]: What stands in until he approves the model? → Answered, recommended: what stands in today, on spec 014's terms: the flat cut-out in 2D and as the 3D fallback; while the 3D room shows the dinosaur chosen as its flat shape, the placeholder note says `standin.avatar` ("Your figure is a flat placeholder until its model arrives.", spec 014's FR-054), and that goes when the dinosaur's model shows. `standin.note` (spec 014's FR-053) counts the room's pieces only and is untouched. Tests use a generated fixture, never the asset. No new art. *Others: a low-poly 3D stand-in made in code; hide the dinosaur from the choice screen until it arrives.* (Reworked: the first version named the build's `avatarsPlaceholder`, which spec 014 deleted; rv-spec-021's B2.)
- Q7 [page Q38]: Is the rig check shared with the dog's? → Answered, recommended: one rig table (FR-005), avatar id → required bones, one rule, a row each; this spec owns it. On the line, the rows are `woman`, `man`, and `dog`: `null` (no rig check; spec 020 names no dog bones), and `dinosaur`: the contract's list. A later spec that names the dog's bones fills its row; nothing here asks it to. *Others: each spec its own rule.* (Reworked: rv-spec-021's B1.)
- Q8 [page Q73]: Which tool IDs does the brief name? → Answered, recommended: the fourteen IDs of `main`'s `studio-tools.json` that the shipped woman's and man's records use, as his answer says ("copy it from there"); `line.py candidate` checks the record's names against the brief (FR-013, `contracts/dinosaur-brief.md`). *Others: the first contract's list (`blender-5.2.3`, `comfyui-core`, without DINOv3 or Claude Opus 5.5); both spellings.*
- Q9 [page Q75]: Is "never a likeness" held in code? → Answered, recommended: by the brief, the record, and his look approval, with the enforcement that exists (FR-007): no new compositor rule. *Others: a compositor rule refusing a likeness for any avatar with a rig-table row; RA3 extended to every visitor avatar but one his approval names.*
  - The page's words for Q75, whole (added by verify-021 under page Q168; the reading above stays beside them):
    > Recommended: the brief, the record, and your look approval: FR-007 reworded to the enforcement that exists (brief and record say `likeness: false`; any likeness needs your approval in `assets/policy/approvals.json` under the arrival check's rule P); no new compositor rule
    >
    > Answered: recommended, the Author 2026-11-13 (the orders file's rule: "any new one: the recommended answer stands"; yours to confirm or overturn here).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The visitor who chose the dinosaur sees it in 3D (Priority: P1)

A visitor chooses the dinosaur on the choice screen. In the 3D room their figure is the modeled dinosaur, idling, at the figure's place, and it walks when they walk.

**Why this priority**: it is the item.

**Independent Test**: with a fixture dinosaur folder in a temporary tree (generated, not the asset), the compositor bundles it and the stage shows it for the `dinosaur` choice, plays `idle` and `walk`, and keeps the paper at the anchor; `vitest run` over the files named in tasks.md.

**Acceptance Scenarios**:
1. **Given** `assets/visitors/dinosaur/` holds a model, `idle` and `walk` clips, their records and a licence, **When** the room builds, **Then** the dinosaur's files are in the 3D part's avatars and `dist/a/`, and the choice screen is unchanged.
2. **Given** the dinosaur is chosen and ready, **When** the visitor walks, **Then** the walk clip plays weighted by speed and the figure turns to its heading (spec 009's FR-028), and spec 019's gait applies no leg motion, since the rig has no Mixamo leg bones (spec 019's FR-008: one `gait` `unavailable` signal).
3. **Given** the hand-off, **When** the dinosaur is the visitor, **Then** the paper stays at the hand anchor and no console error shows (FR-008).

### User Story 2 - Nothing changes until the model arrives (Priority: P1)

**Independent Test**: build on the line's tree (no dinosaur folder): the output is byte for byte as before; the local stack builds.

**Acceptance Scenarios**:
1. **Given** no files, **When** the room builds, **Then** the cut-out shows in both modes, the 3D room's note says `standin.avatar` for the dinosaur chosen, and the report lists no dinosaur.
2. **Given** a dinosaur whose files fail a check, **When** the build is lenient, **Then** it warns and shows the cut-out; **When** strict, **Then** it refuses with `<rule> <file>:<path>: <reason>`.

### User Story 3 - The studio makes it, and the intake checks it (Priority: P2)

A later studio task writes the brief, drives Blender and ComfyUI with the shipped records' tools and models only, and hands a candidate back; `line.py` and the arrival check judge it in at most three rounds.

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

- The model is longer or wider than the cut-out's box: RA11 (FR-004) refuses it strictly. Spec 004's Clarification "Where the visitor stands" records the question, in part: "The dinosaur hides 56% of the screen at every position from −0.4 to −0.6. Moving further left trades the monitor for the snowboard." → A: "Keep -0.5, move further left and give up the snowboard's clear view." Asked again on 2026-10-30, "Which one do you want?" → A: "Move further left". *Reading, beside his words:* he chose where the visitor stands from measures of the avatars' flat shapes, the dinosaur's 1.1 m wide and 1.2 m high; a model outside that box would hide more of the room than the measures he chose from, so RA11 holds the model to the box.
- A clip moves a bone the model lacks: RA2 already refuses it.
- The model's skin lacks a required rig bone (`Jaw`, say): RA10 (FR-005) refuses it. A humanoid `mixamorig:` skeleton is not required of it, nor forbidden; a bone named `<prefix>:Jaw` counts as `Jaw`, as `line.py`'s `has_bone` reads it.
- The walk: spec 019's gait finds no Mixamo leg bones and applies none (its FR-008); the dinosaur's own `walk` clip moves its legs.
- Reduced motion, pause, quality level 1: spec 009's FR-026 and FR-027 hold unchanged.
- A visitor who chose the dinosaur and falls to 2D: the flat cut-out, as today; the 2D room never shows `standin.avatar` (spec 014's FR-054).
- The record names a tool the brief doesn't: `line.py candidate` finds it. The record says `likeness: true` or a photo source: it needs his approval (FR-007), and without it the arrival check's rule P fails it and spec 020's RA9 keeps it out of the bundle.

## Requirements *(mandatory)*

### Functional Requirements

**The files and their checks**

- **FR-001**: THE DINOSAUR'S FILES SHALL be `assets/visitors/dinosaur/dinosaur.glb` (kind `avatar`) and `dinosaur-idle.glb`, `dinosaur-walk.glb`, `dinosaur-take.glb` (kind `animation`), recorded in the folder's `records.json` with `likeness: false`, and a `LICENSE.md` copied from the shipped avatars' (his answer), as spec 009's FR-009 has it. The room's code SHALL read them from the tree, and no test SHALL list them (spec 009's FR-043).
- **FR-002**: THE ROOM SHALL show the model WHERE it is recorded, readable, and within `main`'s caps for its kind, and SHALL otherwise show the cut-out, with the failure paths of spec 009's FR-002 to FR-007 unchanged.
- **FR-003** (RA12): FOR an avatar with a rig-table row (FR-005; today the dinosaur alone), `idle` AND `walk` SHALL be required: WHEN its folder has a model without them, or with one refused by RA1, RA2, or RA4, THE COMPOSITOR SHALL, strictly, refuse and, leniently, leave the model out, so the cut-out shows. An avatar whose row is `null` (woman, man, dog) is not checked.
- **FR-004** (RA11): FOR an avatar with a rig-table row, THE MODEL, scaled uniformly to its room height, `AVATAR_SHAPES[id].height` (1.2 m for the dinosaur; spec 009's FR-016 does that scaling; the height measured in the rest pose), SHALL measure at most `AVATAR_SHAPES[id].width` (1.1 m) along x and along z, with 5% slack: the cut-out's width in either direction, since it faces +z as every avatar does and turns when the visitor walks. A model too long for its height (a body, with its tail, over 1.1 m long at 1.2 m high) is refused strictly and left out, with a warning, leniently. An avatar whose row is `null` is not measured.
- **FR-005** (RA10): THE DINOSAUR'S SKELETON SHALL be the `dinosaur` rig of `contracts/dinosaur-rig.md`. THE CHECK SHALL be one rule over one rig table, `RIG_BONES` in `apps/web/build/room/avatars.ts`, keyed by avatar id: for an avatar with a row, each bone of the row SHALL be a raw node name of its model, or the end of one after a `:` (as `line.py`'s `has_bone` reads it); Mixamo's names SHALL NOT be required. The rows: `dinosaur` the contract's eighteen bones; `woman`, `man`, `dog` `null` (Q7). "An avatar with a rig-table row", here and in FR-003 and FR-004, means one whose row is not `null`.
- **FR-006**: THE ARRIVAL CHECK (`tools/gates/**`, the Author's) SHALL stay unchanged; RA10 to RA12 SHALL live in the compositor (`apps/web/build/room/avatars.ts`, beside RA1 to RA4 and spec 020's RA9), each in the catalogue (`checks/family.ts`), lenient as RA1 to RA4 are; the studio line's candidate check (`scripts/studio/line.py`) already reads bone names from a brief, so no human-only file is touched. The numbers follow the line's highest RA rule, RA9; if the line holds a higher one when impl-021 starts, impl-021 renumbers the three, in order, in every artifact.
- **FR-007**: THE DINOSAUR SHALL be an original character: no photo, no film or franchise creature, no logo or text (Q4). ITS BRIEF AND ITS RECORD SHALL say `likeness: false`, its source a prompt (like the shipped avatars'). No new rule enforces it (Q9): what holds it is what exists. A file recorded `likeness: true` or from a photo needs the Author's approval in `assets/policy/approvals.json` under the arrival check's rule P (`tools/gates/arrival_check.py`, main's gate), and, on the line, spec 020's RA9 keeps a visitor's likeness out of the bundle without that approval and its line. Whether the character is original is his look approval's judgement (FR-015).

**The code that brings it in**

- **FR-008**: WHERE the dinosaur has no hand bone, THE FIGURE SHALL leave the paper at the hand anchor (spec 009's FR-018) WITHOUT a console error or a failed load, and `take` (where present) SHALL play once in the hand-off; a missing or failed `take` is spec 009's FR-003 (the idle in its place). WHERE it has no Mixamo leg bones, spec 019's gait SHALL apply none (its FR-008) and the `walk` clip moves the legs.
- **FR-009**: THE FIGURE'S HEIGHT, ORIGIN, FACING, AND PLACEMENT SHALL stay as spec 009's FR-016 and FR-017 have them: the catalog entries, the camera's framing, the pick areas, and the walkable floor SHALL NOT change.
- **FR-010**: THE PLACEHOLDER NOTE SHALL keep spec 014's causes unchanged: WHILE the 3D room shows the visitor's chosen dinosaur as its flat shape, it SHALL say `standin.avatar` (spec 014's FR-054; the room's `figure` cause true), and WHEN the dinosaur's model shows, that cause SHALL go (`figure` false). `standin.note` (spec 014's FR-053) counts the room's pieces only and SHALL be untouched by this spec. No code is expected: spec 014's figure signal already does this for any avatar.
- **FR-011**: THE ROOM SHALL send no new event, make no model or gateway call, and fetch the dinosaur's files only for the visitor who chose it, after "Enter" (spec 009's FR-010, FR-021).
- **FR-012**: THE FIRST VISIT SHALL stay within F3's budget (`main`'s `first_visit_bytes.phase3`, 25,000,000) with the dinosaur at its brief's targets; the compositor's report SHALL list the dinosaur's bytes, triangles, and texture memory (spec 009's FR-040).

**The studio round and the intake**

- **FR-013**: THE DINOSAUR'S BRIEF (`contracts/dinosaur-brief.md`) SHALL name, in `tools`, exactly the fourteen IDs of `main`'s `studio-tools.json` that the shipped woman's and man's records use (Q8), each with `outputs_ship: true`, and its limits SHALL be at or under `main`'s caps (Q5). Its `notes` SHALL carry the prose constraints in full (FR-007, Q4, the shape of FR-004, the rig, the clips, the record). The studio round runs as a later studio task, never in this spec's session.
- **FR-014**: THE STUDIO SHALL install no node and download no weight; a tool it lacks goes on the decision page (spec 017's FR-030). Qwen-Image-2.1, FLUX [dev], and every tool marked `UNREVIEWED` are out.
- **FR-015**: THE AUTHOR'S LOOK APPROVAL SHALL come last and be his: the candidate comes in on an intake branch with its record; the intake commit and any `approvals.json` entry the gate wants are his hand. NO agent writes `assets/**` or `assets/policy/**` for it.

**Tests, docs, telemetry**

- **FR-016**: EVERY TASK SHALL name the small test files it adds or changes and those covering the files it changes, and run only those and `make lint` (the Author's rule 4). THIS ITEM SHALL NOT run the full suite: `make check` runs once, at the end of the stack, by the stack's last task.
- **FR-017**: THE DATA-FLOW DISCLOSURE SHALL gain no row: the dinosaur's files are static assets from the site's own origin and row V1 already names the avatar files (spec 009's FR-036); a one-sentence check that V1 still reads right is a task.
- **FR-018**: THE DASHBOARD'S "Visits whose avatar failed" panel (spec 009's FR-034) SHALL cover the dinosaur with no change; its description is checked, not edited.

### Key Entities

- **Dinosaur avatar**: model + clips + record in `assets/visitors/dinosaur/`, one of `AVATARS`.
- **Rig table**: `RIG_BONES`, avatar id → required bone names, or `null` (not checked); `dinosaur` the only row with bones.
- **Brief**: the studio line's request for the dinosaur (`contracts/dinosaur-brief.md`).

## Success Criteria *(mandatory)*

- **SC-001**: With a fixture dinosaur folder, the build's report lists it and `dist/a/` holds its files; with none, the build is byte for byte unchanged (US2).
- **SC-002**: RA10, RA11, RA12 each fail a fixture that breaks only that rule and pass the good fixture; woman and man, with no `walk` clip and any extent, get no finding from them.
- **SC-003**: The dinosaur's walk, idle, and `take` play in the stage's tests with no hand bone, no gait, and no console error.
- **SC-004**: `line.py brief` passes the dinosaur's brief on `main`'s list and fails it with one `outputs_ship: false` tool added; its `notes` hold "no film or franchise creature".
- **SC-005**: The first visit with the brief's targets is under F3's 25,000,000 bytes in the report.
- **SC-006**: No file under `.claude/**`, `tools/gates/**`, `corpus/**`, `assets/**`, or `assets/policy/**` is changed by an agent (`git diff --stat` shows none).

## Assumptions

- The studio line works as ADR 0053 and spec 017 describe, and `line.py` and `studio-tools.json` are on `main`. The studio round is a later task; if it fails three rounds, the dinosaur stays the cut-out and this spec's code stays correct (US2).
- The brief's tools are the fourteen IDs of Q8 (`contracts/dinosaur-brief.md` lists them); brief-dino-r1 reports the round-1 brief at `/srv/studio/briefs/dinosaur/1.json` names the same and passes `line.py brief`. This session can't read `/srv/studio`; impl-021's T008 tests the contract's copy, and the round's judge compares the two.
- No constitution control is deferred or dropped; no deviation to name.
- The visitor-avatar code (spec 009, 014, 016, 019, 020) is on the line and handles a model with no hand bone and no Mixamo leg; the plan's first task proves it with a test before relying on it.
- Spec 020 is already on the line (impl-020) and adds no rig check; this spec's table gives the dog a `null` row. Interface: `RIG_BONES: Readonly<Record<AvatarId, readonly string[] | null>>`.

## Expected Cost Impact

$0 cloud and $0 model-API spend: the models run on the local GPU through the studio; the cost is the Author's GPU time and dev-time model tokens for the spec and the implementation, order of $10. The first visit grows by the dinosaur's files only for visitors who choose it (about 3.9 MB at the targets, before gzip) and not at all for others.

## Degraded-Mode Behavior

No model, a failed file, a failed check, a failed decode, 2D mode, the floor: the cut-out (FR-002; spec 009's FR-002 to FR-007), with `standin.avatar` in the 3D room (FR-010). Kill switch or local tier off: no effect; the files are static (FR-011).

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

One, on the page as Q88: whether a later spec fills the dog's `null` row. Recommended: yes, a spec that names the dog's bones fills it. Answered: recommended, under the orders file's rule ("any new one: the recommended answer stands"). It blocks nothing here.

The page's words for Q88, whole (added by verify-021 under page Q168; the reading above stays beside them):

> Recommended: yes, the spec that names the dog's bones (ADR 0010: "with their bones listed in the rig's spec when the characters are made") fills its row, and RA10 to RA12 then apply to the dog too; nothing waits on it tonight
>
> Answered: recommended, the Author 2026-11-13 (the orders file's rule: "any new one: the recommended answer stands"; yours to confirm or overturn here).
