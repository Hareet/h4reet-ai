# Research: Studio Assets (spec 003)

Phase 0 output of `/speckit-plan`, written on 2026-10-18. One entry per decision the plan rests on: the decision, why, and what else was weighed.

**How the decisions were taken.** Where spec 000's plan held an interview with the Author, this plan follows the Author's direction of 2026-10-17: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change". Each question the Author would otherwise have been asked takes the recommended answer, listed in [Decided by recommendation, revisit any time](#decided-by-recommendation-revisit-any-time) with its entry. Changing one changes that entry, the plan section it names, and the tasks that cite it.

**No `NEEDS CLARIFICATION` remains** in the plan's Technical Context. Two inputs come from outside this repository and stay open: the paths of the studio's folders on the Author's machine (R-07), which the Author writes into the guard patch before applying it; and ADR 0010's format and caps (R-12), which the Author accepts before any avatar can arrive.

## Decided by recommendation, revisit any time

| # | Decision | Recommended, and taken | Entry |
|---|---|---|---|
| 1 | Where the assets live in the repository | `assets/` at the root, one directory per asset family; published images beside the note that shows them | R-01 |
| 2 | The record's format | one `records.json` per directory, read with Python's standard library | R-04 |
| 3 | Where the arrival check reads the license allowlist and the approvals | from the main working tree, never from the branch under check | R-05 |
| 4 | The machine-readable mark's exact form | an XMP packet holding only `Iptc4xmpExt:DigitalSourceType` = `trainedAlgorithmicMedia` in images, and the same in glTF's `KHR_xmp_json_ld` in models | R-03 |
| 5 | The draft of the visible disclosure line | "This avatar is a stylized likeness of the Author, made with AI from the Author's photos and published by the Author's choice." The Author approves the wording before the first likeness file is published | R-11 |
| 6 | The reference phone and the mobile profile | a 2023 mid-range Android phone, a Samsung Galaxy A54 or the closest the Author has, and a 9 Mbps, 150 ms round-trip connection, as spec 002 assumes for 4G | R-13 |
| 7 | Who drafts ADR 0010 | this spec's second task group drafts it as proposed, from intent 003's survey, for the Author to accept | R-12 |
| 8 | How the studio's GPU window is marked | an operator command that records the window on the gateway, shown as a gauge and an annotation on the dashboard | R-14 |
| 9 | The new ADRs | 0030 (the media license and the mark), 0031 (assets in plain git, under content-derived names), 0032 (ADR 0013's cleanup extended to assets) | R-15 |

---

## The intake

### R-01: Where the files live

**Decision.**
- **Assets:** `assets/`, with one directory per family: `assets/twin/`, `assets/visitors/<character>/`, `assets/animations/<rig>/`, and, in Phase 3, `assets/room/`. Each directory holds the files, one `records.json`, and one `LICENSE.md`, the media license's notice (FR-015).
- **Published images:** beside the note that shows them, in `docs/research/images/<note's file stem>/`, with the same `records.json` and `LICENSE.md`. The evaluation note's go in `docs/research/images/2026-10-12-image-model-evaluation/`.
- **Policy:** `assets/policy/` holds the license allowlist, the likeness approvals, and the caps (R-05, R-08). It's human-only from the first patch on (FR-005).
- **Anywhere else,** a binary image or model file is refused (R-02). The repository holds none today.

**Rationale.** Fixed roots let the arrival check find every studio file without trusting a marker an agent could leave out, and they give the deny rules a path to match. A note's images beside the note keep its links short and its folder's notice next to its files.

**Alternatives.** Records beside each file (`<file>.record.json`): one more file per asset, and FR-008's "a file no record names" becomes a pairing rule instead of a list. Images in `apps/web/`: spec 001 builds `apps/web` from these files at release, so keeping the sources apart keeps the site's build a copy.

### R-02: Which formats come in

**Decision.**
- **Images:** PNG, JPEG, and WebP.
- **Models and animations:** binary glTF 2.0 (`.glb`), with its textures embedded as PNG, JPEG, or WebP (`EXT_texture_webp`).
- **Everything else** in an asset or published-image directory is refused, apart from `records.json` and `LICENSE.md`. That includes `.gltf` with external buffers, KTX2 textures, Draco or meshopt compression, and any other extension, until ADR 0010 adds them and the check grows to read them.
- **Anywhere in the repository:** model weights and LoRAs by extension and by signature (`.safetensors`, `.ckpt`, `.pt`, `.pth`, `.bin` over 1 MB, `.gguf`, `.onnx`), as FR-001 asks.

**Rationale.** Each admitted format is one the check can parse completely with Python's standard library, so nothing in a file goes unread. glTF is the format intent 003's survey leans to, and ADR 0010 sets the rest.

**Alternatives.** Admitting KTX2 and compressed geometry now: they help phones, but the check would need their decoders to see inside them, and ADR 0010 hasn't chosen them.

### R-03: Reading every byte: the metadata allowlist and the mark (FR-006, FR-007, FR-034)

**Decision.** The arrival check parses each format down to its chunks and admits only:

| Format | Admitted | The mark |
|---|---|---|
| PNG | `IHDR`, `PLTE`, `IDAT`, `IEND`, `tRNS`, `gAMA`, `cHRM`, `sRGB`, `iCCP` (its profile name checked like any text), `pHYs` | one `iTXt` chunk, keyword `XML:com.adobe.xmp`, holding the mark's packet |
| JPEG | `SOI`, `DQT`, `SOFn`, `DHT`, `DRI`, `SOS`, scan data, `RSTn`, `EOI`, `APP0` (`JFIF` only), `APP2` (`ICC_PROFILE` only) | one `APP1` segment, `http://ns.adobe.com/xap/1.0/`, holding the mark's packet; no EXIF `APP1` |
| WebP | `RIFF`, `VP8`, `VP8L`, `VP8X` (with only the XMP flag set), `ALPH`, `ICCP` | one `XMP ` chunk holding the mark's packet |
| GLB | the JSON chunk and one `BIN` chunk. In the JSON: the glTF 2.0 schema's own properties, with `asset` holding `version` and, optionally, `copyright` naming the media license; no `extras` anywhere; `extensionsUsed` limited to `KHR_xmp_json_ld`, `KHR_materials_*`, `KHR_texture_transform`, `KHR_mesh_quantization`, and `EXT_texture_webp`; embedded images checked as images, recursively | one `KHR_xmp_json_ld` packet on the asset, holding only the mark |

- **The mark's packet** holds exactly one property, `Iptc4xmpExt:DigitalSourceType`, with the value `http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia`, and no toolkit attribute, date, or tool name. The check parses the packet as XML and refuses anything else in it.
- **Every file, whole:** the bytes are scanned for a prompt or workflow record (ComfyUI's `prompt` and `workflow` keys, and JSON with `class_type` or `inputs`), a model file's name (any extension from R-02's list), and a local path (`/home/`, `/Users/`, `/mnt/`, `C:\`, `\\wsl`, `file://`). A match refuses the file, naming the rule and the byte offset, never the match (FR-007).
- **`scripts/assets/scrub.py`** is the tool that makes a file pass. It rewrites PNG, JPEG, and WebP containers chunk by chunk, keeping only what the table admits, rewrites a GLB's JSON to drop `extras`, `asset.generator`, and unlisted extensions, and adds the mark. It uses the standard library only, and it never re-encodes pixels. The Author runs it in the studio, or the arrival check's message names it.

**Rationale.** FR-006 asks for an allowlist, not a denylist: "Anything else is refused". Parsing each container rather than searching for known tags means a field nobody thought of is refused too. The intent names the leak: "ComfyUI writes each prompt and workflow, input filenames included, into the PNGs it saves, and a GLB can carry the same in its extras". The mark is the one the clarification chose, and an XMP packet is where IPTC's digital source type is carried.

**Alternatives.** exiftool in the repository's toolchain: it reads more formats, but it's a large Perl program in a human-only gate, and its "no tags found" is a denylist's answer. Pillow: it re-encodes, which changes the pixels and the hash, and it isn't in the pinned tools.

### R-04: The record (FR-010, FR-011, FR-012)

**Decision.** One `records.json` per directory, a JSON object with a `schema` version and one entry per file, whose fields are in [contracts/asset-record.md](contracts/asset-record.md). The arrival check validates each entry against that contract with the standard library: the file's SHA-256, its kind, its source by opaque ID, its steps with every model (repository, revision, license and its version, role), hand tools, hosted services, each step's model-refresh date, the media license, and the approval's reference for likeness and room files. `scripts/assets/credits.py` renders `assets/CREDITS.md` and `docs/research/images/CREDITS.md` from the records, so a reader can see them in the repository (FR-033's repository half). The gate fails when the rendered files differ from the records.

**Rationale.** JSON keeps the check on the standard library: the gates already run that way, under `PY_HOST`. One file per directory makes FR-008 a set difference.

**Alternatives.** YAML: friendlier by hand, but the studio writes these records, and parsing YAML in a human-only gate means trusting a third-party parser.

### R-05: The license allowlist and the approvals, read from main (FR-005, FR-013, FR-016)

**Decision.**
- **`assets/policy/licenses.json`:** one entry per license and version: its name, version or date, a link to its text, and the Author's reading of FR-013's three terms (display on a public site that promotes the studio; everywhere; public distribution), each `yes` or `no`. A license is allowed only when all three read `yes`. It starts with no entries; the Author adds each, as the studio adopts a model.
- **`assets/policy/approvals.json`:** one entry per approved file: its SHA-256, its path when approved, its kind, the five confirmations FR-016 lists, the date, and the reason. Only the Author writes it.
- **The arrival check reads both from the main working tree,** the way `publish_check.py` reads the denylist from it (`tools/gates/publish_check.py`: "The denylist, in the main working tree"). A branch that edits either is refused, so an approval never travels with the file it approves. The Author approves on `main`, then merges the branch.
- **The guard patch** makes `assets/policy/**` human-only (`protected-paths.sh`, and `Edit(...)` and `denyWrite` in `.claude/settings.json`), with matrix rows (FR-005).

**Rationale.** FR-005 makes both the Author's alone. Reading them from the branch would let a branch approve its own file; reading them from `main` makes the approval exist before the merge, which is what FR-016 means.

**Alternatives.** Signed approvals (a key only the Author holds): stronger against a compromised `main`, but `main` already changes only by the Author's merge, and a signing key is one more secret.

### R-06: Where the check runs (FR-004)

**Decision.** One program, `tools/gates/arrival_check.py` (human-only), in four places:
- **Before each commit:** `.claude/git-hooks/pre-commit` runs the main working tree's copy over the staged files, after gitleaks, and refuses the commit on any finding. It reads its own code, the policy, and the caps from the main working tree, never from the branch.
- **In `make check`:** a new gate, `arrival`, over every commit on the branch since `main`, each commit's added and changed files checked as that commit had them.
- **In the Author's gate,** `tools/gates/gate`: the same, as a step.
- **In `make publish-check`:** over every commit in the history, before the first push (spec 000's FR-042).

Its findings name the file, the commit, and the rule's ID ([contracts/arrival-check.md](contracts/arrival-check.md)), never the matched bytes.

**Rationale.** FR-004 asks for all three moments. Checking each commit, not only the branch's tip, catches what a later commit hid: "a file scrubbed in a later commit of the same branch is still in the history".

**Alternatives.** The tip only: fast, and it misses exactly the case the spec names.

### R-07: The studio's folders, denied before the first photo (FR-003)

**Decision.** The guard patch adds `denyRead` and `Read(...)` denies, with matrix rows, for the studio's folders on the Author's machine: the photos, the unstripped outputs, the workflows, and the evaluation's blinding key. The paths aren't knowable from here: the patch carries them as `<STUDIO_…>` placeholders, and the Author writes the real paths in before applying it. `git apply --check` succeeds either way; the matrix rows fail until the placeholders are filled, so the patch can't be applied half-done unnoticed. Spec 000's deny on `/mnt/c/Users` already covers a studio under the Windows user's folders.

**Rationale.** FR-003: "WHEN the studio's first photo or output is staged on the machine agent sessions run on, THE SANDBOX SHALL already deny agent sessions reads of the studio's folders". The studio may already hold photos, so this patch comes first, before any other group.

**Alternatives.** Denying all of `/mnt/c` and `/mnt/d`: no paths to ask for, but spec 000's preflight reads the Windows drive's free space there, and the sandbox's view of a denied mount is a placeholder.

### R-08: Sizes, budgets, and the history cap (FR-019, FR-020, FR-038)

**Decision.**
- **Per file,** the check reports its size, its gzip size at level 9 as the transfer estimate (the edge compresses; gzip bounds what it sends), and, for GLB, its vertex and triangle counts and its textures' memory (width × height × 4 × 4/3 for mipmaps).
- **The caps** live in `assets/policy/caps.json` (human-only): ADR 0010's per-asset caps once it's accepted, and SC-006's first-visit budgets, 10 MB in Phase 2 and 25 MB with the room. Until ADR 0010 is accepted, the file says so and the check refuses every avatar and animation (FR-018).
- **The first visit,** per SC-006: the twin, its animations, and the largest visitor avatar with its animations, summed by transfer size.
- **The history total:** the sum of the distinct blobs ever stored under `assets/` and the published-image folders (`git rev-list --objects --all`, then `git cat-file --batch-check`), refused over 500 MB (FR-020).
- **The note:** each merge-request note that brings assets pastes the check's size table (FR-038).

**Rationale.** Each figure comes from the file or the history, so the check needs no browser. The phone's frame rate is measured on the phone (SC-006), in the waiting group.

### R-09: The arms B and D caption (FR-036)

**Decision.** Each record entry for a published image carries its `arm`. The check refuses a record that names an arm-B or arm-D model without the studio's commercial license (FR-014) in an asset directory. In a published-image folder it allows them, and requires the note that shows the image to carry the caption "Evaluation output; not used in the site's assets." on the line after the image's link: the check reads the note's Markdown for each such image.

**Rationale.** The spec has the caption checked at review; a check on the note's text makes it a machine rule, which costs one parser of Markdown links.

## The site, the dashboard, and the runbooks

### R-10: Loading the assets in the browser (FR-021 to FR-033, FR-039) — waits for specs 001 and 002

**Decision.** The design, implemented once spec 001's site (its task group 6) and spec 002's room exist:
- **A manifest,** `assets.json`, built at release from the records: each served file's content-derived name (`<stem>.<first 16 hex of SHA-256>.<ext>`), its size, its SHA-256 for the browser's integrity check, its still or preview image, and its kind (FR-029).
- **A capability check before any 3D download:** WebGL2, and a device-memory and GPU-tier floor that ADR 0010 sets. A device below it goes straight to the 2D mode (FR-023).
- **Loading:** the twin's still image first, then its GLB, with one retry; on failure, the still within 2 seconds (FR-021). The visitor avatar's preview first, then its GLB (FR-022, FR-028).
- **The frame rate,** sampled each second: below 24 fps for 5 seconds steps down to the reduced tier, then to 2D; a visible control offers 2D at any time (FR-024).
- **The decoders,** if ADR 0010 brings any, are served from the site's own origin (FR-030).
- **Asset events** (FR-039): batched, at most one request per 10 seconds, to `POST /api/events` on spec 001's relay, carrying only the asset's ID, the outcome, a duration bucket, the bytes, and the mode, with no identifier. The relay counts them as metrics and stores nothing else. Disclosure row V6 comes with the route (FR-040b).
- **The credits link** on each shown asset reaches its record's rendered page in two clicks (FR-033).

The contract is [contracts/site-loading.md](contracts/site-loading.md) and [contracts/asset-events.md](contracts/asset-events.md). Until it's built, the waiting groups' tests run in a harness page served from the agents' engine.

**Rationale.** Principle I: the degraded mode is part of the design from the start, even where its code waits.

**Alternatives.** A third-party 3D viewer: it would load its decoders from its own host, against FR-030.

### R-11: The visible disclosure line (FR-032, FR-034)

**Decision.** The draft line, shown with the twin in every mode: "This avatar is a stylized likeness of the Author, made with AI from the Author's photos and published by the Author's choice." The site shows the Author's first name in place of "the Author" only from a filled `facts/` slot. The Author approves the line's wording in the same approval entry as the twin's first file; until then, the arrival check refuses the twin.

**Rationale.** FR-034 as clarified: "in wording the Author approves before the first likeness file is published". Tying the wording's approval to the first likeness file makes the order mechanical.

### R-12: ADR 0010, drafted here for the Author to accept (FR-018)

**Decision.** This spec's second task group drafts ADR 0010 as **proposed**, from intent 003's survey: glTF binary, a Mixamo-compatible humanoid skeleton for the twin and the two human visitor avatars, named rigs for the dog and the dinosaur, ARKit's 52 blendshapes and the 15 Oculus visemes for the twin only, per-asset caps, the reference phone, and the capability floor. The Author accepts it, or changes it, before any avatar arrives; FR-018 keeps refusing them until then.

**Rationale.** The spec's Assumptions: "ADR 0010 is written and accepted before the studio builds its workflow, so nothing is made twice". A draft from the survey gives the Author something to accept rather than a blank.

**Alternatives.** Leaving ADR 0010 to the rig's spec: no avatar could arrive before that spec, and the studio would build its workflow without a target.

### R-13: The reference phone and the mobile profile (SC-005, SC-006)

**Decision.** The reference phone is a 2023 mid-range Android phone, a Samsung Galaxy A54, or the closest one the Author has, recorded by model in each measurement. The mobile profile is 9 Mbps down and a 150 ms round trip, spec 002's 4G assumption, so both specs measure against one profile. At that rate SC-006's 10 MB takes about 9 seconds before latency, inside SC-005's 15.

**Rationale.** The spec asks the plan to name both. A single profile across the room's and the assets' specs keeps their budgets comparable.

### R-14: The studio's GPU window (FR-035, SC-011)

**Decision.**
- **`make studio-window ENV=prod STATE=start|end REASON="…"`** (the Author) stops prod's model server at `start`, after recording the window, and at `end` restarts prod at its run file's commit (`make up ENV=prod REF=<H4_REF>`), then checks that hello answers locally.
- **The record:** a new admin endpoint on the gateway, `POST /admin/studio-window`, with the operator's token, writes the audit row and sets the gauge `h4_studio_window` (1 while open). It changes no budget or ceiling.
- **The dashboard:** an annotation layer from the gauge, and a panel of the fallback spend inside each window.
- **The runbook,** `docs/runbooks/studio-gpu-window.md`, generalizes the evaluation note's step 3.

**Rationale.** FR-035 and SC-011. Spec 000's operator interface is where a human-confirmed state change already lives, with its audit; the window is one more.

**Alternatives.** A Grafana annotation written straight to Grafana's API: it needs Grafana's admin credentials in the Author's terminal, and it bypasses the audit.

### R-15: The ADRs

**Decision.** In the plan's approval commit, from these entries:
- **ADR 0030:** the media license (all rights reserved, viewing and linking welcome) and the AI-likeness mark (R-03, R-11).
- **ADR 0031:** assets in plain git under fixed roots, served under content-derived names; no LFS or object store; a 500 MB history cap (R-01, R-08).
- **ADR 0032:** ADR 0013's pre-publication cleanup extended to an asset that locates the Author or breaks a license (FR-041).
- **ADR 0010 (reserved):** drafted, proposed, in task group 2 (R-12).

ADR 0023 is the Claude Code pin-rule proposal, and spec 001's draft plan names 0024 to 0029, so this spec's start at 0030.

## Rejected for now, revisit later

- **Git LFS or an object store** for the assets: the confirmation chose plain git, with a cap.
- **KTX2 textures and compressed geometry:** for ADR 0010 to bring, with the check's readers.
- **A browser test lab** of real devices: the reference phone is measured by hand, by the Author.
