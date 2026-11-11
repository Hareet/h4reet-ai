# Feature Specification: The Twin's Own Avatar

**Feature Branch**: `feat/016-the-twins-own-avatar`, cut at the Author's intake commit 6821d121 ("assets(016): the twin") on `content/016-twin-avatar`, with `main` at 0d2e3247. The spec, the plan, and the code travel on this one branch, the intake at its base, so one gate covers the intake, the spec, and the code ([plan.md](plan.md) §4).

**Created**: 2026-11-10

**Status**: Approved to build, 2026-11-10: "I want you to keep going and build it!" (tasks.md, Prerequisites). Draft before that. Specified, clarified, planned, tasked, and analyzed on 2026-11-10 from the accepted intent beside it ([`intent.md`](intent.md), 82d15728). The intent records the Author's acceptance, "Yes, take those (Recommended)", and his "okay that is finished, update the runbook and go ahead". Five clarification questions took their recommended options under those words, each provisional and his to overturn, with its options kept (Clarifications; Open Questions). Twelve smaller defaults were taken the same way (Open Questions, D1 to D12). No needs-clarification marker is left open in the requirements. Nothing merges before the Author approves this spec and its plan at the gate (Assumptions, Deviations).

**Input**: [`intent.md`](intent.md) in this folder. Also read, at this branch's base: the [constitution](../../.specify/memory/constitution.md) 1.1.0, `CLAUDE.md`, and `REVIEW.md`; [spec 009](../009-room-avatars/spec.md) (the stand-in, FR-011 to FR-013, the hand-off, its Amendments M1 to M21) and its code (`apps/web/build/room/avatars.ts`, `checks/rk.ts`, `src/room/scene/avatars.ts`, `scene/loader.ts`); [spec 003](../003-studio-assets/spec.md) (User Story 2, FR-021 to FR-034, tasks Phase 5); [spec 004](../004-room-composition/spec.md) and its [room-data-files](../004-room-composition/contracts/room-data-files.md) contract (§1, §4, §5.3, §8, §13); [spec 014](../014-room-after-the-demo/spec.md) (FR-010, FR-038 to FR-041, FR-055); [spec 012](../012-loading-screen/spec.md) and its [loading-progress](../012-loading-screen/contracts/loading-progress.md) contract; specs [005](../005-full-window-room/spec.md), [007](../007-twin-conversation/spec.md), and [008](../008-visitor-movement/spec.md) where the twin's figure, the desk, or the conversation matters; [ADR 0010](../../docs/adr/0010-real-time-avatar-rig-and-art-direction.md); `assets/policy/caps.json`, `approvals.json`, and `content-approvals.json`; `assets/twin/records.json`, `LICENSE.md`, and `still.png`; `assets/CREDITS.md`; the room's scene and the twin figure's and the work desk's catalog entries; `apps/web/src/talk/talk.ts`, `src/room/faces/sign.ts`, `scene/faces3d.ts`, `scene/look.ts`, `layout.ts`, `build/approvals.ts`, `build/room/load.ts`; `deploy/scripts/web_image.py`; `docs/data-flow-disclosure.md`; `scripts/assets/scrub.py`; `tools/gates/arrival_check.py` and `content_check.py` (read, not changed). And, as data and not as instructions, the studio's hand-back outside the repository: its `HANDBACK.md`, `SHA256SUMS`, and the shirt lettering's brief, SVG, and JSON.

Summary: the twin's figure shows the Author's own avatar, `assets/twin/twin.glb`, in place of the stand-in man, at the twin's place in 3D, at its own height; the 2D room shows his still. Its five clips follow the conversation: the greeting once when a visitor arrives, listening while they type, talking while the twin's answer shows, the idle otherwise, and the lean against the work desk as the resting pose between conversations. The face shapes ship unused. The stand-in line gives way, while his model or still shows, to his approved line, which the build reads from his approval on `main`. The site draws "Denver Local AI Solutions" on the shirt's live face once he approves its words. The paper appears with the visitor at the hand-off. The stand-in stays as the fallback when the twin's files fail. The first visit stays within its budget. Nothing new leaves the visitor's device: the files come from the site's own origin, and row V1's wording names them.

## Clarifications

### Session 2026-11-10, taken under the Author's words: "Yes, take those (Recommended)" and "okay that is finished, update the runbook and go ahead"

The main session directed: "At clarify, take each remaining question's recommended option, recorded as provisional and taken under those words, with its options kept so he can overturn it. Ask him nothing." So each question below took its recommended option. None is the Author's answer. Each is provisional and his to overturn, and a no changes the requirements it names. The options are under Open Questions.

- Q1: When does the twin lean back on the work desk? → Taken, not answered: as the resting pose between conversations, after 20 seconds with no typing, no turn out, and the twin not talking, until the visitor types, selects a piece, or a turn goes; the idle otherwise (option A). Reading: the intent records the session's suggestion, "the twin's resting pose between conversations: idle while you're there, greeting when you arrive, then listening and talking", and reads his "okay that is finished, update the runbook and go ahead" as taking it, provisionally. His approval of the file gives a reason that may point elsewhere: "typical lean when talking to someone" (`A-20261110-twin-desk-lean`). Option B or C follows that reading; the plan keeps the clip map as data, so either is a data edit. (FR-020, FR-021, FR-029.) **Answered by the Author on 2026-11-11, after his lookdev: "Lean off for now (Recommended)"**, whose option read "Remove the lean from the scene (one data edit): the twin rests in his idle between conversations. The studio re-exports the lean later, and it comes back by a new intake and the same data line. No delay to this merge." So the lean is off for this release: `desk-lean.glb` bends the right elbow backward (plan.md R-19), the scene's twin block holds no `lean`, and the twin rests in its idle (FR-029). It comes back with the studio's re-export through a new intake, and the same data line; A, B, and C then apply as written.
- Q2: When the twin's own avatar shows, how does the paper reach the visitor at the hand-off? → Taken, not answered: the paper appears in the visitor's holding hand, fading in over the hand-off's length (1 s under reduced motion); no sheet leaves the twin; the twin greets and turns toward the visitor as spec 002's turns have it; the visitor turns as before and ends in "idle-holding", with no "take"; the hand-off's length, its announcement, and the offer after it stay spec 002's (option A). Reading: his "The paper can appear with us", and the hand-back's clips, which have no holding or take clip for the twin. (FR-031 to FR-033.)
- Q3: How long does the talking clip play for an answer that arrives whole? → Taken, not answered: from the moment the twin's answer shows in the conversation, for its speaking time at 150 words a minute, at least 3 s and at most 20 s; while the turn is out, the twin listens; a fixed message isn't an answer (option A). Reading: spec 007 sends the answer whole, after the guards ("No word reaches the room before every guard has passed the whole answer"), and there is no voice yet, so "talking while it answers" is read as the twin seeming to say the words the visitor is reading. The pace and the bounds are data. (FR-021, FR-022.)
- Q4: At what size do the twin's textures decode? → Taken, not answered: at most the room's avatar side, 1,024 pixels, like the visitors', so the scene's texture memory stays at about 181.6 million of `main`'s 200,000,000 (option A). The twin's side is its own data value, so a 2,048 side is a data edit once the Author raises `scene_texture_bytes` to at least 215,109,289, by the last report's figures (option B). Reading: the hand-back gives the head its own 2,048 texture "at the Author's request for more detail in the face"; at the room's framing a 1,024 head texture is more texels than the face shows on screen, and option A needs no cap change, which only he can make. (FR-045.)
- Q5: How tall is the twin, and where does it stand? → Taken, not answered: at its own size, unscaled, 1.82 m to the turban's top, the twin figure's catalog height raised to match so the stand-in scales to it; and at the spot the hand-back solved the lean for, the work desk's origin 0.679 m straight behind its root, which moves the twin's placement about 7.4 cm toward the open front, as a data edit (option A). Reading: the hand-back solved the lean against the delivered desk at the model's own scale; scaled to the old 1.75 m, the elbow would sit about 4 cm off the desk's top. (FR-010 to FR-012, FR-029.)

## Source: The Author's Words

Quoted from the intent as it records them. The reading beside each is this spec's, to correct where it's wrong; it never replaces the words.

