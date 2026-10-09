# Runbook: failed operator authentications

Calls to the admin listener with a missing, malformed, or wrong token. The gateway counts them in memory, audits at most one per class in each 10-minute window, and alerts at the third in a window. This page covers the `auth_failed` alert ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-007, FR-034; [contracts/operator-admin.md §1.1](../../specs/000-local-foundations/contracts/operator-admin.md#11-authentication); [data-model.md §5](../../specs/000-local-foundations/data-model.md#5-the-operator-credential).

## Symptoms

- **The alert**, on Telegram and by email: "AUTH FAILURES: 3 failed operator authentications in 10 minutes", naming the last failure's class (`missing`, `malformed`, `wrong prefix`, or `mismatch`), id `<stack>:auth_failed:admin:<window start>`.
- **The operator CLI** exits 3: "authentication failed: check the token file against the env file's OPERATOR_TOKEN_SHA256", and prints the token's fingerprint.
- **The audit log** holds `auth_failed` rows, with the class and the route, never the token.

## Impact

- None on service: a call that fails authentication changes nothing and learns nothing, since every class gets the same 401.
- But something reached the admin listener, which edge publishes on the host's `127.0.0.1` only (x003: 18003 for prod, 18103 for dev): a process on this machine. The agent sandbox can't reach those ports.

## Act

In your own terminal.

1. **If it was you** (the CLI exited 3): compare the fingerprint it printed with the first 8 characters of `OPERATOR_TOKEN_SHA256` in `~/.config/h4reet-ai/env/<stack>.env`.
   - **`mismatch`:** after a rotation the gateway keeps the old hash until `make up ENV=<stack>` recreates it; or the token file was replaced.
   - **`wrong_prefix`:** another stack's token, such as dev's, sent to prod's port.
   - **`malformed` or `missing`:** a request made by hand; the CLI never sends one.
2. **If it wasn't you:** list the failures with `make operator-audit ENV=<stack>`, and look for the process: `ss -tnp | grep ':18003'` (18103 for dev). Then rotate the token: delete `~/.config/h4reet-ai/operator/<stack>.token`, run `make operator-token ENV=<stack>`, put the hash it prints in the env file's `OPERATOR_TOKEN_SHA256` with an editor, and run `make up ENV=<stack>`.

## Verify

- `make operator-status ENV=<stack>` exits 0.
- No new `auth_failed` alert in the next 10-minute window.

## Undo

A rotated token never comes back: the old one stays refused, by design. Mint again if the new file is lost.

## Record

In the next merge-request note, or an incident note in `docs/incidents/` when it wasn't you: the window, the classes and routes from the audit rows, whether it was you, what you found, and the new token's fingerprint. Never the token.
