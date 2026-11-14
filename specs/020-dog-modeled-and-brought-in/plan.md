> **Approved provisionally by the Author's order of 2026-11-13**, in his words: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog." And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". Each question stays on the morning page with its recommended answer; an overturned answer is reworked before he merges.

> **Reworked** 2026-11-14 on Opus 5.5 (rule 6), after rv-spec-020 (blocking), with the decision page's Q67 to Q70, each "Answered: recommended, the Author 2026-11-13": the photos move into the photos folder first, and no session reads one (§5); the dog is both the visitor's avatar and spec 025's room figure, with clips `idle`, `walk`, `run` (R-02, R-03, R-09); the records and the credit (§4, R-08); SC-002 at intake (R-10). The code line (impl-020) was past T005 when this rework landed: its new work is T014 to T019, appended in tasks.md.

# Implementation Plan: Dog Modeled and Brought In

**Branch**: `night/spec-020/spec-020`, reworked on `night/rework-spec-020/rework-spec-020` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: the spec with its provisional answers (Q1 to Q6, Q1 and Q2 reworked) and five defaults (D1 to D5, D3 reworked). Read at `main`'s tip, 3c0e4cd0; the rework read impl-020's tip, c169da96, for the code it builds on.

## 1. Summary

Spec 009 already shows an avatar's model in the visitor's figure where `assets/visitors/<id>/` holds one, and the cut-out where it doesn't. The dog is the fourth avatar, with no folder, so it shows the cut-out. This plan adds what is missing to bring the dog's model in:

1. **A likeness gate for a visitor avatar** (RA9): today only the twin's files are held to a look approval with a line (RA6, spec 016). A visitor avatar recorded as a likeness or from a photo is bundled only with the same approval, so the dog's model never reaches a visitor before he approves its look, and the build still passes without it (stand-in = the cut-out).
2. **The likeness line**: the approval's `disclosure_line` rides with the dog's bundled model and shows in the room's note and "Around the room" while any figure shows the model: the visitor's, or spec 025's room dog figure, through one shared input.
3. **A four-legged avatar's edges**: no hand bone (the paper stays at the anchor), `walk` with the root in place, the rest-pose height. Mostly tests on code that exists. And the `run` role, in the closed list, bundled and loaded, played by spec 025 only.
4. **Lookdev's avatar view**: so he can judge the model before he approves it (his look approval is his alone).
5. **The credit**: `scripts/assets/credits.py` says "a likeness of the Author's dog" for the dog's model, never "of the Author".
6. **The studio round**, described here and carried out by a later studio task from his reviewed concept image, and the human patches (moving the photos, the concept, his intake, his approval entry).

No new dependency, endpoint, route, event, or setting.

## Technical Context

**Language/Version**: TypeScript 5 (room, build, lookdev, tests); Python 3.12 for the credits' one line (`scripts/assets/credits.py`) and its test, and otherwise only through existing gates (arrival check, scrub).

**Primary Dependencies**: three.js and what spec 009 already imports. None added.

**Storage**: static files, `assets/visitors/dog/`, served content-addressed as the other avatars' are.

**Testing**: Vitest, file by file (§8). `make lint` per task. `make check` once, by one task, at the stack's end.

**Target Platform**: as spec 009: WebGL2 above ADR 0010's floor; the cut-out below it.

**Performance Goals**: spec 002's FR-048. First visit under phase 3's 25,000,000 bytes (RK5).

**Constraints**: no human-only file edited; no photo in the repo or an agent's context; `make up` builds with or without the dog's files.

## 2. Constitution check

