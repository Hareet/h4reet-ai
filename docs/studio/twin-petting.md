# The twin's petting clip: the brief

Spec: [026, the twin pets the dog](../../specs/026-twin-pets-dog/spec.md), plan R-14. Written by the night-shift implementer (task impl-026, T020) on 2026-11-14. This is a later studio round's brief in prose, for the Author and the studio task. No round is queued by this task.

His item, in his words as his orders file lists it: f) "twin petting do gand dog-intro conversation corpus".

## What it replaces

Until this clip passes his look approval, the twin pets the room's dog with a code stand-in: a reach over its idle (spec FR-007). The stand-in's measure (plan §3, T003) shows why a clip is the better answer. The twin's shoulder is 1.395 m high, and its arm reaches 0.62 m to the middle finger's base. The dog's head, at its default home beside the twin, is about 0.53 m above the floor. A spine lean alone, even at 75°, leaves the hand 0.15 m to 0.20 m short, so a person petting a dog that size bends their knees. The clip can do that, and the stand-in waits on the page's question about a crouch.

## Inputs

- **The delivered `assets/twin/twin.glb`**, its rig of 55 Mixamo-named bones, as the other twin clips use it. No photo, crop, or path to one is read, and none is named here.
- **The room's numbers** (plan §3): the twin at its home, (0.660, 0.469), facing glTF's +z. The dog at its default home, spec 025's estimate [0.36, 0.55] (the page's Q158 moves it to about [0.30, 0.45]), 0.62 m tall, on the twin's right. The twin turns toward it by at most `turn_max_deg`, 60°, before the clip starts. The clip starts from that turned stance, and the room makes the turn, not the clip.

## Output

To `/srv/studio/handoff/twin-petting/<round>/`, for his intake into `assets/twin/`:

| File | Kind | What |
|---|---|---|
| `petting.glb` | `animation` | One clip, played once (`LoopOnce`): the twin reaches toward the dog's head on its right, crouching or bending as the reach needs, strokes three times along the dog's back, and withdraws to the idle's first pose. Root in place: the room places the figure. About `pet_s`, 3.5 s; its own length sets the petting's where it differs (spec FR-006). |

**Its record** in `assets/twin/records.json`, as the other twin clips are recorded (`greeting.glb`'s entry, for instance): `kind: "animation"`, `likeness: true`, `source: { "type": "photo", "id": "H01" }`, `media_license: "all-rights-reserved-2026"`, and `"approval": "<the Author's approval ID>"`. The studio leaves that placeholder; the ID is his, from his approval entry. Each step names its tool and licence from the list below. The file is scrubbed by `scripts/assets/scrub.py` before hand-off.

## Tools: main's list only

Only IDs on `assets/policy/studio-tools.json` (P-7) whose licence is reviewed and whose `outputs_ship` is `true`. His P-7 answer is "It's the same license that we've used for all the other avatars adn motions, so copy it from there", so these are the IDs the twin's other clips name:

| Step | IDs |
|---|---|
| The clip, on the twin's rig, and its export | `blender` 5.2.3, `gltf-exporter-bundled-with-blender` 5.2.41, `numpy-bundled-with-blender` |
| Scrub, records, scripts | `claude-opus-5.5` |

A new tool is his to add.

## The clip's rules

- **On the twin's own skeleton**, with only its bone names (`mixamorig:…`, which three loads as `mixamorig…`). A clip naming a bone the model lacks fails to load (FR-003 of spec 009), and the room keeps the stand-in.
- **The reach toward the walls.** RA8 samples every clip the twin plays, every 1/30 s, against the shell's walls (spec 016's T082). The twin stands in a corner, so a crouch that swings the hips back can cross a wall, and RA8 refuses it at intake.
- **The caps.** Main's `assets/policy/caps.json`, `per_asset.animation`: 1,000,000 bytes. RA6 holds the twin's files to their caps.
- **The first visit's bytes (RK5; spec FR-025).** Once his approval bundles it, `petting.glb` is one more twin clip, fetched in every 3D visit above the floor, the same for every visitor. Data-flow row V1 already covers it ("the twin's model and clips in every 3D visit above the floor, the same for every visitor"). RK5 counts it against `first_visit_bytes.phase3`, and a strict build refuses over it. Aim well under the cap: the other clips are 64 KB to 88 KB.

## The hand-off and after

1. The studio writes `petting.glb` and its record to the hand-off folder. A judge runs the candidate check.
2. **His look**: on lookdev's Petting view (plan R-12, if built) or in a glTF viewer or Blender, beside the code stand-in (SC-008).
3. **His approval, merged to main**: an entry in `assets/policy/approvals.json` for the clip's SHA-256, as each twin file has one.
4. **His intake**: `assets/twin/petting.glb` and its record. The room then plays it by its role in place of the reach (spec FR-006, FR-009), and `figures.twin.clips.petting: petting` maps the state to it.
