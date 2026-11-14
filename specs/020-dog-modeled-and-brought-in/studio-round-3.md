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
