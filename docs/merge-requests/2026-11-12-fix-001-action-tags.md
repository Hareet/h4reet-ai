# fix/001-action-tags: the budget actions tagged, and T037's account block

## Status: built and verified; review to come; your patch P-A1 and the account's plan go on `fix/001-action-tags-p`; not merged; the bootstrap applied (2026-11-12), the account not

## What changed and why

The bootstrap is applied: `docs/infra/applies/2026-11-12-bootstrap.md`, on `ops/apply-bootstrap-2026-11-12`, which this branch builds on. So one gate takes the record, this fix, and T037's account block.

Your T037 plan, `make plan ROOT=account`, then refused:

    T2 plan:0 aws_budgets_budget_action.model: tags_all lacks component

AWS lets budget actions be tagged, so the saved plan's policy check (rule T2) asks for `component`. The policy's source list of taggable types, `TAGGABLE` in `tools/gates/infra_policy.py`, doesn't name `aws_budgets_budget_action`. So neither `make check`'s source check nor the tests caught it. The two rehearsal actions had the same gap, hidden while `local.rehearsal` is false.

| What | Where |
|---|---|
| The tag check covers budget actions too, with a fixture that fails it. The two existing action fixtures now carry the tag, so each still fails only on its own defect | `infra/test/test_account.py`, `infra/test/fixtures/account/` |
| P-A1, for your hand: `component` on the three actions (`kill-switch`, `rehearsal`, `rehearsal`) | `docs/merge-requests/2026-11-12-fix-001-pa1-action-tags.patch` |
| Records | tasks.md T155; plan.md §16 |

## Verification

- **RED, on this branch without P-A1:** `infra/test/test_account.py`'s fixture tests fail. The root names `tags: aws_budgets_budget_action.model sets no component` and the same for `rehearsal_model` and `rehearsal_server`.
- **GREEN, on an export with P-A1 applied:** `infra/test`, `infra/lambdas`, and `scripts/infra` give 390 passed. One fails because of the sandbox: `test_infra_check_runs_the_policy_then_waits_for_terraform` can't `mktemp` in its read-only `/tmp`. `tools/gates/infra_policy.py --root .` passes, 15 files.
- **P-A1:** built from a plain copy of main's `killswitch.tf` (`git show`), edited, then `diff -u`. It applies cleanly, and the resulting file matches the edited copy byte for byte. `terraform fmt -check` passes.

## For the Author

1. **Your branch,** `fix/001-action-tags-p` from this branch's tip, with P-A1 applied and committed.
2. **T037, the account's plan,** from a clone of your branch. Its block goes under "The plan block (T037)" below, inserted by the runbook's script, and is committed on your branch. Read it, as group 4's note, section 4, says:
   - the permission set "will be imported", with only its tags and description changing;
   - no function yet;
   - the rest as listed there;
   - no account ID, address, or email.
3. **The gate,** then its merge, behind the guard.
4. **Then T040,** the account's apply, in its parts (the runbook).

### The plan block (T037)

