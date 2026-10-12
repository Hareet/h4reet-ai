# Runbook: rolling a host stack back to the previous commit

A host stack (prod or dev) runs the commit `make up` exported, not the working tree. When a new commit misbehaves and the one before it worked, one command brings the previous commit back: its compose file, its configuration, and its images (the constitution's Development Workflow step 6). Spec 000: FR-018; plan §4; [contracts/env-files.md §12](../../specs/000-local-foundations/contracts/env-files.md#12-the-run-file-host-stacks). quickstart.md §1.12 rehearses it on dev.

dev-cpu has no rollback: the agents' engine serves the working tree itself.

## Symptoms

- After `make up ENV=<stack>` brought up a new commit, a service fails its health check, hello fails, or the stack behaves worse than before, and the cause is in the commit, not on the host.
- `make status ENV=<stack>` names the running commit and the one before it:

  ```text
  h4reet-dev: commit <sha> (branch <branch>); previous <previous sha>
    rollback: make up ENV=dev REF=<previous sha>
  ```

## Impact

- The rollback recreates every container whose definition differs between the two commits. Those services stop for seconds to a minute; while the gateway restarts, edge answers hello with 503 `api_unavailable`.
- The store, the journal, and every named volume stay as they are: a rollback changes code and configuration, never state. The meters, the kill switch, and the audit log carry over.
- A service the older commit doesn't define is removed (`--remove-orphans`), so the older topology comes back exactly.

## Act

1. **Find the commit to go back to:** `make status ENV=<stack>` prints it as `previous`, with the command. The run file, `~/.local/state/h4reet/<stack>/run.env`, holds it too, as `H4_REF_PREVIOUS`.
2. **Roll back, in one command:**

   ```bash
   make up ENV=<stack> REF=<previous sha>
   ```

   It exports that commit from git (the running and the previous commits' exports are kept, and an older one is exported again), checks that the export is the commit's own tree, runs that commit's preflight, fetches what it needs, and starts that commit's compose file and images.
3. **If the gateway refuses to start with exit 78 `schema_newer_than_code`,** naming a migration: the newer commit added a store migration the older gateway doesn't know, and it refuses to run against a schema newer than its code, rather than corrupt the meter. That is the designed failure. Don't roll back across it, and never wipe prod's store to get past it: roll forward instead (Undo), with a fix.
4. **Uncommitted work isn't in any export.** Preflight warns about uncommitted changes under `config/`, `deploy/`, `services/`, `evals/`, and `scripts/` (P21): commit them, or know that the stack doesn't run them.

## Verify

- `make status ENV=<stack>` shows the older commit as the one running, with the newer one as `previous`, and every service healthy.
- `make operator-status ENV=<stack>` shows the same state, meters, and renewal flag as before the rollback.
- hello answers:

  ```bash
  curl -sS -X POST http://127.0.0.1:<x000>/hello -H 'Content-Type: application/json' -d '{"message":"Say hello."}'
  ```

## Undo

Roll forward the same way: `make up ENV=<stack> REF=<the newer sha>`, which `make status` now shows as `previous`, or `make up ENV=<stack>` for the branch's head.

## Record

In the merge-request note of the branch that needed it, or an incident note in `docs/incidents/` when prod was affected: the two commits, why you rolled back, each `make up`'s exit code, and the `make operator-status` summaries from before and after (state, meters, the renewal flag), as quickstart.md §1.12 records them. If a migration stopped the rollback, name it.
