# Runbook: the call journal can't be written

Every metered call must leave a durable record in the journal before it runs, so the meters can be rebuilt if the store is lost (FR-031). When the journal can't be written, metered calls are refused. This page covers the degraded cause `journal_unwritable` ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-031; [data-model.md §3](../../specs/000-local-foundations/data-model.md#3-the-journal); plan §19.

## Symptoms

- **hello, with the local model down,** answers 503 with `X-H4-Degraded-Cause: journal_unwritable`: "…metered calls are refused because the call journal can't be written."
- **The gateway's `/health`** and `make operator-status ENV=<stack>` show the journal `unwritable`.
- **The gateway logs** `journal.unwritable`, with an error class: `ENOSPC`, `EACCES`, `EROFS`, or another.
- **An operator write** answers `"journal": "unwritable"`, and the audit log gains a `journal_failed` row that names it.

## Impact

- Every metered call is refused: fallback on prod, synthetic spend on dev. Local answers continue.
- Operator writes still take effect, but their journal records are missing, so a later rebuild of the meters (the runbook `store-initialization.md`) can't see them.
- Nothing in the store is lost.

## Act

In your own terminal.

1. **Find the directory:** `${H4_STATE_DIR}/gateway/journal/`, that is `~/.local/state/h4reet/<stack>/gateway/journal/` for prod and dev. dev-cpu's is on the agents' engine, under `/var/lib/h4agents/state/dev-cpu/gateway/`, which only the engine reaches: ask the Author.
2. **By the error class:**
   - **`ENOSPC`:** the disk is full. Check both the Windows drive under WSL's `ext4.vhdx` and ext4 (research.md R-32), with `df -h /mnt/c ~`, and free space.
   - **`EACCES` or `EPERM`:** an owner or a mode changed. The gateway's `node` user (uid 1000) owns the journal: the directory 0700, the files 0600 ([data-model.md §3](../../specs/000-local-foundations/data-model.md#3-the-journal)). Put them back.
   - **`EROFS`:** the file system went read-only, as WSL does after a disk error. Restart WSL once no agent is working, then `make up ENV=<stack>`.
3. **Never** delete, truncate, or edit the journal: it is what the meters are rebuilt from.
4. **Nothing needs a restart:** every metered admission tries its append again, so the first one after the fix succeeds.

## Verify

After the next metered call, `make operator-status ENV=<stack>` shows the journal `ok`, and so does the gateway's `/health`.

## Undo

Put back anything you changed.

## Record

The error class, when it started and ended, the cause, and the audit IDs of any `journal_failed` rows: those operator writes have no journal record, so a later rebuild won't count them.
