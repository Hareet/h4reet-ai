# Feature Specification: The Twin Pets the Dog, and the Dog-Intro Conversation

**Feature Branch**: `night/spec-026/spec-026`, cut from `main` at 3c0e4cd0. Implementation later runs on one line after item h (spec 025); the implementer merges this branch first ([plan.md](plan.md) §9).

**Created**: 2026-11-14 (the night of 2026-11-13)

**Status**: Draft. Specified, clarified, planned, tasked, and analyzed in one night from the draft intent ([`intent/026-twin-pets-dog.md`](../../intent/026-twin-pets-dog.md)). Approved provisionally by the Author's order of 2026-11-13 (plan.md, tasks.md). Eight clarification questions took their recommended answers, each provisional and his to confirm or overturn on the morning page. Nothing under `corpus/` is written by this spec or its build: the corpus half is a proposal and a patch for his hand.

**Input**: the intent; the [constitution](../../.specify/memory/constitution.md); `CLAUDE.md`; `corpus/README.md`, `corpus/04-hobbies-and-travel.md`, `corpus/facts/hobbies-and-travel.yaml`, `corpus/facts/denver-local-ai.yaml` (the shape of an open slot); `config/twin-readiness.yaml`; [spec 016](../016-the-twins-own-avatar/spec.md) and its [twin-states contract](../016-the-twins-own-avatar/contracts/twin-states.md); [spec 004](../004-room-composition/spec.md) (selectables, topics, leads, FR-036 to FR-038); [spec 008](../008-visitor-movement/spec.md) (the floor, `step`/`slide`, the targeting); code read at `main`: `apps/web/src/room/scene/twin-states.ts`, `src/talk/talk.ts` (`topicSelected`), `src/room/app.ts`, `scene/bundle3d.ts` (`memberDraws`), `services/gateway/src/twin/prompt.ts`, `grounding.ts`, `pack.ts`, `apps/web/room/scene.yaml`, `room/topics.yaml`, `room/catalog/dog-sign.yaml`, `assets/twin/records.json`, `assets/policy/approvals.json`. Read on their branches (not on this one): spec 020 as reworked (`night/rework-spec-020/rework-spec-020`), spec 025 (`night/spec-025/spec-025`), spec 019 as reworked (`night/rework-spec-019/rework-spec-019`), and spec 022 (`night/spec-022/spec-022`, for the form of a corpus proposal).

