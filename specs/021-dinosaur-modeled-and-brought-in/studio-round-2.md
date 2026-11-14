# Studio round 2: the dinosaur's brief (live since `brief-dino-r3`, 2026-11-14 about 16:30Z)

**Judged dry (`judge-dino-r2`): round 2's candidate passes `line.py`, and the round isn't recorded.** See "Round 2's candidate, judged dry" below.

**Live.** Task `brief-dino-r3` recorded round 1 as `fail` and put this brief at `/srv/studio/briefs/dinosaur/2.json`, byte for byte. `line.py brief` passes it. `studio-dino-r5` may run. See "Made live (`brief-dino-r3`)" below. The rest of this section, up to that one, is `brief-dino-r2`'s text, unchanged.

Task `brief-dino-r2` (implementer, night of 2026-11-13, run on 2026-11-14 around 15:50Z) writes the brief half of the dinosaur's round 2, under the Author's rule 9 ("Round 2 for both", about 15:45Z). Under that rule, round 2 starts at step 3 from his concept, `/srv/studio/workflows/inbox/visitor-raptor-concept.png`.

**Result: the brief is written and checked, but `line.py brief` can't pass it, so it is NOT at `/srv/studio/briefs/dinosaur/2.json`.** The studio task `studio-dino-r5` must not run until it is. The question is on the page (`/night/io/out/questions.md`).

- Round 1's live brief, `/srv/studio/briefs/dinosaur/1.json`: read, left as found, SHA-256 `66ea6de2e7f790513d58a467f67a57f297ecf0e184751c082ddcc57c833dc95d` (the same as `studio-round-1.md` records).
- Round 2's brief, verbatim below: SHA-256 `eddfc1ff881722a4e6c3ece13514e20a70e350b34194690bc61abe7930431b61`.
- `line.py`: this branch's copy, unchanged. Policy read from `refs/heads/main` at `3c0e4cd0`.
- Nothing else in the repository changes. No studio work was done, nothing under `assets/**` was written, and nothing was written under `/srv/studio/`.

## Why it can't pass

`line.py brief` takes a round after round 1 only when round 1 has a **recorded failure**. That means `<briefs>/dinosaur/1.result.json` with `"result": "fail"`, whose findings the new brief must repeat word for word (`scripts/studio/line.py:519` to `:537`). Round 1's handoff folder, `/srv/studio/handoff/dinosaur/1/`, holds only the four runs' notes (`note.md` to `note-4.md`), and no implementer has run `candidate --record` on it. So there is no `1.result.json`. The Author's order says round 2 is something "`line.py` allows". It allows a round 2 only once round 1 is recorded.

I didn't record round 1 myself. Writing a result is the judging step, not this task's (an implementer here may write only a brief under `/srv/studio/briefs/`). Recording is also once only: `line.py` never records a round again.

I also didn't put the failing brief live. If `2.json` sat in the briefs folder and `studio-dino-r5` ran on it, the studio would make `/srv/studio/handoff/dinosaur/2/`. After that, `candidate --record` refuses round 1 ("round 2 follows round 1: round 1 can't be judged again", `line.py:1220` to `:1228`), and this brief can never pass. Round 2's candidate couldn't be judged either, because judging re-checks the brief first (`line.py:1168` to `:1170`). The dinosaur's line would be stuck for good.

## The check

I ran it on two scratch copies of the briefs folder (in `mktemp -d`). Each holds a byte-for-byte copy of the live `1.json` beside this `2.json`, with `--handoff` pointing at the live `/srv/studio/handoff`.

As the folder is now, with no round 1 result (this is what the live path would give):

```
$ python3 -I -B scripts/studio/line.py brief "$T/live/dinosaur/2.json" --handoff /srv/studio/handoff; echo "exit $?"
round: 2 (limit: after round 1's recorded failure; it has no result)
line: 1 finding
exit 1
```

With round 1 recorded, using a stand-in `1.result.json` in exactly the form `candidate --record` writes:

