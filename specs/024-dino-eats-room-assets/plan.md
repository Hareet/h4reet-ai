# Implementation Plan: The Dinosaur Eats Chunks of the Room's Assets

> **Approved provisionally by the Author's order of 2026-11-13.** His words:
>
> > Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.
>
> > I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over
>
> His item: 7. i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard". Needs e.
>
> The clarify answers (Q1 to Q6 of [spec.md](spec.md)) and the rework's answers (page Q107 to Q109, after rv-spec-024) take their recommended options by his rule 1, provisionally; each is on the morning page, and an overturned one is reworked before he merges.

**Branch**: `night/spec-024/spec-024`, reworked on `night/rework-spec-024/rework-spec-024` (documents) | **Date**: 2026-11-13, reworked 2026-11-14 | **Spec**: [spec.md](spec.md)

## 1. Summary and branch

A visitor who chose the Dinosaur eats chunks of four pieces. The split is code, computed at the first bite from the piece's own model, after a fixed part is set aside (the live faces, what holds them up, what carries a mount); what is edible is room data. No asset, no clip role, no new request; one usage event, `eat_started`, once a visit, through row V4's existing beacon.

The implementation branch is `feat/024-dino-eats-room-assets`, **off the line's tip with spec 021's code on it**. The line, as the supervisor names it on 2026-11-14 (`refs/heads/`, read with `git --no-replace-objects`): spec 018's HUD at `night/rework-018/rework-018`; specs 019 and 020 at `night/fix-020/fix-020`; spec 021's spec at `night/rework-spec-021/rework-spec-021`, then its implementation. T000 rebases this documents branch onto that tip before any code (rule 6: a spec changed by a review is rebased into the line before its item's code starts). Until spec 021's code is on the line, the tests use a stub figure (§3), so nothing but the by-hand look waits on it.

## 2. Technical Context

- **Language**: TypeScript (`apps/web`); Three.js in the lazy 3D chunk only; Vitest. One Python test (`deploy/scripts/test_dashboard.py`) for the panel.
- **Storage**: none (FR-016). **Network**: one event kind on row V4's existing flow (FR-014); no new request.
- **Testing**: small tests per task (rule 4): `npx vitest run <files>` from `apps/web` (or `services/gateway` for the gateway's config test), `pytest <files>` for the dashboard, and `make lint`. The full `make check` once at the end of the whole night's stack, by one task, not here.
- **Performance**: FR-015 (first set-aside and split < 50 ms, later bite < 2 ms, the draw-call bounds); entry chunk unchanged (the eating lives in the 3D chunk and pure modules under `src/room/eat/` the 3D chunk imports); the 3D chunk's budget in `test/room/chunk.test.ts` is measured, not raised.
- **Constraints**: chunk meshes share the piece's materials (no texture-ledger change); the split is deterministic (seeded by the piece's ID).

## 3. Interface taken from spec 021 (item e)

From spec 021's spec and rig contract (`night/rework-spec-021/rework-spec-021`; spec A1):

- the figure: `assets/visitors/dinosaur/dinosaur.glb` through the existing avatar loader (`scene/loader.ts`, `scene/avatars.ts`); `AvatarId` `dinosaur`; room height 1.2 m (`AVATAR_SHAPES`);
- the mouth: the `Jaw` bone (child of `Head`, "left for a later spec's bite (item i)", `contracts/dinosaur-rig.md`). Its raw glTF name is `Jaw` or `<prefix>:Jaw`; three's loader sanitizes node names (as `scene/avatars.ts` notes for `mixamorig:Hips` → `mixamorigHips`), so the lookup takes the first node, in traversal order, whose name is `Jaw` or ends in `Jaw` after a prefix of letters, digits, `_`, or `-` (the sanitized `<prefix>:Jaw`), or whose `userData.name`, where the loader keeps the raw name, matches `^(?:[^:]+:)?Jaw$`;
- if absent: the estimate of A1, 0.8 × height up and 0.3 × height ahead of the feet along the heading.

The code reads these through one function, `mouthWorldPoint(figure)` in `src/room/eat/mouth.ts`, so a different name in spec 021's code is a one-line change; its test (T007) pins `Jaw`, a prefixed `rig:Jaw` in both its raw and sanitized forms, and the estimate. When the dinosaur shows its flat fallback, FR-001 turns the feature off.

## 4. Constitution Check

I Data-Local by Default: the eaten state stays in memory (FR-016); the only byte that leaves is FR-014's `{kind: "eat_started"}`, once a visit, through row V4's disclosed flow, whose trigger names it in the same commit. II Production-Grade or Not Shipped: degraded mode first (US3, FR-001, FR-009, FR-010, the spec's Degraded Mode), small tests, budgets, a deterministic split. III The lifecycle: intent (draft), spec, clarify, plan, tasks, analysis, review, rework; the Author merges. IV No `.claude/**`, no human-only path is written (see `docs/merge-requests/human-patches/024.md`). V $0. VI The note beside the merge. VIII The twin is told nothing (FR-017). No principle deferred. CLAUDE.md's new-feature list is met, the span by row V4's existing request span (spec A5).

## 5. Design

### 5.1 Data (FR-002, FR-011)
`apps/web/room/scene.yaml`: `edible: { chunks: N }` on `work-desk` (6), `busy-sign` (4), `laptop` (4), `chalkboard` (4); a top-level `eating: { regrow_s: 20 }`. `build/room/schema.ts` takes both as strict keys (a `chunks` int 2 to 12; `regrow_s` 5 to 120); `build/room/compose.ts` carries them into the bundle (`compose/bundle.ts` types: `edible: { chunks } | null` on each placement, `eating: { regrow_s }` on the scene); a check (a new file in `build/room/checks/`) refuses `edible` on `room-shell` and on a placement with no `piece`. The one key is `eating.regrow_s` everywhere (N-2). Generated files regenerate with `npm run room:generate -w apps/web`.

The faces and mounts the chunker needs are already in the 3D bundle (`RoomScene`): `pieces[p].faces` (each live face's `at`, `size`, `facing`, `up`, in the piece's frame at scale 1), `pieces[p].anchors`, `pieces[p].scale`, and each placement's and switch pose's `mount`, `offset`, `turn`, and `model.bounds`. No build change carries them.

### 5.2 The chunker (FR-003, FR-004, FR-006), pure
`src/room/eat/chunker.ts`, Three.js-free, so it tests in Node:

- **Input**: the piece's primitives, `{ mesh: string, positions: Float32Array, index: Uint32Array | Uint16Array | null }[]` (one entry per primitive of every mesh, in the piece's own frame at scale 1); its faces `{ role, at, size, facing, up }[]`; its keep-out boxes (piece frame); `n`; `seed` (the piece's ID).
- **`setAside(input)`** → per primitive, the triangle indices of the set-aside part (FR-004): (a) every triangle of a primitive whose mesh is named for a face's role; (b) every triangle that overlaps a face's rectangle in the face's plane (its vertices projected on `right = up × facing` and `up`, against `size / 2`) and lies wholly behind it (every vertex's depth along `facing` at most +0.5 mm), to the piece's far side; (c) every triangle whose box overlaps a keep-out box. Test helper: the set-aside count per piece, measured on 2026-11-14 at busy sign 6, chalkboard 4, laptop 230, desk 233 triangles; the test asserts the faces' and holders' presence, not those counts.
- **Keep-out boxes** (built by the 3D side, §5.4, passed in): for each placement and each switch pose whose `mount.on` is this piece, the mounted model's `bounds` (its stand-in's box where it has no model), scaled by its piece's `scale`, turned and offset as its mount places it at the anchor, into this piece's frame, extended down by `MOUNT_DEPTH = 0.01` m from its base. The desk's: the monitor, the laptop stand, both signs, the keyboard, the mouse, the notebook, and the charger's two desk poses; the laptop's: the charger's plugged pose at `port`.
- **`split(input, asideMask)`** → `{ chunks: number[][][] }`: per chunk, per primitive, its triangle indices. Seed points by a seeded PRNG from the piece's ID, spread over the rest's bounds; k-means over the remaining triangles' centres (all primitives together), a fixed 8 iterations; empty groups refilled from the largest; deterministic; every triangle in exactly one of the set-aside part and the N chunks.

