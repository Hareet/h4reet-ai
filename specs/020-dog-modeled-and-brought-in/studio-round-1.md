# Studio round 1 of the dog: the brief

Task `brief-dog-r1` (night of 2026-11-13, implementer, Opus 5.5), the first half of the dog's studio round (spec 017's studio line; the Author's order of 2026-11-13, rule 3). It writes round 1's brief, `/srv/studio/briefs/dog/1.json`, from this spec and checks it. The studio task runs next. After the studio hands off, an implementer judges the candidate with `line.py candidate` and records the round.

- Asset: `dog` (spec 020's name; `assets/visitors/dog/`), kind `avatar`, round 1, no findings (round 1).
- Policy read from `refs/heads/main` at `3c0e4cd06861`: `assets/policy/caps.json` (`per_asset.avatar`: 21,000,000 bytes, 180,000 triangles, 46,000,000 texture bytes; `per_asset.animation`: 1,000,000 bytes) and `assets/policy/studio-tools.json` (P-7).
- Limits: the avatar caps exactly (FR-004, FR-012: "at the file sizes of main's caps"), `texture_px` 2048 (data-model.md's example; caps.json sets no avatar `texture_px`). The notes ask the studio to aim well under the caps, since the dog stands 0.62 m tall.
- Tools: 14 IDs, each on main's list with `outputs_ship: true`. These are the tools and models the man's and woman's records name (the Author's P-7 answer: "It's the same license that we've used for all the other avatars adn motions, so copy it from there"). The brief leaves out the `UNREVIEWED` entries (Manager, TripoSR, PuLID, GGUF, Qwen-Image 2.1, FLUX.1 [dev]). It also leaves out the duplicate IDs `comfyui-core` and `blender-5.2.3`, so each tool has one name, the one the records' names normalize to.
- Skeleton and bones: the spec names none ("a skeleton whose names the clips target", FR-012). The brief sets `Hips`, `Spine`, `Neck`, `Head`, `Tail`, and four legs (`FrontLeftLeg`, `FrontRightLeg`, `HindLeftLeg`, `HindRightLeg`). It forbids any bone named `LeftHand` or `RightHand`, because `scene/avatars.ts` reads `mixamorig:RightHand` and `mixamorig:LeftHand` as hands (FR-008: the dog has no hand bone).
- Clips: `idle` and `walk`, root in place (FR-005, FR-012; Q4: no `idle-holding`, no `take`).
- Candidate path: `/srv/studio/handoff/dog/1/`, its record's `directory` `assets/visitors/dog`. The record format is spelled out in the notes from spec 003's asset-record contract and the man's `records.json` (`likeness: true`, `source.type: "photo"` with an opaque ID, no `approval`).

## The photos: following the order, and what still binds

Spec 020's clarify answer (Q2, taken provisionally) was that no agent reads the photos. The Author's order names `/srv/studio/briefs/dog/photos/` as the round's references, so the brief names them as its references, as the supervisor directed. Two things changed how:

1. **`references` can't hold that path.** `line.py` takes only repository paths there (`brief_shape`: no leading `/`, no `..`), and the photos aren't in the repository. So `references` is `[]`, and the photos are named, as the round's references, at the top of `notes`. I didn't put a brief-relative path such as `photos/` there to pass the check, since it isn't a repository path. Question 1 below.
2. **The privacy promises still bind every Claude session.** The photo guide's FR-025 says, in its words, "Every file a photo touches SHALL stay inside the photos folder, which, with the blinding key, every Claude session on the machine is denied, the studio's own included". The data-flow disclosure's row D4 lists, among what the studio's Claude session never receives: "a photo, or a crop, mask, or cutout made from one, whether as a file or from a tool's listener (ComfyUI's `/view` or its previews); an image-to-3D output before it is stripped to geometry". His order gives his consent to the likeness ("it's okay that we use the likeness of my dog"). It doesn't lift those two. So the brief's step 1 (photos → concept, local FLUX.2 klein in ComfyUI) is the Author's to queue inside the photos folder. Step 2 is his review. The studio agent starts at step 3, from the reviewed concept in its inbox. This is the reading closest to his words that keeps a published privacy promise; whether to lift FR-025 and D4 for the dog's photos is his call (question 2).

