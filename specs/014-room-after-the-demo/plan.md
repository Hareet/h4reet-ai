# Implementation Plan: The Room After the Demo — The Room Framed Under the HUD, a Newer Game Look, Walking From the Room's View, the Paper in the Hand, the Neon's Glow, the Chalkboard, the Placeholder Note, and the Sign's Proof

**Branch**: `feat/014-room-after-the-demo`, cut from `refs/heads/main` once spec 012's `feat/012-loading-screen` has merged, when [tasks.md](tasks.md) T001 runs ([§15](#15-the-branch-and-the-order-of-work)) | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Status**: Planned on 2026-11-10, after the Author's three final answers and his acceptance, with Q1 to Q5 and D1 to D12 taken under his acceptance, provisionally (the spec's Clarifications). Choices this plan makes beyond the spec are marked "(plan choice)" and are the Author's to overturn. Code waits for his approval of the spec and this plan: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`" (tasks.md T000).

**Input**: [spec.md](spec.md), [intent.md](intent.md), and the reads the spec's Input lists, on `main` at b335b9b2 and on `feat/012-loading-screen` at 2e1e0563. Also read for this plan: `compose/hud.ts` (whole), `compose/stages.ts` (whole), `compose/framing.ts` (whole), `fit.ts` (whole), `scene.ts`'s stage (lines 320 to 530: its clear area, its shift, `resize`, the walking loop), `scene/walking.ts` (whole), `walk/camera.ts` (whole), `scene/avatars.ts` (its header, `findHand`, `paperAt`, `holdSheet`, `keepPaper`), `scene/glows.ts` (whole), `faces/neon.ts` (whole), `signals/turn-cost.ts`'s header, `src/talk/turn-client.ts`'s request, `room.css` (its palette, the HUD's boxes, the notes, the tiles), `src/fonts.css`, `build/approvals.ts` (whole), `build/room/emit.ts`'s `avatarsPlaceholder` and `emit`, `apps/web/room/lookdev.yaml`, `deploy/edge/nginx.conf`'s x005 routes, `services/gateway/src/routes/room-turn.ts`'s route field, `config/routing.yaml`, `evals/breach.py`'s header, and the `Makefile`'s `breach-test`. Spec 012's `loading.css` was read for the properties it takes from spec 005 (`--clear-y`, `--notes-h`, `--glass`, `--glass-alpha`, `--tile-face`, `--tile-border`, `--hud-focus`, `--hud-text`). Facts this session couldn't confirm by running code (the twin route's behaviour on dev-cpu with its model server stopped, the room's exact pixel boxes for the selectables and figures, the layout model's widths) are T001's and T006's to record, and a difference is a departure recorded here.

**Conventions** (spec 005's plan's):
- **The Author's terminal**: commands only the Author runs, outside Claude Code.
- **Agent-editable** files are changed by agents and reviewed by the Author. **Human-only** files change only by his hand. This work touches one: `assets/policy/content-approvals.json`, by a patch for his hand (§8).
- **Paths.** A file that exists only once this work creates it is named in a code span and never linked.

**Companions**: [contracts/frame-area.md](contracts/frame-area.md) (the kernel's frame area, compact boxes, coverage, and the walking hold's edge) and [contracts/sign-check.md](contracts/sign-check.md) (the sign's end-to-end check). As specs 005 and 007 do, the design is otherwise in this plan's sections, so research, the data model, and the quickstart are folded in here (§1, §2 to §12, and §16's measurements).

## Summary

- **The frame area** (§2): one kernel function, `compose/frame.ts`'s `frameArea`, which the room and the compositor share, frames the room into the window and eases it back toward spec 005's clear area, in sixteenths, only as far as keeps every pressable piece and both figures 0.5rem clear of every HUD box. On the reference desktop the room is estimated to grow about 7% at no ease, less where the bar or the column meets a figure.
- **The compact HUD** (§3): spec 005's bands stay as the floor's definition; inside them, the strip is as wide as its words, the bar's tiles are one cluster at the foot's right, under the column, and the column is as tall as its content at its band's foot: one primary cluster on the right and a small strip at the top, the guidance's budget. The always-on interface is held to 25% of every landscape window from 1280 × 720 by the layout model.
- **The look** (§4): every HUD control a tile, the notes glass chips, headings in Patrick Hand, words in IBM Plex Sans, figures in IBM Plex Mono (all already served), the neon's warm tube colour as the hover and selection edge, the yellow focus ring kept; new palette properties only, so spec 012's contrast test stays as it is.
- **Walking's hold** (§5): `walk/hold.ts` and `scene/walking.ts` keep the camera at the room's view from entry until a turn, a tilt, a zoom, or the figure nearing a HUD box or the window's edge, then blend into spec 008's follow camera from an orbit computed from the room's view.
- **The grips** (§6): `scene.yaml`'s `figures.grips`, per avatar and hand, applied in `scene/avatars.ts` in the hand bone's frame, with a default computed from the middle finger's first bone; never the wrist's lift.
- **The path glow** (§7): the catalog's glow gains `path` and `spread`; `scene/glows.ts` builds a ribbon along it with its alpha falling to the spread's edge; the neon sign's `tube-glow` becomes the arrow's outline.
- **The board** (§8): a patch for the Author's hand, built from plain copies, adds the next `room-text` entry for `chalk-denverlocal.yaml`.
- **The note** (§9): the build's flag counts the room's pieces alone; the room adds a run-time fallback and the visitor's figure's words.
- **The sign's check** (§10): `evals/sign_check.py` and `evals/sign_probe.py`, beside the breach test, behind `make sign-check ENV=dev-cpu|dev`, reading the edge's reply through the room's own `turn-cost.ts` by `apps/web/build/room/sign-reading.ts`.

**What the Author does** (§14): approves (T000); after the review, looks at the branch's lookdev page (the hands, the glow, the frame, the look); applies the board's patch on `main`; gates and merges the branch; looks at the live room and runs the performance runs; and may run the sign check on dev.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node 24 (spec 000's pins) for `apps/web`; CSS; YAML; Python 3.12, standard library only, for the sign check (`evals/`), as the breach test; Markdown.

**Primary Dependencies**: none new (FR-067). Three.js 0.186.1 (the ribbon's `BufferGeometry`, `setViewOffset`), fontkit 2.0.4 (the layout model's widths), axe-core 4.13.0, jsdom 30.1.1, vitest, pytest, all already pinned.

**Storage**: none. The room stores nothing (spec 002 FR-003); the sign check stores nothing but its printed table.

**Testing**: vitest in `apps/web`: kernel tests in Node (`frame.ts`, `hud.ts`'s compact boxes and coverage, `walk/hold.ts`, the grip's maths, the ribbon's geometry, the schema's new rules); jsdom tests of the room (the HUD's DOM and classes, the notes' causes, the held walking view, the picker in the frame area, the faults); the layout model with real text widths (`test/ui/hud-model.ts`); the compositor's tests and fixtures (stages, RG6's reserved boxes, the report). pytest for the sign check's refusals and steps, with docker and the probe stubbed. The stack run of `make sign-check ENV=dev-cpu` on the agents' engine, its output in the note. jsdom lays nothing out and draws nothing, so the look and the glow are proven by the stylesheet and contrast tests, the geometry tests, and the Author's look.

**Target Platform**: the room in visitors' browsers, as spec 005's; the sign check on the dev stacks (the agents' engine for dev-cpu, the Author's host for dev).

**Project Type**: a change to the room's web client, its compositor's stages, its data (the scene, one catalog entry, the UI words), and one dev-only check under `evals/`. No new service, port, network, store, package, header, env key, event, or panel.

**Performance Goals**: spec 002's FR-048 floors at the full window; a re-fit's frame computation within 17 framings and under 1 ms on the reference desktop (estimate); the compositor's `room:check` within twice its time at the base, recorded at T001 (plan choice, as spec 005's); the entry chunk within 150 KB.

**Constraints**: the CSP's `style-src 'self'`; WCAG 2.2 AA in every layout and state; the floor of spec 005's stages; spec 012's loader's CSS properties keep their meanings (FR-021); no agent write to `assets/`, `corpus/`, `.claude/**`, or `tools/gates/`; `make up` always works.

**Scale/Scope**: 68 FRs and 16 success criteria; one new kernel module and one new walking module; two schema additions; one catalog edit and one scene edit; one UI word; one dev-only check of two Python files, one TypeScript script, and one make target; one patch for the Author's hand; 18 amendment rows.

## Constitution Check

*GATE: passed before design and re-checked after it ([below](#constitution-check-post-design)).* Applied with the `constitution-check` skill's eight questions against the [constitution](../../.specify/memory/constitution.md) 1.1.0.

| Principle or standard | What this plan does | Verdict |
|---|---|---|
| I. Data-local by default | No byte newly leaves the device; the fonts are the site's own. The degraded paths are built first (tasks.md Phase 2): the frame's fallback to the clear area, the grip's to the anchor, the glow's to none | PASS |
| II. Production-grade or not shipped | Tests first for every FR; the sign's chain gets its end-to-end check; the frame log's entries; the cost and its measurement (§16); an ADR (§12) | PASS |
| III. Intent before spec, spec before code, humans merge | From the accepted intent and his answers; specs 004, 005, 008, and 009 amended by name; the living contracts marked "(spec 014)"; departures update this plan in the same commit; no agent merges | PASS, with the inherited deviation (ADR 0013) |
| IV. Least privilege | The board's approval is a patch for his hand, built from plain copies (§8); the sign check refuses prod and runs through the relay; nothing widened | PASS |
| V. Cost is a first-class signal | $0; the check uses dev's synthetic adapter only (§10) | PASS |
| VI. Build in public, including failures | The demo's misread of the sign is recorded with its cause; the ease per screen in the compositor's report | PASS |
| VII. Own the whole product, and say exactly what you owned | The product reasoning (why ease, why the bar under the column, why the board waits for him) in the spec and the ADR | PASS |
| VIII. Honest AI | The disclosure and the stand-in line in view; the note says only what is true; the board becomes true by his approval | PASS |
| Security and agent governance | No dependency; the guidance is data, cited by URL, not followed; the implementer never reviews (tasks.md T052) | PASS |
| Technology standards | The 3D room in the browser, unchanged in kind; one compose topology, unchanged | PASS |

Gate result: **PASS**, with the inherited deviation.

## Project Structure

### Documentation (this feature)

```text
specs/014-room-after-the-demo/
├── intent.md                 # the Author's words, verbatim; accepted 2026-11-10
├── spec.md                   # FR-001 to FR-068, SC-001 to SC-016, the Clarifications, amendments W1 to W18
├── plan.md                   # this file: the design (§1 to §14), the order (§15), and the analyze pass (end)
├── contracts/frame-area.md   # the kernel's frame area, compact boxes, coverage, and the hold's edge
├── contracts/sign-check.md   # the sign's end-to-end check
└── tasks.md                  # test-first tasks by phase, the Author's marked
```

### Source Code (repository root)

`[new]` a file this work creates; `[chg]` a file it changes; `[gen]` a file the build regenerates; `[A]` the Author's own.

```text
apps/web/
├── room/scene.yaml                              [chg] figures.grips for the man and the woman (§6)
├── room/catalog/neon-sign.yaml                  [chg] tube-glow: path and spread (§7)
├── room/ui-words.yaml                           [chg] standin.avatar (§9)
├── room/lookdev.yaml                            [chg] the hands view's avatars (§11)
├── room/README.md                               [chg] "The frame under the HUD", the grips, the path glow (§12)
├── src/room/compose/frame.ts                    [new] frameArea, the step, the fallback (§2)
├── src/room/compose/hud.ts                      [chg] the compact entries, compactBoxes, alwaysOnCoverage (§3)
├── src/room/compose/stages.ts                   [chg] stages as frame areas with reserved boxes (§11)
├── src/room/compose/protect.ts                  [new] the protector from a composed scene or a bundle (§2.2)
├── src/room/compose/bundle.ts                   [chg] RoomScene.figures.grips; Glow.path, Glow.spread (§6, §7)
├── src/room/fit.ts                              [chg] the frame area in place of the clear area's box (§2.4)
├── src/room/scene.ts                            [chg] frame() in place of clear(); the picker; the hold's wiring (§2.4, §5)
├── src/room/scene/walking.ts                    [chg] the held start, the hand-over, the orbit from the room's view (§5)
├── src/room/walk/hold.ts                        [new] the hold's state and the edge test (§5)
├── src/room/scene/avatars.ts                    [chg] the grip in keepPaper, paperAt, holdSheet (§6)
├── src/room/scene/grip.ts                       [new] the grip's maths: data or computed default (§6)
├── src/room/scene/glows.ts                      [chg] the path glow's ribbon (§7)
├── src/room/flat.ts                             [chg] the 2D drawing in its frame area (§2.5)
├── src/room/layout.ts                           [chg] the compact boxes' properties; the notes' causes (§3, §9)
├── src/room/app.ts                              [chg] frame(); the figure's fallback to the note (§2.4, §9)
├── src/room/ui-keys.ts                          [chg] standin.avatar (§9)
├── src/room/signals/frame-log.ts                [chg] refit's frame area and ease; walk hold and hand-over (§12)
├── src/room/room.css                            [chg] the compact boxes, the tiles everywhere, the chips, the type, the accent (§3, §4)
├── src/talk/talk.css                            [chg] the conversation's controls as tiles; the log's rest height (§4)
├── src/lookdev/stage.ts, metrics.ts             [chg] the hands view; the ease in the window run's report (§11)
├── build/room/schema.ts                         [chg] figures.grips; glows[].path and spread (§6, §7)
├── build/room/checks/rg.ts, rd.ts               [chg] RG6's reserved boxes from the stages; the glow's and grip's rules (§7, §11)
├── build/room/report.ts                         [chg] the ease per screen class (§11)
├── build/room/emit.ts                           [chg] the placeholder flag from the room's pieces alone (§9)
├── build/room/sign-reading.ts                   [new] the room's turn-cost code over a reply's three facts (§10)
├── package.json                                 [chg] the script room:sign (§10)
├── test/room/{frame,protect,flat-frame,walk-hold,grip,glows,sign-reading}.test.ts      [new]
├── test/room/{stages,stages-floor,stages-checks,hud,hud-contrast,scene,scene-fit,walking,avatar-scene,schema,report,data-only,compose,bundle,words}.test.ts   [chg]
├── test/ui/{hud-look,flat-frame,notes-causes}.test.ts                                   [new]
├── test/ui/{hud-model,hud,hud-notes,hud-pointer,hud-faults,hud-a11y,resize}.test.ts     [chg]
├── test/approvals.test.ts, test/lookdev/page.test.ts                                    [chg]
├── test/fixtures/room/{skeleton,protect-scene}.ts                                       [new]
├── test/fixtures/room/good/apps/web/room/{scene.yaml,ui-words.yaml}, catalog/neon-sign.yaml   [chg]
└── test/fixtures/room/bad/{RD-glow-path,RD-grip}/                                       [new]

evals/sign_check.py, evals/sign_probe.py, evals/test_sign_check.py   [new] the check (§10)
Makefile                                                             [chg] sign-check, with breach-test's guards (§10)
docs/adr/0046-the-room-framed-under-the-hud.md, docs/adr/README.md   [new], [chg] (§12)
specs/004-room-composition/contracts/{room-data-files,lookdev}.md    [chg] §4, §5, §9, §13; lookdev §6; "(spec 014)" (§13)
docs/merge-requests/<date>-feat-014-room-after-the-demo.md           [new] the note
docs/merge-requests/<date>-room-text-chalkboard.patch                [new] [A] the board's approval, for his hand (§8)
```

**Structure decision**: the frame area joins the kernel (`compose/`), beside spec 005's placements and stages, so the compositor and the room compute it with one function from the same table; its scene-dependent input comes through one small interface, the protector (`compose/protect.ts`), built from the composed scene at compose time and from the bundle at run time. The walking hold is its own small pure module beside `walk/camera.ts`. The grip's maths is its own module so the skeleton fixtures can test it without a mixer.

## 1. Decisions (research)

| ID | Decision | Why | Rejected |
|---|---|---|---|
| PD-1 | The frame area is `compose/frame.ts`'s `frameArea`, by contracts/frame-area.md §2: 17 steps from the window to spec 005's clear area, the first that clears every protected box by 0.5rem (FR-009; D5) | A fixed set of steps is deterministic, cheap, and the same in Node and the browser; step 16 is spec 005's frame, which its checks already passed, so a frame always exists | A bisection to the pixel (the test isn't monotone in the ease, so a bisection can miss the least); a solver for centre and scale apart (two free values, no floor by construction) |
| PD-2 | The protector, `compose/protect.ts`: for an area, frame the scene's framed boxes at its aspect (`framing.ts`), compute the selectables' pick areas there (`pick.ts`), keep each pressable one's 44 × 44 core part as RG6 measures it, and add each figure's framed box projected by `project.ts`; all in the window's pixels | The checks' own measures, so a box the room protects is the box RG6 judges (FR-010) | A screen-space mask from the rendered scene (needs a GPU; untestable in Node) |
| PD-3 | The compact boxes are entries of spec 005's table, `HUD_PLACEMENTS`, and `compactBoxes`; the bands and `hudBoxes` stay as they are (FR-021) | Spec 005's floor, the notes, the walking control, and spec 012's loader read the bands; changing their meaning would move what spec 005 and 012 tested | Replacing the bands with the compact boxes (moves the floor and spec 012's card) |
| PD-4 | Each compact box's width is a bound in the table, in rem, that the layout model proves its words fit: the strip's `stripMaxRem` (estimated 34rem, one line of the disclosure at 0.8125rem), and the bar's `barMaxRem` (estimated 36rem, six tiles in one row). The page draws each at its content's width, centred or aligned as the table says, never wider than the bound | The kernel can't measure text, and an upper bound is safe for the protection and the coverage. The model (fontkit, the index's words) is how spec 005 already proves its bands | Measuring the DOM's boxes each frame (spec 005's PD-7 rejects it) |
| PD-5 | The column's content height comes from the table: its padding, the list's header and rows by its width band, the conversation's header, the log's rest height (PD-7), the label, the text box's row, and the status line. The box sits at its band's foot (D8) | The text box stays where it is today, just above the bar; the band's top shows the scene, where the bicycle hangs | The column at its band's top (the text box mid-window on tall screens) |
| PD-6 | The bar's cluster sits at the foot's right, its right edge at the window's right safe edge, under the column (plan choice). The column and the bar form one cluster on the right, and the strip is the small one at the top | The guidance's "one primary persistent HUD cluster and at most one small secondary cluster" and "Keep the lower-middle playfield mostly clear". The visitor's figure stands front left and the floor's front middle is empty, so a centred bar meets the visitor's feet at the reference desktop (estimate, §2.3) | Centred at the foot (meets the visitor's figure at 1920 × 1200, by estimate); at the foot's left (the visitor's figure) |
| PD-7 | The log's rest height in the column: 8rem where the window is at least 900 CSS pixels tall, 5rem below it, a band in the table that the coverage test tunes (D12) | FR-019's 25% at 1280 × 720 needs the column at about 360 pixels tall there (§3.3) | One height (too tall at 720, too short at 1200) |
| PD-8 | The look's new colours are new properties on `:root` (`--accent-neon: #ffb08a`, `--chip-face`, `--heading-font`, `--figure-font`); spec 005's palette properties keep their values | Spec 012's `loading.css` and its contrast test read spec 005's properties; new ones leave both untouched | Retuning `--tile-face` or `--glass-alpha` |
| PD-9 | One HUD-scoped rule set makes every control a tile: under `html[data-hud="column"]` and `html[data-hud="dock"]`, `.room button`, `.room a[role="button"]`, and `.talk button`, but not inside `.resume-panel`, take the tile's face, border, radius, and size, after `.room button`; the stacked layout keeps the page's (FR-008; spec 005's B8) | One rule beats one class per control, and a stylesheet test can find any control it misses | Adding `.hud-tile` to each control in the DOM (every new control would need it) |
| PD-10 | The hold lives in `walk/hold.ts`: `held` true at entry; `release(intents, figureBox, hud, window)` ends it on a camera intent or `nearsEdge`; the walking view then starts its follow blend from the room's view, with `orbitFrom(view, focus, limits, region)` computing the orbit (yaw, pitch, distance) that puts the camera where the room's view stands, held by `clampOrbit` (FR-030 to FR-033) | Pure and testable; `scene/walking.ts` keeps one camera path, now with a held branch | A second camera mode in `scene.ts` |
| PD-11 | The figure's box for the edge test is its catalog framed box moved to the pose (x, z, and heading about Y), projected at the current camera to the canvas's pixels by `project.ts` | Spec 009's FR-017: the framed box, never the avatar's geometry, so the test is the same for an avatar and a cut-out | The avatar's skinned bounds (changes each frame, and differs by avatar) |
| PD-12 | The grip is applied in `keepPaper` and `paperAt` by `scene/grip.ts`: `hand.attach(kept)`; the sheet's held edge's middle at `at ÷ s` in the hand's local frame (s the hand bone's world scale, so `at` is in the room's metres); its rotation the turn's Euler angles in XYZ order; the sheet's centre half its height from the held edge along the grip frame's −Y (FR-038, FR-039) | One frame (the hand bone's) for data and default alike; metres at the room's scale, so lookdev's numbers read as the room's | Offsets in the avatar's own units (centimetre models would need different numbers) |
| PD-13 | The computed default (FR-040): the grip frame's origin at the midpoint of the hand bone and `…HandMiddle1` (or the hand bone), its −Y along the direction from the hand bone to that bone, its +Z toward the figure's front (the figure's +Z turned into the hand's frame), and +X their cross product | Without data the sheet still hangs from the fingers away from the forearm; with the arm hanging it hangs down in front of the leg, never up the arm | Keeping `PAPER_LIFT` as the default (the bug) |
| PD-14 | The path glow is a ribbon in `scene/glows.ts`: for each segment, a strip of three vertex rows (the path, and the spread's two edges) in the piece's facing plane, each joint mitred to the bisector, the alpha 1 on the path and 0 at the edges, by vertex colours on one `MeshBasicMaterial` with additive blending, `depthWrite` off, `toneMapped` off, as the disc's (FR-044, FR-047, FR-049) | The disc's material and motion code stays; the falloff needs no texture; a closed path of 5 segments is about 30 triangles | A post-processing bloom (a full-screen pass every frame, against R-35's levels); a texture drawn from the path (a canvas per glow, its resolution to manage) |
| PD-15 | The neon sign's path is its stand-in's tube polyline: (−0.244, 0.04), (0.254, 0.04), (0.318, 0.136), (0.254, 0.232), (−0.244, 0.232), and back, at z 0.0137, in the piece's frame at scale 1; the spread 0.015 (D3). Lookdev may tune both, a data edit | The catalog's own tubes trace the arrow's outline the studio's model bends its tube along (its work order); the glow then sits on the tube whether the model or the stand-in shows | Reading the model's tube mesh at run time (a node name the studio's file doesn't promise) |
| PD-16 | The schema: a glow gives `radius` or `path` with `spread`, exactly one (RD); every path point inside the piece's bounds, at least two points, and `spread` in (0, 0.05] (a new rule beside RG's bounds rules); `figures.grips`'s keys in the avatar table, `right` and `left` only, each `at` within ±0.15 and each turn within ±180 (RD). New rule IDs are the next free in each family, recorded at T001 | The compositor refuses bad data in a strict build, as for every catalog field (spec 004's §13) | Runtime checks only |
| PD-17 | The placeholder flag: `emit.ts`'s `placeholders` becomes `standins.length > 0`; `avatarsPlaceholder` is deleted with its import; the room sets the pieces' cause also when the loader reports a piece `failed` or `skipped`; the figure's cause comes from the avatars' controller (`wants.visitor === null`, or its model `missed`) while in 3D (FR-053, FR-054) | The build knows the room's pieces; only the page knows the visitor's choice and what failed | A build-time list of avatars without models (the page still must match it to the choice) |
| PD-18 | The note's words: `layout.ts`'s note shows `standin.note`, `standin.avatar`, or both joined by a space, `standin.note` first; the notes stay two (`HUD_PLACEMENTS.notes.count`), and the notes' bands are re-measured with the longest of the three (FR-054, FR-055) | One slot keeps `notesReserve`, which spec 005 and spec 012 read, at its count | A third note (moves the reserve and spec 012's card) |
| PD-19 | The board's patch (FR-050): from main's checkout, `git show refs/heads/main:assets/policy/content-approvals.json` into a scratch copy, edited by hand, then `diff -u` against a second plain copy, saved as `docs/merge-requests/<date>-room-text-chalkboard.patch`; the digest by `sha256sum` of the block at the branch's tip; the entry's `reason` reads `"<your words>"`, as C-0001's did, for him to fill | The memory of this project's human-only patches: plain copies, never `git apply` or a write into a worktree; his words in his reason | An agent commit to `assets/policy/` (refused by the permissions, and his to make) |
| PD-20 | The sign check: `evals/sign_check.py` (the orchestrator) loads `evals/breach.py` by path for its stack guards, its docker client, and its model-server names, as `breach.py` loads `scripts/operator.py`; `evals/sign_probe.py` runs in the `breach-probe` image on the internal network; the Makefile's `sign-check` copies `breach-test`'s guards and relay (contracts/sign-check.md) | The breach test already proves those guards on dev and dev-cpu; one copy of them | A new service in `deploy/compose.yaml` (FR-067); calling the gateway directly (skips the edge, which the intent names) |
| PD-21 | The page's half: `apps/web/build/room/sign-reading.ts`, run by `npm run -s room:sign` (`node --import tsx`, as `room:check`), imports `signals/turn-cost.ts` and reads `room/ui-words.yaml` through the compositor's loader, and prints the two readings as JSON | The room's own code reads the reply, so the check covers the page's half without a browser, which the toolchain has none of | A browser in the stack (a new image and package) |
| PD-22 | ADR `0046-the-room-framed-under-the-hud.md`, proposed, or the next free number when T002 runs (D10) | Spec 012's 0045 is on its branch | A number fixed now |
| PD-23 | The 2D drawing's protector: the flat drawing's hit areas at the area's scale (`flat.ts`) and its two figures' drawn boxes; `flatScale` takes the frame area (FR-003) | The same rule as 3D, with the drawing's own measures | Keeping the 2D in the clear area (two rules for one room) |
| PD-24 | The lookdev page gains a hands view: the man and the woman, each hand, at rest, in "idle-holding", and mid-walk, with the sheet and the forearm's 4 cm volume drawn as a wire capsule in drafts only (FR-042) | The Author's look needs to see the sheet against the forearm | A screenshot test (no GPU in the sessions) |

## 2. The frame area (`compose/frame.ts`, `compose/protect.ts`; PD-1, PD-2)

### 2.1 The function

As contracts/frame-area.md §2. Inputs: the screen, the docked panels' state, the metrics (the root's rem and the safe areas), and a protector. Output: the area, the ease, and whether it fell back. The room calls it in `refit`, after `hudBoxes` and `compactBoxes`; the compositor calls it per sweep screen.

### 2.2 The protector

`protectorFor(scene)`: from a composed scene (`compose/bundle.ts`'s `RoomScene`): `framedBoxes(scene)` (the boxes the framing takes, as `scene.ts` takes them today), the selectables' members' boxes as `pick.ts` takes them, and the figures' framed boxes (spec 009 FR-017). `boxes(area)` frames at the area's aspect, computes the pick areas in the area's pixels, translates by the area's origin into the window's, and returns each pressable selectable's 44 × 44 core part and each figure's projected box. "Pressable at spec 005's frame" is computed once per screen at step 16 and reused across steps.

### 2.3 Where the estimates land

**Measured at T013** (the compositor's report's "Frame" lines, and the kernel over the room's own bundle): the reference desktop, 1920 × 1200, eases to **10/16**, a frame area of 1640 × 1150.3 over spec 005's 1472 × 1120.5, the room **2.7%** larger on screen (not about 7%); 1920 × 1080 to 7/16 (4.5%); 2560 × 1440, 3440 × 1440, and 5120 × 1440 to **0**, the room 5.8% larger and centred in the window; 1536 × 864 to 13/16 (1.9%); 1366 × 768 to 15/16 (0.7%); 1280 × 720 to 1 (none); the reference phone to 1. Over the sweep's column-layout screens from 1280 × 720, 976 of 2,437 screens and states are at ease 0, 1,114 between, and 347 at 1, the median 6/16. What binds at the reference desktop, step by step: the twin's framed box against the walking control's box (in the clear area's bottom-right corner) until 10/16, the bar's cluster until 8/16, and the column at 0 alone (departure E1). The estimates below, from before the build, are kept as the plan's record.

The room's on-screen width at a height-bound frame is about 0.94 of the frame's height (the shell about square, spec 004's 6% margin). Estimates, from spec 005's table and the scene's placements; T006's model and T013's compositor run replace them.

| Screen | Spec 005's clear area | No-ease frame | Likely meeting at no ease | Estimated ease | Estimated growth over spec 005 |
|---|---|---|---|---|---|
| 2560 × 1440 | 2112 × 1360.5 | the window | none: the room spans about 600 to 1960, the column starts at 2112 | 0 | about 6% |
| 1920 × 1200 (reference) | 1472 × 1120.5 | the window | the twin's right edge (about 1475) against the column band (1472), only if the column's compact box reaches the twin's height | 0 to 1/16 | about 7% |
| 1920 × 1080 | 1472 × 1000.5 | the window | the twin against the column band, by a few pixels | 0 to 1/16 | about 8% |
| 1280 × 720 | 832 × 640.5 | the window | the column over the right wall, the laptop, and the twin, about 150 pixels | likely 1 | none |
| 390 × 844 (dock) | spec 005's dock | the window | the dock over the room's lower part | likely 1 | none |

So the change shows where the Author saw it, on large windows, and leaves small windows as spec 005 made them.

### 2.4 The runtime

- `app.ts`'s `refit` computes `frameArea` from `layout`'s metrics and `protectorFor(bundle)`, sets the room's CSS properties (§3.2), and passes `{ window, area, ease, hud }` to the stage through `SceneOptions.frame()`, which replaces `clear()` (contracts/frame-area.md §7).
- `scene.ts`: `clear` becomes `area`; `shift()` uses `viewOffsetFor(area, size)`; `frameCamera(camera, area.w / area.h, boxes)`; the picker resizes to the area; `inClear` becomes `inArea`, mapping a canvas point into the area's pixels. A point under a compact box never reaches the canvas, since each box takes its own pointer (spec 005's FR-030; `room.css`'s `pointer-events`).
- `fit.ts`: `canvasToClear` and `clearNdc` take the area; their names stay, with a comment (plan choice: no rename across spec 005's tests).
- The fallback (FR-004): `frameArea` returns the clear area with `fellBack`; the frame log records it in a drafts build.

### 2.5 The 2D room

`flat.ts` sizes its view box at `flatScale(area)` and centres it in the area; its hit areas move with it. `room.css`'s `.room-stage-view` while it holds the 2D drawing takes `--frame-x`, `--frame-y`, `--frame-w`, `--frame-h`, beside spec 005's `--clear-*`, which keep their meaning (PD-3; spec 005's B2).

## 3. The compact HUD (`compose/hud.ts`, `room.css`, `layout.ts`; PD-3 to PD-7)

### 3.1 The table's new entries

| Entry | Column layout | Dock layout |
|---|---|---|
| `strip.maxRem` | 34 (estimate), centred at the top; one line where the window holds it, spec 005's bands otherwise | the band, as spec 005 |
| `bar.maxRem`, `bar.align` | 36 (estimate), `right` (PD-6); one row where it fits, two otherwise, by spec 005's bands | the band |
| `column.anchor`, `log.restRem` | `foot` (D8); 8rem at windows at least 900 pixels tall, 5rem below (PD-7) | the dock, as spec 005 |
| `notes.maxRem` | the notes' widest words (the longest of `standin.note`, `standin.avatar`, both, and `twin.stand_in`), measured by the model | the same |

### 3.2 How `room.css` follows it

`layout.ts` sets, beside spec 005's properties: `--strip-w`, `--bar-w`, `--column-h`, `--log-rest`, and `--frame-x`, `--frame-y`, `--frame-w`, `--frame-h`. `room.css`'s rules for `.disclosure`, `.hud-bar`, and `.hud-panels` in the column layout take their widths and heights from them, the strip `margin-inline: auto`, the bar `right: var(--safe-right)`, and the column `bottom: calc(var(--bar-h) + var(--keyboard))` with `height: var(--column-h)` in place of `top`. The larger conversation view keeps spec 005's sizes (up to half the window's width in the column layout), opening over the column's band, and the dock's log sheet is unchanged. The stages test pins each rule to its property, as spec 005's does. Spec 012's loader keeps `--clear-y` and `--notes-h`, unchanged.

### 3.3 The coverage, by estimate

| Window | Strip | Bar | Column | Walk | Notes | Total | Share |
|---|---|---|---|---|---|---|---|
| 1920 × 1200 | 544 × 27.5 | 576 × 52 | 448 × 416 (log 8rem) | 128 × 44 | 420 × 44 | about 254,000 | about 11% |
| 1280 × 720 | 544 × 27.5 | 576 × 52 | 448 × 368 (log 5rem) | 128 × 44 | 420 × 44 | about 225,000 | about 24% |

The bar and the column overlap no area (the bar lies under the column's band), so the union is the sum. T006's model measures the widths and rows; if 1280 × 720 is over 25%, the ladder is: the log's rest at 4.75rem (spec 005's dock sheet), then the column's maximum at 26rem below 1440 pixels wide, each a table edit recorded here.

## 4. The look (`room.css`, `talk.css`; PD-8, PD-9; Q3)

- **Tiles everywhere** (FR-022): PD-9's rule set, after spec 005's `.room button` and before the state rules: the tile's face (`--tile-face`), border (`--tile-border`), radius 0.5rem, words in `--hud-text`, `min-height` and `min-width` 2.75rem. The list's buttons, the talk panel's buttons, the header toggles, and the offer's buttons take it; the rule set excludes `.resume-panel`, which stays spec 005's white document (and gate 4's download stays untouched). The bar's tiles keep their icon-over-words form; the others keep their row form.
- **States** (FR-025): hover and selection: `border-color: var(--accent-neon)` and a 1-pixel inner edge in it, with the face one step lighter; pressed: spec 005's inset ring and underline; focus: spec 005's yellow ring. The selected list item (the room's target) also shows `aria-current` and the edge.
- **Chips** (FR-023): `.room-note` takes `--chip-face` (the glass's colour at the opacity the contrast test fixes), light words, a 1-pixel border, radius 0.375rem; `pointer-events: none` stays. The offer and the status lines take the glass.
- **Type** (FR-024): `--heading-font: "Patrick Hand", cursive` for `.room-list-heading` and the conversation's header; IBM Plex Sans for words, as `fonts.css` sets the body; `--figure-font: "IBM Plex Mono", ui-monospace, monospace` for figures (the resume's dates, the text copy's amounts). Patrick Hand at 1.125rem keeps the headings' line height within the table's header row; the model measures it.
- **Motion** (FR-027): `transition` on border-colour, background, and transform, 120 ms (plan choice), under `@media (prefers-reduced-motion: no-preference)` only.
- **The contrast test** (FR-026): `test/room/hud-contrast.test.ts` gains the chips' face, the accent edge against the glass and the tile face, the heading face's words (the same colour), and the selected tile; each over white and black beneath.

## 5. Walking's hold (`walk/hold.ts`, `scene/walking.ts`, `scene.ts`; PD-10, PD-11)

- **Entry** (FR-030): `enter()` sets `held = true`, `pose = startPose(floor)`, and no `since` blend. `frame()` while held returns `production(stage)`, the room's view, without blending; the picker keeps its camera (no `setCamera` since nothing moved).
- **While held** (FR-031): the figure moves by keys and walk-to; taps pick at the room's view, then the floor (spec 008's order); reach is named as today.
- **Release** (FR-032): each frame while held, `hold.release(intents, figureBox, hud, window)` is true if `intents.turn`, `intents.tilt`, or `intents.zoom` is non-zero, or `nearsEdge` (contracts/frame-area.md §6). The figure's box is PD-11's.
- **Hand-over** (FR-033): `orbit = clampOrbit(orbitFrom(production(stage), focus), focus, limits, region, farthest(base, focus))`, then the triggering intents applied as `frame()` applies them today; `since = now`; `blendCamera(production, follow, now − since, animate)` gives the move, 500 ms or a cut (`walk/camera.ts`, unchanged).
- **Where the figure sits once followed** (FR-034): the follow camera centres the figure in the frame area, as spec 005's FR-018 centred it in the clear area. A frame area's centre lies between the window's centre and the clear area's, and no compact box covers either: the column is at most two fifths of the window's width, and the dock and the bar take less than half its height at every supported screen, which T005 holds over the sweep.
- `orbitFrom(camera, focus)`: distance = |camera − focus|; pitch = asin((camera.y − focus.y) ÷ distance); yaw = atan2(camera.x − focus.x, camera.z − focus.z). With the room's view at x = 0 and the figure's focus at its feet plus 1.1 m, the pitch starts near level and the yaw within the 60° limit (estimate: about 16° for the start place).
- **Leaving** (FR-035): `leave()` as today; while held, `shown` is the room's view, so the return blend is from it to itself: no move.
- **Re-fit** (FR-036): while held, `production(stage)` is recomputed at the new area each frame, so the held view follows the re-fit.
- **The frame log** (FR-064): `walk` entries `hold` and `follow`, with `cause` `turn`, `tilt`, `zoom`, or `edge`.

## 6. The grips (`scene/grip.ts`, `scene/avatars.ts`, the schema; PD-12, PD-13; D1)

- **Data** (FR-039): `scene.yaml`'s `figures` block gains `grips`, for example `grips: { man: { right: { at: [0.02, -0.06, 0.03], turn: { x: 0, y: 0, z: 0 } }, left: {...} }, woman: {...} }`. The first values are T032's estimates from the default's frame, tuned at the Author's lookdev check (T054, then T055); the schema's bounds are FR-039's.
- **The bundle**: `RoomScene.figures.grips`, the same map, typed; absent avatars and hands take the default.
- **Applying** (FR-038, PD-12): `gripFrame(hand, figureFront, grip | null)` gives the sheet's world matrix; `keepPaper` attaches the kept sheet to the hand and sets its local transform from that matrix; `paperAt` (the twin's hold and the hand-off's ends) uses the same frame's held-edge point; `PAPER_LIFT` and its world-Y lift are deleted.
- **The forearm** (FR-038): the forearm bone is the hand bone's parent (`mixamorig:RightForeArm` or `LeftForeArm`); the test's volume is the capsule from it to the hand bone, radius 4 cm at the room's scale.
- **Nothing under `assets/`** (FR-043).

## 7. The path glow (`scene/glows.ts`, the schema, `neon-sign.yaml`; PD-14 to PD-16; D3)

- **The schema** (FR-045): `Glow` becomes `{ id, at?, radius?, path?, spread?, tone, motion, level }`, with RD's exactly-one rule, and the bounds rule for paths. A path glow's `at` is not used; the path's points are positions.
- **The ribbon**: for a closed path of n segments, 3n + 3 vertices in the piece's frame at scale 1 (the group scales it, as today); colour per vertex (r, g, b from the tone; alpha 1 on the path, 0 at the edges, through the `alpha` channel of a 4-component colour attribute, `vertexColors` and `transparent`); triangles 4 per segment. The neon sign's 5 segments give 20 triangles, well under FR-049's 2,000.
- **The facing plane**: the ribbon lies in the plane through the path facing the piece's +Z (the sign's front), offset 1 mm toward the viewer to sit over the tube; the strength's `opacity` and `glowFactor` as today.
- **The sign's entry** (FR-044, PD-15): `tube-glow` gives `path` and `spread`, its `radius` removed; its tone and motion stay `neon-warm` and `flicker`.
- **The letters** (FR-046): `faces/neon.ts` unchanged; lookdev may raise its glow pass's strength, a constant, recorded as a departure if changed.

## 8. The board's approval (PD-19; FR-050 to FR-052)

- **When**: the patch is built at T049, after the branch's last change to `apps/web/content/room/`, against main's `content-approvals.json` as it is then, and rebuilt if main's file moves before he applies it.
- **The entry**: `{"id": "C-000N", "path_when_approved": "apps/web/content/room/chalk-denverlocal.yaml", "kind": "room-text", "sha256": "<the block's digest>", "date": "<the day he applies it>", "reason": "<your words>"}`, N one more than main's last id. The note shows the digest's command (`sha256sum apps/web/content/room/chalk-denverlocal.yaml`) for him to run himself.
- **The drafts**: `chalk-mission.yaml` and `chalk-approach.yaml` stay unapproved (spec 004's T203).
- **The proof**: T038's build test with a fixture policy, whose digest the test computes from the file at run time, never a 64-hex literal in a committed file (the content scan refuses them); and the gate's content check on `main` once he has applied it.

## 9. The placeholder note (`emit.ts`, `app.ts`, `layout.ts`, the words; PD-17, PD-18; Q5)

- **The build**: `placeholders = standins.length > 0` (FR-053; W11).
- **The page**: `layout.setPlaceholders({ pieces, figure })`, `pieces` from the bundle's flag or a loader `failed` or `skipped`, and `figure` from the avatars' controller while the 3D stage shows; in 2D `figure` is false (FR-054).
- **The word**: `standin.avatar` in `ui-keys.ts`'s closed list with no slots, and in `ui-words.yaml` with D11's words; RT's checks hold it.

## 10. The sign's check (`evals/`, the Makefile, `build/room/sign-reading.ts`; PD-20, PD-21; D4)

As contracts/sign-check.md. The Makefile's target:

```make
sign-check: ## The sign's end-to-end check on dev or dev-cpu, model server stopped then started (spec 014); never prod
```

with `breach-test`'s guards: the `ENV` case refusing all but `dev` and `dev-cpu`; the relay for agent sessions (`VIA_RELAY`) on dev-cpu only; the run file; and `$(PY_HOST) $(TREE)/evals/sign_check.py --stack $(ENV) --env-file $(ENVFILE)`. `make check` doesn't run it (it needs a stack); the note records its run (tasks.md T045), and the merge rehearsal runs it again on dev-cpu (T051). `CLAUDE.md`'s "Commands" is human-only in practice (the agent-config evals test it), so the note offers the Author a one-line entry for `make sign-check` rather than adding it.

## 11. Spec 004's checks, the compositor, and lookdev

- **`compose/stages.ts`** (FR-060): `Stage` gains `reserved: Rect[]`; `stageFor(screen)` gives the opening state's frame area with its reserved boxes, computed with the composed scene's protector, which the compositor passes in (`supportedStages(protect)`); the reference stages and `SMALLEST` become the frame areas of their screens. `test/room/legacy-stages.ts` is untouched; `stages-floor.test.ts` holds each frame area to its clear area and so to the legacy floor.
- **`checks/rg.ts`**: RG6 takes each stage's `reserved` in place of `reservedBoxes(clear)` alone; RG5's aspects cover the frame areas' aspects (the series extends if T012 finds one outside it); RG7 unchanged.
- **`report.ts`**: a "Frame" line per screen class: the ease's distribution over the sweep, and the reference stages' ease and growth.
- **The compositor's time**: deduplicating stages by size no longer suffices (each has its reserved boxes); T001 records the time at the base, and T013 the time after. Over twice, the sweep's coarse grid drops to its named screens beyond 1920 × 1200 for RG6, a departure.
- **Lookdev**: the hands view (PD-24); the window run's report gains `ease` and `frame_css` (spec 004's contracts/lookdev.md §6, "(spec 014)").

## 12. Telemetry, the frame log, the disclosure, and the ADR

- **Frame log** (FR-064): `refit` gains `frame` and `ease`; `frame_fallback`; `walk` with `hold` and `follow` and their cause. Drafts only.
- **No event, span, or panel** (D9). **No disclosure change** (FR-065).
- **ADR** (FR-068): `docs/adr/0046-the-room-framed-under-the-hud.md`, proposed, quoting "Overlay only", "Start from the room's view (Recommended)", "One spec for all", his addition, and his acceptance; amending ADR 0043's decisions 2 to 4 by name.
- **The room's README**: "The frame under the HUD", "The grips", and "The path glow", each pointing at its data.

## 13. The amendments, where each lands

| Rows | Files | Tasks (tests; code) |
|---|---|---|
| W1, W3 | `compose/frame.ts`, `compose/protect.ts`, `scene.ts`, `fit.ts`, `app.ts` | T007, T008, T015; T012, T017 |
| W2 | `flat.ts`, `room.css` | T010, T016; T014, T018 |
| W4 | `compose/hud.ts`, `room.css`, `layout.ts` | T005, T006, T023; T011, T026 |
| W5 | `room.css`, `talk.css`, `hud-contrast.test.ts` | T024, T025; T027 |
| W6, W8 | `compose/stages.ts`, `checks/rg.ts`, `report.ts`; room-data-files.md §13.3 | T003; T009; T013 |
| W7 | `signals/frame-log.ts` | T015, T029; T017, T030 |
| W9, W10 | `build/room/schema.ts`, `checks/rd.ts`, `scene/glows.ts`, `neon-sign.yaml`; room-data-files.md §4, §13 | T003; T035; T036, T037 |
| W11, W12, W17 | `emit.ts`, `app.ts`, `layout.ts`, `ui-keys.ts`, `ui-words.yaml`; room-data-files.md §9 | T003; T040; T041 |
| W13, W14 | `walk/hold.ts`, `scene/walking.ts`, `scene.ts` | T029; T030 |
| W15, W16 | `scene/grip.ts`, `scene/avatars.ts`, `schema.ts`, `scene.yaml`; room-data-files.md §5 | T003; T031; T032 |
| W18 | ADR 0046 | T002 |

## 14. The Author's patches and actions

**The patch**: one. `docs/merge-requests/<date>-room-text-chalkboard.patch`, the board's approval (§8). He reads the block, runs `sha256sum` on it himself, fills his `reason`, and commits it on `main` (his `git apply` or his editor, his choice). It can land before or after the branch's merge: before, the merge's release build shows the board; after, the next `make up` does.

**The Author's actions, in order** (the note gives each as a short, wrap-proof line):
1. Approve the spec and this plan (T000), and say whether `spec/014-room-after-the-demo` merges on its own after its gate or travels at the base of `feat/014-room-after-the-demo`.
2. After the review, bring the branch's drafts build up on dev and look at lookdev's hands view (the man and the woman, each hand), the sign's glow in the vignette, the window run's frame at the reference desktop, and the HUD's look (T054; SC-006, SC-007). A grip, a spread, or a tone to tune is a data edit the implementer makes on the branch (T055).
3. After spec 012 and gate 4 have merged, apply the board's patch on `main` (T056).
4. Gate the branch with `tools/gates/gate feat/014-room-after-the-demo` from main's checkout, and merge with the command it prints (T057).
5. Bring the room up and look at it live (T058; SC-014), and run the lookdev performance runs (SC-013).
6. If he wants, run `make sign-check ENV=dev` on his dev stack (T059).
7. Accept ADR 0046 or leave it proposed; overturn any of Q1 to Q5 or D1 to D12 (T060).

## 15. The branch, and the order of work

- **The documents**: `spec/014-room-after-the-demo`, cut from `main` at b335b9b2, holds this folder.
- **The code**: `feat/014-room-after-the-demo`, in its own worktree, cut from `refs/heads/main` after spec 012's `feat/012-loading-screen` has merged (`git worktree add -b feat/014-room-after-the-demo <new folder> refs/heads/main`, after checking main's SHA holds spec 012's merge). Then `npm ci --ignore-scripts --cache "$TMPDIR/npm"`, and this folder enters by cherry-picking `spec/014-room-after-the-demo`'s commits if main lacks them. Agents rebase and cherry-pick, never merge, and commit before any pause, since `/tmp` is wiped when WSL restarts.
- **Spec 012's files** (`layout.ts`, `app.ts`, `scene.ts`, `scene/avatars.ts`, `emit.ts`, `ui-words.yaml`, the room's README) are on `main` by then, so this branch builds on them; T001 reruns spec 012's tests at the base, and every phase keeps them passing.
- **Gate 4 and the shutdown test's fix**: independent; gate 4 changes the resume's download, which this spec leaves alone (FR-022), and the board's patch is built against main as it is at T049 and rebuilt at T051 if main's file moved.
- **The phases** (tasks.md): Setup; Foundational, the kernel and the degraded paths first (the compact boxes and the coverage, the frame area and its fallback, the protector, the stages, the 2D drawing's area); User Story 1 (the frame, P1); User Story 9 (the faults, P1, beside it); User Story 2 (the compact HUD's page and the look); User Story 3 (walking's hold); User Story 4 (the grips); User Story 5 (the glow); User Story 6 (the board); User Story 7 (the note); User Story 8 (the sign's check); Polish, the review, the Author's lookdev check, and his patch and merge steps.
- **The merge**: one branch, one gate, his merge ("One spec for all").

## 16. Expected cost, and how it's measured

As the spec's [Expected Cost Impact](spec.md#expected-cost-impact): $0. Measured by:
- the build's chunk-size check, the entry chunk's size before and after in the note;
- `npm run room:check`'s time and stage count, before and after;
- the compositor's report's ease per screen class and the reference desktop's growth;
- the layout model's coverage table at each landscape window;
- the lookdev reports (the Author's runs);
- `make sign-check ENV=dev-cpu`'s table in the note.

## 17. Risks and mitigations

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | The ease is 1 on the reference desktop, so the Author sees no change where he looked | §2.3's estimate says 0 to 1/16. If T013 finds more, the ladder: the bar's cluster narrower (two rows), the column's log rest lower, then the protected figure box trimmed to its upper two thirds (a departure, his to accept) |
| R-2 | The coverage exceeds 25% at 1280 × 720 | §3.3's ladder, each step a table edit recorded here |
| R-3 | The compositor's time more than doubles | §11's coarse-grid step, a departure |
| R-4 | On dev-cpu, the twin route with its model server stopped doesn't reach the synthetic fallback (its readiness or its purpose gate) | T001 confirms by reading `room-turn.ts` and the gateway's admission for the `twin` purpose. If it doesn't, the check's paid half runs on dev only, in the Author's terminal, and dev-cpu's run proves the local half and the refusals; a departure recorded here |
| R-5 | The edge rate-limits the check's two turns | They are two, seconds apart; T001 reads x005's limit for `/api/room/turn` |
| R-6 | Patrick Hand's metrics make the headings taller than the table's header row | The model measures; the heading's size steps down to 1rem |
| R-7 | The hand bones' frames differ between the man and the woman, so one default looks wrong for one | The data grips per avatar (D1) override it, and lookdev judges each |
| R-8 | The ribbon's mitred joints spike at the arrow's sharp tip | The mitre is capped at twice the spread; beyond it the joint is bevelled |
| R-9 | Spec 012's loader card or its contrast test moves with the new properties | PD-3 and PD-8 leave its properties' meanings and values as they are; its tests run in every phase |
| R-10 | The content scan refuses the 64-hex digest in the committed patch | T049 checks with `gitleaks dir` and the content scan; if refused, the patch travels outside the repository, in the job's scratch folder, its path in the note, as a precedent of this project's for human-only patches |
| R-11 | The hold's edge trips at entry for a figure standing within 0.5rem of the bar | The protection keeps both figures 0.5rem clear at the room's view (FR-010), so the edge can't hold at entry; T029 tests it |

## 18. Requirement coverage

| FRs | Plan | Tasks (tests, then code, then the Author's) |
|---|---|---|
| FR-001, FR-002 | §2, §12 | T021; T022 |
| FR-003 | §2.5 | T010, T016; T014, T018 |
| FR-004 | §2.4 | T007, T015; T012, T017 |
| FR-005 | §6 | T031; T032 |
| FR-006 | §7 | T035; T036 |
| FR-007, FR-008 | §4 | T024; T027 |
| FR-009 to FR-012 | §2 | T007, T008; T012 |
| FR-013 to FR-015 | §2.4 | T015; T017 |
| FR-016 | §2.2 | T008; T012 |
| FR-017 to FR-021 | §3 | T005, T006, T023, T024 (FR-018); T011, T026, T027; T028 |
| FR-022 to FR-028 | §4 | T024, T025; T027; T054, T058 |
| FR-029 | §1 (the guidance cited only) | T052 (the review searches for copied text) |
| FR-030 to FR-037 | §5 | T029; T030 |
| FR-038 to FR-043 | §6, §11 | T031, T033; T032, T034; T054 |
| FR-044 to FR-049 | §7 | T035; T036, T037; T054 |
| FR-050 to FR-052 | §8 | T038; T039, T049; T056 |
| FR-053 to FR-055 | §9 | T040; T041 |
| FR-056 to FR-059 | §10 | T042, T043; T044; T045, T051 |
| FR-060, FR-061 | §11 | T009; T013 |
| FR-062 | §4, §5 | T046 |
| FR-063 | §11 | T019; T020; T058 |
| FR-064 | §12 | T015, T029; T017, T030 |
| FR-065 | §12 | T021 (the network log) |
| FR-066 | §9 | T040; T041 |
| FR-067 | §10, §15 | T047 |
| FR-068 | §12 | T002 |

## Complexity Tracking

No constitution violation needs justifying. Three choices add weight on purpose:

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| A scene-dependent frame area shared by the room and the compositor (PD-1, PD-2) | "Overlay only" with every piece still pressable, and the checks judging the frame the visitor sees | A fixed overlay frame puts pieces under glass (Q1's option B), and a runtime-only frame lets the checks drift from the room |
| Compact boxes beside spec 005's bands (PD-3) | The guidance's budget without moving spec 005's floor or spec 012's card | Replacing the bands moves what two merged specs tested |
| A dev-stack check outside `make check` (PD-20) | The intent asks for the chain through the edge, which only a running stack has | A unit test of `turn-cost.ts` alone already exists and proves nothing about the edge |

## Constitution Check (post-design)

Re-checked after §1 to §14. Nothing in the design changes a verdict above. The places nearest a line:
- **Principle IV**: the board's patch is the one human-only file; it is built from plain copies and applied by him (§8).
- **Principle VIII**: the note's words come from what is missing at run time, so it can't say the room's pieces are placeholders when they aren't (§9).
- **Principle II**: the look, the grips, and the glow are judged by the Author's eye at his lookdev check before the gate (T054) and on the live room after it (T058); the contrast and geometry tests hold their measurable parts throughout. No new graph: the spec's Deviations read workflow step 7 as met by the room's existing panels, with D9 offering an event and a panel on his word.

Gate result: **PASS**.

## Analyze pass (spec × plan × tasks × constitution)

A read-only consistency pass in the form of `/speckit-analyze`, made after tasks.md was written, on 2026-11-10. Findings fixed in the documents before they were handed over are marked "resolved"; the rest are open, for the Author or for the task named.

| ID | Category | Severity | Location | Summary | Resolution |
|---|---|---|---|---|---|
| A1 | Inconsistency | HIGH | spec, the term "A HUD box"; FR-009; Edge Cases | The draft's term counted the larger view, a sheet, and the resume as HUD boxes while open, so FR-009's ease would re-frame the room when one opened, against spec 005's FR-027 and FR-028 and this spec's own edge case | Resolved: a HUD box is a docked part at rest; what the visitor opens is not one (the term; contracts/frame-area.md §1) |
| A2 | Inconsistency | HIGH | spec FR-022, FR-024, User Story 2 scenario 3; plan §4; gate 4 | The draft restyled the resume's buttons and heading, the panel gate 4 is changing for its download at the same time, and turned a white document into tiles | Resolved: the resume's panel stays spec 005's document (FR-022; Readings; PD-9; T024) |
| A3 | Inconsistency | MEDIUM | spec FR-017 (b) (draft "centred"); plan §2.3, PD-6 | By estimate, a bar centred at the foot meets the visitor's figure's feet at 1920 × 1200, which would ease the frame and lose most of the growth | Resolved: the bar's place along the foot is the table's; PD-6 puts it at the right, under the column, one cluster with it |
| A4 | Inconsistency | MEDIUM | spec FR-019, the term; contracts/frame-area.md §3 | The coverage left out the notes, which sit over the scene at every visit (the stand-in line always shows) | Resolved: the notes' reserve counts |
| A5 | Constitution (III, the Author's words) | MEDIUM | spec Clarifications, the answers before the spec | The draft labelled his three answers "→ A", naming an option letter this folder doesn't hold | Resolved: recorded as his words alone, with the intent's outcome beside each |
| A6 | Coverage | MEDIUM | spec FR-018; tasks.md (draft) | FR-018 (the log's rest height, the larger view on request) had no test, and the task list skipped T028 | Resolved: T024 tests FR-018; T028 verifies spec 005's and spec 012's HUD tests on the compact page |
| A7 | Underspecification | MEDIUM | tasks.md T035, T038, T040 (draft) | Three tasks named test files that don't exist on `main` (`test/build/approvals.test.ts`, `test/room/emit.test.ts`, an existing `glows.test.ts`) | Resolved: `test/approvals.test.ts`, `test/room/compose.test.ts` and `bundle.test.ts`, and a new `glows.test.ts`; plan's tree to match |
| A8 | Edge case | MEDIUM | spec FR-057; contracts/sign-check.md §2 | A dev stack whose kill switch a breach test left tripped would degrade the check's turn, a miss that proves nothing | Resolved: the check refuses such a stack and names the Author's reset |
| A9 | Ambiguity | MEDIUM | spec SC-001; plan §2.3, R-1 | "Larger on the reference desktop" rests on hand projections of the selectables' and figures' boxes; the real ease comes from the composed scene | Open until T013, with R-1's ladder; its last step (trimming a figure's protected box) is a departure for the Author |
| A10 | Dependency | MEDIUM | spec FR-056; plan R-4 | Whether dev-cpu's twin turn, its model server stopped, reaches the synthetic fallback was read from the routing file and the route's field, not run | Open until T001; the way out is the Author's dev run (T059) for the paid half |
| A11 | Underspecification | MEDIUM | spec FR-019; plan §3.3 | 1280 × 720's coverage is estimated at about 24%, close to the cap | Open until T006, with §3.3's ladder |
| A12 | Constitution (workflow step 7) | MEDIUM | spec Telemetry, Deviations; `CLAUDE.md`'s "New endpoint or feature" | No new panel or event: the changes are presentation on the device, and a graph of their own would need an event the intent's "Data-flow impact: None" rules out | Accepted: read as met by the existing "Room" row and named in the spec's Deviations; D9 offers the event and panel on his word. Of `CLAUDE.md`'s list: no span (no server path), no panel (D9), the cost stated ($0), the degraded table defined, no disclosure entry (no byte leaves) |
| A13 | Inconsistency | LOW | plan PD-9 (draft) | A pipe character inside a table cell split the row | Resolved |
| A14 | Ambiguity | LOW | spec FR-024 (draft) | The faces were listed in an order that paired the headings with the sans | Resolved: each use named with its face |
| A15 | Constitution (spec 004's design) | LOW | spec FR-060; contracts/frame-area.md §5 | Spec 004 keeps the stages out of the data files so a data edit can't weaken the checks; the frame area now depends on the scene | Resolved: a Reading and the contract show the ease can't fall below spec 005's frame or leave a pressable piece under a panel, so no check weakens |
| A16 | Underspecification | LOW | spec FR-034; plan §5 | A followed figure, centred in the frame area, might sit under a compact box | Resolved: the frame area's centre lies in none, which T005 holds over the sweep |
| A17 | Terminology | LOW | spec "HUD box"; plan and contract "compact boxes" | Two names for one thing | Resolved: the spec's term names the plan's |
| A18 | Process | LOW | plan §10; `CLAUDE.md`'s Commands | A new make target would want a line in `CLAUDE.md`, which agents don't edit | Resolved: the note offers him the line (T044) |
| A19 | Coverage | LOW | spec SC-006, SC-007, SC-014 | The grips, the glow, and the look are judged by eye, not by a test | Accepted: T054 before the gate, T058 after; the geometry and contrast tests hold the rest |
| A20 | Risk | LOW | plan R-10 | The content scan may refuse the 64-hex digest in the committed patch | Open until T049, with R-10's way out |

**Coverage summary**: every FR from FR-001 to FR-068 has at least one task, by number or inside a named range (§18's table). Every success criterion has a test task or an Author's step:
- SC-001: T007, T008, T013
- SC-002: T009, T013, T023
- SC-003: T006
- SC-004: T024, T025
- SC-005: T029
- SC-006: T031, T054
- SC-007: T035, T037, T054
- SC-008: T038, T049, T056, T057
- SC-009: T040
- SC-010: T042 to T045, T051
- SC-011: T021, T046
- SC-012: T046
- SC-013: T058
- SC-014: T058
- SC-015: T047
- SC-016: none needed; the Author's words in the intent are the record

No task lacks a requirement or a story.

**Metrics**: 68 FRs; 16 SCs; 61 tasks (T000 to T060), 7 of them the Author's (T000, T054, T056 to T060); one review by an agent that wrote none of the work (T052); FR coverage 100%. Findings: 0 critical. 2 high, both resolved. 10 medium: A3 to A8 resolved, A12 accepted, A9 to A11 open until T001, T006, and T013. 8 low: A13 to A18 resolved, A19 accepted, A20 open until T049.

**Next actions**: the Author's approval of the spec and this plan (T000), with his yes or no to Q1 to Q5 and D1 to D12; then, after spec 012's merge, T001 (which settles A10), T006 (A11), and T013 (A9).

## Departures (implementation)

Each departure is recorded here in the commit that makes it, the Author's to overturn.

| ID | Task | What the build does instead | Why |
|---|---|---|---|
| E1 | T013 (R-1) | The reference desktop eases to 10/16, the room 2.7% larger on screen, not the 0 to 1/16 and about 7% §2.3 estimated. R-1's ladder isn't taken: its first two steps (a narrower bar, a lower log) don't reach what binds, the walking control's box over the twin's framed box, which sits at the clear area's corner where the twin stands once the frame grows (spec 008 FR-021, kept by FR-017); its third, the figures' protected boxes trimmed to their upper two thirds, would give about 1/16 and 6.6%, and is his to accept | The plan names the third step "a departure, his to accept". The note asks him; the trim is one constant in `compose/protect.ts` if he says yes |
| E2 | T013 (§11) | RG5's aspect series takes one more step down, `STEPS_DOWN` 3 (0.2304 first), since a 320 × 1200 window's frame area at ease 0 has an aspect of 0.267, under the clear areas' 0.299. The series still covers the clear areas' widest, 9.41, since a frame that falls back frames into one (FR-004); spec 005's cover test reads both sets | §11's "RG5's aspects cover the frame areas' aspects (the series extends if T012 finds one outside it)" |
| E3 | T012, T013 (FR-061) | `Protect.boxes(area, clear)` gives null where a selectable pressable at spec 005's frame would be left to the list at the area's framing, and `frameArea` then takes the next step. Contract §2's `boxes(area)` gains the clear area as its second argument, for the "pressable at spec 005's frame" it measures once per clear area | T009's subset test found the chalkboard list-only at three portrait frame areas (368 × 880, 384 × 896, 384 × 1008) where spec 005 kept its tap: its core met another's at the taller frame's framing, which the HUD boxes' margin alone can't see. FR-061 holds the list-only set to spec 005's |
| E4 | T013 | RG6 counts and lists its stages by size: a reason's "and N others" and the report's side-wall stages name sizes once each, since two frame areas of one size can differ in their reserved boxes. Spec 004's side-wall tests take the frame areas' sizes (45 stages 320 px wide become 54; "and 44 others" becomes "and 53 others"), each listed in the note | The reasons name sizes, and two entries for one size would read as a repeat |
| E5 | T013 | The frame areas' sweep is cached by the protector's input as well as by the protector itself (`Protect.key`), the last eight scenes | Each compose builds its own protector, so a test file's many composes of one scene swept the frame areas again each time, about 4 s a compose |
| E6 | T013 (§11) | The compositor's reference stages are their screens' frame areas, so RG7's caps and the index's `screen_css` are measured there (the counters face reads 23.1 px on the desktop, 21.9 before); `REFERENCE_DESKTOP.stage` and `REFERENCE_PHONE.stage` keep spec 005's clear areas as the floor's names, and the report's spec 005 line still prints them | §11's "the reference stages and SMALLEST become the frame areas of their screens", without moving the constants spec 005's tests and lookdev read |
| E7 | T014 (PD-23) | The index's 2D drawing gains `flat.figures`, the twin's and the visitor's framed boxes in the view box, projected as `flat.hits` are, which the 2D protector reads; spec 004's room-bundle.md §3.1 notes it "(spec 014)" | The index had no figure box for the 2D drawing: the twin is one of its items by placement, and the visitor a cut-out drawn at its place |

