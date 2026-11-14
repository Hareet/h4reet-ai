# Implementation Plan: The Dinosaur, Modeled and Brought In

**Approved provisionally by the Author's order of 2026-11-13**:

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

(Rule 1 of that order: the spec-writer takes the recommended answer at clarify and at the plan. Each answer, Q1 to Q7 in the spec's Clarifications, goes on the morning page with its recommendation; he confirms or overturns it there, and an overturned answer is reworked before he merges.)

**Branch**: `night/spec-021/spec-021` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: the spec and its seven provisional answers, read at `main` 3c0e4cd0. Contracts: [dinosaur-rig.md](contracts/dinosaur-rig.md), [dinosaur-brief.md](contracts/dinosaur-brief.md).

## 1. Summary

Spec 009 already shows any avatar's model where `assets/visitors/<id>/` holds one, and already leaves the paper at the hand anchor when an avatar has no hand bone. So the dinosaur needs the asset (a studio round, then the Author's intake) and four small pieces of code that make a non-humanoid avatar safe to bring in: a rig table and three compositor rules (RA9 the body's box, RA10 the rig's bones, RA11 the required clips), tests that prove a handless, non-Mixamo model shows, plays, and degrades, and a check that the studio line judges the dinosaur's brief. Approach: extend `readAvatars` (where RA1 to RA4 live) with a per-avatar rule table; nothing in the runtime changes unless task T002 finds a defect.

## Technical Context

**Language/Version**: TypeScript 5 (the compositor and its tests), Python 3.12 (`scripts/studio/`).

**Primary Dependencies**: none new.

