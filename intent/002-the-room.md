# Intent: the room, my work area, where my avatar hands visitors my resume
Author: the Author. Status: accepted on 2026-10-17 (the Author: "Yeah, they are accepted. We can always revise them later"). Created: 2026-10-08. Revised: 2026-10-08, with the Author's answers to the open questions; 2026-10-12, with where the studio's pipeline lives (answer 10). Extends the room and avatars in [intent 000](000-ai-twin-portfolio.md); for a later phase, not spec 000.

## Problem
Intent 000 puts visitors in "a shared 3D room" with my twin, but it doesn't say what the room is or what a visitor does in it. Without that, the room is a backdrop: nothing in it leads a visitor to my resume, my work, or the person behind them.

## Proposed outcome
In my words, as I described it on 2026-10-08:

> "the user selects their path and avatar and then they are inside my work area, and i will put pictures of my workdesk and window and walls in a folder that we will process in the same pipeline to create teh backgroudn where the avatar sits and the user engages with them. It's supposed to be me, standing at my computer desk, my snowboard hanging on the left side, my bicycle hanging on the right side, window with some art-work above it, and then the user will be able to click on the snowboard for me to speak about hobbies and my general life, and bicycle for traveling adventures, and my laptop and screen for me to talk about my work projects. In the beginning, when the user selects their path and avatar, my avatar will hand them a paper, which is my resume, and they can either look at it now and it will load an interactive clickable resume that my avatar will speak alongside as they click items. They can also look at the paper later, and select to talk about some of the other items in the room, or just have a general voice input button to start any type of chat with my avatar."

Read as a list, for the spec. This is Claude's reading of the quote above, to correct where it's wrong:
- **Entry:** the visitor selects their path (engineer or non-engineer) and their avatar, then is inside my work area. To see the other path, they refresh the page and choose again; there is no switching mid-visit yet.
- **The scene:** my avatar stands at my computer desk. My snowboard hangs on the left, my bicycle on the right, and there is a small window with artwork above it, looking out on a neighbor's fence and a tree. The background comes from my photos of my desk, window, and walls, processed in "the same pipeline".
- **The hand-off:** my avatar hands the visitor a paper, my resume. They can open it now, as an interactive, clickable resume my avatar narrates as they click items, or keep it for later. The visitor can't skip the hand-off.
- **The objects:**

  | Click | My avatar talks about |
  |---|---|
  | snowboard | hobbies and my general life |
  | bicycle | travel adventures |
  | laptop and screen | my work projects |

- **Free talk:** a push-to-talk voice button starts any kind of chat with my avatar.
- **The resume to keep:** a downloadable PDF of the same resume.

## Affected users and systems
- **Visitors**, on both paths, on desktop and phone.
- **Me:** the photos, and new corpus material for hobbies, life, and travel.
- **`apps/web`:** the 3D room in Three.js, the clickable objects, the hand-off, the interactive resume, and the PDF download.
- **The studio asset pipeline,** outside this repository, which will make the avatars and their animations, extended to take my photos. Only its outputs come in (answer 10; [intent 003](003-studio-assets.md)).
- **The twin:** persona, corpus, facts, and voice.
- **The gateway,** for chat, with each step's model and fallback set by configuration.
- **The local tier,** for speech recognition.
- **Evals and the red-team suite**, for each new topic.
- **Dashboards:** which objects and resume items visitors use, without payloads.

## Constraints
- **Honest AI (Principle VIII).** The twin speaks only from the corpus. Hobbies, general life, and travel aren't in the corpus yet, so I write that material first. The twin stays disclosed as AI, and says so when it doesn't know.
- **Data-local by default (Principle I):** any byte that leaves the visitor's device is disclosed with its reason. No visitor biometrics; avatars stay pre-generated (intent 000).
- **Every capability defines its degraded mode first (Principle I):**
  - the room, the resume, and its PDF load even when the local tier is off, because they are static assets;
  - chat degrades as the twin's routing does: local first, then the configured fallback within its budget, then a degraded answer;
  - voice degrades to text: when speech recognition can't answer, the text box beside the talk button still works.
