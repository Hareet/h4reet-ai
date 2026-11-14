# The dog's studio round: the brief

Spec: [020, the dog modeled and brought in](../../specs/020-dog-modeled-and-brought-in/spec.md), plan §5. Written by the night-shift implementer (task impl-020, T011), 2026-11-14. This is the round's brief in prose, for the Author and the studio task. The studio reads its machine brief, `/srv/studio/briefs/dog/<round>.json`, which `scripts/studio/line.py brief` checks. Round 1's JSON and its check are recorded in `specs/020-dog-modeled-and-brought-in/studio-round-1.md`, on its own branch (`night/brief-dog-r1/brief-dog-r1`).

His order, in his words (2026-11-13): "provide you photos of my dog to model and it's okay that we use the likeness of my dog."

## Inputs

- **His concept image, handed back.** The Author makes it from his dog's photos (step 1) and reviews it (step 2), inside the photos folder, as `docs/studio/photo-guide.md` has it (spec Q2, option A). He then moves the reviewed frame into the studio inbox. The studio agent starts at step 3 from that frame.
- **No photo.** No photo, crop, mask, or path to one is in this repository, in a brief's `references`, or in any agent's context (spec FR-011; the disclosure's D4). This document names no photo file.
- The avatar table's height, `AVATAR_SHAPES.dog` (0.62 m, spec Q5), which the room scales the model to. The model's own units don't matter. Its proportions do.

## Outputs

To the studio's hand-off folder, `/srv/studio/handoff/dog/<round>/`, for his intake into `assets/visitors/dog/`:

| File | Kind | What |
|---|---|---|
| `dog.glb` | `avatar` | The model: stylized, textured, rigged, four-legged, standing with its head level (FR-012) |
| `dog-idle.glb` | `animation` | `idle`, a loop, root in place |
| `dog-walk.glb` | `animation` | `walk`, a four-legged gait, a loop, root in place (FR-005), so the room's walking pose moves the figure |
| `dog-run.glb` | `animation` | `run`, a faster four-legged gait, a loop, root in place, for spec 025's room dog figure; the visitor's figure never plays it (FR-012, FR-017) |
| `records.json` | | Spec 003's asset record (FR-014): each file's SHA-256 and kind, `likeness: true`, `source.type: "photo"` with an opaque batch ID, each step with its model or `hand` and its tool and licence from the list, no `approval` |
| `LICENSE.md` | | As the man's and the woman's folders have it |

No other clip role: no `idle-holding` and no `take` (spec Q4, FR-008).

## Tools and models: main's list only

Only IDs on `assets/policy/studio-tools.json` (P-7) whose licence is reviewed and whose `outputs_ship` is `true` (spec FR-010). These are the tools and models the man's and the woman's records name. This is his P-7 answer: "It's the same license that we've used for all the other avatars adn motions, so copy it from there". As read at this branch's base:

| Step | IDs |
|---|---|
| 1. Concept (his) | `comfyui` 0.42.5, `flux.2-klein-4b-base`, `qwen3-4b-its-text-encoder`, `flux.2-vae` |
| 3. Mesh and base colour | `comfyui` 0.42.5, `pixal3d-int8`, `dinov3-vit-l-patch-16-with-naf`, `moge-2-vit-l-with-normals`, `trellis.2-shape-vae`, `trellis.2-texture-vae`, `birefnet` |
| 4. Rig, clips, export | `blender` 5.2.3, `gltf-exporter-bundled-with-blender` 5.2.41, `numpy-bundled-with-blender` |
| Records, scripts | `claude-opus-5.5` |

Not used: every entry that reads `UNREVIEWED` (`comfyui-manager`, `comfyui-flowty-triposr`, `comfyui-pulid-flux-ll`, `comfyui-gguf`, `qwen-image-2.1`, `flux-dev`). The duplicate IDs `comfyui-core` and `blender-5.2.3` aren't used either, so each tool has one name in the records.

## The model's rules

- **Shape (FR-012).** The rest pose stands level-headed. The room measures height from the rest pose's bounds, so a raised tail or head above the back would shrink the dog. Keep the tail under the top of the head. Lowest point at the feet. Facing glTF's +z.
- **Skeleton.** The clips target the model's own bone names. Round 1's brief sets `Hips`, `Spine`, `Neck`, `Head`, `Tail`, `FrontLeftLeg`, `FrontRightLeg`, `HindLeftLeg`, and `HindRightLeg`. No bone is named `LeftHand` or `RightHand` (the room reads those as hands; FR-008: the paper stays at the anchor).
- **Nothing that locates (FR-013).** No place, person, screen, logo, or text from a photo, and no photo metadata. `scripts/assets/scrub.py` strips each file before hand-off.
- **Caps.** Main's `assets/policy/caps.json`: `per_asset.avatar` 21,000,000 bytes, 180,000 triangles, 46,000,000 texture bytes; `per_asset.animation` 1,000,000 bytes. The compositor's RA4 and the arrival check hold the files to these caps. Aim well under them: the dog stands 0.62 m tall, and the first visit counts only the largest visitor character (RK5).

## What stops the round (FR-010)

- The listed tools can't make a likeness from his concept. The round stops and asks him, and it adds nothing. A new tool is his to add (patch 020, item 3).
- No reviewed concept in the inbox. Round 1 stopped here on 2026-11-14 (`/srv/studio/handoff/dog/1/note.md`: "stopped before step 3. No candidate."), with his step-1 command left in the studio's outputs.
- Any step that would read a photo.

## The hand-off and after

1. The studio writes the outputs to `/srv/studio/handoff/dog/<round>/`. A judge runs `line.py candidate`. Until his approval names the model's SHA-256, the arrival check's P1 line ("needs the Author's approval") is expected for a likeness, and it is the approval's turn, not a defect.
2. **His intake** (patch 020, item 1): a commit of `assets/visitors/dog/**`, his consent quoted in the intake note. The arrival check runs on it.
3. **His look.** He opens the model in a glTF viewer or Blender. The room's bundle leaves the dog out until step 4 (RA9). Lookdev's Avatars view was dropped this night (the stack's note, T009 and T010).
4. **His approval** (patch 020, item 2): an entry in `assets/policy/approvals.json` per file, all five confirms true, and for the model a `disclosure_line` in his words. RA9 then bundles the dog, and the room shows the line while the model shows.

Until step 4, every visitor who chooses the dog sees the flat cut-out. That's the stand-in, and the build passes with it.