- **The problem**, the intent's: "The twin's figure in the room is a stand-in: the man's visitor model, labelled "The twin's figure is a stand-in, not the Author's likeness." (spec 009, FR-011 and FR-012). Spec 003 planned the twin's own avatar in its Phase 5, but wrote that phase to wait for spec 001's cloud relay, which the room no longer needs for this."
  Reading: spec 003's Phase 5 is re-planned here without the relay; the relay's own work (the asset events' route, row V6) stays with spec 001 (Amendment M6).
- **The arrival**, 2026-11-10: "Okay, my avatar twin is ready and imported in". Then: "Well, hold on, we have the twin with the finger bones, let's give you those files".
  Reading: the files are the second hand-back's, brought in by his intake commit 6821d121, which passed the arrival check, with his approvals on `main` at 0d2e3247.
- **The shirt**, as the intent records his relay: "The shirt's lettering (twin-shirt-lettering.svg, .json and -brief.md) isn't a record entry: it's for the site's code, which draws "Denver Local AI Solutions" on the live face twin-shirt-lettering. The brief says how."
  Reading: the SVG and the JSON come in as the site's sources (FR-039); the brief's method is this spec's FR-036 and FR-037; the brief itself stays outside the repository.
- **The outcome**, the intent's: "Visitors meet the twin as the Author's stylized likeness, in place of the stand-in, in 3D. 2D and phones keep their fallbacks."
  Reading: in 3D the twin's own model replaces the stand-in (User Story 1). "2D and phones keep their fallbacks" is read as both keeping a working path: a phone that can't hold the scene steps down and falls to the 2D room as today (spec 003 FR-024), and the 2D mode is spec 003's FR-023, "the twin's still image, the disclosure, and chat", so the 2D room shows his still (User Story 5).
- **The clips**, the intent's: "The twin's clips follow the conversation: greeting when a visitor arrives, listening while they type or speak, talking while it answers, idle otherwise." The session's question, which he answered "Yes, take those (Recommended)": "Greeting plays when a visitor arrives, listening while they type or talk, talking while the twin answers, idle otherwise; lip-sync later (the face shapes ship unused for now)".
  Reading: User Story 3; "speak" and "talk" wait for push-to-talk, which is out of scope until spec 002's voice groups (Assumptions); Q3 reads "while it answers".
- **The lean**, the session's suggestion: "The lean: when does it play? My suggestion is the twin's resting pose between conversations: idle while you're there, greeting when you arrive, then listening and talking." His answer: "okay that is finished, update the runbook and go ahead". His approval's reason for the file: "typical lean when talking to someone".
  Reading: Q1.
- **The paper**, his: "The paper can appear with us, we are building additional .glb that includes bones in the finger to grip, as well as leaning on the desk posture. We will add those later, I want to get this product out with the version we have". The session then: "the paper still appears with you, as you said, unless you want a grip set in data now", which the intent reads as taken.
  Reading: User Story 4 and Q2. No grip for the twin is set; a holding clip and a grip can come later as data.
- **The disclosure**, the intent's outcome: "The stand-in line gives way to the Author's approved disclosure line, which says the avatar is an AI-made, stylized likeness of the Author, published by his choice (spec 003, FR-032 and FR-034). The credits reach the twin's record (FR-033)." His approved line, `A-20261110-twin`'s `disclosure_line` on `main`: "The twin is an AI-made, stylized likeness of the Author, shown by his choice."
  Reading: FR-014 to FR-017 and FR-043; the build reads the line from his approval and never copies it.
- **The fallback**, the session's question he answered "Yes, take those (Recommended)": "the stand-in man stays as the fallback if your model can't load".
  Reading: FR-002; it amends spec 003's FR-021 in 3D (Amendment M3).
- **The constraints**, the intent's: "Lip-sync is out of scope here unless the Author wants it: the shapes arrive now, and using them is a later step." "The first visit stays within its budget, with the twin's clips counted. Desktop and phone, 2D, reduced motion all keep working." "Agents read no studio folder and edit no `assets/**` or `assets/policy/**`."
  Reading: FR-013, FR-044 to FR-047, and the plan's rules for agents.
- **Speed**, his: "I want to get this product out with the version we have".
  Reading: the defaults favour what ships without a human-only change: no cap change (Q4), no human-only gate change, the shirt behind his one approval patch.

## User Scenarios & Testing *(mandatory)*

The users are visitors on desktop and phone, in 3D and in the 2D room, by pointer, touch, keyboard, and screen reader; and the Author, who judges the twin at lookdev, approves the shirt's words, and runs the gate. User Story 2, the degraded mode, is P1 and ships with User Story 1, as Principle I asks; it follows it in the list only because it adds no new sight.

### User Story 1 - The Visitor Meets the Twin's Own Figure, Disclosed (Priority: P1)

As a visitor, I want to see the Author's stylized likeness where the twin stands, and to be told plainly that it is an AI-made likeness shown by his choice.

**Why this priority**: The intent's outcome, "Visitors meet the twin as the Author's stylized likeness, in place of the stand-in, in 3D", with Principle VIII's disclosure. It is the smallest slice that ships the twin.

**Independent Test**: With this branch's tree, in 3D on the desktop, enter as any avatar: the twin's figure is the twin's model, 1.82 m tall, standing at the twin's place, facing the open front, its idle playing; the stage's note and the first line of "Around the room" say the approved line, read from `main`'s approval; the stand-in line is nowhere; the AI disclosure is unchanged. Remove the approval from the fixture policy and build: the twin shows the stand-in man with the stand-in line.

**Acceptance Scenarios**:

1. **Given** the twin's model and idle in the bundle and `main`'s approval of the model's hash with its line, **When** the room shows in 3D above ADR 0010's floor, **Then** the twin's figure shows the model in place of the stand-in, unscaled, its lowest point on the floor, its root at the twin's placement, facing as the placement turns it.
2. **Given** the twin's model shows, **When** the page is read, **Then** the stage's note holds the twin's line in the stand-in line's place, "Around the room" holds it first, both as text a screen reader reads, and the stand-in line appears nowhere.
3. **Given** the twin's model is still loading, **When** the room shows, **Then** the twin's figure shows its fallback with the stand-in line, and the line changes to the twin's when the model swaps in.
4. **Given** the build can't find an approval on `main` naming the model's current hash with a line, **When** the room is composed, **Then** a strict build refuses it, naming its rule, and a lenient build leaves the twin's files out, so the stand-in shows with its line.
5. **Given** a visitor chooses the man, **When** the room shows, **Then** the visitor's figure shows the man and the twin's figure shows the twin; the man's files are fetched for the visitor only.

---

### User Story 2 - Nothing Breaks When the Twin's Files Can't Show (Priority: P1)

As a visitor, I want the room to work whatever happens to the twin's files, and whatever state the Author's machine or the budget is in.

**Why this priority**: Principle I, "Every user-facing capability MUST define its degraded mode before its happy path", and spec 003's User Story 2.

**Independent Test**: With fault injection on the twin's model and on each clip (blocked, timed out, failing integrity, not 200, corrupt, over the texture ledger), below the floor, in 2D, with a lost context, and with the live source off, the tier unknown, and the kill switch `degraded` (stubbed): every run ends with the twin's figure showing its own model, the stand-in man, or the capsule, the line that matches what it shows, the AI disclosure, a working text box, and the room drawing.

**Acceptance Scenarios**:

1. **Given** the kill switch is `degraded`, or the local tier is off, **When** a visitor enters, **Then** the twin's files load and show as always, and only the conversation degrades.
2. **Given** the twin's model fails after its one retry, **When** the failure is known, **Then** the room fetches the stand-in's files, shows the capsule until the stand-in is ready and then the stand-in, with the stand-in line throughout, and sends one `avatar_failed` in the visit.
3. **Given** the stand-in's model fails too, **When** its retry fails, **Then** the capsule stays, with the stand-in line, and no second `avatar_failed` is sent.
4. **Given** one of the twin's clips fails or names a bone the model lacks, **When** its state comes, **Then** the idle plays in its place; **Given** the idle itself fails, **Then** the twin stands still in its rest pose.
5. **Given** the room falls to 2D while the twin loads, **When** the 2D room shows, **Then** nothing more is fetched or parsed for the 3D twin, the 2D room shows the twin's still with the twin's line, and the visit is kept.
6. **Given** the 3D context is lost and restored, **When** it's restored, **Then** the twin shows again from the HTTP cache, its fallback meanwhile, and its greeting doesn't play again.

---

### User Story 3 - The Twin Moves With the Conversation (Priority: P1)

As a visitor, I want the twin to greet me, to listen while I type, to seem to speak while its answer shows, and to rest against the desk when we've stopped talking.

**Why this priority**: The intent's "The twin's clips follow the conversation", and the hand-back's five clips. It is what makes the figure a twin rather than a statue.

**Independent Test**: On a fake clock, in 3D with the motion store animating: at the hand-off's start the twin greets once; typing into the text box gives listening; sending keeps listening while the turn is out; the answer's arrival gives talking for its speaking time; then the idle; 20 s with nothing gives the lean, crossfaded in 0.4 s; typing again leaves it. With reduced motion, every change is a cut and nothing moves.

**Acceptance Scenarios**:

1. **Given** the twin's model shows at the hand-off's start, **When** the hand-off starts, **Then** the greeting plays once, then the idle; **Given** the twin shows only after the hand-off, **When** it first shows, **Then** the greeting plays once then; **And** it never plays again in the visit.
2. **Given** the text box holds text the visitor typed and hasn't sent, or a turn is out, **When** no answer is showing and no greeting plays, **Then** the twin plays listening.
3. **Given** the twin's answer shows in the conversation, **When** it arrives, **Then** the twin plays talking for 0.4 s a word, at least 3 s and at most 20 s, then the state the inputs give; **Given** a fixed message shows instead, **Then** the twin doesn't play talking.
4. **Given** 20 s pass with no typing, no turn out, the twin not talking, and no greeting, **When** they've passed, **Then** the twin eases into the lean against the work desk in 0.4 s and loops it; **When** the visitor types, selects a piece, or a turn goes, **Then** it eases out in 0.4 s to listening.
5. **Given** reduced motion, "Pause the room", or a hidden page, **When** the twin's state changes, **Then** its pose cuts to the new clip's first frame and no clip moves.
6. **Given** quality level 1 or more, **When** both figures show avatars, **Then** the twin animates and the visitor's figure holds its frame.
7. **Given** the scene's clip map gives the lean to another state, **When** the room is built, **Then** that state plays the lean, with no source file changed.

---

### User Story 4 - The Paper Appears With the Visitor (Priority: P2)

As a visitor, I want the resume's paper in my hand when I arrive, while the twin greets me.

**Why this priority**: His "The paper can appear with us", and the twin's clips, which have no holding or take clip. It builds on User Story 1.

**Independent Test**: In 3D as the woman, with the twin's model shown at the hand-off's start: the twin turns toward the visitor and greets; no sheet appears at the twin's hand; the paper fades in at the woman's holding hand over the hand-off; she ends in "idle-holding"; the hand-off ends within 5 s, its announcement as before. With reduced motion: a 1 s fade, no turns. With the twin's model failed: spec 009's hand-off between the stand-in and the visitor, unchanged.

**Acceptance Scenarios**:

1. **Given** the twin's model or still shows when the hand-off starts, **When** it plays, **Then** no frame shows a sheet at the twin's hand, and the paper's opacity at the visitor's hand rises from 0 at the start to 1 at the end.
2. **Given** the visitor's figure shows an avatar with a holding hand, **When** the hand-off ends, **Then** the paper is within 2 cm of that hand's grip (spec 014 FR-038), and the visitor plays "idle-holding".
3. **Given** the visitor's figure shows its flat shape, **When** the hand-off plays, **Then** the paper fades in at its hand anchor.
4. **Given** the twin shows the stand-in at the hand-off's start, **When** it plays, **Then** spec 009's FR-019 and spec 014's FR-041 hold as written.

---

### User Story 5 - The 2D Room Shows the Twin's Still (Priority: P2)

As a visitor in the 2D room, I want to see who I'm talking to.

**Why this priority**: Spec 003's FR-023, "the twin's still image, the disclosure, and chat", and the hand-back's still, made for it.

**Independent Test**: Below the floor, and by the "2D view" control: the 2D room draws the twin's still in the twin's place, inside its figure's box, its aspect kept, with the twin's line; the still was fetched once, with its integrity, from the site's own origin, and no 3D file of the twin was fetched in the visit that started in 2D. Block the still: the twin's drawing shows, with the stand-in line.

**Acceptance Scenarios**:

1. **Given** the room shows its 2D room, **When** the still has loaded, **Then** the twin's place shows the still in the scene's still rectangle, clipped to the twin figure's box, never stretched, with the twin's line in the note and first in "Around the room".
2. **Given** the still fails after its retry, **When** the 2D room shows, **Then** the twin's drawing shows, with the stand-in line.
3. **Given** a visit that stays in 3D, **When** the network log is read, **Then** the still wasn't requested.

---

### User Story 6 - The Shirt Says "Denver Local AI Solutions" (Priority: P2)

As a visitor, I want the twin's shirt to show the Author's business name, as the room draws its other words.

**Why this priority**: The intent's "The twin's shirt shows "Denver Local AI Solutions", drawn by the site's code on the model's live face, as the brief describes." It needs the Author's approval of the words, so it ships behind his patch.

**Independent Test**: In a drafts build, the twin's chest shows "Denver Local AI" over "Solutions" in black, the shirt showing around the letters, the words upright and left to right from the front, moving with the chest, marked as a draft in the drawing and in "Around the room". In a release build without his approval on `main`, the shirt is plain. Apply his approval to the fixture policy: a release build draws the words unmarked.

**Acceptance Scenarios**:

1. **Given** a drafts build, **When** the twin shows, **Then** the face `twin-shirt-lettering` shows the outline's ink alone, every pixel outside the ink transparent, the shirt showing through, with the draft mark, and "Around the room" carries the words under the face's label, marked.
2. **Given** a release build and no approval on `main` for the outline's hash, **When** the twin shows, **Then** the face keeps the model's own plain white, and the words appear nowhere in the build's output.
3. **Given** his approval on `main` for the outline's current hash with the kind `room-text`, **When** a release build shows the twin, **Then** the words show unmarked.
4. **Given** the twin breathes or turns, **When** the chest moves, **Then** the lettering moves with it, on the face itself, with no separate plane.
5. **Given** the inked-cel look, **When** the frame draws, **Then** no ink line outlines the face or the letters.

---

### User Story 7 - The Credits Reach the Twin's Record (Priority: P2)

As a visitor curious about the twin, I want to see what made it, in at most two clicks.

**Why this priority**: Spec 003's FR-033 and Principle VI. Its User Story 4 waited on the twin's files, which are here.

**Independent Test**: From the room, in 3D and 2D, by pointer and by keyboard: "Credits" in the toolbar opens the site's credits page, whose list reaches the twin's files' records in one more click; the page is the site's own, rendered from `assets/CREDITS.md`.

**Acceptance Scenarios**:

1. **Given** the room in any mode, **When** the visitor follows "Credits", **Then** a same-origin page opens, listing each asset directory, and the twin's entry links to its files' records.
2. **Given** that page, **When** the visitor follows the twin's entry, **Then** they see each of the twin's files' records as `assets/CREDITS.md` renders them.

---

### User Story 8 - The First Visit, the Loader, and the Phone (Priority: P3)

As a visitor on a phone, I want the twin without the room stuttering or the first visit growing past its budget.

**Why this priority**: The intent's "The first visit stays within its budget, with the twin's clips counted", spec 003's SC-006, and spec 002's FR-048. It tunes what the desktop builds.

**Independent Test**: The compositor's report gives the first visit with the twin's files, under 25,000,000 bytes, and the scene's texture memory with the twin at its decoded size, under 200,000,000; the loader's progress counts the twin's files; on the reference phone the lookdev copy's 2-minute run holds a median of 30 frames a second.

**Acceptance Scenarios**:

1. **Given** the default scene and this branch's tree, **When** the room is composed, **Then** RK5's first visit counts the room's served files, the twin's served files, and the largest visitor avatar's, and is under 25,000,000 bytes; RK3's total counts the twin at its decoded size and is under `main`'s cap.
2. **Given** the loader shows, **When** the twin's files end, **Then** its progress counts them by their served bytes.
3. **Given** the twin's model loads, **When** it is placed, **Then** none of its meshes carries a morph target, so no face shape is uploaded.
4. **Given** the reference phone, **When** both figures animate for 2 minutes, **Then** the median frame rate is at least 30 and at least 95% of frames take 33 ms or less, the quality controller stepping down as today where it must.

---

### User Story 9 - The Scrub Marks the Twin's Files as the Arrival Check Expects (Priority: P3, backlog)

As the Author, I want `scrub.py --record` to write the mark the arrival check wants on every file under `assets/twin/`, so the next intake doesn't fail its mark.

**Why this priority**: The intake's backlog: given `--record`, the scrub chose the composite mark for the twin's files, whose steps mix model and hand, and the arrival check's C1 wants `trainedAlgorithmicMedia` under `assets/twin/` whatever the steps say. Small and independent.

**Independent Test**: A `records.json` fixture with `"directory": "assets/twin"` and mixed steps: the scrub with `--record` writes `trainedAlgorithmicMedia`; the same steps under another directory still give `compositeWithTrainedAlgorithmicMedia`.

**Acceptance Scenarios**:

1. **Given** a record whose `directory` is `assets/twin` or under it, or `docs/research/images`, **When** the scrub runs with `--record`, **Then** it writes `trainedAlgorithmicMedia`, whatever the steps' `by`.
2. **Given** any other directory, **When** it runs, **Then** the mark follows the steps, as today.

---

### User Story 10 - The Author Sees, Approves, and Gates (Priority: P1, the Author's)

As the Author, I want to judge the twin in the room, approve the shirt's words with one patch, and merge with one gate.

**Why this priority**: Nothing reaches `main` without his gate, and the shirt without his approval.

**Independent Test**: The lookdev page shows the twin in each state, the lean against the desk, the hand-off, the shirt marked as a draft, and the 2D still; his approval patch applies to a plain copy of `main`'s `content-approvals.json` and adds exactly one entry, C-0004; `tools/gates/gate feat/016-the-twins-own-avatar` passes.

**Acceptance Scenarios**:

1. **Given** a drafts build, **When** he opens lookdev, **Then** he can play each state's clip, see the lean against the desk, play the hand-off normally and under reduced motion, see the shirt marked, and see the 2D still with its line.
2. **Given** his patch, **When** he applies it on `main`, **Then** `content-approvals.json` gains C-0004 for the outline's path, its SHA-256, and the kind `room-text`, his date and reason, and nothing else changes.
3. **Given** the branch, **When** he runs the gate, **Then** it passes with the intake, the spec, and the code together.

---

### Edge Cases

- **The twin arrives late:** on a slow link the loader may give way before the twin's 8.6 MB model ends; the hand-off then plays with the twin's fallback, the paper travelling as spec 009 has it from the capsule's hand anchor, and the twin swaps in after it ends and greets then (FR-019, FR-031).
- **The twin fails after the hand-off:** its fallback swaps in; the paper stays with the visitor (FR-002).
- **The visitor chooses the man:** the visitor shows the man; the twin shows the twin; if the twin then fails, the stand-in man shows in both figures from one fetch (spec 009 FR-015).
- **An approval for an older hash:** the twin's own files aren't shown; the stand-in shows with its line (FR-015).
- **The approval names the model but its line is empty:** the same as no approval (FR-015).
- **A new answer while the twin talks:** the speaking time starts again from the new answer (FR-021).
- **Typing while the twin talks:** the twin finishes its speaking time, then listens while the text box holds text (FR-021).
- **A stopped or failed turn:** no answer shows, so no talking; the state the inputs give (FR-021).
- **The lean during the hand-off or the greeting:** never; the greeting outranks resting, and the quiet time starts after it (FR-021).
- **The desk moved by a data edit:** the lean's check fails and the lean is left out, the twin resting in its idle, until the twin's placement follows (FR-029).
- **A piece on the desk under the twin's forearm in the lean:** the Author's lookdev check; a data edit moves the piece or the twin (L3).
- **The man's grip data:** unchanged; the twin has no grip, and the compositor refuses a grip for an avatar outside the table (spec 014 FR-039).
- **2D from the start:** the still is fetched; the twin's model and clips aren't (FR-004).
- **A reload:** a new visit; the greeting plays again, and `avatar_failed` may be sent once more (spec 009).
- **The shirt approved, the model replaced later:** the outline is approved by its own hash, independent of the model's; a new model whose face has another name leaves the outline unbound, which the compositor reports (FR-038).
- **Push-to-talk lands later:** its capture counts as typing for listening (Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

Terms used below, beside spec 004's (a figure, a placement, a live face, a strict and a lenient build, a drafts and a release build) and spec 009's (an avatar, the stand-in avatar, the fallback, ready, the holding hand, the motion store animates). **The twin's files**: its model `assets/twin/twin.glb`, its clips `assets/twin/<role>.glb` for the closed list `idle`, `talking`, `listening`, `greeting`, `desk-lean`, and its still `assets/twin/still.png`. **The twin's own picture**: its model in 3D or its still in 2D. **The twin's line**: the `disclosure_line` of the approval on `main` that names the twin model's current SHA-256 (FR-015). **The stand-in line**: spec 009's UI word `twin.stand_in`. **A state**: one of the closed list `arriving`, `answering`, `listening`, `resting`, `present` (FR-020). **The lean's spot**: FR-029's. **The outline**: `apps/web/content/room/outlines/twin-shirt-lettering.outline.json`.

**Degraded mode** (defined before the happy paths, Principle I)

- **FR-001**: THE TWIN'S FILES SHALL be static files from the site's own origin. THE ROOM SHALL make no model call and no gateway call for them, and WHILE the local tier is off, the budget is spent, the kill switch is `degraded` or unknown, or the live source is off, THE ROOM SHALL load and show them exactly as at any other time; only the conversation SHALL degrade (spec 003 FR-025).
- **FR-002**: IF the twin's model has no entry in the bundle, or is blocked, takes more than 10 seconds with its body, fails its integrity check, answers other than 200, fails to parse or decode, or would take the texture ledger over its limit, THEN, after the one retry the room's loader makes for each of these but the ledger, THE TWIN'S FIGURE SHALL show spec 009's fallback chain: the stand-in avatar the scene names, fetched then unless already fetched, its capsule until that is ready, and the capsule alone where the stand-in fails or has no files; THE ROOM SHALL show the stand-in line while it does, go on drawing, and record the outcome (FR-055, FR-056). This amends spec 003's FR-021 in 3D (Amendment M3).
- **FR-003**: IF one of the twin's clips is missing, fails to load, or targets a bone the model lacks, THEN its state SHALL show the idle in its place. IF the idle fails, THEN THE TWIN SHALL stand still in its rest pose, as spec 009's FR-003 has it.
- **FR-004**: IF the device is below ADR 0010's floor, or the room shows its 2D room from the start, THEN THE ROOM SHALL fetch none of the twin's model and clips, and SHALL show the twin's still in the 2D room (FR-034).
- **FR-005**: IF the room falls to 2D while the twin's files load or show, THEN THE ROOM SHALL fetch, parse, and swap nothing more for the 3D twin, record each load that hadn't ended as skipped, and show the 2D room with the still, keeping the conversation, the resume, and the visit's state (spec 009 FR-005).
- **FR-006**: WHILE the 3D context is lost, THE ROOM SHALL draw nothing new for the twin. WHEN it is restored, THE TWIN SHALL load again from the HTTP cache, its fallback showing until it is ready, and its greeting SHALL NOT play again in the visit. IF the context isn't restored, THEN THE ROOM SHALL fall to 2D, and FR-005 applies.
- **FR-007**: A FAILURE OF THE TWIN'S FILES SHALL never leave a blank or frozen scene, never move the camera or a pick area, never hide the AI disclosure, and never leave the twin's figure without the line that matches what it shows (FR-014).

**The twin's figure**

- **FR-008**: WHEN the bundle holds the twin's model, the room is in 3D above the floor, and the build has read the twin's line (FR-015), THE TWIN'S FIGURE SHALL show the twin's model in place of its fallback once ready, its model and its idle each loaded or failed, at the time spec 009's FR-022 gives.
- **FR-009**: THE TWIN'S FILES SHALL be bundled only WHERE each is recorded in `assets/twin/records.json` with its kind (`avatar`, `animation`, `still`) and its current SHA-256, is readable, is within `main`'s per-asset caps for its kind, and, for a clip, moves only nodes the model names. A FILE under `assets/twin/` that is none of the twin's files SHALL be neither bundled nor fetched.
- **FR-010**: THE TWIN'S MODEL SHALL stand at the twin figure's placement: its origin, the floor between its feet, at the placement's origin; facing as the placement turns it, toward the open front; at its own size, unscaled, 1.82 m to the turban's top (Clarifications, Q5). THE TWIN FIGURE'S CATALOG HEIGHT SHALL be raised to the model's measured height, and its bounds to hold the model at rest and its hips in the lean, so the framing, the pick areas, spec 014's protected boxes, and spec 008's obstacles read the twin's real box, never loaded geometry (spec 009 FR-017).
- **FR-011**: THE STAND-IN AVATAR, WHEN it shows as the twin's fallback, SHALL be scaled to the twin figure's catalog height, as spec 009's FR-016 scales it, so the fallback stands as tall as the twin.
- **FR-012**: THE TWIN FIGURE'S PLACEMENT SHALL stand at the lean's spot (FR-029), set as a data edit to the scene, an estimate until the Author's lookdev confirms it.
- **FR-013**: THE TWIN'S FACE SHAPES SHALL ship unused: NO viseme or blendshape SHALL be driven, and THE ROOM SHALL remove the morph targets from the twin's meshes as they load, before the first frame draws them, so they cost no memory or time at run time until lip-sync comes (a later step, the intent's constraint).

**The disclosure**

- **FR-014**: WHILE the twin's figure shows its own picture, THE ROOM SHALL show the twin's line in the stage's note, in the stand-in line's place, and as the first line of "Around the room", in 3D and 2D, as text a screen reader reads. WHILE it shows anything else, THE ROOM SHALL show the stand-in line there instead, as spec 009's FR-013 has it. THE ROOM SHALL never show both lines at once, nor neither.
- **FR-015**: THE BUILD SHALL read the twin's line from `main`'s `assets/policy/approvals.json`, as it reads `main`'s other policy files (its policy directory, then `main` by its full ref, then the tree's copy, which rule A9 holds to `main`'s at the branch's base; [contracts/twin-data.md](contracts/twin-data.md) §5): the `disclosure_line` of the approval whose `sha256` is the twin model's current SHA-256 (today `A-20261110-twin`: "The twin is an AI-made, stylized likeness of the Author, shown by his choice."), and SHALL hold no copy of it in source or room data. THE TWIN'S MODEL, clips, and still SHALL be bundled only WHERE that approval exists with a non-empty line. A STRICT BUILD SHALL refuse a tree where the twin's files exist without it; a lenient build SHALL leave them out, so the stand-in shows with its line.
- **FR-016**: THE AI DISCLOSURE SHALL stay as spec 002's FR-004 has it, visible in every mode, with the twin's line beside it (spec 003 FR-032).
- **FR-017**: THE SITE SHALL serve each of the twin's files as a gzip-9 copy of its plain bytes, so the IPTC mark the arrival check holds stays in what the visitor receives (spec 003 FR-034, to machines).

**Motion**

- **FR-018**: THE TWIN'S CLIPS SHALL play in place: no clip moves the figure's placement; a clip's own hip shift, such as the lean's, is the clip's.
- **FR-019**: THE `arriving` STATE SHALL begin at the hand-off's start WHERE the twin's model shows then, or else when the model first shows in the visit, and SHALL last one play of its clip; it SHALL come once a visit.
- **FR-020**: EACH STATE SHALL play the clip the scene's map gives it, by default `arriving` the greeting, `answering` talking, `listening` listening, `resting` the lean, `present` the idle (Clarifications, Q1). `arriving` SHALL play its clip once; every other state SHALL loop its clip. CHANGING THE MAP SHALL be a data edit.
- **FR-021**: THE TWIN'S STATE SHALL be the first that holds, in this order:
  - (a) `arriving`, while FR-019's play lasts;
  - (b) `answering`, from the moment the twin's answer shows in the conversation, for its speaking time: its words at the scene's pace, 150 words a minute by default, at least 3 s and at most 20 s; a new answer starts it again; a fixed message, a failure, or a stopped turn isn't an answer (Clarifications, Q3);
  - (c) `listening`, while the text box holds text the visitor typed and hasn't sent, or a turn is out;
  - (d) `resting`, once 20 s by default have passed with none of (a) to (c) holding, until the visitor types, selects a piece, or a turn goes (Clarifications, Q1);
  - (e) `present`, otherwise.
- **FR-022**: THE CONVERSATION PANEL SHALL tell the 3D stage what the states need, and nothing else: whether the text box holds unsent text, whether a turn is out, an answer's arrival with its word count, and a piece's selection. IT SHALL pass no words, no topic, and no cost.
- **FR-023**: A CHANGE OF CLIP SHALL crossfade in 0.25 s, and into or out of the lean in 0.4 s, as the hand-back asks, WHILE the motion store animates (Amendment M14).
- **FR-024**: WHILE the motion store doesn't animate (reduced motion, "Pause the room", or a hidden page), THE TWIN SHALL hold a still pose: each change of state SHALL cut to the new clip's first frame, and no clip SHALL advance (spec 009 FR-026). The states SHALL still change as the conversation does.
- **FR-025**: WHILE the quality level is 1 or more, THE TWIN SHALL animate and the visitor's figure SHALL hold its frame, as spec 009's FR-027 has it.
- **FR-026**: WHERE the twin's figure shows the stand-in, THE STAND-IN SHALL play spec 009's clips and rules, and the states SHALL NOT apply to it.
- **FR-027**: THE TWIN SHALL turn toward the visitor during the hand-off as spec 002's turns turn the twin's figure, and SHALL NOT turn to follow the visitor otherwise.
- **FR-028**: THE TALKING CLIP SHALL be body motion only; the lips stay still until lip-sync comes (FR-013).

**The lean against the desk**

- **FR-029**: THE LEAN SHALL play only WHERE the scene's lean block names the work desk's placement and the twin's placement stands at the lean's spot: the desk's origin `behind_m`, 0.679 m by default, straight behind the twin's root, and the desk facing as the twin faces, each within 1 cm and 1°; with at least `right_m`, 0.45 m by default, of the desk's top on the twin's right of its root (the hand-back's figures). OTHERWISE a strict build SHALL refuse it, and a lenient build SHALL leave the lean out, the twin resting in its idle.
- **FR-030**: THE LEAN'S DEFAULT FIGURES SHALL be the hand-back's for the delivered work desk and the delivered clip, and CHANGING them SHALL be a data edit.

**The hand-off**

- **FR-031**: WHERE the twin's figure shows its own picture when the hand-off starts, THE PAPER SHALL appear with the visitor (Clarifications, Q2):
  - (a) no sheet SHALL show at the twin's hand at any frame;
  - (b) the paper SHALL fade in at the visitor's holding hand, at its grip (spec 014 FR-038 to FR-040), or at the visitor's hand anchor where the visitor shows its fallback, from opacity 0 at the hand-off's start to 1 at its end;
  - (c) the visitor SHALL turn as spec 002 has it and SHALL play "idle-holding" from the start, with no "take";
  - (d) the twin SHALL play `arriving` (FR-019) and turn as FR-027 has it;
  - (e) the hand-off's length, its announcement, and the offer after it SHALL stay spec 002's (4.5 s, never more than 5 s; 1 s under reduced motion, a fade with no turn).
- **FR-032**: WHERE the twin's figure shows the stand-in or the capsule when the hand-off starts, spec 009's FR-019 and FR-020 and spec 014's FR-041 SHALL hold as written.
- **FR-033**: THE TWIN SHALL have no grip; spec 014's grips data SHALL stay as it is, for the avatars of the room's table.

**The 2D room**

- **FR-034**: IN THE 2D ROOM, THE TWIN'S PLACE SHALL show the twin's still in place of its drawing, inside the scene's still rectangle in the twin figure's frame (by default the figure's box's width, its top at the box's top), clipped to the twin figure's box, its aspect kept, never stretched, with the twin's line (FR-014). The 2D drawing's hit areas, the figures' boxes, and the frame area SHALL stay as they are. IF the still fails after its retry, THEN the twin's drawing SHALL show, with the stand-in line.
- **FR-035**: THE STILL SHALL be fetched at most once a visit, only WHEN the 2D room shows, from the site's own origin under a content-derived name, with its integrity checked, and shown without a change to the site's content security policy.

**The shirt's lettering**

- **FR-036**: WHERE the twin's model shows and the outline is published (FR-038), THE ROOM SHALL draw the Author's words "Denver Local AI Solutions", "Denver Local AI" larger over "Solutions", as the studio's outlines set them, on the model's live face `twin-shirt-lettering`: the outline's paths alone, in black, `#000000`, on a transparent canvas, drawn into the face's own material with an alpha cut-off, so the shirt shows around the letters; the SVG's 180 × 70 mm laid across the face's 0 to 1 texture coordinates, upright and reading left to right from the front.
- **FR-037**: THE LETTERING SHALL be drawn on the skinned face itself, never on a separate plane, so it moves with the chest; and the face SHALL draw no ink line from the inked-cel look's outline pass.
- **FR-038**: THE LETTERING SHALL be room text: the outline SHALL be published only WHEN `main`'s `assets/policy/content-approvals.json` approves its current SHA-256 with the kind `room-text` (spec 004 FR-030, Amendment B9). A DRAFTS BUILD SHALL draw it marked as a draft; a release build SHALL leave the face its model's own plain white, and its words SHALL appear nowhere in the build's output, until the Author's approval is on `main`. A face the scene binds to an outline that doesn't resolve SHALL be refused (spec 004's RI4).
- **FR-039**: THE STUDIO'S SVG AND JSON for the lettering SHALL live in the repository, byte for byte as delivered, at `apps/web/content/lettering/twin-shirt-lettering.svg` and `.json`, as the outline's sources, under `apps/web/` and not `assets/`, read by no build. THE OUTLINE SHALL be converted from them: its paths the SVG's, in order, unchanged; its words the JSON's `words`; its view box the SVG's, 180 × 70; its cap height the larger line's, 14.674. A TEST SHALL prove the outline equals that conversion. THE STUDIO'S BRIEF SHALL stay outside the repository; this spec and its plan hold what the code needs from it.
- **FR-040**: THE SHIRT'S FACE SHALL be an atmosphere face, since its glyphs fall under the legibility floor at the production framing: its words SHALL be carried by "Around the room" under its label, a new label UI word, marked as a draft where the face is (spec 004 FR-052, FR-063).
- **FR-041**: WHERE the twin's figure shows the stand-in, the capsule, or the 2D still, NO LETTERING SHALL be drawn for the shirt.

**The credits**

- **FR-042**: THE ROOM'S TOOLBAR SHALL offer "Credits", the UI word `toolbar.credits`, in 3D and 2D, reachable by keyboard, linking to a page on the site's own origin built at each build from `assets/CREDITS.md`, whose first part lists each asset directory with a link to its records.
- **FR-043**: FROM THE ROOM, a visitor SHALL reach the record of each of the twin's files in at most two clicks: "Credits", then the twin's directory (spec 003 FR-033).

**Loading and budgets**

- **FR-044**: WHEN the 3D stage mounts above the floor, THE ROOM SHALL fetch the twin's model and the chosen avatar's model at once, each file once, then their clips, the twin's in the closed list's order; THE ROOM'S MODELS SHALL start once both figures' files have been fetched or have failed (spec 009 FR-021, the twin's own in the stand-in's place); and THE STAND-IN'S FILES SHALL be fetched only after the twin's model has failed, unless they are the chosen avatar's (Default D1). WHERE the bundle holds no twin model (no files, or left out by FR-015 or FR-055), spec 009's FR-021 stands as written: the stand-in's model with the chosen avatar's, at once.
- **FR-045**: THE TWIN'S TEXTURES SHALL decode at most the scene's twin texture side a side, keeping their aspect, by default the scene's `texture_px`, 1,024 (Clarifications, Q4), and at half that WHILE the quality level is 1 or more as they decode, through the texture ledger (spec 009 FR-024).
- **FR-046**: THE COMPOSITOR'S RK3 SHALL count the twin's figure as the larger of the twin's model at its decoded size and the stand-in avatar's files at theirs; RK5 SHALL count the first visit as the room's served files, the twin's served files, and the largest visitor avatar's, by their gzip-9 copies, against `main`'s phase-3 budget, as the arrival check's F3 counts it (Amendment M16).
- **FR-047**: THE LOADER'S PROGRESS (spec 012) SHALL count the twin's files among its expected files by their served bytes; a stand-in fetched after the twin fails SHALL count for nothing.
- **FR-048**: THE SITE SHALL serve the twin's GLBs as spec 004's FR-079 serves a GLB, one gzip-9 copy each, at `a/twin.<hash16>.glb` and `a/twin-<role>.<hash16>.glb`, and its still as its plain bytes at `a/twin-still.<hash16>.png`, each content-addressed and cached for a year. THE WEB IMAGE'S BUILD SHALL read the tree's `assets/twin/`, so `make up` serves the twin, and a build without it SHALL show the stand-in and still build.

**Telemetry**

- **FR-049**: WHEN one of the twin's files loads, retries, fails, or is skipped, THE ROOM SHALL record spec 003's asset event through the room's queue, keyed by its served stem; they SHALL be sent only WHILE the index's `live.asset_events` is `site`, which this spec doesn't turn on (spec 009 FR-031).
- **FR-050**: WHEN the twin's model or one of its clips has failed after its retry, it SHALL count toward spec 009's `avatar_failed`, sent at most once a visit, with no identifier; THE ROOM SHALL send no new event kind, and nothing that names the twin, its state, or its clip.
- **FR-051**: THE DASHBOARD'S "Visits whose avatar failed" panel (spec 009 FR-034) SHALL be the twin's graph, its reading naming the twin's files among those it counts. No new panel or series is added.
- **FR-052**: IN A DRAFTS BUILD, THE FRAME LOG SHALL record the twin's picture changes (its model, the stand-in, the capsule, its still, its drawing, and why) and its state and clip changes, in page memory only. A release build SHALL keep no log.

**Data flow**

- **FR-053**: ROW V1 of the data-flow disclosure SHALL name, in the change that first serves them: the twin's model and clips, fetched in every 3D visit above the floor and the same for every visitor; its still, fetched in a visit that shows the 2D room; the stand-in's files, fetched where the twin's model fails or the visitor chose them; and the credits page among the pages a visitor may open. IF the room would serve them without that wording, THEN it SHALL NOT be deployed. NOTHING ELSE this spec adds SHALL leave the visitor's device; row V4 stays as it is.

**As data, and the compositor** (spec 004's FR-001 and FR-006; the Author's "features should be modeled with that abstract perspective rather than one-off hard-coded")

- **FR-054**: THE SCENE'S `figures` BLOCK SHALL gain an optional `twin` block: the state-to-clip map; the resting time, 20 s; the speaking pace, 150 words a minute, and its bounds, 3 s and 20 s; the lean block, naming the desk's placement, `behind_m`, and `right_m`; the twin's texture side, the scene's `texture_px` by default; and the still's rectangle. EACH SHALL have its default, and CHANGING ONE SHALL be a data edit, with no source file changed.
- **FR-055**: THE COMPOSITOR SHALL check the twin, refusing in a strict build with `<rule> <file>:<path>: <reason>`, and in a lenient build warning and leaving the file out, so the twin's figure shows its fallback and `make up` builds:
  - a file of the twin's that isn't recorded with its kind and hash, can't be read, moves a node its model doesn't name, or is over `main`'s cap for its kind;
  - the twin's files without an approval on `main` naming the model's current hash with a line (FR-015);
  - the lean's spot (FR-029);
  - a state or a clip role in the `twin` block outside its closed list;
  - RK3 and RK5 as FR-046 counts them.
- **FR-056**: THE COMPOSITOR'S REPORT SHALL give, for the twin: each file's bytes, gzip-9 bytes, triangles, and texture memory at its own size and decoded; the model's measured height and bounds; its clips; whether each is bundled and why not; the line's approval by ID; the lean's spot against the placement; RK3's and RK5's figures with the twin; and the first visit beside the arrival check's F3 view.

**The lookdev page**

- **FR-057**: THE LOOKDEV PAGE, in drafts builds only, SHALL show the twin in its figure, play each state's clip, show the lean against the desk, play the hand-off normally and under reduced motion with the paper appearing, show the shirt marked as a draft, and show the 2D still with its line; and SHALL report the frame figures it reports for the room.

**The scrub**

- **FR-058**: WHEN `scripts/assets/scrub.py` runs with `--record` and the record's `directory` is `assets/twin`, under it, or `docs/research/images`, THE SCRUB SHALL write `trainedAlgorithmicMedia`, whatever the steps' `by`, as the arrival check's C1 wants; otherwise the mark SHALL follow the steps, as today.

**Accessibility**

- **FR-059**: THE TWIN, its still, and the shirt SHALL be pictures only: the canvas and the 2D drawing stay hidden from assistive technology, and nothing new is focusable but the "Credits" link. THE ROOM SHALL meet WCAG 2.2 level AA with the twin, the lines, and the link, and on a 320 × 568 screen SHALL keep the text box and the talk button on screen.

### Key Entities

- **The twin's files**: the model, the five clips by role, and the still, each with its served URL, SHA-256, served bytes, and decoded texture memory (FR-009, FR-048).
- **The twin's line**: the approved words read from `main`'s approval of the model's hash (FR-015).
- **The twin block**: the state-to-clip map, the timings, the lean block, the texture side, and the still's rectangle (FR-054).
- **A state**: `arriving`, `answering`, `listening`, `resting`, `present`, chosen by FR-021's order from the conversation's signals (FR-022).
- **The lean's spot**: the placement where the desk's origin is `behind_m` straight behind the twin's root (FR-029).
- **The outline**: the shirt's lettering as room text, approved by hash, converted from the studio's SVG and JSON (FR-038, FR-039).
- **The twin's picture**: its model, its still, the stand-in, the capsule, or its drawing, with the line that matches it (FR-014).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the 3D stage's tests, the twin's lowest point is within 0.5 cm of the floor, its height within 1% of 1.82 m, its root within 0.5 cm of its placement's origin, and its facing within 1° of its placement's turn, in 100% of cases; and the Author confirms the twin at lookdev on both reference stages (L1).
- **SC-002**: In fault-injection runs for each of FR-002's faults on the twin's model and each clip, a failing idle, below the floor, in 2D, a lost and a restored context, and every degraded state of FR-001, 100% end with the twin's figure showing its model, the stand-in, or the capsule (in 2D its still or its drawing), the matching line, the AI disclosure, and a working text box; 0 end blank or frozen; the camera and the pick areas are unchanged in 100%.
- **SC-003**: In 100% of the tests' visits, exactly one of the two lines shows; it is the twin's line while and only while the twin's own picture shows; and the source tree and the room's data hold 0 copies of the twin's line.
- **SC-004**: On a fake clock, over a table of conversation signals, the twin's state and clip match FR-021's order in 100% of steps, each speaking time is within 50 ms of its words at the pace within its bounds, and the lean begins within 50 ms of 20 s of quiet.
- **SC-005**: With reduced motion, "Pause the room", or a hidden page, the twin shows 0 frames of clip motion and 0 crossfades; with the motion store animating, crossfades take 0.25 s, and 0.4 s into and out of the lean, within one frame.
- **SC-006**: In the hand-off's tests with the twin's own picture, 0 frames show a sheet at the twin's hand, the paper ends within 2 cm of the visitor's grip, and the hand-off ends within 5 s of its start, in 100% of runs; with the stand-in, spec 009's SC-006 holds.
- **SC-007**: In the shirt's tests, the drawn canvas has ink only where the outline does and is transparent elsewhere; sampled at the face's corner vertices' texture coordinates, the lettering's top-left lands at the face's top-left as seen from the front; a release build without the approval draws 0 of its words and its output holds them 0 times; a drafts build marks it; the face draws 0 ink lines.
- **SC-008**: For the default scene with this branch's tree, RK3's total is within `main`'s `scene_texture_bytes` and RK5's first visit within 25,000,000 bytes, each with a fixture over its limit that a strict build refuses; the report prints both beside F3's view.
- **SC-009**: After the twin's model loads, its meshes carry 0 morph attributes, and lookdev's memory figures show no morph texture.
- **SC-010**: In 100% of the tests' 2D visits, the twin's place shows the still, clipped to its box, with the twin's line; 0 visits that start in 2D request a 3D file of the twin; 0 visits that stay in 3D request the still.
- **SC-011**: In the network logs of the tests' 3D visits, the twin's files are requested once each, from the site's own origin, each with its integrity, in 100%; the stand-in's files 0 times unless the twin's model failed or the visitor chose them; and 0 requests go to a third-party host.
- **SC-012**: From the room, in 3D and 2D, by pointer and by keyboard, the twin's records are reached in at most 2 activations, in 100% of runs.
- **SC-013**: On the reference phone, the lookdev phone copy's 2-minute run with both figures animating holds a median of at least 30 frames a second with at least 95% of frames within 33 ms (the Author's run, L4).
- **SC-014**: Each data-only change of the proof set (the lean given to `listening`, the resting time to 10 s, the pace to 120, the twin's texture side to 512) passes `make check` with 0 source files changed.
- **SC-015**: The scrub's test: with `"directory": "assets/twin"` and mixed steps, the written mark is `trainedAlgorithmicMedia` in 100% of runs; under another directory, `compositeWithTrainedAlgorithmicMedia`.
- **SC-016**: The automated check reports 0 WCAG 2.2 AA violations with the twin, the lines, and the link; on the 320 × 568 model the text box and the talk button stay on screen.
- **SC-017**: The compositor's lean check places the twin within 1 cm and 1° of the lean's spot for the default scene, refuses a known-bad fixture in a strict build, and leaves the lean out in a lenient one; and the Author confirms at lookdev that the twin rests against the desk with nothing through him (L3).
- **SC-018**: The outline's test proves it equals the conversion of the committed SVG and JSON; his patch applies to a plain copy of `main`'s `content-approvals.json` and adds exactly C-0004.

## Amendments to Specs 002, 003, 004, 005, 008, 009, 012, and 014

As specs 004 and 009 did, this spec names the clauses it amends; their text stays as it is, and each amendment supersedes the clause it names from this spec's approval.

| ID | Spec and clause | Change | Why |
|---|---|---|---|
| M1 | Spec 002, FR-005 ("the twin's avatar standing at the computer desk") | Now the twin's own avatar, standing at the lean's spot by the desk (FR-010, FR-012). | User Story 1. |
| M2 | Spec 002, FR-007 ("the twin's avatar hands the visitor's avatar a paper") and contracts/room-scene.md §3 | Where the twin shows its own picture, the paper appears with the visitor, fading in at its hand; the turns, the length, the announcement, and the offer stay. Where it shows the stand-in, spec 009's hand-off stands. | FR-031, FR-032; his "The paper can appear with us". |
| M3 | Spec 003, FR-021 ("within 2 seconds … show the twin's still image in the avatar's place") and User Story 2's first scenario | In 3D, the twin's fallback is spec 009's stand-in chain, the capsule at once and the stand-in once ready, with the stand-in line; the still is the 2D room's (FR-023, FR-034). | FR-002; his "the stand-in man stays as the fallback if your model can't load". |
| M4 | Spec 003, FR-028 and Confirmation 4, as spec 009's M10 extended them | The twin's files are fetched in every 3D visit, the same for every visitor; the stand-in's only after the twin's model fails or as the chosen avatar's. | FR-044. |
| M5 | Spec 003, FR-034 ("a visible line in the twin's disclosure") | Read as the stage's note beside the AI disclosure and the first line of "Around the room", spec 009's place for the line, in the Author's approved words, read from his approval. | FR-014, FR-015. |
| M6 | Spec 003, tasks.md Phase 5 (T040 to T049) and its "Waits for spec 001's site and relay" | Re-planned without the relay. This spec takes T040's fault injection, T044's twin half (the retry and the fallback), and T045 (the line, the credits link and page), through the room's bundle and loader. T041's manifest, T042's and T046's events route and row V6, and T047's edge transfer stay with spec 001. | The intent's problem; spec 009's M12. |
| M7 | Spec 003, contracts/site-loading.md §1 to §3 | The twin's files come through the room's bundle and loader, as spec 009's M12 gave the visitors', not through `assets.json`. | FR-044, FR-048. |
| M8 | Spec 009, FR-011 ("in this spec, always") and FR-012 | The twin's figure shows its own model where the bundle and the approval allow, and the stand-in is its fallback. FR-012 holds for the stand-in: it reads nothing under `assets/twin/`. | FR-002, FR-008. |
| M9 | Spec 009, FR-013 and its (b), and Default D3 | The stand-in line shows while the twin shows anything but its own picture; the twin's line, the likeness line FR-013 (b) withheld, shows while its own picture does. | FR-014. |
| M10 | Spec 009, FR-016 (the twin's target height, its catalog height, 1.75 m) and Q3 | The twin's own model is unscaled; the catalog height becomes its measured height, 1.82 m, to which the stand-in scales. | FR-010, FR-011; Q5. |
| M11 | Spec 009, FR-019 and FR-020 | Where the twin shows its own picture, FR-031 replaces them; where it shows the stand-in, they hold. | FR-031, FR-032. |
| M12 | Spec 009, FR-010 and FR-021 (the stand-in fetched in every visit; the order) | The twin's files take the stand-in's place in the order; the stand-in is fetched only after the twin fails. | FR-044. |
| M13 | Spec 009, FR-024 and FR-037 (`texture_px`) | The twin has its own texture side in the `twin` block, by default `texture_px`. | FR-045, FR-054. |
| M14 | Spec 009, FR-025 ("a change of clip crossfades in at most 0.25 s") | Into and out of the twin's lean, 0.4 s, the hand-back's figure. | FR-023. |
| M15 | Spec 009, FR-030 and Default D7 (the 2D room's twin as its drawing) | The 2D room shows the twin's still, its drawing only where the still fails. | FR-034. |
| M16 | Spec 009, FR-038's RK3 ("the larger of its own models under `assets/twin/`", counted at their own size) and RK5 ("the stand-in avatar's files") | RK3 counts the twin's model at its decoded size; RK5 counts the twin's served files in the stand-in's place, and the largest visitor avatar of all four, as F3 does. The RA family gains the twin's checks (FR-055). | FR-046, FR-055. |
| M17 | Spec 009, FR-036 and its M6 (row V1's wording) | V1 names the twin's files, its still, the stand-in's on failure, and the credits page. | FR-053. |
| M18 | Spec 004, contracts/room-data-files.md §4 (`live_faces[]`), §5.3 (the renderers' closed list), §13 (RI8: a figure's piece has no model) | A live face may say `surface: model`: drawn into its avatar's own mesh of that name, with an alpha cut-off, never a quad; a figure's piece may declare one. The renderers gain `print`: an outline's ink alone, black, on a transparent canvas. | FR-036, FR-037. |
| M19 | Spec 004, contracts/room-bundle.md §3.1 and §3.2, and FR-056 | The index gains the twin's line and still; the 3D part gains the twin's files and its block; the load order is FR-044's. | FR-014, FR-044. |
| M20 | Spec 004, contracts/serving.md §3; spec 002's web-serving, as spec 009's M19 extended them | `web_image.py` hands over `assets/twin/` as a third named context, `twin-assets`. | FR-048. |
| M21 | Spec 002's contracts/resume-source.md §5 and spec 004's policy files (`build/approvals.ts`'s `POLICY_FILES`, `web_image.py`'s list) | `main`'s `assets/policy/approvals.json` becomes the policy's fourth file, read through the same channel, so the twin's line comes from `main`; the policy's digest covers four files. | FR-015. |
| M22 | Spec 014, FR-010 (b), FR-041, and FR-055 | The twin's framed box is its new box; FR-041 holds where the twin shows the stand-in; FR-055's "the twin's stand-in keeps spec 009's line alone" becomes FR-014's line rule, still one slot. | FR-010, FR-014, FR-032. |
| M23 | Spec 012, contracts/loading-progress.md §3 (`figureEntries`) | The expected files include the twin's; a stand-in fetched after failure counts for nothing. | FR-047. |
| M24 | Spec 008, FR-026's obstacles | The twin's obstacle is its new box at its new place, from the data, as SC-003's moved copies already test. | FR-010, FR-012. |
| M25 | Spec 005, User Story 1's sixth scenario ("while the twin's figure shows a stand-in, so is the stand-in line") | And while it shows its own picture, so is the twin's line. | FR-014. |
| M26 | ADR 0010's text: its caps (6,000,000 bytes, 90,000 triangles, 33,554,432 of texture memory), its "first set", and its clips' place | `main`'s caps are his f21eff08's; the twin's first set gains the lean; the twin's clips sit beside its model in `assets/twin/`, as the studio delivered them. The ADR's text is the Author's to change; the plan offers the words. | FR-009. |

## Assumptions

**Scope and order**

- **Scope.** This spec owns the twin's own avatar in the room: its picture, its line, its states and clips, its lean, the paper's appearance, its 2D still, its shirt's lettering, the credits link and page, its budgets, its telemetry, the scrub's mark, and the amendments above. Outside it: lip-sync, the face shapes' use, and a viseme driver; push-to-talk and voice; the twin turning to follow the visitor; a holding clip, a grip, or a "take" for the twin, which the studio is making ("We will add those later"); spec 001's relay, the asset events' route, and row V6; a check of the model's 67 shapes by name; and any cap change.
- **The base.** The branch is cut at his intake commit, which passed the arrival check. At the base, before this spec's code, RK3 counts the twin's model at its own size, about 215.1 million bytes of 200,000,000 by the last report's figures, so `make check` is expected to fail RK3 there; the first code task brings RK3 to FR-046's count (plan.md §4, R-02).
- **The Author's hand.** The intake and the approvals are his and are done. His remaining steps are lookdev, the shirt's approval patch, and the gate (User Story 10). Agents edit nothing under `assets/**`, `assets/policy/**`, `corpus/`, or `.claude/**`, and read no studio folder.
- **The hand-back folder** sits outside the repository and isn't a studio folder. The SVG and the JSON come in byte for byte by the session that commits, each checked against the hand-back's `SHA256SUMS` (tasks.md T002).

**Readings of the inputs**

- **The files**, as the hand-back describes them and the intake brought them in: the model, 20,132,936 bytes before the scrub, 172,804 triangles, 44,739,242 bytes of texture memory (two 2,048 × 2,048 WebP), ADR 0010's 55-bone Mixamo skeleton with three bones a finger, and 67 face shapes on each of its two primitives; the clips, idle 4 s, talking 6 s, listening 5 s, the greeting 2.47 s played once, and the lean 6 s, each looping but the greeting, 30 frames a second, the same 55 bones; the still, 480 × 640. The model stands with the floor at its origin, +Y up, facing +Z, 1.82 m to the turban's top.
- **The lean**, as the hand-back solved it: against the delivered desk, its top at 1.073 m and 0.8 m deep; the desk's origin 0.679 m behind the twin's root, its front edge 0.279 m behind; the right forearm on the desk's top; at least 0.45 m of desk to the twin's right; crossfaded from the idle in place in about 0.4 s. The room's desk, its catalog's 1.5 × 0.8 m, stands 0.4 m from the back wall, so the lean's spot is about 7.4 cm in front of the twin's placement today (plan.md R-06).
- **The shirt's face**, as the brief describes it: one quad, 0.180 × 0.070 m, centred on the chest at 1.285 m, tilted back about 4.5°, skinned to the chest's own weights, its texture coordinates filling 0 to 1, U left to right and V bottom to top, as seen from the front; a plain material in the shirt's white. The outlines: one path per glyph, nonzero fill, black, in a 180 × 70 mm view box, IBM Plex Sans Bold under the SIL OFL 1.1; the first line's cap height 14.674 mm, the second's 8.795 mm.
- **The words** are the Author's business name, which the site already shows (the chalkboard's approved line, C-0003, and the corpus). His approval of the outline's hash is the content approval spec 004 requires of room text.
- **The conversation**, as spec 007 has it: the twin's answer arrives whole, after the guards, with a waiting status while the turn is out; fixed messages are the room's, not the twin's; the talk button announces that voice isn't available. When push-to-talk lands, its capture counts as typing for `listening`.
- **The twin's line** names no withheld detail and states only what his approval states.
- **No withheld detail** of the Author's goes into any committed file: this spec and its plan copy from the hand-back only what the code needs, the model's measured height among it, and nothing personal beyond.

**Deviations** (named, as the constitution's Governance requires)

- **The constitution's Technology Standards, Frontend: "real-time 3D avatar rig rendered in the browser with viseme-driven lip-sync".** Lip-sync is deferred: the face shapes ship unused, at the intent's constraint, "Lip-sync is out of scope here unless the Author wants it: the shapes arrive now, and using them is a later step", and his "Yes, take those (Recommended)" to "lip-sync later". Temporary, so no ADR; the shapes are in the files for the later step.
- **Spec 003's FR-021**, the twin's still "in the avatar's place" in 3D within 2 seconds of a failure, is replaced in 3D by the stand-in chain (M3), at his answer. In 2D the still stands.
- **Spec 009's FR-025**, a crossfade "in at most 0.25 s", is exceeded by the lean's 0.4 s (M14), the hand-back's figure.
- **`CLAUDE.md`: "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`"**, and the lifecycle's order. The code is built on this branch ahead of his approval of the spec and plan, at the main session's direction, under his "okay that is finished, update the runbook and go ahead" and "I want to get this product out with the version we have", which are not his approval. Nothing merges before his gate, which reviews the branch as built; a no to any provisional answer changes the branch before it merges.
- **Inherited: local until publication** (ADR 0013). Reviewed as a branch with a note in `docs/merge-requests/`.
- **Not a deviation:** no new flow leaves the visitor's device (row V1's wording, FR-053); no permission, allowlist, sandbox domain, content security policy, budget, cap, or human-only file changes; the approval patch is built for his hand from plain copies.

## Expected Cost Impact

- **Model spend: $0.** The twin calls no model (FR-001).
- **Transfer.** $0 before publication (ADR 0013). After it, a first 3D visit fetches the twin's model and clips, about 8.7 MB as gzip-9 copies, in place of the stand-in's files, about 3 MB: about 5.5 MB more per first 3D visit, the first visit about 18.5 MB of spec 003's 25 MB by the arrival check's count of the first version. A visit whose twin fails after its full transfer adds the stand-in's, about 3 MB more, still under 25 MB. A visit in 2D fetches the still, 239,035 bytes, instead of nothing. At 1,000 first visits a month, about 5.5 GB more: about $0.50 a month at $0.09 per GB, and $0 inside a free transfer allowance. Cached for a year, so a returning visit fetches nothing.
- **Requests.** No new event; `avatar_failed` at most once a visit, as today.
- **Code.** An estimated 8 to 15 KB gzipped in the lazy 3D chunk (the states, the twin's source, the model-surface face, the morph strip), under 2 KB in the entry chunk (the line, the still, the credits link), inside spec 002's 150 KB, which the build measures.
- **Local.** No new service, container, or port. `make up`'s web image takes `assets/twin/` as a build context; its build time grows by the gzip of about 20 MB.
- **The Author's time.** Lookdev on both stages and the phone run, about an hour; the shirt's patch, minutes; the gate.
- **Dev time.** Agent sessions under his plan.
- **Measurement.** The report's RK3, RK5, and first-visit lines in the merge-request note (FR-056); the build's chunk sizes; the "Visits whose avatar failed" panel.

## Degraded-Mode Behavior

| What is gone or off | The twin's figure | Its line | The rest of the room |
|---|---|---|---|
| The local tier off, the budget spent, the kill switch `degraded` or unknown, the live source off | its model, as always; its states follow the panel, which shows fixed messages, so it never plays talking | the twin's | as today; only the conversation degrades |
| No approval on `main` naming the model's hash with a line | the stand-in, else the capsule | the stand-in line | as today |
| The model blocked, timed out, failing integrity, not 200, corrupt, or over the ledger | the capsule, then the stand-in once fetched and ready; `avatar_failed` once a visit | the stand-in line | keeps drawing |
| The stand-in fails too | the capsule | the stand-in line | – |
| A clip fails | the idle in that state's place | the twin's | – |
| The idle fails | the model standing still in its rest pose | the twin's | – |
| The desk or the twin's placement off the lean's spot | the idle in the lean's place | the twin's | – |
| Below ADR 0010's floor, or 2D from the start | the 2D still; no 3D file fetched | the twin's | the 2D room |
| The room falls to 2D | the 2D still; nothing more fetched for 3D | the twin's | the visit kept |
| The still fails | the twin's drawing | the stand-in line | the 2D room |
| The 3D context lost | its fallback until restored; no second greeting | the matching line | as spec 002 |
| Reduced motion, "Pause the room", or a hidden page | still poses, cuts between states | the twin's | final frames |
| Quality level 1 or more | animates; textures at half size | the twin's | the visitor holds its frame |
| The shirt unapproved in a release build | a plain white shirt | – | – |
| The shirt's canvas can't be drawn | a plain white shirt | – | – |

## Data-Flow Disclosure Entries

For `docs/data-flow-disclosure.md`, in the same change as the serving (FR-053). No new row.

| Row | From → To | Trigger | Carries | Never carries | Why | Default; how to switch it off |
|---|---|---|---|---|---|---|
| V1, amended (M17) | as before: the visitor's browser → the site's own origin | as before, and following "Credits" | as before, with the avatar files now: the twin's model and clips in every 3D visit above the floor, the same for every visitor; the twin's still in a visit that shows the 2D room; the stand-in's files only where the twin's model failed or the visitor chose them; and the chosen avatar's where it has files, whose paths show which avatar the visitor chose | as before: anything to a third-party host | as before: the room's static assets and pages; the twin and the credits are among them | as before |

Row V4 is unchanged: `avatar_failed` already covers "a figure's avatar failing to load, once a visit", and the twin's files are a figure's.

## The "New Endpoint or Feature" List (`CLAUDE.md`)

- **Endpoint:** none.
- **Telemetry span:** no new span. The twin's failure rides spec 009's `avatar_failed`, whose span is the gateway's server span for `POST /room/events`; the asset events are built and stay off; a drafts build's frame log records the twin's pictures, states, and clips (FR-049 to FR-052).
- **Dashboard panel:** no new panel; the existing "Visits whose avatar failed" panel is the twin's graph, its reading updated (FR-051).
- **Cost estimate:** above.
- **Degraded-mode behavior:** above, and FR-001 to FR-007.
- **Data-flow disclosure entry:** row V1's wording, in the serving change (FR-053); no new flow.

## Constitution Check

Applied with the `constitution-check` skill's eight questions against constitution 1.1.0.

| Principle | Touched | How it complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | The twin's files and still are same-origin static files, the same for every visitor; row V1's wording names them in the serving change (FR-053); no new flow, no new event, nothing stored. No biometrics: the twin's likeness is the Author's, approved by him; visitors still choose pre-generated avatars. The degraded mode is defined first (FR-001 to FR-007; User Story 2, P1). |
| II. Production-grade or not shipped | Yes | SC-001 to SC-018, each with tests or the Author's run; the existing failure panel as the graph; the frame log; the cost estimate and its measurement in the report; no alert, so no runbook entry; no model, so no evals; the plan names the docs a cold reader needs. |
| III. Intent before spec, spec before code, humans merge | Yes | From the accepted intent, its words quoted, readings beside them; amendments named, not edited in. Deviation: the code is built ahead of his spec and plan approval, at the main session's direction; nothing merges before his gate. |
| IV. Least privilege | No | No permission, allowlist, sandbox domain, content security policy, credential, cap, or human-only path changes. The approval patch is built for his hand from plain copies; agents never write `assets/policy/**`. The compositor's new rules only narrow what a build may hold. |
| V. Cost is a first-class signal | Yes | $0 model spend; about 5.5 MB more per first 3D visit after publication, measured in the report; RK3 and RK5 hold the scene to `main`'s caps (Q4 keeps them without a raise). |
| VI. Build in public, including failures | Yes | The spec, its provisional answers, the twin's records, and the credits page are public; the twin's line comes from his public approval; nothing private is added, and nothing withheld. |
| VII. Own the whole product, and say exactly what you owned | Yes | The product reasoning is in the Clarifications: why the lean rests, why the paper appears, why the twin's own height, why 1,024 texels. The Author's words are quoted, never paraphrased; the records say which steps the studio's agent did. |
| VIII. Honest AI | Yes | The twin's likeness never shows without his approved line, read from his approval of that file's hash (FR-015); the stand-in never shows with the likeness line (FR-014); the AI disclosure stays in every mode; the files carry the IPTC mark to the visitor (FR-017). No model call, so no corpus or refusal change. Deviation: lip-sync deferred, named above. |
| Security & Agent Governance | No | No agent configuration changes; the implementer doesn't review its own work; the reviewer's Arriving-assets and Room-data passes read the twin's files and the outline (plan.md §6). |

## Open Questions for `/speckit-clarify`

The five questions were taken with their recommended options on 2026-11-10 (Clarifications); each stays open for the Author's yes or no. The twelve defaults after them were taken the same way.

### Q1: When does the twin lean back on the work desk? (FR-020, FR-021, FR-029)

Answered on 2026-11-11, after the Author's lookdev: "Lean off for now (Recommended)". The lean is off for this release, the twin resting in its idle, until the studio's re-export of `desk-lean.glb` comes in through a new intake and the same data line brings it back; the options below then apply (Clarifications, Q1; plan.md R-19).

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | The resting pose between conversations: after 20 s with no typing, no turn out, and the twin not talking; left when the visitor types, selects, or a turn goes | Follows the intent's recorded reading; the idle stays the stance while a visitor is there. |
| B | His everyday stance: the lean whenever he isn't greeting, listening, or talking, the idle only as the bridge from the greeting | Follows his approval's reason, "typical lean when talking to someone"; a data edit from A. |
| C | While he listens, in place of the listening clip | The other reading of that reason; the listening clip then unused; a data edit from A. |

### Q2: How does the paper reach the visitor when the twin shows its own figure? (FR-031 to FR-033)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | It fades in at the visitor's hand over the hand-off, the twin greeting; turns, length, announcement, and offer unchanged | His "The paper can appear with us"; spec 002's timing and words kept. |
| B | No hand-off: the paper is in the visitor's hand from the start, the offer at once | Shorter arrival; amends spec 002's FR-007 timing and its announcement. |
| C | The paper travels from the twin's hand anchor, as with the capsule | A sheet floats from beside a hand that doesn't hold it. |

### Q3: How long does the talking clip play for an answer that arrives whole? (FR-021, FR-022)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | From the answer's arrival, at 150 words a minute, 3 s to 20 s; listening while the turn is out | The twin seems to say what the visitor reads; data values. |
| B | While the turn is out, when the status says the twin is answering; the idle once the answer shows | Matches the status's words; the twin gestures before any words appear. |
| C | One loop of the clip, 6 s, per answer | Simplest; unrelated to the answer's length. |

### Q4: At what size do the twin's textures decode? (FR-045)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | At most 1,024 a side, the room's avatar side | RK3 stays about 181.6 M of 200 M; no cap change; the face at half its delivered side. |
| B | At 2,048, the delivered side | The face's full detail; needs his raise of `scene_texture_bytes` to at least 215,109,289; more memory on phones. |

### Q5: How tall is the twin, and where does it stand? (FR-010 to FR-012, FR-029)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | Its own size, 1.82 m, unscaled, the catalog height raised; its placement moved about 7.4 cm forward to the lean's spot, a data edit | The lean rests on the desk as solved; the framing and the protector re-measure. |
| B | The catalog's 1.75 m, scaled | The elbow misses the desk's top by about 4 cm, so the lean is left out. |
| C | Its own size; the placement unchanged; the lean steps the twin 7.4 cm forward as it starts | The composition unmoved; a visible step in and out of each rest. |

### Defaults taken, for a yes or a no

- **D1. The stand-in's files** are fetched only after the twin's model fails, or as the chosen avatar's (FR-044). On a no: fetched in every visit beside the twin's, about 3 MB more, the fallback ready at once.
- **D2. The 2D still's rectangle**: the twin figure's box's width, its top at the box's top, a portrait at head height, as data (FR-034). On a no: another rectangle, a data edit.
- **D3. The lettering's sources**: the SVG and the JSON byte for byte at `apps/web/content/lettering/`, outside the compositor's folders, which refuse other files; the brief outside the repository (FR-039). On a no: the outline alone, with the sources left in the hand-back.
- **D4. The outline's provenance** (spec 004 §8): `source` `{type: design, id: "D-0002"}`, an opaque ID; `tool` the repository's own converter under `mit`, the typeface and its license named in the committed JSON. On a no: his design ID, and the studio's setting tool with its license, which change the outline's hash and so his patch.
- **D5. Listening** holds while the text box holds unsent typed text, or a turn is out (FR-021 (c)). On a no: only within 2 s of a keystroke.
- **D6. The greeting** plays once a visit, at the hand-off's start or at the twin's first show after it; under reduced motion, no wave (FR-019, FR-024).
- **D7. The twin's line** is the one on the approval naming the model's current hash; with none, his likeness isn't shown (FR-015). On a no: any approval under `assets/twin/` with a line.
- **D8. The shirt's face** is an atmosphere face, its label UI word "The twin's shirt", its words in "Around the room" (FR-040).
- **D9. The credits** are a toolbar tile to a same-origin page rendered from `assets/CREDITS.md` (FR-042). On a no: a link in "Around the room", if the compact toolbar can't hold a sixth tile.
- **D10. The face shapes** are removed from the meshes on load until lip-sync (FR-013). On a no: kept, at their memory cost.
- **D11. The hand-off's announcement**, "The twin hands you a paper: the Author's resume.", stays (FR-031 (e)). On a no: words for the paper appearing, a UI word.
- **D12. The lean's figures** are the hand-back's, 0.679 m and 0.45 m, as data (FR-030).
