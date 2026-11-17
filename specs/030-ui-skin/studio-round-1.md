# Studio round 1: the interface's buttons (`ui-buttons`)

Spec 030's group D (spec.md FR-019 to FR-023; plan.md §7, R-D1 to R-D3), shaped as spec 021's round 2 ran ([`specs/021-dinosaur-modeled-and-brought-in/studio-round-2.md`](../021-dinosaur-modeled-and-brought-in/studio-round-2.md)): a brief, the studio task, the judge, the record, then his intake. Written by `spec-030` (spec-writer, night of 2026-11-17), documents only.

**Status: the brief is at `/srv/studio/briefs/ui-buttons/1.json` (R-1, 2026-11-17: SHA-256 `98eb47dd…1c4267`, `cmp` 0, `line.py brief` pass; "The record" below).** The spec-writer's session couldn't reach `/srv/studio/`; R-1 (`brief-ui-r1`) wrote it there byte for byte and ran `line.py brief` on it. R-3 (`judge-ui-r1`) needs T-DJ's commits (the still set's checks, plan §R-D1) on the branch it judges from: without them, `line.py` judges only the bytes, the tools, the record, and the arrival check, and the round's other checks aren't made. R-3 must not `--record` from a branch without T-DJ.

His words, which this round answers: "Maybe use the studio pipeline to create the buttons for UI?" and, to the page's Q1, "Let's use studio image skins now" (spec.md, "Source").

## The set, against main's caps

- Kind `still` (spec.md Q12, provisional). Main's `assets/policy/caps.json` (equal on this branch and `main`, `git diff main HEAD -- assets/policy` empty): `"still": {"bytes": 300000}`. The brief's limits: `bytes` 48,000 per file and `texture_px` 512; eleven files, at most 96,000 bytes together (the stylesheet's inlined budget, FR-020; held by T-DS's build, since `line.py` has no total limit). Each file sits well under main's cap: **the set fits; no `assets/policy/` patch is needed.** If he takes Q12's option B (a `ui` kind), the caps change is his patch and this brief's `kind` changes with it.
- Tools (FR-021, Q11): `blender`, `numpy-bundled-with-blender`, `claude-opus-5.5`, each on main's `studio-tools.json` with `outputs_ship: true` (`blender` 5.2.3 gpl-3.0-or-later; `numpy-bundled-with-blender` 2.3.4 bsd-3-clause; `claude-opus-5.5` claude-opus-5-5 anthropic-consumer-terms). No ComfyUI, no image model: the set is geometry rendered in Blender.
- `line.py`'s brief shape: the ten fields, `limits` keys from `LIMIT_KEYS` (`bytes`, `texture_px`), `references` empty (his reference image isn't in the repository and never goes to the studio), `findings` empty (round 1).
- What the judge checks today on a PNG (`line.py:1052`): its bytes only. The still set's checks (pixel size, alpha, a transparent ring, `slices.json`, the states' distinctness, the label's contrast) are T-DJ's (plan §R-D1), test-first in `scripts/studio/test_line.py`.

## The checks the judge makes (with T-DJ)

| Check | Limit | By |
|---|---|---|
| Each file's bytes | 48,000 (the brief's) | `line.py`, today |
| Every tool in the brief and on main's list, `outputs_ship: true`; none refused by name | main's `studio-tools.json` | `line.py`, today |
| The record's shape, directory `assets/ui/buttons`, every step's models and tools in the brief | data-model.md; the arrival check | `line.py` and main's `arrival_check.py`, today |
| Rules A, M (only admitted chunks; one `iTXt` XMP packet with the IPTC digital source type), B, R, N, L, P, F (`still`, 300,000) | main's policy | main's `arrival_check.py`, today |
| Each PNG's sides | ≤ 512 px (`texture_px`) | T-DJ |
| An alpha channel (colour type 6 or 4, or `tRNS`); 8-bit | RGBA | T-DJ |
| The outermost one-pixel ring | alpha 0 everywhere | T-DJ |
| `slices.json` present, naming every file and no other, insets whole numbers ≥ 1, `left + right < width`, `top + bottom < height` | the set's shape | T-DJ |
| Each two states of a variant, the centres' alpha-weighted mean colours | ΔE76 ≥ 15 | T-DJ |
| The variant's label colour against every centre pixel with alpha ≥ 0.5, composited over white and over black | ≥ 4.5:1 | T-DJ |

## The brief, verbatim

