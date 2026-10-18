# Feature Specification: The Room — the Author's Work Area, Where the Twin Hands Visitors the Resume

**Feature Branch**: `spec/002-the-room`

**Created**: 2026-10-17

**Status**: Draft, clarified on 2026-10-18: the three open questions are answered with their recommended options, on the Author's direction (Clarifications), and no needs-clarification marker remains.

**Input**: the accepted intent, [`intent.md`](intent.md) in this folder (moved from `intent/002-the-room.md`, as `intent/README.md` step 2 asks; Status: accepted on 2026-10-17, the Author: "Yeah, they are accepted. We can always revise them later"), which extends the room and avatars of `intent/000-ai-twin-portfolio.md`. Read with the constitution (1.0.1), `CLAUDE.md`, spec `000-local-foundations` and its gateway contracts, spec `001-cloud-elevation` (draft), and `docs/data-flow-disclosure.md`. Specified overnight by the spec-writer while the Author slept, on the Author's instruction to take the recommended default wherever one exists; every such choice is in Assumptions, and the three decisions that are the Author's alone were marked as needing clarification and listed at the end, until the clarify session below answered them.

## Clarifications

### Session 2026-10-18

The Author was away overnight and gave this direction during the session, on 2026-10-17: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change". With their earlier direction that evening, "trust the recommendations and keep going as far as we can!", each open question takes its recommended option. Each answer quotes the option as the spec worded it. Any of them can be reversed later, with the requirements it touches.

- Q: Scope — what this spec owns, and what it depends on (Q1) → A: "A (recommended)", which read: "This spec owns the room end to end: entry, scene, hand-off, the interactive resume and its narration, the PDF, the three objects' topics, push-to-talk and recognition, the room's telemetry and cost. The twin's conversation core (Phase 1), the avatar rig and voice (Phase 2), and spec 001's edge are dependencies." Reading: User Stories 1–3, 5, and 6 are built and tested without the twin; User Stories 4 and 7 wait for a spec of the twin's conversation core, which needs its own intent or a spec from intent 000 (Scope; Dependencies).
- Q: Where push-to-talk speech is recognized (Q2) → A: "A (recommended)", which read: "The local tier only, for every browser. The disclosure's reason: one recognizer of known quality on every browser and phone; browsers' built-in recognition sends audio to the browser maker's servers in some browsers, which would be a third-party flow; an in-browser model is a large download and slow on phones. Intent 000's words stay; the spec reads "cannot run in the browser" as "cannot run in every visitor's browser at the twin's quality bar"." Reading: FR-030 and row V3 state it, and one ADR records the reading of intent 000's sentence (the plan lists it).
- Q: The name and contact details on the resume (Q3) → A: "B (recommended)", which read: "The PDF carries the full name and one contact channel the Author chooses (for example an address on the h4reet.ai domain from spec 001), each through a filled facts slot; the interactive resume and the narration follow the conversation rule." Reading: FR-017. Until both slots are filled, the PDF's header is the interactive resume's, so nothing unfilled ships. Spec 001's Assumptions say "No mail is received on h4reet.ai", so the example channel needs that revisited, or another channel; the Author chooses it when filling the slot.

## The Author's Words

The spec rests on these. Each is quoted as the intent records it, typing included; the reading beside it is the spec-writer's, to correct where it's wrong.

| # | The Author's words (intent 002 unless noted) | Reading used in this spec |
|---|---|---|
| W1 | Proposed outcome, 2026-10-08: "the user selects their path and avatar and then they are inside my work area, and i will put pictures of my workdesk and window and walls in a folder that we will process in the same pipeline to create teh backgroudn where the avatar sits and the user engages with them. It's supposed to be me, standing at my computer desk, my snowboard hanging on the left side, my bicycle hanging on the right side, window with some art-work above it, and then the user will be able to click on the snowboard for me to speak about hobbies and my general life, and bicycle for traveling adventures, and my laptop and screen for me to talk about my work projects. In the beginning, when the user selects their path and avatar, my avatar will hand them a paper, which is my resume, and they can either look at it now and it will load an interactive clickable resume that my avatar will speak alongside as they click items. They can also look at the paper later, and select to talk about some of the other items in the room, or just have a general voice input button to start any type of chat with my avatar." | User Stories 2–4 and 7; FR-001–FR-031. The intent's own list reading is kept as the scene, the hand-off, the three objects, free talk, and the PDF. |
| W2 | Answer 2: "Everything around the window and desk is owned by me, and will be shown in photos. Our studio pipeline should take an input of a photo and identify which specific part to focus on and recreate in our artistic asset." | The room is built from the studio's recreations, never the photos (FR-006, FR-051–FR-053). |
| W3 | Answer 3: "Yes it will match the corpus and facts, and we can define the interactivity later. There is no existing pdf version, so we can add that to download as well." | One resume source, from the corpus and its filled `facts/` slots, renders both the interactive resume and the PDF (FR-013). This spec defines what is clickable: every item the resume shows (FR-010). |
| W4 | Answer 4: "Which, let's not worry about someone selecting both paths yet. Let's capture that a refresh of the browser page should allow someone to re-visit and select the other path if they want to." | The path is chosen once, at entry, with the avatar; a reload starts a new choice (FR-001, FR-002). For the room this replaces intent 000's decision, quoted below. |
| W5 | Answer 5: "Yes push to talk only, never always listening, and local tier recognition." | FR-026–FR-031. Where the recognition runs, against intent 000's promise, was Q2: the local tier, with the reason disclosed (Clarifications). |
| W6 | Answer 6: "THe visitor shouldnt skip the hand-off animation. I don't see how the room should interact differently on a landscape phone?" | The hand-off has no skip (FR-007). Every screen gets the same room; only input and framing change (FR-046–FR-048). |
| W8 | Answer 8: "We want to recreate a similar view, it's a small window that largely see's an immediate neighboring fence and tree, there won't be any defining information present." | The window's view is recreated with nothing that could locate the Author, and the Author's review of it is recorded (FR-052). |
| W9 | Answer 9: "Yes, that's fine. You can put it in the room spec" (to: a twin that needs Claude most of the time). | A conditional deviation, decided by evaluation and an ADR (Assumptions, Deviations). |
| W10 | Answer 10: "Let's go with (a). The studio already has a pipeline outside this repo. We may want to update the models if possible if newer releases have been made for our particular use-case. Only the outputs should come in" | The studio's pipeline, tools, and models stay outside the repository; only its outputs come in (FR-051). |
| WM | Models, 2026-10-08: "the GPU budget shouldn't be that big of a constraint. We can also fallback to calling API to claude if we can't run that model locally at that spec or a smaller quant model still won't fullfill our "act like a twin who has these experiences and go through a normal chat conversation with someone" pipeline. Which model and fallback is being used across steps, should be configurable by environment variable." | Each step (speech recognition, the twin's conversation, the twin's voice) names its model and fallback in configuration, chosen per environment by an environment variable (FR-033). "Calling API to claude" is Claude through the gateway's paid adapter, Bedrock (Assumptions). |
| WC | Cost, 2026-10-08: "we may consider bumping the cost up as deemed necessary after testing, and that is why we want the cost to be easily configurable throughout, and tracing/telemetry on cost behavior to be seen. This will allow us to change per-cost features at a later time, if we see the room as being higher value and requiring more interaction or so forth." | The room starts inside spec 000's budgets (FR-036) and makes each room feature's cost visible (FR-032, FR-056) so a later budget change is made on evidence. |
| I0-a | Intent 000, Data-flow impact: "Visitor text and audio leave the browser only when the twin's brain or speech cannot run in the browser; each such flow is disclosed on the site with its reason. The engineer/non-engineer choice is a session preference, not stored. Nothing is retained beyond the session without explicit consent." | FR-003, FR-031, FR-057, FR-058; Q2. |
| I0-b | Intent 000, Decisions since 2026-09-07: "Audience mode: the twin asks by voice early in the conversation; a visible toggle then appears and persists, so the choice is reversible without asking again." | Replaced, for the room, by W4: no voice question and no toggle (FR-002). |
| I0-c | Intent 000, Proposed outcome: "speaking in my cloned voice (my choice, and a disclosure item)" and "Inspired-by only — no Rockstar assets, logos, typefaces, or character likenesses; everything is original." | FR-004 (the voice disclosed); FR-052 (asset provenance). |

