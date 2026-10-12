# Image-model evaluation for the studio's 2D steps

Status: plan, not run yet · Written: 2026-10-12, by Claude (the lead session), at the Author's direction · Intent: `intent/003-studio-assets.md` (draft) · Runs: the Author's, on the studio machine

This note plans an offline comparison of image models for the studio's 2D steps. Once the comparison has run, the note also records what it found. The studio's pipeline stays outside this repository (intent 003), and only the comparison's results come in here.

## Why

- **The question.** The studio's 2D steps need one image model: look development, the twin's likeness, and restyling the room's photos. Claude's survey of 2026-10-12 picked Qwen-Image-Edit-2511, which is Apache-2.0. Qwen-Image-2.1 (2026-09-20) may be better, but its license allows research and evaluation only.
- **The Author's direction** (2026-10-12): "Okay, your evaluation scenario and published comparison write-up sounds like a great alternative!" Then: "I think it could live in this repo as a note, and that's fine with the likeness too."
- **What it decides:**
  1. Whether Qwen-Image-2.1 is enough better to ask its licensor for a commercial license.
  2. With the optional arms, whether FLUX.2 [dev] is enough better to buy Black Forest Labs' commercial license, and whether FLUX.2 [klein] 4B should replace the primary.

## The arms

| Arm | Model | License | Role |
|---|---|---|---|
| A | Qwen-Image-Edit-2511 | Apache-2.0 | The primary |
| B | Qwen-Image-2.1 | Qwen Research License, 2026-09-20 | Evaluated only |
| C (optional) | FLUX.2 [klein] 4B | Apache-2.0 | The fallback |
| D (optional) | FLUX.2 [dev], already installed | FLUX [dev] Non-Commercial License v2.0 | Evaluated only |

Arms B and D make nothing that ships. Unless the studio first holds that model's commercial license:
- no asset uses their outputs;
- no LoRA the studio uses for assets is trained on their weights or their outputs.

## Why the evaluation is within the licenses

**Qwen Research License**, from the text of 2026-09-20 that the Author supplied:
- **1(i):** "'Non-Commercial' shall mean for research or evaluation purposes only."
- **2(a)** grants its rights "FOR NON-COMMERCIAL PURPOSES ONLY". **2(b)** says: "You shall not use the Materials for any commercial purpose without obtaining a separate commercial license from us."
- **Outputs aren't "Materials"** (1(e) and 1(f)), and no clause limits what you do with them. So this note can publish arm B's outputs as evaluation results.
- **6(d):** "You will defend, indemnify and hold harmless us from and against any claim by any third party arising out of or related to your use or distribution of the Materials." So every input is the Author's own photo or an original prompt: no brands, no one else's art, and no names of games, studios, or artists.
- **4(b)** applies only to a model trained with its outputs that "is distributed or made available". This evaluation trains none.

**FLUX [dev] Non-Commercial License v2.0** (revised 2025-11-25). Its non-commercial purposes include testing and evaluation in a non-production environment, with no payment arising from them. They exclude revenue-generating activity and activity that impacts end users. An offline run on the studio machine fits. Re-read the clause before running arm D.

**Apache-2.0** (arms A and C) puts no limit on use or outputs.

## Before the runs

