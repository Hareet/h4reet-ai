# Contract: the handover: the health check, the start function, the guard, the autostart switch, the laptop's loop, and the commands

Spec 001, re-planned 2026-11-09. New. Spec FR-063 to FR-066, FR-069 to FR-072, FR-074. FR-076. Research: R-29 to R-32. By the Author's answers to the plan's questions 1 and 2: the relay moves visitors, the health check only wakes EC2, and the tunnel end runs on spot.

## 1. The health check (`infra/prod/failover.tf`, protected)

| Setting | Value |
|---|---|
| Type | HTTP |
| Target | the tunnel end's Elastic IP, port 8087, path `/health` |
| Reaches | the laptop's health block through the tunnel (contracts/tunnel.md §4), so it fails if the tunnel end, the tunnel, or the laptop's stack fails |
| Interval, failure threshold | Route 53's standard interval; 3 (both to price and to confirm) |
| Regions | Route 53's defaults |

## 2. The alarm and the rules (`infra/account/handover.tf`, protected)

**Amended on 2026-11-12, in W1's regrouping** (research.md R-02, amended; plan.md §16, "No root holds another root's instance or health-check ID"; ADR 0049, proposed). The settings below stand. Where each item lives changes:

| Item | Root and file | Switch |
|---|---|---|
| `h4-laptop-away` | `infra/prod/failover.tf`, beside the health check whose ID it names | none: W1 |
| `h4-laptop-away-rule` | `infra/account/handover.tf`; it matches the alarm by its name, `detail.alarmName` | the account's `local.wired`: W2, since its target is the start function |
| `h4-ec2-spot-warning`, `h4-tunnel-end-spot-warning` | `infra/prod/handover.tf`, each naming its instance from the same root | none: W1, since they target `h4-alerts` |
| `h4-ec2-running` | `infra/prod/handover.tf` | its guard target behind prod's `local.wired`: W2 |
| `h4-tunnel-end-running` | `infra/prod/handover.tf` | its `h4-alerts` target in W1; its start-function target behind prod's `local.wired`: W2 |
| `/h4reet/prod/ec2-instance-id`, a String parameter holding EC2's ID | `infra/prod/handover.tf`, updated in the same plan as a replace | none: W1 |

The prod rules' function targets name the account's functions by their name-built ARNs. The account's permissions name the prod rules by theirs. §3 and §4's functions read the alarm by its name-built ARN, not the health check's status, and the instance's ID from the parameter, by its name (research.md R-15, amended).

| Item | Setting |
|---|---|
| `h4-laptop-away` | CloudWatch alarm on the health check's `HealthCheckStatus`, `Minimum < 1` over one period, missing data breaching |
| `h4-laptop-away-rule` | EventBridge rule on that alarm's change into `ALARM`, targeting `h4-ec2-start` |
| `h4-ec2-spot-warning` | EventBridge rule on "EC2 Spot Instance Interruption Warning" for the tagged instance, targeting `h4-alerts` |
| `h4-ec2-running` | EventBridge rule on "EC2 Instance State-change Notification", state `running`, for the tagged instance, targeting `h4-ec2-guard` |
| `h4-tunnel-end-spot-warning` | EventBridge rule on "EC2 Spot Instance Interruption Warning" for the tunnel end, targeting `h4-alerts` (`tunnel_end_interruption`) |
| `h4-tunnel-end-running` | EventBridge rule on the tunnel end entering `running`, targeting `h4-alerts` (`tunnel_end_back`) and `h4-ec2-start`, invoked as `from: tunnel_end_back` |

## 3. `h4-ec2-start`

A Lambda container image (stdlib Python, arm64), in `infra/lambdas/ec2_start/`. Its role, `h4-ec2-start-fn`, may start the instance tagged `h4-prod-ec2` and nothing else, read the parameter and the three statuses below, and publish to `h4-alerts` (research.md R-15; plan question 7, provisional).

| Step | Refuses with |
|---|---|
| 1. Read `/h4reet/prod/ec2-autostart` | `paused` if it is `off` |
| 2. Read the server action's status (`budgets:DescribeBudgetActionsForBudget` on `h4-server-month`) | `server_budget_stopped` if executed and not reversed |
| 3. Read the tunnel end's state (`ec2:DescribeInstances` on its tag) | `tunnel_end_down` if it isn't running (spec FR-076) |
| 4. When invoked by hand (§7) or `from: tunnel_end_back`, read the health check's status (from W1: the alarm `h4-laptop-away`'s state, by its name-built ARN, `OK` meaning the laptop serves; §2's amendment) | `laptop_serving` if healthy |
| 5. `ec2:StartInstances` on the tagged instance | `start_failed`, with AWS's error code (for example, no spot capacity) |

Each outcome, started or refused and why, is one message to `h4-alerts`, and one log line in CloudWatch's embedded metric format, which the sink counts for the dashboard (contracts/public-view.md §2; to confirm in group 9). It makes one attempt per invocation and never loops (FR-065).

## 4. `h4-ec2-guard`