Summary: when the visitor selects the dog (the desk sign "my dog thinks i'm cool", or the room's dog figure where it shows), the twin opens a conversation about the dog, from the corpus, and, where both figures show, the dog walks to the twin's side and the twin pets it. Until the studio's petting clip passes his look approval, the twin's arm reaches by code over its idle. The corpus half is a proposal for his hand: a line saying the room's dog is a likeness, with his consent in his words; an open slot for which of his dogs it is; one Golden Q&A whose answer is his to write; and one "Do not claim" line. Everything that changes the hobbies-and-travel topic's hash travels in one patch, so the topic closes once and he evaluates once.

## Clarifications

### Session 2026-11-14, taken under the Author's order of 2026-11-13

The order's rule 1: "For each item, the spec-writer takes the recommended answer at clarify and at the plan". Each answer below is the recommended one, taken, not answered by him: provisional, his to confirm or overturn on the morning page, with its other options kept. An overturned answer is reworked before he merges. Each is also in `/night/io/out/questions.md`.

- **Q1: What starts the petting?** → Taken: **the dog-intro**. When the visitor selects the dog and the twin opens the dog's conversation, the dog comes to the twin's side and the twin pets it once, while the opening is on its way (option A). Others: (B) ambient: while the twin rests and the dog is at home near it, the twin pets it from time to time; (C) both. Reading: his item puts the two together, "twin petting do gand dog-intro conversation corpus"; tying the petting to the intro gives the visitor a reason to see it and keeps the room's motion to what the visitor asked for. (FR-001, FR-002.)
- **Q2: What does the twin do before the studio's petting clip exists?** → Taken: **a reach by code, as the stand-in**. Over the twin's idle, a small layer turns the three bones of the arm on the dog's side (two-bone reach) and leans the spine toward the dog's head, strokes, and withdraws; a studio `petting` clip, once his look approval names it, plays by its role in place of the reach (option A). Others: (B) no arm motion: the twin turns toward the dog, and the room's live region says it pets the dog; (C) nothing until the clip. Reading: spec 019 set the pattern, a code layer now and a studio clip taking precedence where one arrives; the brief says "code and animation with stand-ins until a studio clip passes his look approval". (FR-005 to FR-008.)
- **Q3: How does the dog get to the twin?** → Taken: **it walks to a pet spot beside the twin's place** (scene data, in the twin's frame), by spec 025's figure movement on the walkable floor, and walks home afterwards; the run from the dinosaur outranks it (option A). Others: (B) spec 025 places the dog's home beside the twin, so it never walks for the petting; (C) the twin walks to the dog. Reading: spec 025 owns the dog's room figure and its placement (his answer to the decision page's Q69, "both"); this spec asks the figure to go somewhere and come back, and owns nothing else of it. (FR-003, FR-004, FR-011.)
- **Q4: What opens the dog-intro conversation?** → Taken: **a new selectable, `dog`, named "Dog"**: its member is the desk sign "my dog thinks i'm cool" (always in the room, in 2D too), and in 3D the room's dog figure, while it shows and stands, is a pick target for the same selectable. It opens the hobbies-and-travel topic, where the corpus's "## Arya" section is, with a lead (option A). Others: (B) the sign only, no figure pick; (C) a new topic with its own corpus file. Reading: the corpus's own interview question is "The sign in the room says "my dog thinks i'm cool." Tell me about your dog." (`corpus/intake/interview-2026-11-06-hobbies-mission-work.md`); a new topic would need a new corpus file, the room's topic list, and a readiness entry of his. (FR-013 to FR-016.)
- **Q5: Which dog is the room's dog?** → Taken: **an open slot, his to fill**. The proposal adds `hobbies.room_dog_name`, every field null (as `dlai.co_owner_name` is), so the twin says nothing of it until he fills it. The corpus names one dog of his, in his words: "Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller." (`corpus/04-hobbies-and-travel.md`). The recommended fill is "Arya", but no worker writes it (option A). Others: (B) he fills it in the same patch; (C) the corpus never names the room's dog. Reading: his order says "photos of my dog" and "the likeness of my dog"; whether that dog is Arya is his to say, and the brief asks for "an open slot for anything only he knows (such as the dog's name), never a filled-in guess". (FR-018.)
- **Q6: What does the corpus proposal hold?** → Taken: **three things, in `04-hobbies-and-travel.md` and its facts file** (option A): (1) under "## Arya", one line with his consent in his words, "it's okay that we use the likeness of my dog", and the line his look approval of the dog's model carries (spec 020's `disclosure_line`), quoted verbatim once he has written it, with the open slot; (2) Golden Q&A 9, *Who's the dog in the room?*, whose answer is his to write (recommended: the disclosure line, then his Golden Q&A 5 answer's first two sentences, verbatim, if he fills the slot with "Arya"); (3) one "Do not claim" line: that the dog in the room is a real dog, a photo, or a recording. Others: (B) the Golden Q&A only; (C) no corpus change: the "## Arya" section as it stands grounds the intro. Reading: Principle VIII asks that the likeness be said as one; Golden answers are his words, so none is written for him. (FR-017 to FR-021.)
- **Q7: One patch, one evaluation?** → Taken: **one human patch** carries everything that moves the hobbies-and-travel topic's hash: the corpus lines and the slot, the `dog` selectable's scene data, and what they regenerate (`config/twin/corpus.json`, `config/room-topics.yaml`, `config/room-events.yaml`, the twin's evaluation cases). He applies it after his look approval of the dog's model, so the topic closes once and he re-runs his evaluations once (option A). The code for the selectable and the petting merges on the line, tested on fixtures, with no `dog` selectable in the room's data. Others: (B) the selectable's scene data merges on the line now, closing the topic on merge, before the corpus; (C) two patches, two evaluations. Reading: `config/twin-readiness.yaml` (his file) says "a change to either hash closes the topic until the Author re-runs his evaluations and marks the new hashes", and the topic's hash covers its selectables (`services/gateway/src/twin/pack.ts`); his words: "keep merging down to as few patches and gates as we've seen the difficulty there". (FR-016, FR-022.)
- **Q8: When the visitor chose the dog as their avatar, does the twin pet the visitor?** → Taken: **no**. The twin pets only the room's dog figure; the visitor's figure, camera, and controls are untouched (option A). Others: (B) the twin pets the visitor's dog when it stands within reach. Reading: his item says "dog-intro"; the visitor's avatar is the visitor, not the dog being introduced. (FR-012.)

## Source: The Author's Words

- **His item**, his own words being the quoted letter and title as his orders file lists it: f) "twin petting do gand dog-intro conversation corpus". The orders file's own words, not his: "The petting is an animation and behaviour item that needs the dog (d). The dog-intro conversation is corpus, so it arrives as proposals in `corpus/proposals/`, for his hand." Reading: "do gand" is read as "dog and"; Q1 to Q8 above.
- **His consent**, from his order of 2026-11-13: "provide you photos of my dog to model and it's okay that we use the likeness of my dog".
- **How far the night goes**, his: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". Reading: one human patch (Q7); small tests by file (plan §6).
- **What the corpus holds about his dog**, all of it his words of 2026-11-06 (`corpus/04-hobbies-and-travel.md`, "## Arya" and Golden Q&A 5 and 6, the slots `hobbies.arya_age` and `hobbies.cabin_tollers`). This spec states nothing about the Author or his dog beyond them and his words above.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Twin Pets the Dog (Priority: P1)

