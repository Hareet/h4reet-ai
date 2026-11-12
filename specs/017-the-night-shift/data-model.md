# Data model: the night shift

All entities are files. Paths in `{{…}}` are placeholders the install fills from the machine facts.

## Machine facts (`~/.config/h4reet-ai/night-shift.env`, the Author's, never committed)

`KEY=value` lines, read as data (never sourced). Required keys:

| Key | Example | From |
|---|---|---|
| `REPO` | `/home/<user>/h4reet-ai/h4reet-ai` | the probe's §9 |
| `NIGHT_ROOT` | `/home/<user>/h4reet-ai/night` | fixed |
| `GATE_CHECKOUT` | `/home/<user>/h4reet-ai/gate` | fixed |
| `CLAUDE_BIN` | the resolved path of `claude` | the probe's §7 |
| `BLENDER_BIN`, `BLENDER_DIR` | the resolved paths | the probe's §5 |
| `COMFYUI_PORT` | `8188` | the probe's §6 |
| `ENGINE_PORT` | `2376` | the probe's §8 |
| `LAYERING` | `nested` or `fallback` | written by the install's R2 |
| `NIGHT_PLAN`, `NIGHT_GATE` | `off` | `on` only from the second install (plan §8) |
| `PLAN_AWS_PROFILE` | the plan role's profile name | the second install |
| `TOKEN_SOURCE` | `file:///…` or a nono keystore name | the Author, after `claude setup-token` |

Validation: every key present, each path absolute, `LAYERING`, `NIGHT_PLAN`, and `NIGHT_GATE` from their sets, no `{{`.

## Profile template (`deploy/night-shift/profiles/<role>.json`)

A nono profile (schema: the pinned version's `nono profile schema`) plus one top-level key nono ignores or the build strips, `"x-h4"`:

- `role`: one of `supervisor`, `spec-writer`, `implementer`, `reviewer`, `red-teamer`, `ops`, `gate-runner`, `studio`;
- `parent`: the lattice parent (plan §2), or `ceiling`;
- `example`: `true`, so the runner refuses this file if pointed at it.

The install's fill step drops `x-h4` and records the live file's SHA-256. Invariants (tested):
- every grant is in the parent's;
- every never-readable path is in `deny`, and no grant is its ancestor or descendant;
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
- `limits`: never above main's `caps.json` for the kind;
- `tools`: IDs from `studio-tools.json` whose entries have `outputs_ship: true`;
- `findings`: the previous round's failures, empty in round 1.

## Candidate (`/srv/studio/handoff/<asset>/<round>/candidate.json`)

```json
{"schema": 1, "asset": "dog", "round": 1, "files": ["dog.glb", "front.png", "side.png"],
 "tools": [{"id": "sdxl-base-1.0", "version": "1.0"}], "records": "records.json"}
```

`files` exist in the folder, and `tools` ⊆ the brief's `tools`. `records.json` follows the arrival check's format.

## Tools list (`assets/policy/studio-tools.json`, human-only, P-7)

```json
{"schema": 1, "tools": [
  {"id": "qwen-image-2.1", "kind": "weight", "version": "2.1", "license": "<id in licenses.json>", "outputs_ship": false}
]}
```

## Decision page (`docs/night-shift/<date>.md`)

Sections, in order: Questions (each: ID, the task it blocks, the question, the recommended answer, the alternatives); Stacks (branch, tip, note, gate log if any); Interruptions (time, task, cause); Requests (weights, nodes, the studio's); The runner's log lines.
