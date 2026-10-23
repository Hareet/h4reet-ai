# Contract: the plain room model and its fit check

What a room GLB must be when the studio exports it, what spec 003's scrub changes in it, and the one fit check the compositor and the lookdev page both run on the scrubbed file. Spec: FR-015 to FR-023, FR-053, FR-068, FR-079; User Story 4, scenarios 1 to 3; SC-002, SC-006, SC-013. Amendments: C1, C4, C6, C7, C11. Plan: [plan.md](../plan.md). Research: [research.md](../research.md) (the GLB reader, the gzip measure, the caps). Data: [data-model.md](../data-model.md) (the catalog entry: its size, stylized scale, origin and expected bounds, live faces, and budget). The finding format and the other rule families (RD, RI, RG, RS, RT, RV, RL): [room-data-files.md](room-data-files.md).

The intent, in its reading of the pieces and its Constraints: "The studio's models carry no behaviour." "Room models are plain GLBs with embedded PNG, JPEG, or WebP. They carry no lights, compression, or extras." "I approve a model's hash only after viewing the scrubbed file."

## 1. From the studio to the room

| Step | Where, and by whom | What it settles |
|---|---|---|
| 1. Export | the studio, on the Author's machine, from the piece's work order (`docs/studio/work-orders/<piece>.md`, generated from the catalog entry and the chosen look, FR-014) | §2's export rules |
| 2. Scrub | spec 003's `scripts/assets/scrub.py` (on `feat/003-us1-arrival-check` and later), in the Author's terminal | §3: metadata out, neutral names, the mark in |
| 3. Fit check | the lookdev page, on the scrubbed file, in memory ([lookdev.md](lookdev.md)) | §5's rules and §8's budgets, with the look at the room's framing |
| 4. Approval | the Author, on `main`, of the hash the page showed, with the room confirmations as Amendment C4 reads them (FR-023, FR-068) | what no rule can see (§9) |
| 5. Arrival | spec 003's arrival check, human-only: the pre-commit hook, `make check`'s `arrival`, and the gate | its A, M, R, L, N, P, and F rules, as the Author's patch P-5 amends them (C1, C2, C4 to C7; [intake-amendments.md](intake-amendments.md)) |
| 6. Set | the catalog entry names the file; the compositor runs the fit check again, strictly in `make test` and leniently in the image build (FR-013, §10) | the piece shows its model, framed by its measured bounds (FR-019), with no other edit (User Story 4, scenario 1) |

**Who checks what.** The arrival check stays the human-only authority on what a studio file may hold; the fit check is agent code, stricter for room files, and adds the geometry the arrival check can't know without the catalog.

| Concern | Arrival check (spec 003, as P-5 amends it) | Fit check (this contract) |
|---|---|---|
| The container, the JSON schema, bytes no chunk accounts for | M4, M9 | RX1, RX2 |
| Cameras, animations, skins, morph targets | admitted (M4), for the twin | refused (RX3) |
| Extensions | M4's list | the list without three `KHR_materials_*` (RX4) |
| The mark | M5: present, and (C1) the value the record's steps call for | RX5: present, its form, and one of C1's three values |
| Names | M8 | RX6: the name rule, plus M8 |
| Bounds, origin, live faces | none | RX7, RX8 |
| Texture formats | the image containers (M1 to M3, M6) | bit depth, colour type, power-of-two sides, and the small props' limit (RX9) |
| Emission and ambient occlusion | none | RX10 |
| Per-file caps | F2 (C7: gzip-9 bytes, triangles, small-prop textures) | RK1, RK2 |
| The scene's texture memory | none | RK3 |
| The first visit | F3 (C6: every file under `assets/room/` at gzip-9), enforced | reported (§8.3) |
| Text in a texture, a photo's crop, baked light | P1's confirmations, and the reviewer's arriving-assets pass | none (§9) |

## 2. Before the scrub: the export rules (FR-015 to FR-022)

FR-015: "The studio's export rules apply before the scrub; the compositor checks the scrubbed file." Each work order prints these rules from `apps/web/src/room/glb/rules.ts`, the module whose texts the refusals quote, so the studio works to the rules the check applies. They agree with the studio's contract of 2026-10-22, and are stricter in the places the spec's Assumptions name: the three refused `KHR_materials_*` extensions, the name rule for objects and meshes with digits allowed, the 1 mm, 1°, and size tolerances, and the repository's caps on `main` as the authority. `docs/studio/handoff.md` lists them for the Author's own edit of the studio's contract.

