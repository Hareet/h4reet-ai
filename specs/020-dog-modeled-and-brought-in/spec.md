# Feature Specification: Dog Modeled and Brought In

**Feature Branch**: `night/spec-020/spec-020` (the night of 2026-11-13), from `main`; implementation later runs on one line, this branch merged first ([plan.md](plan.md) §6).

**Created**: 2026-11-14 (the night of 2026-11-13 to 11-14)

**Status**: Draft. Specified, clarified, planned, tasked, and analyzed in one night from the intent beside it ([`intent/020-dog-modeled-and-brought-in.md`](../../intent/020-dog-modeled-and-brought-in.md), draft until his answer on the decision page). The Author's order of 2026-11-13 gives approval ahead: the recommended answers are taken at clarify and at the plan, each provisional and his to confirm or overturn on the morning page (Clarifications; plan.md and tasks.md, top). Nothing merges before he approves.

## The Author's words

His item, word for word:

> 3. d) "dog modeled and brought in". His dog's photos: `/srv/studio/briefs/dog/photos/`. His consent: "it's okay that we use the likeness of my dog".

From the same order: "I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog."

How far the night goes, in his words (2026-11-13): "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over".

The corpus says of the dog, in his words: "Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller." (`corpus/04-hobbies-and-travel.md`, `[A 2026-11-06]`). Nothing else about the dog is stated here; this spec adds no number, name, or trait that the corpus doesn't hold.

**This spec's reading, beside his words:** "dog modeled and brought in" is two jobs: a studio round that models the dog from his photos (a later studio task), and the code that brings the model into the room, with the flat shape standing in until he approves the model's look. "Brought in" is read as the room's existing fourth avatar, "Dog" (spec 009), as the visitor's choice (Clarifications Q1); the day-to-day rest of his order (the dinosaur, the chase, the HUD) is other specs'.

## Terms

As spec 009 uses them: **avatar** (woman, man, dinosaur, dog), **an avatar's files** (model `dog.glb`, clips `dog-<role>.glb`), **clip role** (`idle`, `idle-holding`, `take`, `walk`), **the fallback** (the flat cut-out, `AVATAR_SHAPES.dog`), **ready**, **the compositor's RA family**. **The likeness model**: the dog's model recorded `likeness: true`, from a photo. **The look approval**: his entry in main's `assets/policy/approvals.json` naming the model's SHA-256, with its disclosure line.

## User Scenarios & Testing

### User Story 1 - A visitor who chooses the dog sees the dog (Priority: P1)

A visitor on the choice screen takes "Dog", enters, and in the 3D room their figure is the modeled dog, standing at the visitor's place at the dog's height, idling, and walking (four-legged gait) when they walk.

**Why this priority**: it is the item. Everything else serves it.

**Independent Test**: compose a fixture tree with a `dog` folder (model, idle, walk) and an approval; the bundle holds the dog's files; the room, on the fake stage, shows the dog's instance in place of the cut-out and plays `walk` while walking (`avatars-compose.test.ts`, `avatar-scene.test.ts`).

**Acceptance Scenarios**:
1. **Given** an approved dog model and idle in the bundle and a 3D room above the floor, **When** the visitor chose the dog, **Then** the figure shows the model scaled to the dog's table height, lowest point on the floor, facing +z, once ready (FR-001, FR-004).
2. **Given** the dog walks, **When** a `walk` clip exists, **Then** it plays; **When** it doesn't, **Then** the idle plays and the figure slides, as spec 009's FR-028 has it (FR-005).
3. **Given** the dog's files fail in any way spec 009's FR-002 lists, **Then** the cut-out stays, nothing blanks, and `avatar_failed` is recorded as for any avatar (FR-006).

### User Story 2 - Until he approves it, the room shows the cut-out (Priority: P1)

A build with the dog's files but no look approval of the model's SHA-256 bundles nothing of the dog. The room is as today.

**Why this priority**: his look approval of each asset is his alone (order, rule 2), and a likeness model is never published unapproved.

**Independent Test**: the compose test with the folder and no approval, then with an approval with an empty line, then with a matching one (`avatars-compose.test.ts`).

**Acceptance Scenarios**:
1. **Given** a likeness model with no approval, **Then** a strict build refuses (RA9) and a lenient build leaves the dog's files out; the dog is the cut-out (FR-002).
2. **Given** an approval whose `disclosure_line` is empty or null, **Then** the same (FR-002).
3. **Given** the model's bytes change after the approval, **Then** the SHA-256 no longer matches and the same (FR-002).