R-1 writes this to `/srv/studio/briefs/ui-buttons/1.json`, byte for byte, and pastes its SHA-256 here.

```json
{
  "schema": 1,
  "asset": "ui-buttons",
  "kind": "still",
  "spec": "030-ui-skin",
  "round": 1,
  "limits": {
    "bytes": 48000,
    "texture_px": 512
  },
  "tools": [
    "blender",
    "numpy-bundled-with-blender",
    "claude-opus-5.5"
  ],
  "references": [],
  "findings": [],
  "notes": "ROUND 1 OF THE INTERFACE'S BUTTONS (spec 030-ui-skin, group D; its spec.md FR-019 to FR-023 and studio-round-1.md). Written by the night-shift spec-writer spec-030 on 2026-11-17. The studio has no repository: everything it needs is here.\n\nTHE AUTHOR'S WORDS. \"Maybe use the studio pipeline to create the buttons for UI?\" and then \"Let's use studio image skins now\".\n\nWHAT IT IS. Eleven PNG images that the website draws as 9-slice button and panel skins (CSS border-image): ten button faces (two colour variants, five states each) and one panel frame. The website writes each button's label as real text over the image, so NO IMAGE HOLDS ANY TEXT, LETTER, NUMBER, GLYPH, ICON, LOGO, OR MARK.\n\nTHE LOOK, IN WORDS ONLY. A sci-fi game menu's buttons: a dark brushed-metal frame; chamfered (45-degree cut) corners; a bevel (a lighter top-left edge and a darker bottom-right edge); a thin inner highlight line just inside the frame; a flat-ish face. Variant 'primary' has a yellow face (near #f2c230) with a lighter yellow rim; variant 'secondary' has a dark teal face (near #16323c) with a cyan rim (near #46d7f0). The 'selected' state adds a soft glow around the frame in the variant's rim colour (yellow #ffd23f for primary, cyan #46d7f0 for secondary). No bolts, no screws, no rivets, no scratches that read as marks. There is no reference image: do not look for one, do not search for one, and do not draw any existing game's, film's, or franchise's interface. The look is this paragraph alone.\n\nTHE FILES (each a PNG, 8-bit RGBA, sRGB, transparent background):\n- btn-primary-normal.png, btn-primary-hover.png, btn-primary-pressed.png, btn-primary-disabled.png, btn-primary-selected.png\n- btn-secondary-normal.png, btn-secondary-hover.png, btn-secondary-pressed.png, btn-secondary-disabled.png, btn-secondary-selected.png\n- panel-frame.png\nButtons: 192 by 96 px (twice the CSS size; the site draws them at half), the chamfer 16 px, the frame and bevel inside a 24 px margin, so the slice insets are 24 on every side (or the geometry's own numbers, written in slices.json); the glow, where there is one, lies inside the image, fading to alpha 0 before the outermost pixel. Panel frame: 256 by 256 px, the same frame and chamfer in neutral dark metal (no yellow or cyan), its centre a flat dark glass at alpha about 0.3 (near rgb(16 20 26)), insets 48 on every side. In every file, the outermost one-pixel ring of the image is fully transparent (alpha 0), and the button faces' centres (inside the insets) are opaque (alpha 1).\n\nTHE STATES, AND HOW FAR APART. Every state is the same geometry with a different material, so the insets match across a variant. The judge measures each centre's mean colour in CIELAB; every two states of one variant must be at least 15 apart (Delta E 1976). Aim at these centre values (L*, C*, the variant's hue): secondary normal L 20 C 15; hover L 38 C 15 and a brighter inner highlight; pressed L 3 C 15 with the bevel inverted (dark top-left, light bottom-right); disabled L 28 C 0 (grey), rim dimmed, no glow; selected L 24 C 35 toward cyan, with the glow. Primary normal L 80 C 75; hover L 92 C 62; pressed L 62 C 70 with the bevel inverted; disabled L 60 C 10, no glow; selected L 88 C 95, with the glow. The labels the site will draw: #14171c on primary, #e6fbff on secondary; each must reach 4.5:1 contrast against every centre pixel (composited over white and over black), so keep the centres flat and opaque, with no bright speckle on secondary and no dark streak on primary.\n\nSLICES.JSON (hand back beside the files, NOT listed in candidate.json's files): {\"schema\": 1, \"files\": {\"<file name>\": {\"top\": n, \"right\": n, \"bottom\": n, \"left\": n}, ... one entry per PNG, all eleven}, \"labels\": {\"primary\": \"#14171c\", \"secondary\": \"#e6fbff\"}}, two-space indent, trailing newline.\n\nSTEPS. 1. The studio agent writes one Blender script (Python, in Blender 5.2.3, numpy bundled with Blender where it needs arrays) that builds the chamfered, bevelled plate as geometry from the numbers above, its materials per state, and an orthographic camera; renders each file with a transparent film (Cycles or EEVEE, its choice) at the sizes above; and writes slices.json from the geometry's numbers. 2. The same script strips each PNG to the chunks IHDR, sRGB, IDAT, IEND, then adds the one mark below. 3. The record. No other tool, model, node, or download: if any step needs one, STOP the round and hand back a note saying which and why; a new tool is the Author's to add. Never use Qwen-Image, FLUX.1 [dev], PuLID, TripoSR, GGUF, ComfyUI-Manager, or any node marked UNREVIEWED. ComfyUI isn't used in this round.\n\nTHE MARK. Each PNG carries exactly one iTXt chunk, keyword XML:com.adobe.xmp, holding an XMP packet whose only property is Iptc4xmpExt:DigitalSourceType = http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia (every step is the studio agent's script), as the arrival check's M rules admit; no EXIF, no other text chunk, no tIME, no path, no machine or user name.\n\nLICENSE.md. Hand back a LICENSE.md, a copy of the shipped assets', these five lines exactly, ending with a newline:\nCopyright (c) 2026 Hareet. All rights reserved.\n\nThe files in this directory are not covered by this repository's MIT license. You are welcome to view them and to link to them. Any other use needs the copyright holder's written permission.\n\nEach file's provenance is in records.json, and in CREDITS.md at the root of its tree.\n\nCANDIDATE (hand back to /srv/studio/handoff/ui-buttons/1/). candidate.json: {\"schema\": 1, \"asset\": \"ui-buttons\", \"round\": 1, \"files\": [the eleven PNG names], \"tools\": [{\"id\": \"blender\", \"version\": \"5.2.3\"}, {\"id\": \"numpy-bundled-with-blender\", \"version\": \"2.3.4\"}, {\"id\": \"claude-opus-5.5\", \"version\": \"claude-opus-5-5\"}], \"records\": \"records.json\"}, every listed file a regular file in that folder (no links); records.json, LICENSE.md, and slices.json beside them and never listed in files. The run's note goes in that folder as note.md (a later run writes note-2.md, and so on), never listed in files; a run that stops still writes its note there. Optional for the Author's look review: sheet.png, all ten buttons on a mid-grey ground with sample labels drawn ON THE SHEET ONLY, left in the folder but NOT listed in files and NOT in the record. The files arrive in the repository at assets/ui/buttons/ (the record's directory), by the Author's intake, after his look approval; the studio writes nothing in the repository.\n\nRECORD FORMAT (records.json; spec 003's contracts/asset-record.md and the arrival check, as assets/visitors/man/records.json is). Top level, in this order: \"schema\": 1, \"directory\": \"assets/ui/buttons\", \"license\": \"all-rights-reserved-2026\", \"entries\" (sorted by file; two-space indent; trailing newline; no other key at any level). One entry per PNG (eleven), keys in this order: \"file\"; \"sha256\" (64 lower-case hex of the file's bytes); \"kind\": \"still\"; \"made\" (YYYY-MM-DD); \"source\": {\"type\": \"design\", \"id\": \"D-0006\"} (this brief's written design; never a file name or path); \"likeness\": false; \"steps\"; \"media_license\": \"all-rights-reserved-2026\". Leave out \"approval\": the look approval is the Author's, after the round. Each entry's steps, each by \"model\": (1) {\"name\": \"the plate's geometry, materials, and camera built from the brief's numbers, and the state's image rendered with a transparent background, by the studio's agent's script run in Blender\"}, (2) {\"name\": \"the image stripped to its pixel chunks and marked, by the studio's agent's script run in Blender\"}. Each step: \"name\", \"by\": \"model\", \"models\": [{\"name\": \"Claude Opus 5.5\", \"repository\": \"anthropic/claude-opus-5-5\", \"revision\": \"claude-opus-5-5\", \"role\": \"primary\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\"}], \"tools\": [{\"name\": \"Blender\", \"version\": \"5.2.3\", \"license\": \"gpl-3.0-or-later\", \"license_version\": \"3\"}, {\"name\": \"numpy, bundled with Blender\", \"version\": \"2.3.4\", \"license\": \"bsd-3-clause\", \"license_version\": \"1\"}], \"models_checked\" (the date the models ran), \"workflow_sha256\" (64 hex of the script that ran), \"service\": {\"name\": \"Claude Code\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\", \"disclosure_row\": \"D4\"}. Every model and tool a step names must be in this brief's 'tools' (a name lower-cased, each run of other characters a hyphen, is its ID: \"Blender\" is blender, \"numpy, bundled with Blender\" is numpy-bundled-with-blender, \"Claude Opus 5.5\" is claude-opus-5.5).\n\nJUDGING. An implementer runs python3 -I -B scripts/studio/line.py candidate on the handoff folder against this brief (it also runs main's arrival check, and, from spec 030's T-DJ, the still set's checks: each PNG at most 512 px a side, RGBA, a transparent outermost ring, slices.json's shape and insets, every two states of a variant at least Delta E 15 apart, and the label colours at 4.5:1 over every centre pixel) and records the round. A pass goes to the Author's look judgement; only his word and his intake bring the set into the site. Three failed rounds put it on his decision page, and the site keeps its CSS skin."
}
```

