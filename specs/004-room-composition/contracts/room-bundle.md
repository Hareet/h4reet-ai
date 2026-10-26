# Contract: the room bundle, its generated files, and its report

What the compositor writes from the room's data, where each output goes, and how each is proven. Spec: FR-009 to FR-014, FR-026, FR-029, FR-030, FR-033, FR-034, FR-038, FR-052 to FR-054, FR-056, FR-058, FR-061, FR-063, FR-066, FR-071, FR-073, FR-079; SC-001, SC-002, SC-006, SC-010. Amendments B7, B9, B11, B14, C6, C7, C11. Plan: [plan.md](../plan.md). Research: [research.md](../research.md). Data: [data-model.md](../data-model.md) §10, whose formats this contract gives in full. The files the compositor reads, their rules, and the refusal format are [room-data-files.md](room-data-files.md); the model fit check is [plain-model-fit.md](plain-model-fit.md); serving the models is [serving.md](serving.md).

Files on other branches are named in code spans with their branch. Examples hold placeholders in angle brackets only.

## 1. The compositor

**Where.**
- `apps/web/build/room/`, Node only: the compositor, the policy reader, the generators, the report, the source scan, the Vite plugin, and the command line.
- It uses the shared kernel in `apps/web/src/room/compose/`, pure TypeScript with no three.js and no DOM, so the build's checks and the room's drawing compute the same numbers: `math` (mat4), `mount` (the world resolver), `framing(aspect, boxes)`, `project`, `stages`, `layout` (the fixed text grids), `pick`, `cable`, `legibility`, `load-order`, `vocabulary`, and the bundle's types.
- It uses the GLB reader and fit check in `apps/web/src/room/glb/` ([plain-model-fit.md](plain-model-fit.md)), which the lookdev page shares (FR-068).

**The interface.**

```ts
export function compose(tree: Tree, policy: RoomPolicy, options: ComposeOptions): ComposeResult;

interface Tree {
  read(path: string): Uint8Array | null;        // repository-relative, "/"-separated; null when absent or unreadable
  list(dir: string): readonly string[];         // the entries' names, sorted bytewise; [] when absent
  readonly log: readonly string[];              // every path read or listed, in order
}

interface ComposeOptions {
  mode: "strict" | "lenient";                   // room-data-files.md §15
  drafts: boolean;                              // a drafts build: draft room text, fixtures, and lookdev
}

interface RoomPolicy {
  caps: RoomCaps | null;                        // §2; null while main has no room block
  caps_source: "policy-dir" | "main" | "export" | "defaults";
  caps_sha256: string | null;                   // of assets/policy/caps.json as read
  phase3_bytes: number;                         // first_visit_bytes.phase3; 25,000,000 when absent
  approvals: readonly { sha256: string; kind: string }[];   // main's content-approvals.json (spec 002), as read
}

interface RoomCaps {                            // per_asset.room (Amendment C7)
  gzip_bytes: number;
  triangles: number;
  small_props: readonly string[];               // piece IDs, which are also the files' stems
  small_prop_texture_px: number;
  scene_texture_bytes: number;
  legibility_floor_css_px: number;
}

interface ComposeResult {
  digest: string;                               // §4
  index: RoomIndex;                             // §3.1
  scene: RoomScene;                             // §3.2
  drafts: { fixtures: Fixture[]; lookdev: RoomLookdev } | null;   // §3.3; null unless options.drafts
  models: readonly { piece: string; url: string; gz: Uint8Array; sha256: string }[];   // §3.4
  roomText: RoomText;                           // §5
  manifest: RoomManifest;                       // §6
  generated: readonly { path: string; text: string }[];   // §7 to §9, sorted by path
  report: RoomReport;                           // §10
  findings: readonly Finding[];                 // room-data-files.md §14, sorted
}

interface Finding { rule: string; file: string; path: string; reason: string; lenient: boolean }
```

**Rules.**
- **Pure.** It reads only through `tree` and `policy`: no clock, environment variable, network, or process state. The policy reader (§2) and the Vite plugin (§12) do the I/O.
- **Every problem is a finding.** It never throws on data, only on a programming error. With a finding that lenient mode doesn't tolerate (`lenient: false`), the outputs aren't to be used: the plugin fails the build, and the tests fail.
- **Lenient findings** are RX and RK2, the findings about one piece's model file. In lenient mode that piece keeps its stand-in (room-data-files.md §15); every other finding fails every build.
- **The tree.** `apps/web/build/room/source.ts` has two: the file system rooted at the repository's root, and an overlay (a base tree with paths replaced or removed) for tests. FR-006's data-only test applies each change of the proof set to an overlay and holds `log` to the paths [room-data-files.md](room-data-files.md) §1 lists, so it proves that no source file was read or changed (SC-001).

## 2. The policy: where the caps come from, and absent caps

