# Studio round 2: the dinosaur's brief (live since `brief-dino-r3`, 2026-11-14 about 16:30Z)

**Approved by the Author on 2026-11-14 (`intake-021`), and not yet recorded or taken in.** The record waits only for Q207's date. The intake is his. See "His look approval, and what follows it" below.

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

## Round 2's candidate, judged dry

Task `judge-dino-r2` (night of 2026-11-13, implementer, Opus 5.5, run on 2026-11-14 around 17:00Z). It judged studio-dino-r5's handoff, `/srv/studio/handoff/dinosaur/2/`, against `/srv/studio/briefs/dinosaur/2.json`, **without `--record`**. `line.py` is this branch's copy, unchanged (base `night/brief-dino-r3/brief-dino-r3`, `343af15f`). Main's arrival check ran at `3c0e4cd06861`.

**Result: `line: pass; round 2`, exit 0. There are 0 findings and 4 WARN lines, and the WARNs fail nothing.** The round **isn't recorded**: no `2.result.json` was written, and nothing under `/srv/studio/` changed. A round is judged once, and the dinosaur has two rounds left. The stand-in stays the room's dinosaur until he approves the look (rule 2). Nothing went into `assets/**` or the room's code.

### Checks first

All of them held:
- `/srv/studio/briefs/dinosaur/` holds `1.json`, `1.result.json`, and `2.json`, and no `2.result.json`. `2.json` is `eddfc1ff…31b61`, the brief verbatim below.
- The four GLBs' SHA-256s start and end as the supervisor gave them:

```
$ sha256sum dinosaur.glb dinosaur-idle.glb dinosaur-walk.glb dinosaur-take.glb   # in /srv/studio/handoff/dinosaur/2
1aa8075bf5cc9ebfd226cd8e5492295cee23b790a3bb61a7caf68e46cf62fae8  dinosaur.glb
dc2f84a64f03ee2e58f53845c33edf38ede46ca303a2e11c8198acdd59e7ce31  dinosaur-idle.glb
d895b608773e0ad39a05dda325f409afea4441e26187abd8400432bb57a213b8  dinosaur-walk.glb
3bca518b1706f58e41108fa00689bdd2343dbc3651e78480356d0fd5f658a046  dinosaur-take.glb
```

### The judge's whole output

```
$ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dinosaur/2 --brief /srv/studio/briefs/dinosaur/2.json; echo "exit $?"
arrival-check: main's copy, at 3c0e4cd06861, on a scratch copy under assets/visitors/dinosaur/
WARN assets/visitors/dinosaur/dinosaur-idle.glb: its record's steps call for the composite mark, and the file needs no approval, so it's up to the contributor to check for likeness (spec 004, Amendment C1)
WARN assets/visitors/dinosaur/dinosaur-take.glb: its record's steps call for the composite mark, and the file needs no approval, so it's up to the contributor to check for likeness (spec 004, Amendment C1)
WARN assets/visitors/dinosaur/dinosaur-walk.glb: its record's steps call for the composite mark, and the file needs no approval, so it's up to the contributor to check for likeness (spec 004, Amendment C1)
WARN assets/visitors/dinosaur/dinosaur.glb: its record's steps call for the composite mark, and the file needs no approval, so it's up to the contributor to check for likeness (spec 004, Amendment C1)
file                                        bytes     gzip      vertices  triangles  texture
assets/visitors/dinosaur/dinosaur-idle.glb  47908     22309     0         0          0
assets/visitors/dinosaur/dinosaur-take.glb  35904     10963     0         0          0
assets/visitors/dinosaur/dinosaur-walk.glb  37716     14707     0         0          0
assets/visitors/dinosaur/dinosaur.glb       2248336   1236931   32645     27997      5592405
arrival-check: 0 findings in 6 files, 4 warnings
line: pass; round 2
exit 0
```

Afterwards `/srv/studio/briefs/dinosaur/` still held only `1.json`, `1.result.json`, and `2.json`.

The four WARNs are C1's expected line for a composite, no-likeness, non-photo file. The likeness check they leave to "the contributor" is his look approval.