**Found while checking, not opened:** `/srv/studio/briefs/dog/photos/` is `drwxr-xr-x dev:dev`, and this repo agent's container (uid 1000) can list and read it. FR-025 says every Claude session is denied the photos folder. This session didn't list or open anything inside it (only `stat` on the folder itself). Question 3.

## The expected arrival-check line

`line.py candidate` runs main's arrival check. A file recorded `likeness: true` or `source.type: "photo"` gets P1 ("it needs the Author's approval on the main branch, and no approval names this file's hash") until his look approval names its SHA-256. So a round-1 candidate can't come out clean before his approval. The brief tells the judge to read that line as the approval's turn and to judge every other line. Question 4 asks how the round should be recorded.

## The check

```text
$ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/dog/1.json; echo "exit: $?"
line: pass
exit: 0
```

The brief's SHA-256: `c0a8eef9f01cab49c6d6925a4a260943c0f74d4fff2f6e48df086292bcfea369`.

Small tests (the order's rule 4): this task changes no code and no test, so no test file covers it. `make lint` passed after `make setup` (the worktree had no `node_modules`; `make setup` couldn't install the git hooks in the sandbox, which is expected). Lines that only list the shell scripts are left out:

```text
$ make lint; echo "exit: $?"
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
757 files already formatted
… shellcheck -- … (no findings)
exit: 0
```

Interruptions: none. No hook or bash-gate refusal in this task.

## The brief, `/srv/studio/briefs/dog/1.json`, as written

