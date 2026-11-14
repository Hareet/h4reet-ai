# Contract: the `dinosaur` rig

ADR 0010: "the dog and the dinosaur: a named rig each (`dog`, `dinosaur`), with their bones listed in the rig's spec when the characters are made". This is the dinosaur's list. It is the one the compositor's rig table (RA10) and the studio line's `bones_required` read.

## Bones

Names are exact (three's loader sanitizes `.` to nothing, so the table lists the sanitized form beside each). A bone may have more children than listed; none listed may be missing. No Mixamo name is required or forbidden.

| Bone | Sanitized | Parent | Why |
|---|---|---|---|
| `Hips` | `Hips` | root | the body's root; the walk's pelvis |
| `Spine` | `Spine` | `Hips` | the torso |
| `Chest` | `Chest` | `Spine` | the shoulders' base |
| `Neck` | `Neck` | `Chest` | the head's carry |
| `Head` | `Head` | `Neck` | `take`'s head-dip |
| `Jaw` | `Jaw` | `Head` | left for a later spec's bite (item i); needs no clip now |
| `Tail1` … `Tail4` | same | `Hips`, then each the last | the tail's sway in `idle` and `walk` |
| `Arm.L`, `Arm.R` | `ArmL`, `ArmR` | `Chest` | the small arms |
| `Leg.L`, `Leg.R` | `LegL`, `LegR` | `Hips` | the thigh |
| `Shin.L`, `Shin.R` | `ShinL`, `ShinR` | the leg | |
| `Foot.L`, `Foot.R` | `FootL`, `FootR` | the shin | the walk's contact |

Eighteen bones: `Hips`, `Spine`, `Chest`, `Neck`, `Head`, `Jaw`, `Tail1` to `Tail4`, two arms, two legs, two shins, two feet. The check enforces the names, not the count.

## Rest pose

- Facing +z, feet on the floor, the tail low behind (toward −z), the head forward and not above 1.2 m once scaled (FR-004 measures it).
- Skinned to one mesh or a few; at most 30,000 triangles; one texture set, at most 1,024 pixels a side (Q5).
- No morph targets are required (visitors don't speak through their avatars; ADR 0010).

## Clips (`dinosaur-<role>.glb`, kind `animation`, at most 300,000 bytes each)

| Role | Required | What it does |
|---|---|---|
| `idle` | yes | loops; a breath, a tail sway, a head turn; the first frame is the rest pose |
| `walk` | yes | loops; a biped's walk at the figure's speed (spec 008's pose; spec 009's FR-028 weights it); the tail counter-sways |
| `take` | no | plays once in the hand-off, a head-dip toward the paper's place and back to the idle's pose |

A clip's channels move only the bones above or their children (RA2). No `idle-holding`; the dinosaur has no holding hand, and FR-018 leaves the paper at the anchor.

## The rig table

`apps/web/build/room/checks/ra.ts` (RA10) reads `RIG_BONES: Record<AvatarId, readonly string[] | null>`: `dinosaur` the sanitized or exact names above; `woman` and `man` `null` (RA10 doesn't apply); `dog` is the dog's spec's row.

## Rules

Lenient, as RA1 to RA4: a lenient build warns and leaves the dinosaur out, so the cut-out stays; a strict build refuses with `<rule> <file>:<path>: <reason>`. They sit in the compositor's catalogue (`checks/family.ts`) and apply to `assets/visitors/dinosaur/` only, by the rig table.

| Rule | Refuses |
|---|---|
| RA9 | the model's rest-pose box, scaled to 1.2 m high, over 1.1 m (+5%) along x or z |
| RA10 | a model whose nodes lack a bone of the table's list for its avatar |
| RA11 | a model with a missing, or otherwise refused, `idle` or `walk` clip |