### The sort

**(a) The `models_checked` date only.** All twelve model steps read `2026-11-14`: in each of the four entries, the Pixal3D step, the build step, and each clip's own step. That is the day the models ran, and the studio wrote it. Only he can say when he checked those models against newer releases (Q199 asks the same for the dog). I didn't change it.

**Does the verdict depend on it? Only on its form, not its value.** Main's arrival check (`tools/gates/arrival_check.py:2352` to `:2360` at `3c0e4cd0`) needs a date on each model step, no later than the entry's `made` (`2026-11-14`). The pass stands for any date he gives on or before 2026-11-14. The round would fail R6 only on a placeholder, a non-date, or a date after 2026-11-14.

**(b) Faults in the candidate that a round 3 must fix: none.** `line.py` found none, and I found none against the points the dog's judge raised (Q202 to Q204):
- **`files`** lists only the four GLBs. `records.json`, `LICENSE.md`, `candidate.json`, `note.md`, and the two renders are outside it. The dog's round-2 fault (`records.json` in `files`) isn't here.
- **`LICENSE.md`** is byte for byte main's `assets/visitors/man/LICENSE.md`: `cmp` returns 0, and both are SHA-256 `f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159`. That makes it the brief's five lines with a trailing newline. The arrival check's N rules raised nothing. The dog's N1 isn't here.
- **The hand steps against the composite mark.** Every entry begins with the brief's two hand steps: "the concept, the Author's own design" and "the Author's review of the concept". Model steps follow them. So C1 calls for `compositeWithTrainedAlgorithmicMedia`, and all four GLBs carry that mark in `KHR_xmp_json_ld` packet 0, referenced from `asset`. The arrival check's M5 raised nothing. The record claims his review of the concept, whose words the brief quotes as that review. **It doesn't claim a review of the mesh**, which he hasn't made (the note's step 4). The mark doesn't depend on the mesh review. It also holds if Q198 goes the other way (a concept made from a prompt is a model step, and his review of it is still a hand step).
- **Read from the GLBs' JSON chunks, beside `line.py`'s own checks:**
  - 25 joints, with every required bone under the brief's parent. Hips' parent is the armature node `dinosaur`.
  - No bone named `LeftHand` or `RightHand`, with or without a prefix.
  - No morph targets.
  - Each clip file has one animation, named `idle`, `walk`, or `take`. `dinosaur.glb` has none.
  - `asset` is `{"version": "2.0"}` plus the mark's packet reference, with no generator.

**(c) Faults in the brief or in `line.py`.** There are two. Neither changes tonight's verdict.
1. **The record has no place for his review of the mesh.**
   - **The file:** `/srv/studio/briefs/dinosaur/2.json`, RECORD FORMAT and STEPS.
   - **The limit:** STEPS lists step 4 ("The Author's review of the mesh, by hand") before step 5, the build. RECORD FORMAT names only the two concept hand steps. The studio built on before step 4 (note, "The steps, as run", 4), and truthfully recorded no mesh review. Main's man's record (`assets/visitors/man/records.json`) holds "the Author's review of the mesh" as a hand step after the mesh step. So the dinosaur's shipped record would show less of his part than the man's does, unless the step is added once he has made the review.
   - **The fix:** once he approves the step-3 mesh, `{"name": "the Author's review of the mesh", "by": "hand"}` goes after the Pixal3D step in all four entries, before `--record`. The writer is a studio task, or his own hand: a judge doesn't write under `/srv/studio/`. `records.json` isn't hashed by `candidate.json`. A hand step adds no R6 and keeps the composite mark, so the dry judge should still pass, and it's re-run before recording. Later briefs say this in RECORD FORMAT, or tell the studio to stop after step 3. Question 2 below.
2. **The build's helpers aren't pinned in the record.**
   - **The file:** the brief's RECORD FORMAT ("`workflow_sha256` (64 hex of the workflow or script that ran)"), and spec 003's record format, which allows one hash per step.
   - **The limit:** the build and clip steps carry `9af35d7f…7a2e` (`build_r2.py`). That script imports `jpeg_clean.py` (`874d01ec…aa01`) and `glb_finish.py` (`2fa36f5f…cb47`) from beside it. Their hashes are only in the note, and the note doesn't go into the repository.
   - **The fix:** later briefs ask that the hashed build script be self-contained, so its one hash pins all the code that ran. Round 2 stands as it is: the note and `/srv/studio/outputs/dinosaur/scripts/` keep the helpers. Question 3 below.

`line.py`'s known follow-up (a round counts as answered only with a `candidate.json`) is unchanged and stays in the stack's note. This round found nothing new in `line.py`.

### From `records.json` alone (the handoff's, read, not changed)

- `schema` 1, `directory` `assets/visitors/dinosaur`, `license` `all-rights-reserved-2026`. Four entries, sorted by file: `dinosaur-idle.glb`, `dinosaur-take.glb`, `dinosaur-walk.glb`, `dinosaur.glb`. Each entry's `sha256` matches its GLB above. Each has `made` `2026-11-14`, `media_license` `all-rights-reserved-2026`, and no `approval`.
- **`likeness: false`** in every entry.
- **`source` is `{"type": "design", "id": "D-0003"}`** in every entry.
- **P-0024 is absent.** A text search of the file finds none of `P-0024`, `klein`, `Qwen`, or `FLUX`.
- **No path.** It finds none of `/srv`, `/home`, `inbox`, `visitor-raptor`, or `concept.png`.

I didn't open, view, copy, or list the inbox or `/srv/studio/briefs/dog/photos/`. I didn't open `front.png` or `side.png` either: they're his.

### What it judged

Hashes taken at this task's end. A judge without `--record` only reads. If Question 2's step is added, only `records.json` should differ.

```
1aa8075bf5cc9ebfd226cd8e5492295cee23b790a3bb61a7caf68e46cf62fae8  dinosaur.glb
dc2f84a64f03ee2e58f53845c33edf38ede46ca303a2e11c8198acdd59e7ce31  dinosaur-idle.glb
d895b608773e0ad39a05dda325f409afea4441e26187abd8400432bb57a213b8  dinosaur-walk.glb
3bca518b1706f58e41108fa00689bdd2343dbc3651e78480356d0fd5f658a046  dinosaur-take.glb
9b1a09b2b5075270aeeb0d15ee478dbde42f5bdb58568a9173fbb773156b68a9  candidate.json
341edde9ff71781c2d5da31f31c6ce52a49a58a9b643dc139f9e8905311f14f9  records.json
f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159  LICENSE.md
9332ab731ed7e19cf00efaaca1181f21df7e0e19a101d27318056913d63dc26a  note.md
18b17bead2a5c4345d8cff2653aed24aaac60bf70397af38a2e2043c5ee27aa1  front.png
a05c2deca3904d5e402aad62a61b9d6c8744ef94f0cbfd645dbe5cc866fe56e4  side.png
```

### The `--record` command, for his morning

Run it once, after the `models_checked` date is settled (Question 1) and the mesh-review step is settled (Question 2). Run it from the line's checkout: this stack's branch, or main once it's merged. Re-run the dry command above first and check that it still passes:

```
python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dinosaur/2 --brief /srv/studio/briefs/dinosaur/2.json --record
```

**What it will record,** with the files as they are tonight: `pass`, round 2, no findings, in `/srv/studio/briefs/dinosaur/2.result.json`. A pass sends the candidate to his look judgement. It doesn't bring the dinosaur into the room: only his word does, and then his intake to `assets/visitors/dinosaur/`.

### What waits for him

- **The `models_checked` date** (Question 1; Q199 is the dog's twin). It's `2026-11-14` on every model step now. Any date up to 2026-11-14 keeps the pass.
- **His look approval of the step-3 mesh** (step 4, which the studio built past). It's the raw mesh, in `/srv/studio/outputs/dinosaur/r2-step3/`.
- **His look approval of the candidate.** Use `front.png` and `side.png` in the handoff folder (review only, not in `files` or the record). The note's three look points, in its words ("For his look review"):
  - "the side view shows a small spike on the back above the hip, from the mesh;"
  - "the tail's curl to his left is my choice for fitting the box (curling to the right, or more down, are the alternatives);"
  - "the weights come from bone distances, not a heat solve, so watch the belly near the arms and the neck in the take."

  The note's "Built to the concept" also names where the concept overrode round 1's direction: teal-green rather than #4f8a3c; an orange crest, big yellow eyes, and brown back markings; upright; a closed smile. The brief says "The concept sets the look", so I don't count these as faults. My reading: round 1's "not a cartoon with big eyes" no longer applies where the concept shows otherwise.
- **Q198 (open, recommended `design`, D-0003):** whether the concept is his own design or made from a prompt.
- **Lessons for the workflows folder:** the note's "New lessons for the workflows folder (his to add; the page lists them)", in `/srv/studio/handoff/dinosaur/2/note.md`. It has six lessons: ComfyUI's ~290 s run time with the attention flag; the importer's hidden bone-shape mesh; `scene.render.fps` before keying; `use_fake_user` for clips; Pixal3D's base colour as a PNG against a q90 JPEG, with the APP0/APP1 cut; and the tail's side curl for the 1.1 m box.

### Questions (on the page, `/night/io/out/questions.md`)

1. **The `models_checked` date.** Recommended: he gives the date he last checked these models. Any date up to 2026-11-14 keeps the pass, and `records.json` changes only there.
2. **His mesh review in the record.** Recommended: yes. After his approval, a studio task adds the hand step after the Pixal3D step in all four entries, before `--record` (fault c1).
3. **The build's helpers.** Recommended: accept round 2 as it is, and later briefs ask for a self-contained build script (fault c2).

### Small tests (rule 4)

This task changes no code and no test. It adds only this section and a line at the top of this file, under `specs/`. The `line.py` run above is its test. This worktree had no `node_modules`, so the first lint run stopped at "node_modules is missing: run make setup". I ran the setup target. It installed from the lockfile, exit 0, and left the git hooks to the Author ("isn't writable here"). Then I ran lint again:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
760 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

### Interruptions (rule 5)

None.

## His look approval, and what follows it (`intake-021`)

Task `intake-021` (night of 2026-11-13, implementer, Opus 5.5, run on 2026-11-14 around 18:15Z). It ran on the line's tip: judge-dino-r2's `f4d93409`, with `night/verify-023/verify-023` merged in (merge `4acf13c7`, no conflict).

**Checks first.** Both held. The four GLBs in `/srv/studio/handoff/dinosaur/2/` have the SHA-256s recorded above under "What it judged", and `/srv/studio/briefs/dinosaur/` holds `1.json`, `1.result.json`, and `2.json`, with no `2.result.json`.

### His look approval (User Story 4, FR-015), 2026-11-14

His words, about 17:25Z, verbatim:

> Okay, dinosaur is approved, and dog seems to have changed the face compared to the concept? Look at the face markings on the concept with white and white on the under body and white feet, common markings of a Nova Scotia Duck Tolling Retriever. Do you want to incorporate those

*Reading, beside his words:* "dinosaur is approved" is his look approval of round 2's candidate, `/srv/studio/handoff/dinosaur/2/`, which is the four GLBs by the SHA-256s above. The rest is about the dog (item 3, spec 020) and isn't this item's. Q210 is answered (recommended): with this approval, his review of the mesh is given.

**Not recorded.** No `--record` ran, and nothing under `/srv/studio/` changed. The record waits only for Q207's date (`models_checked`). *(Overtaken: his answer at about 17:35Z gives the date as `2026-11-11`. The record now waits on the edit to the handoff's `records.json`, which no implementer can make. See "Round 2's record, not made (`record-dino-r2`)" below.)*

### For his morning, in order

Each step is his, or a studio task's for the first two. A judge doesn't write under `/srv/studio/`.

1. **His review of the mesh in the record (Q210).** Add `{"name": "the Author's review of the mesh", "by": "hand"}` after the Pixal3D step ("the mesh and its base-colour texture, from the concept, by Pixal3D in ComfyUI") in all four entries of `/srv/studio/handoff/dinosaur/2/records.json`. Nothing else changes. On a copy in `/tmp`, this makes the file `6bbe5be5d1ff092a8584598c5b9421ed5664d03e99a51ce66b72703dd39f1771`, with 4 steps added and nothing else changed (the original is `341edde9…f14f9`). Each entry's steps become: the concept (hand), his review of the concept (hand), Pixal3D (model), his review of the mesh (hand), the build (model), and the clip's own step (model) for the three clips. The edit, as run on the copy (it checks that the file is in its canonical form first):

   ```
   python3 -I - /srv/studio/handoff/dinosaur/2/records.json <<'EOF'
   import json, sys
   p = sys.argv[1]; raw = open(p, encoding="utf-8").read(); d = json.loads(raw)
   assert json.dumps(d, indent=2, ensure_ascii=False) + "\n" == raw
   step = {"name": "the Author's review of the mesh", "by": "hand"}
   for e in d["entries"]:
       i = [k for k, s in enumerate(e["steps"]) if "by Pixal3D" in s["name"]]
       assert len(i) == 1 and step not in e["steps"], e["file"]
       e["steps"].insert(i[0] + 1, step)
   open(p, "w", encoding="utf-8").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
   EOF
   sha256sum /srv/studio/handoff/dinosaur/2/records.json   # 6bbe5be5…71771 if step 2 hasn't run yet
   ```

2. **Q207's date.** `models_checked` is `2026-11-14` on each of the **eleven** model steps: two in `dinosaur.glb`'s entry, and three in each clip's. (The judged section above says "twelve", but the file holds eleven.) Your date replaces it on each one. Any date up to 2026-11-14 keeps the pass. If the date you give is 2026-11-14, nothing changes. *(His answer: `2026-11-11`. Steps 1 and 2 as one script, with the file they make, are under "Round 2's record, not made" below.)*
3. **The dry re-judge**, from the line's checkout, which writes nothing:

   ```
   python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dinosaur/2 --brief /srv/studio/briefs/dinosaur/2.json
   ```

   I ran this on a `/tmp` copy of the handoff with step 1's record and tonight's date. The copy held the four GLBs, `LICENSE.md`, `candidate.json`, and step 1's `records.json`, under `<tmp>/dinosaur/2/`. Its output was the same as the judged run above: the four C1 WARNs, the same size table, `arrival-check: 0 findings in 6 files, 4 warnings`, `line: pass; round 2`, and exit 0. Afterwards `/srv/studio/briefs/dinosaur/` still held only `1.json`, `1.result.json`, and `2.json`.
4. **The record**, once, after step 3 passes:

   ```
   python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/dinosaur/2 --brief /srv/studio/briefs/dinosaur/2.json --record
   ```

   It writes `/srv/studio/briefs/dinosaur/2.result.json`: `pass`, round 2, no findings.

Then comes his intake into `assets/visitors/dinosaur/` (FR-015). The steps, the files' SHA-256s, and the scratch runs that show the room takes the model over the cut-out are in item 4's section of `docs/merge-requests/2026-11-14-night-stack.md`, under "The intake (intake-021)".

## Round 2's record, not made (`record-dino-r2`)

Task `record-dino-r2` (night of 2026-11-13, implementer, Opus 5.5) ran on 2026-11-14 around 18:30Z, from intake-021's tip, `fc89bcd1`. Its job was to make steps 1 and 2 above with his date, then run steps 3 and 4. **It recorded nothing.** The handoff folder is mounted read-only in an implementer's container, so the edit to `records.json` failed before it wrote a byte. The supervisor's rule for anything other than a clean pass is "record nothing, and stop with a question", so I followed it. The question is on the page, and in item 4's section of `docs/merge-requests/2026-11-14-night-stack.md`.

### His words

His look approval, about 17:25Z, is quoted verbatim under "His look approval (User Story 4, FR-015), 2026-11-14" above. His answer to Q199 and Q207, about 17:35Z, verbatim:

> we checked 3 days ago 11-11-2026

*Reading, beside his words:* `models_checked` is `2026-11-11` on every model step of the dinosaur's record (and of the dog's rounds 2 and 3, which aren't this item's).

