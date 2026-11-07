# feat/004-us3-lookdev
Spec: [specs/004-room-composition/](../../specs/004-room-composition/) (Phase 4, User Story 3: T120 to T146) · Intent: [specs/004-room-composition/intent.md](../../specs/004-room-composition/intent.md) · Written by: implementer agent (Claude Opus 5.5), from the branch's commits, `git range-diff`, and the runs below · Date: 2026-10-27
Session: started from `/home/h4reet/h4reet-ai/h4reet-ai` (parked on `wip/park-2026-10-26b`); worked in the branch's worktree, `/tmp/claude-1000/wt-us3`, made fresh from e87d329 after `/tmp` was wiped. Repo hooks active: yes. The post-edit check refused an unused import in `scene.test.ts` mid-edit, and `.claude/audit/hooks.log` records this session's commands, for example `2026-10-27T02:41:08Z	bash	ALLOW	ls -la /home/h4reet/h4reet-ai/h4reet-ai/.claude/audit/ ...`. Each commit ran the arrival check (`arrival-check: 0 findings in 2 files`) and gitleaks (`no leaks found`).
Authorized by: tasks.md T120 to T142; plan.md §10's User Story 3 entries; the Author's first lookdev run (2026-10-23), whose four fixes are in plan.md §10; the main session's direction of 2026-10-26 for the restack review's nits and this note.

## 2026-11-07: restacked onto feat/004-studio-desk-sign (T147, T306)

`feat/004-us3-lookdev was 74c33e9d82c6f33e9249d627b65372bddc029a9c` (T147): 88 commits on 58c22d56c1a644604855ab02fdc76ea9a18a77d4, `feat/004-us1-composition`'s tip as recorded before its own rebase (T118), the commit this branch was cut from. This record is committed first, before the rebase, and is replayed with it; the rest of this section follows the rebase.

The rest of this note is as it stood at 74c33e9d, its SHAs the old ones.

**Status: reviewed twice, ready for the gate once line R's earlier merges land.** The T141 review's findings are fixed test first (commits tagged "lookdev review"). The restack review gave APPROVE with 4 nits. Three are fixed here: 7174157 (a, b) and 9d7b19e (c). The fourth is this note's record of the restack. `make check` ends with four FAILs, and none comes from this branch's code. Two were expected: policy (spec 002's web patch, M9) and test (4 compose-policy cases from the same patch; 2,644 others pass). Two were not, and both come from the machine: githooks-check and toolchain-check (For the Author, item 5). See Verification. T140, the agents' build of the phone copy, waits for the agents' engine, so this note has no SHA-256 for the copy yet (For the Author, item 1).

## Runs in the Author's terminal

Read these in order. Nothing here runs before step 1's merges, except the probe (step 3), which needs nothing from line I.

1. **Merges that come first, not this branch's.** Line R merges after M8, M9, and P-10, and after User Story 1 (`feat/004-us1-composition`, T118 and T119). Then this branch is rebased onto `main` (T147, by the agents) and gated (T148, by you).
2. **The rebase (T147), by the agents.** After T119 the agents record the tip first, as `feat/004-us3-lookdev was <sha>`, then run `git rebase --onto refs/heads/main <US1's tip as recorded before its own rebase (T118)> feat/004-us3-lookdev`. Today that commit is 58c22d5, the US1 tip this branch now stands on. They re-run `make check ENGINE_MODE=none-yet` and `npm run room:report -w apps/web` and append both to this note. You don't run it.
3. **The phone copy: `apps/web/Dockerfile`'s new target, `lookdev-phone`.** The target is drafts-only and sits before the runtime stage, which stays the last stage and the default. `web_image.py` passes no `--target`, so no image holds the copy (T129, T139; contracts/lookdev.md §7.1 and §8, layer 5). You build the copy in your terminal, from main's checkout, by commit SHA:

   ```text
   git --no-replace-objects archive <sha> | docker build -f apps/web/Dockerfile --target lookdev-phone --output type=local,dest=$HOME/lookdev-<date> -
   ```

   `<sha>` is the branch's full commit SHA. Until T140 runs, take this note's commit (the tip). The folder holds one file, `lookdev.html`. The working tree's `apps/web/dist-phone/` never goes to the phone.
4. **The Author's runs, T143 to T145, in this order.**
   - **T143, the probe, first, with no model** (FR-069; contracts/lookdev.md §7.3 steps 1 to 5). Pause camera-roll backup, gallery sync, and file sync, and turn location off. Build the copy as in step 3. Check `lookdev.html`'s SHA-256 against this note's (a mismatch ends the session; see For the Author, item 1). Copy only that file over a USB cable as a file transfer, with USB debugging off. Unplug the cable, turn airplane mode on, open the file from the phone's file manager, and read the probe's verdict. If it stops, delete the copy; T146 follows.
   - **T144, the desktop run** with the studio's desk and one sign. It waits for M6 (T030) and M9 (T048): `make up ENV=dev REF=<this branch's commit>` is Heavy, so run it when no agents are running. Scrub each studio file with `make assets-scrub FILE=<file>`, then open `http://127.0.0.1:18105/lookdev/`. Since the Author's first run, an unscrubbed export is measured and swapped in as a preview (55c3c44), but the hash to approve is the scrubbed file's.
   - **T145, the phone run, preliminary** (contracts/lookdev.md §7.3, all nine steps). It waits for M6 (T030), since it needs the scrubber. The results JSON goes into this note with the phone's model and the probe's viewport and pixel ratio. The look is chosen on the whole-vignette runs, T193 and T287 (FR-070, as clarified on 2026-10-23).
5. **The gate and the merge (T148), by you.** Once T147 has run, run `tools/gates/gate feat/004-us3-lookdev` from main's checkout, then the merge command it prints. This branch changes `deploy/scripts/test_web_image.py` (T129's tests of the Dockerfile) and nothing under `.claude/`, `evals/agent-config/`, `tools/gates/`, or `Makefile`.

