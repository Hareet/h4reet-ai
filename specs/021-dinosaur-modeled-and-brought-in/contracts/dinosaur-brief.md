# Contract: the dinosaur's studio brief

The brief a later studio task's round 1 writes to `/srv/studio/briefs/dinosaur/1.json`, in spec 017's schema (`specs/017-the-night-shift/data-model.md`, "Brief"). Round 2 and 3 copy the failed round's findings verbatim. No studio work is done in this spec's session.

```json
{"schema": 1, "asset": "dinosaur", "kind": "avatar", "spec": "021-dinosaur-modeled-and-brought-in", "round": 1,
 "limits": {"bytes": 3000000, "triangles": 30000, "texture_bytes": 11184810, "texture_px": 1024,
            "skeleton": "dinosaur",
            "bones_required": ["Hips", "Spine", "Chest", "Neck", "Head", "Jaw", "Tail1", "Tail2", "Tail3", "Tail4",
                               "Arm.L", "Arm.R", "Leg.L", "Leg.R", "Shin.L", "Shin.R", "Foot.L", "Foot.R"],
            "clips": ["idle", "walk", "take"]},
 "tools": ["blender-5.2.3", "comfyui-core", "flux.2-klein-4b-base", "qwen3-4b-its-text-encoder", "flux.2-vae",
           "birefnet", "moge-2-vit-l-with-normals", "pixal3d-int8", "trellis.2-shape-vae", "trellis.2-texture-vae",
           "gltf-exporter-bundled-with-blender", "numpy-bundled-with-blender"],
 "references": [],
 "findings": [],
 "notes": "…see below"}
```

Notes the brief carries, in the studio's words-for-the-job (the look is the Author's to judge, so the brief states the shape and leaves the rest to him):

- an original, friendly, upright-posed theropod; green near `#4f8a3c`; no film or franchise creature; no text, logo, or marks; stylized illustrative realism as ADR 0010 sets;
- rest pose facing +z, feet on the floor, tail low behind, head forward; once scaled to 1.2 m high the body is at most 1.1 m long and 1.1 m wide;
- the `dinosaur` rig of `dinosaur-rig.md`; clips `idle`, `walk`, `take`;
- records: `likeness: false`, source a prompt, each step's models and tools named by ID as on `main`'s list.

## Reading of the limits

- `texture_bytes` 11,184,810 is two 1,024-pixel maps (a colour map and one more) at width × height × 4 × 4/3 each, 5,592,405 apiece; the room decodes at 1,024 a side (spec 009's FR-024), and `main`'s cap is 33,554,432.
- `bytes` 3,000,000, 30,000 triangles are Q5's answer, under `main`'s caps; each clip at most 300,000 bytes is held by the task that judges the candidate (the brief schema has no per-clip field; `main`'s cap is 1,000,000).
- `tools` are every ID on `main`'s list (at 3c0e4cd0) with `outputs_ship: true` that the shipped avatars' records name or that serve the same step, never Qwen-Image-2.1, FLUX [dev], or an `UNREVIEWED` node. The studio uses the ones it needs; `line.py brief` checks each ID is on `main`'s list and ships. Which the shipped avatars' records used is read from `assets/visitors/{woman,man}/records.json` by the task that writes the brief, and the brief is cut to those if the list is wider than they are (his answer: "copy it from there").
- `claude-opus-5.5` is not listed: it isn't a model the studio's pipeline uses for geometry.

## Judgement

`line.py candidate --record` runs; a pass goes to the Author's look judgement (FR-015). Three failed rounds → the decision page.