## The check of the brief (this task, on a scratch folder)

`/srv/studio/` isn't reachable here, so the block above was extracted byte for byte to a scratch briefs folder (`<tmp>/briefs/ui-buttons/1.json`) with an empty scratch handoff folder, and `line.py brief` read main's policy from `refs/heads/main` (`f6baef8c`) in this repository:

```
$ python3 -I -B scripts/studio/line.py brief <tmp>/briefs/ui-buttons/1.json --repo . --handoff <tmp>/handoff; echo "exit $?"
line: pass
exit 0
```

The extracted file's SHA-256: `98eb47ddbcf7ac6193e3fafa6420b33f6f3bb3d8e8e3ff1e1ceabc169f1c4267` (after the analysis's fix A-1, which moved three states' target values so every two states sit at least ΔE 17 apart by their targets; the first draft's, `74e309f2…87049`, passed `line.py brief` too, but its primary normal and hover targets were only ΔE 11 apart, under the judge's own 15). R-1's file must have the same hash (it is the same bytes); R-1 runs the check again on the real folder, where the rounds' order is checked against the real handoff.

## The round's tasks

| Task | Role | Needs | Does |
|---|---|---|---|
| R-1 `brief-ui-r1` | implementer | this file | writes the brief to `/srv/studio/briefs/ui-buttons/1.json` (`cmp` against the block above returns 0), runs `line.py brief` on it, pastes the SHA-256 and the output here; changes nothing else |
| R-2 `studio-ui-r1` | studio | R-1; his machine's studio | runs the brief, hands back to `/srv/studio/handoff/ui-buttons/1/` |
| R-3 `judge-ui-r1` | implementer | R-2's handoff; a branch holding T-DJ | runs `line.py candidate … --brief …` dry, sorts its findings (candidate, brief, or `line.py`), then `--record` once; pastes the whole output, every file's SHA-256 from `records.json` and from the bytes, and `slices.json`; on a pass, writes his intake patch (plan §R-D3) and T-DS's data edit (the hashes and insets into `metal-image`) |
| R-4 his | the Author | R-3's pass | his look; his intake (`docs/merge-requests/human-patches/030.md`, on 021's route; plan §R-D3) |