```
$ python3 -I -B scripts/studio/line.py brief "$T/recorded/dinosaur/2.json" --handoff /srv/studio/handoff; echo "exit $?"
line: pass
exit 0
```

The stand-in result's one finding is what `line.py` gives for round 1's folder today. I checked this with a dry run that writes nothing:

```
$ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dinosaur/1 --brief /srv/studio/briefs/dinosaur/1.json; echo "exit $?"
candidate.json: absent (limit: a file in the handoff folder)
arrival-check: not run, since the candidate's files or its record's directory are missing
line: 1 finding; round 1 fails
exit 1
```

So once round 1 is recorded with `--record`, this brief can go to `/srv/studio/briefs/dinosaur/2.json` byte for byte, and it passes. Its `findings` already holds that line.

## What changed from round 1's brief, and why

Only what his order changes, plus what `line.py` requires of a round 2:

1. `round` 2; `findings` holds round 1's finding word for word (`line.py:530`). The handoff folder is `/srv/studio/handoff/dinosaur/2/`, and the run's note goes there as `note.md`.
2. **The concept.** Round 2 starts at step 3 from `/srv/studio/workflows/inbox/visitor-raptor-concept.png`: his, reviewed by him, `likeness: false`. His 15:40Z words are quoted in full, and they replace Q65's earlier answer (a new recorded prompt). Step 1 isn't run. Step 2 (his review) is done. P-0024's twelve seeds in `/srv/studio/outputs/dinosaur/` are recorded as made and not chosen. If the file isn't there, the studio stops before step 3 and says so, without falling back to the seeds.
3. **`references` stays `[]`.** `line.py` takes only repository paths there: an absolute path fails `brief_shape` (`line.py:456` to `:467`). The concept isn't in the repository, so its path is in `notes`. I couldn't confirm the file exists: my session's sandbox refused both `ls` and `stat` on the inbox. The brief has the studio check for it.
4. **The concept's source in the arrival check's terms:** `{"type": "design", "id": "D-0003"}`. The arrival check takes `photo`, `prompt`, `asset`, or `design`. `design` is "an original design with no photo or prompt, such as the Author's sign designs or an original artwork" (spec 004, Amendment C2), held to the opaque-ID rule. His file is neither a photo nor a prompt this round runs. `D-0003` is the next design ID: main's records use `D-0001` and `D-0002` (`assets/room/records.json`), and no local branch's `assets/` or `specs/` uses `D-0003`. The record's steps start with two steps by hand (the concept, his own design; his review of it). With the model steps after them, the mark stays `compositeWithTrainedAlgorithmicMedia`, and with `likeness: false` and no photo, the record needs no approval (it gets the arrival check's WARN only). **This is my reading.** If he made the concept from a prompt, it should be `prompt` with that prompt's ID and a model step naming his tools. That is a second question on the page and doesn't block anything.
5. **`tools`: fourteen down to eleven.** Without step 1 nothing uses `flux.2-klein-4b-base`, `qwen3-4b-its-text-encoder`, or `flux.2-vae` (the man's mesh steps name none of them). Keeping them would leave the studio free to run a model the round doesn't need. The record format no longer lists them, and the version list in the notes drops them too.
6. **ComfyUI's flags:** step 3's start request asks for all three, `--fp32-text-enc`, `--use-pytorch-cross-attention`, and `--disable-pinned-memory`, and never `--birefnet`. If any is refused, the studio stops before step 3.
7. **Size and rest pose:** one added sentence. These come from the room, so they hold where the concept's pose differs, and the build poses the rig's rest pose to fit them. **The look:** the concept sets it. Round 1's direction holds only where the concept doesn't show something.

Everything else is round 1's text unchanged: the limits, the rig, the clips, the files and limits, LICENSE.md, the candidate's shape, the record's remaining format, and judging.

## Interruptions (rule 5)

The sandbox refused these Bash commands. I didn't respell any of them.

- A compound command that, among other things, listed `/srv/studio/workflows/inbox/` and `/night/io/`. I split it, and its other parts ran on their own.
- `ls -la /srv/studio/workflows/inbox/`, and then `stat` on `/srv/studio/workflows/inbox/visitor-raptor-concept.png`. The inbox is outside what this session may read. I didn't try another way. The brief has the studio check for the file.

## Follow-ups for the stack's note

- `line.py`'s rule is a recorded failure before round n+1, and a notes-only handoff counts as answered but not as recorded. The stack's planned follow-up (a round counts as answered only with a `candidate.json`) should cover both halves. Otherwise the same thing will block the dog's round 2: `/srv/studio/briefs/dog/` holds only `1.json`, with no `1.result.json`.

## Small tests (rule 4)

This task changes no code and no test, and only adds this file under `specs/`. That folder is in `.prettierignore` (line 43), and none of `make lint`'s other tools (eslint, tsc, ruff, shellcheck) reads Markdown, so the `line.py` runs above are this task's only tests. The full suite runs once, for the stack (rule 4).

## Made live (`brief-dino-r3`)

Task `brief-dino-r3` (implementer, night of 2026-11-13, run on 2026-11-14 around 16:30Z). It followed Q197's answer, which was as recommended. `line.py` is this branch's copy, unchanged from the base `night/brief-dino-r2/brief-dino-r2` (blob `05d6057f`). The text above isn't changed, and the concept's source stays `{"type": "design", "id": "D-0003"}` (Q198, recommended; his to overturn).

**Checks first, all as the supervisor expected:**
- `/srv/studio/briefs/dinosaur/1.json` is SHA-256 `66ea6de2e7f790513d58a467f67a57f297ecf0e184751c082ddcc57c833dc95d`.
- `/srv/studio/handoff/dinosaur/1/` holds only `note.md`, `note-2.md`, `note-3.md`, and `note-4.md`.
- `/srv/studio/briefs/dinosaur/` held only `1.json`: no `1.result.json`, no `2.json`.
- The brief block above (its 33 lines, with a trailing newline) is SHA-256 `eddfc1ff881722a4e6c3ece13514e20a70e350b34194690bc61abe7930431b61`.

**Round 1 recorded:**

```
$ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dinosaur/1 --brief /srv/studio/briefs/dinosaur/1.json --record; echo "exit $?"
candidate.json: absent (limit: a file in the handoff folder)
arrival-check: not run, since the candidate's files or its record's directory are missing
line: 1 finding; round 1 fails
exit 1
```

It wrote `/srv/studio/briefs/dinosaur/1.result.json` (SHA-256 `8c8f0e7aa650968c4d16ae7e7a9d26dd12f215b325a3c436b67c81047e41bbe4`):

```json
{
  "schema": 1,
  "asset": "dinosaur",
  "round": 1,
  "result": "fail",
  "findings": [
    "candidate.json: absent (limit: a file in the handoff folder)"
  ]
}
```

That is `fail` with one finding, the same as this brief's `findings` word for word. Exit 1 is how `line.py` reports a failing round. The record was written.

**The brief.** I wrote it with the Write tool to `/srv/studio/briefs/dinosaur/2.json`. `cmp` against the block above returns 0.

```
$ sha256sum /srv/studio/briefs/dinosaur/1.json /srv/studio/briefs/dinosaur/1.result.json /srv/studio/briefs/dinosaur/2.json
66ea6de2e7f790513d58a467f67a57f297ecf0e184751c082ddcc57c833dc95d  /srv/studio/briefs/dinosaur/1.json
8c8f0e7aa650968c4d16ae7e7a9d26dd12f215b325a3c436b67c81047e41bbe4  /srv/studio/briefs/dinosaur/1.result.json
eddfc1ff881722a4e6c3ece13514e20a70e350b34194690bc61abe7930431b61  /srv/studio/briefs/dinosaur/2.json
```

The text's block and the live `2.json` are the same, `eddfc1ff…31b61`. Round 1's brief is unchanged, `66ea6de2…3dc95d`.

**The check:**

```
$ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/dinosaur/2.json --handoff /srv/studio/handoff; echo "exit $?"
line: pass
exit 0
```

**Interruptions (rule 5).** The sandbox refused one compound Bash command. It ran `git log`, `sha256sum` on the two files, and `ls` on the briefs folder, the handoff folder, and `/srv/studio/workflows/inbox/`. I split it into single commands and they ran, except the inbox listing, which I didn't try again. So this task, like `brief-dino-r2`, didn't confirm that the concept file exists. The brief has the studio stop before step 3 if it's missing.

**Nothing else changed.** In the repository, only this file changed. Under `/srv/studio/`, only `briefs/dinosaur/1.result.json` (by `line.py --record`) and `briefs/dinosaur/2.json` were written. No studio work was done. Small tests (rule 4): the `line.py` runs above. The task changes no code and no test.

## The brief, verbatim

```json
{
  "schema": 1,
  "asset": "dinosaur",
  "kind": "avatar",
  "spec": "021-dinosaur-modeled-and-brought-in",
  "round": 2,
  "limits": {
    "bytes": 3000000,
    "triangles": 30000,
    "texture_bytes": 11184810,
    "texture_px": 1024,
    "skeleton": "dinosaur",
    "bones_required": ["Hips", "Spine", "Chest", "Neck", "Head", "Jaw", "Tail1", "Tail2", "Tail3", "Tail4",
                       "Arm.L", "Arm.R", "Leg.L", "Leg.R", "Shin.L", "Shin.R", "Foot.L", "Foot.R"],
    "clips": ["idle", "walk", "take"]
  },
  "tools": [
    "comfyui",
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
  "findings": ["candidate.json: absent (limit: a file in the handoff folder)"],
  "notes": "ROUND 2 OF THE DINOSAUR (spec 021-dinosaur-modeled-and-brought-in; contracts/dinosaur-brief.md and contracts/dinosaur-rig.md). Written by the night-shift implementer task brief-dino-r2 on 2026-11-14, from round 1's brief (/srv/studio/briefs/dinosaur/1.json, left unchanged), changing only what the Author's order of about 15:40Z to 15:45Z changes: this round starts at step 3, from his concept. The studio has no repository: everything it needs is here.\n\nROUND 1. Round 1 built nothing that could be judged. Its runs' notes are in /srv/studio/handoff/dinosaur/1/ (note.md to note-4.md): the runner's ComfyUI didn't come up, and on the fourth run step 3 stopped because Pixal3D's attention failed in xformers on this GPU. Its step 1 made twelve concepts from the prompt P-0024 (seeds 1 to 12, in /srv/studio/outputs/dinosaur/): they were made and not chosen. None of them is this round's concept, and neither they nor P-0024 go into this round's record. Round 1's recorded finding is this brief's 'findings', verbatim. Round 1's notes hold the runner tool (tools/comfy_night.py) and the plan for the build; use them where they help, and where they differ from this brief, the brief wins.\n\nTHE AUTHOR'S WORDS. His item: '4. e) \"dinosaur modeled and brought in\"'. His words on the tools: \"It's the same license that we've used for all the other avatars adn motions, so copy it from there\". His words on the concept (about 15:40Z): \"We have a dinosaur concept already existing in /srv/studio/workflows/inbox/visitor-raptor-conept.png\", then \"typo, it's /srv/studio/workflows/inbox/visitor-raptor-concept.png\". They replace an earlier answer that the concept would come from a new recorded prompt.\n\nWHAT IT IS. The visitor's fourth avatar choice, 'a generic dinosaur', today a flat green cut-out, made into a textured, rigged 3D figure with three clips. It is only the visitor's avatar: it does not roam, bite, or chase anything in this round.\n\nTHE CONCEPT AND REFERENCES. The concept is /srv/studio/workflows/inbox/visitor-raptor-concept.png. It is the Author's, he has reviewed it, and it shows no likeness. 'references' stays empty because it holds only repository paths and the concept isn't in the repository: that path is this round's one reference. No photo is used. Read the concept from that path, and upload it to ComfyUI's input for step 3. Don't change it, and don't copy it into the handoff folder. IF THAT FILE ISN'T THERE, or isn't a readable image, STOP BEFORE STEP 3 and say so in the run's note. Don't make a concept, don't fall back to P-0024 or its seeds, and don't start ComfyUI.\n\nTHE LOOK. The concept sets the look; build to it. Where it doesn't show something, round 1's direction holds: an original, friendly theropod in stylized illustrative realism (soft, slightly simplified forms, painterly textures, not photoreal, not a cartoon with big eyes), matching the room's man and woman; body green near #4f8a3c, with a lighter belly and darker back markings; it must not be, or resemble, any film's, game's, toy's, or franchise's dinosaur or creature; mouth closed or gently closed in the rest pose (teeth may show slightly; nothing menacing). The files hold no text, no logo, no lettering, no marks, no clothing, and no props.\n\nSIZE AND REST POSE. These come from the room, so they hold even where the concept's pose differs: the build in step 5 poses the rig's rest pose to fit them. Facing +z, +y up, metres, origin on the floor between the feet, both feet flat on the floor. The tail low and behind (toward -z, near or touching the floor is fine), the head forward and level, the head's top the highest point. The room scales the model uniformly by its rest pose's height to 1.2 m. Once scaled to 1.2 m high, the whole rest-pose body, tail included, must measure at most 1.1 m along x (side to side) and at most 1.1 m along z (nose to tail tip); the room refuses it otherwise (rule RA9, 5% slack). So the tail must curve down or to the side rather than stretch straight back: plan the proportions for a box 1.2 m high by 1.1 m by 1.1 m.\n\nSTEPS (as the man's and woman's were made; their records show the shape). This round starts at step 3.\n1. Concept from a prompt: NOT RUN in this round. The concept is the Author's file above. Run no prompt and no FLUX.2 [klein] model.\n2. The Author's review of the concept, by hand: done. His words above are that review.\n3. Mesh and base-colour texture, from his concept: in ComfyUI 0.42.5, Pixal3D int8 with DINOv3 ViT-L patch 16 with NAF, MoGe-2 ViT-L with normals, BiRefNet, TRELLIS.2 shape VAE and texture VAE.\n4. The Author's review of the mesh, by hand.\n5. The build, by the studio agent's script in Blender 5.2.3: clean, decimate, and scale the mesh; resize the texture; rig and skin to the skeleton below; key the three clips; export each file with the glTF exporter bundled with Blender (numpy bundled with Blender where a script needs it).\n6. Scrub (no EXIF, no path, no machine or user name in any file) and write the record.\nIf any step needs a tool or model not in this brief's 'tools', STOP the round and hand back a note saying which and why: a new tool is the Author's to add. Install no node and download no weight. Never use Qwen-Image, FLUX.1 [dev], PuLID, TripoSR, GGUF, ComfyUI-Manager, or any node marked UNREVIEWED.\n\nCOMFYUI'S FLAGS. When you ask the runner to start ComfyUI for step 3, ask for all three of these flags in the one start request, as its params: \"--fp32-text-enc\", \"--use-pytorch-cross-attention\", \"--disable-pinned-memory\". Pixal3D needs --use-pytorch-cross-attention on this GPU: round 1's fourth run stopped without it. Never ask for --birefnet. If the runner refuses any of the three, or ComfyUI isn't ready, STOP before step 3 and say which in the note. Don't run step 3 without all three.\n\nRIG ('dinosaur' skeleton; contracts/dinosaur-rig.md). One skeleton, skinned to one mesh or a few. Bone names exactly as limits.bones_required lists them, dots included (no prefix, or one 'prefix:' before each), with these parents: Hips the root of the deform bones; Spine under Hips; Chest under Spine; Neck under Chest; Head under Neck; Jaw under Head (weighted to the lower jaw; it needs no keys now: a later item will add a bite); Tail1 under Hips, Tail2 under Tail1, Tail3 under Tail2, Tail4 under Tail3; Arm.L and Arm.R under Chest; Leg.L and Leg.R under Hips; Shin.L under Leg.L and Shin.R under Leg.R; Foot.L under Shin.L and Foot.R under Shin.R. More bones below these are fine (toes, fingers, a tail tip, eyelids); none listed may be missing. Name NO bone LeftHand or RightHand (with or without a prefix): the room treats those as hands, and the dinosaur holds nothing (the paper stays at its anchor, spec 021 Q2). No Mixamo names are needed. No morph targets.\n\nCLIPS (contracts/dinosaur-rig.md). Each clip on the same skeleton, its one animation named exactly the role, root in place (the room moves and turns the figure; no forward travel in a clip), moving only the bones above or their children.\n- idle: a loop of a few seconds: a breath, a slow tail sway, a small head turn. Its first frame is the rest pose and reads well alone (reduced motion shows only that frame).\n- walk: a loop: a two-legged walk cycle at an easy pace, feet not sliding against the gait, the tail counter-swaying, the head steady.\n- take: plays once (about 1.5 to 2.5 s): the head dips forward and down toward a paper held out in front of it at about chest height, pauses, and returns to the idle's first-frame pose. No hand or arm grabs anything.\n\nFILES AND LIMITS. Four GLB files, glTF 2.0 binary, everything embedded:\n- dinosaur.glb (kind avatar): the textured, rigged model at rest; no clips required in it.\n- dinosaur-idle.glb, dinosaur-walk.glb, dinosaur-take.glb (kind animation): each one clip on the same skeleton.\nThis brief's limits, every file: at most 3000000 bytes; at most 30000 triangles; images at most 1024 px a side, embedded PNG, JPEG, or WebP; at most 11184810 texture bytes (width times height times 4, times 4/3, rounded down: two 1024 by 1024 maps, a base colour and one more, or one). Each clip file at most 300000 bytes (the judge holds this; main's cap for an animation is 1000000). Main's avatar caps (21000000 bytes, 180000 triangles, 46000000 texture bytes) are higher; aim at this brief's. Each GLB carries the IPTC digital source type mark in KHR_xmp_json_ld, as the man's files do: extensions.KHR_xmp_json_ld.packets[0] = {\"@context\": {\"Iptc4xmpExt\": \"http://iptc.org/std/Iptc4xmpExt/2008-02-29/\"}, \"Iptc4xmpExt:DigitalSourceType\": \"http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia\"}, referenced from asset.extensions.KHR_xmp_json_ld.packet 0, and KHR_xmp_json_ld in extensionsUsed. Optional for the Author's look review: front.png and side.png renders of dinosaur.glb at rest, left in the handoff folder but NOT listed in candidate.json's files and NOT in the record.\n\nLICENSE.md. Hand back a LICENSE.md, a copy of the shipped avatars' (his answer), these five lines exactly, ending with a newline:\nCopyright (c) 2026 Hareet. All rights reserved.\n\nThe files in this directory are not covered by this repository's MIT license. You are welcome to view them and to link to them. Any other use needs the copyright holder's written permission.\n\nEach file's provenance is in records.json, and in CREDITS.md at the root of its tree.\n\nCANDIDATE (hand back to /srv/studio/handoff/dinosaur/2/). candidate.json: {\"schema\": 1, \"asset\": \"dinosaur\", \"round\": 2, \"files\": [\"dinosaur.glb\", \"dinosaur-idle.glb\", \"dinosaur-walk.glb\", \"dinosaur-take.glb\"], \"tools\": [{\"id\": \"<an ID from this brief>\", \"version\": \"<its version on main's list>\"}, ...], \"records\": \"records.json\"}, every listed file a regular file in that folder (no links); records.json and LICENSE.md beside them and never listed in files. The run's note goes in that folder as note.md (a later run of this round writes note-2.md, and so on), never listed in files; a run that stops still writes its note there. The versions on main's list: comfyui 0.42.5; pixal3d-int8 and dinov3-vit-l-patch-16-with-naf f37641be; moge-2-vit-l-with-normals 14849852; birefnet e2bf8e44; trellis.2-shape-vae and trellis.2-texture-vae 430a9d09; blender 5.2.3; gltf-exporter-bundled-with-blender 5.2.41; numpy-bundled-with-blender 2.3.4; claude-opus-5.5 claude-opus-5-5. The files arrive in the repository at assets/visitors/dinosaur/ (the record's 'directory'), by the Author's intake, after his look approval; the studio writes nothing in the repository.\n\nRECORD FORMAT (records.json; spec 003's contracts/asset-record.md and the arrival check, as assets/visitors/man/records.json is). Top level, in this order: \"schema\": 1, \"directory\": \"assets/visitors/dinosaur\", \"license\": \"all-rights-reserved-2026\", \"entries\" (sorted by file; two-space indent; trailing newline; no other key at any level). One entry per GLB (four entries), keys in this order: \"file\"; \"sha256\" (64 lower-case hex of the file's bytes); \"kind\" (\"avatar\" for dinosaur.glb, \"animation\" for the clips); \"made\" (YYYY-MM-DD); \"source\": {\"type\": \"design\", \"id\": \"D-0003\"} (the Author's concept, an original design of his, spec 004's Amendment C2; D-0003 is its opaque ID: never put the concept's file name or path in the record); \"likeness\": false; \"steps\"; \"media_license\": \"all-rights-reserved-2026\". Leave out \"approval\": the look approval is the Author's, after the round. Each step: \"name\" (what was done, in words, no path), \"by\" (\"model\" or \"hand\"). For a model step: \"models\" (each: name, repository, revision, role \"primary\" or \"auxiliary\", license, license_version), \"tools\" (each: name, version, license, license_version), \"models_checked\" (a date), \"workflow_sha256\" (64 hex of the workflow or script that ran). Every entry's steps begin with two steps by hand: {\"name\": \"the concept, the Author's own design\", \"by\": \"hand\"} and {\"name\": \"the Author's review of the concept\", \"by\": \"hand\"}. No step names FLUX.2 [klein], Qwen3-4B, or the FLUX.2 VAE, and no step names P-0024. Name the models and tools as the man's record does: \"Pixal3D, int8\" (primary, Comfy-Org/Pixal3D, f37641be, mit 1), \"DINOv3 ViT-L, patch 16, with NAF\" (Comfy-Org/Pixal3D, f37641be, dinov3 2026-10-26), \"MoGe-2 ViT-L with normals\" (Comfy-Org/MoGe, 14849852, mit 1), \"BiRefNet\" (ZhengPeng7/BiRefNet, e2bf8e44, mit 1), \"TRELLIS.2 shape VAE\" and \"TRELLIS.2 texture VAE\" (Comfy-Org/TRELLIS.2, 430a9d09, mit 1), all but Pixal3D auxiliary; tools \"ComfyUI\" 0.42.5 gpl-3.0 3, \"Blender\" 5.2.3 gpl-3.0-or-later 3, \"glTF exporter, bundled with Blender\" 5.2.41 apache-2.0 2.0, \"numpy, bundled with Blender\" 2.3.4 bsd-3-clause 1. A step by the studio agent's script names the model \"Claude Opus 5.5\" (primary, repository anthropic/claude-opus-5-5, revision claude-opus-5-5, license anthropic-consumer-terms, license_version 2025-10-08) and also carries \"service\": {\"name\": \"Claude Code\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\", \"disclosure_row\": \"D4\"}. The Author's reviews are steps by \"hand\" with no models or tools. Every model and tool a step names must be in this brief's 'tools' (a name lower-cased, each run of other characters a hyphen, is its ID: \"Blender\" is blender, \"Claude Opus 5.5\" is claude-opus-5.5). Each clip's entry repeats the model's steps, then its own clip step (\"the walk, keyed on the build's skeleton and exported alone, by the studio's agent's script run in Blender\").\n\nJUDGING. An implementer runs python3 -I -B scripts/studio/line.py candidate on the handoff folder against this brief (it also runs main's arrival check) and records the round. A pass goes to the Author's look judgement; only his word brings the dinosaur into the room. Three failed rounds put it on his decision page, and the room keeps the flat cut-out."
}
```
