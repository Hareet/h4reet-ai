# measure-029c: group C's three faces against RG7 (page Q26)

Notes only, by `measure-029c` (night 4, 2026-11-16, implementer role, a probe), from impl-029c's tip `85b70df0`. This
file is the only one committed. Every binding, outline, block, and catalog flag below was a scratch edit in the working
tree, reverted before the commit (`git status --short` was empty after the revert, §7). No floor was lowered and
`apps/web/build/room/checks/rg.ts` was not edited. No hook or bash-gate refusal happened.

Read first: page Q26 and rv-probes-029's W-1 (`git show refs/heads/night/supervisor/2026-11-16:docs/night-shift/2026-11-16.md`),
spec 029's FR-016 to FR-023a, plan §R-C1 to §R-C6, `apps/web/build/room/checks/rg.ts` (RG7: `capOf`, `phoneExempt`,
`measureFaces`, `characters`, `legibility`), `src/room/compose/legibility.ts`, and `src/room/compose/layout.ts`
(`textGrid`, `fitOutline`, `GRID_METRICS`).

## Summary

| Q26 item | Finding |
|---|---|
| 1. Monitor on two rows | **Readable on both stages.** `grid: { cols: 10, rows: 2 }` ("Applied AI", then "Engineer" and the cursor's cell) measures **39.1 px desktop, 12.5 px phone** (floor 9). `room:check` passes with it readable, and that run includes the 3D dinosaur visit's 7,737 stages, which RG7 also checks. |
| 2. Signs on more lines | Busy sign on two lines ("I AM VERY / BUSY"): **10.8 px / 3.4 px**. Dog sign on three lines ("My dog / thinks / I'm cool" and the paw): **10.0 px / 3.2 px**. Both pass the desktop and both fail the phone. |
| 3. Scale for 9 px on the phone (computed) | Busy sign: about **2.6×** its size now (stylized scale 1.5 → about 3.9 to 4.0, so the piece is about 0.87 m wide). Dog sign: about **2.8×** (1.5 → about 4.2 to 4.3, about 0.68 m wide). |
| 4. Atmosphere route | All three faces as atmosphere (`readable: false`, `atmosphere: true`, `max_chars` 18 / 14 / 22): `room:check` gives **0 findings, exit 0**. Q26's recommended mix (monitor readable on two rows, the two signs atmosphere) also gives **0 findings, exit 0**. "Around the room" reads the same in both routes (§5). |
| 5. Options Q26 doesn't list | Tighter leading, one region per line, a larger face, or moving or turning the piece: none gets either sign near 9 px on the phone (best computed: about 5.2 px busy, about 4.0 px dog). The monitor's other text renderers measure smaller than the terminal. Two gaps in RG7's measure are recorded as things **not** to use (§6). |

For Q26 this means: the condition in its recommended answer holds. The monitor measures above 9 px on both stages on
two rows, so it stays a readable face. The two signs can't reach the floor by layout alone, so they become atmosphere
faces. Both routes pass `room:check` on this tree.

## 1. Setup and the scratch data

```text
$ make setup                        # node_modules was missing
… (npm install; tail:)
14 vulnerabilities (1 low, 12 moderate, 1 high)
git hooks: /home/h4reet/h4reet-ai/h4reet-ai/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks
```

No `npx` was run. Scratch helpers lived outside the repository in `/tmp/measure029c-scripts/`, and every repository
command ran from the worktree's root.

- `gen-outline.mjs` writes a sign's outline in spec 004 §8's format (`schema`, `sign`, `words`, `intent_ref: intent-029`,
  `source.id` D-0004 / D-0005, `view_box`, `cap_height`, `advance`, `paths`). It sets the words in IBM Plex Sans Bold
  (`apps/web/fonts/IBMPlexSans-Bold.woff`, read with the repository's `fontkit`) at 100 units to the em, with these rules:
  - cap height 69.8, the font's `capHeight` 698 / 1000;
  - baselines 1.2 em apart, each line centred on the widest;
  - for the dog sign, the paw (the pad and four toes of `hud/icons.ts`'s `EMBLEM_ICONS.paw`, as ellipses, 1.2 cap
    heights tall) after "I'm cool" with a 0.3 em gap;
  - view box = the ink box (glyph boxes and the paw) plus a margin of 0.15 cap height on each side (0 in run v4);
    `advance` = the view box's width.

  The converter that T-C01/T-C02 generalise will set its own leading and margins, so its figures will differ a little
  from these.
- `monitor-line.yaml`: a `terminal` block, `words_from` quoting the intent's "The monitor should say "Applied AI
  Engineer" with the cursor in green font", lines "Applied AI" and "Engineer", each `about_author: true` with the claim
  `corpus/07-denver-local-ai.md`'s "(co-owner, Applied AI Engineer)".
- `scene.yaml` bindings, as plan §R-C2 has them plus a grid for the monitor. Each face carries its piece's own label,
  because RD3 requires a face `label`. My first run without labels gave `RD3 …placements[2].faces.screen.label: a
  required key is missing` (and the same for placements 6 and 7). The atmosphere run's diff against the base:

```diff
50a51,57
>     faces:
>       screen:
>         label: label.monitor
>         atmosphere: true
>         max_chars: 18
>         regions:
>           - { rect: [0, 0, 1, 1], renderer: terminal, grid: { cols: 10, rows: 2 }, text: monitor-line }
91a99,105
>     faces:
>       lettering:
>         label: label.busy-sign
>         atmosphere: true
>         max_chars: 14
>         regions:
>           - { rect: [0, 0, 1, 1], renderer: sign, text: lettering-busy }
101a116,122
>     faces:
>       lettering:
>         label: label.dog-sign
>         atmosphere: true
>         max_chars: 22
>         regions:
>           - { rect: [0, 0, 1, 1], renderer: sign, text: lettering-cool }
```

The readable runs had no `atmosphere`/`max_chars` lines, and their catalogs kept `readable: true`.

- `variant.sh <label> <busy margin> <busy lines> <dog margin> <dog lines> <cols> <rows>` writes both outlines, sets the
  monitor's grid in `scene.yaml` with `sed`, runs `npm run room:report -w apps/web`, and prints the legibility rows and
  the findings.

Baseline at `85b70df0` (`npm run room:report -w apps/web`, exit 0). The rows that matter (the three faces are unbound):

```text
| Face | Readable | Desktop | Phone | Floor | Margin | Status |
|---|---|---:|---:|---:|---:|---|
| `neon-sign.word` | yes | 30.5 px | 9.7 px | 9 | 0.7 px | readable |
| `neon-sign.call` | yes | 20.1 px | 6.4 px | 9 | -2.6 px | exempt on the phone, carried by the text copy's "Around the room" |
| `neon-sign.visit` | yes | 20.1 px | 6.4 px | 9 | -2.6 px | exempt on the phone, carried by the text copy's "Around the room" |
| `neon-sign.second-line` | no | 10.5 px | 3.4 px | 9 | -5.6 px | atmosphere (max 43) |
| `chalkboard.slate` | yes | 30.7 px | 9.7 px | 9 | 0.7 px | readable |
| `twin-figure.twin-shirt-lettering` | no | 6.9 px | 2.1 px | 9 | -6.9 px | atmosphere (max 25) |
```

The table rounds to the nearest 0.1 px. RG7's finding text floors to 0.1 px (`tenth`), so a face can read 2.9 in the
table and 2.8 in its finding.

## 2. Items 1 and 2: the measures (`npm run room:report -w apps/web`, each exit 0)

**v1**: signs on one line, monitor 10 × 2 (calibration against impl-029c's figures):

```text
lettering-busy: 1 line(s) ["I AM VERY BUSY"], paw none, margin 0.15 cap; view box 792.84 x 93.14 (aspect 8.512), cap 69.8
lettering-cool: 1 line(s) ["My dog thinks I'm cool"], paw end, margin 0.15 cap; view box 1178.538 x 125.9 (aspect 9.361), cap 69.8
| `desk-screen.screen` | yes | 39.1 px | 12.5 px | 9 | 3.5 px | readable |
| `busy-sign.lettering` | yes | 9.1 px | 2.9 px | 9 | -6.1 px | under |
| `dog-sign.lettering` | yes | 4.3 px | 1.4 px | 9 | -7.6 px | under |
Findings: 3.
RG7 apps/web/room/scene.yaml:placements[6].faces.lettering: cap height 2.8 px on the phone stage, under the floor of 9
RG7 apps/web/room/scene.yaml:placements[7].faces.lettering: cap height 4.3 px on the desktop stage, under the floor of 9
RG7 apps/web/room/scene.yaml:placements[7].faces.lettering: cap height 1.3 px on the phone stage, under the floor of 9
```

The one-line busy sign reproduces impl-029c's 9.2 / 2.9 to within my margins.

**v2**: the brief's layouts. Busy sign on two lines, dog sign on three, monitor 10 × 2:

```text
$ bash /tmp/measure029c-scripts/variant.sh v2 0.15 "I AM VERY|BUSY" 0.15 "My dog|thinks|I'm cool" 10 2
lettering-busy: 2 line(s) ["I AM VERY","BUSY"], paw none, margin 0.15 cap; view box 509.84 x 211.94 (aspect 2.406), cap 69.8
lettering-cool: 3 line(s) ["My dog","thinks","I'm cool"], paw end, margin 0.15 cap; view box 509.538 x 336.14 (aspect 1.516), cap 69.8
55:          - { rect: [0, 0, 1, 1], renderer: terminal, grid: { cols: 10, rows: 2 }, text: monitor-line }
### v2
| Face | Readable | Desktop | Phone | Floor | Margin | Status |
| `desk-screen.screen` | yes | 39.1 px | 12.5 px | 9 | 3.5 px | readable |
| `busy-sign.lettering` | yes | 10.8 px | 3.4 px | 9 | -5.6 px | under |
| `dog-sign.lettering` | yes | 10.0 px | 3.2 px | 9 | -5.8 px | under |
Findings: 2.
RG7 apps/web/room/scene.yaml:placements[6].faces.lettering: cap height 3.4 px on the phone stage, under the floor of 9
RG7 apps/web/room/scene.yaml:placements[7].faces.lettering: cap height 3.1 px on the phone stage, under the floor of 9
```

**v3**: plan §R-C1's breaks ("I AM / VERY BUSY", "My dog thinks / I'm cool"), monitor on one row at its smallest grid
(19 columns):

```text
$ bash /tmp/measure029c-scripts/variant.sh v3 0.15 "I AM|VERY BUSY" 0.15 "My dog thinks|I'm cool" 19 1
lettering-busy: 2 line(s) ["I AM","VERY BUSY"], paw none, margin 0.15 cap; view box 555.64 x 211.94 (aspect 2.622), cap 69.8
lettering-cool: 2 line(s) ["My dog thinks","I'm cool"], paw end, margin 0.15 cap; view box 658.14 x 217.04 (aspect 3.032), cap 69.8
55:          - { rect: [0, 0, 1, 1], renderer: terminal, grid: { cols: 19, rows: 1 }, text: monitor-line }
### v3
| Face | Readable | Desktop | Phone | Floor | Margin | Status |
| `desk-screen.screen` | yes | 20.6 px | 6.6 px | 9 | -2.4 px | under |
| `busy-sign.lettering` | yes | 10.8 px | 3.4 px | 9 | -5.6 px | under |
| `dog-sign.lettering` | yes | 7.7 px | 2.5 px | 9 | -6.5 px | under |
Findings: 5.
RG7 apps/web/room/scene.yaml:placements[2].faces.screen: cap height 6.5 px on the phone stage, under the floor of 9
RT8 apps/web/room/scene.yaml:placements[2].faces.screen.regions[0]: 2 drawn lines, more than the grid's 1 row
RG7 apps/web/room/scene.yaml:placements[6].faces.lettering: cap height 3.4 px on the phone stage, under the floor of 9
RG7 apps/web/room/scene.yaml:placements[7].faces.lettering: cap height 7.7 px on the desktop stage, under the floor of 9
RG7 apps/web/room/scene.yaml:placements[7].faces.lettering: cap height 2.4 px on the phone stage, under the floor of 9
```

The RT8 line comes from my two-line block against a one-row grid. It doesn't change the measure, which depends on the
grid only. The 19 × 1 figure matches impl-029c's "about 6.5 px".

**v4**: upper bound for the signs (zero margin), and a three-row monitor (9 × 3) for comparison:

```text
$ bash /tmp/measure029c-scripts/variant.sh v4 0 "I AM VERY|BUSY" 0 "My dog|thinks|I'm cool" 9 3
lettering-busy: 2 line(s) ["I AM VERY","BUSY"], paw none, margin 0 cap; view box 488.9 x 191 (aspect 2.560), cap 69.8
lettering-cool: 3 line(s) ["My dog","thinks","I'm cool"], paw end, margin 0 cap; view box 488.598 x 315.2 (aspect 1.550), cap 69.8
55:          - { rect: [0, 0, 1, 1], renderer: terminal, grid: { cols: 9, rows: 3 }, text: monitor-line }
### v4
| Face | Readable | Desktop | Phone | Floor | Margin | Status |
| `desk-screen.screen` | yes | 26.3 px | 8.4 px | 9 | -0.6 px | under |
| `busy-sign.lettering` | yes | 12.0 px | 3.8 px | 9 | -5.2 px | under |
| `dog-sign.lettering` | yes | 10.4 px | 3.3 px | 9 | -5.7 px | under |
Findings: 4.
RG7 apps/web/room/scene.yaml:placements[2].faces.screen: cap height 8.4 px on the phone stage, under the floor of 9
RT8 apps/web/room/scene.yaml:placements[2].faces.screen.regions[0]: lines[0] of its block is 10 characters, more than the grid's 9 columns
RG7 apps/web/room/scene.yaml:placements[6].faces.lettering: cap height 3.8 px on the phone stage, under the floor of 9
RG7 apps/web/room/scene.yaml:placements[7].faces.lettering: cap height 3.3 px on the phone stage, under the floor of 9
```

Again, the RT8 line is my two-line block on a 9-column grid. Three rows would be "Applied / AI / Engineer▌".

**v5**: back to v2's layouts with the faces readable, then `npm run room:check -w apps/web`:

```text
$ bash /tmp/measure029c-scripts/variant.sh v5 0.15 "I AM VERY|BUSY" 0.15 "My dog|thinks|I'm cool" 10 2
(same rows and findings as v2)
$ npm run room:check -w apps/web
> @h4reet/web@0.1.0 room:check
> node --import tsx build/room/cli.ts check

RG7 apps/web/room/scene.yaml:placements[6].faces.lettering: cap height 3.4 px on the phone stage, under the floor of 9
RG7 apps/web/room/scene.yaml:placements[7].faces.lettering: cap height 3.1 px on the phone stage, under the floor of 9
room: 2 findings in 1 file
npm error Lifecycle script `room:check` failed with error:
npm error code 1
… (npm's lines naming the workspace)
room:check exit 1
```

So the readable monitor on 10 × 2 draws no finding from the whole check: no RG7 at the plain stages or the dinosaur
visit's, and no RT8. That the dinosaur visit's stages ran is confirmed by the report line "A 3D dinosaur visit (spec
024, Q150): … 7,737 stages over the same screens, checked by RG6 and RG7 and not emitted".

### Why 10 × 2 is the monitor's best grid (from `layout.ts`)

`textGrid` sets the terminal's em to min(pitch / 1.25, width / (cols × 0.6)) on the 0.8017 × 0.3367 face.

| Grid | Height-limited em | Width-limited em | em |
|---|---|---|---|
| 10 × 2 | 0.1347 | 0.1336 | **0.1336** |
| 19 × 1 | 0.2694 | 0.0703 | 0.0703 |
| 9 × 3 | 0.0898 | 0.1485 | 0.0898 |

The two rows need at least 10 columns ("Applied AI"; "Engineer" and its cursor take 9). At 10 × 2 the height and the
width limits nearly meet, so no other grid gives a larger em. Measured: 10 × 2 is 1.90× the 19 × 1 figure on both
stages (39.1 / 20.6, 12.5 / 6.6), which is the em ratio (0.1336 / 0.0703 = 1.90).

### Item 2 in one table

| Face | Layout | Margin | Desktop | Phone | 9 px on both? |
|---|---|---|---:|---:|---|
| `desk-screen.screen` | "Applied AI" / "Engineer▌", 10 × 2 | n/a | 39.1 | 12.5 | **yes** |
| `desk-screen.screen` | one row, 19 × 1 | n/a | 20.6 | 6.6 | no (phone) |
| `desk-screen.screen` | three rows, 9 × 3 | n/a | 26.3 | 8.4 | no (phone) |
| `busy-sign.lettering` | one line | 0.15 cap | 9.1 | 2.9 | no (phone) |
| `busy-sign.lettering` | "I AM VERY / BUSY" | 0.15 cap | 10.8 | 3.4 | no (phone) |
| `busy-sign.lettering` | "I AM / VERY BUSY" | 0.15 cap | 10.8 | 3.4 | no (phone) |
| `busy-sign.lettering` | "I AM VERY / BUSY" | 0 | 12.0 | 3.8 | no (phone) |
| `dog-sign.lettering` | one line, paw | 0.15 cap | 4.3 | 1.4 | no (both) |
| `dog-sign.lettering` | "My dog thinks / I'm cool", paw | 0.15 cap | 7.7 | 2.5 | no (both) |
| `dog-sign.lettering` | "My dog / thinks / I'm cool", paw | 0.15 cap | 10.0 | 3.2 | no (phone) |
| `dog-sign.lettering` | "My dog / thinks / I'm cool", paw | 0 | 10.4 | 3.3 | no (phone) |

Why the two-line busy layouts measure the same: the busy face's aspect is 3.13. Both two-line outlines (2.41 and 2.62)
are narrower than that, so the fit is limited by height, and both have the same height. The dog sign's three lines
(1.52 to 1.55) nearly match its face (1.46), which is why that layout is its best. A fourth line would only make the
outline taller. On every face measured, the phone reads about 0.32 of the desktop (12.5 / 39.1, 3.4 / 10.8,
3.2 / 10.0, and the neon word's 9.7 / 30.5). So a face needs about 28 px on the desktop to reach 9 on the phone.

## 3. Item 3: the scale each sign would need (computed, not measured)

The figures below are computed from the measured phone figures, as 9 / phone × today's stylized scale (both catalogs
give `stylized_scale: 1.5`). Because the table rounds and the finding floors, each phone figure is known only to a
range, and so is each result. The computation assumes the cap height on screen grows in proportion to the piece's
scale. That is a first-order approximation: scaling about the mount also moves the face's centre and changes the
perspective a little, so a measured run would differ somewhat. Widths are the catalog's `size.w` at that scale.

| Sign, layout | Phone (measured range) | Factor for 9 px | Stylized scale | Width (now 0.33 m busy, 0.24 m dog) |
|---|---|---:|---:|---|
| busy, two lines, 0.15 cap margin | 3.40 to 3.45 px | 2.61 to 2.65 | 3.91 to 3.97 | 0.86 to 0.87 m |
| busy, two lines, no margin | 3.80 to 3.85 px | 2.34 to 2.37 | 3.51 to 3.55 | 0.77 to 0.78 m |
| dog, three lines, 0.15 cap margin | 3.15 to 3.20 px | 2.81 to 2.86 | 4.22 to 4.29 | 0.67 to 0.69 m |
| dog, three lines, no margin | 3.30 to 3.35 px | 2.69 to 2.73 | 4.03 to 4.09 | 0.65 m |

Q26's "about three to four times their size, so the busy sign would be about 1 m wide" is the same order. A desk sign
nearly a metre wide, or a dog sign of about 0.7 m × 0.5 m on the right wall, would also be re-judged by RG6 (pick
spacing, the "Eat" tile's box), the eating chunks, and his look. None of that was run.

## 4. Item 4: the atmosphere route (`room:check`)

All three faces as atmosphere. Each catalog's `readable: true` became `readable: false`
(`room/catalog/busy-sign.yaml:25`, `dog-sign.yaml:23`, `desk-screen.yaml:24`), and the bindings are the diff in §1. The
`max_chars` values are exactly what RG7's `characters` counts:

- the monitor's block lines without the joining space ("Applied AI" 10 + "Engineer" 8 = 18; a one-line block would be 19);
- the busy sign's outline `words`, "I AM VERY BUSY" (14);
- the dog sign's outline `words`, "My dog thinks I'm cool" (22).

```text
$ npm run room:check -w apps/web
> @h4reet/web@0.1.0 room:check
> node --import tsx build/room/cli.ts check

room: 0 findings in 0 files
room:check exit 0

$ npm run room:report -w apps/web        # exit 0
| Face | Readable | Desktop | Phone | Floor | Margin | Status |
| `desk-screen.screen` | no | 39.1 px | 12.5 px | 9 | 3.5 px | atmosphere (max 18) |
| `busy-sign.lettering` | no | 10.8 px | 3.4 px | 9 | -5.6 px | atmosphere (max 14) |
| `dog-sign.lettering` | no | 10.0 px | 3.2 px | 9 | -5.8 px | atmosphere (max 22) |
```

To check that `max_chars` counts what I said, I set each one 1 lower (17, 13, 21) and ran `room:check` again (reverted
after):

```text
RG7 apps/web/room/scene.yaml:placements[2].faces.screen.max_chars: its words hold 18 characters, over its max_chars of 17
RG7 apps/web/room/scene.yaml:placements[6].faces.lettering.max_chars: its words hold 14 characters, over its max_chars of 13
RG7 apps/web/room/scene.yaml:placements[7].faces.lettering.max_chars: its words hold 22 characters, over its max_chars of 21
room: 3 findings in 1 file
```

Q26's recommended mix: `desk-screen.yaml` back to `readable: true`, and the monitor's binding without `atmosphere` and
`max_chars`. The two signs stay atmosphere.

```text
$ npm run room:check -w apps/web
room: 0 findings in 0 files
room:check exit 0

$ npm run room:report -w apps/web        # exit 0
| `desk-screen.screen` | yes | 39.1 px | 12.5 px | 9 | 3.5 px | readable |
| `busy-sign.lettering` | no | 10.8 px | 3.4 px | 9 | -5.6 px | atmosphere (max 14) |
| `dog-sign.lettering` | no | 10.0 px | 3.2 px | 9 | -5.8 px | atmosphere (max 22) |
```

The precedents measure as before: `neon-sign.second-line` no, 10.5 / 3.4, "atmosphere (max 43)";
`twin-figure.twin-shirt-lettering` no, 6.9 / 2.1, "atmosphere (max 25)".

## 5. What "Around the room" reads (`text-copy.ts`)

A scratch script (`/tmp/measure029c-scripts/around.mts`) composes the working tree the way the repository's test helper
`repositoryBundle` does: `compose(fileTree(repo), readRoomPolicy({ env, root }), { mode: "lenient", drafts })`. It then
renders `renderTextCopy` in jsdom and lists the items before and after `setText(roomTextOf({ room_text: roomText }))`.
Its first run failed on a tooling error, not the room: `Top-level await is currently not supported with the "cjs"
output format`. I renamed it to `.mts`, and it ran.

```text
$ cd apps/web && node --import tsx /tmp/measure029c-scripts/around.mts <worktree>
```

Q26's mix (monitor readable, signs atmosphere):

```text
## release build: 0 findings, 0 refused
after room text:
  - The twin's figure is a stand-in, not the Author's likeness.
  - Neon sign: Langfuse
  - This call: no call yet
  - This visit: $0
  - The neon sign's second line: metered by the gateway · traced in Langfuse
  - Chalkboard: denverlocal.ai
  - The twin's shirt: Denver Local AI Solutions
  - Laptop charger: The live status isn't connected yet
  - The monitor's screen is a scripted illustration
  - This project isn't affiliated with or endorsed by Langfuse or its owner.
## drafts build: 0 findings, 0 refused
after room text:
  - The twin's figure is a stand-in, not the Author's likeness.
  - Monitor: Applied AI Engineer [Draft]
  - Neon sign: Langfuse
  - This call: no call yet
  - This visit: $0 [test]
  - The neon sign's second line: metered by the gateway · traced in Langfuse
  - Desk sign, busy: I AM VERY BUSY [Draft]
  - Desk sign, dog: My dog thinks I'm cool [Draft]
  - Chalkboard: denverlocal.ai
  - The twin's shirt: Denver Local AI Solutions
  - Laptop charger: The live status isn't connected yet
  - The monitor's screen is a scripted illustration
  - This project isn't affiliated with or endorsed by Langfuse or its owner.
```

All three atmosphere (drafts build): the same 13 items, word for word. For comparison, the base `85b70df0` in a drafts
build, after room text, has 9 items: the same list without the three pieces' items and without "The monitor's screen
is a scripted illustration".

What this shows:

- **Each piece's item.**
  - Monitor: "Monitor: Applied AI Engineer". The two rows read as one line in the text copy.
  - Busy sign: "Desk sign, busy: I AM VERY BUSY".
  - Dog sign: "Desk sign, dog: My dog thinks I'm cool". The paw adds no word (FR-023a).
  - Each is marked "[Draft]" in a drafts build.
- **Atmosphere doesn't change the text copy.** The items are the same whether a face is readable or atmosphere.
- **Release builds before his approval.** A release build leaves all three items out, because none of the three
  room-text files has an approval entry yet (plan §R-C5). Until he approves their hashes, the words are on neither the
  pieces (plain) nor in "Around the room". The atmosphere route's "their words also in Around the room" holds from his
  approval on.
- **The illustration line.** "The monitor's screen is a scripted illustration" (`around.illustration`) appears once the
  monitor's face is bound, in release and drafts alike (`build/room/emit.ts:1114`), as FR-023a asks.
- **The dog sign's label.** `label.dog-sign` reads "Desk sign, dog", while spec 026 moved the sign to the right wall.
  This is a UI word outside group C's FRs, noted for the stack's note, not changed.

## 6. Item 5: options that Q26 doesn't list, from reading `rg.ts`

RG7 measures each region's cap height (`capOf` → `regionCap`) and projects it through the placement's model transform
(the stylized scale included) and the production camera, at each corner of the region (`smallestCapPx`). The face's
measure is the smallest over its regions. These are the inputs a binding or a piece can change without touching RG7 or
any floor. Every figure in this section is computed from §2's measures, not measured.

| Option | What it changes | Effect on the phone (computed) |
|---|---|---|
| Tighter leading for the all-caps busy sign (baselines 1.3 cap heights apart instead of 1.2 em, which is 1.72 caps) | The outline's height: 191 → about 162 at zero margin; the fit stays height-limited (aspect 3.02 < 3.13) | × 1.18: about 4.5 px |
| One region per line (each line its own outline, regions splitting the face's height) | Removes the gap between lines, as the row above does; RG7 takes the smaller line | about the same as tighter leading |
| A larger `live_faces` size, up to the sign's panel (busy 0.22 × 0.07 against 0.192 × 0.0613; dog 0.16 × 0.1 against 0.1307 × 0.0893) | The face. But the face is the studio GLB's, and his answer says "no new model" | at most × 1.14 (busy) and about × 1.2 (dog) |
| All of the above together | | about 5.2 px busy, about 4.0 px dog: still under 9 |
| Moving the sign toward the camera, or turning it to face the camera (`mount.offset`, `turn`) | The model transform | Raises both stages alike (phone ≈ 0.32 × desktop). Reaching 9 needs about 2.6× to 2.9× more size on screen, about as much as the enlargement in §3. Not credible inside the room. |
| `print` instead of `sign` | Nothing: `regionCap` treats them the same | none |
| The monitor on `desktop-session` (line 1.35) at 10 × 2 | em = min(0.1684 / 1.35, 0.1336) = 0.1247 | about 36.5 / 11.7 px: passes, but smaller than the terminal and a different renderer |
| The monitor on `neon`, one panel of 20 characters | em = min(0.3367 / 1.2, 0.8017 / 12) = 0.0668 | about 19.5 / 6.2 px: fails |
| The phone exemption (`phoneExempt`) | Only for faces whose regions are all `signal: turn-cost` | not open to words without changing RG7 (Q26 lists that change) |

There are two gaps in RG7's measure. These are not options, and must not be used to get a face past the floor:

1. **A multi-size outline is measured by one `cap_height`.** RG7 measures a sign at its outline's single
   `cap_height`, and the shirt's converter writes the largest line's (`build/room/lettering.ts`,
   `cap_height: Math.max(...caps)`). A sign whose second line is set smaller would be measured at its first line's cap.
   The shirt is atmosphere, so nothing depends on this today.
2. **A face with no measure is skipped.** RG7 reports nothing for a face whose measure is null, where it could refuse
   instead. A face's measure is null when:
   - no outline's `sign` matches its region's `text`;
   - a text region's typeface use has no cap ratio;
   - a measured point is at or behind the near plane (`px !== null &&` in `legibility`).

Both are backlog for a later spec of the room's checks. I made no change, and asked no question for them, since no
group C face depends on either.

## 7. Revert, lint, commit

```text
$ cp apps/web/room/scene.yaml /tmp/measure029c-scripts/scene.scratch.yaml   # the diff in §1, kept outside the tree
$ git checkout -- apps/web/room/scene.yaml apps/web/room/catalog/
$ rm apps/web/content/room/monitor-line.yaml apps/web/content/room/outlines/lettering-busy.outline.json apps/web/content/room/outlines/lettering-cool.outline.json
$ git status --short
(empty)
```

```text
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
880 files already formatted
… | xargs -0 -t shellcheck -- … (shellcheck over the repository's scripts, no finding)
make lint exit 0
```

I ran it twice: once before pasting this block, and again on the final note just before the commit. Both exited 0
with the output above.

## Refusals and questions

- No hook or bash-gate refusal.
- No new question for the page. This note answers Q26's "if `measure-029c` measures it at 9 px or more on both stages"
  with yes for the monitor, and confirms the atmosphere route passes `room:check`.
- For `bind-029c`, from these measures:
  - Use `grid: { cols: 10, rows: 2 }` and block lines "Applied AI" / "Engineer".
  - Give the signs `max_chars` 14 and 22, matching their outlines' `words`.
  - Lay out the dog sign on three lines; plan §R-C1's "My dog thinks / I'm cool" measured 7.7 px on the desktop.
  - The busy sign's break doesn't matter to the measure (both breaks measure 10.8 / 3.4).
  - Re-run `room:check` once the real converter sets the outlines.