### Checks first

Both held.

```
$ sha256sum dinosaur.glb dinosaur-idle.glb dinosaur-walk.glb dinosaur-take.glb records.json candidate.json LICENSE.md   # in /srv/studio/handoff/dinosaur/2
1aa8075bf5cc9ebfd226cd8e5492295cee23b790a3bb61a7caf68e46cf62fae8  dinosaur.glb
dc2f84a64f03ee2e58f53845c33edf38ede46ca303a2e11c8198acdd59e7ce31  dinosaur-idle.glb
d895b608773e0ad39a05dda325f409afea4441e26187abd8400432bb57a213b8  dinosaur-walk.glb
3bca518b1706f58e41108fa00689bdd2343dbc3651e78480356d0fd5f658a046  dinosaur-take.glb
341edde9ff71781c2d5da31f31c6ce52a49a58a9b643dc139f9e8905311f14f9  records.json
9b1a09b2b5075270aeeb0d15ee478dbde42f5bdb58568a9173fbb773156b68a9  candidate.json
f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159  LICENSE.md
$ ls /srv/studio/briefs/dinosaur/
1.json  1.result.json  2.json
$ sha256sum /srv/studio/briefs/dinosaur/2.json
eddfc1ff881722a4e6c3ece13514e20a70e350b34194690bc61abe7930431b61  /srv/studio/briefs/dinosaur/2.json
```

