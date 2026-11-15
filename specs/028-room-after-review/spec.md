# Feature Specification: The Room After the Author's Review

**Feature Branch**: `night/spec-028/spec-028`, cut from `main` at `a36f98ec` (documents only). The implementation is two groups beside each other, `impl-028a` (group A, the layout and words) and `impl-028b` (group B, the behaviour), both from this branch's tip, then one integration task ([tasks.md](tasks.md)).

**Created**: 2026-11-15 (night 3)

**Status**: Draft. Specified, clarified, planned, tasked, and analyzed in one session from the draft intent [`intent/028-room-after-review.md`](../../intent/028-room-after-review.md). Every clarification answer below is the recommended one, taken under the Author's rule 1 of 2026-11-15 ("Approval, given ahead"), provisional and his to confirm or overturn on the morning page; none is his answer. Each is also in `/night/io/out/questions.md`. An answer he overturns is reworked before he merges.

**Input**: the intent; the [constitution](../../.specify/memory/constitution.md); `CLAUDE.md`; the specs this changes: [004](../004-room-composition/spec.md) ("Around the room", FR-063), [016](../016-the-twins-own-avatar/spec.md) (the twin's line, FR-014; the credits, FR-042; the greeting clip), [018](../018-better-hud-and-load-screen/spec.md) (the split layout, FR-001 to FR-005, Q2, Q4, Q58, Q59), [020](../020-dog-modeled-and-brought-in/spec.md) (the dog's line, FR-007), [021](../021-dinosaur-modeled-and-brought-in/spec.md) (the dinosaur, its Q1), [024](../024-dino-eats-room-assets/spec.md) (the eating, FR-001, page Q247), [025](../025-twin-and-dog-run-from-dino/spec.md) (the run and the room's dog, Q1, Q9, FR-018 to FR-022, FR-028), [026](../026-twin-pets-dog/spec.md) (the petting, FR-001, FR-014, Q8); night 2's page `docs/night-shift/2026-11-14.md` on `night/supervisor/2026-11-14` (Q292, Q294); `assets/policy/approvals.json` (`A-20261110-twin`, `A-20261114-dog`, `A-20261110-twin-greeting`); `corpus/04-hobbies-and-travel.md` and `corpus/facts/hobbies-and-travel.yaml` (read only). The code, read on `main` (`a36f98ec`): `src/room/compose/hud.ts` (`splitBoxes`, `compactBoxes`, `HUD_PLACEMENTS`), `compose/frame.ts`, `compose/framing.ts`, `compose/stages.ts`, `src/room/hud/split.ts` and `split.css`, `src/room/layout.ts`, `src/room/app.ts`, `src/room/a11y.ts`, `src/room/text-copy.ts`, `src/room/likeness-line.ts`, `build/credits.ts`, `src/room/scene.ts`, `scene/avatars.ts`, `scene/loader.ts`, `scene/chase.ts`, `scene/chase-figures.ts`, `scene/pet-adapters.ts`, `scene/twin-states.ts`, `src/room/eat/available.ts`, `eat/mouth.ts`, `src/choice/avatars.ts`, `apps/web/room/scene.yaml`, `room/catalog/room-shell.yaml`, `room/ui-words.yaml`, `src/room/ui-keys.ts`, `room.css`, `docs/data-flow-disclosure.md`. Paths are under `apps/web/` unless they start otherwise.

**Not seen**: his screenshot (`resume/Screenshot 2026-11-15 002519.png`, in his checkout) is out of this session's reach. This spec works from the orders' description of it, which is not his words, and says so where it leans on it.

## Source: The Author's Words

His review of `main` (`make up ENV=prod`), 2026-11-15, verbatim:

> 1. The Conversation UI is good, in that convo panel on the left side of the page, let's remove the thumbnail icon view, and let's make that conversation panel UI the length of the left side of the page, so it should be the same length as the room wall. 2) The dinosaur doesn't load the model, or do any of the eating of assets. 3) When I view the resume and download the PDF, the downloaded PDF doesn't have links to the films where the category text is listed in the sub headlines. 4) The dog isn't supposed to show all the time, or when a different visitor is selected. Only when someone selects the dog, does it come in the room, or if someone selects the dinosaur, then the twin should wave, scream that there is a dinosaur in the room, then the dog enters the room and the twin adn the dog grab the bicycle and leave, and the dinosaur can then eat the assets. If the dog was selected, then the twin has one introduction sentence about how much they love Arya, and all the adventures we've had of course, i'll show her all the work i've been doing, and then the dog selected visitor is the same concept as the woman or man visitor, they will just engage with the twin or the room assets. 4) Delete the warning labels in the top left corner "This is an AI Twin." "The AI dog is a nova scotia ... ", and delete the bottom panel below the room "Around the room listing". 5) The UI on the right side lays over itself, when hovering over the snowboard, you can see the UI highlight snowboard and the enter button is covering up some of it, making it not legible.

> And align the UI elements so they are next the room wall, and take up all of the grey space, i.e. make the bigger, and responsive so that they are not all teh way to the corners as seen in teh screen shot

His answers to two questions (2026-11-15), the option labels his choices and the rest the orders' record of what each means:

- The top-left labels: "Keep top banner (Recommended)": delete the three top-left labels (the twin's likeness line, the dog's line, the placeholder note); keep the top-centre banner "You're talking with an AI representation of the Author, not the Author" (the constitution's disclosure principle); move the likeness lines to the Credits page.
- "Around the room": "Hide, keep for readers (Recommended)": no panel below the room on screen; screen readers and the phone layout still get the text.

His order for the night, in his words (2026-11-15, about 00:40 his time): "And we want you to use the night shift agent set up to accomplish all of these items. I'm going to bed for the night"

The orders' description of his screenshot (theirs, not his): "the conversation panel and its twin thumbnail sit small at the far top-left corner, the piece list and its controls at the far top-right, the bottom-right buttons in the far corner, all with wide grey bands between them and the room; the dinosaur visitor shows as the flat green stand-in with the white placeholder rectangle; the dog stands in the room although the dinosaur was chosen; on the right list, "Snowboard"'s highlight and the Enter hint overlap."

**Readings, beside his words, never in their place.**

- His points are numbered 1 to 5 with "4)" twice; this spec calls the second "4)" his point 4b. His closing paragraph is his point 6.
- "the thumbnail icon view" is the split panel's portrait, the twin's still at the panel's right edge (`hud/split.ts`'s `.split-portrait`, spec 018's Q4), which the orders' description calls "its twin thumbnail" (Q1).
- "the room wall" is the room's shell as it shows on screen: the rectangle its open front spans at the room's framing (Q3). "next the room wall" is beside that rectangle, not at the window's edge. "the grey space" is the scene's backdrop beyond the shell's walls (`#20252b`, `scene/bundle3d.ts`), which the canvas fills edge to edge (spec 005).
- "This is an AI Twin." is how he recalls the twin's likeness line; its words on `main` are his approval's: "The twin is an AI-made, stylized likeness of the Author, shown by his choice." (`A-20261110-twin`). "The AI dog is a nova scotia ..." is the dog's: "The dog is an AI-made, stylized Nova Scotia Duck Tolling Retriever, a dog of the breed and not a likeness of the Author's dog, shown by his choice." (`A-20261114-dog`). "Around the room listing" is the "Around the room" section (`text-copy.ts`).
- "selects the dog" and "selects the dinosaur" are the visitor's choice of avatar at the door (`choice/avatars.ts`'s `AVATARS`), not a piece selected in the room (Q8).
- "the twin should wave" is the twin's approved `greeting` clip, which spec 016 calls a wave. "scream that there is a dinosaur in the room" is a line the twin shows and the room says (Q12).
- "grab the bicycle and leave" is the room's bicycle (`bicycle`, hanging on the right wall) going out of the room with the twin and the dog (Q13).
- "the dog selected visitor is the same concept as the woman or man visitor" is read as: a dog visitor walks, reaches, selects, and converses as a woman or man visitor does, which `main` already gives it, but for holding the paper, which the dog's clips can't (Q18).
- His point 2 has two parts the night's code can't change: the dinosaur's model waits for his intake (human patch 021, P9), and the eating, which spec 024 gates on that model. His point 3's published resume is still the one without links; the candidate with them, `apps/web/content/candidates/resume-author-links.pdf`, is his to publish (human patch 023, P8). The probes `probe-pdf-028` and `probe-eat-028` (notes on their branches, `night/<id>/<id>`) are this spec's inputs for those (FR-031, FR-032).

