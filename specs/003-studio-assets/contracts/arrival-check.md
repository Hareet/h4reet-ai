# Contract: the arrival check

`tools/gates/arrival_check.py`, human-only. Python 3.12, standard library only, run through `PY_HOST` (spec 000's `python3 -I -B -X pycache_prefix=/dev/null`). Spec 003's FR-001, FR-002, FR-004, and FR-006 to FR-020; plan §3; research R-01 to R-09.

## 1. Invocations

| Form | Checks | Run by |
|---|---|---|
| `arrival_check.py --staged` | the files in the index | `.claude/git-hooks/pre-commit`, after gitleaks |
| `arrival_check.py --range main..HEAD` | each commit in the range: the files it added or changed, as that commit had them, plus its records and notices; for a merge commit, what it adds against each of its parents, so a file a conflict's resolution brings in is checked; then the range's tip as a whole tree, so a deletion (a removed `LICENSE.md`, a record entry dropped while its file stays) is checked as the tree it leaves | `make check` (`arrival`), `tools/gates/gate` (step `arrival`) |
| `arrival_check.py --history` | every commit reachable from any ref | `make publish-check` |
| `arrival_check.py <path>…` | the named files as they are on disk | the Author, and the scrubber's tests |

**Its code comes from the main working tree, and its policy from `refs/heads/main`.** The hook, `make check`, and the gate each run the main working tree's copy of the program, found as the pre-commit hook finds that tree (`git rev-parse --git-common-dir`, then its parent). The program reads `assets/policy/{licenses,approvals,caps}.json` as the gate reads `main`: `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:<path>`. Never `main:<path>`, which a tag named `main` would answer ahead of the branch, and never `git show`, which follows `refs/replace` (spec 000's reference-transaction hook guards `refs/heads/main` only). Never from the branch under check, and never from whatever branch the main working tree has checked out. Only the Author's merges and patches move `refs/heads/main`. A branch that changes `assets/policy/` fails rule A9 whatever else it does; the Author's own policy commits on `main` don't (A9's row).

**Exit codes:** 0, nothing refused; 1, at least one finding; 2, can't check (a git range that doesn't resolve, the main tree not found, or a file that needs the policy while `main` has none or it can't be parsed). Callers treat 2 as a failure. A run that meets no studio file needs no policy and exits 0, so commits keep working before the policy exists.

## 2. Which files it checks

- **Asset roots:** `assets/**` (but `assets/policy/`), and `docs/research/images/**`.
- **Anywhere, by format:** every file whose extension or leading bytes mark an image, video, or model format, so a studio file can't hide outside the roots:
  - images: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.tif`, `.tiff`, `.dng` (TIFF's `II*\0` or `MM\0*`), `.heic`, `.heif`, `.avif`;
  - video: `.mp4`, `.mov`, `.m4v` (HEIC, HEIF, AVIF, MP4, and MOV share ISO BMFF's `ftyp` box at byte 4, which identifies them whatever their name);
  - models: `.glb`, `.gltf`, `.ktx2`, `.safetensors`, `.ckpt`, `.pt`, `.pth`, `.gguf`, `.onnx`, and a `.bin` over 1 MB, with their magic numbers.

  A smaller `.bin` outside the roots isn't checked as a model, since build tools use the extension for other things; it still meets the next line.
- **Anywhere, by content:** every staged binary file (a NUL byte in its first 8,000 bytes, git's own test), in any format and any directory, is searched for camera metadata: EXIF's `Exif\0\0` header, an XMP packet (`<x:xmpmeta` or the namespace `http://ns.adobe.com/xap/1.0/`), and, inside an EXIF block, the GPS directory's tag (`0x8825`). FR-002: "IF a file carries camera metadata, THEN THE ARRIVAL CHECK SHALL refuse it." In an asset root, the M rules parse the formats they admit, and only the mark's own XMP packet passes there (M5).

## 3. The rules

Each refusal names one rule's ID.

