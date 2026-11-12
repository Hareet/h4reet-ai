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

- **`line.py brief FILE --caps <main's caps.json> --tools <main's studio-tools.json>`**: valid per data-model.md, and every limit at or under the cap for the kind. The round is the folder's highest plus one, and no more than 3. Every tool is `outputs_ship: true`.
- **`line.py candidate DIR --brief FILE --tools …`**: `candidate.json` is valid, and its files exist. Each GLB's JSON chunk is parsed (standard library) for:
  - triangles (indexed primitives' counts / 3, or positions / 3);
  - bone names (skins' joints' node names);
  - animation names;
  - each image's pixel size (PNG and JPEG headers);
  - the file's bytes.

  Each is compared with the brief's limits. Every tool must be in the brief's `tools` and the list. Any record step naming `qwen-image` or `flux` with `dev` is refused by name, whatever the list says.
- **`line.py round ASSET`**: prints the next round, or `decide` after 3 failures.
- **Exit codes**: 0 pass, 1 findings (one line each: the check, the value, the limit), 2 can't run.

Then the repo agent runs main's `tools/gates/arrival_check.py --repo <scratch> PATH…` on a scratch repository holding the candidate under its intended `assets/` path. A finding from either fails the round.

## Rounds

Round *n*'s failure writes round *n*+1 with `findings` copied verbatim. After round 3's failure no brief is written; the decision page gets the asset, its three findings lists, and a recommended next step.