- **Art direction:** the GTA V-inspired original direction (ADR 0010), with nothing borrowed from the source.
- **Accessibility:** every object and resume item can be reached without a mouse or voice: by keyboard, by screen reader, and by text input beside the voice button.
- **Models, in my words (2026-10-08):** "the GPU budget shouldn't be that big of a constraint. We can also fallback to calling API to claude if we can't run that model locally at that spec or a smaller quant model still won't fullfill our "act like a twin who has these experiences and go through a normal chat conversation with someone" pipeline. Which model and fallback is being used across steps, should be configurable by environment variable."

  Claude's reading:
  - Each step names its model and its fallback in configuration, with an environment variable choosing them per environment: speech recognition, the twin's conversation, and its voice. Changing a model is never a code change. The studio's asset steps choose their models in the studio's pipeline, outside this repository (answer 10).
  - Every call this repository makes still goes through the gateway, local-first, and a paid fallback stays inside prod's ceilings and the fallback sub-budget (the constitution; spec 000's FR-021, FR-022, and FR-030).
  - "Calling API to claude" reads as Claude through the gateway's paid adapter, which is Bedrock in spec 000. Calling Anthropic's API directly would need a new adapter and an ADR.
- **Cost, in my words (2026-10-08):** "we may consider bumping the cost up as deemed necessary after testing, and that is why we want the cost to be easily configurable throughout, and tracing/telemetry on cost behavior to be seen. This will allow us to change per-cost features at a later time, if we see the room as being higher value and requiring more interaction or so forth."

  Claude's reading:
  - The room's spec starts inside spec 000's budgets, and may raise them after testing. A raised ceiling or sub-budget is a change to `config/budgets.yaml` with an ADR (ADR 0001 set the $2/day sub-budget).
  - Spec 000 already makes the ceilings and prices configuration, and puts each call's cost on its trace and on the dashboard. The room's spec adds cost per room feature (each object's conversation, the resume's narration, free talk), so each feature's share is visible before its budget changes.

## Expected cost impact
- **Cloud:**
  - The room, the photos, the resume, and its PDF are static assets at the edge (spec 001), so they cost close to nothing.
  - Chat costs what the twin's routing costs: local first, with Claude as the capped fallback. If the twin's model can't run locally at the quality the twin needs, Claude carries more of the chat. That spend stays inside prod's ceilings, so the twin degrades instead of overspending, until testing shows the room is worth a larger budget (the cost constraint above, and answer 9).
- **Local:**
  - Processing the photos is a one-time job on my machine, in the studio pipeline, outside this repository.
  - Speech recognition and a cloned voice (ADR 0011) run on the local tier beside the twin's model. Where one doesn't fit, that step falls back as configured.
- **Dev time:** the Claude Team plan.

## Data-flow impact
- **My photos become public assets,** by my choice, of things I own. Their EXIF and location metadata are stripped before processing, and what is published is the pipeline's artistic recreation, not the photo.
- **Visitor voice is push-to-talk only, never always listening.** While the talk button is held, audio goes to the local tier for recognition. The disclosure lists that flow with its reason.
- **Object and resume clicks** are telemetry events, with no payloads.
- **Chat text** goes to the gateway, as the twin's does.

## Answers, in my words (2026-10-08; answer 10, 2026-10-12)
Each answer is quoted as I gave it, with Claude's reading beside it.

1. **Which pipeline processes the photos?** "Whichever existing pipeline that we are going to render our avatar or animations should be re-usable for the rest of the assets, so likely studio asset pipeline."
   - Reading: the studio asset pipeline, the one that will render the avatars and their animations, also makes the room's assets.
   - Corrected 2026-10-12: this reading first credited intent 000 with that pipeline and said it already made the avatars. Intent 000 names the studio's asset pipeline only in the rickshaw-walla story, and the studio has no workflow for these assets yet (answer 10).
