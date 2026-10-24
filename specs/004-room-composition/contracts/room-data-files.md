# Contract: the room's data files, their rules, and their refusals

The files that describe the room, their exact schemas, and every rule the compositor applies to them. Spec: FR-001 to FR-009, FR-012, FR-013, FR-017, FR-018, FR-020, FR-026, FR-029 to FR-036, FR-040 to FR-045, FR-051 to FR-053, FR-063, FR-064, FR-074, FR-075, FR-078; SC-001, SC-002, SC-010. Amendments B3, B5, B6, B7, B8, B9, B10, C2, C7. Plan: [plan.md](../plan.md). Research: [research.md](../research.md). Data: [data-model.md](../data-model.md), whose entities and field names this contract gives in full. What the compositor writes from these files is [room-bundle.md](room-bundle.md); the model checks the RX rules name are [plain-model-fit.md](plain-model-fit.md); the live configuration's own contract is [tier-signal.md](tier-signal.md) §1.

No content about the Author goes in this contract's examples: placeholders in angle brackets only, as spec 002's `contracts/resume-source.md` (on `feat/002-us6-events`) has it. Files on other branches are named in code spans with their branch. A dagger (†) marks a field that never reaches the built site (FR-012).

## 1. Where the data lives

```text
apps/web/room/                       the room's data: agents write it, the reviewer's Room data pass reads it (P-7)
├── README.md                        how to add, move, or retarget a piece (prose; the compositor never reads it)
├── catalog/<piece>.yaml             one piece each (§4)
├── scene.yaml                       placements, switches, selectables, the hand-off, the live configuration, the survey, retired IDs (§5)
├── topics.yaml                      (§6)
├── ui-words.yaml                    (§9)
├── looks/<look>.yaml                (§10)
├── fixtures/<fixture>.yaml          drafts builds and tests only (§11)
└── lookdev.yaml                     drafts builds only (§12)
apps/web/content/room/               room text, approved by hash: agents draft, the Author approves
├── <block>.yaml                     one drawn block each (§7)
└── outlines/<sign>.outline.json     a sign's lettering, brought in by the Author (§8)
```

| Kind (FR-001) | File | Written by | Approved by hash | What reaches the built site |
|---|---|---|---|---|
| Piece catalog | `apps/web/room/catalog/<piece>.yaml` | agents, reviewed | no | geometry, stand-in, drawing, faces, glows, claims; never `name`, `origin.point`, `estimated`, `budget`, or `work_order` |
| Scene | `apps/web/room/scene.yaml` | agents, reviewed | no | placements, switches, selectables, the hand-off, the live configuration; never `estimated`, `survey`, `retired[]`, or a selectable's `lead`, which goes only to `config/room-topics.yaml` |
| Topics | `apps/web/room/topics.yaml` | agents, reviewed; the Author chooses the topics | no | `id` and `phrase`; `corpus` only in `config/room-topics.yaml`; never `words_from` |
| UI words | `apps/web/room/ui-words.yaml` | agents, reviewed like spec 002's `messages.yaml` | no | each value's text; never its `claims` |
| Looks | `apps/web/room/looks/<look>.yaml` | agents; the Author chooses one in lookdev, recorded in ADR 0010 (FR-070) | no | everything but `material_notes` |
| Fixtures | `apps/web/room/fixtures/<fixture>.yaml` | agents | no | drafts builds only (FR-066) |
| Lookdev | `apps/web/room/lookdev.yaml` | agents | no | drafts builds only (FR-066) |
| Room text | `apps/web/content/room/<block>.yaml` | agents draft (FR-030, FR-031) | yes, kind `room-text` (B9) | each published line's `text` only, in `room-data.json`; a draft only in a drafts build (FR-030) |
| Outline | `apps/web/content/room/outlines/<sign>.outline.json` | traced in the studio from the Author's design, or by the Author with a local tool over a photo inside the photos folder, after P-8's check there; brought in by the Author (FR-032) | yes, kind `room-text` | `words` (as its line), `view_box`, `cap_height`, `advance`, and `paths` |

