# Studio round 2 of the dog: the brief, written, then placed

## Placed: brief-dog-r6 (night of 2026-11-13, implementer, Opus 5.5, on 2026-11-14)

Task `brief-dog-r6` followed the recommended answer to brief-dog-r5's question (Q195): it recorded round 1, then placed this text as `/srv/studio/briefs/dog/2.json`. `line.py` is unchanged (no diff against brief-dog-r5's tip). **Outcome: round 1 is recorded `fail` with one finding, `2.json` is placed and its check passes, so `studio-dog-r5` can run.**

The checks before writing, all as the supervisor expected:
- `/srv/studio/briefs/dog/1.json`: SHA-256 `f1897ad37cc88866b967e24b5b1e89b628d60a7b29f3469ed943e3a219e63b97`, the same as before the record and after it.
- `/srv/studio/handoff/dog/1/` holds `note.md`, `note-2.md`, `note-3.md`, `note-4.md`, and no `candidate.json`.
- Before this task, `/srv/studio/briefs/dog/` held no `1.result.json` and no `2.json`. The photos folder wasn't opened, viewed, copied, or listed.

```text
# round 1 recorded, from this branch
$ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dog/1 --brief /srv/studio/briefs/dog/1.json --record; echo "exit: $?"
candidate.json: absent (limit: a file in the handoff folder)
arrival-check: not run, since the candidate's files or its record's directory are missing
line: 1 finding; round 1 fails
exit: 1

$ cat /srv/studio/briefs/dog/1.result.json
{
  "schema": 1,
  "asset": "dog",
  "round": 1,
  "result": "fail",
  "findings": [
    "candidate.json: absent (limit: a file in the handoff folder)"
  ]
}
```

The recorded finding is the same as the text's `findings`, word for word, so the text needed no change.

- `/srv/studio/briefs/dog/1.result.json`: SHA-256 `65783b3b6be96413b799bf04ae8c750b75dd6d1fefff1cd1b1c9b0245f39ecac`.
- `/srv/studio/briefs/dog/2.json`, written with the Write tool: SHA-256 `d15050f122b7e0c334b0f335c1f47305e9b5675689a29d7009df3f46632a2495`, the text's hash below. It is byte-identical (`cmp`) to the JSON block at the end of this file.

```text
$ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/dog/2.json; echo "exit: $?"
line: pass
exit: 0
```

Interruptions: none. No hook or bash-gate refusal. No code or test changed and no `make` target ran.

What follows is brief-dog-r5's record, as it was.

Task `brief-dog-r5` (night of 2026-11-13, implementer, Opus 5.5, on 2026-11-14), the brief half of the dog's round 2 (the Author's orders, rule 9, "Round 2 for both", about 15:45Z). He wrote: "each asset goes on as round 2, which `line.py` allows (three rounds per asset; round 1 made nothing judged, and its notes say why)". The brief is to be written to `/srv/studio/briefs/dog/2.json` from brief-dog-r4's rewrite (`studio-round-1.md`) and checked with `line.py brief`. After that, `studio-dog-r5` runs it.

**Outcome: the text is ready and checked, but it isn't at `/srv/studio/briefs/dog/2.json`, because the check can't pass there tonight.** `line.py` allows round 2 only after round 1's *recorded failure*, and round 1 has no result. I didn't write the file, because a `2.json` would also block recording that failure (check d below). So `studio-dog-r5` has no brief and shouldn't run. The question is on the page.

## `/srv/studio/briefs/dog/1.json`, left as found

SHA-256 `f1897ad37cc88866b967e24b5b1e89b628d60a7b29f3469ed943e3a219e63b97`. This isn't the `c0a8eef9…` that brief-dog-r4 recorded, because line-dog-020 changed it at 15:48Z. It now holds brief-dog-r4's rewrite (`341bc8d6…`) with one difference: CANDIDATE names that run's note `note-5.md` where the rewrite says `note-4.md`. Its handoff folder, `/srv/studio/handoff/dog/1/`, holds `note.md` to `note-4.md` and no `candidate.json`. `note-4.md` is studio-dog-r4's stop: the brief on disk was still brief-dog-r1's when it ran. This task changed neither folder.

## Why round 2 can't pass

`order_findings` (`scripts/studio/line.py:519` to `:537`) takes a round-*n* brief only when round *n−1* has a handoff, *and* `<briefs>/<asset>/<n−1>.result.json` records `fail`, *and* the brief's `findings` equal that result's findings, verbatim. Round 1 has a handoff folder (notes only), so the first check holds. It has no `1.result.json`, so the second fails. The rule 9 paragraph's reading ("which `line.py` allows") holds for the round count, not for this condition.

