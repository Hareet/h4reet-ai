# Implementation Plan: The Dinosaur Eats Chunks of the Room's Assets

> **Approved provisionally by the Author's order of 2026-11-13.** His words:
>
> > Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.
>
> > I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over
>
> His item: 7. i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard". Needs e.
>
> The clarify answers (Q1 to Q6 of [spec.md](spec.md)) take their recommended options by his rule 1; each is on the morning page, and an overturned one is reworked before he merges.

**Branch**: `night/spec-024/spec-024` (documents) | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

## 1. Summary and branch

A visitor who chose the Dinosaur eats chunks of four pieces. The split is code, computed at the first bite from the piece's own model; what is edible is room data. No asset, no clip role, no network, no event. The implementation branch is `feat/024-dino-eats-room-assets`, off main with spec 021's branch merged first (the dinosaur's model). The implementer merges this documents branch first.

## 2. Technical Context

- **Language**: TypeScript (`apps/web`); Three.js in the lazy 3D chunk only; Vitest.
- **Storage**: none (FR-016). **Network**: none (FR-014).
- **Testing**: small tests per task (rule 4): `npx vitest run <files>` from `apps/web`, and `make lint`. The full `make check` once at the end of the whole night's stack, by one task, not here.
- **Performance**: FR-015 (first split < 50 ms, later bite < 2 ms); entry chunk unchanged (the eating lives in the 3D chunk and a pure module under `src/room/eat/` the 3D chunk imports); the 3D chunk's budget in `test/room/chunk.test.ts` is measured, not raised.
- **Constraints**: chunk meshes share the piece's materials (no ledger change); the split is deterministic (seeded by the piece's ID).

## 3. Interface assumed from spec 021 (item e)

Not on this branch. Written against the intent (a modelled dinosaur brought into the room), per spec A1:

- the figure: `assets/visitors/dinosaur/dinosaur.glb` through the existing avatar loader (`scene/loader.ts`, `scene/avatars.ts`); `AvatarId` `dinosaur`;
- a `mouth` node in its scene graph; if absent, the estimate in A1;
- the figure's height from `AVATARS` (spec 009, FR-016).

The code reads these through one function, `mouthWorldPoint(figure)` in `src/room/eat/mouth.ts`, so a different name in spec 021 is a one-line change, and its test pins both the node and the estimate. When spec 021 isn't merged (the flat fallback shows), FR-001 turns the feature off; the tests use a stub figure, so this work runs without it.

## 4. Constitution Check

I Degraded mode first: US3, FR-001, FR-009, FR-010, the failure path in the spec's Degraded Mode. II Production-grade: small tests, budgets, deterministic split. III The lifecycle: intent (draft), spec, clarify, plan, tasks, analysis; the Author merges. IV No `.claude/**`, no human-only path is written (see `docs/merge-requests/human-patches/024.md`). V $0. VI The note beside the merge. VIII The twin is told nothing (FR-017). No principle deferred; one named deviation from CLAUDE.md (spec A5).

## 5. Design

### 5.1 Data (FR-002, FR-011)
`apps/web/room/scene.yaml`: `edible: { chunks: N }` on `work-desk` (6), `busy-sign` (4), `laptop` (4), `chalkboard` (4); a top-level `eating: { regrow_s: 20 }`. `build/room/schema.ts` takes both as strict keys (a `chunks` int 2 to 12; `regrow_s` 5 to 120); `build/room/compose.ts` carries them into the bundle (`compose/bundle.ts` types) beside each placement; a check (in `build/room/checks/`) refuses `edible` on `room-shell`. Generated files regenerate with `npm run room:generate -w apps/web` (`config/room-events.yaml` should come out unchanged: a test asserts it).

### 5.2 The chunker (FR-003, FR-004, FR-006), pure
`src/room/eat/chunker.ts`: `splitTriangles({ positions, index, bounds, n, seed })` → `{ groups: number[][] }` of triangle indices. Seed points by a seeded PRNG from the piece's ID, spread over the bounds; k-means over triangle centres, a fixed 8 iterations, empty groups refilled from the largest; deterministic; every triangle in exactly one group. `protectedGroups(groups, centres, keepOut)` marks a group non-edible when a keep-out box (a mounted piece's footprint on this piece, a face's mesh) touches it. Three.js-free, so it tests in Node.