### User Story 3 - The visitor is told, in the Author's words, whose dog it is (Priority: P2)

Where the figure shows the likeness model, the room says what it is, in the line his approval carries, in the room's note as a text a screen reader reads.

**Why this priority**: Principle VIII, and the pattern spec 016 set for the twin's own avatar.

**Independent Test**: `text-copy` and bundle tests: the line appears in the copy only when the bundle holds the dog's model and the visitor chose it.

**Acceptance Scenarios**:
1. **Given** the dog shows, **Then** the line from the approval is in the room's note and in "Around the room" (FR-007).
2. **Given** the cut-out shows, **Then** no line (FR-007).

### User Story 4 - The studio models the dog from his photos (Priority: P2, a later studio task)

A studio round, with only the tools and models of the list on main (`assets/policy/studio-tools.json`, P-7), makes the model and its clips and hands them back for intake and his look approval.

**Why this priority**: without it US1 has nothing to show. It is a separate task, outside this spec's code, and may be late; US1 to US3 are built and tested with fixtures before it.

**Independent Test**: the intake's arrival check (`tools/gates/arrival_check.py`) and the compose's RA family accept the files (FR-010 to FR-014); his look approval is the final test.

**Acceptance Scenarios**: see FR-010 to FR-014.

### Edge Cases

- **No dog folder, or only a model with no idle:** as spec 009's FR-003: the cut-out when no model; a model with no idle stands in its rest pose (FR-001, FR-006).
- **No hand bones:** the paper stays at the figure's hand anchor, as spec 009's FR-018 has it for a rig with no hand bone (FR-008).
- **The visitor also is the stand-in:** the twin's stand-in is the man (spec 009's Q1); not the dog. Nothing changes (FR-009).
- **A quadruped's rest pose measured by the loader:** its height is the standing height, not the tail's or the head's if raised; the studio's model holds the rest pose standing, head level (FR-012).
- **The photos hold a place, a person, or a screen:** the model carries none of it; the look approval's `nothing_locates` confirms it (FR-013).
- **Below the floor, 2D room, lost context:** spec 009's FR-004 to FR-006 hold unchanged: no dog file fetched, the cut-out shown.
- **Reduced motion:** no walk clip advances; the idle's first frame shows, as spec 009's R-07 has it.

## Requirements

### Functional Requirements