- **I (data-local)**: no byte beyond the site's origin; nothing biometric from a visitor; the dog is a pre-made avatar. Degraded mode is the cut-out (spec §Degraded mode).
- **II (production-grade)**: the check (RA9), its report line, and the failure path are tested; observation reuses `avatar_failed`.
- **III (intent, spec, code; humans merge)**: the chain is followed; every merge is his.
- **IV (least privilege)**: the studio uses only main's tools list (P-7). The photos his order names sit outside the deny today (spec Assumptions, "The photos"); they move into the denied photos folder before any studio round (patch 020, item 1), and no session reads one, the studio's included (spec FR-011; spec 003's FR-003). Nothing is widened.
- **V (cost)**: none in the cloud (spec §Cost estimate).
- **VI (in public)**: the intake note quotes his consent; the build is in the open.
- **VII (own the whole product)**: the dog's likeness and the choice to show it are his, and the line says so.
- **VIII (honest AI)**: the line (FR-007), shown wherever the likeness shows, the room's dog figure included; the credit names whose likeness it is.

No violation; one reading (spec 003's FR-017, "resemble no real person") and one conflict (REVIEW.md's C5 against spec 003's data model §2) are named in the spec's Assumptions.

## 3. Research decisions

- **R-01, where the gate goes.** `apps/web/build/room/avatars.ts`'s `readAvatars` already refuses per file (RA1, RA2, RA4) and leaves a refused file out of the bundled set; `lineFor` (twin's RA6, §`readTwin`) looks up main's likeness approval by the model's SHA-256 and a non-empty line. RA9 reuses `lineFor`, its parameter loosened from the twin's file type to anything with a `sha256`, for a visitor model whose record says `likeness: true` or `source.type: "photo"`, except the twin's stand-in, which RA3 already holds to "never a likeness". A clip is bundled only where its model is. Decided: reuse, one new rule id, the twin's rules untouched. Rejected: gating by folder name (`dog`), which would miss the next likeness.
- **R-02, where the line travels.** The line is data: `AvatarSet`'s dog entry gets `line: string | null`, emitted in the bundle's `avatars.<id>` entry beside its files (`compose/bundle.ts`), never in code or in a UI word. The room's note and "Around the room" read it through `text-copy.ts`, beside the twin's slot: a second slot, `{ visitor_line: true }`, which the room fills when the visitor's own picture shows (the avatar controller's signal for the visitor's figure, as `own` is the twin's, `scene/avatars.ts`) and leaves empty (hidden) otherwise. Rejected: a UI-word string, because the approval's words are his and change with his answer.
  *Reworked (Q69, "both"):* the line shows while **any** figure shows the likeness model, not only the visitor's. The shared input is the stage's picture signal (`FigureSignal`, `kind: "picture"`, with its optional `line`, as T006 to T008 build it for the visitor): a small pure holder, `src/room/likeness-line.ts`, takes each figure's picture signal, keeps the line of every figure whose signal carries one, drops a figure's when its next picture signal carries none (a cut-out, a failure, its model gone), and gives the text copy's slot and the stage's note the line while one figure or more holds it, once, and null otherwise. `app.ts` feeds it every figure's picture signals, where T008 feeds only the visitor's. Spec 025 widens `FigureId` with its dog figure and sends that figure's picture signals the same way; nothing more of this spec's code changes for it. The slot keeps its name, `visitor_line`, so no pin moves again (R-04); its doc comment says it is the likeness line of any visitor-avatar model the room shows. Rejected: a second slot for the room's figure, which would print the same line twice when both show.
- **R-03, a quadruped's driver.** `scene/avatars.ts` scales by the rest pose's precise bounds to the table's height, lifts the lowest point, faces +z, plays `walk` while walking. A model whose rest pose has a raised head or tail would make the height wrong, so FR-012 asks the studio for a level-headed standing rest pose, and a test pins the scaling on a fixture with a tail above the back. No hand bone: R-08's "with neither bone, none" path, pinned by a test (`dog-avatar.test.ts`). No code change expected here; if a test finds one, it lands in `scene/avatars.ts` with the test first.
  *Reworked (Q69):* the clips are `idle`, `walk`, and `run`. `run` joins the closed list `CLIP_ROLES` (`src/choice/avatars.ts`), after `walk`, so the build reads `<id>-run.glb` as a clip (its folder's roles, RA1, RA2, RA4, RK3, and RA9's "only with its model") and the loader loads it with the avatar's other clips, into the instance's clips by role, where spec 025's figure finds it. The visitor's driver picks `walk` or the idle as today and never `run` (spec FR-017); a test pins that. Any test that pins the closed list's four entries changes that pin only, in the same commit (R-04). The man's and woman's folders hold no run file, so nothing of theirs changes.