A result is written only by `line.py candidate <handoff>/dog/1 --brief <briefs>/dog/1.json --record` (`line.py:1200`), a judge's step. Check (b) shows what it would record for round 1: one finding, `candidate.json: absent (limit: a file in the handoff folder)`. Recording a round can't be undone ("a round is judged once", `line.py:1219`). It isn't this task's step or an implementer's brief-writing step, so I didn't run it with `--record`.

**Why there's no real `2.json`.** Judging re-checks the round's brief in full (`judge`, `line.py:1168`), and that check refuses a round-1 brief when any later brief exists (`line.py:493`). With a `2.json` beside it, `1.json` stops passing, so round 1 can't be judged or recorded (check d). Then `2.json` could never pass either, and deleting it from `/srv/studio/briefs/` is the kind of delete outside the workspace that the bash gate refused brief-dog-r4. So I checked the text on scratch copies (`/tmp/brief-dog-r5.2CX4zg/`) against the real handoff folder and main's policy.

## The checks

```text
# (a) the round-2 text beside a copy of 1.json, against the real handoff folder
$ python3 -I -B scripts/studio/line.py brief <scratch>/r2/dog/2.json; echo "exit: $?"
round: 2 (limit: after round 1's recorded failure; it has no result)
line: 1 finding
exit: 1

# (b) what judging round 1 would record: the real handoff folder against a copy of 1.json, no --record
$ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dog/1 --brief <scratch>/r1/dog/1.json; echo "exit: $?"
candidate.json: absent (limit: a file in the handoff folder)
arrival-check: not run, since the candidate's files or its record's directory are missing
line: 1 finding; round 1 fails
exit: 1

# (c) the same text once round 1 has the result (b) would record: a scratch 1.result.json beside the copies
$ python3 -I -B scripts/studio/line.py brief <scratch>/r2ok/dog/2.json; echo "exit: $?"
line: pass
exit: 0

# (d) judging round 1 once a 2.json sits beside it (copies), no --record
$ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dog/1 --brief <scratch>/r2/dog/1.json; echo "exit: $?"
line: can't run: the brief doesn't pass line.py brief: round: 1 (limit: the asset's latest round; round 2 already exists)
exit: 2
```

The text's SHA-256: `d15050f122b7e0c334b0f335c1f47305e9b5675689a29d7009df3f46632a2495`. `line.py` is unchanged.

## What the text changes from brief-dog-r4's rewrite

Only the parts the order changes. The limits, the 14 tools, the references (`[]`), the source paragraph, the look, the rig, the clips, the files, the record format, and judging stay word for word. Main's `studio-tools.json` and `caps.json` are unchanged since round 1's brief: (c) re-checks them from `refs/heads/main`.

- **`round`: 2**, and the header says why it's round 2: round 1's handoff holds only notes and no `candidate.json`.
- **`findings`:** round 1's recorded failure, verbatim, as `line.py` requires: `["candidate.json: absent (limit: a file in the handoff folder)"]`. That is (b)'s finding. If the recorded result differs, the brief takes the recorded text.
- **ComfyUI:** `"params": ["--fp32-text-enc", "--use-pytorch-cross-attention", "--disable-pinned-memory"]` for every step that runs in ComfyUI (steps 1 and 3), from the allowlist in his install `ee0e5e90` (Q188, Q189). Nothing else, and never `--birefnet`. If the runner refuses a param, the studio records what it says and stops.
- **Step 3:** runs with the attention flag. If it still stops, the studio keeps step 1's frames, records the lines and the step it reached, stops, and queues nothing more (rule 9: "record, and queue no more").
- **Handoff:** `/srv/studio/handoff/dog/2/`, `candidate.json`'s `"round": 2`, and this run's note `/srv/studio/handoff/dog/2/note.md`. Nothing is written in round 1's folder.
- **Source:** unchanged from the rewrite, which already says this: step 1 is the studio's, from a text prompt alone, with no image input. The record's `"source": {"type": "prompt", "id": …}` is a type the arrival check accepts (`tools/gates/arrival_check.py:2291`: photo, prompt, asset, or design). It also keeps `"likeness": false`, and no credit calls it a likeness of the Author's dog. `references` holds no photo. The photos folder is named once, as a ban: no session opens, views, copies, or lists it (Q67, Q68, Q76). This session didn't either.

## Question left on the page (`/night/io/out/questions.md`)