1. **The file.** Binary glTF 2.0, one per piece, named for it: `<piece>.glb`, since a model file's stem is its piece's ID ([data-model.md](../data-model.md)). FR-020: "A STATE SHALL be a separate file or a separate placement, never an animation", so a state is a switch's pose, or a piece of its own with its own file. Textures embedded, as PNG, Huffman-coded RGB JPEG, or still WebP.
2. **Units and axes.** Metres; +Y up; the front facing +Z. In Blender: model the piece facing the front view (−Y) and export with "+Y Up", which turns Blender's −Y into glTF's +Z.
3. **Size and origin.** The catalog's size times its stylized scale (FR-051), with the origin at the dimension sheet's origin point, so the model's bounds fall on the catalog's expected bounds at that scale.
4. **Geometry and materials only.** No light, camera, animation, shape key, armature or skin, custom property (`extras`), mesh or texture compression (Draco, meshopt, KTX2), or GPU instancing. Extensions only from `KHR_materials_*` (never `KHR_materials_variants`, `KHR_materials_transmission`, or `KHR_materials_volume`), `KHR_texture_transform`, `KHR_mesh_quantization`, and `EXT_texture_webp`.
5. **Names.** Objects and meshes named in lowercase letters, digits, and single hyphens (`desk-top`, `leg-2`): no `.001` suffix, no file name, path, or camera's file stem.
6. **Live faces** (FR-017, FR-021). Each its own object, named for its role: one quad in one plain colour with no texture, sized from the dimension sheet, its texture coordinates filling 0 to 1 in reading order. Blender's UV editor puts the face's bottom-left at (0, 0); its exporter flips v, so the GLB stores (0, 0) at the top-left.
7. **Textures** (FR-022, FR-053). Painted, procedural, or made by an allowed model from a recorded prompt; never projected, traced, or cropped from a photo. sRGB, 8 bits a channel, power-of-two sides, no larger than the piece's budget: 1,024 pixels on the small props the caps name.
8. **Materials** (FR-022). Flat base colours. No emission, no ambient-occlusion map, and no light, shadow, glow, or outline baked into a texture or built as geometry: the look adds them at run time.
9. **No words** (FR-016). No word, digit, logo, trademark, key legend, label, regulatory print, tyre-wall text, sticker, screen content, or third-party art. The Author's own non-word sign graphics may stay in a texture; the Author's lettering may not (answer 4), since the room draws it live.

## 3. The scrub, and what it hides (C1)

What spec 003's scrubber does to a GLB (its docstring, and spec 003's research R-03):
- it keeps every vertex, index, accessor, node, mesh, and pixel byte for byte, and keeps node and mesh names;
- it drops `extras` everywhere but `mesh.extras.targetNames`, drops `asset.generator` and `asset.copyright`, and drops every extension outside the arrival check's list together with its objects; it refuses a file that requires such an extension, or that names an image or a buffer by `uri`;
- it renames every image, texture, sampler, and material to a neutral ID, `<kind>-<index>` (`image-0`, `material-2`);
- it strips each embedded image's metadata, and lays the `BIN` chunk out again;
- it adds the mark once (§6). Amendment C1 makes it take the mark's value from the record's steps (agent code on `feat/004-intake`).

So the fit check, which reads the scrubbed file, can't see what the scrub dropped: a light (`KHR_lights_punctual`) or an instancing extension leaves with its objects, and the scrubber names it only in its "dropped" lines. That is why §2 binds the export, and why the Author reads those lines before approving. What the scrub keeps and the fit check refuses: cameras, animations, skins, morph targets with their `targetNames`, and the three refused `KHR_materials_*`, all of which spec 003's M4 admits for the twin.

## 4. The reader

