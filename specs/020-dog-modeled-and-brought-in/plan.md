> **Approved provisionally by the Author's order of 2026-11-13**, in his words: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog." And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". Each question stays on the morning page with its recommended answer; an overturned answer is reworked before he merges.

# Implementation Plan: Dog Modeled and Brought In

**Branch**: `night/spec-020/spec-020` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: the spec with its five provisional answers (Q1 to Q5) and five defaults (D1 to D5). Read at `main`'s tip, 3c0e4cd0.

## 1. Summary

Spec 009 already shows an avatar's model in the visitor's figure where `assets/visitors/<id>/` holds one, and the cut-out where it doesn't. The dog is the fourth avatar, with no folder, so it shows the cut-out. This plan adds what is missing to bring the dog's model in:

1. **A likeness gate for a visitor avatar** (RA9): today only the twin's files are held to a look approval with a line (RA6, spec 016). A visitor avatar recorded as a likeness or from a photo is bundled only with the same approval, so the dog's model never reaches a visitor before he approves its look, and the build still passes without it (stand-in = the cut-out).
2. **The likeness line**: the approval's `disclosure_line` rides with the dog's bundled model and shows in the room's note and "Around the room" while the model shows.
3. **A four-legged avatar's edges**: no hand bone (the paper stays at the anchor), `walk` with the root in place, the rest-pose height. Mostly tests on code that exists.
4. **Lookdev's avatar view**: so he can judge the model before he approves it (his look approval is his alone).
5. **The studio round**, described here and carried out by a later studio task, and the human patches (his intake, his approval entry).

No new dependency, endpoint, route, event, or setting.

## Technical Context

**Language/Version**: TypeScript 5 (room, build, lookdev, tests); Python 3.12 only through existing gates (arrival check, scrub).

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
- **IV (least privilege)**: the studio uses only main's tools list (P-7); photos stay in the photos folder.
- **V (cost)**: none in the cloud (spec §Cost estimate).
- **VI (in public)**: the intake note quotes his consent; the build is in the open.
- **VII (own the whole product)**: the dog's likeness and the choice to show it are his, and the line says so.
- **VIII (honest AI)**: the line (FR-007), shown wherever the likeness shows.

No violation; one reading is named in the spec's Assumptions (spec 003's FR-017, "resemble no real person").

## 3. Research decisions