The same packaging, in `infra/lambdas/ec2_guard/`, with its own role, `h4-ec2-guard-fn`: it may stop the tagged instance and nothing else, read the parameter, the health check's status, and the server action's status (`budgets:DescribeBudgetActionsForBudget` on `h4-server-month`), and publish to `h4-alerts`. On `h4-ec2-running`:

| Condition | Action |
|---|---|
| The health check is healthy (the laptop serves; from W1, read as `h4-laptop-away` in `OK`, by its name-built ARN) | `ec2:StopInstances`; alert `ec2_stopped_laptop_serving` |
| The autostart switch is `off` | `ec2:StopInstances`; alert `ec2_stopped_paused` |
| The server budget's action has run and isn't reversed | `ec2:StopInstances`; alert `ec2_stopped_server_budget` |
| Otherwise | nothing |

Each stop also writes one embedded-metric log line, as §3's.

**Amended on 2026-11-12, in W1's regrouping: more than one tagged instance.** A replace of EC2 can leave its persistent spot request open, so AWS may launch a second instance from it (tasks.md T097). On each run the guard lists the instances tagged `h4-prod-ec2`. It stops any that runs and isn't the one `/h4reet/prod/ec2-instance-id` names, and alerts `ec2_unrecognised_instance` with the instance's ID. Then it applies the table above to the named one. An instance the orphaned request launches without the tag is out of the guard's sight; the runbook's check after a replace finds it (`docs/runbooks/ec2.md`).

## 5. The autostart switch

A `String` parameter `/h4reet/prod/ec2-autostart`: `on` lets EC2 start automatically, and `off` stops that. The refusal and stop codes keep the word `paused` (`paused`, `ec2_stopped_paused`); each means the switch is `off`. It is defined in protected Terraform with `ignore_changes = [value]`, so its value is the Author's and a plan never shows it as drift. Only `make ec2-autostart` changes it (§7), and each change writes an audit row (FR-012, FR-065). The dashboard shows it.

## 6. `h4-handover` (the laptop's loop; FR-064)

A stdlib host script, `deploy/scripts/handover.py`. `make up ENV=prod` starts it in the Author's session, and `make down ENV=prod` stops it.

| Phase | Behavior |
|---|---|
| Waiting | every 5 s, read the public `https://hareet.ai/api/status` (contracts/relay-http.md §6), marked as a probe (disclosure row C6, with the describe and stop calls below). When `serving` is `laptop`: stop EC2 with the `h4-ec2-stop` permission set (question 7), record the handover's window, and move to serving |
| Serving | every 60 s, the status again: while it says `laptop`, if EC2's state is `running` or `pending`, stop it and record why (`flap`); on `ec2` or `none`, record `released` and go back to waiting (a status it can't read skips the round and stays serving; the fixes' review, nit 1), so EC2 that the start function started while the relay sends elsewhere is left to serve (FR-064, "WHILE ... the relay sends to it"; group 9's review A, I1) |
| No session | if the SSO session has expired, the CLI hangs or is missing, or the stop fails: one alert, `handover_stop_failed`, published to `h4-alerts` through the `h4-ec2-stop` permission set's `sns:Publish` (both channels, as `make ec2-stop`'s alert goes; contracts/aws-alerts.md §2), and its line in the loop's own log, which keeps it when it can't be published; keep serving, retry each minute. Any other error in a round is recorded and the loop goes on. `make up` never fails for this, and says on its terminal when the stop profile's session can't be used (group 9's review A, I2, I3; plan.md §16, "Group 9, as built", item 13). Spec 000's dispatcher has no host-script kind, so the alert goes through AWS's path, not the laptop's |
| Window | from the relay's first `laptop` to EC2's `stopped`: at most 5 minutes (FR-063); recorded in the stack's state directory and as `h4.handover.window_seconds`, posted to the stack's own collector on the port `make up` reads from the env file's `H4_OTLP_PORT` and passes to the loop (group 9's review A, I4) |

## 7. The operator's commands (the Author's terminal; refused to agents)

| Command | Does | Audit |
|---|---|---|
| `make ec2-status` | EC2's state, its spot request's state, the autostart switch, the server action's status, the relay's `serving` | — |
| `make ec2-start` | invokes `h4-ec2-start` with `manual: true`, so §3's four checks apply | the function's alert |
| `make ec2-stop` | `ec2:StopInstances` through the `h4-ec2-stop` permission set | a line in `~/.local/state/h4reet/ec2-actions.jsonl`, and an alert |
| `make ec2-autostart STATE=on\|off` | writes the parameter; with `on`, also invokes `h4-ec2-start` once | a line in `~/.local/state/h4reet/ec2-actions.jsonl`, as `make ec2-stop`'s: no admin route writes an arbitrary audit row in the shared state (plan.md §16, "Group 9, as built", item 12) |
| `make server-budget-restore` | reverses the server action (`execute-budget-action --execution-type REVERSE_BUDGET_ACTION`), after the incident note | the action's history; an alert |
| `make operator-* ENV=shared` | contracts/shared-state.md §7, `operator-restore` among them (§8) | spec 000's audit rows |
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