2. **What the photos show, and the rights.** "Everything around the window and desk is owned by me, and will be shown in photos. Our studio pipeline should take an input of a photo and identify which specific part to focus on and recreate in our artistic asset."
   - Reading: everything shown is mine. The pipeline takes a photo, identifies the part to focus on (the desk, the snowboard, the bicycle, the window and its artwork), and recreates that part in the room's art direction.
3. **The resume's source and form.** "Yes it will match the corpus and facts, and we can define the interactivity later. There is no existing pdf version, so we can add that to download as well."
   - Reading: the interactive resume and a downloadable PDF are both generated from the corpus and its `facts/` slots, so they always match each other. What is clickable is the spec's to define.
4. **Audience mode.** "Which, let's not worry about someone selecting both paths yet. Let's capture that a refresh of the browser page should allow someone to re-visit and select the other path if they want to."
   - Reading: the visitor picks one path at the start, with their avatar. Seeing the other path means refreshing the page and choosing again; the path is a session preference (intent 000), so a refresh starts a new choice. For the room, this replaces intent 000's voice question and visible toggle ("the twin asks by voice early in the conversation; a visible toggle then appears and persists"); the room's spec says so.
5. **Voice input.** "Yes push to talk only, never always listening, and local tier recognition."
6. **Skipping, and phones.** "THe visitor shouldnt skip the hand-off animation. I don't see how the room should interact differently on a landscape phone?"
   - Reading: the hand-off always plays. The room works the same on every screen: the same objects, hand-off, and resume. A phone changes only the input (touch instead of hover, with larger targets) and the framing, and the 3D scene has to hold its frame rate on a phone's GPU. The spec sets that budget and the portrait framing.
7. **Which phase builds it?** "Use your recommendation."
   - **Claude's recommendation, for me to confirm:**
     - **Phase 1, the PDF resume, with the corpus.** It needs only the corpus and its facts, and it helps the interviews this portfolio is for (intent 000) before the room exists.
     - **Phase 2, the avatars, with the studio pipeline's photo step.** The pipeline and its photo step run in the studio, outside this repository; Phase 2 takes in their outputs (answer 10; intent 003).
     - **Phase 3, the room itself, as its own spec.** It needs Phase 1's persona and corpus, Phase 2's voice and avatar rig, and spec 001's edge.
8. **The view through the window.** "We want to recreate a similar view, it's a small window that largely see's an immediate neighboring fence and tree, there won't be any defining information present."
   - Reading: the pipeline recreates a similar view, the neighboring fence and a tree, with nothing in it that could locate me.
9. **A twin that needs Claude most of the time.** "Yes, that's fine. You can put it in the room spec", along with the cost answer under Constraints.
   - Reading: if no local model meets the twin's bar, Claude may be the twin's usual route. The room's spec names that against Principle I's local-first default, with an ADR, and sizes its budget by the testing above.
10. **Where the pipeline lives** (2026-10-12). Claude asked whether the studio's pipeline already exists outside this repository (a) or doesn't exist yet (b). "Let's go with (a). The studio already has a pipeline outside this repo. We may want to update the models if possible if newer releases have been made for our particular use-case. Only the outputs should come in". Then: "We don't have a workflow yet for this, so there would be nothing to export, but it is worth checking what models we already have and what tools are installed like blender".
    - Reading: the studio's pipeline, its tools, and its models stay outside this repository, and it has no workflow for these assets yet. The studio builds that workflow, checking its models against newer releases first. This repository receives only the outputs, under [intent 003](003-studio-assets.md).

## Still open
- **Local-tier recognition against intent 000.** Intent 000 lets audio leave the browser "only when the twin's brain or speech cannot run in the browser". Local-tier recognition means audio always leaves while the button is held. The spec states the reason (for example, one recognizer of known quality for every browser), or intent 000's wording changes.
