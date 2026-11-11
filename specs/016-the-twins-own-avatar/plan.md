# Implementation Plan: The Twin's Own Avatar

**Branch**: `feat/016-the-twins-own-avatar` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-the-twins-own-avatar/spec.md`, with its five provisional answers and twelve defaults. Read at the branch's base, the Author's intake commit 6821d121, with `main` at 0d2e3247.

**Note**: Research decisions (Phase 0) are §2 below, the data model (Phase 1) is §3, the interface contracts are [contracts/twin-data.md](contracts/twin-data.md) and [contracts/twin-states.md](contracts/twin-states.md), and the validation guide is §8. They sit in this file rather than in `research.md`, `data-model.md`, and `quickstart.md`, as one place for the Author to read.

## 1. Summary

The twin's figure shows `assets/twin/twin.glb`, unscaled, at a placement moved to the spot the hand-back solved the lean for. It plays five clips from a small state machine fed by the conversation panel. Its line is read from the Author's approval on `main`, and the 2D room shows his still. The shirt's lettering is drawn into the model's own skinned face from an approved outline, and the paper appears with the visitor. Approach: the twin becomes a third kind of figure source beside spec 009's visitor avatars. The compositor reads `assets/twin/`, checks it (RA1, RA2, RA4, and RA5 extended; RA6 and RA7 new), counts it (RK3 decoded, RK5 as F3), and bundles it with the line; the runtime loads it through spec 009's loader, keeps spec 009's stand-in as the fallback, and adds the states, the model-surface live face, the paper's appearing mode, and the 2D still. Everything the Author might tune is data in the scene's `figures.twin` block.

## Technical Context

**Language/Version**: TypeScript 5 (the room, its build, its tests), Python 3.12 (`scripts/assets/scrub.py`, `deploy/scripts/web_image.py`)

**Primary Dependencies**: three.js (GLTFLoader, AnimationMixer, SkeletonUtils, OutlineEffect), as the room already pins; Vite; zod; pako. No new dependency.

**Storage**: static files; the twin's files under `assets/twin/` (the Author's), served as content-addressed copies

**Testing**: Vitest (`apps/web/test/**`) with the room's fake clock and stage stubs; pytest for `scripts/assets/test_scrub.py` and `deploy/scripts/test_web_image.py`; the Author's lookdev and phone run

**Target Platform**: desktop and phone browsers with WebGL2 above ADR 0010's floor; the 2D room below it

**Project Type**: web application (`apps/web`) with its build-time compositor

**Performance Goals**: spec 002's FR-048, 30 frames a second on the reference phone, 60 on the reference desktop; the first visit under 25,000,000 bytes; the scene's texture memory under `main`'s 200,000,000

**Constraints**: no cap change; no content security policy change; no human-only file changed by an agent; nothing new leaves the visitor's device; `make up` builds with or without the twin's files

**Scale/Scope**: one model (172,804 triangles, 55 bones, two 2,048 textures), five clips, one still, one outline, one credits page

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design, below.*

| Gate | Before design | After design |
|---|---|---|
| I. A disclosure row for any new byte leaving the device; degraded mode first | Pass: no new flow; row V1's wording in the serving change; degraded mode is spec FR-001 to FR-007 | Pass: the still is fetched as a `data:` image with integrity, so no content security policy change; the credits page is same-origin |
| II. Tests, telemetry, cost, docs | Pass: SC-001 to SC-018; the existing failure panel; the report's measures | Pass: §8 names every test; the frame log; the dashboard panel's description updated |
| III. Spec before code; humans merge | Deviation, named in the spec: code ahead of his approval, at the main session's direction; one gate | Unchanged |
| IV. Least privilege | Pass: no permission or human-only file; the approval patch for his hand from plain copies | Pass: the line is read from `main`'s approvals or the tree's copy rule A9 holds to `main`'s, so the human-only gate needs no patch (R-03) |
| V. Cost | Pass: $0 model spend; transfer measured | Pass: Q4's 1,024 side keeps RK3 inside the cap |
| VI. Public | Pass | Pass: the brief stays out, so nothing personal beyond the code's needs is committed |
| VII. Whole product | Pass | Pass |
| VIII. Honest AI | Pass: the likeness never shows without its approved line | Pass: RA6 refuses a strict build with the twin's files and no line; the lenient build shows the stand-in |

Constitution deviation: lip-sync deferred (spec, Deviations). No permanent deviation, so no ADR.

## Project Structure

### Documentation (this feature)

```text
specs/016-the-twins-own-avatar/
├── intent.md                 # the accepted intent (82d15728)
├── spec.md                   # specify + clarify
├── plan.md                   # this file: research (§2), data model (§3), validation (§8)
├── contracts/
│   ├── twin-data.md          # the scene's twin block, the bundle's twin parts, the policy read, the outline, the rules, the report
│   └── twin-states.md        # the conversation's signals, the states, the clips, the hand-off's appearing paper, the frame log
├── checklists/requirements.md
└── tasks.md                  # /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── build/
│   ├── approvals.ts              # POLICY_FILES gains approvals.json (R-03)
│   ├── policy.ts                 # the prebuild reads main's approvals.json too
│   ├── credits.ts                # NEW: the credits page from assets/CREDITS.md (R-14)
│   └── room/
│       ├── avatars.ts            # readTwin: the twin's files, records, measures, bundling (R-01)
│       ├── policy.ts             # the likeness approvals: policy dir, then main, then the tree's copy (R-03)
│       ├── schema.ts             # figures.twin; live_faces[].surface; renderer `print` (R-09, R-12)
│       ├── lettering.ts          # NEW: the SVG and JSON → the outline (R-13)
│       ├── emit.ts               # the index's twin (line, still); the 3D part's twin (files, block)
│       ├── plugin.ts             # the twin's served copies
│       ├── report.ts             # FR-056's lines
│       └── checks/{ra,rk,ri,family}.ts   # RA1/RA2/RA4/RA5 over the twin; RA6, RA7; RK3, RK5; RI8's twin block
├── content/
│   ├── lettering/twin-shirt-lettering.{svg,json}   # NEW: the studio's sources, byte for byte (D3)
│   └── room/outlines/twin-shirt-lettering.outline.json   # NEW: the outline, approved by hash (C-0004)
├── room/
│   ├── scene.yaml                # the twin's placement (z), figures.twin, the shirt's face binding
│   ├── catalog/twin-figure.yaml  # height 1.82, bounds, the shirt's live face (surface: model)
│   └── ui-words.yaml             # label.twin-shirt
├── src/
│   ├── talk/talk.ts              # onActivity: unsent text, a turn out, an answer's words, a selection
│   └── room/
│       ├── app.ts, stage.ts, scene.ts   # the activity's path to the 3D stage; the line's swap
│       ├── layout.ts, text-copy.ts      # the line slot; the Credits tile
│       ├── flat.ts               # the 2D still; the paper's appearing in 2D
│       ├── compose/bundle.ts     # the index's and the 3D part's twin types
│       ├── faces/print.ts        # NEW: the `print` renderer
│       ├── faces/registry.ts     # registers `print`
│       └── scene/
│           ├── twin-states.ts    # NEW: the pure state machine (R-08)
│           ├── avatars.ts        # the twin's source, its clips, the morph strip, the fallback, the paper
│           ├── loader.ts         # twinEntries; the stand-in after failure
│           ├── faces3d.ts        # a model-surface face (R-12)
│           ├── bundle3d.ts       # showHandoff's appearing mode (R-10)
│           └── look.ts           # Ink.prepare leaves the face's material unlined
├── Dockerfile, ../../.dockerignore     # the tree's approvals.json beside caps.json; the twin-assets stage
└── test/ …                       # §8
deploy/scripts/web_image.py       # twin-assets context; approvals.json in the policy context
deploy/grafana/dashboards/h4-runtime.json   # the failure panel's description names the twin
docs/data-flow-disclosure.md      # row V1's wording
scripts/assets/scrub.py           # the twin's mark from the record's directory (R-16)
.prettierignore                   # apps/web/content/lettering/
```

**Structure Decision**: the existing `apps/web` layout, extended in place; two new source modules (`scene/twin-states.ts`, `faces/print.ts`), two new build modules (`build/credits.ts`, `build/room/lettering.ts`), and the lettering's two source files.

## 2. Research decisions (Phase 0)

**R-01. The twin as a figure source of its own.** Decision: the compositor reads `assets/twin/` with `readTwin` beside `readAvatars`, by the convention `twin.glb` (kind `avatar`), `<role>.glb` for `TWIN_CLIP_ROLES = [idle, talking, listening, greeting, desk-lean]` (kind `animation`), and `still.png` (kind `still`); RA1, RA2, RA4, and RA5 extend to it, with the same reasons. The runtime's twin figure wants `"twin"`, an `AvatarId` (the stand-in, after a failure), or null; spec 009's `Source` gains a twin source keyed `"twin"`. Rationale: the twin isn't an avatar of the visitors' table (spec 014's grips and RA3 depend on that), and its clip roles differ; keeping one controller keeps spec 009's ready, swap, fallback, and quality rules for free. Alternatives: a fifth `AvatarId` (rejected: the choice screen, grips, and RA3 would all have to exclude it); a separate controller (rejected: the hand-off and the walking driver read one controller).

**R-02. RK3 and RK5.** Decision: RK3's twin term becomes max(the twin model's decoded texture memory at the twin's side, the stand-in's decoded memory). At the 1,024 default, that is 2 × ⌊16 · 1,024² / 3⌋ = 11,184,810, the stand-in's own figure, so RK3 stays at the last report's 181,554,857 of 200,000,000. RK5 counts the room's served files, the twin's served files (model and bundled clips, about 8.73 MB), and the largest of the four visitor folders, as F3 does. Rationale: today `figures()` in `checks/rk.ts` counts every `.glb` under `assets/twin/` at its own size, 44,739,242, which takes RK3 to about 215,109,289 at this branch's base, so `make check` and `make up` fail RK3 there until this lands. It is the first GREEN task (T008's tests, then T011).

**R-03. The twin's line, read, never copied.** Decision: `build/room/policy.ts` gains the likeness approvals, read in this order: `ROOM_POLICY_DIR/approvals.json` where the directory holds it; else `refs/heads/main:assets/policy/approvals.json` with `GIT_NO_REPLACE_OBJECTS=1`; else the tree's own `assets/policy/approvals.json`, which rule A9 holds to `main`'s at the branch's base, as the build already reads the tree's `caps.json` (the Dockerfile's comment). `web_image.py`, `build/policy.ts`, and `approvals.ts`'s `POLICY_FILES` add `approvals.json` as the policy's fourth file, so the image's label and `room-data.json`'s `built_from` digest the same four. The `.dockerignore` and the Dockerfile let the tree's copy in beside `caps.json`. The compositor takes the entry whose `sha256` is the model's current SHA-256 and whose `disclosure_line` is a non-empty string; the line goes into the index's `twin.line`. Rationale: the human-only gate builds with a policy directory of three files (`tools/gates/gate`'s `POLICY_FILES`), so the tree's copy keeps its build whole with no human-only patch. Its arrival check refuses a twin file without its approval on `main` anyway. Offered, not required: the Author's optional patch adding `approvals.json` to the gate's `POLICY_FILES`, in the backlog. Alternatives: the line as a UI word (rejected: a copy, against FR-015); reading by approval ID (rejected: a new approval would need a code change).

**R-04. Serving.** Decision: `plugin.ts` writes the twin's GLBs as gzip-9 copies at `a/twin.<hash16>.glb` and `a/twin-<role>.<hash16>.glb`, and the still as its plain bytes at `a/twin-still.<hash16>.png`, a PNG gaining nothing from gzip; `web_image.py` hands `assets/twin/` over as the named context `twin-assets`, which the Dockerfile copies to `/src/assets/twin/`. Rationale: spec 009's M19 pattern.

**R-05. Loading.** Decision: `loader.ts` gains `twinEntries(part, base)`, the model then the clips in `TWIN_CLIP_ROLES`' order, each `{piece: "twin" | "twin:<role>", asset: "twin" | "twin-<role>"}`; `figureEntries` puts the twin's model and the chosen avatar's model first, then their clips (FR-044); the stand-in's entries are made by a new `standInEntries` the stage calls only after the twin's model reports `failed` (or never, where the chosen avatar is the stand-in). `Stage3D.expected` resolves with the twin's entries and the chosen avatar's (spec 012). Rationale: FR-044 and D1; a stand-in fetched after `expected` resolved counts for nothing, as spec 012's rules already give.

**R-06. Size and place.** Decision: the twin's instance takes scale 1 (`instanceFor` gains a `scale: "own"` target for the twin), its lowest point lifted to the floor; `twin-figure.yaml`'s `size.h` and `bounds` take the model's measured rest-pose bounds (the report prints them), with z extended back by the lean's 0.1 m hip shift, and `drawing` and `standin` scaled to the new height; the stand-in avatar then scales to 1.82 m through `twin_height`. The scene's `twin-figure` offset becomes `[0.78, 0, 0.469]`: the desk stands at `back-wall` (z −0.6096) plus 0.4, its origin at z −0.2096, and −0.2096 + 0.679 = 0.4694. RA7 checks the spot from the resolved placements, not from these figures. Rationale: Q5. Risk: RG5 and spec 014's protection re-measure the bigger, forward box (§6, K2). *As built (T030):* `size` 0.73 × 1.82 × 0.524 and `bounds` x −0.37 to 0.36, z −0.324 to 0.2 (the report's rest pose, x −0.354 to 0.357 and z −0.223 to 0.182, with z back 0.1 m, x kept for the stand-in shape's arm, z forward to the hand anchor); the stand-in shape, the drawing, and the hand anchor scaled 1.04 in height; the placement marked `estimated`. The box now reaches past the shell's open front (z 0.669 against 0.6096) and its right wall (x 1.14 against 1.0668, the A-pose's hand; the idle's arms hang inside), so it binds the 2D camera, and `room-shell.yaml`'s 2D drawing moves its open front's corners from ±1.5088 to ±1.5, a data edit the shell's own test holds to the camera. RG5 and RG6 pass; spec 014's frame eases more: the reference desktop's ease from 3/16 to 9/16 (the room 3.1% larger on screen, not 5.8%), the reference phone's from 15/16 to 1; its pinned snapshot (`test/room/__snapshots__/protect.test.ts.snap`) changes with it. For the Author's lookdev (L1). *As built (T084, R-19):* the offset's x is 0.66, 12 cm to the twin's left, since its clips crossed the right wall.

**R-07. The face shapes stripped.** Decision: when the twin's model parses, before it is cloned or drawn, `avatars.ts` deletes each mesh's `geometry.morphAttributes` and sets `morphTargetInfluences` and `morphTargetDictionary` to undefined, so three builds no morph texture. Rationale: three.js r15x and later uploads every morph target of a drawn geometry as a float texture, roughly vertices × 67 × 16 bytes per attribute on each primitive, which could reach a hundred MB or more of GPU memory for shapes nothing drives (D10). The lookdev's memory figures confirm it (L2).

**R-08. The states.** Decision: a pure module, `src/room/scene/twin-states.ts`: `createTwinStates({clock, block})` with `signal(activity)`, `arrive(now)`, `tick(now)`, and `state`, giving FR-021's order with the block's timings; no three.js import, tested on the room's fake clock. `talk.ts` gains `onActivity`, which reports `{draft: boolean}` on each input event and send, `{turn: "out" | "ended"}`, `{answer: words}` when the twin's answer is appended (never for a fixed message), and `{selected: true}` on a piece's selection; `app.ts` passes it to the stage, `scene.ts` to the avatars' controller, which maps the state to the clip role through the block's map. Rationale: one testable place for the order; the panel tells only what FR-022 lists.

**R-09. Clips.** Decision: the twin's actions per role, `greeting` `LoopOnce` with `clampWhenFinished` false, every other role `LoopRepeat`; the mixer's `finished` event ends `arriving`; a change crossfades over 0.25 s, or 0.4 s where either side is the lean's role, while the motion store animates, and cuts otherwise (spec 009's `play`, given a duration). Under no animation, `arriving` lasts its clip's length on the clock and shows its first frame. Rationale: FR-019 to FR-024.

**R-10. The paper appearing.** Decision: `bundle3d.ts`'s `showHandoff` gains `mode: "travel" | "appear"`. With `appear`, the twin's sheet stays hidden, and the visitor's sheet sits at the visitor's grip or anchor with its opacity at the progress. The avatars' controller passes `appear` whenever the twin shows its own picture at the hand-off's start, and then plays the visitor's "idle-holding" from the start, with no "take". `flat.ts`'s 2D hand-off takes the same mode. `handoff.ts`'s timing and `HANDOFF_LINE` are unchanged. Rationale: Q2, D11.

**R-11. The 2D still.** Decision: the index's `twin.still`, `{url, sha256, bytes, rect}`; the 2D room fetches it once, through the room's same-origin fetch with `integrity`, and shows it as an SVG `image` whose `href` is a `data:` URL made from the verified bytes, under a `clipPath` of the twin figure's projected box, in the block's rectangle, `preserveAspectRatio="xMidYMin slice"`. Rationale: the site's content security policy, `img-src 'self' data:`, allows a `data:` image, and a same-origin `href` couldn't carry integrity; no policy change. Alternatives: a `blob:` URL (rejected: needs `img-src blob:`). *As built (T049, T050):* the index's `twin.still` also carries `view`, the rectangle projected into the 2D drawing's view box by the compositor through the twin figure's drawing's matrix, and `placement`, the twin figure's placement, whose drawing the still hides, so the 2D room draws it with no projection of its own; the image and its clip are made by code below the drawing's allowlist, its URL a data: URL of bytes whose SHA-256 the 2D room checks itself beside the browser's integrity check (contracts/twin-data.md §4 gains the two fields).

**R-12. The shirt on the model's own face.** Decision: the catalog's `live_faces[]` gains `surface: quad | model`, default `quad`. A `model` face on a figure's piece is drawn into its avatar's mesh of that name (three's sanitized name), never as a quad. When the twin's instance shows, `faces3d.ts` finds the mesh `twin-shirt-lettering`, clones its material, and sets `map` to the face's canvas texture, with `alphaTest` 0.5 and `transparent` false. It marks the material `userData.h4FaceSurface` and sets `outlineParameters.visible` false, which `look.ts`'s `Ink.prepare` leaves as it is. The canvas texture's `flipY` follows the face's stored texture coordinates, which a test reads from the GLB (§6, K3). The renderers gain `print`, `faces/print.ts`: the outline's paths fitted to the region (spec 004's `fitOutline`), in `#000000`, with no background, and the drafts' badge in ink. The face is bound in the scene as an atmosphere face, `max_chars` 25. Without a published outline it has no binding, so the model's own white material stays. Rationale: the brief's "Draw on its material; don't parent a separate plane to a bone", and "draw the ink alone, on a transparent background … with an alpha test".

**R-13. The outline.** Decision: `build/room/lettering.ts` converts the SVG and the JSON: it accepts only `path` elements with `d`, `fill="#000000"`, and `fill-rule="nonzero"` under one `svg` with `viewBox="0 0 180 70"`, and refuses anything else; its outline is `{schema: 1, sign: "twin-shirt-lettering", words: <JSON words>, intent_ref: "intent-016", source: {type: "design", id: "D-0002"}, tool: {name: "the room's outline converter", version: "1", license: "mit"}, view_box: [0, 0, 180, 70], cap_height: 14.674, advance: 180, paths: [<each d, in order>]}`, written as two-space JSON with a final newline. `npm run room:lettering -w apps/web` writes it; a test proves the committed file equals the conversion. Rationale: spec 004 §8's format, the RT13 checks it already has, and D4's provenance: the converter is what made the file, and the committed JSON names the typeface and its license. The Author may name the studio's own setting tool instead, which changes the hash and his patch.

**R-14. The credits page.** Decision: `build/credits.ts` renders `assets/CREDITS.md` to `credits/index.html`, as `build/disclosure.ts` renders the disclosure. It adds a contents list of its `##` directories, each linking to its section's anchor, and it reads the file through the build and never edits it. `layout.ts`'s toolbar gains the tile `toolbar.credits` with the `credits` icon, after "How data flows". Rationale: FR-042, FR-043, two activations. Risk: spec 014's compact bar budget with a sixth tile (K5; D9's fallback). *As built (T064):* spec 014's HUD model already counts the bar's six tiles with Credits among them (`test/ui/hud-model.test.ts`), so the tile holds and D9's fallback isn't needed; the toolbar's `toolbar.credits` UI word and the `credits` icon were already in the data. The Dockerfile copies `assets/CREDITS.md` for the build.

**R-15. The scene's twin block.** Decision: `figures.twin` with `clips` (state → role), `rest_after_s`, `speak_wpm`, `speak_s`, `lean` (`against`, `behind_m`, `right_m`), `texture_px`, and `still` (`rect`, in the figure's frame, metres); every key optional, its default in `FIGURES_DEFAULTS`; [contracts/twin-data.md](contracts/twin-data.md) §1 gives the schema. RI8 extends to an unknown state or role, and to `lean.against` naming a placement that isn't the work desk's piece. *As built (T016):* the work desk is the piece of the placement the scene's survey names (`survey.desk_corner`), not the literal ID `work-desk`, so the fixture set's `fx-` desk serves its tests and a renamed desk stays data; and `lean` is optional with no default: absent, there is no lean, and its keys `behind_m` and `right_m` default to the hand-back's figures where `lean` is given (contracts/twin-data.md §1 gave both "as above" and "absent: no lean"; this reads the second). The scene's block writes the lean (T042).

**R-15a. RA7, as built (T041).** The lean's spot is measured in the twin placement's frame from the resolved placements: the desk's origin `behind_m` behind the twin's root along its facing (the depth, within 1 cm; the root's side position along the desk isn't held, since the room's twin stands at the desk's end, the desk behind and to its right, as the hand-back's elbow figures allow); the desk facing as the twin faces, within 1°; and the desk's top reaching at least `right_m` to the twin's right, from within 5 cm of its root, so the forearm and hand lie on it. The 5 cm is this plan's reading of "keep at least 0.45 m of desk to his right of his root". Each failed condition is its own finding, at `lean.behind_m`, `lean.against`, or `lean.right_m`. The room's scene measures 0.0 cm, 0.0°, and 1.53 m from 3.0 cm (the report's lean line).

**R-16. The scrub.** Decision: `term_from_record` reads the record's `directory`; where it is `assets/twin`, starts with `assets/twin/`, or is `docs/research/images` (the arrival check's `MODEL_ONLY`), it returns `MARK_MODEL` before reading the steps. Rationale: the arrival check's C1.

**R-17. Telemetry.** Decision: the twin's asset events take the served stems (`twin`, `twin-<role>`, `twin-still`); `avatar_failed` is the stage's existing once-a-visit send, which the twin's failed file reaches through `missed`; the frame log gains `{kind: "twin-state", state, role}` and the twin's picture `why`. The dashboard's panel description in `deploy/grafana/dashboards/h4-runtime.json` names the twin's files; `deploy/scripts/test_dashboard.py` holds it.

**R-18. Tests that pin today's state** change in the same commit as the code that changes what they pin (spec 009 FR-043): the stand-in line always first (`test/ui/hud-notes.test.ts`, `test/ui/loading-notes.test.ts`, `test/room/bundle.test.ts`'s copy order), RK3's twin term at its own size (`test/room/avatars-compose.test.ts`, `test/helpers/room-avatars.ts`; and, found at T011, `test/room/budgets.test.ts`'s three figures tests and `test/room/report.test.ts`'s RK3 line, which placed models under `assets/twin/` by other names and now name the model `twin.glb`), the twin figure's 1.75 m and its placement (`test/ui/avatars.test.ts`), the stand-in fetched every visit (`test/room/avatars-compose.test.ts`), and, found at T012, the policy's three files and their digest (`test/approvals.test.ts`'s `POLICY_FILES`, `POLICY_PATHS`, digest, and prebuild cases), which the fourth file changes; and, found at T013, `deploy/scripts/test_web_image.py`'s absent digest, git's reads, and the Dockerfile's and `.dockerignore`'s policy files, which now let the tree's `approvals.json` in beside `caps.json`, as R-03 says; and, found at T020's first full run, `test/smoke.test.ts`'s room-data digest (four files) and its list of `a/` (the twin's served files), `test/ui/avatars.test.ts`'s first copy entry, and `test/ui/text-copy.test.ts`'s copy kinds and expected lines, which read the line slot as the stand-in line until the twin's picture shows; and `test/room/compose.test.ts`'s rule catalogue, with RA6 (and RA7 at T041); and, found at T064, the toolbar's pinned last tile and Tab orders (`test/ui/hud.test.ts`, `test/ui/a11y.test.ts`, `test/ui/hud-a11y.test.ts`) with Credits after How data flows, and `deploy/scripts/test_web_image.py`'s list of the context's `assets/` copies with `assets/CREDITS.md`. And, found at the final `make check`: the room's test helper (`test/helpers/room.ts`) answers the twin's 2D still from its file and records it in `spies.assets`, apart from `spies.network`, since the 2D room now fetches it in every 2D visit whatever the live source says (FR-001, FR-035), which the "makes no request" assertions of eight UI and room test files read; `test/room/data-only.test.ts`'s own spies gain the list; `evals/test_disclosure.py`'s row V1, which read spec 009's M6 words and now reads spec 016's M17 in their place (T073, as `test/disclosure.test.ts` already did); and `scripts/test_makefile.py`'s dev-cpu web image build line, which gains `--build-context twin-assets` (T013's context). And, found at T083 and T084 (R-19): `test/room/compose.test.ts`'s rule catalogue and its lenient list, with RA8, and the known-bad set, with `bad/RA8-back`; and spec 014's protector snapshot (`test/room/__snapshots__/protect.test.ts.snap`), whose twin box moves 47 px to the left with the placement. This is a feature task, not a fix task, so the test-file hook doesn't apply; the reviewer checks that each changed assertion follows a changed requirement.

**R-19. The Author's lookdev findings** (T079, 2026-11-11; T082 to T085). His words: "the right arm bends inverted when leaning on the desk, and the twin's left foot and arm can sometimes go thru the wall. Everything else looks good". Both were measured before anything changed, sampling the rest pose and every clip at 30 fps with the delivered model skinned exactly as three skins it, every vertex, in the room's frame.

- *Through the wall, measured.* At the placement the lookdev saw, (0.78, 0, 0.469), facing the open front, the twin's left side, its +x, crossed the right wall (x 1.0668) in every source: the rest pose by 6.98 cm (the A-pose), the idle by 8.80, listening by 9.41, talking by 8.50, the greeting by 6.98, and the lean by 7.13, each at the left foot; the left hand by 4.26 to 5.15 cm, and the left knee by up to 2.25. The catalog's box is the rest pose's (R-06); the clips reach past it. Nothing came near the left wall or the back.
- *Fixed by data* (T084): the offset's x 0.66, 12 cm to the twin's left. Every sampled frame stays at least 2.59 cm inside the right wall (listening, its left foot at 0.00 s); the rest pose 5.02 cm. The lean keeps what the hand-back asks: z is unchanged, so the desk's front edge stays 0.279 m behind the root (RA7: 0.0 cm, 0.0°), and the desk's top reaches 1.41 m to the twin's right of its root, against the hand-back's 0.45 m; the resting forearm and hand enter neither the laptop's stand nor the dog sign at either x (K7). A turn would break RA7's facing, and a move in z its spot, so x is the one to move. The work order (`docs/studio/work-orders/twin-figure.md`) and contracts/twin-data.md §3's example follow.
- *Kept from returning* (T082, T083): RA8, lenient, in `checks/ra.ts` over `build/room/reach.ts`, refuses a twin placement whose own model, at rest or in a clip it plays (each state's clip by the block's map, as `scene/avatars.ts` chooses it), reaches past a wall of the shell: a side wall its side-wall anchors stand on (`sideWallFrame`), or its back, its bounds' least z. The front is open, so it isn't held. A lenient build warns and keeps the twin, since nothing in the bundle stands on it. The measure is exact: a vertex is a convex combination of its joints' rigid images, so each joint's vertices are kept in clusters of 64 with boxes in the joint's own frame, and a frame skins only the clusters whose box could still pass the best reach found; `twin-reach.test.ts` holds it to three's own skinning of the delivered model, at rest and three times in each clip, along five directions, within 0.05 mm. The report's reach line prints each wall's clearance, nearest first. Not sampled: the crossfades between clips, and the stand-in. The first run of T082's fixtures expected the default fixture clips to turn the hips by their quaternions' half-angles; they turn by twice that, so two of them crossed as well, and the test gives those two the idle's motion (a test's arithmetic, corrected in T083's commit; the module was right).
- *The right elbow, measured, not patched* (T085). The room plays a clip's local rotations as authored: no retargeting, and the model's and every clip's rest TRS agree to 4 × 10⁻⁸. In the idle, listening, and talking, the right forearm swings about one axis in its parent's frame, about (−0.98, 0, 0.2), the natural hinge (talking's 73°, the forearm forward). In the lean it swings 74.5° about (0.89, 0, 0.45), about 140° from that axis: on the natural hinge, about −58°, the elbow bent backward, through every frame of the clip. It does exactly what the hand-back's solve says: the elbow at (−0.304, 1.112, −0.319) and the forearm along (−0.48, 0, −0.88), the hand-back's (−0.55, 0, −1); and the placement matches the solve (RA7's 0.0 cm and 0.0°, the desk's top at 1.07 m against the solve's 1.073). So the inversion is baked in `desk-lean.glb`: a forearm along the desk behind a back-swung upper arm can't be reached by bending the elbow forward. Agents can't touch `assets/`, and the brief says not to patch an animation in code, so the choice is the Author's: the lean off for this release, a data edit (`figures.twin.lean` removed: the twin rests in its idle, and RA8 stops sampling the lean), or the studio's re-export of the lean through his intake.

## 3. Data model (Phase 1)

- **The twin's files** (`readTwin`): for each of `twin.glb`, the five clips, and `still.png`: `path`, `role` (`model`, a clip role, `still`, or none), `bytes`, `sha256`, `url`, `gz` (GLBs), `measures` (triangles, texture memory at own and decoded sizes, height and bounds for the model, animations for a clip, width and height for the still), `bundled`, `why`.
- **The twin's line**: `{approval: <id>, line: <text>}` or null, from the likeness approvals (R-03).
- **The index's `twin`** (entry chunk): `{line: string, still: {url, sha256, bytes, rect: [x, y, w, h]} | null} | null`. Null where the twin isn't bundled.
- **The 3D part's `twin`**: `{model: {url, sha256, bytes, texture_bytes}, clips: Partial<Record<TwinClipRole, {url, sha256, bytes}>>, block: TwinBlock}` or null.
- **`TwinBlock`**, resolved: `{clips: Record<TwinState, TwinClipRole>, rest_after_s, speak_wpm, speak_s: [min, max], lean: {against, behind_m, right_m} | null, texture_px, still_rect}`.
- **A twin state**: `arriving | answering | listening | resting | present`; **an activity**: `{draft} | {turn} | {answer} | {selected}` ([contracts/twin-states.md](contracts/twin-states.md) §1).
- **The outline**: spec 004 §8's object (R-13).
- **The catalog's live face**: §4's fields plus `surface`.

## 4. Order of work

One branch, stacked on the intake, one gate (the spec travels at its base). Phases follow tasks.md; each ends green on `make check ENGINE_MODE=none-yet` but the first, which starts red on RK3 (R-02).

1. **Setup** (T001 to T003): the base's `make check` recorded, RK3 expected red; the lettering's two files brought in by the session that commits and checked against the hand-back's `SHA256SUMS` (`twin-shirt-lettering.svg` 8344c745…, `twin-shirt-lettering.json` 50be0e72…); `.prettierignore`.
2. **Foundation** (T004 to T020): the policy's fourth file; `readTwin`; RK3 and RK5 (green again, T011 first); RA1, RA2, RA4, RA5 over the twin, RA6; the twin block's schema; the bundle's types; serving and the image's context. Blocks every story.
3. **US1 and US2 together** (T021 to T031): the twin shows, at its size and place, with its line, and falls back. The MVP.
4. **US3** (T032 to T043): the states, the panel's activity, the clips; the lean's check RA7 and the scene's edits.
5. **US4** (T044 to T047), **US5** (T048 to T050), **US6** (T051 to T061), **US7** (T062 to T064): independent of each other after US1, but for `flat.ts` (T050 before T047).
6. **US8** (T065 to T068) and **US9** (T069, T070; independent, any time).
7. **Polish** (T071 to T077): the dashboard's description, the frame log, row V1, accessibility, the README, the approval patch built from plain copies, and the merge-request note with `make check`, `make lint`, `make test`, and `make evals` pasted.
8. **The end** (T078 to T081): the review by a reviewer that wrote none of it; his lookdev; his shirt-approval patch; the one gate.

The Author's patch for the shirt (T080) can go on `main` before or after the gate: a release build leaves the shirt plain until it does.

## 5. The Author's steps, for the runbook

Each as short lines, wrap-proof, in the merge-request note:

1. **Lookdev** (L1 to L4, §8): a drafts build's lookdev page; the twin in each state, the lean, the hand-off, the shirt marked, the 2D still; the phone run.
2. **The shirt's approval** (built in T076, applied by him in T080): a patch built from plain copies (`git show refs/heads/main:assets/policy/content-approvals.json` into the scratch folder, the entry added there, `git diff --no-index` between the two), never `git apply` and never a write into any worktree, at `docs/merge-requests/2026-11-10-room-text-twin-shirt.patch`: one entry after C-0003, `{"id": "C-0004", "path_when_approved": "apps/web/content/room/outlines/twin-shirt-lettering.outline.json", "kind": "room-text", "sha256": "<the outline's>", "date": "<the day you apply it>", "reason": "<your words>"}`. He confirms D4's provenance first; a change to it regenerates the outline and the patch.
3. **The gate**: `tools/gates/gate feat/016-the-twins-own-avatar` from `main`'s checkout.
4. **Optional, backlog**: `approvals.json` in the gate's `POLICY_FILES` (R-03); ADR 0010's text (spec M26).

## 6. Risks

| ID | Risk | Mitigation |
|---|---|---|
| K1 | RK3 is red at the base (R-02), so `make up` fails on this branch until T011 | T008 to T011 first; the note says so; `main` is unaffected until the gate |
| K2 | The twin's bigger box at z 0.469 may project outside the view at an aspect (RG5) or ease spec 014's frame | The bounds from the measured model, not the old ±0.2; if RG5 refuses, Q5's option C (a step during the lean) at the Author's word; the report names the aspect |
| K3 | The shirt's texture coordinates' convention (glTF's v from the top, or Blender's from the bottom) decides `flipY`; a wrong guess draws the words upside down | A test reads the face's positions and texture coordinates from the GLB, finds the vertex at the top-left as seen from the front, and asserts the canvas's top-left lands there (SC-007) |
| K4 | The inked look's OutlineEffect outlines the face's quad or its letters | The face's material excluded (R-12); a test checks `outlineParameters.visible` false after `prepare` |
| K5 | A sixth toolbar tile breaks spec 014's compact bar budget | Its HUD tests run with the tile; on a failure, D9's fallback: the link in "Around the room" |
| K6 | The morph strip misses a primitive, or three rebuilds the dictionary | A test asserts 0 morph attributes on every mesh of the instance after `model()` (SC-009) |
| K7 | The lean's forearm crosses the dog sign or the laptop's stand at the estimated positions | The Author's lookdev (L3); a data edit moves the piece or the twin's x |
| K8 | The 8.6 MB model makes the loader reach its ceiling on slow links | Spec 012's ceiling and FR-019 (e)'s late swap stand; the greeting plays when the twin first shows |
| K9 | The committed JSON's 64-hex font digest trips a repository scan, as 64-hex test values have | The file comes in as delivered; if a scan refuses it, the task stops and the main session decides; the outline holds no digest |
| K10 | The phone's frame rate with a 172,804-triangle skinned twin | The quality controller's steps; FR-025; the Author's phone run (L4) |
| K11 | `make test` grows by reading a 20 MB GLB in several tests | `readTwin` is cached per tree as `avatarsOf` is; tests share one reading |

## 7. Cost, degraded mode, telemetry

As the spec's Expected Cost Impact, Degraded-Mode Behavior, and FR-049 to FR-053. Measurement: the report's RK3, RK5, and first-visit lines (FR-056) in the merge-request note; the build's chunk sizes.

## 8. Validation guide (Phase 1 quickstart)

**Automated** (`make check ENGINE_MODE=none-yet` in the worktree, `npm ci --cache $TMPDIR` first):

All paths under `apps/web/test/` unless named otherwise; the twin's runtime tests sit in `room/` beside spec 009's avatar tests.

- `room/twin-compose.test.ts`: `readTwin`, RA1/RA2/RA4/RA5 over the twin, RA6 (no line, an older hash, an empty line), RA7 (the default spot within 1 cm; a moved desk; too little desk; turned), RK3 at the twin's side, RK5 with the twin, the report's lines (SC-008, SC-017).
- `room/policy.test.ts` and `deploy/scripts/test_web_image.py`: the fourth policy file, the order of the line's sources, the digest (R-03).
- `room/schema.test.ts`, `room/bundle.test.ts`, `room/dist.test.ts`, `room/data-only.test.ts`: the twin block and RI8, the bundle's twin parts and copy, the served names and the release build's absence of the shirt's words, the data-only proof set (SC-014).
- `room/lettering.test.ts`: the committed outline equals the conversion; the converter refuses a foreign element (SC-018).
- `room/twin-states.test.ts`: FR-021's order on the fake clock, the speaking time, the rest (SC-004).
- `room/twin-figure.test.ts`: placement and size, the line swap, the morph strip, the decode side, the clips by state, the greeting once, crossfades and cuts, the frame log (SC-001, SC-003, SC-005, SC-009).
- `room/twin-faults.test.ts`: every fault of SC-002, the stand-in's height, the asset events.
- `room/twin-network.test.ts`: the fetches and their order (SC-011).
- `room/twin-handoff.test.ts`: the appearing paper, no sheet at the twin, the stand-in's hand-off unchanged (SC-006).
- `room/twin-shirt.test.ts`: the `print` canvas, transparency, the texture coordinates' orientation, the draft mark, no ink lines, nothing drawn with the stand-in or the still (SC-007).
- `room/twin-2d.test.ts`: the still, its clip and rectangle, its fallback, its fetch (SC-010).
- `ui/talk-activity.test.ts`, `ui/twin-loading.test.ts`, `ui/credits.test.ts`, `ui/a11y.test.ts`, `ui/hud-notes.test.ts`, `ui/loading-notes.test.ts`, `ui/avatars.test.ts`: the panel's activity, the loader's count, two activations and the tile in the HUD's budgets, WCAG, and the pinned tests R-18 names (SC-012, SC-016).
- `scripts/assets/test_scrub.py`: SC-015. `deploy/scripts/test_dashboard.py`: the panel's description.

**The Author's checks** (lookdev, drafts build):

- **L1**: the twin at its place, its height, and its facing, on both reference stages; the line beside it.
- **L2**: lookdev's memory figures with the twin: no morph texture; the scene's texture memory beside RK3's.
- **L3**: the lean against the desk: the elbow on the top, nothing through him, the crossfade in place.
- **L4**: the phone copy's 2-minute run, with the twin and a visitor animating (SC-013).
- **L5**: the shirt, marked as a draft: upright, black, the shirt showing around it, moving with the chest.

## 9. As built: what the implementation changed or left

Recorded with the build (2026-11-10 and 11), beside the *As built* notes under R-02, R-06, R-11, R-14, R-15, R-15a, and R-18:

- **The frame log's names** (contracts/twin-states.md §7): the twin's own model is `shows: "own"`, its 2D still `still`, and its drawing `drawing`; the stand-in avatar in the twin's figure stays `avatar`, as spec 009's log names it, rather than `stand-in`; the capsule stays `fallback`. The state changes are `twin-state` entries with `state` and `role`.
- **The print renderer's draft badge** (contracts/twin-data.md §3): the raster's own badge, as every renderer's, beside the ink, in a drafts build only; a release build draws the ink alone.
- **The arrival waits for the greeting's file**: where the twin shows before its greeting's file has ended, its arrival waits for that file, loaded or failed, so the greeting plays its whole length (FR-019).
- **The outline's tool version** is `spec-016.1`, not `1`: an outline's private fields must turn up nowhere in what ships, and a one-character value turned up by chance in a served GLB's copy.
- **RA5 over the twin** has no `bad/RA5-twin` fixture: RA5 only reports, and the known-bad cases need a finding, so twin-compose.test.ts holds it through the report.
- **The checkpoints' make check** ran at T001 and T031 and at the end; between them each phase's checkpoint ran the web workspace's whole suite (T043, T061), whose results the merge-request note gives.
- **Left for later, the Author's to schedule**: T067 and T068, the lookdev page's twin controls (each state, the lean, the hand-off normal and reduced, the shirt marked, the 2D still with its line; FR-057). The room shows each of these already; the Author's lookdev L1 to L5 runs on the room's drafts build until the page's controls land.

## Complexity Tracking

| Departure | Why needed | Simpler alternative rejected because |
|---|---|---|
| Spec 009's 0.25 s crossfade exceeded for the lean (0.4 s) | The hand-back's figure for settling onto the desk | 0.25 s snaps the 0.1 m hip shift visibly |
| Spec 003's FR-021 still in 3D replaced by the stand-in | His answer | — |
| The policy's fourth file, with the tree's copy as a fallback | The line read, never copied, with the human-only gate unchanged | A copy in data breaks FR-015; a gate patch slows the release |
| A model-surface live face beside the quads | The face is skinned; the brief forbids a separate plane | A quad parented to a bone slides off the chest as it breathes |