**Storage**: static files, `assets/visitors/dinosaur/` (the Author's intake; not written by an agent).

**Testing**: Vitest (`apps/web/test/**`), pytest (`scripts/studio/test_line.py`). Each task runs only its files (below) and `make lint`; one task runs `make check` once.

**Constraints**: no cap change; no human-only file changed; nothing new leaves the device; the local stack builds with or without the files; the Author's gate (`arrival_check.py`) unchanged.

**Scale/Scope**: one model, three clips, one record, one licence; about 150 lines of code and 400 of tests.

## Constitution Check

| Gate | Result |
|---|---|
| I. Disclosure, degraded mode first | Pass: no new flow; the cut-out is the degraded mode |
| II. Tests, telemetry, cost, docs | Pass: §5 names every test; no endpoint; the report line is the telemetry; cost $0 |
| III. Spec before code; humans merge | Pass: spec and plan precede code; provisional approval recorded at the top |
| IV. Least privilege | Pass: §3 lists the files; none human-only; the human patches are plain-copy notes (`docs/merge-requests/human-patches/021.md`) |
| V. Cost | Pass |
| VI. Public | Pass: original character; no photo; no claim about the Author |
| VII. Whole product | Pass: builds without the asset |
| VIII. Honest AI | Pass: the placeholder note stays while a model is missing |

No deviation, so no ADR.

## 2. Research decisions

- **R-01. The rig table lives in `apps/web/build/room/avatars.ts`, beside RA1 to RA4.** `readAvatars` already loops `AVATARS` and holds each model's node names (`model.nodes`, raw GLB names). Rules keyed by avatar id fit that loop; `checks/ra.ts` holds the twin's scene-level rules (RA6 to RA8) and would need the file reads again. Alternative: a new check in `checks/ra.ts` (rejected: it doesn't see per-avatar reads). The rule union gains `"RA9" | "RA10" | "RA11"`; spec 016 took RA6 to RA8 (the twin's), so the numbers start at 9.
- **R-02. RA10 compares raw node names.** The GLB reader gives `Arm.L`, not three's sanitized `ArmL`. The rig contract's "Sanitized" column is for the runtime only, where no code reads those bones (the dinosaur has no hand bone; the holding-hand search looks for `mixamorig:` names and finds none). So no runtime code changes.
- **R-03. RA9's box is measured after spec 009's scaling.** The reader's `measures.height` and `bounds` (avatars.ts:207) give the rest pose's box in file units; the scale is `1.2 / height` (spec 009's FR-016, the table's `AVATAR_SHAPES.dinosaur.height`). RA9 refuses where `(max.x−min.x) × scale` or `(max.z−min.z) × scale` exceeds 1.1 × 1.05. Reads the table's height, never lists it (FR-043).
- **R-04. RA11 reads the clips already read.** The folder's reads give each clip's role; `idle` and `walk` must both be present and not refused by RA1/RA2/RA4 (a refused clip is a missing clip). `take` is optional.
- **R-05. No new stand-in.** The 3D fallback is today's cut-out (Q6). A test-only generated fixture (`dinosaurGlb`) stands in for the asset in tests; it never lands under `assets/`.
- **R-06. The brief is tested through `line.py` from the contract's own JSON.** `test_line.py` extracts the first fenced `json` block from `contracts/dinosaur-brief.md`, so the contract and the test can't drift, and runs `line.py brief` on it. Its fixture repository (`make_repo`) holds its own stand-in tools list (`TOOLS`: `comfyui-core`, `sdxl-base-1.0`, `blender`, …), not `main`'s, so the new test builds the list from the repository's real `assets/policy/studio-tools.json` (read as a file from the worktree, in the test only) and passes it to `make_repo`, or to the stand-in's `TOOLS` through the helper's existing parameter if it has one; the second test flips one entry's `outputs_ship`. If `make_repo` can't take a list, T008 adds the parameter (a test helper in the same file).
- **R-08. The rule catalogue has its own tests.** `checks/family.ts`'s `RULES` is the catalogue; `compose.test.ts` demands a `bad/<RULE>-*/expect.yaml` for every refusing rule and pins the lenient list. So RA9 to RA11 each need a catalogue entry (lenient, as RA1 to RA4, with `model`), a bad case built from the fixture generators (`room-fixtures.ts`'s `glb:` table), and the pinned list updated, which is the one existing test this stack changes (a test that pins today's state, changed with the state). The rules are documented in `contracts/dinosaur-rig.md` (its "Rules" section), not in spec 004's `room-data-files.md`, as spec 016 did for RA6 to RA8.
- **R-07. A "handless" proof first.** T002 writes the dinosaur-shaped fixture (no hand bones, no Mixamo, rig bones from the table) and drives it through the loader and the stage tests that already exist for hands (avatar-hands, avatar-scene). If it passes unchanged, the runtime needs no change (the expected result). If it finds a defect, T002 stops and its failure goes into the stack's note; the fix is then a runtime task added by `/speckit-converge`.

## 3. Files expected to touch

For the implementer, who merges this branch first and runs on one line:

```text
specs/021-dinosaur-modeled-and-brought-in/        # this folder (the implementer's ticks in tasks.md; plan.md if it departs)
apps/web/build/room/avatars.ts                    # RIG_BONES; RA9, RA10, RA11 in readAvatars; the rule union
apps/web/build/room/checks/family.ts              # RULES gains RA9, RA10, RA11, lenient as RA1 to RA4 (the catalogue's test demands a bad/ case per refusing rule)
apps/web/build/room/report.ts                     # only if findings aren't already listed generically (T006 decides)
apps/web/test/helpers/room-fixtures.ts            # generators glb:dinosaur, glb:dinosaur-long, glb:dinosaur-no-jaw, glb:dinosaur-idle, glb:dinosaur-walk (add)
apps/web/test/fixtures/room/bad/RA9-long/expect.yaml, RA10-no-jaw/expect.yaml, RA11-no-walk/expect.yaml   # one bad case each (add)
apps/web/test/room/compose.test.ts                # the lenient-rules list gains RA9 to RA11 (the one existing test changed)
apps/web/test/helpers/glb.ts                      # dinosaurGlb(): a handless, rig-named fixture; dinosaurClip()
apps/web/test/room/avatars.test.ts                # RA9, RA10, RA11 (add)
apps/web/test/room/avatars-compose.test.ts        # the folder bundled; no folder, no change (add)
apps/web/test/room/avatar-hands.test.ts           # the dinosaur: no hand, paper at the anchor (add)
apps/web/test/room/avatar-scene.test.ts           # idle, walk, take play (add)
apps/web/test/ui/avatars.test.ts                  # the placeholder note while one avatar lacks its model (add)
scripts/studio/test_line.py                       # the dinosaur's brief passes; one unshippable tool fails it (add)
docs/merge-requests/2026-11-14-feat-021-dinosaur.md   # the stack's note, with the one full make check
docs/merge-requests/human-patches/021.md          # written now, by the spec-writer
```

Not touched: `apps/web/src/**` (unless R-07 finds a defect), `apps/web/room/**` (the catalog, the scene), `assets/**`, `assets/policy/**`, `tools/gates/**`, `.claude/**`, `corpus/**`, `docs/data-flow-disclosure.md` (checked, FR-017), `deploy/grafana/**` (checked, FR-018), ADR 0010.

Shared with the dog's spec, which runs in parallel: `apps/web/build/room/avatars.ts` (the rig table's `dog` row), `apps/web/test/helpers/glb.ts` (a dog fixture). Whichever merges second rebases onto the first; the table has one row per avatar, so the conflict is a line, not a rule. The implementer merges this branch first and says so in the note.