How does the dog get a round-2 brief that `line.py brief` passes, when round 1 has no recorded result? Recommended: a judge task runs `line.py candidate /srv/studio/handoff/dog/1 --brief /srv/studio/briefs/dog/1.json --record`, which records round 1 as `fail` with (b)'s one finding. Then this task runs again and writes the text below (its `findings` equal to the recorded ones) to `2.json`, and the check passes as (c) does. After that, `studio-dog-r5` runs. Nothing may write a `2.json` before that record (check d). Others: the `line.py` change from brief-dog-r4's question (a round counts as answered only with a `candidate.json`) lands first, and round 1 is briefed again; or the Author moves the notes out of `/srv/studio/handoff/dog/1/`. The dinosaur's round 2 needs the same record first (`/srv/studio/handoff/dinosaur/1/` also holds notes only).

## Interruptions

None. This task hit no hook or bash-gate refusal. The post-edit hook flagged two lint findings (SIM115) in my scratch generator under `/tmp`, and I fixed them there. That was a lint finding, not a refusal. The scratch folder stays in `/tmp`, because brief-dog-r4's `rm -r` of its scratch folder was refused.

This task changes no code and no test, so no small test covers it, and it ran no `make` target (rules 2 and 4).

## The text, for `/srv/studio/briefs/dog/2.json` once round 1 is recorded

