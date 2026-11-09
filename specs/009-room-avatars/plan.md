# Implementation Plan: The Room's Avatars

**Branch**: `spec/009-room-avatars` (this plan; the work runs on `feat/009-room-avatars`, cut from `feat/004-chalkboard-model`'s tip, bf6239d1, while `feat/008-walking` wasn't finished, then moved onto `feat/007-twin-conversation`'s tip of the time, dad2891b, which carries group A, and then onto `feat/008-walking`'s final tip, 2ddf5e63 (87deda8f, then a7c214a7, before walking's review ended), which stands on the conversation's c43cf72b, [§10](#10-departures); the Author's intake on `feat/009-avatar-intake`, [§4](#4-the-order-of-work)) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Status**: Planned overnight on 2026-11-08, under the Author's "Let's finish this and keep going until you can", on the spec's provisional answers (its Clarifications, Q1 to Q5, and its defaults D1 to D10). Not yet approved. Phases 1 to 3 were built on `feat/009-room-avatars` ahead of that approval, at the main session's direction under the same words, a departure the spec's Deviations name; nothing merges before the Author accepts the intent and approves the spec and this plan (T000; `CLAUDE.md`). The consistency check that `/speckit-analyze` makes is recorded at the end of this file, [with what it changed](#consistency-check-the-speckit-analyze-pass-2026-11-08).

**Input**: [spec.md](spec.md) and [intent.md](intent.md). The room's code and spec 004's documents were read on `main` at a33b4833, where line R's user stories have merged. Spec 008's walking code on `feat/008-walking`, being built tonight, wasn't read: its interfaces are named from [spec 008's plan](../008-visitor-movement/plan.md) §3.6, and T009 confirms them.

**Companions**: none apart. This plan holds its decisions (§1, research), its data and interfaces (§3, the data model and contracts), and the Author's runs (§5.3, the quickstart), since the feature is one slice of spec 004's room runtime. Where this plan and spec 004's contracts disagree on the room's existing behaviour, spec 004's contract is right, and the spec's Amendments name what changes.

**Conventions** (spec 004's and spec 008's): **the Author's terminal** holds commands only the Author runs. **Agent-editable** files are changed by agents and reviewed by the Author; **human-only** files change only by the Author's hand, and this plan changes none (`tools/gates/arrival_check.py`'s F3 patch, M13, is offered to him, not made). **Assets**: agents never write under `assets/`; the intake's files are the Author's. **Paths**: files that exist only on `feat/008-walking` are named in code spans, never linked (`evals/docs_links.py` fails a link to a file the branch lacks).

## Summary

The spec asks for the chosen avatar in the visitor's figure, a labelled stand-in in the twin's, and nothing breaking when a file fails. The approach, in five parts:

- **The avatars in the room's own bundle** (FR-009, FR-023, FR-037 to FR-040): the compositor reads each avatar's folder under `assets/visitors/` by a naming convention, checks its records, reader, and caps (a new rule family, RA), and writes the bundled files into the 3D part's `avatars` and their gzip-9 copies into `dist/a/`, as it does the room's models. The scene gains a `figures` block: the stand-in, the texture cap, and the hand-off's wait. Spec 003's `assets.json` isn't needed for the local room.
- **One loader** (FR-002, FR-021, FR-022, FR-024): spec 004's loader gains avatar and clip entries, sharing its fetch slots, integrity, timeout, retry, holds, texture ledger, and asset events. The figures load first and resolve the promise the room's models already wait on.
- **The figures' pictures** (FR-008, FR-011, FR-015, FR-016, FR-018, FR-025 to FR-027): a new module places an avatar instance in a figure's picture group, scales it to the room's height for it, plays its clips through three's animation mixer, holds a still pose while the motion store doesn't animate, and carries the kept paper in its holding hand. The fallback stays in the group, hidden, so a failure brings it straight back.
- **The stand-in, said plainly** (FR-013): one UI word, in the stage's note and first in "Around the room".
- **The hand-off, walking, and the phone** (FR-019, FR-020, FR-028, FR-041): the room waits at most 1.5 s for both avatars, then plays the hand-off between them with "idle-holding" and "take"; spec 008's driver interface gains the avatar's driver; the reduced tier animates one avatar; the lookdev page shows the avatars for the Author's phone run.

**Phase 1 lands first**: both avatars standing at their places, with their idles and fallbacks, the stand-in line, the telemetry, and the disclosure. The Author's intake runs beside it and merges on its own.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node 24.21.0 (spec 000's pins) for `apps/web`; Python 3.12 for the dashboard's contract test and the web image's script; YAML for the room's data.

**Primary Dependencies**: three 0.186.1, held exactly (spec 004's R-29): its `AnimationMixer`, `PropertyBinding.sanitizeNodeName`, `Box3.setFromObject` with `precise`, and `examples/jsm/utils/SkeletonUtils.js`'s `clone`, all in the pinned package; the room's `GLTFLoader` and its image step (`scene/gltf-images.ts`); pako 2.1.0 for the copies; vitest 5.0.3, jsdom 30.1.1, axe-core 4.13.0, zod 4.6.5, as line R pins them. Nothing new.

**Storage**: none in the browser. The avatar instances, the once-a-visit flag for `avatar_failed`, and the asset events' queue live in page memory and leave with the page (spec 002 FR-003). In the repository, the Author's files under `assets/visitors/<id>/`.

**Testing**: vitest in `apps/web`: pure and three.js modules in Node (`test/room/`), the room's screens in jsdom (`test/ui/`), the compositor's fixture set and data-only proof set, the lookdev page's tests, and axe-core; the gateway's route tests; pytest for the dashboard's contract and the web image's script. Test GLBs, a skinned model and animation-only clips among them, are built at run time by `test/helpers/glb.ts`, since rule A1 refuses a committed model outside `assets/`. Every check runs inside `make test`, so no `CHECK_GATES` entry is added. The toolchain has no headless browser: rendering, the clips' look, frame rates, and the phone are the Author's runs (§5.3).

**Target Platform**: evergreen browsers on desktop and phone; WebGL 2 above ADR 0010's floor for the avatars; any browser for the 2D room, which keeps its flat shapes.

**Project Type**: an extension of spec 004's room runtime and compositor in `apps/web`, with the web image's build, one generated configuration file, the gateway's tests, the disclosure, the telemetry contract, and the dashboard. No service, container, port, or route changes.

**Performance Goals**: spec 002's FR-048 (30 fps on the reference phone, 60 on the reference desktop) with both avatars animating (SC-013); the hand-off within 5 s of its start and the wait at most 1.5 s (FR-019); a swap under the quality hold (spec 004 FR-055).

**Constraints**: no model call or storage for the avatars (FR-001); same-origin files with integrity (FR-022); the CSPs unchanged; spec 002's 150 KB entry chunk and spec 004's 16 KB index hold, the avatar modules staying in the lazy 3D chunk; the scene's texture memory within `main`'s cap, with about 41.4 million bytes of headroom in the last report (spec Assumptions); no human-only path is touched; agents write nothing under `assets/`.

**Scale/Scope**: three new source modules (the runtime's avatars, the compositor's avatar reader, and the RA checks), about thirty changed source, data, configuration, and document files; five new test files and about fifteen extended; 43 FRs and 14 success criteria; four avatars, two of them with files tonight.

## Constitution Check

*GATE: passed before the decisions and re-checked after design ([below](#constitution-check-post-design)).* Applied with the `constitution-check` skill's eight questions against the [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle or standard | What this plan does | Verdict |
|---|---|---|
| I. Data-local by default | The avatar requests, same-origin, disclosed in row V1 before or with the commit that first serves them (T023 before T018 and T025); `avatar_failed`, no identifier, in row V4 in its own commit (T023); asset events built and left off; nothing stored. Degraded mode first: Phase 1 carries User Story 6's checks (T012 to T014) | PASS |
| II. Production-grade or not shipped | Test-first tasks for every FR; the event, its panel, and its contract in Phase 1 (T023, T024); the cost estimate and its measurement (§6); an ADR and the room's README (T040, T041); no alert, so no runbook; no model, so no evals | PASS |
| III. Intent before spec, spec before code, humans merge | No code before the Author accepts the intent and approves the spec and plan (T000); the plan is cherry-picked into the branch (T008), and a departure updates §10 in the same commit; agents rebase and cherry-pick, never merge | PASS, with the spec's named deviation: the intent was a draft when the spec was written |
| IV. Least privilege | No permission, allowlist, sandbox domain, CSP, credential, cap, hook, gate, or human-only file changes. The RA family only narrows. The arrival check's F3 patch is offered, not made (M13) | PASS |
| V. Cost is a first-class signal | $0 model spend; about 10 MB more per first visit after publication, measured by the report and bounded by RK5 (§6) | PASS |
| VI. Build in public | Everything here is public; the records and the licenses are public by spec 003's design | PASS |
| VII. Own the whole product | The product reasoning (why the man, why the note, why the room's sizes, why 1.5 s, why one event) is in the spec and in the ADR | PASS |
| VIII. Honest AI | The stand-in line in the note and the text copy; spec 003's likeness line withheld for a stand-in; RA3 refuses a likeness in the stand-in's place; the AI disclosure untouched (SC-003) | PASS |
| Security and agent governance | The implementer never reviews its own branch (T043); a reviewer agent passes over the Author's intake (T005); no agent configuration changes, so the gate's agent-config evals don't run for these branches | PASS |
| Workflow step 7, "A feature without a graph is not done" | "Visits whose avatar failed" joins §7.8 and the dashboard in Phase 1 (T024) | PASS |
| Workflow step 8 (ADR, how-we-build) | An ADR records the decisions (T040); the process doesn't change | PASS |

Gate result: **PASS**, with the spec's one named deviation.

## Project Structure

### Documentation (this feature)

```text
specs/009-room-avatars/
├── intent.md   # the Author's words, verbatim, with the main session's and Claude's readings beside them; draft
├── spec.md     # clarified provisionally 2026-11-08
├── plan.md     # this file: decisions (§1), data and interfaces (§3), the Author's runs (§5.3), the analyze pass
└── tasks.md    # test-first, by phase
```

### Source Code (repository root)

New files are marked `+`; the rest change. The intake's files, under `assets/visitors/woman/` and `assets/visitors/man/`, are the Author's, on his own branch.

```text
apps/web/
├── room/
│   ├── scene.yaml                   # the figures block: twin_stand_in man, texture_px 1024, wait_ms 1500
│   ├── ui-words.yaml                # twin.stand_in
│   ├── catalog/twin-figure.yaml     # comments and work_order.method: the stand-in avatar; no model (RI8)
│   ├── catalog/visitor-figure.yaml  # comments and work_order.method: the chosen avatar's model, or its flat shape
│   └── README.md                    # the figures block, the avatars' convention, the stand-in
├── build/room/
│   ├── avatars.ts                 + # the compositor's avatar reader: folders, records, reader, measures, copies
│   ├── schema.ts                    # figures (optional)
│   ├── emit.ts                      # the 3D part's figures and avatars; the copy's line
│   ├── compose.ts                   # ra before rk
│   ├── policy.ts                    # main's per_asset.avatar and per_asset.animation
│   ├── plugin.ts                    # the avatars' .glb.gz copies in dist/a/
│   ├── report.ts                    # FR-040's lines
│   ├── orders.ts                    # unchanged code; the work orders regenerate from the catalog
│   ├── checks/family.ts             # the RA family and RK5 in the catalogue
│   ├── checks/ra.ts               + # RA1 to RA5
│   ├── checks/ri.ts                 # RI8's stand-in
│   └── checks/rk.ts                 # RK3's figures; RK5
├── src/choice/avatars.ts            # the clip roles, beside the avatar table; its comment (M3)
├── src/room/
│   ├── compose/bundle.ts            # the types: figures, avatars
│   ├── scene/avatars.ts           + # an avatar in a figure: place, scale, clips, still pose, holding hand, paper
│   ├── scene/loader.ts              # avatar and clip entries; the figures promise; the hand-off's parse gate
│   ├── scene/gltf-images.ts         # the decode cap
│   ├── scene/bundle3d.ts            # showHandoff's hand ends; the kept paper's parent
│   ├── scene/figure.ts              # (spec 008's) the avatar's driver beside the cut-out's
│   ├── scene/walking.ts             # (spec 008's) the driver by picture
│   ├── scene.ts                     # the avatars in the 3D stage; setQuality; dispose; reload
│   ├── stage.ts                     # Stage3D.figures (Phase 2)
│   ├── app.ts                       # the stand-in line; avatar_failed; the hand-off's wait (Phase 2)
│   ├── layout.ts                    # the note's second line
│   ├── room.css                     # the note's line; pointer-events: none
│   ├── text-copy.ts                 # the copy's line
│   ├── events.ts                    # avatar_failed
│   ├── ui-keys.ts                   # twin.stand_in
│   └── signals/frame-log.ts         # figure and clip events
├── src/lookdev/stage.ts, controls.ts, candidate.ts   # the avatars, the choices, the hand-off, candidates
└── test/room/*.test.ts, test/ui/*.test.ts, test/lookdev/*.test.ts, test/helpers/glb.ts, test/helpers/room.ts
apps/web/Dockerfile                  # the visitor-assets stage and its copy
deploy/scripts/web_image.py          # the visitor-assets named context; and test_web_image.py
config/room-events.yaml              # generated: avatar_failed
services/gateway/test/integration/room-events.test.ts, unit/room-events-config.test.ts
docs/data-flow-disclosure.md         # rows V1 and V4
docs/adr/<next free number>-the-rooms-avatars.md + and docs/adr/README.md
specs/000-local-foundations/contracts/telemetry.md   # §7.8's panel
deploy/grafana/dashboards/h4-runtime.json            # the panel
```

**Structure Decision**: everything lives in spec 004's workspace layout: the compositor in `build/room/`, three.js code in `src/room/scene/`, imported only by the lazy 3D chunk, and DOM code beside `app.ts`. The avatar module and three's mixer stay out of the entry chunk; only the UI word, the copy's entry, and the event's wiring join it.

## 1. Decisions (research)

- **R-01, the avatars in the room's bundle** (FR-009, FR-023, M12): the 3D part carries `avatars`, one entry per avatar whose model is bundled, and `figures` gains the block resolved (§3.2). The local room needs no `assets.json`: the bundle is already how the room learns its models, their URLs, hashes, and bytes, and spec 003's manifest waits for spec 001's release. When spec 003's Phase 5 builds `assets.json` for the twin's own avatar, the room can read either; that is its choice to make.
- **R-02, the files by convention** (FR-009; D1): an avatar's model is `assets/visitors/<id>/<id>.glb`, and its clips `<id>-<role>.glb` for the closed list of roles in code, `idle`, `idle-holding`, `take`, `walk`, beside `AVATARS` in `src/choice/avatars.ts`. A new role is code, through the lifecycle (spec 004's FR-005: "A new kind SHALL be code"). The studio's names lose their `visitor-` prefix at intake, which changes no byte.
- **R-03, one loader** (FR-021, FR-022; the main session's brief names the room's loader as one "which an avatar loader should reuse rather than duplicate"): `scene/loader.ts`'s `ModelEntry` gains a `kind` (`model`, `avatar`, or `clip`) and, for the last two, its figure and avatar. An `avatar` entry parses through the room's image step and the look's `prepareModel`, then goes to `options.avatar(entry, gltf)` instead of `swap`; a `clip` entry parses with no image step and goes to `options.clip(entry, animations)`, with no ledger and no swap. Both share the four fetch slots, `integrity`, no redirect, the 10-second timeout, the one retry, the holds, and the asset events. A new `loadFigures(entries)` doesn't wait on `options.figures`; the settlement of its fetches (each fetched or failed) resolves that promise, which `load` already awaits for the room's models, so the figures go first and no call waits on itself. One file both figures show is one entry.
- **R-04, the picture** (FR-002, FR-016, FR-017): the avatar instance goes into the figure's existing picture group (`room.visitor`, the cut-out's group; `room.twin`, the capsule's), named `avatar`, and the fallback's meshes hide. So the hand-off's turns, which rotate those groups, turn the avatar too, and `null` shows the fallback again with nothing to rebuild. `buildRoom` doesn't change: it still builds the fallbacks, so every test of it holds.
- **R-05, placement and scale** (FR-016): the model's origin at the group's origin (the placement's, at the figure's feet); its height measured once from its rest pose with `new Box3().setFromObject(model, true)`, which skins the vertices in three 0.186.1; scale = the target height over it; then lifted or lowered so the box's bottom is at y 0. The target height is `AVATAR_SHAPES[id].height` for the visitor and the twin figure's catalog `size.h` (1.75) for the twin, from the 3D part's pieces. Facing: glTF's +z, turned by the placement as the fallback is. Uniform scaling absorbs a model exported in centimetres, its clips scaling with it; a measured height that isn't a finite number above 1 cm is treated as a failed parse, so the fallback stays and the frame log says why.
- **R-06, two instances** (FR-015): `SkeletonUtils.clone(gltf.scene)` gives each figure its own bones and skinned meshes, sharing geometry, materials, and textures, so texture memory is counted once at run time; each instance has its own mixer. RK3 still counts both (R-19), an upper bound.
- **R-07, clips** (FR-025, FR-026): an `AnimationMixer` per instance, an action per role; the idle and "idle-holding" loop, "take" plays once and clamps; a change crossfades over 0.25 s while the motion store animates, and cuts otherwise. While it doesn't animate, the mixer isn't advanced: entry sets the shown clip's time to 0 and calls `mixer.update(0)`, so the pose is its first frame, and a pause leaves the frame it had. Three sanitizes node names on load (`PropertyBinding.sanitizeNodeName` drops the colon of `mixamorig:Hips`), and a clip from its own file binds to the model's bones by those names, which match where the raw names match (RA2 checks the raw names).
- **R-08, the holding hand** (FR-018; D2; amended 2026-11-09, the Author's "Count the fingers", §10): with the idle at time 0 and then "idle-holding" at time 0, the world positions of `mixamorigRightHand` and `mixamorigLeftHand` and of every bone under each, its fingers, are read; a hand's motion is the sum of how far its hand bone and each bone under it move, and the hand that moves farther holds, the right on a tie. With no "idle-holding", the hand nearer the other figure's placement holds. With neither bone, there is no holding hand, and the paper stays at the anchor. Found once per instance, at its swap.
- **R-09, the kept paper** (FR-018): at the hand-off's end, or at the avatar's swap if later, the kept sheet is attached to the holding hand with `Object3D.attach`, which keeps its world transform, then given a fixed offset so the hand holds its lower edge; it then moves with the hand, and with the figure when it walks (spec 008's R-12 parents it to the picture; with an avatar, the hand is inside the picture). On a fallback it returns to the picture at the anchor. The offset is a constant in code that lookdev judges (L1).
- **R-10, the rigged hand-off** (FR-019, FR-020; Phase 2): `Stage3D` gains `figures`, a promise that resolves when both figures are ready or have their fallbacks for good. `app.ts` waits for it or for `wait_ms` from the mount, whichever first, before `runHandoff`; it doesn't wait when the bundle names no avatar for either figure or the device is below the floor. The loader's parse gate is open until the hand-off starts, shut during it, and open after it ends, so a ready avatar parses within the wait and a late one after the hand-off. In `showHandoff`, the sheet's start is the twin's holding hand's world position at progress 0, and its end the visitor's holding hand's position each frame, on the same arc; a figure with its fallback uses its anchor, as today. The visitor's "take" starts at `max(0, D − its length)`, so it ends as the hand-off ends, and "idle-holding" follows; the twin's "idle-holding" runs from its swap until progress 0, then its idle. Under reduced motion, `showHandoff`'s crossfade stays, and the clips change by cuts at its start and end.
- **R-11, the decode cap** (FR-024): `scene/gltf-images.ts`'s image step takes `maxSide`: an image larger on a side is decoded and resized so its larger side is `texture_px`, keeping its aspect, then halved where the quality level is 1 or more, as today's reduced step does; the room's models keep no cap. RK3 measures an avatar's images at that size by the same rule, so the build and the ledger count the same bytes.
- **R-12, the compositor's avatar reader** (FR-009, FR-038, FR-040): `build/room/avatars.ts` lists `assets/visitors/<id>/` for each avatar of the table through the compose's tree; reads its `records.json`; names each file's role from its name; reads each GLB with the fit check's reader (`glb/read.ts`), never RX3, which refuses skins and animations in a room piece; and measures its bytes, gzip-9 bytes (`glb/gzip.ts`), triangles, images' sides, texture memory at its own size and at the cap, node names, and each clip's channel targets. An avatar is bundled only when `main`'s caps hold `per_asset.avatar` (and `per_asset.animation` for a clip), as a room model is set only when `main`'s room caps exist.
- **R-13, the stand-in line** (FR-013; D3, D10): the compositor puts `{line: "twin.stand_in"}` first in the index's `copy` while the bundle gives the twin no avatar of its own, which is always in this spec. `text-copy.ts` draws it as a fixed line, and `app.ts` shows it in the stage's note while `copy` holds it. The note becomes a small stack at the stage's top left, the placeholder note (when on) and the stand-in line, each its own paragraph, with `pointer-events: none`, so a tap on a piece under it reaches the scene.
- **R-14, the event** (FR-032): a page-memory flag set at the first `failed` outcome of any figure file, model or clip; `avatar_failed` goes through the room's `EventSink`, which `build/manifest.ts` turns into the manifest's `event_kinds` and `config/room-events.yaml`'s `kinds`. The gateway's route takes a kind with no ID from its file; its code doesn't change.
- **R-15, serving** (FR-023): `plugin.ts` writes each bundled avatar file's `.glb.gz` with the room's pako call (`glb/gzip.ts`), MTIME 0, OS 255, and never a plain `.glb`. `web_image.py` hands `<tree>/assets/visitors` over as the named context `visitor-assets` when it is a directory of the tree's own, neither it nor `assets/` a link, as it does `room-assets`; the Dockerfile gains an empty `visitor-assets` stage and `COPY --from=visitor-assets / /src/assets/visitors/` in the build stage. A build that names none builds the fallbacks.
- **R-16, the avatar's driver** (FR-028; Phase 3): it implements the interface of spec 008's R-12 as `scene/figure.ts` states it on `feat/008-walking`: the group at the pose's place, `rotation.y` its heading, `scale.x` 1, no bob; with a walk clip, the walk's weight is `min(1, speed / the walking data's speed)` against the idle's or "idle-holding"'s; with none, it slides in "idle-holding" once it holds the paper, its idle before. `scene/walking.ts` asks which driver to use each frame from what the figure shows, so a swap or a fallback mid-walk changes the driver on the next frame with the same pose.
- **R-17, the reduced tier** (FR-027): `scene.ts`'s `setQuality` tells the avatars the level; at 1 or more only the twin's mixer advances, and the visitor's holds its frame.
- **R-18, lookdev** (FR-041; M20): the page's stage shows the avatars in the figures from the bundle; its controls choose the visitor's avatar and the stand-in, play the hand-off (normal and reduced), and show each clip by role; its file picker takes an avatar's model and clips as candidates, in memory, for either figure, which is how the phone copy, which holds no model, gets them (spec 004's contracts/lookdev.md §7).
- **R-19, RK3 and RK5** (FR-038): RK3's twin term becomes the larger of every model under `assets/twin/` together (today's) and the stand-in avatar's files together; the visitor term stays the largest visitor folder's; both counted at the decoded size. RK5 sums the placed room models' gzip-9 copies (the report's share), the stand-in avatar's bundled files, and the largest other visitor avatar's bundled files, against `policy.phase3_bytes`; it refuses in a strict build and warns in a lenient one, since only the gate needs to stop a branch over the budget.

## 2. The changes to the room's existing files

- **`scene/loader.ts`**: the entry kinds, `loadFigures`, the figures promise, the parse gate (Phase 2), and the clip path (R-03, R-10).
- **`scene/gltf-images.ts`**: the `maxSide` option (R-11).
- **`scene/bundle3d.ts`**: nothing in `buildRoom`; `showHandoff` takes the hand ends from the avatars (Phase 2, R-10); the kept paper's parent (R-09).
- **`scene.ts`**: creates the avatar figures and the loader's figure entries from the 3D part's `avatars` and `figures`, the chosen avatar, and the stand-in; advances the mixers each frame by the motion store; passes the quality level; reloads them after a restored context; disposes them; and, in Phase 2, implements `Stage3D.figures`.
- **`stage.ts`**: `Stage3D.figures` (Phase 2); the stand-in scene in `test/helpers/room.ts` gains a recording implementation.
- **`app.ts`**: the note's stand-in line from the index's `copy`; `avatar_failed` once a visit from the stage's outcomes; the frame log's figure events; and, in Phase 2, the hand-off's wait.
- **`layout.ts`** and **`room.css`**: the note's second paragraph and `pointer-events: none`.
- **`text-copy.ts`**: the `twin.stand_in` line, a fixed line in `copy`'s order.
- **`events.ts`**, **`ui-keys.ts`**, **`signals/frame-log.ts`**: the kind, the key, and the events.
- **`src/choice/avatars.ts`**: the clip roles; the header comment's "until spec 003's avatars replace them" becomes the flat shapes' three uses (M3).
- **`build/room/`**: `schema.ts`, `emit.ts`, `compose.ts`, `policy.ts`, `plugin.ts`, `report.ts`, `checks/family.ts`, `checks/ri.ts`, and `checks/rk.ts`, as §3 gives them.
- **The catalog's figure entries**: their comments and `work_order.method`, so the work orders say what the figures show; the committed work orders are regenerated in the same commit, which `make test`'s freshness check holds.
- **`src/lookdev/`**: R-18.

## 3. Data and interfaces

### 3.1 The scene's `figures` block (FR-037; optional, with these defaults; the default scene writes it out)

| Field | Default | Range | Spec |
|---|---|---|---|
| `twin_stand_in` | absent: no stand-in avatar, the capsule. The default scene writes `man` | an avatar ID of `AVATARS` (RI8) | FR-011 |
| `texture_px` | 1024 | 256 to 4,096, a power of two | FR-024 |
| `wait_ms` | 1500 | 0 to 3,000, an integer | FR-019 |

A key outside the schema, or a value outside its range, is refused by spec 004's RD2 and RD3. The 3D part carries the block resolved; the index carries none of it.

### 3.2 The 3D part's `figures` and `avatars` (FR-009, FR-023, FR-024)

```ts
// spec 004's RoomScene, its additions:
figures: { twin: string; visitor: string;                 // placement IDs, as today
           stand_in: AvatarId | null; texture_px: number; wait_ms: number };
avatars: Partial<Record<AvatarId, {                       // only avatars whose model is bundled
  model: { url: string; sha256: string; bytes: number; texture_bytes: number };   // texture_bytes at texture_px
  clips: Partial<Record<"idle" | "idle-holding" | "take" | "walk",
                        { url: string; sha256: string; bytes: number }>>;
}>>;
```

- **`url`** is `a/<stem>.<hash16>.glb`, the stem the file's (`woman`, `woman-idle`), the hash the plain file's first 16 hexadecimal digits; **`sha256`** the plain file's, for the integrity check; **`bytes`** the served `.gz` copy's length (spec 004's C11).
- **Not in the index:** the 2D room draws flat shapes and needs none of it, so the entry chunk stays as it is but for the UI word and the copy's entry (§3.3).
- **Not in `load_order` or the index's `models`:** those stay the room's (D7); the figures load first by `loadFigures` (R-03).

### 3.3 The UI word, and the text copy's line (FR-013, FR-039)

| Key | Default words | Slots |
|---|---|---|
| `twin.stand_in` | The twin's figure is a stand-in, not the Author's likeness. | – |

The index's `copy` gains `{line: "twin.stand_in"}` first, while the bundle gives the twin no avatar of its own.

### 3.4 The event (FR-032) and the frame log (FR-035)

- `avatar_failed`: in `events.ts`'s `EVENT_KINDS`, after spec 008's `walk_started`; body `{"kind": "avatar_failed"}`; no `id`.
- The frame log's events gain `figure`, with `figure` (`twin` or `visitor`), `shows` (`avatar` or `fallback`), and `why` (`no-file`, `failed`, `skipped`, `floor`, `2d`, or `late`), and `clip`, with `figure` and `role`.

### 3.5 The compositor's rules (FR-038)

| Rule | Refused (strict) / left out (lenient) | Spec |
|---|---|---|
| RI8 (extended) | A `figures.twin_stand_in` that isn't an avatar of the table; in every build | FR-011, FR-037 |
| RA1 | An avatar's model or clip not recorded in its folder's `records.json`, or recorded with another kind than `avatar` or `animation` | FR-009 |
| RA2 | An avatar's file the reader can't read (as RX1 and RX2 read, `READ_PAST` aside); a clip with no animation; a clip whose channels target a node name its model lacks | FR-003, FR-009 |
| RA3 | The stand-in's model recorded `likeness: true`, or with a `photo` source | FR-014 |
| RA4 | An avatar's file over `main`'s `per_asset.avatar` or `per_asset.animation` caps, bytes, triangles, and texture memory at its own size, as spec 003's F2 measures them | FR-009 |
| RA5 | A file in a visitor's folder with no role: reported, never refused | FR-009; D9 |
| RK3 (extended) | The scene's texture memory over its cap, the twin's figure the larger of its own models and the stand-in's files, each avatar at its decoded size; in every build, as today | FR-024, FR-038 |
| RK5 | The first visit with both figures' files over `main`'s phase-3 budget; strict refuses, lenient warns | FR-038; D8 |

The report gains FR-040's lines: a table of each avatar's files (role, bytes, gzip-9 bytes, triangles, texture memory at its size and at the cap, bundled or why not), the scale the reader's bounds imply for each figure, which avatar the twin shows, RK3's figures with the stand-in, and the first visit with both figures beside F3's view.

### 3.6 The modules' interfaces, in prose

- **`build/room/avatars.ts`**: from the compose's tree, the policy, and the scene's block, gives each avatar's files with their roles, records, measures, and findings, and the bundled set; emit, the RA checks, RK3, RK5, the report, and the plugin read it, so each file is read once.
- **`scene/avatars.ts`**: `createAvatarFigures(room, part, options)` gives the two figures' controllers. Each takes an avatar's parsed model and clips from the loader, makes its instance (R-06), places it (R-05), finds its holding hand (R-08), shows it once ready, and falls back on a failure; and each frame `update(dt, animate, level)` advances its mixer or holds its pose (R-07, R-17). It owns the kept paper's parent (R-09), gives the hand-off its hand positions (R-10), and reports each figure's outcome for the event and the frame log.
- **`scene/loader.ts`**: R-03's entry kinds, `loadFigures`, and the gate.
- **`scene/figure.ts`** (spec 008's): its driver interface gains the avatar's driver (R-16); the cut-out's driver doesn't change.
- **`stage.ts`**: `Stage3D.figures: Promise<void>` (Phase 2).

## 4. The order of work

### 4.1 The branches

| Branch | From | Holds | Merges |
|---|---|---|---|
| `feat/009-avatar-intake` (the Author's) | `main` | Phase A: the woman's and the man's files, records, notices, and credits | on its own, before or after the code: the room ignores the files until the code merges, and the code shows fallbacks until the files merge |
| `feat/009-room-avatars` | `feat/007-twin-conversation`'s tip since the move (§10); `feat/008-walking`'s tip once walking stands on the conversation | Phases 1 to 5 (Phase 3 waits for walking) | after `feat/008-walking`, as the stack's last before the Author's P-1, in one gate |
| `feat/009-avatar-handoff` (only if the night ends after Phase 1) | Phase 1's tip | Phases 2 to 5 | after `feat/009-room-avatars` |

If `feat/008-walking`'s tip moves before this merges, an agent rebases `feat/009-room-avatars` onto it; agents never merge (`CLAUDE.md`). The branch ends with a review by an agent that didn't write it and a merge-request note in `docs/merge-requests/`, holding `make check ENGINE_MODE=none-yet`'s whole output. If the work stops after Phase 1, that review and note cover Phase 1 alone, and the rest continues stacked on its tip (the third row), so nothing waits on unfinished work.

Either order of the two merges leaves `main` passing: the intake alone adds one avatar to RK3's visitor term, which spec 003's F2 caps at 33,554,432 bytes, under the 41.4 million of headroom; the code alone adds no file. Whichever merges second runs RK3's stand-in term and RK5 with the files at its gate, so `main` never holds a total over its caps.

### 4.2 What can run in parallel

Each lane touches its own files, so agents can work them in their own worktrees, one per agent that writes, their commits cherry-picked onto the branch in task order.

| Lane | Files | Waits for |
|---|---|---|
| A, the compositor and the data | `build/room/avatars.ts`, `schema.ts`, `emit.ts`, `compose.ts`, `policy.ts`, `report.ts`, `checks/*`, `compose/bundle.ts`, `scene.yaml` | nothing |
| B, the 3D runtime | `scene/avatars.ts`, `scene/loader.ts`, `scene/gltf-images.ts`, `scene.ts`, `stage.ts` | A's types (T016) |
| C, the room's DOM | `layout.ts`, `room.css`, `text-copy.ts`, `ui-keys.ts`, `ui-words.yaml`, `app.ts` | A's copy entry (T016) |
| D, telemetry and documents | `events.ts`, `config/room-events.yaml`, the gateway's tests, the disclosure, §7.8, the dashboard | nothing; the disclosure lands before the flow (T023 before T018, T025) |
| E, serving | `plugin.ts`, `web_image.py`, the Dockerfile, their tests | A's reader (T016, T017) |
| F, lookdev | `src/lookdev/*` | B |
| G, the Author's intake | `assets/visitors/woman/`, `assets/visitors/man/`, and their records | nothing; the Author's hand |

Phase 1 itself runs lanes A and D at once, then B, C, and E, then joins in `app.ts`.

### 4.3 The phases

1. **Phase A, the Author's intake** (User Story 7), beside Phase 1.
2. **Phase 1, both avatars at their places** (User Stories 1 and 2, with User Story 6's checks): the MVP, landing first. The hand-off is today's, between the fallbacks, and the avatars swap in when it ends (D4).
3. **Phase 2, the hand-off between the avatars** (User Story 3).
4. **Phase 3, walking with the avatar** (User Story 4).
5. **Phase 4, the phone and the lighter tiers** (User Story 5), with the lookdev page and the Author's runs.
6. **Phase 5, polish**: the ADR, the README, the review, the note, the demo, and the merge.

The answer to "Is that possible for you to get to by the time I wake up?", in order of work: Phase 1 shows both avatars in the room; Phase 2 adds the hand-off between them; Phase 3, walking. How far the night goes depends on `feat/008-walking`'s tip, which this branch stands on, and on the Author's intake, which only he can make.

## 5. Tests

### 5.1 The agents' tests (inside `make test`)

| File | What it proves | Spec |
|---|---|---|
| `test/room/schema.test.ts`, `compose.test.ts`, `budgets.test.ts`, `report.test.ts` (extended) | the `figures` block, defaults, and ranges; RI8's stand-in; RA1 to RA5, each with a known-bad fixture, strict and lenient; the 3D part's `figures` and `avatars`; the copy's line first; RK3's stand-in term and decoded sizes; RK5; the report's lines; no read under `assets/twin/` for the stand-in, by a tree spy; determinism | FR-009, FR-011, FR-012, FR-014, FR-024, FR-037, FR-038, FR-040, SC-003, SC-009, SC-010 |
| `test/room/data-only.test.ts` (extended) | the stand-in to `woman`, `texture_px` to 512, and `wait_ms` to 0 are data edits | FR-037, SC-008 |
| `test/room/avatars.test.ts` (new, Node with three's objects) | the avatar in the picture group, the fallback hidden and back on `null`; placement, height, feet, facing; the camera and the pick areas unchanged by a swap; two instances with their own skeletons sharing geometry; the idle loop; the still pose; a failing idle's rest pose; the holding hand; the kept paper in the hand; at quality 1, the twin's mixer alone | FR-002, FR-003, FR-008, FR-015 to FR-018, FR-025 to FR-027, SC-001, SC-005 |
| `test/room/loader.test.ts` (extended) | avatar and clip entries: integrity, timeout, one retry, the fallback, the ledger's skip; clips after their model; the room's models after both figures settle; parse after the hand-off; the asset events by stem; `stop()` skips; below the floor nothing fetched; one fetch for a file both figures show; the decode cap; the reload after a restore | FR-002, FR-004 to FR-006, FR-015, FR-021, FR-022, FR-024, FR-031 |
| `test/ui/avatars.test.ts` (new, jsdom, with the stand-in scene) | the stand-in line in the note and first in "Around the room", in 3D and 2D; no likeness line; the note lets taps through; `avatar_failed` once, and never for a skip, a missing file, the floor, or 2D; no avatar request in a visit in 2D from the start; only the chosen avatar's and the stand-in's files | FR-004, FR-010, FR-013, FR-029, FR-030, FR-032, FR-033, SC-003, SC-004, SC-011 |
| `test/room/live.test.ts` (extended) | the frame log's `figure` and `clip` entries in a drafts build; none in a release build | FR-035 |
| `test/ui/degraded.test.ts` (extended) | every degraded state of FR-001, with network spies; a failing avatar leaves the room usable | FR-001, FR-002, FR-007, SC-002 |
| `test/room/dist.test.ts`, `test/serving.test.ts` (extended) | each `a/*.glb.gz` is a room model's or a bundled avatar file's copy, computed from the 3D part; the copies' header, hash, and length | FR-023, FR-043 |
| `test/manifest.test.ts`, `test/room/generated.test.ts`, `test/disclosure.test.ts` (extended); the gateway's route and config tests | `avatar_failed` in `event_kinds` and `config/room-events.yaml`; rows V1 and V4; 204 without an ID, 400 with one | FR-032, FR-036, SC-011 |
| `deploy/scripts/test_web_image.py` (extended) | the `visitor-assets` context passed exactly when the folder is the tree's own and no link; the Dockerfile's stage and copy before the build's `RUN` | FR-023 |
| `deploy/scripts/test_dashboard.py` (unchanged code) | §7.8's new panel and the dashboard agree | FR-034, SC-011 |
| `test/ui/a11y.test.ts` (extended) | axe with the avatars' note; the 320 × 568 model with the note | FR-029, SC-012 |
| `test/room/avatar-handoff.test.ts` (new, Node) | the paper hand to hand, tracking the visitor's hand; "take" ending with the hand-off; the twin's clips; 5 s; reduced motion's crossfade and cuts; a late avatar's anchor | FR-019, FR-020, SC-006 |
| `test/ui/handoff-wait.test.ts` (new, jsdom) | the wait ends at both ready or at `wait_ms`; none with nothing to load or below the floor; the announcement at the hand-off's start | FR-019, SC-006 |
| `test/room/avatar-driver.test.ts` (new) and `test/room/walking.test.ts` (extended) | the avatar's driver over seeded walks: heading, no mirror, no bob, the walk clip by speed or the slide, the paper in the hand; the driver by picture, mid-walk | FR-028, SC-007 |
| `test/lookdev/page.test.ts`, `builds.test.ts` (extended) | the page's requests are the bundle's room models and avatar files; the avatars, the choices, the hand-off control, the candidates in memory; drafts builds only | FR-041 |

### 5.2 RED first

In each phase the test tasks come first and must fail before the code that makes them pass; the branch's note records the RED and GREEN runs.

### 5.3 The Author's runs (the quickstart)

- **L1, lookdev on the desktop** (SC-001, User Stories 1 to 3): the lookdev page in a drafts build, on both reference stages: each avatar's size, feet, and facing at the figures; its rest pose (shown by holding a clip back); its idle; the holding hand and the paper's offset; the hand-off, normal and under reduced motion; the stand-in line. The Author keeps the defaults or changes them as data (`texture_px`, `wait_ms`, the stand-in).
- **L2, the phone** (SC-013): the lookdev phone copy, the avatars' files copied with it as candidates (spec 004's contracts/lookdev.md §7), the 2-minute run with both avatars animating: the median, the share over 33 ms, and the settled quality.
- **L3, keyboard and screen reader** (SC-012): spec 004's Q9 runs again with the avatars: a keyboard-only visit, and a screen-reader visit that hears the stand-in line and chooses every piece from the list.
- **L4, the intake's facts** (SC-014; Phase A): from each folder's `HANDBACK.md` and records, before anything is committed: the source type (a prompt or a design, never a photo), `likeness: false`, every model, tool, library, and hosted service with its license and version, the skeleton's bone names (ADR 0010's `mixamorig:` names), which hand "idle-holding" and "take" use, the facing (+z), the origin at the feet, the rest pose, and each clip's length. A fact that differs from the spec's Assumptions goes in the intake's note, and a session updates §10.
- **L5, the demo** (the Author's "full demo"): after the merges, `make up ENV=prod` from `main`'s checkout; at the door choose the woman; watch the hand-off between the woman and the man; walk; select a piece and talk to the twin; read the stand-in line; then "2D view". The run's verdict goes in the note's follow-up.

### 5.4 The tests that pin today's state

As the main session relayed it, the chalkboard's re-intake failed its gate on the night of 2026-11-07 on a test that pinned the room's state. These are the tests that pin the figures' state on `main` (a33b4833), and what changes them:

| Test | What it pins | Who changes it, and when |
|---|---|---|
| `apps/web/test/room/dist.test.ts`, "holds no plain .glb, and each a/*.glb.gz is a model's copy" | every copy in `dist/a/` is one the 3D part's placements or compose()'s models name: a room model's | this branch, T015, RED before the copies (T018): it counts the 3D part's `avatars` too, computed, so the intake changes nothing |
| `apps/web/test/lookdev/page.test.ts`, the page's own requests | the page fetches only the room's set models | this branch, T035, RED before the page loads avatars (T037, Phase 4): the bundle's avatar files join the expected requests. Until then the page builds its own room with the first avatar's cut-out and loads no avatar, so Phase 1 leaves the test as it is |
| `apps/web/test/manifest.test.ts`, "keeps spec 002's free talk not ready, the four avatars, and the event kinds" | the exact event kinds | this branch, T015, in the event's phase (T023) |
| `apps/web/test/manifest.test.ts`, "names one piece, whose entry names no model…" | the figures have no `model`, and `placeholders` is `!arrived`, arrived meaning the twin's GLB and all four visitors' | nobody: the avatars stay out of the placements' `model` (R-01), and `placeholders` stays true while the twin, the dog, and the dinosaur lack files. Its `unset` count pins the chalkboard, which its own intake changes |
| `apps/web/test/room/loader.test.ts`, "the site's own room records its 21 models skipped in 2D" | the index's `models` | nobody: the avatars aren't in it (§3.2, D7) |
| `apps/web/test/room/scene.test.ts`, "finds the figures by role" | `buildRoom`'s fallbacks | nobody: `buildRoom` doesn't change (R-04) |
| `apps/web/test/room/generated.test.ts` | `config/room-events.yaml` and the work orders are fresh | this branch, in the commits that change the kinds (T023) and the figures' catalog text (T026) |
| `apps/web/test/ui/a11y.test.ts`, the 320 × 568 model | the stage's note's size | this branch, T015, before the note's line (T022) |
| The credits check (`scripts/assets/credits.py --check`, in `make arrival` and the gate) | `assets/CREDITS.md` renders the records | the Author's intake, `make assets-credits` in the commit that adds the records (T003) |

The fixture-based tests of the report and RK3 (`report.test.ts`, `budgets.test.ts`) read fixture trees, not the repository, and need no change for the intake.

## 6. Expected cost, and how it is measured

As the spec's Expected Cost Impact: $0 model spend; $0 in the cloud before publication; after it, about 10 MB more per first visit as the files stand (the two folders' plain bytes are 5,082,992 and 5,010,584), a first visit about 16.7 MB with the room's models, inside 25 MB; at most one beacon of about 25 bytes per visit whose avatar fails; an estimated 10 to 20 KB gzipped in the lazy 3D chunk and under 1 KB in the entry chunk. Measured by the report's first-visit and RK3 lines (FR-040), the build's chunk sizes (T027, T042), and the "Visits whose avatar failed" panel.

## 7. Degraded mode and telemetry

The spec's Degraded-Mode Behavior table is the design: the avatars are static same-origin files, so nothing about the tier, the budget, or the kill switch reaches them; every failure keeps its figure's fallback, which never left its group; the 2D room draws as today. Telemetry is spec 003's asset events, built and off; `avatar_failed` and its panel; and, in a drafts build, the frame log's figure and clip events for the Author's runs. The gateway's existing server span on `POST /room/events` records each event request's route, status, and outcome, never its body; there is no browser span (spec 004's contracts/room-live-state-telemetry.md §1).

## 8. Risks

| Risk | Mitigation |
|---|---|
| Two avatars' textures take RK3 over the scene's cap, which fails every build, `make up` included | decoded at most 1,024 pixels a side and counted so (R-11, R-19); `texture_px` is data, so a lower value is a data edit; the intake alone can't exceed (§4.1); the report shows the figure at the intake (T004) and at this branch's note |
| The files don't follow the assumed skeleton, facing, origin, units, or rest pose | L4 reads the hand-back first; RA2 checks clips against models; R-05's uniform scale absorbs centimetres and refuses a degenerate height; a wrong facing or origin shows at L1, and is the studio's re-export |
| "idle-holding" and "take" use a hand R-08 doesn't find, or both hands | R-08 picks the hand that moves farther, its fingers counted (the Author's answer of 2026-11-09, after the intake's clips moved only the left hand's fingers, §10); L1 judges; a fixed hand in data is the fallback design (D2's no) |
| A hosted rigging service or animation library a step used isn't on the allowlist for public distribution, or lacks its disclosure row | L4 and T002 before the commit; the arrival check refuses otherwise (L1, R7), so the gate fails on the Author's branch, not on `main` |
| The studio's `HANDBACK.md` or `SHA256SUMS` lands in an asset folder | rule A3 refuses it; T003 says so |
| Two skinned avatars cost too much on the phone | the reduced tier animates one (R-17) and halves textures; the quality controller steps down as today; L2 measures |
| The stage's note covers a piece | `pointer-events: none` (R-13), so a tap passes; the list stays the way to choose; L1 judges |
| `feat/008-walking`'s driver interface differs from spec 008's plan | T009 reads it first; R-16 follows the branch; §10 records it |
| Three's name sanitizing breaks a clip's binding | R-07's rule, RA2 on raw names, and T011's case with a colon-named skeleton |
| The paper floats where an avatar has no hand bone (the dog and the dinosaur, later) | it stays at the anchor, as today (FR-018) |
| An asset event names the chosen avatar once spec 001 sends them | M11: row V6 says so in spec 001's change |
| Intent 005 changes the layout first | it re-measures the note with the stage; nothing here depends on the layout |

## 9. Complexity Tracking

No constitution violation needs justifying. One new rule family, RA, joins spec 004's nine and spec 008's RW, named in §3.5, with one new RK rule.

## 10. Departures

A task that departs from this plan records it here, in the commit that departs (`CLAUDE.md`: "If implementation departs from the plan, update `plan.md` in the same commit").

- **The base (T007 to T009, 2026-11-08).** `feat/008-walking` wasn't finished, so the main session cut `feat/009-room-avatars` from `feat/004-chalkboard-model`'s tip, bf6239d1, which carries the room's 21 pieces, and will move it onto the assembled stack (the chalkboard, the open items, spec 008's highlight, walking, the conversation, then this branch) before it merges. T009 read that base, not walking's: it has no `src/room/scene/figure.ts` or `scene/walking.ts`; `events.ts`'s kinds end at `mode_2d`, with no `walk_started`; `Stage3D` is `mode`, `canvas`, and `setQuality`, as §3.6 assumes; and §7.8 holds spec 002's six panels, with no spec 008 panel. So, until the move: `avatar_failed` follows `mode_2d` (§3.4 puts it after `walk_started`, where the move takes it); Phase 3 (T031 to T033), the avatar's walking driver, isn't built here, since it needs walking's driver interface; and the figures' pictures change behind seams of their own (`scene/avatars.ts`, a few marked lines in `scene.ts`, `bundle3d.ts`'s `paper.kept`, and optional fields at the ends of `SceneOptions` and `LoaderOptions`), so the move's conflicts stay small. The spec's commit, cherry-picked, was 21a932f7 on this branch, and is c4adde93 since the move (below).
- **Row V1 lands with the serving code (T018, T023, T025).** T023 puts rows V1 and V4 in one commit before the copies (T018) and the web image (T025). The main session's brief of 2026-11-08 asks that row V1 land "in the same commit as the code that serves it" and row V4 "with the `avatar_failed` event", so V4 lands with the kind in T023's commit, and V1 with T018's and T025's: never a served avatar without its row.
- **The move (after Phase 2, 2026-11-08).** At the main session's direction the branch moved onto the stack below: `feat/008-walking` didn't yet stand on `feat/007-twin-conversation`, so onto the conversation's tip of the time, dad2891b, which carries group A (the chalkboard, the open items, spec 008's highlight), with `git rebase --onto refs/heads/feat/007-twin-conversation refs/heads/feat/004-chalkboard-model`; the chalkboard's branch had gained one commit past bf6239d1, which the conversation holds, so the 17 commits from the spec's on moved. Each conflict kept both sides: `compose.test.ts`'s catalogue (RA before RK, then spec 008's RW), `family.ts`'s `FAMILIES`, `compose.ts`'s `FAMILY_ORDER` (`ra` before `rk`, `rw` last), `emit.ts`'s imports (`Highlight` and `AvatarId`), `report.ts`'s header and imports (the highlight's contrasts and the avatars' lines), rows V1 and V4 beside the conversation's V2, `scene.ts`'s swap (the highlight's refresh with the figures' callbacks) and `setTarget` beside `setQuality`, `app.ts`'s header (the target's paragraph and the avatars'), `frame-log.ts`'s events (`target`, then `figure` and `clip`), `test_dashboard.py`'s two appended tests, and the dashboard's panel id, 67 being the conversation's row: the panel is 77. The generated files needed no change; the web suite passed whole on the moved tree (96 files, 2,562 tests). (This bullet named the base 3a614ef6 until the review of Phases 1 and 2 found it wrong: the conversation's tip the move took was dad2891b.)
- **The second move (onto walking, 2026-11-08).** Once walking stood on the conversation, the main session moved the branch onto `feat/008-walking`'s tip, 87deda8f, over the conversation's c43cf72b, with `git rebase --onto refs/heads/feat/008-walking dad2891b`: the 18 commits from the spec's on. Each conflict kept both sides, walking's first: `disclosure.test.ts`'s two tests, the manifest's and the gateway's event kinds (`walk_started`, then `avatar_failed`), `compose.test.ts`'s counts (RA and RK5, then RW1 and RW2), `vocabulary.test.ts`'s closed list (41 keys), and the gateway config's comments; `bundle.test.ts`'s 3D part (`walking`, then `avatars`); `emit.ts`, `schema.ts`, and `bundle.ts` (walking's block and fields, then the figures' and the avatars'), and `report.ts`'s imports; `events.ts`, `events.test.ts`, and `config/room-events.yaml` (`walk_started`, then `avatar_failed`), and row V4's trigger appended after walking's; `bundle3d.ts`'s paper in walking's shape (`sheet`, `atTwin`, `atVisitor`, `kept`, and `keepPaper`); `scene.ts`'s frame loop (walking's step, then the sway and the figures' update), its walk controls, and `setQuality(next)`; the UI words (both sets), `ui-keys.ts`, `app.ts`'s imports and the room's parts (the walk control, then the stand-in line), `layout.ts`, `room.css`, and `frame-log.ts` (`walk`, then `figure` and `clip`); the telemetry contract's bullets; and `stage.ts` (`walk`, then `figures` and `waitMs`). The panel's id moved again, 77 being walking's "Visits that walked": the panel is 78. When walking's review added two commits, the branch moved onto that tip, a7c214a7, with `git rebase --onto refs/heads/feat/008-walking 87deda8f`: two conflicts, each kept on both sides: `layout.ts` (walking's walk help, hidden until walking, then the notes with the stand-in line) and the dashboard, where walking's commit wrote the file's eleven non-ASCII characters as `\u` escapes, as this branch's panel commit already had, so the panel commit's file was the merge (the two parse to the same JSON but the panel). Walking's final tip, 2ddf5e63, adds only walking's note to a7c214a7, and the branch moved onto it with `git rebase --onto refs/heads/feat/008-walking a7c214a7`, with no conflict.
- **The avatar's driver (T031 to T033, Phase 3, 2026-11-08).** As R-16 has it, with these departures. The avatar's driver is the controller's `driver` in `scene/avatars.ts`, not a function in `scene/figure.ts`, since it needs the controller's instance, mixer, and clips, and `scene/avatars.ts` stays its own chunk; `scene/figure.ts` gains the driver by picture, `figureDriverFor(cutout, figures)`, which asks each frame whether the visitor's avatar shows and rests the old driver before the new one takes the pose, and `scene.ts` gives walking that one driver, so `scene/walking.ts` and spec 008's tests don't change, and T032's cases are in `test/room/avatar-driver.test.ts` beside T031's rather than in `walking.test.ts`. The driver turns the picture group, which holds the avatar, about +Y to heading + π (glTF's +z faces heading 0's −z), keeps its scale positive and its height, so nothing mirrors or bobs; its first frame since a rest keeps the node's place and the group's turn, scale, and height, and `rest()` puts them back. The walk's weight is on or off by the pose's `walking`, not `min(1, speed / speed_mps)`: walking's poses move at the walking speed while they walk, except sliding along an edge, and the woman's and the man's sets have no walk clip (M21), so the blend by speed waits for a set that has one (backlog). The cut-out's driver doesn't change. Walking's review (a7c214a7) gave `FigureDriver` an optional `hold(item)` and the frame's `dt`: the driver by picture holds what walking's entry hands it and hands it again to the driver that takes over mid-walk; the avatar's driver puts the kept paper in its holding hand, or in its picture where it has none; so `scene.ts` gives walking `figureDriverFor(cutout, …)` with nothing around it. `dt` isn't read: the controller's `update` advances the clips each frame already. `bundle3d.ts`'s `keepPaper`, which walking's entry still calls for a driver with no `hold`, leaves the sheet where it is when it is anywhere in the visitor's picture, the avatar's holding hand included.
- **The review of Phases 1 and 2 (2026-11-08).** An agent that didn't write the code reviewed the branch on walking's tip; these changed with tests first. The kept paper: an avatar hides only its fallback's meshes, the picture group's children when the controller began, less the kept paper and any avatar, so a sheet walking moved into the picture stays visible; `dropPaper` finds the sheet wherever the avatar holds it and puts it back where it was before the hand took it, walking's picture or the scene's anchor. RK3's visitor term is the largest visitor folder other than the stand-in's, as RK5's first visit counts it, so the stand-in's folder, the largest, isn't counted twice (FR-038 says so now, and the report's line says "the largest other visitor avatar"). A clip parsed before its model is checked against the model's bones when the model arrives; and the bone check itself took `PropertyBinding.findNode`'s null for a found node, so no clip ever failed it at run time: both are fixed (FR-003). A figure whose avatar isn't ready when the hand-off starts says so, `late` (FR-035). The loader reads a figure file's parse gate again once it has a parse slot, and FR-022 says a parse already begun when the hand-off starts may finish, its avatar showing when the hand-off ends. `scene.ts`'s import of the avatar chunk has a catch of its own, so a failed chunk leaves the room's models loading and fetches no figure file.
- **The tests' files (T010 to T015).** §5.1 extends `schema.test.ts`, `compose.test.ts`, `budgets.test.ts`, `report.test.ts`, `data-only.test.ts`, `loader.test.ts`, `live.test.ts`, `degraded.test.ts`, and `a11y.test.ts`, which spec 008 extends too. To keep the stack's move clean, the new cases sit in new files beside them: `test/room/avatars-compose.test.ts` (T010's), `test/room/avatar-loader.test.ts` (T012's), and `test/ui/avatars.test.ts` (T013's and T014's, the frame log, the degraded states, axe with the line, and the note's CSS); `test/helpers/room-avatars.ts` builds the avatars' folders. The existing files change only where they pin what this spec changes.
- **Pins §5.4 missed (T010, T015).** Beside §5.4's list, these tests pinned today's state and change with the code that changes it: `bundle.test.ts`'s copy order, the 3D part's key order, and its `figures`; `vocabulary.test.ts`'s closed list of UI keys (34 with `twin.stand_in`); `compose.test.ts`'s rule catalogue (ten families, RA's leniency, RA5 a report); `disclosure.test.ts`'s "in the spec's own words" case, which now reads V1's Carries as spec 002's words and M6's; and `deploy/scripts/test_web_image.py`'s dev-cpu build, whose tree holds `assets/visitors/`. T024's `test_dashboard.py` pins §7.8's six panels the same way (T024 records it), and T023's run found `events.test.ts`'s beacon bodies, every kind once, which gains `avatar_failed`'s. Phase 1's `make check` found two more, both Python: `evals/test_disclosure.py`'s V1 case, which now reads V1's Carries as spec 002's words and M6's, as `disclosure.test.ts` does, and `scripts/test_makefile.py`'s dev-cpu web build line, which gains the `visitor-assets` context.
- **The 3D part's `figures` carries the twin's height (T016).** R-05 takes the twin's target height "from the 3D part's pieces", which carry no size, so `figures` gains `twin_height`, the twin figure's catalog `size.h` (1.75 m in the room).
- **Where the RA family runs (T017).** The checks run where main's caps hold `per_asset.avatar`, so they would bundle the avatar; without it nothing is bundled or refused, as before this spec. An existing case of `compose.test.ts` places unrecorded GLBs under `assets/visitors/` under room caps alone, to make `placeholders` false, and stays as it was. RA1 also refuses a record with another SHA-256, as RI7 does for a room model. RA4 gives one finding a file, naming each measure over its cap (F2 gives one a measure). RA5 is the report's line, never a finding, as RG8 is (`refuses: false` in the catalogue).
- **The figures' controllers (T019).** As §3.6 has them, with these readings: `update(dt, animate, level)` already holds the visitor's mixer at quality 1 or more (FR-027, R-17), since the level is its argument; T034 and T036 keep the setQuality wiring and the phone's tests. A model a figure can't place (a degenerate height) is refused by `model()` returning false, which the loader takes as a failed parse, so it retries and then records `failed`. A clip whose tracks name a bone the instance lacks counts as a failed clip at run time too (FR-003), beside RA2 at build time. The holding hand is sampled on a mixer of its own with the figure's clips stopped, so the sample starts from the rest pose. `stage.ts` declares `FigureSignal` (the picture's and clip's changes and each failed file), which the frame log and `avatar_failed` read, and `bundle3d.ts`'s `paper` exposes `kept`, the sheet the visitor keeps.
- **The loader's figures (T020).** R-03's `kind` on `ModelEntry` is read as `FigureEntry`, a `ModelEntry` with `figure: {avatar, role}` and its file's own key as its `piece` (`avatar:<id>`, `avatar:<id>:<role>`), so the loader's supersede, pending, and stop logic serves it unchanged; `figureEntries(part, chosen)` gives the entries beside `modelEntries`. `loadFigures(entries, fetched)` calls `fetched` once every figure file's fetch has ended, which the stage turns into the `figures` promise the room's models wait on; each avatar's clips wait for its model's fetch, and are skipped where it failed. An avatar model is readied by `prepare` with its key, and `avatar()` returning false is a failed parse. A figure file's failure doesn't set `fellBack`: the placeholder note is the pieces'. The decode cap rides `ImageOptions.maxSide`, and `ledger.ts`'s `capSides` is the one rule the image step and RK3 share.
- **The stage's wiring (T021).** `scene.ts` imports the avatar module with the loader, only where the 3D part bundles an avatar for a figure, and makes the controllers there; it reports `{kind: "failed"}` for each figure file the loader records `failed`, and the reason a figure keeps its fallback (`floor` below the floor, `2d` when the room leaves, `skipped`); the stand-in's idle sway stops while the twin shows an avatar, which has its own idle; a restored context resets the figures and calls `loadFigures` again beside the loader's `reload()`. `stage.ts`'s `SceneOptions.onFigure` carries the signals. The fake 3D chunk in `test/helpers/room.ts` needs no change: it records the options, `onFigure` among them; `test/room/avatar-scene.test.ts` (new) stages the real module for the requests, the swap, the floor, a failure, and the restore.
- **The note and the event (T022).** The stage's note becomes `div.room-notes`, absolutely placed at the stage's top left with `pointer-events: none`, holding the placeholder note and the stand-in line as two `p.room-note` paragraphs, so the existing `.room-note` lookups still find the placeholder note first and nothing in the 320 × 568 model moves; `text-copy.ts` needed no code, since `copy`'s fixed lines are drawn generically, and its header names the line. `a11y.test.ts` isn't extended: `test/ui/avatars.test.ts` runs axe with the line shown and checks the notes' CSS (absolute, so no height in the layout). The fixture set's `ui-words.yaml` gains `twin.stand_in` with the room's, since RT12 asks every set for every closed key.
- **The panel (T024).** §5.1 says `test_dashboard.py` needs no change, but its room-row case pins §7.8's six panels by title, so it gains "Visits whose avatar failed" (RED: 2 failed | 72 passed against the old contract and dashboard; GREEN: 74 passed), with a case of its own for the share's unit and description. The panel's title carries no "(FR-…)" note, which the test strips only when the note opens with FR or SC; the bullet names spec 009's FR-034. On the dashboard the row's second line takes five panels, the PDF stat, the 2D share, and the new share 4 columns each, the two charts 6 each, so no row below moves; spec 008's §7.8 panel meets it there when the stack is assembled.
- **Phase 1's measures (T027, 2026-11-08).** The release build's chunks at gzip level 9, the base (21a932f7, the chalkboard's tip with the spec, before the move) against this branch's 1e8de631: the entry 28,761 → 29,007 bytes (+246, the UI word, the copy's entry, the note, and the event's wiring), within spec 002's 150 KB; the 3D chunk 167,342 → 171,642 (+4,300, three's animation mixer among it); the loader's chunk 15,992 → 16,729 (+737); and the avatar module, a chunk of its own, 2,345: 7,382 bytes in all behind the choice, under the estimate of 10 to 20 KB. The index 4,758 → 4,800 bytes, within 16,384; the 3D part 5,708 → 5,753. The room's report on this branch, with no avatar file in the tree: "Scene texture memory: 159,185,237 of 200,000,000 bytes (models 157,985,452 · image cards 0 · avatars 0 · live-face canvases 1,199,785)", so the headroom for both avatars is 40,814,763 bytes, not the 41.4 million the spec's Assumptions read before the chalkboard's re-intake; "RK3's figures with the stand-in: the twin's figure counts nothing yet; the visitor's, nothing yet, the largest visitor avatar at 1024 px"; and "First visit with both figures' files (RK5): 6,593,757 gzip-9 bytes … against the phase-3 budget of 25,000,000". At texture_px 1,024, each 1,024-pixel square texture counts 5,592,405 bytes, so the two avatars fit with up to seven such textures between them (39,146,835); an eighth takes RK3 over, and a data edit to 512 quarters them.
- **Not tested first (T021).** `test/room/avatar-scene.test.ts` was written with T021's code, after it, so its RED isn't recorded; it covers what T012 and T013 name at the stage (the requests, the swap after the hand-off, the floor, a failed file, the restore), each of which T012's and T013's own tests held RED first at their layers.
- **The rigged hand-off (T030, Phase 2).** As R-10 has it, with these readings. The hand-off's start is the 3D stage's first `showHandoff` call, which runHandoff makes at once; from then until its end no figure file parses (the loader's `figureGate`, which the stage gives), and an avatar that becomes ready meanwhile waits for the end to show. `scene.ts` hands `showHandoff` to the controller where it exists, which sets the hand-off's two ends from the avatars' holding hands and draws with `bundle3d.ts`'s `showHandoff`, unchanged, so the turns and the timing stay spec 002's. The paper's centre sits `PAPER_LIFT` above a holding hand at both ends, so the hand holds its lower edge, as the kept paper does (R-09); SC-006's 2 cm is read at that edge. Before the hand-off the twin's avatar plays "idle-holding" with the sheet in its hand. Under reduced motion "take" doesn't play, since FR-020 lets the pose change only by cuts at the start and the end. The wait is `app.ts`'s, as R-10 places it: `Stage3D.figures` and `Stage3D.waitMs`, the scene's wait_ms, raced from the mount; with no promise (the 2D room, the stand-in 3D chunk) the hand-off starts at once, as before, synchronously. Phase 2 changes three of Phase 1's own tests with its timing: `avatars.test.ts`'s quality case (the twin holds "idle-holding" before the hand-off), `avatar-scene.test.ts`'s swap case (the avatars now show within the wait, before the start), and the gate case's clip, which needs its model in the same call.
- **RK3 and the report (T017).** RK3's stand-in term counts every GLB in the stand-in avatar's folder at its decoded size, as the visitor term counts the largest other folder (since the review), an upper bound. The report's F3 view leaves out `assets/animations/`, which the compositor never reads (contracts/room-data-files.md §1), and says so.
- **The intake's gate, F1: the runners' history kept from Prettier (`fix/009-avatars-ready`, 2026-11-09).** Not this plan's work, but the intake's gate fails without it: the Author's readiness evidence, two product runs and two red-team runs committed in `main`'s e324771e, is `evals/run.py`'s and `redteam/run.py`'s `json.dumps(record, indent=2)`, which `make lint`'s `prettier --check` refuses (it puts short arrays on one line), and every later run would write the same. Nothing reads their bytes: `evals/twin_readiness.py` reads each as JSON (`json.loads`) and hashes none, and the gateway and the room's build read `evidence` as a list of path strings. So `.prettierignore` lists `evals/*/history/` (every suite `evals/run.py` writes, `agent-config`'s already listed) and `redteam/history/` as machine-written records, as spec 011 listed its goldens; the four files stay byte for byte as the runs wrote them. Checked with a probe file in `json.dumps(…, indent=2)`'s form, which Prettier reformats under no ignore file and skips under this one.
- **The intake's gate, F2: the tests compose as the build does (2026-11-09).** A test-harness fix, not a loosened check. Since spec 007 the site's build composes with `readiness: twinReadiness(tree)` (`build/room/plugin.ts`), and `test/helpers/room.ts`'s `repositoryBundle` composed with none, so once e324771e made four topics ready, `test/room/chunk.test.ts` (6) and `test/room/dist.test.ts` (2) held the built site to a compose the build never made: `"ready": false` against the manifest's `true`, and the index's and the 3D part's digests apart. `repositoryBundle` now takes `readiness`: `tree`, the tree's own, exactly as the plugin composes, which the two files ask for, so their digests and `ready` values follow whatever the Author's readiness file marks; `none`, the default, nothing ready, which `roomContent()` and `roomIndex()` name and `test/ui/talk.test.ts`'s floor asserts. No test pins the file's live readiness, and every assertion stands as it was.
- **A pin §5.4 missed, at the intake's gate (F3, 2026-11-09).** `apps/web/test/smoke.test.ts`'s "takes the room's models from its own origin …", in the release and the drafts build, listed `dist/a/` as compose()'s models and cards alone, so the intake's eight avatar files, whose copies T018 writes beside them, took it from 21 copies to 29: the pin FR-043 forbids ("so an intake changes no test"), and §5.4's table, which names `dist.test.ts`'s `a/` case, missed its twin here. The test now expects compose()'s models and cards and each avatar file compose() bundles from the tree's `assets/visitors/<id>/` folders, each copy's plain file checked to be in its avatar's folder: computed from the tree, so the dog's or the dinosaur's intake changes nothing in it. It composes with the tree's readiness, as F2's tests do.
- **The intake's gate, F5: the gates' A10 test, a patch for the Author (2026-11-09).** Not this plan's work either, and not an agent's file: `tools/gates/test/test_arrival_check.py`'s `test_a10_passes_p1s_own_file_whose_comments_show_ready_true` reads the live `config/twin-readiness.yaml`, commits it on a branch, and asserts no A10; since e324771e that file marks topics ready, so A10 rightly refuses it, and every gate's `test` step fails on `main`'s own tree. `tools/gates/**` is human-only, so the fix is `docs/merge-requests/2026-11-09-fix-009-gates-a10-test.patch`, built from plain copies (`git show refs/heads/main:…` into a scratch folder, the copy edited, `git diff --no-index`): the test reads P-1's file as its commit 69ab1428 created it, nothing ready and `ready: true` in a comment, as a fixture in the test, so it tests what it says and no longer the Author's live marks. The Author applies it on `main` as his own commit before the gate.
- **The holding hand counts the fingers (F4, 2026-11-09).** The intake's note found that the studio's woman and man close only their left hands' fingers in "idle-holding" (15 channels of 171 differ from the idle's, all `LeftHandIndex1` to `LeftHandThumb3` rotations) and move no hand bone, so R-08 as written read a tie and took the right hand, while "take" reaches with the left. The Author's answer, recorded in spec.md's Clarifications in his words, amends FR-018 and R-08: `scene/avatars.ts`'s `findHand` reads, for each hand, the world positions of its hand bone and every bone under it (`isBone`, since the review of 70b3c563, nit 1: the kept sheet the holding hand carries after the hand-off is no bone, so a late "idle-holding" never counts it) in the tree's order at each clip's first frame, and a hand's motion is their distances summed (`handMotion`); the right still takes a tie, the nearer hand with no "idle-holding" is still read from the hand bones alone, and nothing is set as data (D2 stands). Tests first: `test/room/avatar-hands.test.ts` (new) gives the controllers each avatar the repository's bundle holds a model, an idle, and an "idle-holding" for, computed from the tree's `assets/visitors/<id>/` (FR-043), and expects the hand whose bones alone "idle-holding" sets apart from the idle, read from the clips by name, so the left for the woman and the man; `test/room/avatars.test.ts` adds a fixture skeleton with index fingers (`test/helpers/glb.ts`'s `FINGER_BONES`, `fingerTracks`): one hand's fingers alone closing, either side, and the right hand's fingers closing while the left hand drifts 5 mm, the right holding. RED: 4 failed, 18 passed; GREEN: the five avatar files, 49 passed.

## Constitution Check (post-design)

Re-checked after §1 to §5: the design adds no flow beyond the avatar requests and `avatar_failed`, both disclosed before or with their commits (I); every FR has a test or an Author's run, and the event has its panel (II); the order keeps code behind the Author's approval and merges behind `feat/008-walking` (III); nothing is widened, and the arrival check's patch is left to the Author (IV); the cost stays at $0 for models, the bytes measured and bounded (V); the stand-in is said plainly and a likeness can't take its place (VIII). **PASS**, with the spec's one named deviation.

## Consistency Check (the `/speckit-analyze` pass, 2026-11-08)

A read of spec.md, this plan, and tasks.md against each other and the constitution, made before any code. What it found, and what was done in these documents:

| ID | Severity | Where | Finding | Resolution |
|---|---|---|---|---|
| A1 | HIGH | spec.md FR-036; tasks, Phase 1 | Row V1 must land in the change that first serves the avatars, but the draft put the disclosure's commit (T023) beside the copies (T018) and the web image (T025) with no order, so a copy could ship before its row | T023 now precedes T018 and T025 in the dependencies, and §4.2's lane D says the disclosure lands before the flow |
| A2 | MEDIUM | spec.md FR-022 and Q4; plan R-10 | FR-022 forbids parsing during the hand-off and FR-019 parses before it, which reads as a contradiction across phases | FR-022 states the gate (before the hand-off only within the wait; Phase 1 after it ends), and D4 names Phase 1's timing |
| A3 | MEDIUM | spec.md RK3; plan §4.1 | RK3's stand-in term could fail `main` depending on which branch merges second | §4.1 shows both orders: the second branch's gate runs the full RK3 and RK5 with the files, and the intake alone stays inside F2's cap |
| A4 | MEDIUM | spec.md FR-043; plan §5.4 | The main session's brief asked where tests pin today's state; the draft named only the event list | §5.4 lists nine, with who changes each and when; T015 holds the branch's share, RED before the code |
| A5 | LOW | spec.md SC-012 | Its keyboard and screen-reader half is a human run with no task | The Author's L3, T045 |
| A6 | LOW | spec.md Terms | "stand-in shape", "capsule", and "fallback" could drift | Terms defines the fallback per figure; the requirements use "fallback" and name the capsule only where it helps |
| A7 | LOW | spec.md M14 | ADR 0010's text and `assets/README.md` are outside what agents may edit, so M14 has no agent task | M14 names them the Author's; T044's "For the Author" carries them with M13's F3 patch and ADR 0010's status line |
| A8 | LOW | spec.md SC-013, FR-041 | Phase 1's checkpoint can't claim the phone's figures | Phase 4 holds them (T034 to T039); the checkpoint's note says so |
| C1 | none | Constitution | No MUST is violated. Principle III's accepted-intent rule is a named deviation in the spec's Assumptions, with T000 holding all code behind the Author's acceptance and approval | – |

**Coverage**: every FR from FR-001 to FR-043 has at least one task, by its number or inside a named range (FR-042 is the Author's Phase A, T001 to T006; FR-043 is T015 with §5.4); every SC from SC-001 to SC-014 has a test task or an Author's run (SC-001's confirmation T038, SC-012's human half T045, SC-013 T039, SC-014 T003 to T006). No task lacks a requirement or story. **Metrics**: 43 FRs, 14 SCs, 48 tasks (T000 to T047), 11 of them the Author's, and two reviews by an agent that wrote none of the work (T005, T043); coverage 100%; 0 critical, 1 high and 3 medium (resolved), 4 low (resolved or recorded).
