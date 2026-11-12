# Contract: the studio line

## Folders

| Folder | Written by | Read by | Made by |
|---|---|---|---|
| `/srv/studio/briefs/<asset>/<round>.json` | implementer, ops | studio, supervisor | the install |
| `/srv/studio/handoff/<asset>/<round>/` | studio | implementer, ops, supervisor | the install (top), the studio (below) |
| `/srv/studio/outputs/` | studio (its working folder, once the Author has emptied it) | studio | exists |
| `/srv/studio/workflows/` | the Author | studio | exists |
| `/srv/studio/photos`, `/key` | the Author | no agent | exist |

## `line.py`

**The policy is main's only** (review G3, blocker 1). Each command reads `assets/policy/caps.json` and `assets/policy/studio-tools.json` from `refs/heads/main`'s commit in `--repo` (the working directory's repository by default): `rev-parse --verify refs/heads/main^{commit}`, then `cat-file blob <sha>:<path>`, with `GIT_NO_REPLACE_OBJECTS=1` and no other `GIT_*` variable. Never a path the caller names (there's no `--caps` or `--tools`), a tag named main, or a working tree. While main lacks either file, every command that needs it exits 2; the tools list's message says it arrives as the Author's patch P-7. The arrival check doesn't read the tools list, so this is FR-029's only machine check of the list.

- **`line.py brief FILE [--repo DIR] [--handoff DIR]`**: valid per data-model.md, and every limit at or under main's cap for the kind. Every tool is `outputs_ship: true` on main's list, and none is named Qwen-Image or FLUX [dev], whatever the list says. The brief sits at `<briefs>/<asset>/<round>.json`, round 1 to 3, and:
  - its round is the folder's highest brief plus one;
  - no later brief, handoff folder, or result exists, and its own round has no handoff folder or result yet;
  - round 1 holds no findings; round *n* > 1 follows round *n*−1's handoff folder and its recorded failure, and holds that failure's findings verbatim.
- **`line.py candidate DIR --brief FILE [--repo DIR] [--handoff DIR] [--record]`**: first the brief is re-checked in full, as `line.py brief` checks it, except that its own round's handoff and result may exist (review G3, important 2). A brief that fails exits 2. Then `candidate.json` is checked: it must be valid, for the brief's asset and round, with its files in the folder as regular files (a link counts as absent). Each GLB's JSON chunk is parsed (standard library) for:
  - triangles: an indexed primitive's index count / 3, or its positions / 3; for strips and fans, the count less 2, as the arrival check counts. An `indices` or `POSITION` that names no accessor, a `count` that isn't a whole number of at least 1, or a `mode` that isn't a whole number from 0 to 6 is a finding, never 0 triangles (review G3, important 3);
  - bone names (skins' joints' node names);
  - animation names;
  - each image's pixel size, from its PNG, JPEG, or WebP (VP8, VP8L, VP8X) header;
  - the file's bytes.

  Each is compared with the brief's limits:
  - `bytes` against every file;
  - texture bytes as the arrival check measures them, width × height × 4 × 4/3;
  - a required bone matches a joint's name or `<prefix>:<name>`, as Mixamo's `mixamorig:` does;
  - `skeleton` is checked for shape only.

  Every tool must be in the brief's `tools` and on main's list. candidate.json's tools must also be at the list's version. Every model and tool a record step names must be in both too, matched by ID with other characters as hyphens ("SDXL Base 1.0" is `sdxl-base-1.0`). Any record step naming `qwen-image` or `flux` with `dev` is refused by name, whatever the list says.
  - The record's `directory` is the candidate's intended `assets/` path (not `assets/policy/`).
  - With `--record`, the folder must be the round's own `<handoff>/<asset>/<round>/`. The round's result goes beside the brief, `<briefs>/<asset>/<round>.result.json`: `{"schema": 1, "asset", "round", "result": "pass"|"fail", "findings": [lines]}`, holding line.py's findings and the arrival check's finding lines. It's written once, and `--record` exits 2 for a round that already has a result, or one that a later handoff folder or result follows. A can't-run records nothing.
- **`line.py round ASSET [--briefs DIR] [--handoff DIR] [--repo DIR]`** prints the asset's next step: `1` (nothing yet), `open N` (round N's brief or handoff folder, waiting for the studio or for judging), the next round's number (round N failed), `passed N`, or `decide`. Rounds are counted from the handoff side (review G3, blocker 2):
  - rounds used = the higher of the highest `<handoff>/<asset>/<n>/` folder and the highest recorded result. Only the studio writes the handoff folders; repo agents only read them;
  - so deleting a result or a brief, which repo agents can do, resets nothing;
  - `decide` once three rounds are used without a pass;
  - a recorded pass counts only while its round's handoff folder exists and the candidate re-checks clean (both checks run again); the file alone is no pass.
- **Exit codes**: 0 pass, 1 findings (one line each: the check, the value, the limit), 2 can't run.

Then `line.py candidate` itself runs main's `tools/gates/arrival_check.py --repo <scratch> PATH…` on a scratch repository holding the candidate under its intended `assets/` path:
- the check is read from the same `refs/heads/main` commit as the policy (never `main:`), with replace objects off, written to a temporary file, and run as `python3 -I -B`;
- the scratch's own `refs/heads/main` holds that commit's `assets/policy/` and `docs/data-flow-disclosure.md`, which the check reads;
- the scratch is made with plumbing, and without system or global git config, so no hook runs.

A finding from either check fails the round. If the arrival check exits 2, or exits 1 with no finding line, line.py exits 2 (review G3, nit 1).

## Rounds

Round *n*'s failure writes round *n*+1 with `findings` copied verbatim. After round 3's failure no brief is written; the decision page gets the asset, its three findings lists, and a recommended next step.
