# Contract: AWS-side alerts, the budgets and their two actions, the handover's alerts, and the probe

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/aws-alerts.md` at 00309c47). The path, the bridge, the message format, and the probe are carried; the budgets, the actions, and the handover's alerts are new. Spec FR-022, FR-023, FR-026, FR-061, FR-065, FR-071. Research: R-22 to R-24, R-29, R-30.

## 1. The path

As September §1: one SNS topic, `h4-alerts`, in `infra/bootstrap/alerts.tf` (protected).
- **Email** goes through SNS's email subscription to the Author's sensitive variable.
- **Telegram** goes through `h4-alert-bridge`, which reads its token and chat ID from Parameter Store at each run and logs neither.
- **Who may publish:** `budgets.amazonaws.com`, `costalerts.amazonaws.com`, `events.amazonaws.com`, `cloudwatch.amazonaws.com`, and the roles of the credential audit, `h4-ec2-start`, `h4-ec2-guard`, EC2's and the tunnel end's instances, and the Author's `make ec2-stop`.

## 2. The alerts

Message format as September: `[hareet.ai aws] <kind>: <facts>`, one line, then facts. Never a payload, client identifier, account ID, key ID, or secret.

| Kind | Source | When | Runbook |
|---|---|---|---|
| `model_budget_warn`, `model_budget_reached` | `h4-model-month`, `h4-model-day` | 70%, 100% of Bedrock's cost | `aws-budget.md` |
| `server_budget_warn`, `server_budget_reached` | `h4-server-month` | 70%, 100% | `server-budget.md` |
| `model_action_executed` | the model action | `h4-deny-paid-models` attached on both hosts' Bedrock identities | `aws-budget-action.md` |
| `server_action_executed` | the server action | EC2 stopped by the budget | `server-budget.md` |
| `aws_anomaly` | Cost Anomaly Detection | an anomaly over $1 (as September) | `aws-anomaly.md` |
| `cert_expiring` | ACM | as September | `certificate.md` |
| `probe_failing`, `probe_recovered` | the probe's alarm | 5 failed minutes; the next pass | `probe-failing.md` |
| `credential_finding` | the credential audit | any finding | `credential-audit.md` |
| `ec2_started`, `ec2_start_refused` (`paused`, meaning the autostart switch is `off`; `server_budget_stopped`, `laptop_serving`, `start_failed`) | `h4-ec2-start` | each invocation | `handover.md` |
| `ec2_stopped_laptop_serving`, `ec2_stopped_paused`, `ec2_stopped_server_budget` | `h4-ec2-guard` | each stop | `handover.md`; `server-budget.md` for the last |
| `ec2_stopped_by_author` | `make ec2-stop` | each stop | `handover.md` |
| `spot_interruption` | `h4-ec2-spot-warning` | AWS's warning (spec FR-071, "You get an alert") | `spot-interruption.md` |
| `deploy_rolled_back`, `deploy_rollback_failed`, `deploy_refused` | each cloud host's deployer | contracts/releases-deployer.md §3 | `deploy.md` |
| `tunnel_end_interruption` | `h4-tunnel-end-spot-warning` | AWS's warning for the tunnel end (spec FR-076) | `tunnel-end.md` |
| `tunnel_end_back` | `h4-tunnel-end-running` | the tunnel end running again | `tunnel-end.md` |
| `ec2_start_refused (tunnel_end_down)` | `h4-ec2-start` | the laptop gone while the tunnel end is down | `tunnel-end.md` |

The laptop's own alerts, such as the handover loop's failed stop, go through spec 000's dispatcher, as its other alerts do.

## 3. The budgets (infra/bootstrap/budgets.tf, protected)

| Budget | Amount | Filter | Notifications |
|---|---|---|---|
| `h4-model-month` | $20 | Bedrock's services, `var.bedrock_service_names`; usage, not net of credits | 70% and 100% of actual |
| `h4-model-day` | $5 | Bedrock's services, `var.bedrock_service_names`; usage, not net of credits | 70% and 100% of actual |
| `h4-server-month` | the Author's figure (`TF_VAR_server_budget_usd`) | every service but Bedrock's | 70% and 100% of actual |

**Bedrock's services** (group 3, after T028's review, B3): the names Bedrock's cost shows under in the Author's Cost Explorer, which he writes as `TF_VAR_bedrock_service_names`, a list with no default, before the plan. Claude on Bedrock is sold through AWS Marketplace, and its cost can show under a name of its own ("Claude … (Amazon Bedrock Edition)"), not "Amazon Bedrock" alone. A wrong name would hide the spend from both model budgets and from the model action that reads `h4-model-month` (§4), and count it in the server budget. The model budgets count usage (`cost_types`, `include_credit = false`), so a credit can't hide the spend; the server budget keeps AWS's default. Both are his to change.

The Anthropic API's spend isn't on AWS's bill. The meter and spec 010's cap bound it, and the account's own limit is its safety net (spec FR-073).

## 4. The two actions (infra/account/killswitch.tf, protected)

| Setting | The model action | The server action |
|---|---|---|
| Budget, threshold | `h4-model-month`, 100% of actual | `h4-server-month`, 100% of actual |
| Type | apply IAM policy | run an SSM document (to confirm the type's name and target form) |
| Does | attaches `h4-deny-paid-models` (as September §3.1) to `h4-prod-gateway` and to `h4-laptop-bedrock`, the ordinary role the laptop's permission set assumes. Never to a role Identity Center makes for a permission set (to confirm in group 4, research.md R-22) | `AWS-StopEC2Instance` on the tagged instance |
| Approval | automatic | automatic |
| Execution role | allowed only to attach and detach that one policy on those two roles | allowed only that document on that one instance |
| Reversed by | the Author, after the incident note (the runbook's `execute-budget-action --execution-type REVERSE_BUDGET_ACTION`) | `make server-budget-restore`, after the incident note |
| While executed | Bedrock calls fail as `auth`. On the laptop, spec 000's gateway answers `fallback_unavailable` where Bedrock is its fallback; EC2 keeps the Anthropic API | `h4-ec2-start` refuses with `server_budget_stopped`, and `h4-ec2-guard` stops any start with `ec2_stopped_server_budget` |

**Rehearsals (FR-026, SC-009):** while `rehearsal = true`, two $0.01 budgets with the same action types:
- the model rehearsal against `h4-rehearsal-target`, an ordinary role of the same shape as `h4-laptop-bedrock`, which no one assumes (to confirm, with the target, in group 4);
- the server rehearsal against `h4-rehearsal-instance`, a `t4g.nano` (to price), which the Author starts before the trip, since stopping a stopped instance proves nothing.

The record is as September §3.4, per action. For the server action it also keeps the SSM run's status from the action's history (`AWS-StopEC2Instance` succeeded) and the instance's state after it (`stopped`). Then `rehearsal = false`.

## 5. The uptime probe (FR-061)

As September §4: `h4-probe`, once a minute, from AWS's side. Its schedule, an EventBridge rule, sits in the protected `infra/account/alerts.tf` (rule T5), as the credential audit's weekly schedule does. It is written disabled in group 4 (P-I2), and the line that enables it is part of group 8's P-I5.
- **Its checks:** `GET https://hareet.ai/` and `GET https://hareet.ai/api/status` with `X-H4-Probe: 1`.
- **A pass:** 200 within 5 s; for status, a JSON body with a `serving` field.
- **The alarm:** after 5 failed minutes.

It never calls hello or a turn.