**The block.** `assets/policy/caps.json` (spec 003's, human-only) gains `per_asset.room` in the Author's own commit on `main` (P-6; Amendment C7; [intake-amendments.md](intake-amendments.md)):

| Key | Starting value | Meaning |
|---|---|---|
| `gzip_bytes` | 2500000 | per piece: the length of its served `.glb.gz`, gzip level 9 (FR-053, FR-079) |
| `triangles` | 40000 | per piece |
| `small_props` | the pieces the Author names | piece IDs, which are also the files' stems: the pieces `small_prop_texture_px` caps |
| `small_prop_texture_px` | 1024 | the largest texture side on a small prop |
| `scene_texture_bytes` | 96000000 | the whole scene's texture memory on a phone (RK3) |
| `legibility_floor_css_px` | 9 | FR-052's floor, a cap height in CSS pixels |

An unknown key in the block refuses the file: spec 003's F2, as P-5 amends it, exits 2, and the compositor reports RK4. Of the rest of the file, the compositor reads only `first_visit_bytes.phase3`, the report's enforced limit.

**Where it's read from,** the first of these that exists:
1. **`ROOM_POLICY_DIR`** (`caps_source: "policy-dir"`): the policy directory spec 002's build reads. In the web image it is the named build context `policy`, which `deploy/scripts/web_image.py` fills from `main` on the host; the gate's content build mounts the same directory, which P-10 gives `caps.json`.
2. **`refs/heads/main`** (`caps_source: "main"`), by its full ref, with `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:assets/policy/caps.json`: a checkout's build and `make test`. Never a bare `main`, which a tag of that name would answer.
3. **The export's own copy** (`caps_source: "export"`), only where there is no `.git`: the gate's container, where `make test` runs. Spec 003's rule A9 refuses a branch that changes the file, so the copy equals `main`'s at the branch's base: it can lag `main`, never loosen it.

`assets/policy/caps.json` joins spec 002's policy files in each list that names them, in the same order, so the policy's digest, the image's label `org.h4reet.web.policy`, and `room-data.json`'s `built_from` agree: `POLICY_PATHS` in `apps/web/build/policy.ts`, `POLICY_FILES` in `apps/web/build/approvals.ts`, and `POLICY_FILES` in `deploy/scripts/web_image.py` (all on `feat/002-us6-events`).

**While `main` has no room block** (`caps_source: "defaults"`: no file, or no `per_asset.room`, as before P-6, or the gate's image build, which has no policy context):
- every catalog budget is checked against FR-053's starting figures above, with `small_props` empty;
- the legibility floor is 9;
- every model stays a stand-in, with the reason `no-caps` (§6);
- the report and the manifest say so.

`apps/web/test/room/policy.test.ts` pins those defaults to FR-053's figures, and covers each source and a malformed file (RK4, which fails every build). Agents never raise a cap (FR-053): the file is human-only under spec 003's guard, and RK1 refuses a catalog budget above it.

## 3. The bundle: its parts, and where each goes (FR-011)

| Part | Module or file | Where it lands | Read by |
|---|---|---|---|
| The index (§3.1) | `virtual:room-content`, its named export `room`, beside spec 002's `messages` and `manifest` | the entry chunk: at most 16 KB gzipped (16,384 bytes at gzip level 9), inside spec 002's 150 KB entry budget | the 2D room, the "In the room" list, the talk panel, the text copy, the signals, and the 3D room |
| The 3D part (§3.2) | `virtual:room-scene`, its default export | the lazy 3D chunk: only the scene module, `apps/web/src/room/scene.ts`, imports it | the 3D room and the lookdev page |
| Fixtures (§3.3) | `virtual:room-fixtures` | drafts builds only | the lookdev page, and a drafts build's sample states |
| The lookdev inputs (§3.3) | `virtual:room-lookdev` | drafts builds only | the lookdev page |
| The models (§3.4) | `dist/a/<stem>.<hash16>.glb.gz` | the site's own origin | the 3D room's loader |
| Room text (§5) | `room-data.json`'s `room_text` | a file, fetched once at Enter | every renderer, and the text copy |

So the 2D room and the text copy never wait for the 3D part to load (FR-011), the room's structure costs no request and has no failure mode, and the 3D recipes stay off the entry's budget. `apps/web/test/room/chunk.test.ts` checks the index's size and the entry's 150 KB; that the 3D part's marker sits only in the dynamic import graph; and that no zod, fontkit, pako, TypeScript, or GLB reader reaches a chunk the room's entry or its 3D chunk loads. The lookdev page's own chunk carries the GLB reader and pako (FR-068; [lookdev.md](lookdev.md)).

### 3.1 The index

```ts
interface RoomIndex {
  schema: 1;
  digest: string;                                       // §4
  build: { kind: "release" | "drafts"; placeholders: boolean };
  live: { source: "off" | "site"; turn: "off" | "site"; asset_events: "off" | "site";
          poll_ms: number; freshness_ms: number };      // tier-signal.md §1
  ui: Record<string, string>;                           // every UI word's text, by key, slots unfilled
  selectables: { id: string; name: string; members: string[];
                 action: { kind: "talk"; topic: string } | { kind: "resume" };
                 side_wall: boolean }[];   // scene order; no lead; side_wall: FR-064's carve-out
  topics: { id: string; phrase: string; ready: false }[];
  faces: { id: string;                                  // "<placement>.<role>"
           placement: string; role: string; readable: boolean; label: string;
           atmosphere: boolean; max_chars: number | null;
           px: [number, number];                        // the catalog's px
           screen_css: [number, number];                // its largest on-screen size at the reference stages
           regions: { rect: [number, number, number, number]; renderer: Renderer;
                      grid: { cols: number; rows: number } | { rows: number } | { chars: number } | null;
                      source: { room_text: string } | { resume_titles: true } | { ui: string[] }
                            | { signal: "turn-cost"; part: "call" | "visit" } }[] }[];
  switches: { id: string; signal: "tier"; label: string; cases: Record<TierValue, string> }[];   // value to pose
  flat: {
    view_box: [0, 0, 320, 200];
    items: { placement: string; matrix: Matrix2D; primitives: Prim[] }[];         // depth order, back to front
    poses: { switch: string; pose: string; matrix: Matrix2D; primitives: Prim[];
             cable: { from: [number, number]; control: [number, number]; to: [number, number] } | null }[];
    faces: { face: string; matrix: Matrix2D; size: [number, number] }[];
    hits: { selectable: string; rects: [number, number, number, number][]; depths: number[] }[];
    labels: { placement: string; label: string; at: [number, number] }[];
    papers: [[number, number], [number, number], [number, number]];
    visitor: { x: number; baseline: number; scale: number };
  };
  copy: ({ face: string } | { switch: string } | { figures: true } | { line: string })[];   // the text copy's order
  typefaces: { use: TypefaceUse; family: string; weight: number; cap_ratio: number; fallback: string }[];
}
// Matrix2D: [a, b, c, d, e, f], SVG's matrix(). Prim: room-data-files.md §4.2's primitives in view-box
// units, colours resolved to #rrggbb or none.
```

- **`build.kind`** lets the renderers mark a drafts build's figures "test" (FR-049) and its draft text "Draft" (FR-030); `placeholders` is the manifest's (§6).
- **`ui`** holds the closed list's keys and the data's `label.<name>` keys; a `label` field anywhere in the index is one of those keys.
- **`selectables[].side_wall`** is true when every member is mounted directly on the shell's `left-wall` or `right-wall` anchor, as the compositor reads the scene's mounts, never an ID (FR-064's carve-out; [room-data-files.md](room-data-files.md) §13.3). At a stage the 3D room or the 2D room has, the kernel's `pick.ts` finds which such selectables can't keep their exclusive core; the room draws no pick area or 2D cue for those, a pick on their members selects nothing, and the "In the room" list reaches them. RG6 lets that happen only at FR-064's smallest stages, as room-data-files.md §13.3 defines them, so the set is empty at every checked stage other than FR-064's smallest stages.
- **`faces[].screen_css`** is the face's largest on-screen size at the reference stages, so a canvas is at most min(`px`, `screen_css` × the device's pixel ratio), scaled down by the quality level (FR-054).
- **`flat`** is the composed 2D room (FR-058): each placement's drawing projected through `framing(1.6)` into the 320 × 200 view box, scaled by the pixels per metre at its depth, and drawn back to front; each pose's drawing with its cable as a quadratic curve, shown by toggling `visibility`; each face's frame, where the renderers' SVG backend draws; each selectable's hit rectangles with their depths; the stand-ins' labels; the hand-off's three paper positions; and the visitor's cut-out. Numbers and resolved colours only, from an allowlist, so the 2D room sets attributes, never `style`, and the CSP needs no change.
- **`copy`** lists the text copy's entries in order, by reference: the bound faces in placement order, the switches, the sign's figures, and the fixed lines (the illustration's note, the affiliation line, and "Paused at" while paused). The words come at run time from the renderers' own word lists, so the 3D room, the 2D room, and the text copy can't differ (FR-034, FR-063).
- **`typefaces`** carries, for each typeface use, the look's family and weight and the family's cap ratio (room-data-files.md, RG7), so the page and the lookdev page compute the same glyph heights as the compositor; `fallback` is the generic family drawn after 2 seconds (FR-061).

### 3.2 The 3D part

```ts
interface RoomScene {
  schema: 1;
  digest: string;                                       // equal to the index's
  pieces: Record<string, {
    scale: number;                                      // the stylized scale
    anchors: Record<string, { at: Vec3; turn: Turn }>;
    standin: Shape[];
    faces: Record<string, { at: Vec3; size: [number, number]; facing: Vec3; up: Vec3 }>;
    glows: Record<string, { at: Vec3; radius: number; tone: string; motion: "flicker" | "breathe" | "steady"; level: number }>;
  }>;
  placements: { id: string; piece: string; mount: { on: string; anchor: string } | null;
    offset: Vec3; turn: Turn; framed: boolean; frame_box: Box; label: string | null;
    model: { url: string; sha256: string; bytes: number; bounds: Box; texture_bytes: number } | null }[];
  switches: { id: string; piece: string;
    poses: Record<string, { mount: { on: string; anchor: string; offset: Vec3; turn: Turn };
                            glows: { placement: string; glow: string; level: number }[] }>;
    cable: { from: string; to: { placement: string; anchor: string }; sag: number; radius: number;
             drop: number; rest: { placement: string; anchor: string } | null } | null }[];
  look: Look;                                           // room-data-files.md §10, without material_notes
  figures: { twin: string; visitor: string };           // placement IDs
  handoff: { from: { placement: string; anchor: string }; to: { placement: string; anchor: string } };
  load_order: string[];                                 // placement IDs with a set model
}
```

- **Placements stay as authored** (mount, anchor, offset, turn), so the room builds its object tree with the kernel's `mount.ts`, the function the compositor's checks use. A test holds three.js's world positions equal to the resolver's, to 1e-9.
- **`frame_box`** is the expected bounds at the stylized scale, or a set model's measured bounds (FR-019), grown for a stand-in's label. The room frames and picks from these boxes only, never from loaded geometry, so a model arriving or failing never moves the camera or a pick area.
- **`model`** is `null` while the placement shows its stand-in (§6's reasons). `url` is `a/<stem>.<hash16>.glb`, relative to the site's root (so from `/lookdev/` it resolves against `../`); `sha256` is the plain file's, for the browser's integrity check on the decoded body; `bytes` is the length of the served `.glb.gz` (C11); `texture_bytes` feeds the room's texture ledger.
- **`load_order`** is the kernel's `load-order.ts`: the framed members of selectables first, in scene order, with the shown pose first; then the other framed placements; then the rest (FR-056). A model shared by several placements is fetched once.
- **The digest check.** The 3D reader refuses a part whose `digest` differs from the index's, and the room falls to its 2D mode, as for a chunk that fails.

### 3.3 Drafts only: fixtures and the lookdev inputs

- **`virtual:room-fixtures`** exports the fixtures of room-data-files.md §11, typed by the signals.
- **`virtual:room-lookdev`** exports `lookdev.yaml`'s two lists (`vignette.show` and `close_up.frame`), every look in `apps/web/room/looks/`, and each piece's fit inputs (its expected bounds and live faces at the stylized scale, its budget, whether it's a small prop, and the caps the compose read), the values the compositor judges the repository's models against ([lookdev.md](lookdev.md), [plain-model-fit.md](plain-model-fit.md)).

In a release build, the plugin's `resolveId` throws `fixtures and lookdev are drafts-only (FR-066)` for either, so an import that reaches them fails the build rather than shipping them (FR-066; Amendments A5, B11).

### 3.4 The models

- **Which:** each catalog `model` a placement or pose shows, once its piece is set: present caps, and no RX or RK2 finding. A file several placements share is emitted once.
- **Name:** `dist/a/<stem>.<hash16>.glb.gz`, where `<stem>` is the file's stem, its piece's ID, and `<hash16>` the first 16 hexadecimal characters of the plain file's SHA-256, spec 003's scheme (`contracts/site-loading.md` §1 on the `feat/003-*` branches). The 3D part names `a/<stem>.<hash16>.glb`; [serving.md](serving.md) gives how the web image answers it with the `.gz` and `Content-Encoding: gzip` (FR-079, B14).
- **The `.gz`:** pako 2.1.0 at level 9, with the header `{time: 0, os: 255}` and no file name. Only the `.glb.gz` is emitted, never the plain `.glb`. An image card is emitted plain, at `dist/a/<stem>.<hash16>.<ext>`.
- **The measure:** the caps (RK1, RK2), the report (§10), the 3D part's `bytes`, and the asset events' `bytes` use the `.gz`'s length, the bytes a phone downloads (FR-079, SC-006, C11).
- **Parity with spec 003's measure:** `apps/web/test/fixtures/gzip-parity.json` holds a seeded generator's inputs and their expected lengths. `make test` checks them twice: through pako in vitest, and through Python's `gzip.compress(data, 9, mtime=0)` in `scripts/assets/test_gzip_parity.py`. So the length the site serves is the length spec 003's F2 and F3 count on the Author's machine. Node's own zlib isn't used: its lengths can differ from Python's.

## 4. The digest

`digest` is the lowercase hexadecimal SHA-256 of `serialize(index) + "\n" + serialize(scene)`, each serialized by §11's rules with its own `digest` field left out. The index and the 3D part both carry it, and the 3D reader refuses a 3D part with another (§3.2). The report prints its first 16 characters.

## 5. `room-data.json`'s `room_text` (Amendment B9)

`roomTextPart` (`apps/web/build/room/text.ts`) joins spec 002's `resumePart` and `narrationPart` in `roomDataFile` (`apps/web/build/approvals.ts` on `feat/002-us6-events`). So room text lands in the file the room fetches once at Enter, through spec 002's `roomDataLoader`, which the resume and narration share. If the fetch fails, the room retries once after 10 seconds; if that fails too, the faces stay plain and their text-copy entries are left out (FR-061).

```json
"room_text": {
  "blocks": [
    { "id": "<block>", "source": "apps/web/content/room/<block>.yaml", "sha256": "<64 hex>",
      "state": "approved", "lines": [{ "text": "<displayed value>" }] },
    { "id": "<sign>", "source": "apps/web/content/room/outlines/<sign>.outline.json", "sha256": "<64 hex>",
      "state": "approved", "lines": [{ "text": "<the outline's words>" }],
      "outline": { "view_box": [0, 0, 1000, 250], "cap_height": 180, "advance": 960, "paths": ["<SVG path data>"] } }
  ]
}
```

| Rule | Spec |
|---|---|
| A release build publishes only the room-text files `main` approves (`state: "approved"`); a drafts build adds the drafts, `state: "draft"`, which the renderers mark as drafts | FR-029, FR-030 |
| A block's `lines` are its non-pending lines' `text`, unchanged, since room text holds no slot. An outline's one line is its `words` | FR-030, FR-033 |
| An outline's entry carries `view_box`, `cap_height`, `advance` (the view box's width when absent), and `paths`; never `intent_ref`, `source`, or `tool` | FR-012, FR-032 |
| No † field and no pending line appears; blocks are sorted by `id`, and fields are written in the order above | FR-010, FR-012 |
| Spec 002's `published` and `drafts` list each room-text file as they list the resume's and narration's files | B9 |
| The resume's section titles aren't copied here: a `resume_titles` region reads `sections[].title` from the same file, so the titles are withheld whenever the resume is | FR-033; Confirmation 11 |

**The enforcement is human-only.** P-9's `tools/gates/content_check.py` holds each `lines[].text` to a displayed value of an approved file, as a whole string at any length, and finds no value of an unapproved room-text file anywhere else in `dist/` (FR-030, SC-008; [intake-amendments.md](intake-amendments.md)). `apps/web/build/approvals.ts` accepts the kind `room-text` before the Author's first such entry, so an approval on `main` never breaks `make up`.

## 6. `room-manifest.json` (Amendment B7)

Written to `dist/room-manifest.json`, and bundled into the entry as spec 002's `manifest` export, as today. Spec 002's manifest keeps `free_talk`, `items`, `avatars`, and `event_kinds`, and changes or gains:

| Field | Rules |
|---|---|
| `objects[]` | from the selectables, in scene order: `{id, action, topic, ready}`. `action` is `talk` or `resume`; `topic`, the topic's ID, or `null` for a resume action; `ready`, the topic's readiness, false until the twin's spec marks it ready (FR-037), and `null` for a resume action |
| `placeholders` | computed, no longer a constant: true while any placement shows a stand-in or any avatar is a placeholder |
| `standins[]` | `{placement, reason}` for each placement and pose that shows a stand-in, in scene order. `reason` is `no-model` (its piece has none), `no-caps` (§2), or `findings` (an RX or RK2 finding, in a lenient build) (FR-013) |
| `live_source` | `"off"` or `"site"`, the scene's `live.source` |
| `build_kind` | `"drafts"` or `"release"` |
| `caps` | `{source: "policy-dir", "main", "export", or "defaults", sha256: <hex> or null}`, as §2 read them |

Spec 001's release refuses `placeholders: true`, as spec 002's `contracts/web-serving.md` §5 has it, and a bundle that holds fixtures, the lookdev page, or draft text (FR-066; Amendments A5, B11).

## 7. `config/room-events.yaml` (Amendment B7)

Generated by `npm run room:generate -w apps/web` and committed, in spec 002's exact shape (its `contracts/room-events.md` §3, on `feat/002-us6-events`), which the gateway parses strictly:

```yaml
schema: 1
kinds: [<spec 002's eight event kinds>]
objects: [<each selectable's ID, in scene order>]
items: [<each resume item's ID>]
```

- **`objects`** are the selectables' IDs, 1 to 64 of them, in the ID grammar, so the file gains `chalkboard` (B3, B7). A retired selectable's ID leaves the list at the next build, and its dashboard series keeps its history (FR-004).
- **The gateway** reads the file once at start from its mounted `config/`, so a new selectable's events are accepted from the gateway's next start (User Story 1, scenario 2).
- **The gateway's test,** `services/gateway/test/unit/room-events-config.test.ts` (on `feat/002-us6-events`), asserts only that the committed file loads with 1 to 64 unique objects: a pinned list would turn a data edit into a source change (FR-006).

## 8. `config/room-topics.yaml` (FR-038)

Generated and committed, for the twin's spec:

```yaml
schema: 1
selectables:
  - id: "<selectable>"
    topic: "<topic>"
    corpus: ["corpus/<NN>-<topic>.md"]
    lead: null
```

- One entry for each selectable whose action is `talk`, in scene order, every value double-quoted; `lead` is the selectable's lead or `null`.
- It never holds a phrase, a live value, a live face's words, a cost, or a `words_from` quote (FR-038, FR-012).
- The twin's spec reads it (B5). A turn still carries only the selectable's ID, the visitor's path, and the turns (spec 002's `contracts/room-conversation.md` §2).

## 9. The studio documents (FR-014, FR-026)

| File | Made | From |
|---|---|---|
| `docs/studio/work-orders/<piece>.md` | generated, one for each catalog entry | the entry, the switches that place it, the chosen look, the caps, and the rule texts in `apps/web/src/room/glb/rules.ts`, which the fit check's refusals use too |
| `docs/studio/photo-guide.md` | generated | a fixed privacy template (code, naming no ID), with the photo-work setup and its checklist, and a layout checklist drawn from the scene's anchors |
| `docs/studio/handoff.md` | written by hand; no check generates it | the changes to the studio's contract that the Author makes by hand: the reviewed lettering outlines joining what may leave the photos folder, where this spec is stricter than the contract, the mark that follows the record (C1), the `design` source (C2), a step the studio's session scripted being a model step that names its row (C8), the room confirmations read per file (C4, C5), and, at once, the session's ComfyUI workflows handed to the Author as files, with no hook, MCP server, WebFetch rule, or sandbox network allowance in its settings that reaches a loopback host (FR-025; the spec's Confirmation 24) |

**Review.** The reviewer's Room data pass, which P-7 adds to `REVIEW.md`, reads the work orders, the catalog's studio notes, and the photo guide as it reads room text: they locate nothing and name no third party's marks, and what the studio's session acts on asks it for nothing FR-024 excludes: a photo or a crop of one, a file outside the studio's folders, a fetch, or an upload (FR-014). `REVIEW.md`'s "Do not report: Generated files" gains its exception for the work orders. None of them merges before P-7 is on `main` (FR-077).

**What they never hold:** a path outside the repository, a studio folder's path (folders are named by their role: the photos folder, the studio's inbox), a host or user name, a time, or the bundle's digest, so a change to one piece leaves the other pieces' orders unchanged.

### 9.1 A work order

`# Work order: <name>`, a line saying `npm run room:generate -w apps/web` generates it from `apps/web/room/catalog/<piece>.yaml` and it isn't to be edited, then these sections, in this order:

| Section | Holds | Spec |
|---|---|---|
| Method | `work_order.method` | FR-014 |
| Shots | `work_order.shots[]` | FR-014, FR-026 |
| Measurements | `work_order.measurements[]`, then one "Measure:" line for each field marked `estimated`: the size, an anchor, or a mount of a placement or pose of the piece | FR-002, FR-078 |
| Size, origin, and bounds | the measured size; the stylized scale, and the size the model is made at; `origin.point`; the expected bounds at that scale, and their tolerance at both corners, the larger of 2 cm and 3% | FR-015, FR-019, FR-051 |
| Anchors | each anchor's name, position, and turn, at the model's scale | FR-003 |
| Live faces | each face's object name (its role), centre, size, and facing, and the rule: one quad in one plain colour, its texture coordinates filling 0 to 1 in reading order as the GLB stores them (Blender's v runs bottom to top, and its exporter flips it), within 1 mm and 1° | FR-017 |
| States | for a piece a switch places: each pose, the value it claims, and where it sits; a state is a separate placement, never an animation | FR-020, FR-043 |
| Budget | the catalog budget beside the caps, and where the caps came from (§2) | FR-053 |
| Look | the chosen look's method and `material_notes`: flat base colours, and no baked light, shadow, ambient occlusion, glow, or outline geometry | FR-022, FR-070 |
| Export rules | `rules.ts`'s text for RX1 to RX10: no light, camera, animation, shape key, skin, extras, custom property, compression, or GPU instancing; the allowed and the refused extensions; the name rule; the texture formats; no readable text, and the Author's lettering never in a texture | FR-015, FR-016, FR-018, FR-022 |
| Record | a `records.json` entry template: kind `room`, the source types (`photo`, `prompt`, `asset`, `design`), `likeness` as Amendment C5 reads it, and steps by model or by hand, a step the studio's session scripted being a model step with its hosted service (C1, C8) | FR-023 |
| Studio notes | `work_order.studio_notes` | FR-014 |

