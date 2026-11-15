# Contract: the dinosaur's studio brief

The brief a studio task's round 1 writes to `/srv/studio/briefs/dinosaur/1.json`, in spec 017's schema (`specs/017-the-night-shift/data-model.md`, "Brief"; `scripts/studio/line.py`'s `BRIEF_KEYS`). Rounds 2 and 3 copy the failed round's findings verbatim. No studio work is done in this spec's session. The JSON block below is the contract: impl-021's T008 reads this first `json` block and runs `line.py brief` on it, so the contract and its test can't drift.

```json
{"schema": 1, "asset": "dinosaur", "kind": "avatar", "spec": "021-dinosaur-modeled-and-brought-in", "round": 1,
 "limits": {"bytes": 3000000, "triangles": 30000, "texture_bytes": 11184810, "texture_px": 1024,
            "skeleton": "dinosaur",
            "bones_required": ["Hips", "Spine", "Chest", "Neck", "Head", "Jaw", "Tail1", "Tail2", "Tail3", "Tail4",
                               "Arm.L", "Arm.R", "Leg.L", "Leg.R", "Shin.L", "Shin.R", "Foot.L", "Foot.R"],
            "clips": ["idle", "walk", "take"]},
 "tools": ["birefnet", "blender", "claude-opus-5.5", "comfyui", "dinov3-vit-l-patch-16-with-naf",
           "flux.2-klein-4b-base", "flux.2-vae", "gltf-exporter-bundled-with-blender", "moge-2-vit-l-with-normals",
           "numpy-bundled-with-blender", "pixal3d-int8", "qwen3-4b-its-text-encoder", "trellis.2-shape-vae",
           "trellis.2-texture-vae"],
 "references": [],
 "findings": [],
 "notes": "The visitor's dinosaur avatar (spec 021), from a new recorded prompt, no reference image. Originality: an original character; no film or franchise creature; no text, logo, or marks; no photo and no likeness. Art direction as ADR 0010 sets it: stylized illustrative realism, saturated light; intent 000's words: \"Inspired-by only — no Rockstar assets, logos, typefaces, or character likenesses; everything is original.\" Look: a friendly, upright-posed theropod, green near #4f8a3c. Shape: rest pose facing +z, feet on the floor, tail low behind (toward -z), head forward; scaled uniformly to 1.2 m high, the body with its tail at most 1.1 m long (z) and 1.1 m wide (x), with 5% slack; the room refuses a larger one (spec 021's RA11). Rig: the dinosaur rig, every bone of limits.bones_required by its exact name (a '<prefix>:' before it counts), no Mixamo name required; one skinned mesh or a few; no morph targets. Clips, each its own GLB, kind animation, at most 300,000 bytes, moving only the rig's bones: dinosaur-idle.glb (loops; a breath, a tail sway, a head turn; first frame the rest pose), dinosaur-walk.glb (loops, root in place; a biped's walk, the tail counter-swaying), dinosaur-take.glb (plays once; a head-dip toward the paper and back to the idle's pose). Files: dinosaur.glb (kind avatar), the three clips, records.json, LICENSE.md copied from the shipped avatars'. Records: likeness false, source a prompt, each step's models and tools named as the shipped woman's and man's records name them, every one on this brief's tools list; a tool the studio lacks goes on the decision page, never installed. The candidate is a candidate: the Author's look approval comes last."}
```

## Reading of the limits

- `bytes` 3,000,000 and `triangles` 30,000 are Q5's answer, under `main`'s `per_asset.avatar` (`assets/policy/caps.json`: `{"bytes": 21000000, "triangles": 180000, "texture_bytes": 46000000}`).
- `texture_bytes` 11,184,810 is two 1,024-pixel maps (a colour map and one more) at width × height × 4 × 4/3 each, 5,592,405 apiece; the room decodes at 1,024 a side (spec 009's FR-024); `main`'s cap is 46,000,000.
- Each clip at most 300,000 bytes is held by the notes and by the task that judges the candidate (the brief schema has no per-clip field); `main`'s `per_asset.animation` is `{"bytes": 1000000}`.
- `clips` lists all three: `line.py candidate` requires each listed clip, so the studio makes `take` too; the room needs only `idle` and `walk` (RA12) and plays the idle where `take` is missing (spec 009's FR-003).

## Reading of the tools (Q8; the page's Q73)

- `tools` are exactly the fourteen IDs of `main`'s `assets/policy/studio-tools.json` that the shipped `assets/visitors/{woman,man}/records.json` use, each `outputs_ship: true`. The records name them by name; the list maps each to one ID:

| In the shipped records | ID |
|---|---|
| tool `Blender` 5.2.3 | `blender` |
| tool `ComfyUI` 0.42.5 | `comfyui` |
| tool `glTF exporter, bundled with Blender` 5.2.41 | `gltf-exporter-bundled-with-blender` |
| tool `numpy, bundled with Blender` 2.3.4 | `numpy-bundled-with-blender` |
| model `FLUX.2 [klein] 4B base` 533c4cbc | `flux.2-klein-4b-base` |
| model `Qwen3-4B, its text encoder` 533c4cbc | `qwen3-4b-its-text-encoder` |
| model `FLUX.2 VAE` 533c4cbc | `flux.2-vae` |
| model `BiRefNet` e2bf8e44 | `birefnet` |
| model `MoGe-2 ViT-L with normals` 14849852 | `moge-2-vit-l-with-normals` |
| model `Pixal3D, int8` f37641be | `pixal3d-int8` |
| model `DINOv3 ViT-L, patch 16, with NAF` f37641be | `dinov3-vit-l-patch-16-with-naf` |
| model `TRELLIS.2 shape VAE` 430a9d09 | `trellis.2-shape-vae` |
| model `TRELLIS.2 texture VAE` 430a9d09 | `trellis.2-texture-vae` |
| model `Claude Opus 5.5` claude-opus-5-5 | `claude-opus-5.5` |

- Not named: `blender-5.2.3` and `comfyui-core` (the same programs under the list's other IDs, which the shipped records don't use), and every `outputs_ship: false` entry (`comfyui-manager`, `comfyui-flowty-triposr`, `comfyui-pulid-flux-ll`, `comfyui-gguf`, `qwen-image-2.1`, `flux-dev`).
- brief-dino-r1 reports that the round-1 brief at `/srv/studio/briefs/dinosaur/1.json` names these IDs and passes `line.py brief` (the page's Stacks). This session can't read `/srv/studio`; the round's judge compares the two, and a difference goes to the page.
- The studio uses the ones it needs; its record names each step's models and tools as the shipped records do.

## Reading of the notes

`notes` carries the prose constraints in full, since the studio has no repository: the originality limits (FR-007, Q4: no film or franchise creature; no text, logo, or marks; no photo or likeness), ADR 0010's art direction and intent 000's "Inspired-by only" in its words, the shape RA11 measures, the rig, the clips, the files, and the record. T008's test asserts `notes` holds "no film or franchise creature".

## Judgement

`line.py candidate --record` runs; a pass goes to the Author's look judgement (FR-015). Three failed rounds → the decision page.