```json
{
  "schema": 1,
  "asset": "dog",
  "kind": "avatar",
  "spec": "020-dog-modeled-and-brought-in",
  "round": 1,
  "limits": {
    "bytes": 21000000,
    "triangles": 180000,
    "texture_bytes": 46000000,
    "texture_px": 2048,
    "skeleton": "quadruped, this brief's names (notes, RIG)",
    "bones_required": ["Hips", "Spine", "Neck", "Head", "Tail", "FrontLeftLeg", "FrontRightLeg", "HindLeftLeg", "HindRightLeg"],
    "clips": ["idle", "walk"]
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
  "notes": "ROUND 1 OF THE DOG (spec 020-dog-modeled-and-brought-in, FR-010 to FR-014; plan section 5). Written by the night-shift implementer task brief-dog-r1 on 2026-11-14. The studio has no repository: everything it needs is here.\n\nTHE AUTHOR'S WORDS. His item: '3. d) \"dog modeled and brought in\". His dog's photos: /srv/studio/briefs/dog/photos/. His consent: \"it's okay that we use the likeness of my dog\".' The corpus says of the dog, in his words: 'Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller.' Nothing else about the dog is stated; add no trait, size, or name beyond what the photos show.\n\nREFERENCES. The round's references are his dog's photos, /srv/studio/briefs/dog/photos/, as his order names them. The field 'references' is empty only because line.py accepts repository paths there and the photos are not in the repository; the photos are this round's references all the same. Spec 020's clarify answer (Q2, taken provisionally) was that no agent reads the photos; his order names them as the round's references, so this brief follows the order and uses them, within the rules that still bind every Claude session: the photo guide's FR-025 (every file a photo touches stays inside the photos folder, which every Claude session, the studio's included, is denied; the Author queues ComfyUI's photo workflows and no Claude session reaches its port) and the data-flow disclosure's row D4 (the studio's Claude session never receives a photo, or a crop, mask, or cutout made from one, or an image-to-3D output before it is stripped to geometry). So step 1 is his, and the studio agent starts at step 2. Whether he lifts FR-025 and D4 for the dog's photos is his question on the morning page; until he answers, do not open the photos folder.\n\nSTEPS (as the man's and woman's were made; their records show the shape).\n1. Concept, from the photos: the Author's step. In ComfyUI 0.42.5 (core nodes only), FLUX.2 [klein] 4B base with its Qwen3-4B text encoder and FLUX.2 VAE, the photos as reference images, run inside the photos folder per the photo guide. Output: one front three-quarter concept of the dog alone, standing, four legs visible, head level, tail relaxed and not raised above the head, plain light background, stylized to match the room's other avatars (soft, slightly simplified, painterly textures, not photoreal). No person, hand, leash, collar tag text, place, screen, logo, or lettering from any photo.\n2. The Author's review of the concept, by hand; he moves only the reviewed concept to the studio's inbox.\n3. Mesh and base-colour texture, from the reviewed concept: Pixal3D int8 with DINOv3 ViT-L patch 16 with NAF, MoGe-2 ViT-L with normals, BiRefNet, TRELLIS.2 shape VAE and texture VAE, in ComfyUI 0.42.5, the studio agent driving it from the reviewed concept in its inbox (plan section 5, step 2; D4 lets it receive a reviewed frame with no brand, text, screen content, or place), never from the photos folder or ComfyUI's photo-work folders.\n4. The Author's review of the mesh, by hand.\n5. The build, by the studio agent's script in Blender 5.2.3: clean, decimate, and scale the mesh; resize the texture; rig and skin; key the clips; export with the glTF exporter bundled with Blender (numpy bundled with Blender where a script needs it).\n6. Scrub (metadata stripped: no EXIF, no path, no photo name) and write the record.\nIf any step needs a tool or model not in this brief's 'tools' (all from main's assets/policy/studio-tools.json with outputs_ship true), STOP the round and hand back a note saying which and why (FR-010): a new tool is the Author's to add. Never use Qwen-Image, FLUX.1 [dev], PuLID, TripoSR, GGUF, or ComfyUI-Manager (UNREVIEWED on the list; Qwen-Image and FLUX [dev] are refused by name whatever the list says). In candidate.json and in the record, name each tool by the ID here, or by a name that lowercases to it with each run of other characters a hyphen (\"ComfyUI\" is comfyui, \"Claude Opus 5.5\" is claude-opus-5.5, \"glTF exporter, bundled with Blender\" is gltf-exporter-bundled-with-blender), at the version on main's list.\n\nTHE LOOK (FR-012, FR-013). A stylized, textured, rigged four-legged figure of his dog, a Duck Toller as the photos show it, standing in its rest pose, head level and tail no higher than the top of the head (the room scales the model by its rest pose's bounds to 0.62 m tall, lowest point on the floor, facing +z; a raised head or tail makes it wrong). Facing +z, +y up, metres, origin on the floor between the feet. It must carry no place, no person, no screen, no logo or text from a photo. No hand bone and nothing held: the dog never takes the paper (spec 020 Q4).\n\nRIG. One skeleton, its bone names exactly as limits.bones_required lists them (no prefix, or one 'prefix:' before each), plus any more bones you need below them (e.g. FrontLeftLeg's lower bones and paw, Tail's chain, Jaw, ears). Name NO bone LeftHand or RightHand, with or without a prefix: the room treats those names as hands. Hips is the root of the deform bones. Both clips target this skeleton's names only; a clip naming a bone the model lacks fails in the room.\n\nCLIPS (FR-005, FR-012). 'idle': a loop of a few seconds, breathing and small head and tail motion, root in place. 'walk': a four-legged walk-cycle loop, root in place (the room moves the figure; no forward travel in the clip), feet not sliding against the gait. No other clip ('idle-holding' and 'take' are not wanted). The first frame of each reads well alone (reduced motion shows the idle's first frame).\n\nFILES AND LIMITS. Three GLB files: dog.glb (kind avatar: the textured, rigged model at rest, no clips required in it), dog-idle.glb and dog-walk.glb (kind animation: each one clip on the same skeleton, the clip's name being idle or walk). Main's caps (assets/policy/caps.json): avatar at most 21000000 bytes, 180000 triangles, 46000000 texture bytes (width times height times 4, times 4/3 for mipmaps); animation at most 1000000 bytes each. Textures at most 2048 px a side. Aim well under: the dog is 0.62 m tall in the room, so a few tens of thousands of triangles and one 1024 or 2048 base-colour texture should do. Each GLB carries the IPTC digital source type mark in KHR_xmp_json_ld, the term its record's steps call for, as the man's files do. Optional for the Author's review: front.png and side.png renders of dog.glb at rest.\n\nCANDIDATE (hand back to /srv/studio/handoff/dog/1/). candidate.json: {\"schema\": 1, \"asset\": \"dog\", \"round\": 1, \"files\": [\"dog.glb\", \"dog-idle.glb\", \"dog-walk.glb\", \"records.json\", ...], \"tools\": [{\"id\": \"<an ID from this brief>\", \"version\": \"<its version on main's list>\"}, ...], \"records\": \"records.json\"}, every listed file a regular file in that folder. The files arrive in the repository at assets/visitors/dog/ (the record's 'directory'), by the Author's intake.\n\nRECORD FORMAT (records.json; spec 003's contracts/asset-record.md and the arrival check, as assets/visitors/man/records.json is). Top level, in this order: \"schema\": 1, \"directory\": \"assets/visitors/dog\", \"license\": \"all-rights-reserved-2026\", \"entries\" (sorted by file; two-space indent; trailing newline; no other key at any level). Each entry, keys in this order: \"file\"; \"sha256\" (64 hex); \"kind\" (\"avatar\" for dog.glb, \"animation\" for the clips); \"made\" (YYYY-MM-DD); \"source\": {\"type\": \"photo\", \"id\": \"<an opaque ID, 3 to 40 of A-Z a-z 0-9 and hyphen, never a photo's file name>\"}; \"likeness\": true; \"steps\"; \"media_license\": \"all-rights-reserved-2026\". Leave out \"approval\": the look approval is the Author's, after the round. Each step: \"name\" (what was done, in words, no path), \"by\" (\"model\" or \"hand\"); for a model step \"models\" (each: name, repository, revision, role primary or auxiliary, license, license_version, as main's list and the man's record give them), \"tools\" (each: name, version, license, license_version), \"models_checked\" (a date), \"workflow_sha256\"; for a step by the studio agent's script, also \"service\": {\"name\": \"Claude Code\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\", \"disclosure_row\": \"D4\"} and the model Claude Opus 5.5 (repository anthropic/claude-opus-5-5, revision claude-opus-5-5). The Author's reviews are steps by \"hand\" with no models or tools. Every model and tool a step names must be in this brief's 'tools'. Each clip's entry repeats the model's steps, then its own clip step. No photo, no photo name, no EXIF, no path from the photos folder, anywhere.\n\nJUDGING. An implementer runs python3 -I -B scripts/studio/line.py candidate on the handoff folder against this brief, which also runs main's arrival check. A likeness file needs the Author's look approval on main (arrival check P1, 'no approval names this file's hash'); in round 1 that line is expected and is the approval's turn, not the studio's: the judge reads every other line. The model shows in the room only after his look approval (approvals.json naming its SHA-256 with a non-empty disclosure_line)."
}
```