**Bringing it in**
- **FR-001**: WHEN the bundle holds the dog's model and the visitor chose the dog in the 3D room above the floor, THE VISITOR'S FIGURE SHALL show it in place of the cut-out once ready, scaled to the dog's height in the room's table (`AVATAR_SHAPES.dog`, 0.62 m; Clarifications Q5), lowest point on the floor, by spec 009's loader and driver, with no new loader and no new dependency.
- **FR-002**: A MODEL recorded `likeness: true` or from a photo in `assets/visitors/<id>/records.json` SHALL be bundled only WHERE main's `assets/policy/approvals.json` holds an entry naming its current SHA-256 whose `disclosure_line` is a non-empty string; its clips only WHERE their model is bundled. A strict build SHALL refuse with RA9 otherwise; a lenient build SHALL leave the folder's files out, the figure on its fallback. (Generalizes spec 016's RA6 from the twin to a visitor avatar's likeness; the twin's rule and RA3 stay as they are.)
- **FR-003**: THE COMPOSITOR SHALL NOT refuse a likeness model of a visitor avatar other than the twin's stand-in; RA3 stays: the stand-in is never a likeness.
- **FR-004**: THE DOG'S FILES SHALL follow spec 009's FR-009: `assets/visitors/dog/dog.glb` (kind `avatar`), `dog-idle.glb` and `dog-walk.glb` (kind `animation`), recorded with their SHA-256, and read, capped, and counted by the RA family and RK3 as the other avatars' are, under main's caps (`per_asset.avatar`, `per_asset.animation`; first-visit bytes by the largest visitor character).
- **FR-005**: WHILE the visitor walks, THE DOG SHALL play `walk` where it has the clip and its idle with the slide otherwise (spec 009's FR-028). The `walk` clip SHALL have its root in place, so the walking view's pose moves the figure.
- **FR-006**: ANY FAILURE spec 009's FR-002 lists, or a clip naming a bone the model lacks, SHALL leave the cut-out (or the rest pose, for a missing idle), never a blank or frozen scene, and SHALL record `avatar_failed` once a visit as spec 009's FR-031 to FR-033 have it.
- **FR-007**: WHILE the figure shows the likeness model, THE ROOM SHALL show the approval's `disclosure_line` as text in the room's note and as a line of "Around the room"; the line is data from the approval, never in code (Clarifications Q3). WHILE the cut-out shows, no such line.
- **FR-008**: THE DOG HAS no hand bone, and holds no paper in its clips; the hand-off SHALL leave the paper at the figure's hand anchor (spec 009's FR-018), the dog in its idle (Clarifications Q4). No new clip role.
- **FR-009**: THE CHOICE SCREEN SHALL stay as it is: four avatars, the flat previews, the name "Dog", nothing fetched before "Enter" (spec 009's FR-010). THE ROOM SHALL fetch the dog's files only when the visitor chose it.

**The studio round (a later task)**
- **FR-010**: THE ROUND SHALL use only the tools and models on main's `assets/policy/studio-tools.json` (P-7) with a reviewed license; an entry reading `UNREVIEWED` is not used. IF the likeness needs one not on the list, THEN the round SHALL stop and ask the Author, a new one being his to add.
- **FR-011**: EVERY FILE a photo touches SHALL stay inside the photos folder as the studio's rules have it (spec 003 FR-025 and FR-026; `docs/studio/photo-guide.md`), and no session of this repository's agents SHALL read a photo (Clarifications Q2). Only the outputs come in, scrubbed (`scripts/assets/scrub.py`).
- **FR-012**: THE MODEL SHALL be a stylized, textured, rigged four-legged figure standing, head level, with a skeleton whose names the clips target; its clips `idle` and `walk` with the root in place, at the file sizes of main's caps.
- **FR-013**: THE FILES SHALL carry no place, no person, no screen, no logo or text from a photo; no photo is committed, nor its metadata (`nothing_locates`).
- **FR-014**: EACH RECORD SHALL be complete as spec 003's `contracts/asset-record.md` has it: `likeness: true`, `source.type: photo`, each step, model, and tool with its license from the list. His consent is quoted in the intake note.

**Observation and degraded mode**
- **FR-015**: THE FEATURE SHALL add no usage event kind; spec 009's `avatar_failed` and the asset events cover it. The report's lines SHALL name the dog's files, bytes, texture memory, and whether the approval holds.
- **FR-016**: THE FEATURE SHALL send no byte off the visitor's device beyond the site's own origin: the data-flow disclosure is unchanged unless the check at plan §5 finds a row to add.

### Key Entities

- **The dog's folder**: `assets/visitors/dog/` with its `records.json`, as the man's and woman's.
- **The look approval**: his entry in main's `approvals.json` (kind `avatar`, `likeness_accepted: true`, a `disclosure_line`).
- **The likeness line**: `disclosure_line`, bundled with the dog's model.

## Success Criteria

- **SC-001**: With fixture files and a matching approval, the composed bundle holds the dog's three files and the line; with no approval, none (`avatars-compose.test.ts`; `likeness-visitor.test.ts`).
- **SC-002**: The dog's model, with its clips, stays within main's caps and the first visit under phase 3's 25,000,000 bytes (RK5), as the report shows.
- **SC-003**: A visit with the dog's files failing in each way of spec 009's FR-002 ends with the cut-out and one `avatar_failed` (`avatar-loader.test.ts`).
- **SC-004**: The Author's look approval of the model is on main, or the cut-out stays; either is a passing state of the build.
- **SC-005**: Frame rate holds spec 002's FR-048 (30 a second on the reference phone) with the dog; the Author's phone run judges it.

## Cost estimate

Cloud: none (static files, no model call). Dev-time model spend: one spec-writer session, one implementer session for roughly seven small tasks, one review; order of a few dollars on the Team plan, outside the production budget. Studio: his GPU. The first-visit bytes are bounded by the largest visitor character, so the dog adds none while it is not the largest.

## Degraded mode

The cut-out, exactly as today. The dog needs no model call, no gateway, no local tier: with the local tier off, the budget spent, or the kill switch `degraded` or unknown, the room loads and shows it as at any other time (spec 009's FR-001).

## Telemetry, dashboard, disclosure

- **Span/event**: none new; the room's existing `avatar_failed` and spec 003's asset events.
- **Dashboard panel**: none new; the "Room" row's "Visits whose avatar failed" covers it.
- **Data-flow disclosure**: no new byte leaves the visitor's device; the file is the site's own static asset. Entry D1's sentence on the Author's AI-made likeness reaching Anthropic when a session reads one applies to the dog's model; plan §5 checks whether it needs a line in `docs/data-flow-disclosure.md`.