## User Scenarios & Testing *(mandatory)*

The users are visitors on either path (engineer or non-engineer), on desktop and phone, and the Author as operator. Each story is a slice that can ship and be shown on its own; the order follows the intent's answer 7: the PDF first, then the room.

### User Story 1 - Take the Resume Away as a PDF (Priority: P1)

As a visitor, a hiring manager in particular, I want to download the Author's resume as a PDF that says exactly what the twin says, so that I can file it and share it after the visit.

**Why this priority**: The intent's answer 7 puts it first: it needs only the corpus and its facts, and it helps the interviews this portfolio is for (intent 000) before the room exists. It is a static file, so it works whatever the state of the local tier, the budget, or the kill switch.

**Independent Test**: With the local tier off, download the PDF from the site, without entering the room; compare its claims with the corpus and the filled facts slots; open it with a screen reader; inspect its document properties.

**Acceptance Scenarios**:

1. **Given** the site is served and the local tier is off, **When** a visitor chooses to download the resume, **Then** they receive the PDF.
2. **Given** the PDF is built, **When** each of its claims is traced to the corpus, **Then** every claim traces to a tagged corpus claim or a filled facts slot, none is on a "Do not claim" list, and every number comes from a filled slot or a corpus file.
3. **Given** the PDF, **When** it is opened with assistive technology, **Then** its text is real, selectable text in reading order, with a document title and a language.
4. **Given** the PDF, **When** its document properties are inspected, **Then** they hold the title and the name the resume shows, and nothing else that identifies a person, a machine, a file path, or a tool.
5. **Given** a corpus file or facts slot the resume draws on has changed, **When** the local gate runs and the resume hasn't been rebuilt, **Then** the gate fails.

---

### User Story 2 - Arrive in the Work Area and Receive the Resume (Priority: P1)

As a visitor, I want to choose my path and my avatar, find myself in the Author's work area, and be handed the resume, so that the first thing the room does is lead me to the Author's work.

**Why this priority**: It is the room itself (W1) and answers intent 002's problem: "nothing in it leads a visitor to my resume, my work, or the person behind them." Everything in it is a static asset, so it works without any model, which makes it the room's degraded floor too (Principle I).

**Independent Test**: With the local tier off, open the room, choose a path and an avatar, watch the hand-off, choose "later", then reopen the resume from the room; reload and confirm a new choice is asked for.

**Acceptance Scenarios**:

1. **Given** a visitor opens the room, **When** the page loads, **Then** they are asked for a path (engineer or non-engineer) and one of the pre-generated avatars; the AI disclosure and a link to the data-flow disclosure are visible; and nothing in the room plays until both are chosen.
2. **Given** both are chosen, **When** the visitor confirms, **Then** the work area appears: the twin's avatar standing at the computer desk with its laptop and screen, the snowboard hanging on the left, the bicycle on the right, and the small window with artwork above it, looking out on a fence and a tree.
3. **Given** the work area has appeared, **When** the hand-off plays, **Then** the twin's avatar hands the visitor's avatar a paper, the resume; no control skips it; it ends within 5 seconds; and assistive technology announces it as text.
4. **Given** the hand-off has ended, **When** the visitor chooses to look at the resume now, **Then** the interactive resume opens; **When** they choose later, **Then** the objects and free talk become available, and the resume stays one action away for the rest of the visit.
5. **Given** a visit is under way, **When** the visitor reloads the page, **Then** a new visit starts at the choice of path and avatar, and the hand-off plays again.
6. **Given** the visitor's device asks for reduced motion, **When** the hand-off plays, **Then** a reduced-motion version plays, no longer than the full one.
7. **Given** the local tier is off, or the kill switch is `degraded` or unknown, **When** a visitor enters, **Then** the choice, the work area, the hand-off, and the resume all work.
8. **Given** a device that can't render the room in 3D, **When** a visitor enters, **Then** the work area appears as a still image with the same selectable objects, and the hand-off as a short still sequence.

---

### User Story 3 - Read the Resume While the Twin Narrates It (Priority: P2)

As a visitor, I want to click through the resume and hear the twin tell me about each item at the depth of my path, so that the resume becomes a guided conversation rather than a page.

**Why this priority**: W1's "interactive clickable resume that my avatar will speak alongside as they click items". It builds on the resume source of User Story 1 and the hand-off of User Story 2.

**Independent Test**: Open the interactive resume directly with the local tier off, select every item on each path, and confirm narration starts within a second, with its words shown as text; download the PDF from it.

**Acceptance Scenarios**:

1. **Given** the interactive resume is open, **When** the visitor selects an item, **Then** the twin's narration of that item begins within 1 second, at the depth of the visitor's path, with its words shown as text as they are spoken.
2. **Given** narration is playing, **When** the visitor selects another item, **Then** the first narration stops and the new one begins.
3. **Given** the same item, **When** it is narrated on the engineer path and on the non-engineer path, **Then** the depth differs and the facts are the same (the corpus's two layers).
4. **Given** the local tier is off, or the budget is spent, **When** the visitor selects an item, **Then** its narration still plays: voiced where the voiced narration is published, as text otherwise.
5. **Given** the interactive resume, **When** the visitor chooses to download it, **Then** they receive User Story 1's PDF, whose claims match the interactive resume's one for one.
6. **Given** a narration script, **When** it is checked before publication, **Then** it passes the product evals the twin's answers must pass, and carries the Author's approval.

---

### User Story 4 - Ask the Twin About the Things in the Room (Priority: P2)

As a visitor, I want to click the snowboard, the bicycle, or the laptop and screen and have the twin talk about what that object stands for, so that I meet the person as well as the work.

**Why this priority**: The intent's table of objects, and its problem statement's "the person behind them". It needs the twin's conversation (a dependency, Q1) and the Author's corpus material for hobbies, general life, and travel, which "aren't in the corpus yet, so I write that material first" (intent 002, Constraints).

**Independent Test**: With a topic's corpus material in place and its evals passing, select its object, hold a short conversation, ask something the corpus doesn't hold, and ask where the Author lives; then stop the local model and repeat within, and beyond, the fallback sub-budget.

**Acceptance Scenarios**:

1. **Given** the hand-off has ended and the topic is ready (its corpus material exists and its evals pass), **When** the visitor selects the snowboard, **Then** the twin talks about the Author's hobbies and general life; the bicycle, travel adventures; the laptop and screen, work projects; each from the corpus only, at the depth of the visitor's path.
2. **Given** a conversation is under way, **When** the visitor types a follow-up in the text box, **Then** the twin answers it in the same conversation.
3. **Given** a question the corpus doesn't answer, **When** the visitor asks it, **Then** the twin says it doesn't know.
4. **Given** a topic that isn't ready, **When** the visitor selects its object, **Then** a fixed message says the twin can't talk about that topic yet, and no model is called.
5. **Given** the local model is unhealthy and the paid fallback is within its sub-budget (prod), **When** the visitor asks, **Then** the fallback answers and its cost is attributed to that object's feature; **Given** no route can answer, **Then** a fixed message says the twin can't talk right now and points to the resume and the PDF, and the room stays usable.
6. **Given** a visitor asks where the Author lives, or what the window, the travel stories, or the room reveal about his whereabouts, **When** the twin answers, **Then** it declines to locate him.
7. **Given** the twin is speaking, **When** the visitor selects another object or opens the resume, **Then** the speech stops at once.

---

### User Story 5 - Every Visitor Reaches Everything: Keyboard, Screen Reader, Phone (Priority: P2)

As a visitor who uses a keyboard, a screen reader, or a phone, I want the same room as everyone else, so that the portfolio's first impression doesn't depend on my mouse, my eyes, or my screen.

**Why this priority**: An intent constraint ("every object and resume item can be reached without a mouse or voice") and answer 6. It applies to each story as it ships; this story is its own test pass.

**Independent Test**: A keyboard-only run and a screen-reader run of a whole visit; a portrait run on a 320-pixel-wide screen; frame-rate measurement on the reference phone and desktop; an automated accessibility check.

**Acceptance Scenarios**:

1. **Given** a keyboard only, **When** a visitor goes through a visit, **Then** they can choose the path and avatar, open and keep the resume, select every resume item and every object, type to the twin, use the talk button's keyboard equivalent, and download the PDF, with focus always visible.
2. **Given** a screen reader, **When** a visitor goes through a visit, **Then** every object, resume item, and control has a name and a role, and the twin's words are announced as they arrive.
3. **Given** a phone in portrait, 320 CSS pixels wide, **When** the room is shown, **Then** the twin and the desk, the snowboard, the bicycle, the text box, and the talk button are all on screen without scrolling, and every touch target is at least 44 by 44 CSS pixels.
4. **Given** a phone in landscape and a desktop, **When** the room is shown, **Then** the objects, the hand-off, the resume, and the conversation are the same as in portrait.
5. **Given** the reference phone, **When** the room runs for 2 minutes, **Then** at least 95% of frames render within the time 30 frames a second allows; on the reference desktop, 60.

---

### User Story 6 - The Author Sees What the Room Costs and What Visitors Use (Priority: P2)

As the Author and operator, I want each room feature's cost and use on the dashboard, and each step's model in configuration, so that I can raise or cut what each feature may spend on evidence (WC), and change models without touching code (WM).

**Why this priority**: Principle V and the constitution's "A feature without a graph is not done." It is the Author's ask in WC.

**Independent Test**: In dev, use each object, several resume items, free talk, and the PDF; read the dashboard; switch the conversation step's model by configuration alone and rerun.

**Acceptance Scenarios**:

1. **Given** visitors use objects and resume items, **When** the dashboard is viewed, **Then** it shows the use of each object and each resume item per day, and PDF downloads, with no payloads.
2. **Given** room model calls have been made, **When** the dashboard is viewed, **Then** each room feature's cost today and this month appears next to its latency and errors, within 60 seconds of the call.
3. **Given** room requests were answered degraded, **When** the dashboard is viewed, **Then** they appear by cause.
4. **Given** a usage event, **When** it is inspected anywhere it is stored, **Then** it carries only the event's kind, the object's or item's identifier, and the time.
5. **Given** the Author changes a step's model or fallback in configuration or by its environment variable, **When** the stack next starts, **Then** that step uses it, no source file has changed, and the dashboard shows the model each step used.

---

### User Story 7 - Talk to the Twin About Anything, by Voice (Priority: P3)

As a visitor, I want to hold a button and speak to the twin, so that I can ask anything the way I would ask a person.

**Why this priority**: W1's "general voice input button to start any type of chat". The text box beside it (User Story 4) already lets a visitor talk about anything; voice adds the recognition service and the most sensitive new data flow, so it comes last.

**Independent Test**: In dev, hold the talk button and speak; release; see the transcript and the twin's answer; deny the microphone; stop recognition; speak for longer than 30 seconds; then inspect every log, trace, store, and volume for audio.

**Acceptance Scenarios**:

1. **Given** the talk button, **When** the visitor presses it for the first time, **Then** the browser asks for the microphone then, and never before.
2. **Given** permission, **When** the visitor holds the button, **Then** audio is captured only while it is held, with a recording indicator; **When** they release it, **Then** the transcript is shown and sent to the twin as their turn.
3. **Given** the twin is speaking, **When** the visitor presses the talk button, **Then** the twin stops speaking and capture begins.
4. **Given** recognition can't answer (the local tier is off, the kill switch is `degraded` or unknown, or recognition fails), or the microphone is denied or missing, **When** the visitor presses the button, **Then** they are told so and focus moves to the text box, which still works as far as the twin's own state allows.
5. **Given** an utterance reaches 30 seconds, **When** the limit is hit, **Then** capture stops, the visitor is told, and what was captured is handled as if released.
6. **Given** an utterance yields no words, **When** recognition returns, **Then** the room says it didn't catch that, and the twin isn't called.
7. **Given** a session that used voice, **When** every log, trace, store, and volume of the stack is inspected, **Then** no audio exists in any of them.

---

### Edge Cases

- **Reload during the hand-off:** a new visit starts at the choice; the hand-off plays again in full (FR-002, FR-007).
- **Two tabs:** two independent visits; neither knows the other (FR-003).
- **The local tier returns mid-visit:** the next turn routes local again; nothing the visitor did is lost.
- **The kill switch flips mid-conversation:** a turn already admitted completes; the next one gets the fixed degraded message (spec 000's edge case; FR-035, FR-039).
- **The paid fallback's sub-budget runs out mid-day:** the room degrades as FR-039 says, with no human action; the resume, its narration, and the PDF go on working (FR-038).
- **Recognition answers but the twin is degraded:** the transcript is shown, followed by the fixed degraded message.
- **The visitor speaks another language:** recognition and the twin are English-only in this spec (Assumptions); the twin answers in English, and says so if it can't follow.
- **The tab is hidden or the phone locks while the button is held:** capture stops at once and nothing is sent (FR-026).
- **The 3D context is lost mid-visit:** the room restores it, or switches to the still-image version with the visit's state kept (FR-042).
- **The phone rotates:** the room reframes; the visit's state is kept (FR-047).
- **A facts slot the resume uses is empty:** its text renders nothing or its declared fallback, and the twin never estimates it (the corpus's rule; FR-014).
- **A narration is missing for one path:** the build fails; the room never ships an item without narration on either path (FR-012, FR-016).
- **Adversarial input by voice:** a transcript is visitor input like typed text, adversarial by default (the constitution's injection defense); the red-team suite covers it (FR-050).
- **A visitor asks the twin to read the resume as another person, or to inflate a role:** the twin refuses, as it refuses impersonation and inflation elsewhere (FR-049; Principle VII).
- **Studio outputs arrive with metadata, or recreate something that could locate the Author:** the gate refuses the metadata (FR-053); the asset isn't published without the Author's recorded review (FR-052).
- **The visitor has a very slow connection:** the choice screen comes first and the PDF stays reachable from the site outside the room (FR-018); the room loads behind the choice.

## Requirements *(mandatory)*

Every requirement below is in EARS form. "The room" means the whole visitor-facing experience this spec adds; "the stack" means spec 000's compose topology on whichever tier runs it.

**Scope** (Q1, answered in Clarifications): this spec owns the room end to end (entry, scene, hand-off, interactive resume and narration, the PDF, the three objects' topics, push-to-talk with recognition, the room's telemetry and cost attribution), and depends on, without specifying, the twin's conversation core (persona, corpus-grounded conversation, guardrails: Phase 1, from intent 000), the avatar rig and the cloned voice (Phase 2; ADRs 0010 and 0011; intent 003's studio outputs), and spec 001's public edge and relay.

### Functional Requirements

**Entry and the visit**

- **FR-001**: WHEN a visitor opens the room, THE SYSTEM SHALL ask them to choose a path, engineer or non-engineer, and one of the pre-generated avatars, and SHALL start nothing else in the room until both are chosen.
- **FR-002**: WHILE a visit lasts, THE SYSTEM SHALL keep the path and avatar chosen at entry and offer no way to change the path; WHEN the visitor reloads the page, THE SYSTEM SHALL start a new visit at the choice (W4). For the room, this replaces intent 000's voice question and visible toggle (I0-b).
- **FR-003**: THE SYSTEM SHALL keep a visit's state (the path, the avatar, whether the resume was kept, and the conversation so far) only in the open page, with no cookie and no browser storage, and SHALL keep no record of it on the server beyond the request that carries it (I0-a).
- **FR-004**: THE SYSTEM SHALL show, from the choice screen to the end of the visit, that the twin is an AI representation of the Author and not the Author, and, wherever the twin speaks aloud, that its voice is a cloned voice (I0-c); and SHALL link the data-flow disclosure from the choice screen and from the room.

**The work area**

- **FR-005**: WHEN the visit starts, THE SYSTEM SHALL show the work area with the twin's avatar standing at the computer desk with its laptop and screen, the snowboard hanging on the left, the bicycle hanging on the right, and the small window with artwork above it, looking out on a neighbor's fence and a tree (W1, W8).
- **FR-006**: THE SYSTEM SHALL build the work area only from the studio pipeline's artistic recreations, never from the Author's photos themselves (intent 002, Data-flow impact; W2, W10).

**The hand-off**

- **FR-007**: WHEN the work area first appears in a visit, THE SYSTEM SHALL play the hand-off, in which the twin's avatar hands the visitor's avatar a paper, the resume, and SHALL offer no control that skips it (W6); THE SYSTEM SHALL make the objects, the resume, and free talk available when it ends.
- **FR-008**: THE SYSTEM SHALL end the hand-off within 5 seconds of its start, SHALL announce it as text to assistive technology, and WHERE the visitor's device asks for reduced motion, SHALL play a reduced-motion hand-off of the same length or shorter.
- **FR-009**: WHEN the hand-off ends, THE SYSTEM SHALL offer the visitor the choice to open the resume now or keep it for later, and WHEN they keep it, SHALL keep the resume one action away for the rest of the visit.

**The interactive resume**

- **FR-010**: WHEN the visitor opens the resume, THE SYSTEM SHALL show the interactive resume, in which every item it shows can be selected, and from which the PDF can be downloaded.
- **FR-011**: WHEN the visitor selects a resume item, THE SYSTEM SHALL begin the twin's narration of that item within 1 second, at the depth of the visitor's path, show its words as text as they are spoken, and stop any narration already playing.
- **FR-012**: THE SYSTEM SHALL prepare each resume item's narration ahead of time, one for each path, from the corpus, and SHALL publish a narration only after it passes the product evals the twin's answers must pass and the Author has approved it.
- **FR-013**: THE SYSTEM SHALL render the interactive resume and the PDF from one resume source, drawn from the corpus and its filled facts slots, so that WHEN either is built, the two hold the same claims in the same words (W3), apart from the header, as FR-017 says.

**The resume's content**

- **FR-014**: THE SYSTEM SHALL admit into the resume, its narration, and the PDF only claims the corpus states with a tag sufficient for the twin to say them, and none that is a gap (`[?]`), an empty facts slot, a job description's role scope presented as an accomplishment, or on any "Do not claim" list; every number SHALL come from a filled facts slot or a corpus file.
- **FR-015**: THE SYSTEM SHALL describe each role in the resume and its narration with the ownership verb the corpus rules for it, keeping the two kinds of ownership Principle VII distinguishes apart: "Range is demonstrated, not claimed, and never inflated."
- **FR-016**: WHEN a corpus file or facts slot the resume draws on changes, THE SYSTEM SHALL rebuild the resume, its narration's source, and the PDF; IF any of them was built from an older corpus, or an item lacks a narration for either path, THEN the local gate SHALL fail.
- **FR-017**: THE SYSTEM SHALL show in the PDF's header the Author's full name and one contact channel the Author chooses, each from a filled facts slot, and in the interactive resume's header and the narration only what the corpus's conversation rule allows, with no surname (Q3, Clarifications). WHILE either facts slot is empty, THE SYSTEM SHALL give the PDF the interactive resume's header.

**The PDF**

- **FR-018**: WHEN a visitor asks to download the resume, from the interactive resume or from the site outside the room, THE SYSTEM SHALL deliver the PDF, whatever the state of the local tier, the budget, or the kill switch.
- **FR-019**: THE SYSTEM SHALL produce the PDF as real, selectable text with a document title, a language, and a tagged reading order, and SHALL put nothing in its document properties beyond the title and the name the resume shows.

**Conversations with the twin**

- **FR-020**: WHEN the visitor selects the snowboard, THE SYSTEM SHALL start a conversation in which the twin talks about the Author's hobbies and general life; WHEN the bicycle, travel adventures; WHEN the laptop and screen, work projects (the intent's table of objects).
- **FR-021**: THE SYSTEM SHALL offer, from the end of the hand-off, a text box with which the visitor starts or continues a conversation on any topic; WHEN the visitor sends text, THE SYSTEM SHALL send it to the twin as the visitor's turn, with the conversation so far and the visitor's path.
- **FR-022**: THE SYSTEM SHALL ground every answer of the twin in the corpus, at the depth of the visitor's path, and WHEN the corpus doesn't hold the answer, the twin SHALL say it doesn't know (Principle VIII).
- **FR-023**: WHILE a topic has no corpus material, or its product evals and red-team cases haven't passed, WHEN the visitor selects that topic's object, THE SYSTEM SHALL answer with a fixed message that the twin can't talk about that topic yet, without a model call.
- **FR-024**: WHEN the visitor selects an object, opens the resume, or presses the talk button while the twin is speaking, THE SYSTEM SHALL stop the twin's speech at once.
- **FR-025**: WHEN the twin speaks, THE SYSTEM SHALL show the same words as text, and SHALL let the visitor mute the voice and keep the text.

**Push-to-talk**

- **FR-026**: THE SYSTEM SHALL offer a push-to-talk button beside the text box, SHALL capture audio only while the visitor holds it or its keyboard equivalent, and SHALL capture audio at no other time: never always listening (W5). WHEN the page is hidden while the button is held, THE SYSTEM SHALL stop capturing and send nothing.
- **FR-027**: THE SYSTEM SHALL ask for the microphone only when the visitor first presses the talk button, never on load, and SHALL show a recording indicator while it captures.
- **FR-028**: WHEN the visitor releases the talk button, THE SYSTEM SHALL send the audio for recognition, show the transcript, and send it to the twin as the visitor's turn; WHEN the transcript is empty, THE SYSTEM SHALL say it didn't catch that, without calling the twin.
- **FR-029**: WHEN an utterance reaches 30 seconds, THE SYSTEM SHALL stop capturing, tell the visitor, and handle what was captured as if the button were released.
- **FR-030**: WHEN visitor audio is sent for recognition, THE SYSTEM SHALL recognize it on the local tier only, for every browser, and SHALL state the reason in the data-flow disclosure: one recognizer of known quality on every browser and phone; browsers' built-in recognition sends audio to the browser maker's servers in some browsers, which would be a third-party flow; and an in-browser model is a large download and slow on phones (Q2, Clarifications). An ADR records the reading of intent 000's "Visitor text and audio leave the browser only when the twin's brain or speech cannot run in the browser" as "cannot run in every visitor's browser at the twin's quality bar".
- **FR-031**: THE SYSTEM SHALL use visitor audio only to transcribe it, SHALL discard it once it is transcribed or refused, and SHALL NOT store, log, trace, or send it to any other destination, nor derive from it anything about the speaker: no identification, no voiceprint, and no estimate of age, gender, or emotion (Principle I: "MUST NOT collect biometric data (faces, voiceprints) from visitors").

**Models, routing, and cost**

- **FR-032**: THE SYSTEM SHALL send every model call the room causes (the twin's conversation, speech recognition, and the twin's voice) through the gateway, and SHALL record for each its provider, model, size (input and output tokens, or audio seconds or characters for speech), latency, routing decision, estimated cost from the versioned price table, and the one room feature that caused it.
- **FR-033**: THE SYSTEM SHALL let the operator name, for each step (speech recognition, the twin's conversation, and the twin's voice), its model and its fallback in configuration, chosen per environment by an environment variable (WM); WHEN they change, THE SYSTEM SHALL use them from the next start of the stack, with no source change.
- **FR-034**: THE SYSTEM SHALL route each step local first, with a paid fallback only in production and only while prod's ceilings and the fallback sub-budget allow (spec 000, FR-022, FR-030, FR-031); THE SYSTEM SHALL accept only local adapters for speech recognition and the twin's voice, and IF a configuration names any other for either, THEN the stack SHALL refuse to start.
- **FR-035**: WHEN a room request that needs a model arrives, THE SYSTEM SHALL read the kill-switch state before anything else, and WHILE it is `degraded` or unknown, SHALL answer with the degraded response that names its cause (spec 000, FR-022, FR-038).
- **FR-036**: THE SYSTEM SHALL count every paid call the room causes toward prod's daily and monthly ceilings and the fallback sub-budget, and SHALL add no budget of its own; a change to a ceiling or to the sub-budget is a change to the budget configuration, with an ADR, by the Author's hand (WC; ADR 0001).
- **FR-037**: THE SYSTEM SHALL hold the room's conversation, recognition, and voice requests to spec 000's per-client cap (FR-025 there) and to per-turn input limits set in configuration.

**Degraded modes** (defined before the happy path, Principle I; summarized in Degraded-Mode Behavior below)

- **FR-038**: WHILE the local tier is off, the budget is spent, the kill switch is `degraded` or unknown, or a provider fails, THE SYSTEM SHALL still serve the choice, the work area, the hand-off, the interactive resume with its narration, and the PDF, all of which are static assets (intent 002, Constraints).
- **FR-039**: WHEN no route can answer a conversation turn, THE SYSTEM SHALL show a fixed message, written in advance and not generated by a model, that the twin can't talk right now, with a plain reason for the cause's class (the local tier is resting, today's budget is used, or the service is unavailable) and a pointer to the resume and the PDF, and the room SHALL stay usable.
- **FR-040**: WHEN speech recognition can't answer (it is off, refused by the kill switch, failed, or timed out), or the microphone is denied or missing, THE SYSTEM SHALL tell the visitor and move focus to the text box ("voice degrades to text", intent 002).
- **FR-041**: WHEN the twin's voice can't be produced, THE SYSTEM SHALL show the twin's words as text alone and say once that the voice is unavailable.
- **FR-042**: IF the visitor's device can't render the room in 3D, or can't hold the frame budget at its lowest rendering quality, THEN THE SYSTEM SHALL show the work area as a still image with the same selectable objects, the hand-off as a short still sequence, and the same resume, PDF, and conversation.

**Accessibility and devices**

- **FR-043**: THE SYSTEM SHALL make every choice, object, resume item, and control reachable and operable by keyboard alone, in a logical order, with a visible focus indicator.
- **FR-044**: THE SYSTEM SHALL give every object, resume item, and control a name and a role for assistive technology, and SHALL announce the twin's words and the narration's text as they arrive.
- **FR-045**: THE SYSTEM SHALL meet WCAG 2.2 level AA, with the 3D scene's objects reachable through their accessible equivalents.
- **FR-046**: THE SYSTEM SHALL present the same objects, hand-off, resume, and conversation on every screen from 320 CSS pixels wide, in either orientation (W6); on touch screens, every target SHALL be at least 44 by 44 CSS pixels, and no cue SHALL depend on hover alone.
- **FR-047**: WHILE the screen is in portrait orientation, THE SYSTEM SHALL frame the work area so the twin and the desk, the snowboard, the bicycle, the text box, and the talk button are all on screen without scrolling; WHEN the orientation changes, THE SYSTEM SHALL reframe and keep the visit's state.
- **FR-048**: WHILE the room is shown, THE SYSTEM SHALL hold at least 30 frames a second on the reference phone and 60 on the reference desktop, lowering its rendering quality before it falls below them, and falling back as FR-042 says when the lowest quality can't hold them.

**Honest AI and evaluation**

- **FR-049**: THE SYSTEM SHALL keep the twin's guardrails in the room: it stays disclosed as AI, refuses bad-faith requests (to disparage, impersonate, leak, or exceed its remit), never inflates a role, and never states a number that isn't in the corpus or a filled facts slot (Principles VII and VIII).
- **FR-050**: THE SYSTEM SHALL have product evals for each object's topic (hobbies and general life, travel adventures, work projects) and for the narration, and red-team cases for each that include: locating the Author from the room, the window's view, or the travel stories; instructions injected through typed text and through transcripts; and pressing the twin to claim what a "Do not claim" list forbids. IF the eval suite is below its thresholds or the red-team suite isn't clean, THEN the room SHALL NOT be deployed, and no topic whose cases fail SHALL be offered (FR-023).

**The studio's assets**

- **FR-051**: THE SYSTEM SHALL take into the repository only the studio pipeline's outputs (scene, objects, avatars, and animations), and the source photos SHALL never enter it (W10; intent 003).
- **FR-052**: THE SYSTEM SHALL keep, for each published asset, a provenance record naming the studio output it is, what it recreates, and that it borrows nothing from the source of the art direction ("no Rockstar assets, logos, typefaces, or character likenesses", I0-c); and SHALL publish an asset recreated from the Author's photos only with the Author's recorded review that it shows nothing that could locate him (W8).
- **FR-053**: IF a published image, texture, or 3D asset carries embedded camera, location, or authoring metadata, THEN the local gate SHALL fail.

**Telemetry and the dashboard**

- **FR-054**: WHEN a visitor selects an object or a resume item, opens or keeps the resume, downloads the PDF, sends a typed or spoken turn, or is shown the still-image version, THE SYSTEM SHALL record a usage event carrying only the event's kind, the object's or item's identifier where there is one, and the time: no text, no audio, no path, no avatar, no client address, and no visit identifier.
- **FR-055**: WHEN a room request reaches the stack, THE SYSTEM SHALL emit its telemetry under spec 000's telemetry contract, with model spans in the GenAI semantic conventions and no payloads unless payload sampling is on, which is never on prod (spec 000, FR-026, FR-029).
- **FR-056**: THE SYSTEM SHALL show on the dashboard: each object's and resume item's use per day; PDF downloads; conversation turns per room feature; each room feature's cost today and this month next to its latency and errors; recognition's latency and failures; the voice's failures; the room's degraded responses by cause; the share of visits shown the still-image version; and the model each step used.

**Data flow and the local tier**

- **FR-057**: THE SYSTEM SHALL load every resource the room uses from the site's own origin, with no third-party host for fonts, scripts, models, media, or analytics.
- **FR-058**: THE SYSTEM SHALL list each flow that leaves the visitor's device in the data-flow disclosure, with what it carries, what it never carries, and why (the rows V1–V5 in Data-Flow Disclosure Entries below, and the change to F1), and SHALL show that disclosure on the site, linked as FR-004 says (I0-a: "each such flow is disclosed on the site with its reason"); IF a flow this spec adds has no row, THEN the room SHALL NOT be deployed.
- **FR-059**: WHEN the operator starts the stack with its one command, on any tier and environment, THE SYSTEM SHALL serve the room and every service it needs from the one compose topology, so the room runs on the local tier calling local models (Principle I; spec 000, FR-017, FR-018).

### Key Entities

- **Visit**: one page load, from the choice to the page's close or reload. Holds the path, the avatar, whether the resume was kept, and the conversation, in the page only.
- **Path**: engineer or non-engineer. Chooses the depth of the corpus layer the twin and the narration use; travels with each conversation turn; never stored.
- **Avatar**: one of the pre-generated characters a visitor chooses (intent 000's four placeholders until the studio's final ones replace them); receives the paper in the hand-off.
- **Work area**: the scene, built from the studio's outputs: the twin's avatar, the desk with its laptop and screen, the snowboard, the bicycle, the window with its artwork and view.
- **Room object**: a selectable thing in the work area with an identifier and a topic: snowboard (hobbies and general life), bicycle (travel adventures), laptop and screen (work projects).
- **Topic**: a part of the corpus a room object starts a conversation on; ready when its corpus material exists and its evals pass.
- **Resume source**: the one source both renderings come from, drawn from the corpus and its filled facts slots.
- **Resume item**: a selectable entry of the resume, with an identifier, its claims, and a narration for each path.
- **Narration**: the prepared, evaluated, Author-approved words for one item and one path, with their voiced audio where published.
- **PDF resume**: the downloadable rendering of the resume source.
- **Conversation turn**: a visitor's typed or transcribed text, sent with the conversation so far and the path, and the twin's answer or a fixed message.
- **Utterance**: audio captured while the talk button is held; at most 30 seconds; transient, gone once transcribed.
- **Room feature**: the unit of cost attribution: the snowboard's conversation, the bicycle's, the laptop and screen's, free talk, resume narration, speech recognition, and the twin's voice.
- **Usage event**: a kind, an identifier, and a time; nothing else.
- **Step configuration**: for each step, its model and fallback per environment, chosen by an environment variable.
- **Asset provenance record**: for each published asset, the studio output it is, what it recreates, the no-borrowing statement, and, for photo-derived assets, the Author's location review.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the local tier off and the kill switch tripped, a recorded run completes the choice, the hand-off, the resume, every item's narration, and the PDF download: 100% of those steps succeed.
- **SC-002**: 100% of the claims in the PDF and the interactive resume trace to a tagged corpus claim or a filled facts slot, 0 come from a "Do not claim" list, and the two hold the same claims one for one.
- **SC-003**: A keyboard-only tester and a screen-reader tester each complete a whole visit (choice, hand-off, resume, every item, every object, a typed turn, the PDF) unaided, and an automated check reports 0 WCAG 2.2 AA violations.
- **SC-004**: During a 2-minute visit, at least 95% of frames render within the time 30 frames a second allows on the reference phone, and 60 on the reference desktop.
- **SC-005**: On a typical 4G connection, the choice screen is usable within 3 seconds of opening the page, and the hand-off begins no later than 10 seconds after the page was opened, for 95% of test loads.
- **SC-006**: Narration begins within 1 second of selecting an item for 95% of selections, with the local tier up or off.
- **SC-007**: With the local tier up, the twin's answer begins to appear within 3 seconds of the visitor's turn for 95% of turns, and the transcript of an utterance of up to 15 seconds appears within 2 seconds of release for 95% of utterances.
- **SC-008**: In a moderated test with at least 5 people new to the site, at least 4 find and open the resume, and at least 4 start a conversation from an object, each within 2 minutes and without help.
- **SC-009**: Each topic, and the narration, passes its product evals at the project's thresholds, and the red-team suite with this spec's new cases is clean, before that topic or the room is offered to visitors.
- **SC-010**: 100% of the room's model calls appear on the dashboard under exactly one room feature, with their cost, within 60 seconds.
- **SC-011**: After a test session that used voice, 0 audio, and on prod 0 visitor text, exists in any log, trace, store, or volume of the stack.
- **SC-012**: A full visit makes 0 requests to any host other than the site's own origin, as the browser's network log shows.
- **SC-013**: 0 published images or 3D assets carry camera, location, or authoring metadata; 100% have a provenance record, and 100% of photo-derived ones carry the Author's location review.
- **SC-014**: Switching the conversation step's model in dev changes 0 source files, and the product evals run against the new model unchanged.

## Assumptions

Defaults chosen overnight on the Author's instruction to trust the recommendations; each can be reversed later, as the Author's direction of 2026-10-17 allows (Clarifications).

**Scope and phasing**

- **Scope** follows Q1's answer (A, Clarifications): the room is this spec's; the twin's conversation core, the avatar rig, the cloned voice, and the public edge are dependencies.
- **Phasing** follows answer 7's recommendation (Claude's, "for me to confirm"; the spec reads the intent's acceptance as confirming it): User Story 1 (the PDF) ships in Phase 1, with the corpus; the avatars and the voice come from Phase 2 (the studio's outputs, intent 003); the room's other stories are Phase 3.
- **Placeholders until the studio delivers.** The studio has no workflow for these assets yet (W10), so the room may be built and tested with placeholder geometry and intent 000's placeholder avatars; it is deployed to visitors only with the studio's outputs and their provenance records (FR-052).
- **The visitor's avatar** is shown in the room and is the one the paper is handed to; the camera's framing is the plan's.

**The experience**

- **Narration is prepared ahead of time** (FR-012): one script per item and path, drafted from the corpus (by an agent as a proposal, or by the Author), checked by the product evals, approved by the Author, and voiced ahead of time in the twin's voice once that exists. This keeps the guided tour working with the local tier off, and its runtime cost near zero. The alternative, narration generated live on each click, would be metered under "resume narration" and degrade with the twin; it is a one-line reversal if the Author prefers it.
- **The resume's source** is a file the Author approves, drafted from the corpus as a proposal (agents never edit `corpus/`); both renderings come from it by a deterministic build.
- **No dates or degree on the resume** unless the Author fills facts slots for them: the corpus's profile lists "Employer dates or a degree — none supplied" under "Do not claim".
- **What is clickable** (answer 3 left it to the spec): every item the resume shows.
- **The hand-off lasts at most 5 seconds**, so it needs no skip control under WCAG 2.2's success criterion 2.2.2, Pause, Stop, Hide (moving content that starts on its own, lasts more than 5 seconds, and runs alongside other content needs a way to pause, stop, or hide it). This reconciles W6 with the accessibility constraint.
- **Accessibility target**: WCAG 2.2 level AA; touch targets of at least 44 by 44 CSS pixels; screens from 320 CSS pixels wide.
- **Push-to-talk** is hold-to-talk, with a held key as its keyboard equivalent; visitors who can't hold a button use the text box. A transcript is sent as soon as it is shown; the visitor corrects it with a typed turn. One utterance lasts at most 30 seconds.
- **English only** for recognition, the twin, the resume, and the narration.
- **Reference devices and network**: the plan names them. The spec-writer's default is a mid-range phone released in 2023 or later, a laptop with integrated graphics from 2022 or later, and a 4G profile of about 9 Mbps down with about 150 ms round trip.
- **Response times** (SC-006, SC-007) are conventional targets the plan may tighten once the local models are chosen.

**Data and privacy**

- **Nothing is stored on the visitor's device** beyond the open page (FR-003): no cookie, no browser storage. The HTTP cache of static assets is the browser's own.
- **Usage events carry no path, avatar, or visit identifier** (FR-054), the conservative reading of I0-a's "not stored". Splitting the dashboard by path would add the path to the events, which is a change to the disclosure.
- **No cloud recognizer and no cloud voice** in this spec (FR-034): visitor audio goes only to the local tier (Q2's answer, FR-030), and the Author's cloned voice runs only on the local tier. When either can't answer, the room degrades to text. Adding a non-local recognizer or voice is a spec change with a disclosure row and an ADR.
- **The conversation lives in the page** and travels with each turn (FR-021); the stack keeps no conversation text beyond the request, and prod never samples payloads (spec 000, FR-029).

**Models and cost**

- **"Calling API to claude"** (WM) is Claude through the gateway's Bedrock adapter, the paid adapter spec 000 ships (the intent's own reading). Calling Anthropic's API directly would need a new adapter and an ADR.
- **The room starts inside spec 000's budgets** ($5 a day, $20 a month, the $2-a-day fallback sub-budget; ADR 0001). Every paid call the room causes counts toward the sub-budget, whether Claude answers as fallback or, after W9's decision, as the usual route. Each feature's cost is attributed and shown; no feature gets a cap of its own.
- **The twin's per-call limits** (input size, output cap, timeouts) will differ from hello's. Today `config/budgets.yaml` allows 2,000 input characters and 512 output tokens a call, and its schema caps input at 4,000 characters, well under the twin's corpus context; the global metered limits (4 calls in flight, 60 a minute) also bound the paid fallback's throughput. The budget configuration is the Author's alone, so the plan proposes values, and the schema change they need, and the Author sets them.

**Deviations** (named as the constitution's Governance and `CLAUDE.md` require)

- **Conditional: Claude as the twin's usual route** (W9). If evaluation shows no local model meets the twin's bar, the conversation step's primary may become the paid adapter. Principle I itself is kept, since it prefers local inference "where it meets the quality bar"; what would change is spec 000's FR-022 (routing "MUST be local-first"), its routing schema's rule that every primary is local, ADR 0001, and the constitution's Model access standard ("the initial policy is local-first with Bedrock as fallback inside a capped sub-budget"). It happens only with a recorded evaluation of the local candidates against the twin's bar and an ADR, and its spend stays inside the sub-budget and the ceilings until the Author raises them with another ADR.
- **Inherited: local until publication** (ADR 0013). This spec is reviewed as a branch with a note in `docs/merge-requests/`, not a pull request, as spec 000's Assumptions describe.
- **Not a deviation, but a change to intent 000**: the room replaces intent 000's audience-mode decision (I0-b) with W4's choice at entry, as the intent asks the spec to say.

**Dependencies**

- **The twin's conversation core** (Phase 1, from intent 000): persona, corpus-grounded conversation, guardrails, and its evals. No spec exists for it yet (Q1's answer: a dependency, not this spec's).
- **The Author's corpus material** for hobbies and general life, and for travel, written by the Author first (intent 002, Constraints). Work projects draw on the existing corpus.
- **The avatar rig with lip-sync and the cloned voice** (Phase 2): ADRs 0010 and 0011 are listed as proposed in `docs/adr/README.md` and have no files yet. Until they exist, the twin speaks as text, and the avatar idles.
- **The studio's outputs** (intent 003, which is not in this branch's history).
- **Spec 001's edge and relay** for public exposure, its edge request cap, and a verified client identity. Until then the room runs on the local tier for the Author only.

## Degraded-Mode Behavior

Principle I asks for these before the happy path. "Static" means served from the edge (spec 001), or from the stack's own edge on the local tier, with no model call.

| Capability | Local tier off | Budget spent, or kill switch `degraded` or unknown | Provider failure | Device can't render 3D | Microphone denied or missing |
|---|---|---|---|---|---|
| Choice, work area, hand-off | works (static) | works | works | still image and still sequence (FR-042) | works |
| Interactive resume and narration | works; voiced narration plays where published (static) | works | works | works | works |
| PDF | works (static) | works | works | works | works |
| Object conversations, typed turns | paid fallback within the sub-budget on prod; else the fixed message (FR-039) | the fixed message, naming the cause's class (FR-035, FR-039) | the next route, else the fixed message | works | works |
| Push-to-talk | told; focus to the text box (FR-040) | told; focus to the text box | told; focus to the text box | works | told; focus to the text box |
| The twin's voice | text alone (FR-041) | text alone | text alone | works (heard over the still image) | works |
| Usage events | dropped unless a cloud path exists (spec 001); the visitor sees nothing different | recorded (they spend nothing and call no model) | recorded | recorded | recorded |

## Expected Cost Impact

**Cloud**

- **Static assets** (the room, the avatars, the resume, the narration's audio, the PDF): served from spec 001's edge, close to nothing (intent 002). At an assumed 15 MB a visit, 1,000 visits a month is about 15 GB of transfer; the plan prices that against the edge spec 001 chooses.
- **The twin's conversation**: local first, at zero marginal cost. On the paid fallback, Claude Haiku 5.5 through Bedrock, at the price table's version `2026-10-12.1` ($0.10 per million input tokens, $0.50 per million output). At an assumed 8,000 input tokens (persona, corpus context, and the conversation so far) and 300 output tokens a turn, a turn costs about $0.00095: about 2,100 turns, or about 200 ten-turn conversations, inside the $2-a-day sub-budget. Cached input ($0.01 per million in the same version) would cut the cached part of the input by 90%, less the cost of writing the cache, which the price table doesn't list yet; the plan decides. Past the sub-budget, the room degrades (FR-039) rather than spend.
- **If Claude becomes the usual route** (W9), the same arithmetic applies, and the sub-budget becomes the room's practical daily limit until the Author raises it with an ADR (WC).
- **Speech recognition and the twin's voice**: local only, zero marginal cost (FR-034).
- **Narration**: prepared and voiced ahead of time; zero runtime cost.
- **Usage events and telemetry**: on the local tier's own stores; no cloud cost.
- **Measured**: every room call's cost is on its span and on the dashboard by feature (FR-032, FR-056), so this estimate is checked against measurement before any budget changes.

**Local**

- Recognition and the cloned voice share the RTX 5090 with the twin's model ("the GPU budget shouldn't be that big of a constraint", WM). Where one doesn't fit, that step degrades to text (FR-040, FR-041). Preparing the narration's audio is a one-time local job; processing the photos is the studio's, outside this repository.

**Development time**

- The Claude Team plan, outside the production budget (spec 000, FR-037). Product evals for the new topics run against the local model in dev; any Bedrock eval run counts toward prod's meter (spec 000, FR-031).

## Data-Flow Disclosure Entries

New rows for `docs/data-flow-disclosure.md`, written with the plan and in the same change as the flow (FR-058). Today the disclosure says "No visitor data flows in this spec"; the room is the first visitor flow.

| ID | From → To | Carries | Never carries | Why |
|---|---|---|---|---|
| V1 | the visitor's browser → the site's own origin (the edge) | requests for the room's static assets, the narration's audio, and the PDF: the paths requested (which show which items a visitor plays), the IP address, the user agent | anything to a third-party host (FR-057) | the room, the resume, and the PDF are static assets |
| V2 | the visitor's browser → the stack, through the edge and relay | each conversation turn: the visitor's typed or transcribed text, the conversation so far, the path | audio, the avatar, any identifier of the visit or the visitor beyond what the edge needs for its request cap | the twin's conversation runs on the local tier or its paid fallback (I0-a: "only when the twin's brain or speech cannot run in the browser") |
| V3 | the visitor's browser → speech recognition, while the talk button is held | the utterance's audio, at most 30 seconds | anything after release; anything while the button isn't held; anything kept after transcription (FR-031) | push-to-talk (W5); to the local tier only, for the reason FR-030 states (Q2) |
| V4 | the visitor's browser → the stack's telemetry | usage events: kind, identifier, time | text, audio, path, avatar, client address, visit identifier (FR-054) | the dashboard's use panels (FR-056) |
| V5 | the visitor's browser → the twin's voice, on the local tier | the twin's own words, or the identifier of a prepared line | anything the visitor wrote or said | the twin speaks in its cloned voice (I0-c), a disclosure item in intent 000's words |
| F1 (changed) | the gateway, on prod → Bedrock | from the room: a visitor's conversation turn, the conversation so far, and the corpus context, when the local model can't answer and the sub-budget allows | the visitor's audio; anything that names who asked | today F1 carries hello's message, which only the host's own terminal or tools can send, and the Author's contract-test and eval cases; the room makes visitor text a fallback payload |

## Constitution Check

Applied with the `constitution-check` skill's eight questions.

| Principle | Touched | How this spec complies, or the named deviation |
|---|---|---|
| I. Data-Local by Default | Yes | Every new byte leaving the visitor's device is a disclosure row (V1–V5, F1; FR-058), shown on the site. No visitor biometrics: audio only for transcription, discarded, never characterized (FR-031); avatars stay pre-generated (FR-001). Degraded modes come first (FR-038–FR-042; the table above). The room runs on the local tier with one command (FR-059). Local first per step (FR-034). Recognition runs off the browser, on the local tier (Q2's answer, FR-030), against the Frontend standard's "browser-side speech processing where quality allows": the reason is disclosed, and an ADR records the reading of intent 000's sentence. |
| II. Production-Grade or Not Shipped | Yes | Acceptance scenarios for every story; product evals and red-team cases per topic (FR-050); telemetry and dashboard panels (FR-054–FR-056); a cost estimate above and its measurement (FR-032). The room adds no alert of its own (spec 000's budget alerts cover its spend), so no new runbook entry; the plan adds one if it adds an alert, such as for recognition. |
| III. Intent Before Spec, Spec Before Code, Humans Merge | Yes | From the accepted intent 002; ADRs expected for the art direction (0010) and the cloned voice (0011), for recognition's location (Q2), and for W9 if it happens. |
| IV. Least Privilege | Lightly | No permission, allowlist, or credential is widened by this spec. New: a recognition service on the local tier, browser clients behind spec 001's edge and relay, and studio files entering the repository as untrusted data, checked for metadata and provenance (FR-051–FR-053). |
| V. Cost Is a First-Class Signal | Yes | Gateway-only calls with provider, model, size, and cost (FR-032); attribution per room feature (FR-056); inside spec 000's ceilings and sub-budget (FR-036); the kill switch read first, unknown as degraded (FR-035); the estimate above. |
| VI. Build in Public, Including Failures | Yes | The resume source, the narration scripts, their evals, and the provenance records are public. The recreations of the Author's belongings are public by his choice (W2); the photos never enter the repository (FR-051). |
| VII. Own the Whole Product — and Say Exactly What You Owned | Yes | The resume and its narration use the corpus's ownership verbs and keep the two kinds of ownership apart (FR-015); nothing inflated (FR-014, FR-049). The room shows the product reasoning: the PDF first for interviews, the guided resume, the degraded floor. |
| VIII. Honest AI | Yes | Disclosed as AI, with the cloned voice disclosed (FR-004); corpus-only answers and "I don't know" (FR-022, FR-023); refusals and red-team cases for every new topic, including voice-borne injection and location probing (FR-049, FR-050). |
| Security & Agent Governance | Yes | Visitor input, typed or transcribed, is adversarial by default (FR-050); `corpus/` changes arrive as proposals (Assumptions); no agent touches budgets (FR-036). |

## Open Questions for /speckit-clarify

All three were answered on 2026-10-18 with their recommended options, on the Author's direction (Clarifications): Q1 A, Q2 A, Q3 B. The questions stay as they were asked, because Clarifications quotes them; reversing an answer changes the requirements its bullet names.

### Q1: Scope — what this spec owns, and what it depends on

**Context**: Intent 002 lists the twin (persona, corpus, facts, voice) among the affected systems, and answer 7 recommends "Phase 3, the room itself, as its own spec", needing "Phase 1's persona and corpus, Phase 2's voice and avatar rig, and spec 001's edge". No spec for Phase 1's twin exists yet, so the room's conversations have nothing to call until one does.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | This spec owns the room end to end: entry, scene, hand-off, the interactive resume and its narration, the PDF, the three objects' topics, push-to-talk and recognition, the room's telemetry and cost. The twin's conversation core (Phase 1), the avatar rig and voice (Phase 2), and spec 001's edge are dependencies. | Stays true to intent 002 and answer 7. User Stories 1–3 and 5–6 can ship without the twin; Stories 4 and 7 wait for a Phase 1 spec, which needs its own intent or a spec from intent 000. |
| B | This spec also specifies the twin's conversation core (persona, the conversation itself, guardrails, its evals). | One larger spec; nothing blocks the room's conversations. Mixes intent 000's Phase 1 into intent 002's spec, and the twin's core gets specified from the room's point of view. |
| C | This spec narrows to the room (Phase 3); the PDF resume moves to the Phase 1 spec with the corpus. | A smaller spec; the PDF waits for a Phase 1 spec to be written, delaying the piece answer 7 wanted first. |

### Q2: Where push-to-talk speech is recognized

**Context**: The Author's answer 5 is "local tier recognition". Intent 000 promises "Visitor text and audio leave the browser only when the twin's brain or speech cannot run in the browser", and the constitution's Frontend standard asks for "browser-side speech processing where quality allows". Intent 002 leaves this open: "The spec states the reason (for example, one recognizer of known quality for every browser), or intent 000's wording changes."

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | The local tier only, for every browser. The disclosure's reason: one recognizer of known quality on every browser and phone; browsers' built-in recognition sends audio to the browser maker's servers in some browsers, which would be a third-party flow; an in-browser model is a large download and slow on phones. Intent 000's words stay; the spec reads "cannot run in the browser" as "cannot run in every visitor's browser at the twin's quality bar". | Answer 5 as given. Audio always leaves while the button is held, to the Author's own machine and nowhere else. One ADR records the reading. With the local tier off, voice degrades to text. |
| B | In the browser where the device can run a recognizer at the bar; the local tier otherwise. | Keeps intent 000's words literally. Two recognizers to evaluate and maintain, a large download for phones, and quality that varies by device. |
| C | The local tier only, and the Author revises intent 000's data-flow sentence to allow it. | Simplest to read; changes a privacy promise in intent 000, in the Author's words. |

### Q3: The name and contact details on the resume

**Context**: The corpus's profile says: "Surname: the twin never gives or confirms it in conversation `[A 2026-10-07]`; it may appear in git history and on GitHub." The corpus holds no contact details. The PDF is the document an interviewer files (intent 000: "Success: interviews with the right kinds of companies, then offers.").

| Option | Answer | Implications |
|---|---|---|
| A | As the conversation rule: first name, h4reet.ai, and GitHub, on both the interactive resume and the PDF; no surname and no contact details. | Most private; both renderings match exactly. An interviewer has no name to file and no direct contact beyond the site. |
| B (recommended) | The PDF carries the full name and one contact channel the Author chooses (for example an address on the h4reet.ai domain from spec 001), each through a filled facts slot; the interactive resume and the narration follow the conversation rule. | Serves interviews; the twin still never says the surname. The header is the one deliberate difference between the two renderings (FR-013). Needs two facts slots the Author fills. |
| C | The full name and contact details on both. | Both match exactly; the room shows the surname on screen, in tension with the conversation rule's spirit. |