The four GLBs match "What it judged" above. There's no `2.result.json`.

### `records.json`: the copy, the refused edit, and both SHA-256s

- **Before:** I copied it to `/tmp/record-dino-r2.kR4x/records.json` (`cp -p`) before any edit. Both files are `341edde9ff71781c2d5da31f31c6ce52a49a58a9b643dc139f9e8905311f14f9`.
- **The edit:** step 1's script from above, with one change: it also sets `models_checked` to `2026-11-11` on every step `by` `model`. It passed its canonical-form check, then the write failed:

  ```
  OSError: [Errno 30] Read-only file system: '/srv/studio/handoff/dinosaur/2/records.json'
  $ findmnt -T /srv/studio/handoff/dinosaur/2 -o TARGET,SOURCE,FSTYPE,OPTIONS
  TARGET              SOURCE                        FSTYPE OPTIONS
  /srv/studio/handoff /dev/sdd[/srv/studio/handoff] ext4   ro,relatime,discard,errors=remount-ro,data=ordered
  $ findmnt -T /srv/studio/briefs/dinosaur -o TARGET,SOURCE,FSTYPE,OPTIONS
  TARGET             SOURCE                       FSTYPE OPTIONS
  /srv/studio/briefs /dev/sdd[/srv/studio/briefs] ext4   rw,relatime,discard,errors=remount-ro,data=ordered
  ```