## The record (R-3 fills this)

- Brief SHA-256: `98eb47ddbcf7ac6193e3fafa6420b33f6f3bb3d8e8e3ff1e1ceabc169f1c4267` (R-1, `brief-ui-r1`, 2026-11-17, from `spec-030`'s tip `7cdc31d2`). Before placing it, none of `/srv/studio/briefs/ui-buttons/1.json`, `1.result.json`, or `/srv/studio/handoff/ui-buttons/1/` existed. The block above, extracted byte for byte to `/tmp/brief-ui-r1/1.json` (9,685 bytes), then copied to `/srv/studio/briefs/ui-buttons/1.json`:

  ```
  $ sha256sum /srv/studio/briefs/ui-buttons/1.json
  98eb47ddbcf7ac6193e3fafa6420b33f6f3bb3d8e8e3ff1e1ceabc169f1c4267  /srv/studio/briefs/ui-buttons/1.json
  $ cmp /tmp/brief-ui-r1/1.json /srv/studio/briefs/ui-buttons/1.json; echo "cmp exit $?"
  cmp exit 0
  $ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/ui-buttons/1.json; echo "exit $?"
  line: pass
  exit 0
  ```

  Main's policy read from `refs/heads/main` (`f6baef8c`); the real handoff folder (`/srv/studio/handoff/`, no `ui-buttons/` in it). R-1 wrote nothing else under `/srv/studio/`.
- `line.py candidate` output, dry and recorded (R-3, `judge-ui-r1`, 2026-11-17, from `impl-030dj`'s tip `c77eb4ce`, T-DJ02, which holds the still set's checks; the brief's SHA-256 checked equal to R-1's first; the eleven names checked by hand, Q69, in [judge-r1.md](judge-r1.md)). **Round 1 passes.** The dry run:

  ```
  $ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/ui-buttons/1 --brief /srv/studio/briefs/ui-buttons/1.json; echo "exit $?"
  arrival-check: main's copy, at f6baef8ce027, on a scratch copy under assets/ui/buttons/
  file                                          bytes     gzip      vertices  triangles  texture
  assets/ui/buttons/btn-primary-disabled.png    3517      3466      -         -          -
  assets/ui/buttons/btn-primary-hover.png       3761      3712      -         -          -
  assets/ui/buttons/btn-primary-normal.png      3641      3587      -         -          -
  assets/ui/buttons/btn-primary-pressed.png     3621      3571      -         -          -
  assets/ui/buttons/btn-primary-selected.png    4224      4184      -         -          -
  assets/ui/buttons/btn-secondary-disabled.png  3344      3284      -         -          -
  assets/ui/buttons/btn-secondary-hover.png     3797      3747      -         -          -
  assets/ui/buttons/btn-secondary-normal.png    3883      3823      -         -          -
  assets/ui/buttons/btn-secondary-pressed.png   3601      3544      -         -          -
  assets/ui/buttons/btn-secondary-selected.png  4174      4131      -         -          -
  assets/ui/buttons/panel-frame.png             6614      6485      -         -          -
  arrival-check: 0 findings in 13 files
  line: pass; round 1
  exit 0
  ```

  Recorded, once (its output equal to the dry run's, `diff` empty):

  ```
  $ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/ui-buttons/1 --brief /srv/studio/briefs/ui-buttons/1.json --record; echo "exit $?"
  arrival-check: main's copy, at f6baef8ce027, on a scratch copy under assets/ui/buttons/
  file                                          bytes     gzip      vertices  triangles  texture
  assets/ui/buttons/btn-primary-disabled.png    3517      3466      -         -          -
  assets/ui/buttons/btn-primary-hover.png       3761      3712      -         -          -
  assets/ui/buttons/btn-primary-normal.png      3641      3587      -         -          -
  assets/ui/buttons/btn-primary-pressed.png     3621      3571      -         -          -
  assets/ui/buttons/btn-primary-selected.png    4224      4184      -         -          -
  assets/ui/buttons/btn-secondary-disabled.png  3344      3284      -         -          -
  assets/ui/buttons/btn-secondary-hover.png     3797      3747      -         -          -
  assets/ui/buttons/btn-secondary-normal.png    3883      3823      -         -          -
  assets/ui/buttons/btn-secondary-pressed.png   3601      3544      -         -          -
  assets/ui/buttons/btn-secondary-selected.png  4174      4131      -         -          -
  assets/ui/buttons/panel-frame.png             6614      6485      -         -          -
  arrival-check: 0 findings in 13 files
  line: pass; round 1
  exit 0
  ```

  A pass prints no line for the still set's checks; their measures, from `line.py`'s own functions, are in [judge-r1.md](judge-r1.md): every file 8-bit RGBA, non-interlaced, 192 × 96 (buttons) or 256 × 256 (frame), ring alpha 0; lowest ΔE76 between two states 17.07 (secondary disabled/normal; primary's lowest 19.82, normal/pressed); lowest label ratio 5.69:1 (`#14171c` on primary disabled).
- The result: `/srv/studio/briefs/ui-buttons/1.result.json`, its SHA-256: `703278d72786a8788d763ee9745b726606c24760513146f648f6c8175bf531a3`

  ```
  {
    "schema": 1,
    "asset": "ui-buttons",
    "round": 1,
    "result": "pass",
    "findings": []
  }
  ```
- The eleven files' SHA-256s (from `records.json`, and from the bytes, which must agree): all eleven agree.

  | File | `records.json` | The bytes | Agree |
  |---|---|---|---|
  | `btn-primary-disabled.png` | `fe4da5713f32ea8b0f08719161d94b74eea224c8e661e1ba2c0dbcc51fc2d626` | `fe4da5713f32ea8b0f08719161d94b74eea224c8e661e1ba2c0dbcc51fc2d626` | yes |
  | `btn-primary-hover.png` | `ce93cdc64bf4dcdb6dd63b325afe25b5bd32e72601aa817610eea7395ff6c43f` | `ce93cdc64bf4dcdb6dd63b325afe25b5bd32e72601aa817610eea7395ff6c43f` | yes |
  | `btn-primary-normal.png` | `17b6faa32027e312d59d546c8764e1de519a74a708138238eee3373c683147c3` | `17b6faa32027e312d59d546c8764e1de519a74a708138238eee3373c683147c3` | yes |
  | `btn-primary-pressed.png` | `0e831b953301bad2c5244ee27f2c0221db3281d42ecbf2606780abae5f5c9da5` | `0e831b953301bad2c5244ee27f2c0221db3281d42ecbf2606780abae5f5c9da5` | yes |
  | `btn-primary-selected.png` | `5062c8adb92a204943c291baabdd5637a102bdb4bb294fc599ce695bbaf89cc9` | `5062c8adb92a204943c291baabdd5637a102bdb4bb294fc599ce695bbaf89cc9` | yes |
  | `btn-secondary-disabled.png` | `30fd1dcfd3fe9bab75280a8058c31395bb798dce944163bfe592aa36d8929d90` | `30fd1dcfd3fe9bab75280a8058c31395bb798dce944163bfe592aa36d8929d90` | yes |
  | `btn-secondary-hover.png` | `30c1e35db047f465fdbcdeae35650023c7c6d18c7f6afb7471e4dc043ca041bf` | `30c1e35db047f465fdbcdeae35650023c7c6d18c7f6afb7471e4dc043ca041bf` | yes |
  | `btn-secondary-normal.png` | `1d98c57c0782e0af6c4949b4e0a6e08688dc2279b94600acb623610292f48fdd` | `1d98c57c0782e0af6c4949b4e0a6e08688dc2279b94600acb623610292f48fdd` | yes |
  | `btn-secondary-pressed.png` | `1b5af9a30d13ec8c7eee02690198b4da63dc4bc36b7bf76628e9b54f32efd5c1` | `1b5af9a30d13ec8c7eee02690198b4da63dc4bc36b7bf76628e9b54f32efd5c1` | yes |
  | `btn-secondary-selected.png` | `08e54a06ef44eaf56b254a9dfeded13ae8752fbc5b672628a58cc34f47199dff` | `08e54a06ef44eaf56b254a9dfeded13ae8752fbc5b672628a58cc34f47199dff` | yes |
  | `panel-frame.png` | `dbf6bd7caf6b6f43a6de90238c165646a52d69255961f8fd00ff73b52cfef34d` | `dbf6bd7caf6b6f43a6de90238c165646a52d69255961f8fd00ff73b52cfef34d` | yes |
- `slices.json`, pasted (SHA-256 `a7dcbaf09b29f43d5502330a4858e01166256deaa638d09198a91831856af872`): every button 24 on each side, the frame 48, the labels the brief's.

  ```json
  {
    "schema": 1,
    "files": {
      "btn-primary-disabled.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "btn-primary-hover.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "btn-primary-normal.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "btn-primary-pressed.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "btn-primary-selected.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "btn-secondary-disabled.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "btn-secondary-hover.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "btn-secondary-normal.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "btn-secondary-pressed.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "btn-secondary-selected.png": {
        "top": 24,
        "right": 24,
        "bottom": 24,
        "left": 24
      },
      "panel-frame.png": {
        "top": 48,
        "right": 48,
        "bottom": 48,
        "left": 48
      }
    },
    "labels": {
      "primary": "#14171c",
      "secondary": "#e6fbff"
    }
  }
  ```

## His intake: what it needs (plan §R-D3)

His patch, never an agent's write: the eleven PNGs, `records.json`, and `LICENSE.md` into `assets/ui/buttons/`; `assets/CREDITS.md`'s section by `scripts/assets/credits.py`; `tools/gates/arrival_check.py --staged` clean (rules A, M, B, R, N, L, P, F; P1 asks no approval of a file outside the room and the twin, not a likeness, not from a photo, spec 004's Amendment C1; no `assets/policy/approvals.json` entry); his look approval before it, in the stack's note. The skin's data (`content/ui-skins.yaml`'s `metal-image`, T-DS) already names the files with their recorded hashes and insets, so once the files land the build draws them; until then, and if any hash differs, it falls back to `metal` and says why.