### 5.3 The meal ledger (FR-005, FR-007, FR-011, FR-009, FR-014, FR-016), pure
`src/room/eat/meal.ts`: per piece, chunk states (`standing | flying | eaten | regrowing`), a `bite(piece, mouth)` that picks the nearest standing chunk (with an empty set-aside part, never the last standing one; one bite at a time), `tick(now)` that regrows the earliest eaten one after `eating.regrow_s`, a pause that stops the timer; and per visit, `firstBite()`, true once, which the app reads to send `eat_started`. It takes a clock (the room's `clock.ts`), so the tests use a fake one.

### 5.4 The 3D side (FR-003, FR-006 to FR-008, FR-010, FR-015)
`src/room/eat/eat3d.ts` (3D chunk). At the first bite on a piece it reads the piece's model meshes, builds the keep-out boxes (§5.2), calls the chunker, and builds:

- **per chunk, per primitive** with triangles in it: a `BufferGeometry` with every attribute of the primitive (position, normal, uv, and any other), indexed by the chunk's triangles, a mesh sharing the primitive's material, and a cut-face mesh sharing the same geometry with the material's cut material;
- **the cut materials**: one per original material, a `MeshBasicMaterial` of its base colour × 0.7, `side: BackSide`, no texture (FR-006); the back faces of an open chunk show it, the back-face colour trick: no capping geometry, which is what the Author's look approval judges;
- **the set-aside part**: one mesh per primitive it holds, sharing the material, fixed.

Then it hides the piece's original meshes (kept, not disposed). A bite flies one chunk (both its meshes) by a fixed ease over 600 ms to the mouth's point at each frame, hidden at its end; regrowth by scale 0 to 1 over 400 ms; reduced motion: at once. When the last eaten chunk has regrown, the piece shows its original meshes again and its chunk and set-aside meshes leave the scene, memoized, not disposed (N-3); the stage's own dispose frees them. It calls `highlight.refresh()` at each end. Wiring: `scene.ts` constructs it when the stage has the dinosaur's model and the bundle has an `edible` placement.

**Draw calls (FR-015)**: a split piece draws `2 × (chunk–primitive meshes) + (set-aside meshes)`. Measured on 2026-11-14 with a throwaway split of the four GLBs (the same set-aside and k-means, outside the repository): busy sign 14 meshes split against 3 whole, chalkboard 44 against 10, laptop 68 against 13, desk 95 to 97 against 16; all four split at once, about 181 more. FR-015's ceilings (100 a piece, 240 for all four) leave room for the implementation's own seeding; T008 asserts them on the real models.

### 5.5 Input, the HUD tile, and the event (FR-001, FR-012, FR-010, FR-014)
- **Key**: `walk/input.ts`: key B → an `eat` intent, ignored in a text field; `scene/walking.ts`: on `eat`, reads reach (spec 008), asks the meal ledger.
- **The tile**, in spec 018's split HUD: `layout.ts` builds an "Eat" tile with its `tile(...)` helper, beside the walking control in the stage's clear box (`.room-clear`: the notes, the walking control, then the Eat tile), class `room-eat hud-glass`, hidden by default; an `eat` icon added to `hud/icons.ts` (`IconName`), drawn in code as the others are; a "B" key cap from `hud/keycap.ts`, styled by `split.css`'s `.hud-keycap`, `aria-hidden`; its accessible name `"{eat.button}, B"`. The layout returns `eatButton` and `setEatOffered(on)`, as it does `walkButton` and `setWalkOffered`. `room.css` places it beside `.room-walk` in each `data-hud` layout, never over the AI disclosure, the notes, or the stand-in line. `app.ts` shows it on the 3D side's `eat:available` signal (reach is an edible piece with a model, the figure is the dinosaur and shows its model, the room isn't paused, a chunk stands) and hides it otherwise.
- **The event**: `events.ts`'s `EVENT_KINDS` gains `eat_started` after `loading_cut_short`, with the comment the others carry; `app.ts` emits `{ kind: "eat_started" }` at the meal ledger's `firstBite()`, as it does `walk_started` at the first entry; `npm run room:generate -w apps/web` regenerates `config/room-events.yaml`. Row V4's trigger in `docs/data-flow-disclosure.md` gains "the dinosaur's first bite in a visit" in the same commit. The dashboard's Room row gains a stat, "Visits that ate", beside "Visits that walked": `sum(increase(h4_room_events_total{kind="eat_started"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened|resume_kept"}[$__range]))`, read as "Visits that walked" is read, with its row and bullet in spec 000's `contracts/telemetry.md` §7.8, as spec 012 added its panel. The gateway reads the kinds from `config/room-events.yaml`, so its code doesn't change; its config test, which pins the kinds, gains the kind.
- **Words**: `ui-keys.ts` and `ui-words.yaml`: `eat.button` ("Eat"), `eat.first_bite` (`{name}`). The polite line goes through `a11y.ts`'s live region.

**Overlaps on the line** (read, not changed, unless named in §6): `scene/avatars.ts` (specs 009, 016, 019 to 021: the figure, its model, its fallback; `mouth.ts` reads the figure it holds), `scene/gait.ts` (spec 019: the legs' gait over the playing clip; a bite neither starts nor stops it, and the gait eases out at a stop as it does now), `layout.ts`, `hud/keycap.ts`, `hud/split.ts`, `split.css`, `hud/icons.ts` (spec 018), `room.css`, `app.ts`, `events.ts` (every spec that adds a kind).

### 5.6 Degraded modes (US3)
One predicate, `eatingAvailable(state)` in `src/room/eat/available.ts`, pure, read by the key, the tile, and the tick: the 3D room, a model figure for the dinosaur, a piece on its model, not paused, loader not showing, not failed. An exception in the set-aside, the split, or the flight calls `disable()` once: eating off for the visit, a `console.warn` without payload, the piece as loaded.

### 5.7 What is not done
No identifier, piece, or count on the event (FR-014). No `CLIP_ROLES` change (FR-013). No corpus change (FR-017). No asset record or approval entry. No gateway code change.

## 6. Files the implementation expects to touch

New: `apps/web/src/room/eat/{chunker,meal,eat3d,mouth,available}.ts`; tests `apps/web/test/room/eat-{chunker,meal,mouth,available,data,3d}.test.ts`, `apps/web/test/ui/eat-{input,button,event,degraded,reduced}.test.ts`.
Changed: `apps/web/room/scene.yaml`; `apps/web/room/ui-words.yaml`; `apps/web/build/room/schema.ts`, `build/room/compose.ts`, `build/room/checks/` (one new check file); `apps/web/src/room/compose/bundle.ts` (types); `apps/web/src/room/ui-keys.ts`; `apps/web/src/room/events.ts`; `apps/web/src/room/walk/input.ts`; `apps/web/src/room/scene/walking.ts`; `apps/web/src/room/scene.ts` (wiring); `apps/web/src/room/layout.ts`, `apps/web/src/room/hud/icons.ts`, `apps/web/src/room/room.css`, `apps/web/src/room/app.ts` (the tile and the event); `config/room-events.yaml` (generated); `docs/data-flow-disclosure.md` (row V4's trigger); `deploy/grafana/dashboards/h4-runtime.json` (the panel); `specs/000-local-foundations/contracts/telemetry.md` §7.8 and `specs/002-the-room/contracts/room-events.md` §1 (the living contracts' kind and panel, as spec 012 did); the tests that pin the kinds: `apps/web/test/events.test.ts`, `apps/web/test/manifest.test.ts`, `apps/web/test/disclosure.test.ts`, `services/gateway/test/unit/room-events-config.test.ts`.
Overlap risk with the night's other stacks: §5.5's list. Edits are additive (new keys, new functions, a new tile after the walking control, a kind at the list's end); if another stack changes the same lines, the implementer merges by hand and runs the small tests of both.
Not touched: `.claude/**`, CLAUDE.md, REVIEW.md, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, `assets/policy/**`, `services/**` code (one test file only), `scene/avatars.ts`, `scene/gait.ts`.

## 7. Small tests (rule 4)

Each task names its files; each runs with `cd apps/web && npx vitest run <files>` (the gateway's with `cd services/gateway && npx vitest run <files>`, the dashboard's with `pytest deploy/scripts/test_dashboard.py`). A task that changes a file also runs the tests in `apps/web/test/` that import it, as the task lists them: for the room's data `test/room/{schema,compose,bundle,data-only,standins,generated,manifest-readiness}.test.ts`; for `ui-keys.ts` `test/room/{words,vocabulary,scene}.test.ts`; for `walk/input.ts` and `scene/walking.ts` `test/room/{input,walking}.test.ts` and `test/ui/{walking,fullscreen}.test.ts`; for `events.ts` `test/{events,manifest}.test.ts` and `test/room/{events,generated}.test.ts`; for `layout.ts` and the HUD `test/ui/hud-split*.test.ts`, `test/room/hud-split-geometry.test.ts`, `test/room/hud-frame.test.ts`, and `test/ui/walking.test.ts`. `apps/web/test/room/twin-2d.test.ts` is flaky under load; it is not in any task's list.

## 8. Risks

- **The back-face colour trick may look wrong** on a thin piece (the busy sign). Mitigation: the Author's look approval (A4); the cut colour and the trick are one function, replaceable.
- **The set-aside part may look odd** (the desk's top patches under the mounted pieces standing over eaten legs; the sign's lettering on its back plate). It is what keeps the faces and the mounts from floating (FR-004); the Author's look approval judges it (A4), and a smaller set is a later look change, not a data loss.
- **Spec 021's names differ in its code.** One constant (§3), T000 reads them.
- **The draw calls of a split piece** (§5.4): about 181 more with all four split at once, on a phone. Mitigation: FR-015's ceilings, asserted on the real models (T008, T014); a whole piece goes back to its own meshes (FR-007); if a phone's frame time says so, the cut-face meshes are the first to go (the cut faces then show open), a look change for the Author.
- **Triangle counts of the studio models** (desk 37,796, laptop 31,016, board 6,034, sign 1,014): the split's budget (FR-015) is measured in `eat-chunker.test.ts` on the pieces' real files read from `assets/room/*.glb` at test time; the throwaway measurement ran the same passes, unoptimized, in CPython in under a second for each piece, so 50 ms in V8 has room, and the plan falls to a sampled k-means if over.
- **The face rule's depth**: FR-004 (b) takes the column behind a face to the piece's far side, not a few millimetres (spec, Revision 2026-11-14): on the sign, what holds the lettering lies 11 to 63 mm behind it. T004 asserts each face's holders on the real files.