As a visitor in the 3D room, when I select the dog, I see the dog come to the twin, and the twin pet it.

**Why this priority**: the first half of the item.

**Independent Test**: `vitest run apps/web/test/room/pet-director.test.ts apps/web/test/room/pet-reach.test.ts`, on numbers, with fake figures, a fake floor, the room's fake clock, and the twin's and the man's real rigs read in Node (no WebGL); then the Author's look.

**Acceptance Scenarios**:

1. **Given** both figures show their models, the dog at home, motion allowed, **When** the visitor selects the dog, **Then** the dog walks to the pet spot, faces the twin, and idles; the twin turns toward it and enters `petting`; the twin's hand on the dog's side reaches the dog's head, strokes, and withdraws; the dog walks home; the twin turns back to its place's facing.
2. **Given** an approved `petting` clip in the bundle, **When** the petting starts, **Then** the clip plays once and the reach layer stays off.
3. **Given** no `petting` clip, **When** the petting starts, **Then** the idle plays and the reach layer moves only the three bones of the arm on the dog's side and the spine's three, and every bone is the clip's own again within 0.5 s of the end.
4. **Given** an answer arrives during the petting, **When** the petting ends, **Then** the talking clip plays for what is left of the answer's speaking time; the panel showed the answer when it came.

---

### User Story 2 - Nothing Breaks When a Piece Is Missing (Priority: P1)

As a visitor, I want the room to work whatever happens to the dog, the twin's model, the clip, or the dinosaur.

**Independent Test**: `vitest run apps/web/test/room/pet-degraded.test.ts`.

**Acceptance Scenarios**:

1. **Given** the room's dog figure isn't showing (no approval, files failing, still loading), **When** the visitor selects the dog's sign, **Then** the conversation opens as for any piece and nothing moves.
2. **Given** the twin shows its capsule, or a model whose arm and spine bones aren't named as the rig names them, **When** the dog is selected, **Then** no petting: the dog stays at home; the conversation opens.
3. **Given** reduced motion, a paused room, the 2D room, below ADR 0010's floor, or a lost context, **When** the dog is selected, **Then** no figure moves and the live region says nothing of a petting; the conversation opens.
4. **Given** the dinosaur comes in during the approach or the petting, **Then** the petting ends (the reach eases out in 0.2 s) and spec 025's run takes the twin and the dog.
5. **Given** the pet spot is off the walkable floor, or occupied, or the dog doesn't reach it within the approach's limit, **Then** the dog goes home and no petting is shown.

---

### User Story 3 - The Dog-Intro Conversation (Priority: P1)

