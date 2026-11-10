# Contract: the plan in the note, the apply and its record, the policy, and the credential audit

Spec 001, re-planned 2026-11-09. It carries the September contract (`contracts/infra-records.md` at 00309c47) nearly unchanged: §2's plan block, §3's gate step, §4's `make infra-verify`, and §6's apply record are as there, and are not repeated here. This file gives what changed: who runs what, the policy's rules, and the audit's checks. Spec FR-001 to FR-012. Research: R-13, R-14, R-16, R-26.

## 1. Who runs what

| Command | Who |
|---|---|
| `make plan` with no `ROOT` | anyone; in an agent session, the offline checks only (§3) |
| `make plan ROOT=bootstrap\|account\|prod` | the Author's terminal: the policy on the HCL before `init`, then `init`, `plan -out`, and the redacted block |
| `make infra-verify ROOT=…`, `make infra-record ROOT=… OUTCOME=…`, `make infra-audit`, `make infra-mirror`, `make secrets-check` | the Author's terminal; refused to agents |
| `terraform -chdir=infra/<root> apply <saved plan>` | the Author's terminal; refused to agents in every spelling (research.md R-16) |

`~/.config/h4reet-ai/infra/<root>.env` holds each root's run-time values as `TF_VAR_…` lines: the alert email address (`TF_VAR_alert_email`), the state bucket's suffix (`TF_VAR_state_bucket_suffix`), and the server budget's figure (`TF_VAR_server_budget_usd`). The guard patch denies each by name (contracts/env-cloud.md §5). No secret is a Terraform variable.

## 2. The plan block, the gate's step, `infra-verify`, the apply record

As September §2 to §4 and §6, at 00309c47, unchanged:
- the block's fields (`root`, `tree`, `sha256`, `terraform`, `made`);
- the redaction of 12-digit runs, email addresses, and sensitive values, refusing on any secret pattern;
- the gate's check of the tree hash;
- `infra-verify`'s checks (`not_main`, `dirty`, `no_reviewed_plan`, `plan_missing`, `plan_stale`, `plan_not_reviewed`, `plan_differs`, `credential_finding`, `state_locked`);
- the record's fields, on an `ops/apply-<root>-<date>` branch.

The name-server change at the registrar gets a hand-written record with the root `dns-delegation`.

**As built in group 3** (plan.md §16, group 3's departures 2 and 9): Terraform's data folder is `~/.config/h4reet-ai/infra/data/<root>`, never `.terraform/` in the tree, so the one command `infra-verify` prints is `AWS_PROFILE=<profile> TF_DATA_DIR=<…/data/root> terraform -chdir=infra/<root> apply <saved plan>`. On a pass, `infra-verify` writes a stamp beside the saved plan (`<root>-<tree>.verified`: the commit, the note, the time), and `infra-record` takes the record's start from it and refuses without it. `infra-record ROOT=… OUTCOME=failed` takes `EXIT_STATUS=<n>`, and a second record the same day is `<date>-2-<root>.md` on `ops/apply-<root>-<date>-2`.

## 3. The policy (`tools/gates/infra_policy.py`; human-only)

Run by `make infra-check` against the Author's provider mirror, and twice in the Author's `make plan`: on the HCL before `init`, and on the saved plan's JSON.

| ID | Rule |
|---|---|
| T1–T4 | as September: `default_tags`; `component` on every taggable resource; exact pins, only `hashicorp/aws`; no provisioner, `external`, `http`, or `null_resource` |
| T5 | these appear only in the protected files (FR-012): `aws_iam_*`, `aws_budgets_*`, `aws_ce_*`, SNS, CloudWatch alarms, EventBridge rules and targets (the probe's and the credential audit's schedules among them, in `alerts*.tf`), CloudFront's policies (in `edge-limits*.tf`) (as September); and now `aws_route53_health_check`, the Lambda functions `h4-ec2-start` and `h4-ec2-guard` and their permissions, the parameter `/h4reet/prod/ec2-autostart`, and an EC2 instance's `instance_market_options`. The protected files: `iam*.tf`, `budgets*.tf`, `alerts*.tf`, `killswitch*.tf`, `handover*.tf`, `failover*.tf`, `ec2-market*.tf`, `edge-limits*.tf` |
| T6 | as September: every bucket private, behind Block Public Access |
| T7 | no ingress from outside the account's ranges, except: 2222 from anywhere, on the tunnel end's public interface; 8087 from Route 53's health-checker ranges, on the same; 8080 from CloudFront's VPC origin, on its private interface |
| T8, T9 | as September: no account ID, email, or key literal; no Terraform-managed SecureString, and no data source that reads a secret |
| T10 | as September: the lockfile's provider version matches `.devcontainer/toolchain.vars` |
| T11 (new) | EC2's instance and the tunnel end's are spot with `instance_interruption_behavior = "stop"` and `spot_instance_type = "persistent"` (spec FR-069, FR-076) |
| T12 (new) | RDS has `publicly_accessible = false`, `storage_encrypted = true`, `deletion_protection = true`, `manage_master_user_password = true`, and no `password` argument |
| T13 (new) | IMDSv2 is required, with hop limit 1, on every instance |

## 4. The credential audit (FR-008, SC-004)

As September §7: weekly, and before every apply. Its checks:
- no IAM user access key;
- no root access key;
- no role trusting a principal outside the account, its services, and Identity Center;
- no OIDC provider before publication.

One check changed: September's "spec 000's hand-made identity still exists" becomes "the laptop's Bedrock permission set, and `h4-laptop-bedrock`, the ordinary role it assumes, are the ones Terraform defines, and the permission set holds nothing but that `sts:AssumeRole`" (spec FR-013; research.md R-15). One check is new: the start function's, the guard's, and the `h4-ec2-stop` permission set's policies name only the tagged instance.
