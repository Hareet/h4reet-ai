# Intent: my work area's pieces, composed from data
Author: the Author. Status: accepted (2026-10-22). Created: 2026-10-21. Revised: 2026-10-22, with the Author's answers to the open questions. Revises the scene of [intent 002](002-the-room.md) and adds pieces that show the system's live state; their models arrive through [intent 003](003-studio-assets.md)'s intake. Comes before the avatar's photos.

## Problem
- **The room is code.** Intent 002 listed the scene: the snowboard, the bicycle, the laptop and screen, the window and its artwork. Spec 002 built it with each piece's position, shape, and topic written into the room's code (`objects.ts`, `framing.ts`, `scene.ts`). Adding a piece, moving one, or changing what it opens is a code change.
- **Nothing in the room shows the system working:** what the twin costs, or whether the local tier is serving.
- **The look is unsettled.** ADR 0010 holds one sentence of art direction, and the studio hasn't made a single room asset.
- **The studio has no work order** for room pieces: which photos to take, what to measure, and what a finished model must meet.

## Proposed outcome
In my words (2026-10-21):

> "Okay, I think let's start with the room asset pipeline and creating that, to make sure we have the art style, rendering, and overall look of what we are imagining. I'm thinking we can start like this, tell me what type of photos to take, and I want to explain the items that need to be rendered, and what type of interactivity or features im imagining there. We want my computer desk layout, with the langfuse observability dashboard about current cost visible, maybe illumininating hanging off the top of my monitor. THe monitor should have my what looks like my terminal running. The laptop next ot the monitor should be plugged in, only when we are running locally, and unplugged when it has failed over to the cloud. The bicycle hanging next to the work desk should be clickable and invite conversation about my hobbies from a corpus which i still have to fill out. The chalkboard next to me should have an outline of my resume and goals in life and how i think about problems (human centered, secure first, offline and cost effective). The two things on my work desk other than the computer equipment should be the signs "I am very busy" and "my dog thinks i'm cool". You will get photos of those two designs and these items separately, placed in a location where the pipeline should be able to render the final assets. I want to start there before we take photos of me to create the avatar as that means I will have to dress up and get ready and requires some manual time."

> "We still want those pieces too (snowboard, bicycle, art window) including the new features. We want to be able to abstractly add those pieces to the studio pipeline than place them in the composite game feed. Think like a senior software architect, we will want to later modify and add pieces like these or move them around, so features should be modeled with that abstract perspective rather than one-off hard-coded"

Read as a list, for the spec. This is Claude's reading, to correct where it's wrong:
- **The pieces.**
  - My computer desk, laid out as it is.
  - The monitor, an ultrawide, split in two: a Claude Code session in a terminal with our spec file open, and a Claude desktop session (answer 5).
  - A clip-on neon arrow sign on the monitor's top edge, in GTA style, reading "Langfuse" with two counters: spend on the current call and on the session (answer 6).
  - The laptop on a stand beside the monitor, as a second monitor, its charger cable plugged in only while the local tier serves.
  - The bicycle, hanging next to the desk.
  - The snowboard.
  - The window with its recreated view, and the artwork above it.
  - The chalkboard beside my avatar.
  - Two desk signs, "I am very busy" and "my dog thinks i'm cool".
  - My avatar, and the visitor's, as they are in intent 002.
- **Pieces as data.**
  - A catalog entry describes each kind of piece: its measured size and anchors, its stand-in shape until the studio's model arrives, and the studio's work order.
  - One scene file places the pieces and says what each one does.
  - The studio's models carry no behaviour.
  - A build step composes the catalog, the scene, the topics, and the approved text into one room bundle: the "composite game feed". The 3D room, the 2D room, and the accessible lists all read it.
  - Adding, moving, retargeting, or rewording a piece is a data edit. Only a new kind of behaviour is code, through the lifecycle.