**Approval** is spec 002's: a room-text or outline file is approved when `main`'s `assets/policy/content-approvals.json` holds an entry with its current SHA-256 and the kind `room-text` (Amendment B9; spec 002's `contracts/resume-source.md` §5). Otherwise it's a draft.

**Formatting.** Every YAML file here passes `prettier --check` in `make lint`, so a room-text file is formatted before the Author approves its hash: a reformat would change it. `.prettierignore` gains `apps/web/content/room/outlines/`, since an outline is tool output approved by hash.

**What the compositor reads**, and nothing else, through its `Tree` ([room-bundle.md](room-bundle.md) §1), so FR-006's test can prove that a data edit reads no source file:
- the two folders above;
- `assets/room/**` (models, cards, and `records.json`), and `assets/twin/**` and `assets/visitors/**`, for the figures' texture memory (RK3);
- `apps/web/fonts/**`, for the typefaces' metrics (RT10, RG7);
- `apps/web/content/resume.yaml`, for the section titles' fit (RT8, strict mode);
- `corpus/*.md` and `corpus/facts/*.yaml`, and the private denylist where the session can read it (RT2 to RT5, RT7);
- `docs/data-flow-disclosure.md` (RL2 to RL4);
- `intent/*.md` and `specs/*/intent.md` (RT9, RT13, strict mode).

The caps come through the policy, never the tree ([room-bundle.md](room-bundle.md) §2).

## 2. Common rules

| Rule | Value |
|---|---|
| Encoding | UTF-8 with no byte-order mark, LF line ends |
| YAML | one document, YAML 1.2 read with the `yaml` package's core schema, `parseDocument(text, {schema: "core", uniqueKeys: true, merge: false})`, as spec 002's `apps/web/build/content.ts` reads; aliases, anchors, merge keys, and tags refused. So `off` is a string |
| JSON (outlines) | one object; no duplicate key, `NaN`, or `Infinity` |
| Objects | zod `strictObject`s: an unknown key, a missing required key, or a value outside its declared type refuses the file (RD); no value is ever evaluated as code (FR-005) |
| `version` | the integer `1` at the top of every YAML file; an outline has `schema: 1` |
| Numbers | finite; integers where a table says integer |
| Lengths and axes | metres; +Y up, the front facing +Z, +X to the piece's right as seen from its front (FR-015) |
| A position | `[x, y, z]` |
| A turn | `{x, y, z}` in degrees, each 0 when absent and at most 360 in size, applied in Y-X-Z order: R = R_y(y) · R_x(x) · R_z(z), three.js's Euler order `"YXZ"` |
| A box | `{min: [x, y, z], max: [x, y, z]}`, `min` below `max` on every axis |
| Colours | a palette name of the scene's look (§10), or `#rrggbb` in lowercase |
| `estimated` | `true` on a size, an anchor, or a mount whose figure isn't measured yet, such as a size estimated from the desk photo of 2026-10-22. Each adds a "Measure" line to its piece's work order and to the photo guide's checklist (FR-002, FR-026, FR-078) † |

**Mounting** (FR-003; the kernel's `apps/web/src/room/compose/mount.ts`, one function for the compositor's checks, the runtime, and lookdev):

```text
World(shell) = I
World(p)     = World(on) · T(s_on · anchor.at) · R(anchor.turn) · T(offset) · R(turn)
Model(p)     = World(p) · S(s_p)
```

`s_on` is the parent's piece's stylized scale and `s_p` the placement's own. An anchor moves with its piece's scale, but a child never inherits the scale: an enlarged monitor doesn't enlarge the neon sign clipped to it. A parent's move carries everything mounted on it (User Story 1, scenario 1). Catalog figures are at scale 1; a studio model is made at its size times its stylized scale (FR-015).

## 3. IDs, names, and the closed vocabulary

### 3.1 IDs

- **Grammar:** `^[a-z][a-z0-9-]{1,40}$`, the gateway's for `config/room-events.yaml`'s objects (spec 002's `services/gateway/src/config/room-events.ts`, on `feat/002-us6-events`).
- **The four namespaces** FR-004 and FR-007 name: pieces, placements, selectables, and topics. An ID is unique in its namespace, never equals a word of the closed vocabulary (§3.4), and never takes a retired ID (§3.3). The same string may name one thing in each namespace: piece `laptop`, placement `laptop`, selectable `laptop`. These are the IDs FR-007's source scan keeps out of code (§16).
- **What a selectable's ID is:** the usage event's `id` and the conversation's `feature` (FR-004, Amendment B5). `free_talk`, which this grammar can't spell, stays the free conversation's. There are at most 64 selectables, the gateway's cap (RI6).
- **File stems:** a piece's ID is its catalog file's stem, and a model's or card's file stem is its piece's ID, so the caps' `small_props`, spec 003's `files[].id`, and the asset events name pieces and files alike.
- **The reserved prefix `fx-`** belongs to the tests' synthetic IDs. `apps/web/test/room/compose.test.ts` refuses it in the committed data, so no literal in a test can be a real ID.
- **IDs the spec fixes:** the selectables `snowboard`, `bicycle`, and `laptop` (spec 002), and `chalkboard` (Amendments B3, B7). Every other ID is data.

### 3.2 Names

- **Other names** follow the same grammar and are unique where they're defined: an anchor and a glow within their piece; a pose within its switch; a switch, a look, a fixture, a palette colour, and a glow tone within their kind; room-text blocks and outlines within one shared set; and a `label.` UI word's name (§9). The source scan doesn't look for them.
- **A live face's role** follows FR-018's object-name rule, `^[a-z0-9]+(-[a-z0-9]+)*$`, unique within its piece, since the model's object carries it (FR-017).

### 3.3 Retired IDs

`scene.yaml`'s `retired[]` (FR-004):

| Field | Type | Rules |
|---|---|---|
| `id` | string | the ID grammar; unique in the list |
| `kinds` | list of `piece`, `placement`, `selectable`, `topic` | default: all four |
| `retired` | date | `YYYY-MM-DD` |
| `reason` † | string | why, in one line |

RI3 refuses any piece, placement, selectable, or topic of a listed kind that takes a retired ID, so the check needs no history. The list only grows, which the Room data pass holds. A removed selectable's ID joins it, leaves `config/room-events.yaml` at the next build ([room-bundle.md](room-bundle.md) §7), and keeps its dashboard history as long as Prometheus keeps it (30 days); the data-only proof's removal case makes that edit (SC-001).

### 3.4 The closed vocabulary

`apps/web/src/room/compose/vocabulary.ts`, code. A new word is a new behaviour, made through the lifecycle (FR-005):

| List | Words |
|---|---|
| Behaviour kinds | `mount`, `frame`, `live-face`, `glow`, `switch`, `cable`, `selectable` |
| Renderers | `terminal`, `desktop-session`, `neon`, `chalk`, `sign` |
| Signals | `tier`, `turn-cost` |
| Tier values (FR-041) | `local`, `cloud`, `resting`, `budget`, `unavailable`, `unknown`, `paused`, `not-live` |
| Turn-cost parts | `call`, `visit` |
| Actions | `talk`, `resume` |
| Roles | `twin`, `visitor` |
| Stand-in shapes | `box`, `cylinder`, `capsule`, `sphere`, `torus`, `plane`, `circle`, `tube`, `polygon` |
| 2D primitives | `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path` |
| Look methods | `inked-cel`, `painted`, `flat` |
| Typeface uses | `terminal`, `desktop-session`, `chalk`, `neon`, `counters` |
| Glow motions | `flicker`, `breathe`, `steady` |
| Region sources | `resume_titles` |
| Live switches | `off`, `site` |

So the code can say `twin` as a role while the placement is, for example, `twin-figure`, and the scan never meets a vocabulary word as an ID (RI5).

## 4. The catalog: `apps/web/room/catalog/<piece>.yaml`

```yaml
version: 1
id: <piece>
name: <visible name>
size: { w: <m>, h: <m>, d: <m>, estimated: true }
stylized_scale: 1
origin:
  point: <the physical point on the dimension sheet>
  bounds: { min: [<x>, <y>, <z>], max: [<x>, <y>, <z>] }
anchors:
  <anchor>: { at: [<x>, <y>, <z>], turn: { y: <deg> }, estimated: true }
live_faces:
  - { role: <role>, at: [<x>, <y>, <z>], size: [<w>, <h>], facing: [0, 0, 1], up: [0, 1, 0], px: [<w>, <h>], readable: true }
glows:
  - { id: <glow>, at: [<x>, <y>, <z>], radius: <m>, tone: <tone>, motion: breathe, level: 1 }
claims: { signal: tier, poses: { <pose-a>: local, <pose-b>: cloud, <pose-c>: null } }
standin:
  - { shape: box, size: [<w>, <h>, <d>], at: [<x>, <y>, <z>], color: <colour> }
drawing: { from: standin }
budget: { gzip_bytes: <int>, triangles: <int>, texture_px: <int>, texture_bytes: <int> }
model: { file: <piece>.glb }
work_order:
  method: <text>
  shots: [<text>]
  measurements: [<text>]
  studio_notes: <text>
```

| Field | Type | Rules (FR-002) |
|---|---|---|
| `id` | piece ID | the file's stem |
| `name` | string, 1 to 60 characters | the work order's and the report's; never drawn, since a stand-in's label is a UI word (§5.1). RT2 checks it |
| `size` | `{w, h, d}`, each above 0; `estimated`, boolean | the measured size at scale 1 |
| `stylized_scale` | number, 1 to 4, default 1 | FR-051: scales the piece's own geometry, anchors, faces, glows, and bounds, never what's mounted on it (§2). The studio models the piece at this scale, and lookdev sets it for each readable prop: the signs, the neon sign, the monitor (for its screen), the chalkboard (for its slate), and the charger's plug and lead (Confirmation 8) |
| `origin.point` † | string | the dimension sheet's physical point where the model's origin sits (FR-015) |
| `origin.bounds` | a box, at scale 1 | holds the origin; the fit check compares a model's bounds at both corners against it times the stylized scale (FR-019) |
| `anchors` | map of anchor name to `{at, turn?, estimated?}` | positions in the piece's frame at scale 1: what other placements mount on (§5.2), and what a cable runs between (§5.4) |
| `live_faces[]` | list | `role`, FR-018's object-name rule; `at`, the face's centre; `size`, `[w, h]` in metres, each above 0; `facing`, a unit normal; `up`, a unit vector perpendicular to it, default +Y and required when `facing` is ±Y; `px`, `[w, h]`, integers from 16 to 2048, the canvas's largest size (FR-054), in the face's aspect to within one pixel; `readable`, required: `true` for the faces FR-052 names (the monitor's screen, the chalkboard's slate, a sign's lettering area, the neon sign's word and counter panels). Each face lies inside the bounds (FR-017) |
| `glows[]` | list | `id`; `at`; `radius`, metres above 0; `tone`, a glow tone of the scene's look; `motion`, `flicker` (neon), `breathe` (screens), or `steady`; `level`, 0 to 1, default 1. A pose can set another placement's glow level, such as a charge light (§5.4) |
| `claims` | `{signal, poses}`, optional | only on a piece a switch places: `signal` is `tier`; `poses` maps each pose name to the tier value that pose claims, or `null`. At most one pose claims each value (FR-002, FR-043; RS2) |
| `standin[]` | list of shapes, at least one | §4.1; inside the bounds; drawn while the piece has no set model (FR-057) |
| `drawing` | `{primitives: [...]}` or `{from: standin}` | the 2D vector drawing, §4.2 (FR-058) |
| `budget` † | `{gzip_bytes, triangles, texture_px, texture_bytes}`, integers above 0 | `gzip_bytes` and `triangles` at or under the caps; `texture_px` a power of two, at or under `small_prop_texture_px` when the caps list the piece in `small_props`; `texture_bytes`, the planned Σ w × h × 4 × 4/3. RK1 refuses a budget above the caps; agents never raise one (FR-053) |
| `model` | `{file: "<piece>.glb"}` or `{card: "<piece>.png"}` (or `.jpg`, `.webp`), optional | absent until the Author's file is set. The file sits directly under `assets/room/`, with its `records.json` entry (RI7). A card is an image drawn on a plane of the piece's size, facing +Z. A figure's piece (§5.1) has none |
| `work_order` † | `{method, shots[], measurements[], studio_notes}`, strings | the brief [room-bundle.md](room-bundle.md) §9.1 renders; the reviewer reads it as room text: it locates nothing and names no third party's marks, and asks the studio's session for nothing FR-024 excludes: a photo or a crop of one, a file outside the studio's folders, a fetch, or an upload (FR-014) |

**A piece's picture** is `stand-in` until `set`. It is set when its `model` names an arrived file that passes its fit and its budget and `main` holds the caps' room block; it stays a stand-in while `model` is absent, while `main` has no room caps, or, in the image build, while its model has findings (FR-013). At run time a set piece can still show its stand-in, after a failed load (FR-057).

### 4.1 Stand-in shapes

A closed grammar (FR-005). Every shape also takes `at` (its centre), an optional `turn` and `scale`, `color`, and `lit` (boolean, default true; false draws it unlit, for a glowing panel):

| `shape` | Size fields |
|---|---|
| `box` | `size: [w, h, d]` |
| `cylinder` | `radius`, `height` (along Y) |
| `capsule` | `radius`, `length` (along Y) |
| `sphere` | `radius` |
| `torus` | `radius`, `tube` (in the XY plane, facing +Z) |
| `plane` | `size: [w, h]` (facing +Z) |
| `circle` | `radius` (facing +Z) |
| `tube` | `from: [x, y, z]`, `to: [x, y, z]`, `radius` |
| `polygon` | `points: [[x, y], …]`, at least three, and `depth`, extruded along Z |

A stand-in carries no text: its label is a UI word (§5.1).

### 4.2 The 2D vector drawing

- **`{from: standin}`:** the compositor derives the stand-in's front elevation: a box, cylinder, capsule, or plane as a rectangle, a sphere or circle as a circle, a torus as a ring, a tube as a line of its radius, a polygon as itself.
- **`{primitives: [...]}`:** a front elevation in the piece's own metres at scale 1, x to the right and y up, from a closed set:

| Primitive | Fields |
|---|---|
| `rect` | `x`, `y`, `w`, `h` |
| `circle` | `cx`, `cy`, `r` |
| `ellipse` | `cx`, `cy`, `rx`, `ry` |
| `line` | `x1`, `y1`, `x2`, `y2` |
| `polyline`, `polygon` | `points`: 2 to 256 `[x, y]` pairs |
| `path` | `d`: path data in §8's grammar |

Each also takes `fill` and `stroke` (colours, or `none`) and `stroke_width` (metres, at least 0). A drawing holds no text, link, or style. Every placement and every switch pose has one (FR-009); the visitor's is the chosen avatar's flat shape, which spec 002's `apps/web/src/choice/avatars.ts` keeps. The compositor places each drawing in the 320 × 200 view box through `framing(1.6)` ([room-bundle.md](room-bundle.md) §3.1), so the 2D room is attribute-only SVG under the site's CSP (FR-058).

## 5. The scene: `apps/web/room/scene.yaml`

```yaml
version: 1
look: <look>
live: { source: off, poll_s: 30, freshness_s: 35, turn: off, asset_events: off }
placements:
  - { id: <placement>, piece: <piece> }
  - id: <placement>
    piece: <piece>
    mount: { on: <placement>, anchor: <anchor>, offset: [<x>, <y>, <z>], turn: { y: <deg> }, estimated: true }
    frame: true
    label: label.<name>
    faces:
      <role>:
        label: label.<name>
        regions:
          - { rect: [0, 0, 0.5, 1], renderer: terminal, grid: { cols: <n>, rows: <n> }, text: <block> }
          - { rect: [0.5, 0, 0.5, 1], renderer: desktop-session, grid: { cols: <n>, rows: <n> }, text: <block> }
  - { id: <placement>, piece: <piece>, role: twin, mount: { on: <placement>, anchor: <anchor> }, frame: true }
switches:
  - id: <switch>
    signal: tier
    piece: <piece>
    label: label.<name>
    poses:
      <pose-a>:
        mount: { on: <placement>, anchor: <anchor>, offset: [<x>, <y>, <z>], turn: { y: <deg> } }
        glows: [{ placement: <placement>, glow: <glow>, level: 1 }]
      <pose-b>: { mount: { on: <placement>, anchor: <anchor> } }
      <pose-c>: { mount: { on: <placement>, anchor: <anchor> } }
    cases: { local: <pose-a>, cloud: <pose-b>, resting: <pose-c>, budget: <pose-c>, unavailable: <pose-c>, unknown: <pose-c>, paused: <pose-c>, not-live: <pose-c> }
    cable: { from: <anchor>, to: { placement: <placement>, anchor: <anchor> }, sag: 0.2, radius: 0.004, drop: 0.1, rest: { placement: <placement>, anchor: <anchor> } }
selectables:
  - id: <selectable>
    name: <visible name>
    members: [<placement>]
    action: { talk: { topic: <topic>, lead: <one line> } }
  - { id: <selectable>, name: <visible name>, members: [<placement>], action: { resume: {} } }
handoff: { from: { placement: <placement>, anchor: <anchor> }, to: { placement: <placement>, anchor: <anchor> } }
survey: { desk_corner: { placement: <placement>, anchor: <anchor> } }
retired: []
```

Order matters twice. The order of `selectables` is the "In the room" list's, the Tab order's, and the load order's priority (FR-056, FR-063). The order of `placements` sets the text copy's order of faces and breaks depth ties in the 2D drawing.

### 5.1 A placement

| Field | Type | Rules |
|---|---|---|
| `id` | placement ID | |
| `piece` | piece ID | names a catalog entry (RI4) |
| `mount` | a mount (§5.2) | required on every placement but one: the room's shell, the root (FR-003). Exactly one placement has no mount (RI8) |
| `frame` | boolean, default false | the camera frames it at spec 002's six aspects (FR-009). Required true for the `twin` placement and for every selectable's member (B8; RG4); the desk is framed as the scene says |
| `label` | UI word key `label.<name>`, optional | the stand-in's label: the UI word `standin.label` with `{name}` filled by this word, drawn only while the placement shows a stand-in. So every drawn label is a UI word (FR-029; User Story 1, scenario 2) |
| `role` | `twin` or `visitor`, optional | the figures, one placement each, both required (RI8). Their pictures come from spec 003's avatar loader, so their pieces have no `model`; their catalog entries give the stand-in, the size, and the hands' anchors (FR-008) |
| `faces` | map of live-face role to a face binding (§5.3), optional | each key one of the piece's live faces. A face with no binding stays one plain colour, a plain face FR-009 allows (the laptop's screen, FR-031 and Confirmation 12) |

### 5.2 A mount

| Field | Type | Rules |
|---|---|---|
| `on` | placement ID | another placement, never a switch's pose; the mounts form one tree rooted at the shell, with no cycle (RG1) |
| `anchor` | anchor name | one of the anchors of `on`'s piece (RI4) |
| `offset` | position, default `[0, 0, 0]` | metres, in the anchor's frame |
| `turn` | turn, default 0 each | in the anchor's frame (§2) |
| `estimated` † | boolean, default false | the position isn't measured yet (FR-078) |

### 5.3 A face binding and its regions

| Field | Type | Rules |
|---|---|---|
| `label` | UI word key `label.<name>` | the face's label in the text copy (FR-063) |
| `atmosphere` | boolean, default false | allowed only on a face the catalog doesn't mark `readable`. Such a face whose smallest glyph falls under the floor must set it, its content capped, and its words are carried by the text copy (FR-052; RG7) |
| `max_chars` | integer, at least 1 | required with `atmosphere`: the content cap |
| `regions[]` | list, at least one | inside the face, not overlapping (RG9) |

A region:

| Field | Type | Rules |
|---|---|---|
| `rect` | `[x, y, w, h]`, fractions of the face | origin at the top left, in reading order, as the face's texture coordinates are stored (FR-017); inside `[0, 1]`; `w` and `h` above 0 |
| `renderer` | `terminal`, `desktop-session`, `neon`, `chalk`, or `sign` | FR-005, FR-031 |
| `grid` | `{cols, rows}` for `terminal` and `desktop-session`; `{rows}` for `chalk`; `{chars}` for `neon`; integers, at least 1 | the fixed text grid of the kernel's `layout.ts`: words never resize it, so legibility can't change with a reword, and text that overflows it is refused (RT8). A `sign` has none: its outline is fitted inside the region, keeping its aspect, centred |
| `text` | a room-text name | a block whose `renderer` is this region's, or, for `sign`, an outline (§7, §8) |
| `resume_titles` | `true` | `chalk` only: the published resume's section titles, withheld whenever the resume is (FR-033, Confirmation 11) |
| `ui` | list of UI word keys | `neon` only: the sign's word and its second line (FR-046, FR-049) |
| `signal`, `part` | `turn-cost`; `call` or `visit` | `neon` only: a counter panel and its label (FR-047) |

A region has exactly one of `text`, `resume_titles`, `ui`, and `signal` (RT1). A reference must resolve (RI4); whether its words show depends on approval, so a bound face may stay plain (FR-009, FR-030).

### 5.4 A switch, its poses, and the cable

| Field | Type | Rules |
|---|---|---|
| `id` | switch name | unique among switches |
| `signal` | `tier` | the one signal with values; `turn-cost` is a number and has no cases (RS1) |
| `piece` | piece ID | the piece each pose places, such as the charger, a plug and a short lead (FR-020); no placement places it too (RS2) |
| `label` | UI word key `label.<name>` | the text copy's label beside the tier's sentence (FR-043, FR-063) |
| `poses` | map of pose name to `{mount, glows?}` | when the piece declares `claims`, the same names as its `claims.poses` (RS2). A pose is the placement a case shows (the spec's Terms); its mount follows §5.2. `glows` sets other placements' glow levels while it shows, each `{placement, glow, level}`, such as a charge light |
| `cases` | map of tier value to pose name | when the piece declares claims, a case for every tier value and no `default` (FR-043; RS1) |
| `default` | pose name, optional | only when the piece claims nothing: the pose for the values `cases` doesn't list, so a case for a value the signal already has is a data edit (FR-006) |
| `cable` | `{from, to, sag, radius, drop?, rest?}`, optional | the run the room draws at run time (FR-005, FR-020): `from`, an anchor of the switch's piece (the lead's free end), resolved at the shown pose; `to`, a placement's anchor (the desk's back edge); `sag`, 0 to 0.5 of the span; `radius`, metres above 0 at scale 1, times the piece's stylized scale (FR-051); `drop`, metres, default 0, the short fall behind `to`; `rest`, a placement's anchor whose plane the run never dips below, so a lead lying on the desk lies on it (RS6) |