### 5.3 The meal ledger (FR-005, FR-007, FR-011, FR-009, FR-016), pure
`src/room/eat/meal.ts`: per piece, chunk states (`standing | flying | eaten`), a `bite(piece, mouth)` that picks the nearest edible standing chunk (never the last standing one; one bite at a time) and `tick(now)` that regrows the earliest eaten one after `regrow_s`, a pause that stops the timer. It takes a clock (the room's `clock.ts`), so the tests use a fake one.

### 5.4 The 3D side (FR-003, FR-006 to FR-008, FR-010, FR-015)
`src/room/eat/eat3d.ts` (3D chunk): at the first bite builds chunk meshes from the piece's model meshes (a `BufferGeometry` per group, sharing the material; a cut-face mesh with a flat `MeshBasicMaterial` of the base colour at 70%; the group's boundary edges' faces closed by drawing the back faces of the chunk in that colour: a back-face colour trick, no capping geometry, which is acceptable for four low-poly studio pieces and is what the Author's look approval judges); flight by a fixed ease over 600 ms to the mouth, hidden at its end; regrowth by scale 0 to 1 over 400 ms; reduced motion: at once. It calls `highlight.refresh()` at each end. Wiring: `scene.ts` constructs it when the stage has the dinosaur's model and the bundle has an `edible` placement.

### 5.5 Input and HUD (FR-001, FR-012, FR-010)
`walk/input.ts`: key E → an `eat` intent, ignored in a text field; `scene/walking.ts`: on `eat`, reads reach (spec 008), asks the meal ledger. `app.ts` and `room.css`: the "Eat" button in the walking view's controls, shown by a `eat:available` signal (reach is an edible piece with a model, the figure is the dinosaur and shows its model, the room isn't paused, a standing edible chunk is left besides the last). `ui-keys.ts` and `ui-words.yaml`: `eat.button`, `eat.first_bite` (`{name}`), `eat.none_left`. The polite line goes through `a11y.ts`'s live region.

### 5.6 Degraded modes (US3)
One predicate, `eatingAvailable(state)` in `src/room/eat/available.ts`, pure, read by the key, the button, and the tick: the 3D room, a model figure for the dinosaur, a piece on its model, not paused, loader not showing, not failed. An exception in the split or the flight calls `disable()` once: eating off for the visit, a `console.warn` without payload, the piece as loaded.

### 5.7 What is not done
No usage event, no `config/room-events.yaml` change, no disclosure row (Q3). No `CLIP_ROLES` change (FR-013). No corpus change (FR-017). No asset record or approval entry.

## 6. Files the implementation expects to touch

New: `apps/web/src/room/eat/{chunker,meal,eat3d,mouth,available}.ts`; tests `apps/web/test/room/eat-{chunker,meal,mouth,available,data}.test.ts`, `apps/web/test/ui/eat-{input,button,degraded,reduced}.test.ts`.
Changed: `apps/web/room/scene.yaml`; `apps/web/room/ui-words.yaml`; `apps/web/build/room/schema.ts`, `build/room/compose.ts`, `build/room/checks/` (one new check file); `apps/web/src/room/compose/bundle.ts` (types); `apps/web/src/room/ui-keys.ts`; `apps/web/src/room/walk/input.ts`; `apps/web/src/room/scene/walking.ts`; `apps/web/src/room/scene.ts` (wiring); `apps/web/src/room/app.ts` and `apps/web/src/room/room.css` (the button); generated room data (by `room:generate`), if tracked.
Overlap risk with the night's other stacks (the HUD, avatar legs, dog, dinosaur, the room's escape): `scene.yaml`, `ui-words.yaml`, `ui-keys.ts`, `app.ts`, `room.css`, `walking.ts`, `scene.ts`. Edits are additive (new keys, new functions); if another stack changes the same lines, the implementer merges by hand and runs the small tests of both.
Not touched: `.claude/**`, CLAUDE.md, REVIEW.md, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, `assets/policy/**`, `config/room-events.yaml`, `docs/data-flow-disclosure.md`, `services/**`.

## 7. Small tests (rule 4)

Each task names its files; each runs with `cd apps/web && npx vitest run <files>`. The ones that touch what other tests cover add those: `test/room/scene.test.ts`, `test/room/walking.test.ts`, `test/ui/walking.test.ts`, `test/room/schema.test.ts`, `test/room/compose.test.ts`, `test/room/words.test.ts`. `apps/web/test/room/twin-2d.test.ts` is flaky under load; it is not in any task's list.

## 8. Risks

- **The back-face colour trick may look wrong** on a thin piece (the busy sign). Mitigation: the Author's look approval (A4); the cut colour and the trick are one function, replaceable.
- **Spec 021's names differ.** One constant (§3).
- **Triangle counts of the studio models** higher than the fixtures: the split's budget (FR-015) is measured in `eat-chunker.test.ts` on the pieces' real counts read from `assets/room/*.glb` at test time, and the plan falls to a sampled k-means if over.
- **Mount keep-outs** (FR-004) leave too few edible chunks on the desk: the test asserts at least 2 edible chunks per piece; if a piece has fewer, the build refuses it.