`apps/web/src/room/glb/` (`read.ts`, `json.ts`, `images.ts`, `names.ts`, `fit.ts`, `rules.ts`, `gzip.ts`): pure TypeScript over a `Uint8Array`, with no Node or DOM API and no three.js, so the compositor (`apps/web/build/room/`, in Node) and the lookdev page (in a browser) run the same code (FR-068, §11). It is a strict port of the arrival check's parser (`parse_glb`, `GltfCheck`, `strict_json`, and `name_problem` in `tools/gates/arrival_check.py`, carried by the Author's patch `docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.patch` on `feat/003-us1-arrival-check`), which stays the authority; the port never replaces it. It reads:
- the container: the 12-byte header, then the chunks, each 4-byte padded;
- the JSON, strictly: UTF-8, no duplicate key, no NaN or Infinity;
- accessors of every component type, normalized or not, with `byteStride`, sparse substitutions, and `KHR_mesh_quantization`'s integer positions and texture coordinates decoded;
- the default scene (`scene`, else the first) and every node reachable from it, each node's transform from its TRS or its `matrix`, composed from the root;
- primitives in modes 4, 5, and 6 (the other modes add no triangle);
- image headers: PNG's `IHDR`, JPEG's start-of-frame marker with its precision and component count, and WebP's `VP8`, `VP8L`, or `VP8X` with its animation flag.

The model's frame is glTF's scene space: metres, +Y up, the piece's origin at (0, 0, 0).

## 5. The rules

Each refusal names one rule's ID. The expected values come from the catalog entry at its stylized scale `s`: a catalog length or point times `s`, a direction unchanged.

| ID | Refused | Spec |
|---|---|---|
| **RX1** | The container. The file can't be read (in an image build without the `room-assets` context, every model is unreadable: [serving.md](serving.md) §3); it doesn't start with `glTF` and version 2; its declared length differs from the file's; a chunk isn't 4-byte padded within it; or its chunks aren't one JSON chunk followed by at most one `BIN` chunk | FR-015 |
| **RX2** | The JSON. It isn't UTF-8 or isn't an object; it holds a duplicate key, NaN, or Infinity; a property outside the glTF 2.0 schema (M4's walk, ported); `asset.version` other than `"2.0"`; an index that names no element; a node with two parents, or in a cycle; more than one buffer, or a buffer whose `byteLength` doesn't match the `BIN` chunk beyond its padding; an accessor outside its buffer view, or a buffer view outside the `BIN` chunk | FR-015 |
| **RX3** | Anything that moves or isn't geometry: a camera (`cameras`, `node.camera`), an animation, a skin (`skins`, `node.skin`), a morph target (`primitive.targets`, `mesh.weights`, `node.weights`), `extras` anywhere (`mesh.extras.targetNames` included), or a `uri` on an image or a buffer | FR-015, FR-020 |
| **RX4** | An extension. A name, in `extensionsUsed`, in `extensionsRequired`, or as an extension object, other than `KHR_xmp_json_ld` (where RX5 allows it), `KHR_texture_transform`, `KHR_mesh_quantization`, `EXT_texture_webp`, or a `KHR_materials_*`; any of `KHR_materials_variants`, `KHR_materials_transmission`, and `KHR_materials_volume`; an extension object that `extensionsUsed` doesn't name, or that sits where its specification doesn't put it; `extensionsRequired` naming one `extensionsUsed` doesn't. So a light (`KHR_lights_punctual`), compression (`KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu`), and GPU instancing (`EXT_mesh_gpu_instancing`) are refused | FR-015 |
| **RX5** | The mark, as §6 reads it: missing (the reason reads "not scrubbed"); in any other form; with a value outside C1's three; or `KHR_xmp_json_ld` anywhere but the root's packet and the asset's reference | FR-015, FR-068, C1 |
| **RX6** | A name. A node or mesh `name` that doesn't match `^[a-z0-9]+(-[a-z0-9]+)*$`; any `name` holding a path, a file name, or a camera's file stem (spec 003's M8, ported: a slash or a backslash; a dot followed by 1 to 5 letters, Blender's `.L` and `.R` side suffixes aside; `IMG_`, `PXL_`, `MVIMG_`, `DSC`, `DSCN`, `Screenshot`, WhatsApp's `IMG-YYYYMMDD-WA`, Samsung's `YYYYMMDD_HHMMSS`); a material, image, texture, or sampler `name`, where there is one, other than the scrubber's neutral ID, `<kind>-<its own index>` | FR-018 |
| **RX7** | The bounds. On any axis, either corner of the model's bounds (§7) lies off the catalog's expected corner, times `s`, by more than the larger of 0.02 m and 3% of the expected extent on that axis, times `s` | FR-015, FR-019 |
| **RX8** | A live face. For a role the catalog entry lists: no node of that name, or more than one; a node with children, or whose mesh another node also uses, or holding more than one primitive; a primitive other than four vertices forming two triangles; a texture coordinate off the quad's corners; a texture on its material, or a `COLOR_0`; a centre or an edge more than 1 mm off the catalog's; a facing, an up, a corner's angle, or either triangle's winding more than 1° off | FR-017, FR-021 |
| **RX9** | A texture's format. A `mimeType` other than `image/png`, `image/jpeg`, or `image/webp`, or one its bytes don't match; a PNG other than 8 bits a channel in RGB or RGBA; a JPEG other than Huffman-coded (baseline, extended, or progressive), 8-bit, with three components; an animated WebP; a side that isn't a power of two; on a small prop (a piece the caps' `small_props` lists, §8.1), a side over `small_prop_texture_px` | FR-015, FR-022, FR-053 |
| **RX10** | Baked light in a material: an `emissiveFactor` other than `[0, 0, 0]`, an `emissiveTexture`, `KHR_materials_emissive_strength`, or an `occlusionTexture` | FR-022 |