```json
{
  "schema": 1,
  "asset": "dog",
  "kind": "avatar",
  "spec": "020-dog-modeled-and-brought-in",
  "round": 2,
  "limits": {
    "bytes": 21000000,
    "triangles": 180000,
    "texture_bytes": 46000000,
    "texture_px": 2048,
    "skeleton": "quadruped, this brief's names (notes, RIG)",
    "bones_required": ["Hips", "Spine", "Neck", "Head", "Tail", "FrontLeftLeg", "FrontRightLeg", "HindLeftLeg", "HindRightLeg"],
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
  "findings": [
    "candidate.json: absent (limit: a file in the handoff folder)"
  ],
  "notes": "ROUND 2 OF THE DOG (spec 020-dog-modeled-and-brought-in, FR-010 to FR-014; plan section 5). Written by the night-shift implementer task brief-dog-r5 on 2026-11-14, from brief-dog-r4's rewrite of round 1 for the Author's order of about 15:18Z (a generic standing concept from a text prompt), as round 2 by his order of about 15:45Z. Round 1 made nothing to judge: its handoff folder, /srv/studio/handoff/dog/1/, holds only notes and no candidate.json. This brief's 'findings' are round 1's recorded failure, verbatim, and say only that. The studio has no repository: everything it needs is here.\n\nTHE AUTHOR'S WORDS. His item: '3. d) \"dog modeled and brought in\"'. His words on the dog (2026-11-14, about 15:18Z): \"it's a 41lb medium size dog, make a generic standing concept based on the same breed\". The corpus says of the dog, in his words: 'Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller.' Nothing else about the dog is stated: add no trait beyond the breed and his size words, and put no name in a prompt, a file, a record, or a note.\n\nTHE SOURCE: A TEXT PROMPT ALONE. 'references' is empty on purpose: no photo and no image is an input to any step. The studio reads /srv/studio/workflows/inbox/dog-concept.png (the seated concept in its inbox) only to name the breed, and then sets it aside: it is not uploaded to ComfyUI, not an input to any workflow, not copied, and nothing of its pose, markings, or background goes into the prompt beyond the breed's name. No session opens, views, copies, or lists the photos folder, /srv/studio/briefs/dog/photos/ (Q67, Q68, Q76 stand). The result is a generic dog of that breed, not a likeness of the Author's dog: its record says likeness false and a prompt source, and no credit, disclosure line, note, or file calls it a likeness of the Author's dog.\n\nCOMFYUI. Ask the runner to start it with all three of these params whenever a step runs in ComfyUI (steps 1 and 3; Pixal3D at step 3 needs the attention flag on this GPU): {\"kind\": \"comfyui\", \"action\": \"start\", \"params\": [\"--fp32-text-enc\", \"--use-pytorch-cross-attention\", \"--disable-pinned-memory\"]}. The Author's install ee0e5e90 holds all three on ComfyUI's allowlist (Q188, Q189). Ask for no other param, and never --birefnet (ComfyUI's main.py exits 2 on it: it is start_comfyui.sh's own switch). If the runner refuses a param or answers that ComfyUI isn't ready, record what it reports in the handoff note and stop: don't retry with other params. ComfyUI's outputs land under /srv/studio/outputs (the runner's --output-directory), so a save prefix dog/step1/... lands in /srv/studio/outputs/dog/step1/. Install no node and download no weight.\n\nSTEPS (as the man's and woman's were made; their records show the shape).\n1. Concept, from a text prompt alone: the studio's step. In ComfyUI 0.42.5 (core nodes only), FLUX.2 [klein] 4B base with its Qwen3-4B text encoder and the FLUX.2 VAE, text to image, with no image input and no reference latent, at 1024 x 1024. The prompt: a generic Nova Scotia Duck Tolling Retriever, a medium-size dog of about 41 lb (18 to 19 kg), a breed-typical coat, alone, standing, in a front three-quarter view (say \"turned 30 degrees to its left\"), all four legs visible, head level, tail relaxed and not raised above the head, the whole body in frame, plain light background, stylized to match the room's other avatars (soft, slightly simplified forms, painterly textures, not photoreal, not a cartoon with big eyes). No person, hand, leash, collar, tag, text, logo, lettering, place, or screen. Give the prompt an opaque ID (3 to 40 of A-Z a-z 0-9 and hyphen, one no other asset's record uses; for example P-0030) and keep its negative beside it. Seeds: test 4 seeds first (klein base drew the dinosaur front-on in most seeds; studio-dino-r4's lesson), then run more seeds as needed for a good choice. Check that no frame is black. Keep every frame, each beside its workflow-as-run.json, under /srv/studio/outputs/dog/step1/ (for example step1/seed<N>/), with one sheet of them all, for the Author's look approval; delete none. Pick the best (standing on four visible legs, the turn, head level, tail low, no text or marks) and write its seed, prompt ID, and sha256 in the handoff note.\n2. The Author's review of the concept, by hand: it comes with his look approval, after the round. The studio does not wait for it: it goes on from step 3 from its pick, and keeps every step-1 frame for him.\n3. Mesh and base-colour texture, from the studio's pick: Pixal3D int8 with DINOv3 ViT-L patch 16 with NAF, MoGe-2 ViT-L with normals, BiRefNet, TRELLIS.2 shape VAE and texture VAE, in ComfyUI 0.42.5, the studio agent driving it and uploading only the picked frame to ComfyUI's input. ComfyUI runs it with --use-pytorch-cross-attention (COMFYUI above), for the stop the dinosaur's step 3 hit at 15:25Z (Pixal3DConditioning: NotImplementedError, \"No operator found for `memory_efficient_attention_forward`\", from xformers; Q188). If it still stops, on that or any other error, do not retry with other params: keep step 1's frames, record the error's lines and the step it reached in the handoff note, and stop. Queue nothing more: the next run is the Author's to queue, and it starts at step 3 from the pick.\n4. The Author's review of the mesh, by hand.\n5. The build, by the studio agent's script in Blender 5.2.3: clean, decimate, and scale the mesh; resize the texture; rig and skin; key the clips; export with the glTF exporter bundled with Blender (numpy bundled with Blender where a script needs it).\n6. Scrub (metadata stripped: no EXIF, no path, no prompt text, no machine or user name) and write the record.\nIf any step needs a tool or model not in this brief's 'tools' (all from main's assets/policy/studio-tools.json with outputs_ship true), STOP the round and hand back a note saying which and why (FR-010): a new tool is the Author's to add. Never use Qwen-Image, FLUX.1 [dev], PuLID, TripoSR, GGUF, or ComfyUI-Manager (UNREVIEWED on the list; Qwen-Image and FLUX [dev] are refused by name whatever the list says). In candidate.json and in the record, name each tool by the ID here, or by a name that lowercases to it with each run of other characters a hyphen (\"ComfyUI\" is comfyui, \"Claude Opus 5.5\" is claude-opus-5.5, \"glTF exporter, bundled with Blender\" is gltf-exporter-bundled-with-blender), at the version on main's list.\n\nTHE LOOK (FR-012, FR-013). A stylized, textured, rigged four-legged figure of a generic Duck Toller of medium size, as the studio's picked concept shows it, standing in its rest pose, head level and tail no higher than the top of the head (the room scales the model by its rest pose's bounds to 0.62 m tall, lowest point on the floor, facing +z; a raised head or tail makes it wrong). Facing +z, +y up, metres, origin on the floor between the feet. It carries no place, no person, no screen, no logo, and no text. No hand bone and nothing held: the dog never takes the paper (spec 020 Q4).\n\nRIG. One skeleton, its bone names exactly as limits.bones_required lists them (no prefix, or one 'prefix:' before each), plus any more bones you need below them (e.g. FrontLeftLeg's lower bones and paw, Tail's chain, Jaw, ears). Name NO bone LeftHand or RightHand, with or without a prefix: the room treats those names as hands. Hips is the root of the deform bones. Both clips target this skeleton's names only; a clip naming a bone the model lacks fails in the room.\n\nCLIPS (FR-005, FR-012). 'idle': a loop of a few seconds, breathing and small head and tail motion, root in place. 'walk': a four-legged walk-cycle loop, root in place (the room moves the figure; no forward travel in the clip), feet not sliding against the gait. No other clip ('idle-holding' and 'take' are not wanted). The first frame of each reads well alone (reduced motion shows the idle's first frame).\n\nFILES AND LIMITS. Three GLB files: dog.glb (kind avatar: the textured, rigged model at rest, no clips required in it), dog-idle.glb and dog-walk.glb (kind animation: each one clip on the same skeleton, the clip's name being idle or walk). Main's caps (assets/policy/caps.json): avatar at most 21000000 bytes, 180000 triangles, 46000000 texture bytes (width times height times 4, times 4/3 for mipmaps); animation at most 1000000 bytes each. Textures at most 2048 px a side. Aim well under: the dog is 0.62 m tall in the room, so a few tens of thousands of triangles and one 1024 or 2048 base-colour texture should do. Each GLB carries the IPTC digital source type mark in KHR_xmp_json_ld, the term its record's steps call for, as the man's files do. Optional for the Author's review: front.png and side.png renders of dog.glb at rest.\n\nCANDIDATE (hand back to /srv/studio/handoff/dog/2/). candidate.json: {\"schema\": 1, \"asset\": \"dog\", \"round\": 2, \"files\": [\"dog.glb\", \"dog-idle.glb\", \"dog-walk.glb\", \"records.json\", ...], \"tools\": [{\"id\": \"<an ID from this brief>\", \"version\": \"<its version on main's list>\"}, ...], \"records\": \"records.json\"}, every listed file a regular file in that folder. The files arrive in the repository at assets/visitors/dog/ (the record's 'directory'), by the Author's intake. Write nothing in round 1's folder, /srv/studio/handoff/dog/1/. This run's note is /srv/studio/handoff/dog/2/note.md, whether the run hands off a candidate or stops.\n\nRECORD FORMAT (records.json; spec 003's contracts/asset-record.md and the arrival check, as assets/visitors/man/records.json is, and as the dinosaur's prompt-made record is). Top level, in this order: \"schema\": 1, \"directory\": \"assets/visitors/dog\", \"license\": \"all-rights-reserved-2026\", \"entries\" (sorted by file; two-space indent; trailing newline; no other key at any level). Each entry, keys in this order: \"file\"; \"sha256\" (64 hex); \"kind\" (\"avatar\" for dog.glb, \"animation\" for the clips); \"made\" (YYYY-MM-DD); \"source\": {\"type\": \"prompt\", \"id\": \"<the step-1 prompt's opaque ID>\"}; \"likeness\": false; \"steps\"; \"media_license\": \"all-rights-reserved-2026\". Leave out \"approval\": the look approval is the Author's, after the round. Each step: \"name\" (what was done, in words, no path), \"by\" (\"model\" or \"hand\"); for a model step \"models\" (each: name, repository, revision, role primary or auxiliary, license, license_version, as main's list and the man's record give them), \"tools\" (each: name, version, license, license_version), \"models_checked\" (a date), \"workflow_sha256\"; for a step by the studio agent's script, also \"service\": {\"name\": \"Claude Code\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\", \"disclosure_row\": \"D4\"} and the model Claude Opus 5.5 (repository anthropic/claude-opus-5-5, revision claude-opus-5-5). The Author's reviews are steps by \"hand\" with no models or tools. Every model and tool a step names must be in this brief's 'tools'. Each clip's entry repeats the model's steps, then its own clip step. No step, name, or credit calls the model a likeness of the Author's dog. No photo, no photo name, no EXIF, no path, and nothing from inbox/dog-concept.png, anywhere.\n\nJUDGING. An implementer runs python3 -I -B scripts/studio/line.py candidate on the handoff folder against this brief (it also runs main's arrival check) and records the round. The files are recorded likeness false with a prompt source, so arrival check P1 (an approval naming the file's hash) does not apply and every line counts; a warning that it's up to the contributor to check for likeness is expected. A pass goes to the Author's look judgement: the model shows in the room only after his look approval (approvals.json naming its SHA-256 with a non-empty disclosure_line), and no credit or disclosure line calls it a likeness of the Author's dog."
}
```
