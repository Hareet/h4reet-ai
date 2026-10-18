# Contract: the plan in the note, the apply, its record, and the credential audit

Spec 001 (FR-002, FR-004 to FR-010, SC-004, SC-012) · Plan: [§1](../plan.md#1-infrastructure-the-roots-the-state-and-the-records), [§2](../plan.md#2-the-guard-patch-before-any-infra-file) · Research: [R-13](../research.md#r-13-the-plan-in-the-note-and-the-apply-record-fr-005-fr-007), [R-14](../research.md#r-14-the-offline-checks-agents-can-run-and-the-policy-fr-002-fr-004-fr-012), [R-16](../research.md#r-16-refusing-terraforms-state-changing-commands-in-every-spelling-fr-006-fr-011)

Until publication, there are no pull requests and no CI. The plan travels in the merge-request note, and the Author applies from their own terminal (ADR 0013; spec Assumptions). This contract fixes the four things that connect a reviewed plan to an applied one:
- the plan block;
- the gate's check of it;
- `make infra-verify`;
- the apply record.

It also fixes the credential audit (FR-008).

## 1. Who runs what

| Command | Who | Needs |
|---|---|---|
| `make plan` with no `ROOT` | anyone; in an agent session it's the offline checks only (§5) | the provider mirror |
| `make plan ROOT=<root>` | the Author's terminal; the policy on the HCL first, before `init` (§5) | the Author's SSO session, and `~/.config/h4reet-ai/infra/<root>.env` |
| `make secrets-check` | the Author's terminal | `ssm:DescribeParameters` only: it lists which of the expected `/h4reet/cloud/*` names exist, and their types, and never reads a value ([env-cloud.md §1](env-cloud.md#1-the-files)) |
| `make infra-verify ROOT=<root>` | the Author's terminal; refused to agents | the same, plus the saved plan |
| `terraform -chdir=infra/<root> apply <saved plan>` | the Author's terminal; refused to agents in every spelling (R-16) | the same |
| `make infra-record ROOT=<root> OUTCOME=<ok\|failed>` | the Author's terminal; refused to agents | the applied plan, and `terraform show -json` of the state after |
| `make infra-audit` | the Author's terminal | read-only IAM calls |
| `make infra-mirror` | the Author's terminal | registry access |

`~/.config/h4reet-ai/infra/<root>.env` holds the root's run-time values as `TF_VAR_…` lines: the alert email address and the state bucket's suffix. No secret is ever a Terraform variable: the secrets go straight to Parameter Store from the Author's terminal ([env-cloud.md §1](env-cloud.md#1-the-files)). Its mode is 0600, it sits under spec 000's deny of `~/.config/h4reet-ai`, and `make plan` reads it as data, never by `source`.

## 2. The plan block (FR-005)

`make plan ROOT=<root>` writes the saved plan to `~/.config/h4reet-ai/infra/plans/<root>-<tree>.tfplan` and prints the block to paste into the note:

````markdown
<!-- h4-plan root=prod tree=3f1c2a9e0b7d4c6e8a1f2b3c4d5e6f708192a3b4 sha256=9a0e…(64 hex) terraform=<version> made=2026-11-02T14:10:22Z -->
```terraform-plan
Terraform will perform the following actions:

  # aws_instance.vm will be created
  + resource "aws_instance" "vm" {
      + ami           = "ami-0abc…"
      + instance_type = "t4g.micro"
      + arn           = (known after apply)
      + tags          = { "component" = "cloud-vm", "environment" = "prod", "project" = "h4reet-ai" }
      …
    }

Plan: 1 to add, 0 to change, 0 to destroy.
```
<!-- /h4-plan -->
````

| Field | Meaning |
|---|---|
| `root` | `bootstrap`, `account`, or `prod` |
| `tree` | `git rev-parse HEAD:infra` when the plan was made: the tree hash of all of `infra/`, so a change to a module stales every root's block |
| `sha256` | SHA-256 of the saved plan file's bytes. `infra-verify` and the record repeat it |
| `terraform` | `terraform version`'s number |
| `made` | when the plan was made, UTC |

**The text** is `terraform show -no-color <saved plan>`, through `tools/gates/infra_redact.py`, which:
- replaces every run of exactly 12 digits with `<account>` (ARNs, registry hosts, and principals included);
- replaces every email address with `<email>`;
- replaces every value Terraform marks `(sensitive value)`, and every attribute named in the root's `redact.txt` (for example the alert email address's variable), with `<redacted>`;
- refuses, so prints no block, if after those rules the text still matches the gate's secret patterns: gitleaks' rules, `h4op_`, and private-key headers.

