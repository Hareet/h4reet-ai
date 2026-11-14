# Tasks: The Dinosaur Eats Chunks of the Room's Assets

> **Approved provisionally by the Author's order of 2026-11-13.** His words:
>
> > Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.
>
> > I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

**Input**: [spec.md](spec.md), [plan.md](plan.md). **Tests**: test-first, each task's small tests (rule 4): `cd apps/web && npx vitest run <files>` plus `make lint`, pasted into the task's notes. The full `make check` is not run here; it runs once, at the end of the night's stack, by one task. **Format**: `[ID] [P] [US] description (files) — small tests`. `[P]` = no shared file with the tasks beside it.

## Phase 0: Prerequisites

- [ ] T000 Merge this documents branch, and spec 021's branch (the dinosaur) if it has merged; read spec 021's names for the figure's file, clips, and `mouth` node and update plan §3's constant if they differ. — `npx vitest run test/room/avatars.test.ts` (loads).

## Phase 1: Data (US1, US2)

- [ ] T001 [US1] Test first: `eat-data.test.ts` — `scene.yaml`'s `edible` and `eating` keys parse; `chunks` 1 and 13 refuse; `edible` on `room-shell` refuses; `regrow_s` 4 and 121 refuse; unknown keys still refuse; `config/room-events.yaml` is unchanged by `room:generate`. (`apps/web/test/room/eat-data.test.ts`) — `npx vitest run test/room/eat-data.test.ts test/room/schema.test.ts`.
- [ ] T002 [US1] Make T001 pass: schema, compose, bundle types, the check, `scene.yaml`'s four placements and `eating`; run `npm run room:generate -w apps/web`. (`build/room/schema.ts`, `build/room/compose.ts`, `build/room/checks/<new>.ts`, `src/room/compose/bundle.ts`, `room/scene.yaml`) — `npx vitest run test/room/eat-data.test.ts test/room/schema.test.ts test/room/compose.test.ts test/room/manifest-readiness.test.ts`.
- [ ] T003 [P] [US1] Test first, then words: `eat-data.test.ts` extended — `eat.button`, `eat.first_bite` (`{name}`), `eat.none_left` exist, with their slots and no digit outside a slot. Add the keys and the words. (`src/room/ui-keys.ts`, `room/ui-words.yaml`) — `npx vitest run test/room/eat-data.test.ts test/room/words.test.ts`.

## Phase 2: The pure core (US1, US2)

- [ ] T004 [P] [US2] Test first: `eat-chunker.test.ts` — every triangle in exactly one group (SC-001); the same split on 100 runs; empty groups refilled; keep-out boxes mark groups non-edible; face meshes never edible; the four real pieces' (`assets/room/*.glb`) split under 50 ms and each has ≥ 2 edible groups. (`apps/web/test/room/eat-chunker.test.ts`) then `src/room/eat/chunker.ts` — `npx vitest run test/room/eat-chunker.test.ts`.
- [ ] T005 [P] [US1] Test first: `eat-meal.test.ts` — nearest edible standing chunk; ties to the lowest index; never the last standing chunk; one bite at a time; regrow earliest-first after `regrow_s` on a fake clock, each next one that long after; pause stops the timer (US2 AS3, SC-003); eaten state lives only in memory. Then `src/room/eat/meal.ts`. — `npx vitest run test/room/eat-meal.test.ts`.
- [ ] T006 [P] [US3] Test first: `eat-available.test.ts` — the predicate is false in each of: 2D, no dinosaur model, a stand-in piece, paused, the loader showing, failed; true only with all clear (US3 AS1 to AS3, AS5). Then `src/room/eat/available.ts`. — `npx vitest run test/room/eat-available.test.ts`.
- [ ] T007 [P] [US1] Test first: `eat-mouth.test.ts` — the `mouth` node's world point when present; the estimate (0.8 up, 0.3 ahead of the feet along the heading) when absent. Then `src/room/eat/mouth.ts`. — `npx vitest run test/room/eat-mouth.test.ts`.

## Phase 3: The 3D side (US1, US2)

