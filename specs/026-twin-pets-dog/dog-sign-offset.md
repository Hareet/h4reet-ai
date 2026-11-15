# The dog sign's offset along the desk: Q281's measurement (measure-026)

**Spec**: 026-twin-pets-dog · **Task**: measure-026 (night 2026-11-14), off the line, for the page's Q281 · **Base**:
d21c8021 (impl3-026's T013a, where `apps/web/test/room/dog-pick.test.ts` and `pickSweep`'s `figureFronts` are built) ·
**Changes**: none to any source file, test file, `scene.yaml`, `assets/**`, or human-only path; this file only.

## Q281, in impl3-026's words

> RG6 refuses the `dog` selectable's desk sign against the laptop, with or without the dog figure: with the selectable
> added to the shipped scene in memory, the sign's 44 px core lies over the laptop's members at 7,528 of 7,671
> supported stages, the two cores overlap at 3,076, the same in 2D; how should the human patch's `dog` selectable get
> past RG6?

Its recommended answer (answered: recommended, the orders file's rule; his to confirm or overturn), in its words:

> move the dog sign along the desk, away from the laptop (its `mount.offset`, now an estimate at [0.27, 0, -0.04]), to
> the nearest offset where RG6 passes at every supported stage. A worker measures the candidate offsets with
> `dog-pick.test.ts`'s sweep and puts the numbers on the page for your look, and the move goes in the same human patch

## The answer, in short

**No offset along the desk's top passes RG6.** At every candidate from the estimate [0.27, 0, -0.04] to the desk's
left end (x −0.61) and to its right end (x 0.61), in steps of 0.02, the sign's 44 px core lies over a member of the
`laptop` selectable at all 7,671 supported stages in 2D, and at 7,670 or 7,671 in 3D. A supplementary sweep along
the desk's depth, toward its front edge, changes nothing: still 7,671 of 7,671. So no nearest passing offset can go to
his look. Q281's recommended answer, a move along the desk, can't pass RG6 as RG6 and the `laptop` selectable stand.
A new question on the page asks how the patch's `dog` selectable should get past RG6 instead.

**Why.** The `laptop` selectable ("Laptop and screen") holds three members on the desk's top: the screen (x −0.646 to
0.338, at its stylized scale 1.2), the laptop's stand (0.420 to 0.680), and the laptop (0.394 to 0.706). Together they
cover x −0.646 to 0.706 of the desk's −0.75 to 0.75. The gaps are 10.4 cm at the left end, 5.6 cm between the screen
and the laptop, and 4.4 cm at the right end. The sign is about 25 cm across (0.16 m at stylized scale 1.5, turned
−10°), wider than every gap. So wherever the sign stands on the desk's top, its projected rectangle overlaps a laptop
member's. The sign's core, a 44 px square centred on that rectangle (`compose/pick.ts`'s `pickAreas`), then lies over
the member at every stage. RG6's "member" rule (`pickProblems`) is a rectangle overlap and doesn't read depth, so
standing the sign in front of the screen doesn't help. The screen's frame box runs from the desk's top (y 1.07) up to
y 1.69, and its projected rectangle covers the sign from any depth on the desk (the depth sweep below).

**The numbers in Q281.** They are RG6's own counts, `pickSweep`'s `first` plus `more`, which counts stage *sizes*
(`sizeKey`, `w×h`), not stages: the supported stages hold 7,671 stages of 7,528 distinct sizes. Counted per stage, as
this probe counts, the estimate's figures are 7,671 (core over the laptop's members) and 3,212 (cores overlap) in 3D.
In 2D they are 7,671 and 4,436. The probe prints both counts at the estimate (the "whole sweep at 0.27" lines), and
they agree with Q281: `3D 4 member 2 at 7528 sizes`, `3D 4 core 2 at 3076 sizes`. Q281's "the same in 2D" holds for the
member rule (7,528 sizes) but not for the cores, which overlap at 4,293 sizes in 2D. Q281 doesn't name a third
refusal at the estimate: the laptop's own core lies over the sign (`laptop member dog`) at 2,459 stages in 3D and
3,808 in 2D.

## Method

**The desk's length is x of the work-desk's `top` anchor, the room's x.** `catalog/work-desk.yaml` gives the desk
`size: { w: 1.5, h: 1.07, d: 0.8 }` and bounds x −0.75 to 0.75 and z −0.4 to 0.4: 1.5 m along x, 0.8 m along z. Its
`top` anchor is at [0, 1.07, 0] with no turn. The desk mounts on the shell's `back-wall` anchor (at [0, 0, −0.6096],
no turn) with offset [0, 0, 0.4] and no turn (`scene.yaml`). So the `top` frame's axes are the room's, and an offset's
x runs along the desk's length, parallel to the back wall. The probe's work-desk box confirms it: x −0.75 to 0.75, z
−0.6096 to 0.1924. The dog sign mounts on that `top` anchor, so `mount.offset[0]` moves it along the length and
`offset[2]` along the depth; `offset[1]` stays 0, on the top.

**"Away from the laptop."** The laptop itself, on its stand at offset x 0.55, is on the sign's +x side, so away from
it is −x, toward the desk's left end, as the brief asks. But the `laptop` selectable's screen stands at x −0.154 and
reaches −0.646, so −x moves the sign further in front of a laptop member, not away from one. The probe therefore
measured both directions: −x to the left end (the brief's), and +x to the right end (supplementary).

**On the desk's top.** A candidate counts as on the top while the sign's frame box (turned −10°, at stylized scale 1.5)
lies within the desk's box in x and z. Each direction ran until the first candidate off the top, which the runs print
with "on top NO" and the table leaves out: −0.63 and 0.63 along the length (the box is about 0.2496 wide, so its centre
can't pass ±0.625), and z 0.36 along the depth.

**What the probe measures.** For each candidate it builds the repository's tree with the `dog` selectable added to
`scene.yaml`'s selectables in memory, exactly as `dog-pick.test.ts`'s `withDog()` does (the same `DOG_SELECTABLE`,
with `figure: dog`), and the dog sign's `mount.offset` set to the candidate. Nothing touches the disk. It takes
`geometryOf` from that tree and runs RG6's own sweep, `pickSweep(g, [stage])`, once for each of `sweptStages(g)`'s
7,671 supported stages, in 3D at the stage's production framing (with the dog figure's front rectangle, as T013a
built it) and in 2D at the stage's scale. For each mode it counts:

- the stages where the sign's core lies over a laptop member (`4 member 2`);
- the stages where the two cores overlap (`4 core 2` or `2 core 4`);
- every other RG6 problem as "subject kind other", for example `laptop member dog` (the laptop's core over the sign) or
  `dog member snowboard`;
- the stages with any RG6 problem at all.

RG6 passes for a candidate only where no stage has any problem in either mode. It also composes the whole room
(`compose`, strict, no drafts) and lists any finding other than RG6's that the estimate doesn't already have: none at
any candidate. Selectables by index: 0 snowboard, 1 bicycle, 2 laptop, 3 chalkboard, 4 dog.

The probe ran as a vitest file in `apps/web/test/room/` (vitest's `include` is `test/**/*.test.ts`), with
`--reporter=verbose` so its console lines print, and was deleted before the commit. The worktree had no
`node_modules`, so `npm ci --ignore-scripts` (the setup target's install line) ran first. One run took about 10 s a
candidate.

## The table

Counts are stages of 7,671, "3D / 2D". "Other problems" lists every RG6 problem besides the two laptop columns, by
subject, kind, and other. Every row is on the desk's top, and every row has no new finding outside RG6.

| Direction | `mount.offset` | Sign's x on the desk | Core over laptop's members | Cores overlap | Other problems (3D / 2D) | Stages with any RG6 problem | RG6 |
|---|---|---|---:|---:|---|---:|---|
| −x (left) | [0.27, 0, -0.04] | 0.145 to 0.395 | 7,671 / 7,671 | 3,212 / 4,436 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.25, 0, -0.04] | 0.125 to 0.375 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.23, 0, -0.04] | 0.105 to 0.355 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.21, 0, -0.04] | 0.085 to 0.335 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.19, 0, -0.04] | 0.065 to 0.315 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.17, 0, -0.04] | 0.045 to 0.295 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.15, 0, -0.04] | 0.025 to 0.275 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.13, 0, -0.04] | 0.005 to 0.255 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.11, 0, -0.04] | -0.015 to 0.235 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.09, 0, -0.04] | -0.035 to 0.215 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.07, 0, -0.04] | -0.055 to 0.195 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.05, 0, -0.04] | -0.075 to 0.175 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.03, 0, -0.04] | -0.095 to 0.155 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [0.01, 0, -0.04] | -0.115 to 0.135 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.01, 0, -0.04] | -0.135 to 0.115 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.03, 0, -0.04] | -0.155 to 0.095 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.05, 0, -0.04] | -0.175 to 0.075 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.07, 0, -0.04] | -0.195 to 0.055 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.09, 0, -0.04] | -0.215 to 0.035 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.11, 0, -0.04] | -0.235 to 0.015 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.13, 0, -0.04] | -0.255 to -0.005 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.15, 0, -0.04] | -0.275 to -0.025 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.17, 0, -0.04] | -0.295 to -0.045 | 7,671 / 7,671 | 3,517 / 4,681 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.19, 0, -0.04] | -0.315 to -0.065 | 7,671 / 7,671 | 3,363 / 4,551 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.21, 0, -0.04] | -0.335 to -0.085 | 7,671 / 7,671 | 2,827 / 4,072 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.23, 0, -0.04] | -0.355 to -0.105 | 7,671 / 7,671 | 2,381 / 3,696 | laptop member dog 3D 2157 / 2D 3489 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.25, 0, -0.04] | -0.375 to -0.125 | 7,671 / 7,671 | 2,037 / 3,376 | laptop member dog 3D 1498 / 2D 2866 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.27, 0, -0.04] | -0.395 to -0.145 | 7,671 / 7,671 | 1,709 / 3,052 | laptop member dog 3D 1016 / 2D 2274 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.29, 0, -0.04] | -0.415 to -0.165 | 7,671 / 7,671 | 1,420 / 2,729 | laptop member dog 3D 569 / 2D 1825 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.31, 0, -0.04] | -0.435 to -0.185 | 7,671 / 7,671 | 1,165 / 2,459 | laptop member dog 3D 287 / 2D 1331 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.33, 0, -0.04] | -0.455 to -0.205 | 7,671 / 7,671 | 905 / 2,195 | laptop member dog 3D 178 / 2D 1033 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.35, 0, -0.04] | -0.475 to -0.225 | 7,671 / 7,671 | 702 / 1,964 | laptop member dog 3D 75 / 2D 761 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.37, 0, -0.04] | -0.495 to -0.245 | 7,671 / 7,671 | 516 / 1,715 | laptop member dog 3D 30 / 2D 530 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.39, 0, -0.04] | -0.515 to -0.265 | 7,671 / 7,671 | 382 / 1,474 | laptop member dog 3D 0 / 2D 336 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.41, 0, -0.04] | -0.535 to -0.285 | 7,671 / 7,671 | 268 / 1,291 | laptop member dog 3D 0 / 2D 240 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.43, 0, -0.04] | -0.555 to -0.305 | 7,671 / 7,671 | 196 / 1,070 | laptop member dog 3D 0 / 2D 76 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.45, 0, -0.04] | -0.575 to -0.325 | 7,671 / 7,671 | 134 / 922 | none | 7,671 / 7,671 | refuses |
| −x (left) | [-0.47, 0, -0.04] | -0.595 to -0.345 | 7,671 / 7,671 | 112 / 801 | dog member snowboard 3D 0 / 2D 159 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.49, 0, -0.04] | -0.615 to -0.365 | 7,671 / 7,671 | 71 / 670 | dog member snowboard 3D 0 / 2D 240 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.51, 0, -0.04] | -0.635 to -0.385 | 7,671 / 7,671 | 32 / 550 | dog member snowboard 3D 0 / 2D 423 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.53, 0, -0.04] | -0.655 to -0.405 | 7,671 / 7,671 | 28 / 455 | dog member snowboard 3D 58 / 2D 569 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.55, 0, -0.04] | -0.675 to -0.425 | 7,671 / 7,671 | 0 / 336 | dog member snowboard 3D 124 / 2D 812 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.57, 0, -0.04] | -0.695 to -0.445 | 7,671 / 7,671 | 0 / 325 | dog member snowboard 3D 200 / 2D 1146 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.59, 0, -0.04] | -0.715 to -0.465 | 7,671 / 7,671 | 0 / 240 | dog member snowboard 3D 376 / 2D 1540 | 7,671 / 7,671 | refuses |
| −x (left) | [-0.61, 0, -0.04] | -0.735 to -0.485 | 7,671 / 7,671 | 0 / 159 | dog member snowboard 3D 615 / 2D 1999 | 7,671 / 7,671 | refuses |
| +x (right) | [0.29, 0, -0.04] | 0.165 to 0.415 | 7,671 / 7,671 | 2,681 / 3,990 | laptop member dog 3D 2459 / 2D 3808 | 7,671 / 7,671 | refuses |
| +x (right) | [0.31, 0, -0.04] | 0.185 to 0.435 | 7,671 / 7,671 | 2,277 / 3,643 | laptop member dog 3D 1953 / 2D 3378 | 7,671 / 7,671 | refuses |
| +x (right) | [0.33, 0, -0.04] | 0.205 to 0.455 | 7,671 / 7,671 | 1,890 / 3,279 | laptop member dog 3D 1348 / 2D 2733 | 7,671 / 7,671 | refuses |
| +x (right) | [0.35, 0, -0.04] | 0.225 to 0.475 | 7,671 / 7,671 | 1,591 / 2,981 | laptop member dog 3D 839 / 2D 2206 | 7,671 / 7,671 | refuses |
| +x (right) | [0.37, 0, -0.04] | 0.245 to 0.495 | 7,670 / 7,671 | 1,291 / 2,684 | laptop member dog 3D 508 / 2D 1742<br>dog union laptop 3D 1 / 2D 0 | 7,671 / 7,671 | refuses |
| +x (right) | [0.39, 0, -0.04] | 0.265 to 0.515 | 7,671 / 7,671 | 1,049 / 2,382 | laptop member dog 3D 271 / 2D 1295 | 7,671 / 7,671 | refuses |
| +x (right) | [0.41, 0, -0.04] | 0.285 to 0.535 | 7,671 / 7,671 | 834 / 2,126 | laptop member dog 3D 163 / 2D 948 | 7,671 / 7,671 | refuses |
| +x (right) | [0.43, 0, -0.04] | 0.305 to 0.555 | 7,671 / 7,671 | 629 / 1,896 | laptop member dog 3D 73 / 2D 682 | 7,671 / 7,671 | refuses |
| +x (right) | [0.45, 0, -0.04] | 0.325 to 0.575 | 7,671 / 7,671 | 484 / 1,645 | laptop member dog 3D 28 / 2D 462 | 7,671 / 7,671 | refuses |
| +x (right) | [0.47, 0, -0.04] | 0.345 to 0.595 | 7,671 / 7,671 | 361 / 1,442 | laptop member dog 3D 0 / 2D 325 | 7,671 / 7,671 | refuses |
| +x (right) | [0.49, 0, -0.04] | 0.365 to 0.615 | 7,671 / 7,671 | 260 / 1,200 | laptop member dog 3D 0 / 2D 159 | 7,671 / 7,671 | refuses |
| +x (right) | [0.51, 0, -0.04] | 0.385 to 0.635 | 7,671 / 7,671 | 192 / 1,054 | laptop member dog 3D 0 / 2D 76 | 7,671 / 7,671 | refuses |
| +x (right) | [0.53, 0, -0.04] | 0.405 to 0.655 | 7,671 / 7,671 | 130 / 906 | dog member bicycle 3D 0 / 2D 75 | 7,671 / 7,671 | refuses |
| +x (right) | [0.55, 0, -0.04] | 0.425 to 0.675 | 7,671 / 7,671 | 103 / 790 | dog member bicycle 3D 0 / 2D 159 | 7,671 / 7,671 | refuses |
| +x (right) | [0.57, 0, -0.04] | 0.445 to 0.695 | 7,671 / 7,671 | 68 / 658 | dog member bicycle 3D 0 / 2D 251 | 7,671 / 7,671 | refuses |
| +x (right) | [0.59, 0, -0.04] | 0.465 to 0.715 | 7,671 / 7,671 | 30 / 548 | dog member bicycle 3D 26 / 2D 443 | 7,671 / 7,671 | refuses |
| +x (right) | [0.61, 0, -0.04] | 0.485 to 0.735 | 7,671 / 7,671 | 26 / 443 | dog member bicycle 3D 68 / 2D 658 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, -0.02] | 0.145 to 0.395 | 7,671 / 7,671 | 3,194 / 4,407 | laptop member dog 3D 2478 / 2D 3814 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.00] | 0.145 to 0.395 | 7,671 / 7,671 | 3,142 / 4,376 | laptop member dog 3D 2490 / 2D 3818 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.02] | 0.145 to 0.395 | 7,671 / 7,671 | 3,124 / 4,342 | laptop member dog 3D 2523 / 2D 3822 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.04] | 0.145 to 0.395 | 7,671 / 7,671 | 3,105 / 4,311 | laptop member dog 3D 2531 / 2D 3848 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.06] | 0.145 to 0.395 | 7,671 / 7,671 | 3,069 / 4,307 | laptop member dog 3D 2542 / 2D 3882 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.08] | 0.145 to 0.395 | 7,671 / 7,671 | 3,015 / 4,227 | laptop member dog 3D 2571 / 2D 3908 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.10] | 0.145 to 0.395 | 7,671 / 7,671 | 2,936 / 4,161 | laptop member dog 3D 2601 / 2D 3930 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.12] | 0.145 to 0.395 | 7,671 / 7,671 | 2,919 / 4,128 | laptop member dog 3D 2622 / 2D 3954 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.14] | 0.145 to 0.395 | 7,671 / 7,671 | 2,881 / 4,100 | laptop member dog 3D 2630 / 2D 3988 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.16] | 0.145 to 0.395 | 7,671 / 7,671 | 2,854 / 4,094 | laptop member dog 3D 2666 / 2D 3994 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.18] | 0.145 to 0.395 | 7,671 / 7,671 | 2,820 / 4,040 | laptop member dog 3D 2676 / 2D 3998 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.20] | 0.145 to 0.395 | 7,671 / 7,671 | 2,786 / 3,998 | laptop member dog 3D 2702 / 2D 4038 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.22] | 0.145 to 0.395 | 7,671 / 7,671 | 2,772 / 3,990 | laptop member dog 3D 2721 / 2D 4072 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.24] | 0.145 to 0.395 | 7,671 / 7,671 | 2,734 / 3,954 | laptop member dog 3D 2763 / 2D 4094 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.26] | 0.145 to 0.395 | 7,671 / 7,671 | 2,688 / 3,912 | laptop member dog 3D 2777 / 2D 4100 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.28] | 0.145 to 0.395 | 7,671 / 7,671 | 2,647 / 3,882 | laptop member dog 3D 2809 / 2D 4126 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.30] | 0.145 to 0.395 | 7,671 / 7,671 | 2,627 / 3,846 | laptop member dog 3D 2826 / 2D 4161 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.32] | 0.145 to 0.395 | 7,671 / 7,671 | 2,588 / 3,818 | laptop member dog 3D 2900 / 2D 4223 | 7,671 / 7,671 | refuses |
| depth (front) | [0.27, 0, 0.34] | 0.145 to 0.395 | 7,671 / 7,671 | 2,560 / 3,808 | laptop member dog 3D 2914 / 2D 4250 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, -0.02] | -0.575 to -0.325 | 7,671 / 7,671 | 132 / 908 | dog member snowboard 3D 0 / 2D 75 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.00] | -0.575 to -0.325 | 7,671 / 7,671 | 130 / 906 | dog member snowboard 3D 0 / 2D 75 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.02] | -0.575 to -0.325 | 7,671 / 7,671 | 130 / 906 | dog member snowboard 3D 0 / 2D 75 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.04] | -0.575 to -0.325 | 7,671 / 7,671 | 129 / 897 | dog member snowboard 3D 0 / 2D 75 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.06] | -0.575 to -0.325 | 7,671 / 7,671 | 126 / 892 | dog member snowboard 3D 0 / 2D 76 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.08] | -0.575 to -0.325 | 7,671 / 7,671 | 124 / 812 | dog member snowboard 3D 0 / 2D 76 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.10] | -0.575 to -0.325 | 7,671 / 7,671 | 124 / 812 | dog member snowboard 3D 0 / 2D 76 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.12] | -0.575 to -0.325 | 7,671 / 7,671 | 112 / 801 | dog member snowboard 3D 0 / 2D 159 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.14] | -0.575 to -0.325 | 7,671 / 7,671 | 110 / 790 | dog member snowboard 3D 0 / 2D 159 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.16] | -0.575 to -0.325 | 7,671 / 7,671 | 103 / 790 | dog member snowboard 3D 0 / 2D 159 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.18] | -0.575 to -0.325 | 7,671 / 7,671 | 76 / 762 | dog member snowboard 3D 0 / 2D 159 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.20] | -0.575 to -0.325 | 7,671 / 7,671 | 75 / 761 | dog member snowboard 3D 0 / 2D 159 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.22] | -0.575 to -0.325 | 7,671 / 7,671 | 73 / 682 | dog member snowboard 3D 0 / 2D 159 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.24] | -0.575 to -0.325 | 7,671 / 7,671 | 73 / 682 | dog member snowboard 3D 0 / 2D 240 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.26] | -0.575 to -0.325 | 7,671 / 7,671 | 73 / 682 | dog member snowboard 3D 0 / 2D 240 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.28] | -0.575 to -0.325 | 7,671 / 7,671 | 68 / 667 | dog member snowboard 3D 0 / 2D 240 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.30] | -0.575 to -0.325 | 7,671 / 7,671 | 68 / 658 | dog member snowboard 3D 0 / 2D 240 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.32] | -0.575 to -0.325 | 7,671 / 7,671 | 68 / 658 | dog member snowboard 3D 0 / 2D 256 | 7,671 / 7,671 | refuses |
| depth (front) | [-0.45, 0, 0.34] | -0.575 to -0.325 | 7,671 / 7,671 | 67 / 657 | dog member snowboard 3D 0 / 2D 325 | 7,671 / 7,671 | refuses |

