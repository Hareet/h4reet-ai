# Contract: the arrival check

`tools/gates/arrival_check.py`, human-only. Python 3.12, standard library only, run through `PY_HOST` (spec 000's `python3 -I -B -X pycache_prefix=/dev/null`). Spec 003's FR-001, FR-002, FR-004, and FR-006 to FR-020; plan §3; research R-01 to R-09.

## 1. Invocations

| Form | Checks | Run by |
|---|---|---|
| `arrival_check.py --staged` | the files in the index | `.claude/git-hooks/pre-commit`, after gitleaks |
| `arrival_check.py --range main..HEAD` | each commit in the range: the files it added or changed, as that commit had them, plus its records and notices | `make check` (`arrival`), `tools/gates/gate` (step `arrival`) |
| `arrival_check.py --history` | every commit reachable from any ref | `make publish-check` |
| `arrival_check.py <path>…` | the named files as they are on disk | the Author, and the scrubber's tests |

**Its policy and its code come from the main working tree.** It finds that tree as the pre-commit hook does (`git rev-parse --git-common-dir`, then its parent), and reads `assets/policy/{licenses,approvals,caps}.json` there, never from the branch under check. A branch that changes `assets/policy/` fails rule A9 whatever else it does. The hook, `make check`, and the gate each run the main tree's copy of the program itself.

**Exit codes:** 0, nothing refused; 1, at least one finding; 2, can't check (a policy file missing or unreadable, a git range that doesn't resolve, the main tree not found). Callers treat 2 as a failure.

## 2. Which files it checks

- **Asset roots:** `assets/**` (but `assets/policy/`), and `docs/research/images/**`.
- **Anywhere:** every file whose extension or leading bytes mark an image or model format (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.glb`, `.gltf`, `.ktx2`, `.bin`, `.safetensors`, `.ckpt`, `.pt`, `.pth`, `.gguf`, `.onnx`, and their magic numbers), so a studio file can't hide outside the roots.

## 3. The rules

Each refusal names one rule's ID.

| ID | Rule | Spec |
|---|---|---|
| **A1** | An image or model file outside the asset roots | FR-001 |
| **A2** | Model weights or a LoRA anywhere (by extension, or by a safetensors or GGUF header) | FR-001 |
| **A3** | In an asset root: a file that isn't PNG, JPEG, WebP, GLB, `records.json`, or `LICENSE.md` (a workflow, a node pack, a script, a `.gltf`, a KTX2 file, an editor's backup such as `*_original`) | FR-001, FR-008 |
| **A9** | The branch changes `assets/policy/` | FR-005 |
| **M1** | PNG: a chunk outside research R-03's list, or more than one `iTXt` mark | FR-006 |
| **M2** | JPEG: a segment outside the list; an EXIF `APP1`; an `APP0` that isn't JFIF; an `APP2` that isn't an ICC profile | FR-002, FR-006 |
| **M3** | WebP: a chunk outside the list, or a `VP8X` flag other than XMP | FR-006 |
| **M4** | GLB: anything outside the glTF 2.0 schema's properties; any `extras`; `asset` holding more than `version` and `copyright`; an extension outside the list; a chunk other than one JSON and one `BIN` | FR-006 |
| **M5** | The mark: missing, or its packet holds anything but `Iptc4xmpExt:DigitalSourceType` set to `http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia` | FR-034 |
| **M6** | An image embedded in a GLB fails M1 to M5 | FR-006 |
| **M7** | An ICC profile's description or copyright text fails B1 to B3 | FR-006, FR-007 |
| **B1** | The bytes hold a prompt or workflow record: ComfyUI's `prompt` or `workflow` keys, or JSON with `class_type` and `inputs` | FR-007 |
| **B2** | The bytes hold a model file's name: any name ending in an A2 extension | FR-007 |
| **B3** | The bytes hold a local path: `/home/`, `/Users/`, `/mnt/`, `/tmp/`, `C:\`, `\\wsl`, or `file://` | FR-007, FR-009 |
| **R1** | The directory has no `records.json`, or it fails [asset-record.md](asset-record.md)'s schema | FR-010 |
| **R2** | A file no entry names, or an entry naming no file | FR-008 |
| **R3** | An entry's `sha256` doesn't match its file | FR-010 |
| **R4** | A required field is missing, or an unknown field is present | FR-010 |
| **R5** | A source or any record field holds a path, a file name with an extension, a coordinate, or a date-time finer than a day | FR-011 |
| **R6** | A model step with no `models_checked`, or one after `made` | FR-012 |
| **R7** | A step's `service` names a disclosure row that `docs/data-flow-disclosure.md` doesn't have | FR-040c |
| **L1** | A model, tool, or service's license and version aren't in the main tree's `licenses.json`, or don't read `yes` on all three terms | FR-013 |
| **L2** | An evaluation-only license in an asset directory without `commercial_license` | FR-014 |
| **N1** | The directory has no `LICENSE.md`, or it doesn't name the media license | FR-015 |
| **N2** | An entry's `media_license` differs from the directory's | FR-015 |
| **P1** | `likeness`, a photo source, or the `room` kind, and no approval in the main tree's `approvals.json` names this hash with every confirmation true | FR-002, FR-016 |
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

`tools/gates/test/test_arrival_check.py`, with `arrival_fixtures.py` building every fixture at run time: one passing file per format with its record, notice, and approval; one failing file per rule; a three-commit branch where the second commit adds a failing file and the third fixes it (`--range` fails); and the policy read from a separate "main tree" directory, with the branch's own copy ignored. SC-001: every rule refuses its fixture, and every passing fixture passes.
