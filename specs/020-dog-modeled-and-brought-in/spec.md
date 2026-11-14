# Feature Specification: Dog Modeled and Brought In

**Feature Branch**: `night/spec-020/spec-020` (the night of 2026-11-13), from `main`; implementation later runs on one line, this branch merged first ([plan.md](plan.md) §6).

**Created**: 2026-11-14 (the night of 2026-11-13 to 11-14)

**Status**: Draft. Specified, clarified, planned, tasked, and analyzed in one night from the intent beside it ([`intent/020-dog-modeled-and-brought-in.md`](../../intent/020-dog-modeled-and-brought-in.md), draft until his answer on the decision page). The Author's order of 2026-11-13 gives approval ahead: the recommended answers are taken at clarify and at the plan, each provisional and his to confirm or overturn on the morning page (Clarifications; plan.md and tasks.md, top). Nothing merges before he approves.

**Reworked** 2026-11-14 on Opus 5.5 (the order's rule 6), after the review rv-spec-020 (blocking: B1 to B3, I1, I2), with the recommended answers of the decision page's Q67 to Q70, each "Answered: recommended, the Author 2026-11-13". What changed is listed under Clarifications, "Rework".

## The Author's words

His item, word for word:

> 3. d) "dog modeled and brought in". His dog's photos: `/srv/studio/briefs/dog/photos/`. His consent: "it's okay that we use the likeness of my dog".

From the same order: "I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog."

How far the night goes, in his words (2026-11-13): "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over".

The corpus says of the dog, in his words: "Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller." (`corpus/04-hobbies-and-travel.md`, `[A 2026-11-06]`). Nothing else about the dog is stated here; this spec adds no number, name, or trait that the corpus doesn't hold.

His item h, from the same order, word for word: h) "twin and dog running from dino".

**This spec's reading, beside his words:** "dog modeled and brought in" is two jobs: a studio round that models the dog from a concept image he makes from his photos (a later studio task; Clarifications Q2), and the code that brings the model into the room, with the flat shape standing in until he approves the model's look. "Brought in" is read as both the room's existing fourth avatar, "Dog" (spec 009), as the visitor's choice, and a figure in the room that item h's run uses; this spec makes the one model and its clips and shows it as the visitor's avatar, and spec 025 owns the room figure, its placement, and the run (Clarifications Q1). The rest of his order (the dinosaur, the chase, the HUD) is other specs'.

## Terms

As spec 009 uses them: **avatar** (woman, man, dinosaur, dog), **an avatar's files** (model `dog.glb`, clips `dog-<role>.glb`), **clip role** (`idle`, `idle-holding`, `take`, `walk`, and, from this spec, `run`), **the fallback** (the flat cut-out, `AVATAR_SHAPES.dog`), **ready**, **the compositor's RA family**. **The likeness model**: the dog's model, recorded `likeness: true` and `source.type: "photo"` (its clips `likeness: false`; FR-014). **The room's dog figure**: spec 025's figure in the room, which shows the same model and clips; not this spec's code. **The photos folder**: the studio's folder every Claude session is denied (`/srv/studio/photos/`; spec 003's FR-003; `docs/studio/photo-guide.md`). **The look approval**: his entry in main's `assets/policy/approvals.json` naming the model's SHA-256, with its disclosure line.

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

Wherever a figure shows the likeness model, the visitor's or the room's dog figure (spec 025), the room says what it is, in the line his approval carries, in the room's note as a text a screen reader reads.

**Why this priority**: Principle VIII, and the pattern spec 016 set for the twin's own avatar.

**Independent Test**: `text-copy` and bundle tests: the line appears in the copy only while some figure shows the dog's model (`dog-line.test.ts`; `likeness-line-anywhere.test.ts`, with a stand-in for spec 025's figure).

**Acceptance Scenarios**:
1. **Given** the visitor's dog shows, **Then** the line from the approval is in the room's note and in "Around the room" (FR-007).
2. **Given** the room's dog figure shows the model while the visitor chose another avatar, **Then** the same line, once (FR-007).
3. **Given** both show it, **Then** the line once; **Given** neither shows it (cut-outs, failures, or no figure), **Then** no line (FR-007).

### User Story 4 - The studio models the dog from his concept image (Priority: P2, a later studio task)