- **After:** `341edde9ff71781c2d5da31f31c6ce52a49a58a9b643dc139f9e8905311f14f9`, unchanged (`diff` against the copy: no difference). Nothing had to be put back.
- **What the edit makes**, on a scratch copy: `39b89e14bf309fdfdc367d8b0a45f1943363014eb9cdcf4e405367fde7cad4df`. Against the handoff's file, the diff is 11 `models_checked` lines (`2026-11-14` changed to `2026-11-11`) and 4 inserted steps (`{"name": "the Author's review of the mesh", "by": "hand"}`, one per entry, each right after the Pixal3D step). Nothing else changes.

"Every model step" covers eleven steps, as step 2 above counts them. Each entry has the Pixal3D step and the build, and each clip's entry also has its own clip step. The clip steps are by model too: Claude Opus 5.5, through the studio's agent's script. The supervisor's parenthetical named only Pixal3D and the build, so I'm noting why the clip steps are included.

### The dry re-judge, on the scratch copy

The scratch copy is `/tmp/record-dino-r2.kR4x/scratch/dinosaur/2/`. It holds the four GLBs, `LICENSE.md`, and `candidate.json`, all copied from the handoff, plus the edited `records.json` (`39b89e14…d4df`). The run is from this branch's checkout. It's a preview of step 3, not the round's dry re-judge, which runs on the handoff folder itself:

```
$ python3 -I -B scripts/studio/line.py candidate /tmp/record-dino-r2.kR4x/scratch/dinosaur/2 --brief /srv/studio/briefs/dinosaur/2.json
arrival-check: main's copy, at 3c0e4cd06861, on a scratch copy under assets/visitors/dinosaur/
WARN assets/visitors/dinosaur/dinosaur-idle.glb: its record's steps call for the composite mark, and the file needs no approval, so it's up to the contributor to check for likeness (spec 004, Amendment C1)
WARN assets/visitors/dinosaur/dinosaur-take.glb: its record's steps call for the composite mark, and the file needs no approval, so it's up to the contributor to check for likeness (spec 004, Amendment C1)
WARN assets/visitors/dinosaur/dinosaur-walk.glb: its record's steps call for the composite mark, and the file needs no approval, so it's up to the contributor to check for likeness (spec 004, Amendment C1)
WARN assets/visitors/dinosaur/dinosaur.glb: its record's steps call for the composite mark, and the file needs no approval, so it's up to the contributor to check for likeness (spec 004, Amendment C1)
file                                        bytes     gzip      vertices  triangles  texture
assets/visitors/dinosaur/dinosaur-idle.glb  47908     22309     0         0          0
assets/visitors/dinosaur/dinosaur-take.glb  35904     10963     0         0          0
assets/visitors/dinosaur/dinosaur-walk.glb  37716     14707     0         0          0
assets/visitors/dinosaur/dinosaur.glb       2248336   1236931   32645     27997      5592405
arrival-check: 0 findings in 6 files, 4 warnings
line: pass; round 2
exit 0
$ ls /srv/studio/briefs/dinosaur/
1.json  1.result.json  2.json
```

