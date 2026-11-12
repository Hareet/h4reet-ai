# fix/001-shared-account: one account, shared with the Author's other work

## Status: built, verified, and reviewed twice (the first form, then this second form; every finding fixed below); your patch P-S1, your allowlist file, and the bootstrap's second plan go on `fix/001-shared-account-p`; not merged; nothing applied

## What changed and why

At T030, the bootstrap's verify refused with `credential_finding`. The credential audit found your other work in the account:
- six IAM users holding access keys;
- a GitHub Actions OIDC provider;
- a deploy role trusting a principal outside the account.

The server budget would also have counted that work's costs, and its action stops EC2.

Your answers:
- 2026-11-11: "Share it, scope the checks" (a new account was the recommendation);
- 2026-11-11, on `h4reet-runtime`: "Allow it too";
- 2026-11-12, on the names: "Keep them out of the repo".

They're recorded in spec.md's Assumptions, "One account, shared with the Author's other work", and in ADR 0047.

| What | Where |
|---|---|
| The audit reads your allowlist: your file in the terminal, your SecureString in the function. Allowed findings are listed apart, not failing. Four kinds only, never this project's names. Any other line is a finding of its own, named by its line number | `infra/lambdas/credential_audit/audit.py` |
| The function's environment names the parameter, and `secrets-check` lists it | `infra/account/lambdas.tf`, `infra/parameters.txt` |
| P-S1, for your hand. `h4-server-month` and `h4-rehearsal-server` count every cost tagged `project = h4reet-ai` except Bedrock's. The audit's role may read `/h4reet/audit/IAM_ALLOW` | `docs/merge-requests/2026-11-12-fix-001-ps1-shared-account.patch` |
| Tests first, RED on main | `test_audit.py`, `test_account.py` (a new check and two fixtures), `test_bootstrap.py` (a fixture) |
| Records | spec.md (Assumptions, FR-021, SC-002, SC-004, scenario 5), plan.md §16 and its notes 6 and 9, tasks.md T150 to T154, research.md R-22, quickstart.md, contracts/aws-alerts.md, both runbooks, ADR 0047 and its index row |

None of your other work's identities is named in the repository or in this branch's history.

## Acceptance

- The audit passes on the account as it stands, once your allowlist holds your eight identities, listing them under `allowed`. A root key, the laptop's identity, the handover's policies, or a line naming this project's own identity still fail it.
- `h4-server-month` counts only the project's tagged costs, without Bedrock's, and its rehearsal reads the same filter.
- The rest of spec 001 is unchanged.

## Review

**The first form's review, 2026-11-12, of fa3cb611, by an agent that wrote none of it: no blocker.** In its words, the allowlist "holds": four kinds only, refused lines named by number, both paths reading the same list, failing closed. That first form's history was replaced with this one, which holds no names.

| Finding | Done |
|---|---|
| I1: `h4-rehearsal-server` still read the whole account, so its rehearsal couldn't prove the real filter | P-S1 puts it on the same filter. `test_account.py` checks it, with the fixture `rehearsal-server-whole-account` |
| I2: the deviation named only FR-008, FR-021 and spec 000's FR-013 | Also named: Principle IV, SC-002, SC-004 and scenario 5. Also updated: quickstart.md, plan.md's notes 6 and 9 and its budget line, tasks.md's T029 line, contracts/aws-alerts.md, and both runbooks |
| I3: only your plan can confirm the provider takes `and` with a nested `not`; the tag key; the volumes' tags | Named in P-S1's preamble and ADR 0047. T153 compares the budget's actual with Cost Explorer. T154 checks EC2's volumes and address in group 7 |
| I4: the allowlist can't tell an inactive key from an active one | ADR 0047's Consequences and the credential-audit runbook say so |
| Names in history, raised as a question | Your answer was "Keep them out of the repo". The list moved to your file and your SecureString, and this branch was rebuilt from main |
| Nits: the server check's message; the term blocks' sizes unchecked; the credential-audit runbook; this project's names allowable; plan.md not in the code's commit | The message is "doesn't count every cost of this project but Bedrock's". Each term block is held to its own two lines. The runbook lists `iam_user_present`, `allowlist_entry_refused` and the list. Names starting `h4-` or `AWSReservedSSO_` are refused. plan.md changes in the GREEN commit |