| ID | Rule | Spec |
|---|---|---|
| **A1** | An image, video, or model file outside the asset roots (§2's formats) | FR-001 |
| **A2** | Model weights or a LoRA anywhere (by extension, or by a safetensors or GGUF header) | FR-001 |
| **A3** | In an asset root: a file that isn't PNG, JPEG, WebP, GLB, `records.json`, or `LICENSE.md` (a workflow, a node pack, a script, a `.gltf`, a KTX2 file, a HEIC, AVIF, TIFF, DNG, or video file, an editor's backup such as `*_original`) | FR-001, FR-008 |
| **A4** | Camera metadata in any binary file anywhere: an EXIF header, an XMP packet, or a GPS directory (§2, "by content"), apart from the mark's own packet in a file the M rules admit | FR-002, FR-006 |
| **A9** | A branch changes `assets/policy/`. It applies under `--staged` when the current branch isn't `main`, and under `--range`; never to the Author's own policy commits on `main`, and not under `--history`, where they're expected | FR-005 |
| **M1** | PNG: a chunk outside research R-03's list, or more than one `iTXt` mark | FR-006 |
| **M2** | JPEG: a segment outside the list; an EXIF `APP1`; an `APP0` that isn't JFIF; an `APP2` that isn't an ICC profile | FR-002, FR-006 |
| **M3** | WebP: a chunk outside the list, or a `VP8X` flag other than XMP | FR-006 |
| **M4** | GLB: anything outside the glTF 2.0 schema's properties; any `extras` but `mesh.extras.targetNames`, an array of strings (the morph targets' names, which FR-018's lip-sync needs, each checked as M8 checks a name); `asset` holding more than `version` and `copyright`; an extension outside the list; a chunk other than one JSON and one `BIN` | FR-006 |
| **M5** | The mark: missing, or its packet holds anything but `Iptc4xmpExt:DigitalSourceType` set to `http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia` | FR-034 |
| **M6** | An image embedded in a GLB fails M1 to M4 or M7, or carries any XMP packet: the GLB's one mark covers the model file ("one machine-readable mark in every published image and model file"), so an embedded image carries none of its own | FR-006, FR-034 |
| **M7** | An ICC profile's description or copyright text fails B1 to B3 | FR-006, FR-007 |
| **M8** | GLB: a `uri` on any image or buffer (a GLB embeds both through its `BIN` chunk); or any `name` (on an image, texture, sampler, material, mesh, node, skin, or animation) or a `targetNames` entry holding a file name or path: a dot followed by a 1-to-5-letter extension, a slash, a backslash, or a camera's file stem (`IMG_`, `DSC`, `DSCN`, `PXL_`, `MVIMG_`, `Screenshot`) | FR-007 |
| **M9** | Bytes a container doesn't account for: anything after PNG's `IEND` or JPEG's `EOI`, past the RIFF size a WebP declares, or in a GLB's `BIN` chunk outside every `bufferView` beyond 4-byte padding. With the B rules' scope (below), this is what keeps text out of the pixel data the B rules don't scan | FR-006, FR-007 |
| **B1** | A prompt or workflow record: ComfyUI's `prompt` or `workflow` keys, or JSON with `class_type` and `inputs` | FR-007 |
| **B2** | A model file's name: any name ending in an A2 extension | FR-007 |
| **B3** | A local path: `/home/`, `/Users/`, `/mnt/`, `/tmp/`, `C:\`, `\\wsl`, or `file://` | FR-007, FR-009 |