- **R-04, copy order pin.** Adding the slot moves the text copy's order, which the compose tests pin; a test pinning today's order changes in the same commit as the code (spec 016's plan R-18); no other existing test is edited.
- **R-05, the Author's look.** The twin was judged on lookdev's own controls. Lookdev's "Hands" view lists avatars with hands (`lookdev.yaml` `hands.avatars: [man, woman]`) and can't show a dog. A small "Avatars" view, listed by `lookdev.yaml`'s `avatars: [dog]`, draws each listed avatar at rest, at its idle's first frame, and at its walk's and its run's middle frames (each where the clip exists), beside the man at the table's heights for scale, as the Hands view draws its cases (`src/lookdev/hands.ts`'s drawing, shared). It measures nothing. If it runs long, the task is dropped with a named note, and he judges the model in Blender or any glTF viewer (his), since the room's bundle stays closed to it until his approval by design.
- **R-06, the likeness on the arrival check.** `tools/gates/arrival_check.py` (human-only) already requires, for a record with `likeness: true` or `source.type == "photo"`, an approval with all five confirms true. Nothing there changes; RA9 is the compositor's half, as RA6 is for the twin.
- **R-07, the studio's round.** See §5.
- **R-08, the credit (Q6; spec FR-014).** `scripts/assets/credits.py` renders each entry's "- A likeness of the Author: yes" from `likeness: true` alone, so the dog's model would read as a likeness of the Author. Decided: the line names whose likeness it is by the record's directory, from a small table in `credits.py` (`assets/visitors/dog` → "the Author's dog"; every other directory "the Author", as today), so the dog's model reads "- A likeness of the Author's dog: yes" and every committed credit renders byte for byte as before (`--check` passes on main's tree). Rejected: a new record field, which the arrival check (`tools/gates/**`, human-only) would refuse as an unknown key, and spec 003's contract would need amending. `scripts/assets/` is not a human-only path. The arrival step runs `credits.py --check`, so this is code the Author's gate runs: it is reviewed like the rest of the stack.
- **R-09, the room's dog figure (Q69).** Spec 025's: its placement, footprint, driver, and when `run` plays. This spec gives it the model, `run` loaded by role (R-03), and the line's shared input (R-02). Collisions: §6.
- **R-10, SC-002 at intake.** The caps and the first-visit budget are measured on the real files, so SC-002 is met by the compositor's RA4 (per-file caps) and RK5 (the first visit's bytes) when his intake commit builds, with the report's lines (T003) showing the figures. No fixture test stands in for it.

## 4. Data model

- `records.json` (`assets/visitors/dog/`), per spec 003's asset-record contract (Q6): `dog.glb` kind `avatar`, `likeness: true`, `source.type: "photo"` with the photo-batch id and no photo, each step by `model` or `hand` with its tool and license from the list; `dog-idle.glb`, `dog-walk.glb`, `dog-run.glb` kind `animation`, `likeness: false`, made in Blender on the model's rig from no photo, their source not a photo (`asset`, naming the model's entry, as the data model §2 allows).
- Approval entry (his, `assets/policy/approvals.json`): `{id, sha256, path_when_approved: "assets/visitors/dog/dog.glb", kind: "avatar", date, confirms: {likeness_accepted: true, nothing_locates: true, no_screen_logo_text_or_art: true, recreation_not_photo: true, record_complete: true}, disclosure_line, reason}`, for the model. The clips, `likeness: false` and from no photo, need none by the arrival check's rule P (a hand-made file gets its WARN line); RA9 bundles them only with their model. He may add one per clip if he wants each file approved.
- Bundle: `avatars.dog = {model, clips, line}` where `line` is new and optional (absent for every other avatar); `clips` may hold `run`. Types in `src/room/compose/bundle.ts`; in the build, `Avatar` (`build/room/avatars.ts`) gains `line: string | null`.
- The closed list: `CLIP_ROLES = ["idle", "idle-holding", "take", "walk", "run"]` (R-03).
- The credit (`assets/CREDITS.md`, rendered): the model's section reads "- A likeness of the Author's dog: yes" (R-08).

## 5. The studio round and the intake (not code)

A later studio task, using only main's `assets/policy/studio-tools.json` (P-7), by the spec's FR-010 to FR-014. No Claude session reads a photo, the studio's included (spec FR-011; spec 003's FR-003; the photo guide). Sequence, as the man's and woman's were made (their records show the shape):