- **Readable words are drawn live.** The terminal, the cost display, the chalkboard, and the signs' lettering are drawn by the room, never baked into a model. The words come from approved text or the public status, each with a text copy for screen readers. Spec 003's FR-037 already keeps readable text and screen content out of studio assets.
- **The laptop tells the truth.**
  - It's plugged in only while a fresh status answer says the local tier serves.
  - It's unplugged after failover to the cloud.
  - It has its own, distinct pose when the state is unknown, the room is paused, or the status isn't live yet.
  - It's never plugged in when the state is unknown.
- **The neon sign** is drawn live: its word and its two counters.
  - The counters show the visitor's own conversation: the cost of the current call, and the session's total, summed in page memory.
  - Until the twin's conversation exists, the sign reads "cost unavailable" (answer 7).
  - Langfuse itself stays private (spec 001's FR-052), and the twin never says an amount.
- **The chalkboard** shows, from the corpus:
  - my resume's outline;
  - my mission statements;
  - how I think about problems: human centered, secure first, offline, and cost effective.

  The Seva line stays off the board. Selecting the board opens a conversation about my mission, where the twin can talk about Seva from the corpus (answer 3).
- **Clickable pieces open topics, as configuration.**
  - The bicycle opens hobbies and travel adventures.
  - The snowboard opens the same topic, leading with winter hobbies (answer 1).
  - The chalkboard opens my mission.
  - Until a topic's corpus exists, the twin says it can't talk about it yet, and calls no model.
- **Readable props are enlarged,** as a stylized scale: the signs, the neon sign, the monitor's screen, and the laptop's cable (answer 8).
- **The signs are my own designs** (answer 4). Their lettering is drawn live from approved outlines of my design. Their non-word graphics may stay in the model's texture.
- **"You will get photos…"** In Claude's reading, the photos go to the studio, which runs on my machine.
  - Local models on my GPU turn them into assets. Cutouts isolate each piece. Image-to-3D models give the chunky pieces their first meshes. Style frames restyle a photo into the room's look. Each model's license must allow publishing what it makes.
  - The studio's agent never receives a photo (spec 003's FR-003). It sees only what those models make, after I've reviewed it: a style frame with no brand, text, screen content, or view beyond the fence, or a mesh stripped to geometry.
  - The photos are also my reference for shape, size, color, and material. The studio's textures never come from them.
- **The order:**
  1. The shoot.
  2. Lookdev settles the look on a small vignette, at the room's real framing, on a reference phone. The vignette has the desk, the monitor and its terminal, the cost glow, the laptop's cable states, one sign, a corner of the chalkboard, and a bicycle wheel. Stand-in shapes and one or two cheap studio pieces are enough: the desk and one sign, made with flat colors and no baked shading.
  3. The look is recorded in ADR 0010, and the work orders follow it.
  4. Then the rest of the pieces.
  5. The avatar's photos come after the room.

## Answers, in my words (2026-10-22)
1. **Topics.** "bicycle opens hobbies and travel adventures, and snowboarding opens the same but has a bias to talking more about winter hobbies first, pulling from the same hobby and travel adventure corpus."
   - Reading: one topic, hobbies and travel adventures, with one corpus. The snowboard opens it with a lead, winter hobbies first. The lead is one line of data on the snowboard's clickable.
2. **The look.** "Inked cel is fine. And you can pick the chalkboard font as recommended, i can change it later if we don't like it."
   - Reading: inked cel. Claude picks an open-licensed chalk face, self-hosted under the repo's font rules; changing it later is a data edit.
3. **The chalkboard's words.** "We can write those into the corpus. And pointing out the chalkboard will cover more mission statements from a corpus and we can tlak about what seva is there inside that corups, but leave it off the chalkboard."
   - Reading: I write "secure first", "offline", and "cost effective" into the corpus in my own words. The board shows mission statements from the corpus. Seva stays off the board, and the twin talks about it when the board is selected.
4. **The signs.** "The signs are our own creations."
   - Reading: their graphics are mine, so the third-party-art rule doesn't apply to them. The lettering is still drawn live, from an approved trace of my design.