**A spot interruption of EC2:**
1. AWS warns; `h4-ec2-spot-warning` alerts.
2. AWS stops EC2, and the relay answers `no_host_serving`.
3. When capacity returns, AWS starts EC2, and the guard checks it.
4. If the guard leaves it running, the relay serves EC2 again.

**A spot interruption of the tunnel end** (spec FR-076):
1. AWS warns; `h4-tunnel-end-spot-warning` alerts.
2. AWS stops the tunnel end. The edge answers `no_host_serving`, the site loads, and the start function refuses with `tunnel_end_down`.
3. When capacity returns, AWS starts it. systemd starts Docker and the deployer, and compose starts its services. The laptop's tunnel reconnects within its backoff.
4. `h4-tunnel-end-running` alerts `tunnel_end_back` and invokes the start function once. EC2 starts if the laptop isn't serving.
5. The relay serves whichever host passes its checks.

Step 4 can run before the laptop's tunnel is back, while Route 53's check still reports the outage, so it can start EC2 though the laptop is about to serve. That is accepted, not delayed (research.md R-29): once the relay serves the laptop, the loop stops EC2 within the window (§6), and SC-016 counts the minutes.

## 9. Nothing changes configuration at run time (FR-072)

The functions and the loop change EC2's running state only. The relay's choice is in its memory and in `handover_events`. The parameter's value is ignored by Terraform. So a plan from the same commit after any of these shows no change, which spec User Story 1's scenario 10 checks.
## 10. The dashboard's Hosts row: the handover (group 9)

(new in group 9; tasks.md T127; FR-059, FR-060, FR-063, FR-065; plan.md §11; ADR 0048.) `deploy/grafana/dashboards/h4-runtime.json`'s "Hosts" row, below group 8's panels (contracts/relay-http.md §9):

| Panel | Type | Query |
|---|---|---|
| EC2's state (FR-060) | state timeline | `max by (state) (h4_ec2_state)` |
| EC2's spot request (FR-071) | state timeline | `max by (state) (h4_ec2_spot_request)` |
| EC2's starts, refusals, and the guard's stops (FR-065, FR-071) | time series | `sum by (function, trigger, outcome) (h4_ec2_outcomes_last_hour)` |
| The hours' scheduled starts and stops (FR-069) | time series | `sum by (trigger, outcome) (h4_ec2_outcomes_last_hour{trigger=~"hours_.+"})` |
| The autostart switch (FR-065) | stat | `max(h4_ec2_autostart)` |
| The laptop's health check (FR-054) | time series | `max(h4_health_check_healthy_share)` |
| The handover window (FR-063) | stat | `max(max_over_time(h4_handover_window_seconds[1d]))` |
| The server's month against its budget (FR-021) | time series | `max(h4_server_month_usd)` and `max(h4_server_budget_usd)` |

- **The sink's cloud reads** (`deploy/scripts/snapshot_sink.py`; contracts/public-view.md §2), every 2 minutes through the tunnel end's collector (C15), with no address or ID in a label:
  - **`h4_ec2_state`** is `h4.ec2.state`, one-hot by `state` (`pending`, `running`, `stopping`, `stopped`, `shutting-down`, `terminated`, `none`): EC2's, the instance tagged `h4-prod-ec2`;
  - **`h4_ec2_spot_request`** is `h4.ec2.spot_request`, one-hot by `state` (`open`, `active`, `disabled`, `closed`, `cancelled`, `failed`, `none`): its persistent request's. `disabled` is AWS holding it after an interruption, so the timeline shows each interruption;
  - **`h4_ec2_outcomes_last_hour`** is `h4.ec2.outcomes_last_hour`, by `function`, `trigger`, and `outcome`: the start function's and the guard's outcomes in the last hour, from their embedded-metric lines (namespace `h4reet/handover`, dimensions `Function`, `Trigger`, and `Outcome`). Its `outcome` is `started`, a refusal's reason (`outside_hours` among them), a stop's kind, or `nothing`;
  - **`h4_ec2_autostart`** is `h4.ec2.autostart`: 1 while the switch is `on`, 0 while `off`;
  - **`h4_health_check_healthy_share`** is `h4.health_check.healthy_share`: the share of Route 53's checkers that see the laptop's health block answer, from 0 to 1;
  - **`h4_server_month_usd`** and **`h4_server_budget_usd`** are `h4.server.month_usd` and `h4.server.budget_usd`: the server budget's month to date and its figure, read once an hour, beside spec 000's and spec 010's spend panels above.
  - A read that fails gets no point and counts in `h4.sink.read_errors`, by `read`: the panels show no data, never a stale value as fresh.
- **`h4_handover_window_seconds`** is `h4.handover.window_seconds`, the laptop loop's gauge (§6), posted through the laptop's collector: the last takeover's window, from the relay's first `laptop` to EC2's `stopped`. It reads green under 300 s (FR-063), red from 300 s.
- **The hours** are the schedules', in the zone `local.ec2_hours` names; the panel shows each scheduled start and stop by its outcome. While spec 001's question 1b is open, no panel states the hours themselves: that is T170's.
- `deploy/scripts/test_dashboard.py` reads this section's table with the other Hosts sections'.
