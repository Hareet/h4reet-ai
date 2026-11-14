# Implementation Plan: The Twin Pets the Dog, and the Dog-Intro Conversation

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> And if you finish early, I want you to continue for all the remaining items through to implmeentation and merging and choose your recommendations. Keep goign! You got this!

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His item, his words being the quoted letter and title: f) "twin petting do gand dog-intro conversation corpus". The eight clarification answers (spec.md, Q1 to Q8) are the recommended ones, taken, each also on the morning page; an overturned answer is reworked before he merges.

**Branch**: `night/spec-026/spec-026` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

## 1. Summary

Two halves, one selection.

1. **The petting (code, on the line).** A pure *pet director* takes a selection of the `dog` selectable and, where both figures show their models and motion is allowed, sends the room's dog figure to a pet spot beside the twin (spec 025's figure movement, through an adapter), turns the twin toward it, and runs the twin's `petting` state: the studio's `petting` clip where his approval bundles one, else a *reach layer* over the idle, which bends the arm on the dog's side to the dog's head by a two-bone reach, leans the spine, strokes, and withdraws. Then the dog goes home. A run from the dinosaur ends it. Everything tunable is scene data in `figures.pet`.
2. **The dog-intro (data and corpus, in one human patch).** The code reads an optional `figure` on a selectable, so the room's dog figure is a second pick target for the selectable `dog`; the selectable's scene line, the corpus proposal's lines and slot, and everything they regenerate travel together in one patch for his hand (spec Q7), so the hobbies-and-travel topic closes once and he evaluates once.

No dependency is added; nothing leaves the device for the petting; the conversation is a twin turn like any piece's.

## Technical Context

**Language**: TypeScript 5 (`apps/web`); Python 3.12 for the proposal's checker (`scripts/corpus/`). **Dependencies**: three.js as pinned; none new. **Testing**: Vitest on numbers and on the twin's and the man's real GLBs read in Node (`test/helpers/glb.ts`, as spec 019's rig tests do); pytest for the checker. **Target**: WebGL2 above ADR 0010's floor; nothing below it. **Performance**: FR-027, under 0.1 ms a frame and no per-frame allocation. **Constraints**: no human-only path written; no `assets/**`; no cap, CSP, route, or event kind change.

## Constitution Check

The spec's table holds before and after design. Principle I: degraded mode written first (spec §Degraded-Mode). Principle VII and VIII: nothing about him or his dog beyond the corpus and his words; the room's dog's name is an open slot; the likeness is said in his approval's line. No deviation; RG6's not measuring a moving figure is a reading (spec Assumptions), not a dropped control.

## 2. Decisions (research)

