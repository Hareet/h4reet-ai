# Feature Specification: Studio Assets — The Studio's Outputs, Brought In Safely

**Feature Branch**: `spec/003-studio-assets` (it carries `intent/003-studio-assets`'s commits, rebased onto main)

**Created**: 2026-10-17

**Status**: Draft (two open clarification markers, in FR-015 and FR-034, for `/speckit-clarify`)

**Input**: [`intent.md`](intent.md) in this folder (moved from `intent/003-studio-assets.md`, as `intent/README.md` step 2 asks), accepted on 2026-10-17. Also read: [intent 000](../../intent/000-ai-twin-portfolio.md); intent 002 as accepted on 2026-10-17, whose answer 10 is on its own branch (this branch holds an earlier draft, [`intent/002-the-room.md`](../../intent/002-the-room.md)); the [image-model evaluation plan](../../docs/research/2026-10-12-image-model-evaluation.md) and the intent's [merge-request note](../../docs/merge-requests/2026-10-12-intent-003-studio-assets.md); the [constitution](../../.specify/memory/constitution.md); `CLAUDE.md`; the [data-flow disclosure](../../docs/data-flow-disclosure.md). Summary: the studio's pipeline stays outside this repository, and only its outputs come in: the twin's avatar, the four visitor avatars, their animations, and, in Phase 3, the room's assets. Each output passes an arrival check before it enters any commit: no metadata, a public record of the models that made it with their versions and licenses, a media license stricter than the code's MIT, and the Author's approval where it shows the Author's likeness or room. The site loads the assets as static files, on desktop and phone, and defines what a visitor sees when one fails to load or a phone can't hold the scene.

## Source: The Author's Words

Quoted as written in the intent, with this spec's reading beside each, never in its place.

- **The boundary.** The Author, on 2026-10-12, answering where the pipeline lives:

  > "The studio already has a pipeline outside this repo. We may want to update the models if possible if newer releases have been made for our particular use-case. Only the outputs should come in"

  > "We don't have a workflow yet for this, so there would be nothing to export, but it is worth checking what models we already have and what tools are installed like blender"

  Reading: the intent's own reading, which this spec keeps: "The studio's pipeline, with its workflows, models, tools, and code, stays outside this repository. This repository receives what it makes" (FR-001).

- **The record:** "Models, versions, licenses". "Each asset's record names the models that made it, their versions and licenses, and its source (a photo or a prompt)." Reading: one public record per file, listing every model a step loaded, auxiliary ones included (FR-010).
- **The license:** "Separate media license". "Code stays MIT. Assets get their own, stricter license (for example, all rights reserved or CC BY-NC-ND), chosen in the spec." Reading: the choice is the Author's, and is the first question for `/speckit-clarify` (FR-015).
- **The twin's look:** "A stylized likeness". "Made from photos of me. My face becomes a public asset by my choice, like the cloned voice." Reading: the Author approves each likeness file before it merges (FR-016).
- **The comparison:** "Okay, your evaluation scenario and published comparison write-up sounds like a great alternative!" Then, on where it lives: "I think it could live in this repo as a note, and that's fine with the likeness too." Reading: the evaluation note's images come in under the same checks as assets (User Story 5).
- **The privacy promise** (the intent's Constraints): "My photos stay on my machine, where the pipeline runs. Their EXIF and location data are stripped, nothing in an output locates me, and what's published is the pipeline's recreation, not the photo (intent 002). Visitors still choose pre-generated avatars, with no visitor biometrics." Reading: agent sessions run on the same machine, so the sandbox has to keep them from reading the photos too (FR-003).
- **Licenses** (the intent's Constraints): "Each model's license must allow publishing its outputs on a site that also promotes the studio. If a step's license doesn't, the step changes models or its output stays out. That includes licenses hidden inside a step, such as the non-commercial face models behind PuLID, and territorial clauses: a public site displays its outputs everywhere, so a license that forbids display in some countries rules its model out." Reading: the files are also distributed, in this public repository and from the edge, so a license must allow distributing them, not only displaying them (FR-013).
- **Git keeps everything** (the intent's Constraints): "ADR 0013 publishes this repository's history from its first commit, so an asset committed under the wrong license, or a texture that locates me, stays public in every clone. Assets merge only after their license is settled and their files are scrubbed." Reading: the Author merges a branch with all its commits (ADR 0013), so a file scrubbed in a later commit of the same branch is still in the history. The checks therefore run before every commit, as well as before the merge (FR-004).
- **Hidden metadata** (the intent's Data-flow impact): "ComfyUI writes each prompt and workflow, input filenames included, into the PNGs it saves, and a GLB can carry the same in its extras. None of it is published." (FR-006, FR-007.)
- **Visitors** (the intent's Data-flow impact): "no new byte leaves a visitor's device. Their browser requests the assets from the edge, as it does the rest of the site." Reading: the requests themselves leave the device. The edge sees the visitor's address and the files requested, and so which of the four avatars was chosen when only that one is fetched. Any asset-load telemetry the site sends would be a new flow. Both get disclosure entries (FR-040).

## User Scenarios & Testing *(mandatory)*

The users are visitors on desktop and phone; the Author, who takes the photos, runs the studio, and approves what comes in; the reviewer agent; and the reader the public repository is meant to convince. User Story 2, the degraded mode, comes before User Story 3, the happy path, as Principle I requires.

### User Story 1 - Nothing Enters the History That Locates the Author or Breaks a License (Priority: P1)

As the Author, I want every file the studio makes to pass an arrival check before it enters any commit: stripped of metadata, with a record naming the models that made it and their licenses, under the media license, and approved by me where it shows my likeness or my room. Git keeps every commit for good, so a mistake can't be taken back once it's published.

**Why this priority**: It is the intent's problem: "a generated file could land in this public repository under a license that forbids publishing it, at a size a phone can't hold, or with metadata that locates me." The control has to exist before the first file arrives, so it comes first.

**Independent Test**: Run the arrival check over a fixture set: one clean, recorded, approved asset, and one file for each failure in the scenarios below. Only the clean file passes, and each refusal names its file and its rule. Try to commit a failing file: the commit is refused. Run the gate on a branch where an earlier commit held a failing file and a later one fixed it: the gate fails.

**Acceptance Scenarios**:

1. **Given** an image or model file carrying EXIF, GPS, XMP, or IPTC fields, a comment, or a text chunk outside the allowlist, **When** it is added, **Then** the arrival check refuses it and names the field.
2. **Given** a PNG holding a prompt or workflow, a GLB holding a workflow, prompt, or input filename in its extras, or any file containing a model file's name or a user's home path, **When** it is added, **Then** the arrival check refuses it.
3. **Given** an asset with no record, a record whose hash doesn't match the file, or a record missing a required field, **When** it is added, **Then** the arrival check refuses it.
4. **Given** a record naming a model, auxiliary models included, whose license isn't on the allowlist (non-commercial, research or evaluation only, territorially restricted, or unknown), **When** the asset is added, **Then** the arrival check refuses it and names the model and the license.
5. **Given** a record naming an evaluation-only model, such as Qwen-Image-2.1 or FLUX.2 [dev], or a LoRA trained on such a model's weights or outputs, and no commercial license for it, **When** the asset is added, **Then** the arrival check refuses it.
6. **Given** an asset in a directory without the media license notice, **When** it is added, **Then** the arrival check refuses it.
7. **Given** an asset that shows the Author's likeness or derives from the Author's photos, without the Author's approval for that file's hash, **When** it is added, **Then** the arrival check refuses it; **and when** an agent session tries to record that approval, **Then** the write is refused.
8. **Given** model weights or a LoRA anywhere in the repository, or a workflow, a node pack, a tool, or a script in an asset directory, **When** it is added, **Then** the arrival check refuses it.
9. **Given** an avatar or animation that arrives before ADR 0010 is accepted, doesn't meet its format, exceeds its per-asset caps, or would bring a first visit over the budget, **When** it is added, **Then** the arrival check refuses it and reports the measured sizes.
10. **Given** a branch on which any commit added a file that fails these checks, **When** the gate runs, **Then** it fails, even if a later commit removed or fixed the file.
11. **Given** every check passes, **When** the Author merges, **Then** the asset, its record, and its directory's license notice enter the history together.
12. **Given** the studio's folders on the machine agent sessions run on (the Author's photos, the unstripped outputs, the workflows, the blinding key), **When** an agent session tries to read them, **Then** the read is refused, and the forbidden-action matrix proves it.
13. **Given** a merged asset is found to locate the Author or to break a license, **When** the Author follows the withdrawal runbook, **Then** it is handled as FR-041 says for before or after publication, and after publication an incident note records it.

---

### User Story 2 - When an Asset Can't Load, or a Phone Can't Hold the Scene, the Visit Goes On (Priority: P1)

As a visitor, I want the site to keep working when the twin's 3D avatar can't load or my phone can't keep up: I still see who I'm talking to, still see that it's an AI, and can still type a message.

**Why this priority**: Principle I: "Every user-facing capability MUST define its degraded mode before its happy path." The intent asks for it in so many words: "The spec says what a visitor sees when one fails to load, or when a phone can't hold the scene."

**Independent Test**: With fault injection on desktop and on the reference phone (an asset blocked, timed out, corrupted, or failing its hash; no 3D capability; a frame rate forced below the floor), every run ends with the twin's still image or a lighter scene, the AI disclosure visible, and a working text box. No run ends on a blank or frozen scene.

**Acceptance Scenarios**:

1. **Given** the twin's 3D avatar fails to load, **When** the failure is detected, **Then** the site retries once, and if that fails it shows the twin's still image within 2 seconds, with the AI disclosure, and text chat keeps working.
2. **Given** the chosen visitor avatar fails to load, **When** the failure is detected, **Then** the visit continues with that avatar's preview image, or without it.
3. **Given** a device that can't render the 3D scene, **When** the site starts, **Then** it goes straight to the 2D mode (the twin's still image, the disclosure, and chat) and downloads no 3D asset.
4. **Given** the scene's frame rate stays below the floor, **When** that lasts past the threshold, **Then** the scene steps down to its reduced tier, and then to the 2D mode if it still can't hold the floor.
5. **Given** any mode, **When** the visitor uses the visible control for the lighter mode, **Then** the site switches to the 2D mode.
6. **Given** the local tier is off, or the kill switch is `degraded`, **When** a visitor arrives, **Then** the assets load and animate as usual, and only the conversation degrades, as spec 000 routes it.

---

### User Story 3 - Visitors Meet the Twin and Their Chosen Avatar, on Desktop and Phone (Priority: P1)

As a visitor on a desktop or a phone, I want to see the Author's twin, a stylized likeness disclosed as an AI, beside the avatar I chose. It should appear quickly and move smoothly, whether or not the Author's machine is on.

**Why this priority**: Intent 000 promises "an animated AI twin of me" and "four pre-generated avatars". The intent's Constraints, under Principle II: "The assets are part of the product: checked before they merge, with their size and load time measured."

**Independent Test**: Using assets that passed User Story 1, a test page (or the rig, once Phase 2 builds it) is served as static files with the local tier off. On desktop and on the reference phone, choose each of the four avatars, and measure the bytes transferred, the time until the twin is visible, and the frame rate.

**Acceptance Scenarios**:

1. **Given** the local tier is off, **When** a visitor opens the site and chooses an avatar, **Then** the twin and that avatar load from the edge as static files.
2. **Given** the selection screen, **When** it shows, **Then** each of the four avatars appears as a lightweight preview, and only the chosen avatar's full asset is fetched.
3. **Given** the reference phone, **When** the twin and one avatar are shown, **Then** the scene meets the frame-rate target, and the first visit stays within the download budget (SC-006).
4. **Given** the twin is shown, **When** a visitor looks at it on any screen, **Then** the AI disclosure is visible with it.
5. **Given** the site is showing assets, **When** the browser's network log is read, **Then** every file came from the site's own origin, decoders included, and no camera was requested.
6. **Given** an asset was replaced in a later merge, **When** a returning visitor loads the site, **Then** they get the new file, never a stale mix of old and new.
7. **Given** assets load and modes change, **When** the dashboard is read, **Then** its panel shows the load success rate, the time until the twin is visible, the share of visits in each mode, and the bytes served, and no event carries a payload or a client identifier.
8. **Given** the data-flow disclosure, **When** it is read, **Then** it lists the asset requests, with what they reveal about the chosen avatar, and the asset events, each with its reason.

---

### User Story 4 - Anyone Can See What Made Each Asset, and That the Twin's Face Is AI-Made (Priority: P2)

As a reader of the repository, or a visitor curious about the twin, I want to see for any asset which models made it, their versions and licenses, what kind of source it came from, and its license, and to know that the twin's face is an AI-made likeness the Author chose to publish.

**Why this priority**: Principles VI and VIII. The intent: "a likeness makes that disclosure matter more." It builds on User Story 1's records, so it follows it.

**Independent Test**: From the site, follow the credits link to any shown asset's record. From the repository, open an asset directory and find each record and the license notice. Check the twin's disclosure and each published file's marking against the answer to the second clarification question.

**Acceptance Scenarios**:

1. **Given** any asset shown on the site, **When** a reader follows the credits link, **Then** they reach its record in at most two clicks.
2. **Given** the repository, **When** a reader opens an asset directory, **Then** they find each asset's record and the media license notice; the README's license line names MIT for code and the media license for the asset directories.
3. **Given** a record, **When** it is read, **Then** it holds no photo's location, metadata, file name, or path; sources appear only as opaque IDs.
4. **Given** a record, **When** it is read, **Then** it says which steps a model did and which the Author did by hand.
5. **Given** the twin's avatar is shown, **When** a visitor reads the disclosure, **Then** it says what FR-034 settles.

---

### User Story 5 - The Model Comparison Is Published Under the Same Rules (Priority: P2)

As the Author, I want the image-model comparison's grids, its style anchor, and its record table to come into this repository under the same checks as assets: stripped metadata, a record, the license notice, and my approval, my likeness included.

**Why this priority**: The comparison chooses the model the studio's workflow will use, so its images will likely be the first studio files to come in. The intent: "the note's images follow the same rules as assets: stripped metadata, a record, and the media license." So the arrival check has to cover them before the first grid is committed.

**Independent Test**: Run the arrival check over a sample grid made the way the evaluation note describes, and over the same grid with its metadata left in or its record row missing. The first passes and the others are refused. An arm B or arm D grid without its caption is refused at review.

**Acceptance Scenarios**:

1. **Given** a comparison grid or the style anchor, **When** it is committed, **Then** it passes the metadata, record, license-notice, and approval checks (the approval covers the T3 grids for the likeness, and the T1 grids for anything that locates the Author or shows a screen, a logo, or someone else's art).
2. **Given** an image from arm B or arm D, **When** it is published, **Then** its caption reads "Evaluation output; not used in the site's assets.", and no asset's record names that arm's model without a commercial license (FR-014).
3. **Given** the media license isn't chosen yet, **When** the note's images come in, **Then** they come under the interim "all rights reserved" notice the note sets.

---

### User Story 6 - The Studio Borrows the GPU Without Surprising Production (Priority: P3)

As the Author, I want one runbook entry for handing the GPU to a studio job and giving it back, so that production degrades exactly as designed while the job runs, and comes back at the commit it was running.

**Why this priority**: The intent's Constraints: "Prod's model server holds about 21 GiB of the GPU's 24 GB (spec 000's plan, §18), so the studio's heavier jobs can't run beside it." It matters most after publication; before it, nobody is served.

**Independent Test**: Rehearse the runbook on prod around a short studio job. Prod's model server is stopped, hello falls back within the sub-budget or degrades, the dashboard marks the window, and after the job prod restarts at the commit its run file names and hello answers from the local model.

**Acceptance Scenarios**:

1. **Given** prod is running, **When** the Author follows the runbook to start a studio job, **Then** prod's model server stops first, the twin falls back within its sub-budget or degrades as spec 000 routes it, and the dashboard marks the window.
2. **Given** the job has ended, **When** the runbook's restore runs, **Then** prod restarts at the commit its run file names, and hello answers from the local model.
3. **Given** a studio window, **When** the dashboard is read, **Then** the fallback spend inside the window is visible, and no budget or ceiling changed for it.

---

### User Story 7 - The Room's Assets Come Through the Same Intake (Priority: P3, Phase 3)

As the Author, I want the room's assets, made from my photos of my desk, window, and walls, to pass the same checks, plus the ones a room needs: nothing that locates me, no screen content, no logos, and no one else's art.

**Why this priority**: Phase 3, after the avatars (intent 003, open question 7). The intake's rules are the same, and the room's behavior belongs to the room's own spec.

**Independent Test**: Run the arrival check and the approval over a sample room asset, and over variants showing a screen's content, a logo, readable text, or an unrecreated window view. Only the clean asset passes.

**Acceptance Scenarios**:

1. **Given** a room asset made from the Author's photos, **When** it arrives, **Then** it passes every check of User Story 1, the Author's approval included.
2. **Given** the window, **When** its asset arrives, **Then** its view is the studio's recreation of a fence and a tree, with nothing that locates the Author. In the Author's words (intent 002, answer 8): "We want to recreate a similar view, it's a small window that largely see's an immediate neighboring fence and tree, there won't be any defining information present."
3. **Given** a screen, a logo, the snowboard's graphic, a document, or a label in a photo, **When** its asset arrives, **Then** screens show a plain glow, and no logo, trademark, readable text, or third-party art remains. The artwork above the window is recreated as original art, or left out.
4. **Given** any room asset, **When** the Author approves it, **Then** the approval confirms it's a recreation, never a photo or an unmodified crop of one.

---

### Edge Cases

- **A file passes every machine check but still locates the Author** (a reflection, a sign, a screen). The Author's approval is the control. If it's found after the merge, FR-041's runbook applies.
- **A model hidden inside a step**, such as the face models behind an identity adapter, or a background remover a node pack downloads on its own. The arrival check can't see the studio, so the record lists every model the step loaded, and the Author's approval attests that the record is complete. The evaluation note's step 4 ("Pin everything") is how the studio finds them.
- **A territorial clause** (display forbidden in some countries): refused (FR-013).
- **A model with no license, or an unclear one:** refused. An unknown license counts as not allowed.
- **A LoRA trained on an evaluation-only model's weights or outputs:** refused, unless the studio holds that model's commercial license (FR-014).
- **A model is relicensed after its asset merged.** The record pins the license version that was used, and the allowlist judges that version. If the old terms are withdrawn, whether to replace the asset is the Author's decision.
- **An editor's backup or a stray export** in an asset directory, such as `grid.jpg_original`, which exiftool leaves without `-overwrite_original`: refused as an unrecorded file (FR-008).
- **An unscrubbed file committed and then fixed on the same branch:** the gate fails the branch (FR-004). The branch is rebuilt without that commit before it merges.
- **A re-exported asset** has a new hash, so it needs a new record entry, and for likeness and room assets a new approval.
- **The non-humanoid visitor avatars** (the dog and the dinosaur) can't use a humanoid skeleton. ADR 0010 names their rigs; the checks are the same.
- **The twin's model loads but its animations don't:** the twin stays visible in a neutral pose, and the failure is recorded.
- **A slow connection:** the twin's still image shows first, and the 3D twin replaces it when ready (SC-004, SC-005).
- **A browser extension or a strict policy blocks the assets:** handled as a failed load (FR-021).
- **A phone that passes the capability check but throttles when hot:** a sustained low frame rate steps the scene down (FR-024).
- **A studio job runs while visitors are on the site** (after publication): the conversation falls back or degrades, and the assets are unaffected.
- **The edge itself is unreachable:** the whole site is down. That is spec 001's concern.
- **The first site asset is ready before the media license is chosen:** it waits (FR-015).
- **A step used a hosted service:** allowed, by the Author's choice. The record names the service, and the disclosure lists the flow (FR-040).
- **One file used by several assets** (a shared texture): it has one record entry, and the others refer to it.

## Requirements *(mandatory)*

### Functional Requirements

Terms used below. **Asset**: any file the studio makes that comes into this repository: the avatars, their animations, the room's assets, and their still and preview images. **Published image**: a studio-made image in a document, such as the evaluation note's grids. **Arrival check**: the machine checks of FR-001, FR-002, and FR-006 to FR-020, which run before each commit and in the local gate (FR-004). **Arrival review**: the reviewer agent's pass, and the Author's approval where FR-016 applies. **The site**: what visitors get from the edge. **The reference phone**: the mid-range phone the plan names (Assumptions).

**The boundary**

- **FR-001**: THE REPOSITORY SHALL receive only the studio's outputs: assets, published images, and their records. IF a change adds model weights or a LoRA anywhere in the repository, or a workflow, a node pack, a tool, a script, or other code in an asset or published-image directory, THEN THE ARRIVAL CHECK SHALL refuse it. A record MAY name a workflow by its hash only.
- **FR-002**: THE REPOSITORY SHALL hold no source photo, and no unmodified crop of one. IF a file carries camera metadata, THEN THE ARRIVAL CHECK SHALL refuse it. WHEN an asset derives from a photo, THE AUTHOR'S APPROVAL (FR-016) SHALL confirm that it is the studio's recreation, not the photo.

**The controls come before the first file**

- **FR-003**: WHEN the studio's first photo or output is staged on the machine agent sessions run on, THE SANDBOX SHALL already deny agent sessions reads of the studio's folders: the Author's photos, the studio's unstripped outputs, its workflows, and the evaluation's blinding key. The Author applies the deny as a patch, and the forbidden-action matrix SHALL prove each one.
- **FR-004**: THE ARRIVAL CHECK SHALL run before each commit; in the local gate, over every commit on the branch since `main`; and in the history scan before the first push (spec 000, FR-042). WHEN any check fails, THE SYSTEM SHALL refuse the commit or fail the gate, naming the file and the rule.
- **FR-005**: THE LICENSE ALLOWLIST (FR-013) AND THE LIKENESS APPROVALS (FR-016) SHALL change only by the Author's hand. WHEN an agent session tries to write either, THE SYSTEM SHALL refuse it, with the deny in the patch that creates them or an earlier one, and a forbidden-action matrix row for each.

**Metadata**

- **FR-006**: WHEN an asset or published image is checked, THE ARRIVAL CHECK SHALL refuse it if it carries metadata outside an allowlist the plan sets. The allowlist holds at most what the format needs in order to render, the media license notice, and the marking FR-034 settles. Anything else is refused: EXIF, GPS, XMP, and IPTC fields, comments, text chunks, and model-file extras or extensions.
- **FR-007**: IF a file contains, anywhere in its bytes, a prompt or workflow record, a model file's name, an input file's name, or a user's home or other local path, THEN THE ARRIVAL CHECK SHALL refuse it.
- **FR-008**: IF an asset or published-image directory holds a file that no record names, THEN THE ARRIVAL CHECK SHALL refuse it.
- **FR-009**: THE ASSETS AND PUBLISHED IMAGES SHALL hold nothing that locates the Author: not in their metadata, their file names, their records, or what they show (a street, a sign, an address, a screen's content, a document, or a view that identifies the place). The Author's approval (FR-016) covers what a machine can't check.

**The record**

- **FR-010**: WHEN an asset or published image arrives, THE ARRIVAL CHECK SHALL refuse it unless a public record names it and matches its hash. The record SHALL hold:
  - the file and its hash, and its kind (avatar, animation, room asset, still, preview, or published image);
  - its source: a photo by an opaque ID, a prompt by an ID, or another asset by its record;
  - each step, with every model the step loaded, auxiliary models included (a face model, a background remover, a LoRA, an upscaler). For each model, its repository with its revision or version, and its license with that license's version or date;
  - each tool used by hand, with its version and license, and any hosted service a step used;
  - the date each step's model was last checked against newer releases;
  - which steps a model did and which the Author did by hand;
  - the media license;
  - for likeness and room assets, a reference to the Author's approval (FR-016).
- **FR-011**: THE RECORD SHALL hold no photo's metadata, location, file name, or path. It names photos and prompts by opaque IDs only.
- **FR-012**: IF a step's model-refresh date is missing, or falls after the asset was made, THEN THE ARRIVAL CHECK SHALL refuse the asset. The intent: "Before it makes them, it checks each step's model against newer releases."

**Licenses**

- **FR-013**: THE REPOSITORY SHALL hold a license allowlist. Each entry names a license and its version, with the Author's reading of three terms: outputs may be displayed on a public website that also promotes the studio; everywhere, with no territorial exclusion; and the output files may be distributed publicly, in this repository and from the edge. WHEN a record names a model, tool, library, or service whose license and version aren't on the allowlist, THE ARRIVAL CHECK SHALL refuse the asset. A missing or unknown license counts as not allowed.
- **FR-014**: IF a record names a model held only under an evaluation, research, or non-commercial license, or a model trained on such a model's weights or outputs, THEN THE ARRIVAL CHECK SHALL refuse the asset unless the record cites the studio's commercial license for that model. Today this covers Qwen-Image-2.1 under its research license and FLUX.2 [dev] under its non-commercial license (the evaluation note's arms B and D).
- **FR-015**: THE ASSETS AND PUBLISHED IMAGES SHALL carry the media license [NEEDS CLARIFICATION: which media license? A: all rights reserved, with a plain notice that viewing and linking are welcome (recommended); B: CC BY-NC-ND 4.0; C: all rights reserved for the Author's likeness and CC BY-NC-ND 4.0 for everything else. See Open Questions, Q1]. Each asset directory, and the published images' folder, SHALL carry a notice naming the license, and THE README's license line SHALL name MIT for code and the media license for those directories. IF an asset sits in a directory without the notice, THEN THE ARRIVAL CHECK SHALL refuse it. WHILE the media license is unchosen, no site asset SHALL merge; the evaluation note's images MAY come in under its interim "all rights reserved" notice.

**Likeness, originality, and the Author's approval**

- **FR-016**: WHEN an asset or published image shows the Author's likeness, or derives from the Author's photos, THE ARRIVAL CHECK SHALL refuse it unless the Author's approval names that file's hash. The approval confirms that:
  - the likeness is one the Author accepts;
  - nothing in the file locates the Author;
  - no screen content, logo, readable text, or other people's art remains;
  - the file is a recreation, not a photo;
  - the record is complete.
- **FR-017**: THE TWIN'S AVATAR SHALL be a stylized likeness of the Author, made from the Author's photos, in ADR 0010's art direction. THE VISITOR AVATARS SHALL be original characters that resemble no real person. Every asset SHALL follow intent 000's rule: "Inspired-by only — no Rockstar assets, logos, typefaces, or character likenesses; everything is original." WHEN an asset arrives, THE ARRIVAL REVIEW SHALL confirm this.

**Format and budget**

- **FR-018**: WHILE ADR 0010 is not accepted, THE ARRIVAL CHECK SHALL refuse every avatar and animation. WHEN one arrives after that, it SHALL be refused unless it meets the format ADR 0010 sets: the file format, the skeleton, and, for the twin, the facial shapes that lip-sync needs.
- **FR-019**: WHEN an asset arrives, THE ARRIVAL CHECK SHALL measure and report its file size, its transfer size as served, and its rendering cost (geometry, and texture memory). It SHALL refuse the asset if it exceeds its per-asset caps (ADR 0010's), or if it brings a first-visit total over the budget in SC-006.
- **FR-020**: THE ARRIVAL CHECK SHALL report the total size of the asset and published-image files across the repository's history, and SHALL refuse a change that brings that total over 500 MB.

**Degraded mode (defined before the happy path, Principle I)**

- **FR-021**: IF the twin's 3D avatar fails to load (blocked, timed out, failing its hash, or failing to decode), THEN THE SITE SHALL retry once. If the retry fails, within 2 seconds of detecting that failure it SHALL show the twin's still image in the avatar's place, with the AI disclosure, keep text chat working, and record the failure (FR-039).
- **FR-022**: IF the chosen visitor avatar fails to load, THEN THE SITE SHALL continue with that avatar's preview image, or without it.
- **FR-023**: WHEN a capability check before any 3D download finds that the device can't render the 3D scene, THE SITE SHALL go straight to the 2D mode (the twin's still image, the disclosure, and chat) and fetch no 3D asset.
- **FR-024**: WHILE the scene's frame rate stays below 24 frames per second for 5 seconds, THE SITE SHALL step down to a reduced tier (lighter textures, fewer simultaneous animations), and then to the 2D mode if it still can't hold that floor. A visible control SHALL let the visitor choose the 2D mode at any time.
- **FR-025**: WHILE the local tier is off, or the kill switch is `degraded` or unknown, THE SITE SHALL load and animate the assets as usual; only the conversation degrades, as spec 000's FR-022 routes it.
- **FR-026**: THE SITE SHALL never leave a visitor at a blank or frozen scene, and THE AI DISCLOSURE SHALL stay visible in every mode.

**The happy path**

- **FR-027**: THE SITE SHALL serve every asset as a static file from the edge (spec 001), so it loads whether or not the local tier is on.
- **FR-028**: WHEN the selection screen shows, THE SITE SHALL show each visitor avatar as a lightweight preview image, and fetch the full asset only for the avatar chosen.
- **FR-029**: THE SITE SHALL serve each asset under a name derived from its content, so a changed asset gets a new name.
- **FR-030**: THE SITE SHALL fetch every file it needs to show the assets (the assets, their textures, and their decoders) from its own origin, never from a third-party host.
- **FR-031**: THE SITE SHALL never request the visitor's camera, or any image of the visitor, for the avatars. Visitors choose from the pre-generated avatars only (Principle I).
- **FR-032**: WHEN the twin's avatar is shown, THE SITE SHALL show the AI disclosure with it (Principle VIII).

**Provenance and disclosure**

- **FR-033**: WHEN an asset is shown on the site, THE SITE SHALL offer a credits link that reaches that asset's record in at most two clicks.
- **FR-034**: WHEN the twin's avatar is shown, and WHEN any asset or published image is published, THE SYSTEM SHALL disclose that the likeness is AI-made [NEEDS CLARIFICATION: how? A: both a visible line in the twin's disclosure that the avatar is an AI-made, stylized likeness of the Author, published by the Author's choice, and one machine-readable mark in every published image and model file (the IPTC digital source type for AI-generated media), with nothing else in the file (recommended); B: the visible line only, with files carrying no metadata at all; C: the machine-readable mark only, leaving the twin's AI disclosure unchanged. See Open Questions, Q2].

**The studio's GPU**

- **FR-035**: A runbook entry SHALL cover handing the GPU to a studio job and giving it back:
  - stop prod's model server first;
  - while the job runs, the twin falls back within its sub-budget or degrades, and no budget or ceiling changes;
  - mark the window on the dashboard;
  - afterwards, restart prod at the commit its run file names, and check that hello answers from the local model.

  WHEN the Author follows it, THE DASHBOARD SHALL show the window and the fallback spend inside it.

**The comparison note**

- **FR-036**: WHEN the evaluation note's grids, its style anchor, or other published images are committed, THE ARRIVAL CHECK SHALL apply FR-006 to FR-016 to them. THE IMAGES FROM ARMS B AND D SHALL carry the caption "Evaluation output; not used in the site's assets."

**The room (Phase 3)**

- **FR-037**: WHEN a room asset arrives, THE ARRIVAL CHECK AND THE AUTHOR'S APPROVAL SHALL also confirm that:
  - the window's view is the studio's recreation of a fence and a tree, with nothing that locates the Author;
  - screens show a plain glow;
  - no logo, trademark, readable text, or third-party art remains, and the artwork above the window is recreated as original art or left out.

**Cost**

- **FR-038**: WHEN assets merge, THE MERGE-REQUEST NOTE SHALL report each asset's file and transfer sizes, the first-visit totals for desktop and phone, and the history total (FR-020). WHEN the edge serves the site (spec 001), THE DASHBOARD SHALL show the assets' monthly transfer and its estimated cost beside this spec's estimate.

**Telemetry**

- **FR-039**: WHEN the site loads an asset, or changes mode, THE SITE SHALL emit an event with the asset's ID, the outcome (loaded, retried, failed, or skipped), a duration bucket, the bytes transferred, and the mode (full, reduced, or 2D). The event carries no payloads and no client identifiers. THE DASHBOARD SHALL have a panel showing the load success rate, the p50 and p95 time until the twin is visible, the share of visits in each mode, the bytes served, and the studio's GPU windows (FR-035).

**Data flow**

- **FR-040**: THE DATA-FLOW DISCLOSURE SHALL gain these entries, each in the same change as its flow:
  - (a) the visitor's browser to the edge: asset requests, carrying the address, the user agent, and the asset paths, which show which avatar was chosen;
  - (b) the site's asset events (FR-039), to wherever the plan sends them;
  - (c) if a studio step ever uses a hosted service: the Author's photos or prompts to that service, by the Author's choice, as the step's record names it;
  - (d) on row D1: committed assets, the Author's likeness among them, reach Anthropic when an agent session reads them, before publication too.

**Withdrawal**

- **FR-041**: A runbook entry SHALL cover a merged asset that turns out to locate the Author or to break a license:
  - before publication, it is removed from the history only through a pre-publication cleanup the Author approves, which ADR 0013 would need to allow for assets (Assumptions);
  - after publication, it can't be recalled: it is taken off the site and replaced within one day, and an incident note records it (Principle VI).

### Key Entities

- **Asset**: a file the studio made that the site serves. Its kind is avatar, animation, room asset, still, or preview. It is identified by its hash, and it belongs to a directory that carries a license notice.
- **Published image**: a studio-made image in a document, such as the evaluation note's grids and style anchor. Same rules as an asset; not served as part of the scene.
- **Record**: the public provenance of one file (FR-010). It refers to its steps, its source, its license, and, where needed, an approval.
- **Step**: one stage of the studio's work on a file, with the models it loaded or the tools used by hand, its hosted service if any, and its model-refresh date.
- **Model entry**: a model's name, its repository and revision or version, its license and that license's version, and its role in the step (primary or auxiliary).
- **Source**: a photo or a prompt, by opaque ID, or another asset, by its record. Never a file name, a path, or a location.
- **License allowlist entry**: a license name and version, with the Author's reading of its three terms (FR-013). Changed only by the Author.
- **Likeness approval**: the Author's approval of one file hash, with what it confirms (FR-016). Recorded only by the Author.
- **Display mode**: full, reduced, or 2D, as the site chooses it (FR-021 to FR-024) or the visitor does.
- **Asset event**: one load outcome or mode change (FR-039).
- **GPU window**: the start and end of a studio job on prod's GPU, shown on the dashboard (FR-035).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The arrival check refuses 100% of a fixture set with one known-bad file per arrival-check rule (FR-001, FR-002, and FR-006 to FR-020), each refusal naming its rule, and accepts 100% of the known-good fixtures.
- **SC-002**: The history scan before the first push finds 0 files, in any commit, that carry metadata outside the allowlist, a prompt, a workflow, a model file's name, or a local path.
- **SC-003**: 100% of the assets and published images in the repository have a complete record whose hash matches, and every license in it is on the allowlist.
- **SC-004**: In 100% of test runs, on desktop and on the reference phone, the visitor sees the twin within 2 seconds of choosing an avatar (as its still image while the 3D twin is still loading).
- **SC-005**: From a cold cache, the 3D twin and the chosen avatar are fully shown within 3 seconds on desktop broadband, and within 15 seconds on the plan's mobile connection profile.
- **SC-006**: On the reference phone, the scene with the twin and one avatar holds a median of at least 30 frames per second over a 60-second session. A first visit transfers at most 10 MB of assets in Phase 2 (the twin, the chosen avatar, and their animations), and at most 25 MB once the room's assets arrive in Phase 3.
- **SC-007**: In fault-injection runs covering each failure in FR-021 to FR-024, 100% of runs end with the AI disclosure visible and a working text box, and none ends on a blank or frozen scene. The still image appears within 2 seconds of a detected failure, and a sustained low frame rate steps the scene down within 10 seconds.
- **SC-008**: With the local tier off, 100% of the asset loads that succeed with it on also succeed.
- **SC-009**: While assets load, the browser's network log shows 0 third-party hosts and 0 camera requests.
- **SC-010**: A reader reaches the record of any asset shown on the site in at most 2 clicks.
- **SC-011**: In a rehearsed GPU hand-off, prod answers hello from the local model within 10 minutes of the job's end, at the commit it ran before, and the window's fallback spend appears on the dashboard, within the sub-budget.
- **SC-012**: The asset and published-image files across the history total under 500 MB. Once the edge serves the site, the measured monthly transfer cost appears on the dashboard beside this spec's estimate.

## Assumptions

Each recommended default below was chosen because the Author said to trust the recommendations; `/speckit-clarify` can confirm or change any of them (Open Questions, the confirmations).

- **Scope** (intent 003, open question 7, Claude's recommendation taken). This spec defines the intake for every studio file, and its first arrivals are the evaluation note's images and Phase 2's avatars and animations. The room's assets come through the same intake in Phase 3 (User Story 7), and the room's own spec covers their behavior. Out of scope:
  - the studio's workflow, which runs on the Author's schedule, outside this repository's lifecycle;
  - the rig's behavior (lip-sync, gestures, the conversation), which is Phase 2's rig spec;
  - the cloned voice and the marking of synthetic audio, which belong to ADR 0011 and the voice's spec;
  - the room's interactions (intent 002), and the rickshaw-walla page.
- **ADR 0010 first** (open question 1, taken). ADR 0010 is written and accepted before the studio builds its workflow, so nothing is made twice (FR-018). For the twin, the ADR leans toward the convention the intent's survey found: "glTF, a Mixamo-compatible skeleton, ARKit's 52 blendshapes, and the 15 Oculus visemes". ADR 0010 also names the non-humanoid visitor avatars' rigs, the per-asset caps, and the reference phone. Visitor avatars need body animation only, with no facial shapes, because visitors don't speak through them.
- **Where the files live** (open question 2, the survey's lean taken). The final files go in plain git, and the edge serves them under content-derived names (FR-029). There is no Git LFS and no separate object store in this spec.
  - Why: no storage or transfer bill from git; the repository stays self-sufficient, so the local tier serves the assets with no cloud dependency; and the Author already accepted that git keeps published images for good (the evaluation note's "The likeness", approved with "that's fine with the likeness too").
  - FR-020's cap bounds the repository's growth.
  - If spec 001's edge serves from object storage, it copies the files from the repository when it deploys.
- **Who checks what** (open question 4, taken).
  - Everything a machine can check is in the arrival check, which runs before each commit and in the gate.
  - The reviewer agent's pass checks records against files, the art direction, and third-party content.
  - The Author approves likeness and room files, and anything a machine can't see.
  - The pre-commit hook, the sandbox's denies, `REVIEW.md`, and the gate's code are the Author's to change (CLAUDE.md; spec 000, ADR 0017). The plan delivers those changes as patches the Author applies, before the first file arrives (FR-003 to FR-005).
- **Yielding the GPU** (open question 5, taken): a runbook entry, as FR-035, generalizing the evaluation note's step 3.
- **The first asset set** (Phase 2):
  - the twin's avatar, with idle, talking, listening, and greeting animations, and its still image for the 2D mode;
  - the four placeholder visitor avatars, each with an idle animation and a preview image. Intent 000: "Avatars: placeholders for now — a generic woman, a generic man, a generic dinosaur, a generic dog — to be replaced with final characters later." Final characters come later, through the same intake.

  The rig's spec may add animations through the same intake. The hand-off animation and the paper come with the room, in Phase 3.
- **Budget defaults** (ADR 0010 may tighten them, not loosen them):
  - the reference phone is a mid-range phone from the last three years, which the plan names;
  - the frame-rate target is a 30 fps median (SC-006), and the floor that triggers a step-down is 24 fps sustained for 5 seconds (FR-024);
  - a first visit transfers at most 10 MB of assets in Phase 2 and at most 25 MB with the room, inside the intent's "a few to a few tens of megabytes on a first visit";
  - the still twin shows within 2 seconds, and the 3D twin within 3 seconds on broadband and 15 seconds on the plan's mobile profile;
  - the history cap is 500 MB.
- **Only the chosen avatar is fetched** (FR-028), to keep within the phone budget. That tells the edge which avatar was chosen, and the disclosure says so (FR-040a). This is a reading beside the intent's "no new byte leaves a visitor's device", for the Author to confirm.
- **Asset events from the browser** (FR-039) are payload-free, as intent 002 already accepts for the room: "Object and resume clicks are telemetry events, with no payloads." They are disclosed (FR-040b). Until spec 001's relay exists, they're measured in the test harness only.
- **How the license is marked** (open question 3's second half, taken): a notice in each asset directory and in the published images' folder, the README's license line, and each record. Inside the file, the marking FR-034 settles.
- **The model-refresh check** is recorded as a date for each step (FR-012). The arrival check requires the date, not any particular result.
- **Commercial model licenses** the studio may buy, for instance if the comparison's arm B or arm D wins, are the studio's cost, like any paid tool. The intent: "a paid tool the studio adopts (an add-on, a service) is the studio's cost, outside this project's budget."
- **Mistakes found before publication.** ADR 0013's pre-publication cleanup names secrets, amounts, and denylisted phrases. Removing an asset that locates the Author, or that breaks a license, from the history before the first push needs the Author to extend that cleanup, recorded with an ADR (FR-041).
- **A reading, not a deviation: the studio's model runs.** They happen outside this repository's system: they make no gateway call and no metered spend. So Principle V's "Every model call carries provider, model, token counts, and estimated cost" and CLAUDE.md's gateway rule govern this repository's calls, not the studio's, and the record carries the studio's provenance instead. If the Author reads Principle V as covering the studio's runs, this becomes a deviation, to record with an ADR.
- **A reading, not a deviation: the studio's privacy.** Principle VI makes this repository public. The studio's workflows, photos, full-resolution outputs, and the evaluation's blinding key stay in the studio, which is a separate business outside the repository (the boundary). The records say what made each asset, and the rickshaw-walla page tells the pipeline's story (intent 000).
- **Local until publication** (ADR 0013, carried from spec 000). Until publication, the gate is `make check` and the Author's `tools/gates/gate`, and nothing is served to visitors. The edge (spec 001) serves the assets once it exists. Spec 000's Assumptions already record this deviation from Principles III and VI.
- **The studio** is Artificial Indian Games (intents 000 and 003). Its pipeline runs on the Author's machine, and the photos never leave it unless a step uses a hosted service, by the Author's choice.
- **The likeness in agent sessions.** Committed assets aren't denied to agent sessions, so the reviewer can check them. D1 discloses that they reach Anthropic when read (FR-040d). The Author's photos and the unstripped outputs are denied (FR-003).
- **The intent's move.** Per `intent/README.md`, the intent moves into this folder as `intent.md` when the Author commits the spec. This spec links it at its current path, and the move updates that link, intent 002's link to it, and the evaluation note's path.

## Expected Cost Impact

- **Cloud:** edge transfer only. A first visit transfers at most 10 MB of assets in Phase 2, and 25 MB with the room, cached after that. For scale: 1,000 first visits a month at 25 MB is 25 GB. At typical CDN rates under $0.10 per GB, that's under $2.50 a month, and possibly $0 inside the edge's free allowance. The plan prices it against spec 001's edge. Storage in plain git costs $0, with no LFS and no object store. Before publication it costs $0, because nothing is served.
- **Local:** the studio's jobs cost electricity. While one holds the GPU, prod's twin falls back to Bedrock within its $2/day sub-budget, or degrades. After publication that is at most $2 for each day of studio work, unless the Author renews the sub-budget, and always inside the $5 daily and $20 monthly ceilings. Before publication it is next to nothing. No budget or ceiling changes.
- **Tools and model licenses:** the studio's, outside this project's budget.
- **Dev time:** the Claude Team plan: this spec, the arrival check, and the reviewer's passes.
- **No new model call** from this repository, so no new metered spend.
- **Measurement:** FR-038 and SC-012 put the measured sizes in each merge-request note, and the measured transfer cost on the dashboard.

## Constitution Check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | Yes | No visitor biometrics: pre-generated avatars, and no camera (FR-031). The assets are static, so they load with the local tier off (FR-025, FR-027). The degraded mode is defined before the happy path (User Story 2; FR-021 to FR-026). The bytes that leave a visitor's device are disclosed: the asset requests, which reveal the chosen avatar, and the asset events (FR-040). No third-party host (FR-030). The Author's photos stay on the Author's machine, out of agent sessions' reach (FR-003). |
| II. Production-grade or not shipped | Yes | Tests: the arrival check's fixture set (SC-001) and fault injection (SC-007). Telemetry: the asset events, with a dashboard panel (FR-039). Cost: an estimate and a measurement (Expected Cost Impact; FR-038). Runbooks: the GPU hand-off (FR-035) and withdrawal (FR-041). Evals: no model-driven behavior runs in this repository. The studio's model choice has its own evaluation, the comparison note. |
| III. Intent before spec, spec before code | Yes | It comes from the accepted intent 003. The studio's workflow runs outside this repository's lifecycle by the Author's decision (the boundary); this repository receives only its outputs, which go through the lifecycle here. Local until publication carries over from spec 000. |
| IV. Least privilege | Yes | New denies come before the risks they guard: agents can't read the studio's folders (FR-003), or write the license allowlist or the approvals (FR-005). Each gets a forbidden-action matrix row. The hook, sandbox, `REVIEW.md`, and gate changes are the Author's to apply. Nothing is widened. |
| V. Cost is a first-class signal | Yes | No new model call or metered spend from this repository. While the studio holds the GPU, the twin stays inside its $2/day sub-budget, or degrades. Edge transfer is estimated and measured (FR-038). The studio's own model runs are a reading, not a deviation (Assumptions). |
| VI. Build in public, including failures | Yes | The records, the license allowlist, the comparison, and its likeness grids are public. The studio's workflows, photos, and blinding key stay in the studio, outside the repository (Assumptions). A published mistake gets an incident note (FR-041). |
| VII. Own the whole product | Yes | The records say which steps a model did and which the Author did by hand, so the credits never overstate either (FR-010). The studio's full-loop ownership is shown, not claimed. |
| VIII. Honest AI | Yes | The twin is disclosed as an AI wherever its avatar shows, in every mode (FR-026, FR-032). How the AI-made likeness is disclosed and marked is the second open question (FR-034). |

## Open Questions for `/speckit-clarify`

### Question 1: The media license (FR-015)

**Context**: The Author's choice of 2026-10-12: "Separate media license". "Code stays MIT. Assets get their own, stricter license (for example, all rights reserved or CC BY-NC-ND), chosen in the spec."

**What we need to know**: Which license do the assets and published images carry?

| Option | Answer | Implications |
|--------|--------|--------------|
| A (recommended) | All rights reserved, with a plain notice that viewing and linking are welcome | The most protective choice, and it matches the evaluation note's interim notice. It can be loosened later; a Creative Commons grant, like MIT, can't be taken back once published. Others may view the files, and fork the repository as GitHub's terms allow, but not reuse them. |
| B | CC BY-NC-ND 4.0 | Others may share unmodified copies non-commercially, with credit. It's irrevocable once published. Creative Commons licenses don't license publicity or personality rights, so the likeness would still need its own statement. |
| C | All rights reserved for the Author's likeness (the twin, the T3 grids), and CC BY-NC-ND 4.0 for everything else (visitor avatars, animations, the room) | Shareable non-likeness assets, with the face kept closed. Two notices to maintain, and a per-directory split. |
| Custom | Another license or split | Name it, and how it's marked. |

### Question 2: Disclosing and marking the AI-made likeness (FR-034)

**Context**: The intent's Constraints: "The twin stays disclosed as an AI (Principle VIII); a likeness makes that disclosure matter more." Its open question 6 asks "whether the twin's disclosure should say the avatar is an AI-made likeness, and whether the EU AI Act's transparency rules (Article 50, applying from 2 August 2026) reach it, including machine-readable marking". The evaluation note asks the Author to settle that marking before its first run.

**What we need to know**: How is the likeness disclosed to people, and to machines?

| Option | Answer | Implications |
|--------|--------|--------------|
| A (recommended) | Both: a visible line in the twin's disclosure that the avatar is an AI-made, stylized likeness of the Author, published by the Author's choice; and one machine-readable mark in every published image and model file (the IPTC digital source type for AI-generated media), with nothing else in the file | Goes as far as a metadata mark can toward Article 50's machine-readable marking, whether or not that article reaches this site. The plan's research confirms whether a metadata mark alone would suffice if it does. The mark leaks nothing (FR-006 allows only it). The disclosure's exact wording is the Author's to approve. |
| B | The visible line only; files carry no metadata at all | Simplest files. If Article 50's marking applies, the files fall short of it. |
| C | The machine-readable mark only; the twin's AI disclosure stays as it is | Machines can tell, but visitors aren't told that the face is AI-made beyond the twin's general disclosure. Weaker under Principle VIII. |
| Custom | Other wording or marking | Say which. |

### Confirmations (recommended defaults taken; a yes keeps each)

1. **Scope and phasing:** the intake covers every studio file. Phase 2 brings the avatars, Phase 3 brings the room's assets through the same intake, and the voice's marking stays with ADR 0011's spec.
2. **ADR 0010 first,** before the studio builds its workflow, leaning toward the survey's convention for the twin.
3. **Storage:** final files in plain git, served from the edge under content-derived names; no LFS or object store; a 500 MB history cap.
4. **Only the chosen avatar is fetched,** so the edge learns the choice, and the disclosure says so (a reading beside "no new byte leaves a visitor's device").
5. **Payload-free asset events from the browser,** disclosed.
6. **The budget and load-time defaults** in Assumptions, and the reference phone the plan names.
7. **Pre-publication cleanup for assets:** extend ADR 0013's cleanup to a file that locates the Author or breaks a license, with an ADR.
8. **The reading on Principle V:** the studio's model runs are outside the system, so they aren't a deviation.
