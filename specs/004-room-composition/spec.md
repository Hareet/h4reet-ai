# Feature Specification: Room Composition — The Work Area's Pieces, Composed From Data

**Feature Branch**: `spec/004-room-composition` (it carries `intent/004-room-pieces`'s commits)

**Created**: 2026-10-22

**Status**: Draft, from the specify pass of 2026-10-22. Two needs-clarification markers remain, listed under Open Questions; no clarify session has run yet.

**Input**: [`intent.md`](intent.md) in this folder (moved from `intent/004-room-pieces.md`, accepted 2026-10-22, with the Author's answers of that day). Also read: the [constitution](../../.specify/memory/constitution.md) 1.0.1 and `CLAUDE.md`; the reviewed design page "Room Compositor" (2026-10-21, outside this repository; its "What the review changed" list is binding), the design synthesis behind it, and its three skeptics' reviews (constitution and privacy; spec 003's intake and the studio; runtime, accessibility, and testing); the studio checks of 2026-10-22 (the Langfuse name, the per-call cost, the chalkboard font, the photos and the guard) and the contract the studio's session was given that day; spec 001 as drafted on `spec/001-cloud-elevation` (its spec, plan, data model, and the relay-http and public-view contracts); spec 002 on the `feat/002-*` branches (its spec, data model, and the room-scene, room-conversation, room-events, resume-source, and web-serving contracts) and intent 002; spec 003 on the `feat/003-*` branches (its spec, data model, and the arrival-check, asset-record, and site-loading contracts) and intent 003; ADR 0010 (proposed) and the ADR index; and, from `main`, [intent 000](../../intent/000-ai-twin-portfolio.md), the [data-flow disclosure](../../docs/data-flow-disclosure.md), `config/routing.yaml`, `config/prices.yaml`, `config/budgets.yaml`, and `corpus/`.

Summary: the room stops being code. Each kind of piece is a catalog entry, each placement and each clickable piece is a line of one scene file, and a build step, the compositor, checks it all and writes one room bundle (the intent's "composite game feed") that the 3D room, the 2D room, and the text copy read. Studio models are plain: no behaviour and no words. Every readable word is drawn live from approved text. Two pieces show the system working: the laptop's charger cable is plugged in only while a fresh status answer says the local tier serves, and a clip-on neon arrow reading "Langfuse" counts the cost of the visitor's own conversation. The spec names its amendments to specs 001, 002, and 003.

## Source: The Author's Words

Quoted as the intent records them, typing included. The reading beside each is this spec's, to correct where it's wrong; it never replaces the words.

- **The proposed outcome**, 2026-10-21:

  > "Okay, I think let's start with the room asset pipeline and creating that, to make sure we have the art style, rendering, and overall look of what we are imagining. I'm thinking we can start like this, tell me what type of photos to take, and I want to explain the items that need to be rendered, and what type of interactivity or features im imagining there. We want my computer desk layout, with the langfuse observability dashboard about current cost visible, maybe illumininating hanging off the top of my monitor. THe monitor should have my what looks like my terminal running. The laptop next ot the monitor should be plugged in, only when we are running locally, and unplugged when it has failed over to the cloud. The bicycle hanging next to the work desk should be clickable and invite conversation about my hobbies from a corpus which i still have to fill out. The chalkboard next to me should have an outline of my resume and goals in life and how i think about problems (human centered, secure first, offline and cost effective). The two things on my work desk other than the computer equipment should be the signs "I am very busy" and "my dog thinks i'm cool". You will get photos of those two designs and these items separately, placed in a location where the pipeline should be able to render the final assets. I want to start there before we take photos of me to create the avatar as that means I will have to dress up and get ready and requires some manual time."

  > "We still want those pieces too (snowboard, bicycle, art window) including the new features. We want to be able to abstractly add those pieces to the studio pipeline than place them in the composite game feed. Think like a senior software architect, we will want to later modify and add pieces like these or move them around, so features should be modeled with that abstract perspective rather than one-off hard-coded"

  Reading: pieces are data and behaviours are code written once (FR-001 to FR-008). "You will get photos" reads, as the intent reads it, as photos going to the studio on the Author's machine, never to an agent (FR-024).
- **The answers of 2026-10-22**, which win wherever the reviewed design differs:
  1. "bicycle opens hobbies and travel adventures, and snowboarding opens the same but has a bias to talking more about winter hobbies first, pulling from the same hobby and travel adventure corpus." Reading: one topic, with a lead on the snowboard's selectable (FR-036).
  2. "Inked cel is fine. And you can pick the chalkboard font as recommended, i can change it later if we don't like it." Reading: inked cel, lit at run time; the chalk face is Claude's pick, changeable as data (FR-033).
  3. "We can write those into the corpus. And pointing out the chalkboard will cover more mission statements from a corpus and we can tlak about what seva is there inside that corups, but leave it off the chalkboard." Reading: the board shows corpus lines and never the Seva line; selecting it opens the mission topic (FR-033, FR-036).
  4. "The signs are our own creations." Reading: their graphics are the Author's; their lettering is still drawn live, from approved outlines of the Author's design (FR-032).
  5. "Have the terminal show similar to what we base in the photo, which will be half of a terminal claude session with our spec file open, and the other half being a claude desktop session." And: "the monitor is an ultrawide, with my laptop on a stand as the second monitor next to it". Reading: two scripted halves of approved text; the stand is its own piece (FR-031, FR-040).
  6. "A clip-on display that functions as a glowing arrow neon sign, think in that gta art style. "Langfuse" and then just has counter numbers for spend on this current call and spend on the session." Reading: the counters come from the visitor's own turns, never from Langfuse (FR-046 to FR-050).
  7. "Yes it can have cost unavailable for now." Reading: until the twin's conversation exists (FR-048).
  8. "enlarge them as stylized scale" Reading: the signs, the neon sign, the monitor's screen, and the laptop's cable (FR-051).
  9. "Okay, we can go with your proposal and see where it lands and increase the caps later, so make them configurable." Reading: the intent's starting caps, as configuration the Author owns (FR-053).
  10. "10-16) are okay?." Reading: the intent's list stands: spec 003 amended before the first hand-made file; the 2D room from the catalog's drawings; the monitor inside "Laptop and screen"; this spec names its amendments; Blender's working files in the workflows folder; the fit check in the lookdev page; the artwork still to confirm.
- **The privacy promise** (the intent's Constraints): "Data-local (Principle I): my photos stay on my machine." "Camera-roll backup stays paused until cleanup." "The photos go over a USB cable into the studio's photos folder, and never through chat, email, a cloud drive, or an assistant." "Spec 003's guard (T005) is applied before the first photo is staged. It covers every studio folder: ComfyUI's input, output, temp, and user folders, plus Blender's working files and autosaves." And the intent's reading, accepted with it: "The studio's agent never receives a photo (spec 003's FR-003). It sees only what those models make, after I've reviewed it: a style frame with no brand, text, screen content, or view beyond the fence, or a mesh stripped to geometry." (FR-022 to FR-026.)
- **The one exception** (the intent's Data-flow impact): "One exception, by my choice (2026-10-22): after the measurements were lost, I showed Claude one desk photo, stripped of its metadata, to estimate sizes." Reading: a single past event by the Author's choice, not a flow this system makes and not a precedent; sizes estimated from it are marked as estimates until measured (FR-002).
- **Ownership** (the intent's Constraints): "Say exactly what I owned (Principle VII). A model I made by hand must not carry an "AI-made" mark. The mark follows the record." Reading: the converse holds too: a step the studio's agent session scripted is a model step, and its record and mark say so (Amendment C1).
- **Langfuse** (the intent's Constraints): "Langfuse stays private (spec 001's FR-052). The room never reads it."
- **Honest AI** (the intent's Constraints): "Chalkboard lines come only from the corpus or my approved words. The twin never speaks an amount. A topic with no corpus says the twin can't talk about it yet."
- **Visitors' data** (the intent's Data-flow impact): "The room adds one same-origin read, spec 001's `GET /api/status`, for the laptop's tier. It's polled while the room is visible and not paused, and pausing the room stops it." "This intent extends those rows rather than adding an overlapping one." "The neon sign's counters come from the visitor's own conversation replies, with no extra request. The session's total stays in page memory and leaves with the page."

## User Scenarios & Testing *(mandatory)*

The users are visitors on desktop and phone; the Author, who shoots, measures, runs the studio, approves each file's hash, and writes the corpus; the studio, outside this repository; and the agents that edit the room's data and code. User Story 2, the degraded mode, comes before the live pieces' happy paths (User Stories 8 and 9), as Principle I requires.

### User Story 1 - Moving, Adding, or Retargeting a Piece Is a Data Edit (Priority: P1)

As the Author, I want each piece of my work area described once as data, and placed and wired in one scene file, so that moving, adding, removing, regrouping, retargeting, or rewording a piece never needs code.

**Why this priority**: The Author's words: "features should be modeled with that abstract perspective rather than one-off hard-coded". Today spec 002's room writes each piece's position, shape, and topic into code (the intent's Problem). Every later story builds on this, and it ships with today's stand-ins, so visitors see no change.

**Independent Test**: On a copy of the room's data, swap the bicycle and the snowboard, move the desk 0.4 m, add a new piece with a selectable and a topic, give a piece its own selectable after moving it clear of its neighbour, retarget the bicycle, reword a sign, and add a switch case. After each, `make check` passes with no source file changed, and the 3D room, the 2D room, the "In the room" list, the room's manifest, and the event list all follow.

**Acceptance Scenarios**:

1. **Given** the scene file, **When** a placement's mount, offset, or turn changes, **Then** the piece moves in 3D and 2D, everything mounted on it moves with it, and no source file changes.
2. **Given** a new catalog entry, placement, selectable, and topic, **When** the room builds, **Then** a labelled stand-in appears, can be selected from the scene and the list, says the twin can't talk about its topic yet, and calls no model; its work order is generated; the gateway accepts its event ID from its next start.
3. **Given** a selectable, **When** its topic changes, **Then** it opens the new topic, and its ID, event, and dashboard series stay the same.
4. **Given** the room's code, **When** the source scan runs, **Then** it finds no ID that only data defines; one added on purpose fails `make check`, naming the file and the ID.
5. **Given** today's stand-ins and today's layout as data, **When** a visitor enters the room, **Then** it looks and behaves as spec 002's room did.

---

### User Story 2 - The Room Tells No Lie, and Never Stops (Priority: P1)

As a visitor, I want the room to work whatever is live or not, and never to show me a state that isn't true: no plugged-in laptop unless the Author's machine is serving right now, and no cost figure that isn't real.

**Why this priority**: Principle I: "Every user-facing capability MUST define its degraded mode before its happy path." The intent: "Unknown means degraded, and the laptop is never plugged in on unknown", and "The room works with no live data." Until spec 001 and the twin's conversation exist, this is the room every visitor sees.

**Independent Test**: With the live source off, then with fault injection on the status request (failure, timeout, non-200, malformed body, 429), a paused room, a hidden page, failed model loads, missing room text, late fonts, no 3D, and reduced motion, every run ends with the room usable, the AI disclosure visible, the text copy matching the drawing, and the cable plugged in only on a fresh local answer.

**Acceptance Scenarios**:

1. **Given** the live source is off (before spec 001 serves the status), **When** a visitor enters, **Then** no status request is made, the laptop shows its not-live pose, the neon sign reads "cost unavailable", and the text copy says so.
2. **Given** the cable shows plugged in, **When** the next status request fails in any way, **Then** the laptop leaves the plugged pose at once.
3. **Given** the room is paused, or the page was hidden, **When** any time passes, **Then** the laptop is never in the plugged pose while paused, the text copy says "Paused at <time>", and on resume the freshness is checked before the next frame.
4. **Given** a piece's model fails to load, **When** the failure is detected, **Then** after one retry its stand-in stays, still selectable, with its live faces and state, and the failure is recorded.
5. **Given** a device without 3D, or a room that falls to 2D, **When** the room shows, **Then** the 2D room shows the same pieces, states, and words, with hit areas of at least 44 CSS pixels.
6. **Given** the local tier is off, the budget is spent, or the kill switch is `degraded` or unknown, **When** a visitor is in the room, **Then** the room renders fully and only the conversation degrades.

---

### User Story 3 - The Look Is Settled at the Room's Real Framing (Priority: P1)

As the Author, I want to see the vignette in each candidate look at the framing visitors actually get, on desktop and on the reference phone, and to check each studio file's fit before I approve its hash, so the look is settled once and nothing is made twice.

**Why this priority**: The intent's order puts lookdev second, right after the shoot: "Lookdev settles the look on a small vignette, at the room's real framing, on a reference phone." The review found that at the production framing the live surfaces are a few pixels tall, so the look must be judged there.

**Independent Test**: On a drafts image, open the lookdev page with stand-ins plus the studio's desk and one sign; switch looks and sample states; load a scrubbed candidate through the file picker; read its fit findings, frame times, texture memory, and smallest glyph height at the production framing; confirm a release build has no lookdev page.

**Acceptance Scenarios**:

1. **Given** a drafts image, **When** the Author opens the lookdev page, **Then** it shows the production scene at the production framing on the reference desktop's and the reference phone's stage sizes, with the desk close-up as a secondary view.
2. **Given** a candidate file picked from disk, **When** it loads, **Then** it stays in memory only, swaps in for its piece, and the page shows the same fit findings the compositor would report, or "not scrubbed" for a file without spec 003's mark.
3. **Given** a 2-minute run on the reference phone, **When** it ends, **Then** the page shows the median frame rate, the share of frames over 33 ms, the settled quality level, draw calls, and texture memory.
4. **Given** a release build, **When** it is inspected, **Then** it has no lookdev page, no fixture, and no draft text.
5. **Given** the look is chosen, **When** it is recorded in ADR 0010, **Then** the work orders regenerate from it before the remaining pieces are modeled.

---

### User Story 4 - Studio Pieces Arrive as Plain Models, and the Photos Stay Home (Priority: P2)

As the Author, I want each studio model to come in as a plain file at the catalog's size and origin, through spec 003's intake, with a record and a mark that say exactly who made it, while my photos never leave my machine.

**Why this priority**: The intent: "The studio's models carry no behaviour", "my photos stay on my machine", and "A model I made by hand must not carry an "AI-made" mark." Git keeps everything (ADR 0013), so the controls come before the first file.

**Independent Test**: Run the compositor's fit check and spec 003's arrival check over a clean hand-made desk, a clean sign with a `design` source, and variants: a live face missing or off its plane, a misplaced origin, a light or an animation inside, a dotted node name, readable text in a texture, a wrong mark for its record. Only the clean files pass. Read a studio folder from an agent session: refused.

**Acceptance Scenarios**:

1. **Given** a model at the catalog's size, origin, and live faces, **When** it is checked, **Then** it passes, and once approved and set it replaces its stand-in with no other edit.
2. **Given** a model whose live face, bounds, names, extensions, or contents break the plain-model rules, **When** it is checked, **Then** the compositor refuses it, naming the rule.
3. **Given** a model made entirely by hand, **When** it arrives, **Then** its mark is the human-made value, and a mark that disagrees with its record is refused; a step the studio's agent session scripted is recorded as a model step, with its hosted service.
4. **Given** the studio's folders, ComfyUI's input, output, temp, and user folders, and Blender's working files and autosaves, **When** an agent session tries to read any of them, **Then** the read is refused, and the forbidden-action matrix proves it, before the first photo is staged.
5. **Given** the photo guide, **When** the Author follows it, **Then** camera-roll backup is paused, the photos go over USB into the studio's photos folder, and they are deleted from the phone once the studio's copy checks out.

---

### User Story 5 - Every Readable Word Is Drawn Live From Approved Text (Priority: P2)

As a visitor, I want to read the monitor's two sessions, the chalkboard, and the signs, and as a screen-reader user to hear the same words, knowing each word is one the Author approved.

**Why this priority**: The intent: "Readable words are drawn live", "each with a text copy for screen readers"; spec 003's FR-037 keeps words out of studio files. It needs the human-only content check to cover short strings first.

**Independent Test**: Build with approved and draft room text; check that only approved strings, reviewed UI words, and live values are drawn; that the text copy equals the drawn words; that a draft is absent from a release build; and that the Seva line never appears on the board.

**Acceptance Scenarios**:

1. **Given** approved room text, **When** the room renders, **Then** the ultrawide monitor shows its two scripted halves, the signs their lettering, and the chalkboard its lines, and the text copy lists the same words.
2. **Given** a room-text file that isn't approved on `main`, **When** a release build runs, **Then** its face stays plain and its words appear nowhere in the built site.
3. **Given** a chalkboard line whose corpus words don't exist yet, **When** the room renders, **Then** the line doesn't render.
4. **Given** the corpus's Seva line, **When** the chalkboard renders, **Then** it isn't on the board.
5. **Given** a string under 24 characters that isn't approved, **When** the gate runs, **Then** it fails.

---

### User Story 6 - Selecting a Piece Opens Its Topic (Priority: P2)

As a visitor, I want to click the bicycle, the snowboard, the chalkboard, or the laptop and screen and talk with the twin about what that piece stands for.

**Why this priority**: The Author's answers 1 and 3 set the topics. The conversations themselves need the twin's conversation core and the Author's corpus, so until then each topic says the twin can't talk about it yet, which is this story's floor.

**Independent Test**: Select each selectable with every topic unready: each shows the fixed message with its own topic phrase and calls nothing. Then, with a topic made ready by the twin's spec, select its pieces: the turn carries the selectable's ID, and the snowboard's opening leads with winter hobbies.

**Acceptance Scenarios**:

1. **Given** the bicycle or the snowboard, **When** it is selected and the topic is ready, **Then** the twin talks about hobbies and travel adventures from that topic's corpus; from the snowboard, it leads with winter hobbies.
2. **Given** the chalkboard, **When** it is selected and the topic is ready, **Then** the twin talks about the Author's mission, and can talk about Seva from the corpus.
3. **Given** the laptop, its stand, or the monitor, **When** one is selected, **Then** "Laptop and screen" opens work projects, as in spec 002.
4. **Given** a topic with no corpus yet, **When** its piece is selected, **Then** the fixed message says the twin can't talk about it yet, and no model is called.
5. **Given** a visitor asks the twin what the neon sign says, what the dog thinks, or where the window looks out, **When** the twin answers, **Then** it states no amount, speaks only from the corpus, and locates nothing.

---

### User Story 7 - Every Visitor Reaches Every Piece (Priority: P2)

As a visitor using a keyboard, a screen reader, or a 320-pixel phone, I want every selectable piece, the room's words, and its live state within reach, and a way to stop the room's motion.

**Why this priority**: Spec 002's FR-043 to FR-047 and WCAG 2.2 AA apply to every new piece; the review found the 2D hit areas could shrink below 44 pixels and that moving and updating content needs a pause control (WCAG 2.2.2).

**Independent Test**: A keyboard-only visit and a screen-reader visit reach every selectable, "Pause the room", and "Around the room"; an automated check reports 0 violations; every hit area measures at least 44 by 44 CSS pixels at the smallest supported stage, in 3D and 2D; the talk button stays on a 320×568 screen.

**Acceptance Scenarios**:

1. **Given** the "In the room" list, **When** a keyboard user tabs through it, **Then** every selectable is a button with its name and topic, in the scene's order, with visible focus.
2. **Given** "Around the room", **When** a screen reader reads it, **Then** it hears each drawn surface's words, the laptop's state sentence, and the neon sign's figures in words, and polling never announces anything.
3. **Given** "Pause the room", **When** it is pressed, **Then** the terminal's typing, the glows, idle motion, and live updates stop until it is pressed again.
4. **Given** a phone in portrait, 320 CSS pixels wide, **When** the room shows, **Then** the twin, the desk, every selectable's pieces, the text box, and the talk button are on screen without scrolling.

---

### User Story 8 - The Laptop Shows Whether the Author's Machine Is Serving (Priority: P3)

As a visitor, I want to see at a glance whether the twin's answers come from the Author's own machine: the laptop's charger plugged in while the local tier serves, unplugged after failover to the cloud.

**Why this priority**: The intent's Problem: "Nothing in the room shows the system working". It needs spec 001's public `GET /api/status`, so it switches on with spec 001, after User Story 2's degraded behaviour.

**Independent Test**: With the dev stack's relay, drive `GET /api/status` through every state (local up, local down, the kill switch tripped, each degraded cause, unknown) and every failure; check the pose and sentence for each against the table of FR-041, the request cadence, and that pausing stops polling.

**Acceptance Scenarios**:

1. **Given** a fresh status answer with `state` "normal", `cause_now` null, and `local_tier` "up", **When** it arrives, **Then** the charger is plugged in, and the text copy says the Author's machine is serving.
2. **Given** `local_tier` "down" with `state` "normal" and `cause_now` null, **When** it arrives, **Then** the charger is unplugged, and the text copy says the cloud fallback is serving.
3. **Given** the last valid answer said local, **When** 35 seconds pass with no new valid answer, **Then** the charger is no longer plugged in.
4. **Given** the room is visible and not paused, **When** a minute passes, **Then** at most two status requests were made, same-origin, with nothing stored.
5. **Given** the change that switches the live status on, **When** it is reviewed, **Then** the data-flow disclosure's status row already describes the room's polling.

---

### User Story 9 - The Neon Sign Counts What My Conversation Costs (Priority: P3)

As a visitor, I want the clip-on neon arrow on the monitor to show what my last turn cost and what my visit has cost so far, so the project's cost discipline is visible, not claimed.

**Why this priority**: The Author's answer 6. It needs the twin's conversation core to return each turn's cost; until then the sign reads "cost unavailable" (answer 7).

**Independent Test**: Against a stub turn endpoint, send local, paid, degraded, failed, and network-failed turns; check each counter's reading, that the visit total is the exact integer sum of the replies' costs, that the sign makes no request, and that nothing is stored.

**Acceptance Scenarios**:

1. **Given** a local answer, **When** its reply arrives with `cost_micro_usd` 0, **Then** "this call" reads "local · $0".
2. **Given** a paid answer, **When** its reply arrives, **Then** "this call" shows its cost to six decimals marked "est.", and "this visit" adds it.
3. **Given** a degraded or failed turn, **When** its reply carries no cost, **Then** "this call" reads "cost unavailable" and "this visit" is marked "at least".
4. **Given** a reload, **When** the room returns, **Then** "this visit" starts again; nothing was stored or sent.
5. **Given** a visitor asks the twin "what did that cost?", **When** the twin answers, **Then** it states no amount.

---

### Edge Cases

- **A status answer arrives late, after the room was paused:** it is discarded; paused wins until resume, when freshness is checked first.
- **The relay answers 429** (visitors behind one address share the status bucket of 30 a minute): unknown, and the next poll waits for `Retry-After`.
- **The kill switch trips while the local tier is up:** `cause_now` is set, so the charger isn't plugged in (FR-041).
- **The Author's own local-tier room**, whose `edge` answers 404 under `/api/` (spec 002's web-serving contract): every poll fails, so it shows unknown, never plugged in. No local status endpoint is added (Assumptions).
- **Two tabs:** two visits, two visit totals, two pollers; neither knows the other.
- **A selectable regroup that puts two adjacent pieces' pick areas on top of each other:** the build fails; the regroup needs a move too (FR-064).
- **A model whose live face is curved or bowed:** refused; a curved surface would need a new renderer, which is code.
- **A paid turn on dev,** where the fallback is synthetic test spend: the sign marks it "test" (FR-049).
- **The dog sign:** the corpus has no dog yet, so the twin says it doesn't know until the Author writes it.
- **A design file that embeds a photograph:** it counts as a photo, and stays out of the studio's agent session.
- **A photo-derived detail in a texture** (a sticker, a serial plate, a reflection): refused at review (FR-022).

## Requirements *(mandatory)*

### Functional Requirements

Terms used below. **Piece**: one kind of physical thing, described by a catalog entry. **Placement**: one placed instance of a piece in the scene file. **Selectable**: what a visitor clicks, with its member placements and a topic or an action. **Live face**: a flat area of a piece where the room draws (a screen, the slate, a sign's lettering area, the neon sign's word and counter panels). **Room text**: the words the room draws, in files approved by hash. **UI words**: the room's fixed interface words, reviewed like spec 002's `messages.yaml`. **Signal**: a read-only value the room displays: the tier, or a turn's cost. **The compositor**: the build step that checks the room's data and writes the room bundle. **The text copy**: the "Around the room" section, the drawn words and states as page text. **The production framing**: the camera spec 002's FR-047 sets, at the reference phone's and the reference desktop's stage sizes. **The reference phone**: ADR 0010's (a Galaxy A54-class phone). **A drafts build**: spec 002's `-drafts` images of dev and dev-cpu; **a release build**: any other. **The guard**: spec 003's task T005, as amended here.

**The room as data**

- **FR-001**: THE ROOM'S CONTENT SHALL be data, in these kinds: a piece catalog, one scene file (placements with their bindings, and selectables), topics, room text, UI words, looks, and fixtures. A change to any of them SHALL be reviewable on its own.
- **FR-002**: EACH CATALOG ENTRY SHALL hold the piece's measured size, its stylized scale where FR-051 applies, its origin as a physical point from the dimension sheet with its expected bounds around that point, its named anchors, its live faces (position, size, facing, and pixel size), its glows, the signal value it claims if any, its stand-in shape, its 2D drawing, its budget, and its studio work order. WHERE a size came from an estimate rather than a measurement (the exception of 2026-10-22 among them), THE ENTRY SHALL mark it estimated, and its work order SHALL ask for the measurement.
- **FR-003**: EACH PLACEMENT SHALL mount on a named anchor of another placement, walls and floor included, with an offset and a turn, so that WHEN a parent moves, everything mounted on it moves with it. Only the room's shell SHALL have no mount.
- **FR-004**: EACH SELECTABLE SHALL have a permanent ID, a visible name, its member placements, and a topic or an action. Its ID SHALL be the usage event's ID and the conversation's feature. An ID SHALL never be reused for a different thing, and WHEN a selectable is removed, its ID SHALL leave the event list while its dashboard history stays.
- **FR-005**: THE ROOM'S BEHAVIOUR KINDS SHALL be a closed list in code: mount, frame, live face, glow, switch, and selectable (talk or open the resume); the renderers terminal, neon sign, chalk, and sign; the signals tier and turn cost; and the look methods. IF a data file holds an expression, a script, or a rule language, THEN THE COMPOSITOR SHALL refuse it. A new kind SHALL be code, through the lifecycle.
- **FR-006**: WHEN a piece is moved, added, removed, regrouped, retargeted, or reworded, or a switch gains a case for a value its signal already has, THE CHANGE SHALL be data only. A test SHALL make each of these changes on a copy of the data and pass with no source file changed.
- **FR-007**: IF the room's code holds an ID that only data defines (a piece, placement, selectable, or topic), THEN A SOURCE SCAN SHALL fail `make check`, naming the file and the ID.
- **FR-008**: THE ROOM SHALL keep spec 002's hand-off and its paper as code, taking only their anchors (the twin's hand and the visitor's) from data.

**The compositor and the bundle**

- **FR-009**: WHEN the room builds, THE COMPOSITOR SHALL check the data against itself and the models (shape, references, mounts, framing at spec 002's six aspects, selectable spacing, switches and claims, fit, budgets, text, the live configuration, and that every surface and switch case has its words and 2D drawing), and SHALL refuse with `<rule> <file>:<path>: <reason>`, never printing a private-denylist phrase.
- **FR-010**: THE COMPOSITOR SHALL write one deterministic room bundle: two builds of the same commit and policy SHALL be byte-identical.
- **FR-011**: THE BUNDLE SHALL ship in two parts: an index in the page's entry chunk (the selectables, their names and topic phrases, the 2D drawing, the text-copy wiring, and the live configuration), and a 3D part only the lazy 3D chunk loads. The 3D room, the 2D room, and the text copy SHALL read the bundle, and the 2D room and the text copy SHALL never wait for the 3D chunk.
- **FR-012**: THE BUILT SITE SHALL hold no studio note, work order, measurement note, Author's-words field, or pending line from the room's data. A test SHALL check the built site for each.
- **FR-013**: WHEN `make up` builds the room and one piece's model fails its fit, THE BUILD SHALL warn and use that piece's stand-in, so `make up` always works, and the room's manifest SHALL say stand-ins are in use. `make test` and `make check` SHALL fail on the same finding, and SHALL run the freshness checks of generated committed files, which the image build doesn't.
- **FR-014**: THE COMPOSITOR SHALL generate each piece's work order from its catalog entry and the chosen look, committed, and `make test` SHALL fail when one is stale. THE REVIEWER'S PASS SHALL read the work orders, the catalog's studio notes, and the photo guide as it reads room text: they locate nothing and name no third party's marks.

**Plain studio models** (they agree with the studio's contract of 2026-10-22; Assumptions name where this spec is stricter)

- **FR-015**: A ROOM MODEL SHALL be binary glTF 2.0 with its textures embedded as PNG, Huffman-coded RGB JPEG, or still WebP; in metres, +Y up and the front facing +Z; at the catalog's size times its stylized scale; with its origin at the dimension sheet's origin point; with no light, camera, animation, shape key, skin, extras, custom property, compression, or GPU instancing; and with extensions only from `KHR_materials_*`, `KHR_texture_transform`, `KHR_mesh_quantization`, and `EXT_texture_webp`. IF a model uses `KHR_materials_variants`, `KHR_materials_transmission`, or `KHR_materials_volume`, THEN THE COMPOSITOR SHALL refuse it.
- **FR-016**: A ROOM MODEL SHALL carry no behaviour and no readable text: no word, digit, logo, trademark, key legend, label, regulatory print, tyre-wall text, sticker, screen content, or third-party art (spec 003 FR-037). The Author's own non-word sign graphics MAY stay in a texture; the Author's lettering SHALL NOT (answer 4).
- **FR-017**: EACH LIVE FACE SHALL be its own object, named for its role: one quad in one plain colour, sized from the dimension sheet, with texture coordinates filling 0 to 1 in reading order. IF a catalog live face has no matching quad, or the quad misses the catalog's position by more than 1 mm or its facing by more than 1°, THEN THE COMPOSITOR SHALL refuse the model and report the measured plane.
- **FR-018**: THE COMPOSITOR SHALL refuse an object, mesh, material, or image name that isn't lowercase words joined by hyphens, or that holds a dot, a space, a slash, a numeric suffix, a file name, a path, or a camera's file stem. This is at least as strict as spec 003's M8.
- **FR-019**: THE COMPOSITOR SHALL compare each model's bounds with its catalog entry's expected bounds at both corners, within the larger of 2 cm and 3%, and SHALL refuse a misfit. ONCE a model is set, framing, footprints, and hit areas SHALL use its measured bounds.
- **FR-020**: A STATE SHALL be a separate file or a separate placement, never an animation. THE CHARGER SHALL be a plug and a short lead, which the room places for each state, and THE ROOM SHALL draw the rest of the cable at run time between the laptop's port and the desk's back edge, so moving the laptop, its stand, or the desk needs no re-export.
- **FR-021**: THE NEON SIGN'S MODEL SHALL be its arrow tube, backing, and clip, with live faces for its word panel and its two counter panels, and no tube shaped like a letter or a digit. The room lights it and draws its word and counters.
- **FR-022**: TEXTURES SHALL be painted, procedural, or made by an allowed model from a recorded prompt, in sRGB, 8 bits a channel, at power-of-two sizes; never projected, traced, or cropped from a photo. Materials SHALL carry flat base colours with no baked light, shadow, ambient occlusion, glow, or outline geometry, as the chosen look needs.
- **FR-023**: ROOM MODELS SHALL enter the repository only through spec 003's intake: scrubbed, recorded, under the media license, and approved by the Author by hash with the room confirmations. THE AUTHOR SHALL approve the hash of the scrubbed file the lookdev page showed (FR-068).

**The photos and the studio**

- **FR-024**: THE STUDIO'S AGENT SHALL never receive a photo, or a crop, mask, cutout, or image-to-3D output made from one. It SHALL work only from typed dimension sheets and descriptions, the Author's own designs, outputs the Author has reviewed (a style frame with no brand, text, screen content, or view beyond the fence, or a mesh stripped to geometry), scrubbed textures, and renders of its own models. Photos SHALL serve only as the Author's reference and as inputs to local models on the Author's GPU, each model's license allowing what it makes to be published (spec 003 FR-013).
- **FR-025**: WHEN the first room photo is staged on the Author's machine, THE GUARD SHALL already deny agent sessions every studio folder, in the file tools and in the sandbox: the photos, the studio's outputs, its workflows (Blender's working files and autosaves among them), the blinding key, and ComfyUI's input, output, temp, and user folders placed inside them. The forbidden-action matrix SHALL prove each.
- **FR-026**: THE PHOTO GUIDE SHALL tell the Author, before the first shot, to pause camera-roll backup and gallery sync until cleanup, turn location off, move the photos over a USB cable straight into the studio's photos folder, never send one through chat, email, a cloud drive, or an assistant, and delete them from the phone and its trash once the studio's copy checks out.
- **FR-027**: WHEN a room file's record names the studio's agent session as a step's hosted service, THE DATA-FLOW DISCLOSURE SHALL already hold that service's row (spec 003 FR-040c), saying what the session saw and that it saw no photo.
- **FR-028**: THE WINDOW'S VIEW SHALL be a generic fence and a generic tree, with no building, skyline, landmark, sign, or street. THE ARTWORK SHALL be the studio's original art, or absent. THE SNOWBOARD'S GRAPHIC SHALL be original, or a plain finish.

**Readable words**

- **FR-029**: THE ROOM SHALL draw every readable word at run time, from three sources only: room text approved by hash on `main`, UI words, and live values (the tier's sentence and the visitor's own turn costs). No word SHALL come from a model file.
- **FR-030**: ROOM TEXT SHALL be one file per drawn block, with every displayed string under a displayed-value key. Agents draft it, and the Author approves its SHA-256 on `main` with the kind `room-text` (Amendment B9). A draft SHALL show only in a drafts build, marked as a draft; in a release build its face SHALL stay plain. THE HUMAN-ONLY CONTENT CHECK SHALL verify every published room-text string against an approved file's displayed values, at any length, and room text SHALL ship only once that check is on `main`.
- **FR-031**: THE ULTRAWIDE MONITOR'S SCREEN SHALL show two scripted halves, drawn live from approved room text: a Claude Code session in a terminal with this spec's file open, and a Claude desktop session (answer 5). It SHALL never be a live shell or a log, and SHALL show no secret, local or absolute path, host name, user name, email or IP address, URL other than the site's, or amount. Product names SHALL appear as plain text, with no logo. It SHALL type once, in at most 5 seconds, then hold, and its text copy SHALL say it is a scripted illustration.
- **FR-032**: EACH DESK SIGN'S LETTERING SHALL be drawn live from approved vector outlines traced from the Author's own design, with its words exactly as the Author wrote them, "I am very busy" and "my dog thinks i'm cool", and its file SHALL point at those words in the intent. The design files go to the studio, never into this repository as images.
- **FR-033**: THE CHALKBOARD SHALL show, drawn live in chalk, the resume's outline (the published resume's section titles, withheld whenever the resume is), mission statements, and how the Author thinks about problems, each line from the corpus or the Author's approved words, and SHALL never show the Seva line (answer 3). A line whose corpus words don't exist yet SHALL stay pending and never render. THE CHALK FACE SHALL be a self-hosted open-licensed face, Patrick Hand by default (answer 2; Confirmation 7), changed as data among vendored faces.
- **FR-034**: EVERY DRAWN WORD SHALL also be in the text copy, taken from the renderer's own word list, so the 3D room, the 2D room, and the text copy can't differ.
- **FR-035**: UI WORDS SHALL pass the corpus checks for bare numbers, ownership verbs, and forbidden phrases (spec 002's C6, C8, and C9). THE TIER'S SENTENCES SHALL speak about the machine ("The Author's machine is serving", "The cloud fallback is serving", "Status unknown"), never claim that the twin is answering.

**Topics and selecting**

- **FR-036**: SELECTABLES SHALL open topics as data. The defaults:
  - the bicycle opens hobbies and travel adventures;
  - the snowboard opens the same topic, with a lead of winter hobbies first, one line of data on its selectable (answer 1);
  - the chalkboard opens the Author's mission (answer 3);
  - "Laptop and screen", with the ID `laptop` and as members the laptop, its stand, and the ultrawide monitor, opens work projects (answer 10).

  EACH TOPIC SHALL name the Author's words it came from and its corpus files.
- **FR-037**: WHILE a topic has no corpus material, or the twin's spec hasn't marked it ready, WHEN its piece is selected, THE ROOM SHALL show the fixed message that the twin can't talk about it yet, filled with the topic's own phrase, and SHALL call no model (spec 002 FR-023).
- **FR-038**: A CONVERSATION TURN SHALL carry only the selectable's ID, the visitor's path, and the turns, as spec 002's contract has it. THE BUILD SHALL publish the mapping from each selectable to its topic, corpus files, and lead as generated configuration for the twin's spec. THE TWIN SHALL never receive a live value, a drawn surface, or a cost.
- **FR-039**: THE TWIN SHALL know the signs, the chalkboard, the neon sign, and the window only through the corpus: it states no amount, makes neither a sign nor the board speak for the Author, and locates nothing. The red-team cases of Amendment B4 SHALL cover each.

**The laptop and its charger: the tier, shown honestly**

- **FR-040**: THE LAPTOP SHALL sit on its own stand beside the ultrawide monitor, as its second screen. THE STAND SHALL be its own piece, and the laptop, its screen, and the charger's plug SHALL mount on it, so moving the stand carries them (answer 5).
- **FR-041**: THE TIER SIGNAL SHALL be reduced, by a pure function, from the fields of spec 001's `GET /api/status` (`local_tier`, `state`, `cause_now`; `tunnel`, `release`, and `time` are ignored):

  | Condition | Tier |
  |---|---|
  | the scene's live source is off | not-live |
  | the room is paused | paused, which counts as unknown (the review: "pausing the room counts as unknown") |
  | no answer yet; a failed request, one over 5 s, a status other than 200, or a body without the three fields | unknown |
  | `state` is `"unknown"` | unknown |
  | `cause_now` is set (a `"degraded"` state sets it to `kill_switch_tripped`) | resting, budget, or unavailable, by spec 002's cause classes; an unknown cause reads unavailable |
  | `state` `"normal"`, `cause_now` null, `local_tier` `"up"` | local |
  | `state` `"normal"`, `cause_now` null, `local_tier` `"down"` | cloud |
  | anything else | unknown |

- **FR-042**: THE CHARGER SHALL show plugged in only WHILE the latest status request returned a valid answer that reduces to local and was received less than the freshness window ago: 35 seconds by default, configuration, and longer than the poll interval. WHEN a status request fails in any way, THE TIER SHALL become unknown at once. WHEN the room resumes, or the page becomes visible again, THE ROOM SHALL check the last answer's age against the clock before the next frame, then refresh once.
- **FR-043**: THE LAPTOP'S SWITCH SHALL have a case for every tier value, and THE TEXT COPY a sentence for each. THE COMPOSITOR SHALL refuse a scene in which any value but local can show the plugged pose, or in which unknown, paused, or not-live can show the cloud pose, the unplugged pose of a failover. [NEEDS CLARIFICATION: Which pose do the degraded classes (resting, budget, unavailable) show, and do unknown, paused, and not-live share one pose? Recommended: one "not answering" pose, the plug resting on the desk, for all six, told apart by their sentences; the alternative keeps the unplugged pose for the degraded classes whenever `local_tier` is "down". Open Questions, Q2.]
- **FR-044**: WHILE the visitor has entered the room, the page is visible, the room isn't paused, and the live source is on, THE ROOM SHALL request `GET /api/status` from its own origin every 30 seconds by default (configuration), with no query string, extra header, or credentials, uncached, and with a 5-second timeout. After a failure it SHALL double its wait, up to 120 seconds, and after a 429 wait at least its `Retry-After`. It SHALL store nothing, and SHALL make no request before the visitor enters the room.
- **FR-045**: WHILE the live source is off, THE ROOM SHALL make no status request and SHALL show the not-live state. THE LIVE SOURCE SHALL be switched on only in the change that serves `GET /api/status` on the room's origin (spec 001), together with the disclosure change of FR-074.

**The neon sign: the visitor's own cost**

- **FR-046**: THE NEON SIGN SHALL be a clip-on neon arrow on the ultrawide monitor's top edge, GTA-style in look only, reading "Langfuse" in the room's own neon lettering: no Langfuse logo, wordmark, or colours, no "by ClickHouse", and nothing from Rockstar or GTA (intent 000: "Inspired-by only — no Rockstar assets, logos, typefaces, or character likenesses; everything is original").
- **FR-047**: THE SIGN'S COUNTERS SHALL read "this call" and "this visit", fed only by the `cost_micro_usd` of each conversation turn's reply (Amendment B6). THE VISIT'S TOTAL SHALL be summed as integer micro-dollars in page memory, never stored or sent, and SHALL start again on reload.
- **FR-048**: THE SIGN SHALL show "local · $0" for a call that cost 0; a paid call's cost to six decimals, marked "est."; "no call yet" before a visit's first turn; and, WHEN a turn's reply carries no cost (degraded, failed, or lost), "cost unavailable" for that call, with "this visit" marked "at least". WHILE the twin's conversation core doesn't exist, both counters SHALL read "cost unavailable" (answer 7).
- **FR-049**: IN A DRAFTS BUILD, THE SIGN SHALL mark its figures "test", since dev's fallback spends synthetic money, and any figure a fixture feeds SHALL read "Sample". THE SIGN SHALL carry a small line saying the gateway meters the figures, and THE SITE a line saying the project isn't affiliated with or endorsed by Langfuse or its owner (Confirmation 1).
- **FR-050**: THE SIGN SHALL make no request of its own and SHALL never read Langfuse (spec 001 FR-052). THE TWIN SHALL never state an amount (spec 002 FR-049), and THE SIGN'S TEXT COPY SHALL stay apart from the twin's announced words and SHALL never be voiced.

**Scale, legibility, and phones**

- **FR-051**: THE READABLE PROPS SHALL be enlarged by a stylized scale per piece, in the catalog: the signs, the neon sign, the monitor's screen, and the laptop's cable (answer 8). The studio models them at that scale, and the drawn cable run takes it too.
- **FR-052**: THE COMPOSITOR SHALL project each live face at the production framing on both reference stages and report its smallest glyph height. A face under the legibility floor the plan sets SHALL be marked as atmosphere, with its content capped, and its words SHALL be carried by the text copy.
- **FR-053**: THE CAPS SHALL be configuration the Author owns, read from `main` (Amendment C7), starting at the intent's figures: per piece, at most 2,500,000 bytes at gzip level 9, 40,000 triangles, and 1024-pixel textures on the small props the catalog names; for the whole scene on a phone, at most 96 MB of texture memory (width × height × 4 × 4/3 per texture, models, image cards, avatars, and live-face canvases together); and about 12,000,000 bytes for the room's share of spec 003's 25 MB first visit. THE COMPOSITOR SHALL refuse a catalog budget above them, and agents SHALL never raise one.
- **FR-054**: EACH LIVE FACE'S CANVAS SHALL be sized to that face's largest on-screen size at the reference stages times the device's pixel ratio, no larger.
- **FR-055**: THE QUALITY CONTROLLER SHALL never step down because pieces are loading: a piece's materials and textures SHALL be prepared before it swaps in, at most one piece SHALL swap in per frame, and the frames a swap takes SHALL not count toward a step-down.
- **FR-056**: THE ROOM SHALL fetch studio models only on a device above ADR 0010's capability floor, after the twin and the chosen visitor's avatar (spec 003's order), framed selectables first, with a timeout that grows with each file's size and one retry. THE REDUCED QUALITY TIER SHALL also decode lighter textures (spec 003 FR-024).

**Degraded mode** (defined before the live pieces' happy paths, Principle I)

- **FR-057**: IF a piece's model fails to load (blocked, timed out, failing its integrity check, or failing to decode), THEN after one retry THE PIECE SHALL keep its stand-in, still selectable, with its live faces and its state, and THE ROOM SHALL record spec 003's asset event.
- **FR-058**: IF the device can't render 3D, or the room falls to 2D, THEN THE 2D ROOM SHALL draw the composed scene from the index: each placement's catalog drawing, each switch's current case, the live faces as still images redrawn only when a value changes, and the selectables' hit areas. It SHALL show the same pieces, states, and words as the 3D room.
- **FR-059**: WHILE the visitor's device asks for reduced motion, read throughout the visit, THE ROOM SHALL show final frames, with no typing, glow motion, or idle sway, and SHALL still apply state changes at once.
- **FR-060**: THE ROOM SHALL offer a visible "Pause the room" toggle. WHILE it is on, THE ROOM SHALL stop the terminal's typing, the glows' motion, idle motion, and the status polling; THE TIER SHALL read paused; and THE TEXT COPY SHALL say "Paused at <time>" (WCAG 2.2's 2.2.2, Pause, Stop, Hide).
- **FR-061**: IF approved room text fails to load or is withheld, THEN its faces SHALL stay plain and their text-copy entries SHALL be left out. IF a face's font is late, THEN THE ROOM SHALL draw with the fallback face after 2 seconds and redraw when the font arrives.
- **FR-062**: WHILE the local tier is off, the budget is spent, or the kill switch is `degraded` or unknown, THE ROOM SHALL render in full, and only the conversation SHALL degrade (spec 002 FR-038; spec 003 FR-025). THE ROOM SHALL never leave a visitor at a blank or frozen scene, and THE AI DISCLOSURE SHALL stay visible in every mode (spec 003 FR-026).

**Accessibility**

- **FR-063**: THE "IN THE ROOM" LIST SHALL hold each selectable as a button with its name and its topic or action, in the scene's order. THE TEXT COPY SHALL hold each drawn surface's words, the laptop's state sentence, and the neon sign's figures in words, and SHALL update in place without announcing a poll.
- **FR-064**: EVERY HIT AREA, in 3D and 2D, SHALL be at least 44 by 44 CSS pixels on screen at every supported stage size, down to the smallest the layout allows, and each selectable SHALL keep an exclusive pick area of that size, with pointer picks going to the nearest selectable. THE COMPOSITOR SHALL refuse a scene that breaks this, so a regroup of adjacent pieces needs a move too.
- **FR-065**: EVERY SELECTABLE AND CONTROL, "Pause the room" included, SHALL be reachable and operable by keyboard alone, in a logical order, with visible focus; colour SHALL never carry meaning alone; the room SHALL meet WCAG 2.2 level AA; and on a 320 × 568 screen the new controls SHALL keep the text box and the talk button on screen.

**The lookdev page**

- **FR-066**: THE LOOKDEV PAGE AND THE FIXTURES SHALL be built only into drafts builds, never into prod's image. THE RELEASE STEP SHALL refuse a bundle that holds fixtures, the lookdev page, or draft text (Amendment A5).
- **FR-067**: THE LOOKDEV PAGE SHALL run the production scene and runtime at the production framing on both reference stages, with the real quality controller, the desk close-up as a secondary view, and controls for the look, the sample state, quality, and pause. Its file picker SHALL load a candidate model into memory only, never into the repository, and the page SHALL show its fit findings, the frame time's p50 and p95, draw calls, triangles, texture memory, and the smallest glyph height.
- **FR-068**: THE LOOKDEV PAGE'S FIT CHECK SHALL be the compositor's own code. It SHALL report "not scrubbed" for a file without spec 003's mark, and THE AUTHOR SHALL approve only the hash of the scrubbed file the page showed.
- **FR-069**: WHEN the Author measures the look on the reference phone, THE PHONE SHALL reach the lookdev page by the route the Author chooses, and that route SHALL carry only scrubbed files and be disclosed before its first use. [NEEDS CLARIFICATION: How does the reference phone reach the lookdev page, which the dev stack serves on its loopback port only? Recommended: a USB forward the Author starts (`adb reverse`), carrying scrubbed files only and removed after each session, disclosed as a development-time row, with ADR 0021's "no inbound from outside the host" read as allowing a USB-attached device the Author owns; the alternative is desktop-only lookdev now, with the phone judged later on a release build. Open Questions, Q1.]
- **FR-070**: THE FIRST LOOKDEV RUN SHALL use the intent's vignette: the desk, the monitor and its terminal, the neon sign's glow, the laptop's cable states, one sign, a corner of the chalkboard, and a bicycle wheel, on stand-ins plus the studio's desk and one sign, made with flat colours and no baked shading. THE LOOK SHALL be recorded in ADR 0010, and the work orders regenerated from it, before the remaining pieces are modeled.

**Telemetry and the dashboard**

- **FR-071**: WHEN a selectable is chosen, THE ROOM SHALL send spec 002's `object_selected` event with its ID, with no new kind and no payload. WHEN a studio model loads, retries, fails, or is skipped, THE ROOM SHALL send spec 003's asset event, keyed by its record's file.
- **FR-072**: THE RELAY'S TELEMETRY SHALL count status requests and their 429s apart from hello's, report the tier class the relay's status would reduce to now, and keep non-error status requests out of traces (Amendment A2). THE DASHBOARD SHALL gain a "Room live state" panel with status requests a minute, their 429s, and the share of time in each class, its description saying that the room's polls and the `/status/` page's can't be told apart.
- **FR-073**: WHEN a branch changes the room's data or models, ITS MERGE-REQUEST NOTE SHALL carry the compositor's report: each piece's source (studio or stand-in), bytes, gzip bytes, triangles, and texture memory; the totals against the caps; and each live face's smallest glyph height.

**Data flow**

- **FR-074**: THE DATA-FLOW DISCLOSURE'S STATUS ROW (spec 001's V2) SHALL gain the room's polling (Amendment A4), in the change that switches the live source on. IF the room would poll without that row, THEN it SHALL NOT be deployed.
- **FR-075**: THE ROOM SHALL load every model, font, and data file from the site's own origin (spec 002 FR-057). A turn's cost SHALL reach the page only inside the turn's own reply, so the sign adds no flow out of the visitor's device; spec 002's turn row SHALL say the reply carries it (Amendment B6).

**Cost and order**

- **FR-076**: NO PIECE, POLL, OR RENDERER SHALL call a model. A topic with no corpus SHALL call nothing (FR-037).
- **FR-077**: THE AUTHOR'S PATCHES SHALL land on `main` in this order, each before the risk it guards: the guard (FR-025) before the first room photo is staged; the arrival check, the policy entries the first room file needs, and spec 003's amendments C1 and C2 before the first hand-made or design-sourced room file is committed; and the content check of FR-030 before the first room text ships.

### Key Entities

- **Piece (catalog entry)**: one kind of thing: size (measured or estimated), stylized scale, origin point and expected bounds, anchors, live faces, glows, claimed state, stand-in, 2D drawing, budget, and work order. Several placements may share one.
- **Placement**: one placed piece: a permanent ID, its piece, its mount (another placement's anchor, an offset, a turn), whether the camera frames it, and its bindings (live faces to renderers and text, glows, switches).
- **Switch**: one case per signal value, each showing one placement; the plugged pose claims the value local.
- **Selectable**: a permanent ID (the event's and the conversation feature's), a name, members, and a topic or an action. Replaces spec 002's "Room object".
- **Topic**: an ID, the phrase the fixed message uses, the Author's words it came from, its corpus files, and, per selectable, an optional lead. Readiness stays the twin's spec's.
- **Room text**: one approved file per drawn block (the terminal's halves, the chalkboard's blocks, each sign's lettering and outlines).
- **Look**: a look method (inked cel by default), its palette, lights, outlines, and glow tones.
- **Fixture**: a named sample of both signals, for drafts builds and tests only, labelled "Sample".
- **Tier**: local, cloud, resting, budget, unavailable, unknown, paused, or not-live (FR-041).
- **Turn cost**: a turn reply's `cost_micro_usd`, an integer, and the visit's sum in page memory.
- **Room bundle**: the compositor's one output: the index in the entry chunk and the 3D part in the lazy chunk.
- **Work order**: the generated, committed brief for one piece: method, shots, measurements, origin, live faces, states, budget, the look's material notes, export rules, and the record's template.
- **Fit findings**: the checks of FR-015 to FR-019 and the budgets, for one model, from the compositor or the lookdev page.
- **Caps**: the Author's configuration on `main`: per piece and for the scene (FR-053).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Each data-only change in the proof set (a move, an addition, a removal, a regroup with its move, a retarget, a rewording, a new switch case) passes `make check` with 0 source files changed, and the source scan finds 0 data-only IDs in the room's code.
- **SC-002**: The compositor refuses 100% of a fixture set with one known-bad case per rule, each refusal naming its rule, file, and path, and accepts 100% of the known-good set; two builds of one commit are byte-identical.
- **SC-003**: Across table tests of every status outcome (each field combination, a failed request, a timeout, each non-200 status, a malformed body, a 429), the charger shows plugged in for 0 outcomes other than a fresh local answer, and leaves the plugged pose on the first frame after a failed request.
- **SC-004**: In a recorded failover on the dev stack, the charger leaves the plugged pose within 40 seconds of the relay's local path turning unhealthy, and a room paused or hidden for 10 minutes shows the plugged pose in 0 frames.
- **SC-005**: On the reference phone, at the production framing, with every studio piece the scene holds, the room holds a median of at least 30 frames a second, with at least 95% of frames within 33 ms, over a 2-minute visit and a 10-minute soak, and a scripted load of every piece causes 0 quality step-downs.
- **SC-006**: Texture memory on the reference phone stays at or under 96 MB, and the room's share of a first visit at or under about 12 MB, inside spec 003's 25 MB.
- **SC-007**: In fault-injection runs covering each failure of FR-057 to FR-061, 100% end with the room usable, the AI disclosure visible, and a working text box; 0 end blank or frozen.
- **SC-008**: 100% of drawn words trace to an approved room-text file, a UI word, or a live value; 0 model files carry a readable word; and in every renderer test the text copy equals the drawn words.
- **SC-009**: A keyboard-only tester and a screen-reader tester each reach every selectable, "Pause the room", and the text copy unaided; an automated check reports 0 WCAG 2.2 AA violations; and every hit area measures at least 44 × 44 CSS pixels at the smallest supported stage, in 3D and 2D.
- **SC-010**: The Author judges the look at the production framing on the reference phone and on the reference desktop, and every face classed as readable has a smallest glyph at or above the floor in the compositor's report.
- **SC-011**: Over stubbed turn replies (local, paid, degraded, failed, lost), "this visit" equals the exact integer sum of the replies' `cost_micro_usd` in 100% of tests, each reading follows FR-048, and the sign makes 0 requests and 0 storage writes.
- **SC-012**: The browser's network log shows 0 third-party hosts, 0 status requests before Enter or while paused or hidden, and at most 2 status requests a minute per visible room.
- **SC-013**: 100% of room files carry the mark their record calls for, 100% of design-sourced files say `design`, 0 photos or photo crops are in the repository, and the forbidden-action matrix proves every studio folder unreadable to agent sessions.
- **SC-014**: The "Room live state" panel shows status requests, their 429s, and the time in each class, each within 60 seconds of the relay's change.
- **SC-015**: Selecting a piece whose topic isn't ready makes 0 model calls and shows the fixed message with that topic's phrase in 100% of tests.
- **SC-016**: Adding a new piece end to end (catalog entry, placement, selectable, topic) needs 0 code changes, and after one build it is a labelled, selectable stand-in with a generated work order.

## Amendments to Specs 001, 002, and 003

The Author's answer 10 took the recommendation that "A new spec 004 owns the composition and names its amendments to specs 001, 002, and 003", rather than editing those unmerged specs. So the amended specs' text stays as it is; each amendment below supersedes the clause it names from this spec's approval, and each amended spec's later work (its plan, tasks, or implementation, and its merge-request note) reads it beside its own text. Every clause was checked against the copies read on 2026-10-22: spec 001 on `spec/001-cloud-elevation`, spec 002 on `feat/002-us6-events`, spec 003 on the `feat/003-*` branches. Where a clause wasn't in those copies, the row says so.

**Spec 001 (cloud elevation)**

| ID | Clause | Change | Why |
|---|---|---|---|
| A1 | contracts/relay-http.md §8, `GET /api/status`, and §4, its bucket of 30 a minute, burst 10 | Name the room as a consumer: at most 2 requests a minute per visible, unpaused room, same-origin, with no query string, extra header, or credentials. The room reads `local_tier`, `state`, and `cause_now`; the shape doesn't change. | FR-041, FR-044: the laptop's tier. |
| A2 | contracts/relay-http.md §10, the span `relay.request` and the metrics `h4.relay.requests` and `h4.relay.cap_refusals` | Add a route label to both counters, with the status bucket's own limit name; add a gauge of the tier class the status would reduce to now (FR-041's table); keep non-error status requests' spans out of traces, as §8 already does for probes. | The "Room live state" panel has no series to read today (FR-072), and each poll would otherwise become a trace. |
| A3 | contracts/public-view.md §3, `local.requests_5m`, from "the relay's and the gateways' request counters" | Count hello only, or show status requests separately. | The room's polls would inflate the public request count. |
| A4 | spec.md, Data Flows This Spec Adds, row V2 ("for hello and the status request"), with FR-040 and FR-042 | The row gains the room's trigger (every 30 seconds while the room is entered, visible, and not paused), its default (on once the live source is), what the relay keeps (the address, in memory, for the status bucket, at most one UTC day), and how to switch it off ("Pause the room", or blocking the path). No new row. | The intent: "This intent extends those rows rather than adding an overlapping one." |
| A5 | contracts/relay-http.md §1 ("Any other path gets 404") and §3 step 7 (hello's body "passes through ... unchanged"); the release step, plan §7 | When the twin's spec adds `POST /api/room/turn` to the relay's paths, its 200 body passes through unchanged, `cost_micro_usd` included. The release step, which spec 002's web-serving §5 already has refuse drafts and stand-ins, also refuses a bundle with fixtures or the lookdev page, and builds `dist/` inside the pinned web build stage with no credentials mounted. | FR-047; FR-066; the compositor runs at release in the Author's terminal otherwise. |

**Spec 002 (the room)**

| ID | Clause | Change | Why |
|---|---|---|---|
| B1 | spec.md, The Author's Words, row W1 | W1's words stay as quoted. Its reading changes: "my snowboard hanging on the left side, my bicycle hanging on the right side" becomes the default placement in the scene file, and its topics ("hobbies and my general life", "traveling adventures") are superseded by intent 004's answer 1. A row W11 points at this spec's quoted words. | The Author's newer words win, and spec 002 keeps its record. |
| B2 | FR-005, FR-006, and Key Entities, "Work area" | The work area is what the scene file composes. Its default holds the desk, the ultrawide monitor with its terminal, the neon sign, the laptop on its stand with its charger, the snowboard, the bicycle, the window with its view and the artwork, the chalkboard, the two signs, the twin, and the visitor. FR-006 keeps "only from the studio pipeline's artistic recreations" for geometry and textures, and adds the room's live drawing on plain faces (FR-029). | FR-001 to FR-003; intent 004's pieces. |
| B3 | FR-020; FR-023; Key Entities "Room object", "Topic", and "Room feature"; contracts/room-scene.md §2; data-model.md §5, `objects[]` | Topics become data, with FR-036's defaults. "Room object" becomes Selectable (FR-004), and the chalkboard joins `snowboard`, `bicycle`, and `laptop`. "Room feature" stays the selectable's ID, so dashboard series continue through a retarget. FR-023 stays, per topic. | Answers 1 and 3; FR-036, FR-037. |
| B4 | FR-050, its evals and red-team cases per topic | The topics become hobbies and travel adventures (with the snowboard's lead), the Author's mission, and work projects; "hobbies and general life" and "travel adventures" retire as separate topics. Red-team cases added: asking the twin for any amount, the neon sign's included; making a sign or the chalkboard speak for the Author; locating the Author from the window or the room; and pressing the twin past the corpus's own framing of Seva. | Answers 1 and 3; FR-039, FR-050. |
| B5 | contracts/room-conversation.md §2, `feature`; data-model.md §6 | `feature` is any selectable ID with a talk action in `config/room-events.yaml`, or `free_talk`. The twin's spec maps it to a topic, corpus files, and lead through the generated configuration of FR-038. | FR-004, FR-038. |
| B6 | contracts/room-conversation.md §2, "Response, an answer: 200 `{"text", "feature"}`"; data-model.md §6; spec.md's Data-Flow Disclosure Entries, row V2 | The 200 gains a required `cost_micro_usd`: an integer at least 0, the gateway's estimated cost summed over every call the turn made, 0 when all were local, in the final frame if the answer streams. `turns[]` stays `{role, text}`, and the server refuses extra fields. Row V2 says the reply carries the turn's estimated cost back to the device. | Answer 6; FR-047, FR-075. |
| B7 | contracts/room-events.md §3, `config/room-events.yaml`; data-model.md §5, `room-manifest.json` | The events file keeps its exact shape, its objects taken from the selectables (at most 64). The manifest's objects gain their topic and action; `placeholders` is computed from the placements; the manifest gains the live source (off or site) and the build kind (drafts or release). | The gateway parses the events file strictly; FR-004, FR-013. |
| B8 | contracts/room-scene.md §4 (the `2d` mode), §5 (keyboard), §6 (layout); FR-042, FR-045, FR-046, FR-047 | The 2D mode draws the composed scene from the bundle's index (FR-058). The Tab order adds "Pause the room" to the toolbar and "Around the room" after the conversation. Hit areas follow FR-064. FR-045 gains the pause control (WCAG 2.2.2). The portrait guarantee covers the twin, the desk, and every selectable's members, as the scene frames them. | FR-058 to FR-065. |
| B9 | data-model.md §4, `kind` is `resume` or `narration`; data-model.md §5, `room-data.json`'s `published`; contracts/resume-source.md §5, the content check's fragments "of at least 24 characters" | `kind` gains `room-text`; `room-data.json` publishes approved room text; the human-only content check verifies every room-text string at any length, so "I am very busy" (14 characters) can't ship unapproved. | FR-030. |
| B10 | contracts/resume-source.md §4, the PDF's "no other font"; the site's one-font rule (`apps/web/fonts/README.md`'s "No other font is used", as the 2026-10-22 font check quotes it; not in this pass's copies) | The PDF stays IBM Plex Sans alone. The site adds Patrick Hand for the chalkboard and the faces the plan names for the terminal and the neon lettering, each open-licensed, reserving no font name, self-hosted, and locked as Plex is. | Answer 2; FR-033; Confirmation 7. |
| B11 | contracts/web-serving.md §1 (the drafts row) and §5 (spec 001's release) | Drafts images also carry the lookdev page and the fixtures; release refuses them (Amendment A5). | FR-066. |
| B12 | spec.md, Degraded-Mode Behavior and Expected Cost Impact | New rows, from this spec's tables below. | Principle I; Principle V. |

**Spec 003 (studio assets)**

| ID | Clause | Change | Why |
|---|---|---|---|
| C1 | FR-034 ("the IPTC digital source type for AI-generated media"); contracts/arrival-check.md M5 (only `trainedAlgorithmicMedia`); the scrubber, which writes that one value | The mark follows the record: `trainedAlgorithmicMedia` when every step that made the content is a model's; `compositeWithTrainedAlgorithmicMedia` when model and hand steps mix; IPTC's value for human-made digital art when every step is by hand (the plan confirms the code against IPTC's vocabulary). A step the studio's agent session scripted is a model step. The arrival check refuses a mark that disagrees with the record's `by` fields, and the scrubber takes the value from the record. The twin's files keep `trainedAlgorithmicMedia`. On `main` before the first hand-made room file (FR-077). | The intent's "The mark follows the record"; Principle VII. |
| C2 | data-model.md §2, `source.type` (`photo`, `prompt`, or `asset`); arrival-check R1; asset-record.md §4, the credits' source type | Add `design`: an original design with no photo or prompt (the Author's sign designs, an original artwork), named by an opaque ID. On `main` before the first such file (FR-077). | Answer 10; the record must be true to be "complete". |
| C3 | FR-003 (the four folders: photos, unstripped outputs, workflows, blinding key) and task T005 (named by the intent; not in this pass's copies) | The guard covers every studio folder, in both the file tools' denies and the sandbox's: ComfyUI runs with its input, output, temp, and user folders inside the denied folders, and Blender's working files, temporary files, and autosaves sit in the workflows folder, so the guard keeps four folders. Applied before the first photo is staged. | The intent's Constraints; FR-025. |
| C4 | FR-037 and User Story 7, scenario 3 ("screens show a plain glow"); data-model.md §4, the `room` block; arrival-check P2 | For room files, a screen is a plain live face of one colour (FR-017), and the room draws its glow and words; the room confirmations are read per file, so a confirmation that doesn't apply (a desk has no window view) is recorded as not applicable, and P2 requires `true` only where one applies. | The studio's contract has no emission; a desk can't truthfully confirm a window view. |
| C5 | data-model.md §2, `likeness` ("true when the file shows the Author or derives from the Author's photos") | For room files, `likeness` means the file shows the Author; that a piece was modeled with the Author's photos as reference is said by its source and steps. P1 still requires the Author's approval for every room file. | The credits would otherwise call a desk "a likeness of the Author" (Principle VII). |
| C6 | contracts/arrival-check.md, Readings: F3 counts "every GLB under ... `assets/room/` in Phase 3" | F3 counts every file under `assets/room/`, image cards included. | Answer 9's proposal. |
| C7 | data-model.md §5, `caps.json`'s `per_asset`; arrival-check F2 | `per_asset` gains a `room` kind at FR-053's starting caps, and `caps.json` gains the scene's texture-memory total, which the compositor reads from `main`. The Author's patch, with ADR 0010's amendment. | Answer 9; FR-053. |
| C8 | FR-010 ("any hosted service a step used"); data-model.md §2.1, `service` and its `disclosure_row`; arrival-check R7 and L1; FR-040(c) | A step the studio's agent session scripted names that session as its hosted service; the disclosure gains that service's row (FR-027), and `licenses.json` gains the hand tools' licenses and the session's terms, in the Author's policy commit before the first room approval. | The studio's contract of 2026-10-22 records the session as a hosted service. |
| C9 | contracts/site-loading.md §2 (the order) and §3 (failures) | Room models load after the twin and the chosen avatar, above ADR 0010's floor, framed selectables first; a failed piece keeps its stand-in after one retry; the reduced tier decodes lighter textures. | FR-056, FR-057. |

**ADRs.** ADR 0010, still proposed, gains the `room` caps and records the look after lookdev, keeping "inspired-by only". A new ADR records the composition (the catalog and scene compiled into one bundle, plain models, closed behaviours, live words), at the next free number: 0036 in the reviewed design, since spec 002 reserves 0035 for recognition (not in this pass's copies).

## Assumptions

**Scope and order**

- **This spec owns** the room's data (catalog, scene, topics, room text, UI words, looks, fixtures), the compositor and its bundle, the plain-model contract, the renderers and signals, the laptop's tier, the neon sign's display, the lookdev page, the text copy, the work orders and the photo guide, and the amendments above. **It depends on, without specifying:** the twin's conversation core (no spec yet: readiness, the topics' evals, the turn endpoint), spec 001's relay and edge, spec 003's intake and guard, and spec 002's room code, all unmerged on 2026-10-22. **Outside it:** the studio's workflow (spec 003's boundary), the corpus, which the Author writes, and the avatar's photos, which come after the room (the intent's order).
- **The order** is the intent's: the shoot; lookdev on the vignette; the look recorded in ADR 0010 and the work orders regenerated; the rest of the pieces; then the avatar's photos. User Stories 1 to 3 and 7 can ship on stand-ins; User Story 4 waits for the Author's patches (FR-077); User Story 5 for the content check; User Stories 8 and 9 for spec 001 and the conversation core. Spec 003's guard needs `feat/003-guards` on `main` first (the guard check of 2026-10-22).
- **The corpus.** The Author writes hobbies and travel adventures, the mission statements with Seva, the three approach words, and, if wanted, the dog, in the Author's own words; agents only file proposals in `corpus/proposals/`. Until each exists, its topic stays unready and its chalkboard lines pending (answer 3; FR-033, FR-037).

**Readings of the inputs**

- **The answers win.** The intent's "Affected users and systems" line says "the room reads its status and spend", but answer 6's reading and the Data-flow impact say the room polls only for the tier; this spec follows them, and never reads spec 001's `/status/latest.json`. The reviewed design's spend display, its spend fixtures, and its 75-second staleness rule are superseded by answer 6 and the review's 35-second rule.
- **"Fresh."** The review's "under about 35 seconds old", with a poll every 30 seconds, twice the cadence of spec 001's own `/status/` page, so the plugged pose doesn't flicker. Visitors behind one shared address share the status bucket; if they exhaust it, their rooms read unknown, which is honest.
- **What "local" means:** a hello sent now would be answered by the local tier, since the relay's check is the local gateway's own verdict. It says nothing about whether a topic is ready, which is why the sentences speak about the machine (FR-035).
- **The cost is the gateway's estimate** from `config/prices.yaml`, not the provider's bill, hence "est.". In a rare case the meter later charges more than the reply said (a reservation that expires before its commit lands); the sign doesn't follow that.
- **Langfuse's name** on the sign is nominative use, with no logo, wordmark, or colours (the check of 2026-10-22, a research reading and not legal advice). The counters are the gateway's figures, the same figure Langfuse records for each call; Langfuse never sees a visit's total, and the room never reads Langfuse. "Claude Code" and "Claude" on the monitor are plain product names in the same way.
- **The poses.** The intent gives the laptop "its own, distinct pose when the state is unknown, the room is paused, or the status isn't live yet", one pose by its grammar; the reviewed design's "get their own pose" can be read as three. Each value has its own case either way (FR-043), so splitting or sharing poses is a data edit; Q2 asks the Author.
- **The one-photo exception** is recorded in the Author's words (Source). It was not a studio step and isn't a flow this system makes; the studio's agent received no photo.
- **The studio's agent session is a hosted service:** what it sees (typed sheets and descriptions, the Author's own designs, reviewed outputs, scrubbed textures, its own renders) reaches Anthropic, by the Author's choice, and is disclosed (FR-027; Amendment C8).
- **No local status endpoint.** Before spec 001, the room stays not-live everywhere; afterwards, the Author's own local-tier room, whose `edge` answers 404 under `/api/`, reads unknown. The design's alternative, a status endpoint on the local stack, would need its own span, panel, and disclosure row, and isn't taken (Confirmation 8).

**Where this spec differs from the studio's contract of 2026-10-22** (it agrees otherwise: plain models, live faces as named quads, states as separate files, the charger as a plug and a short lead, the neon sign as arrow tube, backing, and clip with no letter-shaped tube, textures never from photos, a generic window view, the artwork waiting for the Author):

1. **Style frames and cutouts.** The intent lets the studio's agent see a reviewed style frame; the contract gives it none, nor any cutout. The narrower contract complies with FR-024.
2. **Extensions.** The contract allows `KHR_materials_*` and expects none; the compositor refuses three of them (FR-015).
3. **Names.** The contract's rule (lowercase and hyphens, no `.001` suffix) is stricter than spec 003's M8; this spec adopts it (FR-018).
4. **Caps.** The contract keeps them in the studio's own copy; the repository's caps on `main` are authoritative, and the studio's copy mirrors them (FR-053).
5. **Tolerances.** The contract sizes live faces "from the sheet"; the compositor adds the 1 mm and 1° check (FR-017) and the bounds check (FR-019).

**Deviations** (named, as the constitution's Governance requires)

- **Principle II and Development Workflow step 7** ("A feature without a graph is not done"): until spec 001's relay carries spec 003's asset events and serves the status, the room's piece loads and the "Room live state" panel have no production series. They are measured in tests and in the Author's lookdev runs only. The Author is the only visitor until publication; the deviation ends when spec 001 carries both.
- **Inherited: local until publication** (ADR 0013). This spec is reviewed as a branch with a note in `docs/merge-requests/`, as specs 000 to 003 are.
- **Conditional, on Q1's recommended answer: Principle IV** ("the local tier accepts no inbound connections"), as ADR 0021 reads it ("no inbound from outside the host"). A USB forward from the Author's own phone to the dev stack reaches the host from outside it. If the Author takes that route, the reading is recorded with an ADR, and the flow gets its disclosure row before first use (FR-069).
- **Not a deviation:** the status polls carry no visitor data beyond the request itself, and the turn's cost travels back to the device in a reply it already gets.

**The disclosure's row IDs** collide across the unmerged specs: spec 001's V1 to V5 and spec 002's V1 to V5 name different flows, and spec 003 adds its own. This spec names rows by spec and ID; one scheme is agreed before any of them merges (Confirmation 11).

## Expected Cost Impact

- **Model spend: $0 at run time.** No piece, poll, or renderer calls a model, and a topic with no corpus calls nothing (FR-076). The sign only displays what the conversation already costs (spec 002's estimate: about $0.00095 a paid turn, and $0 a local one).
- **Cloud, edge transfer.** The room's models and image cards are static files at the edge, cached after a first visit, at about 12 MB of spec 003's 25 MB first visit (FR-053). For scale: 1,000 first visits a month at 12 MB is 12 GB; at typical CDN rates under $0.10 per GB that is under $1.20 a month, possibly $0 inside the edge's free allowance, and inside spec 003's estimate for the whole first visit. Nothing serving the site compresses GLBs today, so the plan either serves them compressed or budgets their raw bytes. The faces this spec adds are a few hundred kilobytes at most, cached.
- **Cloud, status polls.** About 2 small requests a minute per visible room: a 5-minute visit makes about 10, and 1,000 such visits a month about 10,000, around a cent at typical edge request prices, inside the relay's existing cap and with no model call.
- **Before publication:** $0 in the cloud; nothing is served to visitors.
- **Local:** the Author's time and electricity. Hand modeling needs no GPU. An image-to-3D blockout borrows the GPU in spec 003's studio window, while prod's twin falls back within its $2 daily sub-budget or degrades: after publication, at most $2 for each day of studio work, inside the $5 daily and $20 monthly ceilings. No budget or ceiling changes.
- **Tools:** Blender, MPFB, and COLMAP are free and local; a paid tool the studio adopts is the studio's cost.
- **Dev time:** the Claude Team plan.
- **Measurement:** the compositor's report in each merge-request note (FR-073), spec 003's transfer panel, and the "Room live state" panel's poll counts (FR-072).

## Degraded-Mode Behavior

| What is gone or off | The laptop | The neon sign | The rest of the room |
|---|---|---|---|
| The live source is off (before spec 001) | not-live pose; no request | "cost unavailable" | works |
| A status request fails, times out, is refused (429), or is malformed | unknown, never plugged, at once | unchanged | works |
| The room is paused, or the page hidden | paused, never plugged; no polls | holds, still | motion stops; "Paused at <time>" |
| The local tier is off, and the cloud fallback answers | unplugged (cloud) | paid turns show their cost | works |
| The kill switch has tripped, the budget is spent, or no path answers | the degraded classes' pose (Q2), never plugged | "cost unavailable"; the visit "at least" | works; the conversation shows its fixed message |
| The conversation core doesn't exist yet | as the tier | "cost unavailable" | every topic says it can't talk yet |
| A piece's model fails to load | its stand-in, still bound to its state | its stand-in | works; an asset event |
| No 3D, or the room falls to 2D | the 2D drawing of the current case | a still image, redrawn on change | the 2D room |
| Reduced motion | state changes at once | still | final frames |
| Room text withheld or failing to load | – | – | faces plain; no text-copy entry |
| A font arrives late, or never | – | the fallback face, redrawn later | the fallback face |

## Data-Flow Disclosure Entries

For `docs/data-flow-disclosure.md`, each in the same change as its flow (FR-027, FR-074). Rows are named by their spec until one row-ID scheme is agreed (Assumptions).

| Row | From → To | Trigger | Carries | Never carries | Why | Default; how to switch it off |
|---|---|---|---|---|---|---|
| Spec 001's V2, amended (A4) | the visitor's browser → the edge → the relay, `GET /api/status` | as before, and now the room: every 30 s while the visitor has entered, the page is visible, the room isn't paused, and the live source is on | the request; the IP address, which the relay holds in memory for the status bucket, at most one UTC day (spec 001 FR-042); the user agent | the engineer or non-engineer path, the avatar, anything typed or said, any identifier of the visit; nothing is stored on the device | the laptop shows whether the Author's machine is serving (FR-041) | on once the live source is; "Pause the room", or block the path |
| Spec 002's V2, amended (B6) | the stack → the visitor's browser, in each turn's reply | a conversation turn | the turn's estimated cost, an integer | anything new leaving the device | the neon sign (FR-047) | with the conversation |
| Spec 003's FR-040(c) row for the studio's agent session (C8) | the studio's Claude Code session, on the Author's machine → Anthropic | the Author's studio sessions | typed dimension sheets and descriptions, the Author's own designs, reviewed outputs, scrubbed textures, renders of its own models, and the session's prompts and replies | a photo, or a crop, mask, cutout, or image-to-3D output made from one; this repository's files; anything that locates the Author | the studio models the room's pieces, by the Author's choice (FR-024, FR-027) | off: only while the Author runs a studio session |
| Conditional, on Q1's answer A: a development-time row | the Author's phone → the dev stack's loopback port, over a USB forward the Author starts | a lookdev session on the reference phone | the lookdev page's requests and the scrubbed candidate files the Author copies to the phone | anything unscrubbed; any photo | lookdev at the room's real framing on the reference phone (FR-069) | off: removed after each session |

## Constitution Check

Applied with the `constitution-check` skill's questions against constitution 1.0.1.

| Principle | Touched | How it complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | Every new flow has its row, the status polls by amending spec 001's V2 rather than overlapping it (FR-074; table above). No third-party host (FR-075). The photos stay on the Author's machine, behind the guard, out of the studio agent's and every agent's reach (FR-024 to FR-026). Degraded modes come first (User Story 2; FR-057 to FR-062). `make up` always works, on stand-ins when a model doesn't fit (FR-013). No visitor biometrics. |
| II. Production-grade or not shipped | Yes | Tests for every rule and the data-only proof (SC-001 to SC-016); telemetry and a "Room live state" panel (FR-071, FR-072); a cost estimate above and its measurement (FR-073). Deviation named: no production series until spec 001 carries them (Assumptions). No new alert, so no new runbook entry. The topics' evals and red-team cases are the twin's (Amendment B4). |
| III. Intent before spec, spec before code, humans merge | Yes | From the accepted intent 004. Amendments are named, not edited in (answer 10). ADR 0010's amendment and a composition ADR are recorded. The guard, the checks, and the policy files are the Author's patches (FR-077). Local until publication carries over. |
| IV. Least privilege | Yes | Each deny lands before its risk: the guard before the first photo, the checks before the first file and the first text (FR-077). Privacy, licenses, approvals, and caps stay in human-only checks reading `main`; the agent-editable compositor checks fit and refuses data above the Author's caps (FR-053). Nothing is widened. Conditional deviation on Q1 (Assumptions). |
| V. Cost is a first-class signal | Yes | No model call (FR-076). The room shows the visitor's own cost honestly, as an estimate (FR-047, FR-048), and never reads Langfuse (FR-050). Caps are configuration (FR-053). The polls fit the relay's existing cap. Estimate above. |
| VI. Build in public, including failures | Yes | The catalog, the work orders, the records, and the room text are public; the photos and the studio's working files stay private (FR-012, FR-024). |
| VII. Own the whole product, and say exactly what you owned | Yes | The mark follows the record, both ways (Amendment C1); a `design` source (C2); a desk isn't called a likeness (C5). The Author's role in the shoot, the studio, and the approvals is in the intent's words. |
| VIII. Honest AI | Yes | Chalkboard lines only from the corpus or the Author's approved words, never the Seva line (FR-033). The twin never states an amount (FR-050). An unready topic says so and calls nothing (FR-037). The laptop shows plugged in only on a fresh local answer, and never draws unknown as a failover (FR-041 to FR-043). The AI disclosure stays visible (FR-062). |
| Security & Agent Governance | Yes | Visitor input stays adversarial, with new red-team cases (Amendment B4). Studio outputs enter only through the intake. Every drawn word is approved by hash on `main`, checked by human-only code (FR-030). |

## Open Questions for `/speckit-clarify`

Two questions carry needs-clarification markers (FR-069, FR-043): one of security, one of what the room shows. Everything else the intent leaves open takes a recommended default, listed under Confirmations, where a yes keeps each.

**The intent's open questions 1 to 8:**

| Intent's question | Ends up as |
|---|---|
| 1. The sign's labels | Confirmation 1 |
| 2. What the counters read | Confirmation 2 |
| 3. The chalkboard's face | Settled by answer 2 ("you can pick the chalkboard font as recommended"): Patrick Hand, recorded in Confirmation 7 |
| 4. The corpus to write | Settled by answer 3 ("We can write those into the corpus"): the Author writes it; topics and lines stay unready until then (FR-033, FR-037) |
| 5. The signs' lettering | Confirmation 3 |
| 6. The screen's two halves | Confirmation 4 |
| 7. The artwork | Confirmation 5 |
| 8. The Bedrock price | Confirmation 6 |

### Question 1: How the reference phone reaches the lookdev page (FR-069)

**Context**: The intent: "Lookdev settles the look on a small vignette, at the room's real framing, on a reference phone", and answer 10 puts the fit check "in the lookdev page". The page lives in the dev stack's drafts image, published on the host's `127.0.0.1` only. Principle IV says the local tier "accepts no inbound connections", which ADR 0021 reads as "no inbound from outside the host", and disclosure row S1 says requests come from "the Author's own terminal or browser, on the same host". The review found that the design's phone loop also moved unscrubbed files to the phone.

**What we need to know**: May the Author's phone reach the dev stack's lookdev page over USB?

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Yes: a USB forward the Author starts (`adb reverse`) to the dev stack's lookdev port, carrying scrubbed files only, copied into a temporary folder on the phone, all removed after each session; disclosed as a development-time row before first use, with an ADR recording the reading of ADR 0021 | The look is judged where visitors see it, on the reference phone. A conditional reading of Principle IV, named in Assumptions. While the forward is up, any app on the phone can reach that port, so sessions stay short. |
| B | No: lookdev runs on the desktop only, at the phone's stage size and pixel ratio; the phone is measured later, on a release build the edge serves | No new flow and no reading of Principle IV. The phone's frame rate, heat, and texture memory go unmeasured until publication, so the look and the caps are settled without them. |
| Custom | Another route | Name it, and its disclosure row. |

### Question 2: What the laptop shows when nobody is answering, or nobody knows (FR-043)

**Context**: The Author: "plugged in, only when we are running locally, and unplugged when it has failed over to the cloud". The intent adds "its own, distinct pose when the state is unknown, the room is paused, or the status isn't live yet", and "Unknown means degraded". It says nothing of the degraded classes, when the kill switch has tripped, the day's budget is used, or no path answers, and the review found that drawing those like a failover makes a false claim.

**What we need to know**: Which pose do the degraded classes show, and do unknown, paused, and not-live share one pose?

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | One "not answering" pose, the plug resting on the desk, for unknown, paused, not-live, resting, budget, and unavailable, each told apart by its own sentence in the text copy | Three poses in all, each a true claim: plugged in (local serves), unplugged (the cloud fallback serves), resting (nobody serves now, or nobody knows). Matches "Unknown means degraded". |
| B | As A, but the degraded classes show the unplugged pose whenever `local_tier` is "down" | Keeps the Author's two-pose picture for most of a bad day, but the unplugged pose then means "not local" rather than "the cloud answers". |
| C | A separate pose for each of unknown, paused, and not-live, plus A or B for the degraded classes | Most detail; the poses must stay visible apart at the production framing, which lookdev checks. Data only either way. |

### Confirmations (recommended defaults taken; a yes keeps each)

1. **The sign's labels** (intent question 1): the counters read "this call" and "this visit", since "session" is a Langfuse term for something the room never sends; the sign carries a small line saying the gateway meters the figures; and the site says the project isn't affiliated with or endorsed by Langfuse or its owner.
2. **What the counters read** (intent question 2): "local · $0" for a local call; six decimals, marked "est."; for a turn whose reply carries no cost, "cost unavailable", with "this visit" marked "at least". Spec 000's degraded body doesn't gain a cost field.
3. **The signs' lettering** (intent question 5): the Author gives the studio the two designs, as vector originals where they exist; the studio traces the lettering into outlines; the outlines come in as room text, approved by hash; the design files never enter this repository as images. A design holding a photograph counts as a photo.
4. **The screen's two halves** (intent question 6): agents draft both scripts, sized for the enlarged screen, and the Author approves each by hash.
5. **The artwork** (intent question 7): original art from the studio, which waits for the Author's confirmation; absent if the Author doesn't confirm it.
6. **The Bedrock price** (intent question 8): before the sign shows paid figures to public visitors, the Author checks `config/prices.yaml`'s Claude Haiku 5.5 row against Bedrock's current US cross-region price, and appends a new version if it differs; the figures stay marked "est." either way.
7. **The faces**: Patrick Hand (SIL OFL 1.1, no reserved font name) for the chalkboard, with Kalam the runner-up; IBM Plex Mono for the terminal and the counters; the neon word's face chosen by the plan under the same rules, and nothing from GTA. The PDF keeps IBM Plex Sans alone.
8. **The live source** stays off until spec 001 serves the status to the room; no local status endpoint is added for the Author's own local-tier room, which reads unknown.
9. **The cadence**: a poll every 30 seconds, freshness 35 seconds, a 5-second timeout, backing off to 120 seconds; all configuration.
10. **Spec 003's readings**: `likeness` for a room file means it shows the Author (C5), and a room confirmation that doesn't apply is recorded as not applicable (C4).
11. **The disclosure**: spec 001's V2 is extended rather than a new row added, and one row-ID scheme is agreed across specs 001 to 004 before any of them merges.
12. **The ADR number**: 0036 for the composition's ADR, if still free.
13. **Estimated sizes**: sizes estimated from the photo of 2026-10-22 are marked estimated until the Author measures them (FR-002).
14. **The studio's agent session** is recorded as a hosted service in the record of each step it scripted, with its disclosure row (C8).
15. **The deviation** from Principle II and Development Workflow step 7 until spec 001 carries the asset events and the status (Assumptions).