- **R-01 Pure core, thin shell.** `scene/pet.ts` (the director: a state machine `idle → approach → petting → return → idle`, on the room's clock; no three.js import) and `scene/pet-reach.ts` (the math pure, the rig finder and applier three's). Rationale: the order's rule 4, small tests on numbers.
- **R-02 The trigger is the selection, not the conversation.** `app.ts`'s one selection path (spec 004, R-33: `object_selected`, then the action) calls `pet.select(id)` beside `talk.topicSelected`. The director reads no conversation text and doesn't care whether the topic is ready (spec User Story 3, scenario 2). It ignores a selection of the active conversation's own piece the way `talk.ts` does, by the same check (`conversation === id`), exposed by `talk` as a read-only `active` (one getter, no behaviour change).
- **R-03 The reach.** For the arm on the dog's side: shoulder S (the `Arm` bone's world position), upper length a and fore length b (+ the hand's to the middle finger's base, from the rig at rest), target T on the dog's head (A025's `headTop()`, lowered 0.03 m and moved 0.05 m toward the twin). First the spine lean: the smallest lean about the hips' side axis, shared over `Spine`, `Spine1`, `Spine2` in equal parts, up to `lean_max_deg`, that brings |T − S′| ≤ 0.98 (a + b); then the two-bone solve in the plane of S′, T, and a pole 0.3 m out and down from the elbow (law of cosines for the elbow, an aim for the shoulder), the elbow clamped to `elbow_deg`; the hand's own rotation keeps the clip's, turned palm-down by the forearm's twist only. A target beyond reach: the arm straight toward it. The stroke moves T along the dog's heading by `stroke_m · sin(2π · n · u)` for the stroke's share u; reach-in and withdraw blend the layer's weight 0 → 1 → 0 by a smoothstep over 0.5 s. Pure functions over numbers (`solveLean`, `solveTwoBone`, `strokeTarget`, `weightAt`) are tested alone; chosen over three's `CCDIKSolver`, which iterates, allocates, and needs a skinned mesh's IK data the rig doesn't carry.
- **R-04 The applier.** Per reached bone, `base` and `applied` quaternions, as spec 019's gait applier keeps them (`scene/gait.ts`'s `applyBone`): if the bone still holds `applied` (the mixer didn't write this frame), `base` is kept, else it takes the bone's value; the layer writes `base` slerped toward the solve by the weight; `clearReach` writes `base` back. Copied, not shared: refactoring `gait.ts` would touch spec 019's tested code for no behaviour (rejected). Preallocated vectors and quaternions; no allocation per frame (FR-027).
- **R-05 The twin's state.** `twin-states.ts` gains `petting` after `fleeing` (spec 025's R-04) and `arriving`, before `answering`; the input `{ kind: "pet"; on: boolean }`; the machine's timers keep running, so a leftover answer's speaking time plays after (spec User Story 1, scenario 4). `TWIN_CLIP_ROLES` gains `petting`; `TWIN_CLIPS_DEFAULT.petting = "petting"`; the scene's `figures.twin.clips` gains `petting: petting`. In the controller (`scene/avatars.ts`, the twin's role choice), `petting` with no loaded `petting` clip plays `idle` and turns the reach layer on; with the clip, it plays once (`LoopOnce`), and its `finished` ends the state early, as the greeting's does. Any test pinning the closed lists changes that pin only, in the same commit (spec 020's R-04 rule).
- **R-06 The dog's movement.** Through A025's `goTo(point | null)`. Spec 025's plan has phases `home`, `fleeing`, `returning`; if its director, when this spec's T010 runs, has no `goTo`, T010 adds a phase `visiting` to `scene/chase.ts` (walk to the point at walking speed with spec 008's `step`/`slide` and spec 025's separation; hold; walk home on `null`; `fleeing` outranks it), test first in `chase-director.test.ts`'s owner's style, in a new file `chase-visiting.test.ts` so no 025 test is edited.
- **R-07 The twin's turn.** The director gives a heading offset, limited to `turn_max_deg` and turned at 180°/s, which the twin's driver adds to its place's turn; through the same driver call spec 025's director uses for the twin (A025), or, if the twin isn't fed by 025, through `scene/avatars.ts`'s twin placement (one setter, `twinHeadingOffset`).
- **R-08 The pet spot.** `figures.pet.spot` is an offset `{ right_m, forward_m }` in the twin's place's frame. Its default is chosen in T012 from the fixture room's floor (`compose/floor.ts`): the walkable point about 0.6 m from the twin toward the floor's open middle, where the dog's footprint (A025's radius) fits; a data test (`pet-spot.test.ts`) pins that the scene's spot is walkable, with the footprint, in `apps/web/room/scene.yaml`. The arm side follows the spot's sign (`right_m ≥ 0` → right).
- **R-09 The figure as a pick target.** A selectable gains an optional `figure: room-dog` (schema, `build/room/schema.ts`; the room bundle carries it through). In 3D, `scene.ts`'s pick areas add, for such a selectable, one member rectangle: the figure's world box projected to the stage each frame while the figure is pickable (its model showing; A025 phase `home`; the director `idle`), none otherwise; the highlight draws the figure's meshes as members' draws (`bundle3d.ts`'s `memberDraws` gains the figure's meshes for that selectable). `compose/pick.ts` is unchanged: it takes rectangles. The compositor's RG6 measures placements at the framing, as now; it can't measure a figure that moves (spec Assumptions). In 2D and the list, the members alone.
- **R-10 The live region.** `a11y.ts`'s `createAnnouncer`'s polite region (the room's one); the words are data, `figures.pet_note: The twin pets the dog.` in `apps/web/room/ui-words.yaml`, read through the index's `ui`. Said once at the petting's start.
- **R-11 Telemetry.** A `room.pet` entry in the frame log (`signals/frame-log.ts`'s `FrameEvent` union gains it): `{ start_ms, end_ms, path: "clip" | "reach", outcome: "done" | "skipped" | "cut" }`; no payload. The figures' dashboard panel's description gains the pettings' count by outcome (a docs edit beside spec 025's).
- **R-12 Lookdev's Petting view.** Without the patch the room has no `dog` selectable, so he can't see the petting in the room before he applies it. Lookdev gains a small "Petting" view (listed by `lookdev.yaml`'s `petting: { twin: true }`): the twin's model at its place, the dog at the pet spot (the dog's model where lookdev can read it, else a 0.62 m box of the dog's footprint), and a "Pet" button that runs the director on the stage's clock; it measures nothing. If it runs long, the task is dropped with a named note, as spec 020's R-05 allows its own view to be.
- **R-13 The corpus proposal's checker.** `scripts/corpus/dog_intro_proposal.py`, run on the proposal and the patch, read-only, deterministic, standard library only: each quoted span in the proposal's source table is found verbatim in its named file (`corpus/04-hobbies-and-travel.md`, the order's words in `intent/026-twin-pets-dog.md`, his approval's `disclosure_line` in `assets/policy/approvals.json`); the slot `hobbies.room_dog_name` has every field null; the Golden answer line is `<his answer>`; no digit stands outside a `{{slot:…}}`, a claim tag's date, or a Golden item's leading number; the patch touches none of `config/twin-readiness.yaml`, `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `tools/gates/**`; and it refuses to report the patch buildable while `approvals.json` holds no approval for the dog's model with a non-empty line (spec FR-019). It never reads `corpus/intake/private/`.
- **R-14 The studio's petting clip.** A later studio task; this plan writes its brief, `docs/studio/twin-petting.md`: on the twin's rig, in Blender 5.2.3 (main's tools list, P-7), one `petting.glb` (kind `animation`), root in place, the twin turned toward a dog standing at the default pet spot, reach, three strokes, withdraw, in `pet_s`; recorded as the other twin clips are (`likeness: true`, `source.type: "photo"`, `id: "H01"`), scrubbed; RA8 (the twin's reach toward the walls) and RA6 measure it at his intake. No photo is read; the rig is the delivered `twin.glb`. Its length sets `pet_s` where it differs.

## 3. Data model

- `figures.pet` (scene data, optional; defaults compiled into `pet.ts`): `{ spot: { right_m, forward_m }, cooldown_s: 20, approach_max_s: 4, turn_max_deg: 60, lean_max_deg: 35, stroke_m: 0.05, stroke_n: 3, pet_s: 3.5, elbow_deg: 150 }`. Placeholders; the Author's look sets them.
- `figures.twin.clips.petting: petting`; `TWIN_CLIP_ROLES` += `petting`.
- `selectables[].figure?: "room-dog"` (the one value allowed now; schema refuses another).
- The director's state: `{ phase: "idle" | "approach" | "petting" | "return", since_ms, side: "right" | "left", path: "clip" | "reach" | null, last_end_ms }`.
- `ui-words.yaml`: `figures.pet_note`.
- **The human patch's data** (spec FR-016 to FR-022), not merged on the line:
  - `apps/web/room/scene.yaml`, under `selectables`: `{ id: dog, name: Dog, members: [dog-sign], figure: room-dog, action: { talk: { topic: hobbies-and-travel, lead: The dog first. } } }`.
  - `corpus/facts/hobbies-and-travel.yaml`: `{ id: hobbies.room_dog_name, label: "The name of his dog that the room's dog is a likeness of", value: null, tag: null, source: null, public_safe: null, phrasing: " It is a likeness of {value}." }`.
  - `corpus/04-hobbies-and-travel.md`, under "## Arya": ``- `[A 2026-11-13]` The dog in the room, in his words: "it's okay that we use the likeness of my dog". `[A <approval date>]` In his words: "<the disclosure line>".{{slot:hobbies.room_dog_name}}``.
  - Under "## Do not claim", after his recorded "No", unchanged: `- That the dog in the room is a real dog, a photo, or a recording: it is an AI-made likeness.`
  - Under "## Golden Q&A": ``9. *Who's the dog in the room?* — <his answer> [A]``.
  - Regenerated in a plain export: `config/twin/corpus.json`, `config/room-topics.yaml`, `config/room-events.yaml`, `evals/product/cases/twin-04-*.yaml`, `evals/narration/cases/*.yaml`.

## 4. Interface contracts

- `solveLean(shoulder, hips, target, reach, maxRad) → rad`, `solveTwoBone(shoulder, target, pole, a, b, elbowMax, out) → { shoulderAim, elbowRad }`, `strokeTarget(head, heading, u, cfg, out)`, `weightAt(t_s, cfg) → 0..1` (`pet-reach.ts`, pure).
- `findReachRig(root, side) → ReachRig | null` (null without the six bones), `applyReach(rig, solve, weight)`, `clearReach(rig)` (`pet-reach.ts`, three's).
- `createPet({ config, clock, animate, twin, dog, notes, log }) → { select(id), frame(dt), readonly phase, readonly activity: TwinActivity | null }` (`pet.ts`).
- Adapters (`pet-adapters.ts`, the one place that names specs 016, 020, and 025's real code): `twinFigure() → { place, rig, has(role), shows: "model" | "stand-in" | "capsule" }`, `dogFigure() → A025 | null`, `fleeing() → boolean`.
- `TwinActivity` gains `{ kind: "pet"; on: boolean }`; spec 016's twin-states contract §1 and §2 are amended here (M1, M2), the contract file staying spec 016's.
- `talk`'s rendered object gains a read-only `active: string | null` (R-02).

## 5. Files expected to touch

The implementer merges this branch first, after spec 025's code and spec 020's are on the line (§9).

- **New (code)**: `apps/web/src/room/scene/pet.ts`, `scene/pet-reach.ts`, `scene/pet-adapters.ts`, `apps/web/src/lookdev/petting.ts`.
- **Changed (code)**: `apps/web/src/room/scene/twin-states.ts` (state, activity, role), `scene/avatars.ts` (the twin's `petting` role, the reach's on and off, the heading offset if R-07 needs it), `scene/chase.ts` (only if 025 has no `goTo`: the `visiting` phase), `scene.ts` (the figure's pick rectangle and highlight), `scene/bundle3d.ts` (`memberDraws` with the figure's meshes), `app.ts` (the selection calls `pet.select`; the director's frame), `src/talk/talk.ts` (`active` getter), `signals/frame-log.ts` (`room.pet`), `build/room/schema.ts` (`figures.pet`, `selectables[].figure`), `src/room/compose/bundle.ts` (types), `apps/web/src/lookdev/page.ts`, `src/lookdev/stage.ts`.
- **Changed (data, on the line)**: `apps/web/room/scene.yaml` (`figures.pet`, `figures.twin.clips.petting`; not the `dog` selectable), `apps/web/room/ui-words.yaml` (`figures.pet_note`), `apps/web/room/lookdev.yaml` (`petting`).
- **New tests**: `apps/web/test/room/pet-reach.test.ts`, `pet-reach-rig.test.ts`, `pet-director.test.ts`, `pet-degraded.test.ts`, `pet-states.test.ts`, `pet-adapters.test.ts`, `pet-spot.test.ts`, `pet-notes.test.ts`, `pet-bench.test.ts`, `dog-selectable.test.ts`, `apps/web/test/lookdev/petting-view.test.ts`; `chase-visiting.test.ts` only with R-06's fallback; `scripts/corpus/test_dog_intro_proposal.py`.
- **Changed tests**: `apps/web/test/room/twin-states.test.ts` (the state added; the existing cases stay), and any test pinning `TWIN_CLIP_ROLES`, `TWIN_STATES`, the `FrameEvent` kinds, or `ui-words.yaml`'s keys: the pin only, in the same commit.
- **New (scripts, docs)**: `scripts/corpus/dog_intro_proposal.py`; `docs/studio/twin-petting.md` (the clip's brief); `corpus/proposals/dog-intro-2026-11-14.md` (or FR-017's fallback path); `docs/merge-requests/<date>-corpus-dog-intro.patch`; `docs/merge-requests/<date>-feat-026-twin-pets-dog.md`; the figures' dashboard description beside spec 025's.
- **Not touched**: `assets/**`, `assets/policy/**`, `corpus/**` outside `proposals/`, `config/twin-readiness.yaml`, `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`.
- **Conflict watch**: `twin-states.ts` (specs 019, 025), `avatars.ts` (019, 020, 025), `chase.ts` (025), `scene.ts` and `bundle3d.ts` (021, 024 if it touches pieces), `schema.ts` and `scene.yaml` (020, 025), `frame-log.ts` (019, 025), `config/twin/corpus.json` (spec 022's patch). The adapters keep this spec's edits to those files small; it merges last of them.

## 6. Test plan (small tests first; rule 4)

All Vitest runs from `apps/web` (`npx vitest run <files>`), never the whole suite.

| Test file | Covers | Run |
|---|---|---|
| `test/room/pet-reach.test.ts` | R-03, FR-007, FR-008 on numbers | that file |
| `test/room/pet-reach-rig.test.ts` | R-03, R-04, SC-002 on the real twin and man GLBs | that file, plus `test/room/avatar-gait.test.ts` (shares the rig helper) |
| `test/room/pet-states.test.ts`, `test/room/twin-states.test.ts` | R-05, FR-009, SC-004 | both, plus `twin-handoff.test.ts`, `twin-figure.test.ts`, `twin-2d.test.ts` (import the lists; the last is flaky under load: rerun alone before reporting) |
| `test/room/pet-director.test.ts` | R-01, R-02, R-07, FR-001 to FR-006, FR-010, FR-011, FR-026, SC-001 | that file |
| `test/room/pet-degraded.test.ts` | FR-001, FR-004, FR-011, SC-003 | that file |
| `test/room/pet-notes.test.ts` | R-10, FR-024, SC-006 | that file, plus `test/room/vocabulary.test.ts`, `test/room/words.test.ts` |
| `test/room/pet-adapters.test.ts` | §4 adapters, A016, A020, A025 | that file |
| `test/room/pet-spot.test.ts` | R-08 | that file, plus `test/room/schema.test.ts`, `test/room/data-only.test.ts`, `test/room/scene.test.ts` |
| `test/room/dog-selectable.test.ts` | R-09, FR-013, FR-014, User Story 3 on a fixture scene | that file, plus `test/room/pick.test.ts`, `test/room/objects.test.ts`, `test/ui/a11y.test.ts` |
| `test/room/pet-bench.test.ts` | FR-027, SC-007 | that file |
| `test/lookdev/petting-view.test.ts` | R-12 | that file, plus `test/lookdev/page.test.ts` |
| `chase-visiting.test.ts` (R-06 fallback only) | A025's `goTo` | that file, plus spec 025's `chase-director.test.ts`, `chase-steer.test.ts` |
| `scripts/corpus/test_dog_intro_proposal.py` | R-13, FR-017 to FR-023, SC-005's first half | `python3 -m pytest -q scripts/corpus/test_dog_intro_proposal.py` from the root |

Docs and intent changes: `python3 -m pytest -q evals/test_docs_links.py evals/test_repository_docs.py`. `make lint` after each task. The full `make check` runs once, at the end of the stack, by one task (the order's rule 4), not by a task of this spec unless the supervisor names it.

## 7. Human-only paths and the patch

`docs/merge-requests/human-patches/026.md` lists them. In short: the corpus lines and slot, built as one patch from plain copies with the `dog` selectable's scene line and the regenerated files (spec Q7); the twin's `petting.glb` and its record (his intake of the studio round); its approval entry; and, after his evaluation runs, his `config/twin-readiness.yaml` hashes. Order: spec 020's approval of the dog's model first (its line is quoted in the corpus line), then this patch. If spec 022's corpus patch lands first, this one is rebuilt on it (both regenerate `config/twin/corpus.json` and the narration cases), and the reverse.

## 8. Validation

Run the §6 files and `make lint`; the Author's look at the petting on lookdev's Petting view (stand-in, then clip) and in the room after the patch (SC-008), and his evaluation runs for the topic.

## 9. Order

Implementation runs on one line after spec 025 (item h), which runs after 019, 020, and 021: this branch merges first for its artifacts, then T001 onward. Tasks T001 to T009 need none of 020's or 025's code (fakes); T010 onward reads it through the adapters.

## 10. Complexity tracking

One director, one reach layer, one twin state, one selectable field, one lookdev view, one checker. The reach is the narrowest code stand-in that shows a petting before the studio's clip; the `figure` field is the narrowest way to make the dog itself clickable without a second selection path.