The work orders state the rules where this spec is stricter than the studio's contract before the window is modeled (the spec's Assumptions). When ADR 0010 records the look, `room:generate` rewrites every order before the remaining pieces are modeled (FR-070; User Story 3, scenario 5).

### 9.2 The photo guide

`# Photo guide`, the generated-file line, then:
1. **Before the first shot,** the fixed template (FR-026): pause camera-roll backup and gallery sync until cleanup; turn location off; move the photos over a USB cable straight into the studio's photos folder; never send one through chat, email, a cloud drive, or an assistant; delete them from the phone and its trash once the studio's copy checks out.
2. **Where photo-derived files stay,** fixed text quoting FR-025: "Every file a photo touches SHALL stay inside the photos folder, which, with the blinding key, every Claude session on the machine is denied, the studio's own included: ComfyUI's input, output, temp, and user folders (its `--input-directory`, `--output-directory`, `--temp-directory`, and `--user-directory`), and any Blender file that loads or links a photo, with its temporary files and autosaves. The studio's own Blender files, temporary files, and autosaves SHALL sit in the workflows folder. Only what FR-024 lets the studio's agent receive from a photo, each after the Author has reviewed it (a style frame, a mesh stripped to geometry, or a sign's lettering outlines; FR-032), SHALL leave the photos folder, into the studio's inbox."
3. **Setting up photo work,** fixed text (FR-025's side files and listeners, FR-026), before each session that opens a photo or a file made from one:
   - **Blender's Temporary Files.** Start Blender for photo work with a Blender configuration of its own, kept inside the photos folder, whose Temporary Files folder is a folder inside the photos folder, so its autosaves, `quit.blend`, and recent-files list stay there. The studio's own Blender keeps its own configuration, with its temporary files in the workflows folder.
   - **TMPDIR.** Start every photo-work tool from a shell whose TMPDIR is that folder inside the photos folder, never the system temp folder, which this repository's sandboxed sessions can read.
   - **The tracing tool's autosave.** Off.
   - **The tracing tool's recent files.** Off, so no list of opened files sits outside the photos folder.
   - **ComfyUI.** Started with its four folders inside the photos folder, listening on 127.0.0.1 alone, its default; the Author queues its workflows, and no Claude session reaches its port (Confirmation 24).
4. **The photo-work checklist,** fixed text, one line for each step of item 3, ticked before each photo-work session: Blender's Temporary Files folder is inside the photos folder; TMPDIR is inside the photos folder; the tracing tool's autosave is off; the tracing tool's recent files are off; ComfyUI listens on 127.0.0.1 alone, and only the Author queues it.
5. **Tracing a sign's lettering,** fixed text (FR-032): with item 4's lines ticked, trace with a local tool that runs offline inside the photos folder; convert its paths to the outline file of room-data-files.md §8; run P-8's `outline_check.py` on it there; review the outlines; move only the outline file to the studio's inbox.
6. **The layout checklist,** generated from the scene (FR-026, FR-078): each placement mounted, directly or through others, on the desk, with its position from the scene's `survey.desk_corner`, in the scene's axes; then each placement mounted on the shell, with its anchor and offset: the desk itself, the bicycle's hook, the snowboard's mount, the window, the artwork, and the chalkboard, as the default scene places them. Each row reads "measured" or "estimated", from the data's `estimated` marks.

The template, the photo-work checklist among it, is code and names no ID; the layout checklist names each placement by its label's UI word, or by its ID where it has no label.

## 10. The report (FR-073)

`npm run room:report -w apps/web` prints it as Markdown. Every merge-request note of a branch that changes the room's data or models pastes it whole (FR-073). It isn't written into `dist/`.

```markdown
## Room report

Bundle <digest, first 16 hex> · release build · caps: main, assets/policy/caps.json <sha256, first 16 hex>

| Piece | Placements | Source | Bytes | gzip-9 bytes | Triangles | Texture memory | Budget (gzip-9 · triangles · texture) |
|---|---:|---|---:|---:|---:|---:|---|
| `<piece>` | 1 | studio, `<piece>.glb` | 3,114,880 | 2,204,113 | 31,870 | 22,369,621 | 2,500,000 · 40,000 · 24,000,000 |
| `<piece>` | 2 | stand-in (no-model) | – | – | – | – | 800,000 · 8,000 · 4,194,304 |

Per piece, the largest against the caps: 2,204,113 of 2,500,000 gzip-9 bytes; 31,870 of 40,000 triangles.
Scene texture memory: 34,183,519 of 96,000,000 bytes (models 28,194,304 · image cards 0 · avatars 4,146,228 · live-face canvases 1,842,987).
First visit, the room's share: 2,204,113 gzip-9 bytes of placed models and cards, beside the design's estimate of 12,000,000; the enforced limit is spec 003's phase-3 first visit, 25,000,000. Spec 003's F3 view, every file under assets/room/: 2,204,113.

| Face | Readable | Desktop | Phone | Floor | Margin | Status |
|---|---|---:|---:|---:|---:|---|
| `<placement>.<role>` | yes | 11.2 px | 9.4 px | 9 | 0.4 px | readable |
| `<placement>.<role>` | yes | 10.1 px | 7.2 px | 9 | −1.8 px | exempt on the phone, carried by the text copy's "Around the room" |

Side-wall selectables (FR-064): the room draws no pick area for them at the stages named, and the "In the room" list reaches them.

| Selectable | 3D | 2D |
|---|---|---|
| `<selectable>` (left-wall) | list-only at 304 × 208 and 3 others | list-only at 304 × 208 and 3 others |

| Switch | Poses | Desktop | Phone | Status |
|---|---|---:|---:|---|
| `<switch>` | `<pose-a>` / `<pose-b>` | 23.1 px | 12.0 px | apart |

Findings: none.
```

| Part | Content | Spec |
|---|---|---|
| Header | the bundle's digest; the build kind; the caps' source and SHA-256, or "FR-053's starting figures: main has no room caps; every model stays a stand-in" | FR-073 |
| Per piece | how many placements and poses show it; its source, the studio file's stem, or "stand-in" with its reason (§6); its model's plain bytes and the `.gz`'s bytes, triangles, and texture memory, beside its budget; its stylized scale where above 1 | FR-051, FR-073 |
| Totals | the largest per-piece figures against the caps; the scene's texture memory by class (models, image cards, avatars, live-face canvases at the reference phone's pixel ratio) against `scene_texture_bytes`, summed as RK3 sums it, with a note while the twin's or the avatars' files don't exist | FR-053, FR-054 |
| First visit | the room's share in gzip-9 bytes (the placed models' `.glb.gz` and the cards), beside the design's estimate of 12,000,000 and the enforced limit, `first_visit_bytes.phase3` (25,000,000); and spec 003's F3 view, every file under `assets/room/` (Amendment C6) | FR-053, SC-006 |
| Legibility | for each bound face and each reference stage: its smallest cap height in CSS pixels, to 0.1, the floor, and the margin; `readable`, `atmosphere (max <n>)`, `exempt on the phone, carried by the text copy's "Around the room"` (a readable face whose regions all have the `signal` `turn-cost`, under the floor on the reference phone and at or above it on the reference desktop: RG7's one exemption), or `under` | FR-052, SC-010 |
| Side-wall selectables | after the legibility table: each side-wall selectable that is list-only at one or more of FR-064's smallest stages ([room-data-files.md](room-data-files.md) §13.3), with its wall (`left-wall` or `right-wall`); the 3D stages where it is list-only, as the first by size and how many others, or `–`; and the same for the 2D drawing, by the stages whose scale it is drawn at; or the line "Side-wall selectables: none." A selectable is named by its ID only where RT2 passed it. Since RG6 refuses a side-wall selectable without its core at any other stage, no other stage appears here in a build whose outputs are used | FR-064, SC-009 |
| Switches | the case-to-pose table, and for every two poses that show different placements, the largest on-screen displacement, or the size of the cue the look adds, on each stage; `apart`, or flagged `under the floor` (RG8) | FR-052, SC-010 |
| Findings | every finding's line, or "none"; in the image build, the lenient ones marked `warn` | FR-009, FR-013 |

Bytes are integers with thousands separators, and glyph heights are to 0.1 px. Nothing in the report is a time, a path outside the repository, or a data string, so it is as deterministic as the bundle.

## 11. Determinism (FR-010)

Two builds of the same commit and policy write byte-identical outputs: the index, the 3D part, the drafts modules, `room_text`, the manifest, the models' `.gz` files, the generated files, and the report.

- **Order:** directory listings sorted bytewise; the data's own order kept wherever it means something (placements, selectables, regions, lines).
- **Built field by field:** every output object is written in its schema's order, never spread from the data. That also keeps every † field out by construction (§14).
- **Numbers quantized** before they're written: metres to 1e-6, CSS pixels and view-box units to 1e-4, and −0 written as 0, then in JavaScript's shortest round-trip form.
- **Nothing from the machine:** no time, time zone, environment variable, absolute path, host, or user in any output. The policy appears only as its source and SHA-256.
- **Compression and names:** gzip by pako alone (§3.4); model files named from their content's hash.

**The test**, `apps/web/test/room/determinism.test.ts`, composes twice, from two copies of the tree at different absolute paths and under different time zones, compares every output byte for byte (SC-002), then searches every output for either root's path.

## 12. The Vite plugin and the npm scripts

**`roomBundle()`**, in `apps/web/build/room/plugin.ts`, replaces spec 002's `roomContentModule` in `apps/web/vite.config.ts`, after `disclosurePage` and `roomDataFile({parts: [resumePart, narrationPart, roomTextPart]})`:

| Hook | Does |
|---|---|
| `buildStart` | reads the policy (§2), and composes once in lenient mode over the file-system tree, with `drafts` from spec 002's `draftsOn(process.env)` (`ROOM_DRAFTS=1`); prints each lenient finding through `this.warn`, and fails through `this.error` on any other |
| `resolveId`, `load` | `virtual:room-content` (spec 002's `messages` and `manifest`, and `room`); `virtual:room-scene`; and, in a drafts build, `virtual:room-fixtures` and `virtual:room-lookdev`. In a release build, resolving either of the last two throws (§3.3) |
| `generateBundle` | emits each set model's `a/<stem>.<hash16>.glb.gz`, and each card, under its fixed name, and `room-manifest.json`; `room_text` reaches `room-data.json` through `roomTextPart` |

In a drafts build, `vite.config.ts` also adds the lookdev page's input ([lookdev.md](lookdev.md)). The plugin never writes outside `dist/`: the committed generated files are `room:generate`'s alone.

**The npm scripts,** in `apps/web/package.json`:

| Script | Does | Exits 1 |
|---|---|---|
| `room:generate` | composes the committed tree and writes §7 to §9's generated files, removing a work order whose piece is gone; spec 002's `manifest` script becomes its alias | on a finding lenient mode doesn't tolerate, writing nothing |
| `room:check` | composes in strict mode, and checks the generated files' freshness (§13); prints every finding | on any finding or stale file |
| `room:report` | prints §10's report | never: findings are in the report |
| `room:scan` | the source scan (room-data-files.md §16) | on any hit |
| `room:fit -- <glb> --piece <id>` | runs the fit check on one GLB against one catalog entry, printing its RX and RK2 findings and its measures; reads the file in place and copies it nowhere | on any finding |

`make test` runs what these scripts check through vitest, so the gate's container, which never runs `make check`, enforces the same rules.

## 13. The freshness of the generated files

`apps/web/test/room/generated.test.ts`, run by `make test`, so by `make check` too (FR-013), and by `room:check`:

| File | Fails when |
|---|---|
| `config/room-events.yaml` | it differs from what the build would write; spec 002's `firstDifference` names the first differing line |
| `config/room-topics.yaml` | the same |
| `docs/studio/work-orders/<piece>.md` | one is stale; one is missing for a catalog entry; or one is orphaned, its piece gone |
| `docs/studio/photo-guide.md` | it is stale or missing, or lacks a fixed part of §9.2, the photo-work setup's steps and their checklist lines among them (FR-025, FR-026) |

They are regenerated whenever the catalog, the scene, or the look changes. The fix is `npm run room:generate -w apps/web`, committed with the data edit that caused it, so the proof set's changes stay data-only (FR-006, SC-001). The image build never runs these checks: `config/` and `docs/studio/` aren't in its context (FR-013). `docs/studio/handoff.md` is written by hand and isn't checked. `docs/` is outside `prettier --check`; the generator writes the two YAML files in a form Prettier accepts.

## 14. What the built site holds (FR-012)

`apps/web/test/room/dist.test.ts` makes one release build and one drafts build (a vitest global setup the smoke and chunk tests share) and checks:
- **Nothing private:** no † field's value (a `work_order` field, `origin.point`, `words_from`, `exclude`, `claims`, a `lead`, `retired[].reason`, `survey`, `material_notes`, or an outline's `intent_ref`, `source`, or `tool`) and no pending line appears in any file under `dist/`, read as spec 002's content check reads it, JSON and escapes undone. A string of at least 12 characters is matched anywhere as text; a shorter one only as a whole JSON string (FR-012). A lead appears only in `config/room-topics.yaml`.
- **No drafts in a release build:** no lookdev page, no fixture, no draft text, `drafts` empty, and the manifest's `build_kind` is `release`; the drafts build has the page, and its entry graph never reaches the lookdev sources (FR-066).
- **The parts in their chunks** (FR-011; §3).
- **The models served as measured:** every model is a `.glb.gz` whose content inflates to a file with its record's SHA-256, whose header's mtime is 0, and whose length equals the 3D part's `bytes`; no plain `.glb` is in `dist/` (FR-079, C11).

## 15. Tests

| Test (in `apps/web/test/room/` unless named) | Proves |
|---|---|
| `compose.test.ts`: one known-bad overlay for each rule, the known-good set, and the committed tree in strict mode | FR-009, SC-002's first half |
| `data-only.test.ts`: the proof set (a move, an addition, a removal, a regroup with its move, a retarget, a rewording, a new switch case) on overlays, the `Tree` log limited to data paths | FR-006, SC-001, User Story 1's scenarios 1 to 3 |
| `determinism.test.ts` | FR-010, SC-002's second half |
| `generated.test.ts` | FR-013, FR-014, FR-026, FR-038; Amendment B7 |
| `policy.test.ts`: the three sources, the defaults' figures, a malformed file | FR-053; Amendment C7 |
| `chunk.test.ts` | FR-011, the entry's budgets |
| `dist.test.ts` | FR-011, FR-012, FR-066, FR-079 |
| the gzip parity: `gzip.test.ts`, with `scripts/assets/test_gzip_parity.py` | FR-079, SC-006's encoding; C11 |
| `scan.test.ts` | FR-007, SC-001 |
| `services/gateway/test/unit/room-events-config.test.ts` | the gateway accepts the generated events file; B7 |