- **R-01, where the gate goes.** `apps/web/build/room/avatars.ts`'s `readAvatars` already refuses per file (RA1, RA2, RA4) and leaves a refused file out of the bundled set; `lineFor` (twin's RA6, §`readTwin`) looks up main's likeness approval by the model's SHA-256 and a non-empty line. RA9 reuses `lineFor`, its parameter loosened from the twin's file type to anything with a `sha256`, for a visitor model whose record says `likeness: true` or `source.type: "photo"`, except the twin's stand-in, which RA3 already holds to "never a likeness". A clip is bundled only where its model is. Decided: reuse, one new rule id, the twin's rules untouched. Rejected: gating by folder name (`dog`), which would miss the next likeness.
- **R-02, where the line travels.** The line is data: `AvatarSet`'s dog entry gets `line: string | null`, emitted in the bundle's `avatars.<id>` entry beside its files (`compose/bundle.ts`), never in code or in a UI word. The room's note and "Around the room" read it through `text-copy.ts`, beside the twin's slot: a second slot, `{ visitor_line: true }`, which the room fills when the visitor's own picture shows (the avatar controller's signal for the visitor's figure, as `own` is the twin's, `scene/avatars.ts`) and leaves empty (hidden) otherwise. Rejected: a UI-word string, because the approval's words are his and change with his answer.
- **R-03, a quadruped's driver.** `scene/avatars.ts` scales by the rest pose's precise bounds to the table's height, lifts the lowest point, faces +z, plays `walk` while walking. A model whose rest pose has a raised head or tail would make the height wrong, so FR-012 asks the studio for a level-headed standing rest pose, and a test pins the scaling on a fixture with a tail above the back. No hand bone: R-08's "with neither bone, none" path, pinned by a test (`dog-avatar.test.ts`). No code change expected here; if a test finds one, it lands in `scene/avatars.ts` with the test first.
- **R-04, copy order pin.** Adding the slot moves the text copy's order, which the compose tests pin; a test pinning today's order changes in the same commit as the code (spec 016's plan R-18); no other existing test is edited.
- **R-05, the Author's look.** The twin was judged on lookdev's own controls. Lookdev's "Hands" view lists avatars with hands (`lookdev.yaml` `hands.avatars: [man, woman]`) and can't show a dog. A small "Avatars" view, listed by `lookdev.yaml`'s `avatars: [dog]`, draws each listed avatar at rest, at its idle's first frame, and at its walk's middle frame, beside the man at the table's heights for scale, as the Hands view draws its cases (`src/lookdev/hands.ts`'s drawing, shared). It measures nothing. If it runs long, the task is dropped with a named note, and he judges the model in Blender or any glTF viewer (his), since the room's bundle stays closed to it until his approval by design.
- **R-06, the likeness on the arrival check.** `tools/gates/arrival_check.py` (human-only) already requires, for a record with `likeness: true` or `source.type == "photo"`, an approval with all five confirms true. Nothing there changes; RA9 is the compositor's half, as RA6 is for the twin.
- **R-07, the studio's round.** See §5.

## 4. Data model

- `records.json` (`assets/visitors/dog/`), per spec 003's asset-record contract: `dog.glb` kind `avatar`, `likeness: true`, `source.type: "photo"` with the photo-batch id and no photo, each step by `model` or `hand` with its tool and license from the list; `dog-idle.glb`, `dog-walk.glb` kind `animation`, `likeness: true`.
- Approval entry (his, `assets/policy/approvals.json`): `{id, sha256, path_when_approved: "assets/visitors/dog/dog.glb", kind: "avatar", date, confirms: {likeness_accepted: true, nothing_locates: true, no_screen_logo_text_or_art: true, recreation_not_photo: true, record_complete: true}, disclosure_line, reason}`; one entry per file, as the twin's seven.
- Bundle: `avatars.dog = {model, clips, line}` where `line` is new and optional (absent for every other avatar). Types in `src/room/compose/bundle.ts`; in the build, `Avatar` (`build/room/avatars.ts`) gains `line: string | null`.

## 5. The studio round and the intake (not code)

A later studio task, using only main's `assets/policy/studio-tools.json` (P-7), by the spec's FR-010 to FR-014. Sequence, as the man's and woman's were made (their records show the shape):

1. **Concept** from the photos: his step (Q2, option A: he queues it per `docs/studio/photo-guide.md`, inside the photos folder), FLUX.2 klein 4B as the list has it; he reviews the concept ("by hand").
2. **Mesh and base-colour texture** from the concept: Pixal3D int8 with DINOv3 (and MoGe-2 where the pipeline uses it), through ComfyUI 0.42.5, the studio agent driving it.
3. **Rig and clips** in Blender 5.2.3: a standing, level-headed rest pose; `idle` (loop, root in place) and `walk` (loop, root in place, four-legged gait); exported with the bundled glTF exporter at the file sizes of main's caps; the model's skeleton node names the clips target.
4. **Scrub and record**: `scripts/assets/scrub.py` strips metadata; `records.json` written with each step and licence; no photo, no EXIF, no path.
5. **Hand-back** to the studio's outputs folder; **intake** by him (a commit of `assets/visitors/dog/**`; the arrival check runs on it); **look** on lookdev's Avatars view (R-05); **approval** entries (patch 020, item 2). Until then the cut-out shows.

If the listed tools can't make a likeness from photos, the round stops at step 1 and asks him; it adds nothing. The data-flow disclosure check: D1's sentence already says the Author's AI-made likeness reaches Anthropic when a session reads one; a dog's likeness is the same kind of file, so T012 reads the disclosure and adds a sentence only if the dog changes none of its rows.

## 6. Files expected to touch (the implementer merges this branch first)

New:
- `apps/web/test/room/likeness-visitor.test.ts`, `apps/web/test/room/dog-avatar.test.ts`, `apps/web/test/room/dog-line.test.ts`, `apps/web/test/lookdev/avatars-view.test.ts`
- `apps/web/src/lookdev/avatars.ts` (the view; shares `hands.ts`'s drawing)
- `docs/studio/avatar-dog.md` (the round's brief, hand-written: inputs, outputs, tools, the checks)
- `docs/merge-requests/<date>-spec-020-dog.md` (the stack's note, with the one `make check`)

Modified:
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

Not touched: `assets/**` (his intake), `assets/policy/**`, `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`. Likely collisions with the night's other specs on `avatars.ts`, `emit.ts`, `bundle.ts`, `text-copy.ts` (the dinosaur, item e, and the chase, item h, extend the same avatar path): merge this branch first and rebase the others on it.

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

`apps/web/test/room/twin-2d.test.ts` is a known flaky test under load; a failure there is reported with evidence (passes alone), not chased. `make check` runs once, by T013, at the stack's end.

## 9. Risks

- **The likeness can't be made from the listed tools.** The round stops and asks (FR-010). US1 to US3 stand on fixtures; the cut-out stays. His to add a tool.
- **The model is over a cap or the first-visit budget.** RA4 and RK5 report it; the studio round targets the caps; the first visit counts only the largest visitor character, so the dog adds nothing while it isn't the largest.
- **A walk clip's feet slide.** Judged on lookdev's view; the studio redoes the clip. Not a build failure.
- **Collision with the dinosaur's and the chase's specs.** §6.

## 10. Complexity tracking

One new check (RA9), one new copy slot, one lookdev view. Each is the narrowest thing that gives the Author the gate (RA9), the disclosure (slot), and the look (view); none is a new service or dependency.

## 11. Departures in implementation (impl-020, 2026-11-14)

- **R-03 holds as written (T004, T005).** Every case of `dog-avatar.test.ts` passed on spec 009's and 019's code: the scale by the rest pose's precise bounds, floor, +z, walk, idle with the slide, reduced motion, no hand bone, the cut-out on a failed or lost model. They are pins; `src/room/scene/avatars.ts` changed for none of them.
- **R-02, how the line reaches the room (T008).** The 3D stage's picture signal (`FigureSignal`, `src/room/stage.ts`) gains an optional `line`, set by `scene/avatars.ts` only where the shown avatar's bundle entry has one, so no existing signal pin moves. `app.ts` hands it to the stage's notes (`layout.ts`'s `setVisitorLine`) and to the text copy (`setVisitorLine`). Both add their element only while there are words and remove it otherwise, so the cut-out's layout and "Around the room" are exactly as before. The text copy still reads the index alone. The line comes with the signal, never from the 3D part.
- **The report (T003).** The dog's files, bytes, and texture memory were already in the avatars table, with RA9 as the refused model's `why`. The new part is one `Likeness` line per likeness: the approval holds (with its line), or RA9 leaves it on the cut-out. The line is read from the compose's findings and the avatar's `line`, so `Avatar` gains only `line`, as §4 has it.
- **R-05 taken: lookdev's Avatars view dropped (T009, T010).** The view could draw only a bundled model, and RA9 keeps the dog out of every bundle (drafts and lenient builds included) until his approval. So the view would show the dog only after the approval it was meant to inform. Showing it earlier needs a drafts-only exception to RA9, which is his call (on the questions page). He judges the model in a glTF viewer or Blender, as R-05's fallback has it.
- **T012.** One sentence in the disclosure's D1: the dog's AI-made likeness reaches Anthropic when a session reads it, as the Author's does. No new row and no new flow.