**Readings the implementation makes:**
- **The order.** RX1, then RX2: a finding there stops the file's other rules, which need a sound file. Otherwise every rule runs and every finding is reported, sorted by path, then rule. "Not scrubbed" stops nothing, so a candidate shows every other finding before it is scrubbed.
- **RX1's unreadable file** is a finding about one piece's model, so an image build that can't read a model keeps that piece's stand-in (§10).
- **RX2's index and range checks** run before any accessor is decoded, so the reader never reads outside the file.
- **RX7's bounds** cover every vertex of every primitive reachable from the default scene, through its node's transform. They can't tell a piece symmetric about its vertical axis from its own back: RX8's facing catches a piece with a live face that was turned, and the lookdev page shows the rest.
- **RX8's corners** are found by their texture coordinates, each within 0.001 of a corner: (0, 0) is the top-left in reading order, (1, 0) the top-right, (0, 1) the bottom-left, (1, 1) the bottom-right. From them: the centre is the corners' mean; the width is the top and bottom edges, the height the left and right edges, each checked; the facing is (bottom-left − top-left) × (top-right − top-left), normalized; the up is top-left − bottom-left, normalized; each corner's angle is 90°; and each triangle's winding normal, (v1 − v0) × (v2 − v0), agrees with the facing, since glTF's front faces wind counter-clockwise. The expected up is the catalog face's ([data-model.md](../data-model.md)). The refusal prints the measured plane (FR-017): its centre and edges in metres to 0.1 mm, its facing and up to 0.001.
- **RX8's "one plain colour"** means no texture of any kind on the face's material (base colour, metallic-roughness, normal, occlusion, emissive, or a `KHR_materials_*` texture) and no vertex colours; a face with no material takes glTF's default, which is plain.
- **RX9 reads no colour profile.** The scrub drops ICC profiles ("ICC profiles go: the studio's outputs are sRGB", spec 003's scrubber), so sRGB is an export rule, and the Author's to confirm (§9).
- **RX10 sees material fields only.** Light, shadow, or an outline baked into a base colour or built as geometry is the Author's to refuse (§9).

## 6. The mark (FR-015, FR-068, C1)

The scrubbed file carries spec 003's mark as `KHR_xmp_json_ld` on the asset, "holding the mark alone" (FR-015; spec 003's research R-03). RX5 reads it exactly as `scrub.py` writes it and as the arrival check's M5 reads it:

```json
{
  "extensionsUsed": ["KHR_xmp_json_ld"],
  "extensions": {
    "KHR_xmp_json_ld": {
      "packets": [
        {
          "@context": { "Iptc4xmpExt": "http://iptc.org/std/Iptc4xmpExt/2008-02-29/" },
          "Iptc4xmpExt:DigitalSourceType": "<value>"
        }
      ]
    }
  },
  "asset": { "version": "2.0", "extensions": { "KHR_xmp_json_ld": { "packet": 0 } } }
}
```