**Supplementary, not a candidate: the `laptop` selectable without the screen.** Q281's refusal comes from the screen
being a `laptop` member, so the probe also ran (`PROBE_NO_SCREEN=1`) with `desk-screen` taken out of that
selectable's members, at a few offsets. It doesn't give a clean route either. Without the `dog` selectable at all,
that variant has its own RG6 refusal: the baseline line reads `["2D 2 member"]`, the laptop's core over the bicycle's
member at 159 stages in 2D. With the dog, the sign passes RG6 in 3D from x −0.13 leftward, and the cores stop
overlapping from −0.23 leftward, but every candidate still fails on that 2D laptop-over-bicycle refusal. Changing the
"Laptop and screen" selectable is also the Author's call, so this is a measurement for the page, not a proposal.

| Direction | `mount.offset` | Sign's x on the desk | Core over laptop's members | Cores overlap | Other problems (3D / 2D) | Stages with any RG6 problem | RG6 |
|---|---|---|---:|---:|---|---:|---|
| no screen | [0.27, 0, -0.04] | 0.145 to 0.395 | 3,801 / 4,922 | 2,285 / 3,645 | laptop member dog 3D 1955 / 2D 3378<br>laptop member bicycle 3D 0 / 2D 159 | 3,801 / 4,922 | refuses |
| no screen | [0.17, 0, -0.04] | 0.045 to 0.295 | 502 / 1,742 | 838 / 2,128 | laptop member dog 3D 132 / 2D 920<br>laptop member bicycle 3D 0 / 2D 159 | 838 / 2,128 | refuses |
| no screen | [0.07, 0, -0.04] | -0.055 to 0.195 | 0 / 325 | 192 / 1,054 | laptop member bicycle 3D 0 / 2D 159<br>laptop member dog 3D 0 / 2D 75 | 192 / 1,054 | refuses |
| no screen | [-0.03, 0, -0.04] | -0.155 to 0.095 | 0 / 0 | 26 / 443 | laptop member bicycle 3D 0 / 2D 159 | 26 / 443 | refuses |
| no screen | [-0.13, 0, -0.04] | -0.255 to -0.005 | 0 / 0 | 0 / 76 | laptop member bicycle 3D 0 / 2D 159 | 0 / 159 | refuses |
| no screen | [-0.23, 0, -0.04] | -0.355 to -0.105 | 0 / 0 | 0 / 0 | laptop member bicycle 3D 0 / 2D 159 | 0 / 159 | refuses |
| no screen | [-0.33, 0, -0.04] | -0.455 to -0.205 | 0 / 0 | 0 / 0 | laptop member bicycle 3D 0 / 2D 159 | 0 / 159 | refuses |
| no screen | [-0.43, 0, -0.04] | -0.555 to -0.305 | 0 / 0 | 0 / 0 | laptop member bicycle 3D 0 / 2D 159 | 0 / 159 | refuses |

## Nearest passing offset

**None.** No `mount.offset` along the desk's length, from the desk's left end to its right end, and none along its
depth at x 0.27 or −0.45, passes RG6 at every supported stage. Each stage's refusal is the sign's core over a member of
the `laptop` selectable, which the sign can't get clear of on the desk's top (see Why). So no candidate goes to his
look, and T019's move has no offset to make.

What this leaves for T019: its dependency in `tasks.md` ("T013a's non-null check and RG6 result on the shipped scene
recorded, with no stop or refusal open on the page") stays open. The new page question (`/night/io/out/questions.md`)
asks which route the human patch's `dog` selectable takes past RG6, with a recommendation:

- **Recommended:** keep the `dog` selectable's scene line out of the human patch until a mount for the dog sign off
  the desk's top passes RG6. A worker measures candidate mounts with this probe, for his look: on the back wall either
  side of the window, on a side wall, or on the floor by the dog's home.
- **Others:** take `desk-screen` out of the `laptop` selectable and move the sign to x −0.13 or further left (measured
  above: 3D passes, 2D still refused by the laptop's own core over the bicycle, which would need its own fix); or make
  the dog figure the `dog` piece's only pick in 3D, which leaves 2D with no dog pick, against FR-013's sign "in 2D too".

## The probe's source, whole

`apps/web/test/room/zz-probe-dog-sign-offset.test.ts`, as it ran for every run below, then deleted:

```ts
// SCRATCH PROBE (measure-026, Q281), never committed: the `dog` selectable added to the shipped scene in memory, as
// dog-pick.test.ts's withDog() adds it, and the dog sign's mount.offset moved along the desk's length (x of the
// work-desk's `top` anchor), counted per supported stage, in 3D and in 2D, with RG6's own sweep (pickSweep).
import { it } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeOptions } from "../../build/room/compose";
import { createContext } from "../../build/room/checks/family";
import { geometryOf, pickSweep, sweptStages } from "../../build/room/checks/rg";
import { loadRoom } from "../../build/room/load";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { REPO } from "../helpers/room";

const SCENE_PATH = "apps/web/room/scene.yaml";
const STRICT: ComposeOptions = { mode: "strict", drafts: false };
const DOG_SELECTABLE = {
  id: "dog",
  name: "Dog",
  members: ["dog-sign"],
  figure: "dog",
  action: { talk: { topic: "hobbies-and-travel", lead: "The dog first." } },
};
const DOG = "4"; // its index in selectables, after snowboard 0, bicycle 1, laptop 2, chalkboard 3
const LAPTOP = "2";
const NAMES: Record<string, string> = { "0": "snowboard", "1": "bicycle", "2": "laptop", "3": "chalkboard", "4": "dog" };

type Mount = { on: string; anchor: string; offset: number[]; turn?: { y?: number } };
type Doc = { selectables: unknown[]; placements: { id: string; mount?: Mount }[] };

const base = fileTree(REPO);
const sceneText = new TextDecoder().decode(base.read(SCENE_PATH) ?? new Uint8Array());
const policy = readRoomPolicy({ env: {}, root: REPO });

function treeWith(x: number | null, withDog = true, z = -0.04): Tree {
  const doc = parse(sceneText) as Doc;
  if (withDog) doc.selectables = [...doc.selectables, DOG_SELECTABLE];
  // Supplementary variant (not a candidate offset): the laptop selectable without the desk screen among its members.
  if (process.env.PROBE_NO_SCREEN === "1")
    doc.selectables = doc.selectables.map((s) => {
      const sel = s as { id: string; members: string[] };
      return sel.id === "laptop" ? { ...sel, members: sel.members.filter((m) => m !== "desk-screen") } : sel;
    });
  if (x !== null) {
    const sign = doc.placements.find((p) => p.id === "dog-sign");
    if (!sign?.mount) throw new Error("no dog-sign mount");
    sign.mount.offset = [x, sign.mount.offset[1] ?? 0, z];
  }
  return overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(doc))]]));
}

const findingKeys = (tree: Tree): string[] =>
  compose(tree, policy, STRICT)
    .findings.filter((f) => f.rule !== "RG6")
    .map((f) => `${f.rule} ${f.path}: ${f.reason}`);

interface Row {
  x: number;
  z: number;
  signZ: [number, number];
  signX: [number, number];
  onTop: boolean;
  memberLaptop: { d3: number; d2: number };
  coreLaptop: { d3: number; d2: number };
  others: Map<string, { d3: number; d2: number }>;
  stagesWithAny: { d3: number; d2: number };
  total: number;
  passes: boolean;
  findings: string[];
}

function measure(x: number, baseFindings: Set<string>, z = -0.04): Row {
  const tree = treeWith(x, true, z);
  const g = geometryOf(createContext(loadRoom(tree), policy, STRICT, tree).ctx);
  if (!g) throw new Error("no geometry");
  const box = g.boxes.get("dog-sign");
  if (!box) throw new Error("no dog-sign box");
  const desk = g.boxes.get("work-desk");
  if (!desk) throw new Error("no work-desk box");
  const stages = sweptStages(g);
  const memberLaptop = { d3: 0, d2: 0 };
  const coreLaptop = { d3: 0, d2: 0 };
  const stagesWithAny = { d3: 0, d2: 0 };
  const others = new Map<string, { d3: number; d2: number }>();
  for (const stage of stages) {
    const problems = pickSweep(g, [stage]).problems;
    const seen = { d3: new Set<string>(), d2: new Set<string>() };
    for (const p of problems) {
      const mode = p.mode === "3D" ? "d3" : "d2";
      const { selectable: s, problem: kind, other: o } = p.problem;
      if (s === DOG && kind === "member" && o === LAPTOP) seen[mode].add("member-laptop");
      else if (kind === "core" && ((s === DOG && o === LAPTOP) || (s === LAPTOP && o === DOG)))
        seen[mode].add("core-laptop");
      else seen[mode].add(`${NAMES[s] ?? s} ${kind} ${o === null ? "-" : (NAMES[o] ?? o)}`);
    }
    for (const mode of ["d3", "d2"] as const) {
      if (seen[mode].size > 0) stagesWithAny[mode] += 1;
      for (const k of seen[mode]) {
        if (k === "member-laptop") memberLaptop[mode] += 1;
        else if (k === "core-laptop") coreLaptop[mode] += 1;
        else {
          const c = others.get(k) ?? { d3: 0, d2: 0 };
          c[mode] += 1;
          others.set(k, c);
        }
      }
    }
  }
  const findings = findingKeys(tree).filter((f) => !baseFindings.has(f));
  return {
    x,
    z,
    signZ: [box.min[2], box.max[2]],
    signX: [box.min[0], box.max[0]],
    onTop:
      box.min[0] >= desk.min[0] - 1e-9 &&
      box.max[0] <= desk.max[0] + 1e-9 &&
      box.min[2] >= desk.min[2] - 1e-9 &&
      box.max[2] <= desk.max[2] + 1e-9,
    memberLaptop,
    coreLaptop,
    others,
    stagesWithAny,
    total: stages.length,
    passes: stagesWithAny.d3 === 0 && stagesWithAny.d2 === 0,
    findings,
  };
}

const fmt = (n: number): string => (Number.isInteger(n * 100) ? n.toFixed(2) : n.toFixed(4));

function print(r: Row): void {
  const others = [...r.others].map(([k, c]) => `${k} 3D ${c.d3} / 2D ${c.d2}`).join("; ") || "none";
  console.log(
    [
      `offset [${fmt(r.x)}, 0, ${fmt(r.z)}]`,
      `sign x ${r.signX[0].toFixed(3)}..${r.signX[1].toFixed(3)} z ${r.signZ[0].toFixed(3)}..${r.signZ[1].toFixed(3)} on top ${r.onTop ? "yes" : "NO"}`,
      `core over laptop's members 3D ${r.memberLaptop.d3} / 2D ${r.memberLaptop.d2}`,
      `cores overlap 3D ${r.coreLaptop.d3} / 2D ${r.coreLaptop.d2}`,
      `others: ${others}`,
      `stages with any RG6 problem 3D ${r.stagesWithAny.d3} / 2D ${r.stagesWithAny.d2} of ${r.total}`,
      `RG6 ${r.passes ? "PASSES" : "refuses"}`,
      `new non-RG6 findings: ${r.findings.length === 0 ? "none" : r.findings.join(" | ")}`,
    ].join(" · "),
  );
}

