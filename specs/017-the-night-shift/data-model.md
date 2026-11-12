# Data model: the night shift

All entities are files. Paths in `{{…}}` are placeholders the install fills from the machine facts.

## Machine facts (`~/.config/h4reet-ai/night-shift/facts.env`, the Author's, never committed)

`KEY=value` lines, read as data (never sourced). Required keys, with the values the probes found:

| Key | Value found | From |
|---|---|---|
| `REPO` | `/home/<user>/h4reet-ai/h4reet-ai` | the nono probe |
| `NIGHT_ROOT` | `/home/<user>/h4reet-ai/night` | fixed |
| `UID`, `GID` | his | the install, from `id` |
| `CLAUDE_VERSION` | `2.1.322` | the nono probe; the images install this version |
| `BLENDER_DIR` | `/home/<user>/blender-5.2.3-linux-x64` (5.2.3 LTS) | the nono probe |
| `COMFYUI_DIR`, `COMFYUI_VENV` | `/home/<user>/ComfyUI`, `/home/<user>/flux-env` | the third run and `start-comfyui.sh` |
| `COMFYUI_PORT` | `8188` | `start-comfyui.sh` |
| `ENGINE_CERTS` | `/home/<user>/.config/h4reet/agents-engine/docker` | the relay's client folder |
| `NIGHT_PLAN`, `NIGHT_GATE` | `off` | `on` only from the second install (plan §8) |
| `PLAN_AWS_PROFILE` | the plan role's AWS profile name | the second install |

Validation: every key present, each path absolute, `NIGHT_PLAN` and `NIGHT_GATE` from their sets, no `{{`. The gate runs from `REPO` (his Q1 answer).

## The token file (`~/.config/h4reet-ai/night-shift/claude.env`, the Author's)

One line, `CLAUDE_CODE_OAUTH_TOKEN=<the setup-token value>`, mode 0600, made by the Author with `read -s` so the value never enters his shell's history. The runner checks its mode and shape, never prints it, and passes it only as a container's `--env-file` (FR-036).

## Container spec (`deploy/night-shift/containers/<role>.json`)

The shape, invariants, and placeholders are in contracts/containers.md. `role` and `parent` (the lattice parent, plan §2, `ceiling`, or `runner` for the runner-only specs) are top-level keys, and `x-h4` holds `example: true` and `task` (the runner's task mounts) in the repository. The install's fill step drops `x-h4` and records the live file's SHA-256. Invariants (tested):
- every mount, network, device, and capability is the parent's;
- no never-mounted path, or an ancestor of one, is mounted;
- the masks over main's settings' denyWrite paths are present in every writing spec;
- no `{{` survives the fill.

## Queue (`queue.json`, in the supervisor's worktree)

```json
{"schema": 1, "night": "2026-11-14", "tasks": [
  {"id": "res-01", "role": "spec-writer", "spec": "018-resume-links", "base": "refs/heads/main",
   "slug": "spec-018", "locks": [], "after": [], "prompt": "prompts/spec-writer.md", "brief": "…one paragraph…"}
]}
```

- `id`: `[a-z0-9-]{3,40}`, unique;
- `role`: from the set above;
- `base`: a full ref or a 40-hex SHA;
- `locks`: from `matrix`, `gate`, `gpu`;
- `after`: IDs in the same file, with no cycle.

The runner's state per task: `queued → running → (done | failed | stopped-idle | stopped-limit | refused)`. A `stopped-limit` task becomes `queued` again after the reset.

## Lock

A file `~/.local/state/h4reet-ai/night-shift/locks/<name>` (0444) held by `flock(LOCK_EX)` in the runner. The holder and since-when go to the runner's log.

## Brief (`/srv/studio/briefs/<asset>/<round>.json`)

```json
{"schema": 1, "asset": "dog", "kind": "avatar", "spec": "019-the-dog", "round": 1,
 "limits": {"bytes": 21000000, "triangles": 180000, "texture_bytes": 46000000, "texture_px": 2048,
            "skeleton": "mixamo", "bones_required": ["Hips", "Spine"], "clips": ["idle", "walk"]},
 "tools": ["comfyui-core", "sdxl-base-1.0"], "references": ["assets/visitors/…/still.png"],
 "findings": [], "notes": "…"}
```

- `round`: 1 to 3;
- `limits`: never above main's `caps.json` for the kind, read from `refs/heads/main` only;
- `tools`: IDs from main's `studio-tools.json` whose entries have `outputs_ship: true`;
- `findings`: the previous round's failures, empty in round 1.

## Candidate (`/srv/studio/handoff/<asset>/<round>/candidate.json`)

```json
{"schema": 1, "asset": "dog", "round": 1, "files": ["dog.glb", "front.png", "side.png"],
 "tools": [{"id": "sdxl-base-1.0", "version": "1.0"}], "records": "records.json"}
```

`files` exist in the folder, and `tools` ⊆ the brief's `tools`. `records.json` follows the arrival check's format.

## Round result (`/srv/studio/briefs/<asset>/<round>.result.json`)

```json
{"schema": 1, "asset": "dog", "round": 1, "result": "fail", "findings": ["triangles dog.glb: 200000 (limit: the brief's, 180000)"]}
```

Written once, by `line.py candidate --record`, and only for the round's own handoff folder, `/srv/studio/handoff/<asset>/<round>/`. Never for a round with a result, or one a later handoff folder or result follows. Round *n*+1's brief copies a failed round's `findings` verbatim.

The briefs folder is writable by repo agents, so `line.py round` doesn't trust it alone. Rounds used = the higher of the highest handoff folder (the studio's) and the highest result. A result's `pass` counts only while that round's handoff folder exists and the candidate re-checks clean.

## Tools list (`assets/policy/studio-tools.json`, human-only, P-7)

```json
{"schema": 1, "tools": [
  {"id": "qwen-image-2.1", "kind": "weight", "version": "2.1", "license": "<id in licenses.json>", "outputs_ship": false}
]}
```

## Decision page (`docs/night-shift/<date>.md`)

Sections, in order: Questions (each: ID, the task it blocks, the question, the recommended answer, the alternatives); Stacks (branch, tip, note, gate log if any); Interruptions (time, task, cause); Requests (weights, nodes, the studio's); The runner's log lines.
