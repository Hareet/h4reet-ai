# Image-model evaluation for the studio's 2D steps

Status: plan, not run yet · Written: 2026-10-12, by Claude (the lead session), at the Author's direction · Intent: `intent/003-studio-assets.md` (draft) · Runs: the Author's, on the studio machine

This note plans an offline comparison of image models for the studio's 2D steps. Once the comparison has run, the note also records what it found. The studio's pipeline stays outside this repository (intent 003), and only the comparison's results come in here.

## Why

- **The question.** The studio's 2D steps need one image model: look development, the twin's likeness, and restyling the room's photos. Claude's survey of 2026-10-12 (a private page, not in this repository) picked Qwen-Image-Edit-2511, which is Apache-2.0. Qwen-Image-2.1 (2026-09-20) may be better, but its license allows research and evaluation only.
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
- **Territory.** The grant in 2(a) is "worldwide", so no country restriction applies.
- **Outputs.** Outputs aren't "Materials" (1(e) and 1(f)).
  - The only clause on using outputs is 4(b). It covers using "the Materials or any outputs or results therefrom to create, train, fine-tune, or improve an AI model that is distributed or made available". This evaluation does none of that.
  - Arm B's outputs come only from evaluation runs, which 1(i) allows.
  - Publishing them here as evaluation results is our reading of the license. The license itself doesn't say so.
- **6(d):** "You will defend, indemnify and hold harmless us from and against any claim by any third party arising out of or related to your use or distribution of the Materials."
  - So the inputs keep out what that could reach: screens off, logos and the snowboard's graphic covered or cropped, and the artwork above the window covered or out of frame (step 5).
  - The prompts name no game, studio, or artist.
  - Before any output is published, it is checked for anything that slipped through.

**FLUX [dev] Non-Commercial License v2.0** (revised 2025-11-25). As paraphrased from search excerpts, not quoted:
- **Allowed:** its non-commercial purposes include testing and evaluation in a non-production environment, with no direct or indirect payment arising from the model or its output.
- **Excluded:** revenue-generating activity, activity that impacts end users, and training other models for commercial use.

So re-read the license before running arm D, and again before committing any arm D image. Then record in "Results", word for word, with the version and date:
- the definition of non-commercial purposes;
- the clause on outputs;
- any terms on marking outputs or on territories.

**Apache-2.0** (arms A and C) puts no limit on use or outputs.

## Before the runs