**The claims** (FR-043; RS3 to RS5). For every tier value V, the pose V's case shows claims V or nothing, and a pose that claims V is the one V's case shows; a `default` claims nothing. So only `local` can show the plugged pose and only `cloud` the cloud pose. The six other values show one shared pose that claims nothing, the plug resting on the desk (Q2). The plugged pose mounts on the laptop's port, so moving the stand carries the plug with the laptop (FR-040), and no other pose may sit where it sits. The run is drawn from the lead's free end to the desk's back edge, so moving the laptop, its stand, or the desk needs no re-export, and only the plug's pose decides whether the cable reaches the port (FR-020).

### 5.5 A selectable

| Field | Type | Rules |
|---|---|---|
| `id` | selectable ID | permanent: the usage event's ID and the conversation's `feature` (FR-004, B5) |
| `name` | string, 1 to 40 characters | the visible name, on its button in the "In the room" list (FR-063); RT2 checks it |
| `members` | list of placement IDs, at least one | each framed (RG4); a placement belongs to at most one selectable (RI6). FR-036's `laptop` holds the laptop, its stand, and the ultrawide monitor |
| `action` | `{talk: {topic, lead?}}` or `{resume: {}}` | `topic`, a topic ID; `lead` †, one line of at most 120 characters, such as the snowboard's winter hobbies first (FR-036, answer 1), published only in `config/room-topics.yaml` (FR-038) |

