# Contract: the studio's GPU window

Spec 003's FR-035 and SC-011; plan §6; research R-14. Builds on spec 000's operator interface (its contracts/operator-admin.md): the same token, listener, audit, and refusals.

## 1. The endpoint

`POST /admin/studio-window` on the gateway's admin listener, prod only (dev-cpu too, for tests).

| Body field | Allowed |
|---|---|
| `state` | `start` or `end` |
| `reason` | at least 10 characters, as every operator write |

| Answer | When |
|---|---|
| 200 `{ "window": "open" \| "closed", "since": "<time>" }` | recorded |
| 409 `already_open` | `start` while open |
| 409 `not_open` | `end` while closed |
| 401, 400 | as spec 000's operator endpoints |

**Effects:** an `audit_log` row (`action = studio_window`), a journal record, the gauge `h4_studio_window{stack}` set to 1 or 0, and an `operator_action` alert, as spec 000's operator writes send. It changes no meter, budget, ceiling, or routing.

**Telemetry:** the server span spec 000's contracts/telemetry.md gives "`POST /hello` and the admin routes", with `http.route` `/admin/studio-window`, its `h4.outcome` (`ok`, `refused` for a 409, `invalid` for a 400), and an attribute `h4.studio_window.state` (`start` or `end`). It never carries the reason's text, which goes to the audit row only.

## 2. The command

`make studio-window ENV=prod STATE=start|end REASON="…"`, the Author's (the bash gate refuses it for any stack but dev-cpu, as it refuses `operator-*`):
- **`start`:** records the window, then stops prod's model server (`docker compose … stop model-server-gpu`). Hello then falls back within the sub-budget, or degrades, as spec 000 routes it.
- **`end`:** starts prod at its run file's commit (`make up ENV=prod REF=<H4_REF>`), waits for the model server's health, sends one `make hello ENV=prod`, and records the window's end only when hello answers `route: local`.

## 3. The dashboard

- **An annotation** on the runtime dashboard's time series, from `h4_studio_window`.
- **A panel,** "Fallback spend in studio windows": the fallback spend between each window's start and end, from the gateway's ledger by `attribution = fallback`.

## 4. Tests

The gateway's integration tests: start, end, both 409s, the audit row, the gauge, the span's attributes with no reason text, and no meter changed. The operator CLI's tests: the command's arguments and refusals. The forbidden-action matrix: the bash gate refuses `make studio-window` for prod and dev in its plain spelling and in others (`make -C . studio-window ENV=prod …`, `bash -c 'make studio-window ENV=dev …'`, a variable carrying the stack, and the operator CLI's command called directly), allows it for dev-cpu, and carries a gap row for any spelling the rule can't catch, as CLAUDE.md asks of every bash-gate rule. SC-011 is the Author's rehearsal ([quickstart.md §4](../quickstart.md#4-group-4-the-gpu-window-fr-035-sc-011)).
