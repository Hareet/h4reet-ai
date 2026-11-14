# Contract: the `dinosaur` rig

ADR 0010: "the dog and the dinosaur: a named rig each (`dog`, `dinosaur`), with their bones listed in the rig's spec when the characters are made". This is the dinosaur's list. It is the one the compositor's rig table (RA10) and the studio line's `bones_required` read.

## Bones

Names are the raw GLB node names, exact (`Arm.L`, never three's sanitized `ArmL`: the compositor reads the file, as `line.py` does, and no runtime code looks these bones up). A bone may have more children than listed; none listed may be missing. A node named `<prefix>:<name>` counts as `<name>`, as `line.py`'s `has_bone` reads it (`b == required or b.endswith(":" + required)`). No Mixamo name is required or forbidden.

| Bone | Parent | Why |
|---|---|---|
| `Hips` | root | the body's root; the walk's pelvis |
| `Spine` | `Hips` | the torso |
| `Chest` | `Spine` | the shoulders' base |
| `Neck` | `Chest` | the head's carry |
| `Head` | `Neck` | `take`'s head-dip |
| `Jaw` | `Head` | left for a later spec's bite (item i); needs no clip now |
| `Tail1` … `Tail4` | `Hips`, then each the last | the tail's sway in `idle` and `walk` |
| `Arm.L`, `Arm.R` | `Chest` | the small arms |
| `Leg.L`, `Leg.R` | `Hips` | the thigh |
| `Shin.L`, `Shin.R` | the leg | |
| `Foot.L`, `Foot.R` | the shin | the walk's contact |

Eighteen bones: `Hips`, `Spine`, `Chest`, `Neck`, `Head`, `Jaw`, `Tail1` to `Tail4`, two arms, two legs, two shins, two feet. The check enforces the names, not the count or the parents.

Spec 019's gait looks for the six Mixamo leg bones (`src/room/scene/gait.ts`, `findLegRig`); this rig has none, so the gait applies nothing to the dinosaur and signals `gait` `unavailable` once (spec 019's FR-008). The `walk` clip moves its legs.

## Rest pose

- Facing +z, feet on the floor, the tail low behind (toward −z), the head forward and not above 1.2 m once scaled (FR-004 measures it).
- Skinned to one mesh or a few; at most 30,000 triangles; one texture set, at most 1,024 pixels a side (Q5).
- No morph targets are required (visitors don't speak through their avatars; ADR 0010).

## Clips (`dinosaur-<role>.glb`, kind `animation`, at most 300,000 bytes each)

| Role | Required | What it does |
|---|---|---|
| `idle` | yes (RA12) | loops; a breath, a tail sway, a head turn; the first frame is the rest pose |
| `walk` | yes (RA12) | loops, root in place; a biped's walk at the figure's speed (spec 008's pose; spec 009's FR-028 weights it); the tail counter-sways |
| `take` | no | plays once in the hand-off, a head-dip toward the paper's place and back to the idle's pose; missing or failed, the idle plays in its place (spec 009's FR-003) |

The brief asks for all three, and `line.py candidate` requires each clip a brief lists; the room needs only `idle` and `walk`. A clip's channels move only the bones above or their children (RA2). No `idle-holding`; the dinosaur has no holding hand, and spec 009's FR-018 leaves the paper at the anchor.

## The rig table

`apps/web/build/room/avatars.ts` holds `RIG_BONES: Readonly<Record<AvatarId, readonly string[] | null>>`: `dinosaur` the eighteen raw names above; `woman`, `man`, and `dog` `null`. RA10, RA11, and RA12 run in `readAvatars` only where `RIG_BONES[id] !== null`.

## Rules

Lenient, as RA1 to RA4 are: a lenient build warns and leaves the model out, so the cut-out stays; a strict build refuses with `<rule> <file>:<path>: <reason>`. They sit in the compositor's catalogue (`checks/family.ts`) after spec 020's RA9, and each has a `bad/<RULE>-*/` case. They report only where `main`'s caps hold `per_asset.avatar` (`readAvatars`'s `checked` guard), as RA1 to RA4 do.

| Rule | Refuses |
|---|---|
| RA10 | a model whose raw node names lack a bone of its row (exact, or after a `:`) |
| RA11 | a model whose rest-pose box, scaled to `AVATAR_SHAPES[id].height`, is over `AVATAR_SHAPES[id].width` × 1.05 along x or z |
| RA12 | a model with a missing, or otherwise refused, `idle` or `walk` clip |

The numbers follow the line's highest RA rule (spec 020's RA9) in task order, since `compose.test.ts`'s `counts` pin wants RA1 to RAn contiguous at every commit. If the line holds a higher one when impl-021 starts, impl-021 renumbers the three, in order, everywhere.
