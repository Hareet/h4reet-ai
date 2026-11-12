# Contract: the queue

`queue.json` in the supervisor's worktree; the shape is in data-model.md. The runner reads it whenever its mtime changes, and refuses the whole file (keeping the last good one) when:

- `schema` isn't 1;
- an `id` repeats or breaks `[a-z0-9-]{3,40}`;
- a `role` or a lock isn't known;
- an `after` names a missing ID or forms a cycle;
- a `base` isn't a full ref or a 40-hex SHA that resolves;
- a `prompt` isn't one of the installed prompts.

A refusal is one line on the decision page, naming the field. Tasks with every `after` done and their locks free start in file order, up to ten at once.
