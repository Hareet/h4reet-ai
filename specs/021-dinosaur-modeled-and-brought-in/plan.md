# Implementation Plan: The Dinosaur, Modeled and Brought In

**Approved provisionally by the Author's order of 2026-11-13**:

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

(Rule 1 of that order: the spec-writer takes the recommended answer at clarify and at the plan. Each answer, Q1 to Q9 in the spec's Clarifications, went on the morning page with its recommendation, and the page records each as answered so by the Author (Q32 to Q38, Q73, Q75). An answer he overturns later is reworked before he merges.)

**Branch**: `night/spec-021/spec-021`, reworked on `night/rework-spec-021/rework-spec-021` after rv-spec-021 | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: the spec and its nine answers, read against the line: `night/impl-020/impl-020` at 384a0db8 (specs 018, 019, 020 implemented), spec 020's rework at `night/rework-spec-020/rework-spec-020` 7a002a6a, and `main` 3c0e4cd0 for the policy files. Contracts: [dinosaur-rig.md](contracts/dinosaur-rig.md), [dinosaur-brief.md](contracts/dinosaur-brief.md).

## 1. Summary

Spec 009 already shows any avatar's model where `assets/visitors/<id>/` holds one, and already leaves the paper at the hand anchor when an avatar has no hand bone. Spec 019's gait already applies no leg motion to a rig without the six Mixamo leg bones (its FR-008). Spec 014 already says `standin.avatar` while the chosen avatar shows its flat shape in 3D. So the dinosaur needs the asset (a studio round, then the Author's intake) and four small pieces of work: a rig table and three compositor rules (RA10 the rig's bones, RA11 the body's box, RA12 the required clips), each running only for an avatar with a rig-table row; tests that prove a handless, non-Mixamo model shows, plays, slides no gait, and degrades; a test that the room's figure cause goes when the dinosaur's model shows; and a test that the studio line passes the dinosaur's brief. Approach: extend `readAvatars` (where RA1 to RA4 and spec 020's RA9 live) with the table; nothing in the runtime changes unless T002 finds a defect.

## Technical Context

**Language/Version**: TypeScript 5 (the compositor and its tests), Python 3.12 (`scripts/studio/`).

**Primary Dependencies**: none new.

**Storage**: static files, `assets/visitors/dinosaur/` (the Author's intake; not written by an agent).

**Testing**: Vitest (`apps/web/test/**`), pytest (`scripts/studio/test_line.py`). Each task runs only its files (§5) and `make lint`. This item runs no full suite: `make check` runs once, at the end of the stack, by the stack's last task.

**Constraints**: no cap change; no human-only file changed; nothing new leaves the device; the local stack builds with or without the files; the Author's gate (`arrival_check.py`) unchanged.

**Scale/Scope**: one model, three clips, one record, one licence; about 150 lines of code and 400 of tests.

## Constitution Check

| Gate | Result |
|---|---|
| I. Disclosure, degraded mode first | Pass: no new flow; the cut-out is the degraded mode |
| II. Tests, telemetry, cost, docs | Pass: §5 names every test; no endpoint; the report line and spec 019's existing `gait` signal are the telemetry; cost $0 |
| III. Spec before code; humans merge | Pass: spec and plan precede code; provisional approval recorded at the top |
| IV. Least privilege | Pass: §3 lists the files; none human-only; the human patches are plain-copy notes (`docs/merge-requests/human-patches/021.md`) |
| V. Cost | Pass |
| VI. Public | Pass: original character; no photo; no claim about the Author |
| VII. Whole product | Pass: builds without the asset |
| VIII. Honest AI | Pass: `standin.avatar` shows while the dinosaur's model is missing |

No deviation, so no ADR.

## 2. Research decisions

- **R-01. The rig table lives in `apps/web/build/room/avatars.ts`, beside RA1 to RA4 and spec 020's RA9.** `readAvatars` already loops `AVATARS` and holds each model's raw node names (`model.nodes`) and its `refuse(...)` helper with the `checked` guard. Rules keyed by avatar id fit that loop; `checks/ra.ts` holds the twin's scene-level rules (RA6 to RA8) and would need the file reads again (rejected). The rule union gains `"RA10" | "RA11" | "RA12"`. Spec 016 took RA6 to RA8 and spec 020 took RA9 (on the line; spec 020's rework adds none), so the numbers start at 10. If the line holds a higher RA rule when impl-021 starts, impl-021 renumbers the three, in order, in every artifact of this folder and in the code.
- **R-02. RA10 compares raw node names, as `line.py` does.** The GLB reader gives `Arm.L`, not three's sanitized `ArmL`. A required bone is present where a node is named it exactly or ends with `:` + it (`line.py`'s `has_bone`), so the compositor and the studio line agree on every candidate. No runtime code reads these bones (the dinosaur has no hand bone; the holding-hand search and spec 019's `findLegRig` look for `mixamorig:` names and find none), so no runtime code changes.
- **R-03. RA11's box is measured after spec 009's scaling, from the avatar table.** The reader's `measures` gives `height` (the rest pose's, from `glb.bounds()`, in file units) and, from this plan (§4), `extent_x` and `extent_z` from the same bounds. The scale is `AVATAR_SHAPES[id].height / height` (spec 009's FR-016); RA11 refuses where `extent_x × scale` or `extent_z × scale` exceeds `AVATAR_SHAPES[id].width × 1.05`. For the dinosaur: 1.2 m high, 1.1 m wide, so 1.155 m. It reads the table, never lists the dinosaur's files (spec 009's FR-043).
- **R-04. RA12 reads the clips already read.** The folder's reads give each clip's role; `idle` and `walk` must both be present and stand on no RA1, RA2, or RA4 finding (a refused clip is a missing clip). `take` is optional; a missing `take` is spec 009's FR-003 (the idle plays in its place).
- **R-05. The rules run only where `RIG_BONES[id] !== null`.** `woman`, `man`, and `dog` are `null`: the woman and the man have no `walk` clip and are taller than wide, and the dog (spec 020, on the line) names no rig bones; none of them is measured, required, or matched. A later spec that names the dog's bones fills its row (the page's question, below).
- **R-06. The brief is tested through `line.py` from the contract's own JSON.** `test_line.py` extracts the first fenced `json` block from `contracts/dinosaur-brief.md` and runs `line.py brief` on it, written as `<tmp>/dinosaur/1.json` (the folder's name is the asset). Its fixture repository (`make_repo(root, tools=…, caps=…)`, through `set_main` and `main_files`) holds a stand-in tools list (`TOOLS`) by default; the new test passes the repository's real `assets/policy/studio-tools.json` and `assets/policy/caps.json`, read as files in the test only. A second test flips one named tool's `outputs_ship` to false and expects a finding; a third asserts `notes` holds "no film or franchise creature". No helper change is expected (`make_repo` takes `tools` and `caps` already). Checked by this rework: the contract's JSON passes `python3 -I -B scripts/studio/line.py brief` on this worktree.
- **R-07. A "handless, gaitless" proof first.** T002 writes the dinosaur-shaped fixture (no hand bones, no Mixamo, the rig's bones) and drives it through the stage tests that already exist for hands, the scene, and the gait (`avatar-hands`, `avatar-scene`, `avatar-gait`). Expected: the paper at the anchor, `take` once, the idle in a missing `take`'s place, the `walk` clip playing while it walks at its own speed (spec 019's FR-007 as `night/rework-spec-019/rework-spec-019` left it: spec 009's FR-025 and FR-028 unchanged, the time scale dropped by the page's Q63), no gait, and one `gait` `unavailable` signal (spec 019's FR-008, the same rework's text). If it passes unchanged, the runtime needs no change (the expected result). If it finds a defect, T002 stops and its failure goes into the stack's note; the fix is then a runtime task added by `/speckit-converge`.
- **R-08. The rule catalogue has its own tests, and two pins this item changes.** `checks/family.ts`'s `RULES` is the catalogue; `compose.test.ts` demands a `bad/<RULE>-*/expect.yaml` for every refusing rule, and pins (1) the lenient list ("makes RT17, RX, RA1 to RA4, spec 016's RA6 to RA8, spec 020's RA9, RK2, and RK5 alone lenient…") and (2) the `counts` table (`RA: 9`), which builds RA1 to RAn and needs them contiguous and in order. So RA10 to RA12 each need a catalogue entry after RA9 (lenient, with `model`, as RA1 to RA4), a bad case built from the fixture generators (`room-fixtures.ts`'s `glb:` table), and both pins extended, in the task that adds the rule: `counts.RA` to 10, 11, then 12, the lenient list gaining the rule, and the two tests' names and comments naming spec 021's rules. These are pins of today's state, changed with the state, named in each commit message. The tasks add the rules in their number's order (T003 RA10, T004 RA11, T005 RA12), so `counts` is contiguous at every commit. The rules are documented in `contracts/dinosaur-rig.md` (its "Rules" section), not in spec 004's `room-data-files.md`, as specs 016 and 020 did.
- **R-09. The rule tests go in a new file, `test/room/dinosaur-compose.test.ts`.** `test/room/avatars.test.ts` is the runtime's (`src/room/scene/avatars.ts`); the compositor's RA family is tested in `avatars-compose.test.ts`, which spec 020 left alone by adding files of its own (`dog-avatar.test.ts`, `likeness-visitor.test.ts`). The new file follows that, over `test/helpers/room-avatars.ts`'s `avatarFolder`, `avatarPolicy`, and `nightFiles`, with the dinosaur's GLBs from `test/helpers/glb.ts`.

## 3. Files expected to touch

For impl-021, which merges this branch into the line (after impl-020) and runs on it:

```text
specs/021-dinosaur-modeled-and-brought-in/        # this folder (the implementer's ticks in tasks.md; plan.md if it departs)
apps/web/build/room/avatars.ts                    # RIG_BONES; measures.extent_x, extent_z; RA10, RA11, RA12 in readAvatars; the rule union
apps/web/build/room/checks/family.ts              # RULES gains RA10, RA11, RA12 after RA9, lenient as RA1 to RA4
apps/web/build/room/report.ts                     # only if findings aren't already listed generically (T006 decides)
apps/web/test/helpers/glb.ts                      # dinosaurGlb(o): the rig's bones, no hand, no Mixamo, set extents; dinosaurClip(role)
apps/web/test/helpers/room-fixtures.ts            # generators glb:dinosaur, glb:dinosaur-no-jaw, glb:dinosaur-long, glb:dinosaur-idle, glb:dinosaur-walk (add)
apps/web/test/fixtures/room/bad/RA10-no-jaw/expect.yaml, RA11-long/expect.yaml, RA12-no-walk/expect.yaml   # one bad case each (add)
apps/web/test/room/compose.test.ts                # two pins: the `counts` table (RA 9 → 12) and the lenient list (+ RA10 to RA12)
apps/web/test/room/dinosaur-compose.test.ts       # RA10, RA11, RA12; woman and man unaffected; the folder bundled and reported; none, no change (add)
apps/web/test/room/avatar-hands.test.ts           # the dinosaur: no hand, paper at the anchor (add cases)
apps/web/test/room/avatar-scene.test.ts           # idle, walk, take play; a missing take is the idle (add cases)
apps/web/test/room/avatar-gait.test.ts            # the dinosaur: no gait, one `gait` `unavailable` signal, the walk clip plays (add cases)
apps/web/test/ui/notes-causes.test.ts             # the dinosaur chosen: figure true without a model, false with one (add cases)
scripts/studio/test_line.py                       # the contract's brief passes; one unshippable tool fails it; its notes (add)
docs/merge-requests/2026-11-14-night-stack.md     # this item's section, after the dog's (T001 drafts it, T010 completes it)
docs/merge-requests/human-patches/021.md          # written by the spec-writer
```

Not touched: `apps/web/src/**` (unless R-07 finds a defect), `apps/web/room/**` (the catalog, the scene, the UI words), `assets/**`, `assets/policy/**`, `tools/gates/**`, `.claude/**`, `corpus/**`, `docs/data-flow-disclosure.md` (checked, FR-017), `deploy/grafana/**` (checked, FR-018), ADR 0010, spec 019's `src/room/scene/gait.ts` (its FR-008 already covers a non-Mixamo rig).

Spec 019 on the line is as rework-019 (`night/rework-019/rework-019`, from rework-spec-019) and fix-019 left it: its FR-007 (a loaded `walk` clip plays while the figure walks, no gait, no time scale: `avatar-gait.test.ts` pins `clipScale` at 1) and its FR-008 (no gait without the six Mixamo leg bones and the hips, one `gait` `unavailable` signal) are the two T002 relies on, and `src/room/scene/gait.ts` is not touched.

Shared with the line's earlier items: `avatars.ts` (spec 020's RA9 and likeness line sit in the same loop), `glb.ts` and `room-fixtures.ts` (spec 019's and 020's fixtures), `compose.test.ts` (spec 020 raised `counts.RA` to 9). This branch is merged into the line after impl-020, so these are edits on the line's text, not conflicts. If spec 020's rework (its T014 to T019, which add the `run` role to `CLIP_ROLES`) lands on the line first, nothing here changes: RA12 requires `idle` and `walk` by name.

## 4. Design

- `RIG_BONES: Readonly<Record<AvatarId, readonly string[] | null>>` in `avatars.ts`: `woman`, `man`, `dog`: `null`; `dinosaur`: the eighteen raw names of the contract. Exported, so the tests read it rather than list it.
- `measures` gains `extent_x` and `extent_z` (`bounds.max[0] − bounds.min[0]`, `bounds.max[2] − bounds.min[2]`, file units; null with no vertex), beside `height`. The report and `emit.ts` read named fields of `measures`, so their output doesn't change; T006's "no folder, byte for byte" test holds it.
- In `readAvatars`, after RA4, for the model only and only where `RIG_BONES[id] !== null`:
  - RA10: for each required bone with no node named it or ending `:` + it, one finding a model: `RA10 <file>:-: the <id> rig lacks <bone>` (`the dinosaur rig lacks Jaw`; the first three names in the row's order, then `, and <n> more`).
  - RA11: where `height` and the extents are known, `RA11 <file>:-: <x|z> extent <m> m at <h> m high, over <w> m (+5%)`, the figures from `AVATAR_SHAPES[id]`.
  - RA12: once the folder's clips are read, where `idle` or `walk` is absent or stands on RA1, RA2, or RA4: `RA12 <file>:-: no usable <role> clip`, on the model, so the model (and with it its clips) is left out leniently and the cut-out stays.
- All three go through `refuse(...)`, which reports only where `caps.avatar` exists (the `checked` guard), so a tree whose `main` has no avatar caps stays unchecked, as today.
- The build with no dinosaur folder reads `names.length === 0` and continues, as today, so SC-001's "byte for byte" holds without a special case.
- The runtime: no change. The dinosaur's `walk` clip plays while it walks (spec 009's FR-025 and FR-028), at its own speed whatever the figure's (spec 019's FR-007 as rework-spec-019 left it; Q63); `findLegRig` returns null for it and the stage signals `{ kind: "gait", figure: "visitor", state: "unavailable" }` once (spec 019's FR-008); the figure cause for the note is `signal.shows === "fallback" && signal.why !== "2d"` (spec 014's FR-054, `app.ts`), true while the dinosaur shows its cut-out in 3D and false once its model shows.

## 5. Validation (the small tests)

| Test file | Covers |
|---|---|
| `apps/web/test/room/compose.test.ts` | the catalogue: RA10 to RA12 each with a bad case; the `counts` pin (RA to 12) and the lenient list |
| `apps/web/test/room/dinosaur-compose.test.ts` | RA10, RA11, RA12 each fail only their fixture; the good fixture passes; woman and man with no `walk` clip and any extent: no finding; the folder bundled and reported; none, no change (SC-001, SC-002) |
| `apps/web/test/room/avatars-compose.test.ts`, `likeness-visitor.test.ts`, `report.test.ts` | run only: they cover `avatars.ts`'s RA family, spec 020's RA9 in the same loop, and the report that reads `measures` |
| `apps/web/test/room/dog-avatar.test.ts`, `dog-report.test.ts`, `dog-line.test.ts`, `twin-compose.test.ts`, `twin-reach.test.ts`, `smoke.test.ts` | run only, in T003 to T005: they too compose through `build/room/avatars.ts` (rv-rework-spec-021's I-1) |
| `apps/web/test/room/avatar-hands.test.ts`, `avatar-scene.test.ts` | handless, non-Mixamo model: idle, walk, take play, the idle for a missing take, paper at the anchor, no console error (SC-003) |
| `apps/web/test/room/avatar-gait.test.ts` | the dinosaur: no gait applied, one `gait` `unavailable` signal, its walk clip plays at its own speed (rework-spec-019's FR-007 and FR-008) |
| `apps/web/test/ui/notes-causes.test.ts` | the dinosaur chosen in 3D: `figure: true` and `standin.avatar` without a bundled model; `figure: false` with one; `standin.note` unchanged (FR-010) |
| `scripts/studio/test_line.py` | the contract's brief passes `line.py brief`; one `outputs_ship: false` tool fails it; `notes` holds "no film or franchise creature" (SC-004) |

Run per task: `npx vitest run <the files>` from `apps/web` and `pytest scripts/studio/test_line.py`, then `make lint`, and paste both into the item's section of `docs/merge-requests/2026-11-14-night-stack.md`. This item runs no full `make check`; the stack's last task does, once. `apps/web/test/room/twin-2d.test.ts` is a known flaky test under load.

## 6. After this stack (not tasks here)

- The studio round: brief-dino-r1 has written `/srv/studio/briefs/dinosaur/1.json` (the page's Stacks), and studio-dino-r1 runs round 1 from it, up to three rounds. A passing candidate goes to the Author's look judgement.
- His intake commit puts `assets/visitors/dinosaur/**` on a branch, with an `approvals.json` entry if the gate wants one: his hand, described in `docs/merge-requests/human-patches/021.md`.
- Items i and h (the dinosaur eating the room's pieces; the twin and the dog running from it) are other specs; the `Jaw` and tail bones are what this spec leaves them.

## 7. For the page

One question, on the page as Q88: whether a later spec fills the dog's `null` rig row. Recommended: yes, a spec that names the dog's bones fills it; nothing here waits on it. Answered: recommended, under the orders file's rule ("any new one: the recommended answer stands").

## 8. Departures (impl2-021)

Recorded as each task met them, in the same commit.

- **T002, a shared helper.** `apps/web/test/helpers/room-dinosaur.ts` (not in §3) holds the dinosaur's folder (`dinosaurFolder`, over `room-avatars.ts`'s `avatarFolder`) and its stage (`dinosaurStage`, `dinosaurFrame`), used by `avatar-hands`, `avatar-scene`, `avatar-gait`, and `dinosaur-compose`. Its night is composed **with** the dinosaur's folder: a figure wants only an avatar the bundle holds (`src/room/scene/avatars.ts`, `wants: bundled(options.chosen)`), as spec 020's `dog-avatar.test.ts` composes with the dog's. `clipGlb` gains an optional `bones` skeleton (default `AVATAR_BONES`, so no other fixture changes) for the dinosaur's clips.
- **T002, the walk.** The cases assert spec 019's FR-007 as rework-spec-019 left it (the walk clip at its own speed, `clipScale` 1), not a speed weighting (R-07, §4; rv-rework-spec-021's N-1).
- **T003, RA10's finding.** One finding a model, not one a bone: `the <id> rig lacks <bones>`, the first three in the row's order, then `, and <n> more` (§4, N-4). `build/room/checks/ra.ts`'s header comment names the rule beside RA9 (the family's documentation; no code there).
- **T003 to T005, the smoke test.** I-1's `smoke` is `apps/web/test/smoke.test.ts`, not under `test/room/`.