## 4. Design

- `RIG_BONES: Readonly<Record<AvatarId, readonly string[] | null>>` in `avatars.ts`: `woman`, `man`: `null`; `dinosaur`: the eighteen names of the contract; `dog`: `null` until its spec adds a row (RA10 is skipped for `null`).
- RA9 (model only): refuses with `RA9 <file>: <x or z> extent <m> m at 1.2 m high, over 1.1 m (+5%)`.
- RA10 (model only): for each required bone absent from `model.nodes`, one finding naming it (the first few, then a count).
- RA11 (folder): refuses the *model* (not the clips) when `idle` or `walk` isn't bundled; leniently the avatar is left out, the cut-out stays.
- All three go through the same `refuse(...)` helper, which reports only where `caps.avatar` exists (the existing "checked" guard), so a tree on a `main` without caps stays unchecked as today.
- The build with no dinosaur folder reads `names.length === 0` and continues, as today, so SC-001's "byte for byte" holds without a special case.

## 5. Validation (the small tests)

| Test file | Covers |
|---|---|
| `apps/web/test/room/compose.test.ts` | the catalogue covers RA9 to RA11 with a bad case each; the lenient list pinned |
| `apps/web/test/room/avatars.test.ts` | RA9, RA10, RA11 each fail only their fixture; the good fixture passes; `woman`/`man` unaffected |
| `apps/web/test/room/avatars-compose.test.ts` | a dinosaur folder in a temp tree is bundled and reported; none, no change (SC-001) |
| `apps/web/test/room/avatar-hands.test.ts`, `avatar-scene.test.ts` | handless, non-Mixamo model: idle, walk, take play, paper at the anchor, no console error (SC-003) |
| `apps/web/test/ui/avatars.test.ts` | the placeholder note while one choice lacks its model (FR-010) |
| `scripts/studio/test_line.py` | the contract's brief passes `line.py brief`; one `outputs_ship: false` tool fails it (SC-004) |

Run per task: `npx vitest run <the files>` from `apps/web` (or `vitest run <files>`) and `pytest scripts/studio/test_line.py`, then `make lint`. The full `make check` runs once, in the last task, and goes in the stack's note. `apps/web/test/room/twin-2d.test.ts` is a known flaky test under load.

## 6. After this stack (not tasks here)

- A studio task (only with the tools list on `main`, which it is) cuts the brief from the contract with `line.py brief`, writes it to `/srv/studio/briefs/dinosaur/1.json`, and runs up to three rounds. A passing candidate goes to the Author's look judgement.
- His intake commit puts `assets/visitors/dinosaur/**` on a branch, with an `approvals.json` entry if the gate wants one: his hand, described in `docs/merge-requests/human-patches/021.md`.
- Items i and h (the dinosaur eating the room's pieces; the twin and the dog running from it) are other specs; the `Jaw` and tail bones are what this spec leaves them.