it("measures Q281's candidate offsets", { timeout: 3_600_000 }, () => {
  // The shipped scene without the dog selectable: its RG6 sweep, the baseline (no problem expected).
  const bareTree = treeWith(null, false);
  const bare = geometryOf(createContext(loadRoom(bareTree), policy, STRICT, bareTree).ctx);
  if (!bare) throw new Error("no geometry");
  const bareProblems = pickSweep(bare).problems.map((p) => `${p.mode} ${p.problem.selectable} ${p.problem.problem}`);
  console.log(`baseline, shipped scene without the dog selectable: RG6 problems ${JSON.stringify(bareProblems)}`);
  const desk = bare.boxes.get("work-desk");
  console.log(`work-desk box ${JSON.stringify(desk)}; dog-sign box ${JSON.stringify(bare.boxes.get("dog-sign"))}`);
  for (const id of ["desk-screen", "laptop-stand", "laptop", "busy-sign"])
    console.log(`${id} box ${JSON.stringify(bare.boxes.get(id))}`);
  const baseFindings = new Set(findingKeys(treeWith(0.27)));
  console.log(`non-RG6 findings at the estimate [0.27, 0, -0.04]: ${JSON.stringify([...baseFindings])}`);
  // How the whole sweep counts at the estimate: RG6's own first + more, which counts stage sizes, not stages.
  const at = geometryOf(createContext(loadRoom(treeWith(0.27)), policy, STRICT, treeWith(0.27)).ctx);
  if (!at) throw new Error("no geometry");
  const stages = sweptStages(at);
  console.log(`swept stages ${stages.length}, distinct sizes ${new Set(stages.map((s) => `${s.w}x${s.h}`)).size}`);
  for (const p of pickSweep(at).problems)
    console.log(`  whole sweep at 0.27: ${p.mode} ${p.problem.selectable} ${p.problem.problem} ${p.problem.other} at ${p.more + 1} sizes`);
  const dir = process.env.PROBE_DIR ?? "left";
  if (dir === "list") {
    for (const x of (process.env.PROBE_XS ?? "0.27").split(",").map(Number)) print(measure(x, baseFindings));
    return;
  }
  if (dir === "depth") {
    for (const x of (process.env.PROBE_XS ?? "0.27").split(",").map(Number))
      for (let i = 0; ; i += 1) {
        const z = Math.round((-0.04 + i * 0.02) * 100) / 100;
        const r = measure(x, baseFindings, z);
        print(r);
        if (!r.onTop) break;
      }
    return;
  }
  const step = dir === "left" ? -0.02 : 0.02;
  for (let i = 0; ; i += 1) {
    const x = Math.round((0.27 + i * step) * 100) / 100;
    const t0 = Date.now();
    const r = measure(x, baseFindings);
    print(r);
    console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    if (!r.onTop) break;
  }
});
```

## The runs

Each run's console lines, filtered with
`grep -E "baseline|box |findings at|swept stages|whole sweep|offset \[|Error|FAIL|^exit "` and stripped of colour
codes. Every run ended `Test Files 1 passed (1)`.

### Along the length, −x to the desk's left end (the brief's direction)

`PROBE_DIR=left npx vitest run test/room/zz-probe-dog-sign-offset.test.ts --reporter=verbose` (in `apps/web`)

```text
baseline, shipped scene without the dog selectable: RG6 problems []
work-desk box {"min":[-0.75,0,-0.6096000059604645],"max":[0.75,1.0709999799728394,0.1924000100135803]}; dog-sign box {"min":[0.14522444174083182,1.07,-0.307860474265403],"max":[0.3947755582591682,1.2453634661436082,-0.19133952573459706]}
desk-screen box {"min":[-0.646000013589859,1.07,-0.5745999958276748],"max":[0.338000013589859,1.694500036239624,-0.2892798479557037]}
laptop-stand box {"min":[0.4200000047683716,1.07,-0.42959999731779097],"max":[0.6799999952316285,1.2060378414392472,-0.189600002682209]}
laptop box {"min":[0.39419998526573186,1.19,-0.4413045986652374],"max":[0.705900001525879,1.4056888097524642,-0.19960000059604643]}
busy-sign box {"min":[-0.7191910492497919,1.07,-0.3105859668331768],"max":[-0.3806117132298654,1.2065000009536744,-0.16768610358990002]}
non-RG6 findings at the estimate [0.27, 0, -0.04]: []
swept stages 7671, distinct sizes 7528
  whole sweep at 0.27: 3D 2 core 4 at 3076 sizes
  whole sweep at 0.27: 3D 2 member 4 at 2349 sizes
  whole sweep at 0.27: 3D 4 core 2 at 3076 sizes
  whole sweep at 0.27: 3D 4 member 2 at 7528 sizes
  whole sweep at 0.27: 2D 2 core 4 at 4293 sizes
  whole sweep at 0.27: 2D 2 member 4 at 3665 sizes
  whole sweep at 0.27: 2D 4 core 2 at 4293 sizes
  whole sweep at 0.27: 2D 4 member 2 at 7528 sizes
offset [0.27, 0, -0.04] · sign x 0.145..0.395 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3212 / 2D 4436 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.25, 0, -0.04] · sign x 0.125..0.375 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.23, 0, -0.04] · sign x 0.105..0.355 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.21, 0, -0.04] · sign x 0.085..0.335 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.19, 0, -0.04] · sign x 0.065..0.315 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.17, 0, -0.04] · sign x 0.045..0.295 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.15, 0, -0.04] · sign x 0.025..0.275 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.13, 0, -0.04] · sign x 0.005..0.255 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.11, 0, -0.04] · sign x -0.015..0.235 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.09, 0, -0.04] · sign x -0.035..0.215 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.0700, 0, -0.04] · sign x -0.055..0.195 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.05, 0, -0.04] · sign x -0.075..0.175 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.03, 0, -0.04] · sign x -0.095..0.155 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.01, 0, -0.04] · sign x -0.115..0.135 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.01, 0, -0.04] · sign x -0.135..0.115 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.03, 0, -0.04] · sign x -0.155..0.095 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.05, 0, -0.04] · sign x -0.175..0.075 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.0700, 0, -0.04] · sign x -0.195..0.055 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.09, 0, -0.04] · sign x -0.215..0.035 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.11, 0, -0.04] · sign x -0.235..0.015 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.13, 0, -0.04] · sign x -0.255..-0.005 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.15, 0, -0.04] · sign x -0.275..-0.025 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.17, 0, -0.04] · sign x -0.295..-0.045 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3517 / 2D 4681 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.19, 0, -0.04] · sign x -0.315..-0.065 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3363 / 2D 4551 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.21, 0, -0.04] · sign x -0.335..-0.085 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2827 / 2D 4072 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.23, 0, -0.04] · sign x -0.355..-0.105 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2381 / 2D 3696 · others: laptop member dog 3D 2157 / 2D 3489 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.25, 0, -0.04] · sign x -0.375..-0.125 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2037 / 2D 3376 · others: laptop member dog 3D 1498 / 2D 2866 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.27, 0, -0.04] · sign x -0.395..-0.145 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 1709 / 2D 3052 · others: laptop member dog 3D 1016 / 2D 2274 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.2900, 0, -0.04] · sign x -0.415..-0.165 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 1420 / 2D 2729 · others: laptop member dog 3D 569 / 2D 1825 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.31, 0, -0.04] · sign x -0.435..-0.185 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 1165 / 2D 2459 · others: laptop member dog 3D 287 / 2D 1331 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.33, 0, -0.04] · sign x -0.455..-0.205 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 905 / 2D 2195 · others: laptop member dog 3D 178 / 2D 1033 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.35, 0, -0.04] · sign x -0.475..-0.225 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 702 / 2D 1964 · others: laptop member dog 3D 75 / 2D 761 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.37, 0, -0.04] · sign x -0.495..-0.245 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 516 / 2D 1715 · others: laptop member dog 3D 30 / 2D 530 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.39, 0, -0.04] · sign x -0.515..-0.265 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 382 / 2D 1474 · others: laptop member dog 3D 0 / 2D 336 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.41, 0, -0.04] · sign x -0.535..-0.285 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 268 / 2D 1291 · others: laptop member dog 3D 0 / 2D 240 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.43, 0, -0.04] · sign x -0.555..-0.305 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 196 / 2D 1070 · others: laptop member dog 3D 0 / 2D 76 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, -0.04] · sign x -0.575..-0.325 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 134 / 2D 922 · others: none · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.47, 0, -0.04] · sign x -0.595..-0.345 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 112 / 2D 801 · others: dog member snowboard 3D 0 / 2D 159 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.49, 0, -0.04] · sign x -0.615..-0.365 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 71 / 2D 670 · others: dog member snowboard 3D 0 / 2D 240 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.51, 0, -0.04] · sign x -0.635..-0.385 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 32 / 2D 550 · others: dog member snowboard 3D 0 / 2D 423 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.53, 0, -0.04] · sign x -0.655..-0.405 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 28 / 2D 455 · others: dog member snowboard 3D 58 / 2D 569 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.5500, 0, -0.04] · sign x -0.675..-0.425 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 0 / 2D 336 · others: dog member snowboard 3D 124 / 2D 812 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.5700, 0, -0.04] · sign x -0.695..-0.445 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 0 / 2D 325 · others: dog member snowboard 3D 200 / 2D 1146 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.59, 0, -0.04] · sign x -0.715..-0.465 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 0 / 2D 240 · others: dog member snowboard 3D 376 / 2D 1540 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.61, 0, -0.04] · sign x -0.735..-0.485 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 0 / 2D 159 · others: dog member snowboard 3D 615 / 2D 1999 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.63, 0, -0.04] · sign x -0.755..-0.505 z -0.308..-0.191 on top NO · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 0 / 2D 159 · others: dog member snowboard 3D 948 / 2D 2500 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
exit 0
```

### Along the length, +x to the desk's right end (supplementary)

`PROBE_DIR=right npx vitest run test/room/zz-probe-dog-sign-offset.test.ts --reporter=verbose`

```text
baseline, shipped scene without the dog selectable: RG6 problems []
work-desk box {"min":[-0.75,0,-0.6096000059604645],"max":[0.75,1.0709999799728394,0.1924000100135803]}; dog-sign box {"min":[0.14522444174083182,1.07,-0.307860474265403],"max":[0.3947755582591682,1.2453634661436082,-0.19133952573459706]}
desk-screen box {"min":[-0.646000013589859,1.07,-0.5745999958276748],"max":[0.338000013589859,1.694500036239624,-0.2892798479557037]}
laptop-stand box {"min":[0.4200000047683716,1.07,-0.42959999731779097],"max":[0.6799999952316285,1.2060378414392472,-0.189600002682209]}
laptop box {"min":[0.39419998526573186,1.19,-0.4413045986652374],"max":[0.705900001525879,1.4056888097524642,-0.19960000059604643]}
busy-sign box {"min":[-0.7191910492497919,1.07,-0.3105859668331768],"max":[-0.3806117132298654,1.2065000009536744,-0.16768610358990002]}
non-RG6 findings at the estimate [0.27, 0, -0.04]: []
swept stages 7671, distinct sizes 7528
  whole sweep at 0.27: 3D 2 core 4 at 3076 sizes
  whole sweep at 0.27: 3D 2 member 4 at 2349 sizes
  whole sweep at 0.27: 3D 4 core 2 at 3076 sizes
  whole sweep at 0.27: 3D 4 member 2 at 7528 sizes
  whole sweep at 0.27: 2D 2 core 4 at 4293 sizes
  whole sweep at 0.27: 2D 2 member 4 at 3665 sizes
  whole sweep at 0.27: 2D 4 core 2 at 4293 sizes
  whole sweep at 0.27: 2D 4 member 2 at 7528 sizes