**The pick area** (FR-064): the union of the members' projected boxes, with an exclusive core of at least 44 × 44 CSS pixels at every supported stage, in 3D and 2D (RG6); a side-wall selectable — its members all mounted on the room shell's `left-wall` or `right-wall` anchor — that can't keep its exclusive core at a stage is list-only there: the room draws no pick area for it at that stage, the "In the room" list (FR-063) reaches it, and the compositor's report names it, at which stages, in 3D and in the 2D drawing. The runtime picks with the same function, the kernel's `pick.ts`, leaving a stage's list-only selectables out of its areas.

### 5.6 The hand-off, the live configuration, and the survey

- **`handoff`:** `from` is an anchor of the `twin` placement (the twin's hand), and `to` an anchor of the `visitor` placement (the visitor's hand) (RI8). The hand-off and its paper stay code (FR-008).
- **`live`:** [tier-signal.md](tier-signal.md) §1 is its contract; restated here so the scene's schema is whole:

  | Field | Values | Default | Rules |
  |---|---|---|---|
  | `source` | `off` or `site` | `off` | the tier's live source (FR-041 row 1, FR-045); `site` only with the disclosure's status row (RL2, FR-074) |
  | `poll_s` | integer, 30 to 120 | 30 | the poll interval (FR-044): at most 2 requests a minute (A1) (RL1) |
  | `freshness_s` | integer, at least `poll_s` + 5 | 35 | the freshness window (FR-042) (RL1) |
  | `turn` | `off` or `site` | `off` | whether the conversation turn route exists; while `off`, both counters read "cost unavailable" (FR-048); `site` only with spec 002's turn row (RL4) |
  | `asset_events` | `off` or `site` | `off` | whether spec 003's asset events are sent (FR-071); `site` only with their row (RL3) |

  The request's 5-second timeout and the backoff's 120-second cap are constants in code, FR-041's row 3 and FR-044 giving them as figures, so the scene has no key for them.
- **`survey`** †: `{desk_corner: {placement, anchor}}`, the desk's front-left corner, from which the photo guide's layout checklist measures each desk item (FR-026; [room-bundle.md](room-bundle.md) §9.2).

## 6. Topics: `apps/web/room/topics.yaml`

```yaml
version: 1
topics:
  - id: <topic>
    phrase: <the phrase the fixed message fills in>
    words_from:
      - { file: specs/004-room-composition/intent.md, quote: "<the Author's words, verbatim>" }
    corpus: [corpus/<NN>-<topic>.md]
```

| Field | Type | Rules |
|---|---|---|
| `id` | topic ID | |
| `phrase` | string, 1 to 60 characters | fills `{topic}` in spec 002's fixed message `topic_not_ready` (`apps/web/content/messages.yaml` on `feat/002-us6-events`), and the list's ": {phrase}"; never the visitor's words (FR-037, FR-063) |
| `words_from` † | list of `{file, quote}`, at least one | the Author's words the topic came from (FR-036): `file`, an intent (`intent/<NNN>-*.md` or `specs/<NNN>-*/intent.md`); `quote`, verbatim in it once whitespace is collapsed, which a strict build checks (RT9) |
| `corpus` | list of paths, at least one | `corpus/NN-<topic>.md` at the corpus's top level, spec 002's C1 form (RI9). A file may not exist yet; the topic then stays unready (FR-037) |

