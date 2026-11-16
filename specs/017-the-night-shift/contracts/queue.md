# Contract: the queue

`queue.json` in the supervisor's worktree; the shape is in data-model.md. The runner reads it whenever its mtime changes, and refuses the whole file (keeping the last good one) when:

- `schema` isn't 1;
- an `id` repeats or breaks `[a-z0-9-]{3,40}`;
- a `role` or a lock isn't known;
- an `after` names a missing ID or forms a cycle;
- a `base` isn't a full ref or a 40-hex SHA that resolves;
- a `prompt` isn't one of the installed prompts.

The build (G1) also refuses: a field the data model doesn't name; a `slug` that breaks `[a-z0-9-]{1,40}` (it names the branch, `night/<id>/<slug>`); an `id` the runner keeps for itself (`supervisor`, `egress`, `egress-studio`, `egress-plan`, `engine-fwd`, `comfyui`); a studio task without the `gpu` lock; a `name` that breaks `feat/NNN-<words>`; and a queue file that is a link, not JSON, or over 1 MB. A task may carry `"name"` to mark its stack done (contracts/runner.md §6), even after it has run.

A refusal is one line on the decision page, naming the field. Tasks with every `after` done and their locks free start in file order, up to `NIGHT_WORKERS` at once (the Author's facts file; ten at most).

**The first queue** comes from the Author's orders (`orders.md`, data-model.md). The runner adds the file to the supervisor's prompt, word for word, and the supervisor plans the queue from it in the order he gave.