## Questions left on the morning page (`/night/io/out/questions.md`)

1. Should `line.py` take a studio path (under `/srv/studio/briefs/<asset>/`) in a brief's `references`? Recommended: yes, a path under the asset's own briefs folder. Until then, notes carry it.
2. Does his order lift FR-025 and D4 for the dog's photos, so that the studio's Claude session reads them? Recommended: no. He queues the concept from the photos and reviews it, and the studio works from the reviewed concept.
3. The photos folder is readable from repo-agent containers. Recommended: move the photos out of `/srv/studio/briefs/` into the denied photos folder, and give the brief only its role name.
4. How does the judge record a likeness candidate whose only finding is P1 (no approval yet)? Recommended: when P1 (no approval) is the only finding, the judge runs `line.py candidate` without `--record`, leaves round 1 open, and puts his look approval on the page; it records the round after his approval, or as `fail` at once when any other line fails.

## Round 1 again, for the order of about 15:18Z (`brief-dog-r4`): written, not applied

Task `brief-dog-r4` (night of 2026-11-13, implementer, Opus 5.5, on 2026-11-14), the brief half of the dog's next run, still round 1 (the Author's orders, rule 9). His words, about 15:18Z: "it's a 41lb medium size dog, make a generic standing concept based on the same breed".

**Outcome: the rewrite isn't applied.** `line.py brief` can't pass for any round-1 dog brief tonight, the old one included. As the supervisor directed, `/srv/studio/briefs/dog/1.json` keeps the old text, unchanged (SHA-256 `c0a8eef9…bcfea369`, the same as above). The new text is below, ready to apply once the question is answered. The task stops here, so `studio-dog-r4` shouldn't run on the old brief.

### Why it can't pass