offset [0.27, 0, -0.04] · sign x 0.145..0.395 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3212 / 2D 4436 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.2900, 0, -0.04] · sign x 0.165..0.415 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2681 / 2D 3990 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.31, 0, -0.04] · sign x 0.185..0.435 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2277 / 2D 3643 · others: laptop member dog 3D 1953 / 2D 3378 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.33, 0, -0.04] · sign x 0.205..0.455 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 1890 / 2D 3279 · others: laptop member dog 3D 1348 / 2D 2733 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.35, 0, -0.04] · sign x 0.225..0.475 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 1591 / 2D 2981 · others: laptop member dog 3D 839 / 2D 2206 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.37, 0, -0.04] · sign x 0.245..0.495 z -0.308..-0.191 on top yes · core over laptop's members 3D 7670 / 2D 7671 · cores overlap 3D 1291 / 2D 2684 · others: laptop member dog 3D 508 / 2D 1742; dog union laptop 3D 1 / 2D 0 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.39, 0, -0.04] · sign x 0.265..0.515 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 1049 / 2D 2382 · others: laptop member dog 3D 271 / 2D 1295 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.41, 0, -0.04] · sign x 0.285..0.535 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 834 / 2D 2126 · others: laptop member dog 3D 163 / 2D 948 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.43, 0, -0.04] · sign x 0.305..0.555 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 629 / 2D 1896 · others: laptop member dog 3D 73 / 2D 682 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.45, 0, -0.04] · sign x 0.325..0.575 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 484 / 2D 1645 · others: laptop member dog 3D 28 / 2D 462 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.47, 0, -0.04] · sign x 0.345..0.595 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 361 / 2D 1442 · others: laptop member dog 3D 0 / 2D 325 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.49, 0, -0.04] · sign x 0.365..0.615 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 260 / 2D 1200 · others: laptop member dog 3D 0 / 2D 159 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.51, 0, -0.04] · sign x 0.385..0.635 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 192 / 2D 1054 · others: laptop member dog 3D 0 / 2D 76 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.53, 0, -0.04] · sign x 0.405..0.655 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 130 / 2D 906 · others: dog member bicycle 3D 0 / 2D 75 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.5500, 0, -0.04] · sign x 0.425..0.675 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 103 / 2D 790 · others: dog member bicycle 3D 0 / 2D 159 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.5700, 0, -0.04] · sign x 0.445..0.695 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 68 / 2D 658 · others: dog member bicycle 3D 0 / 2D 251 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.59, 0, -0.04] · sign x 0.465..0.715 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 30 / 2D 548 · others: dog member bicycle 3D 26 / 2D 443 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.61, 0, -0.04] · sign x 0.485..0.735 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 26 / 2D 443 · others: dog member bicycle 3D 68 / 2D 658 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.63, 0, -0.04] · sign x 0.505..0.755 z -0.308..-0.191 on top NO · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 0 / 2D 336 · others: dog member bicycle 3D 130 / 2D 906 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
exit 0
```

### Along the depth, toward the desk's front edge, at x 0.27 and −0.45 (supplementary)

`PROBE_DIR=depth PROBE_XS=0.27,-0.45 npx vitest run test/room/zz-probe-dog-sign-offset.test.ts --reporter=verbose`

```text
baseline, shipped scene without the dog selectable: RG6 problems []
work-desk box {"min":[-0.75,0,-0.6096000059604645],"max":[0.75,1.0709999799728394,0.1924000100135803]}; dog-sign box {"min":[0.14522444174083182,1.07,-0.307860474265403],"max":[0.3947755582591682,1.2453634661436082,-0.19133952573459706]}
desk-screen box {"min":[-0.646000013589859,1.07,-0.5745999958276748],"max":[0.338000013589859,1.694500036239624,-0.2892798479557037]}
laptop-stand box {"min":[0.4200000047683716,1.07,-0.42959999731779097],"max":[0.6799999952316285,1.2060378414392472,-0.189600002682209]}
laptop box {"min":[0.39419998526573186,1.19,-0.4413045986652374],"max":[0.705900001525879,1.4056888097524642,-0.19960000059604643]}
busy-sign box {"min":[-0.7191910492497919,1.07,-0.3105859668331768],"max":[-0.3806117132298654,1.2065000009536744,-0.16768610358990002]}
non-RG6 findings at the estimate [0.27, 0, -0.04]: []
swept stages 7671, distinct sizes 7528
  whole sweep at 0.27: 3D 2 core 4 at 3076 sizes
  whole sweep at 0.27: 3D 2 member 4 at 2349 sizes
  whole sweep at 0.27: 3D 4 core 2 at 3076 sizes
  whole sweep at 0.27: 3D 4 member 2 at 7528 sizes
  whole sweep at 0.27: 2D 2 core 4 at 4293 sizes
  whole sweep at 0.27: 2D 2 member 4 at 3665 sizes
  whole sweep at 0.27: 2D 4 core 2 at 4293 sizes
  whole sweep at 0.27: 2D 4 member 2 at 7528 sizes
offset [0.27, 0, -0.04] · sign x 0.145..0.395 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3212 / 2D 4436 · others: laptop member dog 3D 2459 / 2D 3808 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, -0.02] · sign x 0.145..0.395 z -0.288..-0.171 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3194 / 2D 4407 · others: laptop member dog 3D 2478 / 2D 3814 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.00] · sign x 0.145..0.395 z -0.268..-0.151 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3142 / 2D 4376 · others: laptop member dog 3D 2490 / 2D 3818 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.02] · sign x 0.145..0.395 z -0.248..-0.131 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3124 / 2D 4342 · others: laptop member dog 3D 2523 / 2D 3822 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.04] · sign x 0.145..0.395 z -0.228..-0.111 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3105 / 2D 4311 · others: laptop member dog 3D 2531 / 2D 3848 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.06] · sign x 0.145..0.395 z -0.208..-0.091 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3069 / 2D 4307 · others: laptop member dog 3D 2542 / 2D 3882 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.08] · sign x 0.145..0.395 z -0.188..-0.071 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 3015 / 2D 4227 · others: laptop member dog 3D 2571 / 2D 3908 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.10] · sign x 0.145..0.395 z -0.168..-0.051 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2936 / 2D 4161 · others: laptop member dog 3D 2601 / 2D 3930 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.12] · sign x 0.145..0.395 z -0.148..-0.031 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2919 / 2D 4128 · others: laptop member dog 3D 2622 / 2D 3954 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.1400] · sign x 0.145..0.395 z -0.128..-0.011 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2881 / 2D 4100 · others: laptop member dog 3D 2630 / 2D 3988 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.16] · sign x 0.145..0.395 z -0.108..0.009 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2854 / 2D 4094 · others: laptop member dog 3D 2666 / 2D 3994 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.18] · sign x 0.145..0.395 z -0.088..0.029 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2820 / 2D 4040 · others: laptop member dog 3D 2676 / 2D 3998 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.20] · sign x 0.145..0.395 z -0.068..0.049 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2786 / 2D 3998 · others: laptop member dog 3D 2702 / 2D 4038 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.22] · sign x 0.145..0.395 z -0.048..0.069 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2772 / 2D 3990 · others: laptop member dog 3D 2721 / 2D 4072 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.24] · sign x 0.145..0.395 z -0.028..0.089 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2734 / 2D 3954 · others: laptop member dog 3D 2763 / 2D 4094 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.26] · sign x 0.145..0.395 z -0.008..0.109 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2688 / 2D 3912 · others: laptop member dog 3D 2777 / 2D 4100 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.2800] · sign x 0.145..0.395 z 0.012..0.129 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2647 / 2D 3882 · others: laptop member dog 3D 2809 / 2D 4126 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.30] · sign x 0.145..0.395 z 0.032..0.149 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2627 / 2D 3846 · others: laptop member dog 3D 2826 / 2D 4161 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.32] · sign x 0.145..0.395 z 0.052..0.169 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2588 / 2D 3818 · others: laptop member dog 3D 2900 / 2D 4223 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.34] · sign x 0.145..0.395 z 0.072..0.189 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2560 / 2D 3808 · others: laptop member dog 3D 2914 / 2D 4250 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.27, 0, 0.36] · sign x 0.145..0.395 z 0.092..0.209 on top NO · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 2543 / 2D 3757 · others: laptop member dog 3D 2919 / 2D 4227 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, -0.04] · sign x -0.575..-0.325 z -0.308..-0.191 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 134 / 2D 922 · others: none · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, -0.02] · sign x -0.575..-0.325 z -0.288..-0.171 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 132 / 2D 908 · others: dog member snowboard 3D 0 / 2D 75 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.00] · sign x -0.575..-0.325 z -0.268..-0.151 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 130 / 2D 906 · others: dog member snowboard 3D 0 / 2D 75 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.02] · sign x -0.575..-0.325 z -0.248..-0.131 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 130 / 2D 906 · others: dog member snowboard 3D 0 / 2D 75 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.04] · sign x -0.575..-0.325 z -0.228..-0.111 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 129 / 2D 897 · others: dog member snowboard 3D 0 / 2D 75 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.06] · sign x -0.575..-0.325 z -0.208..-0.091 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 126 / 2D 892 · others: dog member snowboard 3D 0 / 2D 76 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.08] · sign x -0.575..-0.325 z -0.188..-0.071 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 124 / 2D 812 · others: dog member snowboard 3D 0 / 2D 76 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.10] · sign x -0.575..-0.325 z -0.168..-0.051 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 124 / 2D 812 · others: dog member snowboard 3D 0 / 2D 76 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.12] · sign x -0.575..-0.325 z -0.148..-0.031 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 112 / 2D 801 · others: dog member snowboard 3D 0 / 2D 159 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.1400] · sign x -0.575..-0.325 z -0.128..-0.011 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 110 / 2D 790 · others: dog member snowboard 3D 0 / 2D 159 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.16] · sign x -0.575..-0.325 z -0.108..0.009 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 103 / 2D 790 · others: dog member snowboard 3D 0 / 2D 159 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.18] · sign x -0.575..-0.325 z -0.088..0.029 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 76 / 2D 762 · others: dog member snowboard 3D 0 / 2D 159 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.20] · sign x -0.575..-0.325 z -0.068..0.049 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 75 / 2D 761 · others: dog member snowboard 3D 0 / 2D 159 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.22] · sign x -0.575..-0.325 z -0.048..0.069 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 73 / 2D 682 · others: dog member snowboard 3D 0 / 2D 159 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.24] · sign x -0.575..-0.325 z -0.028..0.089 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 73 / 2D 682 · others: dog member snowboard 3D 0 / 2D 240 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.26] · sign x -0.575..-0.325 z -0.008..0.109 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 73 / 2D 682 · others: dog member snowboard 3D 0 / 2D 240 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.2800] · sign x -0.575..-0.325 z 0.012..0.129 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 68 / 2D 667 · others: dog member snowboard 3D 0 / 2D 240 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.30] · sign x -0.575..-0.325 z 0.032..0.149 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 68 / 2D 658 · others: dog member snowboard 3D 0 / 2D 240 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.32] · sign x -0.575..-0.325 z 0.052..0.169 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 68 / 2D 658 · others: dog member snowboard 3D 0 / 2D 256 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.34] · sign x -0.575..-0.325 z 0.072..0.189 on top yes · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 67 / 2D 657 · others: dog member snowboard 3D 0 / 2D 325 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.45, 0, 0.36] · sign x -0.575..-0.325 z 0.092..0.209 on top NO · core over laptop's members 3D 7671 / 2D 7671 · cores overlap 3D 65 / 2D 579 · others: dog member snowboard 3D 0 / 2D 336 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
exit 0
```

### The `laptop` selectable without the screen (supplementary)

`PROBE_NO_SCREEN=1 PROBE_DIR=list PROBE_XS=0.27,0.17,0.07,-0.03,-0.13,-0.23,-0.33,-0.43 npx vitest run test/room/zz-probe-dog-sign-offset.test.ts --reporter=verbose`

```text
baseline, shipped scene without the dog selectable: RG6 problems ["2D 2 member"]
work-desk box {"min":[-0.75,0,-0.6096000059604645],"max":[0.75,1.0709999799728394,0.1924000100135803]}; dog-sign box {"min":[0.14522444174083182,1.07,-0.307860474265403],"max":[0.3947755582591682,1.2453634661436082,-0.19133952573459706]}
desk-screen box {"min":[-0.646000013589859,1.07,-0.5745999958276748],"max":[0.338000013589859,1.694500036239624,-0.2892798479557037]}
laptop-stand box {"min":[0.4200000047683716,1.07,-0.42959999731779097],"max":[0.6799999952316285,1.2060378414392472,-0.189600002682209]}
laptop box {"min":[0.39419998526573186,1.19,-0.4413045986652374],"max":[0.705900001525879,1.4056888097524642,-0.19960000059604643]}
busy-sign box {"min":[-0.7191910492497919,1.07,-0.3105859668331768],"max":[-0.3806117132298654,1.2065000009536744,-0.16768610358990002]}
non-RG6 findings at the estimate [0.27, 0, -0.04]: []
swept stages 7671, distinct sizes 7528
  whole sweep at 0.27: 3D 2 core 4 at 2181 sizes
  whole sweep at 0.27: 3D 2 member 4 at 1880 sizes
  whole sweep at 0.27: 3D 4 core 2 at 2181 sizes
  whole sweep at 0.27: 3D 4 member 2 at 3658 sizes
  whole sweep at 0.27: 2D 2 core 4 at 3502 sizes
  whole sweep at 0.27: 2D 2 member 1 at 126 sizes
  whole sweep at 0.27: 2D 2 member 4 at 3235 sizes
  whole sweep at 0.27: 2D 4 core 2 at 3502 sizes
  whole sweep at 0.27: 2D 4 member 2 at 4779 sizes