## 3. The gate's check: `infra-plan-note`

In `make check` and `tools/gates/gate`:

1. **When it applies:** if `git diff --name-only $(git merge-base main HEAD)..HEAD` touches nothing under `infra/`, the step is SKIP, with "no infra change".
2. **Which roots:** each root directory touched, plus every root when `infra/modules/` or `infra/policy/` is touched.
3. **The blocks:** the branch's note in `docs/merge-requests/` must hold, for each such root, exactly one block whose `tree` equals `git rev-parse HEAD:infra`. If not, FAIL "plan for <root> missing or made from an older infra tree; run make plan ROOT=<root> in your terminal and paste the block".
4. **Each block's text** must pass `infra_redact.py --check`: no 12-digit run, no email address, no secret pattern. If not, FAIL, naming the line number, never the value.
5. **Otherwise** PASS, naming the roots and the tree.

The step never runs Terraform. It reads git and the note, so it runs in an agent session and in the clean room alike.

## 4. `make infra-verify` and the apply (FR-007)

`make infra-verify ROOT=<root>` refuses, naming the reason, unless all of these hold:

| Check | Fails with |
|---|---|
| The checkout is `main`, clean, and HEAD is a merge of a branch whose note holds this root's block | `not_main`, `dirty`, `no_reviewed_plan` |
| The saved plan `~/.config/h4reet-ai/infra/plans/<root>-<tree>.tfplan` exists, its `tree` is `main`'s `HEAD:infra`, and its SHA-256 is the block's | `plan_missing`, `plan_stale`, `plan_not_reviewed` |
| `terraform show -no-color` of the saved plan, redacted, equals the block's text byte for byte | `plan_differs` |
| The credential audit (§7) finds nothing | `credential_finding` |
| No other apply holds the state's lock | `state_locked` (only the Author releases it, with `force-unlock`) |

On success, it prints the one command to run, and nothing else:

```text
terraform -chdir=infra/prod apply ~/.config/h4reet-ai/infra/plans/prod-3f1c2a9e….tfplan
```

**A saved plan applies exactly what it shows, or fails as stale.** Terraform refuses a saved plan whose state has moved since it was made, so a plan reviewed against an older state can't apply against a newer one.

## 5. The offline checks: `make infra-check` (FR-002, FR-004, FR-012)

Run by `make check`, PLANNED until the provider mirror exists:

1. `terraform fmt -check -recursive infra/`.
2. For each root: `terraform init -backend=false -input=false`, with `TF_CLI_CONFIG_FILE` naming a configuration whose only provider source is the filesystem mirror at `~/.local/share/h4reet/terraform-providers`. Then `terraform validate -json`.
3. **`tools/gates/infra_policy.py`** on the HCL (`python-hcl2`). Each rule fails with its ID:

| ID | Rule |
|---|---|
| T1 | every root's `provider "aws"` sets `default_tags` with `project` and `environment` |
| T2 | every resource whose type takes `tags` sets `component` (the list of taggable types is in `infra/policy/taggable.txt`) |
| T3 | `required_version` and every `required_providers` entry pin an exact version; only `hashicorp/aws` is allowed |
| T4 | no `provisioner`, no `external` or `http` data source, no `null_resource`, no `terraform_data` with a provisioner |
| T5 | IAM resources (`aws_iam_*`), budgets and budget actions (`aws_budgets_*`), SNS topics and subscriptions, CloudWatch alarms, EventBridge rules and targets, CloudFront cache, origin-request, and response-headers policies, and `aws_ce_*` appear only in the protected files: `iam*.tf`, `budgets*.tf`, `alerts*.tf`, `killswitch*.tf`, `edge-limits*.tf` (FR-012) |
| T6 | every S3 bucket has a `aws_s3_bucket_public_access_block` with all four settings on, and no bucket policy grants `"Principal": "*"` without an `aws:SourceArn` condition naming this account's distribution |
| T7 | no security group ingress from `0.0.0.0/0` or `::/0`, except the tunnel's port 2222 on the public interface's group |
| T8 | no literal 12-digit number, email address, or key-shaped string in any `.tf` file (FR-009, FR-010) |
| T9 | no `aws_ssm_parameter` resource of type `SecureString`, and no `aws_ssm_parameter` or `aws_secretsmanager_secret_version` data source anywhere: Terraform never creates or reads a secret (FR-009: "Terraform refers to the secret without reading its value"). The secret parameters' path, `/h4reet/cloud/*`, appears only in IAM policies ([env-cloud.md §1](env-cloud.md#1-the-files)) |
| T10 | `.terraform.lock.hcl` exists in each root, and its `hashicorp/aws` version is the one `.devcontainer/toolchain.vars` pins |

