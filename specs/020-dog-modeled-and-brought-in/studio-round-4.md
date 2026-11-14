# Spec 020: the dog's studio round 4

Task `brief-dog-r9` (night of 2026-11-14, implementer, Opus 5.5, on 2026-11-14), under rule 13 of the Author's orders, its round 4 bullet. Started from brief-dog-r8's tip (`39c1a1a6`), with `night/record-dog-r3/record-dog-r3` and `night/rounds4-020/rounds4-020` merged in.

**Outcome:**

- **Round 4's brief is written and placed:** `/srv/studio/briefs/dog/4.json`, SHA-256 `79140557361c409c6ca25dd0b72e0f7d1d5d0eca554a5afb01d16d327e27e911`, 25,979 bytes. `line.py brief` passes on a scratch copy and on the placed file. The text is the JSON block at the end of this file, byte for byte.
- **The photo is the concept's image input,** as his order asks. The record says `source: {type: photo}`, carries his words for its licence, and says `likeness: false`. Each entry carries an `approval` ID that his approval of that file's SHA-256 is to take.
- **studio-dog-r9 runs the round.** No studio round ran in this task. Round 3 (`/srv/studio/handoff/dog/3/`, recorded pass) stays the fallback.
- **The photo's SHA-256 isn't here.** This container doesn't mount `/srv/studio/workflows/`, so `sha256sum` on the photo answered "No such file or directory". The brief has the studio take it and write it in its note. That's a question on the page.

`line.py` is unchanged. Nothing went into `assets/**` or the room's code. I didn't create `/srv/studio/handoff/dog/4/`. I opened no image, and didn't list the photos folder or the inbox.

## His words

Rule 13 (2026-11-14, about 21:00Z), in his words:

> "Let's go with the approval of the SHA and use the actual image /srv/studio/workflows/inbox/duck-toller.jpg"

On the photo, from rule 9: the dog in it is "Not my dog", and the photo is "I own it / it's free to use".

The order's round 4 bullet: step 1 is the concept with the photo as its image input (the workflow's reference image), the prompt P-0031's words for pose, size, and markings. The record says `source: {type: photo}`, his words for its licence, and `likeness: false`. Everything after step 1 runs as round 3 did: about 150,000 triangles, the three flags, and the compare against the photo before any handoff.

## The checks before writing

```text
$ git merge refs/heads/night/record-dog-r3/record-dog-r3      # fast-forward to af3edf49
$ git merge refs/heads/night/rounds4-020/rounds4-020          # merge commit 5c43b180
$ grep -n "ROUNDS" scripts/studio/line.py
70:ROUNDS = 4  # the Author, 2026-11-14 (about 21:00Z); spec 017's data-model.md, Brief
$ ls -la /srv/studio/briefs/dog/        # names only below; the photos folder's name shows, and it wasn't opened
1.json  1.result.json  2.json  2.result.json  3.json  3.result.json  photos
$ ls /srv/studio/handoff/dog/
1
2
3
$ cat /srv/studio/briefs/dog/3.result.json
{
  "schema": 1,
  "asset": "dog",
  "round": 3,
  "result": "pass",
  "findings": []
}
```

All three hold: `ROUNDS` is 4, `3.result.json` exists, and there's no `4.json` and no `handoff/dog/4/`.

I read round 3's note (`/srv/studio/handoff/dog/3/note.md`) in full before writing.

## What changed from round 3, and why

Kept from round 3's placed text (`883e2cc5…b47c`):

- `limits`, the 14 tool IDs, `references` (`[]`), `files` (the three GLBs);
- LICENSE.md's text and hash, the rig, the clips, the mark's term, the record's shape, and `likeness: false`;
- the three flags and never `--birefnet`;
- the ban on the photos folder and on listing the inbox.

The file keeps round 3's form: `json.dumps`, two-space indent, trailing newline, ASCII. Every field but `round`, `findings`, and `notes` is identical to round 3's, in the same key order.