As a visitor, I want to select the dog and have the twin introduce it from what the Author has written.

**Independent Test**: on a fixture scene with the `dog` selectable: `vitest run apps/web/test/room/dog-selectable.test.ts`, and the generated pack and cases on a plain export with the patch applied (User Story 4).

**Acceptance Scenarios**:

1. **Given** the `dog` selectable in the room's data and the hobbies-and-travel topic ready, **When** the visitor selects the desk sign, or the room's dog figure in 3D, **Then** `object_selected` with ID `dog` is recorded once, and the twin opens the topic with the selectable's lead, from the corpus.
2. **Given** the topic isn't ready, **When** the dog is selected, **Then** the fixed `topic_not_ready` message shows and nothing is sent, as for any piece; the petting still happens where User Story 1's conditions hold.
3. **Given** the 2D room or the list of pieces, **Then** "Dog" is listed and selected through the sign, the same path.
4. **Given** the room's dog figure is running (spec 025) or walking to or from the pet spot, **Then** it isn't a pick target until it stands again; the sign still is.

---

### User Story 4 - The Author Applies One Patch (Priority: P1)

As the Author, I want one proposal and one patch for the corpus half, which I read, fill, and apply in one commit, then evaluate once.

**Independent Test**: `pytest scripts/corpus/test_dog_intro_proposal.py` (plan §6) on the proposal; then, on a fresh `git archive` export of the line with the patch applied, `python3 corpus/tools/check_corpus.py` says OK, and `vitest run apps/web/test/twin-pack.test.ts` passes.

**Acceptance Scenarios**:

1. **Given** the proposal, **When** he reads it, **Then** each new line stands beside its source: his words (with their date and file) or the spec's reading, marked as such.
2. **Given** the patch with the slot left empty and the Golden answer his to write, **When** it is applied as built, **Then** `check_corpus.py` passes, the twin says nothing of the room's dog's name, and the Golden Q&A's answer line reads as he writes it (the patch holds the line `<his answer>` for him to replace, and the checker in plan §3 refuses to build a patch where it is anything else).
3. **Given** the patch is applied, **Then** the hobbies-and-travel topic is closed until he re-runs his evaluations and marks its new hashes in `config/twin-readiness.yaml`, once; the proposal says so at its top.

### Edge Cases