<!-- h4-plan root=account tree=8a8477de767df19fddbc20eec200cd5d4352f922 sha256=8c08aa868ec0e1df5f93d0bf43314d63081264a828641e8a051cdc22958ba68e terraform=1.17.1 made=2026-11-12T05:31:57Z -->
```terraform-plan

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
  ~ update in-place
 <= read (data resources)

Terraform will perform the following actions:

  # data.aws_iam_policy_document.alert_bridge will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "alert_bridge" {
      + id            = (known after apply)
      + json          = (known after apply)
      + minified_json = (known after apply)

      + statement {
          + actions   = [
              + "logs:CreateLogStream",
              + "logs:PutLogEvents",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "ItsLog"
        }
      + statement {
          + actions   = [
              + "ssm:GetParameter",
            ]
          + effect    = "Allow"
          + resources = [
              + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/alerts/TELEGRAM_BOT_TOKEN",
              + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/alerts/TELEGRAM_CHAT_ID",
            ]
          + sid       = "TheBotsTokenAndTheChat"
        }
      + statement {
          + actions   = [
              + "sqs:SendMessage",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "ItsFailureQueue"
        }
    }

  # data.aws_iam_policy_document.credential_audit will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "credential_audit" {
      + id            = (known after apply)
      + json          = (known after apply)
      + minified_json = (known after apply)

      + statement {
          + actions   = [
              + "logs:CreateLogStream",
              + "logs:PutLogEvents",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "ItsLog"
        }
      + statement {
          + actions   = [
              + "iam:GetAccountSummary",
              + "iam:GetPolicy",
              + "iam:GetPolicyVersion",
              + "iam:GetRole",
              + "iam:GetRolePolicy",
              + "iam:ListAccessKeys",
              + "iam:ListAttachedRolePolicies",
              + "iam:ListOpenIDConnectProviders",
              + "iam:ListRolePolicies",
              + "iam:ListRoles",
              + "iam:ListUsers",
            ]
          + effect    = "Allow"
          + resources = [
              + "*",
            ]
          + sid       = "ReadIam"
        }
      + statement {
          + actions   = [
              + "sso:DescribePermissionSet",
              + "sso:GetInlinePolicyForPermissionSet",
              + "sso:ListCustomerManagedPolicyReferencesInPermissionSet",
              + "sso:ListInstances",
              + "sso:ListManagedPoliciesInPermissionSet",
              + "sso:ListPermissionSets",
              + "sso:ListTagsForResource",
            ]
          + effect    = "Allow"
          + resources = [
              + "*",
            ]
          + sid       = "ReadIdentityCenter"
        }
      + statement {
          + actions   = [
              + "s3:PutObject",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "StoreItsResult"
        }
      + statement {
          + actions   = [
              + "sns:Publish",
            ]
          + effect    = "Allow"
          + resources = [
              + "arn:aws:sns:us-east-1:<account>:h4-alerts",
            ]
          + sid       = "AlertAFinding"
        }
      + statement {
          + actions   = [
              + "ssm:GetParameter",
            ]
          + effect    = "Allow"
          + resources = [
              + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/audit/IAM_ALLOW",
            ]
          + sid       = "TheAuthorsAllowlist"
        }
    }

  # data.aws_iam_policy_document.laptop_assume will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "laptop_assume" {
      + id            = (known after apply)
      + json          = (known after apply)
      + minified_json = (known after apply)

      + statement {
          + actions   = [
              + "sts:AssumeRole",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "AssumeTheBedrockRole"
        }
    }

  # data.aws_iam_policy_document.model_action will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "model_action" {
      + id            = (known after apply)
      + json          = (known after apply)
      + minified_json = (known after apply)

      + statement {
          + actions   = [
              + "iam:AttachRolePolicy",
              + "iam:DetachRolePolicy",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "ThatPolicyOnThoseRoles"

          + condition {
              + test     = "ArnEquals"
              + values   = [
                  + (known after apply),
                ]
              + variable = "iam:PolicyARN"
            }
        }
    }

  # data.aws_iam_policy_document.probe will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "probe" {
      + id            = (known after apply)
      + json          = (known after apply)
      + minified_json = (known after apply)

      + statement {
          + actions   = [
              + "logs:CreateLogStream",
              + "logs:PutLogEvents",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "ItsLog"
        }
    }

  # data.aws_iam_policy_document.releases will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "releases" {
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
                  + "arn:aws:iam::<account>:root",
                ]
              + type        = "AWS"
            }
        }
    }

  # aws_budgets_budget_action.model will be created
  + resource "aws_budgets_budget_action" "model" {
      + account_id         = (known after apply)
      + action_id          = (known after apply)
      + action_type        = "APPLY_IAM_POLICY"
      + approval_model     = "AUTOMATIC"
      + arn                = (known after apply)
      + budget_name        = "h4-model-month"
      + execution_role_arn = (known after apply)
      + id                 = (known after apply)
      + notification_type  = "ACTUAL"
      + status             = (known after apply)
      + tags               = {
          + "component" = "kill-switch"
        }
      + tags_all           = {
          + "component"   = "kill-switch"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + action_threshold {
          + action_threshold_type  = "PERCENTAGE"
          + action_threshold_value = 100
        }

      + definition {
          + iam_action_definition {
              + policy_arn = (known after apply)
              + roles      = [
                  + "h4-laptop-bedrock",
                ]
            }
        }

      + subscriber {
          + address           = "arn:aws:sns:us-east-1:<account>:h4-alerts"
          + subscription_type = "SNS"
        }
    }

  # aws_cloudwatch_event_rule.credential_audit will be created
  + resource "aws_cloudwatch_event_rule" "credential_audit" {
      + arn                 = (known after apply)
      + description         = "h4-credential-audit, weekly (spec 001 FR-008)"
      + event_bus_name      = "default"
      + force_destroy       = false
      + id                  = (known after apply)
      + name                = "h4-credential-audit-weekly"
      + name_prefix         = (known after apply)
      + region              = "us-east-1"
      + schedule_expression = "cron(0 6 ? * MON *)"
      + state               = "ENABLED"
      + tags                = {
          + "component" = "credential-audit"
        }
      + tags_all            = {
          + "component"   = "credential-audit"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
    }

  # aws_cloudwatch_event_rule.probe will be created
  + resource "aws_cloudwatch_event_rule" "probe" {
      + arn                 = (known after apply)
      + description         = "h4-probe once a minute; enabled in group 8 (spec 001 FR-061)"
      + event_bus_name      = "default"
      + force_destroy       = false
      + id                  = (known after apply)
      + name                = "h4-probe-every-minute"
      + name_prefix         = (known after apply)
      + region              = "us-east-1"
      + schedule_expression = "rate(1 minute)"
      + state               = "DISABLED"
      + tags                = {
          + "component" = "probe"
        }
      + tags_all            = {
          + "component"   = "probe"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
    }

  # aws_cloudwatch_log_group.alert_bridge will be created
  + resource "aws_cloudwatch_log_group" "alert_bridge" {
      + arn                         = (known after apply)
      + deletion_protection_enabled = (known after apply)
      + id                          = (known after apply)
      + log_group_class             = (known after apply)
      + name                        = "/aws/lambda/h4-alert-bridge"
      + name_prefix                 = (known after apply)
      + region                      = "us-east-1"
      + retention_in_days           = 30
      + skip_destroy                = false
      + tags                        = {
          + "component" = "alert-bridge"
        }
      + tags_all                    = {
          + "component"   = "alert-bridge"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
    }

  # aws_cloudwatch_log_group.credential_audit will be created
  + resource "aws_cloudwatch_log_group" "credential_audit" {
      + arn                         = (known after apply)
      + deletion_protection_enabled = (known after apply)
      + id                          = (known after apply)
      + log_group_class             = (known after apply)
      + name                        = "/aws/lambda/h4-credential-audit"
      + name_prefix                 = (known after apply)
      + region                      = "us-east-1"
      + retention_in_days           = 90
      + skip_destroy                = false
      + tags                        = {
          + "component" = "credential-audit"
        }
      + tags_all                    = {
          + "component"   = "credential-audit"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
    }

  # aws_cloudwatch_log_group.probe will be created
  + resource "aws_cloudwatch_log_group" "probe" {
      + arn                         = (known after apply)
      + deletion_protection_enabled = (known after apply)
      + id                          = (known after apply)
      + log_group_class             = (known after apply)
      + name                        = "/aws/lambda/h4-probe"
      + name_prefix                 = (known after apply)
      + region                      = "us-east-1"
      + retention_in_days           = 30
      + skip_destroy                = false
      + tags                        = {
          + "component" = "probe"
        }
      + tags_all                    = {
          + "component"   = "probe"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
    }

  # aws_ecr_lifecycle_policy.lambda["h4-alert-bridge"] will be created
  + resource "aws_ecr_lifecycle_policy" "lambda" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten images"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber = 10
                          + countType   = "imageCountMoreThan"
                          + tagStatus   = "any"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4-alert-bridge"
    }

  # aws_ecr_lifecycle_policy.lambda["h4-credential-audit"] will be created
  + resource "aws_ecr_lifecycle_policy" "lambda" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten images"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber = 10
                          + countType   = "imageCountMoreThan"
                          + tagStatus   = "any"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4-credential-audit"
    }

  # aws_ecr_lifecycle_policy.lambda["h4-probe"] will be created
  + resource "aws_ecr_lifecycle_policy" "lambda" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten images"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber = 10
                          + countType   = "imageCountMoreThan"
                          + tagStatus   = "any"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4-probe"
    }

  # aws_ecr_lifecycle_policy.stack["clickhouse"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/clickhouse"
    }

  # aws_ecr_lifecycle_policy.stack["edge"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/edge"
    }

  # aws_ecr_lifecycle_policy.stack["gateway"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/gateway"
    }

  # aws_ecr_lifecycle_policy.stack["grafana"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/grafana"
    }

  # aws_ecr_lifecycle_policy.stack["langfuse-db"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/langfuse-db"
    }

  # aws_ecr_lifecycle_policy.stack["langfuse-web"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/langfuse-web"
    }

  # aws_ecr_lifecycle_policy.stack["langfuse-worker"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/langfuse-worker"
    }

  # aws_ecr_lifecycle_policy.stack["loki"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/loki"
    }

  # aws_ecr_lifecycle_policy.stack["otel-collector"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/otel-collector"
    }

  # aws_ecr_lifecycle_policy.stack["prometheus"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/prometheus"
    }

  # aws_ecr_lifecycle_policy.stack["seaweedfs"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/seaweedfs"
    }

  # aws_ecr_lifecycle_policy.stack["valkey"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/valkey"
    }

  # aws_ecr_lifecycle_policy.stack["web"] will be created
  + resource "aws_ecr_lifecycle_policy" "stack" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + rules = [
                  + {
                      + action       = {
                          + type = "expire"
                        }
                      + description  = "Keep the newest ten tagged releases"
                      + rulePriority = 1
                      + selection    = {
                          + countNumber    = 10
                          + countType      = "imageCountMoreThan"
                          + tagPatternList = [
                              + "*",
                            ]
                          + tagStatus      = "tagged"
                        }
                    },
                ]
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4reet/web"
    }

  # aws_ecr_repository.lambda["h4-alert-bridge"] will be created
  + resource "aws_ecr_repository" "lambda" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4-alert-bridge"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.lambda["h4-credential-audit"] will be created
  + resource "aws_ecr_repository" "lambda" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4-credential-audit"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.lambda["h4-probe"] will be created
  + resource "aws_ecr_repository" "lambda" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4-probe"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["clickhouse"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/clickhouse"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["edge"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/edge"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["gateway"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/gateway"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["grafana"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/grafana"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["langfuse-db"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/langfuse-db"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["langfuse-web"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/langfuse-web"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["langfuse-worker"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/langfuse-worker"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["loki"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/loki"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["otel-collector"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/otel-collector"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["prometheus"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/prometheus"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["seaweedfs"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/seaweedfs"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["valkey"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/valkey"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository.stack["web"] will be created
  + resource "aws_ecr_repository" "stack" {
      + arn                  = (known after apply)
      + id                   = (known after apply)
      + image_tag_mutability = "IMMUTABLE"
      + name                 = "h4reet/web"
      + region               = "us-east-1"
      + registry_id          = (known after apply)
      + repository_url       = (known after apply)
      + tags                 = {
          + "component" = "registry"
        }
      + tags_all             = {
          + "component"   = "registry"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + encryption_configuration {
          + encryption_type = "AES256"
          + kms_key         = (known after apply)
        }

      + image_scanning_configuration {
          + scan_on_push = true
        }
    }

  # aws_ecr_repository_policy.lambda["h4-alert-bridge"] will be created
  + resource "aws_ecr_repository_policy" "lambda" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + Statement = [
                  + {
                      + Action    = [
                          + "ecr:GetDownloadUrlForLayer",
                          + "ecr:BatchGetImage",
                        ]
                      + Condition = {
                          + ArnLike = {
                              + "aws:SourceArn" = "arn:aws:lambda:us-east-1:<account>:function:h4-*"
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + Service = "lambda.amazonaws.com"
                        }
                      + Sid       = "LambdaPullsTheFunctionsImages"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4-alert-bridge"
    }

  # aws_ecr_repository_policy.lambda["h4-credential-audit"] will be created
  + resource "aws_ecr_repository_policy" "lambda" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + Statement = [
                  + {
                      + Action    = [
                          + "ecr:GetDownloadUrlForLayer",
                          + "ecr:BatchGetImage",
                        ]
                      + Condition = {
                          + ArnLike = {
                              + "aws:SourceArn" = "arn:aws:lambda:us-east-1:<account>:function:h4-*"
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + Service = "lambda.amazonaws.com"
                        }
                      + Sid       = "LambdaPullsTheFunctionsImages"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4-credential-audit"
    }

  # aws_ecr_repository_policy.lambda["h4-probe"] will be created
  + resource "aws_ecr_repository_policy" "lambda" {
      + id          = (known after apply)
      + policy      = jsonencode(
            {
              + Statement = [
                  + {
                      + Action    = [
                          + "ecr:GetDownloadUrlForLayer",
                          + "ecr:BatchGetImage",
                        ]
                      + Condition = {
                          + ArnLike = {
                              + "aws:SourceArn" = "arn:aws:lambda:us-east-1:<account>:function:h4-*"
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + Service = "lambda.amazonaws.com"
                        }
                      + Sid       = "LambdaPullsTheFunctionsImages"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + region      = "us-east-1"
      + registry_id = (known after apply)
      + repository  = "h4-probe"
    }

  # aws_iam_policy.deny_paid_models will be created
  + resource "aws_iam_policy" "deny_paid_models" {
      + arn              = (known after apply)
      + attachment_count = (known after apply)
      + description      = "Bedrock's invocations denied: the model action's policy (spec 001 FR-023)"
      + id               = (known after apply)
      + name             = "h4-deny-paid-models"
      + name_prefix      = (known after apply)
      + path             = "/"
      + policy           = jsonencode(
            {
              + Statement = [
                  + {
                      + Action   = [
                          + "bedrock:InvokeModelWithResponseStream",
                          + "bedrock:InvokeModel",
                        ]
                      + Effect   = "Deny"
                      + Resource = "*"
                      + Sid      = "DenyPaidModels"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + policy_id        = (known after apply)
      + tags             = {
          + "component" = "kill-switch"
        }
      + tags_all         = {
          + "component"   = "kill-switch"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
    }

  # aws_iam_role.alert_bridge will be created
  + resource "aws_iam_role" "alert_bridge" {
      + arn                   = (known after apply)
      + assume_role_policy    = jsonencode(
            {
              + Statement = [
                  + {
                      + Action    = "sts:AssumeRole"
                      + Condition = {
                          + StringEquals = {
                              + "aws:SourceAccount" = "<account>"
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + Service = "lambda.amazonaws.com"
                        }
                      + Sid       = "LambdaForThisAccount"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + create_date           = (known after apply)
      + description           = "h4-alert-bridge: its log, its two parameters, its failure queue"
      + force_detach_policies = false
      + id                    = (known after apply)
      + managed_policy_arns   = (known after apply)
      + max_session_duration  = 3600
      + name                  = "h4-alert-bridge-fn"
      + name_prefix           = (known after apply)
      + path                  = "/"
      + tags                  = {
          + "component" = "alert-bridge"
        }
      + tags_all              = {
          + "component"   = "alert-bridge"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + unique_id             = (known after apply)

      + inline_policy (known after apply)
    }

  # aws_iam_role.credential_audit will be created
  + resource "aws_iam_role" "credential_audit" {
      + arn                   = (known after apply)
      + assume_role_policy    = jsonencode(
            {
              + Statement = [
                  + {
                      + Action    = "sts:AssumeRole"
                      + Condition = {
                          + StringEquals = {
                              + "aws:SourceAccount" = "<account>"
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + Service = "lambda.amazonaws.com"
                        }
                      + Sid       = "LambdaForThisAccount"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + create_date           = (known after apply)
      + description           = "h4-credential-audit: IAM's and Identity Center's reads, its results, its alert"
      + force_detach_policies = false
      + id                    = (known after apply)
      + managed_policy_arns   = (known after apply)
      + max_session_duration  = 3600
      + name                  = "h4-credential-audit-fn"
      + name_prefix           = (known after apply)
      + path                  = "/"
      + tags                  = {
          + "component" = "credential-audit"
        }
      + tags_all              = {
          + "component"   = "credential-audit"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + unique_id             = (known after apply)

      + inline_policy (known after apply)
    }

  # aws_iam_role.laptop_bedrock will be created
  + resource "aws_iam_role" "laptop_bedrock" {
      + arn                   = (known after apply)
      + assume_role_policy    = jsonencode(
            {
              + Statement = [
                  + {
                      + Action    = "sts:AssumeRole"
                      + Condition = {
                          + ArnLike = {
                              + "aws:PrincipalArn" = [
                                  + "arn:aws:iam::<account>:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_h4reet-ai-cloud_????????????????",
                                  + "arn:aws:iam::<account>:role/aws-reserved/sso.amazonaws.com/*/AWSReservedSSO_h4reet-ai-cloud_????????????????",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + AWS = "arn:aws:iam::<account>:root"
                        }
                      + Sid       = "ThePermissionSetsRoleOnly"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + create_date           = (known after apply)
      + description           = "The laptop gateway's Bedrock, assumed from its permission set (spec 001 FR-013)"
      + force_detach_policies = false
      + id                    = (known after apply)
      + managed_policy_arns   = (known after apply)
      + max_session_duration  = 3600
      + name                  = "h4-laptop-bedrock"
      + name_prefix           = (known after apply)
      + path                  = "/"
      + tags                  = {
          + "component" = "laptop-bedrock"
        }
      + tags_all              = {
          + "component"   = "laptop-bedrock"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + unique_id             = (known after apply)

      + inline_policy (known after apply)
    }

  # aws_iam_role.model_action will be created
  + resource "aws_iam_role" "model_action" {
      + arn                   = (known after apply)
      + assume_role_policy    = jsonencode(
            {
              + Statement = [
                  + {
                      + Action    = "sts:AssumeRole"
                      + Condition = {
                          + StringEquals = {
                              + "aws:SourceAccount" = "<account>"
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + Service = "budgets.amazonaws.com"
                        }
                      + Sid       = "BudgetsForThisAccount"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + create_date           = (known after apply)
      + description           = "The model action: h4-deny-paid-models on the Bedrock roles, and nothing else"
      + force_detach_policies = false
      + id                    = (known after apply)
      + managed_policy_arns   = (known after apply)
      + max_session_duration  = 3600
      + name                  = "h4-budget-action-model"
      + name_prefix           = (known after apply)
      + path                  = "/"
      + tags                  = {
          + "component" = "kill-switch"
        }
      + tags_all              = {
          + "component"   = "kill-switch"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + unique_id             = (known after apply)

      + inline_policy (known after apply)
    }

  # aws_iam_role.probe will be created
  + resource "aws_iam_role" "probe" {
      + arn                   = (known after apply)
      + assume_role_policy    = jsonencode(
            {
              + Statement = [
                  + {
                      + Action    = "sts:AssumeRole"
                      + Condition = {
                          + StringEquals = {
                              + "aws:SourceAccount" = "<account>"
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + Service = "lambda.amazonaws.com"
                        }
                      + Sid       = "LambdaForThisAccount"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + create_date           = (known after apply)
      + description           = "h4-probe: its log alone; its checks call the public site"
      + force_detach_policies = false
      + id                    = (known after apply)
      + managed_policy_arns   = (known after apply)
      + max_session_duration  = 3600
      + name                  = "h4-probe-fn"
      + name_prefix           = (known after apply)
      + path                  = "/"
      + tags                  = {
          + "component" = "probe"
        }
      + tags_all              = {
          + "component"   = "probe"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + unique_id             = (known after apply)

      + inline_policy (known after apply)
    }

  # aws_iam_role_policy.alert_bridge will be created
  + resource "aws_iam_role_policy" "alert_bridge" {
      + id          = (known after apply)
      + name        = "alert-bridge"
      + name_prefix = (known after apply)
      + policy      = (known after apply)
      + role        = (known after apply)
    }

  # aws_iam_role_policy.credential_audit will be created
  + resource "aws_iam_role_policy" "credential_audit" {
      + id          = (known after apply)
      + name        = "credential-audit"
      + name_prefix = (known after apply)
      + policy      = (known after apply)
      + role        = (known after apply)
    }

  # aws_iam_role_policy.laptop_bedrock will be created
  + resource "aws_iam_role_policy" "laptop_bedrock" {
      + id          = (known after apply)
      + name        = "bedrock-invoke"
      + name_prefix = (known after apply)
      + policy      = jsonencode(
            {
              + Statement = [
                  + {
                      + Action   = [
                          + "bedrock:InvokeModelWithResponseStream",
                          + "bedrock:InvokeModel",
                        ]
                      + Effect   = "Allow"
                      + Resource = "arn:aws:bedrock:us-east-1:<account>:inference-profile/us.anthropic.claude-haiku-5-5"
                      + Sid      = "TheInferenceProfile"
                    },
                  + {
                      + Action    = [
                          + "bedrock:InvokeModelWithResponseStream",
                          + "bedrock:InvokeModel",
                        ]
                      + Condition = {
                          + StringLike = {
                              + "bedrock:InferenceProfileArn" = "arn:aws:bedrock:us-east-1:<account>:inference-profile/us.anthropic.claude-haiku-5-5"
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5*"
                      + Sid       = "ItsModelsThroughTheProfileOnly"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + role        = (known after apply)
    }

  # aws_iam_role_policy.model_action will be created
  + resource "aws_iam_role_policy" "model_action" {
      + id          = (known after apply)
      + name        = "attach-the-deny"
      + name_prefix = (known after apply)
      + policy      = (known after apply)
      + role        = (known after apply)
    }

  # aws_iam_role_policy.probe will be created
  + resource "aws_iam_role_policy" "probe" {
      + id          = (known after apply)
      + name        = "probe"
      + name_prefix = (known after apply)
      + policy      = (known after apply)
      + role        = (known after apply)
    }

  # aws_s3_bucket.releases will be created
  + resource "aws_s3_bucket" "releases" {
      + acceleration_status         = (known after apply)
      + acl                         = (known after apply)
      + arn                         = (known after apply)
      + bucket                      = (known after apply)
      + bucket_domain_name          = (known after apply)
      + bucket_namespace            = (known after apply)
      + bucket_prefix               = "h4reet-ai-releases-"
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
          + "component" = "releases"
        }
      + tags_all                    = {
          + "component"   = "releases"
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

  # aws_s3_bucket_ownership_controls.releases will be created
  + resource "aws_s3_bucket_ownership_controls" "releases" {
      + bucket = (known after apply)
      + id     = (known after apply)
      + region = "us-east-1"

      + rule {
          + object_ownership = "BucketOwnerEnforced"
        }
    }

  # aws_s3_bucket_policy.releases will be created
  + resource "aws_s3_bucket_policy" "releases" {
      + bucket = (known after apply)
      + id     = (known after apply)
      + policy = (known after apply)
      + region = "us-east-1"
    }

  # aws_s3_bucket_public_access_block.releases will be created
  + resource "aws_s3_bucket_public_access_block" "releases" {
      + block_public_acls       = true
      + block_public_policy     = true
      + bucket                  = (known after apply)
      + id                      = (known after apply)
      + ignore_public_acls      = true
      + region                  = "us-east-1"
      + restrict_public_buckets = true
    }

  # aws_s3_bucket_server_side_encryption_configuration.releases will be created
  + resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
      + bucket = (known after apply)
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

  # aws_s3_bucket_versioning.releases will be created
  + resource "aws_s3_bucket_versioning" "releases" {
      + bucket = (known after apply)
      + id     = (known after apply)
      + region = "us-east-1"

      + versioning_configuration {
          + mfa_delete = (known after apply)
          + status     = "Enabled"
        }
    }

  # aws_sqs_queue.alert_bridge_failed will be created
  + resource "aws_sqs_queue" "alert_bridge_failed" {
      + arn                               = (known after apply)
      + content_based_deduplication       = false
      + deduplication_scope               = (known after apply)
      + delay_seconds                     = 0
      + fifo_queue                        = false
      + fifo_throughput_limit             = (known after apply)
      + id                                = (known after apply)
      + kms_data_key_reuse_period_seconds = 0
      + max_message_size                  = 262144
      + message_retention_seconds         = 1209600
      + name                              = "h4-alert-bridge-failed"
      + name_prefix                       = (known after apply)
      + policy                            = (known after apply)
      + receive_wait_time_seconds         = 0
      + redrive_allow_policy              = (known after apply)
      + redrive_policy                    = (known after apply)
      + region                            = "us-east-1"
      + sqs_managed_sse_enabled           = true
      + tags                              = {
          + "component" = "alert-bridge"
        }
      + tags_all                          = {
          + "component"   = "alert-bridge"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + url                               = (known after apply)
      + visibility_timeout_seconds        = 30
    }

  # aws_ssoadmin_permission_set.laptop will be updated in-place
  # (imported from "arn:aws:sso:::permissionSet/ssoins-<redacted>/ps-<redacted>,arn:aws:sso:::instance/ssoins-<redacted>")
  ~ resource "aws_ssoadmin_permission_set" "laptop" {
        arn              = "arn:aws:sso:::permissionSet/ssoins-<redacted>/ps-<redacted>"
        created_date     = "2026-10-13T03:17:06Z"
      + description      = "The laptop's Bedrock: sts:AssumeRole on h4-laptop-bedrock alone (spec 001 FR-013)"
        id               = "arn:aws:sso:::permissionSet/ssoins-<redacted>/ps-<redacted>,arn:aws:sso:::instance/ssoins-<redacted>"
        instance_arn     = "arn:aws:sso:::instance/ssoins-<redacted>"
        name             = "h4reet-ai-cloud"
        region           = "us-east-1"
        relay_state      = null
        session_duration = "PT2H"
      ~ tags             = {
          + "component" = "laptop-bedrock"
        }
      ~ tags_all         = {
          + "component"   = "laptop-bedrock"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
    }

  # aws_ssoadmin_permission_set_inline_policy.laptop will be created
  + resource "aws_ssoadmin_permission_set_inline_policy" "laptop" {
      + id                 = (known after apply)
      + inline_policy      = (known after apply)
      + instance_arn       = "arn:aws:sso:::instance/ssoins-<redacted>"
      + permission_set_arn = "arn:aws:sso:::permissionSet/ssoins-<redacted>/ps-<redacted>"
      + region             = "us-east-1"
    }

Plan: 1 to import, 60 to add, 1 to change, 0 to destroy.

Changes to Outputs:
  + lambda_repositories = {
      + h4-alert-bridge     = (known after apply)
      + h4-credential-audit = (known after apply)
      + h4-probe            = (known after apply)
    }
  + registry            = (known after apply)
  + release_bucket      = (known after apply)
```
<!-- /h4-plan -->

## Cost and data-flow impact

None. Tags cost nothing, and nothing new is created or leaves.

## Backlog

- **The policy's `TAGGABLE` should name `aws_budgets_budget_action`,** so the source check catches this before a plan does. `tools/gates/infra_policy.py` is a gate tool, so the change is yours, as a patch, any time.
