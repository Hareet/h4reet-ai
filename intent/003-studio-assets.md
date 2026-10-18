# Intent: the studio's assets, brought in as outputs only
Author: the Author. Status: accepted on 2026-10-17 (the Author: "Yeah, they are accepted. We can always revise them later"). Created: 2026-10-12. Covers the avatars and animations of [intent 000](000-ai-twin-portfolio.md) and the room's assets of [intent 002](002-the-room.md); for Phase 2, not spec 000 or 001.

## Problem
Intent 000 promises "an animated AI twin of me" and "four pre-generated avatars", and intent 002 makes the room from my photos in "the same pipeline". That pipeline is the studio's, and it lives outside this repository. Nothing here says how its work arrives: which files, in what form, under which license, checked how, or with what record of the models that made them. The studio also has no workflow for these assets yet, and its newest model is from late 2025.

Without that, a generated file could land in this public repository under a license that forbids publishing it, at a size a phone can't hold, or with metadata that locates me.

## Proposed outcome
In my words (2026-10-12), answering where the pipeline lives:

> "The studio already has a pipeline outside this repo. We may want to update the models if possible if newer releases have been made for our particular use-case. Only the outputs should come in"

> "We don't have a workflow yet for this, so there would be nothing to export, but it is worth checking what models we already have and what tools are installed like blender"

My choices among the options Claude offered (2026-10-12), in the options' words:
- **The record:** "Models, versions, licenses". "Each asset's record names the models that made it, their versions and licenses, and its source (a photo or a prompt)."
- **The license:** "Separate media license". "Code stays MIT. Assets get their own, stricter license (for example, all rights reserved or CC BY-NC-ND), chosen in the spec."
- **The twin's look:** "A stylized likeness". "Made from photos of me. My face becomes a public asset by my choice, like the cloned voice."

On Qwen-Image-2.1, whose research license doesn't allow shipping what it makes (2026-10-12):

> "Okay, your evaluation scenario and published comparison write-up sounds like a great alternative!"

And on where it lives (2026-10-12):

> "I think it could live in this repo as a note, and that's fine with the likeness too."

Read as a list, for the spec. This is Claude's reading, to correct where it's wrong:
- **The boundary.** The studio's pipeline, with its workflows, models, tools, and code, stays outside this repository. This repository receives what it makes: the twin's avatar, the four visitor avatars, their animations, and the room's assets. The studio is Artificial Indian Games (intent 000).
- **The record.** Each asset arrives with a public record of its models, their versions and licenses, and its source. The photos themselves never come in.
- **The license.** The assets carry their own license, stricter than the code's MIT, chosen in the spec. For media, this answers the question the hygiene note raised on 2026-10-07.
- **The twin's look.** A stylized likeness of me, in ADR 0010's art direction.
- **The studio's workflow.** The studio builds one for these assets. Before it makes them, it checks each step's model against newer releases.
- **The comparison.** A newer model whose license rules out shipping its work, such as Qwen-Image-2.1 under its research license, is evaluated offline against the shipping choice, and the comparison is published as a note in this repository, likeness comparisons included. Its outputs don't ship unless the studio gets a commercial license, and the note's images follow the same rules as assets: stripped metadata, a record, and the media license.
- **On arrival.** An asset merges only when it fits the rig's format and a phone's budget, carries no metadata, and has a complete record whose licenses allow publishing it.

## Affected users and systems
- **Visitors**, who download the assets on desktop and phone.
- **Me:** I take the photos, run the studio's pipeline, and choose its models. My likeness and my room become public assets, by my choice.
- **The studio's pipeline**, outside this repository: a new workflow for these assets, and perhaps newer models.
- **`apps/web`:** the rig (Phase 2) and the room (Phase 3) load the assets.
- **This repository:** the assets, their records, and their license beside the MIT license; the checks an asset passes before it merges; the reviewer.
- **The edge** (spec 001), which serves the assets as static files.
- **The local tier:** the studio's jobs run on the GPU that prod's model server uses.
- **ADR 0010** (the rig and the art direction), which sets the format the assets must meet.