`order_findings` (`scripts/studio/line.py:502`) refuses a brief for round *n* when `/srv/studio/handoff/<asset>/<n>/` exists, since that folder counts as the studio's answer (`handoff_rounds`, `line.py:366`). The studio's three earlier dog runs made nothing to judge. Each left only a note in that folder: `note.md`, `note-2.md`, and `note-3.md`, with no `candidate.json`. So round 1 reads as answered. Round 2 doesn't fit either: it needs round 1's recorded failure (`1.result.json`), and nothing was made to fail. The dinosaur's round-1 brief gets the same finding today (its handoff folder holds `note.md` to `note-4.md`). Any rewrite of it will hit this too.

I didn't point `--handoff` at an empty folder to make the real file pass. I used that only on a scratch copy, to show the new text passes every other check.

### The checks

```text
$ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/dog/1.json; echo "exit: $?"
round: 1 (limit: a round the studio hasn't answered yet: its handoff or result exists)
line: 1 finding
exit: 1

# the new text, a scratch copy at <scratch>/briefs/dog/1.json, against the real handoff folder
$ python3 -I -B scripts/studio/line.py brief <scratch>/briefs/dog/1.json; echo "exit: $?"
round: 1 (limit: a round the studio hasn't answered yet: its handoff or result exists)
line: 1 finding
exit: 1

# the same copy against an empty handoff folder: every check but the round's place
$ python3 -I -B scripts/studio/line.py brief --handoff <empty scratch folder> <scratch>/briefs/dog/1.json; echo "exit: $?"
line: pass
exit: 0

$ python3 -I -B scripts/studio/line.py brief /srv/studio/briefs/dinosaur/1.json; echo "exit: $?"
round: 1 (limit: a round the studio hasn't answered yet: its handoff or result exists)
line: 1 finding
exit: 1
```

The new text's SHA-256: `341bc8d6f92811faea3fc7018a3b74292da488dc3db71828f95f49b2e77abab7`.

### What the new text changes, and why

Only what his order changes. The limits, the 14 tools, the rig, the clips, the files, and the candidate stay word for word. So do the record's keys and their order.

- **Step 1 is the studio's, from a text prompt alone** (rule 9's dog paragraph). It reads `/srv/studio/workflows/inbox/dog-concept.png` only to name the breed. It then runs FLUX.2 [klein] 4B text to image with no image input. The prompt is a generic Duck Toller, medium size, about 41 lb (18 to 19 kg), with a breed-typical coat. The dog stands in a front three-quarter view, all four legs visible, head level, tail relaxed. The studio tests 4 seeds first and says "turned 30 degrees to its left". Both come from `studio-dino-r4`'s lesson in `/srv/studio/handoff/dinosaur/1/note-4.md`: "say 'turned 30 degrees to its left' … and test 4 seeds first". It keeps every frame under `/srv/studio/outputs/dog/step1/` for his look approval, picks the best, and goes on from step 3. Step 2, his review, comes with his look approval.
- **The photos are gone as references.** "Step 1 is the Author's", FR-025's and D4's paragraph, and the photos path in his item's quote are dropped. The one place the folder is named is a ban: no session opens, views, copies, or lists it (Q67, Q68, Q76). The consent quote is dropped too: the model isn't a likeness.
- **The record:** `"source": {"type": "prompt", "id": "<the step-1 prompt's opaque ID>"}` and `"likeness": false`, as in the dinosaur's brief (`/srv/studio/briefs/dinosaur/1.json`). The arrival check accepts `prompt` (`arrival_check.py:2291`). A visitor file that is `likeness: false` and isn't photo-sourced isn't held for P1 (`arrival_check.py:2968`). So JUDGING no longer expects P1, and every line counts. Its likeness warning (spec 004, Amendment C1) is expected. His look approval still comes before the room. No credit, disclosure line, step, or note may call it a likeness of the Author's dog.
- **The dog's words:** the corpus's breed line stays as quoted. His size words are added. Nothing else is added, and no name goes in a prompt, file, record, or note.
- **ComfyUI:** `"params": []`. `--birefnet` makes `main.py` exit 2 (`note-3.md`), and the runner refuses `--fp32-text-enc` (Q189). If Pixal3D stops on xformers' attention, as the dinosaur's did at 15:25Z (Q188), the studio keeps step 1's frames, records the lines, and stops. The round stays 1.
- Small additions that follow from those: outputs land under `/srv/studio/outputs` (`note-4.md`'s lesson), this run's note is `note-4.md` beside the others, and step 6's scrub adds "no prompt text".

### Question left on the page (`/night/io/out/questions.md`)

5. How does a round-1 brief pass while the studio's handoff folder holds only notes? Recommended: change `line.py` (spec 017's code, test first) so a round counts as answered only when its folder holds a `candidate.json`. Then this task runs again and applies the text below, and the dinosaur's brief is unblocked too. Others: the Author moves the notes out of `/srv/studio/handoff/dog/1/` and `dinosaur/1/`; or record round 1 as `fail` and brief round 2.

