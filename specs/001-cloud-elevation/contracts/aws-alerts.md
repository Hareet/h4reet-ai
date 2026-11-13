# Contract: AWS-side alerts, the budgets and their two actions, the handover's alerts, and the probe

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/aws-alerts.md` at 00309c47). The path, the bridge, the message format, and the probe are carried; the budgets, the actions, and the handover's alerts are new. Spec FR-022, FR-023, FR-026, FR-061, FR-065, FR-071. Research: R-22 to R-24, R-29, R-30.

## 1. The path

As September §1: one SNS topic, `h4-alerts`, in `infra/bootstrap/alerts.tf` (protected).
- **Email** goes through SNS's email subscription to the Author's sensitive variable.
- **Telegram** goes through `h4-alert-bridge`, which reads its token and chat ID from Parameter Store at each run and logs neither. **As built in group 4:** the Author's SecureStrings `/h4reet/alerts/TELEGRAM_BOT_TOKEN` and `/h4reet/alerts/TELEGRAM_CHAT_ID` (`infra/parameters.txt`); sendMessage with 5 s and 3 attempts, 2 s apart, as September had it; a run that can't send raises, so Lambda retries it twice and then sends it to the failure queue `h4-alert-bridge-failed`, kept 14 days (`infra/account/lambdas.tf`). Its log is the source, the kind, and the outcome.
- **Who may publish:** `budgets.amazonaws.com`, `costalerts.amazonaws.com`, `events.amazonaws.com`, `cloudwatch.amazonaws.com`, and the roles of the credential audit, `h4-ec2-start`, `h4-ec2-guard`, EC2's and the tunnel end's instances, and the Author's `make ec2-stop`.

## 2. The alerts

Message format as September: `[hareet.ai aws] <kind>: <facts>`, one line, then facts. Never a payload, client identifier, account ID, key ID, or secret.

**As built in group 4** (`infra/lambdas/alert_bridge/bridge.py`): a kind that takes a reason carries it after the kind, `[hareet.ai aws] ec2_start_refused (tunnel_end_down): …`; the facts follow as `- <key>: <value>` lines, and the last line names the kind's page, `Runbook: docs/runbooks/<page>`, from this table. The bridge knows a notice by its shape: AWS Budgets' threshold and action notices, by the budget's name (the rehearsals' add `- rehearsal: yes`), Cost Anomaly Detection's, CloudWatch's alarms', and EventBridge's events; and this project's own, which its functions, hosts, and rules' input transformers publish already in the format, whose kind and reason must be this table's and whose fact lines alone pass. Anything else it sends as `unrecognized`, with nothing of the notice and no page: the alerts mailbox has SNS's own copy. It takes out of every message what has a secret's, an account ID's, a key ID's, an email address's, or a network address's shape.

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
| `credential_audit_failed` | the alarm `h4-credential-audit-errors` (W1) | the audit raised, so its run wrote no result | `credential-audit.md` |
| `alert_bridge_failed` | the alarm `h4-alert-bridge-failed` (W1) | a notice the bridge couldn't send to Telegram is in its failure queue | `alert-bridge.md` |
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
| `h4-server-month` | the Author's figure (`TF_VAR_server_budget_usd`) | every cost tagged `project = h4reet-ai` but Bedrock's services (ADR 0047) | 70% and 100% of actual |

**Bedrock's services** (group 3, after T028's review, B3): the names Bedrock's cost shows under in the Author's Cost Explorer, which he writes as `TF_VAR_bedrock_service_names`, a list with no default, before the plan. Claude on Bedrock is sold through AWS Marketplace, and its cost can show under a name of its own ("Claude … (Amazon Bedrock Edition)"), not "Amazon Bedrock" alone. A wrong name would hide the spend from both model budgets and from the model action that reads `h4-model-month` (§4), and count it in the server budget. The model budgets count usage (`cost_types`, `include_credit = false`), so a credit can't hide the spend; the server budget keeps AWS's default. Both are his to change.

The Anthropic API's spend isn't on AWS's bill. The meter and spec 010's cap bound it, and the account's own limit is its safety net (spec FR-073).

## 4. The two actions (infra/account/killswitch.tf, protected)

**Amended on 2026-11-12, in W1's regrouping** (research.md R-02 and R-22, amended; plan.md §16; ADR 0049, proposed). There are three actions, in two roots, since no root may hold another root's instance ID:

| Action | Root and file | Budget, threshold | Does | Execution role |
|---|---|---|---|---|
| The model action on the laptop (applied 2026-11-12) | `infra/account/killswitch.tf` | `h4-model-month`, 100% of actual | attaches `h4-deny-paid-models` to `h4-laptop-bedrock` | may attach and detach that one policy on that one role |
| The model action on EC2 (W1) | `infra/prod/killswitch.tf` | `h4-model-month`, by its name, 100% of actual | attaches `h4-deny-paid-models` to `h4-prod-gateway` | its own; may attach and detach that one policy on that one role |
| The server action (W1) | `infra/prod/killswitch.tf` | `h4-server-month`, 100% of actual | `AWS-StopEC2Instance` on EC2's ID, from the same root | its own; that document on that instance alone |

Each is automatic, and each is reversed as the table below says. Both model actions publish `model_action_executed`. The table below stands for each column's settings; where it names "both hosts' Bedrock identities" in one action, read the two model actions above. Whether one budget may hold two actions of the same type is to confirm in W1's prod apply, since a plan never calls Budgets (research.md R-22's amendment; `docs/runbooks/aws-budget-action.md`, "A partly failed apply").

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

**As built in group 4** (`infra/account/killswitch.tf`, while `main.tf`'s `local.rehearsal` is true): `h4-rehearsal-model` reads Bedrock's spend by `var.bedrock_service_names`, and `h4-rehearsal-server` every cost tagged `project = h4reet-ai` but those names' (ADR 0047), as the real budgets do, so each fires on spend the month already holds and proves its filter; the model rehearsal needs a cent of Bedrock's spend in the month, and, like `h4-model-month`, counts no credits. `h4-rehearsal-target` trusts only the account's root user, who holds no key. The server rehearsal's role is AWS's managed `AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM` as far as the repository can say, narrowed to the one instance: `AWS-StopEC2Instance` and its reverse, `AWS-StartEC2Instance`; EC2's start and stop on that instance as Systems Manager calls them; and the Describe calls. To confirm against the managed policy at T037; anything more Budgets asks of it is what the rehearsal shows. **After T038's review (I1):** `local.rehearsal` is true only on the rehearsal's own change, beside `infra/account/rehearsal-on.txt`, which names that change's note.

The record is as September §3.4, per action. For the server action it also keeps the SSM run's status from the action's history (`AWS-StopEC2Instance` succeeded) and the instance's state after it (`stopped`). Then `rehearsal = false`.

## 5. The uptime probe (FR-061)

As September §4: `h4-probe`, once a minute, from AWS's side. Its schedule, an EventBridge rule, sits in the protected `infra/account/alerts.tf` (rule T5), as the credential audit's weekly schedule does. It is written disabled in group 4 (P-I2), and the line that enables it is part of group 8's P-I5.
- **Its checks:** `GET https://hareet.ai/` and `GET https://hareet.ai/api/status` with `X-H4-Probe: 1`.
- **A pass:** 200 within 5 s; for status, a JSON body with a `serving` field.
- **The alarm:** after 5 failed minutes. **As built in group 4:** it moves to group 8, with the line that enables the schedule (plan.md §16, group 4's departure 2): an alarm that reads missing data as breaching would fire while the schedule is off, and it needs `cloudwatch.amazonaws.com` among the bootstrap topic's publishers (§1). A failed run raises, so Lambda counts an error, which that alarm reads; Lambda retries none, since the next minute is the retry.

It never calls hello or a turn. **As built:** it sends no cookie and no credential, and follows no redirect (`infra/lambdas/probe/probe.py`).

**Amended on 2026-11-12, in W1's regrouping:** the line that enables the schedule, and the probe's alarm, read the account's `local.wired`, so they switch on in W2, whose prod apply comes first and makes the site the probe checks (plan.md §16, "Four gates"; tasks.md T178). W1 adds two alarms of its own to `h4-alerts`, both with missing data not breaching: `h4-credential-audit-errors` and `h4-alert-bridge-failed` (tasks.md T159).
