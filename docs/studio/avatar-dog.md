# The dog's studio round: the brief

Spec: [020, the dog modeled and brought in](../../specs/020-dog-modeled-and-brought-in/spec.md), plan §5. Written by the night-shift implementer (task impl-020, T011), 2026-11-14, and reworked by rework-020 the same day after the spec's rework (Q67 to Q70, Q78). This is the round's brief in prose, for the Author and the studio task. The studio reads its machine brief (data-model.md's brief for the asset `dog`), which `scripts/studio/line.py brief` checks. Round 1's brief and its check are recorded in `specs/020-dog-modeled-and-brought-in/studio-round-1.md`, on its own branch (`night/brief-dog-r1/brief-dog-r1`). That round stopped before the studio's first step, and this brief supersedes it: the next round's machine brief is written from this one, once its precondition below holds.

His order, in his words (2026-11-13): "provide you photos of my dog to model and it's okay that we use the likeness of my dog."

## Before the round is queued (his steps)

The round starts at plan §5's step 2. Two steps come first, and both are his. No Claude session reads a photo, the studio's included (spec FR-011; spec 003's FR-003; `docs/studio/photo-guide.md`).

0. **His photos, in the photos folder.** He moves them into the photos folder, as the photo guide sets it up, and says on the page whether any session has read them (patch 020, item 1).
1. **The concept image.** Inside the photos folder, with the photo guide's checklist ticked, he queues the concept from his photos, reviews it by hand, and puts only the reviewed concept image in the studio's inbox (patch 020, item 2). That image is data-flow row D4's "style frame", which the studio's session may receive.

The round is queued only once that reviewed concept image is in the studio's inbox.

## Inputs

- **His reviewed concept image, from the studio's inbox. Nothing else.** No photo, crop, mask, or path to one, and no folder that holds photos, is in this repository, in a brief, or in any agent's context (spec FR-011; the disclosure's D4). This document names none.
- The avatar table's height, `AVATAR_SHAPES.dog` (0.62 m, spec Q5), which the room scales the model to. The model's own units don't matter. Its proportions do.

## Outputs

To the studio's hand-off folder, `/srv/studio/handoff/dog/<round>/`, for his intake into `assets/visitors/dog/`:

| File | Kind | What |
|---|---|---|
| `dog.glb` | `avatar` | The model: stylized, textured, rigged, four-legged, standing with its head level (FR-012) |
| `dog-idle.glb` | `animation` | `idle`, a loop, root in place |
| `dog-walk.glb` | `animation` | `walk`, a four-legged gait, a loop, root in place (FR-005), so the room's walking pose moves the figure |
| `dog-run.glb` | `animation` | `run`, a faster four-legged gait, a loop, root in place, for spec 025's room dog figure; the visitor's figure never plays it (FR-012, FR-017) |
| `records.json` | | Spec 003's asset record (FR-014), below |
| `LICENSE.md` | | As the man's and the woman's folders have it |

No other clip role: no `idle-holding` and no `take` (spec Q4, FR-008).

**The records** (plan §4; Q78), each file's SHA-256 and kind, each step with its model or `hand` and its tool and licence from the list, and no `approval`:

- `dog.glb`: `likeness: true`, `source.type: "photo"` with an opaque batch ID, never a photo's name.
- `dog-idle.glb`, `dog-walk.glb`, `dog-run.glb`: `likeness: false`, made in Blender on the model's rig from no photo. Their `source.type` is `"asset"`, its `id` the opaque ID naming the model's entry.

Rendered into `assets/CREDITS.md`, the model reads "- A likeness of the Author's dog: yes", and each clip "- A likeness of the Author's dog: no" (`scripts/assets/credits.py`, T019).

## Tools and models: main's list only

Only IDs on `assets/policy/studio-tools.json` (P-7) whose licence is reviewed and whose `outputs_ship` is `true` (spec FR-010). These are the tools and models the man's and the woman's records name. This is his P-7 answer: "It's the same license that we've used for all the other avatars adn motions, so copy it from there". As read at this branch's base:

| Step (plan §5) | IDs |
|---|---|
| 1. Concept (his) | `comfyui` 0.42.5, `flux.2-klein-4b-base`, `qwen3-4b-its-text-encoder`, `flux.2-vae` |
| 2. Mesh and base colour | `comfyui` 0.42.5, `pixal3d-int8`, `dinov3-vit-l-patch-16-with-naf`, `moge-2-vit-l-with-normals`, `trellis.2-shape-vae`, `trellis.2-texture-vae`, `birefnet` |
| 3. Rig, clips, export | `blender` 5.2.3, `gltf-exporter-bundled-with-blender` 5.2.41, `numpy-bundled-with-blender` |
| 4. Scrub, records, scripts | `claude-opus-5.5` |

Not used: every entry that reads `UNREVIEWED` (`comfyui-manager`, `comfyui-flowty-triposr`, `comfyui-pulid-flux-ll`, `comfyui-gguf`, `qwen-image-2.1`, `flux-dev`). The duplicate IDs `comfyui-core` and `blender-5.2.3` aren't used either, so each tool has one name in the records.

## The model's rules

- **Shape (FR-012).** The rest pose stands level-headed. The room measures height from the rest pose's bounds, so a raised tail or head above the back would shrink the dog. Keep the tail under the top of the head. Lowest point at the feet. Facing glTF's +z.
- **Skeleton.** The clips target the model's own bone names. Round 1's brief set `Hips`, `Spine`, `Neck`, `Head`, `Tail`, `FrontLeftLeg`, `FrontRightLeg`, `HindLeftLeg`, and `HindRightLeg`. No bone is named `LeftHand` or `RightHand` (the room reads those as hands; FR-008: the paper stays at the anchor).
- **Clips.** `idle`, `walk`, and `run`, each a loop with the root in place (the room moves the figure), on the model's skeleton. `run` is the faster gait spec 025's room figure plays; it is held to the same caps and checks as the others (RA2, RA4) and is bundled only with its model (RA9).
- **Nothing that locates (FR-013).** No place, person, screen, logo, or text from a photo, and no photo metadata. `scripts/assets/scrub.py` strips each file before hand-off.
- **Caps.** Main's `assets/policy/caps.json`: `per_asset.avatar` 21,000,000 bytes, 180,000 triangles, 46,000,000 texture bytes; `per_asset.animation` 1,000,000 bytes. The compositor's RA4 and the arrival check hold the files to these caps. Aim well under them: the dog stands 0.62 m tall, and the first visit counts only the largest visitor character (RK5).

## What stops the round (FR-010)

- No reviewed concept image in the studio's inbox. The round isn't queued. Round 1 stopped here on 2026-11-14 (`/srv/studio/handoff/dog/1/note.md`: "stopped before step 3. No candidate."; its step 3 is this brief's step 2).
- The listed tools can't make the model from his concept. The round stops and asks him, and it adds nothing. A new tool is his to add (patch 020, item 5).
- Any step that would read a photo.

## The hand-off and after

1. The studio writes the outputs to `/srv/studio/handoff/dog/<round>/`. A judge runs `line.py candidate`. Until his approval names the model's SHA-256, the arrival check's P1 line ("needs the Author's approval") is expected for the likeness, and it is the approval's turn, not a defect (decision page Q72).
2. **His intake** (patch 020, item 3): a commit of `assets/visitors/dog/**`, his consent quoted in the intake note. The arrival check runs on it.
3. **His look.** He opens the model in a glTF viewer or Blender. The room's bundle leaves the dog out until step 4 (RA9). Lookdev's Avatars view was dropped this night (the stack's note, T009 and T010).
4. **His approval** (patch 020, item 4): an entry in `assets/policy/approvals.json` for the model, all five confirms true, and a `disclosure_line` in his words. The clips, `likeness: false` and from no photo, need none by the arrival check's rule P; he may add one per clip. RA9 then bundles the dog, and the room shows the line once while any figure shows the model: the visitor's, or spec 025's room dog figure.

Until step 4, every visitor who chooses the dog sees the flat cut-out. That's the stand-in, and the build passes with it.