1. **Freeze this plan.** The tasks, prompts, seeds, criteria, and decision rule stay fixed once a run starts. A change after that restarts the evaluation, and "Deviations" records it.
2. **Make room.** Download after the C:-and-memory preflight, with no agent sessions running. Record each arm's weight files and their size.
3. **Free the GPU.** Unload prod's model server first: it holds about 21 GiB of the 24 GB ([spec 000's plan, §18](../../specs/000-local-foundations/plan.md#18-cost-impact)). Meanwhile the twin falls back or degrades. Before publication, no visitor notices.
4. **Pin everything.** Record:
   - ComfyUI's version and each node pack's commit;
   - each model's Hugging Face repository and revision;
   - each weight file's sha256.
5. **Prepare the inputs.**
   - **Room photos (3):** the desk with the laptop and monitor; the snowboard's wall; the bicycle's wall. One of them shows the window.
   - **Photos of the Author (5):** front, two three-quarter views, and two profiles, in even light.
   - Strip each photo's metadata (`exiftool -all= -overwrite_original`), re-encode it, and give it an opaque ID. The photos never come into this repository.
6. **Make the style anchor.** Qwen-Image-2512 (Apache-2.0) makes one image from the style prompt below, and the Author approves it before any run.
   - It is the same reference for every arm, and this note publishes it with its sha256.
   - It may favor arm A slightly, since it comes from the same model family. If the scores come out close, "Deviations" records a second run with an anchor made another way.

## The tasks

Every arm gets the same inputs, the same prompt text, and the same seeds.
- **Mode:** each arm runs in its editing or multi-reference mode.
- **Settings:** steps, guidance, and sampler follow each model's card, and the results record them.
- **Seeds:** each prompt runs with four, 1001 to 1004.
- **Inputs:** at most three images per prompt, because arm A works best with one to three.

| Task | Inputs | Output | Images per arm |
|---|---|---|---|
| T1a Room restyle | One room photo and the anchor | The photo's aspect ratio, about 1.5 megapixels | 3 photos × 4 seeds = 12 |
| T1b Isolated objects | A crop of one object and the anchor | 1024 × 1024 | 3 objects × 2 views × 4 seeds = 24 |
| T2a Generic characters | The anchor | 1024 × 1024 | 4 subjects × 4 seeds = 16 |
| T2b Turnarounds | The arm's best T2a image, and the anchor | 1024 × 1024 | 4 subjects × 2 views × 4 seeds = 32 |
| T3a The Author's head | Two photos of the Author, and the anchor | 1024 × 1024 | 3 views × 4 seeds = 12 |
| T3b The Author's full body | The arm's best T3a front view, and the anchor | 1024 × 1024 | 1 × 4 seeds = 4 |

That is 100 images per arm: 200 for arms A and B, and 400 with the optional arms.

### Prompts

Words in capitals are placeholders, filled from the list after each prompt.

- **Style prompt**, added to every prompt below: "Stylized illustrative realism: saturated golden-hour light, deep cinematic shadows, clean inked contours, slightly posterized shading, rich color. An original design."
- **T1a:** "Repaint this photo in the style of the reference image. Keep every object, its position and proportions, the camera angle, and the layout. Replace screen contents with a plain glow, remove logos and text, and if a window shows, replace its view with a wooden fence and a tree."
- **T1b:** "Only the OBJECT, whole, on a plain light-grey background, in the style of the reference image, VIEW view, flat even light, no shadows."
  - OBJECT: snowboard; bicycle; monitor and laptop.
  - VIEW: front; three-quarter.
- **T2a, people:** "SUBJECT: full body, A-pose, neutral expression, mouth closed, plain light-grey background, flat even light, long lens, in the style of the reference image."
  - SUBJECT: A woman; A man.
- **T2a, animals:** "SUBJECT: full body, side view, standing with legs apart and tail straight, mouth closed, plain light-grey background, flat even light, in the style of the reference image."
  - SUBJECT: A dog; A dinosaur.
- **T2b:** "The same character, same clothes and proportions, seen from VIEW, same pose, same background and light."
  - VIEW: the side; the back.
- **T3a:** "A stylized portrait of this person in the style of the reference image: head and shoulders, VIEW view, neutral expression, mouth closed, plain light-grey background, flat even light."
  - VIEW: front; three-quarter; side.
- **T3b:** "Full body of this same person, A-pose, neutral expression, plain light-grey background, flat even light, long lens, in the style of the reference image."

## Measurements

- **Peak GPU memory:** during each arm's runs, log `nvidia-smi --query-gpu=memory.used --format=csv,noheader -lms 500`, and record the maximum.
- **Time:** the median seconds per image from ComfyUI's log, and each model's load time.
- **Disk:** each arm's weights, in GB.
- **Failures:** out-of-memory errors, whether offloading was needed, and crashes.

## Scoring

**Blinding.** Before anyone scores, give every output a random ID, and each arm an anonymous group label. Keep the key in the studio until scoring ends. For example:

```bash
mkdir -p blind && : > key.csv
for f in out/*.png; do
  id=$(openssl rand -hex 4)
  cp "$f" "blind/$id.png" && printf '%s,%s\n' "$id" "$f" >> key.csv
done
```

- **Grids:** lay each prompt's outputs side by side, in random order and without labels.
- **Picks:** the best T2a and T3a images, which T2b and T3b start from, are picked from each group's four the same way.
- **Scorers:** the Author scores everything. For T3, one or two people who know the Author may also score likeness, if the Author wants; they will see the Author's likeness.

**Criteria**, each scored from 1 to 5:

| Criterion | Tasks | A 5 means |
|---|---|---|
| Fidelity | All | Does exactly what the prompt asks: the layout kept (T1a), only the object (T1b), the asked view and pose (T2, T3) |
| Style | All | Matches the anchor, with no drift toward photorealism or another look |
| Consistency | T2b, T3 | The same character across views: face, proportions, clothes, colors |
| Likeness | T3 | Recognizably the Author at a glance |
| Clean | All | No defects: hands, eyes, stray text, melted parts, or broken thin parts such as spokes and straps |
| 3D-ready | T1b, T2, T3b | Usable as image-to-3D input: the whole subject, a clear silhouette, a plain background, flat light |

**Reported** for each arm and task:
- the median over all seeds, the typical result;
- the best seed, what a curated workflow gets.

## Decision rule

Set before the runs. The Author confirms or changes it before the first run.
- **Arm A ships** unless another arm wins.
- **Arm B wins** if its median beats arm A's by at least one point on Likeness (T3) or Consistency (T2b), without falling more than half a point behind on any other criterion. If so:
  - the studio requests a commercial license under section 2(b);
  - the studio keeps shipping with arm A until a license is granted.
- **Arm D** wins by the same rule, and its win leads to Black Forest Labs' commercial license instead.
- **Arm C replaces arm A** as the primary if it beats arm A by at least one point on the average of all criteria. Both are Apache-2.0.
- **A tie**, or a lead only in speed, leaves arm A.

## Publishing the results here

- **What comes in:**
  - comparison grids, as JPEG or WebP about 1,600 px wide, under 500 KB each and 15 MB in all;
  - the style anchor;
  - the scores, the measurements, and a record table.
- **What stays in the studio:** the full-resolution outputs and every input photo.
- **Metadata:** strip each image (`exiftool -all=`), and check that nothing remains. ComfyUI writes the prompt and the workflow, input filenames included, into every PNG it saves.
- **The record table:** one row per published image, with its ID, arm, model and revision, license, task, seed, settings, and sha256.
- **License.** The images aren't MIT.
  - They come in under the media license that intent 003 calls for.
  - Until that license is chosen, they come in under an "all rights reserved" notice in their folder.
  - That notice can be loosened later, while an MIT grant, once published, can't be taken back.
- **The likeness.** The Author chose this on 2026-10-12: "that's fine with the likeness too." Git keeps every published image for good, since [ADR 0013](../adr/0013-local-until-publication.md) publishes the history from its first commit. So the T3 grids are committed only after the Author has seen them.
- **Captions.** Every arm B and arm D image says "Evaluation output; not used in the site's assets."

## Results

Not run yet. After the runs, this section holds:
- **Setup as run:** versions, revisions, hashes, and settings.
- **Measurements:** a table per arm.
- **Scores:** a table per arm and task.
- **Grids:** the published images, with captions.
- **Decision:** what the rule gave, and what the Author decided.
- **Deviations:** anything that differed from this plan, and why.

## Sources

- The Qwen Research License, released 2026-09-20, as the Author supplied it on 2026-10-12.
- Black Forest Labs' [non-commercial license for the FLUX dev models](https://bfl.ai/legal/non-commercial-license-terms), v2.0, revised 2025-11-25.
- Model cards: [Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) and [Qwen-Image-2.1](https://huggingface.co/Qwen/Qwen-Image-2.1).
- Black Forest Labs' [announcement of FLUX.2 klein](https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence).