Interruptions: one. The bash gate refused `rm -r` of the scratch folder (`/tmp/brief-dog-r4.myvdxa`, the new text's copy and an empty handoff folder): "recursive delete outside workspace. Route: delete only inside the repo". It was a real refusal, so I left the folder there and didn't delete it another way. The Write tool once declined to overwrite the brief before a read. That wasn't a gate refusal, and the brief stays as it was.

This task changes no code and no test, so no small test covers it, and it ran no `make` target (rules 2 and 4).

### The text, ready to apply (not in `/srv/studio/briefs/dog/1.json`)

```json
{
  "schema": 1,
  "asset": "dog",
  "kind": "avatar",
  "spec": "020-dog-modeled-and-brought-in",
  "round": 1,
  "limits": {
    "bytes": 21000000,
    "triangles": 180000,
    "texture_bytes": 46000000,
    "texture_px": 2048,
    "skeleton": "quadruped, this brief's names (notes, RIG)",
    "bones_required": ["Hips", "Spine", "Neck", "Head", "Tail", "FrontLeftLeg", "FrontRightLeg", "HindLeftLeg", "HindRightLeg"],
    "clips": ["idle", "walk"]
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
  "notes": "ROUND 1 OF THE DOG (spec 020-dog-modeled-and-brought-in, FR-010 to FR-014; plan section 5). Written by the night-shift implementer task brief-dog-r1 on 2026-11-14; rewritten in place by brief-dog-r4 on 2026-11-14 for the Author's order of about 15:18Z (a generic standing concept from a text prompt). It is still round 1: the earlier runs (note.md to note-3.md in the handoff folder) made nothing to judge. The studio has no repository: everything it needs is here.\n\nTHE AUTHOR'S WORDS. His item: '3. d) \"dog modeled and brought in\"'. His words on the dog (2026-11-14, about 15:18Z): \"it's a 41lb medium size dog, make a generic standing concept based on the same breed\". The corpus says of the dog, in his words: 'Arya is a Nova Scotia Duck Tolling Retriever, known as a Duck Toller.' Nothing else about the dog is stated: add no trait beyond the breed and his size words, and put no name in a prompt, a file, a record, or a note.\n\nTHE SOURCE: A TEXT PROMPT ALONE. 'references' is empty on purpose: no photo and no image is an input to any step. The studio reads /srv/studio/workflows/inbox/dog-concept.png (the seated concept in its inbox) only to name the breed, and then sets it aside: it is not uploaded to ComfyUI, not an input to any workflow, not copied, and nothing of its pose, markings, or background goes into the prompt beyond the breed's name. No session opens, views, copies, or lists the photos folder, /srv/studio/briefs/dog/photos/ (Q67, Q68, Q76 stand). The result is a generic dog of that breed, not a likeness of the Author's dog: its record says likeness false and a prompt source, and no credit, disclosure line, note, or file calls it a likeness of the Author's dog.\n\nCOMFYUI. Ask the runner to start it with empty params: {\"kind\": \"comfyui\", \"action\": \"start\", \"params\": []}. Never --birefnet (ComfyUI's main.py exits 2 on it: it is start_comfyui.sh's own switch) and never --fp32-text-enc (the runner refuses it: not on the ComfyUI allowlist, Q189). If the runner answers that ComfyUI isn't ready, record what it reports and stop. ComfyUI's outputs land under /srv/studio/outputs (the runner's --output-directory), so a save prefix dog/step1/... lands in /srv/studio/outputs/dog/step1/. Install no node and download no weight.\n\nSTEPS (as the man's and woman's were made; their records show the shape).\n1. Concept, from a text prompt alone: the studio's step. In ComfyUI 0.42.5 (core nodes only), FLUX.2 [klein] 4B base with its Qwen3-4B text encoder and the FLUX.2 VAE, text to image, with no image input and no reference latent, at 1024 x 1024. The prompt: a generic Nova Scotia Duck Tolling Retriever, a medium-size dog of about 41 lb (18 to 19 kg), a breed-typical coat, alone, standing, in a front three-quarter view (say \"turned 30 degrees to its left\"), all four legs visible, head level, tail relaxed and not raised above the head, the whole body in frame, plain light background, stylized to match the room's other avatars (soft, slightly simplified forms, painterly textures, not photoreal, not a cartoon with big eyes). No person, hand, leash, collar, tag, text, logo, lettering, place, or screen. Give the prompt an opaque ID (3 to 40 of A-Z a-z 0-9 and hyphen, one no other asset's record uses; for example P-0030) and keep its negative beside it. Seeds: test 4 seeds first (klein base drew the dinosaur front-on in most seeds; studio-dino-r4's lesson), then run more seeds as needed for a good choice. Check that no frame is black. Keep every frame, each beside its workflow-as-run.json, under /srv/studio/outputs/dog/step1/ (for example step1/seed<N>/), with one sheet of them all, for the Author's look approval; delete none. Pick the best (standing on four visible legs, the turn, head level, tail low, no text or marks) and write its seed, prompt ID, and sha256 in the handoff note.\n2. The Author's review of the concept, by hand: it comes with his look approval, after the round. The studio does not wait for it: it goes on from step 3 from its pick, and keeps every step-1 frame for him.\n3. Mesh and base-colour texture, from the studio's pick: Pixal3D int8 with DINOv3 ViT-L patch 16 with NAF, MoGe-2 ViT-L with normals, BiRefNet, TRELLIS.2 shape VAE and texture VAE, in ComfyUI 0.42.5, the studio agent driving it and uploading only the picked frame to ComfyUI's input. If this step stops on the GPU's attention, as the dinosaur's did at 15:25Z (Pixal3DConditioning: NotImplementedError, \"No operator found for `memory_efficient_attention_forward`\", from xformers; Q188), do not retry with other params: keep step 1's frames, record the error's lines in the handoff note, and stop. The round stays 1, and the next run starts at step 3 from the pick.\n4. The Author's review of the mesh, by hand.\n5. The build, by the studio agent's script in Blender 5.2.3: clean, decimate, and scale the mesh; resize the texture; rig and skin; key the clips; export with the glTF exporter bundled with Blender (numpy bundled with Blender where a script needs it).\n6. Scrub (metadata stripped: no EXIF, no path, no prompt text, no machine or user name) and write the record.\nIf any step needs a tool or model not in this brief's 'tools' (all from main's assets/policy/studio-tools.json with outputs_ship true), STOP the round and hand back a note saying which and why (FR-010): a new tool is the Author's to add. Never use Qwen-Image, FLUX.1 [dev], PuLID, TripoSR, GGUF, or ComfyUI-Manager (UNREVIEWED on the list; Qwen-Image and FLUX [dev] are refused by name whatever the list says). In candidate.json and in the record, name each tool by the ID here, or by a name that lowercases to it with each run of other characters a hyphen (\"ComfyUI\" is comfyui, \"Claude Opus 5.5\" is claude-opus-5.5, \"glTF exporter, bundled with Blender\" is gltf-exporter-bundled-with-blender), at the version on main's list.\n\nTHE LOOK (FR-012, FR-013). A stylized, textured, rigged four-legged figure of a generic Duck Toller of medium size, as the studio's picked concept shows it, standing in its rest pose, head level and tail no higher than the top of the head (the room scales the model by its rest pose's bounds to 0.62 m tall, lowest point on the floor, facing +z; a raised head or tail makes it wrong). Facing +z, +y up, metres, origin on the floor between the feet. It carries no place, no person, no screen, no logo, and no text. No hand bone and nothing held: the dog never takes the paper (spec 020 Q4).\n\nRIG. One skeleton, its bone names exactly as limits.bones_required lists them (no prefix, or one 'prefix:' before each), plus any more bones you need below them (e.g. FrontLeftLeg's lower bones and paw, Tail's chain, Jaw, ears). Name NO bone LeftHand or RightHand, with or without a prefix: the room treats those names as hands. Hips is the root of the deform bones. Both clips target this skeleton's names only; a clip naming a bone the model lacks fails in the room.\n\nCLIPS (FR-005, FR-012). 'idle': a loop of a few seconds, breathing and small head and tail motion, root in place. 'walk': a four-legged walk-cycle loop, root in place (the room moves the figure; no forward travel in the clip), feet not sliding against the gait. No other clip ('idle-holding' and 'take' are not wanted). The first frame of each reads well alone (reduced motion shows the idle's first frame).\n\nFILES AND LIMITS. Three GLB files: dog.glb (kind avatar: the textured, rigged model at rest, no clips required in it), dog-idle.glb and dog-walk.glb (kind animation: each one clip on the same skeleton, the clip's name being idle or walk). Main's caps (assets/policy/caps.json): avatar at most 21000000 bytes, 180000 triangles, 46000000 texture bytes (width times height times 4, times 4/3 for mipmaps); animation at most 1000000 bytes each. Textures at most 2048 px a side. Aim well under: the dog is 0.62 m tall in the room, so a few tens of thousands of triangles and one 1024 or 2048 base-colour texture should do. Each GLB carries the IPTC digital source type mark in KHR_xmp_json_ld, the term its record's steps call for, as the man's files do. Optional for the Author's review: front.png and side.png renders of dog.glb at rest.\n\nCANDIDATE (hand back to /srv/studio/handoff/dog/1/). candidate.json: {\"schema\": 1, \"asset\": \"dog\", \"round\": 1, \"files\": [\"dog.glb\", \"dog-idle.glb\", \"dog-walk.glb\", \"records.json\", ...], \"tools\": [{\"id\": \"<an ID from this brief>\", \"version\": \"<its version on main's list>\"}, ...], \"records\": \"records.json\"}, every listed file a regular file in that folder. The files arrive in the repository at assets/visitors/dog/ (the record's 'directory'), by the Author's intake. Leave note.md to note-3.md as they are; this run's note is a new one beside them (note-4.md).\n\nRECORD FORMAT (records.json; spec 003's contracts/asset-record.md and the arrival check, as assets/visitors/man/records.json is, and as the dinosaur's prompt-made record is). Top level, in this order: \"schema\": 1, \"directory\": \"assets/visitors/dog\", \"license\": \"all-rights-reserved-2026\", \"entries\" (sorted by file; two-space indent; trailing newline; no other key at any level). Each entry, keys in this order: \"file\"; \"sha256\" (64 hex); \"kind\" (\"avatar\" for dog.glb, \"animation\" for the clips); \"made\" (YYYY-MM-DD); \"source\": {\"type\": \"prompt\", \"id\": \"<the step-1 prompt's opaque ID>\"}; \"likeness\": false; \"steps\"; \"media_license\": \"all-rights-reserved-2026\". Leave out \"approval\": the look approval is the Author's, after the round. Each step: \"name\" (what was done, in words, no path), \"by\" (\"model\" or \"hand\"); for a model step \"models\" (each: name, repository, revision, role primary or auxiliary, license, license_version, as main's list and the man's record give them), \"tools\" (each: name, version, license, license_version), \"models_checked\" (a date), \"workflow_sha256\"; for a step by the studio agent's script, also \"service\": {\"name\": \"Claude Code\", \"license\": \"anthropic-consumer-terms\", \"license_version\": \"2025-10-08\", \"disclosure_row\": \"D4\"} and the model Claude Opus 5.5 (repository anthropic/claude-opus-5-5, revision claude-opus-5-5). The Author's reviews are steps by \"hand\" with no models or tools. Every model and tool a step names must be in this brief's 'tools'. Each clip's entry repeats the model's steps, then its own clip step. No step, name, or credit calls the model a likeness of the Author's dog. No photo, no photo name, no EXIF, no path, and nothing from inbox/dog-concept.png, anywhere.\n\nJUDGING. An implementer runs python3 -I -B scripts/studio/line.py candidate on the handoff folder against this brief (it also runs main's arrival check) and records the round. The files are recorded likeness false with a prompt source, so arrival check P1 (an approval naming the file's hash) does not apply and every line counts; a warning that it's up to the contributor to check for likeness is expected. A pass goes to the Author's look judgement: the model shows in the room only after his look approval (approvals.json naming its SHA-256 with a non-empty disclosure_line), and no credit or disclosure line calls it a likeness of the Author's dog."
}
```