- **The form.** `extensionsUsed` names `KHR_xmp_json_ld` beside the file's other extensions, and `extensionsRequired` doesn't; the root's `KHR_xmp_json_ld` holds `packets` alone, an array of exactly one packet; the packet holds exactly `@context`, with exactly the one entry above, and `Iptc4xmpExt:DigitalSourceType`; `asset.extensions` is exactly `{"KHR_xmp_json_ld": {"packet": 0}}`; and no other object (a node, mesh, material, image, texture, or scene) holds `KHR_xmp_json_ld`.
- **The value.** One of C1's three, each an IPTC digital source type under `http://cv.iptc.org/newscodes/digitalsourcetype/`:

  | Class the page and the report show | Value | When the record calls for it (C1) |
  |---|---|---|
  | `model` | `trainedAlgorithmicMedia` | every step that made the content is a model's |
  | `composite` | `compositeWithTrainedAlgorithmicMedia` | model and hand steps mix |
  | `hand` | IPTC's value for human-made digital art, the term the Author confirms before P-5 | every step is by hand |

  The human-made term isn't confirmed yet: agents can't reach IPTC's vocabulary, and the exploration's candidate, `digitalCreation`, is unverified. Until the Author confirms it, `glb/rules.ts` holds two values, and a hand-made file fails RX5, as FR-077 wants anyway: C1 on `main` before the first hand-made room file.
- **Not scrubbed.** No root packet and no asset reference: the finding reads `RX5 <file>:extensions: not scrubbed`, and the lookdev page shows "not scrubbed" (FR-068).
- **Which value is right is the record's to say.** The intent: "Say exactly what I owned (Principle VII). A model I made by hand must not carry an "AI-made" mark. The mark follows the record." And the studio's contract of 2026-10-22, as Amendment C1 carries it: "a step you scripted is a model step". The arrival check's M5, as P-5 amends it, compares the value with the record's `by` fields (SC-013). RX5 checks the form and that the value is one of the three; it reads no record, since a candidate in the lookdev page has none yet. The page and the compositor's report show the value's class beside the piece, so the Author can match it to the record before approving.

## 7. The measures (FR-053, FR-073, FR-079)

| Measure | How | Agrees with |
|---|---|---|
| Bytes | the plain file's length | the arrival check's size table |
| gzip-9 bytes | the length of `pako.gzip(bytes, {level: 9, header: {time: 0, os: 255}})`, pako 2.1.0, pinned in `apps/web/package.json` (on `feat/002-us6-events`): the `.glb.gz` the site serves ([serving.md](serving.md) §1) | `len(gzip.compress(data, 9, mtime=0))`, the arrival check's F2 and F3 (C6, C7); proven by the parity test below |
| Vertices | the sum of `POSITION` counts over every mesh's primitives | the arrival check |
| Triangles | per primitive: mode 4, ⌊k / 3⌋; modes 5 and 6, max(k − 2, 0); other modes, 0; `k` is the index count, or the `POSITION` count without indices. Each mesh counts once, however many nodes use it | the arrival check's count |
| Texture memory | the sum over the file's images of ⌊16 · w · h / 3⌋: width × height × 4 bytes, × 4/3 for mipmaps | the arrival check's `w × h × 4 × 4 // 3`; FR-053's formula |
| Largest texture side | the largest width or height of any image | RX9, RK2 |
| Bounds | the least and greatest x, y, and z over every vertex reachable from the default scene, in the model's frame | RX7; FR-019's measured bounds |
| Live faces | per role: centre, edges, facing, and up (§5's readings) | RX8 |

- **The file stays plain** (FR-079): "The file itself stays plain glTF: FR-015's "no … compression" governs what a file holds, not how it is sent." The measure compresses a copy; nothing compresses the file.
- **Why pako.** Node's built-in zlib is Chromium's fork, whose output can differ from a vanilla zlib's; pako, a JavaScript port of zlib 1.2.8, runs vanilla zlib's deflate at the same level, window, and memory settings as Python's `gzip.compress`, and the parity test proves the lengths agree on every run rather than assuming it. With MTIME 0, XFL 2 (level 9), and OS 255, pako's header is Python's byte for byte; the length never depends on those bytes.
- **The parity test.** `apps/web/test/fixtures/gzip-parity.json` holds cases from a seeded xorshift32 stream that TypeScript and Python generate identically, cut into runs of random bytes and runs of a repeated short pattern, from 0 bytes to about 3,000,000 (past the 2,500,000-byte cap), with each case's expected gzip-9 length. `make test` checks it twice: vitest through pako (`apps/web/test/room/gzip.test.ts`), and pytest through `gzip.compress(data, 9, mtime=0)` (`scripts/assets/test_gzip_parity.py`). A Python linked to a non-vanilla zlib (zlib-ng, for one) fails it visibly, naming the case. The Author's host Python runs the arrival check, outside both runs: the intake note puts the arrival check's size table beside the compositor's report, and equal gzip columns show the host agrees. If they ever differ, the served bytes, the report's, govern SC-006.
- **Image cards.** Where the catalog places an image card instead of a model ([data-model.md](../data-model.md)), the same image reader measures it: its texture memory by the same formula, its bytes as its file's length, since it is served as stored ([serving.md](serving.md) §1); RX9's format rules apply to it as to an embedded texture.

## 8. The budgets and the caps (FR-053, C7)

### 8.1 The caps' room block

The Author's commit P-6 on `main` gives `assets/policy/caps.json` (which spec 003's guard patch creates, on `feat/003-guards`) one room block (C7):