He moves his photos into the photos folder, makes a concept image from them there, reviews it, and puts it in the studio's inbox (his steps; plan §5 steps 0 and 1). Then a studio round, with only the tools and models of the list on main (`assets/policy/studio-tools.json`, P-7), makes the model and its clips from that concept image and hands them back for intake and his look approval. No Claude session reads a photo.

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
- **The visitor chose the dog and the room's dog figure shows too (spec 025):** two figures show one model; the line shows once (FR-007). Whether the room shows its dog figure beside a visitor who chose the dog is spec 025's.
- **A `run` clip and no `walk`, or the reverse:** the visitor's figure plays `walk` or the idle with the slide, never `run` (FR-005, FR-017); a missing `run` is spec 025's to fall back from.

## Requirements

### Functional Requirements

**Bringing it in**
- **FR-001**: WHEN the bundle holds the dog's model and the visitor chose the dog in the 3D room above the floor, THE VISITOR'S FIGURE SHALL show it in place of the cut-out once ready, scaled to the dog's height in the room's table (`AVATAR_SHAPES.dog`, 0.62 m; Clarifications Q5), lowest point on the floor, by spec 009's loader and driver, with no new loader and no new dependency.
- **FR-002**: A MODEL recorded `likeness: true` or from a photo in `assets/visitors/<id>/records.json` SHALL be bundled only WHERE main's `assets/policy/approvals.json` holds an entry naming its current SHA-256 whose `disclosure_line` is a non-empty string; its clips only WHERE their model is bundled. A strict build SHALL refuse with RA9 otherwise; a lenient build SHALL leave the folder's files out, the figure on its fallback. (Generalizes spec 016's RA6 from the twin to a visitor avatar's likeness; the twin's rule and RA3 stay as they are.)
- **FR-003**: THE COMPOSITOR SHALL NOT refuse a likeness model of a visitor avatar other than the twin's stand-in; RA3 stays: the stand-in is never a likeness.
- **FR-004**: THE DOG'S FILES SHALL follow spec 009's FR-009: `assets/visitors/dog/dog.glb` (kind `avatar`), `dog-idle.glb`, `dog-walk.glb`, and `dog-run.glb` (kind `animation`), recorded with their SHA-256, and read, capped, and counted by the RA family and RK3 as the other avatars' are, under main's caps (`per_asset.avatar`, `per_asset.animation`; first-visit bytes by the largest visitor character).
- **FR-005**: WHILE the visitor walks, THE DOG SHALL play `walk` where it has the clip and its idle with the slide otherwise (spec 009's FR-028). The `walk` clip SHALL have its root in place, so the walking view's pose moves the figure.
- **FR-006**: ANY FAILURE spec 009's FR-002 lists, or a clip naming a bone the model lacks, SHALL leave the cut-out (or the rest pose, for a missing idle), never a blank or frozen scene, and SHALL record `avatar_failed` once a visit as spec 009's FR-031 to FR-033 have it.
- **FR-007**: WHILE any figure in the room shows the likeness model, the visitor's figure or the room's dog figure (spec 025), THE ROOM SHALL show the approval's `disclosure_line` once, as text in the room's note and as a line of "Around the room"; the line is data from the approval, never in code (Clarifications Q3). Each figure that shows the model SHALL say so, and that it no longer does, through one shared input (plan R-02), which spec 025's figure uses as the visitor's does. WHILE no figure shows it (cut-outs, failures, no dog figure), no such line.
- **FR-008**: THE DOG HAS no hand bone, and holds no paper in its clips; the hand-off SHALL leave the paper at the figure's hand anchor (spec 009's FR-018), the dog in its idle (Clarifications Q4). No clip role for the hand-off (`idle-holding`, `take`).
- **FR-009**: THE CHOICE SCREEN SHALL stay as it is: four avatars, the flat previews, the name "Dog", nothing fetched before "Enter" (spec 009's FR-010). THE ROOM SHALL fetch the dog's files only when the visitor chose it.

**The studio round (a later task)**
- **FR-010**: THE ROUND SHALL use only the tools and models on main's `assets/policy/studio-tools.json` (P-7) with a reviewed license; an entry reading `UNREVIEWED` is not used. IF the likeness needs one not on the list, THEN the round SHALL stop and ask the Author, a new one being his to add.
- **FR-011**: NO CLAUDE SESSION, the studio's own included, SHALL read a photo of the dog, as spec 003's FR-003 (the sandbox denies agent sessions the studio's folders, the Author's photos among them) and the photo guide (`docs/studio/photo-guide.md`: "Every file a photo touches SHALL stay inside the photos folder, which, with the blinding key, every Claude session on the machine is denied, the studio's own included") have it (Clarifications Q2). Before any studio round for the dog, the Author moves the photos into the photos folder by the photo guide (human patch 020, item 1); the concept image is made from them there, by him, and only his reviewed concept image leaves it, into the studio's inbox (item 2). No brief, work order, task, or studio document SHALL name a photo's path; the studio round SHALL be queued only once the concept image is in the studio's inbox. Only the outputs come in, scrubbed (`scripts/assets/scrub.py`).
- **FR-012**: THE MODEL SHALL be a stylized, textured, rigged four-legged figure standing, head level, with a skeleton whose names the clips target; its clips `idle`, `walk`, and `run`, each with the root in place, at the file sizes of main's caps. `run` serves the room's dog figure (spec 025); this spec bundles and loads it and plays it nowhere.
- **FR-013**: THE FILES SHALL carry no place, no person, no screen, no logo or text from a photo; no photo is committed, nor its metadata (`nothing_locates`).
- **FR-014**: EACH RECORD SHALL be complete as spec 003's `contracts/asset-record.md` has it, each step, model, and tool with its license from the list. The model: `likeness: true`, `source.type: "photo"` (spec 003's data model §2: "true when the file shows the Author or derives from the Author's photos"). The clips, made in Blender on the model's rig from no photo: `likeness: false`, their source not a photo. Every credit of the dog's files SHALL say "a likeness of the Author's dog", never a likeness "of the Author": `assets/CREDITS.md`, rendered by `scripts/assets/credits.py`, says so for the model (Clarifications Q6). His consent is quoted in the intake note.

**Observation and degraded mode**
- **FR-015**: THE FEATURE SHALL add no usage event kind; spec 009's `avatar_failed` and the asset events cover it. The report's lines SHALL name the dog's files, bytes, texture memory, and whether the approval holds.
- **FR-016**: THE FEATURE SHALL send no byte off the visitor's device beyond the site's own origin: the data-flow disclosure is unchanged unless the check at plan §5 finds a row to add.

**The run clip (for spec 025)**
- **FR-017**: THE CLOSED LIST of an avatar's clip roles SHALL gain `run`, after `walk` (`dog-run.glb`, kind `animation`), read, capped, counted, and gated (RA9: only with its model) as the other clips are, and loaded only when its avatar's files are. THE VISITOR'S FIGURE SHALL never play `run`: walking plays `walk`, or the idle with the slide (FR-005). The loaded `run` clip SHALL be reachable by role on the figure's instance, for spec 025's room figure to play.

### Key Entities

- **The dog's folder**: `assets/visitors/dog/` with its `records.json`, as the man's and woman's.
- **The look approval**: his entry in main's `approvals.json` (kind `avatar`, `likeness_accepted: true`, a `disclosure_line`).
- **The likeness line**: `disclosure_line`, bundled with the dog's model, shown while any figure shows it.

## Success Criteria

- **SC-001**: With fixture files and a matching approval, the composed bundle holds the dog's files (model, `idle`, `walk`, `run`) and the line; with no approval, none (`avatars-compose.test.ts`; `likeness-visitor.test.ts`; `dog-run.test.ts`).
- **SC-002**: The dog's model, with its clips, stays within main's caps and the first visit under phase 3's 25,000,000 bytes. Met at intake by the compositor's RA4 (per-file caps) and RK5 (the first visit's bytes), which refuse a strict build otherwise, with the report's lines (FR-015) showing the figures; no test of this spec's stands in for the real files.
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

## Clarifications

### Session 2026-11-14 (taken under the Author's order of 2026-11-13, rule 1)

Each answer is the recommended one, taken, not answered by him: provisional, his to confirm or overturn on the morning page, with its other options kept. An overturned answer is reworked before he merges.

- Q1: What is "the dog"? → **Reworked** (the decision page's Q69, "Answered: recommended, the Author 2026-11-13"): both. The room's fourth visitor avatar, "Dog", gets the model of his dog, the choice screen, the name, and the flat preview staying; and the same model, with its clips `idle`, `walk`, and `run`, is the room's dog figure that item h's run uses (option C). This spec makes the one model, holds it to his look approval (RA9), shows it as the visitor's avatar, bundles and loads `run`, and shows the likeness line wherever the model shows; spec 025 owns the room figure, its placement, and the run. Reading: his item d is "dog modeled and brought in", and his item h, word for word, is h) "twin and dog running from dino"; spec 025 (on its branch, `night/spec-025/spec-025`) assumes, in its A020: "a dog figure exists in the scene's `figures` block with a driver of the same `FigureDriver` shape, clip roles `idle`, `walk`, `run`, a home placement, and a footprint radius; it is `null` while its model isn't showing." Intent 000's placeholders were "to be replaced with final characters later", and spec 009 built that path. The first take, option A (the visitor's avatar only), left spec 025's dog with no clips to run. Others: (A) the visitor's avatar only, spec 025 reworked with no dog in the chase; (B) a room figure only, the choice screen's dog staying the flat cut-out. (FR-001, FR-007, FR-009, FR-012, FR-017.)
- Q2: Who handles the photos? → **Reworked** (the decision page's Q67 and Q68, each "Answered: recommended, the Author 2026-11-13"): no Claude session reads a photo, the studio's included. He moves the photos into the photos folder by the photo guide; he queues the concept image from them there (the local FLUX.2 klein 4B in his ComfyUI, inside the photos folder) and reviews it; the studio works from the reviewed concept image in its inbox, so its round starts at plan §5's step 2 and is queued only once that image is there (option A). Reading: spec 003's FR-003 has the sandbox deny agent sessions the studio's folders, the Author's photos among them, and the photo guide says "Every file a photo touches SHALL stay inside the photos folder, which, with the blinding key, every Claude session on the machine is denied, the studio's own included". His consent is to "the likeness of my dog", which a model from his concept image is. **Option B's evidence**, his words: "provide you photos of my dog to model", and his item's "His dog's photos: `/srv/studio/briefs/dog/photos/`". **What B needs**: his patch lifting the deny for these photos (`.claude/settings.json` and the sandbox lists, `tools/gates/studio-folders.txt`), a data-flow disclosure line for photos reaching Anthropic, and the deviation from spec 003's FR-003 named here; until then B is not taken, because a photo read into a session can't be taken back. The decision page's Q51 (the studio reads the photos) is reopened by Q68 and not acted on. Others: (B) as above; (C) the model from the breed and a prompt alone, no photo, a less true likeness. (FR-011; human patch 020, items 1 and 2.)
- Q3: How does the room say it is his dog's likeness? → Taken, not answered: the disclosure line is the one his approval carries (`disclosure_line`), bundled with the model and shown in the room's note and "Around the room" while the dog model shows (option A). The session proposes, as a draft for him to rewrite: "The dog is an AI-made, stylized likeness of the Author's dog, shown by his choice." (modeled on the twin's line). Reading: Principle VIII, and spec 016's pattern; the line is his data, not code. On a no (option B): no line, since a dog is not a person; (option C): the line on the choice screen only. (FR-002, FR-007.)
- Q4: What does the dog do at the paper hand-off? → Taken, not answered: nothing new: it has no hand bone, the paper stays at the figure's hand anchor, the dog plays its idle; no hand-off clip (`idle-holding`, `take`); its clips are `idle`, `walk`, and, since Q1's rework, `run` for spec 025 (option A). Reading: spec 009's FR-018 and its edge case for "the dog's and the dinosaur's rigs, when they come" already say this. On a no (option B): a `take` clip with the paper in the mouth, a new clip role and a grip point, which is code through the lifecycle. (FR-008.)
- Q5: How big is it? → Taken, not answered: the table's 0.62 m, unchanged, the model scaled to it (option A). Reading: no number about the dog is in the corpus; the 2D room, the framing, and spec 004's checks read that table, so nothing moves. On a no (option B): he gives a height, a one-line data edit. (FR-001.)

### Rework 2026-11-14 (rv-spec-020, on Opus 5.5; the order's rule 6)

- Q6: How are the dog's files recorded, and what does their credit say? → Taken (the decision page's Q70, "Answered: recommended, the Author 2026-11-13"): the model `likeness: true`, `source.type: "photo"` (spec 003's data model §2, with REVIEW.md's C5 read as about room files); the clips, made in Blender from no photo, `likeness: false`; any credit says "a likeness of the Author's dog", never "of the Author". Others: every dog file `likeness: false` with `source.type: "photo"` (C5's literal reading; RA9 and the arrival check's rule P still gate it by its photo source); every file `likeness: true`, as plan §4 had it. (FR-014; plan R-08.)
- What changed, by finding: **B1** the photos' folder is outside the deny (Assumptions, "The photos"); FR-011 and the analysis's A7 cite spec 003's FR-003 and the photo guide; human patch 020 opens with his move of the photos; no brief names a photo path (plan §5, T011). **B2** Q1 (both), FR-007 (the line wherever the model shows), FR-012, D3, plan §5 step 3 and R-03 (`idle`, `walk`, `run`), FR-017. **B3** Q2 (option B's evidence and what B needs); the studio round starts at plan §5's step 2, queued once his concept image is in the studio's inbox; human patch 020 numbers the concept step. **I1** Q6, FR-014, Assumptions (C5). **I2** SC-002, met by RA4 and RK5 at intake.

## Assumptions

- **Defaults taken** (his to overturn with the questions): **D1** the avatar keeps the name "Dog" in the room; the corpus gives the dog's name, naming it is his. **D2** the choice screen's flat preview is the generic shape, unchanged. **D3** clips are `idle`, `walk`, and `run`; `run` joins the closed list for spec 025's room figure (FR-017, Q1's rework); no `idle-holding` or `take`. **D4** the code path is spec 009's and spec 016's, extended by one check (RA9) and one copy line; no new endpoint, route, event, or dependency. **D5** the studio round, the intake of its files into `assets/visitors/dog/`, and the approval entry are not this spec's code (`docs/merge-requests/human-patches/020.md`).
- **Deviations named** (Constitution; CLAUDE.md): spec 003's FR-017 reads "THE VISITOR AVATARS SHALL be original characters that resemble no real person". A dog is not a person and he consents ("it's okay that we use the likeness of my dog"), so the rule is not broken, but its reading is stretched: the dog is a likeness, so it takes the likeness path (FR-002) the twin's own avatar took. No control is deferred or dropped.
- **A conflict named, REVIEW.md's C5** (human-only; not edited): REVIEW.md's arriving-assets pass says "`likeness` is true only when the file shows the Author (Amendment C5)", and spec 003's data model §2 says `likeness` is "true when the file shows the Author or derives from the Author's photos". The dog's model derives from his photos and doesn't show him, so the two disagree on it. Taken (Q6): the data model's reading, `likeness: true` for the model, with C5 read as about room files, where its amendment sits (spec 004's Amendment C5, the arrival check's `likeness_accepted: "not_applicable"` for a room file). A reviewer reading C5 literally will flag the record; the merge-request note names this. Whether C5's words should say so is his (human patch 020, item 7).
- **The studio line** (ADR 0053): the tools list on main governs; as of this writing the reviewed image and 3D models are FLUX.2 klein 4B (base, VAE, Qwen3-4B text encoder), Pixal3D int8 with DINOv3 and MoGe-2, TRELLIS.2's VAEs, BiRefNet, Blender 5.2.3 with its glTF exporter, and ComfyUI 0.42.5; the PuLID, TripoSR, GGUF, and Manager nodes and the Qwen-Image and FLUX.1 dev weights read `UNREVIEWED` and stay unused. Whether the listed tools can produce a likeness from photos is the round's question; if not, FR-010 stops it.
- **The photos**: the folder his order names, `/srv/studio/briefs/dog/photos/`, is **outside the photo deny**: `.claude/settings.json` and `tools/gates/studio-folders.txt` deny `/srv/studio/photos/`, `outputs/`, `workflows/`, and `key/`, not `briefs/`. And `/srv/studio/briefs/` is mounted into four session kinds of the night shift (main's `deploy/night-shift/containers/`): the implementer's and ops' read-write, the studio's and the supervisor's read-only. Spec 003's FR-003 asks that the deny be in place before the first photo is staged on the machine agent sessions run on; with the photos in `briefs/`, it isn't, for them. So, before any studio round for the dog, he moves them into the photos folder by the photo guide, deletes the copy under `briefs/`, and says whether any session read them (human patch 020, item 1; the decision page's Q67). The spec-writers of this spec read none, and its rework opened no photo; brief-dog-r1 says it didn't open the folder (Q67). Nothing here is drawn from them.
- **Not this spec**: the dinosaur's model (item e), the twin's walking legs (item c), the chase (item h: spec 025 owns the room's dog figure, its placement, and when `run` plays), the corpus, the resume. This spec gives spec 025 the model, its `run` clip loaded by role, and the shared input that shows the likeness line (FR-007, FR-017).
