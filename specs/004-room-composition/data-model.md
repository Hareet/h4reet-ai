# Data Model: Room Composition (spec 004)

Phase 1 output of `/speckit-plan`. The room's content is files in the repository, checked and composed at build time into one bundle. No server stores anything new: what the room learns at run time (the tier, the visit's cost, the pause) lives in page memory and leaves with the page. This file names each entity, its fields and their rules, how the entities relate, and their states. The contracts give the formats in full, and [research.md](research.md) records the decisions behind them. Spec 002's room code (`apps/web/`, on `feat/002-us6-events`) and spec 003's intake (`assets/` and `scripts/assets/` on `feat/003-us5-comparison`, the arrival check as the Author's patch) aren't on this branch, so their files are named in code spans.

A dagger (†) marks a field that never reaches the built site (FR-012).

## 1. Where things live

| Entity | Where | Written by | Spec |
|---|---|---|---|
| Catalog entry, one per piece (§3) | `apps/web/room/catalog/<piece>.yaml` | agents; read by `REVIEW.md`'s "Room data" pass (P-7) | FR-001, FR-002 |
| The scene: placements, mounts, face bindings, switches, selectables, the hand-off's anchors, the live configuration, the survey, retired IDs (§4) | `apps/web/room/scene.yaml` | agents, reviewed | FR-001, FR-003, FR-004, FR-026, FR-078 |
| Topics (§5) | `apps/web/room/topics.yaml` | agents, reviewed; the Author chooses the topics | FR-036 |
| Room-text block (§6.1) | `apps/web/content/room/<block>.yaml` | agents draft; the Author approves its SHA-256 with the kind `room-text` | FR-030, B9 |
| A sign's outline (§6.2) | `apps/web/content/room/outlines/<sign>.outline.json` | traced in the studio from the Author's design, or by the Author with a local tool over a photo inside the photos folder; brought in by the Author; approved like a block | FR-032 |
| UI words (§6.3) | `apps/web/room/ui-words.yaml` | agents, reviewed like spec 002's `messages.yaml` | FR-029, FR-035 |
| Looks (§7.1) | `apps/web/room/looks/<look>.yaml` | agents; the Author chooses one in lookdev, recorded in ADR 0010 | FR-005, FR-070 |
| The typeface lock (§7.2) | `apps/web/fonts/fonts.lock`, schema 2 | agents, from npm tarballs | B10 |
| Fixtures; the lookdev vignette (§8) | `apps/web/room/fixtures/<fixture>.yaml`; `apps/web/room/lookdev.yaml` | agents; drafts builds and tests only | FR-049, FR-066, FR-070 |
| The caps' room block (§9.1) | `assets/policy/caps.json`, `per_asset.room` (human-only, read from `refs/heads/main`) | the Author (P-6) | FR-052, FR-053, C7 |
| Room models and image cards (§9.2) | `assets/room/<piece>.glb`, or a card `assets/room/<piece>.png` (`.jpg`, `.webp`), with `records.json` and `LICENSE.md` | the Author, through spec 003's intake | FR-015 to FR-023 |
| Approvals | `assets/policy/content-approvals.json` (room text), `assets/policy/approvals.json` (room files); human-only, read from `refs/heads/main` | the Author | FR-023, FR-030 |
| The bundle's index (§10.1) | `virtual:room-content`, export `room`, in the entry chunk | the compositor | FR-010, FR-011 |
| The bundle's 3D part (§10.2) | `virtual:room-scene`, in the lazy 3D chunk | the compositor | FR-011 |
| Published room text (§10.3) | `dist/room-data.json`, `room_text` | the build | FR-029, FR-061, B9 |
| The manifest's additions (§10.4) | `dist/room-manifest.json` | the build | FR-013, B7 |
| The events file (§10.5) | `config/room-events.yaml`, generated and committed | the build; the gateway reads it at start | FR-004, B7 |
| The topic mapping (§10.6) | `config/room-topics.yaml`, generated and committed | the build; the twin's spec reads it | FR-038 |
| Work orders and the photo guide (§10.7) | `docs/studio/work-orders/<piece>.md`, `docs/studio/photo-guide.md`, generated and committed | the build | FR-014, FR-026 |
| The studio contract's changes | `docs/studio/handoff.md`, hand-written | agents; the Author applies them to the studio's contract by hand | FR-024, FR-032 |
| Served models (§10.8) | `dist/a/<stem>.<hash16>.glb.gz` | the build | FR-079 |
| The compositor's report (§10.9) | the output of `npm run room:report`, pasted into each merge-request note that changes the room | the compositor | FR-073 |
| The tier and its poller, the cost channel, the motion store, each model's state (§11) | page memory | the browser | FR-041 to FR-050, FR-057, FR-059, FR-060 |
| A usage event | in flight only, then the counter `h4.room.events` | the browser, then the gateway | FR-071 (spec 002's shape, unchanged) |
| An asset event (§11.5) | page memory; sent only once switched on | the browser, then spec 001's relay | FR-071, C11 |
| A lookdev candidate and the results (§11.6) | page memory; the results copied out as JSON | the lookdev page; the Author | FR-067 to FR-069 |

## 2. Conventions every data file shares

- **Reading.** YAML 1.2, parsed as spec 002's `apps/web/build/content.ts` parses the resume: the `yaml` package's `parseDocument` with the core schema, unique keys, no merge keys, and aliases refused, so `off` is a string. JSON (the outlines) is parsed strictly, refusing duplicate keys. Every object is a zod `strictObject`: an unknown key, a missing required key, or a value outside its declared type refuses the file (RD). No data value is evaluated as code (FR-005). Numbers are finite.
- **Units.** Metres and degrees; +Y up, a piece's front facing +Z (FR-015). A position is `[x, y, z]`. A turn is `{x, y, z}` in degrees, each 0 when absent and at most 360 in size, applied in Y-X-Z order (§4.2).
- **IDs.** Four namespaces: piece, placement, selectable, topic. An ID matches `^[a-z][a-z0-9-]{1,40}$` (the gateway's grammar for event objects), is unique in its namespace, never equals a word of the code's closed vocabulary (so code can say `twin` as a role while the placement is `twin-figure`), and never takes a retired ID (§4.8). These are the IDs FR-007's source scan keeps out of code. Other names (an anchor, a pose, a glow, a switch, a room-text block, a look, a fixture, a palette colour, a glow tone, a `label.` UI word) follow the same grammar and are unique where they're defined; the scan doesn't cover them. A live face's role follows FR-018's object-name rule, `^[a-z0-9]+(-[a-z0-9]+)*$`, since the model's object carries it.
- **The closed vocabulary** (`apps/web/src/room/compose/vocabulary.ts`, code): the behaviour kinds `mount`, `frame`, `live-face`, `glow`, `switch`, `cable`, `selectable`; the renderers `terminal`, `desktop-session`, `neon`, `chalk`, `sign`; the signals `tier` and `turn-cost`, and the tier's eight values (§11.1); the turn-cost parts `call` and `visit`; the actions `talk` and `resume`; the roles `twin` and `visitor`; the stand-in shapes and 2D primitives (§3); the look methods (§7.1); the typeface uses `terminal`, `desktop-session`, `chalk`, `neon`, and `counters` (§7.1); the glow motions `flicker`, `breathe`, `steady`; the region source `resume_titles`; and the live switches `off` and `site` (§4.7). A new word is code, through the lifecycle (FR-005).
- **Estimates.** `estimated: true` on a size, an anchor, or a mount marks a figure not yet measured, such as a size estimated from the desk photo of 2026-10-22. Each adds a "Measure" line to its piece's work order and to the photo guide's layout checklist (FR-002, FR-026, FR-078).
- **Findings.** One line each, `<rule> <file>:<path>: <reason>`, with the path in the file's own terms (`placements[3].mount.anchor`; for a GLB, `nodes[4].name`, by index only). A reason names keys, indices, types, and IDs that have passed C9, never a data value; a C9 reason ends `(from <source>)` and never prints a private phrase (FR-009, FR-018). Findings are sorted by file, path, and rule, and all are reported. The rule families, distinct from spec 003's A, M, B, R, and F rules and spec 002's C and N rules: **RD** shape; **RI** identity and references; **RG** geometry (mounts, the framed set, framing, spacing, legibility); **RS** switches and claims; **RT** words; **RV** vector drawings; **RX** model fit; **RK** budgets and caps; **RL** the live configuration. The numbered rules are in [contracts/room-data-files.md](contracts/room-data-files.md) and [contracts/plain-model-fit.md](contracts/plain-model-fit.md).
- **Strict and lenient.** `make test` composes strictly: any finding fails it, and it runs the freshness checks of the generated, committed files. The image build behind `make up` is lenient for one kind of finding only, a finding about one piece's model file (its fit, RX, or its model over its budget, RK2): that piece keeps its stand-in, the build prints the same line prefixed `warn`, and the manifest lists the stand-in (FR-013). Every other finding fails every build.
- **Builds.** A drafts build is spec 002's `-drafts` image of dev or dev-cpu (`ROOM_DRAFTS=1`), or the phone copy of the vignette; a release build is any other (the spec's Terms).

## 3. The catalog entry (a piece)

`apps/web/room/catalog/<piece>.yaml`. FR-002, FR-051, FR-053.

```yaml
version: 1
id: <piece>                       # equals the file's stem
name: <visible name>              # for the work order and the report; never drawn
size: {w: 0.0, h: 0.0, d: 0.0, estimated: true}
stylized_scale: 1
origin:
  point: <the physical point on the dimension sheet>      # †
  bounds: {min: [x, y, z], max: [x, y, z]}
anchors:
  <anchor>: {at: [x, y, z], turn: {y: 0}, estimated: true}
live_faces:
  - {role: <role>, at: [x, y, z], size: [w, h], facing: [0, 0, 1], up: [0, 1, 0], px: [w, h], readable: true}
glows:
  - {id: <glow>, at: [x, y, z], radius: 0.0, tone: <tone>, motion: breathe, level: 1}
claims: {signal: tier, poses: {<pose>: <tier value or null>}}
standin:
  - {shape: box, size: [w, h, d], at: [x, y, z], color: <palette name or #rrggbb>}
drawing: {from: standin}          # or {primitives: [...]}
budget: {gzip_bytes: 0, triangles: 0, texture_px: 0, texture_bytes: 0}
model: {file: <piece>.glb}        # or {card: <piece>.png}; absent until the Author's file is set
work_order:                       # †
  method: <text>
  shots: [<text>]
  measurements: [<text>]
  studio_notes: <text>
```

| Field | Type | Rules |
|---|---|---|
| `version` | integer | `1` |
| `id` | piece ID | equals the file's stem |
| `name` | string, 1 to 60 characters | passes C9 (RT); used by the work order and the report, never drawn (a stand-in's label is a UI word, §4.1) |
| `size` | `{w, h, d}` in metres, each above 0; `estimated`, boolean | the measured size at scale 1 (FR-002) |
| `stylized_scale` | number, 1 to 4, default 1 | FR-051: scales the piece's own geometry, anchors, faces, glows, and bounds, never what's mounted on it (§4.2). The studio models the piece at this scale, and lookdev sets it for each readable prop (Confirmation 8) |
| `origin.point` † | string | the dimension sheet's physical point where the model's origin sits (FR-015) |
| `origin.bounds` | `{min, max}`, metres at scale 1 | `min` below `max` on every axis; contains the origin. The fit check compares a model's bounds at both corners against these times the stylized scale (FR-019) |
| `anchors` | map of anchor name to `{at, turn?, estimated?}` | positions in the piece's frame at scale 1; what other placements mount on (§4.2), and what a cable runs between (§4.4) |
| `live_faces[]` | list | `role` follows the object-name rule and is unique in the piece; `at` is the face's centre; `size` is `[w, h]` in metres, each above 0; `facing` is a unit vector, the face's normal; `up` is a unit vector perpendicular to it, default +Y, required when `facing` is ±Y; `px` is `[w, h]`, integers 16 to 2048, the canvas's largest size, in the face's aspect to within one pixel; `readable` is required: `true` for the faces FR-052 names (the monitor's screen, the chalkboard's slate, a sign's lettering area, the neon sign's word and counter panels). Each face lies inside the bounds (FR-017) |
| `glows[]` | list | `id` unique in the piece; `at`; `radius`, metres above 0; `tone`, a glow tone of the scene's look; `motion`, `flicker` (neon), `breathe` (screens), or `steady`; `level`, 0 to 1, default 1 |
| `claims` | `{signal, poses}`, optional | only on a piece a switch places: `signal` is `tier`; `poses` maps each pose name to the tier value that pose claims, or `null`. At most one pose claims each value (FR-002, FR-043) |
| `standin[]` | list of shapes, at least one | the closed grammar below; inside the bounds; drawn while the piece has no set model (FR-057) |
| `drawing` | `{primitives: [...]}` or `{from: standin}` | the 2D vector drawing (FR-058; RV) |
| `budget` | `{gzip_bytes, triangles, texture_px, texture_bytes}`, integers above 0 | `gzip_bytes` and `triangles` at or under the caps; `texture_px` a power of two, at or under `small_prop_texture_px` when the caps list the piece in `small_props`; `texture_bytes` the planned Σ w × h × 4 × 4/3. RK refuses a budget above the caps; agents never raise one (FR-053) |
| `model` | `{file: "<piece>.glb"}` or `{card: "<piece>.png"}` (or `.jpg`, `.webp`), optional | the file's stem is the piece's ID, so the caps' `small_props`, spec 003's `files[].id`, and the asset events name pieces and files alike. The file sits under `assets/room/` with a `records.json` entry. A figure's piece (§4.1) has none |
| `work_order` † | `{method, shots[], measurements[], studio_notes}`, strings | feeds the generated work order (§10.7); reviewed as room text is: it locates nothing and names no third party's marks, and asks the studio's session for nothing FR-024 excludes: a photo or a crop of one, a file outside the studio's folders, a fetch, or an upload (FR-014) |

**Stand-in shapes**, a closed grammar (FR-005). Every shape also takes `at`, an optional `turn` and `scale`, `color` (a palette name of the scene's look, or `#rrggbb`), and `lit` (boolean, default true).

| `shape` | Size fields |
|---|---|
| `box` | `size: [w, h, d]` |
| `cylinder` | `radius`, `height` |
| `capsule` | `radius`, `length` |
| `sphere` | `radius` |
| `torus` | `radius`, `tube` |
| `plane` | `size: [w, h]` |
| `circle` | `radius` |
| `tube` | `from: [x, y, z]`, `to: [x, y, z]`, `radius` |
| `polygon` | `points: [[x, y], …]` (at least three), `depth`, extruded along Z |

**The 2D vector drawing** (RV): a front elevation in the piece's local metres, y up. `primitives` come from a closed set, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, and `path` (SVG path data: commands and finite numbers only), each with `fill` and `stroke` (palette names, `#rrggbb`, or `none`) and `stroke_width`. A drawing holds no text, link, or style. `{from: standin}` derives the elevation from the stand-in. Every placement and every switch pose has a drawing (FR-009); the visitor's is the chosen avatar's flat shape, which spec 002's `avatars.ts` keeps.

**States of a piece's picture:** `stand-in` → `set`. A piece is `set` when its `model` names an arrived file that passes its fit and its budget, and main holds the caps' room block. Setting `model` is the one edit (US4 scenario 1). It falls back to `stand-in` while `model` is absent, while main has no room caps (§9.1), or, in the image build, while its model has findings (FR-013). At run time a set piece can still show its stand-in (§11.4).

## 4. The scene

`apps/web/room/scene.yaml`. FR-001, FR-003 to FR-008, FR-078.

```yaml
version: 1
look: <look>
live: {source: off, poll_s: 30, freshness_s: 35, turn: off, asset_events: off}
placements: [ … ]                 # §4.1
switches: [ … ]                   # §4.4
selectables: [ … ]                # §4.5
handoff: {from: {placement: <placement>, anchor: <anchor>}, to: {placement: <placement>, anchor: <anchor>}}
survey: {desk_corner: {placement: <placement>, anchor: <anchor>}}   # †, §4.6: the photo guide's origin (§10.7)
retired: [ … ]                    # §4.8
```

Order matters twice. The order of `selectables` is the "In the room" list's, the Tab order's, and the load order's priority (FR-056, FR-063). The order of `placements` sets the text copy's order of faces and breaks depth ties in the 2D drawing.

### 4.1 Placement

| Field | Type | Rules |
|---|---|---|
| `id` | placement ID | |
| `piece` | piece ID | names a catalog entry (RI) |
| `mount` | mount (§4.2) | required on every placement but one: the room's shell, the root (FR-003). Exactly one placement has no mount (RG) |
| `frame` | boolean, default false | the camera frames it at spec 002's six aspects (FR-009). Required true for the `twin` placement and for every selectable's member (B8); the desk is framed as the scene says |
| `label` | UI word key `label.<name>`, optional | the stand-in's label: the UI word `standin.label` with `{name}` filled by this word, drawn only while the placement shows a stand-in. Every drawn label is therefore a UI word (FR-029; US1 scenario 2) |
| `role` | `twin` or `visitor`, optional | the figures: one placement each, both required. Its picture comes from spec 003's avatar loader, so its piece has no `model`; its catalog entry gives the stand-in, the size, and the hands' anchors (FR-008) |
| `faces` | map of live-face role to face binding (§4.3), optional | each key is one of the piece's live faces. A face with no binding is a plain glow (FR-031) |

### 4.2 Mount, and the world resolver

| Field | Type | Rules |
|---|---|---|
| `on` | placement ID | another placement, never a switch's pose; the mounts form one tree rooted at the shell, with no cycle (RG) |
| `anchor` | anchor name | one of the anchors of `on`'s piece (RI) |
| `offset` | `[x, y, z]`, metres, default `[0, 0, 0]` | in the anchor's frame |
| `turn` | `{x, y, z}`, degrees, default 0 each | applied in Y-X-Z order |
| `estimated` | boolean, default false | the position isn't measured yet (FR-078) |

The resolver is `apps/web/src/room/compose/mount.ts`, one function shared by the compositor's checks, the runtime, and lookdev, so they compute the same numbers:

```text
World(shell) = I
World(p)     = World(on) · T(s_on · anchor.at) · R(anchor.turn) · T(offset) · R(turn)
Model(p)     = World(p) · S(s_p)
R({x, y, z}) = Ry(y) · Rx(x) · Rz(z)        (three.js Euler order "YXZ")
```

`s_on` is the parent piece's stylized scale and `s_p` the placement's own. An anchor moves with its piece's scale, but a child never inherits the scale: an enlarged monitor doesn't enlarge the neon sign clipped to it. A parent's move carries everything mounted on it (FR-003, US1 scenario 1).

### 4.3 Face binding and regions

| Field | Type | Rules |
|---|---|---|
| `label` | UI word key `label.<name>` | the face's label in the text copy (FR-063) |
| `atmosphere` | boolean, default false | allowed only on a face the catalog doesn't mark `readable`; such a face whose smallest glyph falls under the floor must set it, and its words are then carried by the text copy (FR-052) |
| `max_chars` | integer, at least 1 | required with `atmosphere`: the content cap |
| `regions[]` | list, at least one | inside the face, not overlapping |

A region:

| Field | Type | Rules |
|---|---|---|
| `rect` | `[x, y, w, h]`, fractions of the face | origin at the top left, in reading order, as the face's texture coordinates are stored (FR-017); inside `[0, 1]`; `w` and `h` above 0 |
| `renderer` | `terminal`, `desktop-session`, `neon`, `chalk`, or `sign` | FR-005, FR-031 |
| `grid` | `{cols, rows}` (terminal, desktop-session), `{rows}` (chalk), or `{chars}` (neon); integers, at least 1 | the fixed text grid of `compose/layout.ts`; words never resize it, and text that overflows it is refused (RT). A sign has none: its outline fits the region |
| `text` | room-text ID | a block whose `renderer` is this region's, or, for `sign`, an outline (§6) |
| `resume_titles` | `true` | `chalk` only: the published resume's section titles, withheld whenever the resume is (FR-033, Confirmation 11) |
| `ui` | list of UI word keys | `neon` only: the sign's word and its second line (FR-046, FR-049) |
| `signal`, `part` | `turn-cost`; `call` or `visit` | `neon` only: a counter panel and its label (FR-047) |

A region has exactly one of `text`, `resume_titles`, `ui`, and `signal`. A reference must resolve (RI); whether its words show depends on approval (§6.4), so a bound face may stay plain (FR-009).

### 4.4 Switch, poses, and the cable

```yaml
switches:
  - id: <switch>
    signal: tier
    piece: <piece>                # the charger: a plug and a short lead (FR-020)
    label: label.<name>           # the text copy's label for the state sentence
    poses:
      <pose>:
        mount: {on: <placement>, anchor: <anchor>, offset: [x, y, z], turn: {y: 0}}
        glows: [{placement: <placement>, glow: <glow>, level: 1}]
    cases: {local: <pose>, cloud: <pose>, resting: <pose>, budget: <pose>, unavailable: <pose>, unknown: <pose>, paused: <pose>, not-live: <pose>}
    cable: {from: <anchor>, to: {placement: <placement>, anchor: <anchor>}, sag: 0.2, radius: 0.004, drop: 0.1}
```

| Field | Type | Rules |
|---|---|---|
| `id` | switch name | unique among switches |
| `signal` | `tier` | the only signal with values; `turn-cost` is a number and has no cases |
| `piece` | piece ID | the piece each pose places; no placement places it too (FR-020) |
| `label` | UI word key `label.<name>` | the text copy's label beside the tier's sentence (FR-043, FR-063) |
| `poses` | map of pose name to `{mount, glows?}` | when the piece declares `claims`, the same names as its `claims.poses`. A pose is the placement a case shows (the spec's Terms); its mount follows §4.2. `glows` sets other placements' glow levels while it shows, such as a charge light |
| `cases` | map of tier value to pose name | when the piece declares claims, a case for every tier value and no `default` (FR-043) |
| `default` | pose name, optional | only when the piece claims nothing: the pose for the values `cases` doesn't list. That makes a case for a value the signal already has a data edit (FR-006) |
| `cable` | `{from, to, sag, radius, drop?, rest?}` | `from`, an anchor of the switch's piece (the lead's free end), resolved at the shown pose; `to`, a placement's anchor (the desk's back edge); `sag`, 0 to 0.5 of the span; `radius`, metres above 0 at scale 1, times the piece's stylized scale (FR-051); `drop`, metres, default 0, the short fall behind `to`; `rest`, a placement's anchor whose plane the run never dips below, so a lead lying on the desk lies on it |

**Claims (RS, FR-043).** For every tier value V, the pose that V's case shows claims V or nothing, and a pose that claims V is the one V's case shows. So only `local` can show the plugged pose and only `cloud` the cloud pose, and a `default` claims nothing. The plugged pose mounts on the laptop's port, so moving the stand carries the plug with the laptop (FR-040). The run is drawn at run time from the lead's free end to the desk's back edge, so moving the laptop, its stand, or the desk needs no re-export; only the plug's pose decides whether the cable reaches the port (FR-020).

**The shared pose is data.** The default scene points `resting`, `budget`, `unavailable`, `unknown`, `paused`, and `not-live` at one pose that claims nothing, the plug resting on the desk (FR-043; Q2). Each value keeps its own case, so splitting that pose later is a data edit (the spec's Assumptions, "The poses"). The compositor's report prints the case table and the on-screen separation of every pair of poses (FR-052, §10.9).

### 4.5 Selectable

| Field | Type | Rules |
|---|---|---|
| `id` | selectable ID | permanent: the usage event's ID and the conversation's `feature` (FR-004, B5) |
| `name` | string, 1 to 40 characters | the visible name, on its button in the "In the room" list; passes C9 (RT) |
| `members` | list of placement IDs, at least one | each framed; a placement belongs to at most one selectable (RI) |
| `action` | `{talk: {topic, lead?}}` or `{resume: {}}` | `topic`, a topic ID; `lead`, one line of at most 120 characters, passing C9, published only in `config/room-topics.yaml` (FR-036, FR-038) |

At most 64 selectables, the gateway's limit for event objects (B7). **Pick area** (FR-064): the union of the members' projected boxes, with an exclusive core of at least 44 × 44 CSS pixels. RG refuses a scene where any core is smaller or overlaps another at any supported stage (the two reference stages; 304 × 248, a 320 × 568 screen in portrait; 326 × 208, 568 × 320 in landscape; and a sweep of screens from 320 × 568 to 1920 × 1200 through `room.css`'s stage formulas), in 3D and in 2D, where 44 pixels convert at the drawing's smallest scale, min(W ÷ 320, H ÷ 200). A regroup of adjacent pieces therefore needs a move too. The runtime picks with the same function (`compose/pick.ts`).

**The side-wall carve-out** (FR-064, as the Author approved it on 2026-10-23 and kept it on 2026-10-26, D1; the spec's Clarifications). A side-wall selectable is one whose members are all mounted directly on the shell's `left-wall` or `right-wall` anchor (the spec's Reading R2); the compositor reads that from the scene's mounts, never from an ID, and the index flags it with `side_wall` (§10.1). FR-064's smallest stages are defined once, in [contracts/room-data-files.md](contracts/room-data-files.md) §13.3, by the spec's Reading R1. At one of those where it can't keep its exclusive core, it is **list-only**: the room draws no pick area or 2D cue for it, a pick whose frontmost member rectangle is one of its members selects nothing (Reading R3), and the "In the room" list (FR-063) reaches it. Another selectable's core still may not overlap its members there. At every other supported stage it is held to its core as any selectable is, in 3D, and in 2D at that stage's scale; RG refuses the scene where it isn't, and the choice goes back to the Author (D1's condition). The runtime finds a stage's list-only selectables with `compose/pick.ts`, from the index's `side_wall` and the stage it has, in 3D and in 2D. The report names each, with its wall and its stages (§10.9).

### 4.6 The hand-off's anchors, and the survey

`handoff.from` is an anchor of the `twin` placement (the twin's hand), and `handoff.to` an anchor of the `visitor` placement (the visitor's hand) (RI). The hand-off and its paper stay code (FR-008).

| Field | Type | Rules |
|---|---|---|
| `survey` † | `{desk_corner: {placement, anchor}}` | the desk's front-left corner, from which the photo guide's layout checklist measures each desk item (FR-026; [contracts/room-data-files.md](contracts/room-data-files.md) §5.6) |

### 4.7 The live configuration

| Field | Type | Default | Rules |
|---|---|---|---|
| `source` | `off` or `site` | `off` | the tier's status polling, FR-041 row 1. `site` only in the change that serves `GET /api/status` on the room's origin (FR-045); RL refuses it unless the disclosure's row V7 (spec 001's status row under the agreed row IDs; Amendment A4) names the room's polling in its Trigger and "Pause the room" in How to switch it off (FR-074) |
| `poll_s` | integer, 30 to 120 | 30 | FR-044; at most two requests a minute (A1) (RL) |
| `freshness_s` | integer, at least `poll_s` + 5 | 35 | FR-042 (RL) |
| `turn` | `off` or `site` | `off` | whether the conversation turn route exists; the twin's spec switches it on. While `off`, both counters read "cost unavailable" (FR-048). RL refuses `site` unless row V2 (spec 002's turn row) says the reply carries the turn's estimated cost and its route (B6, FR-075) |
| `asset_events` | `off` or `site` | `off` | whether spec 003's asset events are sent to `POST /api/events`; RL refuses `site` unless row V6 (spec 003's asset events) exists, which comes with spec 001's route (FR-071) |

The 5-second timeout and the 120-second backoff cap are constants in `apps/web/src/room/signals/status-poller.ts`, not keys ([contracts/tier-signal.md](contracts/tier-signal.md) §1). No other key is allowed (RD).

**States:** each switch moves `off` → `site` once, in the change that brings its flow and its disclosure row: `source` at User Story 8's switch-on, `turn` with the twin's spec, `asset_events` with spec 001's `/api/events`. Back to `off` only by a revert.

### 4.8 Retired IDs

| Field | Type | Rules |
|---|---|---|
| `id` | string | the ID grammar; unique in the list |
| `kinds` | list of `piece`, `placement`, `selectable`, `topic` | default: all four |
| `retired` | date, `YYYY-MM-DD` | |
| `reason` † | string | |

RI refuses any piece, placement, selectable, or topic of a listed kind that takes a retired ID (FR-004). **States:** an ID is `current` while data defines it, and `retired` once removed and listed here, never current again for a listed kind. The list only grows, which the "Room data" review pass holds. A retired selectable's ID leaves `config/room-events.yaml` at the next build, the gateway refuses its events from its next start, and its dashboard history stays for as long as Prometheus keeps it (30 days).

### 4.9 The default scene

The first data commit reproduces spec 002's room within 1 mm per box; the second lays out FR-078's room as it first stood; the third lays out the Author's cube, as FR-078 now has it (the spec's Clarifications, Sessions 2026-10-23 and 2026-10-26), every estimated size and position marked. What the third holds (B2, FR-036, FR-040, FR-046, FR-051, FR-078):

The shell is a brick cube, 7 ft wide, 7 ft high, and 4 ft deep (2.1336 × 2.1336 × 1.2192 m), open at the front, with no ceiling, on a cement floor, and the view looks straight into the open front, from a camera lower and closer than the kernel's first 1.5 m eye height (D1; plan.md §10 will record the new figures, tasks.md T301). The desk stands against the back wall, the ultrawide monitor on it with the neon sign clipped to its top edge, and the laptop on its stand at the desk's right side. The window, large, is around the sign, and the artwork hangs, maybe covering part of the window. On the left wall the chalkboard hangs high and the snowboard, upright on its tail, low beside it, with small gaps at the wall's corners (D1); the bicycle hangs upright by its front wheel on the right wall, next to the laptop. The twin stands a little right of the desk, by the laptop. The visitor stands central, but nearer the open front and a little left (D3), its `hand` anchor on the side nearer the twin (FR-008).

| Piece | Mounted on | Stylized scale | Selectable | Faces, switch |
|---|---|---|---|---|
| The shell (the brick cube: open front, no ceiling, cement floor) | – (the root) | 1 | – | – |
| The desk | the shell's back wall | 1 | – | – |
| The ultrawide monitor | the desk | set in lookdev, for its screen | `laptop` | the screen: a terminal half and a desktop half (FR-031) |
| The neon sign | the monitor's top edge | set in lookdev; the sign about 1.5 m wide (D2) | – | the word panel, larger inside the sign so the word meets the floor on both reference stages (D2); the two counter panels, exempt from the reference phone's floor alone (FR-021, FR-052) |
| The laptop's stand | the desk, at its right side | 1 | `laptop` | – |
| The laptop | the stand | 1 | `laptop` | its screen, a plain glow unless approved room text is bound to it (FR-031) |
| The charger (a plug and a short lead) | per pose: the laptop's port (plugged); the cloud pose; resting on the desk | set in lookdev | – | the laptop's switch on the tier |
| The snowboard, upright on its tail | the shell's left wall, low | 1 | `snowboard` | – |
| The bicycle, upright by its front wheel | the shell's right wall, next to the laptop | 1 | `bicycle` | – |
| The window and its view | the shell's back wall, large, around the neon sign | 1 | – | – |
| The artwork | the shell's back wall, maybe covering part of the window | 1 | – | – |
| The chalkboard | the shell's left wall, high | set in lookdev, for its slate | `chalkboard` | the slate: the resume's section titles, mission statements, and how the Author thinks about problems (FR-033) |
| The two desk signs | the desk | set in lookdev | – | the lettering: "I am very busy" and "my dog thinks i'm cool" (FR-032) |
| The twin; the visitor | the shell's floor: the twin a little right of the desk, by the laptop; the visitor central, nearer the open front and a little left (D3) | 1 | – | the roles `twin` and `visitor` |

The snowboard, the chalkboard, and the bicycle are side-wall selectables (§4.5): at FR-064's smallest stages, each that can't keep its exclusive core there is list-only there, and the report names it. At every other supported stage each keeps its core, or RG refuses the scene (D1's condition).

## 5. Topics

`apps/web/room/topics.yaml`: `{version: 1, topics: [...]}`. FR-036, FR-037.

| Field | Type | Rules |
|---|---|---|
| `id` | topic ID | |
| `phrase` | string, 1 to 60 characters | fills `{topic}` in spec 002's fixed message `topic_not_ready`, and the list's ": {phrase}"; passes C9 (FR-037, FR-063) |
| `words_from` † | list of `{file, quote}`, at least one | the Author's words the topic came from; a strict build finds each quote verbatim in its file |
| `corpus` | list of paths, `corpus/NN-<topic>.md` | spec 002's C1 form; a file may not exist yet |

Readiness isn't a field. A topic stays unready until the twin's spec marks it ready, once its corpus exists and its evals and red-team cases pass (spec 002's FR-023; B4). **States:** `unready` → `ready`. While unready, selecting its piece shows the fixed message with its phrase and calls no model (FR-037, FR-076, SC-015).

The defaults: hobbies and travel adventures, opened by the bicycle and, with a lead of winter hobbies first, by the snowboard (answer 1: "snowboarding opens the same but has a bias to talking more about winter hobbies first"); the Author's mission, opened by the chalkboard (answer 3); work projects, opened by `laptop`.

## 6. Words

### 6.1 Room-text block

`apps/web/content/room/<block>.yaml`. FR-029 to FR-031, FR-033, FR-035.

```yaml
version: 1
block: <block>                    # the file's stem
renderer: terminal                # terminal, desktop-session, or chalk
words_from:                       # †
  - {file: <repository path>, quote: "<the Author's words>"}
exclude: [<phrase>]               # †, chalk blocks
lines:
  - text: "<displayed value>"
    about_author: true
    claims:                       # †
      - {file: corpus/<file>.md, quote: "<a span of one tagged sentence>"}
    pending: false
```

| Field | Type | Rules |
|---|---|---|
| `version` | integer | `1` |
| `block` | string | the file's stem; unique among room text (blocks and outlines share one set of names) |
| `renderer` | `terminal`, `desktop-session`, or `chalk` | the renderer of every region that binds it |
| `words_from` † | list of `{file, quote}`; at least one on a `terminal` or `desktop-session` block (RD3), optional on a `chalk` block | for the monitor's two scripts, the Author's typed description of the photographed screen (FR-031), recorded verbatim, in the Author's words, in an intent file; a strict build finds each quote verbatim (RT9) |
| `exclude` † | list of strings | RT refuses a line that holds one of these phrases, cites a corpus sentence holding one, or shares a 24-character span with such a sentence: the chalkboard's lines never name Seva or quote its corpus framing (FR-033, answer 3: "leave it off the chalkboard") |
| `lines[]` | list, at least one | in order; they fill the bound region's grid row by row |
| `lines[].text` | string | the displayed value, and the only key the content check reads. It holds no slot, so a published string equals its approved value exactly, as the content check's whole-string match needs (FR-030) |
| `lines[].about_author` | boolean, default false | the line states something about the Author: C6 applies (with no slot to hold a digit, the line holds none) and C8 with `claims` (FR-035) |
| `lines[].claims` † | list of `{file, quote}` | spec 002's citations, held by C1 to C5 and C8. A chalkboard line comes from the corpus through its claims, or is the Author's approved words (FR-033) |
| `lines[].pending` | boolean, default false | true while the line's corpus words don't exist yet: never drawn, never published, and absent from the built site (FR-012, FR-033) |

Every `text` passes C9 (RT). The monitor's scripts (`terminal`, `desktop-session`) also hold no secret-shaped token, local, absolute, or home path, host or user name (`user@host`), email or IP address, URL other than the site's, or amount; they name products in plain text; and they finish typing within 5 seconds (RT, FR-031). No other key in the file is named `name` or `title`, so the content check's key pattern finds exactly the displayed values.

### 6.2 Outline

`apps/web/content/room/outlines/<sign>.outline.json`, holding exactly these keys (FR-032, FR-052):

```json
{ "schema": 1, "sign": "<sign>", "words": "I am very busy", "intent_ref": "intent-004",
  "source": { "type": "design", "id": "<opaque id>" },
  "tool": { "name": "<tool>", "version": "<version>", "license": "<license id>" },
  "view_box": [0, 0, 1000, 250], "cap_height": 180, "advance": 960,
  "paths": ["<SVG path data>"] }
```

| Field | Type | Rules |
|---|---|---|
| `schema` | integer | `1` |
| `sign` | string | the file's stem, before `.outline.json`; unique among room text |
| `words` | string | the sign's words exactly as the Author wrote them and the intent quotes them, "I am very busy" or "my dog thinks i'm cool"; the displayed value |
| `intent_ref` | string, `intent-NNN` | names the intent whose quotes hold `words`, without a path, which the outline check refuses; a strict build finds `words` inside that intent's quotation marks |
| `source` | `{type, id}` | `type` is `design` (traced from the Author's design, Amendment C2) or `photo` (traced over a photo with a local tool inside the photos folder); `id` is opaque, spec 003's source-ID form `[A-Za-z0-9-]{3,40}`, never a file name |
| `tool` | `{name, version, license}`, strings | the tracing tool; `license` is the ID `assets/policy/licenses.json` gives it on main (P-6) |
| `view_box` | `[min_x, min_y, width, height]` | finite; width and height above 0; y down, as in SVG |
| `cap_height` | number above 0 | in view-box units: the height of a capital letter or a digit in the lettering, which the legibility measure uses (FR-052; Clarifications) |
| `advance` | number above 0, optional | in view-box units: the lettering's advance width, which centres it on its face; absent means the view box's width |
| `paths` | list of strings, at least one | SVG path data: commands and finite numbers only |

Refused anywhere in the file: another key, an `href`, a `data:` URI, a base64-like run, a file name, a path, or a file extension. `tools/gates/outline_check.py` (P-8) checks this inside the photos folder before the file leaves it, and the compositor checks it again on arrival (RT). The file is in `.prettierignore`, since reformatting would change its approved hash.

**States:** traced → checked by P-8 and reviewed by the Author (a photo-traced outline only; it then goes to the studio's inbox as vector paths with no pixels, FR-025) → brought into the repository by the Author → approved by SHA-256 with the kind `room-text` → drawn, and its `words` written in the text copy.

### 6.3 UI words

`apps/web/room/ui-words.yaml`: `{version: 1, words: {<key>: <value>}}`. A value is a string, or `{text, about_author: true, claims: [...]}` for a word that states something about the Author. FR-029, FR-035, FR-048.

Two kinds of key:
- **The code's closed list** (`apps/web/src/room/ui-keys.ts`): each key is required, with exactly its slots (RT). [contracts/room-data-files.md](contracts/room-data-files.md) lists every key.

  | Family | Holds | Slots | Spec |
  |---|---|---|---|
  | `tier.<value>`, one per tier value | the tier's sentences, about the machine: "The Author's machine is serving", "The cloud fallback is serving", "Status unknown", and the rest | none | FR-035, FR-043 |
  | `pause.*` | "Pause the room"; "Paused at {time}" | `{time}` | FR-060 |
  | `sign.*` | the neon word, "Langfuse"; the second line, "metered by the gateway · traced in Langfuse"; the labels "this call" and "this visit"; the readings ("no call yet", "local · {amount}", "{amount} est.", "at least {amount}", "cost unavailable"); the marks "test" and "Sample"; the line saying the project isn't affiliated with or endorsed by Langfuse or its owner | `{amount}` | FR-046 to FR-049, Confirmation 1 |
  | `around.*` | the text copy's heading, "Around the room"; "a scripted illustration"; the sign's figures as sentences | `{amount}` | FR-031, FR-063 |
  | `list.*`, `toolbar.*` | the list's heading, "In the room"; the phrase for a resume action; "Credits" | none | FR-063, FR-065, C9 |
  | `standin.*`, `draft.*` | a stand-in's label; the note that placeholder shapes are in use; the badge "Draft" | `{name}` | FR-013, FR-029, FR-030 |

- **Labels the data references**, `label.<name>`: each referenced by a placement's, a face binding's, or a switch's `label`, none left unreferenced (RI). They keep adding a piece a data edit: its labels are data, not code. No other key is allowed (RD).

Every value passes C9; C6 and C8 apply where it states anything about the Author, and a live value in a slot counts as a slot for C6 (RT, FR-035). Amounts are live values, never UI words, so no UI word holds a digit outside a slot (FR-048). The tier's sentences never claim that the twin is answering (FR-035). Spec 002's fixed messages stay in its `messages.yaml`; `topic_not_ready`'s `{topic}` now takes the topic's phrase.

### 6.4 The states of room text

| State | In a release build | In a drafts build |
|---|---|---|
| **approved**: an entry on main, kind `room-text`, names the file's SHA-256 | drawn; published in `room_text`; in the text copy | the same |
| **draft**: any other digest | the face stays plain; not published; its words absent from `dist/`, which the content check scans | drawn with the badge "Draft"; published with `state: "draft"` |
| a **pending** line | never drawn or published | the same |
| **withheld**, or `room-data.json` fails to load | faces plain; their text-copy entries left out (FR-061) | the same |

**Transitions:** `draft` → (the Author's approval on main) → `approved` → (any edit) → `draft`. An image built before the approval keeps the draft until the next `make up` rebuilds it. `apps/web/build/approvals.ts` accepts the `room-text` kind before the Author's first such entry, so an approval never breaks `make up`. Room text ships only once main's content check has the `room-text` kind (FR-030; P-9): `evals/test_room_order.py` fails `make test` while main approves room text and main's content check lacks the kind (FR-077).

## 7. Looks and typefaces

### 7.1 Look

`apps/web/room/looks/<look>.yaml`. FR-005, FR-022, FR-033, FR-070.

| Field | Type | Rules |
|---|---|---|
| `version` | integer | `1` |
| `id` | look name | the file's stem; `scene.yaml`'s `look` names one |
| `method` | `inked-cel`, `painted`, or `flat` | closed in code. Inked cel (the default, answer 2) shades with a stepped ramp and ink outlines, lit at run time; `painted` draws the textures unlit; `flat`, base colours only. No method uses baked light (FR-022) |
| `palette` | map of colour name to `#rrggbb` | the names stand-ins and drawings use |
| `lights` | `{ambient: {sky, ground, intensity}, key: {color, intensity, from: [x, y, z], shadows}}` | colours `#rrggbb`; intensities at least 0; `shadows` boolean |
| `shading` | `{steps}`, integer 2 to 5 | inked cel's ramp |
| `outlines` | `{color, width}` | inked cel's ink lines |
| `glow_tones` | map of tone name to `{color, intensity}` | the tones glows name (the spec's Key Entities: "glow tones") |
| `typefaces` | map of `terminal`, `desktop-session`, `chalk`, `neon`, `counters` to `{family, weight}` | each a `fonts.lock` family whose `uses` holds `room`, at a weight it vendors (B10); changing one is a data edit (FR-033) |
| `material_notes` † | string | for the work orders (FR-014) |

The default typefaces: IBM Plex Mono for the terminal and the counters; IBM Plex Sans for the desktop half; Patrick Hand for the chalk (Confirmation 7); IBM Plex Sans Bold for the neon word, drawn as a stroked tube, so the room adds no fourth family. **States:** looks are compared in lookdev; the chosen one is named by `scene.yaml`'s `look` and recorded in ADR 0010, and the work orders regenerate from it before the remaining pieces are modeled (FR-070).

### 7.2 `fonts.lock`, schema 2

```json
{ "schema": 2, "families": [ { "family": "<family>", "license": "<license>", "reserved_font_name": "<name>",
  "uses": ["room"], "source": { "package": "<npm package>", "version": "<version>", "url": "<tarball URL>",
  "sha256": "<64 hex>", "integrity": "<npm integrity>", "published": "<date>" },
  "files": { "<file>": { "sha256": "<64 hex>", "from": "<path in the tarball>" } } } ] }
```

| Family | `uses` | Source |
|---|---|---|
| IBM Plex Sans | `site`, `pdf`, `room` | `@ibm/plex-sans`, unchanged |
| IBM Plex Mono | `room` | `@ibm/plex-mono`, unmodified |
| Patrick Hand | `room` | `@fontsource/patrick-hand`, latin, weight 400; it reserves no font name (`reserved_font_name: null`) |

The PDF uses only families whose `uses` holds `pdf`, so it stays IBM Plex Sans alone (B10). Every file is checked against the lock before it's read. **A typeface's cap ratio** is the minimum, over A to Z and 0 to 9, of a glyph's bounding-box top divided by the font's units per em, read with fontkit after the lock check; it travels in the bundle (§10.1), so the compositor and the page compute the same glyph heights (FR-052).

## 8. Fixtures and the lookdev vignette

**A fixture**, `apps/web/room/fixtures/<fixture>.yaml`, is a named sample of both signals (FR-049):

| Field | Type | Rules |
|---|---|---|
| `version` | integer | `1` |
| `id` | fixture name | the file's stem |
| `tier` | a tier value | the value the switches show |
| `turns[]` | list | the outcomes fed to the cost channel, in order: `{outcome: reply, route, cost_micro_usd}`, `{outcome: degraded}`, `{outcome: failed}`, `{outcome: lost}`, or `{outcome: refused, status}` with `status` 400 to 499. A reply may be invalid on purpose (the route `metered`, a fractional cost), so `route` is any string and `cost_micro_usd` any number or string |

Fixtures reach only drafts builds and tests: `virtual:room-fixtures` resolves only in a drafts build, a release build refuses it, and the release step refuses a bundle that holds one (FR-066, A5, B11). Every figure a fixture feeds reads "Sample".

**The lookdev vignette**, `apps/web/room/lookdev.yaml`, drafts only: `{version: 1, vignette: {show: [<placement>…]}, close_up: {frame: [<placement>…]}}`. The vignette shows only the listed placements, at their world positions and at the production framing; the first holds FR-070's pieces (the desk, the monitor and its terminal, the neon sign's glow, the laptop's cable states, one sign, a corner of the chalkboard, and a bicycle wheel). The close-up frames its placements with `framing(aspect, boxes)` as the secondary view (FR-067).

## 9. What the compositor reads from the Author

### 9.1 The caps' room block (Amendment C7)

The Author's commit on main (P-6):

```json
{ "schema": 1, "adr_0010": "<state>",
  "per_asset": { "room": { "gzip_bytes": 2500000, "triangles": 40000, "small_props": ["<piece>"],
    "small_prop_texture_px": 1024, "scene_texture_bytes": 96000000, "legibility_floor_css_px": 9 } },
  "first_visit_bytes": { "phase2": 10000000, "phase3": 25000000 }, "history_bytes": 500000000 }
```

| Field | Type | Meaning | Spec |
|---|---|---|---|
| `gzip_bytes` | integer above 0 | per piece: the `.glb.gz`'s length at gzip level 9, the bytes served | FR-053, FR-079 |
| `triangles` | integer above 0 | per piece; mode 4 counts k ÷ 3, modes 5 and 6 count k − 2 | FR-053 |
| `small_props` | list of piece IDs, which are also the files' stems | the pieces whose textures the next field caps; the Author names them | FR-053 |
| `small_prop_texture_px` | integer, a power of two | the largest texture side on a small prop | FR-053 |
| `scene_texture_bytes` | integer above 0 | the whole scene on a phone: Σ w × h × 4 × 4/3 over models, image cards, avatars, and live-face canvases | FR-053, SC-006 |
| `legibility_floor_css_px` | number above 0 | the smallest cap height a readable face may show, in CSS pixels, at the production framing on both reference stages | FR-052, SC-010 |

An unknown key in the block refuses the file: spec 003's F2 exits 2, and the compositor reports RK. The compositor reads `first_visit_bytes.phase3` for the report's enforced limit.

**Where it's read from,** in order: `ROOM_POLICY_DIR` (the image build's named context `policy`, which `web_image.py` fills from main on the host); `refs/heads/main`, by its full ref (a checkout's build and `make test`); and the export's own copy when there's no `.git` (the gate's container, where rule A9 keeps the copy equal to main's at the branch's base). The report and the manifest name the source and the file's SHA-256.

**While main has no room block:** budgets are checked against FR-053's starting figures (the values above, with `small_props` empty), the floor is 9, every model stays a stand-in, and the report says so.

### 9.2 Room files: records and approvals

A room model or card enters only through spec 003's intake (FR-023), with its record and approval as the Author's patch P-5 amends them ([contracts/intake-amendments.md](contracts/intake-amendments.md)):
- **The mark follows the record** (C1): `trainedAlgorithmicMedia` when every step is a model's, `compositeWithTrainedAlgorithmicMedia` when model and hand steps mix, and IPTC's human-made term, which the Author confirms before P-5, when every step is by hand. A step the studio's agent session scripted is a model step.
- **`source.type`** gains `design` (C2). **`likeness`** means the file shows the Author (C5). **The room confirmations** (`window_view_recreated`, `screens_plain_live_face`, `artwork_original_or_absent`) are each `true` or `"not_applicable"` (C4). **A scripted step** names the studio's session as its `service`, with `disclosure_row: "D4"` (C8).
- **The record's `sha256`** is the plain file's: the hash the Author approves (after viewing it in lookdev, FR-068), the `hash16` in the file's URL, and the SRI digest the browser checks on the decoded body. The compositor hashes the file and refuses a record that disagrees.
- **The order** (FR-077): `evals/test_room_order.py` fails `make test` while any file sits under `assets/room/` and main's arrival check lacks Amendments C1 and C2. It reads main's constants through `git cat-file blob refs/heads/main:<path>` and `ast`, and, with no `.git` (the gate's container), the export's own copies.

### 9.3 A model's fit

The compositor and the lookdev page run one fit check, `apps/web/src/room/glb/` ([contracts/plain-model-fit.md](contracts/plain-model-fit.md)). Its record of one model:

| Measure | How |
|---|---|
| `bytes` | the plain file's length |
| `gzip_bytes` | the length of the `.glb.gz`: pako, level 9, mtime 0, OS 255. A parity test holds it equal to Python's `gzip.compress(data, 9, mtime=0)`, the arrival check's measure |
| `triangles` | as above |
| `texture_bytes` | Σ ⌊w × h × 16/3⌋ over the embedded images |
| `max_texture_px` | the largest image side |
| `bounds` | the vertices' extent under the node transforms |
| `faces` | each live-face quad's centre, size, and normal |
| `scrubbed` | spec 003's mark is on the asset; "not scrubbed" otherwise (FR-068) |
| `findings` | RX1 to RX10 against the catalog entry at its stylized scale, and RK against its budget |

RX1 the container; RX2 the JSON; RX3 no camera, animation, skin, morph target, extras, or `uri`; RX4 extensions only from `KHR_materials_*` (never variants, transmission, or volume), `KHR_texture_transform`, `KHR_mesh_quantization`, and `EXT_texture_webp`, plus the mark; RX5 the mark, one `KHR_xmp_json_ld` packet holding the mark alone, referenced by the asset and by nothing else; RX6 names; RX7 bounds within the larger of 2 cm and 3% at both corners; RX8 live-face quads within 1 mm and 1°, texture coordinates as stored; RX9 textures (PNG at 8 bits a channel, Huffman-coded RGB JPEG, or still WebP; power-of-two sides; at most `small_prop_texture_px` on a small prop); RX10 no emissive and no occlusion (FR-015 to FR-019, FR-022). Once a model is set, framing, footprints, and hit areas use its measured bounds (FR-019).

## 10. What the compositor writes

`compose(tree, policy, {mode, drafts})` returns the index, the 3D part, the room text, the manifest's additions, the generated files, the report, and the findings. **Determinism** (FR-010): directory listings are sorted and the data's order kept; outputs are built field by field, never spread from data, which also keeps every † field out; numbers are quantized (10⁻⁶ m, 10⁻⁴ px); no time, environment, or absolute path appears, and the policy only as its digest; gzip comes from pako; file names come from content hashes. Two builds of one commit and policy are byte-identical (SC-002). The formats are in [contracts/room-bundle.md](contracts/room-bundle.md).

### 10.1 The index (`virtual:room-content`, export `room`)

In the entry chunk, at most 16 KB gzipped, inside the entry's 150 KB budget. It holds what the 2D room, the list, the talk panel, and the text copy need, so none of them waits for Three.js (FR-011).

| Field | Content |
|---|---|
| `schema` | `1` |
| `digest` | the SHA-256, in hex, over both parts' canonical serializations. The 3D part carries the same; the 3D reader refuses a mismatch, and the room falls to 2D |
| `build` | `{kind: "release" or "drafts", placeholders: boolean}` |
| `live` | `{source, turn, asset_events, poll_ms, freshness_ms}`, from §4.7 |
| `ui` | the UI words, by key |
| `selectables[]` | in scene order: `{id, name, members, action, side_wall}`, where `action` is `{kind: "talk", topic}` or `{kind: "resume"}`; no lead (FR-038). `side_wall` is true when every member is mounted directly on the shell's `left-wall` or `right-wall` anchor (FR-064's carve-out, §4.5) |
| `topics[]` | `{id, phrase, ready}`; `ready` is false until the twin's spec |
| `faces[]` | `{id: "<placement>.<role>", placement, role, readable, label, atmosphere, max_chars, px, screen_css, regions}`. Each region is `{rect, renderer, grid, source}`, with `source` one of `{room_text: <id>}`, `{resume_titles: true}`, `{ui: [<key>…]}`, and `{signal: "turn-cost", part}`. `screen_css` is the face's largest on-screen size at the reference stages: the canvas is at most `min(px, screen_css × the device's pixel ratio)`, scaled down by the quality level (FR-054) |
| `switches[]` | `{id, signal: "tier", label, cases: {<tier value>: <pose>}}` |
| `flat` | the 2D room, projected through `framing(1.6)` into a 320 × 200 view box: each placement in depth order as `{placement, matrix: [a, b, c, d, e, f], primitives}`; each pose's primitives and its cable as a quadratic curve; each face's matrix; each selectable's hit rectangles and depths; the stand-ins' labels; the hand-off's three paper positions; the visitor's `{x, baseline, scale}`. Attributes only, from an allowlist, so the CSP needs no change (FR-058) |
| `copy[]` | the text copy's entries in order, by reference: the bound faces in placement order, the switches, the sign's figures, and the fixed lines (FR-063); the words come at run time from the renderers' own word lists (FR-034) |
| `typefaces[]` | `{use, family, weight, cap_ratio, fallback}`, one per typeface use (§7.1); `fallback` is the generic family drawn after 2 seconds (FR-061) |

### 10.2 The 3D part (`virtual:room-scene`)

Imported only by the scene module, so it lands in the lazy 3D chunk.

| Field | Content |
|---|---|
| `schema`, `digest` | as the index |
| `pieces` | per piece: `{scale, anchors, standin, faces, glows}` |
| `placements[]` | `{id, piece, mount: {on, anchor} or null, offset, turn, framed, frame_box, label, model}`. `frame_box` is the expected bounds at scale, or a set model's measured bounds, grown for a stand-in's label; the runtime frames and picks from it, never from loaded geometry, so a model arriving or failing never moves the camera or a pick area |
| `placements[].model` | `{url: "a/<stem>.<hash16>.glb", sha256, bytes, bounds, texture_bytes}`, or null. `url` is relative to the site's root; `sha256` is the plain file's, for the integrity check; `bytes` is the `.glb.gz`'s length (C11) |
| `switches[]` | `{id, piece, poses: {<pose>: {mount, glows}}, cable}` |
| `look` | the scene's look, without `material_notes` |
| `figures` | `{twin: <placement>, visitor: <placement>}` |
| `handoff` | `{from, to}`, from §4.6 |
| `load_order[]` | placement IDs: the framed members of selectables first, in scene order, with the shown pose first; then the other framed placements; then the rest (FR-056) |

### 10.3 `room-data.json`'s `room_text` (Amendment B9)

The page fetches `room-data.json` once at Enter, through spec 002's loader, which the resume and narration share; it retries once after 10 seconds.

```json
"room_text": { "blocks": [
  { "id": "<block>", "source": "apps/web/content/room/<block>.yaml", "sha256": "<64 hex>",
    "state": "approved", "lines": [ { "text": "<displayed value>" } ] },
  { "id": "<sign>", "source": "apps/web/content/room/outlines/<sign>.outline.json", "sha256": "<64 hex>",
    "state": "approved", "lines": [ { "text": "<words>" } ],
    "outline": { "view_box": [0, 0, 1000, 250], "cap_height": 180, "advance": 960, "paths": ["<SVG path data>"] } } ] }
```

- A release build publishes approved blocks only; a drafts build adds drafts with `state: "draft"` (FR-030). Pending lines and † fields never appear.
- Spec 002's `published` and `drafts` list each room-text file as they list the resume's and narration's files.
- The chalkboard's titles region reads `sections[].title` from the same file, so the titles are withheld whenever the resume is (FR-033).
- The content check (P-9) holds each `lines[].text` to a displayed value of an approved file, as a whole string at any length, and finds no unapproved room-text value elsewhere in `dist/` (FR-030, SC-008).

### 10.4 `room-manifest.json` (Amendment B7)

Spec 002's manifest keeps `free_talk`, `items`, `avatars`, and `event_kinds`, and changes or gains:

| Field | Rules |
|---|---|
| `objects[]` | from the selectables, in scene order: `{id, action: "talk" or "resume", topic: <topic> or null, ready: boolean or null}`; `ready` is the topic's readiness, false until the twin's spec marks it ready, and null for a resume action |
| `placeholders` | computed: true while any placement shows a stand-in or any avatar is a placeholder. Spec 001's release refuses true |
| `standins[]` | `{placement, reason}`, with `reason` `no-model`, `no-caps`, or `findings`: which placements show stand-ins, and why (FR-013) |
| `live_source` | `"off"` or `"site"` |
| `build_kind` | `"drafts"` or `"release"`; the release step refuses a bundle that holds fixtures, the lookdev page, or draft text (FR-066, A5) |
| `caps` | `{source: "policy-dir", "main", "export", or "defaults", sha256: <hex> or null}` (§9.1) |

### 10.5 `config/room-events.yaml`

Shape unchanged (spec 002's contract): `{schema: 1, kinds[], objects[], items[]}`. `objects` lists the selectables' IDs in scene order, 1 to 64, in the ID grammar, so it gains `chalkboard` (B3, B7). Generated by `npm run room:generate`; `make test` fails while it's stale; the gateway reads it at start, so a new selectable's events are accepted from the gateway's next start (US1 scenario 2).

### 10.6 `config/room-topics.yaml` (FR-038)

```yaml
schema: 1
selectables:
  - id: "<selectable>"
    topic: "<topic>"
    corpus: ["corpus/<file>.md"]
    lead: null
```

One entry per selectable whose action is `talk`, in scene order, every value quoted; `lead` is the selectable's lead or `null`. The twin's spec reads it (B5); a turn still carries only the selectable's ID, the visitor's path, and the turns. Generated, committed, and checked for freshness in `make test`.

### 10.7 Generated documents (FR-014, FR-026)

- **A work order**, `docs/studio/work-orders/<piece>.md`, one per catalog entry: the method, shots, and measurements; the origin point, the expected bounds at stylized scale, and the anchors; the live faces with their roles and the texture-coordinate rule; the poses; the budget against the caps; the chosen look's material notes; the export rules, from the same rule texts the fit check uses; a `records.json` template; and a "Measure" line for every estimated field (FR-002).
- **The photo guide**, `docs/studio/photo-guide.md`: a fixed privacy template (code, naming no ID), with the photo-work setup and its checklist (Blender's Temporary Files folder and TMPDIR inside the photos folder; the tracing tool's autosave and recent files off; FR-025; [contracts/room-bundle.md](contracts/room-bundle.md) §9.2), and a layout checklist generated from the scene's anchors: each desk item's position from `survey.desk_corner` (§4.6), and the positions of the desk, the bicycle's hook, the snowboard's mount, the window, the artwork, and the chalkboard, each marked measured or estimated (FR-026).

Both are committed and regenerated whenever the catalog, the scene, or the look changes; `make test` fails on a stale or orphaned file. The reviewer's "Room data" pass reads them as it reads room text (FR-014, P-7). `docs/studio/handoff.md` is hand-written, and no check generates it.

### 10.8 The served model files (FR-079)

Each set model is emitted only as `dist/a/<stem>.<hash16>.glb.gz` (pako, level 9, mtime 0, OS 255; no plain copy), where `hash16` is the first 16 hexadecimal characters of the plain file's SHA-256. The web image serves it at `/a/<stem>.<hash16>.glb` with `Content-Encoding: gzip`, `Content-Type: model/gltf-binary`, `Vary: Accept-Encoding`, and `Cache-Control: public, max-age=31536000, immutable`, and inflates it for a client that doesn't accept gzip; the `.gz` URL itself answers 404 ([contracts/serving.md](contracts/serving.md)). An image card is emitted plain at `/a/<stem>.<hash16>.<ext>`.

### 10.9 The compositor's report (FR-073)

Markdown from `npm run room:report`, deterministic, pasted into each merge-request note that changes the room's data or models:

| Part | Content |
|---|---|
| Header | the bundle's digest; the build kind; the caps' source and SHA-256, or "FR-053's starting figures: main has no room caps; every model stays a stand-in" |
| Per piece | its source (the studio file's stem, or "stand-in" with its reason); bytes, gzip bytes, triangles, and texture memory, beside its budget |
| Totals | the largest per-piece figures against the caps; texture memory by class (models, image cards, avatars, live-face canvases at the reference phone's pixel ratio) against 96,000,000 |
| First visit | the room's share in gzip-9 bytes (the placed models' `.glb.gz` and the cards), beside the design's estimate of 12,000,000 and the enforced 25,000,000; and F3's view, every file under `assets/room/` |
| Legibility | per face and per reference stage: the smallest cap height in CSS pixels, the floor, and the margin; whether the face is readable, atmosphere, or exempt on the phone (a counter face under the floor on the reference phone alone, its figures carried by the text copy's "Around the room"; FR-052) |
| Side-wall selectables | each side-wall selectable that is list-only somewhere (§4.5): its wall, and the stages, in 3D and in the 2D drawing, where only the "In the room" list reaches it; or "none" (FR-064) |
| Switches | the case-to-pose table; for each two poses that show different placements, the largest on-screen displacement, or the size of the cue the look adds, per stage, flagged when under the floor |
| Findings | every finding; in the image build, the lenient ones marked `warn` |

**Texture memory (RK, FR-053):** the scene's total adds, once for each piece the scene places (placements of one piece share its textures), its `budget.texture_bytes` (a set model never exceeds its budget); the twin's and the largest visitor avatar's measured texture memory (0, with a note, while they don't exist), and every live-face canvas at the reference phone's pixel ratio. RK refuses a total above `scene_texture_bytes`, in every build.

## 11. In the page

Everything here lives in page memory: never in a cookie, `localStorage`, `sessionStorage`, IndexedDB, or the URL. A reload starts it afresh; two tabs are two visits.

### 11.1 The tier signal (FR-041 to FR-045)

```ts
type TierValue = "local" | "cloud" | "resting" | "budget" | "unavailable" | "unknown" | "paused" | "not-live";
/** The three fields the room reads from GET /api/status; tunnel, release, time, request_id, and any later field are ignored. */
interface StatusAnswer { local_tier: string; state: string; cause_now: string | null }
type StatusResult =
  | { ok: true; started: number; ended: number; endedWall: number; answer: StatusAnswer }
  | { ok: false; started: number; ended: number; endedWall: number;
      why: "network" | "timeout" | "status" | "shape"; status?: number; retryAfterMs?: number };
interface TierInputs {
  live: "off" | "site";           // live.source
  paused: boolean;                 // "Pause the room" (FR-060)
  hidden: boolean;                 // the page isn't visible
  now: number;                     // the room's Clock: monotonic milliseconds
  wallNow: number;                 // the wall clock: milliseconds since the epoch
  freshnessMs: number;             // live.freshness_ms
  last: StatusResult | null;       // the last completed status request; null before the first completes
  fallbackReplyAt: number | null;  // the Clock's time of the last turn reply whose route was "fallback"
}
reduceTier(inputs: TierInputs): { tier: TierValue; row: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; recheckAt: number | null }
```

`reduceTier` is a pure function of FR-041's table ([contracts/tier-signal.md](contracts/tier-signal.md) §3). Rows are tried in order, and the first match wins. From row 4 on, the last completed request was valid, so it is the last valid answer, and `answer` is `last.answer`.

| Row | Condition | `tier` | `recheckAt` |
|---|---|---|---|
| 1 | `live` is `off` | `not-live` | null |
| 2 | `paused` or `hidden` | `paused`, which counts as unknown | null |
| 3 | `last` is null, or `last.ok` is false: a network error, no answer within 5 s, a status other than 200, or a body lacking `local_tier` or `state` as strings, or `cause_now` as a string or null | `unknown` | null |
| 4 | `age ≥ freshnessMs`, with `age = max(now − last.ended, wallNow − last.endedWall)` | `unknown` | null |
| 5 | `answer.state` is `"unknown"` | `unknown` | `now + freshnessMs − age` |
| 6 | `answer.cause_now` isn't null | its cause class: `resting`, `budget`, or `unavailable` | the same |
| 7 | `fallbackReplyAt` isn't null, and `fallbackReplyAt > last.started` (tier-signal.md §3's reading of FR-041's "after") | `cloud` | the same |
| 8 | `state` is `"normal"` and `local_tier` is `"up"` | `local` | the same |
| 9 | `state` is `"normal"` and `local_tier` is `"down"` | `cloud` | the same |
| 10 | anything else | `unknown` | the same |

The room reduces again at `recheckAt` (a timer on the room's `Clock`), and on every completed request, pause, visibility change, and turn reply, so the charger leaves the plugged pose on the first frame after a stale answer (SC-003). A request in flight never changes the tier (FR-042).

**Cause classes**, shared with the talk panel's fixed messages (spec 002's classes):

| Class | Causes |
|---|---|
| `resting` | `local_unhealthy`, `local_error`, `no_fallback_in_stack`, `fallback_unavailable` |
| `budget` | `meter_at_ceiling`, `fallback_spent_today`, `fallback_awaiting_renewal`, `kill_switch_tripped` |
| `unavailable` | every other cause, named or not: `store_unreachable`, `store_uninitialized`, `journal_unwritable`, `api_unavailable`, the relay's `no_path_available`, and any cause the room doesn't know |

**The poller** keeps `lastStart` (when the last request began), `waitMs` (the next request's wait after `lastStart`), and at most one request in flight. The request is `GET /api/status` on the room's own origin, with no query string, extra header, or credentials, uncached, refusing redirects, and with a 5-second timeout that covers the body; its URL is code, never data, and it stores nothing (FR-044).

| State | Entered when | Behaviour |
|---|---|---|
| `idle` | before Enter, or while `live.source` is `off` | no request (FR-045, SC-012) |
| `polling` | entered, the page visible, the room not paused | a request at Enter, then each at `lastStart + waitMs`. After a valid answer, `waitMs` is the poll interval; after a failure it doubles, up to 120 s; after a 429 it is also at least `Retry-After` (the header in seconds, else the body's `retry_after_s`) |
| `suspended` | paused or hidden | the timer is cleared; a request in flight completes and is recorded, and paused still wins (row 2) |

On resume or return, the room reduces the tier before the next frame. It then requests at once only if `waitMs` is the poll interval, no `Retry-After` wait remains, and the last request began at least one interval ago; otherwise it re-arms at `lastStart + waitMs` (FR-042). Every start is at least one interval after the one before, so no room makes two requests within one interval (SC-012).

### 11.2 The turn-cost channel (FR-047 to FR-050)

```ts
type TurnOutcome =
  | { kind: "reply"; route: unknown; cost_micro_usd: unknown }
  | { kind: "degraded"; cause: string }     // the cause, for the talk panel's own message
  | { kind: "failed" }
  | { kind: "lost" }
  | { kind: "refused"; status: number };
type CallReading = "unconfigured" | "no-call-yet" | "local-zero" | { paid: bigint } | "unavailable";
interface CostState {
  readonly configured: boolean;                   // live.turn is "site"
  readonly call: CallReading;
  readonly callFrom: "turn" | "fixture" | null;   // what fed the current call reading
  readonly visitMicro: bigint;
  readonly visitPaid: boolean;                    // the total includes a paid reply, so it reads "est."
  readonly visitAtLeast: boolean;                 // set by a turn with no valid cost; cleared only by a reload
  readonly visitSample: boolean;                  // a fixture fed the total
}
```

**Classifying a turn's result** (`classifyTurn`, [contracts/turn-cost.md](contracts/turn-cost.md)):

| The turn's result | Outcome |
|---|---|
| 200 with a JSON object | `reply`, with its `route` and `cost_micro_usd` as received |
| 503 whose body has `state: "degraded"` (the gateway's, or the edge's `api_unavailable`) | `degraded` |
| any other 5xx (a 502 `local_error` among them), or a network error before any response | `failed` |
| an abort, or a body that fails to read or parse, after the request was sent | `lost` |
| 400 to 499, 429 included | `refused` |

A `reply` is **valid** when `route` is `"local"` or `"fallback"` and `cost_micro_usd` is a safe integer of at least 0. The gateway's dev-only `"metered"`, a cost sent as a string, and a fraction all read invalid.

| State or outcome | "this call" | "this visit" |
|---|---|---|
| `configured` false (`live.turn` is `off`, today) | cost unavailable | cost unavailable |
| configured, before the visit's first turn | no call yet | $0 |
| a valid reply, route `local`, cost 0 | local · $0 | unchanged |
| any other valid reply | its cost to six decimals, "est." | adds the cost exactly; six decimals and "est." once it holds a paid call |
| an invalid reply, `degraded`, `failed`, or `lost` | cost unavailable | marked "at least" from then until reload, even after a later paid turn |
| `refused` | unchanged | unchanged |

Sums are BigInt micro-dollars and amounts are formatted with integer arithmetic, so "this visit" is the exact sum of the valid costs (SC-011). A drafts build marks figures "test"; figures a fixture feeds read "Sample" (FR-049). Every 200 reply whose `route` is `"fallback"`, valid cost or not, sets `fallbackReplyAt` for the tier's row 7. The channel makes no request and writes no storage, and its words never reach the twin or the announcer (FR-038, FR-050).

### 11.3 The motion store (FR-059, FR-060)

| Flag | Source | While it's set |
|---|---|---|
| `paused` | the toolbar's "Pause the room" toggle (`aria-pressed`) | final frames: no typing, glow motion, or idle sway; polling stops; the tier reads `paused` (row 2), or `not-live` while the live source is off (row 1); the text copy reads "Paused at {time}", `{time}` the wall clock's HH:MM, 24-hour, local, kept as `pausedAt` |
| `reducedMotion` | `matchMedia("(prefers-reduced-motion: reduce)")`, with a change listener, read throughout the visit | final frames; state changes apply at once; polling and the tier carry on |
| `hidden` | `document.visibilityState` is `hidden` | polling stops; the tier reads `paused` (row 2); on return it is reduced again before the next frame |

The room animates only while all three are false. In every case the neon counters still update for the visitor's own turns; only the glow's motion stops (FR-060). While paused, the frame loop keeps drawing still frames, so resuming never counts as one long frame.

### 11.4 A studio model's lifecycle (FR-055 to FR-057)

```text
stand-in ─┬─ below ADR 0010's floor, or the room in 2D ─────────────────────────────────────────► skipped
          └─ after the twin and the chosen avatar, in load order, at most 4 at once ─► fetching
fetching ─┬─ 200, integrity, parsed, every image decoded; swapped in after the hand-off ─────────► loaded
          ├─ its textures would take the ledger over 96,000,000 bytes ────────────────────────► skipped
          └─ blocked, 10 s timeout, integrity, not 200, parse or decode failure,
             or fewer images decoded than the materials use ──► retried ──► fetching, once more
retried's fetch fails too ───────────────────────────────────────────────────────────────────► failed
loaded ── the 3D context is lost and restored ──► stand-in ──► fetching, from the HTTP cache, under a hold
```

| State | What the piece shows |
|---|---|
| `stand-in`, `fetching`, `retried` | its stand-in, selectable, with its live faces, glows, and switch state |
| `loaded` | the model in place of the stand-in's meshes; the model's own face objects hidden; the room's face quads drawn over it |
| `failed`, `skipped` | its stand-in, as above, for the rest of the visit, and the placeholder note shows (FR-057) |

The quality controller holds while a model parses and swaps, so loading never steps quality down (FR-055). In spec 003's reduced display mode, images decode at half size (FR-056). Decoded images are closed once uploaded, and no object URL is ever made, since the CSP has no `blob:`.

### 11.5 Spec 003's asset events (FR-071, Amendment C11)

Each state the lifecycle ends in records one event, in spec 003's shape:

| Field | Value |
|---|---|
| `asset` | spec 003's `files[].id`, the record's file name without its extension, which is the piece's ID (FR-071's "keyed by its record's file") |
| `outcome` | `loaded`, `retried`, `failed`, or `skipped` |
| `ms_bucket` | from the first fetch's start to the swap or the failure: `<250`, `<1000`, `<3000`, `<10000`, or `>=10000`; `<250` for a skip |
| `bytes` | for `loaded`, the `.glb.gz`'s length, the bytes transferred (C11); otherwise 0 |
| `mode` | `full` (spec 002's `3d`), `reduced`, or `2d` |

While `live.asset_events` is `off`, events are queued in page memory, shown in the lookdev page's log in a drafts build, and discarded with the page; nothing is sent. Once it's `site`, spec 003's batch applies: at most one `POST /api/events` every 10 seconds, up to 20 events, and a beacon when the page is hidden. There is no new event kind: selecting a piece still sends spec 002's `object_selected` with the selectable's ID and nothing else (FR-071).

### 11.6 A lookdev candidate, and the results (FR-067 to FR-069)

**A candidate** is a file the Author picks for one piece: read with `File.arrayBuffer()`, hashed in the page (SHA-256), compressed in the page with pako at level 9 for `gzip_bytes`, checked by the compositor's own fit code against the piece's catalog entry and budget, and swapped in through the production loader's parse path. It never leaves memory: no request, no storage, no object URL; a reload drops it. Its findings read `<rule> candidate:<path>: <reason>`, never the picked file's name. The Author approves only the SHA-256 the page showed (FR-068, FR-023).

**The results**, copied out as JSON after a 2-minute run or a 10-minute soak ([contracts/lookdev.md](contracts/lookdev.md)):

```json
{
  "schema": 1,
  "build": "drafts",
  "bundle": "<the bundle's digest>",
  "probe": {
    "webgl2": true, "max_texture_size": 0, "device_memory": null, "create_image_bitmap": true,
    "secure_context": false, "viewport": [0, 0], "dpr": 0
  },
  "scene": "room",
  "view": "phone",
  "stage_css": [0, 0],
  "dpr": 0,
  "look": "<look>",
  "sample": "<fixture>",
  "quality": { "mode": "auto", "settled": 0, "step_downs": 0, "step_downs_while_loading": 0 },
  "duration_s": 120,
  "scripted_load": true,
  "frames": { "count": 0, "p50_ms": 0, "p95_ms": 0, "median_fps": 0, "over_33ms_share": 0 },
  "draw_calls": 0,
  "triangles": 0,
  "texture_bytes": 0,
  "smallest_cap_css": { "face": "<placement>.<role>", "px": 0 },
  "candidates": [
    {
      "piece": "<piece>", "sha256": "<64 hexadecimal digits>", "bytes": 0, "gzip_bytes": 0,
      "scrubbed": true, "mark": "model", "findings": ["<rule> candidate:<path>: <reason>"]
    }
  ]
}
```

| Field | Rules |
|---|---|
| `probe` | the phone copy's first panel (FR-069): WebGL 2, the largest texture size, the device memory where the browser reports it, `createImageBitmap`, whether the context is secure, the viewport, and the pixel ratio; null on the site's page. It decides between Q1's option A and its fallback, option B |
| `scene` | `room` or `vignette` |
| `view` | `desktop`, `phone`, or `close-up`; `stage_css` and `dpr` as measured, which re-measure the reference phone's stage |
| `quality` | `mode`, `auto` or a pinned level 0 to 3; `settled`, the controller's level at the end; `step_downs`, in all, and `step_downs_while_loading`, while any hold is held or any piece loads (SC-005) |
| `duration_s`, `scripted_load` | 120 for SC-005's visit, 600 for its soak; whether the run began with the scripted load |
| `frames` | from the frames' intervals: p50 and p95 frame time, the median frame rate, and the share over 33 ms (SC-005) |
| `texture_bytes` | the run's texture ledger, Σ w × h × 4 × 4/3 (SC-006) |
| `smallest_cap_css` | the smallest cap height on the current view, from `compose/legibility.ts` (FR-052) |
| `candidates[]` | as above, with `mark`, the mark's class, `model`, `composite`, or `hand`, or null when not scrubbed |

The results carry no file name, path, or device identifier beyond the viewport and pixel ratio.

## 12. How the entities relate

```text
scene.look ──► looks/<look> ──► typefaces ──► fonts.lock families
catalog/<piece> ◄── placement.piece                              (a piece: 0..n placements)
placement.mount ──► another placement + an anchor of its piece  (one tree, rooted at the shell)
placement.faces.<role> ──► regions ──► room-text block | outline | resume titles | UI words | turn cost
selectable.members ──► placements                               (a placement: 0..1 selectables)
selectable.action ──► topic (talk) ──► corpus files              | the resume
switch.piece ──► catalog claims.poses ◄── switch.poses (mounts) ◄── cases (each tier value ──► one pose)
catalog.model ──► assets/room/<piece>.glb ── record ── approval on main ── fit (RX) ≤ budget ≤ caps (RK)
catalog.work_order + look.material_notes ──► docs/studio/work-orders/<piece>.md
selectable IDs ──► config/room-events.yaml objects · config/room-topics.yaml · manifest objects · the turn's feature
```

- A placement has one piece and one mount; the shell has none, and the mounts form one tree. A child moves with its parent but never takes its scale.
- A selectable has one or more members and opens one topic or the resume; a topic is opened by any number of selectables, and a lead belongs to the selectable, not the topic.
- A live face has at most one binding per placement; a binding has one or more regions, each with one source; a block or outline is bound by any number of regions and approved by one entry on main.
- A switch places one piece in its poses, and maps each tier value to exactly one pose; a pose's claim comes from the piece's catalog entry.
- A selectable's ID is one event object, one topic-mapping entry, one manifest object, and the conversation's `feature`, for as long as it lives, and stays retired after.
- A set model belongs to one piece, whose ID is its stem; its record's SHA-256 is its approval's, its URL's, and its integrity check's.
- The index and the 3D part come from one composition and carry one digest; room text and the resume's titles join them at Enter from `room-data.json`.
- At run time, the tier feeds the switches' shown poses and the text copy's sentence; the cost channel feeds the neon counters and, through `fallbackReplyAt`, the tier; the motion store gates animation, polling, and the tier's row 2.

## 13. Key numbers

| Figure | What | Source |
|---|---|---|
| `^[a-z][a-z0-9-]{1,40}$` | piece, placement, selectable, and topic IDs | FR-004; the gateway's event-object grammar |
| 64 | the most selectables | B7 |
| `^[a-z0-9]+(-[a-z0-9]+)*$` | node and mesh names; live-face roles | FR-017, FR-018 |
| 1 mm, 1° | live-face quad tolerance | FR-017 |
| the larger of 2 cm and 3% | bounds tolerance, at both corners | FR-019 |
| 1 to 4 | a stylized scale (the plan's bound) | FR-051 |
| 0.45, 0.6, 0.8, 1.15, 1.5, 2.4 | the framing aspects, spec 002's | FR-009 |
| ≈ 686 × 640 CSS px at pixel ratio 1 | the reference desktop's stage, from a 1920 × 1200 window | FR-052; the spec's Terms |
| ≈ 368 × 420 CSS px, pixel ratio ≈ 2.8 | the reference phone's stage, re-measured in the first lookdev run | FR-052, FR-067 |
| 304 × 248; 326 × 208 | the smallest supported stages: 320 × 568 in portrait and in landscape (the foundation's `compose/stages.ts` computes the landscape one as 304 × 208) | FR-064, FR-065 |
| 304 × 208; 304 × 640, the narrowest aspect; 0.95 | the three stages recommendation 1 names (a 568 × 320 screen in landscape, a 320 × 960 screen held upright, and the 2D drawing's smallest scale); FR-064's smallest stages hold them, and, by Reading R1's default, the phone-sized stages around them ([contracts/room-data-files.md](contracts/room-data-files.md) §13.3) | FR-064, SC-009 |
| 7 ft × 7 ft × 4 ft | the cube: 2.1336 m wide, 2.1336 m high, 1.2192 m deep | FR-078 |
| 44 × 44 CSS px | a hit area and a selectable's exclusive pick core | FR-064, SC-009 |
| 9 CSS px of cap height | the legibility floor, on both reference stages | FR-052, C7, SC-010 |
| 2,500,000 bytes at gzip 9 | per piece | FR-053, C7 |
| 40,000 | triangles per piece | FR-053 |
| 1024 px | textures on the small props | FR-053 |
| 96,000,000 bytes | the scene's texture memory on a phone, w × h × 4 × 4/3 | FR-053, SC-006 |
| 12,000,000 bytes | the design's estimate of the room's share of the first visit | FR-053 |
| 25,000,000 bytes | spec 003's phase-3 first visit, the enforced limit | FR-053, SC-006 |
| gzip level 9, mtime 0, OS 255 | every served GLB's encoding | FR-079, FR-010 |
| 16 hex characters | the hash in `/a/<stem>.<hash16>.glb` | spec 003's site-loading contract |
| 31,536,000 s, immutable | the cache lifetime under `/a/` | spec 003's site-loading contract; the plan |
| 16 KB; 150 KB | the index, and the whole entry chunk, gzipped | FR-011; the plan; spec 002's entry budget |
| 30 s | the poll interval; `poll_s` may be 30 to 120 | FR-044, A1 |
| 35 s | the freshness window, at least the interval plus the 5 s timeout | FR-042 |
| 5 s | the status request's timeout | FR-041, FR-044 |
| 120 s | the longest backoff | FR-044 |
| 2 a minute | the most status requests per visible, unpaused room | A1, SC-012 |
| 30 a minute, burst 10 | the relay's status bucket, shared by every visitor behind one address | A1 |
| 40 s | the charger leaves the plugged pose after the relay's local path turns unhealthy | SC-004 |
| 5 s | the monitor's typing, at most | FR-031 |
| 2 s | the wait before the fallback typeface | FR-061 |
| 10 s, one retry | a model's fetch | FR-056, FR-057 |
| 4; 2 | fetches and parses at once | the plan |
| 15, 15, 8, 0 a second | typing redraws at quality 0 to 3; outlines and glow cards off from quality 2; face and label scale 0.5 at quality 3 | B13, the plan |
| 0 | quality step-downs while pieces load | FR-055, SC-005 |
| a median of 30 fps; 95% of frames within 33 ms | the reference phone, over 2 minutes and a 10-minute soak | SC-005 |
| 6 decimals | a cost's display, from integer micro-dollars | FR-048 |
| 2⁵³ − 1 | the largest valid `cost_micro_usd`, a safe integer | FR-048 |
| 10 s; 20 | spec 003's asset-event batch: the interval, and the most events in one | FR-071 |
| 60 s | the "Room live state" panel follows the relay's change | SC-014 |
| 30 days | how long Prometheus keeps a retired selectable's series | FR-004 |
