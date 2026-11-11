# Contract: the twin's data, its bundle, its line, its outline, and its rules

The interface between the room's data files, the compositor (`apps/web/build/room/`), the bundle it writes, and the runtime, for the twin's own avatar. Spec: FR-008 to FR-017, FR-029, FR-030, FR-034 to FR-048, FR-053 to FR-056. Plan: [plan.md](../plan.md) R-01 to R-06, R-11 to R-15. It extends spec 004's [room-data-files.md](../../004-room-composition/contracts/room-data-files.md) and [room-bundle.md](../../004-room-composition/contracts/room-bundle.md) and spec 009's figures block, by the amendments the spec names (M13, M16, M18 to M21). Placeholders in angle brackets; no content about the Author in an example.

## 1. The scene's `figures.twin` block (`apps/web/room/scene.yaml`)

```yaml
figures:
  twin_stand_in: man
  texture_px: 1024
  wait_ms: 1500
  twin:
    clips: { arriving: greeting, answering: talking, listening: listening, resting: desk-lean, present: idle }
    rest_after_s: 20
    speak_wpm: 150
    speak_s: [3, 20]
    lean: { against: work-desk, behind_m: 0.679, right_m: 0.45 }
    texture_px: 1024
    still: { rect: [<x>, <y>, <w>, <h>] }
```

| Field | Type | Default | Rules |
|---|---|---|---|
| `clips` | map of state to clip role | as above | keys from the closed list `arriving`, `answering`, `listening`, `resting`, `present`; values from `TWIN_CLIP_ROLES`, `idle`, `talking`, `listening`, `greeting`, `desk-lean`; a missing key takes its default; RI8 refuses another key or value |
| `rest_after_s` | integer, 5 to 600 | 20 | FR-021 (d) |
| `speak_wpm` | integer, 60 to 400 | 150 | FR-021 (b) |
| `speak_s` | `[min, max]`, numbers, 0.5 ≤ min ≤ max ≤ 60 | `[3, 20]` | FR-021 (b) |
| `lean` | `{against, behind_m, right_m}` or absent | as above | `against`, a placement ID whose piece is `work-desk` (RI8); `behind_m`, 0.1 to 2; `right_m`, 0 to 2; absent: no lean, `resting` plays its map's role only if that isn't `desk-lean` |
| `texture_px` | power of two, 256 to 4,096 | the block's `texture_px` | FR-045; RK3 counts at it |
| `still.rect` | `[x, y, w, h]`, metres in the twin figure's frame, `(x, y)` its lower-left corner, y up from the floor, `w` and `h` above 0 | the box's width, its top at the box's top: `[box min x, box top − (box width) × 4/3, box width, (box width) × 4/3]`, the still's 3:4 | FR-034; clipped to the figure's box |

Every key is optional; the block itself is optional, and without it the defaults hold. A change is a data edit (FR-054).

## 2. The catalog's live face with a model surface (`apps/web/room/catalog/twin-figure.yaml`)

`live_faces[]` gains `surface`, `quad` (spec 004's, the default) or `model`:

```yaml
size: { w: <m>, h: 1.82, d: <m> }
origin:
  point: on the floor, between the figure's feet.
  bounds: { min: [<x>, 0, <z>], max: [<x>, 1.82, <z>] }
live_faces:
  - { role: twin-shirt-lettering, at: [0, 1.285, <z>], size: [0.18, 0.07], facing: [0, 0, 1], up: [0, 1, 0], px: [512, 199], readable: false, surface: model }
```

- **`surface: model`**: the face is its avatar's own mesh named `role` (as three's loader sanitizes names), drawn into that mesh's material: a canvas texture as its map, an alpha cut-off of 0.5, opaque, excluded from the look's ink lines. No quad is built. Its `at`, `size`, `facing`, and `up` describe the face at rest, for RG2, RG7, and RK3, which measure it as they measure a quad. Allowed on a figure's piece (RI8, amended M18); on any other piece, RI8 refuses it.
- The bounds and the height are the twin model's measured rest pose, z extended back by the lean's 0.1 m hip shift (plan.md R-06); the face lies inside them (RG2).
- `px` keeps the face's aspect, 0.18 : 0.07, within one pixel.

## 3. The shirt's binding (`scene.yaml`, the `twin-figure` placement)

```yaml
- id: twin-figure
  piece: twin-figure
  role: twin
  mount: { on: room-shell, anchor: floor, offset: [0.78, 0, 0.469] }
  frame: true
  faces:
    twin-shirt-lettering:
      label: label.twin-shirt
      atmosphere: true
      max_chars: 25
      regions:
        - { rect: [0, 0, 1, 1], renderer: print, text: twin-shirt-lettering }
```

- **`print`** joins the renderers' closed list: an outline's paths fitted to the region keeping their aspect and centred by its advance (`fitOutline`), filled `#000000`, on a canvas cleared to transparent, with no background; a draft's badge drawn in the same ink. `text` names an outline (RT1, as `sign`).
- **`label.twin-shirt`**: "The twin's shirt", a UI word the data references (RI11).
- The face is an atmosphere face (RG7); its words reach "Around the room" under its label, marked as a draft where the face is.

## 4. The bundle

**The index** (entry chunk), a new optional field:

```ts
twin: {
  /** The twin's line, from main's approval of the model's current SHA-256 (§5). */
  line: string;
  /** The 2D still, or null where it isn't bundled. */
  still: { url: string; sha256: string; bytes: number; rect: [number, number, number, number] } | null;
} | null;
```