**The B rules' scope.** They scan the parts of a file that hold text: every chunk and segment the M rules admit other than pixel data (the mark's packet, an `iCCP` profile's name, an ICC profile's text), a GLB's JSON chunk, and `records.json` and `LICENSE.md`. They never scan compressed pixel data (PNG's `IDAT`, JPEG's scan data, WebP's `VP8`, `VP8L`, and `ALPH`, and the image views of a GLB's `BIN` chunk): a three-byte pattern such as `C:\` occurs by chance in about 46% of random 10 MB streams, and the scrubber, which never re-encodes pixels, couldn't clear it. M9 refuses the bytes a container doesn't account for, so text can't hide beside the pixels either. A binary file outside the M parsers' formats is refused by A1 or A4, or isn't a studio file.
| **R1** | The directory has no `records.json`, or it fails [asset-record.md](asset-record.md)'s schema | FR-010 |
| **R2** | A file no entry names, or an entry naming no file | FR-008 |
| **R3** | An entry's `sha256` doesn't match its file | FR-010 |
| **R4** | A required field is missing, or an unknown field is present | FR-010 |
| **R5** | A source or any record field holds a path, a file name with an extension, a coordinate, or a date-time finer than a day | FR-011 |
| **R6** | A model step with no `models_checked`, or one after `made` | FR-012 |
| **R7** | A step's `service` names a disclosure row that `docs/data-flow-disclosure.md` doesn't have | FR-040c |
| **L1** | A model, tool, or service's license and version aren't in the `main` branch's `licenses.json`; or, in an asset directory, they don't read `yes` on FR-013's three terms; or, in a published-image folder, they read `no` on research display (FR-036 as clarified) | FR-013, FR-036 |
| **L2** | An evaluation-only license in an asset directory without `commercial_license` | FR-014 |
| **N1** | The directory has no `LICENSE.md`, it doesn't name the media license, or its copyright line still holds a placeholder ([asset-record.md §3](asset-record.md#3-the-media-license)) | FR-015 |
| **N2** | An entry's `media_license` differs from the directory's | FR-015 |
| **P1** | `likeness`, a photo source, or the `room` kind, and no approval in the `main` branch's `approvals.json` names this hash with every confirmation true | FR-002, FR-016 |
| **P2** | A `room` file whose approval lacks the room confirmations | FR-037 |
| **P3** | A file of the twin before an approval carries the disclosure line | FR-034 (research R-11) |
| **F1** | An avatar or animation while `caps.json` says ADR 0010 isn't accepted | FR-018 |
| **F2** | Over a per-asset cap (bytes, triangles, texture memory) | FR-019 |
| **F3** | The first-visit total over its budget | FR-019, SC-006 |
| **H1** | The history total of asset and published-image blobs over 500 MB | FR-020 |
| **C1** | A published image from arm B or D whose note doesn't carry "Evaluation output; not used in the site's assets." on the line after its link | FR-036 |

## 4. Output

One line per finding, then the size table, then a summary:

```text
M5 assets/twin/idle.glb @3f2a1c9: the mark's packet holds a second property
R3 docs/research/images/2026-10-12-image-model-evaluation/t1-grid.jpg: sha256 differs from records.json
file                                bytes     gzip      vertices  triangles  texture
assets/visitors/dog/dog.glb         812345    790112    10234     18002      4194304
first visit (phase 2): 7,104,330 of 10,000,000 bytes · history: 41,233,001 of 500,000,000 bytes
arrival-check: 2 findings in 14 files (3 commits)
```

It never prints the bytes a B rule matched, only the offset; never a key or token; and never a path outside the repository.

## 5. Tests

`tools/gates/test/test_arrival_check.py`, with `arrival_fixtures.py` building every fixture at run time:
- one passing file per format with its record, notice, and approval, and one failing file per rule;
- outside the roots: a HEIC, an AVIF, a TIFF, a DNG, and a MOV, each carrying EXIF with a GPS directory (A1), and a binary file of no listed format carrying an EXIF header (A4);
- a GLB whose `images[0].name` is a photo's file name (M8), one with a `uri`, one keeping `mesh.extras.targetNames` (passes), one with an embedded texture carrying metadata or its own mark (M6), and one with bytes in `BIN` that no `bufferView` covers (M9);
- a PNG whose `IDAT` data happens to hold `C:\` and `/mnt/`, which passes (the B rules don't scan pixels), and one with bytes after `IEND` (M9);
- a three-commit branch where the second commit adds a failing file and the third fixes it (`--range` fails); a merge commit whose resolution adds a failing file (`--range` fails); a branch that deletes a directory's `LICENSE.md` (`--range` fails on the tip's tree);
- the policy read from the fixture repository's `refs/heads/main`, with the branch's own copy, the working tree's checked-out copy, a tag named `main`, and a `refs/replace` entry all ignored;
- a commit on `main` that changes `assets/policy/` passing under `--staged` (A9 doesn't apply), and the same change on a branch refused;
- a commit with no studio file passing while `main` has no policy.

SC-001: every rule refuses its fixture, and every passing fixture passes.
