# Probe: the words on the pieces (spec 029, group C)

Night 4 (2026-11-16), `probe-words-029`, from `f411d8e1`. This is notes only: no code, test, corpus, or proposal. It is written for the spec-writer (`night/spec-029/spec-029`, whose intent draft `070becf2` I read) and for group C's implementers. Where I give a reading of my own, I say so. The Author's words are quoted as he wrote them.

## 0. Summary

- **None of the five phrases needs a corpus proposal.** "Applied AI Engineer" is already in the corpus, in his words (`corpus/07-denver-local-ai.md:10`). The two signs' words and "RESUME" don't state a fact about the Author. They are his sign lettering and a label, and the room already has a way to source each one (an intent quote, or a UI word).
- **Spec 004 already specifies both signs' lettering**, as FR-032's traced outlines with his older wording ("I am very busy", "my dog thinks i'm cool"). That design never landed: no outline was committed and no face is bound. Spec 029 replaces it with lettering set in code, which is his answer "Drawn in the room's code". It must name that as a deviation from spec 004 FR-032 (§5).
- **RT13 would pass the dog sign's corrected words on the intent's own reading**, not on his words, unless his morning answer is recorded first (§1.3, Q1, Q2).
- **The busy sign is purple (`#5b3f9e`)**, but the `sign` renderer always draws a cream ground (`#efe6d2`, the dog sign's cream) with near-black ink. Its look is a question (Q3).
- **No blinking cursor exists in the room today.** The terminal's cursor is blue and only shows while it types. A green cursor that blinks, and holds still otherwise, is new behaviour in `faces/terminal.ts` and `scene/faces3d.ts`.

## 1. The five phrases: where they are, and whether they must come from the corpus

### 1.1 Search

I searched `corpus/**`, `apps/web/content/**`, `facts/` (absent: the facts slots are `corpus/facts/*.yaml`, inside `corpus/**`), and `apps/web/src/**`, exact and case-insensitive (commands in §6).

| Phrase | Exact hits | Case-insensitive hits beyond those |
|---|---|---|
| "I AM VERY BUSY" | none | none |
| "My dog thinks I'm cool" | none | `corpus/intake/interview-2026-11-06-hobbies-mission-work.md:19`: `- Q: The sign in the room says "my dog thinks i'm cool." Tell me about your dog.` This is the interviewer's question, not a tagged corpus sentence. |
| "My dog things I'm cool" | none | none |
| "RESUME" | none as an uppercase word (`grep -w`) | 449 hits for the lowercase word "resume" (resume.yaml, the resume's code, proposals). None of them is this label. |
| "Applied AI Engineer" | `corpus/07-denver-local-ai.md:8` and `:10`; `apps/web/content/resume.yaml:264`, `:269`; proposals and intake (below) | Every case-insensitive hit is either one of these or a match inside "Applied AI Engineering Lead" (`corpus/00-profile.md:8`, `:9`, `:59`; `corpus/facts/career.yaml:22`, `:25`; `apps/web/content/resume.yaml:20`, `:23`, `:36`, `:41`; `corpus/06-work-projects.md:35`, `:55`) |

The "Applied AI Engineer" hits, quoted:

- `corpus/07-denver-local-ai.md:8`: "`[A-DOC site]` The site calls them "a husband and wife team in Denver, working in person at your table," and gives Hareet's role there as Applied AI Engineer."
- `corpus/07-denver-local-ai.md:10`: "`[A 2026-10-30]` His resume label for the company, in his words: "(co-owner, Applied AI Engineer)"."
- `apps/web/content/resume.yaml:264`: `text: "Denver Local AI Solutions (co-owner, Applied AI Engineer): private AI for small Denver teams, with sensitive files kept on hardware they own."`, and `:269`: `quote: "co-owner, Applied AI Engineer"`.
- `corpus/00-profile.md:8`: "`[A-BIO, A 2026-10-07]` Hareet is the Applied AI Engineering Lead at Medic, …" This is his Medic title, which is a different string.
- Proposals (`resume-followup-2026-11-06.md:25`, `:69`, `:83`, `:96`, `:104`; `golden-qa-2026-11-06.md:24`; `topics-2026-11-06.md:22`; `corpus-additions-2026-10-29.md:187`) and intake (`sre-to-applied-ai-chat-excerpt.md:1`, `:17`; `artifacts/applied-ai-engineering-lead-jd.md:1`) hold the phrase too. They are history and source material, not the corpus the twin reads.

The room's data also names both signs already, in lowercase, as spec 004 gave them: `apps/web/room/catalog/busy-sign.yaml:1`, `:12` (`name: "Desk sign: I am very busy"`), and `apps/web/room/catalog/dog-sign.yaml:1`, `:10` (`name: "Desk sign: my dog thinks i'm cool"`). Spec 004 FR-032 (`specs/004-room-composition/spec.md:419`) gives them as "with its words exactly as the Author wrote them, "I am very busy" and "my dog thinks i'm cool"".

### 1.2 Which words state something about the Author

The rules:

- The constitution's principle VIII: "It speaks only from a curated, versioned corpus about the Author's real work".
- Principle VII: "Range is demonstrated, not claimed, and never inflated."
- CLAUDE.md, under Things Claude gets wrong: "stating a number about the Author that isn't in the corpus or a filled `facts/` slot".
- `corpus/README.md`, under Role precision: "Every role claim carries an ownership verb".
- In the room, spec 004 §7 and §9 (`contracts/room-data-files.md`): a line that "states something about the Author" sets `about_author: true` and carries `claims` to the corpus (RT3, RT4, RT5). SC-008 says "100% of drawn words in a release build trace to an approved room-text file, the published resume's section titles, a UI word, or a live value".

| Words | About the Author? | Recommendation |
|---|---|---|
| "Applied AI Engineer" (the monitor) | **Yes.** It is a role or title. | **Already sourced.** Cite `corpus/07-denver-local-ai.md:10`, `[A 2026-10-30]`, quote `Applied AI Engineer` (a span of that one tagged sentence: "His resume label for the company, in his words: "(co-owner, Applied AI Engineer)"."). `:8`'s `[A-DOC site]` sentence backs it. No proposal. The monitor's room-text line carries `about_author: true` with that claim, and `words_from` quotes his review in intent-029 ("The monitor should say "Applied AI Engineer" with the cursor in green font"). My reading: the corpus gives this as his Denver Local AI role, and his Medic title is "Applied AI Engineering Lead" (`00-profile.md:8`). Shown alone on the monitor it claims less than that title, not more, so principle VII holds. His words are explicit, so I raise no question. |
| "I AM VERY BUSY" (the desk sign) | No fact about him. It is his sign's lettering, his own design (spec 004 answer 4: "The signs are our own creations."). | **No corpus.** The words come from intent-029's quotation of his review. That is the outline's `intent_ref` route, which RT13 checks in strict mode. His review quotes `"I AM VERY BUSY"` exactly, so RT13 passes. |
| "My dog thinks I'm cool" (the dog sign) | No fact about him. It is his sign's lettering, as above. | **No corpus.** The same intent route, but see §1.3: the corrected words aren't his yet. |
| "RESUME" (the held paper) | No. It is a label on the paper. | **No corpus.** Make it a UI word (a new closed-list key in `src/room/ui-keys.ts` and `apps/web/room/ui-words.yaml`, no slot, no claims), so SC-008 traces it and code holds no literal. |
| The paw print | Not words. | It is a drawn shape, so SC-008 doesn't count it. It must not add a word to the text copy (§2.2). |

**No `corpus/proposals/` file is needed for group C.** If the Author ever wants the sign's words in the twin's answers, that is a separate proposal. Nothing in his orders asks for one.

### 1.3 The dog sign's words and RT13: one catch

RT13, in strict mode, accepts an outline whose `words` appear between quotation marks anywhere in the intent its `intent_ref` names (`apps/web/build/room/checks/rt.ts:770` to `:778`). The draft intent (`night/spec-029/spec-029`, `070becf2`) already contains `"My dog thinks I'm cool"` in quotation marks, but only in its own reading ("Reading (this intent's, for the Author to correct; it is not his): … "My dog things I'm cool" is read as "My dog thinks I'm cool""). So RT13 would pass the outline on the agent's reading, not on his words.

My recommendation: group C's dog-sign task waits on his answer (Q1, Q2). Once he answers, record it verbatim in intent-029 in his words (a dated answer under the review, as spec 016 recorded its studio session). His words then hold the quote, and the reading only sits beside it. Until then, the dog sign's outline may ship only in a drafts build, behind its "Draft" badge (FR-030). His hash approval comes after his answer.

## 2. The pieces in the room's code

None of the three pieces has a face bound in `apps/web/room/scene.yaml`. Their placements (`:46` to `:50` desk-screen, `:86` to `:91` busy-sign, `:92` to `:101` dog-sign) carry no `faces:`. Each catalog entry declares a readable live face, but `scene/faces3d.ts` gives a quad only to a face that the index binds, and leaves a face with no words plain (`faces3d.ts:6`). So all three show plain today: a stand-in colour, or the studio model's plain quad.

### 2.1 Desk sign (`busy-sign`)

- **Catalog** `apps/web/room/catalog/busy-sign.yaml:18` to `:25`: live face `role: lettering`, `at [0, 0.0502, 0.0172]`, `size [0.192, 0.0613333]`, leaning back 12.16°, `px [1024, 327]`, `readable: true`. The model is `busy-sign.glb` (`:31`); its stand-in is two `sign-purple` boxes (`:27` and `:28`). `sign-purple` is `#5b3f9e` (`looks/inked-cel.yaml:39`).
- **Scene** `scene.yaml:86` to `:91`: on the desk, `turn: { y: 12 }`, `label: label.busy-sign` ("Desk sign, busy", `ui-words.yaml:83`), `edible: { chunks: 4 }`.
- **Today**: no words. The catalog comment (`:2` and `:3`) says the face is "drawn live from its approved outline once the outline arrives (T202); until then it stays plain". No outline was ever committed: `apps/web/content/room/outlines/` holds only `twin-shirt-lettering.outline.json`.
- **Eating**: spec 024's chunker sets live faces aside before it splits a piece (spec 024 Q107; `eat/chunker.ts` `setAside`), as the bound chalkboard shows. A bound lettering quad stays put while the sign is eaten, the same as the chalkboard's face.

### 2.2 Dog sign (`dog-sign`)

- **Catalog** `apps/web/room/catalog/dog-sign.yaml:16` to `:23`: live face `role: lettering`, `at [0, 0.0645, 0.0004]`, `size [0.1307, 0.0893]`, leaning back 4°, `px [1024, 700]`, `readable: true`. The model is `dog-sign.glb` (`:29`); its stand-in is a `sign-wood` foot and a `sign-cream` plate (`:25` and `:26`). `sign-cream` is `#efe6d2`, the same as the `sign` renderer's background.
- **Scene** `scene.yaml:92` to `:101`: on the right wall (spec 026 r3), `label: label.dog-sign` ("Desk sign, dog", `ui-words.yaml:84`). It is also the selectable `dog-sign` (`:240` to `:244`, `emblem: paw`, topic `hobbies-and-travel`).
- **Today**: no words. The catalog comment says the same as the busy sign's.
- **The paw**: `apps/web/src/room/hud/icons.ts:76`, `EMBLEM_ICONS.paw`, is a pad and four toes, each a closed subpath on a 24-unit grid. The HUD strokes it (`hud/split.css`); a sign would fill it. It tokenizes under §8's path grammar. I checked this with a standalone copy of `isPathData`'s token pattern (`build/room/schema.ts:92`), run in `python3 -I` over the path read from `icons.ts`: every token matched, and the first command is `M`. The grammar accepts `a`, `s`, `c`, and `.5`-style numbers. `test/ui/hud-split.test.ts:632` pins the emblem names, not the path, so reusing the path doesn't touch that test.

### 2.3 Monitor (`desk-screen`)

- **Catalog** `apps/web/room/catalog/desk-screen.yaml:17` to `:24`: live face `role: screen`, `at [0, 0.3446, -0.0047]`, `size [0.8017, 0.3367]`, `px [2048, 860]`, `readable: true`. It has a glow `screen-glow` (`:26`, `motion: breathe`), and its stand-in display plane is `screen-glow`, `lit: false` (`:31`). Its `top-edge` anchor (`:16`) carries the neon sign.
- **Scene** `scene.yaml:46` to `:50`: `label: label.monitor` ("Monitor", `ui-words.yaml:74`). It is a member of the selectable `laptop` group (`:228`).
- **Today**: a plain glow. Spec 004 FR-031 planned "a terminal half and a desktop half drawn by the room once its scripts are bound (FR-031, T191)" (catalog comment `:2` and `:3`). Those scripts never came.
- **Binding the face brings in the fixed line `around.illustration`**: "The monitor's screen is a scripted illustration" (`ui-words.yaml:30`). The text copy adds it "once the monitor's face is bound" (`src/room/text-copy.ts:14`). That changes "Around the room", and `test/ui/around.test.ts` and `test/ui/text-copy.test.ts` cover it. The spec-writer should say whether that line still fits a screen that reads "Applied AI Engineer" (my reading: it does).

### 2.4 The visitor's held resume paper

- **3D** `apps/web/src/room/scene/bundle3d.ts:67` to `:69` (`SHEET = [0.21, 0.297]`, A4) and `:271` to `:280`: one `PlaneGeometry`, shared by two meshes. `paper` travels from the twin's hand, with material `atTwin`; `kept` stays in the visitor's hand, with material `atVisitor`. Both materials are `MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity, side: DoubleSide })`, at opacity 1 and 0. The hand-off crossfades their `opacity` (`test/room/avatar-handoff.test.ts:171` and `:172`). `scene/avatars.ts` puts the same `paper.sheet` in the twin's holding hand before the hand-off (`:622`), and attaches `kept` to the visitor's hand after it (`:28` and `:29`). `scene/grip.ts:19` repeats the sheet size as `SHEET_SIZE`.
- **Today**: a plain white sheet with no texture.
- **2D** `apps/web/src/room/flat.ts:274` and `:275`: `PAPER = { w: 8, h: 11, fill: "#ffffff", stroke: "#555555" }`, three `rect`s (`:435` to `:445`), with no words.
- **Notes for the implementer**:
  - Because the material is `DoubleSide`, a `map` on it shows "RESUME" mirrored from behind. Either accept that (it is paper) or draw the word on a front-only quad.
  - Keep the two materials, so the crossfade still works.
  - Since `paper.sheet` and `kept` share one geometry and both materials need the map, the twin's sheet reads "RESUME" too. My reading: it is the same paper, so that's right.
  - In 2D, the 8 × 11 view-box sheet is small. A rotated `text` element is possible, but I recommend the 3D sheet first and the 2D sheet only if it stays legible.

### 2.5 The neon sign above the monitor, which stays as it is

- **Catalog** `apps/web/room/catalog/neon-sign.yaml` (`id: neon-sign`, "Neon arrow sign"). **Scene** `scene.yaml:51` to `:70`: mounted `on: desk-screen, anchor: top-edge`. It has three faces (`word`, `call`, `visit`), all on the `neon` renderer: `ui: [sign.word]` and the `turn-cost` counters.
- **Words**: `ui-words.yaml:17` to `:28` (`sign.word: Langfuse`, …). **Renderer**: `src/room/faces/neon.ts` (`:1`, "Langfuse" in IBM Plex Sans Bold, drawn as a tube).
- **Group C changes none of these files.** Binding the monitor's face doesn't move the neon sign: it mounts on the monitor's anchor, not its face (`compose/mount.ts:8`).

### 2.6 What already exists for drawing words and a paw

| Helper | Where | What it gives group C |
|---|---|---|
| The `sign` renderer | `src/room/faces/sign.ts` | Fills an outline's `paths` in `#1a1a1a` over a `#efe6d2` ground, fitted by `fitOutline` (`compose/layout.ts:118`). Its words are the outline's `words`, and those go to the text copy. It needs no change if the paw is baked into the dog sign's outline `paths` (one `path` op; its `words` stay the sentence alone). |
| The outline format | spec 004 §8 (`contracts/room-data-files.md:406`); RT13 (`build/room/checks/rt.ts:750`) | `schema, sign, words, intent_ref, source{type,id}, tool{name,version,license}, view_box, cap_height, advance, paths`. Approved by its SHA-256 with kind `room-text` in `assets/policy/content-approvals.json` (C-0004 is the shirt's). |
| The outline converter | `apps/web/build/room/lettering.ts` (`npm run room:lettering -w apps/web`; spec 016) | A precedent for an outline made in the repository, not traced: `tool: "the room's outline converter"`, `license: mit`, `source: {type: design, id: D-0002}`. Today it converts the studio's shirt SVG. Group C would extend it to set his words in a vendored typeface. |
| fontkit and the vendored typefaces | `apps/web/build/room/typefaces.ts` (fontkit 2.0.4, `apps/web/package.json`); `apps/web/fonts/fonts.lock` (IBM Plex Sans Bold/Regular for `room`) | Glyph outlines for the words, at build time, from a SHA-checked font. No new dependency. |
| The paw path | `src/room/hud/icons.ts:76` | Its path data, which the converter scales into the outline's view box. All its commands scale uniformly, arcs included. |
| The `terminal` renderer | `src/room/faces/terminal.ts` | Draws room-text lines in IBM Plex Mono (`INK #d6dde6`, `:13`), typed once at 60 chars/s (`compose/layout.ts:45`). Its block cursor (`CURSOR #8fc3ff`, `:14`) shows only while it types (`:56` to `:72`). A green cursor that stays and blinks is a change here. |
| Room text | spec 004 §7; `apps/web/content/room/<block>.yaml` | A `terminal` block needs `words_from` (RD3, checked by RT9 in strict mode), `about_author` with `claims` (RT3 to RT5), and no digit. RT6 caps typing at 5 s; "Applied AI Engineer" is 19 characters, about 0.32 s. Approved by hash, kind `room-text`. |
| UI words | `src/room/ui-keys.ts` (the closed list), `apps/web/room/ui-words.yaml` | The route for "RESUME" (RT12 needs each key). |
| `src/room/text-copy.ts` | | Mentioned by the supervisor. It doesn't draw. It builds "Around the room" from each face's words (FR-034), so new bound faces add entries there. |

Code may not name a piece, placement, selectable, or topic ID. The source scan (spec 004 §16, `build/room/scan.ts`) covers `apps/web/{src,build,lookdev,test}/**`, and its match is `(?<![a-z0-9])<id>(?![a-z0-9])`. So `busy-sign`, `dog-sign`, and `desk-screen` can't appear as string literals in the converter or the tests. A name like `busy-sign-lettering` matches too. The converter should take each sign's stem and words from a data file, as the shirt's `apps/web/content/lettering/twin-shirt-lettering.json` gives its own, and tests should take IDs from `compose()`.

## 3. Reduced motion, and the tests and snapshots a change would touch

### 3.1 The signal for the cursor's blink

`src/room/motion.ts`:

- `REDUCED_MOTION = "(prefers-reduced-motion: reduce)"` (`:17`).
- `MotionState.animate` (`:27`) is true only while none of paused, reduced motion, hidden, or a loader hold is set.

`scene/faces3d.ts` reads it every frame (`options.motion().animate`, `:81` and `:82`; used at `:251`). When the room doesn't animate, or at quality 3 (typing rate 0), a screen shows its final frame. The cursor's blink should hang off the same `animate`, plus the quality level's rate: blink while the room animates, and hold the cursor visible and still otherwise. That covers reduced motion and also "Pause the room", which WCAG 2.2.2 needs for blinking that lasts over 5 s. The 2D room (`flat.ts`, `faces/svg.ts`) draws final frames, so it shows the held cursor. I suggest about 530 ms on and 530 ms off. That rate is my own suggestion, not from a source.

### 3.2 Tests a change would touch (none edited here)

- **The faces and words**:
  - `test/room/faces.test.ts`: renderers, the terminal's typing and final frame, and its cursor.
  - `test/room/words.test.ts`: room-text blocks.
  - `test/room/text.test.ts`.
  - `test/room/legibility.test.ts`: RG7's glyph floor on readable faces.
  - `test/room/vocabulary.test.ts`: only if a renderer is added, which I advise against.
- **Outlines**:
  - `test/room/lettering.test.ts`, which holds the committed outline to the converter.
  - `test/room/twin-shirt.test.ts` (the precedent; it must stay green).
  - `test/room/dist.test.ts`: the outline's private fields must appear nowhere in `dist/`.
  - The RT13, RD4, and RD5 fixtures under `test/fixtures/room/bad/`.
- **The scene and bundle**:
  - `test/room/schema.test.ts`, `bundle.test.ts`, `scene.test.ts`, `compose.test.ts`, `determinism.test.ts`, `generated.test.ts`.
  - `test/room/scan.test.ts` (FR-007).
  - `test/room/eat-chunker.test.ts`. It reads `assets/room/busy-sign.glb` "with their faces and glows from the repository's bundle" (its header, `:5`). I didn't check whether a scene binding changes what it reads, so rerun it.
- **The text copy**: `test/ui/around.test.ts` (and `around.illustration` once the monitor is bound), `test/ui/text-copy.test.ts`.
- **The paper**:
  - `test/room/avatar-handoff.test.ts` (`:171` and `:172`, the materials' opacity), `twin-handoff.test.ts`, `grip.test.ts` (`SHEET_SIZE`), `avatars.test.ts`.
  - `test/room/flat.test.ts` and `flat-frame.test.ts` if the 2D sheet changes.
- **Motion**: `test/room/motion.test.ts`, `test/ui/pause.test.ts`.
- **The paw**: `test/ui/hud-split.test.ts:632`, only if `EMBLEM_ICONS` is renamed or moved.

### 3.3 Snapshots

`test/room/__snapshots__/` holds two snapshots: `eat-box.test.ts.snap` (8,515 lines) and `protect.test.ts.snap` (120 lines). Neither mentions busy, dog, screen, sign, or paper (`grep -i`, §6), so neither should change.

## 4. The files group C touches, and which it shares

### 4.1 Group C's own files (my recommendation)

- **Data**:
  - `apps/web/room/scene.yaml`: three `faces:` bindings. busy-sign `lettering`, one `sign` region; dog-sign `lettering`, one `sign` region; desk-screen `screen`, one `terminal` region.
  - New room text in `apps/web/content/room/`: two outlines in `outlines/` and one terminal block. Their stems must not contain a piece ID (§2.6).
  - New lettering sources in `apps/web/content/lettering/`: words, typeface, and the paw, for the converter.
- **UI words**: `apps/web/room/ui-words.yaml` and `src/room/ui-keys.ts`, for "RESUME" (and any face label keys, if the existing `label.*` aren't reused).
- **Build**: `apps/web/build/room/lettering.ts`, generalised from the shirt to a typeface and the paw. It stays one converter and keeps the shirt's output byte-identical.
- **Code**:
  - `src/room/faces/terminal.ts`: the green cursor, held and blinking.
  - `src/room/scene/faces3d.ts`: redraws the cursor's phase while `animate`.
  - `src/room/scene/bundle3d.ts`: the paper's texture.
  - `src/room/flat.ts`: the 2D paper's word, if any.
  - `src/room/faces/svg.ts` and `faces/raster.ts`: only if the display list gains an op, which it shouldn't need to.
- **Tests**: the new failing tests first, in new test files where possible, so no existing test is edited.

### 4.2 Shared with the other groups

These are inferred from intent-029's groups: A is the side panels, B the conversation, D the selection screen.

| File | Shared with | Risk |
|---|---|---|
| `apps/web/room/ui-words.yaml`, `src/room/ui-keys.ts` | A and B, if either adds a HUD or talk word (both already hold `talk.*` and `hud.*` keys) | **Medium.** These are append-only lists, so merges are textual. Each group should add its keys in its own block. |
| `src/room/flat.ts` | A, if the side panels' fix reaches the 2D drawing's layout | **Low.** Group C touches only the `PAPER` drawing (`:274`, `:435` to `:445`). |
| `apps/web/room/scene.yaml` | none expected | **Low.** Group C changes three placements' `faces:`. |
| `src/room/app.ts` | A and B (layout, talk wiring) | Group C should **not** touch it: the blink lives in `faces3d.ts`, which already reads the motion store through its options. |
| `apps/web/package.json` | none expected | Only if a `room:lettering` argument changes. |
| `assets/policy/content-approvals.json` | human-only (`.claude/settings.json:65`, `:81`) | Group C writes nothing there. It is the Author's patch: three new `room-text` approvals by SHA-256 (two outlines and the monitor block), after his answer to Q1. Until then a release build keeps the three faces plain, and a drafts build shows them with "Draft" (FR-030). |
| `src/room/hud/icons.ts` | A (the HUD's icons) | Read only: the converter copies the paw's path data. If it imports `EMBLEM_ICONS` from `src/`, it reads but does not edit. |

None of group C's files is in D's area (`src/choice/**`) or B's (`src/talk/**`).

## 5. Deviations spec 029 must name in its Assumptions

1. **Spec 004 FR-032**, the signs' lettering:
   - FR-032 says the outlines are "traced from the Author's own design". Spec 029 sets them in IBM Plex Sans in code instead, by his answer "Drawn in the room's code (Recommended)". The outline format, RT13, and approval by hash stay the same.
   - The words change from FR-032's "I am very busy" and "my dog thinks i'm cool" to his new "I AM VERY BUSY" and (pending Q2) "My dog thinks I'm cool".
   - The paw becomes part of the dog sign's drawing.
   - The catalog comments, the outline contract's `words` row (§8: ""I am very busy" or "my dog thinks i'm cool""), and `name:` in both catalog entries name the old words. They change in group C's data edit.
   - I found no ADR on sign lettering. A case-insensitive `grep` for outline, lettering, or desk sign over `docs/adr` hits only 0036 (which lists "two desk signs" among the pieces), 0039 (the highlight's outline), and 0044 (an "outline" of spec 001). None of them decides the signs' lettering, so no ADR reversal applies.
2. **Spec 004 FR-031**, the monitor's two scripted halves from his typed description: replaced by one terminal line, "Applied AI Engineer", from his review. `words_from` quotes intent-029.
3. **Spec 002's plain hand-off paper**, the white sheet: it gains a texture. The hand-off's timings and crossfade are unchanged.

## 6. Commands I ran

All of these ran from the worktree root, except one `cd` into `apps/web/room`. No hook or bash-gate refused any command.

```sh
git log --oneline -1 && ls specs/ | tail -15 && ls specs/029-room-polish 2>/dev/null; ls facts corpus apps/web/content 2>/dev/null | head -50
for p in "I AM VERY BUSY" "My dog thinks I'm cool" "My dog things I'm cool" "RESUME" "Applied AI Engineer"; do echo "=== exact: $p"; grep -rnF -- "$p" corpus apps/web/content apps/web/src facts 2>/dev/null | grep -v '\.pdf' | head -40; echo "=== -i: $p"; grep -rniF -- "$p" corpus apps/web/content apps/web/src facts 2>/dev/null | grep -v '\.pdf' | wc -l; done
grep -rniF -- "My dog thinks I'm cool" corpus apps/web/content apps/web/src facts; grep -rniF -- "Applied AI Engineer" corpus apps/web/content apps/web/src facts | grep -v '^corpus/\(proposals\|intake\)'; ls facts; ls corpus/facts
sed -n 12,30p corpus/intake/interview-2026-11-06-hobbies-mission-work.md; grep -rnw -- "RESUME" corpus apps/web/content apps/web/src; grep -rniw -- "resume" corpus apps/web/content apps/web/src | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -40
ls -la apps/web/content/lettering apps/web/content/room; head -60 apps/web/content/lettering/*
grep -rn -- "busy-sign\|dog-sign\|desk-screen\|neon" apps/web/src --include=*.ts | grep -v '\.test\.ts'
grep -rln -- "busy-sign\|dog-sign\|desk-screen" --exclude-dir=node_modules --exclude-dir=.git .
cd apps/web/room && for f in catalog/busy-sign.yaml catalog/dog-sign.yaml catalog/desk-screen.yaml; do cat -n $f; done; ls catalog; ls
ls -la apps/web/content/room/outlines; grep -n -B2 -A12 "busy-sign\|dog-sign\|desk-screen\|neon-sign" apps/web/room/scene.yaml
ls apps/web/src/room apps/web/src/room/faces apps/web/src/room/hud apps/web/src/room/scene; sed -n 1,80p apps/web/src/room/faces/registry.ts
cat -n apps/web/src/room/faces/sign.ts; sed -n 1,60p apps/web/src/room/faces/terminal.ts; sed -n 1,60p apps/web/src/room/compose/vocabulary.ts
grep -n -B3 -A10 "renderer: print\|renderer: sign\|renderer: terminal\|renderer: desktop" apps/web/room/scene.yaml; grep -rn "outline" apps/web/src/room/compose/*.ts
grep -rln "outline.json\|\.outline\b\|outlines/" --exclude-dir=node_modules apps/web/src apps/web/test tools
grep -n "FR-032\|FR-016\b" specs/004-room-composition/spec.md; grep -n "^## \|^### " specs/004-room-composition/contracts/room-data-files.md
sed -n 419p specs/004-room-composition/spec.md; sed -n 288,310p …/room-data-files.md; sed -n 374,441p …/room-data-files.md
python3 -I -c '…print the shirt outline, paths cut…'; sed -n 1,30p apps/web/src/room/faces/print.ts; grep -rn "twin-shirt-lettering\|chalk-mission" --exclude-dir=node_modules -l .
sed -n 1,40p apps/web/build/room/lettering.ts; python3 -I -c '…list assets/policy/content-approvals.json…'
grep -n "assets/policy\|corpus\|content/\|outlines" .claude/settings.json; grep -n … .specify/memory/constitution.md
sed -n 33,38p .specify/memory/constitution.md; head -60 corpus/README.md
sed -n 635,661p …/room-data-files.md; sed -n 442,490p …/room-data-files.md
sed -n 1,60p apps/web/src/room/handoff.ts; grep -rn -i "paper\|sheet" apps/web/src/room --include=*.ts
sed -n 60,75p / 105,125p / 268,300p apps/web/src/room/scene/bundle3d.ts; grep -n -i "paper\|resume\|sheet" flat.ts figure.ts avatars.ts twin-states.ts
sed -n 1,40p apps/web/src/room/scene/faces3d.ts; grep -n "sign\.\|label.busy\|label.dog\|label.monitor\|label.neon" apps/web/room/ui-words.yaml
sed -n 60,100p apps/web/src/room/faces/terminal.ts; grep -rn -i "blink" apps/web/src; sed -n 1,40p apps/web/src/room/motion.ts
grep -n -i "paw" -r apps/web/src; sed -n 1,25p / 60,90p apps/web/src/room/hud/icons.ts; grep … display-list.ts raster.ts
grep -rln -- "busy-sign\|dog-sign\|desk-screen\|…" apps/web/test; ls apps/web/test/room; find apps/web/test -name "*.snap" -o -name "__snapshots__"
grep -rn -- "busy-sign\|dog-sign\|desk-screen" apps/web/test; grep -rln "faces/(sign|terminal|registry|words)" apps/web/test; grep -rln "scene/bundle3d\|SHEET_SIZE\|paper" apps/web/test
cd apps/web/test; grep -n -i "cursor\|8fc3ff" room/faces.test.ts; sed -n 1,15p room/data-only.test.ts; grep … paper/opacity …; grep -n "paw" room/emblem-data.test.ts ui/*.ts
grep -n "terminal\|typ" apps/web/test/room/faces.test.ts; grep -rn -i "face" apps/web/src/room/eat/*.ts; sed -n 1,12p apps/web/test/room/eat-chunker.test.ts
git branch -a | grep -i 029; git log --oneline f411d8e1..<each 029 branch>; git diff --stat f411d8e1 <branch>
git show night/spec-029/spec-029:intent/029-room-polish.md
grep … apps/web/package.json (fontkit); cat apps/web/fonts/fonts.lock | head -30; grep -rln "fontkit" apps/web/build apps/web/src apps/web/test tools
grep -rln -i "outline\|desk sign\|lettering" docs/adr; sed -n 1,30p apps/web/build/room/typefaces.ts
grep -n -i "handoff\|hand-off" apps/web/src/room/flat.ts; grep -n "around.illustration\|resume_action" apps/web/room/ui-words.yaml; sed -n 1,25p apps/web/src/room/text-copy.ts
grep -n -i "paper" apps/web/src/room/flat.ts
grep -c "" apps/web/test/room/__snapshots__/*.snap; grep -n -i "busy\|dog\|screen\|sign\|paper" apps/web/test/room/__snapshots__/*.snap
grep -rn "intent_ref\|…" apps/web/build/room/checks/*.ts; sed -n 736,782p apps/web/build/room/checks/rt.ts
sed -n 75,100p apps/web/build/room/schema.ts   # isPathData
sed -n 728,739p specs/004-room-composition/contracts/room-data-files.md   # the source scan
grep -n "TYPING_CHARS_PER_S =\|typingSeconds" apps/web/src/room/compose/layout.ts; grep … specs/024-dino-eats-room-assets/spec.md
grep -n "REDUCED_MOTION =\|readonly animate" motion.ts; grep -n "^const INK\|^const CURSOR" terminal.ts; grep … looks/*.yaml; …
```

(Lines with `…` are shortened here; the full commands are in the session's transcript.)

## 7. Questions written to `/night/io/out/questions.md`

- **Q1**: does the dog sign read "My dog thinks I'm cool"? Recommended: yes, a typo. His answer is to be recorded in his words in intent-029 (§1.3).
- **Q2**: may group C's dog-sign outline wait for that answer, shipping only as a draft until then? Recommended: yes.
- **Q3**: the busy sign's look. Recommended: the `sign` renderer as it is (a cream panel with near-black letters on the purple sign), judged at his morning look. The other option is light letters straight on the purple, which needs a per-sign ink.
