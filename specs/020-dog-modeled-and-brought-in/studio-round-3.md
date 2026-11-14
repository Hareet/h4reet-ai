# Studio round 3 of the dog, its last: round 2 recorded, round 3's brief placed

Task `record-dog-r2` (night of 2026-11-13, implementer, Opus 5.5, on 2026-11-14). It followed judge-dog-r2's dry judgment (`studio-round-2.md`, "Round 2's candidate, judged dry") and the answers to its four questions, Q201 to Q204. Each answer is the recommended one, under the orders file's rule ("any new one: the recommended answer stands").

**Outcome:**
- **Round 2 is recorded:** `fail`, with the single `files` line judge-dog-r2 predicted.
- **Round 3's brief is placed:** `/srv/studio/briefs/dog/3.json`, and `line.py brief` passes on it.
- **No studio round ran.** Round 3 waits for three things from the Author: his review of the concept, his review of the mesh (Q204), and his Q199 date.

Nothing went into `assets/**` or the room's code. The stand-in stays the room's dog until his look approval (rule 2). `line.py` is unchanged. I didn't create `/srv/studio/handoff/dog/3/`.

## The checks before recording (all as judge-dog-r2 recorded them)
- `/srv/studio/briefs/dog/2.json` exists, with SHA-256 `d15050f1…2495`, the one brief-dog-r6 placed.
- `/srv/studio/briefs/dog/2.result.json` didn't exist. `/srv/studio/handoff/dog/` held `1/` and `2/` only.
- The three GLBs' SHA-256s are the ones judge-dog-r2 recorded:

```text
ec835c4bcf590157f0307924d03917329ce2a9c0b71809853cf8acba31f787df  /srv/studio/handoff/dog/2/dog-idle.glb
a5c456f952c6d7ac59be1ccd58df4e12a3774643f43739eb68b1178100581099  /srv/studio/handoff/dog/2/dog-walk.glb
2da9621c50e03d4f3053ee5502399146f080c9c439da498ff0ba5ea42eda2dc3  /srv/studio/handoff/dog/2/dog.glb
```

- `candidate.json` (`d0e4f849…34f2`) and `records.json` (`14742e1e…bab`) matched too. Both are unchanged after the record, so Q199's placeholder is still in `records.json`. It doesn't matter for round 2's verdict.

## Q201: round 2 recorded, the whole output

```text
$ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dog/2 --brief /srv/studio/briefs/dog/2.json --record; echo "exit=$?"
files: records.json (limit: a distinct file name in the folder, not the record or the notice)
arrival-check: not run, since the candidate's files or its record's directory are missing
line: 1 finding; round 2 fails
exit=1

$ cat /srv/studio/briefs/dog/2.result.json
{
  "schema": 1,
  "asset": "dog",
  "round": 2,
  "result": "fail",
  "findings": [
    "files: records.json (limit: a distinct file name in the folder, not the record or the notice)"
  ]
}
```

This is the `fail` on `files` that judge-dog-r2 predicted, word for word, so I went on. `/srv/studio/briefs/dog/2.result.json` has SHA-256 `08daa2063dc2255255c0b0c5c6fa7bea83b84df1b0bbaf90dcecb7b82c9ab8bd`.

## Round 3's brief: what changed from `2.json`

Everything else is `2.json`'s, word for word: the limits, the 14 tool IDs, `references` (`[]`), the author's words, the look, the rig, the clips, the caps, and judging. Main's `assets/policy/studio-tools.json` and `caps.json` are unchanged since round 2's brief (last changed at `3c0e4cd0`, main's tip), and the check below reads them from `refs/heads/main`.

- **`round`: 3**, the dog's last. The header says so.
- **`findings`:** round 2's recorded line, verbatim, as `line.py` requires.
- **Q202, `files`:** `["dog.glb", "dog-idle.glb", "dog-walk.glb"]`. The record is named by `"records": "records.json"` alone. CANDIDATE says why: `line.py` refuses `records.json`, `LICENSE.md`, and `candidate.json` in `files`.
- **Q203, `LICENSE.md`:** the studio writes it into `/srv/studio/handoff/dog/3/`, outside `files`. Its text is byte for byte main's `assets/visitors/man/LICENSE.md` (327 bytes, SHA-256 `f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159`). The studio has no repository, so the brief carries the text as one JSON string to decode, with the hash to check against. The build script checks that the string, decoded from the placed brief's `notes`, is the man's file byte for byte (output below).
- **Q204, no new GPU step:** round 3 starts at step 5, from round 2's step-3 mesh in `/srv/studio/outputs/dog/step3/`.
  - It doesn't run steps 1 and 3 again, and doesn't start ComfyUI. If a step would start it anyway, it uses exactly `--fp32-text-enc`, `--use-pytorch-cross-attention`, `--disable-pinned-memory`, never `--birefnet`.
  - The record's steps 1 and 3 are round 2's as they ran: workflows `c654f2bd…9d06` (seed 2) and `8c3c5eb2…e462`.
  - Steps 2 and 4 are the Author's reviews, as hand steps holding only `name` and `by`, in the man's order.
  - The mark stays `compositeWithTrainedAlgorithmicMedia`. A new section, THE MARK, ties it to those two steps (C1).
  - The build does what round 2's did (`build_dog.py`, `27421d79…5959`), with nothing changed in the model he reviewed.
  - `tools` keeps the GPU models and ComfyUI, because the record's steps 1 and 3 name them, and `line.py` checks every model a step names against the brief's `tools`.
- **Q199, `models_checked`:** on steps 1 and 3 it is the date his answer gives, as the request that queues round 3 gives it. The studio writes it, never a placeholder. The build and clip steps take the day the studio checks them.
- **When the round runs (new):** only when the Author queues it, after his two reviews and with his Q199 date.
  - If any of the three is missing, or a review asks for a change (that means a new GPU step), the studio stops.
  - **A stop writes nothing in `/srv/studio/handoff/dog/3/`.** The stop's note goes to `/srv/studio/outputs/dog/round3/stop-note.md`. `line.py` counts a handoff folder that holds only notes as an answered round (rule 9's follow-up), and round 3 is the dog's last. In `2.json`, the note went in the handoff folder "whether the run hands off a candidate or stops"; for round 3 I changed that. It's a question below.
- **Source:** unchanged, `{"type": "prompt", "id": "P-0030"}` with `likeness: false`. Round 3 makes no new concept, so it reads nothing in the studio's inbox. `2.json`'s sentence about reading `inbox/dog-concept.png` for the breed's name is gone. The ban on the photos folder stays.
- **Round 2's hidden lines:** the brief's notes carry the 10 lines from judge-dog-r2's scratch copy, marked as a dry check and not as recorded findings. Each is named with its fix: 6 R6 lines fixed by Q199's date, N1 fixed by the notice, and 3 M5 lines fixed by steps 2 and 4. This is fault 4's stopgap, until `line.py` changes.

## The check, then the placement

I built the text with a script kept outside the repository (`/tmp/record-dog-r2.script.zlBL/build.py`). It takes `2.json`'s fields, `2.result.json`'s findings, and the notes (`/tmp/record-dog-r2.data.f2hA/notes.txt`). Then I checked the text on a scratch copy of the briefs folder, against the real handoff folder:

```text
$ python3 -I -B /tmp/record-dog-r2.script.zlBL/build.py /srv/studio/briefs/dog/2.json /srv/studio/briefs/dog/2.result.json <data>/notes.txt <data>/man-LICENSE.md <data>/3.json
notice decodes byte for byte: True 327 f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159
brief sha256: 35c045bf159912635edb519c18bb10646744e2e46e4470b8eb84fec742d5d2cc 14856 bytes

# 1.json, 1.result.json, 2.json, 2.result.json, and the text, copied to <data>/briefs/dog/
$ python3 -I -B scripts/studio/line.py brief <data>/briefs/dog/3.json; echo "exit=$?"
line: pass
exit=0
```

Only then did I place it (`cp -n`, then `cmp`: identical) and check it where it is:

```text
$ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/dog/3.json; echo "exit=$?"
line: pass
exit=0

$ sha256sum /srv/studio/briefs/dog/*.json
f1897ad37cc88866b967e24b5b1e89b628d60a7b29f3469ed943e3a219e63b97  /srv/studio/briefs/dog/1.json
65783b3b6be96413b799bf04ae8c750b75dd6d1fefff1cd1b1c9b0245f39ecac  /srv/studio/briefs/dog/1.result.json
d15050f122b7e0c334b0f335c1f47305e9b5675689a29d7009df3f46632a2495  /srv/studio/briefs/dog/2.json
08daa2063dc2255255c0b0c5c6fa7bea83b84df1b0bbaf90dcecb7b82c9ab8bd  /srv/studio/briefs/dog/2.result.json
35c045bf159912635edb519c18bb10646744e2e46e4470b8eb84fec742d5d2cc  /srv/studio/briefs/dog/3.json

$ ls /srv/studio/handoff/dog/
1
2
```

The placed text is the JSON block at the end of this file, byte for byte.

## For the Author's morning

