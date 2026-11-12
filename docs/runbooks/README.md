# Runbooks

One page for each alert, degraded cause, and operator action of spec 000's stack, one each for the agents' engine and the local gate (plan §16), and spec 003's for the studio's GPU window and its assets. Every page has the same six sections: Symptoms · Impact · Act, with the make targets · Verify · Undo · Record.

How to find yours:
- **An alert** names its page on its last line, `Runbook: docs/runbooks/<page>.md` ([contracts/alerts.md §3](../../specs/000-local-foundations/contracts/alerts.md#3-message-format)).
- **A degraded answer from hello** carries its cause in the `X-H4-Degraded-Cause` header ([contracts/gateway-http.md §3](../../specs/000-local-foundations/contracts/gateway-http.md#3-degraded-causes)). The tables below list every cause and alert by the page it leads to, as [contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks) maps them.

Commands that act on prod or dev run in the Author's terminal. On dev-cpu, an agent session may run the same make targets, with the engine's public dummy token. A record holds commands, exit codes, timings, counts, and identifiers, never a secret, a token, an env-file value, or a payload ([quickstart.md, Conventions](../../specs/000-local-foundations/quickstart.md#conventions)).

## Spend: the meter, the kill switch, and the fallback

| Runbook | Use it for |
|---|---|
| [cost-warning.md](cost-warning.md) | the `warn` alert: a meter crossed 70% of its limit |
| [kill-switch-trip.md](kill-switch-trip.md) | the `trip` alert; the cause `kill_switch_tripped`; the daily `reminder` while degraded |
| [kill-switch-reset.md](kill-switch-reset.md) | restoring `normal` after a trip: the `operator_action` alert for a `reset`; the cause `meter_at_ceiling`, which can follow one |
| [fallback-renewal.md](fallback-renewal.md) | the `fallback_exhausted` alert; the `operator_action` alert for a `renew`; the causes `fallback_awaiting_renewal` and `fallback_spent_today`; the daily `reminder` while renewal is awaited; the paid adapter's monthly cap, its `warn` and `fallback_exhausted`, and the cause `adapter_month_spent` (spec 010) |

## The store and the journal

| Runbook | Use it for |
|---|---|
| [store-initialization.md](store-initialization.md) | an empty store: the cause `store_uninitialized`; the `operator_action` alert for an `init` |
| [store-unreachable.md](store-unreachable.md) | the `store_unreachable` alert, and the cause `store_unreachable` |
| [journal-unwritable.md](journal-unwritable.md) | the cause `journal_unwritable`: metered calls refused, local answers continuing |

## The models

| Runbook | Use it for |
|---|---|
| [model-server-down.md](model-server-down.md) | the local model server not answering: the cause `no_fallback_in_stack`, or prod answering from its fallback |
| [bedrock-unavailable.md](bedrock-unavailable.md) | the `fallback_unavailable` alert, and the cause `fallback_unavailable` |
| [anthropic-unavailable.md](anthropic-unavailable.md) | the `fallback_unavailable` alert for the Anthropic API, and the cause `fallback_unavailable` while prod's route names it (spec 010) |
| [bedrock-credentials-expiring.md](bedrock-credentials-expiring.md) | the `credentials_expiring` alert: the Bedrock SSO session is near its end |

## The gateway, the alerts, and the operator

| Runbook | Use it for |
|---|---|
| [gateway-down.md](gateway-down.md) | the cause `api_unavailable`, which edge sends when the gateway can't answer |
| [alert-channel-down.md](alert-channel-down.md) | failed deliveries on the dashboard's alert panel: Telegram, email, or both can't deliver |
| [operator-auth-failures.md](operator-auth-failures.md) | the `auth_failed` alert: calls to the admin listener with a missing, malformed, or wrong token |
| [rollback.md](rollback.md) | a new commit misbehaving on prod or dev: back to the previous one, in one command |

## The studio (spec 003)

| Runbook | Use it for |
|---|---|
| [studio-gpu-window.md](studio-gpu-window.md) | handing prod's GPU to a studio job and taking it back (spec 003 FR-035): `make studio-window`; the `operator_action` alert for a `studio_window` |
| [asset-withdrawal.md](asset-withdrawal.md) | a merged asset or published image that locates the Author or breaks a license: the pre-publication cleanup, or off the site within a day and an incident note |

## Development: the agents' engine and the local gate

| Runbook | Use it for |
|---|---|
| [agents-engine.md](agents-engine.md) | the agents' engine down or unreachable, its plugin or proxy down, images or the stand-in model missing, a reset |
| [local-gate.md](local-gate.md) | `make check` or the Author's gate failing, waiting, or unable to run; a secret finding; a history scan that can't certify |

## The cloud: AWS's alerts and the laptop (spec 001)

Spec 001's pages, each with the group that needs it. Its AWS-side alerts reach Telegram through the alert bridge and the alerts mailbox through SNS, as `[hareet.ai aws] <kind>: …`, and each names its page on its last line ([contracts/aws-alerts.md §2](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts)).

| Runbook | Use it for |
|---|---|
| [aws-budget.md](aws-budget.md) | `model_budget_warn` and `model_budget_reached`: AWS's budgets on Bedrock's spend, `h4-model-month` and `h4-model-day`, at 70% or 100% |
| [aws-budget-action.md](aws-budget-action.md) | `model_action_executed`: the model action attached `h4-deny-paid-models` to the Bedrock roles; reversing it after the incident note |
| [server-budget.md](server-budget.md) | `server_budget_warn`, `server_budget_reached`, `server_action_executed`, and `ec2_stopped_server_budget`: the server budget, its action, and its rehearsal |
| [aws-anomaly.md](aws-anomaly.md) | `aws_anomaly`: Cost Anomaly Detection found spend of $1 or more it didn't expect |
| [credential-audit.md](credential-audit.md) | `credential_finding`: a long-lived key, a foreign trust, or one of spec 001's identities wider than Terraform writes it; `make infra-verify` refusing with `credential_finding`; `credential_audit_failed`: the weekly run raised and wrote no result |
| [alert-bridge.md](alert-bridge.md) | `alert_bridge_failed`: a notice the alert bridge couldn't send to Telegram waits in `h4-alert-bridge-failed`; replaying it |
| [laptop.md](laptop.md) | the laptop's prod in the cloud's design: its Bedrock profile chained to `h4-laptop-bedrock`, and preflight P19's refusals of it; its tunnel, the keys, the profile, and preflight P22's refusals |
| [tunnel-end.md](tunnel-end.md) | `tunnel_end_interruption`, `tunnel_end_back`, and `ec2_start_refused` (`tunnel_end_down`): the tunnel end's spot interruption and return; its restart, crash, failed deploy, revoked key, loss, and move to another zone |
| [shared-state.md](shared-state.md) | `shared_state_backup_failed`: the shared state's hourly backup failed; the store unreachable; a restore from the last backup; the tunnel end's move to another zone |