## What changed and why

The lookdev page, in drafts builds only, and its single-file phone copy. The page runs the room's own 3D part, look, loader, and quality controller on one canvas. It frames the room at the reference desktop's and reference phone's stages, and at the desk close-up. It shows a vignette of the work area, switches looks and sample states, loads a candidate model per piece, and runs 2- or 10-minute measurements whose results go into a note (User Story 3; FR-066 to FR-071). Under it, the room gains what the page needs and visitors will use once a model is set: R-28's loader, the texture ledger, the GLTFLoader image step with no object URL, the quality controller's holds and R-35's levels, ADR 0010's model floor, and spec 003's asset events.

The branch is 86 commits on 58c22d5, User Story 1's tip: 69 files, 11,169 insertions, 96 deletions. 64 files are under `apps/web/`; the others are `.dockerignore`, `.gitignore`, `deploy/scripts/test_web_image.py`, plan.md, and tasks.md.

### The restack onto User Story 1's tip

`feat/004-us3-lookdev was c2d411d`, which is kept as `wip/004-us3-lookdev-pre-restack`. It stood on f432cae, an older US1 tip. US1's T112 then removed the spec 002 code that US3's T134 had wired the loader into. The branch was rebased onto US1's tip, 58c22d5: `git range-diff f432cae..c2d411d 58c22d5..<tip>` pairs all 79 commits. Eight picks conflicted (each pick replayed with `git merge-tree` on its new parent confirms it). Three more differ only in context (f937b63, ce24865, 07e8aea). The eight, and how each was resolved:

| # | Pick (before → after) | File | Resolution |
| --- | --- | --- | --- |
| 1 | b49bba6 → cfa05d5 (T136's candidate) | `specs/004-room-composition/plan.md` | §10 keeps both lines' entries: US1's (the 2D fallback, the runtime's nits, M9 before M8), then US3's ("A candidate's RK2, and RX3's `uri`"). |
| 2 | 8b00140 → de471e7 (T134, the loader) | `apps/web/src/room/scene.ts` | US1's imports (spec 002's avatars, `framing.ts`, and the object IDs gone; `bindPointerSelection` and `LabelFactory` kept) with US3's `capability`, `meetsModelFloor`, ledger, and loader imports. US1's `ink.prepare(room.scene)` stays after `createInk`. |
| 3 | 249d309 → c35f500 (T139, the docs) | `apps/web/README.md` | US3's phone-copy row, and US1's `room:generate` row, which replaces the `manifest` row that US3's commit stood on. |
| 4 | 24b04b1 → f288606 (runtime-7's test) | `apps/web/test/room/scene.test.ts` | Both header comments, US1's T112 and US3's T141, and both import sets. |
| 5 | 1dcdb4d → cc6ef0b (runtime-5's fix) | `apps/web/src/room/app.ts` | US1's import list without `isObjectId, objectById`, and US3's `capability` and `meetsModelFloor` in place of `hasWebGL2`. |
| 6 | fcc9424 → 740693b (runtime-6's test) | `apps/web/test/room/scene.test.ts` | US1's `VISITOR_TURN` import beside US3's `readImage`. |
| 7 | 2291cb7 → 4d1f675 (runtime-3's test) | `apps/web/test/helpers/room.ts` | US1's `room?: RoomIndex` and US3's `index?: RoomIndex` name the same option. The restack kept both as aliases (`options.room ?? options.index ?? roomIndex()`). The restack review's f6446dd then dropped `index`, and `loader.test.ts`'s six calls pass `room`. |
| 8 | d8812fc → 5d46c01 (runtime-3's fix) | `apps/web/src/room/app.ts`, `apps/web/src/room/scene.ts` | app.ts's header keeps US1's "Every selectable ..." line with US3's FR-071 line. The move to 2D keeps US1's `if (flat) show(flat); else room.view.replaceChildren();`, then US3's loop that records each set model skipped, then `flat?.showHandoff(...)`. scene.ts keeps US3's `assetEvent` import among US1's. |

Four commits follow the restack, each from what it exposed:

- **54f0710, the FR-007 scan.** US1's committed-tree scan (T107, T112) refuses the literal `"busy-sign"`, which appears twice in `test/lookdev/page.test.ts` at 3c2b6d9. The tests now take the busy sign from the data, by its lettering face. **For a bisect:** 3c2b6d9 fails the FR-007 scan, and so `make check`, until 54f0710. So does every commit back to 31da653 (page-1's RED), which brought the literal in. `npm run room:scan -w apps/web` gives 0 hits at 31da653^, `FR-007 apps/web/test/lookdev/page.test.ts:442: holds "busy-sign", which only the room's data defines` at 31da653, two hits (lines 561 and 957) at 3c2b6d9, and 0 hits at 54f0710.
- **f6446dd**: one name for the helper's option (resolution 7).
- **e6ccb3b (RED) and 7330004 (GREEN), the ink fix.** US1's review fix (T116, R3) shares inked cel's line parameters once through `ink.prepare`, where `render` used to walk the scene on every frame. US3's loader, rebased onto it, never called it, so a swapped-in model kept OutlineEffect's default thickness, and the lookdev stage never called it at all. Now the room's 3D stage prepares each model it swaps in. The lookdev stage prepares the room it first builds, each room a look change rebuilds, and each model it swaps in.
- **e87d329**: T120 ticked.

### The restack review's nits, fixed here

- **a and b (7174157).** Deleting the lookdev stage's first `ink.prepare` (`src/lookdev/stage.ts`) failed no test, and the 3D stage's test held the models' line parameters only to `toBeDefined()`. Now the page test, before any look is chosen, holds every mesh of the set on the "Reference phone" view to `outlineThickness(width, 740)`. The scene test sizes the canvas to 800 × 500 and holds the one set to `outlineThickness(width, 500)`. Both pass on e87d329; they tighten rather than find a fault, so no GREEN commit follows. Mutation runs show they bite. Without that first `ink.prepare`, the page test fails: `expected undefined to deeply equal { thickness: 0.004761904761904762 }`. Without `scene.ts`'s `ink.setStageHeight(h)`, the scene test fails: `expected { thickness: 0.0046875 } to deeply equal { thickness: 0.006 }`.
- **c (9d7b19e).** `look.ts`'s `Ink.prepare` comment and plan.md §10's "The runtime's nits" said a model swaps in "(User Story 4)". The swaps that call it are User Story 3's: `scene.ts`'s loader and the lookdev stage. The bullet now also says the lookdev stage prepares each room it builds and each model its loader swaps in.
- **d**: this note's record of the restack, above.

## Acceptance criteria

Quotes are from [spec.md](../../specs/004-room-composition/spec.md); the parts left open name the task that closes them.

- **FR-066 (met).** "THE LOOKDEV PAGE AND THE FIXTURES SHALL be built only into drafts builds." The five layers of contracts/lookdev.md §8 are tested (T121, T125, T129). The release build has no `lookdev/`, no marker, no fixture name, and no draft text. The phone copy's target is in no image.
- **FR-067, FR-068 (met on the page; the Author's runs judge).** The page loads a candidate per piece, reads it with `arrayBuffer()` alone, shows its SHA-256 (T124, against Node's), its mark or "not scrubbed", and the compositor's own findings (T122). It runs the readouts and the results block (T123, T137).
- **FR-069 (built; the probe is T143).** The phone copy is one file under a policy that allows no request, with the probe first (T125, T138).
- **FR-055 to FR-057, FR-071 (met).** R-28's loader with the floor, holds, retries, the ledger, and one asset event per outcome, including a room already in 2D (T126, T127, T128, T132 to T134; T141's runtime-1 to runtime-7).
- **FR-070, SC-005, SC-006, SC-010 (wait).** These wait for the Author's runs: T143 to T145 are preliminary, and the look is chosen on T193 and T287.
- **FR-073 (met).** The report is under Measurements.

## Constitution check

| Principle | Touched? | How it complies |
| --- | --- | --- |
| I. Data-local by default | Yes | The page and the copy make no request (tested with spies on every request and storage global). A candidate stays in page memory. Asset events stay queued in page memory while `live.asset_events` is `off`, which is the setting today; the `site` path is spec 003's existing beacon. |
| II. Production-grade or not shipped | Yes | Tests first (RED and GREEN below). $0 at run time. The loader degrades to stand-ins below the floor, past the texture cap, or on a failed fetch, and records each outcome. |
| III. Intent before spec, spec before code, humans merge | Yes | tasks.md T120 to T142. Departures are in plan.md §10. This branch is committed locally, not merged. |
| IV. Least privilege for humans and agents alike | Yes | No permission, sandbox domain, deny, or human-only path changes. |
| V. Cost is a first-class signal | Yes | No model call. Lookdev runs locally. |
| VI. Build in public, including failures | Yes | The RED runs, the scan failures that 3c2b6d9 leaves for a bisect, and both reviews are in this note. |
| VII. Own the whole product, and say exactly what you owned | Yes | This note makes no claim about the Author's role or the agents' share of the work. |
| VIII. Honest AI | Not touched | — |

## Security and agent governance

Nothing under `.claude/`, `tools/gates/`, `REVIEW.md`, `CLAUDE.md`, `.specify/memory/constitution.md`, `corpus/`, `infra/`, `evals/agent-config/`, or `docs/data-flow-disclosure.md` changes (`git diff --name-only 58c22d5..<tip>`). `deploy/scripts/test_web_image.py` gains T129's tests of the Dockerfile's layer-5 rule, including a `RUN --mount` from the copy's stages (phone-5). The phone copy's policy allows no request, every `url()` is a `data:` URL, and its script calls neither `eval` nor `Function` (T125). The copy is built by commit through `git --no-replace-objects archive`, never from a working tree.

## Cost and data-flow impact

**Cost:** $0 at run time; no model call or endpoint. The loader is a chunk of its own, imported only when the 3D part sets a model, so today's site loads nothing new.

**Data flow:** no new flow. The lookdev page and the copy are drafts-only and make no request. Spec 003's asset events go through its existing beacon only when `live.asset_events` is `site`.

## RED and GREEN

The RED commits and what their messages record:

| Task | RED commit | What the RED run showed (from the message) | GREEN commit |
| --- | --- | --- | --- |
| T127 | 63c587f | 10 failed, 26 passed (`hold`, `capability`, `meetsModelFloor` missing). | e8e92c8 |
| T126, T133 | 1ff18c0 | `src/room/scene/gltf-images` doesn't exist. | 4a20907 |
| T133 | 5bec4f4 | 1 failed, 21 passed. | d603cec |
| T124 | 389053a | `src/lookdev/sha256` doesn't exist. | 0a2ad75 |
| T128 | 7f3f341 | `src/asset-events` doesn't exist. | c7ba2c7 |
| T122 | e38ada7 | The module doesn't exist. | cfa05d5 |
| T123 | a647f7d | Neither module exists. | f937b63 |
| T121 | 585d13c | The drafts build has no page. | ce24865 |
| T131 | 6967a7d | No count. | ce24865 |
| T126, T134 | dec0cca | There is no `src/room/scene/loader.ts`. | de471e7 |
| T135 | d0ae83c | There is no `src/lookdev/page.ts`. | 07e8aea |
| T135 | 84059c4 | No count. | fbffb2a |
| T125, T129 | 227683a | vitest: the modules are missing; pytest: 5 failed, 57 passed. | ac42cfd |
| Lookdev review page-1 | 31da653 | The monitor's screen quad shows in the room scene. | a76f701 |
| page-2, phone-1 | 9ca3e10 | Every error is caught as "needs WebGL 2"; the frame loop runs on. | 989f026 |
| page-3 | 32395e3 | The run ends at 600 s with results from its first 30 s. | f7dca90 |
| page-4, phone-2 | 5701551 | The copy calls a desktop's stage "Reference phone". | 385ac75 |
| page-6 | d75c585 | The rejection is unhandled; a stale read swaps in after Clear. | e749904 |
| page-7 | 6f08ae7 | The run starts at level 2. | bddb188 |
| page-8 | 6a65d16 | Reads "0 of 96,000,000 bytes" beside the run's draw calls. | 891de6b |
| page-9 | 6fc53d1 | 1,198 sorts. | 65c5449 |
| page-10 | 2a1117a | The page reads the whole file; `startsAsGlb` doesn't exist. | bee0a9e |
| phone-4 | 8dc04d2 | The plugin deletes the `.wasm` silently. | dd1840c |
| phone-5 | f0929c0 | The check reads `COPY --from` and `FROM` alone. | fc0f18f |
| runtime-2 | e0a292b | No count (a second event; a release called twice). | c07c9de |
| runtime-1 | 9f3089b | No count (the switch's model dropped). | 8258f23 |
| runtime-5 | bfc5e27 | No count. | cc6ef0b |
| runtime-6 | 740693b | No count. | 8f11348 |
| runtime-3 | 4d1f675 | No count. | 5d46c01 |
| The Author's first run: unscrubbed export | 30e51f8 | No count. | 55c3c44 |
| status line | 16bde79 | No count. | d28856e |
| probe heading | 8bd013d | No count. | 1c25087 |
| "Labels" | b59cc2e | No count. | 3c2b6d9 |
| Restack: the ink | e6ccb3b | No count. | 7330004 |
| Restack review nits a, b | 7174157 | Not RED: tightening tests, passing on e87d329, shown to bite by mutation (above). | none needed |

**GREEN at the tip:** `npx vitest run` gives 68 files and 1,802 tests passed.

**Test-first exceptions, said plainly.** Several messages give no failing count (marked above). 54f0710 and f6446dd are test fixes with no RED. 31da653 to 3c2b6d9 fail the FR-007 scan (see the restack). The 7174157 tests were never red against the code.

## Review

**T141, the lookdev review**, over the branch's diff before the restack. Its findings, page-1 to page-10, phone-1 to phone-5, and runtime-1 to runtime-7, are each fixed in commits tagged "lookdev review", RED first where code changed (table above). The readings are in plan.md §10's entries that cite "the lookdev review". T141 isn't ticked in tasks.md on this branch (For the Author, item 3).

**The restack review**, over the rebase onto 58c22d5 and the four commits after it: **APPROVE, 4 nits**, all fixed here (above).

## Measurements

### FR-073: the compositor's report at the tip

`npm run room:report -w apps/web` (release build; caps are FR-053's starting figures, since `main` has no room caps):

```text

> @h4reet/web@0.1.0 room:report
> node --import tsx build/room/cli.ts report

## Room report

Bundle e9b032de4adbdd7d · release build · caps: FR-053's starting figures: main has no room caps; every model stays a stand-in

| Piece | Placements | Source | Bytes | gzip-9 bytes | Triangles | Texture memory | Budget (gzip-9 · triangles · texture) |
|---|---:|---|---:|---:|---:|---:|---|
| `bicycle` | 1 | stand-in (no-model) | – | – | – | – | 1,500,000 · 30,000 · 5,592,405 |
| `busy-sign` at 1.5× | 1 | stand-in (no-model) | – | – | – | – | 150,000 · 1,500 · 1,398,101 |
| `chalkboard` at 1.25× | 1 | stand-in (no-model) | – | – | – | – | 300,000 · 1,000 · 5,592,405 |
| `charger` at 2× | 3 | stand-in (no-model) | – | – | – | – | 100,000 · 1,000 · 87,381 |
| `desk-screen` at 1.2× | 1 | stand-in (no-model) | – | – | – | – | 600,000 · 6,000 · 5,592,405 |
| `dog-sign` at 1.5× | 1 | stand-in (no-model) | – | – | – | – | 150,000 · 1,500 · 1,398,101 |
| `laptop` | 1 | stand-in (no-model) | – | – | – | – | 400,000 · 5,000 · 1,398,101 |
| `laptop-stand` | 1 | stand-in (no-model) | – | – | – | – | 200,000 · 2,000 · 1,398,101 |
| `neon-sign` at 2.6× | 1 | stand-in (no-model) | – | – | – | – | 300,000 · 4,000 · 1,398,101 |
| `room-shell` | 1 | stand-in (no-model) | – | – | – | – | 800,000 · 2,000 · 11,184,810 |
| `snowboard` | 1 | stand-in (no-model) | – | – | – | – | 400,000 · 3,000 · 5,592,405 |
| `twin-figure` | 1 | avatar | – | – | – | – | 1 · 1 · 1 |
| `visitor-figure` | 1 | avatar | – | – | – | – | 1 · 1 · 1 |
| `wall-art` | 1 | stand-in (no-model) | – | – | – | – | 400,000 · 500 · 5,592,405 |
| `wall-window` | 1 | stand-in (no-model) | – | – | – | – | 300,000 · 2,000 · 1,398,101 |
| `window-view` | 1 | stand-in (no-model) | – | – | – | – | 500,000 · 2,000 · 5,592,405 |
| `work-desk` | 1 | stand-in (no-model) | – | – | – | – | 600,000 · 6,000 · 5,592,405 |

Per piece, the largest against the caps: 0 of 2,500,000 gzip-9 bytes; 0 of 40,000 triangles.
Scene texture memory: 59,472,270 of 96,000,000 bytes (models 58,807,632 · image cards 0 · avatars 0 · live-face canvases 664,638).
The twin's and the visitors' avatars have no file under assets/ yet, so they count 0.
First visit, the room's share: 0 gzip-9 bytes of placed models and cards, beside the design's estimate of 12,000,000; the enforced limit is spec 003's phase-3 first visit, 25,000,000. Spec 003's F3 view, every file under assets/room/: 0.

| Face | Readable | Desktop | Phone | Floor | Margin | Status |
|---|---|---:|---:|---:|---:|---|
| `neon-sign.word` | yes | 17.0 px | 10.7 px | 9 | 1.7 px | readable |
| `neon-sign.call` | yes | 11.2 px | 7.1 px | 9 | -1.9 px | exempt on the phone, carried by the text copy's "Around the room" |
| `neon-sign.visit` | yes | 11.2 px | 7.1 px | 9 | -1.9 px | exempt on the phone, carried by the text copy's "Around the room" |
| `neon-sign.second-line` | no | 5.9 px | 3.7 px | 9 | -5.3 px | atmosphere (max 43) |

Side-wall selectables (FR-064): the room draws no pick area for them at the stages named, and the "In the room" list reaches them.

| Selectable | 3D | 2D |
|---|---|---|
| `snowboard` (left-wall) | list-only at 304 × 208 and 38 others | list-only at 304 × 208 and 145 others |
| `chalkboard` (left-wall) | list-only at 304 × 208 and 1113 others | list-only at 304 × 208 and 1611 others |

| Switch | local | cloud | resting | budget | unavailable | unknown | paused | not-live |
|---|---|---|---|---|---|---|---|---|
| `laptop-power` | `plugged` | `unplugged` | `resting` | `resting` | `resting` | `resting` | `resting` | `resting` |

| Switch | Poses | Desktop | Phone | Status |
|---|---|---:|---:|---|
| `laptop-power` | `plugged` / `unplugged` | 32.9 px | 20.7 px | apart |
| `laptop-power` | `plugged` / `resting` | 148.8 px | 94.1 px | apart |
| `laptop-power` | `unplugged` / `resting` | 134.7 px | 84.9 px | apart |

Findings: none.
```

## Verification

Run from `apps/web` in the worktree, at 9d7b19e (the tip before this note; the note changes only Markdown and tasks.md):

```text
npx vitest run                    Test Files  68 passed (68) · Tests  1802 passed (1802) · exit 0
npx tsc --noEmit -p .             exit 0
npx eslint --max-warnings 0 .     exit 0
npx prettier --check (repo root, the changed files)   All matched files use Prettier code style!
npm run room:check -w apps/web    room: 0 findings in 0 files · exit 0
npm run room:scan -w apps/web     room: 0 hits · exit 0
```

**`make -f Makefile check ENGINE_MODE=none-yet`** from the worktree's root, whole:

```text
== makefiles-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/makefiles_check.py
makefiles: GNUmakefile holds only its include, and there is no makefile
-> PASS makefiles-check
== githooks-check
reference-transaction: installed
pre-commit: missing or modified: run make git-hooks
main: a loose ref, which the git hook guards
make[1]: *** [Makefile:165: githooks-check] Error 1
-> FAIL githooks-check
== toolchain-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/toolchain_check.py
tool                     pinned   found    status  where
node                     24.21.0  24.21.0  OK      /home/h4reet/.nvm/versions/node/v24.21.0/bin/node
uv                       0.8.22   0.8.22   OK      /home/h4reet/.local/bin/uv
ruff                     0.16.10  0.16.10  OK      /home/h4reet/.local/bin/ruff
gitleaks                 8.30.1   8.30.1   OK      /home/h4reet/.local/bin/gitleaks
python3                  3.12     3.12.3   OK      /usr/bin/python3
shellcheck               0.9.0    0.9.0    OK      /usr/bin/shellcheck
jq                       1.7      1.7      OK      /usr/bin/jq
pytest                   9.1.1    9.1.1    OK      /home/h4reet/.local/bin/pytest
pyyaml (pytest's)        6.0.3    6.0.3    OK      /home/h4reet/.local/share/uv/tools/pytest/bin/python3
claude code              2.1.296  2.1.311  DRIFT   /home/h4reet/.nvm/versions/node/v22.18.0/bin/claude
lint: eslint             10.12.0  10.12.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/eslint
lint: typescript-eslint  8.71.1   8.71.1   OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript-eslint
lint: typescript         6.0.3    6.0.3    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript
lint: prettier           3.9.9    3.9.9    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/prettier
lint: node               24.21.0  24.21.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node
toolchain-check: 1 of 15 differ from their pins (claude code); see tasks.md T013
make[1]: *** [Makefile:141: toolchain-check] Error 1
-> FAIL toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
make[1]: *** [Makefile:162: policy] Error 1
-> FAIL policy
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/tmp/claude-1000/wt-us3"
validate-config: 0 errors, 0 notes
-> PASS validate-config
== lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
313 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-us3/services/gateway


 Test Files  51 passed (51)
      Tests  789 passed | 12 skipped (801)
   Start at  20:38:58
   Duration  74.21s (tests 95%, import 3%, transform 2%)


> @h4reet/web@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-us3/apps/web


 Test Files  68 passed (68)
      Tests  1802 passed (1802)
   Start at  20:40:12
   Duration  29.06s (tests 72%, import 20%, transform 8%)

pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  2%]
........................................................................ [  5%]
........................................................................ [  8%]
........................................................................ [ 10%]
........................................................................ [ 13%]
........................................................................ [ 16%]
........................................................................ [ 19%]
........................................................................ [ 21%]
........................................................................ [ 24%]
........................................................................ [ 27%]
.........................................................F..........FFF. [ 29%]
........................................................................ [ 32%]
........................................................................ [ 35%]
........................................................................ [ 38%]
........................................................................ [ 40%]
........................................................................ [ 43%]
........................................................................ [ 46%]
........................................................................ [ 48%]
........................................................................ [ 51%]
........................................................................ [ 54%]
........................................................................ [ 57%]
........................................................................ [ 59%]
........................................................................ [ 62%]
........................................................................ [ 65%]
........................................................................ [ 67%]
........................................................................ [ 70%]
........................................................................ [ 73%]
........................................................................ [ 76%]
........................................................................ [ 78%]
........................................................................ [ 81%]
........................................................................ [ 84%]
........................................................................ [ 87%]
........................................................................ [ 89%]
........................................................................ [ 92%]
........................................................................ [ 95%]
........................................................................ [ 97%]
........................................................                 [100%]
=================================== FAILURES ===================================
____________________ test_the_breach_probe_meets_the_policy ____________________

    def test_the_breach_probe_meets_the_policy() -> None:
        """The probe (tasks.md T144): built from this tree on the pinned base:python, on internal alone, and disclosed."""
        model = real_model()
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        assert cp.check_service(PROBE, model["services"][PROBE], model, lock, REPO) == []
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        assert PROBE in disclosed
        # The policy requires its row, as every service's (FR-040).
        found = cp.check_model(model, lock, REPO, disclosed - {PROBE})
>       assert [(f.where, f.rule) for f in found if not f.planned] == [
            (f"{cp.COMPOSE_FILE} service {PROBE}", "disclosure")
        ]
E       AssertionError: assert [('deploy/com...'disclosure')] == [('deploy/com...'disclosure')]
E         
E         At index 0 diff: ('deploy/compose.yaml service web', 'image') != ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Left contains one more item: ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:894: AssertionError
_________________ test_the_real_compose_file_passes_as_written _________________

    def test_the_real_compose_file_passes_as_written() -> None:
        """The raw file, through PyYAML (short-syntax ports, anchors), meets every compose rule too."""
        model = yaml.safe_load((REPO / cp.COMPOSE_FILE).read_text(encoding="utf-8"))
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        found = cp.check_model(model, lock, REPO, disclosed)
>       assert [f for f in found if not f.planned] == []
E       AssertionError: assert [Finding(wher...sha256:...)')] == []
E         
E         Left contains one more item: Finding(where='deploy/compose.yaml service web', rule='image', detail='h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:951: AssertionError
___________________________ test_the_real_files_pass ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-16/test_the_real_files_pass0')
capsys = <_pytest.capture.CaptureFixture object at 0x7df63605e480>

    @needs_compose
    def test_the_real_files_pass(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
>       assert cp.run(tree) == 0
E       AssertionError: assert 1 == 0
E        +  where 1 = <function run at 0x7df635b96e80>(PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-16/test_the_real_files_pass0'))
E        +    where <function run at 0x7df635b96e80> = cp.run

tools/gates/test/test_compose_policy.py:965: AssertionError
----------------------------- Captured stdout call -----------------------------
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
___________________________ test_end_to_end_refusals ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-16/test_end_to_end_refusals0')
capsys = <_pytest.capture.CaptureFixture object at 0x7df6364b1be0>

    @needs_compose
    def test_end_to_end_refusals(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
        compose = tree / cp.COMPOSE_FILE
        # gateway-state's own networks line, the first after its name: it alone joins egress below.
        head, name, tail = compose.read_text(encoding="utf-8").partition(
            "  gateway-state:\n"
        )
        assert name and "networks: [internal]\n" in tail
        compose.write_text(
            head
            + name
            + tail.replace("networks: [internal]\n", "networks: [internal, egress]\n", 1),
            encoding="utf-8",
        )
        write(tree / "deploy/stray.env", "A=1\n")
        assert cp.run(tree) == 1
        out = capsys.readouterr().out
        assert (
            "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress"
            in out
        )
        assert "FAIL deploy/stray.env: env file" in out
>       assert "compose policy: 2 refusal(s)" in out
E       assert 'compose policy: 2 refusal(s)' in "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress, the stack's one route out (FR-04... 3 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)\n"

tools/gates/test/test_compose_policy.py:996: AssertionError
=========================== short test summary info ============================
FAILED tools/gates/test/test_compose_policy.py::test_the_breach_probe_meets_the_policy
FAILED tools/gates/test/test_compose_policy.py::test_the_real_compose_file_passes_as_written
FAILED tools/gates/test/test_compose_policy.py::test_the_real_files_pass - As...
FAILED tools/gates/test/test_compose_policy.py::test_end_to_end_refusals - as...
4 failed, 2644 passed in 151.79s (0:02:31)
make[1]: *** [Makefile:234: test] Error 1
-> FAIL test
== content-check
PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
-> PLANNED content-check (PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch)
== secrets
bash tools/gates/secrets.sh
secrets: gitleaks with /home/h4reet/h4reet-ai/h4reet-ai/.gitleaks.toml, over /tmp/claude-1000/wt-us3
== gitleaks: unstaged changes
8:43PM INF 0 commits scanned.
8:43PM INF scanned ~0 bytes (0) in 23.4ms
8:43PM INF no leaks found
-> PASS unstaged changes
== gitleaks: staged changes
8:43PM INF 0 commits scanned.
8:43PM INF scanned ~0 bytes (0) in 20ms
8:43PM INF no leaks found
-> PASS staged changes
== gitleaks: 351 commits since main (23731e14f137..HEAD)
8:43PM INF 351 commits scanned.
8:43PM INF scanned ~6456173 bytes (6.46 MB) in 478ms
8:43PM INF no leaks found
-> PASS 351 commits since main (23731e14f137..HEAD)
secrets: PASS (unstaged changes, staged changes, 351 commits since main)
-> PASS secrets
== evals
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite narration --adapter fake
PASS  narration-agent-watchdog-engineer
PASS  narration-agent-watchdog-non-engineer
PASS  narration-ai-strategy-engineer
PASS  narration-ai-strategy-non-engineer
PASS  narration-change-management-engineer
PASS  narration-change-management-non-engineer
PASS  narration-cht-agent-data-layer-engineer
PASS  narration-cht-agent-data-layer-non-engineer
PASS  narration-cht-agent-engineer
PASS  narration-cht-agent-non-engineer
PASS  narration-cht-codebase-engineer
PASS  narration-cht-codebase-non-engineer
PASS  narration-cht-docker-architecture-engineer
PASS  narration-cht-docker-architecture-non-engineer
PASS  narration-cht-skills-engineer
PASS  narration-cht-skills-non-engineer
PASS  narration-claude-medic-aws-engineer
PASS  narration-claude-medic-aws-non-engineer
PASS  narration-kenya-localization-engineer
PASS  narration-kenya-localization-non-engineer
PASS  narration-national-benchmarking-engineer
PASS  narration-national-benchmarking-non-engineer
PASS  narration-no-code-configuration-engineer
PASS  narration-no-code-configuration-non-engineer
PASS  narration-other-deployments-engineer
PASS  narration-other-deployments-non-engineer
PASS  narration-smart-task-prioritization-engineer
PASS  narration-smart-task-prioritization-non-engineer
PASS  narration-voice-for-cht-engineer
PASS  narration-voice-for-cht-non-engineer
evals narration (fake): 30 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
PASS  CLAUDE.md is 58 lines and 5901 bytes (at most 60 and 6 KB)
PASS  CLAUDE.md names the constitution as superseding it
PASS  REVIEW.md names the constitution as superseding it
PASS  role docs: tools match roles.expected
PASS  role implementer: tools match roles.expected
PASS  role ops: tools match roles.expected
PASS  role red-teamer: tools match roles.expected
PASS  role reviewer: tools match roles.expected
PASS  role spec-writer: tools match roles.expected
PASS  hook .claude/hooks/bash-gate.sh is registered for PreToolUse Bash
PASS  hook .claude/hooks/protected-paths.sh is registered for PreToolUse Edit|Write|MultiEdit|NotebookEdit
PASS  hook .claude/hooks/post-edit-check.sh is registered for PostToolUse Edit|Write|MultiEdit
PASS  hook .claude/hooks/subagent-report-check.sh is registered for SubagentStop (every subagent)
PASS  hook .claude/hooks/content-scan.sh is registered for PreToolUse Edit|Write|MultiEdit
PASS  FR-007: 27 of 27 variables denied by name
agent-config static: 0 failed, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/behavioral.py status
behavioral tier: 13 cases (10 enforcement, 3 conduct), 3 runs each; trigger hash 3f4caf1b916a
PASS  behavioral tier: 2026-10-12T184140Z-fix-000-gate-on-main-4907f2bf42e8 passed for trigger hash 3f4caf1b916a, the newest run for it
agent-config behavioral: pass, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py
PASS  every relative link resolves: 1361 links in 163 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 20 of 20
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 1361 relative links in 163 files
-> PASS evals
== redteam
python3 -I -B -X pycache_prefix=/dev/null redteam/run.py
PASS  benign-greeting (safe, clean)
PASS  planted-human-claim (unsafe, caught: claims to be human)
redteam: 2 passed, 0 failed
-> PASS redteam
== matrix
bash redteam/forbidden-actions.sh
KNOWN GAP   bash-gate.sh          make $(printf 'aws-%s' login) ENV=prod
KNOWN GAP   bash-gate.sh          t=aws; make "$t-login" ENV=prod
KNOWN GAP   bash-gate.sh          bash deploy/scripts/aws-l?gin.sh
KNOWN GAP   bash-gate.sh          gh pr \<newline>merge 1
KNOWN GAP   bash-gate.sh          make $'aws\x2dlogin' ENV=prod
KNOWN GAP   bash-gate.sh          python3 -c "import importlib; importlib.import_module(\"evals\" + \".run\").main()" --adapter bedrock
KNOWN GAP   bash-gate.sh          cd evals && python3 run.py --suite product --adapter bedrock
KNOWN GAP   bash-gate.sh          python3 /tmp/o.py --stack prod contract-record --adapter bedrock --out /tmp/r.json --reason "a live run"
KNOWN GAP   bash-gate.sh          /tmp/a sso login --profile h4reet-bedrock
KNOWN GAP   bash-gate.sh          python3 -c 'open("tests/test_router.py", "w").write("")'
KNOWN GAP   bash-gate.sh          install -m 0644 /tmp/new.py tests/test_router.py
KNOWN GAP   bash-gate.sh          git checkout HEAD~1 -- tests/test_router.py
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:reviewer         git log -p >&1x
KNOWN GAP   role:reviewer         git log -p >&1x [--agent]
KNOWN GAP   bash-gate.sh          python3 evals/agent-config/behavioral.py run
KNOWN GAP   bash-gate.sh          python3 tools/gates/matrix_canary.py
KNOWN GAP   bash-gate.sh          python3 tools/gates/publish_check.py
KNOWN GAP   bash-gate.sh          git commit $(printf -- '--no-%s' verify) -m wip
KNOWN GAP   bash-gate.sh          $(printf 'cla%s' ude) mcp add fs cmd
KNOWN GAP   bash-gate.sh          python3 -c "import urllib.request as u; u.urlopen('http://127.0.0.1:%d/admin/status' % (18000 + 3))"
KNOWN GAP   bash-gate.sh          make $(printf 'to%s' ols)
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: tools/gates/gate
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: evals/agent-config/static.py
KNOWN GAP   bash-gate.sh          git apply --cached /tmp/gates.patch
KNOWN GAP   bash-gate.sh          git update-index --add --cacheinfo "100644,$(git hash-object -w /tmp/new),tools/gates/gate"
KNOWN GAP   bash-gate.sh          git read-tree --prefix=tools/gates/ feature/x:tools/gates
KNOWN GAP   bash-gate.sh          git read-tree --prefix=evals/agent-config/ feature/x:evals/agent-config
PLANNED     protected-paths.sh    assets/policy/content-approvals.json
PLANNED     protected-paths.sh    assets/policy/resume-header.json
PLANNED     protected-paths.sh    apps/../assets/policy/content-approvals.json
PLANNED     protected-paths.sh    ./assets//policy/resume-header.json
PLANNED     protected-paths.sh    Edit in a linked worktree: assets/policy/content-approvals.json
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: assets/policy/content-approvals.json
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
NOTE        stage-S-unwritable    ~/.local/state/h4reet: no mask of its own, but it sits on a read-only mount (covered read-only /)
NOTE        stage-S-unwritable    assets/policy/content-approvals.json: no mask of its own, but it sits on a read-only mount (covered read-only /home/h4reet/h4reet-ai/h4reet-ai/assets/policy)
NOTE        stage-S-unwritable    assets/policy/resume-header.json: no mask of its own, but it sits on a read-only mount (covered read-only /home/h4reet/h4reet-ai/h4reet-ai/assets/policy)
SKIP        stage-S-conn          the SMTP host row: H4_STAGE_S_SMTP_HOST isn't set: it names the alert channel's SMTP host, deploy/env's SMTP_HOST
NOTE        stage-S-conn          npm and 198.18.0.1:2376 (allowed) need the proxy and the engine; proved by stage E and make engine-smoke
--- stage E: the host (folded from /home/h4reet/.local/state/h4reet/agents-engine/prove-report.txt, which proved commit 58bd2327212e at 2026-10-18T00:54:24Z) ---
E1   PASS  (from prove-limits.sh)
E2   PASS  (from prove-limits.sh)
E3   PASS  (from prove-limits.sh)
E4   PASS  (from prove-limits.sh)
E5   PASS  (from prove-limits.sh)
E6   PASS  (from prove-limits.sh)
E7   PASS  (from prove-limits.sh)
E8   PASS  (from prove-limits.sh)
E9   PASS  (from prove-limits.sh)
E10  PASS  (from prove-limits.sh)
E11  PASS  (from prove-limits.sh)
E12  PASS  (from prove-limits.sh)
E13  PASS  (from prove-limits.sh)
E14  PASS  (from prove-limits.sh)
E15  PASS  (from prove-limits.sh)
E16  PASS  (from prove-limits.sh)
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          sh -c 'unset CLAUDE""CODE; git commit -m wip'
KNOWN GAP   bash-gate.sh          e=engine; deploy/agents-engine/$e.sh up
PLANNED     settings.json         the content policy files are write-denied, by the sandbox and by Edit denies (spec 002, T016)
PLANNED (T016): 6 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
TOTALS      matrix                6 planned (reported, not failing), 1 skipped: stage S's SMTP row has no usable host
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 665 passed, 0 failed, 41 known gaps
-> PLANNED matrix (PLANNED (T016): 6 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json)
== image
SKIP: no agents' engine yet: tasks.md T046
-> SKIP image (no agents' engine yet: tasks.md T046)

PASS     makefiles-check
FAIL     githooks-check
FAIL     toolchain-check
FAIL     policy
PASS     validate-config
PASS     lint
FAIL     test
PLANNED  content-check  PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
PASS     secrets
PASS     evals
PASS     redteam
PLANNED  matrix  PLANNED (T016): 6 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
SKIP     image  no agents' engine yet: tasks.md T046
make check: 6 PASS, 1 SKIP, 2 PLANNED, 0 PENDING, 4 FAIL; failing: githooks-check FAIL, toolchain-check FAIL, policy FAIL, test FAIL
make: *** [Makefile:147: check] Error 1
make check exit 2
```

## For the Author

1. **The phone copy's SHA-256 (T140).** T140 builds the copy on the agents' engine, which isn't there yet (the image gate's SKIP, T046). So this note has no SHA-256 for T143 to check `lookdev.html` against, and T143 says a mismatch ends the session. You have two choices: wait for T140, or build the copy twice, from the same `<sha>` in two new folders, and take matching SHA-256s as the check (the copy's build is byte-identical twice over, T125). The working tree's `apps/web/dist-phone/` is never the reference.
2. **Merge order.** Line R: M8, M9, P-10, then US1 (T118, T119), then this branch (T147, T148), then `feat/004-us2-degraded` (T166).
3. **The tick marks.** On this branch, tasks.md ticks only T120 and, with this note, T142. T121 to T139 and T141 are done by the commits above but unticked; say whether the agents should tick them before T147.
4. **For a bisect.** 31da653 to 3c2b6d9 fail `make check`'s FR-007 scan. It passes from 54f0710.
5. **`make check`'s four FAILs.** Two were expected:
   - `policy`: `deploy/compose.yaml`'s web image isn't pinned by digest. The pin comes with spec 002's web patch (M9).
   - `test`: the four `tools/gates/test/test_compose_policy.py` cases that follow from the same pin.

   Two were not, and both come from the machine, not this branch. The instructions expected a WARN from toolchain-check.
   - `toolchain-check` fails on the Claude Code drift alone, pinned 2.1.296 and found 2.1.311 (T013, a human's fix). This branch's `toolchain_check.py` fails on drift, where a WARN was expected.
   - `githooks-check` fails on `pre-commit: missing or modified: run make git-hooks`. Its `main: a loose ref, which the git hook guards` line passes. The installed `.git/hooks/pre-commit` is byte-identical to `.claude/git-hooks/pre-commit` in main's checkout, which is parked on `wip/park-2026-10-26b` and carries the arrival check. It differs from this branch's copy at line 7, because this branch predates the arrival check. The FAIL ends once this branch is rebased onto a `main` that has the hook (T147). Nothing needs reinstalling.

Nothing on this branch changes a permission, a sandbox domain, or the constitution, and nothing is pushed.