5. **The terminal.** "Have the terminal show similar to what we base in the photo, which will be half of a terminal claude session with our spec file open, and the other half being a claude desktop session."
   - Reading: both halves are scripted, approved text drawn live. There's no live shell, and no secrets, paths, or user names. Product names appear as plain text, with no logos. The photo of the real screen stays in the studio.
   - Also: "the monitor is an ultrawide, with my laptop on a stand as the second monitor next to it". Reading: the stand is its own piece, and the laptop mounts on its top. Moving the stand carries the laptop, its screen, and its cable plug.
6. **The cost display.** "A clip-on display that functions as a glowing arrow neon sign, think in that gta art style. "Langfuse" and then just has counter numbers for spend on this current call and spend on the session."
   - Reading: the studio models the arrow, its tubes, and its clip. The room draws the word and the counters as neon. The counters come from the visitor's own conversation, not from the public spend figures, so the room polls only for the laptop's tier.
7. **Before the conversation exists.** "Yes it can have cost unavailable for now."
8. **Legibility.** "enlarge them as stylized scale"
9. **Budgets.** "Okay, we can go with your proposal and see where it lands and increase the caps later, so make them configurable."
   - Reading: the starting caps are configuration, and the lookdev run measures them:
     - per piece, at most 2.5 MB gzip and 40,000 triangles, with 1024-px textures for small props;
     - for the whole scene, at most 96 MB of texture memory on phones.
10. **The rest.** "10-16) are okay?."
    - Reading: Claude's recommendations stand; correct any you didn't mean.
      - Spec 003 is amended before the first hand-made file is committed: the AI mark follows the record, and a `design` source type exists.
      - The 2D room uses the catalog's vector drawings.
      - The monitor stays part of "Laptop and screen".
      - A new spec 004 owns the composition and names its amendments to specs 001, 002, and 003.
      - Blender's working files go in the workflows folder, so the guard keeps four folders.
      - The fit check runs in the lookdev page.
      - The artwork had no recommendation. Claude's pick is original art from the studio, for you to confirm.

## Affected users and systems
- **Visitors**, on desktop and phone: the room's pieces, their live states, and the readable surfaces with their text copies.
- **Me:**
  - the shoot and the measurements;
  - the studio's modeling, scrubbing, and records, and approving each file's hash;
  - writing the corpus for hobbies, the approach words, and the dog;
  - choosing the topics, the look, and the signs' treatment.
- **The studio**, outside this repository: a work order per piece, plain models, the scrub, and the record.
- **`apps/web`:**
  - the room's composition: the catalog, the scene, the build step, the renderers, and the live signals;
  - a lookdev page in the drafts images only.
- **Spec 002 (the room):** its object list, positions, topics, and stand-ins become data.
- **Spec 003 (the intake):** the room's assets, plus the amendments named under Open questions.
- **Spec 001 (the relay):** the room reads its status and spend, and the relay's telemetry gains the polls.
- **The corpus:** hobbies, travel, the approach words, and the dog, in my words.
- **Dashboards:** a "Room live state" panel. Selection events keep their shape.
- **ADRs:** ADR 0010 (the art direction and the caps), and a new ADR for the composition.

## Constraints
- **Honest AI (Principle VIII).** Chalkboard lines come only from the corpus or my approved words. The twin never speaks an amount. A topic with no corpus says the twin can't talk about it yet.
- **Degraded mode first (Principle I).**
  - Unknown means degraded, and the laptop is never plugged in on unknown.
  - The room works with no live data. Until spec 001 serves the status, the laptop stays in its not-live pose and the cost display reads unavailable.
- **Data-local (Principle I): my photos stay on my machine.**
  - Camera-roll backup stays paused until cleanup.
  - The photos go over a USB cable into the studio's photos folder, and never through chat, email, a cloud drive, or an assistant.
  - Spec 003's guard (T005) is applied before the first photo is staged. It covers every studio folder: ComfyUI's input, output, temp, and user folders, plus Blender's working files and autosaves.
