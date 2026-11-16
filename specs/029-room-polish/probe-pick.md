# Probe: the selection screen, game-like (spec 029, group D)

**Task**: probe-pick-029 (implementer, notes only, night of 2026-11-16) · **Branch**: `night/probe-pick-029/probe-pick-029`
from `f411d8e1` · **Code, tests, assets changed**: none. This file is the only one the branch adds.

## His words

His added item, word for word:

> Oh one more item we want to add to that spec: Let's make the character selection screen more Game-like. "Step 1: Select your role" and then a card that displays the output of that selection, The twin will describe projects and goals as if talking to a non-technical person, etc". "Step 2: Select your avatar' And then game-character like selection cards for our choices

## Answers, short

1. **The screen today** (`apps/web/src/choice/choice.ts:28-101`) is one `<form>` with two `<fieldset>`s of native
   `<input type="radio">` inside `<label class="choice-option">`: "Your path" (2) and "Your avatar" (4, each with an
   `aria-hidden` SVG preview), the hint "Choose a path and an avatar to enter.", "Enter" (disabled until both), and the
   PDF and "How data flows" links. Spec 002 built it (FR-001 to FR-004, FR-018, FR-043 to FR-047; room-scene.md §1).
   Since then every spec has left it unchanged on purpose: specs 005, 012 (Q3, "Enter" is the game's "Start"), 014,
   018 (Q1), 020 (D2), and 021.
2. **Two paths.** `engineer` and `non-engineer` (`visit.ts:107-112`). A path changes two things downstream:
   - the depth section of the twin's system prompt (`config/twin/prompt.md:41-47`), sent with every turn;
   - which narration script plays for a resume item.

   Nothing else. No released narration exists today: `assets/policy/content-approvals.json` approves none, so only a
   drafts build shows one.
3. **Four visitors.** Woman, Man, Dinosaur, Dog (`avatars.ts:9-14`), always all four, in 3D and 2D. None has a still
   picture. The only picture that exists without a fetch is the flat SVG shape (`avatarPreview`, `avatars.ts:166-181`).
   Each has a 3D model in `assets/visitors/<id>/`. Only the dog's model needs and has an approval (`A-20261114-dog`),
   because it is made from a photo.
4. **Today's keyboard and screen-reader behaviour comes from native radios.** Each group is one Tab stop, and arrow keys
   move within it (the browser's behaviour; jsdom can't test it, so no test holds it). Each radio is named by its
   label, and each group by its legend. No focus moves by script. The 44 px targets, focus ring, Tab order, and axe
   tests cover the screen. Reduced motion: `room.css:1267-1274` turns off `.choice *` transitions, and the screen has no
   motion today. The phone layout is `flex-wrap` inside the body's 48rem; no test covers the choice screen on a phone.
5. **Group D can stay inside `apps/web/src/choice/` and its own test files** if it keeps native radios, the class
   `choice-option`, the names "Engineer", "Not an engineer", "Enter", and the export `renderChoice(doc, {onEnter, onPdf})`.
   Then it touches none of `split.css`, `hud/`, `talk/`, `room.css`, `app.ts`, or the piece code.

## 1. The specs and tests that built the screen, and what step 1 and step 2 must keep

| Must keep | Source | Held by |
|---|---|---|
| Nothing in the room starts until a path and an avatar are both chosen and "Enter" is pressed: no stage, canvas, frame, announcement, or event | spec 002 FR-001; room-scene.md §1 | `test/ui/choice.test.ts:52-64`, `:66-82` |
| Nothing is pre-selected | FR-001 | `choice.test.ts:48-49`, `:157` |
| The path is set once; no control changes it in the visit; a reload starts a new choice | FR-002 (his W4) | `choice.test.ts:84-94`, `:151-162` |
| The choice lives only in page memory: no cookie, storage, history, or URL. The form never submits | FR-003; `visit.ts:1-3`; `choice.ts:4-5` | `choice.test.ts:126-149` |
| The AI disclosure (index.html's header) is visible, and the data-flow link is on the screen | FR-004; spec 005 H6 ("the choice screen keeps its header") | `choice.test.ts:96-102`; `a11y.test.ts:379-416` |
| "Download the resume (PDF)" works without entering, and sends `pdf_downloaded` | FR-018 | `choice.test.ts:115-124` |
| The four avatars, named, each with an `aria-hidden` preview. Spec 009 US1 scenario 4: "offers the four avatars with today's flat previews, and nothing is fetched until 'Enter'" | spec 009 M3, US1 sc. 4; spec 020 D2 | `choice.test.ts:27-50` |
| The path names "Engineer" and "Not an engineer". Hint 6 of the loader quotes them, and the Author approved that copy on 2026-11-09 | spec 012 FR-028 to FR-036; `room/hints.yaml:40-45` | `test/room/hints.test.ts:97-99` |
| "Enter" is the start; the loader shows from it | spec 012 Q3 (approved at T000) | every test's `enter()` (`test/helpers/room.ts:758-762`) |
| Keyboard: every choice operable, logical order, visible focus | FR-043 | `a11y.test.ts:237-245` (order path, avatar, Enter, PDF, data flows), `:247-253` (no positive tabindex), `:255-266` (2 px outline at 3:1 or better) |
| A name and a role for each control; WCAG 2.2 AA | FR-044, FR-045 | `a11y.test.ts:333-341` (axe, "the choice, empty" and "the choice, made", `:115-121`) |
| 44 × 44 px targets from 320 px wide, in either orientation; no hover-only cue | FR-046 | `a11y.test.ts:455-464` (the radio's `label` is the target, `:69-76`); the CSS is `room.css:30-39` |
| Usable within 3 s of the page opening (4G) | spec 002 SC-005; spec 012 FR-020 | by construction (no fetch before Enter) |

What the tests select on (keep them true, or the change ripples into most of the room's test files): `input[type="radio"][name="path"|"avatar"][value=…]` (helper `radio()`, `helpers/room.ts:751-755`, and `a11y.test.ts:119-120`, `:240-241`), and the button named "Enter". Only `choice.test.ts:44-47` (the legends "Your path" and "Your avatar") quotes words that step 1 and step 2 replace. Group D's spec changes that test with the new legends. That is a feature change, not a fix.

## 2. The paths, what each changes, and the card drafts

### What a path changes, with sources

The chain: `choice.ts:66-78` → `app.ts:777` (`visit.path = choice.path`) → two readers.

1. **The twin's turn**:
   - `app.ts:806` (`path: () => visit.path`) → `talk/talk.ts:333-352` → `talk/turn-client.ts:43` (the body `{feature, path, turns}`);
   - the gateway parses it at `services/gateway/src/twin/turn.ts:81` ("must be engineer or non-engineer");
   - `config/twin.ts:61-73` keeps the chosen path's `## Depth:` section of `config/twin/prompt.md` and removes the other;
   - `twin/prompt.ts:34-36` makes it the start of the system message.

   That section is the only thing that differs (`prompt.ts:28-31`: "only the depth line differs").
   - `prompt.md:43`, engineer: "The visitor chose the engineer's version. Answer at the depth of the topic sections: the architecture, the trade-offs, and how the systems work, with the same facts as the plain version. A Golden Q&A answer stays word for word."
   - `prompt.md:47`, non-engineer: "The visitor chose the non-engineer's version: answer in the plain register of the corpus's "Role at a glance" sections, what the work does and why it matters, without jargon, with the engineer's facts. A Golden Q&A answer stays word for word."
   - Spec 007 FR-015: "the corpus's "Role at a glance" layer for the non-engineer path, its topic sections' depth for the engineer path, with the same facts on both". Corpus README:71: "The facts are identical; the depth differs."
   - Its data flow is `docs/data-flow-disclosure.md` row V2: the turn carries the path ("path in no telemetry", row V4).
2. **The narration**: `app.ts:1274` → `room/resume-port.ts:69` → `narration/view.ts:149-157` plays `data.get(id)?.[path]`, the item's script `apps/web/content/narration/<item>.<path>.md` (44 files, 22 items × 2).
   - Spec 002 FR-011: "at the depth of the visitor's path".
   - **Not shown in a release build today.** `content-approvals.json` holds 5 approvals and none is a narration, and "an item whose script the build left out shows no narration" (`view.ts:14-15`).

Nothing else reads the path:
- `events.ts:5`: an event's body never carries it;
- the hand-off and the room look the same on both paths;
- the loader's hint 6 only describes it.

### Card drafts (each sentence with its source)

Step 1's "card that displays the output of that selection" shows the chosen path's text. The drafts:

**Engineer**
- E1 "The twin answers at each topic's full depth: the architecture, the trade-offs, and how the systems work." `prompt.md:43`; spec 007 FR-015.
- E2 "The facts are the same on either role; only the depth changes." `prompt.md:43`, "with the same facts as the plain version"; corpus README:71; hint 6, which he approved.

**Not an engineer**
- N1 "The twin describes the projects and goals as if talking to a non-technical person: what the work does and why it matters, without jargon." The first clause is his example, in his words. The rest is `prompt.md:47`.
- N2 = E2.

**Both, under the card**
- B1 "You choose once for this visit; reload the page to choose again." FR-002; `choice.test.ts:84-94`.

**Left out on purpose**
- "Each resume item is narrated at this depth." It is true only in a drafts build until he approves the scripts. The choice screen can't tell which build it is in, because room-data loads at "Enter" (spec 012 FR-010 b).
- Any line naming *who* a role is for ("recruiters", "hiring managers"). Nothing in the code keeps that.

**Speaks for the Author?** None of E1, E2, N1, or B1 speaks for him. Each describes the twin's instructions or the page, and N1's first clause is his own sentence. Everything on the screen is copy he reads and approves, as he approved the hints. So one question asks him to take or rewrite the drafts (Q1 below). A sentence that would speak for him, and that I did not draft: why he built two roles, or whom he wants on each.

**The word "role".** He writes "Select your role". The code, the specs, the gateway, and hint 6 ("Your path sets the twin's depth") say "path". Recommended: visible words say "role" (step 1's legend), the names stay "Engineer" and "Not an engineer", and the code keeps `path`. Hint 6's "Your path" is his approved copy, so changing it is a question (Q4).

## 3. The visitors

| ID · name (`avatars.ts:9-14`) | Offered | Model and clips in `assets/visitors/<id>/` | Approval (`assets/policy/approvals.json`) | Card picture available now | One-line draft, with source |
|---|---|---|---|---|---|
| `woman` · "Woman" | always, 3D and 2D | `woman.glb`, `-idle`, `-idle-holding`, `-take` (no walk clip; spec 019's code gait walks her legs) | none needed: the record says `likeness: false`, not from a photo (RA9, `build/room/avatars.ts:382-393`) | flat SVG, `#b5477a` (`avatars.ts:64-79`) | "A generic woman. She takes the twin's paper and, in the 3D room, walks where you steer." (`avatars.ts:10`; the `take` clip, `CLIP_ROLES` `:22`; specs 008 and 019) |
| `man` · "Man" | always | `man.glb`, `-idle`, `-idle-holding`, `-take` | none needed (same) | flat SVG, `#3d6fa8` (`:80-92`) | "A generic man. He takes the twin's paper and, in the 3D room, walks where you steer." (same sources) |
| `dinosaur` · "Dinosaur" | always. Its eating and scene happen only in 3D, with its model showing (`eat/available.ts:32-45`; the scene also above ADR 0010's floor, `scene/dino-scene.ts:298`; spec 028 FR-019, cut under reduced motion, FR-026) | `dinosaur.glb`, `-idle`, `-take`, `-walk` | none needed (`likeness: false`): human patch 021 row 2, "the gate wants none"; his approval of round 2's candidate, 2026-11-14, came in with his merge `a556a933` ("Merge intake/dino-resume") | flat SVG, `#4f8a3c` (`:93-122`) | "A generic dinosaur. In the 3D room it can eat chunks of the desk, the laptop, the busy sign, and the chalkboard, and they grow back." (`avatars.ts:12`; spec 024's summary; `room/scene.yaml:45,85,91,107` `edible`) |
| `dog` · "Dog" | always. The room's own dog (spec 025) never shows in a dog visit (spec 028 FR-017; `scene/avatars.ts:354`) | `dog.glb`, `-idle`, `-walk` (no take, no idle-holding: spec 020 D3) | `A-20261114-dog`, `-dog-idle`, `-dog-walk`, 2026-11-14. The model's record: `source: photo` (PH-0002) | flat SVG, generic shape `#a8743d` (`:123-151`); spec 020 D2: "the choice screen's flat preview is the generic shape, unchanged" | "A dog. In the 3D room, an AI-made, stylized Nova Scotia Duck Tolling Retriever that walks the room and talks with the twin like any visitor." (his approval's `disclosure_line`; spec 028 FR-017, "it walks, reaches, selects, and converses") |

Notes on the visitors:
- **No still image of any visitor exists.**
  - `find assets apps/web` found only `assets/twin/still.png` (the twin's, approval `A-20261110-twin-still`, kind `still`).
  - A "game-character" portrait of each model would be a new asset from a studio round. The dog's, made from a photo-sourced model, would need his approval of a `still` as the twin's did. It would also be a fetch before "Enter", against spec 009 US1 scenario 4 and SC-005's 3 s.
  - Recommended for spec 029: the existing flat SVGs, drawn larger on each card (no fetch, no asset, no approval). Portraits are a later studio round (Q3).
- **The dog's words.**
  - The dog's introduction (spec 028 FR-027, `app.ts:1232-1236`) reads the corpus slot `hobbies.dog_visitor_intro`. That slot is `value: null` (`corpus/facts/hobbies-and-travel.yaml:40-43`), so a dog visit says nothing extra today. The card does not promise one.
  - The dog's name appears only in that slot's comment, his words. No card names the dog: that would speak for him.
- **The dinosaur's card leaves out the scene** where the twin and the dog leave with the bicycle (spec 028 FR-019 to FR-023). Naming it would give it away and would promise it on devices that cut it. Q5 asks.
- **Order.** The code's order is woman, man, dinosaur, dog. `choice.test.ts:33-38` and the credits page (`build/credits.ts:11`, "the visitors' in the choice's order") bind it. The orders list them as woman, man, dog, dinosaur, which I read as a list, not an order. Recommended: keep the code's order.

## 4. Keyboard, screen reader, reduced motion, and the phone today

| What | Today | Held by |
|---|---|---|
| Roles | `<section aria-labelledby="choice-heading">`, `<h1>`, `<form>`, 2 × `<fieldset>` + `<legend>`, native radios named by their wrapping `<label>`; previews `aria-hidden="true" focusable="false"`; "Enter" `aria-describedby="choice-hint"` | `choice.test.ts:27-50`; axe `a11y.test.ts:333` |
| Arrow keys | the browser's native radio group: arrows move **and select** within a group; one Tab stop per group | not testable in jsdom; `a11y.test.ts:243` notes "Each radio group is one Tab stop in a browser" |
| Focus | no scripted focus; the Tab order is path, avatar, Enter, PDF, data flows | `a11y.test.ts:237-245` |
| Focus ring | `room.css:41-51`, `.choice input:focus-visible`, 2 px `#0b4f9c` | `a11y.test.ts:255-266` |
| Selected state | `choice.css:233-236` border colour and inset `box-shadow`, plus the native radio dot. `room.css`'s `forced-colors` block (`:1130`) has no `.choice` rule, so in forced colours only the dot shows it | none for colour-only or forced colours on this screen; the pattern exists for "Pause the room" (`a11y.test.ts:418-452`) |
| Live regions | none on this screen; the announcer stays empty until Enter | `choice.test.ts:80` |
| Reduced motion | `room.css:1267-1274` sets `transition`/`animation: none` for `.choice *`; the screen has no motion | `a11y.test.ts:466-470` (checks only that a `prefers-reduced-motion: reduce` rule exists) |
| Phone | `style.css:8-12` (body `max-width: 48rem; padding: 1rem`), `choice.css:217-221` (`flex-wrap`); no media query for the choice | 44 px only (`a11y.test.ts:455`); the 320 × 568 tests (`:639-728`) are the room's |

What the new steps change, and the readings I recommend for the spec:

- **"Focus moves to step 2 after step 1" vs. arrow keys.** On a native radio group, an arrow key *selects*. If focus jumped to step 2 on every change, a keyboard user could never arrow from "Engineer" to "Not an engineer". A scripted focus move is also a change of context under WCAG 3.2.2 unless the visitor is told beforehand.

  Recommended: move focus to step 2's group (its checked radio, else its first) on a click, a tap, or Space in step 1, never on an arrow key. Step 1's instruction says so beforehand ("Choosing a role takes you to step 2"). Q2 asks.
- **The output card and the screen reader.** Each role radio gets `aria-describedby` pointing at its own description, so a screen reader reads it while arrowing. The visible output card shows the checked role's text and is not a live region; `choice.test.ts:80` wants the announcer empty.
- **Cards built on native radios.** Keep each radio in its `label.choice-option` and style the label as the card. Then `room.css`'s 44 px and focus rules and every test selector hold. Arrow keys and one Tab stop per group come free.
  - If the radio dot is hidden visually, it must stay focusable and stay in the accessibility tree (no `display: none`).
  - The selected state must show by more than colour, for example a "Selected" word or a check shape, and in `forced-colors` too.
- **Reduced motion.** Put any card motion (a hover lift, a selection glow) under `@media (prefers-reduced-motion: no-preference)`, as `room.css:877` and `split.css:460` do, so `room.css:1267` doesn't need to grow.
- **Phone.** One column below about 30rem: step 1's cards, the output card, then step 2's cards in two columns at 320 px (four 44 px+ cards fit in 288 px of width as 2 × 2). Test it from the CSS, as `a11y.test.ts` models the room's.
- **No new event and no new data flow.** The avatar never leaves the device. The path leaves only in the turn (V2). A card selection must send nothing (`choice.test.ts:81`), so the disclosure needs no new entry.

## 5. The files group D would touch, and what it shares

**Touches**
- `apps/web/src/choice/choice.ts`: the two steps, the output card, the focus move. The export and signature stay as they are, so `app.ts:549` is untouched.
- `apps/web/src/choice/choice.css`: the cards, the selected state, forced colours, motion under `no-preference`, the phone layout.
- A new `apps/web/src/choice/cards.ts`: the role descriptions and the avatar card lines, as data. `avatars.ts`'s unused `description` field ("a generic woman", intent 000's words) stays as it is.
- `apps/web/test/ui/choice.test.ts`: the legends at `:44-47`. New tests go in a new `apps/web/test/ui/choice-cards.test.ts`: the steps, the cards' names and descriptions, the selected state by more than colour, the focus move, no motion outside `no-preference`, the phone CSS, and axe on both steps.
- Only if Q4 is answered "change it": `apps/web/room/hints.yaml:42`. `hints.test.ts:97-99` keeps passing because the path names don't change.

**Doesn't touch** (and why)
- `choice/visit.ts`: `PATHS` names are pinned by `hints.test.ts:98`, and `talk/talk.ts:24` imports its types.
- `choice/avatars.ts`: read by `build/room/avatars.ts`, `build/credits.ts`, `build/manifest.ts:62`, `build/room/schema.ts`, `room/handoff.ts:10`, `lookdev/stage.ts`, and the scene.
- `room/app.ts`, `room/room.css`: only if the class `choice-option` is kept on the cards.
- `test/helpers/room.ts`: only if native radios are kept.

**Shared with groups A to C** (from the spec-writer's intent draft, `070becf2`: A the panels over the room, B the conversation, C the pieces' words and the resume paper)

| File | Group D | A, B, C | Risk |
|---|---|---|---|
| `room/hud/split.css`, `room/compose/hud.ts` | no | A | none |
| `talk/**` | no (`talk.ts:24` imports `VisitPath`, unchanged) | B | none |
| piece code, `room/scene/**`, `room/flat.ts`, `room/handoff.ts` (the paper) | no | C | none; `handoff.ts:10` reads `AVATARS`, which D leaves alone |
| `room/room.css` | no, if `choice-option` is kept | A likely (the panels' backgrounds; the `forced-colors` and `reduced-motion` blocks) | a merge conflict if both edit `:30-50` or `:1267` |
| `test/ui/a11y.test.ts` | no; D's tests go in their own file | A likely (contrast, axe over the room) | none if D stays out |
| `test/helpers/room.ts` | no | B maybe (the turn's stub) | none if D keeps the radios |
| `room/hints.yaml` | only by Q4 | none known | low |

## Questions written to `/night/io/out/questions.md`

```
### Q: Spec 029's role cards: may the selection screen show these drafts? Engineer: "The twin answers at each topic's full depth: the architecture, the trade-offs, and how the systems work. The facts are the same on either role; only the depth changes." Not an engineer: "The twin describes the projects and goals as if talking to a non-technical person: what the work does and why it matters, without jargon. The facts are the same on either role; only the depth changes." Under both: "You choose once for this visit; reload the page to choose again."?
Blocks: probe-pick-029 (spec 029 group D) · Recommended: Yes, as drafted (each sentence is config/twin/prompt.md's depth section for that path, spec 007 FR-015, or spec 002 FR-002; "describes the projects and goals as if talking to a non-technical person" is your own example) · Others: Your rewrite of either card; Add "Each resume item is narrated at this depth." once you approve the narration scripts (none is approved today, so a release build shows none)

### Q: On step 1 of the selection screen, when should focus move to step 2?
Blocks: probe-pick-029 (spec 029 group D) · Recommended: On a click, tap, or Space in step 1, never on an arrow key (arrows select within a radio group, so moving on each would trap a keyboard user on the first role), with step 1's instruction saying so beforehand (WCAG 3.2.2) · Others: Never by script: Tab reaches step 2, as today; A "Next" button after step 1

### Q: What picture should each avatar card show in spec 029?
Blocks: probe-pick-029 (spec 029 group D) · Recommended: The existing flat shapes, drawn larger on each card (no fetch before Enter, as spec 009 US1 scenario 4 has it; no new asset; spec 020's D2 keeps the dog's generic shape), with portraits of the four models as a later studio round · Others: A studio round now for a portrait of each model (the dog's, from a photo-sourced model, needs your approval of a still, as the twin's still.png had; each adds a fetch before Enter); The flat shapes for the woman, the man, and the dinosaur, and a portrait for the dog only

### Q: Step 1 says "Select your role", but the loader's hint 6, which you approved on 2026-11-09, says "Your path sets the twin's depth"; change the hint's "Your path" to "Your role"?
Blocks: probe-pick-029 (spec 029 group D) · Recommended: Yes, "Your role sets the twin's depth: …", the rest of the hint unchanged (the names "Engineer" and "Not an engineer" stay, so hints.test.ts holds) · Others: Keep the hint as approved; Rename the paths themselves on the cards (also changes the hint and its test)

### Q: Should the dinosaur's card mention the scene where the twin and the dog leave with the bicycle?
Blocks: probe-pick-029 (spec 029 group D) · Recommended: No; the card says "A generic dinosaur. In the 3D room it can eat chunks of the desk, the laptop, the busy sign, and the chalkboard, and they grow back." and the scene stays a surprise (it is also cut under reduced motion or lowered quality, spec 028 FR-026) · Others: Add "and the twin and the dog run off"; Say only "A generic dinosaur."
```

## Commands I ran

All from the worktree, read-only except the save-point commits and this file:

```
git log --oneline -1; ls; ls specs; ls apps/web/src/choice/
git commit --allow-empty -m "wip(probe-pick-029): step 1 …"            # and steps 2, 3, 4-5
cat -n apps/web/src/choice/{choice.ts,visit.ts,avatars.ts,choice.css}
grep -rn "renderChoice|choice-heading|…" apps/web ; grep -rn "input[name=\"path\"]|…" apps/web/test
cat -n apps/web/test/ui/choice.test.ts apps/web/test/ui/avatars.test.ts
sed -n 1,140p / 225,260p / 333,343p / 454,490p apps/web/test/ui/a11y.test.ts ; grep -n "it(|describe(" apps/web/test/ui/a11y.test.ts
sed -n 20,70p / 1260,1290p apps/web/src/room/room.css
grep -rn "non-engineer|VisitPath|visit.path|…" apps services config evals
cat -n services/gateway/src/twin/prompt.ts ; grep -n … services/gateway/src/config/twin.ts ; grep -n -A3 "## Depth" config/twin/prompt.md
sed -n … apps/web/src/talk/talk.ts ; grep -n path apps/web/src/talk/turn-client.ts services/gateway/src/twin/turn.ts
sed -n 770,810p / 1265,1280p / 538,556p / 1100,1115p / 1228,1245p apps/web/src/room/app.ts ; sed -n 1,30p apps/web/src/narration/view.ts
head apps/web/content/narration/tools.{engineer,non-engineer}.md
grep -rln "choice screen|…" specs/*/spec.md … ; grep -n FR-00[1-4] … specs/002-the-room/spec.md ; sed -n 5,40p specs/002-the-room/contracts/room-scene.md
for s in 009 018 020 021 005 012 028 024 026 003 019 025 014 008; do grep -n "choice screen" specs/$s*/spec.md; done
ls assets/visitors/* assets/policy ; python3 -I -c '…' (approvals.json, records.json per avatar, dog.glb's record)
sed -n 560,640p assets/policy/approvals.json ; grep -n kind/still assets/policy/approvals.json ; find assets apps/web -iname '*woman*|*dinosaur*|*dog*|*man.*'
sed -n 1,40p apps/web/build/room/avatars.ts ; sed -n 1,40p apps/web/build/credits.ts
grep -rn '=== "dinosaur"|=== "dog"|…' apps/web/src ; sed -n 345,358p apps/web/src/room/scene/avatars.ts ; sed -n 1,45p apps/web/src/room/eat/available.ts
sed -n 1205,1240p apps/web/build/room/emit.ts ; sed -n 36,50p corpus/facts/hobbies-and-travel.yaml
grep -n "FR-01[7-9]|FR-02[0-7]" specs/028-room-after-review/spec.md ; grep -n edible apps/web/room/scene.yaml
sed -n 85,105p apps/web/test/room/hints.test.ts ; sed -n 1,48p apps/web/room/hints.yaml ; grep -n -A8 "Two audience modes" corpus/README.md
head -c 1200 assets/policy/content-approvals.json ; git show f411d8e1:apps/web/content/resume.yaml | sha256sum
grep -n live apps/web/room/scene.yaml ; cat apps/web/src/style.css apps/web/index.html ; grep -n … apps/web/src/room/hud/split.css
grep -n "path|engineer|avatar" docs/data-flow-disclosure.md
git branch -a | grep 029 ; git show 070becf2:intent/029-room-polish.md
make lint ; node_modules/.bin/prettier --check specs/029-room-polish/probe-pick.md
```

**Refusals**: none. No hook or bash-gate refused a command in this session.

## Lint

`make lint` failed at first because this worktree had no `node_modules` ("node_modules is missing: run make setup", exit 2). I ran `make setup` (exit 0; its last line: "git hooks: …/.git/hooks isn't writable here (the agent sandbox); the Author runs make git-hooks"), then `make lint` with this file written. The output, as run:

```
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
872 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

I did not run `make test` or `make evals`. The branch adds one Markdown file and no code, test, or config, and the brief asks for notes only.
