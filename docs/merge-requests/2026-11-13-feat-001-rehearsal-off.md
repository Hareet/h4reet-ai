# feat/001-rehearsal-off: the rehearsal ended, the audit's image, and the bootstrap's state in the bucket (T040 g, T030's move)

## Status: built, verified, and reviewed (no blocker; the anchor is 301db001); the trip's records, your state migration, two plan blocks, and the gate are yours; not merged

## What changed and why

This branch builds on `ops/apply-account-2026-11-12-2` (6fa72fd8), the account's second apply, so one gate takes that record and this change.

| What | Where |
|---|---|
| `rehearsal = false`, and its marker removed (T040g). The next account apply destroys the two $0.01 budgets with their actions, `h4-rehearsal-target`, and `h4-rehearsal-instance` | `infra/account/main.tf`, `infra/account/rehearsal-on.txt` |
| The credential audit's image rebuilt with the set's check, your 9g push from main at 4785107e (so its `audit.py` names `h4reet-ai-cloud`): `sha256:dd899845…`, which replaces `sha256:9a660808…`. From this apply on, the weekly function holds `h4reet-ai-cloud` to the one policy, as the terminal run does (the rehearsal branch's review, I-1) | `infra/account/main.tf` |
| The bootstrap's state in the bucket, T030's move (group 3's departure 4). Its backend is `s3` under `bootstrap.tfstate`, with S3's own lock file, as the account's is; the plan supplies the bucket's name. The test now holds that, and the fixture `state-still-local` is the old form | `infra/bootstrap/versions.tf`, `infra/test/test_bootstrap.py`, `infra/test/fixtures/bootstrap/` |
| The rehearsal branch's review nits: | |
| - the audit test's always-true assert replaced, and the weekly function held to the module's set name | `infra/lambdas/credential_audit/test_audit.py` |
| - the on-fixture's digests made current | `infra/test/fixtures/account/rehearsal-on-in-the-tree.tf` |
| - row F2's paragraph says the gateway's SDK default is the session's reading, beside what your CLI showed | `docs/data-flow-disclosure.md` |

## Verification

- **RED, at 0c035bec:** `infra/test` and `infra/lambdas` gave 33 failed, each on the backend: "the state isn't in the bucket, under bootstrap.tfstate".
- **GREEN, at this branch's tip:**
  - `infra/test`, `infra/lambdas`, and `evals/test_disclosure.py`: 314 passed, with the rehearsal off;
  - `tools/gates/infra_policy.py --root .`: passes, 15 files;
  - `tools/gates/disclosure_check.py`: passes;
  - `terraform fmt -check`: passes on `main.tf`, `versions.tf`, and the fixtures.

## For the Author, in this order

1. **The trip first,** on the rehearsal still standing (the runbook's step 9):
   - when AWS evaluated each budget, as each budget's history shows it (SC-009's "AWS's delay is recorded");
   - each alert's time on Telegram and in the mailbox;
   - the deny on `h4-rehearsal-target`;
   - the SSM run and the instance `stopped`;
   - then both actions undone, each runbook's Undo.
   
   Tell the session the notices' text. This branch's apply destroys the rehearsal, so the trip has to finish before it. The undo matters too: Budgets attached the deny to `h4-rehearsal-target` outside Terraform, so destroying that role with the deny still on it fails.
2. **Your copy branch,** `feat/001-rehearsal-off-p`, of this branch's tip. There's no patch: nothing here is protected.
3. **The state's move,** from your copy branch's checkout, whose `versions.tf` declares the `s3` backend. It names no bucket: the bucket comes only from `-backend-config`. The move copies the local state into the bucket under `bootstrap.tfstate`. Signed in, from your checkout:

   ```bash
   h=~/.config/h4reet-ai/infra
   e=$h/bootstrap.env
   k=TF_VAR_state_bucket_suffix
   x=$(sed -n "s/^$k=//p" "$e")
   m=~/.local/share/h4reet/terraform-providers
   unset TF_CLI_ARGS TF_CLI_ARGS_init
   export TF_DATA_DIR=$h/data/bootstrap
   export AWS_PROFILE=h4reet-admin
   r=(-chdir=infra/bootstrap)
   terraform "${r[@]}" state list | wc -l
   terraform "${r[@]}" init -migrate-state \
     -lockfile=readonly -plugin-dir="$m" \
     -backend-config="bucket=h4reet-ai-tfstate-$x"
   terraform "${r[@]}" state list | wc -l
   unset TF_DATA_DIR AWS_PROFILE
   ```

   - The first count prints 14, from the local state.
   - **Terraform must ask "Do you want to copy existing state to the new backend?"** Answer `yes`. If it doesn't ask, stop and tell the session. A missing prompt means the data folder had no local state to copy, and the bucket's state would start empty.
   - It ends "Successfully configured the backend "s3"".
   - The second count prints 14, now from the bucket.
   - These conditions keep the move sound, as the review set them out:
     - the same `TF_DATA_DIR` the plans use, since Terraform takes the move's source from it;
     - the bucket alone passed in `-backend-config`, with credentials from `AWS_PROFILE`;
     - `-lockfile=readonly`, so the lockfile stays unchanged;
     - no `TF_CLI_ARGS` in the shell.

   Until this branch merges, don't plan the bootstrap from `main`, whose `versions.tf` still says local. Its init would refuse there in any case.
4. **Two plans,** from a clone of your copy branch:
   - **the bootstrap's,** which must read "No changes": the move changes where the state lives, not what it holds. **If it shows any change, stop: don't commit its block, and tell the session;**
   - **the account's:** the rehearsal's resources destroyed, and the audit function's image updated.
   
   Both blocks go in this note's "The plan blocks" below, by the runbook's script, and are committed on your branch.
5. **The gate,** then its merge, behind the runbook's guard: after the anchor, only this note may differ.
6. **The account's verify, apply, and record,** from main. The bootstrap has nothing to apply.

### The plan blocks

<!-- h4-plan root=bootstrap tree=8dd1346c3984331e4f95d47b5febcb2f6d08f58b sha256=0800a8613ab194171c112570144da13bc44d47dc58a19f51732fd78ce2ce4174 terraform=1.17.1 made=2026-11-13T04:56:45Z -->
```terraform-plan

No changes. Your infrastructure matches the configuration.

Terraform has compared your real infrastructure against your configuration
and found no differences, so no changes are needed.
```
<!-- /h4-plan -->

<!-- h4-plan root=account tree=8dd1346c3984331e4f95d47b5febcb2f6d08f58b sha256=05137fda259dedd3709ff46ba9d5fef71f466bb138c9c611f7edd76695be0fcf terraform=1.17.1 made=2026-11-13T04:56:58Z -->
```terraform-plan

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  ~ update in-place
  - destroy

Terraform will perform the following actions:

  # aws_budgets_budget.rehearsal_model[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_budgets_budget" "rehearsal_model" {
      - account_id        = "<account>" -> null
      - arn               = "arn:aws:budgets::<account>:budget/h4-rehearsal-model" -> null
      - budget_type       = "COST" -> null
      - id                = "<account>:h4-rehearsal-model" -> null
      - limit_amount      = "0.01" -> null
      - limit_unit        = "USD" -> null
      - metrics           = [] -> null
      - name              = "h4-rehearsal-model" -> null
      - tags              = {
          - "component" = "rehearsal"
        } -> null
      - tags_all          = {
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null
      - time_period_end   = "2087-06-15_00:00" -> null
      - time_period_start = "2026-11-01_00:00" -> null
      - time_unit         = "MONTHLY" -> null
        # (2 unchanged attributes hidden)

      - cost_filter {
          - name   = "Service" -> null
          - values = [
              - "Claude Haiku 5.5 (Bedrock Edition)",
            ] -> null
        }

      - cost_types {
          - include_credit             = false -> null
          - include_discount           = true -> null
          - include_other_subscription = true -> null
          - include_recurring          = true -> null
          - include_refund             = true -> null
          - include_subscription       = true -> null
          - include_support            = true -> null
          - include_tax                = true -> null
          - include_upfront            = true -> null
          - use_amortized              = false -> null
          - use_blended                = false -> null
        }

      - notification {
          - comparison_operator        = "GREATER_THAN" -> null
          - notification_type          = "ACTUAL" -> null
          - subscriber_email_addresses = [] -> null
          - subscriber_sns_topic_arns  = [
              - "arn:aws:sns:us-east-1:<account>:h4-alerts",
            ] -> null
          - threshold                  = 100 -> null
          - threshold_type             = "PERCENTAGE" -> null
        }
    }

  # aws_budgets_budget.rehearsal_server[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_budgets_budget" "rehearsal_server" {
      - account_id        = "<account>" -> null
      - arn               = "arn:aws:budgets::<account>:budget/h4-rehearsal-server" -> null
      - budget_type       = "COST" -> null
      - id                = "<account>:h4-rehearsal-server" -> null
      - limit_amount      = "0.01" -> null
      - limit_unit        = "USD" -> null
      - metrics           = [
          - "UnblendedCost",
        ] -> null
      - name              = "h4-rehearsal-server" -> null
      - tags              = {
          - "component" = "rehearsal"
        } -> null
      - tags_all          = {
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null
      - time_period_end   = "2087-06-15_00:00" -> null
      - time_period_start = "2026-11-01_00:00" -> null
      - time_unit         = "MONTHLY" -> null
        # (2 unchanged attributes hidden)

      - filter_expression {
          - and {
              - not {
                  - dimensions {
                      - key           = "SERVICE" -> null
                      - match_options = [] -> null
                      - values        = [
                          - "Claude Haiku 5.5 (Bedrock Edition)",
                        ] -> null
                    }
                }
            }
          - and {
              - tags {
                  - key           = "project" -> null
                  - match_options = [] -> null
                  - values        = [
                      - "h4reet-ai",
                    ] -> null
                }
            }
        }

      - notification {
          - comparison_operator        = "GREATER_THAN" -> null
          - notification_type          = "ACTUAL" -> null
          - subscriber_email_addresses = [] -> null
          - subscriber_sns_topic_arns  = [
              - "arn:aws:sns:us-east-1:<account>:h4-alerts",
            ] -> null
          - threshold                  = 100 -> null
          - threshold_type             = "PERCENTAGE" -> null
        }
    }

  # aws_budgets_budget_action.rehearsal_model[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_budgets_budget_action" "rehearsal_model" {
      - account_id         = "<account>" -> null
      - action_id          = "<redacted-budget-action-id>" -> null
      - action_type        = "APPLY_IAM_POLICY" -> null
      - approval_model     = "AUTOMATIC" -> null
      - arn                = "arn:aws:budgets::<account>:budget/h4-rehearsal-model/action/<redacted-budget-action-id>" -> null
      - budget_name        = "h4-rehearsal-model" -> null
      - execution_role_arn = "arn:aws:iam::<account>:role/h4-budget-action-rehearsal-model" -> null
      - id                 = "<account>:<redacted-budget-action-id>:h4-rehearsal-model" -> null
      - notification_type  = "ACTUAL" -> null
      - status             = "STANDBY" -> null
      - tags               = {
          - "component" = "rehearsal"
        } -> null
      - tags_all           = {
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null

      - action_threshold {
          - action_threshold_type  = "PERCENTAGE" -> null
          - action_threshold_value = 100 -> null
        }

      - definition {
          - iam_action_definition {
              - groups     = [] -> null
              - policy_arn = "arn:aws:iam::<account>:policy/h4-deny-paid-models" -> null
              - roles      = [
                  - "h4-rehearsal-target",
                ] -> null
              - users      = [] -> null
            }
        }

      - subscriber {
          - address           = "arn:aws:sns:us-east-1:<account>:h4-alerts" -> null
          - subscription_type = "SNS" -> null
        }
    }

  # aws_budgets_budget_action.rehearsal_server[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_budgets_budget_action" "rehearsal_server" {
      - account_id         = "<account>" -> null
      - action_id          = "<redacted-budget-action-id>" -> null
      - action_type        = "RUN_SSM_DOCUMENTS" -> null
      - approval_model     = "AUTOMATIC" -> null
      - arn                = "arn:aws:budgets::<account>:budget/h4-rehearsal-server/action/<redacted-budget-action-id>" -> null
      - budget_name        = "h4-rehearsal-server" -> null
      - execution_role_arn = "arn:aws:iam::<account>:role/h4-budget-action-rehearsal-server" -> null
      - id                 = "<account>:<redacted-budget-action-id>:h4-rehearsal-server" -> null
      - notification_type  = "ACTUAL" -> null
      - status             = "EXECUTION_FAILURE" -> null
      - tags               = {
          - "component" = "rehearsal"
        } -> null
      - tags_all           = {
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null

      - action_threshold {
          - action_threshold_type  = "PERCENTAGE" -> null
          - action_threshold_value = 100 -> null
        }

      - definition {
          - ssm_action_definition {
              - action_sub_type = "STOP_EC2_INSTANCES" -> null
              - instance_ids    = [
                  - "i-<redacted>",
                ] -> null
              - region          = "us-east-1" -> null
            }
        }

      - subscriber {
          - address           = "arn:aws:sns:us-east-1:<account>:h4-alerts" -> null
          - subscription_type = "SNS" -> null
        }
    }

  # aws_iam_role.rehearsal_model_action[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_iam_role" "rehearsal_model_action" {
      - arn                   = "arn:aws:iam::<account>:role/h4-budget-action-rehearsal-model" -> null
      - assume_role_policy    = jsonencode(
            {
              - Statement = [
                  - {
                      - Action    = "sts:AssumeRole"
                      - Condition = {
                          - StringEquals = {
                              - "aws:SourceAccount" = "<account>"
                            }
                        }
                      - Effect    = "Allow"
                      - Principal = {
                          - Service = "budgets.amazonaws.com"
                        }
                      - Sid       = "BudgetsForThisAccount"
                    },
                ]
              - Version   = "2012-10-17"
            }
        ) -> null
      - create_date           = "2026-11-12T06:59:02Z" -> null
      - description           = "The model rehearsal: h4-deny-paid-models on h4-rehearsal-target, and nothing else" -> null
      - force_detach_policies = false -> null
      - id                    = "h4-budget-action-rehearsal-model" -> null
      - managed_policy_arns   = [] -> null
      - max_session_duration  = 3600 -> null
      - name                  = "h4-budget-action-rehearsal-model" -> null
      - path                  = "/" -> null
      - tags                  = {
          - "component" = "rehearsal"
        } -> null
      - tags_all              = {
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null
      - unique_id             = "AROASFWY43QOJFBSYJWS4" -> null
        # (2 unchanged attributes hidden)

      - inline_policy {
          - name   = "attach-the-deny" -> null
          - policy = jsonencode(
                {
                  - Statement = [
                      - {
                          - Action    = [
                              - "iam:DetachRolePolicy",
                              - "iam:AttachRolePolicy",
                            ]
                          - Condition = {
                              - ArnEquals = {
                                  - "iam:PolicyARN" = "arn:aws:iam::<account>:policy/h4-deny-paid-models"
                                }
                            }
                          - Effect    = "Allow"
                          - Resource  = "arn:aws:iam::<account>:role/h4-rehearsal-target"
                          - Sid       = "ThatPolicyOnTheTarget"
                        },
                    ]
                  - Version   = "2012-10-17"
                }
            ) -> null
        }
    }

  # aws_iam_role.rehearsal_server_action[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_iam_role" "rehearsal_server_action" {
      - arn                   = "arn:aws:iam::<account>:role/h4-budget-action-rehearsal-server" -> null
      - assume_role_policy    = jsonencode(
            {
              - Statement = [
                  - {
                      - Action    = "sts:AssumeRole"
                      - Condition = {
                          - StringEquals = {
                              - "aws:SourceAccount" = "<account>"
                            }
                        }
                      - Effect    = "Allow"
                      - Principal = {
                          - Service = "budgets.amazonaws.com"
                        }
                      - Sid       = "BudgetsForThisAccount"
                    },
                ]
              - Version   = "2012-10-17"
            }
        ) -> null
      - create_date           = "2026-11-12T06:59:02Z" -> null
      - description           = "The server rehearsal: AWS-StopEC2Instance and its reverse on h4-rehearsal-instance, and nothing else" -> null
      - force_detach_policies = false -> null
      - id                    = "h4-budget-action-rehearsal-server" -> null
      - managed_policy_arns   = [] -> null
      - max_session_duration  = 3600 -> null
      - name                  = "h4-budget-action-rehearsal-server" -> null
      - path                  = "/" -> null
      - tags                  = {
          - "component" = "rehearsal"
        } -> null
      - tags_all              = {
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null
      - unique_id             = "AROASFWY43QOFZUVIGUPZ" -> null
        # (2 unchanged attributes hidden)

      - inline_policy {
          - name   = "stop-the-rehearsal-instance" -> null
          - policy = jsonencode(
                {
                  - Statement = [
                      - {
                          - Action   = "ssm:StartAutomationExecution"
                          - Effect   = "Allow"
                          - Resource = [
                              - "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StopEC2Instance:*",
                              - "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StartEC2Instance:*",
                            ]
                          - Sid      = "TheStopDocumentAndItsReverse"
                        },
                      - {
                          - Action    = [
                              - "ec2:StopInstances",
                              - "ec2:StartInstances",
                            ]
                          - Condition = {
                              - "ForAnyValue:StringEquals" = {
                                  - "aws:CalledVia" = "ssm.amazonaws.com"
                                }
                            }
                          - Effect    = "Allow"
                          - Resource  = "arn:aws:ec2:us-east-1:<account>:instance/i-<redacted>"
                          - Sid       = "ThatInstanceThroughSystemsManager"
                        },
                      - {
                          - Action   = [
                              - "ec2:DescribeInstances",
                              - "ec2:DescribeInstanceStatus",
                            ]
                          - Effect   = "Allow"
                          - Resource = "*"
                          - Sid      = "ItsState"
                        },
                    ]
                  - Version   = "2012-10-17"
                }
            ) -> null
        }
    }

  # aws_iam_role.rehearsal_target[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_iam_role" "rehearsal_target" {
      - arn                   = "arn:aws:iam::<account>:role/h4-rehearsal-target" -> null
      - assume_role_policy    = jsonencode(
            {
              - Statement = [
                  - {
                      - Action    = "sts:AssumeRole"
                      - Condition = {
                          - ArnEquals = {
                              - "aws:PrincipalArn" = "arn:aws:iam::<account>:root"
                            }
                        }
                      - Effect    = "Allow"
                      - Principal = {
                          - AWS = "arn:aws:iam::<account>:root"
                        }
                      - Sid       = "NoOne"
                    },
                ]
              - Version   = "2012-10-17"
            }
        ) -> null
      - create_date           = "2026-11-12T06:59:02Z" -> null
      - description           = "The model rehearsal's target, of h4-laptop-bedrock's shape; no one assumes it (spec 001 FR-026)" -> null
      - force_detach_policies = false -> null
      - id                    = "h4-rehearsal-target" -> null
      - managed_policy_arns   = [] -> null
      - max_session_duration  = 3600 -> null
      - name                  = "h4-rehearsal-target" -> null
      - path                  = "/" -> null
      - tags                  = {
          - "component" = "rehearsal"
        } -> null
      - tags_all              = {
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null
      - unique_id             = "AROASFWY43QOIQUJ6MYXW" -> null
        # (2 unchanged attributes hidden)

      - inline_policy {
          - name   = "bedrock-invoke" -> null
          - policy = jsonencode(
                {
                  - Statement = [
                      - {
                          - Action   = [
                              - "bedrock:InvokeModelWithResponseStream",
                              - "bedrock:InvokeModel",
                            ]
                          - Effect   = "Allow"
                          - Resource = "arn:aws:bedrock:us-east-1:<account>:inference-profile/us.anthropic.claude-haiku-5-5"
                          - Sid      = "TheInferenceProfile"
                        },
                      - {
                          - Action    = [
                              - "bedrock:InvokeModelWithResponseStream",
                              - "bedrock:InvokeModel",
                            ]
                          - Condition = {
                              - StringLike = {
                                  - "bedrock:InferenceProfileArn" = "arn:aws:bedrock:us-east-1:<account>:inference-profile/us.anthropic.claude-haiku-5-5"
                                }
                            }
                          - Effect    = "Allow"
                          - Resource  = "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5*"
                          - Sid       = "ItsModelsThroughTheProfileOnly"
                        },
                    ]
                  - Version   = "2012-10-17"
                }
            ) -> null
        }
    }

  # aws_iam_role_policy.rehearsal_model_action[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_iam_role_policy" "rehearsal_model_action" {
      - id          = "h4-budget-action-rehearsal-model:attach-the-deny" -> null
      - name        = "attach-the-deny" -> null
      - policy      = jsonencode(
            {
              - Statement = [
                  - {
                      - Action    = [
                          - "iam:DetachRolePolicy",
                          - "iam:AttachRolePolicy",
                        ]
                      - Condition = {
                          - ArnEquals = {
                              - "iam:PolicyARN" = "arn:aws:iam::<account>:policy/h4-deny-paid-models"
                            }
                        }
                      - Effect    = "Allow"
                      - Resource  = "arn:aws:iam::<account>:role/h4-rehearsal-target"
                      - Sid       = "ThatPolicyOnTheTarget"
                    },
                ]
              - Version   = "2012-10-17"
            }
        ) -> null
      - role        = "h4-budget-action-rehearsal-model" -> null
        # (1 unchanged attribute hidden)
    }

  # aws_iam_role_policy.rehearsal_server_action[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_iam_role_policy" "rehearsal_server_action" {
      - id          = "h4-budget-action-rehearsal-server:stop-the-rehearsal-instance" -> null
      - name        = "stop-the-rehearsal-instance" -> null
      - policy      = jsonencode(
            {
              - Statement = [
                  - {
                      - Action   = "ssm:StartAutomationExecution"
                      - Effect   = "Allow"
                      - Resource = [
                          - "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StopEC2Instance:*",
                          - "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StartEC2Instance:*",
                        ]
                      - Sid      = "TheStopDocumentAndItsReverse"
                    },
                  - {
                      - Action    = [
                          - "ec2:StopInstances",
                          - "ec2:StartInstances",
                        ]
                      - Condition = {
                          - "ForAnyValue:StringEquals" = {
                              - "aws:CalledVia" = "ssm.amazonaws.com"
                            }
                        }
                      - Effect    = "Allow"
                      - Resource  = "arn:aws:ec2:us-east-1:<account>:instance/i-<redacted>"
                      - Sid       = "ThatInstanceThroughSystemsManager"
                    },
                  - {
                      - Action   = [
                          - "ec2:DescribeInstances",
                          - "ec2:DescribeInstanceStatus",
                        ]
                      - Effect   = "Allow"
                      - Resource = "*"
                      - Sid      = "ItsState"
                    },
                ]
              - Version   = "2012-10-17"
            }
        ) -> null
      - role        = "h4-budget-action-rehearsal-server" -> null
        # (1 unchanged attribute hidden)
    }

  # aws_iam_role_policy.rehearsal_target[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_iam_role_policy" "rehearsal_target" {
      - id          = "h4-rehearsal-target:bedrock-invoke" -> null
      - name        = "bedrock-invoke" -> null
      - policy      = jsonencode(
            {
              - Statement = [
                  - {
                      - Action   = [
                          - "bedrock:InvokeModelWithResponseStream",
                          - "bedrock:InvokeModel",
                        ]
                      - Effect   = "Allow"
                      - Resource = "arn:aws:bedrock:us-east-1:<account>:inference-profile/us.anthropic.claude-haiku-5-5"
                      - Sid      = "TheInferenceProfile"
                    },
                  - {
                      - Action    = [
                          - "bedrock:InvokeModelWithResponseStream",
                          - "bedrock:InvokeModel",
                        ]
                      - Condition = {
                          - StringLike = {
                              - "bedrock:InferenceProfileArn" = "arn:aws:bedrock:us-east-1:<account>:inference-profile/us.anthropic.claude-haiku-5-5"
                            }
                        }
                      - Effect    = "Allow"
                      - Resource  = "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5*"
                      - Sid       = "ItsModelsThroughTheProfileOnly"
                    },
                ]
              - Version   = "2012-10-17"
            }
        ) -> null
      - role        = "h4-rehearsal-target" -> null
        # (1 unchanged attribute hidden)
    }

  # aws_instance.rehearsal[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_instance" "rehearsal" {
      - ami                                  = "ami-0ac4d209e5e82d684" -> null
      - arn                                  = "arn:aws:ec2:us-east-1:<account>:instance/i-<redacted>" -> null
      - associate_public_ip_address          = false -> null
      - availability_zone                    = "us-east-1a" -> null
      - disable_api_stop                     = false -> null
      - disable_api_termination              = false -> null
      - ebs_optimized                        = false -> null
      - force_destroy                        = false -> null
      - get_password_data                    = false -> null
      - hibernation                          = false -> null
      - id                                   = "i-<redacted>" -> null
      - instance_initiated_shutdown_behavior = "stop" -> null
      - instance_state                       = "running" -> null
      - instance_type                        = "t4g.nano" -> null
      - ipv6_address_count                   = 0 -> null
      - ipv6_addresses                       = [] -> null
      - monitoring                           = false -> null
      - placement_partition_number           = 0 -> null
      - primary_network_interface_id         = "eni-<redacted>" -> null
      - private_dns                          = "ip-10-250-0-4.ec2.internal" -> null
      - private_ip                           = "10.250.0.4" -> null
      - region                               = "us-east-1" -> null
      - secondary_private_ips                = [] -> null
      - security_groups                      = [] -> null
      - source_dest_check                    = true -> null
      - subnet_id                            = "subnet-<redacted>" -> null
      - tags                                 = {
          - "Name"      = "h4-rehearsal-instance"
          - "component" = "rehearsal"
        } -> null
      - tags_all                             = {
          - "Name"        = "h4-rehearsal-instance"
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null
      - tenancy                              = "default" -> null
      - user_data_replace_on_change          = false -> null
      - vpc_security_group_ids               = [
          - "sg-<redacted>",
        ] -> null
        # (11 unchanged attributes hidden)

      - capacity_reservation_specification {
          - capacity_reservation_preference = "open" -> null
        }

      - cpu_options {
          - core_count            = 2 -> null
          - threads_per_core      = 1 -> null
            # (2 unchanged attributes hidden)
        }

      - credit_specification {
          - cpu_credits = "unlimited" -> null
        }

      - enclave_options {
          - enabled = false -> null
        }

      - maintenance_options {
          - auto_recovery = "default" -> null
        }

      - metadata_options {
          - http_endpoint               = "enabled" -> null
          - http_protocol_ipv6          = "disabled" -> null
          - http_put_response_hop_limit = 1 -> null
          - http_tokens                 = "required" -> null
          - instance_metadata_tags      = "disabled" -> null
        }

      - primary_network_interface {
          - delete_on_termination = true -> null
          - network_interface_id  = "eni-<redacted>" -> null
        }

      - private_dns_name_options {
          - enable_resource_name_dns_a_record    = false -> null
          - enable_resource_name_dns_aaaa_record = false -> null
          - hostname_type                        = "ip-name" -> null
        }

      - root_block_device {
          - delete_on_termination = true -> null
          - device_name           = "/dev/xvda" -> null
          - encrypted             = true -> null
          - iops                  = 3000 -> null
          - kms_key_id            = "arn:aws:kms:us-east-1:<account>:key/<redacted-kms-key-id>" -> null
          - tags                  = {} -> null
          - tags_all              = {
              - "environment" = "account"
              - "project"     = "h4reet-ai"
            } -> null
          - throughput            = 125 -> null
          - volume_id             = "vol-<redacted>" -> null
          - volume_size           = 2 -> null
          - volume_type           = "gp3" -> null
        }
    }

  # aws_lambda_function.credential_audit[0] will be updated in-place
  ~ resource "aws_lambda_function" "credential_audit" {
        id                             = "h4-credential-audit"
      ~ image_uri                      = "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-credential-audit@sha256:9a660808453e99673c769f4fb9e51ffd2b1396bfa15fd7707a3db6881be8793d" -> "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-credential-audit@sha256:dd899845f873e200d23db827797e8e556588f5c4c74aee2c4e4e1f0d71264494"
      ~ last_modified                  = "2026-11-12T06:59:02.449+0000" -> (known after apply)
        tags                           = {
            "component" = "credential-audit"
        }
        # (29 unchanged attributes hidden)

        # (4 unchanged blocks hidden)
    }

  # aws_security_group.rehearsal[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_security_group" "rehearsal" {
      - arn                    = "arn:aws:ec2:us-east-1:<account>:security-group/sg-<redacted>" -> null
      - description            = "h4-rehearsal-instance: no rule in or out" -> null
      - egress                 = [] -> null
      - id                     = "sg-<redacted>" -> null
      - ingress                = [] -> null
      - name                   = "h4-rehearsal" -> null
      - owner_id               = "<account>" -> null
      - region                 = "us-east-1" -> null
      - revoke_rules_on_delete = false -> null
      - tags                   = {
          - "component" = "rehearsal"
        } -> null
      - tags_all               = {
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null
      - vpc_id                 = "vpc-<redacted>" -> null
        # (1 unchanged attribute hidden)
    }

  # aws_subnet.rehearsal[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_subnet" "rehearsal" {
      - arn                                            = "arn:aws:ec2:us-east-1:<account>:subnet/subnet-<redacted>" -> null
      - assign_ipv6_address_on_creation                = false -> null
      - availability_zone                              = "us-east-1a" -> null
      - availability_zone_id                           = "use1-az4" -> null
      - cidr_block                                     = "10.250.0.0/28" -> null
      - enable_dns64                                   = false -> null
      - enable_lni_at_device_index                     = 0 -> null
      - enable_resource_name_dns_a_record_on_launch    = false -> null
      - enable_resource_name_dns_aaaa_record_on_launch = false -> null
      - id                                             = "subnet-<redacted>" -> null
      - ipv6_native                                    = false -> null
      - map_customer_owned_ip_on_launch                = false -> null
      - map_public_ip_on_launch                        = false -> null
      - owner_id                                       = "<account>" -> null
      - private_dns_hostname_type_on_launch            = "ip-name" -> null
      - region                                         = "us-east-1" -> null
      - tags                                           = {
          - "Name"      = "h4-rehearsal"
          - "component" = "rehearsal"
        } -> null
      - tags_all                                       = {
          - "Name"        = "h4-rehearsal"
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null
      - vpc_id                                         = "vpc-<redacted>" -> null
        # (4 unchanged attributes hidden)
    }

  # aws_vpc.rehearsal[0] will be destroyed
  # (because index [0] is out of range for count)
  - resource "aws_vpc" "rehearsal" {
      - arn                                  = "arn:aws:ec2:us-east-1:<account>:vpc/vpc-<redacted>" -> null
      - assign_generated_ipv6_cidr_block     = false -> null
      - cidr_block                           = "10.250.0.0/28" -> null
      - default_network_acl_id               = "acl-<redacted>" -> null
      - default_route_table_id               = "rtb-<redacted>" -> null
      - default_security_group_id            = "sg-<redacted>" -> null
      - dhcp_options_id                      = "dopt-57d0ad32" -> null
      - enable_dns_hostnames                 = false -> null
      - enable_dns_support                   = true -> null
      - enable_network_address_usage_metrics = false -> null
      - id                                   = "vpc-<redacted>" -> null
      - instance_tenancy                     = "default" -> null
      - ipv6_netmask_length                  = 0 -> null
      - main_route_table_id                  = "rtb-<redacted>" -> null
      - owner_id                             = "<account>" -> null
      - region                               = "us-east-1" -> null
      - tags                                 = {
          - "Name"      = "h4-rehearsal"
          - "component" = "rehearsal"
        } -> null
      - tags_all                             = {
          - "Name"        = "h4-rehearsal"
          - "component"   = "rehearsal"
          - "environment" = "account"
          - "project"     = "h4reet-ai"
        } -> null
        # (4 unchanged attributes hidden)
    }

Plan: 0 to add, 1 to change, 14 to destroy.
```
<!-- /h4-plan -->

## The state's move (T030 step 2)

2026-11-12, by the Author from his copy branch's checkout, as in step 3. Terraform asked "Do you want to copy existing state to the new backend?" and he answered `yes`. Init printed "Successfully configured the backend "s3"!".

- **The first count printed 0, not 14.** Terraform refused `state list` before init because the configured backend had changed: its output ended in an error box, and `wc -l` counted no lines. Step 3 was wrong to expect it to read the local state. Init itself found the old state: "Pre-existing state was found while migrating the previous "local" backend".
- **The second count printed 17, from the bucket.** That is right. `state list` also lists data sources: the bootstrap holds 14 resources (the 14 rows of docs/infra/applies/2026-11-12-bootstrap.md) and 3 data sources. Step 3's 14 left the data sources out.
- The plan in step 4 is the check that the move kept the contents: it must read "No changes".

## The rehearsal's record (SC-009)

Pending: the session writes it from what you tell it.

## Backlog

- **The backend check's other clauses have no fixture:** a written bucket, a wrong key or region, or extra settings such as `profile` or `assume_role` (the review, N3). This matches the account's check, so it is no regression.
- **infra/README.md's line 60** still says the bootstrap's state "starts local". It should follow line 28's wording for the account (the review, N5).

## Cost and data-flow impact

- **Cost:** none new. The rehearsal's `t4g.nano` and its two $0.01 budgets go, and the bootstrap's state is one small object in a bucket that already exists.
- **Data flow:** none new. Row F2's wording only.