### What he looks at
1. **The concept (step 2's review):** seed 2 of P-0030, in `/srv/studio/outputs/dog/step1/seed2/`, SHA-256 `f9d18f2b3ef2ea92df0fb6d4dfb0984a53010e6e704b55a410bf57823cc0cf99`.
   - All eight frames are on the sheet `/srv/studio/outputs/dog/step1/concepts-P-0030-seeds-1-8.png`.
   - The runner-up is seed 4 (`1a06fea3…c1c2`, white paws). Choosing it is a change: round 3 can't make a new mesh, so it would need a new GPU step.
   - The workflow as run for seed 2 has SHA-256 `c654f2bdec42172e39a38a9070f49c53f2f63e91795e29065c39234f51659d06`.
2. **The mesh (step 4's review):** the GLB in `/srv/studio/outputs/dog/step3/`. That's 1,499,191 triangles with a 4096 px base colour, from workflow `8c3c5eb2276a46d42f5f18040ab7c9709975996f75680dd0c415fdbe27e8e462`.
   - **Its own SHA-256 isn't here:** this session couldn't list `/srv/studio/outputs/dog/step3/` (Interruptions). The command below prints it.
   - For a quicker look, round 2's build of it is in `/srv/studio/handoff/dog/2/`: `dog.glb` (`2da9621c…dc3`), with the renders `front.png` (`a6ea6288b974fc69ac21a0afe8c2decba89a2e38fb6491d463ecd637067bfa47`) and `side.png` (`ac967dc7e43954482136b2d6dd034667b8852674e278824c372f99bd145cf2ea`).
   - Round 2's note says what to look for: the head's slight turn to its left, the tail low and a little to one side, and the solid red-gold coat with no white markings.
3. **Q199:** the date the concept's models and the mesh's models were last checked against newer releases, no later than the day round 3 runs.
4. **The brief he's approving by queuing it:** `/srv/studio/briefs/dog/3.json`, `35c045bf…d2cc`.

He can print every hash in one go, nothing secret:

```text
sha256sum /srv/studio/outputs/dog/step1/seed2/* /srv/studio/outputs/dog/step3/* /srv/studio/briefs/dog/3.json /srv/studio/briefs/dog/2.result.json
```

### What starts round 3
1. Once both reviews are done with no change asked for, he queues one studio task (for example `studio-dog-r7`) to run `/srv/studio/briefs/dog/3.json`. His request says, in his words:
   - the Q199 date;
   - that he reviewed seed 2 of P-0030 and accepts it;
   - that he reviewed the step-3 mesh and accepts it.

   The brief tells the studio to stop without those, and to write nothing in `/srv/studio/handoff/dog/3/` when it stops.
2. After the handoff, an implementer judges and records it, from the line's checkout (this stack's branch, or main once merged):

```text
python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dog/3 --brief /srv/studio/briefs/dog/3.json --record
cat /srv/studio/briefs/dog/3.result.json
```

3. A pass goes to his look approval, which is `approvals.json` naming each file's SHA-256 with a non-empty `disclosure_line`. Only after that does the dog leave the stand-in behind, in a task that brings `assets/visitors/dog/` in.

**If a review asks for a change:** a new concept or mesh is a new GPU step, which this brief doesn't allow, and round 3 is the dog's last under `line.py`'s three rounds. That's his decision. The question below gives the options.

## Follow-ups for the stack's note (not tonight; `line.py` unchanged)
- **A round counts as answered only with a `candidate.json`** (rule 9's follow-up). Until then, a notes-only stop in `/srv/studio/handoff/dog/3/` would burn the dog's last round. That's why round 3's brief sends a stop's note to `/srv/studio/outputs/dog/round3/`.
- **A refused name in `files` hides the arrival check** (judge-dog-r2's fault 4, `scripts/studio/line.py:906` to `:921` and `:1176` to `:1179`). A refused name should drop that name only, and the arrival check should run whenever the record parses and every named GLB is there.

## Questions left on the page (`/night/io/out/questions.md`)
1. A round-3 stop writes its note to `/srv/studio/outputs/dog/round3/stop-note.md` and leaves `/srv/studio/handoff/dog/3/` uncreated, so a stop doesn't use the dog's last round? Recommended: yes.
2. If his review of the concept or the mesh asks for a change, how does the dog get a new GPU step when round 3 is its last? Recommended: change `line.py`'s round count (the follow-up above) before a round 3 that makes a new concept or mesh. Then rewrite `3.json` while `/srv/studio/handoff/dog/3/` doesn't exist.

## Interruptions
- **2026-11-14, record-dog-r2:** the permission prompt was denied for one chained command: a save-point commit, `ls -la /srv/studio/outputs/dog/step3/`, `sha256sum` of that folder's files, and `ls /srv/studio/outputs/dog/step1/`. Alone, the commit then ran. Alone, `ls -la /srv/studio/outputs/dog/step3/` was denied again. I didn't try another spelling or route to that folder. I took round 2's step-3 facts from its handoff note, and the morning command above prints the mesh's hash for the Author.
- **The scratch folders** `/tmp/record-dog-r2.data.f2hA/` and `/tmp/record-dog-r2.script.zlBL/` stay. A recursive delete outside the workspace is refused by the bash gate (judge-dog-r2). They hold the notes, the script, a copy of the man's `LICENSE.md`, and copies of the dog's briefs and results: no photo and no secret.

## Lint
This task changes files in this spec folder only, and no code or test, so the lint target is its only test (rule 4). The first run stopped at `node_modules is missing: run make setup`. `make setup` then exited 0. Its git-hooks step said the hooks folder isn't writable from the sandbox and the Author runs `make git-hooks`. The second run:

```text
$ make lint; echo "exit=$?"
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
759 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit=0
```

## The text placed as `/srv/studio/briefs/dog/3.json`

```json
{
  "schema": 1,
  "asset": "dog",
  "kind": "avatar",
  "spec": "020-dog-modeled-and-brought-in",
  "round": 3,
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
  "findings": [
    "files: records.json (limit: a distinct file name in the folder, not the record or the notice)"
  ],
  "notes": "ROUND 3 OF THE DOG, ITS LAST (spec 020-dog-modeled-and-brought-in, FR-010 to FR-014; plan section 5; three rounds per asset). Written by the night-shift implementer task record-dog-r2 on 2026-11-14 from round 2's brief, /srv/studio/briefs/dog/2.json, with the Author's answers Q202 to Q204 (each the recommended answer, under his orders). Round 2's candidate, /srv/studio/handoff/dog/2/, was recorded fail with one finding. This brief's 'findings' are that finding, verbatim. The studio has no repository: everything it needs is here.\n\nWHEN THIS ROUND RUNS. Only when the Author queues it, and only after he has done all three of these. (1) His review of the concept, by hand (Q204): seed 2 of prompt P-0030, sha256 f9d18f2b3ef2ea92df0fb6d4dfb0984a53010e6e704b55a410bf57823cc0cf99, in /srv/studio/outputs/dog/step1/seed2/. (2) His review of round 2's step-3 mesh, by hand (Q204): the mesh in /srv/studio/outputs/dog/step3/. (3) His answer to Q199: the date the concept's and the mesh's models were last checked against newer releases. His request that queues this round gives that date and says both reviews are done. Stop if any of these is missing: the request gives no date, or it doesn't say both reviews are done, or a review asks for a change (a new concept or a new mesh is a new GPU step, which this round doesn't make). A stop writes nothing in /srv/studio/handoff/dog/3/, and doesn't create that folder. A handoff folder that holds only notes counts as an answered round, and this is the dog's last. The stop's note goes to /srv/studio/outputs/dog/round3/stop-note.md, saying which of the three is missing. Queue nothing more.\n\nTHE AUTHOR'S WORDS. His item: '3. d) \"dog modeled and brought in\"'. His words on the dog (2026-11-14, about 15:18Z): \"it's a 41lb medium size dog, make a generic standing concept based on the same breed\". The corpus says of the dog, in his words: 'Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller.' Nothing else about the dog is stated: add no trait beyond the breed and his size words, and put no name in a file, a record, or a note.\n\nTHE SOURCE: A TEXT PROMPT ALONE, UNCHANGED. Round 3 makes no new concept. Its source is round 2's: prompt P-0030, from text alone, with no image input. 'references' is empty on purpose. Round 3 reads nothing in the studio's inbox. No session opens, views, copies, or lists the photos folder, /srv/studio/briefs/dog/photos/ (Q67, Q68, Q76 stand). The result is a generic dog of that breed, not a likeness of the Author's dog. Its record says likeness false and a prompt source, {\"type\": \"prompt\", \"id\": \"P-0030\"}. No credit, disclosure line, note, or file calls it a likeness of the Author's dog.\n\nNO GPU STEP (Q204). Round 3 starts at step 5, from round 2's step-3 mesh in /srv/studio/outputs/dog/step3/: the GLB Pixal3D made from seed 2, with the workflow as run sha256 8c3c5eb2276a46d42f5f18040ab7c9709975996f75680dd0c415fdbe27e8e462. It doesn't run step 1 or step 3 again, makes no new frame or mesh, and doesn't start ComfyUI. If a step would start ComfyUI anyway, ask the runner with exactly these params: {\"kind\": \"comfyui\", \"action\": \"start\", \"params\": [\"--fp32-text-enc\", \"--use-pytorch-cross-attention\", \"--disable-pinned-memory\"]}. Ask for no other param, and never --birefnet. If the runner refuses, record what it says in the note and stop. Install no node and download no weight.\n\nSTEPS. The record holds them in the man's shape, in this order.\n1. The concept, from prompt P-0030, by a model: round 2's step 1, as it ran (FLUX.2 [klein] 4B base, its Qwen3-4B text encoder, and the FLUX.2 VAE, in ComfyUI 0.42.5). For seed 2, its workflow as run has sha256 c654f2bdec42172e39a38a9070f49c53f2f63e91795e29065c39234f51659d06. Not run again.\n2. The Author's review of the concept, by hand (Q204).\n3. The mesh and its base-colour texture, from the concept, by a model: round 2's step 3, as it ran (Pixal3D int8 with DINOv3 ViT-L patch 16 with NAF, MoGe-2 ViT-L with normals, BiRefNet, and the TRELLIS.2 shape VAE and texture VAE, in ComfyUI 0.42.5). Its workflow as run has sha256 8c3c5eb2276a46d42f5f18040ab7c9709975996f75680dd0c415fdbe27e8e462. Not run again.\n4. The Author's review of the mesh, by hand (Q204).\n5. The build, from that same mesh, by the studio agent's script in Blender 5.2.3. It does what round 2's build did (/srv/studio/outputs/dog/scripts/build_dog.py, sha256 27421d793857b41637ccfb8d3c2236426531f03e10409fed7309e5db771e5959): clean, decimate, and scale the mesh; resize the texture; rig and skin; key the clips; export with the glTF exporter bundled with Blender (numpy bundled with Blender where a script needs it). Round 2's build raised no finding on the caps, bones, clips, tools, or texture. Change nothing in the model the Author reviewed. A rebuild that writes the same bytes as round 2's three GLBs is fine.\n6. Scrub (metadata stripped: no EXIF, no path, no prompt text, no machine or user name) and write the record.\nIf any step needs a tool or model not in this brief's 'tools' (all from main's assets/policy/studio-tools.json with outputs_ship true), STOP the round as WHEN THIS ROUND RUNS says, with a note saying which and why (FR-010): a new tool is the Author's to add. Never use Qwen-Image, FLUX.1 [dev], PuLID, TripoSR, GGUF, or ComfyUI-Manager (UNREVIEWED on the list; Qwen-Image and FLUX [dev] are refused by name whatever the list says). In candidate.json and in the record, name each tool by the ID here, or by a name that lowercases to it with each run of other characters a hyphen (\"ComfyUI\" is comfyui, \"Claude Opus 5.5\" is claude-opus-5.5, \"glTF exporter, bundled with Blender\" is gltf-exporter-bundled-with-blender), at the version on main's list. 'tools' still names the GPU steps' models and ComfyUI, because the record's steps 1 and 3 name them.\n\nTHE LOOK (FR-012, FR-013). A stylized, textured, rigged four-legged figure of a generic Duck Toller of medium size, as the reviewed concept and mesh show it, standing in its rest pose, head level and tail no higher than the top of the head (the room scales the model by its rest pose's bounds to 0.62 m tall, lowest point on the floor, facing +z; a raised head or tail makes it wrong). Facing +z, +y up, metres, origin on the floor between the feet. It carries no place, no person, no screen, no logo, and no text. No hand bone and nothing held: the dog never takes the paper (spec 020 Q4).\n\nRIG. One skeleton, its bone names exactly as limits.bones_required lists them (no prefix, or one 'prefix:' before each), plus any more bones you need below them (e.g. FrontLeftLeg's lower bones and paw, Tail's chain, Jaw, ears). Name NO bone LeftHand or RightHand, with or without a prefix: the room treats those names as hands. Hips is the root of the deform bones. Both clips target this skeleton's names only; a clip naming a bone the model lacks fails in the room.\n\nCLIPS (FR-005, FR-012). 'idle': a loop of a few seconds, breathing and small head and tail motion, root in place. 'walk': a four-legged walk-cycle loop, root in place (the room moves the figure; no forward travel in the clip), feet not sliding against the gait. No other clip ('idle-holding' and 'take' are not wanted). The first frame of each reads well alone (reduced motion shows the idle's first frame).\n\nFILES AND LIMITS. Three GLB files: dog.glb (kind avatar: the textured, rigged model at rest, no clips required in it), dog-idle.glb and dog-walk.glb (kind animation: each one clip on the same skeleton, the clip's name being idle or walk). Main's caps (assets/policy/caps.json): avatar at most 21000000 bytes, 180000 triangles, 46000000 texture bytes (width times height times 4, times 4/3 for mipmaps); animation at most 1000000 bytes each. Textures at most 2048 px a side. Optional for the Author's review: front.png and side.png renders of dog.glb at rest, outside 'files'.\n\nTHE MARK (C1, Q204). Each GLB carries the IPTC digital source type mark in KHR_xmp_json_ld: compositeWithTrainedAlgorithmicMedia, the man's term. That term is right only because the record mixes model steps with the Author's two reviews, steps 2 and 4, by hand. So steps 2 and 4 must be in every entry. Round 2 marked composite on a record with no hand step, and the dry check below found it (M5).\n\nTHE NOTICE (Q203). Write LICENSE.md in /srv/studio/handoff/dog/3/, beside the GLBs, outside 'files'. Its text is byte for byte the notice of the man's directory (assets/visitors/man/LICENSE.md on main): 327 bytes of ASCII, sha256 f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159. Here it is as one JSON string; decode it and write the result, with no other byte: \"Copyright (c) 2026 Hareet. All rights reserved.\\n\\nThe files in this directory are not covered by this repository's MIT license. You are welcome to view them and to link to them. Any other use needs the copyright holder's written permission.\\n\\nEach file's provenance is in records.json, and in CREDITS.md at the root of its tree.\\n\". Check that the file's sha256 is that hash before handing off. Don't change a byte: its copyright line is one the Author already filled for his visitors.\n\nCANDIDATE (Q202; hand back to /srv/studio/handoff/dog/3/). candidate.json: {\"schema\": 1, \"asset\": \"dog\", \"round\": 3, \"files\": [\"dog.glb\", \"dog-idle.glb\", \"dog-walk.glb\"], \"tools\": [{\"id\": \"<an ID from this brief>\", \"version\": \"<its version on main's list>\"}, ...], \"records\": \"records.json\"}. 'files' lists the three GLBs and nothing else. records.json is named by 'records' alone. line.py refuses records.json, LICENSE.md, and candidate.json in 'files', and round 2 failed on that alone. Every listed file is a regular file in that folder. The folder holds candidate.json, the three GLBs, records.json, LICENSE.md, this run's note.md, and the optional renders. The files arrive in the repository at assets/visitors/dog/ (the record's 'directory'), by the Author's intake. Write nothing in round 1's or round 2's folder.\n\nRECORD FORMAT (records.json; spec 003's contracts/asset-record.md and the arrival check, as assets/visitors/man/records.json is). Top level, in this order: \"schema\": 1, \"directory\": \"assets/visitors/dog\", \"license\": \"all-rights-reserved-2026\", \"entries\" (sorted by file; two-space indent; trailing newline; no other key at any level). Each entry, keys in this order: \"file\"; \"sha256\" (64 hex); \"kind\" (\"avatar\" for dog.glb, \"animation\" for the clips); \"made\" (YYYY-MM-DD, the day this round makes the file); \"source\": {\"type\": \"prompt\", \"id\": \"P-0030\"}; \"likeness\": false; \"steps\"; \"media_license\": \"all-rights-reserved-2026\". Leave out \"approval\": the look approval is the Author's, after the round. Each entry's steps, in order: the concept (model), \"the Author's review of the concept\" (hand), the mesh (model), \"the Author's review of the mesh\" (hand), the build (model); each clip's entry then adds its own clip step. A hand step holds \"name\" and \"by\": \"hand\" and nothing else: no models, no tools. A model step: \"name\" (what was done, in words, no path), \"by\": \"model\", \"models\" (each: name, repository, revision, role primary or auxiliary, license, license_version, as main's list and the man's record give them), \"tools\" (each: name, version, license, license_version), \"models_checked\", \"workflow_sha256\". For a step by the studio agent's script, also \"service\": {\"name\": \"Claude Code\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\", \"disclosure_row\": \"D4\"} and the model Claude Opus 5.5 (repository anthropic/claude-opus-5-5, revision claude-opus-5-5). Steps 1 and 3 are round 2's as they ran: the same models, tools, and workflow_sha256. \"models_checked\" on steps 1 and 3 is the date the Author gives in his answer to Q199, as the request queuing this round gives it (Q199). On the build and clip steps it is the day the studio checks those models in this run. Never a placeholder, and never a date the Author didn't give: without his date, stop (WHEN THIS ROUND RUNS). Every model and tool a step names must be in this brief's 'tools'. No step, name, or credit calls the model a likeness of the Author's dog. No photo, no photo name, no EXIF, no path, and nothing from the studio's inbox, anywhere.\n\nROUND 2'S HIDDEN LINES (a dry check, not recorded findings). Round 2's recorded finding stopped line.py before main's arrival check. Task judge-dog-r2 ran the same judge, dry, on a scratch copy with only that line removed. It showed ten more lines, which this brief fixes: six R6 lines, \"entries[i].steps[0 and 1] is a model step with no models_checked date\" in each of the three entries (fixed by the Author's Q199 date); N1, \"the directory has no LICENSE.md, the media license's notice\" (fixed by THE NOTICE); and three M5 lines, one per GLB, \"the mark is compositeWithTrainedAlgorithmicMedia where its record's steps call for trainedAlgorithmicMedia\" (fixed by steps 2 and 4, THE MARK). The caps, bones, clips, tools, and texture raised none.\n\nJUDGING. An implementer runs python3 -I -B scripts/studio/line.py candidate on the handoff folder against this brief (it also runs main's arrival check) and records the round. The files are recorded likeness false with a prompt source, so arrival check P1 (an approval naming the file's hash) does not apply and every line counts; a warning that it's up to the contributor to check for likeness is expected. A pass goes to the Author's look judgement: the model shows in the room only after his look approval (approvals.json naming its SHA-256 with a non-empty disclosure_line), and no credit or disclosure line calls it a likeness of the Author's dog."
}
```

## Round 3 rewritten for his review

Task `brief-dog-r7` (night of 2026-11-13, implementer, Opus 5.5, on 2026-11-14), under rule 9's 17:25Z paragraph of the Author's orders. The JSON block above is record-dog-r2's text, kept as its record. It's superseded: the text now placed as `/srv/studio/briefs/dog/3.json` is the JSON block at the end of this section, byte for byte.

**Outcome:**
- **Round 3's brief is rewritten and placed**, SHA-256 `0c0ecf8e9a71fd9ba0688c65da5173bd2dc0f6ad6d6e8b5a59961c884d6ca308` (19,666 bytes). `line.py brief` passes on it.
- **studio-dog-r7 runs the round.** No studio round ran in this task.
- **The verdict will be a fail unless his Q199 date arrives first.** The record keeps round 2's `models_checked` placeholder, as the supervisor's instructions say, and main's arrival check counts it as six R6 lines. See "What this means for the verdict" below, and the first question.

`line.py` is unchanged. Nothing went into `assets/**` or the room's code. I didn't create `/srv/studio/handoff/dog/3/`, and didn't open, view, copy, or list the photos folder or the inbox.

### His words

His look approval and review (2026-11-14, about 17:25Z), in his words:

> "Okay, dinosaur is approved, and dog seems to have changed the face compared to the concept? Look at the face markings on the concept with white and white on the under body and white feet, common markings of a Nova Scotia Duck Tolling Retriever. Do you want to incorporate those"

His orders read it this way for the dog (Q204), in rule 9's words: "he reviewed the concept, seed 2 of P-0030, and keeps it. He doesn't accept round 2's mesh as it is: its face lost the concept's markings." Round 3 "carries the concept's Toller markings: the white on the face as the concept shows it, white on the under body (chest and belly), and white feet, on the breed's red-orange coat."

### The checks before rewriting

```text
$ sha256sum /srv/studio/briefs/dog/3.json
35c045bf159912635edb519c18bb10646744e2e46e4470b8eb84fec742d5d2cc  /srv/studio/briefs/dog/3.json
$ ls /srv/studio/briefs/dog/        # the briefs folder; the photos folder inside it wasn't opened
1.json  1.result.json  2.json  2.result.json  3.json  photos
$ ls -d /srv/studio/handoff/dog/3
ls: cannot access '/srv/studio/handoff/dog/3': No such file or directory
$ ls /srv/studio/handoff/dog/
1  2
# 2.result.json, parsed:
{'schema': 1, 'asset': 'dog', 'round': 2, 'result': 'fail', 'findings': ['files: records.json (limit: a distinct file name in the folder, not the record or the notice)']}
```

All three match: `3.json` is record-dog-r2's, there's no `3.result.json` and no round-3 handoff folder, and round 2 is recorded `fail`.

### What changed, and why

Kept as placed: `round` (3), `findings` (round 2's line, verbatim), the 14 tool IDs, `limits` and the caps, `references` (`[]`), `files` (the three GLBs), the notice's text and hash, the rig, the clips, the mark's term, the record's shape, `likeness: false` with source P-0030, the ban on the photos folder and the inbox, and JUDGING. Every field but `notes` is identical to the placed text, in the same key order, and the file has the same form (`json.dumps`, two-space indent, trailing newline, ASCII).

In `notes`:
- **Header:** says brief-dog-r7 rewrote it, from record-dog-r2's text (`35c045bf…d2cc`).
- **THE AUTHOR'S REVIEW (new):** quotes his words whole, with a line saying the dinosaur isn't touched. It gives his order's reading:
  1. **The concept, kept:** seed 2 of P-0030, SHA-256 `f9d18f2b3ef2ea92df0fb6d4dfb0984a53010e6e704b55a410bf57823cc0cf99`, in `/srv/studio/outputs/dog/step1/seed2/`, taken from round 2's note (`/srv/studio/handoff/dog/2/note.md:25` to `:27`). The ComfyUI input copy, `dog-step1-seed2.png`, is named too (note.md:30 and :80). The studio checks the hash before using either. His review is a hand step.
  2. **Round 2's mesh, not accepted:** his review is a hand step asking for the markings. The markings are given in the order's words.
- **WHEN THIS ROUND RUNS:** no longer waits for his two reviews or a Q199 date, because both reviews are done.
  - It runs as studio-dog-r7.
  - It stops when the compare doesn't match, a step needs a tool not in `tools`, the runner refuses ComfyUI, or a check the brief asks for can't pass.
  - Every stop goes to `/srv/studio/outputs/dog/round3/stop-note.md` (Q208) and never creates the round-3 handoff folder. Record, and queue nothing more.
- **THE AUTHOR'S WORDS:** the markings his review names are now the one trait allowed beyond the breed and his size words.
- **THE SOURCE:** unchanged, but now says `references` stays `[]` on purpose. `line.py` accepts only repository paths there (`scripts/studio/line.py:456` to `:467`), so the concept's path goes in `notes`, and it's the only image round 3 compares against.
- **THE ROUTE (new; replaces NO GPU STEP):** the studio picks one route and says which and why. Working files go under `/srv/studio/outputs/dog/round3/`, and round 2's are left untouched.
  - **(a) A new textured mesh:** the step-3 GPU step, from round 2's step-3 workflow (`8c3c5eb2…e462`) with the save prefix `dog/round3/`. Any other change is recorded by its new workflow hash. ComfyUI starts only through the runner with exactly `--fp32-text-enc`, `--use-pytorch-cross-attention`, `--disable-pinned-memory`, never `--birefnet`. A refusal is recorded and stops the round. ComfyUI is stopped afterwards. No node is installed and no weight downloaded.
  - **(b) The markings painted:** onto a copy of round 2's step-3 mesh, on its base-colour texture, by the studio agent's script in Blender 5.2.3, against the concept, moving no vertex. No GPU step.
- **THE COMPARE (new):** quotes rule 9's words.
  - It builds everything in `/srv/studio/outputs/dog/round3/` first.
  - It renders front and side from the GLB as built, so a decimation or texture resize that loses a marking is caught.
  - It compares the face, the chest and belly, and the feet one at a time.
  - It creates the handoff folder only when all three match.
- **STEPS:** one list per route. Each hand step's name is given exactly:
  - **Route (a):** concept (model, round 2's), "the Author's review of the concept" (hand), "the Author's review of an earlier mesh from this concept, which asked for the concept's white markings on the face, the under body, and the feet" (hand), the new mesh (model), the build.
  - **Route (b):** concept (model), "the Author's review of the concept" (hand), round 2's mesh (model, `8c3c5eb2…e462`), "the Author's review of the mesh, which asked for …" (hand), the painting (model: Claude Opus 5.5, the service, the script's hash), the build.
  - **The build** does what round 2's `build_dog.py` (`27421d79…5959`) did. Only its input changes, and a changed script is recorded by its own hash.
- **THE LOOK:** "as the reviewed concept shows it, with the concept's markings". Round 2's mesh is no longer the reference.
- **FILES AND LIMITS / CANDIDATE:** the front and side renders are no longer optional, because the compare makes them. They stay outside `files`, stripped to image chunks. The candidate is written only after the compare matches.
- **THE MARK:** the hand steps' positions are given per route. Main's arrival check asks only that model and hand steps mix (`tools/gates/arrival_check.py:37` to `:39` on main), so either route keeps `compositeWithTrainedAlgorithmicMedia`.
- **RECORD FORMAT:** steps per route, and `models_checked` on the concept and mesh steps is round 2's placeholder, verbatim. If the round runs after 2026-11-14, the run day replaces that date in it.
  - **One addition beyond the supervisor's instructions:** "Only if the request that queues this round quotes the Author's own answer to Q199, in his words, write his date instead."
  - Why: the placeholder costs the dog's last round (next section). This clause lets his date in without a second rewrite, and only from him. It's the second question, so he can drop it.
- **ROUND 2'S HIDDEN LINES:** the R6 lines are no longer called "fixed". They stay open while the placeholder does, and the studio isn't to stop for them.

### What this means for the verdict

Main's arrival check reads `models_checked` as a date or nothing (`tools/gates/arrival_check.py:2352` to `:2355` on main). judge-dog-r2's dry run showed the placeholder raising R6 on the concept and mesh steps of each entry: six lines. JUDGING says every line counts. So if studio-dog-r7 hands off with the placeholder, round 3, the dog's last under `line.py`'s three rounds, is recorded `fail` on those six lines alone, however well the markings come out. Q199 is his, so I didn't fill a date. The first question asks for it before studio-dog-r7 runs.

### The check, then the placement

I wrote the text with the Write tool into a scratch copy of the briefs folder, `/tmp/brief-dog-r7.data.5I4o/briefs/dog/`. It held copies of `1.json`, `1.result.json`, `2.json`, and `2.result.json`, and nothing from the photos folder. I checked the text there:

```text
$ python3 -I -B <inline check> <scratch>/3.json <scratch>/man-LICENSE.md   # man-LICENSE.md: git show main:assets/visitors/man/LICENSE.md
canonical: True ascii: True
same but notes: True keys in order: True
notice: True 327 f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159
likeness false in notes: True | photos path named only as banned: 1
brief sha256: 0c0ecf8e9a71fd9ba0688c65da5173bd2dc0f6ad6d6e8b5a59961c884d6ca308 19666 bytes

$ python3 -I -B scripts/studio/line.py brief /tmp/brief-dog-r7.data.5I4o/briefs/dog/3.json; echo "exit=$?"
line: pass
exit=0
```

Then I placed it with the Write tool, the same text, and checked it where it is:

```text
$ cmp /tmp/brief-dog-r7.data.5I4o/briefs/dog/3.json /srv/studio/briefs/dog/3.json && echo identical
identical
$ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/dog/3.json; echo "exit=$?"
line: pass
exit=0
$ sha256sum /srv/studio/briefs/dog/*.json
f1897ad37cc88866b967e24b5b1e89b628d60a7b29f3469ed943e3a219e63b97  /srv/studio/briefs/dog/1.json
65783b3b6be96413b799bf04ae8c750b75dd6d1fefff1cd1b1c9b0245f39ecac  /srv/studio/briefs/dog/1.result.json
d15050f122b7e0c334b0f335c1f47305e9b5675689a29d7009df3f46632a2495  /srv/studio/briefs/dog/2.json
08daa2063dc2255255c0b0c5c6fa7bea83b84df1b0bbaf90dcecb7b82c9ab8bd  /srv/studio/briefs/dog/2.result.json
0c0ecf8e9a71fd9ba0688c65da5173bd2dc0f6ad6d6e8b5a59961c884d6ca308  /srv/studio/briefs/dog/3.json
$ ls /srv/studio/handoff/dog/
1
2
```

The SHA-256s: before, `35c045bf159912635edb519c18bb10646744e2e46e4470b8eb84fec742d5d2cc` (record-dog-r2's); now, `0c0ecf8e9a71fd9ba0688c65da5173bd2dc0f6ad6d6e8b5a59961c884d6ca308`.

### Lint

This task changes this spec file only, and no code or test, so the lint target is its only test (rule 4). The first run stopped at `node_modules is missing: run make setup`. `make setup` then exited 0. Its git-hooks step said the hooks folder isn't writable from the sandbox and the Author runs `make git-hooks`. The second run, after the write-up above was committed:

```text
$ make lint; echo "exit=$?"
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
759 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit=0
```

### Questions left on the page (`/night/io/out/questions.md`)

1. Round 3 keeps round 2's `models_checked` placeholder, which the arrival check counts as six R6 lines, so the dog's last round fails on them alone. Will he give his Q199 date before studio-dog-r7 runs? Recommended: yes, in his words on the page, with the supervisor quoting it in studio-dog-r7's request. The placed brief already takes a date quoted that way (`/srv/studio/briefs/dog/3.json:49`, RECORD FORMAT).
2. Keep the brief's clause that takes his Q199 date when the queuing request quotes it, an addition beyond the supervisor's instructions? Recommended: keep it.

### Follow-ups for the stack's note (not tonight)

These stand as record-dog-r2 wrote them: a round counts as answered only with a `candidate.json`, and a refused name in `files` shouldn't hide the arrival check. `line.py` is unchanged.

### Interruptions

- **2026-11-14, brief-dog-r7:** the permission prompt was denied for one chained listing: `ls -la /srv/studio/handoff/dog/2/ /srv/studio/outputs/dog/` together with `ls` of this spec folder. Alone, the handoff folder's and the spec folder's listings ran. I didn't list `/srv/studio/outputs/dog/` another way. The brief takes the concept's and the mesh's paths and hashes from round 2's note instead.
- **No hook or bash-gate refusal was hit.**
- **The scratch folder `/tmp/brief-dog-r7.data.5I4o/` stays.** A recursive delete outside the workspace is refused by the bash gate (judge-dog-r2). It holds the copies of the dog's earlier briefs and results, the new text, and a copy of the man's `LICENSE.md`: no photo and no secret.

### The text placed as `/srv/studio/briefs/dog/3.json` (brief-dog-r7)

```json
{
  "schema": 1,
  "asset": "dog",
  "kind": "avatar",
  "spec": "020-dog-modeled-and-brought-in",
  "round": 3,
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
  "findings": [
    "files: records.json (limit: a distinct file name in the folder, not the record or the notice)"
  ],
  "notes": "ROUND 3 OF THE DOG, ITS LAST (spec 020-dog-modeled-and-brought-in, FR-010 to FR-014; plan section 5; three rounds per asset). Rewritten by the night-shift implementer task brief-dog-r7 on 2026-11-14 for the Author's review of about 17:25Z, from the text task record-dog-r2 placed here (sha256 35c045bf159912635edb519c18bb10646744e2e46e4470b8eb84fec742d5d2cc), which came from round 2's brief, /srv/studio/briefs/dog/2.json, with the Author's answers Q202 to Q204. Round 2's candidate, /srv/studio/handoff/dog/2/, was recorded fail with one finding. This brief's 'findings' are that finding, verbatim. The studio has no repository: everything it needs is here.\n\nTHE AUTHOR'S REVIEW (2026-11-14, about 17:25Z), in his words: \"Okay, dinosaur is approved, and dog seems to have changed the face compared to the concept? Look at the face markings on the concept with white and white on the under body and white feet, common markings of a Nova Scotia Duck Tolling Retriever. Do you want to incorporate those\". (The dinosaur is another asset. Nothing in this round touches it.) His order reads it this way, for this round:\n(1) The concept. He reviewed it, seed 2 of prompt P-0030, and keeps it. It is the frame with sha256 f9d18f2b3ef2ea92df0fb6d4dfb0984a53010e6e704b55a410bf57823cc0cf99 in /srv/studio/outputs/dog/step1/seed2/ (round 2's note). Round 2 also left a copy in ComfyUI's input folder as dog-step1-seed2.png. Check a file's sha256 is that hash before using it. His review of the concept is a hand step in the record.\n(2) Round 2's mesh. He doesn't accept it as it is: its face lost the concept's markings. His review of it is a hand step in the record, asking for the markings. Round 3's candidate carries the concept's Toller markings: the white on the face as the concept shows it, white on the under body (chest and belly), and white feet, on the breed's red-orange coat.\n\nWHEN THIS ROUND RUNS. When task studio-dog-r7 runs it, queued under the Author's order. Both of his reviews are done (above), so the round waits for nothing else. It STOPS in any of these cases: the compare (THE COMPARE) doesn't match; a step needs a tool or model not in this brief's 'tools'; the runner refuses ComfyUI (route a); or a check this brief asks for can't pass. A stop writes nothing in /srv/studio/handoff/dog/3/, and doesn't create that folder: a handoff folder that holds only notes counts as an answered round, and this is the dog's last. The stop's note goes to /srv/studio/outputs/dog/round3/stop-note.md (Q208), saying what stopped the round and why. Record, and queue nothing more.\n\nTHE AUTHOR'S WORDS. His item: '3. d) \"dog modeled and brought in\"'. His words on the dog (2026-11-14, about 15:18Z): \"it's a 41lb medium size dog, make a generic standing concept based on the same breed\". His review (about 17:25Z) is quoted above. The corpus says of the dog, in his words: 'Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller.' Nothing else about the dog is stated: add no trait beyond the breed, his size words, and the markings his review names, and put no name in a file, a record, or a note.\n\nTHE SOURCE: A TEXT PROMPT ALONE, UNCHANGED. Round 3 makes no new concept. Its source is round 2's: prompt P-0030, from text alone, with no image input. 'references' is empty on purpose (it holds repository paths only, and the concept is outside the repository). The only image round 3 compares against is that concept frame. Round 3 reads nothing in the studio's inbox. No session opens, views, copies, or lists the photos folder, /srv/studio/briefs/dog/photos/ (Q67, Q68, Q76 stand). The result is a generic dog of that breed, not a likeness of the Author's dog. Its record says likeness false and a prompt source, {\"type\": \"prompt\", \"id\": \"P-0030\"}. No credit, disclosure line, note, or file calls it a likeness of the Author's dog.\n\nTHE ROUTE: PICK ONE, AND RECORD IT AS THE STEP IT IS. The studio chooses how the candidate gets the markings, one of these two, and says in its note which and why. Write round 3's working files under /srv/studio/outputs/dog/round3/. Change nothing in round 2's working files, or in round 1's or round 2's handoff folders.\n(a) A NEW TEXTURED MESH from the same concept, by the step-3 GPU step: Pixal3D int8 with DINOv3 ViT-L patch 16 with NAF, MoGe-2 ViT-L with normals, BiRefNet, and the TRELLIS.2 shape VAE and texture VAE, in ComfyUI 0.42.5, from the concept frame above. Start from round 2's step-3 workflow (mesh_pixal3d_textured_hi, as run sha256 8c3c5eb2276a46d42f5f18040ab7c9709975996f75680dd0c415fdbe27e8e462), with its save prefix set to dog/round3/. Any other change (a seed, a texture setting) is recorded by the new workflow-as-run sha256. Start ComfyUI only by asking the runner with exactly these params: {\"kind\": \"comfyui\", \"action\": \"start\", \"params\": [\"--fp32-text-enc\", \"--use-pytorch-cross-attention\", \"--disable-pinned-memory\"]}. Ask for no other param, and never --birefnet. If the runner refuses, record what it says in the stop's note and stop. Ask the runner to stop ComfyUI when the step is done. Install no node and download no weight.\n(b) THE MARKINGS PAINTED onto round 2's step-3 mesh, in Blender. The mesh is the GLB Pixal3D made from seed 2, in /srv/studio/outputs/dog/step3/ (workflow as run sha256 8c3c5eb2276a46d42f5f18040ab7c9709975996f75680dd0c415fdbe27e8e462). Copy it to /srv/studio/outputs/dog/round3/, and leave round 2's file as it is. The studio agent's script, in Blender 5.2.3 (numpy bundled with Blender where it needs it), paints the markings onto the mesh's base-colour texture, against the concept: the white on the face as the concept shows it, the chest and belly, and the four feet. It moves no vertex. Route (b) makes no GPU step and doesn't start ComfyUI.\nEither way, the build follows, then the compare.\n\nTHE COMPARE (rule 9 of the Author's orders, in his order's words): \"Before it writes anything into /srv/studio/handoff/dog/3/, it renders front and side and compares them with the concept for those markings. If they don't match, it stops and writes its note under /srv/studio/outputs/dog/, never creating the round-3 handoff folder, since a folder with notes alone spends the last round.\" So: build all three GLBs, the record, and the notice in /srv/studio/outputs/dog/round3/ first. Render front.png and side.png of dog.glb at rest there, from the GLB as built (after the decimation and the texture's resize, which must keep the markings). Compare them with the concept for the face, the chest and belly, and the four feet, one at a time, and write in the note what each shows. If any doesn't match, stop: the note is /srv/studio/outputs/dog/round3/stop-note.md (Q208), saying which marking doesn't match and how. Only when all three match and every check in this brief passes, create /srv/studio/handoff/dog/3/ and write the candidate into it.\n\nSTEPS. The record holds them in the man's shape, in the route's order.\nRoute (a):\n1. The concept, from prompt P-0030, by a model: round 2's step 1, as it ran (FLUX.2 [klein] 4B base, its Qwen3-4B text encoder, and the FLUX.2 VAE, in ComfyUI 0.42.5). For seed 2, its workflow as run has sha256 c654f2bdec42172e39a38a9070f49c53f2f63e91795e29065c39234f51659d06. Not run again.\n2. \"the Author's review of the concept\" (hand).\n3. \"the Author's review of an earlier mesh from this concept, which asked for the concept's white markings on the face, the under body, and the feet\" (hand).\n4. The new mesh and its base-colour texture, from the concept, by a model (route (a) above), with its own workflow-as-run sha256.\n5. The build (below).\nRoute (b):\n1. The concept, as in route (a)'s step 1. Not run again.\n2. \"the Author's review of the concept\" (hand).\n3. The mesh and its base-colour texture, from the concept, by a model: round 2's step 3, as it ran (Pixal3D int8 with DINOv3 ViT-L patch 16 with NAF, MoGe-2 ViT-L with normals, BiRefNet, and the TRELLIS.2 shape VAE and texture VAE, in ComfyUI 0.42.5). Its workflow as run has sha256 8c3c5eb2276a46d42f5f18040ab7c9709975996f75680dd0c415fdbe27e8e462. Not run again.\n4. \"the Author's review of the mesh, which asked for the concept's white markings on the face, the under body, and the feet\" (hand).\n5. The markings painted onto the mesh's base-colour texture against the concept, by the studio agent's script in Blender (a model step: Claude Opus 5.5 primary, the tools it used, the service, and the painting script's sha256 as workflow_sha256).\n6. The build (below).\nTHE BUILD, by the studio agent's script in Blender 5.2.3, from the route's mesh. It does what round 2's build did (/srv/studio/outputs/dog/scripts/build_dog.py, sha256 27421d793857b41637ccfb8d3c2236426531f03e10409fed7309e5db771e5959): clean, decimate, and scale the mesh; resize the texture; rig and skin; key the clips; export with the glTF exporter bundled with Blender (numpy bundled with Blender where a script needs it). Round 2's build raised no finding on the caps, bones, clips, tools, or texture. Only its input changes: if the script changes, record the sha256 of the script as run. Each clip's entry then adds its own clip step. Last, scrub (metadata stripped: no EXIF, no path, no prompt text, no machine or user name) and write the record.\nIf any step needs a tool or model not in this brief's 'tools' (all from main's assets/policy/studio-tools.json with outputs_ship true), STOP the round as WHEN THIS ROUND RUNS says, with a note saying which and why (FR-010): a new tool is the Author's to add. Never use Qwen-Image, FLUX.1 [dev], PuLID, TripoSR, GGUF, or ComfyUI-Manager (UNREVIEWED on the list; Qwen-Image and FLUX [dev] are refused by name whatever the list says). In candidate.json and in the record, name each tool by the ID here, or by a name that lowercases to it with each run of other characters a hyphen (\"ComfyUI\" is comfyui, \"Claude Opus 5.5\" is claude-opus-5.5, \"glTF exporter, bundled with Blender\" is gltf-exporter-bundled-with-blender), at the version on main's list. 'tools' still names the GPU steps' models and ComfyUI, because the record's concept and mesh steps name them.\n\nTHE LOOK (FR-012, FR-013). A stylized, textured, rigged four-legged figure of a generic Duck Toller of medium size, as the reviewed concept shows it, with the concept's markings (THE AUTHOR'S REVIEW), standing in its rest pose, head level and tail no higher than the top of the head (the room scales the model by its rest pose's bounds to 0.62 m tall, lowest point on the floor, facing +z; a raised head or tail makes it wrong). Facing +z, +y up, metres, origin on the floor between the feet. It carries no place, no person, no screen, no logo, and no text. No hand bone and nothing held: the dog never takes the paper (spec 020 Q4).\n\nRIG. One skeleton, its bone names exactly as limits.bones_required lists them (no prefix, or one 'prefix:' before each), plus any more bones you need below them (e.g. FrontLeftLeg's lower bones and paw, Tail's chain, Jaw, ears). Name NO bone LeftHand or RightHand, with or without a prefix: the room treats those names as hands. Hips is the root of the deform bones. Both clips target this skeleton's names only; a clip naming a bone the model lacks fails in the room.\n\nCLIPS (FR-005, FR-012). 'idle': a loop of a few seconds, breathing and small head and tail motion, root in place. 'walk': a four-legged walk-cycle loop, root in place (the room moves the figure; no forward travel in the clip), feet not sliding against the gait. No other clip ('idle-holding' and 'take' are not wanted). The first frame of each reads well alone (reduced motion shows the idle's first frame).\n\nFILES AND LIMITS. Three GLB files: dog.glb (kind avatar: the textured, rigged model at rest, no clips required in it), dog-idle.glb and dog-walk.glb (kind animation: each one clip on the same skeleton, the clip's name being idle or walk). Main's caps (assets/policy/caps.json): avatar at most 21000000 bytes, 180000 triangles, 46000000 texture bytes (width times height times 4, times 4/3 for mipmaps); animation at most 1000000 bytes each. Textures at most 2048 px a side. The compare's front.png and side.png renders of dog.glb at rest go in the handoff folder for the Author's review, outside 'files', stripped to image chunks.\n\nTHE MARK (C1, Q204). Each GLB carries the IPTC digital source type mark in KHR_xmp_json_ld: compositeWithTrainedAlgorithmicMedia, the man's term. That term is right only because the record mixes model steps with the Author's two reviews, by hand (steps 2 and 3 in route (a), steps 2 and 4 in route (b)). So both hand steps must be in every entry. Round 2 marked composite on a record with no hand step, and the dry check below found it (M5).\n\nTHE NOTICE (Q203). Write LICENSE.md in /srv/studio/handoff/dog/3/, beside the GLBs, outside 'files'. Its text is byte for byte the notice of the man's directory (assets/visitors/man/LICENSE.md on main): 327 bytes of ASCII, sha256 f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159. Here it is as one JSON string; decode it and write the result, with no other byte: \"Copyright (c) 2026 Hareet. All rights reserved.\\n\\nThe files in this directory are not covered by this repository's MIT license. You are welcome to view them and to link to them. Any other use needs the copyright holder's written permission.\\n\\nEach file's provenance is in records.json, and in CREDITS.md at the root of its tree.\\n\". Check that the file's sha256 is that hash before handing off. Don't change a byte: its copyright line is one the Author already filled for his visitors.\n\nCANDIDATE (Q202; hand back to /srv/studio/handoff/dog/3/, only after THE COMPARE matches). candidate.json: {\"schema\": 1, \"asset\": \"dog\", \"round\": 3, \"files\": [\"dog.glb\", \"dog-idle.glb\", \"dog-walk.glb\"], \"tools\": [{\"id\": \"<an ID from this brief>\", \"version\": \"<its version on main's list>\"}, ...], \"records\": \"records.json\"}. 'files' lists the three GLBs and nothing else. records.json is named by 'records' alone. line.py refuses records.json, LICENSE.md, and candidate.json in 'files', and round 2 failed on that alone. Every listed file is a regular file in that folder. The folder holds candidate.json, the three GLBs, records.json, LICENSE.md, this run's note.md, and the two renders. The files arrive in the repository at assets/visitors/dog/ (the record's 'directory'), by the Author's intake. Write nothing in round 1's or round 2's folder.\n\nRECORD FORMAT (records.json; spec 003's contracts/asset-record.md and the arrival check, as assets/visitors/man/records.json is). Top level, in this order: \"schema\": 1, \"directory\": \"assets/visitors/dog\", \"license\": \"all-rights-reserved-2026\", \"entries\" (sorted by file; two-space indent; trailing newline; no other key at any level). Each entry, keys in this order: \"file\"; \"sha256\" (64 hex); \"kind\" (\"avatar\" for dog.glb, \"animation\" for the clips); \"made\" (YYYY-MM-DD, the day this round makes the file); \"source\": {\"type\": \"prompt\", \"id\": \"P-0030\"}; \"likeness\": false; \"steps\"; \"media_license\": \"all-rights-reserved-2026\". Leave out \"approval\": the look approval is the Author's, after the round. Each entry's steps are the route's, in the order STEPS gives; each clip's entry then adds its own clip step. A hand step holds \"name\" and \"by\": \"hand\" and nothing else: no models, no tools. Its name is the quoted text in STEPS. A model step: \"name\" (what was done, in words, no path), \"by\": \"model\", \"models\" (each: name, repository, revision, role primary or auxiliary, license, license_version, as main's list and the man's record give them), \"tools\" (each: name, version, license, license_version), \"models_checked\", \"workflow_sha256\". For a step by the studio agent's script, also \"service\": {\"name\": \"Claude Code\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\", \"disclosure_row\": \"D4\"} and the model Claude Opus 5.5 (repository anthropic/claude-opus-5-5, revision claude-opus-5-5). The concept step, and round 2's mesh step in route (b), are round 2's as they ran: the same models, tools, and workflow_sha256. \"models_checked\" (Q199 is the Author's): on the concept step and the mesh step (round 2's, or route (a)'s new one), round 2's placeholder, verbatim: \"<the Author's: the date these models were last checked against newer releases, no later than 2026-11-14>\", with the day this round runs in place of 2026-11-14 if that's later. Only if the request that queues this round quotes the Author's own answer to Q199, in his words, write his date instead. On the painting, build, and clip steps it is the day the studio checks those models in this run. Never a date the Author didn't give for the concept and mesh steps. Every model and tool a step names must be in this brief's 'tools'. No step, name, or credit calls the model a likeness of the Author's dog. No photo, no photo name, no EXIF, no path, and nothing from the studio's inbox, anywhere.\n\nROUND 2'S HIDDEN LINES (a dry check, not recorded findings). Round 2's recorded finding stopped line.py before main's arrival check. Task judge-dog-r2 ran the same judge, dry, on a scratch copy with only that line removed. It showed ten more lines: six R6 lines, \"entries[i].steps[0 and 1] is a model step with no models_checked date\" in each of the three entries; N1, \"the directory has no LICENSE.md, the media license's notice\" (fixed by THE NOTICE); and three M5 lines, one per GLB, \"the mark is compositeWithTrainedAlgorithmicMedia where its record's steps call for trainedAlgorithmicMedia\" (fixed by the two hand steps, THE MARK). The R6 lines stay open while the placeholder does: they are the Author's to close with his Q199 date, and they are not a reason to stop. The caps, bones, clips, tools, and texture raised none.\n\nJUDGING. An implementer runs python3 -I -B scripts/studio/line.py candidate on the handoff folder against this brief (it also runs main's arrival check) and records the round. The files are recorded likeness false with a prompt source, so arrival check P1 (an approval naming the file's hash) does not apply and every line counts; a warning that it's up to the contributor to check for likeness is expected. A pass goes to the Author's look judgement: the model shows in the room only after his look approval (approvals.json naming its SHA-256 with a non-empty disclosure_line), and no credit or disclosure line calls it a likeness of the Author's dog."
}
```

## Round 3 rewritten for his answer to Q220

Task `brief-dog-r8` (night of 2026-11-13, implementer, Opus 5.5, on 2026-11-14), under rule 9's 18:45Z paragraph of the Author's orders. brief-dog-r7's text above is kept as its record. It's superseded: the text now placed as `/srv/studio/briefs/dog/3.json` is the JSON block at the end of this section, byte for byte.

**Outcome:**

- **Round 3's brief is rewritten and placed:** SHA-256 `883e2cc5e633d4bec2a7e03bd64337b63886f2f5437580ad4b265362d5e6b47c`, 23,288 bytes. `line.py brief` passes on it.
- **The photo is a reference only, not the concept's image input.** Main's arrival check refuses a photo source here; see "The photo's source, checked" below. That's his order's own fallback.
- **studio-dog-r8 runs the round.** No studio round ran in this task.

`line.py` is unchanged. Nothing went into `assets/**` or the room's code. I didn't create `/srv/studio/handoff/dog/3/`. I didn't open, view, copy, or list the photos folder or the inbox, and opened no image.

### His words

His answer to Q220 (2026-11-14, about 18:45Z), in his words:

> "We have "~/ComfyUI/input/duck-toller.jpg" that's an actual photo of a nova scotia duck tolling retriever. Be sure to note the white markings. Can we increase any detail on the run that creates the concept or mesh?"

To two questions he answered: the dog in it is "Not my dog", and the photo is "I own it / it's free to use". He copies it to `/srv/studio/workflows/inbox/duck-toller.jpg`.

His answer to Q199 and Q207 (about 17:35Z), in his words: "we checked 3 days ago 11-11-2026".

### The checks before rewriting

```text
$ sha256sum /srv/studio/briefs/dog/3.json
0c0ecf8e9a71fd9ba0688c65da5173bd2dc0f6ad6d6e8b5a59961c884d6ca308  /srv/studio/briefs/dog/3.json
$ ls /srv/studio/briefs/dog/ | grep -v '^photos$'     # the photos folder wasn't opened
1.json
1.result.json
2.json
2.result.json
3.json
$ ls -d /srv/studio/handoff/dog/3
ls: cannot access '/srv/studio/handoff/dog/3': No such file or directory
$ ls /srv/studio/handoff/dog/
1
2
```

All three match: `3.json` is brief-dog-r7's (`0c0ecf8e…a308`), there's no `3.result.json`, and there's no round-3 handoff folder.

### The photo's source, checked

His order: the photo "may be the concept's image input", recorded as the source, "If `line.py brief` or the arrival check refuses that source, use the photo as a reference only".

- **`line.py brief`:** has no rule on sources. It takes only repository paths in `references` (`scripts/studio/line.py:456` to `:467`), so the photo's path can't go there.
- **Main's arrival check refuses a photo source here.** An entry whose source type is `photo` must carry `approval` (`tools/gates/arrival_check.py:2236` to `:2249`). It also needs an approvals.json entry naming the file's hash, with `recreation_not_photo` among its confirmations (`:2968` to `:2990`, `CONFIRMS` at `:1942`). The brief's record leaves `approval` out, since the look approval is his, after the round. The record also has no key that could hold a photo's licence. A dry run of main's `Record` on a one-entry record, differing only in the source:

```text
$ git show main:tools/gates/arrival_check.py > <tmp>/ac.py
$ python3 -I -B - <tmp>/ac.py   # Record("assets/visitors/dog", <one entry, likeness false, one hand step>)
photo -> [('R4', 'entries[0] lacks approval')]
prompt -> []
exit=0
```

So the photo is a reference only, as his order says:

- The studio opens that one file to word the prompt and to judge the renders.
- It isn't uploaded to ComfyUI or given to any workflow. It isn't copied, and nothing of it goes into a file or the record.
- The source is a new prompt, `{"type": "prompt", "id": "P-0031"}`, with `likeness: false`. `P-0031` appears nowhere on main, on this branch, or in the studio's briefs.
- The photo is recorded as the round's reference in the studio's note: its path, "a reference only", his words, and likeness false. The concept step's name says the prompt "was worded from a reference photograph of the breed, which was not an input". It names no file and no path, so R5 doesn't fire.

### What changed, and why

Kept as placed: `round` (3), `findings` (round 2's line, verbatim), the 14 tool IDs, `limits`, `references` (`[]`), `files` (the three GLBs), LICENSE.md's text and hash, the rig, the clips, the mark's term, the record's shape, `likeness: false`, the ban on the photos folder, and JUDGING. Every field but `notes` is identical to brief-dog-r7's, in the same key order. The file has the same form: `json.dumps`, two-space indent, trailing newline, ASCII.

All 14 tool IDs are on main's `assets/policy/studio-tools.json` with `outputs_ship: true`. No step needs a tool beyond them, so no tool is missing and there's no stop.

In `notes`:

- **Header:** brief-dog-r8 rewrote it from brief-dog-r7's text (`0c0ecf8e…a308`). studio-dog-r7's folder, `/srv/studio/outputs/dog/round3/`, and its note stay as they are.
- **THE AUTHOR'S ANSWER TO Q220 (new):** his words whole, and his two answers about the photo. His 17:25Z review is quoted whole. Round 2's concept and mesh are no longer the source.
- **THE PHOTO (new; replaces THE SOURCE):**
  - The refusal above, and the photo as a reference only.
  - The studio opens only `/srv/studio/workflows/inbox/duck-toller.jpg`, after checking that it's a regular file.
  - No node loads ComfyUI's input copy.
  - No other inbox image is opened and the inbox isn't listed. The photos folder stays banned (Q67, Q68, Q76).
  - The note records the reference with his words.
- **WHEN THIS ROUND RUNS:** runs as studio-dog-r8 and waits for nothing else.
  - It stops when the photo is missing, a step needs a tool not in `tools`, the runner refuses, a GPU step errors, THE CHECK doesn't match, or any check can't pass.
  - The stop note is `/srv/studio/outputs/dog/round3-r8/stop-note.md`. Working files go in `/srv/studio/outputs/dog/round3-r8/`.
- **COMFYUI:** exactly `--fp32-text-enc`, `--use-pytorch-cross-attention`, `--disable-pinned-memory`, never `--birefnet`. A refusal stops the round with no retry. No node is installed and no weight downloaded.
- **STEPS: a new concept and a new mesh.**
  1. Hand: "the Author's review of an earlier mesh, which asked for the breed's white markings on the face, the under body, and the feet".
  2. Hand: "the Author's choice of a reference photograph of the breed, for its white markings".
  3. **The concept:** FLUX.2 [klein] 4B base, text to image, from round 2's step-1 workflow (`c654f2bd…9d06`).
     - Size: 2048 tried first, else 1536; never below 1536 (round 2's was 1024).
     - About 28 steps (against 20), and seeds 1 to 8.
     - The prompt names his markings as the photo shows them: blaze, white chest running under the belly, white feet, and the tail's white tip only if the photo has one. Then the red-orange coat, standing, front three-quarter, about 41 lb.
  4. **The mesh:** from round 2's step-3 workflow (`8c3c5eb2…e462`), base colour baked at 2048 px.
  5. **The build:** from round 2's `build_dog.py` (`27421d79…5959`), as a changed copy.
     - Decimate to about 150,000 triangles (against 39,999), with the UV seams delimiting it. If the file would pass 21 MB, fewer triangles.
     - The texture stays at 2048 px (about 22.4 MB of texture memory with mipmaps, under the 46 MB cap).
     - Where the bake allows (a re-bake in Blender), the head's and chest's UV islands are scaled up before packing.
     - The clip files hold the skeleton and the clip only.
- **THE CHECK (replaces THE COMPARE):** his order's words, quoted. It renders front and side from the GLB as built, and compares each marking with the photo and his words, one at a time. It also checks for seam smears on the face and chest. A mismatch stops the round with the note, and the round-3 folder is never created.
- **THE LOOK:** "as the picked concept shows it, with the Toller's white markings".
- **THE MARK:** composite, from hand steps 1 and 2. Main's C1 asks only that model and hand steps mix (`tools/gates/arrival_check.py:37` to `:39`).
- **RECORD FORMAT:**
  - The source is P-0031, and the steps are STEPS' five.
  - `models_checked` is `"2026-11-11"` on every model step: the concept, the mesh, the build, and each clip step. His words are quoted, and the placeholder is gone. Main's R6 only asks that the date isn't after `made` (`:2352` to `:2359`).
  - No likeness of his dog or of the photo's dog. No photo file, name, EXIF, or path.
- **ROUND 2'S HIDDEN LINES:** the six R6 lines are now fixed by his date.

### The check, then the placement

I wrote the text with the Write tool into a scratch copy of the briefs folder, `/tmp/brief-dog-r8.6EMv/briefs/dog/`. It held copies of `1.json`, `1.result.json`, `2.json`, `2.result.json`, and the old `3.json`, and nothing from the photos folder. Then I checked it there. The first draft gave a mipmapped 2048 px texture as "22,369,622" bytes. The true figure is 22,369,621.33, so the text now reads "about 22.4 million".

```text
$ python3 -I -B <inline check> <scratch>/briefs/dog/3.json <scratch>/old-3.json
canonical: True ascii: True
same but notes: True keys in order: True
tools on main, outputs_ship: True 14
  '--fp32-text-enc': 1
  '--use-pytorch-cross-attention': 1
  '--disable-pinned-memory': 1
  'round3-r8/stop-note.md': 2
  '2026-11-11': 2
birefnet flag only as banned: 1 | photos path: 1
$ python3 -I -B -c <canonical and hash> <scratch>/briefs/dog/3.json   # after the edit
canonical: True True 883e2cc5e633d4bec2a7e03bd64337b63886f2f5437580ad4b265362d5e6b47c 23288
$ python3 -I -B scripts/studio/line.py brief <scratch>/briefs/dog/3.json
line: pass
exit=0
```

Then I placed it with the Write tool, the same text, and checked it where it is:

```text
$ cmp <scratch>/briefs/dog/3.json /srv/studio/briefs/dog/3.json
identical
$ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/dog/3.json
line: pass
exit=0
$ sha256sum /srv/studio/briefs/dog/*.json
f1897ad37cc88866b967e24b5b1e89b628d60a7b29f3469ed943e3a219e63b97  /srv/studio/briefs/dog/1.json
65783b3b6be96413b799bf04ae8c750b75dd6d1fefff1cd1b1c9b0245f39ecac  /srv/studio/briefs/dog/1.result.json
d15050f122b7e0c334b0f335c1f47305e9b5675689a29d7009df3f46632a2495  /srv/studio/briefs/dog/2.json
08daa2063dc2255255c0b0c5c6fa7bea83b84df1b0bbaf90dcecb7b82c9ab8bd  /srv/studio/briefs/dog/2.result.json
883e2cc5e633d4bec2a7e03bd64337b63886f2f5437580ad4b265362d5e6b47c  /srv/studio/briefs/dog/3.json
$ ls /srv/studio/handoff/dog/
1
2
```

The SHA-256s: before, `0c0ecf8e9a71fd9ba0688c65da5173bd2dc0f6ad6d6e8b5a59961c884d6ca308` (brief-dog-r7's); now, `883e2cc5e633d4bec2a7e03bd64337b63886f2f5437580ad4b265362d5e6b47c`.

### Questions left on the page (`/night/io/out/questions.md`)

1. The record keeps the composite mark through two hand steps: his review of round 2's mesh, and his choice of the reference photo. Neither is a review of this round's new concept, which runs on unreviewed. Keep both? Recommended: keep both. Others: keep only the review; drop both and mark `trainedAlgorithmicMedia`.

### Interruptions

- **2026-11-14, brief-dog-r8:** two permission refusals, and no hook or bash-gate refusal.
  - A permission prompt was denied for a `grep` of `/night/io/out/questions.md` chained with `ls /srv/studio/outputs/dog/round3/`. The `grep` alone then ran; the file didn't exist yet.
  - A Read of `/srv/studio/outputs/dog/round3/stop-note.md` was refused by the permission settings.
  - I didn't reach studio-dog-r7's folder or note another way. The brief doesn't depend on them.
- **The scratch folders stay:** `/tmp/brief-dog-r8.6EMv/` and `/tmp/tmp.12IpiIUevW/`. The second holds main's `arrival_check.py`. Neither holds a photo or a secret.

### The text placed as `/srv/studio/briefs/dog/3.json` (brief-dog-r8)

```json
{
  "schema": 1,
  "asset": "dog",
  "kind": "avatar",
  "spec": "020-dog-modeled-and-brought-in",
  "round": 3,
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
  "findings": [
    "files: records.json (limit: a distinct file name in the folder, not the record or the notice)"
  ],
  "notes": "ROUND 3 OF THE DOG, ITS LAST (spec 020-dog-modeled-and-brought-in, FR-010 to FR-014; plan section 5; three rounds per asset). Rewritten by the night-shift implementer task brief-dog-r8 on 2026-11-14 for the Author's answer to Q220 (about 18:45Z), from the text task brief-dog-r7 placed here (sha256 0c0ecf8e9a71fd9ba0688c65da5173bd2dc0f6ad6d6e8b5a59961c884d6ca308). Task studio-dog-r7 ran that text and stopped; its working folder, /srv/studio/outputs/dog/round3/, and its note stay as they are. Round 3 is still unspent: /srv/studio/handoff/dog/3/ doesn't exist. Round 2's candidate, /srv/studio/handoff/dog/2/, was recorded fail with one finding. This brief's 'findings' are that finding, verbatim. The studio has no repository: everything it needs is here.\n\nTHE AUTHOR'S ANSWER TO Q220 (2026-11-14, about 18:45Z), in his words: \"We have \"~/ComfyUI/input/duck-toller.jpg\" that's an actual photo of a nova scotia duck tolling retriever. Be sure to note the white markings. Can we increase any detail on the run that creates the concept or mesh?\" To two more questions he answered: the dog in it is \"Not my dog\", and the photo is \"I own it / it's free to use\". He copies it to /srv/studio/workflows/inbox/duck-toller.jpg, where the studio reads it. His review before it (about 17:25Z), in his words: \"Okay, dinosaur is approved, and dog seems to have changed the face compared to the concept? Look at the face markings on the concept with white and white on the under body and white feet, common markings of a Nova Scotia Duck Tolling Retriever. Do you want to incorporate those\". (The dinosaur is another asset. Nothing in this round touches it.) His order reads them this way for this round: (1) a NEW CONCEPT, from a prompt that names the Toller's white markings as the photo shows them; (2) MORE DETAIL in the concept and the mesh, inside this brief's limits; (3) THE CHECK stays: front and side renders compared with the photo and his words before anything goes into the handoff folder. Round 2's concept (seed 2 of P-0030) and round 2's mesh are not this round's source: round 3 makes a new concept and a new mesh.\n\nTHE PHOTO: A REFERENCE ONLY, NOT AN INPUT. His order lets the photo be the concept's image input, recorded as the source with his words for its licence and likeness false, unless line.py brief or the arrival check refuses that source. Main's arrival check refuses it for this round: an entry whose source type is photo must carry an approval (a dry run of main's check on such an entry: R4, \"entries[0] lacks approval\"), and this round's record leaves approval out, since the look approval is the Author's, after the round. The record also has no field for a photo's licence. So the photo is a reference only. The studio agent opens that one file, /srv/studio/workflows/inbox/duck-toller.jpg, to word the prompt (step 3) and to judge the renders (THE CHECK), and for nothing else. Check first that it is a regular file, not a link; if it is missing, stop (WHEN THIS ROUND RUNS). It is not uploaded to ComfyUI or given to any workflow: no image input, no reference latent, no conditioning from it. ComfyUI's input folder holds a copy under the same name: no node loads it. It is not copied, resized, or cropped, and nothing of it (its pixels, its EXIF, its name, or its path) goes into a frame, a mesh, a texture, a GLB, the record, or candidate.json. Open no other image in the inbox, and don't list the inbox. No session opens, views, copies, or lists the photos folder, /srv/studio/briefs/dog/photos/ (Q67, Q68, Q76 stand). The dog in the photo is not the Author's dog. The result is a generic dog of the breed, a likeness of no dog: its record says likeness false and a prompt source. The note (the handoff note, or the stop note) records the photo as the round's reference: its path, that it was a reference only and not an input, his words on it (\"Not my dog\"; \"I own it / it's free to use\"), and likeness false. 'references' stays empty: line.py takes only repository paths there, and the photo is outside the repository.\n\nTHE AUTHOR'S WORDS. His item: '3. d) \"dog modeled and brought in\"'. His words on the dog (2026-11-14, about 15:18Z): \"it's a 41lb medium size dog, make a generic standing concept based on the same breed\". His review and his answer to Q220 are quoted above. The corpus says of the dog, in his words: 'Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller.' Nothing else about the dog is stated: add no trait beyond the breed, his size words, and the white markings his words name and the photo shows, and put no name in a prompt, a file, a record, or a note.\n\nWHEN THIS ROUND RUNS. When task studio-dog-r8 runs it, queued under the Author's order. It waits for nothing else. It STOPS in any of these cases: the photo isn't there; a step needs a tool or model not in this brief's 'tools'; the runner refuses ComfyUI or a param; a GPU step errors; THE CHECK doesn't match; or any other check this brief asks for can't pass. A stop writes nothing in /srv/studio/handoff/dog/3/, and doesn't create that folder: a handoff folder that holds only notes counts as an answered round, and this is the dog's last. The stop's note is /srv/studio/outputs/dog/round3-r8/stop-note.md, saying what stopped the round and why, the step it reached, and where its frames and files are. Record, and queue nothing more. All of round 3's working files go under /srv/studio/outputs/dog/round3-r8/ (ComfyUI save prefixes dog/round3-r8/step1/ and dog/round3-r8/step3/). Change nothing in /srv/studio/outputs/dog/round3/ (studio-dog-r7's), in round 2's working files, or in round 1's or round 2's handoff folders.\n\nCOMFYUI. Steps 3 and 4 run in ComfyUI 0.42.5. Start it only by asking the runner with exactly these params: {\"kind\": \"comfyui\", \"action\": \"start\", \"params\": [\"--fp32-text-enc\", \"--use-pytorch-cross-attention\", \"--disable-pinned-memory\"]}. Ask for no other param, and never --birefnet (ComfyUI's main.py exits 2 on it: it is start_comfyui.sh's own switch). If the runner refuses a param or answers that ComfyUI isn't ready, record what it reports in the stop's note and stop: don't retry with other params. ComfyUI's outputs land under /srv/studio/outputs (the runner's --output-directory). Ask the runner to stop ComfyUI when step 4 is done. Install no node and download no weight.\n\nSTEPS. The record holds them in the man's shape, in this order.\n1. \"the Author's review of an earlier mesh, which asked for the breed's white markings on the face, the under body, and the feet\" (hand).\n2. \"the Author's choice of a reference photograph of the breed, for its white markings\" (hand).\n3. THE CONCEPT, from a new text prompt, by a model: FLUX.2 [klein] 4B base with its Qwen3-4B text encoder and the FLUX.2 VAE, in ComfyUI 0.42.5 (core nodes only), text to image, with no image input and no reference latent. Start from round 2's step-1 workflow (seed 2's as run, sha256 c654f2bdec42172e39a38a9070f49c53f2f63e91795e29065c39234f51659d06) and change only the prompt and its negative, the size, the sampling steps, the seed, and the save prefix. More detail (his ask): the size is the highest the workflow takes on this GPU, at least 1536 x 1536 (round 2's was 1024 x 1024): run one seed at 2048 x 2048 first; if it errors or its frame is black, run every seed at 1536 x 1536; never below 1536. About 28 sampling steps (round 2's: 20). 8 seeds, 1 to 8. The prompt: a generic Nova Scotia Duck Tolling Retriever, a medium-size dog of about 41 lb (18 to 19 kg), with the breed's red-orange coat and its white markings as the reference photo shows them: a white blaze on the face, a white chest running under the belly, white feet, and a white tip on the tail if the photo shows one (leave the tail tip out if it doesn't); alone, standing, in a front three-quarter view (say \"turned 30 degrees to its left\"), all four legs and the four white feet visible, head level, tail relaxed and not raised above the head, the whole body in frame, plain light background, stylized to match the room's other avatars (soft, slightly simplified forms, painterly textures, not photoreal, not a cartoon with big eyes). No person, hand, leash, collar, tag, text, logo, lettering, place, or screen. The markings' words follow the photo: where its markings differ from these words (a narrow blaze, white only on the toes), the prompt says what the photo shows, and the note says so. Nothing else from the photo (its background, pose, setting, light, or the dog's other features) goes into the prompt. Give the prompt the opaque ID P-0031 (or, if a record under /srv/studio/handoff/ already uses it, the next free one, 3 to 40 of A-Z a-z 0-9 and hyphen), and keep its negative beside it; both go in the note, never in a GLB or the record. Keep every frame, each beside its workflow-as-run.json, under /srv/studio/outputs/dog/round3-r8/step1/seed<N>/, with one sheet of all eight; delete none. Check that no frame is black. Pick the best: the markings closest to the photo and his words, standing on four visible legs, the turn, head level, tail low, no text or marks. Write its seed, size, prompt ID, and sha256 in the note. The Author doesn't review the new concept before the mesh: the round goes on from the pick, and his look approval comes after.\n4. THE MESH and its base-colour texture, from the picked frame, by a model: Pixal3D int8 with DINOv3 ViT-L patch 16 with NAF, MoGe-2 ViT-L with normals, BiRefNet, and the TRELLIS.2 shape VAE and texture VAE, in ComfyUI 0.42.5, the studio agent uploading only the picked frame to ComfyUI's input. Start from round 2's step-3 workflow (mesh_pixal3d_textured_hi, as run sha256 8c3c5eb2276a46d42f5f18040ab7c9709975996f75680dd0c415fdbe27e8e462), with the save prefix dog/round3-r8/step3/. More detail (his ask): bake the base colour at 2048 px. Round 2 kept 39,999 of about 1.5 million triangles: wherever that cut was made (a face target in this workflow, or the build's decimation), the target is now about 150,000 (step 5). Record this step's own workflow-as-run sha256. If this step errors, keep step 3's frames, record the error's lines, and stop: don't retry with other params.\n5. THE BUILD, by the studio agent's script in Blender 5.2.3, from step 4's mesh. It does what round 2's build did (/srv/studio/outputs/dog/scripts/build_dog.py, sha256 27421d793857b41637ccfb8d3c2236426531f03e10409fed7309e5db771e5959): clean, decimate, and scale the mesh; rig and skin; key the clips; export with the glTF exporter bundled with Blender (numpy bundled with Blender where a script needs it). Copy the script to /srv/studio/outputs/dog/round3-r8/ and change the copy, not round 2's file. What changes, for more detail inside the limits: (a) decimate to about 150,000 triangles in dog.glb, never more than 180,000, keeping the UV seams (the seams delimit the decimation, so no texel smears across a seam on the face or the chest); if dog.glb would pass 21,000,000 bytes, lower the count until it fits and say so in the note. (b) Keep the base-colour texture at 2048 px: don't resize it smaller. One 2048 px RGBA texture is about 22.4 million texture bytes with mipmaps, under the 46,000,000 cap; add no other map unless the total stays under it. (c) Give the face and the chest more of the 2048 px texture where the bake allows: if the build can re-bake the base colour in Blender from step 4's full mesh onto the decimated one, scale the head's and the chest's UV islands up before packing, then bake; if the bake can't, keep its layout and say so in the note. The clip files carry the skeleton and their clip only, no mesh and no texture, each at most 1,000,000 bytes. Record the script as run by its sha256 (workflow_sha256). Each clip's entry then adds its own clip step. Last, scrub (metadata stripped: no EXIF, no path, no prompt text, no machine or user name) and write the record.\nIf any step needs a tool or model not in this brief's 'tools' (all from main's assets/policy/studio-tools.json with outputs_ship true), STOP the round as WHEN THIS ROUND RUNS says, with a note saying which and why (FR-010): a new tool is the Author's to add. Never use Qwen-Image, FLUX.1 [dev], PuLID, TripoSR, GGUF, or ComfyUI-Manager (UNREVIEWED on the list; Qwen-Image and FLUX [dev] are refused by name whatever the list says). In candidate.json and in the record, name each tool by the ID here, or by a name that lowercases to it with each run of other characters a hyphen (\"ComfyUI\" is comfyui, \"Claude Opus 5.5\" is claude-opus-5.5, \"glTF exporter, bundled with Blender\" is gltf-exporter-bundled-with-blender), at the version on main's list.\n\nTHE CHECK (rule 9 of the Author's orders, in his order's words): \"Before writing anything into /srv/studio/handoff/dog/3/, render front and side, and compare the markings with the photo and his words. If they don't match, stop and write the note under /srv/studio/outputs/dog/, never creating the round-3 folder.\" So: build all three GLBs, the record, and the notice in /srv/studio/outputs/dog/round3-r8/ first. Render front.png and side.png of dog.glb at rest there, from the GLB as built (after the decimation and the bake, which must keep the markings). Compare them with the photo and his words, one marking at a time, and write in the note what each shows: the blaze on the face; the white chest running under the belly; the four white feet; the tail's white tip, only if the photo shows one; all on the red-orange coat. Check too that no texel smears across a UV seam on the face or the chest. If any doesn't match, stop: the note is /srv/studio/outputs/dog/round3-r8/stop-note.md, saying which marking doesn't match and how. Only when all match and every check in this brief passes, create /srv/studio/handoff/dog/3/ and write the candidate into it.\n\nTHE LOOK (FR-012, FR-013). A stylized, textured, rigged four-legged figure of a generic Duck Toller of medium size, as the picked concept shows it, with the Toller's white markings (THE CHECK), standing in its rest pose, head level and tail no higher than the top of the head (the room scales the model by its rest pose's bounds to 0.62 m tall, lowest point on the floor, facing +z; a raised head or tail makes it wrong). Facing +z, +y up, metres, origin on the floor between the feet. It carries no place, no person, no screen, no logo, and no text. No hand bone and nothing held: the dog never takes the paper (spec 020 Q4).\n\nRIG. One skeleton, its bone names exactly as limits.bones_required lists them (no prefix, or one 'prefix:' before each), plus any more bones you need below them (e.g. FrontLeftLeg's lower bones and paw, Tail's chain, Jaw, ears). Name NO bone LeftHand or RightHand, with or without a prefix: the room treats those names as hands. Hips is the root of the deform bones. Both clips target this skeleton's names only; a clip naming a bone the model lacks fails in the room.\n\nCLIPS (FR-005, FR-012). 'idle': a loop of a few seconds, breathing and small head and tail motion, root in place. 'walk': a four-legged walk-cycle loop, root in place (the room moves the figure; no forward travel in the clip), feet not sliding against the gait. No other clip ('idle-holding' and 'take' are not wanted). The first frame of each reads well alone (reduced motion shows the idle's first frame).\n\nFILES AND LIMITS. Three GLB files: dog.glb (kind avatar: the textured, rigged model at rest, no clips required in it), dog-idle.glb and dog-walk.glb (kind animation: each one clip on the same skeleton, the clip's name being idle or walk). Main's caps (assets/policy/caps.json): avatar at most 21000000 bytes, 180000 triangles, 46000000 texture bytes (width times height times 4, times 4/3 for mipmaps); animation at most 1000000 bytes each. Textures at most 2048 px a side. Check each GLB against these before THE CHECK. The check's front.png and side.png renders of dog.glb at rest go in the handoff folder for the Author's review, outside 'files', stripped to image chunks.\n\nTHE MARK (C1, Q204). Each GLB carries the IPTC digital source type mark in KHR_xmp_json_ld: compositeWithTrainedAlgorithmicMedia, the man's term. That term is right only because the record mixes model steps with the Author's two steps by hand (steps 1 and 2). So both hand steps must be in every entry. Round 2 marked composite on a record with no hand step, and the dry check below found it (M5).\n\nTHE NOTICE (Q203). Write LICENSE.md in /srv/studio/handoff/dog/3/, beside the GLBs, outside 'files'. Its text is byte for byte the notice of the man's directory (assets/visitors/man/LICENSE.md on main): 327 bytes of ASCII, sha256 f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159. Here it is as one JSON string; decode it and write the result, with no other byte: \"Copyright (c) 2026 Hareet. All rights reserved.\\n\\nThe files in this directory are not covered by this repository's MIT license. You are welcome to view them and to link to them. Any other use needs the copyright holder's written permission.\\n\\nEach file's provenance is in records.json, and in CREDITS.md at the root of its tree.\\n\". Check that the file's sha256 is that hash before handing off. Don't change a byte: its copyright line is one the Author already filled for his visitors.\n\nCANDIDATE (Q202; hand back to /srv/studio/handoff/dog/3/, only after THE CHECK matches). candidate.json: {\"schema\": 1, \"asset\": \"dog\", \"round\": 3, \"files\": [\"dog.glb\", \"dog-idle.glb\", \"dog-walk.glb\"], \"tools\": [{\"id\": \"<an ID from this brief>\", \"version\": \"<its version on main's list>\"}, ...], \"records\": \"records.json\"}. 'files' lists the three GLBs and nothing else. records.json is named by 'records' alone. line.py refuses records.json, LICENSE.md, and candidate.json in 'files', and round 2 failed on that alone. Every listed file is a regular file in that folder. The folder holds candidate.json, the three GLBs, records.json, LICENSE.md, this run's note.md, and the two renders. The files arrive in the repository at assets/visitors/dog/ (the record's 'directory'), by the Author's intake. Write nothing in round 1's or round 2's folder.\n\nRECORD FORMAT (records.json; spec 003's contracts/asset-record.md and the arrival check, as assets/visitors/man/records.json is). Top level, in this order: \"schema\": 1, \"directory\": \"assets/visitors/dog\", \"license\": \"all-rights-reserved-2026\", \"entries\" (sorted by file; two-space indent; trailing newline; no other key at any level). Each entry, keys in this order: \"file\"; \"sha256\" (64 hex); \"kind\" (\"avatar\" for dog.glb, \"animation\" for the clips); \"made\" (YYYY-MM-DD, the day this round makes the file); \"source\": {\"type\": \"prompt\", \"id\": \"<step 3's prompt ID, P-0031>\"}; \"likeness\": false; \"steps\"; \"media_license\": \"all-rights-reserved-2026\". Leave out \"approval\": the look approval is the Author's, after the round. Each entry's steps are STEPS' five, in that order; each clip's entry then adds its own clip step. A hand step holds \"name\" and \"by\": \"hand\" and nothing else: no models, no tools. Its name is the quoted text in STEPS. A model step: \"name\" (what was done, in words: no path, no file name, no extension), \"by\": \"model\", \"models\" (each: name, repository, revision, role primary or auxiliary, license, license_version, as main's list and the man's record give them), \"tools\" (each: name, version, license, license_version), \"models_checked\", \"workflow_sha256\". The concept step's name says the prompt was worded from a reference photograph of the breed, which was not an input (for example \"the concept, from a text prompt worded from a reference photograph of the breed, which was not an input\"). The concept and mesh steps name the same models and tools as round 2's concept and mesh steps did, with this round's workflow_sha256s. For a step by the studio agent's script, also \"service\": {\"name\": \"Claude Code\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\", \"disclosure_row\": \"D4\"} and the model Claude Opus 5.5 (repository anthropic/claude-opus-5-5, revision claude-opus-5-5). \"models_checked\": the Author's answer to Q199 and Q207 (2026-11-14, about 17:35Z), in his words: \"we checked 3 days ago 11-11-2026\". So \"models_checked\" is \"2026-11-11\" on every model step: the concept, the mesh, the build, and each clip step. No placeholder, and no other date. Every model and tool a step names must be in this brief's 'tools'. No step, name, or credit calls the model a likeness of the Author's dog or of the dog in the photo. No photo file, no photo name, no EXIF, no path, and nothing else from the studio's inbox, anywhere in the files or the record.\n\nROUND 2'S HIDDEN LINES (a dry check, not recorded findings). Round 2's recorded finding stopped line.py before main's arrival check. Task judge-dog-r2 ran the same judge, dry, on a scratch copy with only that line removed. It showed ten more lines, which this brief fixes: six R6 lines, \"entries[i].steps[0 and 1] is a model step with no models_checked date\" in each of the three entries (fixed by the Author's date, 2026-11-11, on every model step); N1, \"the directory has no LICENSE.md, the media license's notice\" (fixed by THE NOTICE); and three M5 lines, one per GLB, \"the mark is compositeWithTrainedAlgorithmicMedia where its record's steps call for trainedAlgorithmicMedia\" (fixed by steps 1 and 2, THE MARK). The caps, bones, clips, tools, and texture raised none.\n\nJUDGING. An implementer runs python3 -I -B scripts/studio/line.py candidate on the handoff folder against this brief (it also runs main's arrival check) and records the round. The files are recorded likeness false with a prompt source, so arrival check P1 (an approval naming the file's hash) does not apply and every line counts; a warning that it's up to the contributor to check for likeness is expected. A pass goes to the Author's look judgement: the model shows in the room only after his look approval (approvals.json naming its SHA-256 with a non-empty disclosure_line), and no credit or disclosure line calls it a likeness of the Author's dog."
}
```