1. **Freeze this plan.** The tasks, prompts, seeds, precisions, criteria, and decision rule stay fixed once a run starts. Before then, the Author confirms the decision rule and settles intent 003's question 6, on machine-readable marking. A change after the first run restarts the evaluation, and "Deviations" records it.
2. **Make room.**
   - Take each model's download size from its card.
   - Check free space the way [spec 000's research, R-32](../../specs/000-local-foundations/research.md#r-32-host-disk-space-is-the-windows-drives) does: on the Windows drive that holds WSL's disk and inside WSL, for the downloads plus a 20 GB margin.
   - Download with no agent sessions running.
   - Record each arm's weight files and their size.
3. **Free the GPU.**
   - Stop prod's model server first. With the prod model loaded, the GPU showed 21,768 of its 24,463 MiB in use ([T065's measurement](../merge-requests/2026-10-09-feat-000-us1-local-stack.md)).
   - Meanwhile the twin falls back, within its $2/day sub-budget, or degrades. Before publication, no visitor notices.
   - Afterwards, restart prod at the commit it was running, which its run file names ([R-33](../../specs/000-local-foundations/research.md#r-33-host-stacks-run-the-commit-they-were-started-from-rollback-is-one-command-review-2026-10-08)). Then check that hello answers from the local model.
4. **Pin everything.** Record:
   - ComfyUI's version, and each node pack's commit and license;
   - any model a node pack downloads on its own, such as a background remover or a face model, checked against intent 003's license constraint;
   - each model's Hugging Face repository and revision, and each weight file's sha256;
   - each arm's precision and offloading, for example fp8, or a GGUF quantization with the text encoder offloaded.

   Choose each arm's precision before the runs. A model that doesn't fit at its chosen precision is recorded as a failure, not rerun another way.
5. **Prepare the inputs.**
   - **Before photographing:** turn the screens off; cover or crop out logos and the snowboard's graphic; cover the artwork above the window, or leave it out of frame.
   - **Room photos (3):** the desk with the laptop and monitor; the snowboard's wall; the bicycle's wall. One of them shows the window.
   - **Photos of the Author (5):** front, two three-quarter views, and two profiles, in even light.
   - **Stripping:** strip each photo's metadata (`exiftool -all= -overwrite_original`), re-encode it, and give it an opaque ID. The photos never come into this repository.
6. **Make the style anchor.**
   - **What it is:** Qwen-Image-2512 (Apache-2.0) makes one image from the look prompt below: a person and a prop on a plain background, in flat even light. The Author approves it before any run.
   - **Its file:** strip its metadata, then record its sha256. Every arm uses that stripped file, and this note publishes it.
   - **Its bias:** it may favor the Qwen arms (A and B) slightly, since it comes from their model family. If the Qwen and FLUX arms end within half a point of each other on Style, "Deviations" records a second run with an anchor made another way.

## The tasks

Every arm gets the same inputs, the same prompt text, and the same seeds. The only exception is that T2b and T3b start from each arm's own pick.
- **Mode:** each arm runs in its editing or multi-reference mode.
- **Settings:** steps, guidance, and sampler follow each model's card, at the precision chosen in step 4. The results record them.
- **Seeds:** each prompt runs with four, 1001 to 1004.
- **Inputs:** at most three images per prompt, because arm A works best with one to three.
- **Output names:** each run's save node uses the prefix ARM-TASK-SEED, for example `A-T1a-1001`, with one folder per arm.

| Task | Inputs | Output | Images per arm |
|---|---|---|---|
| T1a Room restyle | One room photo and the anchor | The photo's aspect ratio, about 1.5 megapixels | 3 photos × 4 seeds = 12 |
| T1b Isolated objects | A crop of one object and the anchor | 1024 × 1024 | 3 objects × 2 views × 4 seeds = 24 |
| T2a Generic characters | The anchor | 1024 × 1024 | 4 subjects × 4 seeds = 16 |
| T2b Turnarounds | The arm's best T2a image, and the anchor | 1024 × 1024 | 4 subjects × 2 views × 4 seeds = 32 |
| T3a The Author's head | Two photos of the Author, chosen by view, and the anchor | 1024 × 1024 | 3 views × 4 seeds = 12 |
| T3b The Author's full body | The arm's best T3a front view, and the anchor | 1024 × 1024 | 1 × 4 seeds = 4 |

That is 100 images per arm: 200 for arms A and B, and 400 with the optional arms.

### Prompts

Words in capitals are placeholders, filled from the list after each prompt.

- **Look prompt**, added at the end of every prompt below: "Stylized illustrative realism: clean inked contours, slightly posterized shading, rich saturated color."
- **T1a:** "Repaint this photo in the style of the reference image, in saturated golden-hour light with deep cinematic shadows. Keep every object, its position and proportions, the camera angle, and the layout. Replace screen contents with a plain glow, remove logos and text, and if a window shows, replace its view with a wooden fence and a tree."
- **T1b:** "Only the OBJECT, whole, on a plain light-grey background, in the style of the reference image, VIEW view, flat even light, no shadows."
  - OBJECT: snowboard; bicycle; monitor and laptop.
  - VIEW: front; three-quarter.
- **T2a, people:** "SUBJECT, an original character: full body, A-pose, neutral expression, mouth closed, plain light-grey background, flat even light, long lens, in the style of the reference image."
  - SUBJECT: A woman; A man.
- **T2a, animals:** "SUBJECT, an original character: full body, side view, standing with legs apart and tail straight, mouth closed, plain light-grey background, flat even light, in the style of the reference image."
  - SUBJECT: A dog; A dinosaur.
- **T2b:** "The same character, same clothes and proportions, seen from VIEW, same pose, same background and light."
  - VIEW for the people: the side; the back.
  - VIEW for the animals: the front; the back.
- **T3a:** "A stylized portrait of this person in the style of the reference image: head and shoulders, VIEW view, neutral expression, mouth closed, plain light-grey background, flat even light."
  - VIEW: front; three-quarter; side.
  - Photos for each view: the front gets the front photo and one three-quarter; the three-quarter gets both three-quarters; the side gets both profiles.
- **T3b:** "Full body of this same person, A-pose, neutral expression, plain light-grey background, flat even light, long lens, in the style of the reference image."

## Measurements

- **Peak GPU memory:** before loading each arm, log `nvidia-smi --query-gpu=memory.used --format=csv,noheader -lms 500` for a minute as a baseline, and keep logging through the arm's runs. Report the peak minus the baseline: the reading covers the whole GPU, the Windows desktop included.
- **Time:** the median seconds per image from ComfyUI's log, and each model's load time.
- **Disk:** each arm's weights, in GB.
- **Failures:** out-of-memory errors, whether offloading was needed, and crashes.

## Scoring

**Blinding.** Before anyone scores, give every output a random ID and strip the copies. ComfyUI writes the prompt and the workflow into each PNG, and the workflow names the arm's model files. Keep the key in the studio until scoring ends. For example:

```bash
# out/ holds one folder per arm, named by the save node's ARM-TASK-SEED prefix.
mkdir -p blind && : > key.csv
for f in out/*/*.png; do
  id=$(openssl rand -hex 6)
  if [ -e "blind/$id.png" ]; then echo "ID collision; run again" >&2; exit 1; fi
  cp "$f" "blind/$id.png" && printf '%s,%s\n' "$id" "$f" >> key.csv
done
exiftool -all= -overwrite_original blind/*.png
```

- **Group labels:** each arm gets a group label, G1 to G4, drawn at random and kept in the key.
- **Picks:** the best T2a and T3a images, which T2b and T3b start from, are picked from each group's four images without knowing its arm.
- **Grids:** lay each prompt's outputs side by side, in random order and without labels.
- **Self-scoring:** run the arms headless, through ComfyUI's API or with previews off, and don't look at outputs before scoring. If the Author saw outputs first, "Results" says the Author's scores weren't fully blind.
- **Scorers:** the Author scores everything. For T3, one or two people who know the Author may also score likeness, if the Author wants. They see only the stripped copies, and they will see the Author's likeness.

**Criteria**, each scored from 1 to 5:

| Criterion | Tasks | A 5 means |
|---|---|---|
| Fidelity | All | Does exactly what the prompt asks: the layout kept (T1a), only the object (T1b), the asked view and pose (T2, T3) |
| Style | All | Matches the anchor's rendering (contours, shading, palette), with no drift toward photorealism or another look |
| Consistency | T2b, T3 | The same character across views: face, proportions, clothes, colors |
| Likeness | T3 | Recognizably the Author at a glance |
| Clean | All | No defects: hands, eyes, stray text, melted parts, or broken thin parts such as spokes and straps |
| 3D-ready | T1b, T2, T3b | Usable as image-to-3D input: the whole subject, a clear silhouette, a plain background, flat light |

**Reported** for each arm and task:
- the median over all seeds, the typical result;
- the best seed, what a curated workflow gets.

## Decision rule

Set before the runs. The Author confirms or changes it before the first run.
- **Pooling:** each criterion's scores are pooled across the tasks that score it (Likeness over T3a and T3b, for example), and the arms are compared on the pooled medians.
- **Arm A ships** unless another arm wins.
- **Arm B wins** if its pooled median beats arm A's by at least one point on Likeness or on Consistency, without falling more than half a point behind on any other criterion. If so:
  - the studio requests a commercial license under section 2(b);
  - the studio keeps shipping with arm A until a license is granted.
- **Arm D** wins by the same rule, and its win leads to Black Forest Labs' commercial license instead.
- **If B and D both win,** "Results" reports both margins, and the Author picks which license to pursue.
- **Arm C replaces arm A** as the primary if its pooled average beats arm A's by at least half a point, without falling more than half a point behind on any criterion. Arms B and D are then compared against arm C.
- **A tie**, or a lead only in speed, leaves arm A.

## Publishing the results here

- **What comes in:**
  - comparison grids, as JPEG or WebP about 1,600 px wide, under 500 KB each and 15 MB in all;
  - the style anchor;
  - the scores, the measurements, and a record table.
- **What stays in the studio:** the full-resolution outputs, every input photo, the blinding key, and the studio's workflows. Only the workflows' hashes come in.
- **Making a grid:** build it with ImageMagick, stripping as it writes (`montage … -strip grid.jpg`). Then run `exiftool -all= -overwrite_original grid.jpg`. Without `-overwrite_original`, exiftool keeps an unstripped copy beside the file, named `grid.jpg_original`.
- **Checking:** before each commit:
  - `exiftool -a -G1 -s` on each image shows no EXIF, XMP, IPTC, or GPS tags and no comment, apart from any marking that question 6 settles;
  - `strings` on each image, piped to `grep -i -E 'prompt|workflow|safetensors|/home/'`, prints nothing;
  - `git status --porcelain` lists only the files meant to come in.
- **Approval:** each grid is committed only after the Author has approved it. That covers the T3 grids for the likeness, and the T1 grids for anything that locates the Author or shows a screen, a logo, or someone else's art.
- **The record table:**
  - one row per output in each grid: the grid's file and the output's position in it, and the output's ID, arm, model and revision, license, task, seed, settings, and source (the input photos' opaque IDs, or the prompt's ID);
  - each grid file's sha256.
- **License.** The images aren't MIT.
  - They come in under the media license that intent 003 calls for.
  - Until that license is chosen, they come in under an "all rights reserved" notice in their folder.
  - That notice can be loosened later, while an MIT grant, once published, can't be taken back.
- **Machine-readable marking.** Settle intent 003's question 6 before the first image is committed. One option that leaks nothing: after stripping, add the IPTC digital source type for AI-generated media (`trainedAlgorithmicMedia`) to each image.
- **The likeness.** The Author chose this on 2026-10-12: "that's fine with the likeness too." Git keeps every published image for good, since [ADR 0013](../adr/0013-local-until-publication.md) publishes the history from its first commit. So the T3 grids are committed only after the Author has approved them.
- **Captions.** Every arm B and arm D image says "Evaluation output; not used in the site's assets."

## Results

Not run yet. After the runs, this section holds:
- **Setup as run:** versions, revisions, hashes, precisions, and settings.
- **License texts:** arm D's clauses, quoted as "Why the evaluation is within the licenses" requires.
- **Measurements:** a table per arm.
- **Scores:** a table per arm and task, and whether the Author's scores were blind.
- **Grids:** the published images, with captions.
- **Decision:** what the rule gave, and what the Author decided.
- **Deviations:** anything that differed from this plan, and why.

## Sources

- The Qwen Research License, released 2026-09-20, as the Author supplied it on 2026-10-12.
- Black Forest Labs' [non-commercial license for the FLUX dev models](https://bfl.ai/legal/non-commercial-license-terms), v2.0, revised 2025-11-25.
- Model cards: [Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) and [Qwen-Image-2.1](https://huggingface.co/Qwen/Qwen-Image-2.1).
- Black Forest Labs' [announcement of FLUX.2 klein](https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence).
- The [IPTC digital source types](https://cv.iptc.org/newscodes/digitalsourcetype/), for the marking option.