0. **The photos into the photos folder**: his step (patch 020, item 1; Q67). He moves them from `briefs/` into the photos folder by the photo guide, deletes the copy under `briefs/`, and says whether any session read them.
1. **Concept** from the photos: his step (Q2; Q68; patch 020, item 2). He queues it inside the photos folder, set up by the photo guide's checklist (the local FLUX.2 klein 4B in his ComfyUI, as the list has it), reviews the concept ("by hand"), and puts only the reviewed concept image in the studio's inbox: data-flow row D4's "style frame", what the studio's session may receive.
2. **The studio round starts here**, queued only once the reviewed concept image is in the studio's inbox. **Mesh and base-colour texture** from the concept: Pixal3D int8 with DINOv3 (and MoGe-2 where the pipeline uses it), through ComfyUI 0.42.5, the studio agent driving it. No brief, work order, or studio document names a photo's path; the brief names the concept image only (decision page Q71 lets a brief's `references` take a path under the asset's own briefs folder, for such an input).
3. **Rig and clips** in Blender 5.2.3: a standing, level-headed rest pose; `idle` (loop, root in place), `walk` (loop, root in place, four-legged gait), and `run` (loop, root in place, a faster four-legged gait, for spec 025's room figure); exported with the bundled glTF exporter at the file sizes of main's caps; the model's skeleton node names the clips target.
4. **Scrub and record**: `scripts/assets/scrub.py` strips metadata; `records.json` written with each step and licence, the model `likeness: true` and `source.type: "photo"`, the clips `likeness: false` (§4); no photo, no EXIF, no path.
5. **Hand-back** to the studio's hand-off folder; **judging** by the decision page's Q72 (round 1 left open while the arrival check's P1, awaiting his approval, is its only finding); **intake** by him (a commit of `assets/visitors/dog/**`; the arrival check runs on it); **look** on lookdev's Avatars view (R-05); **approval** entry (patch 020, item 4). Until then the cut-out shows.

If the listed tools can't make a likeness from the concept image, the round stops at step 2 and asks him; it adds nothing. The data-flow disclosure check: D1's sentence already says the Author's AI-made likeness reaches Anthropic when a session reads one; a dog's likeness is the same kind of file, so T012 reads the disclosure and adds a sentence only if the dog changes none of its rows.

## 6. Files expected to touch (the implementer merges this branch first)

New:
- `apps/web/test/room/likeness-visitor.test.ts`, `apps/web/test/room/dog-avatar.test.ts`, `apps/web/test/room/dog-line.test.ts`, `apps/web/test/lookdev/avatars-view.test.ts`
- `apps/web/src/lookdev/avatars.ts` (the view; shares `hands.ts`'s drawing)
- `docs/studio/avatar-dog.md` (the round's brief, hand-written: inputs, outputs, tools, the checks)
- `docs/merge-requests/<date>-spec-020-dog.md` (the stack's note, with the one `make check`)
- From the rework: `apps/web/src/room/likeness-line.ts` (R-02's holder), `apps/web/test/room/likeness-line-anywhere.test.ts`, `apps/web/test/room/dog-run.test.ts`, `scripts/assets/test_credits_likeness.py`

Modified:
- From the rework: `apps/web/src/choice/avatars.ts` (`run` in `CLIP_ROLES`), `apps/web/src/room/app.ts` (every figure's picture signal to the holder), `scripts/assets/credits.py` (R-08), and any test pinning the closed list's entries, the pin only
- `apps/web/build/room/avatars.ts` (RA9; the line on the avatar's entry)
- `apps/web/build/room/checks/family.ts` (RA9 registered beside RA6, lenient as RA1 is) and `checks/ra.ts` (the header comment only)
- `apps/web/build/room/emit.ts` (the entry's `line`; the copy's slot)
- `apps/web/build/room/report.ts` (the dog's lines)
- `apps/web/src/room/compose/bundle.ts` (types)
- `apps/web/src/room/text-copy.ts` (the slot)
- `apps/web/src/room/scene/avatars.ts`, `apps/web/src/room/app.ts`, `apps/web/src/room/stage.ts` (the visitor's picture signal reaching the slot; only as far as T008 needs)
- `apps/web/src/lookdev/page.ts`, `apps/web/src/lookdev/stage.ts`, `apps/web/room/lookdev.yaml` (the Avatars view)
- the compose tests that pin the copy's order (R-04), only the pin
- `docs/data-flow-disclosure.md` (a sentence, only if T012 finds one needed)

Not touched: `assets/**` (his intake), `assets/policy/**`, `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`. Likely collisions with the night's other specs on `avatars.ts`, `emit.ts`, `bundle.ts`, `text-copy.ts` (the dinosaur, item e, and the chase, item h, extend the same avatar path), and now on `CLIP_ROLES`, `FigureId`, and `likeness-line.ts` with spec 025: merge this branch first and rebase the others on it. Spec 025's A020 should then read this spec's `run` role and the holder instead of assuming its own.

## 7. Telemetry, dashboard, disclosure (CLAUDE.md's "new feature" list)

Span or event: none new (`avatar_failed`, asset events). Dashboard panel: the "Room" row's existing "Visits whose avatar failed". Cost estimate: in the spec. Degraded mode: the cut-out. Data-flow disclosure: no new byte leaves the device; T012 checks as §5 says.

## 8. Validation: the small tests

Each task runs only its own files and the ones covering what it changes, and `make lint`, from `apps/web` (`npx vitest run <files>`, never the whole suite):

| Covers | Files |
|---|---|
| RA9, the line, the bundle | `test/room/likeness-visitor.test.ts`, `test/room/avatars-compose.test.ts`, `test/room/twin-compose.test.ts`, `test/room/compose.test.ts` (it lists the rule table) |
| The dog in the scene: scale, walk, no hand, fallback | `test/room/dog-avatar.test.ts`, `test/room/avatar-scene.test.ts`, `test/room/avatar-loader.test.ts`, `test/room/avatar-handoff.test.ts` |
| The line in the room's copy | `test/room/dog-line.test.ts`, `test/room/compose.test.ts`, `test/room/mount.test.ts` |
| Lookdev's Avatars view | `test/lookdev/avatars-view.test.ts`, `test/lookdev/page.test.ts` |
| Reports | `test/room/report.test.ts` |
| The line wherever the model shows (rework) | `test/room/likeness-line-anywhere.test.ts`, `test/room/dog-line.test.ts`, `test/ui/text-copy.test.ts`, `test/room/mount.test.ts` |
| The `run` role (rework) | `test/room/dog-run.test.ts`, `test/room/avatars.test.ts`, `test/room/avatars-compose.test.ts`, `test/room/likeness-visitor.test.ts`, `test/room/avatar-loader.test.ts`, `test/room/avatar-scene.test.ts`, `test/room/avatar-driver.test.ts`, `test/room/avatar-gait.test.ts` |
| The credit (rework) | from the repository's root: `pytest scripts/assets/test_credits_likeness.py scripts/assets/test_credits.py` (the Makefile's pinned pytest, or the devcontainer's) |

`apps/web/test/room/twin-2d.test.ts` is a known flaky test under load; a failure there is reported with evidence (passes alone), not chased. `make check` runs once, by T013, at the stack's end.

## 9. Risks

- **The photos sit outside the deny until he moves them.** `/srv/studio/briefs/` is mounted into four session kinds (spec Assumptions). Nothing of this spec opens or names them for a session; the studio round is held until his concept image is in the inbox (§5), and the decision page holds studio-dog-r1 (Q67, Q68). His move is patch 020's first item.
- **The likeness can't be made from the listed tools.** The round stops and asks (FR-010). US1 to US3 stand on fixtures; the cut-out stays. His to add a tool.
- **A reviewer reads REVIEW.md's C5 literally** and flags the model's `likeness: true`. Named in the spec's Assumptions and the merge-request note (Q6).
- **The model is over a cap or the first-visit budget.** RA4 and RK5 report it; the studio round targets the caps; the first visit counts only the largest visitor character, so the dog adds nothing while it isn't the largest.
- **A walk clip's feet slide.** Judged on lookdev's view; the studio redoes the clip. Not a build failure.
- **Collision with the dinosaur's and the chase's specs.** §6.

## 10. Complexity tracking

One new check (RA9), one new copy slot and its holder, one clip role, one credit line, one lookdev view. Each is the narrowest thing that gives the Author the gate (RA9), the disclosure (slot, holder, credit), the room figure's clips (`run`), and the look (view); none is a new service or dependency.

## 11. Departures in implementation (impl-020, 2026-11-14)

- **R-03 holds as written (T004, T005).** Every case of `dog-avatar.test.ts` passed on spec 009's and 019's code: the scale by the rest pose's precise bounds, floor, +z, walk, idle with the slide, reduced motion, no hand bone, the cut-out on a failed or lost model. They are pins; `src/room/scene/avatars.ts` changed for none of them.
- **R-02, how the line reaches the room (T008).** The 3D stage's picture signal (`FigureSignal`, `src/room/stage.ts`) gains an optional `line`, set by `scene/avatars.ts` only where the shown avatar's bundle entry has one, so no existing signal pin moves. `app.ts` hands it to the stage's notes (`layout.ts`'s `setVisitorLine`) and to the text copy (`setVisitorLine`). Both add their element only while there are words and remove it otherwise, so the cut-out's layout and "Around the room" are exactly as before. The text copy still reads the index alone. The line comes with the signal, never from the 3D part.
- **The report (T003).** The dog's files, bytes, and texture memory were already in the avatars table, with RA9 as the refused model's `why`. The new part is one `Likeness` line per likeness: the approval holds (with its line), or RA9 leaves it on the cut-out. The line is read from the compose's findings and the avatar's `line`, so `Avatar` gains only `line`, as §4 has it.
- **R-05 taken: lookdev's Avatars view dropped (T009, T010).** The view could draw only a bundled model, and RA9 keeps the dog out of every bundle (drafts and lenient builds included) until his approval. So the view would show the dog only after the approval it was meant to inform. Showing it earlier needs a drafts-only exception to RA9, which is his call (on the questions page). He judges the model in a glTF viewer or Blender, as R-05's fallback has it.
- **T012.** One sentence in the disclosure's D1: the dog's AI-made likeness reaches Anthropic when a session reads it, as the Author's does. No new row and no new flow.