`copy` (the text copy's order) gains `{ twin_line: true }` in the place of `{ line: "twin.stand_in" }`, which the runtime resolves to the twin's line while the twin's own picture shows and to the stand-in line otherwise (FR-014).

**The 3D part**, a new optional field, null where the twin isn't bundled:

```ts
twin: {
  model: { url: string; sha256: string; bytes: number; texture_bytes: number };
  clips: Partial<Record<"idle" | "talking" | "listening" | "greeting" | "desk-lean", { url: string; sha256: string; bytes: number }>>;
  block: {
    clips: Record<"arriving" | "answering" | "listening" | "resting" | "present", TwinClipRole>;
    rest_after_s: number;
    speak_wpm: number;
    speak_s: [number, number];
    lean: { against: string; behind_m: number; right_m: number } | null;
    texture_px: number;
  };
} | null;
```

`figures.twin_height` becomes the catalog's new height, 1.82 m by measure, which the stand-in scales to (FR-011). `lean` is null where RA7 left it out.

**Served names** (FR-048): `a/twin.<hash16>.glb` and `a/twin-<role>.<hash16>.glb`, gzip-9 copies of the plain files; `a/twin-still.<hash16>.png`, the plain file; `<hash16>` the plain file's SHA-256's first 16 hexadecimal digits. The asset events' `asset` is the name's stem before the hash (`twin`, `twin-<role>`, `twin-still`).

## 5. The twin's line

Read by `build/room/policy.ts` as the likeness approvals, from the first that holds a readable file:

1. `ROOM_POLICY_DIR/approvals.json`;
2. `refs/heads/main:assets/policy/approvals.json`, by `git cat-file blob` with `GIT_NO_REPLACE_OBJECTS=1`, never a bare `main`;
3. the tree's own `assets/policy/approvals.json`, which rule A9 holds to `main`'s at the branch's base.

The line is the `disclosure_line` of the entry whose `sha256` equals the twin model's current SHA-256, where it is a non-empty string. With none, the twin's files aren't bundled (RA6). The index carries the line; no source file or room data file holds it. The policy's digest (the image's label, `room-data.json`'s `built_from`) covers `content-approvals.json`, `resume-header.json`, `caps.json`, then `approvals.json`.

## 6. The outline and its sources

- **Sources** (D3): `apps/web/content/lettering/twin-shirt-lettering.svg` and `twin-shirt-lettering.json`, the studio's files byte for byte (SHA-256 `8344c745…` and `50be0e72…` in the hand-back's `SHA256SUMS`), read by no build and by no content check; `.prettierignore` names the folder.
- **The outline**: `apps/web/content/room/outlines/twin-shirt-lettering.outline.json`, spec 004 §8's object, written by `build/room/lettering.ts` (plan.md R-13), approved by its SHA-256 with the kind `room-text`.
- **The conversion's rules**: one `svg` root with `viewBox="0 0 180 70"`; only `path` children, each with `d`, `fill="#000000"`, and `fill-rule="nonzero"`, and no other attribute or element; `words` the JSON's `words`; `cap_height` the largest of the JSON's `cap_height_mm`; `view_box` `[0, 0, 180, 70]`; `advance` 180; `paths` each `d`, in document order, unchanged. Anything else is refused with the element's index, never its content.

## 7. The compositor's rules

Reasons name keys and figures, never a value from the data, as spec 004's rules do.

| ID | Refused | Lenient build | Strict build | Spec |
|---|---|---|---|---|
| RA1, extended | A twin's file not recorded in `assets/twin/records.json`, recorded with another kind, or with another SHA-256 | warns; the file left out | refuses | FR-009 |
| RA2, extended | A twin's GLB the reader can't read; a clip with no animation, or moving a node the model doesn't name | warns; the file left out | refuses | FR-009 |
| RA4, extended | A twin's file over `main`'s `per_asset` cap for its kind (`avatar`, `animation`, `still`) | warns; the file left out | refuses | FR-009 |
| RA5, extended | A file under `assets/twin/` that is none of the twin's files, but `records.json` and `LICENSE.md` | reports | reports | FR-009 |
| RA6 | The twin's model bundled without an approval in the likeness approvals naming its current SHA-256 with a non-empty `disclosure_line` | warns; the twin's files all left out | refuses | FR-015 |
| RA7 | A `lean` block whose desk's origin isn't within 1 cm of `behind_m` straight behind the twin placement's root, or whose facing differs by more than 1°, or with under `right_m` of the desk's top to the twin's right | warns; the lean left out | refuses | FR-029 |
| RI8, extended | In `figures.twin`, a state or a clip role outside its closed list; `lean.against` not a placement of the `work-desk` piece; a `surface: model` face on a piece that isn't a figure's | refuses | refuses | FR-054 |
| RK3, changed | The scene's texture memory over `scene_texture_bytes`, the twin counted as the larger of its model at `figures.twin.texture_px` and the stand-in's files at `texture_px` | refuses | refuses | FR-046 |
| RK5, changed | The first visit over `main`'s phase-3 budget: the room's served files, the twin's served GLBs, and the largest of the visitor folders, by their gzip-9 copies | warns | refuses | FR-046 |

## 8. The report

Beside spec 009's avatar lines (FR-056):

- **The twin**: each file's bytes, gzip-9 bytes, triangles, and texture memory at its own size and at `figures.twin.texture_px`; the model's measured height and bounds; its clips by role with their lengths; each file bundled or why not.
- **The line**: the approval's ID it comes from and which source of §5 held it; or why there is none.
- **The lean**: the twin's root against the spot, in centimetres and degrees, and the desk to its right, in metres.
- **RK3** with the twin's term and the stand-in's; **RK5** with the twin's files and the largest visitor folder; the first visit beside the arrival check's F3 view.