- [ ] T008 [US1] Test first: `eat-3d.test.ts` (stub meshes, no GPU) — a first bite builds chunk meshes sharing the original's material, adds no texture (the ledger's bytes unchanged, FR-053), a bite flies one chunk to the mouth in ≤ 600 ms and hides it, a later bite takes < 2 ms, geometry is disposed on regrow's end; `highlight.refresh()` is called at each bite end and regrowth; an exception disables the eating once with one `console.warn` and the piece as loaded (Degraded Mode). Then `src/room/eat/eat3d.ts`, and wire it into `src/room/scene.ts`. — `npx vitest run test/room/eat-3d.test.ts test/room/scene.test.ts test/room/highlight.test.ts test/room/gltf-images.test.ts`.
- [ ] T009 [US2] Test first: in `eat-3d.test.ts` — for the four pieces eat every edible chunk: selectable, labelled, pick area and frame box unchanged, ≥ 1 chunk standing, no mounted placement loses its supporting chunk (US2 AS1, AS2, AS4; SC-002). Make it pass. — `npx vitest run test/room/eat-3d.test.ts test/room/pick.test.ts`.

## Phase 4: Input and HUD (US1, US3)

- [ ] T010 [US1] Test first: `eat-input.test.ts` — key E gives an `eat` intent; ignored in a text field and with the twin's chat focused (FR-012); ignored for the woman, the man, the dog; ignored at a non-edible piece (US1 AS2, AS3); ignored while a chunk is in flight. Then `walk/input.ts` and `scene/walking.ts`. — `npx vitest run test/ui/eat-input.test.ts test/room/input.test.ts test/room/walking.test.ts test/room/reach.test.ts`.
- [ ] T011 [US1] Test first: `eat-button.test.ts` — the "Eat" button is a real button named `eat.button`, shown only when available, hidden at one chunk left (US1 AS4), keyboard-reachable, not over the AI disclosure or the stand-in line in each layout of spec 005. Then `app.ts` and `room.css`. — `npx vitest run test/ui/eat-button.test.ts test/ui/hud.test.ts test/ui/hud-notes.test.ts`.
- [ ] T012 [US3] Test first: `eat-reduced.test.ts` — under reduced motion, no flight and no fade (immediate hide and return); one polite line per piece's first bite (`eat.first_bite`), none after; the line goes through the live region. Then wire `a11y.ts` and `eat3d.ts`. — `npx vitest run test/ui/eat-reduced.test.ts test/room/motion.test.ts test/ui/a11y.test.ts`.
- [ ] T013 [US3] Test first: `eat-degraded.test.ts` — in each degraded state the button, the key, and the tick do nothing, and the room's existing snapshots pass unchanged (SC-004); the visit's eaten state is not in storage, not in any request (FR-014, FR-016: a fetch spy sees nothing). — `npx vitest run test/ui/eat-degraded.test.ts test/ui/degraded.test.ts test/room/flat.test.ts test/disclosure.test.ts`.

## Phase 5: Budgets and notes

- [ ] T014 [US1] The build and the chunk budgets: `npx vitest run test/room/chunk.test.ts test/room/budgets.test.ts` after a `make build` of the web app only (`npm run build -w apps/web`), pasting the sizes; the entry chunk must be unchanged. `make lint`. If a budget fails, fix the code, not the budget. — those two files, `make lint`.
- [ ] T015 A merge-request note, `docs/merge-requests/2026-11-1x-feat-024-dino-eats-room-assets.md`: what changed, the small tests' output, the Author's look approval to do by hand (A4: the cut colour, the flight, the regrowth, on dev-cpu with spec 021's model), the six questions with their recommended answers, and what's left. The full `make check` is the stack's one, not this task's.

## Dependencies

T000 first. T001 → T002; T003 anywhere in Phase 1. Phase 2 tasks are independent of each other and need T002 only for T004's real-piece case. T008 needs T004, T005, T007; T009 needs T008. T010 needs T005, T006; T011 needs T006, T010. T012 needs T008; T013 needs T008 to T012. T014 and T015 last.

## Implementation strategy

MVP: T001 to T010 give a working bite from the key. T011 adds the touch path. T012, T013 close the degraded modes, which ship with the happy path (Principle I), so they are not optional.