```json
{
  "per_asset": {
    "room": {
      "gzip_bytes": 2500000,
      "triangles": 40000,
      "small_props": ["<piece IDs the Author names>"],
      "small_prop_texture_px": 1024,
      "scene_texture_bytes": 96000000,
      "legibility_floor_css_px": 9
    }
  }
}
```

- **The keys** ([data-model.md](../data-model.md) has each one's type). `gzip_bytes`, `triangles`, and `scene_texture_bytes` are integers above 0; `small_prop_texture_px` is a power of two; `legibility_floor_css_px` is a number above 0; `small_props` is a list of unique piece IDs, which are also their model files' stems, so the arrival check, reading per file, and the compositor, reading per piece, name the same pieces. The floor is RG's ([room-data-files.md](room-data-files.md)); it rides here because it is configuration the Author owns, read from `main` with the caps (FR-052). The Author names `small_props` in P-6. Beside the block, the compositor reads `first_visit_bytes.phase3` for the report's enforced limit.
- **Where they're read from.** In order: `ROOM_POLICY_DIR` (the image's `policy` context, [serving.md](serving.md) §3, or the gate's content build's mount, P-10); `main` by its full ref, `refs/heads/main:assets/policy/caps.json`, with replace objects off; and, only where there is no `.git` (the gate's container), the export's own copy, which rule A9 keeps a branch from changing, so it can lag `main` and never run ahead of it. The report and the manifest name the source and the file's SHA-256.
- **No room block** (`main` before P-6, or an image build with no policy context): RK1 checks the catalog's budgets against FR-053's starting figures (2,500,000 gzip-9 bytes and 40,000 triangles a piece, 96,000,000 bytes of scene texture memory), every model stays a stand-in, the legibility floor is 9 CSS pixels, and the report says "FR-053's starting figures; main has no room caps". A test pins these defaults to FR-053. Agents never raise a cap: `caps.json` is human-only, and RK1 refuses a budget above it.

### 8.2 The rules

| ID | Refused | Spec |
|---|---|---|
| **RK1** | A catalog `budget` above the caps: `gzip_bytes` over `gzip_bytes`, `triangles` over `triangles`, `texture_px` over `small_prop_texture_px` for a piece `small_props` lists, or `texture_bytes` over `scene_texture_bytes`. Agents never raise a cap | FR-053 |
| **RK2** | A model over its piece's budget: its gzip-9 bytes over the budget's `gzip_bytes`, its triangles over `triangles`, its largest texture side over `texture_px`, or its texture memory over `texture_bytes` | FR-053 |
| **RK3** | The scene's texture memory on the reference phone over `scene_texture_bytes`. The total adds, once for each piece the scene places (placements of one piece share its textures), the piece's budgeted `texture_bytes`, which a set model never exceeds (RK2); the twin's and the largest visitor avatar's measured texture memory, read with the same reader from spec 003's `assets/twin/` and `assets/visitors/`, or 0 with a note while they don't exist; and every live-face canvas at min(the face's pixels, its largest on-screen size × the reference phone's pixel ratio) (FR-054), by the same formula | FR-053, FR-054, SC-006 |
| **RK4** | A `caps.json` that doesn't parse, or whose `per_asset.room` misses a key, holds an unknown key, a value of the wrong type or out of its range, or a `small_props` entry outside the ID grammar | FR-053, C7 |

- **RK2 is one piece's model finding.** In the image build it keeps that piece's stand-in, with the `warn` line (§10). RK1, a catalog budget above the caps, is a data finding and fails every build ([room-data-files.md](room-data-files.md) §15).
- **RK3 is the scene's.** Its total rests on budgets, the figures, and the canvases, all of which `make test` reads, so it is never one piece's model finding and fails every build ([data-model.md](../data-model.md)); `make test` meets it first.
- **RK4** fails every build ([room-bundle.md](room-bundle.md) §2): a malformed caps file is the Author's to fix on `main`. A `small_props` entry naming no current piece isn't malformed: the report notes it, so removing a piece in data never breaks a build on the Author's file.
- **One file per piece.** A piece's caps and budget apply to its one model file, as the arrival check's F2 reads caps per file (C7).
- **The runtime keeps the cap too.** The room's texture ledger counts every upload by the same formula, and a piece whose textures would take it over keeps its stand-in ([data-model.md](../data-model.md), a studio model's lifecycle).

