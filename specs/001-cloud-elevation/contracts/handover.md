# Contract: the handover: the health check, the start function, the guard, the pause switch, the laptop's loop, and the commands

Spec 001, re-planned 2026-11-09. New. Spec FR-063 to FR-066, FR-069 to FR-072, FR-074. Research: R-29 to R-32. As plan question 1 recommends: the relay moves visitors, and the health check fires the start function.

## 1. The health check (`infra/prod/failover.tf`, protected)

| Setting | Value |
|---|---|
| Type | HTTP |
| Target | the tunnel end's Elastic IP, port 8087, path `/health` |
| Reaches | the laptop's health block through the tunnel (contracts/tunnel.md §4), so it fails if the tunnel end, the tunnel, or the laptop's stack fails |
| Interval, failure threshold | Route 53's standard interval; 3 (both to price and to confirm) |
| Regions | Route 53's defaults |

## 2. The alarm and the rules (`infra/account/handover.tf`, protected)

| Item | Setting |
|---|---|
| `h4-laptop-away` | CloudWatch alarm on the health check's `HealthCheckStatus`, `Minimum < 1` over one period, missing data breaching |
| `h4-laptop-away-rule` | EventBridge rule on that alarm's change into `ALARM`, targeting `h4-ec2-start` |
| `h4-ec2-spot-warning` | EventBridge rule on "EC2 Spot Instance Interruption Warning" for the tagged instance, targeting `h4-alerts` |
| `h4-ec2-running` | EventBridge rule on "EC2 Instance State-change Notification", state `running`, for the tagged instance, targeting `h4-ec2-guard` |

## 3. `h4-ec2-start`

A Lambda container image (stdlib Python, arm64), in `infra/lambdas/ec2_start/`. Its role, `h4-ec2-start-fn`, may start the instance tagged `h4-prod-ec2` and nothing else, read the parameter and the two statuses below, and publish to `h4-alerts` (research.md R-15).

| Step | Refuses with |
|---|---|
| 1. Read `/h4reet/prod/ec2-autostart` | `paused` if it is `off` |
| 2. Read the server action's status (`budgets:DescribeBudgetActionsForBudget` on `h4-server-month`) | `server_budget_stopped` if executed and not reversed |
| 3. When invoked by hand (§7), read the health check's status | `laptop_serving` if healthy |
| 4. `ec2:StartInstances` on the tagged instance | `start_failed`, with AWS's error code (for example, no spot capacity) |

Each outcome, started or refused and why, is one message to `h4-alerts`. It makes one attempt per invocation and never loops (FR-065).

## 4. `h4-ec2-guard`

The same packaging, in `infra/lambdas/ec2_guard/`, with its own role, `h4-ec2-guard-fn`: it may stop the tagged instance and nothing else, read the parameter and the health check's status, and publish to `h4-alerts`. On `h4-ec2-running`:

| Condition | Action |
|---|---|
| The health check is healthy (the laptop serves) | `ec2:StopInstances`; alert `ec2_stopped_laptop_serving` |
| The pause switch is `off` | `ec2:StopInstances`; alert `ec2_stopped_paused` |
| Otherwise | nothing |

## 5. The pause switch

A `String` parameter `/h4reet/prod/ec2-autostart`, `on` or `off`, defined in protected Terraform with `ignore_changes = [value]`, so its value is the Author's and a plan never shows it as drift. Only `make ec2-autostart` changes it (§7), and each change writes an audit row (FR-012, FR-065). The dashboard shows it.

## 6. `h4-handover` (the laptop's loop; FR-064)

A stdlib host script, `deploy/scripts/handover.py`. `make up ENV=prod` starts it in the Author's session, and `make down ENV=prod` stops it.

| Phase | Behavior |
|---|---|
| Waiting | every 5 s, read the public `https://hareet.ai/api/status` (contracts/relay-http.md §6), marked as a probe. When `serving` is `laptop`: stop EC2 with the `h4-ec2-stop` permission set (question 7), record the handover's window, and move to serving |
| Serving | every 60 s: if EC2's state is `running` or `pending`, stop it and record why (`flap`) |
| No session | if the SSO session has expired or the stop fails: one alert through the laptop's prod alert path, keep serving, retry each minute. `make up` never fails for this |
| Window | from the relay's first `laptop` to EC2's `stopped`: at most 5 minutes (FR-063); recorded in the stack's state directory and as `h4.handover.window_seconds` |

## 7. The operator's commands (the Author's terminal; refused to agents)

| Command | Does | Audit |
|---|---|---|
| `make ec2-status` | EC2's state, its spot request's state, the pause switch, the server action's status, the relay's `serving` | — |
| `make ec2-start` | invokes `h4-ec2-start` with `manual: true`, so §3's four checks apply | the function's alert |
| `make ec2-stop` | `ec2:StopInstances` through the `h4-ec2-stop` permission set | a line in `~/.local/state/h4reet/ec2-actions.jsonl`, and an alert |
| `make ec2-autostart STATE=on\|off` | writes the parameter; with `on`, also invokes `h4-ec2-start` once | an audit row in the shared state, through `ENV=shared` |
| `make server-budget-restore` | reverses the server action (`execute-budget-action --execution-type REVERSE_BUDGET_ACTION`), after the incident note | the action's history; an alert |
| `make operator-* ENV=shared` | contracts/shared-state.md §7 | spec 000's audit rows |
| `make cloud-session HOST=ec2\|tunnel-end` | a Systems Manager port-forwarding session to that host's admin listener and the relay's internal listener | Systems Manager's session history |

## 8. The sequences

**The laptop takes over:**
1. `make up ENV=prod`: preflight, then the tunnel, then the topology.
2. The relay sees three passes and serves the laptop; it records a handover event.
3. The loop sees `laptop` and stops EC2; the window is recorded.
4. The health check turns healthy, and the alarm returns to `OK`.

**EC2 takes over:**
1. The laptop goes.
2. The relay serves EC2 if it is healthy, else answers `no_host_serving`.
3. The health check fails after its threshold, the alarm changes, and `h4-ec2-start` starts EC2, or refuses and alerts.
4. EC2's deployer runs, and the stack starts.
5. The relay sees three passes and serves EC2; it records the gap.

**A spot interruption:**
1. AWS warns; `h4-ec2-spot-warning` alerts.
2. AWS stops EC2, and the relay answers `no_host_serving`.
3. When capacity returns, AWS starts EC2, and the guard checks it.
4. If the guard leaves it running, the relay serves EC2 again.

## 9. Nothing changes configuration at run time (FR-072)

The functions and the loop change EC2's running state only. The relay's choice is in its memory and in `handover_events`. The parameter's value is ignored by Terraform. So a plan from the same commit after any of these shows no change, which spec User Story 1's scenario 10 checks.