**In the Author's terminal, the policy runs twice, and first on the HCL.** `terraform init` and `terraform plan` run agent-written configuration with the Author's administrator session, so `make plan ROOT=<root>` runs `infra_policy.py` on the root's HCL, and the modules it uses, **before** `init`, and refuses on any finding. T4 and T3 matter most there: a provisioner, an `external` data source, or an unpinned provider is refused before Terraform can run it. Only then does it run `init` and `plan`, and then the same rules a second time on `terraform show -json <saved plan>`, which also covers what a module computes. T2 then reads the planned `tags_all`.

## 6. The apply record

`make infra-record ROOT=<root> OUTCOME=ok|failed` writes `docs/infra/applies/<YYYY-MM-DD>-<root>.md`, with `-2`, `-3`, … for a second apply that day:

```markdown
# Apply: prod, 2026-11-02

| Field | Value |
|---|---|
| Root | prod |
| Commit | 58bd2327212e90407c16b4699050bf6d8ed29bc4 (main) |
| Plan | sha256 9a0e…, tree 3f1c2a9e… (the block in docs/merge-requests/2026-11-01-feat-001-us5-cloud-vm.md) |
| Applied by | the Author, from the Author's terminal |
| Started, finished | 2026-11-02T14:12:03Z, 2026-11-02T14:15:48Z |
| Outcome | ok |
| Terraform | <version> |

## Resources changed

| Address | Action |
|---|---|
| aws_instance.vm | create |
| aws_ebs_volume.meter | create |
```

- **What it holds:** addresses and actions only, from the plan's JSON, with no attribute values, so the record carries no secret, account ID, or address (FR-007, FR-010).
- **What `OUTCOME=failed` adds:** Terraform's exit status and the addresses the state now holds that the plan named. That is what changed before the failure, read from `terraform show -json` of the state after the failed apply.
- **How it reaches `main`:** `infra-record` commits the file on a new branch `ops/apply-<root>-<YYYY-MM-DD>` from `main`, with the message `ops: apply <root> at <commit12>`, and prints the merge for the Author. The note for such a branch is the record itself; the gate checks it holds the fields above **(interview question 5)**.
- **The bootstrap's first apply** records the state migration too: `terraform init -migrate-state`, run by the Author, with its outcome (FR-003).
- **A name-server change** at the registrar gets a record too: `docs/infra/applies/<date>-dns-delegation.md`, written by hand from the same template, with the root `dns-delegation` and no plan.

## 7. The credential audit (FR-008, SC-004)

`infra/lambdas/credential_audit/` runs weekly, by EventBridge, on Mondays at 06:00 UTC, with a read-only role. `make infra-audit` runs the same code in the Author's terminal, and `make infra-verify` runs it before every apply.

| Check | Finding when |
|---|---|
| IAM users | any IAM user has an access key, active or inactive (`iam:ListUsers`, `iam:ListAccessKeys`) |
| The root user | `iam:GetAccountSummary`'s `AccountAccessKeysPresent` isn't 0 |
| Roles' trust | a role trusts an AWS account other than this one, or a principal other than an AWS service, this account's Identity Center, or this account's own roles |
| OIDC providers | any exists before publication (`iam:ListOpenIDConnectProviders`; FR-008: "No CI identity SHALL exist in the account before publication") |
| Spec 000's hand-made identity | after group 4's cutover, the Identity Center user or its permission set still exists (FR-013) |

**The result** is one JSON object, logged, and written to `s3://<release bucket>/audits/credential/<YYYY-MM-DD>.json`. Its fields are in [data-model.md §6.6](../data-model.md#66-the-credential-audit-result). It names each finding's resource by name, never a key's ID. A finding alerts on both channels ([aws-alerts.md §2](aws-alerts.md#2-the-alerts-and-their-messages)). SC-004 reads the weekly results.