### 8.3 What the report takes from here (FR-073)

For each piece: its source, the studio file's stem or "stand-in" with the manifest's reason (`no-model`, `no-caps`, or `findings`, with the findings' rule IDs and never their data); its model's bytes, gzip-9 bytes, triangles, and texture memory, beside its budget; the largest per-piece figures against the caps, with the caps' source and SHA-256; texture memory by class (the pieces' budgets, the figures, the live-face canvases) against `scene_texture_bytes`; and the room's share of the first visit in served bytes (each placed model's `.glb.gz` length and each placed card's length) beside the design's estimate of 12,000,000, with F3's view (every file under `assets/room/` at gzip-9, C6) beside spec 003's enforced 25,000,000-byte phase-3 first visit.

## 9. What no rule sees

The Author's approval and the reviewer's arriving-assets pass decide these, through P1's confirmations (`no_screen_logo_text_or_art`, `recreation_not_photo`) and P2's room confirmations as C4 reads them (each per file, `not_applicable` where one doesn't apply). User Story 4's Independent Test: "A texture with readable text, and a crop of a photo, are refused at the Author's approval and the reviewer's arriving-assets pass."
- readable text, a logo, or third-party art in a texture (FR-016);
- a texture projected, traced, or cropped from a photo (FR-022);
- light, shadow, glow, or an outline baked into a base colour or built as geometry (FR-022);
- a neon tube shaped like a letter or a digit (FR-021);
- colour that isn't sRGB (RX9's reading);
- the window's view and the artwork (FR-028).

The lookdev page is where the Author looks: at the room's framing, on the scrubbed file whose hash the Author approves.

## 10. Strict, lenient, and the page (FR-013, FR-019, FR-068)