Readiness isn't a field. Every topic is `ready: false` until the twin's spec marks it ready, once its corpus exists and its evals and red-team cases pass (spec 002's FR-023; Amendment B4).

## 7. Room text: `apps/web/content/room/<block>.yaml`

One file per drawn block (FR-030; Key Entities): the monitor's terminal half and its desktop half, and each of the chalkboard's blocks. A sign's lettering is its outline (§8).

```yaml
version: 1
block: <block>
renderer: chalk
exclude: [<phrase>]
lines:
  - text: "<displayed value>"
    about_author: true
    claims:
      - { file: corpus/<NN>-<topic>.md, quote: "<a span of one tagged sentence>" }
  - text: "<displayed value>"
    pending: true
```

| Field | Type | Rules |
|---|---|---|
| `block` | string | the file's stem; unique among room text, which blocks and outlines share |
| `renderer` | `terminal`, `desktop-session`, or `chalk` | the renderer of every region that binds it (RT1) |
| `words_from` † | list of `{file, quote}`; at least one on a `terminal` or `desktop-session` block (RD3), optional on a `chalk` block | for the monitor's two scripts, the Author's typed description of the photographed screen (FR-031), recorded verbatim, in the Author's words, in an intent file; a strict build finds each quote verbatim (RT9) |
| `exclude` † | list of strings, at least one; required on a `chalk` block | the phrases no line may hold, cite, or echo (RT7): the chalkboard's lines never name Seva or quote its corpus framing (FR-033), by the Author's answer 3: "leave it off the chalkboard". `apps/web/test/room/words.test.ts` holds the committed chalk blocks to excluding "Seva" |
| `lines[]` | list, at least one | in order; they fill the bound region's grid row by row |
| `lines[].text` | string, no line break | the displayed value, and the only key the content check reads (P-9). It holds no slot, so a published string equals its approved value exactly, as the content check's whole-string match needs (FR-030; RT3) |
| `lines[].about_author` | boolean, default false | the line states something about the Author: C6 applies, so with no slot to hold a digit the line holds none, and C8 applies with its `claims` (FR-035; RT3, RT5) |
| `lines[].claims` † | list of `{file, quote}` | spec 002's citations, held by C1 to C5 and C8 (RT4, RT5). A chalkboard line comes from the corpus through its claims, or is the Author's approved words (FR-033) |
| `lines[].pending` | boolean, default false | true while the line's corpus words don't exist yet: never drawn, never published, and absent from the built site (FR-012, FR-033). Its citations aren't checked; C9 still is (RT2) |

Every `text` passes C9 (RT2). **The monitor's scripts** (`terminal`, `desktop-session`) hold no secret-shaped token, local, absolute, or home path, host or user name (`user@host`), email or IP address, URL other than the site's, or amount; they name products in plain text; and they finish typing within 5 seconds (RT6, FR-031). Agents draft both from the Author's typed description, and the Author judges the likeness when approving each hash (Confirmation 4). **No other key** in the file is named `text`, `name`, or `title`, so the human-only content check's key pattern finds exactly the displayed values ([intake-amendments.md](intake-amendments.md), P-9).

## 8. Outlines: `apps/web/content/room/outlines/<sign>.outline.json`

Exactly these keys (FR-032, FR-052):

```json
{
  "schema": 1,
  "sign": "<sign>",
  "words": "<the sign's words, exactly as the Author wrote them>",
  "intent_ref": "intent-004",
  "source": { "type": "design", "id": "<opaque id>" },
  "tool": { "name": "<tool>", "version": "<version>", "license": "<license id>" },
  "view_box": [0, 0, 1000, 250],
  "cap_height": 180,
  "advance": 960,
  "paths": ["<SVG path data>"]
}
```

| Field | Type | Rules |
|---|---|---|
| `schema` | integer | `1` |
| `sign` | string | the file's stem, before `.outline.json`; unique among room text |
| `words` | string | the sign's words exactly as the Author wrote them and the intent quotes them, "I am very busy" or "my dog thinks i'm cool"; the displayed value, which the room draws as the outline and writes in the text copy |
| `intent_ref` | string, `intent-NNN` | names the intent whose quotes hold `words`, without a path, which the outline check refuses; a strict build finds `words` inside that intent's quotation marks (RT13) |
| `source` | `{type, id}` | `type` is `design` (traced from the Author's design, Amendment C2) or `photo` (traced over a photo with a local tool inside the photos folder); `id` is opaque, spec 003's source-ID form `[A-Za-z0-9-]{3,40}`, never a file name |
| `tool` | `{name, version, license}`, strings | the tracing tool; `license`, the ID `assets/policy/licenses.json` gives it on `main` (P-6); a tool that runs offline and whose license allows publishing what it makes (FR-032) |
| `view_box` | `[min_x, min_y, width, height]` | finite; width and height above 0; y down, as in SVG |
| `cap_height` | number above 0, at most the view box's height | in view-box units: the height of a capital letter or a digit in the lettering, which the legibility measure uses (FR-052; Clarifications) |
| `advance` | number above 0, optional | in view-box units: the lettering's advance width, which centres it on its face; absent means the view box's width |
| `paths` | list of strings, at least one | path data, in the grammar below |

**Path data** (an outline's `paths` and a drawing's `path`): SVG's path commands `M m Z z L l H h V v C c S s Q q T t A a`, finite numbers (an optional sign, digits with at most one decimal point, an optional exponent), commas, and spaces, and nothing else.

**Refused anywhere in the file:** another key, an `href`, a `data:` URI, a base64-like run, a file name, a path, or a file extension. P-8's `tools/gates/outline_check.py` (human-only) checks this inside the photos folder before an outline leaves it, and the compositor checks it again on arrival (RT13). The Author's approval then covers the file by hash.

## 9. UI words: `apps/web/room/ui-words.yaml`

```yaml
version: 1
words:
  <key>: "<text, with {slots}>"
  <key>: { text: "<text>", about_author: true, claims: [{ file: corpus/<NN>-<topic>.md, quote: "<span>" }] }
```

A value is a string, or `{text, about_author: true, claims}` for a word that states something about the Author (FR-029, FR-035). Two kinds of key, and no other (RD2):
- **The code's closed list,** `apps/web/src/room/ui-keys.ts`: each key required, with exactly its slots (RT12);
- **labels the data references,** `label.<name>`: each referenced by a placement's, a face binding's, or a switch's `label`, and none left unreferenced (RI11). They keep adding a piece a data edit: its labels are data, not code.

**The closed list:**

| Key | Slots | Holds | Spec |
|---|---|---|---|
| `tier.local`, `tier.cloud`, `tier.resting`, `tier.budget`, `tier.unavailable`, `tier.unknown`, `tier.paused`, `tier.not-live` | – | the laptop's state sentence for each tier value, about the machine; three are FR-035's own words: "The Author's machine is serving", "The cloud fallback is serving", "Status unknown" ([tier-signal.md](tier-signal.md) §2) | FR-035, FR-043 |
| `pause.button` | – | "Pause the room" | FR-060, FR-065 |
| `pause.paused_at` | `{time}` | "Paused at {time}" | FR-060 |
| `sign.word` | – | the neon word, "Langfuse" | FR-046 |
| `sign.second_line` | – | "metered by the gateway · traced in Langfuse" | FR-049 |
| `sign.call_label`, `sign.visit_label` | – | "this call", "this visit" | FR-047 |
| `sign.no_call_yet` | – | "no call yet" | FR-048 |
| `sign.unavailable` | – | "cost unavailable" | FR-048 |
| `sign.local` | `{amount}` | "local · {amount}" | FR-048 |
| `sign.estimated` | `{amount}` | "{amount} est." | FR-048 |
| `sign.at_least` | `{amount}` | "at least {amount}" | FR-048 |
| `sign.not_affiliated` | – | the line saying the project isn't affiliated with or endorsed by Langfuse or its owner | FR-049, Confirmation 1 |
| `sign.test`, `sign.sample` | – | "test", "Sample" | FR-049 |
| `around.heading` | – | "Around the room" | FR-063 |
| `around.illustration` | – | the monitor's note that it is a scripted illustration | FR-031 |
| `around.call`, `around.visit` | `{amount}` | the sign's two figures as sentences, `{amount}` filled with the counter's reading as the sign shows it | FR-063 |
| `list.heading` | – | "In the room" | FR-063 |
| `list.resume_action` | – | the phrase a `resume` action shows in the list | FR-063 |
| `toolbar.credits` | – | "Credits" | FR-065; C9 |
| `standin.label` | `{name}` | a stand-in's label | FR-029 |
| `standin.note` | – | the note that placeholder shapes are in use | FR-013 |
| `draft.badge` | – | "Draft" | FR-030 |

How the sign's readings combine is [turn-cost.md](turn-cost.md)'s. Every value passes C9; C6 and C8 apply where it states anything about the Author, and a live value in a slot counts as a slot for C6 (RT2, RT3, RT5; FR-035). Amounts are live values, never UI words, so no UI word holds a digit outside a slot (FR-048). Spec 002's fixed messages stay in its `messages.yaml`; `topic_not_ready`'s `{topic}` now takes the topic's phrase.

## 10. Looks: `apps/web/room/looks/<look>.yaml`

```yaml
version: 1
id: <look>
method: inked-cel
palette: { <colour>: "#rrggbb" }
lights:
  ambient: { sky: "#rrggbb", ground: "#rrggbb", intensity: <n> }
  key: { color: "#rrggbb", intensity: <n>, from: [<x>, <y>, <z>], shadows: true }
shading: { steps: 3 }
outlines: { color: <colour>, width: <n> }
glow_tones: { <tone>: { color: "#rrggbb", intensity: <n> } }
typefaces:
  terminal: { family: IBM Plex Mono, weight: 400 }
  desktop-session: { family: IBM Plex Sans, weight: 400 }
  chalk: { family: Patrick Hand, weight: 400 }
  neon: { family: IBM Plex Sans, weight: 700 }
  counters: { family: IBM Plex Mono, weight: 400 }
material_notes: <text>
```

| Field | Type | Rules |
|---|---|---|
| `id` | look name | the file's stem; `scene.yaml`'s `look` names the chosen one, which ADR 0010 records (FR-070) |
| `method` | `inked-cel`, `painted`, or `flat` | closed in code (FR-005). Inked cel, the default by the Author's answer 2 ("Inked cel is fine"), shades with a stepped ramp and ink outlines, lit at run time; `painted` draws the textures unlit; `flat`, base colours only. No method uses baked light (FR-022) |
| `palette` | map of colour name to `#rrggbb` | the names stand-ins and drawings use |
| `lights` | `{ambient: {sky, ground, intensity}, key: {color, intensity, from, shadows}}` | colours `#rrggbb`; intensities at least 0; `from`, the key light's direction; `shadows`, boolean |
| `shading` | `{steps}`, an integer from 2 to 5 | inked cel's ramp |
| `outlines` | `{color, width}` | inked cel's ink lines |
| `glow_tones` | map of tone name to `{color, intensity}` | the tones glows name |
| `typefaces` | map of each typeface use (§3.4) to `{family, weight}` | each a family `apps/web/fonts/fonts.lock` (schema 2) vendors with `room` in its `uses`, at a weight it vendors (B10; RT10); changing one is a data edit (FR-033). The defaults: IBM Plex Mono for the terminal and the counters, IBM Plex Sans for the desktop half, Patrick Hand for the chalk (Confirmation 7), and IBM Plex Sans Bold for the neon word, drawn as a stroked tube, so the room adds no fourth family |
| `material_notes` † | string | for the work orders (FR-014) |

## 11. Fixtures: `apps/web/room/fixtures/<fixture>.yaml`

A named sample of both signals (Key Entities; FR-049):

```yaml
version: 1
id: <fixture>
tier: <tier value>
turns:
  - { outcome: reply, route: local, cost_micro_usd: 0 }
  - { outcome: reply, route: fallback, cost_micro_usd: <int> }
  - { outcome: reply, route: metered, cost_micro_usd: <int> }
  - { outcome: degraded }
  - { outcome: refused, status: 429 }
```

| Field | Type | Rules |
|---|---|---|
| `id` | fixture name | the file's stem |
| `tier` | a tier value | the value the switches show |
| `turns[]` | list | the outcomes fed to the cost channel, in order ([turn-cost.md](turn-cost.md)): `{outcome: reply, route, cost_micro_usd}`, `{outcome: degraded}`, `{outcome: failed}`, `{outcome: lost}`, or `{outcome: refused, status}`, with `status` from 400 to 499. A reply may be invalid on purpose (the route `metered`, a fractional cost), so `route` is any string and `cost_micro_usd` any number or string |

Fixtures reach only drafts builds and tests: `virtual:room-fixtures` resolves only in a drafts build, a release build refuses it, and the release step refuses a bundle that holds one (FR-066; Amendments A5, B11). Every figure a fixture feeds reads "Sample" (FR-049).

## 12. `apps/web/room/lookdev.yaml`

```yaml
version: 1
vignette: { show: [<placement>] }
close_up: { frame: [<placement>] }
```

| Field | Rules |
|---|---|
| `vignette.show` | placement IDs, at least one: the only placements the vignette shows, at their world positions and at the production framing. The first holds FR-070's pieces: the desk, the monitor and its terminal, the neon sign's glow, the laptop's cable states, one sign, a corner of the chalkboard, and a bicycle wheel. The hidden placements still resolve the mounts |
| `close_up.frame` | placement IDs, at least one: the placements the desk close-up frames with `framing(aspect, boxes)`, the secondary view (FR-067) |

Read only in drafts builds (RI10), through `virtual:room-lookdev`. The page itself is [lookdev.md](lookdev.md)'s.

## 13. The rules

Nine families, two letters each, so a merge-request note that holds spec 003's A, M, B, R, L, N, P, F, H, and C rules and spec 002's C and N rules never confuses them. Each refusal names one rule (§14). The order of checking: RD on each file; then RT2 over every string; then the rest. A file that fails RD meets no other rule.

### 13.1 RD: shape

| ID | Refused | Spec |
|---|---|---|
| RD1 | A file that doesn't parse: not UTF-8, a byte-order mark, a YAML syntax error, more than one document, a duplicate key, an alias, anchor, merge key, or tag; in JSON, a duplicate key, `NaN`, or `Infinity` | FR-005 |
| RD2 | A key its schema doesn't define, at any level, a UI word key outside §9's two kinds included | FR-005 |
| RD3 | A required key missing, or a value outside its declared type or range | FR-005 |
| RD4 | `version`, or an outline's `schema`, other than 1 | FR-005 |
| RD5 | A file in §1's folders that isn't one of their kinds: another extension, a nested folder, or a stem that differs from the ID or name it holds; `apps/web/room/README.md` apart | FR-001 |

### 13.2 RI: identity and references

| ID | Refused | Spec |
|---|---|---|
| RI1 | An ID or a name outside its grammar (§3.1, §3.2) | FR-004 |
| RI2 | A duplicate ID within its namespace, or a duplicate name where §3.2 makes it unique | FR-004 |
| RI3 | A piece, placement, selectable, or topic that takes an ID `retired[]` lists for its kind | FR-004 |
| RI4 | A reference that doesn't resolve: a piece, placement, anchor, face role, glow, pose, topic, block, outline, look, colour, glow tone, typeface use, or UI key | FR-009 |
| RI5 | An ID of the four namespaces equal to a word of the closed vocabulary (§3.4) | FR-005, FR-007 |
| RI6 | More than 64 selectables; a selectable with a repeated member; a placement in two selectables | FR-004; B7 |
| RI7 | A `model` that isn't directly under `assets/room/`, whose stem isn't its piece's ID, or that `assets/room/records.json` doesn't record with the kind `room` and the SHA-256 the compositor computes from the file | FR-023 |
| RI8 | Not exactly one placement without a mount; not exactly one `twin` placement and one `visitor` placement; a figure's piece with a `model`; a hand-off whose `from` isn't an anchor of the `twin` placement or whose `to` isn't one of the `visitor` placement | FR-003, FR-008 |
| RI9 | A topic's `corpus` path outside the form `corpus/NN-<topic>.md` | FR-036 |
| RI10 | `lookdev.yaml` naming a placement the scene doesn't have (drafts builds) | FR-070 |
| RI11 | A `label.<name>` UI word that no placement, face binding, or switch references | FR-029 |

### 13.3 RG: geometry

**The supported stages** (FR-064) are code, the kernel's `stages.ts`, which a test pins to `room.css`'s stage rules, so a data edit can't weaken the checks: the two reference stages, the desktop at about 686 × 640 CSS pixels at a pixel ratio of 1 and the phone at about 368 × 420 at its pixel ratio, both re-measured in the first lookdev run; 304 × 248, the stage of a 320 × 568 screen in portrait; 326 × 208, of 568 × 320 in landscape; and a sweep of screens from 320 × 568 to 1920 × 1200 through the same formulas. In 2D, 44 pixels convert at the drawing's smallest scale, min(W ÷ 320, H ÷ 200). **A framed box** is a piece's expected bounds at its stylized scale, or a set model's measured bounds (FR-019), its top raised for a stand-in's label as spec 002's framing raises it.

| ID | Refused | Spec |
|---|---|---|
| RG1 | Mounts that don't form one tree rooted at the shell: a cycle, or a placement mounted on itself | FR-003 |
| RG2 | A catalog entry whose `origin.bounds` doesn't hold the origin; a live face, glow, or stand-in shape outside the bounds; a `facing` or `up` that isn't a unit vector within 1e-6, or an `up` not perpendicular to its `facing`; a face's `px` off its aspect by more than one pixel | FR-002, FR-017 |
| RG3 | A `stylized_scale` outside 1 to 4 | FR-051 |
| RG4 | The `twin` placement, or a selectable's member, without `frame: true` | FR-009; B8 |
| RG5 | At one of spec 002's six aspects (0.45, 0.6, 0.8, 1.15, 1.5, 2.4), a framed box's corner that projects outside the view or behind the camera | FR-009 |
| RG6 | At a supported stage, in 3D or 2D, a hit area under 44 × 44 CSS pixels, or a selectable whose exclusive core is under 44 × 44 or overlaps another's — except a side-wall selectable, its members all mounted on the room shell's `left-wall` or `right-wall` anchor, which is never refused for its core: at a stage where it can't keep its exclusive core it is list-only, the room draws no pick area for it there, and the report names it, at which stages, in 3D and in the 2D drawing. So a regroup of adjacent pieces needs a move too | FR-064, SC-009 |
| RG7 | On either reference stage, at the production framing, a face whose smallest glyph is under the legibility floor and isn't `atmosphere` — except the readable faces of a piece that carries a region whose `signal` is `turn-cost` (the neon sign's word and its counters), on the reference phone, which the floor exempts there, their words and figures also appearing as text in the text copy's "Around the room" section (FR-052, FR-063, [turn-cost.md](turn-cost.md) §8); the compositor reports such a face as exempt, naming it, the stage it falls below at, and the copy that carries it, instead of refusing; `atmosphere` on a face the catalog marks `readable`; an `atmosphere` face over its `max_chars`. The glyph is measured as cap height: the typeface's cap ratio (the minimum, over A to Z and 0 to 9, of a glyph's bounding-box top over the font's units per em, read with fontkit after the `fonts.lock` check), or an outline's `cap_height` over its fitted view box, at the size the region's grid gives, projected through the kernel's `project.ts` | FR-052, SC-010 |
| RG8 | Never refused, always reported: two poses of a switch that show different placements, where no part moves, and no cue such as a charge light grows, by at least the floor on screen. The text copy always carries the switch's state | FR-052 |
| RG9 | A region outside its face, or two regions of one face that overlap | FR-017 |

### 13.4 RS: switches and claims

| ID | Refused | Spec |
|---|---|---|
| RS1 | A switch on a signal other than `tier`; a case for a value the signal doesn't have; for a piece with `claims`, a tier value without a case, or a `default`; for a piece without claims, a value that neither a case nor a `default` covers | FR-005, FR-043 |
| RS2 | A switch whose pose names differ from its piece's `claims.poses`; a placement that places a switch's piece; two poses claiming one value | FR-020, FR-043 |
| RS3 | A case showing a pose that claims another value than its own; a pose claiming a value whose case shows another pose. So only `local` can show the plugged pose and only `cloud` the cloud pose | FR-043 |
| RS4 | `unknown`, `paused`, `not-live`, `resting`, `budget`, and `unavailable` not all showing one pose, the same, which claims nothing | FR-043; Q2 |
| RS5 | A pose that claims nothing or `cloud` mounted on the same placement and anchor as the pose that claims `local`; two poses with different claims that place the piece the same, with offsets within 1 mm and turns within 1°. So nothing but the local case puts the plug in the port | FR-020, FR-043 |
| RS6 | A cable whose `from` isn't an anchor of the switch's piece; a `sag` outside 0 to 0.5; a `radius` not above 0; a negative `drop` | FR-020, FR-051 |

### 13.5 RT: words

| ID | Refused | Spec |
|---|---|---|
| RT1 | A region with none, or more than one, of `text`, `resume_titles`, `ui`, and `signal`; `text` naming a block of another renderer, or, on a `sign` region, anything but an outline; `resume_titles` off a `chalk` region; `ui` or `signal` off a `neon` region | FR-005, FR-009 |
| RT2 | Spec 002's C9 over every string value in every file of §1, IDs and names included: a "Do not claim" key phrase of the corpus, the surname rule, or a private-denylist phrase where the session can read the denylist | FR-009, FR-035 |
| RT3 | Spec 002's C6: a digit outside a slot in a UI word; any digit in an `about_author` room-text line; any slot in a room-text line. A UI word's `{time}`, `{amount}`, and `{name}` are slots | FR-030, FR-035, FR-048 |
| RT4 | Spec 002's C1 to C5 on a line's or a UI word's `claims`, pending lines apart | FR-033, FR-035 |
| RT5 | An `about_author` line or UI word without `claims`, or failing spec 002's C8 | FR-035 |
| RT6 | A `terminal` or `desktop-session` line holding a local, absolute, or home path, `user@host`, an email or IP address, a URL other than the site's, an amount (a currency sign or word beside a number), or a secret-shaped token (a run of 32 or more letters, digits, `+`, `_`, or `-`, or a prefix the repository's gitleaks rules name, such as `AKIA`, `sk-lf-`, or `h4op_`; gitleaks itself still runs on every commit); or a block that would take its renderer more than 5 seconds to type | FR-031 |
| RT7 | A `chalk` line that holds an `exclude` phrase (whole words, in any case), cites a corpus sentence holding one, or shares a 24-character span with such a sentence; a `chalk` block without `exclude` | FR-033 |
| RT8 | Words that overflow their region's grid: more lines than its rows, a line wider than its columns, or, for `chalk` and `neon`, wider than the region at the grid's size by the typeface's advance widths; in strict mode, the resume source's section titles overflowing a `resume_titles` region | FR-031, FR-033, FR-052 |
| RT9 | In strict mode, a `words_from` quote that isn't verbatim in its file once whitespace is collapsed, or a file that isn't an intent | FR-031, FR-036 |
| RT10 | A look's typeface that `fonts.lock` doesn't vendor for `room` at that weight, or a vendored file whose SHA-256 differs from the lock | FR-033; B10 |
| RT11 | A `tier.*` UI word naming the twin | FR-035 |
| RT12 | A closed-list UI key missing, or a value whose slots differ from its key's | FR-005, FR-029 |
| RT13 | An outline breaking §8: another key; an `href`, a `data:` URI, a base64-like run, a file name, a path, or a file extension in any string; `paths` outside the grammar; a `cap_height` not above 0 or above the view box's height; in strict mode, `words` not inside the quotation marks of the intent `intent_ref` names | FR-032, FR-052 |