offset [0.27, 0, -0.04] · sign x 0.145..0.395 z -0.308..-0.191 on top yes · core over laptop's members 3D 3801 / 2D 4922 · cores overlap 3D 2285 / 2D 3645 · others: laptop member dog 3D 1955 / 2D 3378; laptop member bicycle 3D 0 / 2D 159 · stages with any RG6 problem 3D 3801 / 2D 4922 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.17, 0, -0.04] · sign x 0.045..0.295 z -0.308..-0.191 on top yes · core over laptop's members 3D 502 / 2D 1742 · cores overlap 3D 838 / 2D 2128 · others: laptop member dog 3D 132 / 2D 920; laptop member bicycle 3D 0 / 2D 159 · stages with any RG6 problem 3D 838 / 2D 2128 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [0.0700, 0, -0.04] · sign x -0.055..0.195 z -0.308..-0.191 on top yes · core over laptop's members 3D 0 / 2D 325 · cores overlap 3D 192 / 2D 1054 · others: laptop member bicycle 3D 0 / 2D 159; laptop member dog 3D 0 / 2D 75 · stages with any RG6 problem 3D 192 / 2D 1054 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.03, 0, -0.04] · sign x -0.155..0.095 z -0.308..-0.191 on top yes · core over laptop's members 3D 0 / 2D 0 · cores overlap 3D 26 / 2D 443 · others: laptop member bicycle 3D 0 / 2D 159 · stages with any RG6 problem 3D 26 / 2D 443 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.13, 0, -0.04] · sign x -0.255..-0.005 z -0.308..-0.191 on top yes · core over laptop's members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 76 · others: laptop member bicycle 3D 0 / 2D 159 · stages with any RG6 problem 3D 0 / 2D 159 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.23, 0, -0.04] · sign x -0.355..-0.105 z -0.308..-0.191 on top yes · core over laptop's members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · others: laptop member bicycle 3D 0 / 2D 159 · stages with any RG6 problem 3D 0 / 2D 159 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.33, 0, -0.04] · sign x -0.455..-0.205 z -0.308..-0.191 on top yes · core over laptop's members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · others: laptop member bicycle 3D 0 / 2D 159 · stages with any RG6 problem 3D 0 / 2D 159 of 7671 · RG6 refuses · new non-RG6 findings: none
offset [-0.43, 0, -0.04] · sign x -0.555..-0.305 z -0.308..-0.191 on top yes · core over laptop's members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · others: laptop member bicycle 3D 0 / 2D 159 · stages with any RG6 problem 3D 0 / 2D 159 of 7671 · RG6 refuses · new non-RG6 findings: none
exit 0
```

## Lint

The lint target, run after the probe was deleted, with this file the only change in the worktree. It fails, but not
on this file: Prettier flags four files that came onto the line before this task's base (d21c8021), each from a
commit of spec 026's implementation, and this task may change none of them:

- `apps/web/src/room/compose/pick.ts` (3d05e01b, T013a GREEN)
- `apps/web/src/room/scene/twin-states.ts` (e2c88b81, T006 GREEN)
- `apps/web/test/room/pet-homes.test.ts` (305a5392, T012 GREEN)
- `apps/web/test/room/pet-states.test.ts` (d0b2f313, T005 RED)

ESLint and tsc passed. The target stops at Prettier, so its later steps (ruff, ruff format, shellcheck) ran on their
own, with the target's own commands, and passed. Prettier passes on this file alone.

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
[warn] apps/web/src/room/compose/pick.ts
[warn] apps/web/src/room/scene/twin-states.ts
[warn] apps/web/test/room/pet-homes.test.ts
[warn] apps/web/test/room/pet-states.test.ts
[warn] Code style issues found in 4 files. Run Prettier with --write to fix.
make: *** [Makefile:231: lint] Error 1
exit 2
```

The target's remaining steps:

```text
$ ruff check .
All checks passed!
exit 0
$ ruff format --check --no-cache --extend-exclude corpus .
822 files already formatted
exit 0
$ shellcheck (the target's file list)
exit 0
$ node_modules/.bin/prettier --check specs/026-twin-pets-dog/dog-sign-offset.md
Checking formatting...
All matched files use Prettier code style!
```

## Off the desk (measure2-026)

**Task**: measure2-026 (night 2026-11-14), off the line, for the page's Q283 · **Base**: ae19ac55 (measure-026's tip) ·
**Changes**: none to any source file, test file, `scene.yaml`, `assets/**`, or human-only path; this section only.

### Q283, in measure-026's words

> measure-026 found that no `mount.offset` along the desk's top gets the dog sign past RG6, so Q281's recommended
> answer, moving the sign along the desk, can't be done. How should the human patch's `dog` selectable get past RG6
> (spec 026, T019)?