| Run | On an RX or RK2 finding, each about one piece's model file | On a pass |
|---|---|---|
| `make test` (strict: `compose(…, {mode: "strict"})` over the real tree) | fails, with every finding | the model is set |
| The image build, `make up`'s (lenient) | the same line, prefixed `warn`; the piece keeps its stand-in, selectable, with its live faces and state; the manifest says stand-ins are in use, listing the piece | the model is set |
| The lookdev page | shown beside the candidate ([lookdev.md](lookdev.md)) | shown, with the measures |
| `npm run room:fit -- <glb> --piece <id>` (the compositor's command line, for agents and tests; it reads files in the tree only) | printed; exit 1 | the measures; exit 0 |

- **A finding** reads `<rule> <file>:<path>: <reason>`. `<file>` is the model's repository path (`assets/room/desk.glb`), or `candidate` in the lookdev page, whose results key each candidate by its piece; `<path>` is the JSON path by index (`nodes[4].name`, `images[2]`, `materials[1].emissiveFactor`). A reason never quotes a name or a string from the file (FR-018: "a refusal SHALL name the rule and the element's index, never the name"); RX7 and RX8 print measured numbers only.
- **Every other finding** (the data's own rule families; RK1, a budget above the caps; and RK3, which is the scene's) fails the image build as it fails `make test` ([room-data-files.md](room-data-files.md) §15); RK4 fails there too (§8.2).
- **Once a model is set,** framing, footprints, and hit areas use its measured bounds (FR-019): the compositor writes them into the 3D part's frame box for each placement of the piece ([room-bundle.md](room-bundle.md)), and every geometric check reads them there.

## 11. One check, two places (FR-068)

FR-068: "THE LOOKDEV PAGE'S FIT CHECK SHALL be the compositor's own code." The intent's reading of answer 10 (the Author: "10-16) are okay?."): "The fit check runs in the lookdev page."
- **One module.** The compositor imports `src/room/glb/` in Node; the lookdev page, and its phone copy, bundle the same module. Neither carries a second copy of a rule.
- **The same inputs.** The page judges a candidate against the fit inputs the compositor used: the catalog's expected bounds and live faces at the stylized scale, the piece's budget, whether it is a small prop, and the caps the compose read ([lookdev.md](lookdev.md) §2). So a file gets the same findings in the page as in `make test`.
- **The same measures.** gzip-9 through pako in both. The SHA-256: Node's in the compositor; in the page, `src/lookdev/sha256.ts`, pure JavaScript, because the phone copy may not be a secure context for `crypto.subtle`, and a test holds it equal to Node's.
- **Never in the room.** Neither the fit check nor pako reaches the room's entry chunk or its 3D chunk; the chunk test fails if one does.

## 12. Proof

| Test | Proves | Spec |
|---|---|---|
| `apps/web/test/helpers/glb.ts` | builds every fixture GLB at run time (rule A1 refuses a committed model), a port of spec 003's `arrival_fixtures.glb()`: a clean model per fixture catalog entry, in the scrubbed form with each value `glb/rules.ts` holds, and one variant per rule. User Story 4's machine-checkable cases are among them: a live face missing or off its plane (RX8), a misplaced origin (RX7), a light (RX4), a camera or an animation (RX3), a name off the rule (RX6), a refused extension (RX4) | SC-002 |
| `apps/web/test/room/glb.test.ts` | each RX rule refuses its variant, naming its rule and path and never a name; the clean set passes; "not scrubbed" stops nothing; the measures equal hand-computed values (triangles per mode, texture memory, bounds through TRS and matrix nodes, quantized and sparse positions); the scrubbed form RX5 accepts is the one `scrub.py` writes, which `scripts/assets/test_scrub.py` (on `feat/003-us1-arrival-check` and later) pins, and C1's change to the scrubber changes both in one commit | FR-015 to FR-019, FR-022, SC-002 |
| `apps/web/test/room/budgets.test.ts` | RK1 to RK4; the defaults pinned to FR-053; the absent block, and the malformed one failing strict and lenient builds alike; RK3's total by class | FR-053, FR-054, SC-006 |
| `apps/web/test/room/gzip.test.ts`, `scripts/assets/test_gzip_parity.py` | §7's parity | FR-079, SC-006 |
| `apps/web/test/room/compose.test.ts` | strict fails and lenient warns on the same finding; the manifest lists the stand-in | FR-013 |
| `apps/web/test/lookdev/candidate.test.ts` | the page's findings and measures equal the compositor's for the same bytes and piece | FR-068 |
| `apps/web/test/room/chunk.test.ts` (on `feat/002-us6-events`), extended | no fit check and no pako in the room's chunks | FR-011 |
| P-5's tests, in `tools/gates/test/` ([intake-amendments.md](intake-amendments.md)) | a mark that disagrees with its record is refused (C1), the human-only half of User Story 4's Independent Test | SC-013 |

## 13. Principles, cost, and the degraded mode

- **Principles touched.** I: a model that fails its fit, or can't be read, leaves its piece's stand-in, selectable, with its live faces and state, and the image still builds (FR-013, FR-057). IV: the arrival check stays human-only and the authority; the caps are the Author's, read from `main`, and agents never raise one. V: the caps and the report count the bytes the site serves (FR-053, FR-079). VII: the mark follows the record (C1). II: §12's tests, and the report in every merge-request note that changes the room (FR-073).
- **Cost.** $0 at run time: the check runs at build time and in the Author's lookdev page, and calls no model. Its measures feed the spec's transfer estimate, about 12,000,000 bytes of the 25,000,000-byte first visit.
- **No data flow.** The check reads files in the tree, or bytes in the page's memory, and sends nothing anywhere.