### 13.6 RV: vector drawings

| ID | Refused | Spec |
|---|---|---|
| RV1 | A piece with no `drawing`, so a placement or a switch's pose would have none in 2D | FR-009, FR-058 |
| RV2 | Path data outside §8's grammar; a non-finite number; a `polyline` or `polygon` outside 2 to 256 points | FR-005 |
| RV3 | A colour that's neither `#rrggbb`, nor `none`, nor a palette name of the scene's look; a negative `stroke_width` | FR-005 |

### 13.7 RX: the plain-model fit check

RX1 to RX10 are [plain-model-fit.md](plain-model-fit.md)'s, with their measures. The compositor runs them on each catalog `model` file against its entry at its stylized scale, and the lookdev page runs the same code on a candidate (FR-068). In brief: RX1, the container; RX2, the JSON; RX3, no camera, animation, skin, morph target, extras, or `uri`; RX4, the extensions; RX5, spec 003's mark, a file without it reported "not scrubbed"; RX6, the names, by index only; RX7, the bounds at both corners; RX8, the live-face quads; RX9, the textures; RX10, no emission and no occlusion. Spec: FR-015 to FR-019, FR-022, FR-068. A card's image is held to RX9's texture rules.

### 13.8 RK: budgets and caps

The caps are `main`'s `per_asset.room` (Amendment C7), or FR-053's starting figures while it's absent ([room-bundle.md](room-bundle.md) §2).