Its recommended answer (answered: recommended, the orders file's rule; his to confirm or overturn), in its words:

> keep the `dog` selectable's scene line out of the human patch until a mount for the dog sign off the desk's top
> passes RG6. A worker measures candidate mounts with measure-026's probe and puts the numbers on the page for your
> look: on the back wall either side of the window, on a side wall, or on the floor by the dog's home.

### The answer, in short

**As amended (Q297, patch3-026, 2026-11-15):** the mount in his patch is the right wall's
`{ on: room-shell, anchor: right-wall, offset: [-0.2, 0.4, 0.0375], estimated: true }`, no turn (the table's row "right
wall | [-0.2, 0.4, 0.0375]", 0.98 m from the dog's home; the page's Q297, answered: recommended, his to confirm or
overturn), not the floor point below (Q287). floorrun-026 found the floor sign's core under the "Eat" tile's box for a
3D dinosaur visit (spec 024's `eat-checks`), which this section's probe didn't measure. The text below stands as the
record of the measure.

**The floor by the dog's home passes.** With the dog sign on the room shell's `floor` anchor, on the dog's −x side,
RG6 passes at every supported stage, in 3D and in 2D, with no other finding. The `dog` selectable keeps its own pick
area at every stage, so the carve-out holds it nowhere. The nearest passing mount to the dog's home is `floor`, offset
[0.01, 0, 0.32], 0.32 m from it (sign centre to `figures.dog.home.at`, on the floor's plane). It is at the passing
region's edge: 1 cm further in +x RG6 refuses it at 9 stages in 3D (its core under a HUD box), and 1 cm further
toward the front, at 75 stages in 2D (its core leaves the drawing's view). The candidate for his look is the measured
point one step inside that edge on both sides, **`floor`, offset [0, 0, 0.30], no turn**, 0.34 m from the dog's home.
Its neighbours [0, 0, 0.32] and [−0.05, 0, 0.30] pass, and its nearest refused points are 3 cm away: [0.03, 0, 0.30]
(its core under a HUD box at 10 stages in 3D) and [0, 0, 0.33] (its core leaves the 2D view at 75 stages). The move
itself is T019's, in his patch.

**The side walls pass, but only through FR-064's carve-out.** On either side wall the sign is a side-wall member, so
the `dog` selectable is a side-wall selectable (`sideWallsOf`) and RG6 doesn't refuse it for a missing core: every
side-wall candidate passes RG6. But the carve-out leaves the dog to the "In the room" list at 16 to all 7,671 stages in
3D, and 0 to all 7,671 in 2D. At those stages neither the sign nor the dog figure is pickable (`pick` returns null for a
held selectable's front rectangle too), against FR-014's figure pick wherever the dog stands at home. The nearest of
them to the dog's home, the right wall at room z 0.18 to 0.42, is held at 75 stages in 3D, and stands behind the twin's
figure (box x 0.29 to 1.02, z 0.145 to 0.669). RG6 reads no depth, and the twin has no pick area, so nothing measures
that the twin hides it.

**The back wall beside the window doesn't pass.** The window spans x −1.0 to 1.0 of the wall's −1.0668 to 1.0668, from
y 0.8 to 2.1, so the only wall beside it is 6.7 cm wide, narrower than the 24 cm sign. On the left, every candidate's
core lies over the snowboard's member at every stage. On the right, the bicycle's member (2D from 76 stages, and 3D
too from y 0.35) and a HUD box (3D, 12 to 30 stages) refuse it at every point measured. The closest, [0.9, 0.3, 0.0375]
on `back-wall`, fails at 30 stages in 3D and 76 in 2D.

### Method

measure-026's probe, rebuilt as `apps/web/test/room/zz-probe-dog-sign-mounts.test.ts` (whole below), ran as it did: a
vitest file in `apps/web/test/room/`, with `--reporter=verbose`, after `npm ci --ignore-scripts`, deleted before the
commit. Its changes from measure-026's:

- **The whole mount moves, not its offset.** Each candidate replaces the `dog-sign` placement's `mount` with
  `{ on: room-shell, anchor: <candidate's>, offset: <candidate's>, estimated: true }`, with no turn of its own (the
  desk's `turn: { y: -10 }` is dropped). A side wall needs that: `sideWallOf` counts a member as hung on a wall only
  when its mount turns it about z alone. The other mounts took no turn so all the candidates compare alike. The `dog`
  selectable is added in memory as before (`DOG_SELECTABLE`, `withDog()`'s, `figure: dog`), and nothing touches the
  disk.
- **It counts every problem the dog is in**, not just the laptop's: the stages where the sign's core lies over any
  other selectable's member (`dog member *`), the stages where its core and another's overlap (`dog core *` or
  `* core dog`), every RG6 problem by subject, kind, and other (the selectables it hits), and the stages with any RG6
  problem at all.
- **It counts where the carve-out holds the dog**: the stages where `pickSweep`'s `sideWalls` entry for `dog` lists the
  stage, in 3D (`stages`) and in 2D (`flat`), and whether `sideWallsOf` flags the `dog` selectable.
- **It gives each candidate's distance to the dog's home**: from the sign's box centre to `figures.dog.home.at`
  ([0.30, 0.45]), on the floor's plane (x, z).
- **The baseline for "new non-RG6 findings"** is the shipped scene with the `dog` selectable and the sign on the desk,
  which has none (the first run's second line). No candidate has any.

RG6 passes for a candidate only where no stage has any problem in either mode, as before.

**How the candidates were chosen.** From the boxes of the pieces around each mount (the first run prints them):

- **Back wall** (`back-wall` anchor, at [0, 0, −0.6096], no turn, so its axes are the room's; offset[2] 0.0375, the
  sign's half depth at stylized scale 1.5, sets its back on the wall). The window's box covers x −1.0 to 1.0, y 0.8 to
  2.1, and the desk's x −0.75 to 0.75, up to y 1.07. So the free wall is x ±(0.75 to 1.0668) under the sill: x ±0.9 at
  y 0.3 and 0.55 (the sign is 0.175 tall, so its top stays under 0.8), then 0.85, 0.9, 0.95 at y 0.35 and 0.4 on the
  right, where the first run came close. Two more points stand beside the window at y 1.2, x ±0.93. They overlap the
  window's box, since no 24 cm sign fits in the 6.7 cm there, and no finding refuses that.
- **Left wall** (`left-wall`, at [−1.0668, 0, 0], turned y 90°: its x runs to the room's −z, so offset[0] is −z).
  The chalkboard covers z −0.07 to 0.645 from y 1.17 up; the snowboard z −0.556 to −0.244 from the floor to 1.55; the
  wall art z −0.58 to −0.08 from y 1.8. So the free wall is z −0.24 to 0.6 under y 1.17: z −0.1, 0.1, 0.3, 0.45, each
  at y 0.4 and 0.8.
- **Right wall** (`right-wall`, at [1.0668, 0, 0], turned y −90°: its x runs to the room's +z, so offset[0] is z).
  The bicycle covers z −0.287 to 0.481 from y 0.854 up; the outlet z −0.436 to −0.364 at y 0.93 to 1.05; the helmet on
  the floor x 0.68 to 1.03, z −0.227 to 0.071, up to y 0.2; the twin's figure x 0.29 to 1.02, z 0.145 to 0.669. So the
  free wall is under y 0.85: z −0.45, −0.2, 0, 0.3, each at y 0.4 and 0.65.
- **Floor** (`floor`, at [0, 0, 0], no turn, the room's axes). The dog's box at its home (`dogBoxAt`: 0.8 m along its
  heading of 180°, 0.3 across) covers x 0.15 to 0.45, z 0.05 to 0.85; the desk's front edge is z 0.192; the twin's
  figure covers x 0.29 to 1.02. So the floor by the dog is on its −x side, between the desk and the room's front edge
  (z 0.61): x 0, −0.15, −0.3 at z 0.3 and 0.45; then, since z 0.45 failed in 2D and x 0 passed, a finer grid of x 0.03,
  0, −0.05 at z 0.30 to 0.42 in steps of 0.02; then x 0.01, 0.02 at z 0.32 and x 0, 0.01 at z 0.33, to pin the edge.
  A sign right of x 0.03 would stand in the dog's box.

**The stage counts.** Most rows sweep 7,671 stages, but a few sweep 7,670, 7,666, or 7,662. `sweptStages(g)` is
`supportedStages(g.protect)`: each screen's frame area with the HUD boxes over it reserved, deduplicated by size and
reserved boxes. The dog sign is `frame: true`, so moving it moves what the HUD protects, and so how many stages
deduplicate. Each row's count is out of its own sweep.

**What the problems mean.** RG6's own reasons (`spacing`, `rg.ts`): `member` is a core over another selectable's member
rectangle; `core`, over another's core; `reserved`, "its exclusive core lies under a panel's box or the walking
control's box"; `outside`, "its 44 × 44 core leaves the view" (in 2D, the drawing's view box). Selectables by index: 0
snowboard, 1 bicycle, 2 laptop, 3 chalkboard, 4 dog.

### The table

Counts are stages, "3D / 2D", out of the row's sweep (7,671 unless noted). "Sign's box" is in the room's frame. "Core
over members" counts stages where the sign's core lies over any other selectable's member, and "Cores overlap" stages
where its core and another's overlap; "Problems" lists every RG6 problem by subject, kind, and other. "List-only" counts
the stages where the carve-out holds the dog. Every row has no new finding outside RG6.

| Mount | `mount.offset` | Sign's box (x; y; z) | To the dog's home | Side-wall | Core over members | Cores overlap | Problems (3D / 2D) | List-only | Stages with any RG6 problem | RG6 |
|---|---|---|---:|---|---:|---:|---|---:|---:|---|
| back wall, left | [-0.9, 0.3, 0.0375] | −1.020 to −0.780; 0.300 to 0.475; −0.610 to −0.534 | 1.58 m | no | 7,671 / 7,671 | 0 / 0 | dog member snowboard 7671 / 7671 | 0 / 0 | 7,671 / 7,671 | refuses |
| back wall, left | [-0.9, 0.55, 0.0375] | −1.020 to −0.780; 0.550 to 0.725; −0.610 to −0.534 | 1.58 m | no | 7,671 / 7,671 | 0 / 0 | dog member snowboard 7671 / 7671 | 0 / 0 | 7,671 / 7,671 | refuses |
| back wall, beside the window, left | [-0.93, 1.2, 0.0375] | −1.050 to −0.810; 1.200 to 1.375; −0.610 to −0.534 | 1.60 m | no | 7,671 / 7,671 | 0 / 0 | dog member snowboard 7671 / 7671<br>dog member laptop 283 / 1331<br>dog member chalkboard 1147 / 1896 | 0 / 0 | 7,671 / 7,671 | refuses |
| back wall, right | [0.85, 0.35, 0.0375] | 0.730 to 0.970; 0.350 to 0.525; −0.610 to −0.534 | 1.16 m | no | 26 / 443 | 0 / 0 | dog reserved 12 / 0<br>dog member bicycle 26 / 443 | 0 / 0 | 27 / 443 | refuses |
| back wall, right | [0.85, 0.4, 0.0375] | 0.730 to 0.970; 0.400 to 0.575; −0.610 to −0.534 | 1.16 m | no | 132 / 908 | 0 / 0 | dog member bicycle 132 / 908 | 0 / 0 | 132 / 908 | refuses |
| back wall, right | [0.9, 0.3, 0.0375] | 0.780 to 1.020; 0.300 to 0.475; −0.610 to −0.534 | 1.19 m | no | 0 / 76 | 0 / 0 | dog reserved 30 / 0<br>dog member bicycle 0 / 76 | 0 / 0 | 30 / 76 | refuses |
| back wall, right | [0.9, 0.4, 0.0375] | 0.780 to 1.020; 0.400 to 0.575; −0.610 to −0.534 | 1.19 m | no | 132 / 908 | 0 / 0 | dog member bicycle 132 / 908 | 0 / 0 | 132 / 908 | refuses |
| back wall, right | [0.9, 0.55, 0.0375] | 0.780 to 1.020; 0.550 to 0.725; −0.610 to −0.534 | 1.19 m | no | 2,964 / 4,825 | 0 / 0 | dog member bicycle 2964 / 4825 | 0 / 0 | 2,964 / 4,825 | refuses |
| back wall, right | [0.95, 0.35, 0.0375] | 0.830 to 1.070; 0.350 to 0.525; −0.610 to −0.534 | 1.21 m | no | 26 / 443 | 0 / 0 | dog reserved 13 / 0<br>dog member bicycle 26 / 443 | 0 / 0 | 27 / 443 | refuses |
| back wall, right | [0.95, 0.4, 0.0375] | 0.830 to 1.070; 0.400 to 0.575; −0.610 to −0.534 | 1.21 m | no | 132 / 908 | 0 / 0 | dog member bicycle 132 / 908 | 0 / 0 | 132 / 908 | refuses |
| back wall, beside the window, right | [0.93, 1.2, 0.0375] | 0.810 to 1.050; 1.200 to 1.375; −0.610 to −0.534 | 1.20 m | no | 7,670 / 7,670 (of 7,670) | 0 / 0 | dog member bicycle 7670 / 7670<br>dog member laptop 1593 / 3379 | 0 / 0 | 7,670 / 7,670 | refuses |
| left wall | [0.1, 0.4, 0.0375] | −1.067 to −0.991; 0.400 to 0.575; −0.220 to 0.020 | 1.44 m | yes | 0 / 0 | 0 / 0 | none | 7,671 / 7,671 | 0 / 0 | passes (held everywhere) |
| left wall | [0.1, 0.8, 0.0375] | −1.067 to −0.991; 0.800 to 0.975; −0.220 to 0.020 | 1.44 m | yes | 0 / 0 | 0 / 0 | none | 7,671 / 7,671 | 0 / 0 | passes (held everywhere) |
| left wall | [-0.1, 0.4, 0.0375] | −1.067 to −0.991; 0.400 to 0.575; −0.020 to 0.220 | 1.37 m | yes | 0 / 0 | 0 / 0 | none | 6,474 / 6,590 | 0 / 0 | passes (held) |
| left wall | [-0.1, 0.8, 0.0375] | −1.067 to −0.991; 0.800 to 0.975; −0.020 to 0.220 | 1.37 m | yes | 0 / 0 | 0 / 0 | none | 6,474 / 6,590 | 0 / 0 | passes (held) |
| left wall | [-0.3, 0.4, 0.0375] | −1.067 to −0.991; 0.400 to 0.575; 0.180 to 0.420 | 1.34 m | yes | 0 / 0 | 0 / 0 | none | 3,185 / 3,696 | 0 / 0 | passes (held) |
| left wall | [-0.3, 0.8, 0.0375] | −1.067 to −0.991; 0.800 to 0.975; 0.180 to 0.420 | 1.34 m | yes | 0 / 0 | 0 / 0 | none | 3,225 / 3,728 (of 7,666) | 0 / 0 | passes (held) |
| left wall | [-0.45, 0.4, 0.0375] | −1.067 to −0.991; 0.400 to 0.575; 0.330 to 0.570 | 1.33 m | yes | 0 / 0 | 0 / 0 | none | 1,624 / 1,998 (of 7,666) | 0 / 0 | passes (held) |
| left wall | [-0.45, 0.8, 0.0375] | −1.067 to −0.991; 0.800 to 0.975; 0.330 to 0.570 | 1.33 m | yes | 0 / 0 | 0 / 0 | none | 2,100 / 2,824 (of 7,662) | 0 / 0 | passes (held) |
| right wall | [-0.45, 0.4, 0.0375] | 0.991 to 1.067; 0.400 to 0.575; −0.570 to −0.330 | 1.16 m | yes | 0 / 0 | 0 / 0 | none | 68 / 658 | 0 / 0 | passes (held) |
| right wall | [-0.45, 0.65, 0.0375] | 0.991 to 1.067; 0.650 to 0.825; −0.570 to −0.330 | 1.16 m | yes | 0 / 0 | 0 / 0 | none | 7,151 / 7,671 | 0 / 0 | passes (held) |
| right wall | [-0.2, 0.4, 0.0375] | 0.991 to 1.067; 0.400 to 0.575; −0.320 to −0.080 | 0.98 m | yes | 0 / 0 | 0 / 0 | none | 16 / 240 | 0 / 0 | passes (held) |
| right wall | [-0.2, 0.65, 0.0375] | 0.991 to 1.067; 0.650 to 0.825; −0.320 to −0.080 | 0.98 m | yes | 0 / 0 | 0 / 0 | none | 6,414 / 6,958 | 0 / 0 | passes (held) |
| right wall | [0, 0.4, 0.0375] | 0.991 to 1.067; 0.400 to 0.575; −0.120 to 0.120 | 0.86 m | yes | 0 / 0 | 0 / 0 | none | 40 / 75 | 0 / 0 | passes (held) |
| right wall | [0, 0.65, 0.0375] | 0.991 to 1.067; 0.650 to 0.825; −0.120 to 0.120 | 0.86 m | yes | 0 / 0 | 0 / 0 | none | 5,156 / 6,048 | 0 / 0 | passes (held) |
| right wall, behind the twin | [0.3, 0.4, 0.0375] | 0.991 to 1.067; 0.400 to 0.575; 0.180 to 0.420 | 0.74 m | yes | 0 / 0 | 0 / 0 | none | 75 / 0 | 0 / 0 | passes (held) |
| right wall, behind the twin | [0.3, 0.65, 0.0375] | 0.991 to 1.067; 0.650 to 0.825; 0.180 to 0.420 | 0.74 m | yes | 0 / 0 | 0 / 0 | none | 3,129 / 4,315 | 0 / 0 | passes (held) |
| floor | [0.03, 0, 0.3] | −0.090 to 0.150; 0 to 0.175; 0.262 to 0.338 | 0.31 m | no | 0 / 0 | 0 / 0 | dog reserved 10 / 0 | 0 / 0 | 10 / 0 | refuses |
| floor | [0.03, 0, 0.32] | −0.090 to 0.150; 0 to 0.175; 0.282 to 0.358 | 0.30 m | no | 0 / 0 | 0 / 0 | dog reserved 11 / 0 | 0 / 0 | 11 / 0 | refuses |
| floor | [0.03, 0, 0.34] | −0.090 to 0.150; 0 to 0.175; 0.302 to 0.378 | 0.29 m | no | 0 / 0 | 0 / 0 | dog reserved 11 / 0<br>dog outside 0 / 75 | 0 / 0 | 11 / 75 | refuses |
| floor | [0.03, 0, 0.36] | −0.090 to 0.150; 0 to 0.175; 0.322 to 0.398 | 0.28 m | no | 0 / 0 | 0 / 0 | dog reserved 11 / 0<br>dog outside 0 / 75 | 0 / 0 | 11 / 75 (of 7,670) | refuses |
| floor | [0.03, 0, 0.38] | −0.090 to 0.150; 0 to 0.175; 0.342 to 0.418 | 0.28 m | no | 0 / 0 | 0 / 0 | dog reserved 11 / 0<br>dog outside 0 / 158 | 0 / 0 | 11 / 158 (of 7,670) | refuses |
| floor | [0.03, 0, 0.4] | −0.090 to 0.150; 0 to 0.175; 0.362 to 0.438 | 0.27 m | no | 0 / 0 | 0 / 0 | dog reserved 11 / 0<br>dog outside 0 / 158 | 0 / 0 | 11 / 158 (of 7,670) | refuses |
| floor | [0.03, 0, 0.42] | −0.090 to 0.150; 0 to 0.175; 0.382 to 0.458 | 0.27 m | no | 0 / 0 | 0 / 0 | dog reserved 11 / 0<br>dog outside 0 / 239 | 0 / 0 | 11 / 239 (of 7,670) | refuses |
| floor | [0.02, 0, 0.32] | −0.100 to 0.140; 0 to 0.175; 0.282 to 0.358 | 0.31 m | no | 0 / 0 | 0 / 0 | dog reserved 9 / 0 | 0 / 0 | 9 / 0 | refuses |
| **floor, the nearest passing** | **[0.01, 0, 0.32]** | −0.110 to 0.130; 0 to 0.175; 0.282 to 0.358 | **0.32 m** | no | 0 / 0 | 0 / 0 | none | 0 / 0 | 0 / 0 | **passes** |
| floor | [0.01, 0, 0.33] | −0.110 to 0.130; 0 to 0.175; 0.292 to 0.368 | 0.31 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 75 | 0 / 0 | 0 / 75 | refuses |
| **floor, the candidate** | **[0, 0, 0.3]** | −0.120 to 0.120; 0 to 0.175; 0.262 to 0.338 | **0.34 m** | no | 0 / 0 | 0 / 0 | none | 0 / 0 | 0 / 0 | **passes** |
| floor | [0, 0, 0.32] | −0.120 to 0.120; 0 to 0.175; 0.282 to 0.358 | 0.33 m | no | 0 / 0 | 0 / 0 | none | 0 / 0 | 0 / 0 | passes |
| floor | [0, 0, 0.33] | −0.120 to 0.120; 0 to 0.175; 0.292 to 0.368 | 0.32 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 75 | 0 / 0 | 0 / 75 | refuses |
| floor | [0, 0, 0.34] | −0.120 to 0.120; 0 to 0.175; 0.302 to 0.378 | 0.32 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 75 | 0 / 0 | 0 / 75 | refuses |
| floor | [0, 0, 0.36] | −0.120 to 0.120; 0 to 0.175; 0.322 to 0.398 | 0.31 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 75 | 0 / 0 | 0 / 75 (of 7,670) | refuses |
| floor | [0, 0, 0.38] | −0.120 to 0.120; 0 to 0.175; 0.342 to 0.418 | 0.31 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 158 | 0 / 0 | 0 / 158 (of 7,670) | refuses |
| floor | [0, 0, 0.4] | −0.120 to 0.120; 0 to 0.175; 0.362 to 0.438 | 0.30 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 158 | 0 / 0 | 0 / 158 (of 7,670) | refuses |
| floor | [0, 0, 0.42] | −0.120 to 0.120; 0 to 0.175; 0.382 to 0.458 | 0.30 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 239 | 0 / 0 | 0 / 239 (of 7,670) | refuses |
| floor | [0, 0, 0.45] | −0.120 to 0.120; 0 to 0.175; 0.412 to 0.488 | 0.30 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 335 | 0 / 0 | 0 / 335 (of 7,670) | refuses |
| floor | [-0.05, 0, 0.3] | −0.170 to 0.070; 0 to 0.175; 0.262 to 0.338 | 0.38 m | no | 0 / 0 | 0 / 0 | none | 0 / 0 | 0 / 0 | passes |
| floor | [-0.05, 0, 0.32] | −0.170 to 0.070; 0 to 0.175; 0.282 to 0.358 | 0.37 m | no | 0 / 0 | 0 / 0 | none | 0 / 0 | 0 / 0 | passes |
| floor | [-0.05, 0, 0.34] | −0.170 to 0.070; 0 to 0.175; 0.302 to 0.378 | 0.37 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 75 | 0 / 0 | 0 / 75 | refuses |
| floor | [-0.05, 0, 0.36] | −0.170 to 0.070; 0 to 0.175; 0.322 to 0.398 | 0.36 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 75 | 0 / 0 | 0 / 75 (of 7,670) | refuses |
| floor | [-0.05, 0, 0.38] | −0.170 to 0.070; 0 to 0.175; 0.342 to 0.418 | 0.36 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 158 | 0 / 0 | 0 / 158 (of 7,670) | refuses |
| floor | [-0.05, 0, 0.4] | −0.170 to 0.070; 0 to 0.175; 0.362 to 0.438 | 0.35 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 158 | 0 / 0 | 0 / 158 (of 7,670) | refuses |
| floor | [-0.05, 0, 0.42] | −0.170 to 0.070; 0 to 0.175; 0.382 to 0.458 | 0.35 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 239 | 0 / 0 | 0 / 239 (of 7,670) | refuses |
| floor | [-0.15, 0, 0.3] | −0.270 to −0.030; 0 to 0.175; 0.262 to 0.338 | 0.47 m | no | 0 / 0 | 0 / 0 | none | 0 / 0 | 0 / 0 | passes |
| floor | [-0.15, 0, 0.45] | −0.270 to −0.030; 0 to 0.175; 0.412 to 0.488 | 0.45 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 336 | 0 / 0 | 0 / 336 | refuses |
| floor | [-0.3, 0, 0.3] | −0.420 to −0.180; 0 to 0.175; 0.262 to 0.338 | 0.62 m | no | 0 / 0 | 0 / 0 | none | 0 / 0 | 0 / 0 | passes |
| floor | [-0.3, 0, 0.45] | −0.420 to −0.180; 0 to 0.175; 0.412 to 0.488 | 0.60 m | no | 0 / 0 | 0 / 0 | dog outside 0 / 336 | 0 / 0 | 0 / 336 | refuses |

### The candidate, for his look

**`dog-sign`'s mount: `{ on: room-shell, anchor: floor, offset: [0, 0, 0.3], estimated: true }`**, no turn, the sign
standing on the floor beside the dog, facing the room's front. RG6 passes at all 7,671 supported stages in 3D and 2D,
and the `dog` selectable keeps its pick area at every one, so the carve-out never holds the sign or the figure. The
nearest passing point, [0.01, 0, 0.32], is 2 cm nearer, but it is on the passing region's edge.

What this measurement doesn't settle, each for his look or for T019:

- **The look.** A 17.5 cm desk sign stands on the floor, its foot 3 cm from the dog's box (x 0.12 to its 0.15) and 7
  cm in front of the desk's front edge. The catalog's `name` ("Desk sign: my dog thinks i'm cool") and its work order's measurement
  ("Where the sign stands on the desk") would no longer describe it. The turn is unmeasured: the desk's y −10° was
  dropped for every candidate.
- **Anything RG6 doesn't read.** The probe checked RG6 and every other compose finding (none new). It didn't run the
  room's tests. A placement on the floor may be an obstacle for spec 008's walking view and spec 025's chase run, whose
  property test holds FR-007 on this floor (`figures.chase`'s comment). T019's small tests would show it.
- **The move.** It is T019's, in his patch, with the `dog` selectable's line. The dependency in `tasks.md` (T013a's RG6
  result recorded, with no refusal open on the page) stays open until he takes a mount on the page.

The page's new question asks for that look, with this candidate as its recommended answer (`/night/io/out/questions.md`).

### The probe's source, whole

`apps/web/test/room/zz-probe-dog-sign-mounts.test.ts`, as it ran for every run below, then deleted:

```ts
// SCRATCH PROBE (measure2-026, Q283), never committed: measure-026's probe, with the `dog` selectable added to the
// shipped scene in memory as dog-pick.test.ts's withDog() adds it, and the dog sign's whole mount moved off the desk's
// top: to the back wall beside the desk under the window, to either side wall, or to the floor by the dog's home.
// Counted per supported stage, in 3D and in 2D, with RG6's own sweep (pickSweep).
import { it } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeOptions } from "../../build/room/compose";
import { createContext } from "../../build/room/checks/family";
import { geometryOf, pickSweep, sideWallsOf, sweptStages } from "../../build/room/checks/rg";
import { loadRoom } from "../../build/room/load";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { REPO } from "../helpers/room";

const SCENE_PATH = "apps/web/room/scene.yaml";
const STRICT: ComposeOptions = { mode: "strict", drafts: false };
const DOG_SELECTABLE = {
  id: "dog",
  name: "Dog",
  members: ["dog-sign"],
  figure: "dog",
  action: { talk: { topic: "hobbies-and-travel", lead: "The dog first." } },
};
const DOG = "4"; // its index in selectables, after snowboard 0, bicycle 1, laptop 2, chalkboard 3
const NAMES: Record<string, string> = { "0": "snowboard", "1": "bicycle", "2": "laptop", "3": "chalkboard", "4": "dog" };
const HOME: [number, number] = [0.3, 0.45]; // figures.dog.home.at, the room's x and z

type Mount = { on: string; anchor: string; offset: number[]; turn?: { x?: number; y?: number; z?: number } };
type Doc = { selectables: unknown[]; placements: { id: string; mount?: Mount }[] };

/** A candidate mount: a group, the shell's anchor, the offset in that anchor's frame, and a turn about y. */
interface Candidate {
  group: string;
  anchor: "back-wall" | "left-wall" | "right-wall" | "floor";
  offset: [number, number, number];
  turnY?: number;
}

// The sign's half depth at stylized scale 1.5 is 0.0375 m: a wall mount's offset[2] of 0.0375 sets its back on the wall.
const OUT = 0.0375;
const CANDIDATES: Candidate[] = [
  // Back wall, frame = the room's axes; the window spans x −1.0 to 1.0, y 0.8 to 2.1, the desk x −0.75 to 0.75 up to
  // y 1.07: the free strips are x ±(0.75 to 1.0668) under the sill, and 0.0668 m beside the window's bounds above it.
  ...[-0.9, 0.9].flatMap((x) =>
    [0.3, 0.55].map((y): Candidate => ({ group: "back", anchor: "back-wall", offset: [x, y, OUT] })),
  ),
  ...[-0.93, 0.93].map((x): Candidate => ({ group: "back", anchor: "back-wall", offset: [x, 1.2, OUT] })),
  // Left wall: its frame's x runs to the room's −z, so offset[0] = −z. Free under the chalkboard (y < 1.17), in front of
  // the snowboard (z > −0.24).
  ...[-0.1, 0.1, 0.3, 0.45].flatMap((z) =>
    [0.4, 0.8].map((y): Candidate => ({ group: "left", anchor: "left-wall", offset: [-z, y, OUT] })),
  ),
  // Right wall: its frame's x runs to the room's +z, so offset[0] = z. Free under the bicycle (y < 0.85); the outlet at
  // z −0.4, y 0.99; the helmet on the floor at z −0.08; the twin's figure stands in front of z 0.15 to 0.67.
  ...[-0.45, -0.2, 0.0, 0.3].flatMap((z) =>
    [0.4, 0.65].map((y): Candidate => ({ group: "right", anchor: "right-wall", offset: [z, y, OUT] })),
  ),
  // Floor, frame = the room's axes: the dog's box at its home is x 0.15 to 0.45, z 0.05 to 0.85; the desk's front edge
  // z 0.19; the twin's figure x 0.29 to 1.02. So the floor beside the dog is on its −x side.
  ...[0.0, -0.15, -0.3].flatMap((x) =>
    [0.3, 0.45].map((z): Candidate => ({ group: "floor", anchor: "floor", offset: [x, 0, z] })),
  ),
];

const base = fileTree(REPO);
const sceneText = new TextDecoder().decode(base.read(SCENE_PATH) ?? new Uint8Array());
const policy = readRoomPolicy({ env: {}, root: REPO });

function treeWith(c: Candidate | null, withDog = true): Tree {
  const doc = parse(sceneText) as Doc;
  if (withDog) doc.selectables = [...doc.selectables, DOG_SELECTABLE];
  if (c !== null) {
    const sign = doc.placements.find((p) => p.id === "dog-sign");
    if (!sign?.mount) throw new Error("no dog-sign mount");
    const mount: Mount = { on: "room-shell", anchor: c.anchor, offset: [...c.offset] };
    if (c.turnY) mount.turn = { y: c.turnY };
    sign.mount = { ...mount, estimated: true } as Mount;
  }
  return overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(doc))]]));
}

const findingKeys = (tree: Tree): string[] =>
  compose(tree, policy, STRICT)
    .findings.filter((f) => f.rule !== "RG6")
    .map((f) => `${f.rule} ${f.path}: ${f.reason}`);

type Pair = { d3: number; d2: number };
const pair = (): Pair => ({ d3: 0, d2: 0 });

function measure(c: Candidate, baseFindings: Set<string>): string {
  const tree = treeWith(c);
  const g = geometryOf(createContext(loadRoom(tree), policy, STRICT, tree).ctx);
  if (!g) throw new Error("no geometry");
  const box = g.boxes.get("dog-sign");
  if (!box) throw new Error("no dog-sign box");
  const sideWall = sideWallsOf(g)[Number(DOG)] ?? false;
  const stages = sweptStages(g);
  const signMember = pair(); // the sign's core over another selectable's members
  const coresOverlap = pair(); // the dog's core and another's, either way
  const held = pair(); // the carve-out leaves the dog to the list
  const any = pair();
  const kinds = new Map<string, Pair>();
  for (const stage of stages) {
    const sweep = pickSweep(g, [stage]);
    const seen = { d3: new Set<string>(), d2: new Set<string>() };
    for (const p of sweep.problems) {
      const mode = p.mode === "3D" ? "d3" : "d2";
      const { selectable: s, problem: kind, other: o } = p.problem;
      seen[mode].add(`${NAMES[s] ?? s} ${kind} ${o === null ? "-" : (NAMES[o] ?? o)}`);
      if (s === DOG && kind === "member") seen[mode].add("#member");
      if (kind === "core" && (s === DOG || o === DOG)) seen[mode].add("#core");
    }
    const dogHeld = sweep.sideWalls.find((w) => w.id === "dog");
    if (dogHeld && dogHeld.stages.length > 0) held.d3 += 1;
    if (dogHeld && dogHeld.flat.length > 0) held.d2 += 1;
    for (const mode of ["d3", "d2"] as const) {
      if (seen[mode].size > 0) any[mode] += 1;
      for (const k of seen[mode]) {
        if (k === "#member") signMember[mode] += 1;
        else if (k === "#core") coresOverlap[mode] += 1;
        else {
          const n = kinds.get(k) ?? pair();
          n[mode] += 1;
          kinds.set(k, n);
        }
      }
    }
  }
  const findings = findingKeys(tree).filter((f) => !baseFindings.has(f));
  const cx = (box.min[0] + box.max[0]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  const dist = Math.hypot(cx - HOME[0], cz - HOME[1]);
  const passes = any.d3 === 0 && any.d2 === 0;
  const f3 = (n: number): string => n.toFixed(3);
  return [
    `${c.group} ${c.anchor} offset [${c.offset.join(", ")}]${c.turnY ? ` turn y ${c.turnY}` : ""}`,
    `sign x ${f3(box.min[0])}..${f3(box.max[0])} y ${f3(box.min[1])}..${f3(box.max[1])} z ${f3(box.min[2])}..${f3(box.max[2])}`,
    `to the dog's home ${dist.toFixed(2)} m`,
    `side-wall ${sideWall ? "yes" : "no"}`,
    `sign's core over members 3D ${signMember.d3} / 2D ${signMember.d2}`,
    `cores overlap 3D ${coresOverlap.d3} / 2D ${coresOverlap.d2}`,
    `problems: ${[...kinds].map(([k, n]) => `${k} 3D ${n.d3} / 2D ${n.d2}`).join("; ") || "none"}`,
    `list-only (held) 3D ${held.d3} / 2D ${held.d2}`,
    `stages with any RG6 problem 3D ${any.d3} / 2D ${any.d2} of ${stages.length}`,
    `RG6 ${passes ? "PASSES" : "refuses"}`,
    `new non-RG6 findings: ${findings.length === 0 ? "none" : findings.join(" | ")}`,
  ].join(" · ");
}

it("measures Q283's candidate mounts", { timeout: 3_600_000 }, () => {
  const bareTree = treeWith(null, false);
  const bare = geometryOf(createContext(loadRoom(bareTree), policy, STRICT, bareTree).ctx);
  if (!bare) throw new Error("no geometry");
  const bareProblems = pickSweep(bare).problems.map((p) => `${p.mode} ${p.problem.selectable} ${p.problem.problem}`);
  console.log(`baseline, shipped scene without the dog selectable: RG6 problems ${JSON.stringify(bareProblems)}`);
  const baseFindings = new Set(findingKeys(treeWith(null)));
  console.log(`non-RG6 findings with the dog selectable, sign on the desk: ${JSON.stringify([...baseFindings])}`);
  for (const id of ["snowboard", "bicycle", "chalkboard", "wall-outlet", "helmet", "twin-figure", "wall-window"])
    console.log(`${id} box ${JSON.stringify(bare.boxes.get(id))}`);
  const groups = (process.env.PROBE_GROUPS ?? "back,left,right,floor").split(",");
  const extra = process.env.PROBE_EXTRA; // "group:anchor:x,y,z[:turnY]" entries joined by ";"
  const list: Candidate[] = extra
    ? extra.split(";").map((e) => {
        const [group, anchor, xyz, turn] = e.split(":");
        const offset = (xyz ?? "").split(",").map(Number) as [number, number, number];
        return { group: group ?? "extra", anchor: anchor as Candidate["anchor"], offset, turnY: turn ? Number(turn) : undefined };
      })
    : CANDIDATES.filter((c) => groups.includes(c.group));
  for (const c of list) {
    const t0 = Date.now();
    console.log(measure(c, baseFindings));
    console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
});
```

### The runs

Each run in `apps/web`, its console stripped of colour codes (`sed 's/\x1b\[[0-9;]*m//g'`) and filtered as each says.
Every run ended `Test Files 1 passed (1)`. One candidate took about 9 to 11 s.

#### Run 1: the back wall

`PROBE_GROUPS=back npx vitest run test/room/zz-probe-dog-sign-mounts.test.ts --reporter=verbose`, filtered with
`grep -E "baseline|box |findings|offset \[|\(|Error|FAIL|Test Files|passed|failed"`:

```text
baseline, shipped scene without the dog selectable: RG6 problems []
non-RG6 findings with the dog selectable, sign on the desk: []
snowboard box {"min":[-1.0667915213882924,2.384185793236071e-8,-0.5561984419822693],"max":[-0.8689360749006272,1.549999976158142,-0.24380155801773074]}
bicycle box {"min":[0.8890199937701225,0.8535949492454529,-0.28713758745193485],"max":[1.0645800062298776,2.1264050507545473,0.48120499691963203]}
chalkboard box {"min":[-1.0668,1.17319997549057,-0.07000003328323362],"max":[-1.0071999969363212,2.12680002450943,0.6452000332832337]}
wall-outlet box {"min":[1.0216545517027378,0.9289999993145466,-0.43599999845027926],"max":[1.0668,1.0510000006854534,-0.3640000015497208]}
helmet box {"min":[0.6786071685656572,0,-0.22676301256811854],"max":[1.0291768522599658,0.19887010753154755,0.07120928915623441]}
twin-figure box {"min":[0.29000000000000004,0,0.14499999999999996],"max":[1.02,1.82,0.669]}
wall-window box {"min":[-1,0.8000000238418579,-0.6096],"max":[1,2.0999999761581423,-0.5487999989748001]}
back back-wall offset [-0.9, 0.3, 0.0375] · sign x -1.020..-0.780 y 0.300..0.475 z -0.610..-0.534 · to the dog's home 1.58 m · side-wall no · sign's core over members 3D 7671 / 2D 7671 · cores overlap 3D 0 / 2D 0 · problems: dog member snowboard 3D 7671 / 2D 7671 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
  (10.6 s)
back back-wall offset [-0.9, 0.55, 0.0375] · sign x -1.020..-0.780 y 0.550..0.725 z -0.610..-0.534 · to the dog's home 1.58 m · side-wall no · sign's core over members 3D 7671 / 2D 7671 · cores overlap 3D 0 / 2D 0 · problems: dog member snowboard 3D 7671 / 2D 7671 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
  (10.1 s)
back back-wall offset [0.9, 0.3, 0.0375] · sign x 0.780..1.020 y 0.300..0.475 z -0.610..-0.534 · to the dog's home 1.19 m · side-wall no · sign's core over members 3D 0 / 2D 76 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 30 / 2D 0; dog member bicycle 3D 0 / 2D 76 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 30 / 2D 76 of 7671 · RG6 refuses · new non-RG6 findings: none
  (9.3 s)
back back-wall offset [0.9, 0.55, 0.0375] · sign x 0.780..1.020 y 0.550..0.725 z -0.610..-0.534 · to the dog's home 1.19 m · side-wall no · sign's core over members 3D 2964 / 2D 4825 · cores overlap 3D 0 / 2D 0 · problems: dog member bicycle 3D 2964 / 2D 4825 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 2964 / 2D 4825 of 7671 · RG6 refuses · new non-RG6 findings: none
  (9.7 s)
back back-wall offset [-0.93, 1.2, 0.0375] · sign x -1.050..-0.810 y 1.200..1.375 z -0.610..-0.534 · to the dog's home 1.60 m · side-wall no · sign's core over members 3D 7671 / 2D 7671 · cores overlap 3D 0 / 2D 0 · problems: dog member snowboard 3D 7671 / 2D 7671; dog member laptop 3D 283 / 2D 1331; dog member chalkboard 3D 1147 / 2D 1896 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 7671 / 2D 7671 of 7671 · RG6 refuses · new non-RG6 findings: none
  (9.0 s)
back back-wall offset [0.93, 1.2, 0.0375] · sign x 0.810..1.050 y 1.200..1.375 z -0.610..-0.534 · to the dog's home 1.20 m · side-wall no · sign's core over members 3D 7670 / 2D 7670 · cores overlap 3D 0 / 2D 0 · problems: dog member bicycle 3D 7670 / 2D 7670; dog member laptop 3D 1593 / 2D 3379 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 7670 / 2D 7670 of 7670 · RG6 refuses · new non-RG6 findings: none
  (9.4 s)
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  120.31s (tests 99%, import 1%, transform 1%)
```

#### Run 2: the side walls and the floor

`PROBE_GROUPS=left,right,floor npx vitest run test/room/zz-probe-dog-sign-mounts.test.ts --reporter=verbose`, filtered
with `grep -E "offset \[|Error|FAIL|Test Files|passed|failed"` (the baseline lines are run 1's):

```text
left left-wall offset [0.1, 0.4, 0.0375] · sign x -1.067..-0.991 y 0.400..0.575 z -0.220..0.020 · to the dog's home 1.44 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 7671 / 2D 7671 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
left left-wall offset [0.1, 0.8, 0.0375] · sign x -1.067..-0.991 y 0.800..0.975 z -0.220..0.020 · to the dog's home 1.44 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 7671 / 2D 7671 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
left left-wall offset [-0.1, 0.4, 0.0375] · sign x -1.067..-0.991 y 0.400..0.575 z -0.020..0.220 · to the dog's home 1.37 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 6474 / 2D 6590 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
left left-wall offset [-0.1, 0.8, 0.0375] · sign x -1.067..-0.991 y 0.800..0.975 z -0.020..0.220 · to the dog's home 1.37 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 6474 / 2D 6590 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
left left-wall offset [-0.3, 0.4, 0.0375] · sign x -1.067..-0.991 y 0.400..0.575 z 0.180..0.420 · to the dog's home 1.34 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 3185 / 2D 3696 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
left left-wall offset [-0.3, 0.8, 0.0375] · sign x -1.067..-0.991 y 0.800..0.975 z 0.180..0.420 · to the dog's home 1.34 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 3225 / 2D 3728 · stages with any RG6 problem 3D 0 / 2D 0 of 7666 · RG6 PASSES · new non-RG6 findings: none
left left-wall offset [-0.45, 0.4, 0.0375] · sign x -1.067..-0.991 y 0.400..0.575 z 0.330..0.570 · to the dog's home 1.33 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 1624 / 2D 1998 · stages with any RG6 problem 3D 0 / 2D 0 of 7666 · RG6 PASSES · new non-RG6 findings: none
left left-wall offset [-0.45, 0.8, 0.0375] · sign x -1.067..-0.991 y 0.800..0.975 z 0.330..0.570 · to the dog's home 1.33 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 2100 / 2D 2824 · stages with any RG6 problem 3D 0 / 2D 0 of 7662 · RG6 PASSES · new non-RG6 findings: none
right right-wall offset [-0.45, 0.4, 0.0375] · sign x 0.991..1.067 y 0.400..0.575 z -0.570..-0.330 · to the dog's home 1.16 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 68 / 2D 658 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
right right-wall offset [-0.45, 0.65, 0.0375] · sign x 0.991..1.067 y 0.650..0.825 z -0.570..-0.330 · to the dog's home 1.16 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 7151 / 2D 7671 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
right right-wall offset [-0.2, 0.4, 0.0375] · sign x 0.991..1.067 y 0.400..0.575 z -0.320..-0.080 · to the dog's home 0.98 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 16 / 2D 240 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
right right-wall offset [-0.2, 0.65, 0.0375] · sign x 0.991..1.067 y 0.650..0.825 z -0.320..-0.080 · to the dog's home 0.98 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 6414 / 2D 6958 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
right right-wall offset [0, 0.4, 0.0375] · sign x 0.991..1.067 y 0.400..0.575 z -0.120..0.120 · to the dog's home 0.86 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 40 / 2D 75 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
right right-wall offset [0, 0.65, 0.0375] · sign x 0.991..1.067 y 0.650..0.825 z -0.120..0.120 · to the dog's home 0.86 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 5156 / 2D 6048 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
right right-wall offset [0.3, 0.4, 0.0375] · sign x 0.991..1.067 y 0.400..0.575 z 0.180..0.420 · to the dog's home 0.74 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 75 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
right right-wall offset [0.3, 0.65, 0.0375] · sign x 0.991..1.067 y 0.650..0.825 z 0.180..0.420 · to the dog's home 0.74 m · side-wall yes · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 3129 / 2D 4315 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
floor floor offset [0, 0, 0.3] · sign x -0.120..0.120 y 0.000..0.175 z 0.262..0.338 · to the dog's home 0.34 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
floor floor offset [0, 0, 0.45] · sign x -0.120..0.120 y 0.000..0.175 z 0.412..0.488 · to the dog's home 0.30 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 335 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 335 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [-0.15, 0, 0.3] · sign x -0.270..-0.030 y 0.000..0.175 z 0.262..0.338 · to the dog's home 0.47 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
floor floor offset [-0.15, 0, 0.45] · sign x -0.270..-0.030 y 0.000..0.175 z 0.412..0.488 · to the dog's home 0.45 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 336 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 336 of 7671 · RG6 refuses · new non-RG6 findings: none
floor floor offset [-0.3, 0, 0.3] · sign x -0.420..-0.180 y 0.000..0.175 z 0.262..0.338 · to the dog's home 0.62 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
floor floor offset [-0.3, 0, 0.45] · sign x -0.420..-0.180 y 0.000..0.175 z 0.412..0.488 · to the dog's home 0.60 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 336 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 336 of 7671 · RG6 refuses · new non-RG6 findings: none
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

#### Run 3: the floor beside the dog, finer

`PROBE_EXTRA` built as `floor:floor:<x>,0,<z>` for x in 0.03, 0, −0.05 and z in 0.3 to 0.42 by 0.02, joined by `;`,
then the same command, filtered as run 2:

```text
floor floor offset [0.03, 0, 0.3] · sign x -0.090..0.150 y 0.000..0.175 z 0.262..0.338 · to the dog's home 0.31 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 10 / 2D 0 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 10 / 2D 0 of 7671 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0.03, 0, 0.32] · sign x -0.090..0.150 y 0.000..0.175 z 0.282..0.358 · to the dog's home 0.30 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 11 / 2D 0 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 11 / 2D 0 of 7671 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0.03, 0, 0.34] · sign x -0.090..0.150 y 0.000..0.175 z 0.302..0.378 · to the dog's home 0.29 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 11 / 2D 0; dog outside - 3D 0 / 2D 75 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 11 / 2D 75 of 7671 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0.03, 0, 0.36] · sign x -0.090..0.150 y 0.000..0.175 z 0.322..0.398 · to the dog's home 0.28 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 11 / 2D 0; dog outside - 3D 0 / 2D 75 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 11 / 2D 75 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0.03, 0, 0.38] · sign x -0.090..0.150 y 0.000..0.175 z 0.342..0.418 · to the dog's home 0.28 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 11 / 2D 0; dog outside - 3D 0 / 2D 158 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 11 / 2D 158 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0.03, 0, 0.4] · sign x -0.090..0.150 y 0.000..0.175 z 0.362..0.438 · to the dog's home 0.27 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 11 / 2D 0; dog outside - 3D 0 / 2D 158 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 11 / 2D 158 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0.03, 0, 0.42] · sign x -0.090..0.150 y 0.000..0.175 z 0.382..0.458 · to the dog's home 0.27 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 11 / 2D 0; dog outside - 3D 0 / 2D 239 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 11 / 2D 239 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0, 0, 0.3] · sign x -0.120..0.120 y 0.000..0.175 z 0.262..0.338 · to the dog's home 0.34 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
floor floor offset [0, 0, 0.32] · sign x -0.120..0.120 y 0.000..0.175 z 0.282..0.358 · to the dog's home 0.33 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
floor floor offset [0, 0, 0.34] · sign x -0.120..0.120 y 0.000..0.175 z 0.302..0.378 · to the dog's home 0.32 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 75 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 75 of 7671 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0, 0, 0.36] · sign x -0.120..0.120 y 0.000..0.175 z 0.322..0.398 · to the dog's home 0.31 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 75 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 75 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0, 0, 0.38] · sign x -0.120..0.120 y 0.000..0.175 z 0.342..0.418 · to the dog's home 0.31 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 158 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 158 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0, 0, 0.4] · sign x -0.120..0.120 y 0.000..0.175 z 0.362..0.438 · to the dog's home 0.30 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 158 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 158 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0, 0, 0.42] · sign x -0.120..0.120 y 0.000..0.175 z 0.382..0.458 · to the dog's home 0.30 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 239 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 239 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [-0.05, 0, 0.3] · sign x -0.170..0.070 y 0.000..0.175 z 0.262..0.338 · to the dog's home 0.38 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
floor floor offset [-0.05, 0, 0.32] · sign x -0.170..0.070 y 0.000..0.175 z 0.282..0.358 · to the dog's home 0.37 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
floor floor offset [-0.05, 0, 0.34] · sign x -0.170..0.070 y 0.000..0.175 z 0.302..0.378 · to the dog's home 0.37 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 75 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 75 of 7671 · RG6 refuses · new non-RG6 findings: none
floor floor offset [-0.05, 0, 0.36] · sign x -0.170..0.070 y 0.000..0.175 z 0.322..0.398 · to the dog's home 0.36 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 75 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 75 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [-0.05, 0, 0.38] · sign x -0.170..0.070 y 0.000..0.175 z 0.342..0.418 · to the dog's home 0.36 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 158 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 158 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [-0.05, 0, 0.4] · sign x -0.170..0.070 y 0.000..0.175 z 0.362..0.438 · to the dog's home 0.35 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 158 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 158 of 7670 · RG6 refuses · new non-RG6 findings: none
floor floor offset [-0.05, 0, 0.42] · sign x -0.170..0.070 y 0.000..0.175 z 0.382..0.458 · to the dog's home 0.35 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 239 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 239 of 7670 · RG6 refuses · new non-RG6 findings: none
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

#### Run 4: the floor's edge, and more of the back wall's right corner

`PROBE_EXTRA` of `floor:floor:0.01,0,0.32`, `floor:floor:0.02,0,0.32`, `floor:floor:0.01,0,0.33`,
`floor:floor:0,0,0.33`, then `back:back-wall:<x>,<y>,0.0375` for x in 0.85, 0.95 and y in 0.35, 0.4, and
`back:back-wall:0.9,0.4,0.0375`, joined by `;`, then the same command, filtered as run 2:

```text
floor floor offset [0.01, 0, 0.32] · sign x -0.110..0.130 y 0.000..0.175 z 0.282..0.358 · to the dog's home 0.32 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: none · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 0 of 7671 · RG6 PASSES · new non-RG6 findings: none
floor floor offset [0.02, 0, 0.32] · sign x -0.100..0.140 y 0.000..0.175 z 0.282..0.358 · to the dog's home 0.31 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 9 / 2D 0 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 9 / 2D 0 of 7671 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0.01, 0, 0.33] · sign x -0.110..0.130 y 0.000..0.175 z 0.292..0.368 · to the dog's home 0.31 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 75 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 75 of 7671 · RG6 refuses · new non-RG6 findings: none
floor floor offset [0, 0, 0.33] · sign x -0.120..0.120 y 0.000..0.175 z 0.292..0.368 · to the dog's home 0.32 m · side-wall no · sign's core over members 3D 0 / 2D 0 · cores overlap 3D 0 / 2D 0 · problems: dog outside - 3D 0 / 2D 75 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 0 / 2D 75 of 7671 · RG6 refuses · new non-RG6 findings: none
back back-wall offset [0.85, 0.35, 0.0375] · sign x 0.730..0.970 y 0.350..0.525 z -0.610..-0.534 · to the dog's home 1.16 m · side-wall no · sign's core over members 3D 26 / 2D 443 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 12 / 2D 0; dog member bicycle 3D 26 / 2D 443 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 27 / 2D 443 of 7671 · RG6 refuses · new non-RG6 findings: none
back back-wall offset [0.85, 0.4, 0.0375] · sign x 0.730..0.970 y 0.400..0.575 z -0.610..-0.534 · to the dog's home 1.16 m · side-wall no · sign's core over members 3D 132 / 2D 908 · cores overlap 3D 0 / 2D 0 · problems: dog member bicycle 3D 132 / 2D 908 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 132 / 2D 908 of 7671 · RG6 refuses · new non-RG6 findings: none
back back-wall offset [0.95, 0.35, 0.0375] · sign x 0.830..1.070 y 0.350..0.525 z -0.610..-0.534 · to the dog's home 1.21 m · side-wall no · sign's core over members 3D 26 / 2D 443 · cores overlap 3D 0 / 2D 0 · problems: dog reserved - 3D 13 / 2D 0; dog member bicycle 3D 26 / 2D 443 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 27 / 2D 443 of 7671 · RG6 refuses · new non-RG6 findings: none
back back-wall offset [0.95, 0.4, 0.0375] · sign x 0.830..1.070 y 0.400..0.575 z -0.610..-0.534 · to the dog's home 1.21 m · side-wall no · sign's core over members 3D 132 / 2D 908 · cores overlap 3D 0 / 2D 0 · problems: dog member bicycle 3D 132 / 2D 908 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 132 / 2D 908 of 7671 · RG6 refuses · new non-RG6 findings: none
back back-wall offset [0.9, 0.4, 0.0375] · sign x 0.780..1.020 y 0.400..0.575 z -0.610..-0.534 · to the dog's home 1.19 m · side-wall no · sign's core over members 3D 132 / 2D 908 · cores overlap 3D 0 / 2D 0 · problems: dog member bicycle 3D 132 / 2D 908 · list-only (held) 3D 0 / 2D 0 · stages with any RG6 problem 3D 132 / 2D 908 of 7671 · RG6 refuses · new non-RG6 findings: none
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Two of the back wall's points stand partly in other pieces' boxes, and no compose finding refuses that: the points
beside the window ([±0.93, 1.2]) overlap the window's box, and [0.95, …] reaches x 1.070, 3 mm past the right wall's
plane. Points at x 0.85 overlap the desk's box from x 0.73 to 0.75. None passes RG6, so none is a candidate.

### Lint (measure2-026)

The lint target, run after the probe was deleted, with this file the only change in the worktree (`git diff
--name-only` lists only it). It fails as it did for measure-026 (its Lint section, above), on the same four files that
came onto the line before measure-026's base, none of which this task may change:
`apps/web/src/room/compose/pick.ts`, `apps/web/src/room/scene/twin-states.ts`,
`apps/web/test/room/pet-homes.test.ts`, and `apps/web/test/room/pet-states.test.ts`. ESLint and tsc passed. The target
stops at Prettier, so its later steps ran on their own, with the target's own commands, and passed. Prettier passes on
this file alone.

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
[warn] apps/web/src/room/compose/pick.ts
[warn] apps/web/src/room/scene/twin-states.ts
[warn] apps/web/test/room/pet-homes.test.ts
[warn] apps/web/test/room/pet-states.test.ts
[warn] Code style issues found in 4 files. Run Prettier with --write to fix.
make: *** [Makefile:231: lint] Error 1
exit 2
```

The target's remaining steps:

```text
$ ruff check .
All checks passed!
exit 0
$ ruff format --check --no-cache --extend-exclude corpus .
822 files already formatted
exit 0
$ shellcheck (the target's file list: LIST_SH, then NAMED_SCRIPTS)
exit 0
$ node_modules/.bin/prettier --check specs/026-twin-pets-dog/dog-sign-offset.md
Checking formatting...
All matched files use Prettier code style!
```