- **Selecting the dog while its conversation is already open**: no new opening (the active conversation's own piece sends nothing: `src/talk/talk.ts`, `topicSelected`), and no petting.
- **Selecting the dog twice within the cooldown**: the conversation behaves as spec 004 has it; one petting only (FR-002's cooldown).
- **Selecting another piece during the petting**: the petting finishes; the other piece's conversation opens as usual.
- **The visitor's figure stands on the pet spot**: the dog's approach is blocked by spec 025's separation; the approach's limit ends it (User Story 2, scenario 5).
- **The visitor chose the dog as their avatar**: two dogs show the one model; the likeness line shows once (spec 020's FR-007); only the room's dog figure is petted (Q8).
- **The dog reaches the spot but the twin is mid-greeting** (arriving): the room takes no input during the hand-off (`talk.ts`'s `enabled`, `app.ts`'s targeting), so this doesn't arise; if it did, `arriving` outranks `petting` and the petting waits until it ends, within the approach's limit.
- **A very long frame**: the reach is a function of the petting's elapsed time, not of steps, so it can't overshoot; the dog's movement is cut as spec 008's is.
- **The tab is hidden or the room paused**: the petting's clock is the room's clock and pauses with it.
- **The kill switch is `degraded` or the tier unknown**: the opening shows the room's fixed message as any turn's does; the petting is local and unaffected.
- **The slot is filled but the disclosure line is still a draft**: the patch isn't built until his approval of the dog's model carries a line (plan §3's checker).

## Requirements *(mandatory)*

### Functional Requirements

**The petting**

- **FR-001**: The petting MUST start only from a selection of the `dog` selectable (Q1), and only while all of these hold: the twin's figure shows its model or the man stand-in (not the capsule) with the rig's arm and spine bones; the room's dog figure shows its model and stands at home (spec 025's phase `home`, A025); the motion store animates; the room is in 3D above ADR 0010's floor with its context.
- **FR-002**: At most one petting per `PET_COOLDOWN_S` (data, default 20 s), and none while one is under way.
- **FR-003**: The dog MUST walk to the pet spot, `pet.spot`, an offset in the twin's place's frame (data; its default set at implementation on the walkable floor, about 0.6 m from the twin's place toward the room's open floor, and pinned by a test that the dog's footprint there is walkable, since the twin stands near the shell's right wall: spec 016's T082 and RA8), by spec 025's figure movement (A025's `goTo`), at walking speed with its `walk` clip, and face the twin on arrival.
- **FR-004**: If the dog hasn't reached the spot within `PET_APPROACH_MAX_S` (data, default 4 s), or the spot is off the walkable floor, the petting MUST be skipped and the dog sent home.
- **FR-005**: On arrival the twin's figure MUST turn toward the dog, at most `TURN_MAX_DEG` (data, default 60°) from its place's facing, at a limited rate, and enter `petting` (FR-009).
- **FR-006**: Where the bundle holds the twin's `petting` clip, it MUST play once, its length being the petting's, and the reach layer MUST NOT run.
- **FR-007**: Where it doesn't, the twin's idle MUST play and a reach layer MUST move only the arm on the dog's side, its `Arm`, `ForeArm`, and `Hand` bones (`Right` or `Left`), by a two-bone reach toward a target on the dog's head (from the dog's figure's bounds, A025), and lean `Spine`, `Spine1`, and `Spine2` together by at most `LEAN_MAX_DEG` (data, default 35°) so the target comes within the arm's length. The target strokes along the dog's back by ±`STROKE_M` (data, default 0.05 m), `STROKE_N` times (data, default 3); reach-in and withdraw take 0.5 s each; the petting's length is `PET_S` (data, default 3.5 s). The layer is pure in its math and deterministic.
- **FR-008**: No reached bone MAY bend past its limit (the elbow within 0 to 150°, data); a target out of reach leaves the hand at the nearest point toward it. When the petting ends, or is cut, every reached bone MUST be the clip's own again (the base and applied tracking spec 019's gait uses), with no residue.
- **FR-009**: Spec 016's state machine MUST gain `petting`, after `fleeing` (spec 025) and `arriving`, before `answering`, set by an input `{ kind: "pet"; on: boolean }`; its timers keep running, so an answer's speaking time left over plays after it. The clip map gains `petting: petting`; `TWIN_CLIP_ROLES` gains `petting`; a missing `petting` role plays the idle with the reach layer (FR-007), not the idle alone.
- **FR-010**: After the petting the twin MUST turn back to its place's facing and the dog MUST walk home (A025); the twin's conversation states apply again.
- **FR-011**: The run from the dinosaur (spec 025) MUST outrank the petting: a run that starts during the approach or the petting ends it at once, the reach easing out over 0.2 s, and spec 025's director takes both figures.
- **FR-012**: The twin MUST pet only the room's dog figure (Q8). The visitor's figure, camera, and controls MUST NOT change.

**The dog-intro conversation**

- **FR-013**: A selectable `dog`, named "Dog", with the member `dog-sign`, MUST open the topic `hobbies-and-travel` with the lead "The dog first." (scene data; the lead is this spec's reading of "dog-intro", his to rewrite), through spec 004's one path: `object_selected` with ID `dog`, then the topic's action.
- **FR-014**: In 3D, the room's dog figure, while it shows its model and stands (not fleeing, returning, or walking to or from the pet spot), MUST be a pick target for the selectable `dog`, highlighted as the selectable's members are; selecting it is selecting the sign. In 2D and the list of pieces, only the sign.
- **FR-015**: The conversation, the panel, the guards, and the twin's answers MUST NOT change; the twin's opening is spec 007's, grounded in the topic's files and the lead. The petting reads no conversation text and sends nothing.
- **FR-016**: The `dog` selectable's line in `apps/web/room/scene.yaml`, and the files `npm run room:generate` and `npm run twin:pack` regenerate from it, MUST travel in the human patch with the corpus (Q7), not merge on the line. The code that reads the selectable and picks the figure merges on the line and is tested on a fixture scene that holds it.

**The corpus proposal (for his hand)**

- **FR-017**: The deliverable is `corpus/proposals/dog-intro-2026-11-14.md` and a patch built from plain copies, `docs/merge-requests/<date>-corpus-dog-intro.patch`. No file under `corpus/` outside `proposals/` is written in any worktree. If the container refuses a write to `corpus/proposals/`, the proposal goes to `docs/merge-requests/<date>-corpus-dog-intro-proposal.md` and the human-patch note says so.
- **FR-018**: The proposal MUST add the slot `hobbies.room_dog_name` to `corpus/facts/hobbies-and-travel.yaml`, its label "The name of his dog that the room's dog is a likeness of", and its `value`, `tag`, `source`, and `public_safe` null, as `dlai.co_owner_name` is; its phrasing " It is a likeness of {value}." No worker fills it (Q5).
- **FR-019**: Under "## Arya", one line, tagged `[A 2026-11-13]` for his consent and `[A <his approval's date>]` for the line his approval carries, with his consent quoted verbatim ("it's okay that we use the likeness of my dog"), then the `disclosure_line` of his look approval of the dog's model (spec 020's FR-002), quoted verbatim, then `{{slot:hobbies.room_dog_name}}`. The patch is built only once that approval is on the line; until then the proposal shows the line with `<his disclosure line>` and says why.
- **FR-020**: Golden Q&A 9, `*Who's the dog in the room?*`, its answer line `<his answer>` for him to replace, tagged `[A]` once he does. The proposal shows the recommended answer, made only of his words: the disclosure line, then the first two sentences of Golden Q&A 5's answer verbatim ("Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller. She has kept me outside, active, walking, and playing when most of my hobbies and work life revolved around computers or tinkering with hardware."), recommended only if he fills the slot with "Arya".
- **FR-021**: One "Do not claim" line: "That the dog in the room is a real dog, a photo, or a recording: it is an AI-made likeness." His recorded "No" to the topic's "Do not claim" question stays word for word, and the proposal marks the new line as the spec's proposal under Principle VIII, not his request.
- **FR-022**: The patch MUST carry, in the same commit, everything the change regenerates, each by its command in a plain export, never by hand: `config/twin/corpus.json`, `config/room-topics.yaml`, `config/room-events.yaml`, `evals/product/cases/twin-04-*.yaml`, and the narration cases a new "Do not claim" line changes. It MUST NOT carry `config/twin-readiness.yaml`: marking the topic's new hashes is his, after his evaluation runs.
- **FR-023**: The proposal MUST be checked by a deterministic script (plan §3), not a model: every quoted span is found verbatim in its named source, the slot is null, the Golden answer is `<his answer>` or absent from the patch, no digit stands outside a slot or a tag's date, and the patch doesn't touch `config/twin-readiness.yaml`.

**Telling it in words**

- **FR-024**: The room's polite live region MUST say "The twin pets the dog." once when a petting starts, and nothing when one is skipped or none happens.

**Cost, telemetry, and data**

- **FR-025**: The petting adds no network request, no model call, no new file, and no byte leaving the device. The dog-intro's opening is a twin turn on the existing route, metered and shown on the sign as any turn is.
- **FR-026**: A frame-log record `room.pet` MUST carry the petting's start and end, its path (`clip` or `reach`), and its outcome (`done`, `skipped`, `cut`); no payload and no visitor data (Constitution I). The room's dashboard panel for figures gains the pettings' count by outcome (docs).
- **FR-027**: The reach layer's per-frame cost MUST stay under 0.1 ms on the reference desktop in a seeded benchmark, with no allocation per frame.

### Key Entities

- **Pet block**: scene data, `figures.pet`: `spot` (offset in the twin's frame), `cooldown_s`, `approach_max_s`, `turn_max_deg`, `lean_max_deg`, `stroke_m`, `stroke_n`, `pet_s`, `elbow_deg`.
- **Petting**: per visit, the director's state: `idle`, `approach`, `petting`, `return`; its start, path, and outcome.
- **The `dog` selectable**: scene data, `{ id: dog, name: Dog, members: [dog-sign], action: { talk: { topic: hobbies-and-travel, lead: "The dog first." } } }`.
- **The proposal and the patch**: as spec 022's: a Markdown file with a table of lines and sources, and one unified diff built from plain copies.

## Assumed Interfaces (from specs 016, 019, 020, 025; the last three not on this branch)

Each is this spec's assumption from those specs as read on their branches; the adapter in plan.md §4 is the one place to change if they differ.

- **A016 (the twin, on `main`)**: `scene/twin-states.ts`'s closed lists and machine, as spec 025's FR-010 amends them (`fleeing` first); the twin's figure with its Mixamo-named rig of 55 bones (`assets/twin/records.json`), the bones named `mixamorig:RightArm`, `mixamorig:RightForeArm`, `mixamorig:RightHand`, their `Left` mirrors, `mixamorig:Spine`, `mixamorig:Spine1`, `mixamorig:Spine2`; each twin clip bundled under its own look approval entry (as `assets/policy/approvals.json` holds one per twin file).
- **A019 (the gait)**: the base and applied tracking of `scene/gait.ts`'s applier (`applyGait`, `clearGait`), reused or copied for the reach layer; nothing of the gait's own behaviour changes.
- **A020 (the dog)**: one dog model with clips `idle`, `walk`, `run`, held to his look approval by RA9, its height in the room's table 0.62 m (`AVATAR_SHAPES.dog`), its likeness line shown wherever the model shows through `src/room/likeness-line.ts`. Nothing of spec 020 changes here.
- **A025 (the room's dog figure)**: spec 025's director (`scene/chase.ts`) owns the dog's figure, its home, its movement, and its phases (`home`, `fleeing`, `returning`). This spec assumes, from the director, a dog figure `{ pose, home, radius, headTop(): {x, y, z} } | null` (null while its model isn't showing) and one more input, `goTo(point | null)`, which walks the figure to a floor point and holds it there, and back home on `null`, outranked by fleeing. If spec 025's director has no `goTo`, this spec adds it there as a fourth phase, `visiting` (plan §5), after 025 is on the line. And the twin's figure's heading, fed through the same driver call spec 025 uses.

## Success Criteria *(mandatory)*

- **SC-001**: In seeded runs on a fake floor, each selection under User Story 1's conditions gives one petting that ends `done`, with the dog home within 10 s of its end and the twin back to its facing.
- **SC-002**: On the twin's real model and the man's, read in Node with the default pet spot and a dog of 0.62 m, the hand on the dog's side comes within 0.08 m of the target at the stroke's middle, and every reached bone equals the clip's own within 0.5 s of the end.
- **SC-003**: With any one piece missing, failing, or loading, or under reduced motion, pause, 2D, or below the floor, nothing moves, no exception is thrown, and the conversation opens as for any piece.
- **SC-004**: Spec 016's and spec 025's twin-state tests pass unchanged except where FR-009 adds the state.
- **SC-005**: The proposal's checker passes; the patch applies cleanly to a fresh export of the line, `check_corpus.py` passes on the result, and the pack and cases are current.
- **SC-006**: The live region's line appears once per petting, and never for a skipped one.
- **SC-007**: The reach adds under 0.1 ms a frame and no per-frame allocation (FR-027).
- **SC-008**: The Author's look at the petting, the stand-in's and then the clip's (his, in the morning and at lookdev), and his evaluation of the topic after the patch.

## Amendments to Earlier Specs

- **Spec 016, FR-021** (and its twin-states contract §2): the state list gains `petting`, after `fleeing` and `arriving` (M1); the clip roles' closed list gains `petting` (M2).
- **Spec 025, its director**: a fourth phase, `visiting`, driven by `goTo`, outranked by `fleeing` (M3), only if spec 025 hasn't one.
- **Spec 004's selectables**: a selectable's pick, in 3D, may also take a figure's draws (M4); the compositor's spacing check (RG6) measures placements only, and a figure moves, so the figure's pick area isn't measured by it (named in Assumptions).

## Assumptions

- Specs 020 and 025 land before this one's code (plan §9); spec 019's applier pattern is on the line. This spec's tests use fakes of A020 and A025 first, and one integration task runs once they are on the line.
- **The look approvals**: the dog's model is spec 020's; the petting clip, `assets/twin/petting.glb`, is a new twin file, made from his photo-derived rig, so it is `likeness: true`, `source.type: "photo"` as the other twin clips are, and needs his own approval entry (human patch 026, items 3 and 4). Until it exists, the reach stands in.
- **The studio**: the petting clip is keyed on the twin's rig in Blender, which main's tools list (P-7) holds; no new tool or model. Its round is a later studio task; this spec writes its brief only (plan §5).
- **The corpus**: `corpus/proposals/` is written by the implementer's task, never `corpus/` itself; if the container refuses it, FR-017's fallback.
- **The topic closes once**: applying the patch closes hobbies-and-travel (the snowboard, the bicycle, and the dog open the fixed `topic_not_ready` message) until he re-runs his evaluations and marks the new hashes. This is his gate, named in the proposal's first lines and the human-patch note.
- **Spec 022's patch** also regenerates `config/twin/corpus.json` and the narration cases. Whichever of the two patches he applies second is rebuilt on the first (plan §7).
- **RG6** (spec 004's spacing check of pick areas at the framing) does not measure the dog figure's pick area, since it moves; the figure's pick is a second target for a selectable whose member, the sign, RG6 does measure. Named here as a reading, not a deviation: no control is dropped.
- **Spec 025's text** calls item i "spec 026's" (its Q2); item i's spec is not this one. Noted for spec 025's next rework; nothing here depends on it.
- **Deviations from the constitution**: none. No control is deferred or dropped.
- Distances, angles, and times are placeholders, data, and the Author's to set at lookdev.

## Expected Cost Impact

Cloud: the petting, none. The dog-intro: one twin opening per selection, as any piece's, on the existing route (local first, then the host's paid fallback in its sub-budget and caps), metered by the gateway and shown on the sign; no new route, model, or cap. Dev-time: about one implementer session of some fourteen small tasks, a review, and a short studio round for the clip.

## Degraded-Mode Behavior

Written first (Principle I): the petting happens only when the twin's model with its arm, the dog's figure with its model, motion, and the 3D room above the floor are all there. In any other case, selecting the dog opens its conversation and nothing moves. Without the patch, there is no `dog` selectable and the room is as `main` has it. With the patch applied and the topic not yet re-marked, the dog, the snowboard, and the bicycle show the fixed `topic_not_ready` message, as any closed topic does. The kill switch and the tier affect the conversation as they do any turn; the petting is local.

## Data-Flow Disclosure Entries

None new: the petting sends nothing (FR-025). The selection's `object_selected` event and the opening turn go where every piece's already go; the generated `config/room-events.yaml` gains the ID `dog`. A task reads `docs/data-flow-disclosure.md` and adds a sentence only if a row names the selectables one by one.

## The "New Endpoint or Feature" List (`CLAUDE.md`)

- Telemetry span: FR-026 (and the existing `object_selected` and turn spans).
- Dashboard panel: FR-026 (a docs change).
- Cost estimate: above.
- Degraded-mode behavior: above.
- Data-flow disclosure entry: none needed; checked by a task.

## Constitution Check

| Principle | How this complies |
|---|---|
| I. Data-Local | The petting is local; the conversation uses the existing route and its disclosure. Degraded mode first. |
| II. Production-Grade | Tests first (tasks.md), a frame-log record, a dashboard line, a frame budget, degraded modes. |
| III. Intent, Spec, Code, Humans Merge | The intent is a draft for his acceptance; he merges and applies the patch. |
| IV. Least Privilege | No human-only path is written; the corpus, the readiness file, the twin's clip, and its approval are his (human patch 026). |
| V. Cost | None for the petting; the conversation at the route's existing cost. |
| VI. Build in Public | Questions on the morning page with recommendations; the proposal shows each line's source. |
| VII. Own the Whole Product | Nothing about him or his dog beyond the corpus and his words; the dog's name in the room is an open slot. |
| VIII. Honest AI | The room's dog is said to be a likeness, in his approval's line; a "Do not claim" line keeps the twin from saying otherwise. |

## Open Questions

Q1 to Q8 above, each with its recommended answer, each also in `/night/io/out/questions.md`.