- **Langfuse stays private** (spec 001's FR-052). The room never reads it.
- **Spec 003's intake.**
  - Room models are plain GLBs with embedded PNG, JPEG, or WebP. They carry no lights, compression, or extras.
  - Each comes with its record, the media license, and my hash approval with the room confirmations:
    - screens a plain glow;
    - no logo, trademark, readable text, or third-party art;
    - the window's view recreated;
    - the artwork original or absent.
- **Say exactly what I owned (Principle VII).** A model I made by hand must not carry an "AI-made" mark. The mark follows the record.
- **Other people's art.**
  - If a sign or the artwork is a bought design, only its shape is recreated, and its words are drawn in the room's lettering.
  - The snowboard's graphic is replaced.
- **Phones.**
  - The scene holds its frame rate on a Galaxy A54-class phone.
  - Texture memory is capped for the whole scene.
  - Legibility is judged at the room's real framing, not at a close-up.
- **Git keeps everything (ADR 0013).** I approve a model's hash only after viewing the scrubbed file.
- **The lifecycle.** No code before an approved spec and plan. `tools/gates/**`, `REVIEW.md`, and `.claude/**` change only by my patches.
- **Production-grade (Principle II).**
  - Tests prove that moving, adding, and retargeting a piece needs no code.
  - Telemetry has no payloads.
  - The dashboard gets a panel, and the room's status polls get a disclosure entry.

## Expected cost impact
- **Cloud:**
  - The room's models are static files at the edge (spec 001), cached after a visitor's first load. The design estimates about 12 MB of the 25 MB phase-3 first visit; lookdev measures it.
  - The status polls are reads on spec 001's relay, within its existing rate cap. They cost close to nothing.
- **Model spend:** none at run time. No piece calls a model, and a topic with no corpus calls nothing.
- **Local:** the studio's work is my time and electricity. Hand modeling needs no GPU. An image-to-3D blockout would borrow the GPU in spec 003's studio window, while prod's twin falls back within its sub-budget or degrades.
- **Tools:** Blender, MPFB, and COLMAP are free and run locally. A paid tool the studio adopts is the studio's cost.
- **Dev time:** the Claude Team plan.

## Data-flow impact
- **Visitors:**
  - The room adds one same-origin read, spec 001's `GET /api/status`, for the laptop's tier. It's polled while the room is visible and not paused, and pausing the room stops it.
  - It carries no visitor data beyond the request itself. The relay keeps the address in memory for its rate cap, as spec 001's disclosure rows describe. This intent extends those rows rather than adding an overlapping one.
  - The neon sign's counters come from the visitor's own conversation replies, with no extra request. The session's total stays in page memory and leaves with the page.
- **My photos** stay on my machine. They're never sent to an assistant or a cloud service, and they're deleted from the phone once the studio's copy checks out.
  - One exception, by my choice (2026-10-22): after the measurements were lost, I showed Claude one desk photo, stripped of its metadata, to estimate sizes.
- **Public:** the models, their records, and the approved room text. Each visitor sees only their own conversation's cost.
- **Never public:** Langfuse, traces, and payloads; the photos; the studio's working files.

## Open questions
The questions of 2026-10-21 are answered above. What's still open, for the spec:
1. **The sign's labels.** "Langfuse" stays, drawn in the room's own neon lettering with no Langfuse logo, wordmark, or colors. The counters aren't Langfuse's numbers, though: the gateway prices each call and returns the figure with the reply, and Langfuse's traces get a copy. Claude recommends three things:
   - label the counters "this call" and "this visit", since "session" is a Langfuse term for something the room never sends;
   - add a small "metered by the gateway" line;
   - add a line on the site saying the project isn't affiliated with Langfuse.
2. **What the counters read.**
   - A local answer costs exactly $0, so the call counter will mostly read $0 while the laptop is plugged in. Claude recommends showing that as "local · $0".
   - How many decimals? The gateway meters in micro-dollars. Claude recommends six, marked "est.".
   - A failed or degraded answer carries no cost today. The recommendation is "cost unavailable", with the visit's total marked "at least". The alternative is giving spec 000's degraded reply a cost field.
3. **The chalkboard's face.** Claude's pick is Patrick Hand, self-hosted, with Kalam as the runner-up. Patrick Hand is SIL OFL 1.1, reserves no font name, and has one weight. Adding it amends spec 002's one-font rule; the resume PDF stays IBM Plex Sans.
4. **The corpus to write.** I write three things in my own words:
   - hobbies and travel adventures;
   - my mission statements, including Seva;
   - "secure first", "offline", and "cost effective".

   The topics and the board's lines stay unready until each exists.
5. **The signs' lettering.** I provide their design files, as vector originals if I have them, so the lettering can be traced into approved outlines. The files go to the studio, never into this repository as images.
6. **The screen's two halves.** Agents draft both scripts, the terminal session with the spec file open and the desktop session, as approved room text sized for the enlarged screen. I approve them by hash.
7. **The artwork.** Claude's pick is original art from the studio. Confirm or change it.
8. **The Bedrock price.** The price table may miss a cross-region premium. I check `config/prices.yaml` against Bedrock's current price, and append a new version if it differs.

## The questions of 2026-10-21, as asked
1. **Topics.** Does the bicycle open hobbies (2026-10-21) or travel adventures (intent 002)? Does the snowboard keep "hobbies and general life", or do the two split hobbies, for example cycling and snowboarding? Either way it's one line of data per piece.
2. **The look, after lookdev.**
   - Inked cel is recommended. It's lit at run time, so pieces move without a re-bake.
   - Flat graphic is the fallback.
   - Painted baked light conflicts with moving pieces.
   - Also open: the fonts for the chalkboard and the signs.
3. **The chalkboard's words.**
   - "Human centered" is in the corpus; "secure first", "offline", and "cost effective" aren't. Claude recommends I write them into the corpus in my words, so the twin can talk about what the board shows. The alternative is approving them as lettering quoting my message of 2026-10-21.
   - Which goal lines go beside the Seva line?
   - Is the board scenery, or does it also open the resume?
4. **The signs.** Are the two designs my own, or bought products? Lettering drawn live is recommended either way.
5. **The terminal.** What it shows (real make targets?), its prompt and colors, and whether product names may appear in it.
6. **The cost display.**
   - Its form: a clip-on display or a light bar.
   - Its rows: cloud spend today against the day's ceiling, this month against the month's, and fallback left, labeled as including hosting.
   - Whether amounts appear in the room at all, or only on `/status/`.
7. **Before spec 001.** The recommendation is the laptop in its not-live pose and the cost unavailable. The alternative is a local status read on the stack's edge: a new endpoint, with its span, panel, and disclosure row.
8. **Legibility.** At the room's framing, the terminal and the cost display are a few pixels tall, and the cable is thinner than a pixel. The options:
   - enlarge them as a stylized scale;
   - add a "look closer" view;
   - show the live surfaces at full size in a panel beside the room.
9. **Budgets.** Per-piece caps, and a texture-memory cap for the whole scene (proposed: at most 96 MB on phones), set by the lookdev run. Also, the arrival check's F3 should count image files, not only GLBs.
10. **Spec 003 amendments, before the first hand-made file is committed:**
    - the AI mark follows the record, so hand-made work is marked as a digital creation;
    - a `design` source type for an original design with no photo or prompt.
11. **The 2D room's art.** The catalog's vector drawings are recommended; studio stills could come later.
12. **The monitor.** Part of "Laptop and screen" (recommended, so the `laptop` ID and topic stay), or its own clickable piece.
13. **The artwork.** Original art from the studio, my own art, or none.
14. **The lifecycle.** The recommendation is a new spec 004 that owns the composition and names its amendments to specs 001, 002, and 003. The alternative is editing the unmerged specs 002 and 003.
15. **The studio's folders.** T005 has four. Blender's working files need a fifth, or they go in the workflows folder.
16. **The fit check before I approve a hash.** In the lookdev page, which is one implementation and needs the dev stack, or also a standalone script.