**The second form's review, 2026-11-12, of ca9ba40f, by an agent that wrote none of it: no blocker.** It found:
- the terminal path correct;
- P-S1's hunks matching main, and the grant exactly one parameter, with no `kms:Decrypt` needed under `aws/ssm`;
- the tests RED before and GREEN after, nothing loosened;
- no name in the branch's history.

| Finding | Done |
|---|---|
| I-1: SSM's code for a missing parameter, `ParameterNotFound`, wasn't in `NOT_FOUND`. The weekly run would have died before the audit, storing nothing and alerting no one, not "no allowlist" as documented. T040's steps didn't write the parameter | RED: 9ea153b6's test. GREEN: c33eb787 adds the code. T040's step 3 now writes `/h4reet/audit/IAM_ALLOW` before the function's first run |
| I-2: spec.md's Clarifications reading, FR-022, Key Entities, and the Assumption "The server budget's scope" still said every cost of the account. FR-022 wasn't named | Each carries an amendment pointer. FR-022 is named in the Assumption and in ADR 0047 |
| Nits | 1, tasks.md's doubled heading: fixed. 2, killswitch.tf's header comment: P-S1 rewrites it. 3, test_bootstrap.py's docstring: updated. 4, the role's read is held exactly: every statement that could read a parameter must be the one `ssm:GetParameter` on the exact ARN, with the fixture `audit-reads-every-parameter`. 5, the first form's commits are unreachable locally and never pushed |

## Verification

- **RED, on main's code with this branch's tests:** `infra/test` and `infra/lambdas` gave 106 failed and 170 passed. Every failure is the missing `parse_allow` or `terminal_allow`, or a root no longer clean on the budgets' and parameter's checks.
- **GREEN, on an export of the branch with P-S1 applied:** `infra/test`, `infra/lambdas`, and `scripts/infra` gave 387 passed, and 389 after the second review's fixes. One test failed because of the sandbox: `test_infra_check_runs_the_policy_then_waits_for_terraform` can't `mktemp` in this sandbox's read-only `/tmp`.
- **P-S1** was built from plain copies: each of main's three files by `git show`, edited, then `diff -u`. It dry-runs and applies cleanly, and the three resulting files match their edited copies byte for byte. `terraform fmt -check` passes on all three.
- **Lint:** ruff check and ruff format pass, and Prettier passes on everything changed.

## For the Author

The runbook's step 7B-1 has the lines:
1. **Your allowlist file,** `~/.config/h4reet-ai/infra/iam-allow.txt`, mode 0600, from the lines the runbook gives.
2. **Your branch,** `fix/001-shared-account-p` from this branch's tip, with P-S1 applied and committed.
3. **The bootstrap's plan again,** from a clone of your branch. Its block goes under "The plan block (T153)" below, inserted by the runbook's script, and is committed on your branch. Read it: `h4-server-month`'s filter shows the `not` and the `project` tag.
4. **The gate** on your branch, then the merge.
5. **Then T030's apply** (runbook 7B). At T040, your SecureString `/h4reet/audit/IAM_ALLOW` gets the same lines.

### The plan block (T153)

