# Agent-config eval history

`make evals-agent-config` (the Author) writes one JSON file here per run of the behavioral tier, named `<UTC>-<branch>-<sha>.json`: the run's start in UTC, the branch with anything but letters, digits, `.`, `_`, and `-` turned into `-`, and the first 12 characters of its tip (spec 000 plan §14; `evals/agent-config/behavioral.py`). The Author commits it before merging (SC-008).

- `make evals` reads every entry. It prints PASS when one with `"verdict": "pass"` has the current trigger hash, FAIL when the newest one for the hash failed, and otherwise PENDING with the command.
- `main`'s newest entry is the baseline: a run's conduct may not fall below it.
- The Author's gate (`tools/gates/gate`, tasks.md T092) posts an entry's `cost_usd` and `tokens` once, as the `h4.devtime.eval.cost_usd` and `h4.devtime.eval.tokens` metrics, labelled with `run` and `verdict` (contracts/telemetry.md §4.4). The dashboard's dev-time row shows them, as the Team plan's notional cost, outside the production meter (FR-037).
- Transcripts never come here. They stay on the Author's machine, in `~/.local/state/h4reet/evals/<run>/`, mode 0600.

## An entry

| Key | Holds |
|---|---|
| `schema` | `1` |
| `run` | the file's name without `.json`; the gate's `h4.eval.run` |
| `trigger_hash` | the SHA-256 the run tested: CLAUDE.md, REVIEW.md, `.claude/**`, and `evals/agent-config/**` without `history/`, with their executable bits, and the Claude Code pin |
| `branch` | the branch the run tested |
| `commit` | its tip: the commit every scratch clone held |
| `main` | `main`'s commit at the time, or `null` |
| `claude_code_version` | the Claude Code that ran |
| `claude_code_pin` | `CLAUDE_CODE_VERSION` in `.devcontainer/toolchain.vars`; the run refuses a version off it |
| `started`, `finished` | UTC, ISO 8601 |
| `models` | every model the sessions reported |
| `thresholds` | `thresholds.yaml`, as the run read it |
| `baseline` | what conduct was compared with: `main`'s newest entry's `run`, and its `conduct_held` of `conduct_runs` over the conduct cases both counted; `null` when `main` has no entry |
| `cases` | one record per case, planned ones included (below) |
| `planned` | the cases a patch's task still waits for, by task, as `{"T117": ["docs-edits-source", ...]}` |
| `conduct` | the counted conduct runs: `held` of `runs` |
| `tokens` | `input`, `output`, `cache_read`, and `cache_creation`, every session's summed: the gate's `gen_ai.token.type` values |
| `cost_usd` | the sessions' notional cost on the Team plan, from Claude Code's own accounting, summed |
| `cost_complete` | `false` when a session ended, at its timeout, before reporting its cost |
| `transcripts` | where the transcripts are, on the Author's machine |
| `verdict` | `pass` or `fail`, against `thresholds` |
| `reasons` | each threshold a failing run missed |

A case's record holds:

- `id`, `kind` (`enforcement` or `conduct`), and `agent` (`null` for the main session);
- `planned`, a patch's task or `null`, and `counted`, `false` while it's planned;
- `runs`, and `ok_runs`: for an enforcement case, the runs with no forbidden effect and some hook event; for a conduct case, the runs where every check held;
- `passed`, `null` when it didn't run;
- `layers`: for an enforcement case, how many runs each layer held: `hook`, `permissions`, `sandbox`, `model` when nothing refused because the model didn't try, or `none` when the effect happened.

A run's record holds:

- `run`, its number, and `ok`;
- `valid` and `invalid`: a run with no hook event, in the transcript or the hooks' audit log, is invalid and fails, because `-p` ignores invalid settings silently;
- `effects`, what fired (enforcement), or `unmet`, the conduct checks that didn't hold;
- `layers`, `hook_events`, and `blocks`;
- `canaries_seen`: the names of the FR-007 variables, and the planted files, whose canary values appeared in the transcript; never the values;
- `timed_out`, `returncode`, and `duration_s`;
- `tokens`, `cost_usd`, and `models`;
- `transcript`: its file's name in the run's transcripts folder.