- **`round`:** 4.
- **`findings`:** none. Round 3 was recorded pass with no findings (the page's Q264). `line.py` asks for none after a pass.
- **`notes`:**
  - **Header:** round 4, the dog's last, written by brief-dog-r9 under rule 13. Round 3 passed and stays the fallback. The studio reads round 3's note first.
  - **THE AUTHOR'S ORDER FOR THIS ROUND (new):** his words from rule 13, his two answers on the photo, and the order read as three parts: the photo as the concept's reference image, everything after it as round 3, and the record. His earlier words (the item, his size words, his review of round 2, his answer to Q220, the corpus line) are kept as round 3 quoted them.
  - **THE PHOTO: THE CONCEPT'S IMAGE INPUT (replaces "a reference only"):**
    - The studio checks that the photo is a regular file and takes its SHA-256 for the note.
    - It uploads that file byte for byte as `dog-round4-reference.jpg` and checks the copy's SHA-256. The workflow loads that name only, never ComfyUI's own copy under the photo's name.
    - It isn't edited, cropped, re-encoded, or resized; the workflow scales it in memory.
    - It goes into step 3 only. No EXIF, name, or path reaches a GLB, a texture, a handed-off image, the record, or candidate.json.
    - The photos folder stays banned (Q67, Q68, Q76).
  - **WHEN THIS ROUND RUNS:** studio-dog-r9.
    - Its working folder is `/srv/studio/outputs/dog/round4/`, with save prefixes `dog/round4/step1/` and `dog/round4/step3/`.
    - The stop note is `/srv/studio/outputs/dog/round4/stop-note.md`, never in the handoff folder (rule 9).
    - Two new stops: the uploaded copy's SHA-256 isn't the photo's, and no seed stands on four legs with no collar or tag.
  - **COMFYUI:** the three flags, as round 3's. The reference image takes core nodes only, under the tool ID `comfyui`, as every node of round 3's workflows did: LoadImage, ImageScaleToTotalPixels, VAEEncode with the FLUX.2 VAE, and ReferenceLatent. A missing core node, any other node, or a model beyond `tools` stops the round (FR-010).
  - **STEPS:**
    1. Hand: round 3's name, unchanged.
    2. Hand: renamed, "the Author's choice of a photograph of the breed as the concept's reference image, for its white markings; his words on it: "I own it", "it's free to use"". This is where the record carries his words for the photo's licence. The record has no key for a source's licence (`ENTRY_KEYS`, `tools/gates/arrival_check.py` on main). His words are quoted as two halves, because main's R5 reads any `/` in record text as a path (below).
    3. **The concept:** from round 3's step-1 workflow as run (seed 7's, `404dcaae…98bb`), adding only the reference image, the seed, and the save prefix. The prompt and its negative are P-0031's word for word, both quoted whole in the brief. The size and steps are round 3's (2048 × 2048, 28 steps), with round 3's 1536 fallback. Eight seeds.
    4. **The mesh:** round 3's step-3 workflow as run (`e268ba29…fcab7`), with only LoadImage's name and the save prefix changed.
    5. **The build:** a copy of round 3's `build_dog.py` (`f003e6a1…e34a`). About 150,000 triangles (at most 180,000), with the UV seams delimiting the decimation. One 2048 px texture. Pixal3D's UV layout is kept, as round 3 found it had to be. The build step's name says only what the build did. Round 3's record named a re-bake its note says wasn't done (a question on the page).
  - **THE CHECK:** as round 3's, in `round4/`, plus round 3's seam check. Main's arrival check refuses the photo source until his approvals are on main, so a candidate that matches is still handed off and judged dry.
  - **THE LOOK:** adds "no collar, no tag", since the photo's dog wears both.
  - **THE NOTICE and CANDIDATE:** the folder is `handoff/dog/4/` and the round is 4. The folder may also hold the picked concept stripped to image chunks, outside `files`, as round 3's did.
  - **RECORD FORMAT:**
    - `source` is `{"type": "photo", "id": "PH-0002"}`. `PH-0002` appears nowhere on main or in the studio's briefs and records (`PH-0001` is a test fixture's).
    - `likeness` is `false`.
    - `approval` is `A-20261114-dog`, `A-20261114-dog-idle`, or `A-20261114-dog-walk`, by file. Main's naming is `A-<date>-<name>`. These are proposals, and a question on the page.
    - The concept step's name is new. `models_checked` is `"2026-11-11"` on every model step.
  - **THE DRY CHECK OF THIS RECORD (replaces ROUND 2'S HIDDEN LINES):** below.
  - **JUDGING:** a dry judge first: `line.py candidate` without `--record`. Main's arrival check gives P1 on each GLB until his approvals are on main, and those three lines are expected. His approvals carry the five confirmations true; none may read `not_applicable`, since the dog isn't a room file. Only then is the round judged with `--record`.

All 14 tool IDs are on main's `assets/policy/studio-tools.json` with `outputs_ship: true`. The reference image's nodes are ComfyUI core nodes, under `comfyui` as every other node of rounds 2 and 3 was. So no tool is missing, and there's no stop. I couldn't read round 3's workflow as run to list its nodes (Interruptions), so the brief makes a missing node the studio's stop.

## The photo's source, checked

Main's arrival check (`git show main:tools/gates/arrival_check.py`, run from a temporary file) holds a photo source to two rules:

- the entry must carry `approval` (R4, `:2236` to `:2249`);
- an approvals.json entry must name the file's hash with all five `CONFIRMS` true (P1, `:2966` to `:2995`). `recreation_not_photo` is one of them. `not_applicable` is taken only for a room file's `likeness_accepted` (C5).

A dry run of main's `Record` on round 3's handed-off records.json, with only the source, the approval IDs, and the two step names changed:

```text
$ python3 -I -B <tmp>/dry/run2.py <tmp>/ac.py /srv/studio/handoff/dog/3/records.json /tmp/brief-dog-r9-scratch.MT7x/briefs/dog/4.json
names as in the brief: True True
round 4's shape -> []
without approval -> [('R4', 'entries[0] lacks approval'), ('R4', 'entries[1] lacks approval'), ('R4', 'entries[2] lacks approval')]
with the slash -> [('R5', 'entries[0].steps[1].name holds a path'), ('R5', 'entries[1].steps[1].name holds a path'), ('R5', 'entries[2].steps[1].name holds a path')]
```

So the record carries approval IDs, and his licence words are quoted in two halves. The full check (P1) can't pass until his approvals are on main, which is why the round is judged dry.

## The check, then the placement

I wrote the text with the Write tool into a scratch copy of the briefs folder, `/tmp/brief-dog-r9-scratch.MT7x/briefs/dog/`. It held copies of `1.json` to `3.result.json` and nothing from the photos folder. Then I checked it there:

```text
$ python3 -I -B <tmp>/chk/check.py <scratch>/briefs/dog/4.json <scratch>/briefs/dog/3.json
canonical: True ascii: True
keys in order: True
same but round, findings, notes: True
round: 4 findings: []
tools on main, outputs_ship: True 14
  '--fp32-text-enc': 1
  '--use-pytorch-cross-attention': 1
  '--disable-pinned-memory': 1
  '--birefnet': 1
  'round4/stop-note.md': 2
  '/srv/studio/handoff/dog/4/': 4
  'duck-toller.jpg': 3
  '/srv/studio/briefs/dog/photos/': 1
  '"type": "photo"': 1
  '"likeness": false': 1
  "I own it / it's free to use": 3
  '2026-11-11': 1
  '150,000': 3
  'handoff/dog/3/note.md': 1
sha256: 79140557361c409c6ca25dd0b72e0f7d1d5d0eca554a5afb01d16d327e27e911 25979
$ python3 -I -B scripts/studio/line.py brief /tmp/brief-dog-r9-scratch.MT7x/briefs/dog/4.json; echo "exit=$?"
line: pass
exit=0
```

`--birefnet` appears once, as the banned flag.

Then I placed it with the Write tool, the same text, and checked it where it is:

```text
$ cmp <scratch>/briefs/dog/4.json /srv/studio/briefs/dog/4.json && echo identical
identical
$ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/dog/4.json; echo "exit=$?"
line: pass
exit=0
$ sha256sum /srv/studio/briefs/dog/*.json
f1897ad37cc88866b967e24b5b1e89b628d60a7b29f3469ed943e3a219e63b97  /srv/studio/briefs/dog/1.json
65783b3b6be96413b799bf04ae8c750b75dd6d1fefff1cd1b1c9b0245f39ecac  /srv/studio/briefs/dog/1.result.json
d15050f122b7e0c334b0f335c1f47305e9b5675689a29d7009df3f46632a2495  /srv/studio/briefs/dog/2.json
08daa2063dc2255255c0b0c5c6fa7bea83b84df1b0bbaf90dcecb7b82c9ab8bd  /srv/studio/briefs/dog/2.result.json
883e2cc5e633d4bec2a7e03bd64337b63886f2f5437580ad4b265362d5e6b47c  /srv/studio/briefs/dog/3.json
99cf089dfdb586f3aac1d30956d343a2526bfffd336d34b2934ca221e6d4ed7f  /srv/studio/briefs/dog/3.result.json
79140557361c409c6ca25dd0b72e0f7d1d5d0eca554a5afb01d16d327e27e911  /srv/studio/briefs/dog/4.json
$ ls /srv/studio/handoff/dog/
1  2  3
```

The photo's SHA-256, asked for on that one path:

```text
$ test -f /srv/studio/workflows/inbox/duck-toller.jpg && ! test -L … && echo "regular file, not a link"
$ sha256sum /srv/studio/workflows/inbox/duck-toller.jpg
sha256sum: /srv/studio/workflows/inbox/duck-toller.jpg: No such file or directory
$ test -d /srv/studio/workflows/inbox   # and its parents
/srv/studio: a folder
/srv/studio/workflows: not a folder here
/srv/studio/workflows/inbox: not a folder here
```

Implementer containers mount only `briefs/` and `handoff/` under `/srv/studio/`. The file is where his order says, as far as the studio is concerned: round 3's note says the studio opened it there. The brief has studio-dog-r9 take its SHA-256 before step 3 and write it in the note.

## Lint

LINT_PLACEHOLDER

## Questions left on the page (`/night/io/out/questions.md`)

1. **The approval IDs:** do his approvals take `A-20261114-dog`, `A-20261114-dog-idle`, and `A-20261114-dog-walk`, one per file's SHA-256, with all five confirmations true? Recommended: yes. Others: other IDs, edited into the record at intake; or `approval` left out, giving R4 until the record is edited.
2. **The photo's SHA-256:** take it from studio-dog-r9's note, or check it himself? Recommended: the note carries it, and he compares it with one `sha256sum` before approving. Others: the note alone; a read-only mount of that one file for implementer containers.
3. **Round 3's build step name:** it names a re-bake its note says wasn't done. Correct it at intake if round 3 is taken in? Recommended: yes (records.json isn't in `files`, so no GLB hash changes). Others: take it as it is; leave round 3 unused.

## Interruptions

- **2026-11-14, brief-dog-r9:** two permission refusals, and no hook or bash-gate refusal.
  - A permission prompt was denied for a `python3 -I` one-liner that listed the node types in round 3's step-1 workflow as run (`/srv/studio/outputs/dog/round3-r8/step1/seed7/workflow-as-run.json`).
  - A Read of the same file was refused: `/srv/studio/outputs/` is denied by the permission settings.
  - I didn't reach it another way.
- **The photo isn't visible from here** (above).
- **The scratch folders stay:** `/tmp/brief-dog-r9-scratch.MT7x/` (the briefs' copies) and `/tmp/brief-dog-r9.zAUQ/` (main's `arrival_check.py` and the two check scripts). Neither holds a photo or a secret.

## The text placed as `/srv/studio/briefs/dog/4.json` (brief-dog-r9)

```json
{
  "schema": 1,
  "asset": "dog",
  "kind": "avatar",
  "spec": "020-dog-modeled-and-brought-in",
  "round": 4,
  "limits": {
    "bytes": 21000000,
    "triangles": 180000,
    "texture_bytes": 46000000,
    "texture_px": 2048,
    "skeleton": "quadruped, this brief's names (notes, RIG)",
    "bones_required": [
      "Hips",
      "Spine",
      "Neck",
      "Head",
      "Tail",
      "FrontLeftLeg",
      "FrontRightLeg",
      "HindLeftLeg",
      "HindRightLeg"
    ],
    "clips": [
      "idle",
      "walk"
    ]
  },
  "tools": [
    "comfyui",
    "flux.2-klein-4b-base",
    "flux.2-vae",
    "qwen3-4b-its-text-encoder",
    "pixal3d-int8",
    "dinov3-vit-l-patch-16-with-naf",
    "moge-2-vit-l-with-normals",
    "birefnet",
    "trellis.2-shape-vae",
    "trellis.2-texture-vae",
    "blender",
    "gltf-exporter-bundled-with-blender",
    "numpy-bundled-with-blender",
    "claude-opus-5.5"
  ],
  "references": [],
  "findings": [],
  "notes": "ROUND 4 OF THE DOG, ITS LAST (spec 020-dog-modeled-and-brought-in, FR-010 to FR-014; plan section 5; four rounds per asset, line.py's ROUNDS, since the Author's words of 2026-11-14, about 21:00Z). Written by the night-shift implementer task brief-dog-r9 on 2026-11-14, under rule 13 of the Author's orders. Round 3's candidate, /srv/studio/handoff/dog/3/ (task studio-dog-r8's, from prompt P-0031 with the photo as a reference only), was recorded pass with no findings, so this brief's 'findings' are none. Round 3 stays the fallback: nothing in this round changes its handoff folder, its result, or its working files. Read round 3's note, /srv/studio/handoff/dog/3/note.md, before step 1: its lessons hold here. The studio has no repository: everything it needs is here.\n\nTHE AUTHOR'S ORDER FOR THIS ROUND (rule 13, 2026-11-14, about 21:00Z), in his words: \"Let's go with the approval of the SHA and use the actual image /srv/studio/workflows/inbox/duck-toller.jpg\". The dog in it is not his dog (his words: \"Not my dog\"), and the photo is his to use (his words: \"I own it / it's free to use\"). His order reads this way for this round: (1) THE CONCEPT takes the photo as its image input, the workflow's reference image, with P-0031's words for pose, size, and markings; (2) everything after the concept runs as round 3's did: about 150,000 triangles, the three flags, and THE CHECK against the photo before any handoff; (3) the record says the source is the photo, carries his words for its licence, and says likeness false. Main's arrival check takes a photo source only with his approval of each file's SHA-256 (assets/policy/approvals.json, his hand), so the round is judged dry first and recorded only after he approves (JUDGING).\n\nTHE AUTHOR'S EARLIER WORDS, WHICH STILL HOLD. His item: '3. d) \"dog modeled and brought in\"'. His words on the dog (2026-11-14, about 15:18Z): \"it's a 41lb medium size dog, make a generic standing concept based on the same breed\". His review of round 2 (about 17:25Z): \"Okay, dinosaur is approved, and dog seems to have changed the face compared to the concept? Look at the face markings on the concept with white and white on the under body and white feet, common markings of a Nova Scotia Duck Tolling Retriever. Do you want to incorporate those\" (the dinosaur is another asset: nothing in this round touches it). His answer to Q220 (about 18:45Z): \"We have \"~/ComfyUI/input/duck-toller.jpg\" that's an actual photo of a nova scotia duck tolling retriever. Be sure to note the white markings. Can we increase any detail on the run that creates the concept or mesh?\" The corpus says of the dog, in his words: 'Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller.' Nothing else about the dog is stated: add no trait beyond the breed, his size words, and the white markings his words name and the photo shows, and put no name in a prompt, a file, a record, or a note.\n\nTHE PHOTO: THE CONCEPT'S IMAGE INPUT. The one photo is /srv/studio/workflows/inbox/duck-toller.jpg. Before step 3, check that it is a regular file, not a link (if it is missing or a link, stop: WHEN THIS ROUND RUNS), take its SHA-256, and write that SHA-256 in the note: it is the file his order names, and the repository task that wrote this brief can't reach the inbox to take it. Open it with the Read tool to judge the pick and THE CHECK, as round 3 did. Upload that file, byte for byte, to ComfyUI's input under the name dog-round4-reference.jpg, check that the uploaded copy's SHA-256 is the photo's, and give the workflow that name only. ComfyUI's input folder also holds a copy under the photo's own name: no node loads it. Don't edit, crop, re-encode, or resize the file: the workflow scales it in memory, with a core node, to the size the model takes. It goes into step 3 only, as the reference image: never into step 4 (whose input is the picked concept), a texture, a GLB, or the record. Nothing of it (its EXIF, its name, or its path) goes into a mesh, a texture, a GLB, a render or concept copied to the handoff folder, the record, or candidate.json: its pixels reach the dog only through the concept. Open no other image in the inbox, and don't list the inbox. No session opens, views, copies, or lists the photos folder, /srv/studio/briefs/dog/photos/ (Q67, Q68, Q76 stand). The dog in the photo is not the Author's dog: the result is a generic dog of the breed, a likeness of no dog, and its record says likeness false. 'references' stays empty: line.py takes only repository paths there, and the photo is outside the repository. The note records the photo: its path, its SHA-256, that it was the concept's reference image, his words on it (\"Not my dog\"; \"I own it / it's free to use\"), and likeness false.\n\nWHEN THIS ROUND RUNS. When task studio-dog-r9 runs it, queued under the Author's order (rule 13). It waits for nothing else: his approval comes after the round. It STOPS in any of these cases: the photo isn't there, or is a link; the uploaded copy's SHA-256 isn't the photo's; a step needs a tool, a model, or a node not in this brief's 'tools' (the reference image's nodes included: COMFYUI); the runner refuses ComfyUI or a param; a GPU step errors; no seed gives a dog standing on four visible legs with no collar or tag; THE CHECK doesn't match; or any other check this brief asks for can't pass. A stop writes nothing in /srv/studio/handoff/dog/4/, and doesn't create that folder: a handoff folder that holds only notes counts as an answered round, and this is the dog's last. The stop's note is /srv/studio/outputs/dog/round4/stop-note.md, saying what stopped the round and why, the step it reached, and where its frames and files are. Record, and queue nothing more. All of round 4's working files go under /srv/studio/outputs/dog/round4/ (ComfyUI save prefixes dog/round4/step1/ and dog/round4/step3/). Change nothing in round 3's handoff folder or working files (/srv/studio/outputs/dog/round3-r8/ and /srv/studio/outputs/dog/round3/), or in round 1's or round 2's.\n\nCOMFYUI. Steps 3 and 4 run in ComfyUI 0.42.5, core nodes only. Start it only by asking the runner with exactly these params: {\"kind\": \"comfyui\", \"action\": \"start\", \"params\": [\"--fp32-text-enc\", \"--use-pytorch-cross-attention\", \"--disable-pinned-memory\"]}. Ask for no other param, and never --birefnet (ComfyUI's main.py exits 2 on it: it is start_comfyui.sh's own switch). If the runner refuses a param or answers that ComfyUI isn't ready, record what it reports in the stop's note and stop: don't retry with other params. ComfyUI's outputs land under /srv/studio/outputs (the runner's --output-directory). Ask the runner to stop ComfyUI when step 4 is done. Install no node and download no weight. The reference image takes ComfyUI 0.42.5's core nodes only, under the tool ID comfyui as every node of round 3's workflows did: LoadImage, ImageScaleToTotalPixels, VAEEncode with the FLUX.2 VAE, and ReferenceLatent on the conditioning the sampler uses. If ComfyUI 0.42.5 lacks one of them, or the reference image needs any node outside its core or any model beyond 'tools', stop (FR-010): a new tool is the Author's to add.\n\nSTEPS. The record holds them in the man's shape, in this order.\n1. \"the Author's review of an earlier mesh, which asked for the breed's white markings on the face, the under body, and the feet\" (hand).\n2. \"the Author's choice of a photograph of the breed as the concept's reference image, for its white markings; his words on it: \"I own it\", \"it's free to use\"\" (hand). His words are \"I own it / it's free to use\"; the record quotes them as two halves because main's arrival check reads a slash in a record's text as a path (R5; a dry run of main's check on this name with the slash: \"entries[0].steps[1].name holds a path\").\n3. THE CONCEPT, from P-0031 and the photo as its reference image, by a model: FLUX.2 [klein] 4B base with its Qwen3-4B text encoder and the FLUX.2 VAE, in ComfyUI 0.42.5 (core nodes only). Start from round 3's step-1 workflow as run (seed 7's, sha256 404dcaae245ecd4724b672f35798bc30089b9825418086eebea8e6fcf35f98bb) and change only: add the reference image (COMFYUI's nodes, loading dog-round4-reference.jpg), the seed, and the save prefix (dog/round4/step1/). The prompt and its negative stay P-0031's, word for word, as round 3's note gives them (also /srv/studio/outputs/dog/round3-r8/P-0031.txt and P-0031-negative.txt): its words for the pose (standing on all four legs, turned 30 degrees to its left, head level, tail relaxed and low), the size (a medium-size dog of about 41 lb, 18 to 19 kg), and the markings (a narrow white blaze and a white chin; a white throat and a broad white chest running down between the front legs and on under the belly; white toes on all four paws; the red-orange coat). P-0031: \"Character concept art in stylized illustrative realism: soft, slightly simplified forms, painterly hand-painted textures, saturated cinematic colour, soft even light from the front with no dramatic shadows. One generic Nova Scotia Duck Tolling Retriever alone, a medium-size dog of about 41 lb (18 to 19 kg), with a deep red-orange coat and the breed's white markings, clearly visible: a narrow white blaze running up the middle of the muzzle between the eyes, and a white chin; a white throat and a broad white chest that runs down between the front legs and on under the belly; white toes on all four paws. The rest of the coat is red-orange. The dog is standing on all four legs, all four legs and all four white-toed paws fully visible, its body turned 30 degrees to its left in a front three-quarter view, so the white chest and the face are seen. Its head is level and looking ahead, with calm, natural-sized eyes and its mouth closed. Its tail hangs relaxed and low behind it, never raised above its head. The whole body, head to tail, is inside the frame and centred, on a plain flat light grey background with no floor, scenery, or cast shadow. Not photoreal, and not a cartoon with big eyes. No person, no hand, no leash, no collar, no tag, no text, no logo, no lettering, no place, no screen.\" Its negative: \"text, letters, words, numbers, logo, watermark, signature, brand mark, label, caption, lettering, person, human, hand, leash, collar, tag, harness, clothing, screen, room, furniture, scenery, floor, cast shadow, multiple dogs, puppy, sitting, lying down, raised tail, tail above head, curled tail over back, head turned up, front-on view, side view, cropped, cut off, cropped legs, missing legs, extra legs, solid unmarked coat, dark paws, photograph, photorealistic, plastic toy, mascot, big cartoon eyes, chibi, frame, border\". Both go in the note, never in a GLB or the record. The photo's dog sits and wears a collar and a tag, as round 3's note says: P-0031 and its negative ask for a standing dog with neither, and the pick holds to them. The size and sampling steps are round 3's: 2048 x 2048 and 28 steps; if 2048 errors or gives a black frame with the reference image, run every seed at 1536 x 1536, never below 1536. 8 seeds, 1 to 8. Keep every frame, each beside its workflow-as-run.json, under /srv/studio/outputs/dog/round4/step1/seed<N>/, with one sheet of all eight; delete none. Check that no frame is black. Pick the best: the markings closest to the photo and his words, standing on four visible legs, the turn, head level, tail low, and no collar, tag, text, or marks. Write its seed, size, and sha256, and its workflow-as-run sha256, in the note. The Author doesn't review the new concept before the mesh: the round goes on from the pick, and his look approval comes after.\n4. THE MESH and its base-colour texture, from the picked frame, by a model: Pixal3D int8 with DINOv3 ViT-L patch 16 with NAF, MoGe-2 ViT-L with normals, BiRefNet, and the TRELLIS.2 shape VAE and texture VAE, in ComfyUI 0.42.5, as round 3's. The studio agent uploads only the picked frame to ComfyUI's input, as dog-round4-seed<N>.png. Start from round 3's step-3 workflow as run (sha256 e268ba299c06dbd185d3d110727dd3d3c6749e643a117c8119b2310a151fcab7) and change only LoadImage's name and the save prefix (dog/round4/step3/). Its bake stays as round 3's (4096 px, which the build halves to 2048), and its DecimateMesh keeps its 1.5 million faces: the 150,000 target is step 5's. Record this step's own workflow-as-run sha256. If this step errors, keep step 3's frames, record the error's lines, and stop: don't retry with other params.\n5. THE BUILD, by the studio agent's script in Blender 5.2.3, from step 4's mesh, as round 3's: copy round 3's script (/srv/studio/outputs/dog/round3-r8/scripts/build_dog.py, sha256 f003e6a12b21e0ea5de7b5857a7f45b908c3ebcd123d2165a005e6862f03e34a) to /srv/studio/outputs/dog/round4/scripts/ and change the copy only where this round's mesh needs it, never round 3's file. As round 3: (a) decimate to about 150,000 triangles in dog.glb, never more than 180,000, with the UV seams delimiting the decimation, so no texel smears across a seam on the face or the chest; if dog.glb would pass 21,000,000 bytes, lower the count until it fits and say so in the note. (b) One 2048 px base-colour texture, halved from the bake: don't resize it smaller. One 2048 px RGBA texture is about 22.4 million texture bytes with mipmaps, under the 46,000,000 cap; add no other map unless the total stays under it. (c) Keep Pixal3D's UV layout: round 3's trial found that Blender 5.2.3's packer gives the face and the chest less of the texture, not more. Clean, scale, rig, skin, key the clips, and export as round 3's script does, with the glTF exporter bundled with Blender (numpy bundled with Blender where a script needs it). The clip files carry the skeleton and their clip only, no mesh and no texture, each at most 1,000,000 bytes. Record the script as run by its sha256 (workflow_sha256). Each clip's entry then adds its own clip step. The build step's name says what the build did, and nothing it didn't: round 3's record named a re-bake with more of the texture on the face and the chest, which its note says wasn't done. Last, scrub (metadata stripped: no EXIF, no path, no prompt text, no machine or user name) and write the record.\nIf any step needs a tool or model not in this brief's 'tools' (all from main's assets/policy/studio-tools.json with outputs_ship true), STOP the round as WHEN THIS ROUND RUNS says, with a note saying which and why (FR-010): a new tool is the Author's to add. Never use Qwen-Image, FLUX.1 [dev], PuLID, TripoSR, GGUF, or ComfyUI-Manager (UNREVIEWED on the list; Qwen-Image and FLUX [dev] are refused by name whatever the list says). In candidate.json and in the record, name each tool by the ID here, or by a name that lowercases to it with each run of other characters a hyphen (\"ComfyUI\" is comfyui, \"Claude Opus 5.5\" is claude-opus-5.5, \"glTF exporter, bundled with Blender\" is gltf-exporter-bundled-with-blender), at the version on main's list.\n\nTHE CHECK (rule 9's, kept by rule 13: the compare against the photo before any handoff). Build all three GLBs, the record, and the notice in /srv/studio/outputs/dog/round4/ first. Render front.png and side.png of dog.glb at rest there, from the GLB as built (after the decimation and the bake, which must keep the markings). Compare them with the photo and his words, one marking at a time, and write in the note what each shows: the blaze on the face; the white chest running under the belly; the four white feet; the tail's white tip, only if the photo shows one (round 3's note: it doesn't); all on the red-orange coat. Check too that no texel smears across a UV seam on the face or the chest (round 3's way: difference same-view renders of the build and the full source mesh). If any doesn't match, stop: the note is /srv/studio/outputs/dog/round4/stop-note.md, saying which marking doesn't match and how. Only when all match and every check in this brief passes, create /srv/studio/handoff/dog/4/ and write the candidate into it. Main's arrival check refuses the photo source until his approvals are on main (JUDGING): that is no reason to stop, and a candidate that matches is handed off anyway and judged dry.\n\nTHE LOOK (FR-012, FR-013). A stylized, textured, rigged four-legged figure of a generic Duck Toller of medium size, as the picked concept shows it, with the Toller's white markings (THE CHECK), standing in its rest pose, head level and tail no higher than the top of the head (the room scales the model by its rest pose's bounds to 0.62 m tall, lowest point on the floor, facing +z; a raised head or tail makes it wrong). Facing +z, +y up, metres, origin on the floor between the feet. It carries no place, no person, no screen, no logo, no collar, no tag, and no text. No hand bone and nothing held: the dog never takes the paper (spec 020 Q4).\n\nRIG. One skeleton, its bone names exactly as limits.bones_required lists them (no prefix, or one 'prefix:' before each), plus any more bones you need below them (e.g. FrontLeftLeg's lower bones and paw, Tail's chain, Jaw, ears). Name NO bone LeftHand or RightHand, with or without a prefix: the room treats those names as hands. Hips is the root of the deform bones. Both clips target this skeleton's names only; a clip naming a bone the model lacks fails in the room.\n\nCLIPS (FR-005, FR-012). 'idle': a loop of a few seconds, breathing and small head and tail motion, root in place. 'walk': a four-legged walk-cycle loop, root in place (the room moves the figure; no forward travel in the clip), feet not sliding against the gait. No other clip ('idle-holding' and 'take' are not wanted). The first frame of each reads well alone (reduced motion shows the idle's first frame).\n\nFILES AND LIMITS. Three GLB files: dog.glb (kind avatar: the textured, rigged model at rest, no clips required in it), dog-idle.glb and dog-walk.glb (kind animation: each one clip on the same skeleton, the clip's name being idle or walk). Main's caps (assets/policy/caps.json): avatar at most 21000000 bytes, 180000 triangles, 46000000 texture bytes (width times height times 4, times 4/3 for mipmaps); animation at most 1000000 bytes each. Textures at most 2048 px a side. Check each GLB against these before THE CHECK. The check's front.png and side.png renders of dog.glb at rest go in the handoff folder for the Author's review, outside 'files', stripped to image chunks.\n\nTHE MARK (C1, Q204). Each GLB carries the IPTC digital source type mark in KHR_xmp_json_ld: compositeWithTrainedAlgorithmicMedia, the man's term. That term is right only because the record mixes model steps with the Author's two steps by hand (steps 1 and 2). So both hand steps must be in every entry.\n\nTHE NOTICE (Q203). Write LICENSE.md in /srv/studio/handoff/dog/4/, beside the GLBs, outside 'files'. Its text is byte for byte the notice of the man's directory (assets/visitors/man/LICENSE.md on main): 327 bytes of ASCII, sha256 f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159. Here it is as one JSON string; decode it and write the result, with no other byte: \"Copyright (c) 2026 Hareet. All rights reserved.\\n\\nThe files in this directory are not covered by this repository's MIT license. You are welcome to view them and to link to them. Any other use needs the copyright holder's written permission.\\n\\nEach file's provenance is in records.json, and in CREDITS.md at the root of its tree.\\n\". Check that the file's sha256 is that hash before handing off. Don't change a byte: its copyright line is one the Author already filled for his visitors.\n\nCANDIDATE (Q202; hand back to /srv/studio/handoff/dog/4/, only after THE CHECK matches). candidate.json: {\"schema\": 1, \"asset\": \"dog\", \"round\": 4, \"files\": [\"dog.glb\", \"dog-idle.glb\", \"dog-walk.glb\"], \"tools\": [{\"id\": \"<an ID from this brief>\", \"version\": \"<its version on main's list>\"}, ...], \"records\": \"records.json\"}. 'files' lists the three GLBs and nothing else. records.json is named by 'records' alone. line.py refuses records.json, LICENSE.md, and candidate.json in 'files'. Every listed file is a regular file in that folder. The folder holds candidate.json, the three GLBs, records.json, LICENSE.md, this run's note.md, the two renders, and the picked concept stripped to image chunks (outside 'files'). The files arrive in the repository at assets/visitors/dog/ (the record's 'directory'), by the Author's intake. Write nothing in round 1's, round 2's, or round 3's folder.\n\nRECORD FORMAT (records.json; spec 003's contracts/asset-record.md and the arrival check, as assets/visitors/man/records.json is). Top level, in this order: \"schema\": 1, \"directory\": \"assets/visitors/dog\", \"license\": \"all-rights-reserved-2026\", \"entries\" (sorted by file; two-space indent; trailing newline; no other key at any level). Each entry, keys in this order: \"file\"; \"sha256\" (64 hex); \"kind\" (\"avatar\" for dog.glb, \"animation\" for the clips); \"made\" (YYYY-MM-DD, the day this round makes the file); \"source\": {\"type\": \"photo\", \"id\": \"PH-0002\"} (an opaque ID for the photo: no file name, no path); \"likeness\": false; \"steps\"; \"media_license\": \"all-rights-reserved-2026\"; \"approval\": \"A-20261114-dog\" for dog.glb, \"A-20261114-dog-idle\" for dog-idle.glb, \"A-20261114-dog-walk\" for dog-walk.glb. Main's arrival check requires 'approval' on an entry whose source is a photo (R4; a dry run of main's check on round 3's record with only the source changed: \"entries[0] lacks approval\", on each entry); these are the IDs the Author's approvals take when he approves each file's SHA-256, so the record needs no change after. The clips' entries carry the photo source too: they are keyed on the model made from it. Each entry's steps are STEPS' five, in that order; each clip's entry then adds its own clip step. A hand step holds \"name\" and \"by\": \"hand\" and nothing else: no models, no tools. Its name is the quoted text in STEPS: step 2's carries his words for the photo's licence. A model step: \"name\" (what was done, in words: no path, no file name, no extension), \"by\": \"model\", \"models\" (each: name, repository, revision, role primary or auxiliary, license, license_version, as main's list and the man's record give them), \"tools\" (each: name, version, license, license_version), \"models_checked\", \"workflow_sha256\". The concept step's name: \"the concept, from a text prompt and a photograph of the breed as its reference image; eight seeds drawn and one picked by the studio's agent, which wrote the prompt and drove ComfyUI\". The concept and mesh steps name the same models and tools as round 3's concept and mesh steps did, with this round's workflow_sha256s. For a step by the studio agent's script, also \"service\": {\"name\": \"Claude Code\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\", \"disclosure_row\": \"D4\"} and the model Claude Opus 5.5 (repository anthropic/claude-opus-5-5, revision claude-opus-5-5). \"models_checked\": the Author's answer to Q199 and Q207 (2026-11-14, about 17:35Z), in his words: \"we checked 3 days ago 11-11-2026\". So \"models_checked\" is \"2026-11-11\" on every model step: the concept, the mesh, the build, and each clip step. No placeholder, and no other date. Every model and tool a step names must be in this brief's 'tools'. No step, name, or credit calls the model a likeness of the Author's dog or of the dog in the photo. No photo file, no photo name, no EXIF, no path, and nothing else from the studio's inbox, anywhere in the files or the record.\n\nTHE DRY CHECK OF THIS RECORD. Round 3 passed with no findings. A dry run of main's arrival check's record rules on round 3's record, with only this round's source, approval IDs, and step names changed, finds nothing. With the slash in his words, it finds R5 on each entry (STEPS, step 2); without 'approval', R4 on each entry (RECORD FORMAT).\n\nJUDGING. An implementer runs python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dog/4 --brief /srv/studio/briefs/dog/4.json without --record: a dry judge, which also runs main's arrival check. Until the Author's approvals of the three files' SHA-256s are on main, main's arrival check gives P1 on each GLB, \"it needs the Author's approval on the main branch, and no approval names this file's hash\": those three lines are expected, and any other line is a finding of the round. His approvals: one per file in assets/policy/approvals.json, with the IDs in RECORD FORMAT, the file's SHA-256, and every confirmation true (likeness_accepted, nothing_locates, no_screen_logo_text_or_art, recreation_not_photo, record_complete; the dog isn't a room file, so none may read not_applicable), and a non-empty disclosure_line before it shows in the room. Only after they are on main is the round judged again, with --record, and recorded. No credit or disclosure line calls it a likeness of the Author's dog."
}
```
