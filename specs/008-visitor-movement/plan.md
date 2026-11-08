# Implementation Plan: Visitor Movement and Target Highlighting

**Branch**: `spec/008-visitor-movement` (this plan; the work runs on two stacked branches, [§4](#4-the-order-of-work)) | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Status**: Planned overnight on 2026-11-07, under the Author's "Keep going!", on the spec's provisional answers (its Clarifications, Q1 to Q5, and its defaults D1 to D8). Not yet approved: the Author accepts the intent and approves the spec and this plan before any code (`CLAUDE.md`). The consistency check that `/speckit-analyze` makes is recorded at the end of [tasks.md](tasks.md), with what it changed.

**Input**: [spec.md](spec.md) and [intent.md](intent.md). The room's code was read at line R's User Story 9 tip, f9524081 (`feat/004-us9-neon-sign`), from a checkout of that branch; spec 004's documents and spec 002's contracts on `main` (ea9fc7ad). Phase 1 checked every file, function, and hook it names again at line R's final tip, 848a94d6, and builds on it (§10, "The base").

**Companions**: none apart. This plan holds its decisions (§1, research), its data and interfaces (§3, the data model and contracts), and the Author's runs (§5.3, the quickstart), since the feature is one slice of spec 004's room runtime. Where this plan and spec 004's contracts disagree on the room's existing behaviour, spec 004's contract is right, and the spec's Amendments name what changes.

**Conventions** (spec 004's): **the Author's terminal** holds commands only the Author runs. **Agent-editable** files are changed by agents and reviewed by the Author; **human-only** files change only by the Author's hand, and this plan touches none. **Paths**: line R's files exist only on its branches, so they are named in code spans, never linked (`evals/docs_links.py` fails a link to a file the branch lacks).

## Summary

The spec asks for a target with a highlight border, and a walk. The approach, in four parts:

- **A target, one store for the whole room** (FR-007 to FR-013): a pure reducer, `walk/target.ts`, in the entry chunk, fed by four inputs: the pointer's hover and press from `objects.ts`, keyboard focus from the "In the room" list (`a11y.ts`), and reach from the walking view. `app.ts` owns the store, so it survives the fall to 2D, and hands its target to whichever stage draws (`Stage.setTarget`). Selection keeps its one path, `selectObject`, which now also clears the target.
- **A highlight drawn at run time** (FR-014 to FR-019): in 3D, two hull passes over the target's members, edge then band, with the look's ink-line technique and thickness rule (`scene/look.ts`) but a material of its own, so it draws in every look and at every quality level, never shares the look's parameters, and costs nothing with no target; in 2D, two strokes around the target's hit rectangles in place of its dashed cue. Colours and widths are look data, checked for contrast by the compositor.
- **The walking view** (FR-020 to FR-035): pure modules for the walkable floor and its obstacles (`compose/floor.ts`, which the compositor shares), movement with sliding, the follow camera with its limits and region, and reach; a DOM input controller; and, in the 3D stage, one orchestrator that runs them each frame and a figure driver that shows the pose with today's flat cut-out. The production framing stays as it is, the view the room opens on, judged by spec 004's checks, and the one the walking view returns to.
- **Data, telemetry, and the lookdev page** (FR-050 to FR-059): the scene's `walking` block and each look's `highlight`, both optional with the spec's defaults and written out in the default data; one usage event, `walk_started`, with row V4's trigger and a dashboard panel; a scripted walk on the lookdev page for the Author's phone run.

**Phase 1 lands first** (the main session's direction): the target and its highlight on the fixed camera, User Story 1 with User Story 6's checks for it, on `feat/008-visitor-movement`. Walking follows on `feat/008-walking`, stacked on its tip.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node 24.21.0 (spec 000's pins) for `apps/web`; Python 3.12 for the dashboard's contract test; YAML for the room's data.

**Primary Dependencies**: three 0.186.1, held exactly (spec 004's R-29), whose `OutlineEffect` vertex shader the highlight's hull material follows (the pinned file's `renderOutline` and its screen-space extrusion were checked on 2026-11-07); vitest 5.0.3, jsdom 30.1.1, axe-core 4.13.0, zod 4.6.5, as line R pins them. Nothing new.

**Storage**: none. The target, the walking view's state, and the once-a-visit flag for `walk_started` live in page memory and leave with the page (spec 002 FR-003).

**Testing**: vitest in `apps/web`: pure modules in Node (`test/room/`), the room's screens in jsdom (`test/ui/`), the compositor's fixture set, the data-only proof set, and axe-core; the gateway's route tests; pytest for the dashboard's contract. Every check runs inside `make test`, so no `CHECK_GATES` entry is added. The toolchain has no headless browser: rendering, frame rates, and touch on glass are the Author's runs (§5.3).

**Target Platform**: evergreen browsers on desktop and phone; WebGL 2 for the walking view and the 3D highlight; any browser for the 2D highlight. The reference phone and desktop are spec 004's.

**Project Type**: an extension of spec 004's room runtime and compositor in `apps/web`, with one generated configuration file, the gateway's tests, the disclosure, the telemetry contract, and the dashboard. No service, container, port, or route changes.

**Performance Goals**: spec 002's FR-048 (30 fps on the reference phone, 60 on the reference desktop) in the walking view (FR-048); the figure moving on the first frame after input (FR-028); the highlight at most two extra passes over the target's meshes, none without a target (FR-049); the camera's move into or out of the walking view in at most 500 ms (FR-022).

**Constraints**: no request, model call, or storage for moving or targeting (FR-001); the CSPs unchanged, so the 2D highlight is attributes and room.css classes, and the walking control and the walking view's focus are classes, never inline styles; spec 002's 150 KB entry chunk and spec 004's 16 KB index (FR-011) hold, the walking modules staying in the lazy 3D chunk; no human-only path is touched.

**Scale/Scope**: nine new modules (the reducer; four pure walking modules, the floor's among them; the input controller; and three in the 3D chunk), about thirty-five changed source, data, configuration, and document files; twelve new test files and about twenty extended; 59 FRs and 14 success criteria; four selectables today, at most 64 (spec 004).

## Constitution Check

*GATE: passed before the decisions and re-checked after design ([below](#constitution-check-post-design)).* Applied with the `constitution-check` skill's questions against the [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle or standard | What this plan does | Verdict |
|---|---|---|
| I. Data-local by default | One event kind on the existing beacon, `walk_started`, once a visit, no identifier, with row V4's trigger in the same commit (T054); nothing else sent or stored. Degraded mode first: Phase 1 carries User Story 6's checks for targeting (T008), and Phase 7 the rest | PASS |
| II. Production-grade or not shipped | Test-first tasks for every FR; the dashboard panel and its contract in the event's phase (T054, T055); the spec's cost estimate and its measurement (§6); ADR 0039 and the room's README (T026, T011, T071); no alert, so no runbook; no model, so no evals | PASS |
| III. Intent before spec, spec before code, humans merge | No code before the Author accepts the intent and approves the spec and plan (T000); the plan is cherry-picked into each branch's tree, and a departure updates §10 in the same commit; agents rebase and cherry-pick, never merge | PASS, with the spec's named deviation: the intent was a draft when the spec was written |
| IV. Least privilege | No permission, allowlist, sandbox domain, CSP, credential, hook, gate, or human-only file changes. The compositor's new refusals only narrow | PASS |
| V. Cost is a first-class signal | $0 model spend; at most one small beacon per visit that walks (§6) | PASS |
| VI. Build in public | Everything here is public; nothing private is added | PASS |
| VII. Own the whole product | The product reasoning (why third person, a control, reach, yellow and ink) is in the spec and in ADR 0039 | PASS |
| VIII. Honest AI | The AI disclosure stays visible in every view (SC-012); no new word speaks for the Author; no model call | PASS |
| Security and agent governance | The implementer never reviews its own branch (T021, T073); no agent configuration changes, so the gate's agent-config evals don't run for these branches | PASS |
| Workflow step 7, "A feature without a graph is not done" | "Visits that walked" joins §7.8 and the dashboard in the event's phase (T054, T055) | PASS |
| Workflow step 8 (ADR, how-we-build) | ADR 0039 records the walking view's decisions; the process doesn't change | PASS |

Gate result: **PASS**, with the spec's one named deviation.

## Project Structure

### Documentation (this feature)

```text
specs/008-visitor-movement/
├── intent.md   # the Author's words, verbatim, with Claude's reading beside them; draft
├── spec.md     # clarified provisionally 2026-11-07
├── plan.md     # this file: decisions (§1), data and interfaces (§3), the Author's runs (§5.3)
└── tasks.md    # test-first, by phase, with the consistency check at its end
```

### Source Code (repository root)

New files are marked `+`; the rest change.

```text
apps/web/
├── room/
│   ├── scene.yaml                 # the walking block, written out with the spec's defaults
│   ├── looks/inked-cel.yaml       # highlight (and painted.yaml, flat.yaml)
│   ├── ui-words.yaml              # walk.enter, walk.leave, walk.region, walk.help, walk.entered, walk.left, walk.target
│   └── README.md                  # the walking block and the highlight
├── build/room/
│   ├── schema.ts                  # walking (optional), look highlight (optional), the UI keys
│   ├── emit.ts                    # writes both, resolved, into the index and the 3D part
│   ├── compose.ts                 # runs the RW family after RL
│   ├── checks/family.ts           # the RW family and its two rules in the catalogue
│   ├── checks/ri.ts               # RI4 on the highlight's colours (§10)
│   ├── checks/rw.ts             + # RW1 (the figure's start), RW2 (the highlight's contrast)
│   ├── checks/rg.ts               # RG6 with the walking control's box reserved, in 3D
│   └── report.ts                  # RW lines; the control box's line
├── build/manifest.ts              # unchanged code; event_kinds follow EVENT_KINDS
├── src/room/
│   ├── compose/bundle.ts          # the types: index flat.highlight, 3D part walking and look.highlight
│   ├── compose/pick.ts            # reserved rectangles in pickProblems and listOnly
│   ├── compose/stages.ts          # the walking control's box, pinned to room.css
│   ├── compose/project.ts         # ray(camera, aspect, ndc), for floor taps
│   ├── compose/floor.ts         + # the walkable floor and its obstacles (the compositor's RW1 too)
│   ├── walk/target.ts           + # the targeting reducer (entry chunk)
│   ├── walk/movement.ts         + # step, slide, walk-to; the figure's pose
│   ├── walk/camera.ts           + # the follow camera: limits, region, transitions
│   ├── walk/reach.ts            + # reach
│   ├── walk/input.ts            + # keys, drags, pinch, wheel, taps → intents
│   ├── scene/highlight.ts       + # the 3D highlight's two hull passes
│   ├── scene/figure.ts          + # the figure driver: the flat cut-out's
│   ├── scene/walking.ts         + # the walking view in the 3D stage, run each frame
│   ├── scene/bundle3d.ts          # members' draws per selectable; the picker's setCamera; the paper's parent
│   ├── scene.ts                   # createScene: highlight, walking, the stage's new methods
│   ├── stage.ts                   # Stage.setTarget; SceneOptions.target; Stage3D.walk
│   ├── objects.ts                 # hover and press as targeting inputs; taps
│   ├── a11y.ts                    # list focus as a targeting input
│   ├── app.ts                     # the target store; the walking control; walk_started; announcements
│   ├── layout.ts                  # the walking control in the stage; the walking view's focus
│   ├── room.css                   # the control; the focus; touch-action while walking; the 2D highlight
│   ├── flat.ts                    # the 2D highlight
│   ├── events.ts                  # walk_started
│   ├── ui-keys.ts                 # the seven keys
│   └── signals/frame-log.ts       # walk and target events
├── src/lookdev/stage.ts, page.ts       # the walking view, the scripted walk, a highlight sample (§10)
└── test/room/*.test.ts, test/ui/*.test.ts, test/lookdev/*.test.ts
config/room-events.yaml            # generated: walk_started
services/gateway/test/integration/room-events.test.ts, unit/room-events-config.test.ts
docs/data-flow-disclosure.md       # row V4's trigger
docs/adr/0039-the-walking-view.md + and docs/adr/README.md
specs/000-local-foundations/contracts/telemetry.md   # §7.8's panel
deploy/grafana/dashboards/h4-runtime.json            # the panel
```

**Structure Decision**: everything lives in spec 004's workspace layout: pure, renderer-free code in `src/room/compose/` (shared with the compositor) and `src/room/walk/` (the runtime's); three.js code in `src/room/scene/`, imported only by the lazy 3D chunk; DOM code beside `app.ts`. The walking modules, `walk/input.ts` among them, are imported only by `scene/walking.ts`, so they stay out of the entry chunk; only `walk/target.ts`, the 2D highlight, and the walking control's wiring in `app.ts` and `layout.ts` join it.

## 1. Decisions (research)

- **R-01, the follow camera** (Q1; FR-023): spherical coordinates about a focus at the figure's feet raised by the focus height: yaw about +Y from straight into the room (the production framing's −Z), pitch down from level, distance. Limits from the walking data; the farthest distance is `|framing(aspect, boxes).position − focus|`, the production framing's camera's distance from the figure at the stage's aspect (spec 004's `compose/framing.ts`), so the walking view never shows the room smaller.
- **R-02, the camera's region** (FR-024): in front of the open face by 0.05 m, within the side walls' inner width less 0.05 m, and at least 0.1 m above the floor, all from the shell's catalog bounds in the 3D part. From there every line of sight into the cube crosses the open face, so no wall can stand between. A request outside it keeps its distance and reduces the yaw until inside, then the pitch, then the distance, deterministically. With the defaults (minimum 1.2 m, yaw 60°, pitch 35°) and the default scene, the region binds only near the side walls.
- **R-03, movement** (FR-025, FR-026, FR-028): the footprint is a circle on the floor's plane; obstacles are axis-aligned rectangles (the frame boxes' floor-plane extents) grown by the radius, and the floor a rectangle shrunk by it at the walls, its front bound the open edge less the figure's half-depth. A step moves along x, resolves, then along z, resolves, so a blocked diagonal slides. A frame's time is cut into steps of at most 50 ms, so a slow frame can't tunnel through a thin obstacle. Movement is relative to the camera's yaw. Deterministic, for seeded tests.
- **R-04, obstacles** (FR-026, FR-027): every placement whose frame box's vertical extent meets [0, the figure's height] (the visitor's catalog height at its scale), other than the shell and the visitor's own figure; the twin, the desk, the floor pieces, and the side-wall pieces fall in by that rule, with no list of IDs (spec 004's FR-007 forbids one in code). `compose/floor.ts` computes them from the 3D part's placements, and the compositor's RW1 calls the same function.
- **R-05, reach** (FR-033): for each selectable, the nearest point of each member's floor-plane rectangle to the footprint's edge; within the reach distance and within the cone about the heading measured to that point; the nearest selectable wins, ties to scene order. Computed at entry and whenever the figure's place or heading changes.
- **R-06, the targeting reducer** (FR-007 to FR-013): state `{target, input, consumed}`; events `name(input, id | null)`, `select(id)`, `reset()`. A `name` with an ID sets the target and its input, unless the ID is `consumed`, which a selection sets; a `name` with null clears the target only when its input set it; any `name` of another ID, or of null, clears `consumed`. `reset` (the hand-off, and the fall to 2D) clears all; leaving the walking view is reach naming null. Pure, tested by table.
- **R-07, the 3D highlight** (FR-014 to FR-019, FR-049): proxies that share the geometry of the target's member meshes, their world matrices copied from their sources each frame, in a scene of their own; drawn after the look's frame (`ink.render`) in two hull passes, the edge at the band's plus the edge's width, then the band at its own, each a back-face hull extruded in screen space as three's `OutlineEffect` extrudes its ink lines, its thickness from CSS pixels by `scene/look.ts`'s `outlineThickness`, depth-tested and not depth-written so the band draws cleanly over the edge. A hull material of the plan's own, not the look's `OutlineEffect` instance: that instance gives every material one shared set of parameters, is switched off at quality 2 and 3 (R-35), and draws nothing in the painted and flat looks. The members' draws are what each member's placement draws, minus the placements mounted on it that aren't members and the switch cases' groups mounted on it, so the neon sign and the charger's plug stay out. (The lookdev page's vignette reads a placement the same way but keeps its switch cases, which a highlight mustn't.) Rebuilt when the target changes or a member's model swaps (the loader's swap callback). The brief's "reuse that pass" is read as reusing its technique and thickness rule.
- **R-08, the 2D highlight** (FR-046): per selectable, a hidden group of two rectangles around its hit rectangles' union, an edge and a band, its `stroke` and `stroke-width` as attributes from the index's resolved highlight (the allowlist already admits both), and two room.css classes that set `fill: none` and `vector-effect: non-scaling-stroke`, so widths are CSS pixels. The target's group shows, and its dashed cue hides.
- **R-09, the walking control** (FR-020, FR-021, FR-041): a button in the stage's bottom-right corner, a fixed box (9rem × 2.75rem, inset 0.5rem) that room.css sets and `compose/stages.ts` pins as it pins the stage's rules; its words wrap inside it. RG6 reserves that box at every supported stage in 3D: an exclusive core under it is refused, unless it is a side-wall selectable's, which the carve-out then holds (§3.5). In the default scene the corner holds the floor and the twin's feet, and no core.
- **R-10, input** (FR-029 to FR-031): letters by `KeyboardEvent.code` (W, A, S, D, Q, E, R, F as physical keys, so other layouts keep the shape), arrows, Enter, Escape, `+`, `=`, and `−` by `key`; keys only on the walking view's focusable element. Pointers by Pointer Events: a press beyond the tap slop is a drag (turn and tilt); two touch pointers are a pinch (zoom); the wheel zooms, a trackpad's pinch arriving as a wheel with `ctrlKey`. While walking, the canvas takes `touch-action: none` and the wheel listener isn't passive; while not, both stay as today. Held keys and drags are dropped on the walking view's `blur`, the window's `blur`, a hidden page, and leaving (FR-029).
- **R-11, floor taps** (FR-030 to FR-032): `compose/project.ts` gains `ray`, the inverse of its projection, through the follow camera; its hit on the plane y = 0 inside the floor's rectangle is the walk's goal. A tap first tries the pick at its point (FR-035); only a miss walks.
- **R-12, the figure driver** (FR-034): the interface takes the pose each frame. The flat cut-out's driver puts the figure's placement node at the pose's place, turns the picture to face the camera (yaw only), mirrors it by the side of the camera's right vector the heading falls on, keeping its last side within ±0.2 so it doesn't flicker, and bobs it by at most 0.015 m with each 0.35 m walked while the motion store animates. The kept paper is parented to the visitor's picture when the hand-off ends, its world transform kept, so it walks and mirrors with the figure. A rigged avatar's driver, later, turns to the heading and crossfades its idle and walk clips by speed; ADR 0039 names what it needs (a walk clip, which ADR 0010's first set lacks).
- **R-13, the walking view's focus** (FR-042): the layout's view container, `.room-stage-view`, which holds the canvas, takes `tabindex="0"`, `role="application"`, `aria-label` (`walk.region`), and `aria-describedby` to a visually hidden `walk.help`, only while walking; the canvas inside stays `aria-hidden`, which axe's `aria-hidden-focus` allows, since the canvas itself is never focusable. `role="application"` lets a screen reader pass the arrow keys through while the visitor walks; the list stays the way to choose.
- **R-14, the scripted walk** (FR-050): waypoints at the walkable floor's corners, shrunk by 0.05 m, walked in a loop by the walk-to rule for 2 minutes with the camera following, the target set by reach and cleared by a scripted selection on the way; deterministic, so two runs measure the same walk.
- **R-15, the event** (FR-051): a page-memory flag set at the first entry; `walk_started` through the room's `EventSink`, which `build/manifest.ts` turns into the manifest's `event_kinds` and `config/room-events.yaml`'s `kinds`. The gateway's route already takes a kind with no ID from its file; its code doesn't change.

## 2. The changes to the room's existing files

- **`app.ts`**: creates the target store (`walk/target.ts`) and routes each input to it: the stages' `target(input, id)` callback (hover, press, and reach), and the list's focus callback. Hands every change to `stage.setTarget`. `selectObject` stays the one path and calls `store.select(id)` in the same call (FR-011). The hand-off and the fall to 2D reset the store. Wires the walking control: `stage.walk.enter(focusElement)` and `leave()`, the focus moves of FR-022, the end of walking on `toFlat`, `walk_started` once a visit (FR-051), and the announcements of FR-043 through the existing polite region. Records `walk` and `target` in a drafts build's frame log.
- **`stage.ts`**: `Stage` gains `setTarget(id: string | null)`, which both stages implement. `SceneOptions` and the 2D stage's options gain `target(input, id)`. `Stage3D` gains `walk`: whether walking, `enter`, `leave`, and callbacks for a leave asked by Escape and for a step that failed (FR-005).
- **`compose/pick.ts`**: `pickProblems` and `listOnly` take an optional list of reserved rectangles; a core overlapping one is the new problem `reserved`. `pick` doesn't change. The compositor passes the walking control's box in 3D (§3.5); the runtime passes it at the production framing, so a side-wall selectable whose core falls under the control is held there exactly as the compositor reports.
- **`scene/bundle3d.ts`**: `selectablePicker` gains `setCamera(camera)`, recomputing the areas and the held set at the follow camera at most once a frame (FR-035); a function gives each selectable's members' draws (R-07); the kept paper's parent moves to the visitor's picture at the hand-off's end (R-12).
- **`scene.ts`**: draws the highlight after `ink.render`; keeps its thickness on resize as the ink's; leaves it drawing whatever `setQuality` does to the ink; runs the walking view's frame before drawing while walking; implements `setTarget` and `walk`; guards the walking step, ending the walk on an error (FR-005).
- **`objects.ts`**: `bindPointerSelection` reports a hovering pointer's pick on each move and its leaving, and a press's pick from its start until it ends, is cancelled, or moves beyond the slop, as targeting inputs; a tap still selects, through a callback the 3D stage can turn into a walk when nothing is picked.
- **`a11y.ts`**: the list's buttons report focus and blur, by their `data-object-id`, as a targeting input.
- **`layout.ts`** and **`room.css`**: the walking control in the stage, inert with the rest during the hand-off; its box; the walking view's focus ring; `touch-action: none` and the cursor while walking; the 2D highlight's classes.
- **`flat.ts`**: the 2D highlight (R-08); `setTarget`; no walking.
- **`events.ts`**, **`ui-keys.ts`**, **`signals/frame-log.ts`**: the kind, the seven keys, and the two log events.

## 3. Data and interfaces

### 3.1 The scene's `walking` block (FR-056; optional, with these defaults; the default scene writes it out)

| Field | Default | Range | Spec |
|---|---|---|---|
| `speed_mps` | 1.0 | 0.3 to 2.0 | FR-028 |
| `turn_dps` | 90 | 30 to 180 | FR-028 |
| `tilt_dps` | 45 | 15 to 90 | FR-028 |
| `radius_m` | 0.12 | 0.05 to 0.4 | FR-026 |
| `reach_m` | 0.8 | 0.2 to 1.5 | FR-033 |
| `reach_cone_deg` | 60 | 15 to 90 | FR-033 |
| `camera.yaw_deg` | 60 | 0 to 75 | FR-023 |
| `camera.pitch_deg` | [0, 35] | each 0 to 60, the first at most the second | FR-023 |
| `camera.min_distance_m` | 1.2 | 0.5 to 3.0 | FR-023 |
| `camera.focus_height_m` | 1.1 | 0.5 to 2.0 | FR-023 |

A key outside the schema, or a value outside its range, is refused by spec 004's RD2 and RD3. The 3D part carries the block resolved; the index carries none of it.

### 3.2 A look's `highlight` (FR-015, FR-057; optional, with Q5's defaults; the three looks write it out)

`highlight: { band: <colour>, band_px: 3, edge: <colour>, edge_px: 1.5 }`, colours a palette name of the look or `#rrggbb` (spec 004's RI4), `band_px` 2 to 8, `edge_px` 1 to 4. Defaults: `band: "#ffd23f"`, `edge: ink` (inked cel's `#1a1a1a`; each look names its own ink). The 3D part's `look` carries it resolved; the index gains `flat.highlight: {band, band_px, edge, edge_px}`, resolved to `#rrggbb`, for the 2D drawing.

### 3.3 The UI words (FR-059; spec 004's closed list, `ui-keys.ts`)

| Key | Default words | Slots |
|---|---|---|
| `walk.enter` | Walk around | – |
| `walk.leave` | Stop walking | – |
| `walk.region` | The room, walking | – |
| `walk.help` | W, A, S, D or the arrow keys walk. Q and E turn the view, R and F tilt it, plus and minus zoom. Enter opens what's highlighted. Escape stops walking. | – |
| `walk.entered` | Walking. Escape stops. | – |
| `walk.left` | Walking stopped. | – |
| `walk.target` | {name}: press Enter to open. | `{name}`, a selectable's name |

### 3.4 The event (FR-051) and the frame log (FR-054)

- `walk_started`: in `events.ts`'s `EVENT_KINDS`, after `mode_2d`; body `{"kind": "walk_started"}`; no `id`.
- The frame log's events gain `walk`, with `state` `entered` or `left`, and `target`, with `id` (a selectable's ID or null) and `input` (`pointer`, `press`, `focus`, `reach`, `select`, or `reset`).

### 3.5 The compositor's rules (FR-058)

| Rule | Refused | Spec |
|---|---|---|
| RW1 | The visitor figure's placement whose footprint, at the walking block's radius, isn't on the walkable floor that `compose/floor.ts` computes from the scene's frame boxes | FR-026, FR-058 |
| RW2 | A look whose highlight's band and edge both give under 3:1 against any colour of its palette | FR-016, FR-058 |
| RG6 (extended) | At any supported stage, in 3D at the production framing, a selectable's exclusive core over the walking control's box, but a side-wall selectable's, which the carve-out holds there and the report names | FR-021, FR-058 |

The report gains a line for each: the figure's start and its clearance; each look's highlight with its lowest contrast against its palette; and the control's box, with any side-wall selectable it holds and where.

### 3.6 The modules' interfaces, in prose

- **`compose/floor.ts`**: from the 3D part's placements and pieces, the walking block, and the figures' roles, gives the walkable floor: its rectangle, its open edge, and its obstacles grown by the radius; and answers whether a point is walkable.
- **`walk/movement.ts`**: `step(pose, intent, dt, floor)` gives the next pose, sliding; a walk-to state carries its goal and its last progress, and ends as FR-032 says. The pose is the figure's place, heading, speed, and whether it walks.
- **`walk/camera.ts`**: from the pose, the requested yaw, pitch, and distance, the limits, the region, the stage's aspect, the production framing, and whether the motion store animates, gives the camera's position and target; and the transitions into and out of the walking view, at most 500 ms, or a cut.
- **`walk/reach.ts`**: from the pose and the selectables' members' frame boxes, gives a selectable's ID or null.
- **`walk/target.ts`**: R-06's reducer.
- **`walk/input.ts`**: binds keys to the walking view's focusable element and pointers and the wheel to the canvas, only while walking; each frame gives the intents (a movement vector in the camera's frame, turn, tilt, zoom, taps in normalized device coordinates, Enter, Escape) and unbinds on leave.
- **`scene/walking.ts`**: owns the pose, the camera state, the input, the walk-to, and reach while walking; each frame reads the intents, steps, follows, reaches, gives reach to the target callback, moves the picker's camera, and drives the figure; resolves taps through the picker, else the floor ray.
- **`scene/figure.ts`**: the figure driver interface and the flat cut-out's driver (R-12).
- **`scene/highlight.ts`**: given the room and the look's resolved highlight, sets and clears a target and draws its two passes after the look's frame; nothing without a target.

## 4. The order of work

### 4.1 The branches

| Branch | From | Holds | Merges |
|---|---|---|---|
| `feat/008-visitor-movement` | `spec/008-visitor-movement`'s tip, b95fd761, on `spec/007-twin-conversation` (aa22a3b2) on line R's final User Story 9 tip, 848a94d6 (§10) | Phase 1: setup, User Story 1, and User Story 6's checks for targeting | first, once line R's stack and the two spec branches have merged, in order |
| `feat/008-walking` | Phase 1's tip | Phases 2 to 8 | after `feat/008-visitor-movement` |

If line R's tip moves before these merge (a rebase onto `main`), an agent rebases both branches onto it, in order; agents never merge (`CLAUDE.md`). Each branch ends with a review by an agent that didn't write it and a merge-request note in `docs/merge-requests/`, holding `make check ENGINE_MODE=none-yet`'s whole output.

### 4.2 What can run in parallel

The main session asked "see what can be done in parallel". Each lane below touches its own files, so agents can work them in their own worktrees, one per agent that writes, their commits cherry-picked onto the phase's branch in the order the tasks give.

| Lane | Files | Waits for |
|---|---|---|
| A, the pure walking kernel | `compose/floor.ts`, `walk/movement.ts`, `walk/camera.ts`, `walk/reach.ts`, `compose/project.ts`'s `ray`, their tests | the types of B's T035 |
| B, data and compositor | `schema.ts`, `emit.ts`, `compose.ts`, `checks/family.ts`, `checks/rw.ts`, `checks/rg.ts`, `report.ts`, `compose/bundle.ts`, `compose/pick.ts`, `compose/stages.ts`, the data files | nothing |
| C, the 3D stage | `scene/walking.ts`, `scene/figure.ts`, `scene.ts`, `scene/bundle3d.ts` | A, and B's types |
| D, the room's DOM | `walk/input.ts`, `layout.ts`, `room.css`, `app.ts` | C's `Stage3D.walk` interface (T042 states it first) |
| E, the 2D highlight | `flat.ts`, its room.css classes, its tests | Phase 1's reducer and B's index field |
| F, telemetry and documents | `events.ts`, `config/room-events.yaml`, the gateway's tests, the disclosure, §7.8, the dashboard, ADR 0039, the README | nothing; the disclosure lands in the commit that adds the kind |
| G, lookdev | `src/lookdev/stage.ts`, `page.ts` (§10) | C |

Phase 1 itself has two parallel lanes: the compositor's highlight data (B) and the reducer with the highlight pass (A and C), joined in `app.ts`.

### 4.3 The phases

1. **Phase 1, the target and its highlight on today's camera** (User Story 1, with User Story 6's checks for it): lands first.
2. **Phase 2, the walking foundation**: the data, the compositor's rules, the pure kernel, and the stage's interface.
3. **Phase 3, walking on the desktop** (User Story 2), with the event, row V4, and the panel.
4. **Phase 4, walking by touch** (User Story 3).
5. **Phase 5, accessibility and reduced motion** (User Story 4).
6. **Phase 6, the 2D room** (User Story 5); it can start right after Phase 1, beside Phase 2.
7. **Phase 7, the rest of the degraded mode** (User Story 6).
8. **Phase 8, polish**: lookdev's scripted walk, the documents, the reviews and notes, and the Author's runs.

## 5. Tests

### 5.1 The agents' tests (inside `make test`)

| File | What it proves | Spec |
|---|---|---|
| `test/room/target.test.ts` (new) | the reducer, by table: latest input wins; a null clears only its own input's target; select clears and consumes; reset | FR-007, FR-012, SC-001 |
| `test/room/highlight.test.ts` (new, Node with three's objects, no renderer) | the target's draws (the laptop's three members, not the neon sign or the plug); none without a target; a model swap followed; two passes in order, at every quality level and look, by a spy renderer | FR-014, FR-017, FR-019, FR-049, SC-002 |
| `test/room/compose.test.ts`, `schema.test.ts`, `report.test.ts` (extended) | the highlight and walking schemas, defaults, and ranges; RW1 and RW2, each with a known-bad fixture; the index's and the 3D part's new fields; determinism | FR-016, FR-056 to FR-058, SC-002 |
| `test/room/data-only.test.ts` (extended) | the walking speed, a camera limit, the reach, a highlight colour, and the desk's move are data edits | FR-027, FR-056, FR-057, SC-006 |
| `test/room/pick.test.ts`, `geometry.test.ts` (extended) | reserved rectangles in `pickProblems` and `listOnly`; RG6's reserved box, with a known-bad fixture and a held side-wall core; the default scene's RG6 and RG7 results unchanged | FR-021, FR-036, FR-058, SC-007 |
| `test/room/stages.test.ts` (extended) | the walking control's box pinned to `room.css`, at least 44 × 44 | FR-021 |
| `test/room/ray.test.ts` (new) | `ray` inverts `project` within 1e-9; the floor's hit, and none off it | FR-032 |
| `test/room/figure.test.ts` (new, Node with three's objects) | the cut-out's place, turn, mirror with its hysteresis, and bob; none while not animating; the paper with it | FR-034, FR-044 |
| `test/disclosure.test.ts` (extended) | row V4's Trigger names `walk_started`'s | FR-055, SC-014 |
| `test/room/floor.test.ts` (new) | obstacles by rule, not ID; the default scene's walkable strip; moved copies follow; the figure's start walkable | FR-026, FR-027, SC-003, SC-006 |
| `test/room/movement.test.ts` (new) | seeded walks of 10,000 steps on four scenes: never off the floor or in an obstacle; slides; walk-to's stop rules; first-frame start and stop | FR-025, FR-026, FR-028, FR-032, SC-003 |
| `test/room/camera.test.ts` (new) | 10,000 seeded requests inside the region and the limits; the farthest distance the production framing's; the return within 1e-9; 500 ms or a cut | FR-022 to FR-024, FR-044, SC-004, SC-005 |
| `test/room/reach.test.ts` (new) | distance, cone, nearest, ties to scene order; a side-wall board reached | FR-033 |
| `test/room/walking.test.ts` (new, Node with three's objects) | the orchestrator over a fake input: steps, follows, reaches, drives the figure, the paper moving with it; a thrown step ends the walk; a restored context goes on | FR-005, FR-006, FR-034, FR-035 |
| `test/room/frame-log` cases in `test/room/live.test.ts` (extended) | `walk` and `target` entries in a drafts build; none in a release build | FR-054 |
| `test/ui/highlight.test.ts` (new, jsdom, with a stand-in scene module) | hover, press, list focus, selection, the hand-off, held boards; one `object_selected`; nothing else sent | FR-007 to FR-013, FR-040, SC-001 |
| `test/ui/walking.test.ts` (new) | the control's offer, words, inertness, and absence in 2D; focus; the keys, and their drop on blur; Escape; Tab; "2D view" ending the walk; the announcements; `walk_started` once | FR-003, FR-020 to FR-022, FR-029, FR-041 to FR-043, FR-047, FR-051, SC-008, SC-011, SC-014 |
| `test/ui/touch.test.ts` (new) | taps, drags, pinches, and the wheel by synthetic Pointer Events; outside walking, today's behaviour and `touch-action` | FR-030, FR-031, SC-009 |
| `test/ui/a11y.test.ts`, `pause.test.ts`, `degraded.test.ts` (extended) | axe with walking on and off; reduced motion and pause; every degraded state, with network spies | FR-002, FR-044, FR-045, SC-008, SC-010, SC-012 |
| `test/room/flat.test.ts` (extended) | the 2D highlight; the allowlist's one addition; no control | FR-046, FR-047, SC-011 |
| `test/manifest.test.ts`, `test/room/generated.test.ts` (extended); the gateway's route and config tests | `walk_started` in `event_kinds` and `config/room-events.yaml`; 204 without an ID, 400 with one | FR-051, SC-014 |
| `deploy/scripts/test_dashboard.py` (unchanged code) | §7.8's new panel and the dashboard agree | FR-053, SC-014 |
| `test/lookdev/*.test.ts` (extended) | the scripted walk's waypoints and determinism; the highlight sample; drafts builds only | FR-050 |

### 5.2 RED first

In each phase the test tasks come first and must fail before the code that makes them pass; each branch's note records the RED and GREEN runs.

### 5.3 The Author's runs (the quickstart)

- **L1, the highlight at lookdev** (SC-002): the lookdev page in a drafts build, on both reference stages, each of the three looks, the highlight sample on each selectable against its light and dark neighbours, with the studio's pieces in place; the Author keeps Q5's colours or changes them as data.
- **L2, the phone** (SC-013, User Story 3): the lookdev page's phone copy (spec 004's FR-069), the 2-minute scripted walk, the report's median, share over 33 ms, and settled quality beside the static view's; then the walking view by touch: tap, drag, pinch, a tap on a piece, the page's scroll from the stage with walking off.
- **L3, keyboard and screen reader** (SC-008): spec 004's Q9 runs again, with the walking view: a keyboard-only visit, and a screen-reader visit that never walks.

## 6. Expected cost, and how it is measured

As the spec's Expected Cost Impact: $0 model spend; at most one beacon of about 25 bytes per visit that walks; an estimated 10 to 20 KB gzipped in the lazy 3D chunk and 2 to 4 KB in the entry chunk. Measured by the build's chunk sizes in each branch's note, and by the "Visits that walked" panel.

## 7. Degraded mode and telemetry

The spec's Degraded-Mode Behavior table is the design: every input and view runs on the device; the fall to 2D ends the walk; a failing step returns to the production framing. Telemetry is `walk_started` and the panel; a drafts build's frame log carries the walk and the target for the Author's runs.

## 8. Risks

| Risk | Mitigation |
|---|---|
| The hull passes cost too much on the phone with large studio models | at most two passes over the target's meshes, which spec 004's caps bound (40,000 triangles a piece); L2 measures; the quality controller steps down as today |
| The cube is tight: a strip about 0.27 m deep | the walking data tunes the radius; the figure slides rather than sticks; L1 and L2 judge it |
| Gestures fight the page's scroll on phones | `touch-action: none` only while walking (Q2); SC-009 |
| `role="application"` behaves differently across screen readers | the list stays the way to choose (FR-039); L3 |
| The flat cut-out looks odd turned and mirrored | lookdev judges; the rigged avatar replaces it through the same driver interface |
| Line R's tip moves | both branches rebase onto it, in order |
| Intent 005 changes the layout first | it re-measures the control's box and `stages.ts`'s pins; the walking view doesn't depend on the layout |
| Loose pick boxes at oblique cameras pick a neighbour | the same boxes the compositor measures; the list is the equivalent control (FR-038) |

## 9. Complexity Tracking

No constitution violation needs justifying. One new rule family, RW, joins spec 004's nine, named in §3.5.

## 10. Departures

A task that departs from this plan records it here, in the commit that departs (`CLAUDE.md`: "If implementation departs from the plan, update `plan.md` in the same commit"); a correction of this plan's reading of the code lands in the commit of the first code that depends on it.

### Phase 1, as built on `feat/008-visitor-movement` (2026-11-07)

- **The base (T001, T002), a correction.** This plan read line R's code at f9524081. Line R has since been restacked onto `main` (e189cc84), and its final tip, `feat/004-us9-neon-sign`, is 848a94d6. The branch was cut from `spec/008-visitor-movement`'s tip, b95fd761, which stacks on `spec/007-twin-conversation` (aa22a3b2) on 848a94d6, so this folder's four documents were already in its tree and T002 had nothing to pick; spec 007's four documents are in it too, merged first with their own branch. Every file, function, and hook §1 to §3 name for Phase 1 was checked at 848a94d6: `objects.ts`'s `bindPointerSelection` and `TAP_SLOP_PX`; `a11y.ts`'s list buttons and their `data-object-id`; `app.ts`'s `selectObject`, `toFlat`, `open`, and frame log; `stage.ts`'s `Stage` and `SceneOptions`; `scene.ts`'s `ink.render`, resize, `setQuality`, and the loader's swap; `scene/look.ts`'s `createInk` and `outlineThickness`; `scene/bundle3d.ts`'s placement nodes and pictures; `compose/pick.ts`'s `pick` and `listOnly`; `signals/frame-log.ts`'s events; the three looks, each with an `ink` in its palette; and the compositor's catalogue (`checks/family.ts`'s `FAMILIES` and `RULES`, `compose.ts`'s `FAMILY_ORDER`). They stand as §1 to §3 describe them, but for the entries below.
- **RI4 holds the highlight's colours, in `build/room/checks/ri.ts` (T012).** §3.2 gives the colours "a palette name of the look or `#rrggbb` (spec 004's RI4)", but T012's files leave out `checks/ri.ts`, where RI4's look check (`inks`) lives. It now holds `highlight.band` and `highlight.edge` to the look's own palette, as it holds `outlines.color`, in every look; RW2 judges no colour RI4 refuses.
- **The edge's default is the look's ink, its `outlines.color` (T012).** §3.2's default, "`edge: ink` (… each look names its own ink)", is read as each look's outlines' colour, which RI4 already holds, so a look with no colour named `ink` (the fixture set's) takes its own ink rather than a name RI4 would refuse. The schema leaves `edge` out by default and the compositor fills it; the three repository looks write `edge: ink` out.
- **Phase 1's catalogue holds RW2 alone (T012).** §3.5's RW1 checks the visitor figure's start against the walkable floor, which comes with the walking data (T041). RW joins `FAMILIES` with its one rule now, and `compose.test.ts`'s catalogue test lists RW2 after spec 004's nine families until RW1 joins.
- **RW2's finding, and the report's section (T012).** One finding a look, at `highlight`, naming the palette colour the better of the two tones gives least against, by its name, with both contrasts, cut to two decimals so a figure under 3:1 never reads 3.00:1. The report's Highlight section, after the switches, gives each look's resolved band and edge with their widths, its lowest contrast, and that colour, through RW2's own `highlightContrasts`; a look RT2 refused is named `looks[<n>]`. The index's `flat.highlight` is the last field of `flat`.
- **The hull's push (T014).** R-07's hull follows OutlineEffect's technique, its back faces pushed out in screen space, with two changes so the border is its CSS pixels wide. Each vertex is pushed along its hull normal, the mean of every normal at its position, made once a geometry and sharing the geometry's positions and index, so a hard-edged box or model pushes its corners out whole, with no gap where its faces meet. And the push is measured on both axes, `outlineThickness` for the stage's width and for its height, where the ink lines take the height's on both and so draw vertical lines the aspect's times too thick. A flat plane seen face-on has no silhouette to push; the room's flat stand-in parts lie on boxes, whose hulls border them. For L1: a wall-hung piece's back faces lie on its wall, so part of its border on the wall's side may sink behind the wall's depth; T023 judges whether that shows.
- **The members' draws (T014).** `memberDraws` takes the meshes under each member's own picture nodes, `standin`, `model`, and `cutout`, by name, so `bundle3d.ts` doesn't import the loader, whose chunk stays apart (`highlight.test.ts` holds the loader's `MODEL_NODE` to the name). It takes them shown or not; the highlight draws, each frame, only those that show up to the room's scene.
- **A press's end (T016), a reading of FR-008 (b) and FR-012.** A press names its start's pick until it ends. Its end names nothing for a finger, as the pointer leaving, and for any press that selected nothing; a mouse's or a pen's press that selected leaves the target to its next hover, so the piece it selected isn't targeted again while the pointer rests there (User Story 1, scenario 3). A press with a mouse's other buttons isn't one: its moves stay hovers.
- **The store (T018).** It starts empty and takes no input until the hand-off's offer is answered, so the hand-off needs no reset of its own; the fall to 2D resets it (R-06). It takes a name only for a selectable the index lists.
- **A stage that throws taking a target (T018's guard).** `app.ts` calls `setTarget` in a guard of its own, as it guards the stage's `setText`, so a stage that throws there keeps what it drew while the selection, its event, its topic, and the list go on, and the room keeps drawing (FR-005's rule, never a blank or frozen scene, for the target). Found writing this branch's degraded-mode table, and built test first: the test failed without the guard, and passes with it.
- **The highlight sample's control is in `src/lookdev/page.ts`, not `controls.ts` (T019).** `controls.ts` holds the page's widgets, which the control is made from, and `page.ts` builds the panels, as User Story 9's T267 found (spec 004's plan.md §10). A run sets the highlight aside while it measures, as it turns Labels on, so its results describe the room as visitors get it and keep contracts/lookdev.md §6's fields; the Author's choice comes back after the run.
- **Test files beyond §5.1's list**, each in the RED commit or a test-only commit: `test/helpers/room.ts` (the stand-in stage records `setTarget`, as T015 has it), `test/lookdev/page.test.ts`'s stand-in renderer (it reports each scene it draws), two known-bad cases, `bad/RW2/` and `bad/RI4-look-highlight/`, and `test/room/bundle.test.ts`, whose exact shapes of the index's `flat` and the 3D part's `look` gain `highlight`, Amendment M12's two fields, found running the whole suite after the code.
- **Chunk sizes (T020).** gzip-9 bytes of a release build, each from a `git archive` export under an empty policy directory, built with Node 24.21.0: the entry's JavaScript and CSS, which `index.html` loads, 31,079 at b95fd761 and 31,556 with Phase 1 (+477: the JavaScript 28,771 to 29,248, the CSS 2,308 both), of spec 002's 150 KB (153,600); the 3D chunk 167,271 to 168,615 (+1,344); the loader's chunk 15,992 to 15,993; and the index, as `chunk.test.ts` counts it, 4,771 to 4,811 (+40) of spec 004's 16,384. §6 estimates 2 to 4 KB for the entry and 10 to 20 KB for the 3D chunk over the whole spec; Phase 1 takes under half a kilobyte of the first and under 1.5 KB of the second.

## Constitution Check (post-design)

Re-checked after §1 to §5: the design adds no flow beyond `walk_started` (I), every FR has a test or an Author's run (II), the order keeps code behind the Author's approval and merges behind line R's (III), nothing is widened (IV), the cost stays at $0 for models (V), and the AI disclosure is held visible by SC-012 (VIII). **PASS**, with the spec's one named deviation.
