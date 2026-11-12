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

- **`line.py brief FILE --caps <main's caps.json> --tools <main's studio-tools.json>`**: valid per data-model.md, and every limit at or under the cap for the kind. The brief sits at `<briefs>/<asset>/<round>.json`; the round is the folder's highest plus one, and no more than 3. Round 1 holds no findings; round *n* > 1 needs round *n*−1's recorded failure, and holds its findings verbatim. Every tool is `outputs_ship: true`, and none is named Qwen-Image or FLUX [dev], whatever the list says.
- **`line.py candidate DIR --brief FILE --tools … [--repo DIR] [--record]`**: `candidate.json` is valid, for the brief's asset and round, and its files exist in the folder as regular files (a link counts as absent). `--repo` is the repository whose `refs/heads/main` gives the arrival check and its policy (the working directory's by default). Each GLB's JSON chunk is parsed (standard library) for:
  - triangles (indexed primitives' counts / 3, or positions / 3; strips and fans, the count less 2, as the arrival check counts);
  - bone names (skins' joints' node names);
  - animation names;
  - each image's pixel size (PNG and JPEG headers);
  - the file's bytes.

  Each is compared with the brief's limits (`bytes` against every file; texture bytes as the arrival check measures them, width × height × 4 × 4/3; a required bone matches a joint's name or `<prefix>:<name>`, as Mixamo's `mixamorig:` does; `skeleton` is checked for shape only). Every tool must be in the brief's `tools` and the list (candidate.json's at the list's version), and so must every model and tool a record step names, matched by ID with other characters as hyphens ("SDXL Base 1.0" is `sdxl-base-1.0`). Any record step naming `qwen-image` or `flux` with `dev` is refused by name, whatever the list says.
  - The record's `directory` is the candidate's intended `assets/` path (not `assets/policy/`).
  - With `--record`, the round's result goes beside the brief, `<briefs>/<asset>/<round>.result.json`: `{"schema": 1, "asset", "round", "result": "pass"|"fail", "findings": [lines]}`, line.py's findings and the arrival check's finding lines. A round is recorded once; a second `--record` exits 2.
- **`line.py round ASSET [--briefs DIR]`**: prints the asset's next step from its briefs and results: `1` (no brief yet), `open N` (round N's brief, no result yet), the next round's number (round N failed), `passed N`, or `decide` after 3 failures.
- **Exit codes**: 0 pass, 1 findings (one line each: the check, the value, the limit), 2 can't run.

Then `line.py candidate` itself runs main's `tools/gates/arrival_check.py --repo <scratch> PATH…` on a scratch repository holding the candidate under its intended `assets/` path. The check is read from `refs/heads/main`'s commit (never `main:`) with replace objects off, written to a temporary file, and run as `python3 -I -B`. The scratch's own `refs/heads/main` holds that commit's `assets/policy/` and `docs/data-flow-disclosure.md`, which the check reads; it's made with plumbing, and without system or global git config, so no hook runs. A finding from either fails the round; the check's exit 2 is line.py's.

## Rounds

Round *n*'s failure writes round *n*+1 with `findings` copied verbatim. After round 3's failure no brief is written; the decision page gets the asset, its three findings lists, and a recommended next step.