## Constraints
- **Only outputs come in.** No workflow, model, tool, or code of the studio's enters this repository. Principle VI governs this repository; the records say what made each asset, and the rickshaw-walla page tells the pipeline's story (intent 000).
- **Data-local by default (Principle I).** My photos stay on my machine, where the pipeline runs. Their EXIF and location data are stripped, nothing in an output locates me, and what's published is the pipeline's recreation, not the photo (intent 002). Visitors still choose pre-generated avatars, with no visitor biometrics.
- **Degraded mode first (Principle I).** The assets are static files, so they load when the local tier is off (intent 002). The spec says what a visitor sees when one fails to load, or when a phone can't hold the scene.
- **My likeness.** It's mine to publish, by my choice, as the cloned voice is (ADR 0011). The twin stays disclosed as an AI (Principle VIII); a likeness makes that disclosure matter more.
- **Licenses.** Each model's license must allow publishing its outputs on a site that also promotes the studio. If a step's license doesn't, the step changes models or its output stays out. That includes licenses hidden inside a step, such as the non-commercial face models behind PuLID, and territorial clauses: a public site displays its outputs everywhere, so a license that forbids display in some countries rules its model out.
- **Git keeps everything.** ADR 0013 publishes this repository's history from its first commit, so an asset committed under the wrong license, or a texture that locates me, stays public in every clone. Assets merge only after their license is settled and their files are scrubbed.
- **Art direction.** ADR 0010's GTA V-inspired original direction, with nothing borrowed from the source (intent 000).
- **Phones.** The assets fit a budget that holds the room's frame rate on a phone's GPU (intent 002, answer 6).
- **The GPU.** Prod's model server holds about 21 GiB of the GPU's 24 GB (spec 000's plan, §18), so the studio's heavier jobs can't run beside it. While one runs, prod's twin falls back within its sub-budget or degrades, as spec 000 routes it.
- **Production-grade (Principle II).** The assets are part of the product: checked before they merge, with their size and load time measured.

## Expected cost impact
- **Cloud:** the assets are static files at the edge (spec 001): a few to a few tens of megabytes on a first visit, cached after. Where they're stored (git, Git LFS, or object storage) decides whether a storage or transfer bill appears; the spec measures it.
- **Local:** the studio's jobs cost electricity. While one holds the GPU, prod's twin falls back to Bedrock within its $2/day sub-budget, or degrades. Before publication, with no visitors, that costs next to nothing.
- **Tools:** a paid tool the studio adopts (an add-on, a service) is the studio's cost, outside this project's budget.
- **Dev time:** the Claude Team plan.

## Data-flow impact
- **Visitors:** no new byte leaves a visitor's device. Their browser requests the assets from the edge, as it does the rest of the site.
- **My photos** stay on my machine, because the studio's pipeline runs there. If a step ever used a hosted service, my photos would leave my machine: that's my choice, and the step's record names the service.
- **My likeness** becomes public by my choice, as a stylized recreation, never as the photos. It's my own data, not a visitor's.
- **The records** are public. They name models, versions, licenses, and sources, never a photo's location or metadata.
- **Hidden metadata.** ComfyUI writes each prompt and workflow, input filenames included, into the PNGs it saves, and a GLB can carry the same in its extras. None of it is published.

## Open questions
1. **ADR 0010 first?** The rig decides what the studio delivers: glTF or VRM, which facial standard (ARKit's 52 blendshapes, the 15 visemes, or VRM's expressions), and the phone budget. Claude recommends writing ADR 0010 before the studio builds its workflow, so nothing is made twice. Claude's survey of 2026-10-12 leans toward the convention three.js's TalkingHead library expects (glTF, a Mixamo-compatible skeleton, ARKit's 52 blendshapes, and the 15 Oculus visemes), because VRM's five vowels have no closed-lip shapes.
2. **Where the files live:** in git, in Git LFS, or in object storage at the edge with their hashes in git. GitHub meters LFS past its free allowance, so the survey leans toward the final files in plain git, served from object storage by their hashes.
3. **Which media license,** and how it's marked per directory.
4. **Checks on arrival:** which run in `make check`, and which are the reviewer's.
5. **Yielding the GPU:** a runbook entry for unloading prod's model before a studio job and restoring it after.
6. **Disclosing the likeness:** whether the twin's disclosure should say the avatar is an AI-made likeness, and whether the EU AI Act's transparency rules (Article 50, applying from 2 August 2026) reach it, including machine-readable marking of synthetic audio and images such as the cloned voice.
7. **When.** Claude's recommendation, for me to confirm:
   - ADR 0010 now, ahead of Phase 2, because it's the studio's target.
   - The studio's workflow on my schedule, outside this repository's lifecycle, once ADR 0010 is written. Until publication, its GPU time costs next to nothing.
   - This intake's spec with Phase 2's avatars; the room's assets come through the same intake in Phase 3.