<!-- h4-plan root=bootstrap tree=aacec92727116c5a426c4631e8827236c2006d76 sha256=30bd939b8ebee19d4fc2c6d318dbfa03b7e369c2bd2c2b434cf623ba904b7d41 terraform=1.17.1 made=2026-11-12T04:50:03Z -->
```terraform-plan

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
 <= read (data resources)

Terraform will perform the following actions:

  # data.aws_iam_policy_document.alerts will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "alerts" {
      + id            = (known after apply)
      + json          = (known after apply)
      + minified_json = (known after apply)

      + statement {
          + actions   = [
              + "sns:Publish",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "Budgets"

          + condition {
              + test     = "StringEquals"
              + values   = [
                  + "<account>",
                ]
              + variable = "aws:SourceAccount"
            }

          + principals {
              + identifiers = [
                  + "budgets.amazonaws.com",
                ]
              + type        = "Service"
            }
        }
      + statement {
          + actions   = [
              + "sns:Publish",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "CostAnomalyDetection"

          + condition {
              + test     = "StringEquals"
              + values   = [
                  + "<account>",
                ]
              + variable = "aws:SourceAccount"
            }

          + principals {
              + identifiers = [
                  + "costalerts.amazonaws.com",
                ]
              + type        = "Service"
            }
        }
    }

  # data.aws_iam_policy_document.state will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "state" {
      + id            = (known after apply)
      + json          = (known after apply)
      + minified_json = (known after apply)

      + statement {
          + actions   = [
              + "s3:*",
            ]
          + effect    = "Deny"
          + resources = [
              + (known after apply),
              + (known after apply),
            ]
          + sid       = "TlsOnly"

          + condition {
              + test     = "Bool"
              + values   = [
                  + "false",
                ]
              + variable = "aws:SecureTransport"
            }

          + principals {
              + identifiers = [
                  + "*",
                ]
              + type        = "AWS"
            }
        }
    }

  # aws_budgets_budget.model_day will be created
  + resource "aws_budgets_budget" "model_day" {
      + account_id        = (known after apply)
      + arn               = (known after apply)
      + budget_type       = "COST"
      + id                = (known after apply)
      + limit_amount      = "5"
      + limit_unit        = "USD"
      + name              = "h4-model-day"
      + name_prefix       = (known after apply)
      + tags              = {
          + "component" = "model-spend"
        }
      + tags_all          = {
          + "component"   = "model-spend"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + time_period_end   = "2087-06-15_00:00"
      + time_period_start = (known after apply)
      + time_unit         = "DAILY"

      + cost_filter {
          + name   = "Service"
          + values = [
              + "Claude Haiku 5.5 (Bedrock Edition)",
            ]
        }

      + cost_types {
          + include_credit             = false
          + include_discount           = true
          + include_other_subscription = true
          + include_recurring          = true
          + include_refund             = true
          + include_subscription       = true
          + include_support            = true
          + include_tax                = true
          + include_upfront            = true
          + use_amortized              = false
          + use_blended                = false
        }

      + notification {
          + comparison_operator        = "GREATER_THAN"
          + notification_type          = "ACTUAL"
          + subscriber_email_addresses = []
          + subscriber_sns_topic_arns  = (known after apply)
          + threshold                  = 100
          + threshold_type             = "PERCENTAGE"
        }
      + notification {
          + comparison_operator        = "GREATER_THAN"
          + notification_type          = "ACTUAL"
          + subscriber_email_addresses = []
          + subscriber_sns_topic_arns  = (known after apply)
          + threshold                  = 70
          + threshold_type             = "PERCENTAGE"
        }
    }

  # aws_budgets_budget.model_month will be created
  + resource "aws_budgets_budget" "model_month" {
      + account_id        = (known after apply)
      + arn               = (known after apply)
      + budget_type       = "COST"
      + id                = (known after apply)
      + limit_amount      = "20"
      + limit_unit        = "USD"
      + name              = "h4-model-month"
      + name_prefix       = (known after apply)
      + tags              = {
          + "component" = "model-spend"
        }
      + tags_all          = {
          + "component"   = "model-spend"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + time_period_end   = "2087-06-15_00:00"
      + time_period_start = (known after apply)
      + time_unit         = "MONTHLY"

      + cost_filter {
          + name   = "Service"
          + values = [
              + "Claude Haiku 5.5 (Bedrock Edition)",
            ]
        }

      + cost_types {
          + include_credit             = false
          + include_discount           = true
          + include_other_subscription = true
          + include_recurring          = true
          + include_refund             = true
          + include_subscription       = true
          + include_support            = true
          + include_tax                = true
          + include_upfront            = true
          + use_amortized              = false
          + use_blended                = false
        }

      + notification {
          + comparison_operator        = "GREATER_THAN"
          + notification_type          = "ACTUAL"
          + subscriber_email_addresses = []
          + subscriber_sns_topic_arns  = (known after apply)
          + threshold                  = 100
          + threshold_type             = "PERCENTAGE"
        }
      + notification {
          + comparison_operator        = "GREATER_THAN"
          + notification_type          = "ACTUAL"
          + subscriber_email_addresses = []
          + subscriber_sns_topic_arns  = (known after apply)
          + threshold                  = 70
          + threshold_type             = "PERCENTAGE"
        }
    }

  # aws_budgets_budget.server_month will be created
  + resource "aws_budgets_budget" "server_month" {
      + account_id        = (known after apply)
      + arn               = (known after apply)
      + budget_type       = "COST"
      + id                = (known after apply)
      + limit_amount      = "45"
      + limit_unit        = "USD"
      + metrics           = [
          + "UnblendedCost",
        ]
      + name              = "h4-server-month"
      + name_prefix       = (known after apply)
      + tags              = {
          + "component" = "server-spend"
        }
      + tags_all          = {
          + "component"   = "server-spend"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + time_period_end   = "2087-06-15_00:00"
      + time_period_start = (known after apply)
      + time_unit         = "MONTHLY"

      + cost_filter (known after apply)

      + cost_types (known after apply)

      + filter_expression {
          + and {
              + not {
                  + dimensions {
                      + key    = "SERVICE"
                      + values = [
                          + "Claude Haiku 5.5 (Bedrock Edition)",
                        ]
                    }
                }
            }
          + and {
              + tags {
                  + key    = "project"
                  + values = [
                      + "h4reet-ai",
                    ]
                }
            }
        }

      + notification {
          + comparison_operator        = "GREATER_THAN"
          + notification_type          = "ACTUAL"
          + subscriber_email_addresses = []
          + subscriber_sns_topic_arns  = (known after apply)
          + threshold                  = 100
          + threshold_type             = "PERCENTAGE"
        }
      + notification {
          + comparison_operator        = "GREATER_THAN"
          + notification_type          = "ACTUAL"
          + subscriber_email_addresses = []
          + subscriber_sns_topic_arns  = (known after apply)
          + threshold                  = 70
          + threshold_type             = "PERCENTAGE"
        }
    }

  # aws_ce_anomaly_monitor.account will be created
  + resource "aws_ce_anomaly_monitor" "account" {
      + arn               = (known after apply)
      + id                = (known after apply)
      + monitor_dimension = "SERVICE"
      + monitor_type      = "DIMENSIONAL"
      + name              = "h4-anomaly"
      + tags              = {
          + "component" = "anomaly"
        }
      + tags_all          = {
          + "component"   = "anomaly"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
    }

  # aws_ce_anomaly_subscription.account will be created
  + resource "aws_ce_anomaly_subscription" "account" {
      + account_id       = (known after apply)
      + arn              = (known after apply)
      + frequency        = "IMMEDIATE"
      + id               = (known after apply)
      + monitor_arn_list = (known after apply)
      + name             = "h4-anomaly-at-once"
      + tags             = {
          + "component" = "anomaly"
        }
      + tags_all         = {
          + "component"   = "anomaly"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + subscriber {
          + address = (known after apply)
          + type    = "SNS"
        }

      + threshold_expression {
          + dimension {
              + key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
              + match_options = [
                  + "GREATER_THAN_OR_EQUAL",
                ]
              + values        = [
                  + "1",
                ]
            }
        }
    }

  # aws_s3_bucket.state will be created
  + resource "aws_s3_bucket" "state" {
      + acceleration_status         = (known after apply)
      + acl                         = (known after apply)
      + arn                         = (known after apply)
      + bucket                      = <redacted>
      + bucket_domain_name          = (known after apply)
      + bucket_namespace            = (known after apply)
      + bucket_prefix               = (known after apply)
      + bucket_region               = (known after apply)
      + bucket_regional_domain_name = (known after apply)
      + force_destroy               = false
      + hosted_zone_id              = (known after apply)
      + id                          = (known after apply)
      + object_lock_enabled         = (known after apply)
      + policy                      = (known after apply)
      + region                      = "us-east-1"
      + request_payer               = (known after apply)
      + tags                        = {
          + "component" = "terraform-state"
        }
      + tags_all                    = {
          + "component"   = "terraform-state"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + website_domain              = (known after apply)
      + website_endpoint            = (known after apply)

      + cors_rule (known after apply)

      + grant (known after apply)

      + lifecycle_rule (known after apply)

      + logging (known after apply)

      + object_lock_configuration (known after apply)

      + replication_configuration (known after apply)

      + server_side_encryption_configuration (known after apply)

      + versioning (known after apply)

      + website (known after apply)
    }

  # aws_s3_bucket_ownership_controls.state will be created
  + resource "aws_s3_bucket_ownership_controls" "state" {
      + bucket = <redacted>
      + id     = (known after apply)
      + region = "us-east-1"

      + rule {
          + object_ownership = "BucketOwnerEnforced"
        }
    }

  # aws_s3_bucket_policy.state will be created
  + resource "aws_s3_bucket_policy" "state" {
      + bucket = <redacted>
      + id     = (known after apply)
      + policy = (known after apply)
      + region = "us-east-1"
    }

  # aws_s3_bucket_public_access_block.state will be created
  + resource "aws_s3_bucket_public_access_block" "state" {
      + block_public_acls       = true
      + block_public_policy     = true
      + bucket                  = <redacted>
      + id                      = (known after apply)
      + ignore_public_acls      = true
      + region                  = "us-east-1"
      + restrict_public_buckets = true
    }

  # aws_s3_bucket_server_side_encryption_configuration.state will be created
  + resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
      + bucket = <redacted>
      + id     = (known after apply)
      + region = "us-east-1"

      + rule {
          + blocked_encryption_types = (known after apply)
          + bucket_key_enabled       = (known after apply)

          + apply_server_side_encryption_by_default {
              + kms_master_key_id = (known after apply)
              + sse_algorithm     = "AES256"
            }
        }
    }

  # aws_s3_bucket_versioning.state will be created
  + resource "aws_s3_bucket_versioning" "state" {
      + bucket = <redacted>
      + id     = (known after apply)
      + region = "us-east-1"

      + versioning_configuration {
          + mfa_delete = (known after apply)
          + status     = "Enabled"
        }
    }

  # aws_sns_topic.alerts will be created
  + resource "aws_sns_topic" "alerts" {
      + arn                         = (known after apply)
      + beginning_archive_time      = (known after apply)
      + content_based_deduplication = false
      + fifo_throughput_scope       = (known after apply)
      + fifo_topic                  = false
      + id                          = (known after apply)
      + maximum_message_size        = (known after apply)
      + name                        = "h4-alerts"
      + name_prefix                 = (known after apply)
      + owner                       = (known after apply)
      + policy                      = (known after apply)
      + region                      = "us-east-1"
      + signature_version           = (known after apply)
      + tags                        = {
          + "component" = "alerts"
        }
      + tags_all                    = {
          + "component"   = "alerts"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + tracing_config              = (known after apply)
    }

  # aws_sns_topic_policy.alerts will be created
  + resource "aws_sns_topic_policy" "alerts" {
      + arn    = (known after apply)
      + id     = (known after apply)
      + owner  = (known after apply)
      + policy = (known after apply)
      + region = "us-east-1"
    }

  # aws_sns_topic_subscription.email will be created
  + resource "aws_sns_topic_subscription" "email" {
      + arn                             = (known after apply)
      + confirmation_timeout_in_minutes = 1
      + confirmation_was_authenticated  = (known after apply)
      + endpoint                        = <redacted>
      + endpoint_auto_confirms          = false
      + filter_policy_scope             = (known after apply)
      + id                              = (known after apply)
      + owner_id                        = (known after apply)
      + pending_confirmation            = (known after apply)
      + protocol                        = "email"
      + raw_message_delivery            = false
      + region                          = "us-east-1"
      + topic_arn                       = (known after apply)
    }

Plan: 14 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + alerts_topic_arn = (known after apply)
  + state_bucket     = <redacted>
```
<!-- /h4-plan -->

The account root's block for this tree comes with T037, once the bootstrap's apply has made its state bucket (spec.md's Assumption "One gate for groups 1 to 4"). So this branch's gate fails infra-plan-note for account alone, and its hand-merge guard accepts only that.

## Cost and data-flow impact

- **Cost:** no new cost. One more standard SecureString is free.
- **Flow:** the weekly function reads one more Parameter Store value inside the account, so no new flow leaves anything.
- **The server budget:** it counts less of the account, only this project's tagged costs, so your other work never stops EC2.

## Backlog

- **Least privilege between this project and your other work rests on IAM** (ADR 0047). The audit doesn't read the allowed identities' policies, so keeping them away from this project's resources is yours.
- **Your file and your SecureString must hold the same lines.** Nothing in the repository can compare them.
- **The weekly audit has no failure alarm of its own.** An AWS error other than a missing parameter, such as access denied or a key of your own, fails the run in its logs without an alert. That predates this branch. For W1 or Close: an Errors alarm on `h4-credential-audit` to `h4-alerts`.
- **For W1's regrouping commit:** record T027's `metrics` finding beside T027 in tasks.md (plan.md's note 6 now has it).