## Clarifications

### Session 2026-11-15, taken under the Author's rule 1 of 2026-11-15

His rule, word for word from the brief: "**Approval, given ahead.** The spec-writer takes the recommended answer at clarify and at the plan, as for nights 1 and 2, and records at the top of `plan.md` and `tasks.md`: "Approved provisionally by the Author's order of 2026-11-15", with his words above. Each question still goes on the morning page with its recommended answer; an answer he overturns is reworked before he merges." Each answer below is taken that way; the other options are kept.

**Group A, the layout and words**

- **Q1: What is "the thumbnail icon view"?** → Taken: **the portrait**, the twin's still (or its silhouette) at the split panel's right edge. It goes from the panel in every state, and the room no longer fetches the still in a 3D visit for it (spec 018's FR-003 reverted: the still is fetched only where the 2D room shows it, as before spec 018). The emblem (the open piece's icon) and the three stats stay (option A). Others: (B) the portrait and the emblem both; (C) the portrait only at rest. Reading: the orders' description says "the conversation panel and its twin thumbnail"; the emblem is a glyph drawn in code, not a picture of the twin. (FR-001, FR-002.)
- **Q2: When is the conversation panel the wall's length?** → Taken: **always, wherever the split layout shows**: the panel stands open beside the room's left wall from the wall's top to its foot, at rest and in a conversation; the text box row is its foot; the bar state (spec 018's rest row) and the "Larger conversation" toggle are not shown in that layout (option A). Others: (B) the wall's length only while a conversation runs, the rest row at rest as today; (C) the window's full height. Reading: "make that conversation panel UI the length of the left side of the page, so it should be the same length as the room wall". (FR-003, FR-004.)
- **Q3: Which rectangle is "the room wall" on screen?** → Taken: **the shell's opening**: the rectangle the near face of the `room-shell` placement's frame box projects to at the room's framing, called **the wall box** below (option A). Its left edge is the left wall's front edge, its right edge the right wall's, its top the ceiling's front edge, its foot the floor's. Others: (B) the frame area (wider than the room by the framing's 6% margin and the ease); (C) the union of every framed box's projection. Reading: it is what the visitor sees as the room's edges, and the shell is one framed box (`scene.yaml`'s `room-shell`, `frame: true`), so it is computed from data, never measured on pixels. (FR-005.)
- **Q4: How do the right column and the bottom buttons sit, and how large?** → Taken: **one column beside the right wall, from the wall box's top to its foot**: the list ("Select a piece", "Back", the entries) at its top; the toolbar's tiles, the walking control, and the "Eat" tile at its foot, ending at the wall box's foot. Each side's column fills its band, the grey between the wall box and the window's edge, from 1rem off the wall out to at most `maxRem` (the panel 44rem, the column 32rem), leaving any rest of the band at the window's edge; the type and the tiles scale with the band's width between their sizes today and 1.375 times them. The room is framed so that both columns' least widths fit beside it, so no column ever covers the wall box. Where a window can't give both least widths (the panel 20rem, the column 18rem) and spec 005's floor, it takes today's column, dock, or stacked layout, unchanged (option A). Others: (B) the toolbar stays a bar across the window's foot; (C) the columns keep today's sizes and only move beside the walls. Reading: "align the UI elements so they are next the room wall, and take up all of the grey space, i.e. make the bigger, and responsive so that they are not all teh way to the corners". (FR-005 to FR-010.)
- **Q5: How does the selected entry stop overlapping its Enter key cap?** → Taken: **the key cap gets its own slot in the row**: each entry is a row of two cells, the words and a cap slot as wide as the widest cap, so the cap sits beside the words, never over them, and the selected entry's larger words fit its row, with nothing moving between rows; `room.css`'s inset ring stops applying to the split list's rows (option A). Others: (B) no key cap on hover, only on focus; (C) the cap left of the words. Reading: on `main` the cap is placed at a fixed `right: -2.25rem` into the list's 2.5rem padding, sized for "Esc", and "Enter" reaches into the words (`split.css`). (FR-011.)
- **Q6: Where do the likeness lines go, and what else leaves the top-left?** → Taken, as his answer says: the twin's line, the dog's line, and the placeholder notes (`standin.note`, `standin.avatar`) leave the screen; the top-centre banner stays. **The Credits page** gains, at its top under its disclosure, a short section listing the `disclosure_line` of each model the bundle carries (the twin's, the dog's), verbatim from the approvals. **"Around the room" keeps every line it carries today** (the twin's line or the stand-in line, the visitor's line, the placeholder notes), so screen readers lose nothing (option A). Others: (B) the lines on the Credits page only, out of "Around the room" too; (C) the Credits page shows every approval's line, bundled or not. Reading: his answer: "move the likeness lines to the Credits page", and "screen readers and the phone layout still get the text". The stand-in line ("The twin's figure is a stand-in, not the Author's likeness.") is the twin's line's slot when the twin's model doesn't show; the same rule moves it (FR-012 to FR-015.)
- **Q7: Which layout is "the phone layout" that still shows "Around the room"?** → Taken: **the stacked layout** (`room.css`'s stacked grid, where the panels stack below the stage), where "Around the room" stays visible as today; in the split, column, and dock layouts it is visually hidden and stays in the reading order (option A). Others: (B) the stacked and the dock layouts; (C) hidden everywhere on screen. Reading: the room has no separate phone page; a phone in portrait takes the dock or the stacked layout by its size (`compose/hud.ts`'s `layoutFor`, `fitsHud`), and a phone in landscape the column. (FR-016.)

**Group B, the behaviour**

- **Q8: What is "selects the dog"?** → Taken: **the visitor's choice of the Dog at the door** (option A). Others: (B) the "Dog" selectable, spec 026's, which isn't on `main` (its scene line is in the unapplied human patch 026). Reading: "If the dog was selected, … the dog selected visitor is the same concept as the woman or man visitor" names the visitor. (FR-017.)
- **Q9: When does the room's dog show?** → Taken: **only in a dinosaur visit, when it enters on cue** (Q10, Q13). Never beside a woman, a man, or a dog visitor: a dog visitor's own figure is the only dog in its room (option A). The room's dog's files are fetched only in a 3D dinosaur visit. Spec 025's Q9 ("the room's dog is at its home for every visitor") and its FR-018 are amended. Others: (B) the room's dog also at its home in a dog visit (two dogs, as `main` has it). Reading: "The dog isn't supposed to show all the time, or when a different visitor is selected. Only when someone selects the dog, does it come in the room, or if someone selects the dinosaur". (FR-017, FR-018, FR-029, FR-030.)
- **Q10: When does the dinosaur's scene start, and what of spec 025's run?** → Taken: **once a 3D dinosaur visit, as soon as the hand-off has ended and the visitor's figure shows the dinosaur's model** (Q11; the twin at its place, the room shown), whether or not the visitor walks; it **replaces spec 025's run**, which no longer starts (its code and tests stay, unwired from the room: FR-028); the eating is offered **only once the twin, the dog, and the bicycle have left** (option A). Others: (B) when the walking view starts, as spec 025's run did; (C) the run first, then the leaving. Reading: his order of events: "the twin should wave, scream …, then the dog enters …, the twin adn the dog grab the bicycle and leave, and the dinosaur can then eat the assets". (FR-019 to FR-024.)
- **Q11: Does the scene, and the eating, work with the dinosaur's stand-in?** → Taken: **no: one condition for both, the dinosaur's model shown**, as his own answer to night 1's page Q247 set it for the eating ("Yes, one condition for all three: a dinosaur visit reserves the Eat box, and the compositor checks and reports it, only when the bundle carries the dinosaur's model (the tile can't show without it, FR-001). …", recorded whole in `docs/merge-requests/2026-11-14-night-stack.md`, "I-1 (page Q247, the Author's answer of 2026-11-13)"). A dinosaur visit whose figure shows its cut-out is as a woman's or man's: no scene, no room's dog, no eating. Once his intake of the model lands (human patch 021, P9), the scene and then the eating show together (option A). Others: (B) the scene with the cut-out too, the eating with the model only (the twin and the dog leave a cut-out that can't eat); (C) both with the cut-out, which overturns his own Q247 answer: `scene.ts:472`, `eat/available.ts:33`, `build/room/checks/rg.ts`'s `dinosaurVisit`, `build/room/report.ts`'s dinosaur lines, the proposed data-only patch (`docs/merge-requests/proposed/024-data-only-eat-box.patch`, his), and spec 025's shared condition all change. Reading: `probe-eat-028`'s finding (its words): "B-eat: the eating is off with the stand-in, by spec 024's FR-001 and page Q247, not by a defect", and "What fixes his item 2's eating with no code change: his intake of the dinosaur's model (human patch 021)". His review saw `main` without the model; an answer of his isn't overturned by a recommended one. (FR-019, FR-025, FR-032.)
- **Q12: What is the twin's "scream", and what is its wave?** → Taken: **a speech bubble over the twin's figure in 3D, with the words "There is a dinosaur in the room!"**, a UI word (`figures.dino_call`), held for the twin's speaking time (spec 016's `speak_wpm` within `speak_s`), and said once by the room's polite live region; no sound. **The wave is the twin's approved `greeting` clip**, played once at the scene's start (option A). Others: (B) the line in the conversation log as the twin's message; (C) the live region only. Reading: the room has no sound and no speech bubble on `main`; the line states nothing about the Author, so it is a UI word, not corpus. Its words are his, "there is a dinosaur in the room", with a capital and an exclamation mark. (FR-019, FR-020.)
- **Q13: Where do the twin, the dog, and the bicycle go?** → Taken: **out of the room's open front by a path in the scene's data** (`figures.leave.path`): the dog enters along it from outside the room, past the right wall's front edge, to beside the twin; the twin (by spec 019's gait) and the dog walk to the floor below the bicycle; the bicycle's picture comes off the wall and stands beside the twin; the three go out along the path and are hidden once outside the shell. They don't come back in the visit. The bicycle's placement stays (its label, frame box, pick area, reach target, and its list entry and topic), as spec 025's FR-017 keeps the twin's (option A). Others: (B) they come back after a time; (C) the bicycle stays on the wall. Reading: the shell is "a brick cube open at the front" (`room-shell.yaml`); `main` has no door or exit, so the path is new data, an estimate the Author's look places. (FR-021 to FR-023.)
- **Q14: What does the conversation do while the twin is away?** → Taken: **nothing changes**: the panel, the text box, and the twin's answers work as before; no figure shows talking (option A). Others: (B) the twin's figure comes back while it answers. Reading: the conversation is the twin's, the AI's; its figure is a picture (spec 025's FR-015 kept the conversation the same way). (FR-024.)
- **Q15: Where does a dog visitor's introduction line come from, and how does it show?** → Taken: **one sentence in his own words, from a corpus slot**, `hobbies.dog_visitor_intro` in `corpus/facts/hobbies-and-travel.yaml` (or a facts file of its own, if the plan's check finds that one leaves the topics' hashes unchanged), null until he fills it, proposed in `corpus/proposals/` with a patch for his hand. Once filled, the twin shows it once a dog visit, after the hand-off, in the same speech bubble as Q12 (3D) and the live region (3D and 2D). It is no conversation turn: no model call, nothing in the conversation's history. While the slot is null, there is no line and the visit is as a man's or woman's (option A). Others: (B) a gateway turn opening the hobbies-and-travel topic with a lead (a model call a dog visit, its cost, and an answer that may say anything the topic holds); (C) a UI word (refused: it would state a fact about the Author outside the corpus). Reading: his item says what the sentence is about, "how much they love Arya, and all the adventures we've had of course, i'll show her all the work i've been doing"; its exact words are his to write, since a sentence built from those words would be a paraphrase. The corpus's "## Arya" section holds his words about her, and the proposal quotes his item beside the empty slot. (FR-027.)
- **Q16: Does his item 4b conflict with night 2's Q292 and Q294?** → Taken: **no change to either** (option A). His approval of the dog's model says the room's dog is "a dog of the breed and not a likeness of the Author's dog"; Q292 dropped the likeness slot on that line, and Q294 kept "That the dog in the room is a real dog: it is an AI-made likeness, not a photo or a recording." His item 4b has the twin speak to a dog visitor about Arya ("i'll show her all the work"), which reads as the visitor playing Arya, as a visitor plays the man or the woman. The line he writes into the slot says what it says; nothing in the room says the model is a likeness of Arya, and the Credits page shows his approval's line verbatim. Others: (B) the room's dog is Arya after all: a new approval of his with a new `disclosure_line`, and Q292 overturned toward patch-026's build (the slot `hobbies.room_dog_name`, filled "Arya" in his words); (C) the introduction doesn't name Arya (his words then need his rewrite). Reading: Q292 and Q294 are recommended answers taken under night 2's rule, not his; his approval's line is his. If he means the dog visitor *is* Arya's likeness, option B is the route, and his approval's line changes by his hand first. (FR-027, Assumptions.)
- **Q17: What of spec 026's petting, now that no room dog stands at home?** → Taken: **dormant**: its code and tests stay, and it never starts in the room, since its start needs the room's dog shown at home (spec 026's FR-001), which no visit has any more (option A). Others: (B) the twin pets a dog visitor's figure when it stands within reach after the introduction (spec 026's Q8, option B); (C) the twin pets the room's dog when it arrives in the dinosaur's scene, before they leave. Reading: his item 4b describes each visit's scene and names no petting; the petting needs the "Dog" selectable, which is still in his unapplied patch 026. Spec 026's FR-001 and FR-014 are amended by name. (FR-028.)
- **Q18: What does "the same concept as the woman or man visitor" change?** → Taken: **nothing beyond Q9 and Q15**: on `main` a dog visitor already walks, reaches, selects pieces, and converses as the woman and the man do; it holds the twin's paper at its anchor, since the dog has no `take` or `idle-holding` clip and no hand bone (spec 020), and that stays (option A). Others: (B) studio clips for the dog's take and hold (a studio round and his look approval). Reading: "they will just engage with the twin or the room assets". (FR-017.)

**The two probes' parts**

- **Q19: What does spec 028 do about the PDF's links?** → Taken: **no code: the fix is his publishing of the candidate** (human patch 023, P8), once the repository is public and he has clicked each link (option A). `probe-pdf-028`'s finding (its words): `main` serves C-0002, which "has **no** film links", and in the candidate "Each one covers exactly one of the four small-caps category items on the line under the "hareet.ai" title (LOCAL MODELS FIRST · A REAL-TIME COST METER · A $5-A-DAY KILL SWITCH · EVERY DATA FLOW DISCLOSED). Each rectangle holds that item's glyphs and no others." Its question, on its own page entry, asks him whether that row is the one he means. Others: (B) he means another line (the Medic section's sub-headings, which no film covers): his re-render from `resume/source/twin.html` (spec 023's route b); (C) that row plus links to the evals, lifecycle, and stack films, which needs new text on the page and his re-render. Reading: "the downloaded PDF doesn't have links to the films where the category text is listed in the sub headlines"; his review downloaded what `main` serves. (FR-031.)

## User Scenarios & Testing *(mandatory)*

Users: visitors on a window from 320 px to a large monitor, by pointer, touch, keyboard, and screen reader, with or without reduced motion; and the Author, who judges the look. Degraded modes are written into each story (Principle I).

### User Story 1 - The Conversation Beside the Room's Left Wall (Priority: P1, group A)

As a visitor on a wide window, I see the conversation as one tall panel beside the room's left wall, its length the wall's, with no thumbnail.

**Independent Test**: `vitest run test/room/wall-box.test.ts test/room/hud-wall-geometry.test.ts test/ui/hud-split.test.ts`: in jsdom at 1920 × 1080 and 2560 × 1440, the panel's box is left of the wall box by 1rem, its top and foot the wall box's, and no portrait is in the panel.

**Acceptance Scenarios**:

1. **Given** a window that takes the split layout, **When** the room opens, **Then** the panel stands open beside the room's left wall, its top at the wall box's top and its foot at the wall box's foot, the text box row at its foot, with no portrait, no "Larger conversation", and no bar state.
2. **Given** the panel, **When** a conversation runs, **Then** the twin's words show in the body, the emblem and stats at its top-left, the panel's box unchanged.
3. **Given** the window is resized, **When** the room re-fits, **Then** the panel follows the wall box (its height the wall's), and keeps the log and the text box's text.
4. **Given** a 3D visit, **When** the panel shows, **Then** no request for the twin's still is made.

### User Story 2 - The Right Column Beside the Room's Right Wall (Priority: P1, group A)

As a visitor, I see the piece list and the room's buttons in one column beside the room's right wall, larger, and every entry legible.

**Independent Test**: `vitest run test/room/hud-wall-geometry.test.ts test/ui/hud-split.test.ts test/ui/hud-split-list.test.ts`.

**Acceptance Scenarios**:

1. **Given** a window that takes the split layout, **When** the room opens, **Then** the column stands beside the right wall, 1rem off it, from the wall box's top to its foot: the list at its top, the toolbar's tiles, the walking control, and (in a dinosaur visit) the "Eat" tile at its foot.
2. **Given** a wider window, **When** the room re-fits, **Then** the two columns widen into the grey toward their `maxRem`, their type and tiles scaling with them, and they stay beside the walls; any band beyond `maxRem` is left at the window's edge, never between a column and its wall.
3. **Given** the pointer on "Snowboard" (or any entry), **When** it is the selected entry, **Then** its words and the "Enter" key cap don't overlap, at every window of the layout's table, and no other entry moves.
4. **Given** a window that can't hold both least widths beside the room and spec 005's floor, **When** the room opens, **Then** today's column, dock, or stacked layout shows, unchanged.

### User Story 3 - The Room's Notes and "Around the Room" (Priority: P1, group A)

As a visitor, I see no labels at the top-left and no section below the room; the top banner stays; the likeness lines are on the Credits page; a screen reader still reads "Around the room".

**Independent Test**: `vitest run test/ui/notes-gone.test.ts test/ui/credits.test.ts test/ui/around.test.ts test/ui/text-copy.test.ts test/ui/a11y.test.ts`.

**Acceptance Scenarios**:

1. **Given** any layout, the twin's model showing and a dog visitor's model showing, **When** the room opens, **Then** no twin's line, dog's line, stand-in line, or placeholder note shows on screen, and the banner "You're talking with an AI representation of the Author, not the Author" does.
2. **Given** the Credits page, **When** it opens, **Then** under its disclosure it lists the twin's line and the dog's line, each verbatim from its approval, for each model the bundle carries.
3. **Given** the split, column, or dock layout, **When** the room shows, **Then** "Around the room" takes no space on screen and a screen reader reaches it in its place in the reading order, with every line it held before.
4. **Given** the stacked layout, **When** the room shows, **Then** "Around the room" shows below as today.

### User Story 4 - The Dinosaur's Scene (Priority: P1, group B)

As a visitor who chose the Dinosaur, I see the twin wave and call that there is a dinosaur in the room, the dog come in, the twin and the dog take the bicycle and leave, and then I can eat the room's pieces.

**Independent Test**: `vitest run test/room/dino-scene.test.ts test/room/dino-scene-path.test.ts test/room/dino-scene-degraded.test.ts`, on numbers alone with a scripted clock and fake figures; then the Author's look.

**Acceptance Scenarios**:

1. **Given** a 3D dinosaur visit, its model showing (Q11), **When** the hand-off has ended, **Then** the twin plays its greeting (the wave), its bubble says "There is a dinosaur in the room!" and the live region says it once.
2. **Given** the call has ended, **When** the scene goes on, **Then** the dog walks in along the path to beside the twin, the twin and the dog walk to below the bicycle, the bicycle comes off the wall and stands beside the twin, and the three go out along the path and are hidden outside the shell; the live region says once "The twin and the dog took the bicycle and left."
3. **Given** they have left, **When** the dinosaur walks up to the desk and the visitor presses B (or "Eat"), **Then** a chunk is eaten as spec 024 has it; before they have left, no "Eat" tile shows and B does nothing.
4. **Given** reduced motion, quality level 1 or more, a twin without leg bones, or the twin's capsule, **When** the scene starts, **Then** the call shows and is said, then the twin, the dog, and the bicycle are hidden at once (a cut), the live region says they left, and the eating is offered.
5. **Given** the dog's model isn't bundled or failed, **When** the scene runs, **Then** the twin leaves with the bicycle alone, and the live region names the twin alone.
6. **Given** the room is paused mid-scene, **When** it resumes, **Then** the scene goes on from where it was.

### User Story 5 - The Dog Visitor, and No Dog for Others (Priority: P1, group B)

As a visitor who chose the Dog, I am the only dog in the room, and the twin greets me with one sentence about Arya; as a woman or man visitor, I see no dog.

**Independent Test**: `vitest run test/room/dog-figure.test.ts test/room/dog-intro-line.test.ts test/room/dog-first-visit.test.ts`.

**Acceptance Scenarios**:

1. **Given** a woman, man, or dog visit, **When** the room opens, **Then** no room's dog shows and its files are not fetched (the dog visitor's own files are fetched once, as today).
2. **Given** a dog visit and the slot `hobbies.dog_visitor_intro` filled in his words, **When** the hand-off ends, **Then** the twin's bubble shows that sentence once (3D) and the live region says it once (3D and 2D); nothing enters the conversation log or its history, and no request leaves.
3. **Given** the slot is null, **When** a dog visit starts, **Then** no line shows, and the visit is as a man's or woman's.
4. **Given** a dog visit, **When** the visitor walks and selects, **Then** it reaches and opens pieces and converses as a man or woman visitor does.

### User Story 6 - The Eating After the Scene, the Stand-In, and the PDF (Priority: P2, group B)

As the Author, I learn why the eating didn't happen in my review (the model's absence, by my Q247 answer), see a cut-out dinosaur visit behave as a woman's or man's, and learn what publishes the PDF's links.

**Independent Test**: `vitest run test/room/eat-available.test.ts test/room/eat-scene.test.ts test/room/eat-after-scene.test.ts test/room/dino-cutout-visit.test.ts`; the probes' notes, quoted in this spec's notes and the stack's note.

**Acceptance Scenarios**:

1. **Given** a dinosaur visit on a bundle without the dinosaur's model (its cut-out showing), **When** the room opens, **Then** no scene runs, no room's dog shows or is fetched, the twin stays at its place, and no "Eat" tile shows: the visit is as a woman's or man's.
2. **Given** the model shows, **When** the scene has ended, **Then** the eating is offered as spec 024 has it.
3. **Given** `probe-pdf-028`'s finding, **When** the PDF task ends, **Then** the stack's note says whether the candidate's four links sit on the four claims, and what the Author does to publish it.

### Edge Cases

- A window resized across the split layout's bound while a conversation runs: the room re-lays out, the log and the text box's text kept (spec 018's D-I5).
- A window so wide the room is bound by its height: each band is wider than its column's `maxRem`; the rest is left at the window's edge.
- A window so tall the room is bound by its width: the bands are the least widths, and the wall box is shorter than the window; the columns are as tall as the wall box, centred with it.
- 200% zoom: a 1920 × 1080 window is 960 × 540 CSS pixels, which can't hold both least widths, so it takes the column layout and reflows as today.
- The soft keyboard: the panel's foot stays above its inset, as the rest row's did.
- The other notes (the room's degraded causes, the loading notes) still show where they do today; only the three named labels leave the screen.
- A dinosaur visit whose model hasn't arrived (the cut-out): no scene, no room's dog, no eating, the twin at its place; nothing on screen says why, since the placeholder note leaves the screen (FR-012); its words stay in "Around the room" (FR-015).
- A dinosaur visit whose model fails mid-scene (a lost context): as below.
- A dinosaur visit that leaves the 3D room (a lost context, a fall to 2D) mid-scene: the scene stops; in 2D nothing of it shows, and the eating, which is 3D only, isn't offered.
- The dinosaur stands on the path when the figures pass: they pass through its picture; the path isn't on the visitor's floor (FR-022).
- After they have left: the bicycle's list entry, label, and pick area stay, and selecting it opens its topic; the twin's placement stays an obstacle on the visitor's floor (spec 025's FR-017).
- A dog visit whose dog model failed: the visitor's cut-out; the introduction line still shows in the live region, and in 3D the bubble over the twin.
- The twin's own model failed and the stand-in man shows: the scene and the introduction play on the stand-in as on the model.
- The kill switch degraded or the tier unknown: no effect; nothing here calls the gateway.

## Requirements *(mandatory)*

Terms: **the split layout**: spec 018's, placed by this spec beside the walls (FR-005); **the wall box**: Q3's rectangle; **the left band** and **the right band**: the window's parts left and right of the wall box, less the safe areas; **the panel**, **the column**: the conversation's and the list's and buttons' boxes in those bands; **the scene**: the dinosaur's scene (User Story 4).

### Group A: the layout and words

**The conversation panel**

- **FR-001**: THE SPLIT PANEL SHALL hold no portrait: no twin's still, no silhouette, in any state (Q1). The emblem and the three stats stay (spec 018's FR-005, less its portrait).
- **FR-002**: THE ROOM SHALL NOT fetch the twin's still in a 3D visit for the panel; the still is fetched only where the 2D room shows it (spec 018's FR-003 reverted to spec 016's rule). Disclosure row V1's sentence that spec 018 added for it SHALL be removed in the stack (FR-030).
- **FR-003**: IN the split layout, THE PANEL SHALL be shown open at all times, at rest and in a conversation: title, hint, emblem and stats, body (the log), and its foot the text box row, inside the frame (Q2). The bar state and the "Larger conversation" toggle SHALL NOT show in that layout; the log's collapse ("Conversation" as a toggle, spec 005's tests' pin) SHALL keep its behaviour where the other layouts show it. Escape and "Back" SHALL close the open piece's conversation (spec 018's FR-009 order) and leave the panel standing, its log as the conversation left it.
- **FR-004**: THE PANEL'S BOX SHALL be, in the split layout: its right edge 1rem (`wall.gap_rem`) left of the wall box's left edge; its width the left band's less that gap and less 1rem at the window's edge, at most `panel.maxRem` (44rem) and at least `panel.minRem` (20rem); its top the wall box's top and its foot the wall box's foot (Q2, Q3). The notes that still show (FR-014) stack above the panel's title inside the left band and push the panel's top down while one shows.

**Placement beside the walls**

- **FR-005**: THE WALL BOX SHALL be computed by a pure function from the composed bundle and a stage, with no DOM and no three.js: the near face of the `room-shell` placement's frame box, projected at the room's framing for the frame area (`compose/framing.ts`, `compose/project.ts`), in CSS pixels from the window's top left. The same function SHALL serve the room and the compositor (spec 014's FR-016: "so the room the visitor sees is framed exactly where the checks judged it").
- **FR-006**: IN the split layout, THE FRAME AREA SHALL be the window less the top strip (the banner's row), less the left band's least width (`panel.minRem` + 2 × `wall.gap_rem`) at the left and the right band's (`column.minRem` + 2 × `wall.gap_rem`) at the right, less the safe areas: the room is framed into it by the production framing (contain, its 6% margin, never stretched or cropped), and the bands are what the wall box leaves beside it. No box of the panel or the column SHALL overlap the wall box. Spec 014's ease and spec 018's FR-001 (e) cover cap SHALL NOT apply to this layout (the HUD covers none of the room: Amendments).
- **FR-007**: THE COLUMN SHALL be in the split layout: its left edge 1rem right of the wall box's right edge; its width the right band's less that gap and less 1rem at the window's edge, at most `column.maxRem` (32rem) and at least `column.minRem` (18rem); its top the wall box's top and its foot the wall box's foot. It SHALL hold, top to foot: the list's head ("Select a piece", "Back"), the entries, scrolling inside the list where they don't fit; then the toolbar's tiles (spec 016's FR-042 order, "Credits" last), the walking control, and the "Eat" tile where spec 024 reserves it, ending at the column's foot (Q4).
- **FR-008**: THE PANEL'S AND THE COLUMN'S TYPE AND TILES SHALL scale with their box's width, linearly from 1 at the least width to 1.375 at the most, through one custom property each (`--wall-scale-left`, `--wall-scale-right`), so a key cap, a stroke, and an entry keep their proportions; no text SHALL fall below today's size.
- **FR-009**: THE ROOM SHALL use the split layout exactly where (a) the window is landscape and at least 32rem wide (spec 005's column rule) and holds its HUD; (b) with FR-006's frame area, the stage is at least spec 005's floor (304 × 196) and the wall box is at least `wall.minHeightRem` (14rem) tall; and (c) both bands hold their least widths. Elsewhere it SHALL use today's column, dock, or stacked layout, unchanged, with `data-split="off"`. The rule is computed from the table and the wall box, not a width bound; the plan's table gives the windows on each side.
- **FR-010**: THE COMPOSITOR SHALL judge the split layout's stages: its stage sweep (`compose/stages.ts`) SHALL take the split layout's frame area and reserved boxes for every swept screen that takes it, so RG5 to RG7 run where the room is framed; a dinosaur visit's variant (spec 024's Q150) takes the "Eat" tile in the column. A data edit or a layout edit that makes RG7's floor fail at a reference stage fails the build as today.

**The list**

- **FR-011**: EACH ENTRY OF THE SPLIT LIST SHALL be a row of two cells: the words, right-aligned, and a cap slot as wide as the widest key cap the list shows ("Enter") at the row's right, which holds the key cap of the selected entry and is empty for the others (Q5). The words' cell SHALL NOT overlap the cap slot for any entry, selected or not, at any window of the plan's table; the selected words' larger size SHALL fit the row's height; no other entry SHALL move when the selection changes. `room.css`'s hover and `aria-current` inset ring SHALL NOT apply to the split list's buttons; the split list's own selected look (spec 018's FR-008) is unchanged.

**The notes, the Credits page, and "Around the room"**

- **FR-012**: THE ROOM SHALL NOT show on screen, in any layout: the twin's line (its approval's `disclosure_line`), the stand-in line (`twin.stand_in`), the visitor's likeness line (spec 020's), the placeholder note (`standin.note`), or the visitor's placeholder note (`standin.avatar`) (Q6; his answer). The top-centre banner (`#ai-disclosure`) SHALL show as today.
- **FR-013**: THE CREDITS PAGE (`/credits/`, `build/credits.ts`) SHALL show, under its disclosure and before the asset list, a section headed by the UI word `credits.likeness` ("The AI-made figures"), with one line for each model the bundle carries whose approval has a `disclosure_line` (today the twin's and the dog's), that line verbatim, as data from the approvals, never in code; with none, no section.
- **FR-014**: THE OTHER NOTES (the room's degraded causes, the loading notes) SHALL show where they do today, and in the split layout above the panel (FR-004).
- **FR-015**: "AROUND THE ROOM" SHALL keep every line it carries on `main`: the twin's line or the stand-in line first, the visitor's likeness line, and the placeholder notes' words, as text a screen reader reads (Q6).
- **FR-016**: IN the split, column, and dock layouts, "AROUND THE ROOM" SHALL be visually hidden (the room's `.visually-hidden` rule), take no space on screen, and keep its place in the reading order and the Tab order (spec 005's order, last); IN the stacked layout it SHALL show as today (Q7; his answer). Spec 004's Q answer "visible and open to every visitor" is amended by his answer.

### Group B: the behaviour

**The dog**

- **FR-017**: THE ROOM'S DOG SHALL NOT show, and its files SHALL NOT be fetched, in a woman, man, or dog visit (Q9). A dog visitor's figure is the only dog in its room; it walks, reaches, selects, and converses as `main` has it (Q18).
- **FR-018**: IN a 3D dinosaur visit above ADR 0010's floor, WHERE the scene has `figures.dog` and the bundle carries the dog's approved model and the dinosaur's (Q11), THE ROOM SHALL fetch the room's dog's files after the twin's and the visitor's (spec 009's loader), and the dog SHALL show only from its entry in the scene (FR-021) to its leaving; it is never at a home. `wants.dog` (`scene/avatars.ts`) SHALL be `"dog"` only in such a visit.

**The dinosaur's scene**

- **FR-019**: IN a 3D dinosaur visit above ADR 0010's floor, with its context, THE SCENE SHALL start once, at the first frame at which the hand-off has ended and the visitor's figure shows the dinosaur's model (Q10, Q11; a model that loads late starts it then; one that fails never does), whether or not the walking view is on. With the cut-out, the visit SHALL be as a woman's or man's: no scene, no room's dog, no eating. It SHALL NOT start in any other visit.
- **FR-020**: THE SCENE'S FIRST STEP SHALL be the call: the twin's state `arriving` plays its greeting clip (the wave; spec 016's `greeting`, already approved), and a speech bubble over the twin's figure shows the UI word `figures.dino_call`, "There is a dinosaur in the room!", for the twin's speaking time (spec 016's `speak_wpm` within `speak_s`), and the room's polite live region says it once (Q12). The bubble is placed above the twin's head by projecting the twin's placement's top at the stage's camera, inside the wall box, and is hidden from assistive technology (the live region says it).
- **FR-021**: THEN THE DOG SHALL enter: it shows at the path's outer end (`figures.leave.path`'s last point) and walks along the path, reversed, to `figures.leave.meet` beside the twin, at `figures.leave.dog_mps`, playing `walk`, then `idle`. THEN the twin (by spec 019's gait over its idle, as spec 025's FR-013 has it) and the dog walk to `figures.leave.under_bicycle`; the bicycle's picture moves from its wall mount to `figures.leave.carry` beside the twin (a move of `figures.leave.take_s`); THEN the three go along the path to its outer end at `figures.leave.walk_mps`, the bicycle's picture keeping its offset from the twin's, and each is hidden at the path's end. The live region SHALL say once `figures.left_both` ("The twin and the dog took the bicycle and left.") or `figures.left_twin` ("The twin took the bicycle and left.").
- **FR-022**: `figures.leave` SHALL be scene data (`meet`, `under_bicycle`, `carry` as an offset from the twin, `path` as points on the floor plane, `dog_mps`, `walk_mps`, `take_s`), each an estimate the Author's look places. THE BUILD SHALL refuse a `figures.leave` whose path's last point is inside the shell's box, whose speeds aren't positive, or whose `meet` and `under_bicycle` aren't on spec 025's chase floor. The path is the figures' only, never the visitor's floor; the figures pass through the visitor's picture.
- **FR-023**: ONLY the pictures SHALL move (spec 025's FR-017): the twin's and the bicycle's placements keep their labels, frame boxes, pick areas, obstacles, and reach targets; the bicycle's list entry and topic stay. Once hidden, the twin, the dog, and the bicycle SHALL stay hidden for the rest of the visit (Q13).
- **FR-024**: THE CONVERSATION, the panel, the text box, and the twin's answers SHALL NOT change during or after the scene (Q14). The twin's state machine records the answers; no talking clip plays while the twin's figure is hidden.
- **FR-025**: THE EATING (spec 024) SHALL be offered in a dinosaur visit only once the scene has ended (the three hidden) or been cut (FR-026), and otherwise as spec 024 and his Q247 answer have it: only with the dinosaur's model shown (`scene.ts`'s `eats` and `eat/available.ts`'s `figureModel` unchanged; Q11). Until the scene has ended or been cut, no "Eat" tile shows and B does nothing; the "Eat" box stays reserved as spec 024's FR-012 and Q150 have it, so the framing doesn't move when the tile appears.
- **FR-026**: THE SCENE SHALL be cut, the call still shown and said, then the twin, the dog, and the bicycle hidden at once, the left line said, and the eating offered, WHERE motion is reduced, the quality level is 1 or more, the twin's figure can't walk (no leg bones or hips bone, or its capsule; spec 025's FR-014), or its run would need a clip the dog lacks (no `walk`). WHEN reduced motion or quality level 1 or more begins mid-scene, it is cut at once. WHILE the room is paused (spec 002's motion store), the scene's clock pauses. WHERE the dog's model isn't bundled or failed, the twin leaves with the bicycle alone. In the 2D room, below the floor, or with a lost context, the scene doesn't happen.

**The dog visitor's introduction**

- **FR-027**: IN a dog visit, WHERE the bundle carries `dog_visitor_intro` (the slot `hobbies.dog_visitor_intro`'s value, his words, read by the room's build through `build/content.ts`'s `readFacts`, and only where its `public_safe` is `true`, as `fillSlots` reads a slot), THE TWIN SHALL show it once, when the hand-off ends: in the speech bubble of FR-020 over the twin's figure in 3D, and in the polite live region in 3D and 2D (Q15). It SHALL NOT enter the conversation's log or its history, call the gateway, or send anything. WHERE the slot is null or absent, no line. The proposal (`corpus/proposals/dog-intro-2026-11-15.md`) and its patch from plain copies (`docs/merge-requests/2026-11-15-corpus-dog-visitor-intro.patch`) add the slot null, its label, and his item 4b's words quoted as its source, for his hand; no worker fills it, and "Answered: recommended" never does.

**What of the run and the petting**

- **FR-028**: SPEC 025'S RUN SHALL NOT start in the room (Q10): its shell isn't made for any visit; its modules and tests stay, unwired, and the scene reuses its chase floor, its `walkHome`-style stepping, the twin's gait adapter, and the dog's clip choice. SPEC 026'S PETTING SHALL NOT start in the room (Q17): no room dog stands at home; its code and tests stay. Every test of specs 025 and 026 that pins the room's wiring (the shell made for every visitor; the dog at home for every avatar) is rewritten by the task that owns this change, test-first, named in plan.md as a departure.

**First visit, data flow, and the probes**

- **FR-029**: RK5 (`build/room/checks/rk.ts`) SHALL count the room's dog's files only with the dinosaur's in a dinosaur visit: the first visit is the room's set, the twin's files, the stand-in's, and the largest of the woman's, the man's, the dog visitor's, and the dinosaur's plus the room's dog's (the latter only where the bundle carries the dinosaur's model), against `main`'s `first_visit_bytes.phase3`.
- **FR-030**: DISCLOSURE ROW V1 SHALL say, in the same change as the code, that the room's dog's model and clips are fetched only in a 3D dinosaur visit, and so, like the chosen avatar's files, their paths show that the visitor chose the dinosaur; and, in the stack, that the twin's still is fetched only where the 2D room shows (FR-002). No new row; row V4 unchanged.
- **FR-031**: NO CODE SHALL change for his point 3 (Q19): `probe-pdf-028` found the candidate's four annotations each on one of the four claims. THE STACK'S NOTE and `docs/merge-requests/human-patches/028.md` SHALL quote the probe's finding and point him to his publishing step (human patch 023, P8) and to the probe's question. Should he answer that he means another line, spec 023's route (b) is his re-render, outside this spec.
- **FR-032**: THE EATING TASK SHALL merge `night/probe-eat-028/probe-eat-028` and quote its finding (the eating is off with the stand-in by spec 024's FR-001 and his Q247 answer; his intake of the model fixes it with no code change). Spec 028's eating change is FR-025's wait for the scene alone. Since the placeholder note that hinted at the cut-out leaves the screen (FR-012), its words stay in "Around the room" (FR-015), and the stack's note tells him that a cut-out dinosaur visit shows no scene and no eating until his intake.

### Key Entities

- **The wall box**: a rectangle in CSS pixels, the shell's opening at the framing (FR-005).
- **The wall placement table**: `HUD_PLACEMENTS.wall`: `gap_rem` 1, `panel` (`minRem` 20, `maxRem` 44), `column` (`minRem` 18, `maxRem` 32), `minHeightRem` 14, `scaleMax` 1.375. Data in code, pinned by a test, the Author's look to tune.
- **The leave block**: scene data, `figures.leave` (FR-022).
- **The scene director**: a pure module, phases `call`, `enter`, `gather`, `take`, `leave`, `gone`, `cut`, reading the clock and the figures' states and giving each figure a pose per frame.
- **The speech bubble**: a DOM element over the stage, its text a UI word or the introduction's line.
- **The introduction's slot**: `hobbies.dog_visitor_intro` (FR-027).

## Success Criteria *(mandatory)*

- **SC-001**: At every window of the plan's table that takes the split layout, the panel's and the column's boxes are each 1rem off the wall box, as tall as it, inside the window by at least 1rem, and overlap neither the wall box nor each other; at the others, the layout is today's, box for box.
- **SC-002**: For every entry of the room's list, selected and not, the words' box and the cap slot don't intersect at any window of the table.
- **SC-003**: No twin's line, stand-in line, visitor's line, or placeholder note is on screen in any layout; the Credits page holds each bundled model's line verbatim; "Around the room" holds the same lines as on `main`.
- **SC-004**: In scripted runs, the scene goes call → enter → gather → take → leave → gone in order, ends within `figures.leave`'s path length over its speeds plus the call's time, plus 2 s; under each degraded setting it cuts; eating is never available before `gone` or `cut`.
- **SC-005**: A woman, man, or dog visit fetches no room's dog file; a dinosaur visit fetches them once; RK5 counts them as FR-029 says.
- **SC-006**: With the slot filled in a fixture, a dog visit shows the line once and sends nothing; with it null, nothing.
- **SC-007**: The PDF's and the eating's findings are quoted in the stack's note with what was done about each.
- **SC-008**: The Author's look: the columns beside the walls and their size, the scene's timing and path, the bubble (his, in the morning).

## Amendments to Earlier Specs

| Spec, clause | Amended to | By |
|---|---|---|
| 004, Q answer "visible and open to every visitor"; FR-063 | Visually hidden but in the stacked layout; same content and order. | His answer; FR-016 |
| 005, Q1 "Bottom bar, plus one column on the right" | In the split layout, the bar's tiles move into the right column; the bar stays in the other layouts. | His point 6; FR-007 |
| 009, FR-013; 016, FR-014 | The stand-in line and the twin's line leave the stage's note; they stay first in "Around the room"; the approved line is on the Credits page. | His answer; FR-012 to FR-015 |
| 014, the 25% cover cap; the ease (FR-009) | Don't apply to the split layout, whose HUD covers none of the room. | FR-006 |
| 018, Q2, Q4, Q58, Q59; FR-001, FR-003, FR-004, FR-005 | The panel stands open at the wall's length; no portrait; no still in 3D; geometry beside the walls; FR-009 replaces FR-001's rule. | His points 1 and 6; FR-001 to FR-010 |
| 020, FR-007 | The dog's line leaves the room's note; it stays in "Around the room" and is on the Credits page. | His answer; FR-012, FR-013 |
| 024, FR-001 | The eating is offered only after the dinosaur's scene; its model condition (his Q247 answer) unchanged. | Q10, Q11; FR-025 |
| 025, Q1, Q9; FR-001, FR-018, FR-019, FR-021, FR-022, FR-028 | The run doesn't start; the room's dog shows only in the dinosaur's scene; its files only in a dinosaur visit; RK5 and V1 follow. | Q9, Q10; FR-017, FR-018, FR-028 to FR-030 |
| 026, FR-001, FR-014 | Dormant: no room dog at home. | Q17; FR-028 |

## Assumptions

- The dinosaur's model may arrive by his intake tonight or later (human patch 021, P9); until it does, a dinosaur visit shows its cut-out and is as a woman's or man's (Q11), so the scene and the eating are tested on fixtures (`test/helpers/room-dinosaur.ts`) and his look waits for the model. The look approval of any model is his and not this spec's: this spec adds no asset (no `assets/**`, no `assets/policy/**` change).
- The numbers in `HUD_PLACEMENTS.wall` and `figures.leave` are estimates, data, the Author's at his look.
- **Deviations named** (CLAUDE.md, "Deferring or dropping a control the constitution requires"): **Principle II** ("telemetry that makes it observable in production") and **Development Workflow 7** ("A feature without a graph is not done") are not met for the dinosaur's scene or the dog visitor's introduction: an event sent only when either happens would tell the stack the visitor's avatar, which row V4 says the usage events never carry. It is the deviation ADR 0055 (on `main`, proposed: `docs/adr/0055-no-usage-event-for-what-only-the-dinosaur-causes.md`) records for specs 024 to 026, for the same reason; the docs role adds spec 028's two cases to it in the stack (a dog visit's introduction is caused only by the dog, the same reason), and the Author accepts it with the rest. The layout's change is observed by the existing panels (no new route or call). No accepted ADR is reversed.
- Q292 and Q294 stand as night 2 took them (Q16); if he takes Q16's option B, the dog's approval line is his to change first, and spec 026's patch is rebuilt.
- The candidate PDF stays unpublished; publishing it is his (Q19).

## Expected Cost Impact

Cloud: none. No model call is added (the introduction is a fixed line, the call a UI word). The first visit shrinks for every woman, man, and dog visitor by the room's dog's files (about 6.5 MB gzip, night 2's Q288) and by the twin's still in a 3D visit. Dev-time: two implementer sessions beside each other, one integration, and a review.

## Degraded-Mode Behavior

Written first (Principle I). Layout: any window that can't hold the split layout's minimums takes today's layouts, unchanged; a failed frame drawing keeps spec 018's plain forms. The scene: cut under reduced motion, quality level 1 or more, a twin that can't walk; the twin alone where the dog can't show; nothing in 2D, below the floor, or with a lost context; nothing with the dinosaur's cut-out (the visit is as a woman's or man's, Q11). The eating: as spec 024 has it, after the scene. The introduction: no line while the slot is null. Nothing here depends on the local tier, the budget, or a provider.

## Data-Flow Disclosure Entries

No new row and no new destination. Row V1: the room's dog's files only in a 3D dinosaur visit, their paths showing the choice (FR-030); the twin's still only where the 2D room shows (FR-002). The Credits page already is among V1's pages. Row V4 unchanged.

## The "New Endpoint or Feature" List (`CLAUDE.md`)

- Telemetry span: none; the scene and the introduction are a named deviation (Assumptions).
- Dashboard panel: none new; "Visits whose avatar failed" keeps counting the room's dog's files' failure, now in dinosaur visits only (its description line updated).
- Cost estimate: above.
- Degraded-mode behavior: above.
- Data-flow disclosure entry: V1's amendment (FR-030).

## Constitution Check

| Principle | How this complies |
|---|---|
| I. Data-Local | Fewer bytes fetched; no new byte about the visitor leaves the device; V1 amended in the same change; degraded modes first. |
| II. Production-Grade | Tests first; the compositor judges the new layout's stages (FR-010); production telemetry for the scene and the introduction is a named deviation (Assumptions). |
| III. Intent, Spec, Code, Humans Merge | The intent is a draft for his acceptance; he merges. |
| IV. Least Privilege | No human-only path changes; the corpus slot is a proposal and a patch for his hand. |
| V. Cost | None in the cloud; stated. |
| VI. Build in Public | The questions are on the morning page with recommendations. |
| VII. Own the Whole Product | Nothing about the Author is stated beyond his words: the introduction is his slot's value, and the call states nothing about him. |
| VIII. Honest AI | The banner stays on screen; the likeness lines move, by his answer, to the Credits page and stay in "Around the room"; the twin's call and the introduction are staged lines in a bubble, not answers. |

## Open Questions

Q1 to Q19 above, each with its recommended answer, taken provisionally; each is in `/night/io/out/questions.md`.