| ID | Refused | Spec |
|---|---|---|
| RK1 | A catalog `budget` above the caps: `gzip_bytes` over `gzip_bytes`, `triangles` over `triangles`, `texture_px` over `small_prop_texture_px` for a piece `small_props` lists, or `texture_bytes` over `scene_texture_bytes`. Agents never raise a cap | FR-053 |
| RK2 | A model over its piece's budget: the length of its `.glb.gz` (pako, level 9) over `gzip_bytes`, its triangles over `triangles`, a texture side over `texture_px`, or its texture memory over `texture_bytes` | FR-053, FR-079 |
| RK3 | The scene's texture memory over `scene_texture_bytes`, adding once for each piece the scene places (its placements share its textures) its `budget.texture_bytes`, since a set model never exceeds its budget; the twin's and the largest visitor avatar's measured texture memory (0, with a note in the report, while their files don't exist); and every live-face canvas at the reference phone's pixel ratio, each at most min(`px`, its largest on-screen size × that ratio) (FR-054) | FR-053, SC-006 |
| RK4 | A `caps.json` that doesn't parse, or whose `per_asset.room` misses a key, holds an unknown key, a value of the wrong type or out of its range, or a `small_props` entry outside the ID grammar | FR-053; C7 |

### 13.9 RL: the live configuration