The record with his date and his mesh review passes: 0 findings, round 2. `--record` didn't run, on the scratch copy or on the handoff. Afterwards there was still no `2.result.json`, and the handoff's `records.json` was still `341edde9…f14f9`.

### Steps 1 and 2 as one script, for whoever can write the handoff

This is the script I ran on the scratch copy. Run it on the handoff's file, then run steps 3 and 4 above unchanged.

```
python3 -I - /srv/studio/handoff/dinosaur/2/records.json <<'EOF'
import json, sys
p = sys.argv[1]; raw = open(p, encoding="utf-8").read(); d = json.loads(raw)
assert json.dumps(d, indent=2, ensure_ascii=False) + "\n" == raw
step = {"name": "the Author's review of the mesh", "by": "hand"}
n = 0
for e in d["entries"]:
    for s in e["steps"]:
        if s["by"] == "model":
            assert "models_checked" in s
            s["models_checked"] = "2026-11-11"; n += 1
    i = [k for k, s in enumerate(e["steps"]) if "by Pixal3D" in s["name"]]
    assert len(i) == 1 and step not in e["steps"], e["file"]
    e["steps"].insert(i[0] + 1, step)
open(p, "w", encoding="utf-8").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
print("model steps dated:", n)
EOF
sha256sum /srv/studio/handoff/dinosaur/2/records.json   # 39b89e14bf309fdfdc367d8b0a45f1943363014eb9cdcf4e405367fde7cad4df; it prints "model steps dated: 11"
```

### The dog's records

No dog record changed tonight. Round 2 is already recorded (fail, on `files`). Round 3 handed nothing back (studio-dog-r7 stopped, Q220). The same read-only mount would have refused a change anyway.

### Interruptions (rule 5)

One refusal. The filesystem, not the bash gate, refused the write to `/srv/studio/handoff/dinosaur/2/records.json` (`EROFS`; the mount is `ro`). I didn't try it again or another way. I didn't use a scratch copy as the recorded candidate either: `--record` would then have recorded a pass for a record that isn't the one in the handoff. Nothing was respelled. I didn't open, view, copy, or list the inbox, the dog's photos folder, or the handoff's `front.png` and `side.png`.

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