As [tier-signal.md](tier-signal.md) §1 gives them. RL2 to RL4 read `docs/data-flow-disclosure.md` from the tree being built, by its column headers and by the row IDs the plan records for Confirmation 17 (the first row written keeps its ID, so spec 001's planned V2 is `V7`).

| ID | Refused | Spec |
|---|---|---|
| RL1 | `poll_s` that isn't an integer from 30 to 120; `freshness_s` that isn't an integer of at least `poll_s` + 5 | FR-042, FR-044; A1 |
| RL2 | `source: site` while the disclosure has no row `V7` whose From → To names `GET /api/status`, whose Trigger names the room and its cadence as `every <poll_s> s` or `every <poll_s> seconds`, and whose How to switch it off names "Pause the room" | FR-045, FR-074; A4 |
| RL3 | `asset_events: site` while the disclosure has no row `V6` whose From → To names `POST /api/events` | FR-071 |
| RL4 | `turn: site` while the disclosure has no row `V2` whose Carries names the turn's estimated cost and its route | FR-075; B6 |

## 14. Refusals

One line per finding:

```text
<rule> <file>:<path>: <reason>
```

```text
RI4 apps/web/room/scene.yaml:placements[3].mount.anchor: no anchor of that name on the parent's piece
RT2 apps/web/content/room/<block>.yaml:lines[2].text: forbidden phrase (from corpus/<NN>-<topic>.md:88)
RG7 apps/web/room/scene.yaml:placements[5].faces.<role>: cap height 7.4 px on the phone stage, under the floor of 9
RX8 assets/room/<piece>.glb:nodes[4]: live face off its plane: centre 3.2 mm and facing 1.6° from the catalog's
warn RK2 assets/room/<piece>.glb:-: 2,611,032 gzip-9 bytes, over the piece's budget of 2,500,000; the piece keeps its stand-in
```

- **`<rule>`:** the family and its number.
- **`<file>`:** the repository-relative path of the file the finding concerns: a data file, a model or card under `assets/room/`, or, in a test, the overlay's relative path. A live-configuration finding names `apps/web/room/scene.yaml`, and its reason names the missing row.
- **`<path>`:** the place in that file's own terms: keys and list indices (`placements[3].mount.anchor`); a map's entry by its key, where the key is an ID or a name (`faces.<role>.regions[0]`); a GLB's element by its array and index only, never its name (`nodes[4]`, FR-018); or `-` for the whole file. A measure across the scene names the element it measured (`selectables[2]`), and its reason names the stage.
- **`<reason>`:** the rule's fixed text, with keys, indices, expected types, measured numbers, stages, and IDs that RT2 has passed. Never a string value from the data: no text, name, quote, phrase, path, or file name it holds, and never a private-denylist phrase (FR-009). A C9 reason ends `(from <source>)`, where `<source>` is `corpus/<file>:<line>`, `the surname rule`, or `the private denylist`. An element whose ID failed RT2 is named by its path.
- **Order:** every finding is reported, sorted by file, then path (indices compared as numbers), then rule.
- **Where they print:** `npm run room:check -w apps/web` prints each line, then `room: <n> findings in <m> files`, and exits 1 on any. The Vite plugin prints the same lines through `this.warn`, prefixed `warn`, for a finding lenient mode tolerates, and through `this.error` for any other ([room-bundle.md](room-bundle.md) §12).

## 15. Strict and lenient (FR-013)

| Mode | Where | A finding |
|---|---|---|
| `strict` | `make test` (`apps/web/test/room/compose.test.ts` composes the committed tree), so `make check` and the gate's container phase too; `npm run room:check -w apps/web` | every finding fails |
| `lenient` | `vite build`: the web image's build in `make up`, the gate's image build, and a checkout's `npm run build -w apps/web` | RX and RK2, the findings about one piece's model file: the line prints with `warn`, that piece keeps its stand-in, and the manifest lists it in `standins[]` with the reason `findings`, so `placeholders` is true. Every other finding fails every build |

Only strict mode runs RT9, RT13's intent lookup, RT8's section-title fit, and the freshness of the generated files ([room-bundle.md](room-bundle.md) §13): the image's build stage has no `specs/`, `intent/`, `config/`, or `docs/studio/`. So `make up` always works with a misfit or over-budget model (FR-013), and `make test` refuses the same finding before a merge (SC-002). Data errors are like code errors: they fail both modes.

## 16. The source scan (FR-007)

`apps/web/build/room/scan.ts`, run by `make test` (`apps/web/test/room/scan.test.ts`) and by `npm run room:scan -w apps/web`.

- **What it looks for:** every ID of the four namespaces the committed data defines, read through the compositor.
- **Where:** `apps/web/{src,build,lookdev,test}/**`, `apps/web/*.ts` (the Vite and vitest configurations), `apps/web/index.html`, and `services/gateway/{src,test}/**`. TypeScript and JavaScript are read with the TypeScript parser, and HTML and CSS as below. Data, generated files, and Markdown aren't code and aren't scanned.
- **What it reads:** string literals; no-substitution template literals and the text parts of templates; regular-expression literals; property names in object literals, interfaces, and type literals; string literal types; enum members; in HTML, attribute values and text; in CSS, selectors, custom property names, and string values. It skips comments, and it doesn't read identifiers.
- **A hit:** a text in which `(?<![a-z0-9])<id>(?![a-z0-9])` matches, case-sensitively, so a per-ID class such as `flat-hit--<id>` is caught.
- **Output:** `FR-007 <file>:<line>: holds "<id>", which only the room's data defines`, one line per hit, sorted; exit 1 on any. An ID prints only once RT2 has passed it.
- **The fix is in the code:** take the value from the bundle, or from `compose()` in a test. There is no allowlist, since an allowlist would hold the ID itself. A false positive is fixed by choosing a more distinctive ID, a data edit, and RI5 keeps the vocabulary out of the namespaces.
- **Proof** (SC-001, User Story 1's scenario 4): the committed tree gives 0 hits; a literal planted in a temporary copy of a source file gives one. The test takes the planted ID from `compose()` at run time, so its own source holds none.

## 17. Readings this contract makes

- **RS4 holds FR-043's shared pose as a rule.** FR-043 says the six values "SHALL share one pose", while the spec's Assumptions keep a case for each value "so splitting a pose later is a data edit". The shape allows the split; RS4 refuses it until FR-043 changes.
- **RS5 ties the plugged claim to its place.** A pose's claim is a name; RS5 refuses any other pose that sits where the plugged pose sits, so no pose can look plugged in under another name.
- **The timeout and the backoff cap are code,** as [tier-signal.md](tier-signal.md) §1 has it: FR-041's row 3 and FR-044 state them as figures, and only the poll interval and the freshness window are configuration (FR-042, FR-044).
- **The vignette shows whole placements.** FR-070's "a corner of the chalkboard" and "a bicycle wheel" are what the view shows of those placements: clipping a piece isn't a behaviour kind.
- **The survey names the desk's corner** in data, so the photo guide's layout checklist holds no anchor name in code (FR-026).
- **Retiring a removed ID is the change's own step.** RI3 needs no history; adding a removed selectable's ID to `retired[]` is made by the data-only proof's removal case and read in review.
