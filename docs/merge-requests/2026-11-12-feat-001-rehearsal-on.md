# feat/001-rehearsal-on: the functions, and the budget actions' rehearsal (T040 d to f)

<!-- h4-rehearsal: on -->

## Status: built and verified; review to come; the account's plan block and the gate are yours; not merged; the account applied (2026-11-12) without functions or rehearsal

## What changed and why

This branch builds on your `ops/apply-account-2026-11-12` (4dae41b2), so one gate takes the account's apply record and this change.

| What | Where |
|---|---|
| The three functions' images by digest, from your 8d push (2026-11-12), so the account's next apply makes the functions: alert bridge `sha256:d2453921…`, probe `sha256:85e0a4e0…`, credential audit `sha256:9a660808…` | `infra/account/main.tf`, `local.lambda_images` |
| `rehearsal = true`, so the next apply makes the two $0.01 budgets with their actions, `h4-rehearsal-target`, and `h4-rehearsal-instance` (FR-026, SC-009) | `infra/account/main.tf` |
| The marker naming this note, whose line above says it is the rehearsal's (T038's review, I1) | `infra/account/rehearsal-on.txt` |
| The credential audit names your laptop set, `h4reet-ai-cloud`, iam.tf's own local. That's T040b's follow-up: the profile chains and the hand-made policy is detached, so the audit holds the set to the one policy. The name is read at each run, so the tests' fake accounts, which hold no set, run as before | `infra/lambdas/credential_audit/audit.py`, its tests |
| Row F2 names the STS host the chain calls, `sts.us-east-1.amazonaws.com`, as your CLI's opened connection showed (2026-11-12) | `docs/data-flow-disclosure.md` |

## Verification

- **RED:** two tests fail on the audit as it was:
  - the named set, which must be iam.tf's `h4reet-ai-cloud`;
  - the name, which must be read when the audit runs.
- **GREEN:** `infra/lambdas` gives 156 passed. The terminal test's fake account now holds the post-cutover state: `h4-laptop-bedrock` and the set, both Terraform's, the set holding only the assume.
- **The rest:** see "Checks" below, filled before the review.

## For the Author

1. **Your branch,** `feat/001-rehearsal-on-p`, a copy of this branch's tip. There's no patch: `main.tf` isn't protected.
2. **The account's plan,** from a clone of your branch. Its block goes under "The plan block" below, by the runbook's script, and is committed on your branch. Read it:
   - the three `aws_lambda_function`s and what invokes them;
   - the rehearsal's two budgets, their actions and roles, `h4-rehearsal-target`, and `h4-rehearsal-instance` (a `t4g.nano`);
   - no change to what the first apply made, but the functions' wiring;
   - no account ID, address, or email.
3. **The gate,** then its merge, behind the runbook's guard.
4. **Verify, apply, and record** the account, as before. The verify's credential audit now checks `h4reet-ai-cloud` holds only the assume.
5. **Before the trip:**
   - start `h4-rehearsal-instance` (`docs/runbooks/server-budget.md`, Verify);
   - check that Cost Explorer holds at least a cent of Bedrock's spend this month, for the model rehearsal: November's metered Bedrock runs held about $0.49.
   
   Then wait for AWS to evaluate both $0.01 budgets: hours, up to a day.
6. **Record, per action** (contracts/aws-alerts.md §4):
   - when AWS evaluated;
   - when Telegram and the mailbox got each alert: `model_budget_reached` and `server_budget_reached`, with `- rehearsal: yes`, then each `_action_executed`;
   - when the deny was on `h4-rehearsal-target`;
   - for the server action, the SSM run's status and the instance's state after it, `stopped`.
   
   Tell the session the real notices' text.
7. **Then `rehearsal = false`:** reverse both actions (each runbook's Undo), then the session's branch that sets false, removes the marker, and moves the bootstrap's state to S3.

SC-009 passes when both channels got each alert and each action took effect on its target.

### The plan block

<!-- h4-plan root=account tree=d7320c3b50dcf1bfc456994220afceffda38e2bb sha256=1b3e1a36af385c495086bb879d1aab33a34557f6cf0d69e1c511c72f5cf1e98e terraform=1.17.1 made=2026-11-12T06:29:37Z -->
```terraform-plan

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
 <= read (data resources)

Terraform will perform the following actions:

  # data.aws_iam_policy_document.rehearsal_model_action[0] will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "rehearsal_model_action" {
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
          + sid       = "ThatPolicyOnTheTarget"

          + condition {
              + test     = "ArnEquals"
              + values   = [
                  + "arn:aws:iam::<account>:policy/h4-deny-paid-models",
                ]
              + variable = "iam:PolicyARN"
            }
        }
    }

  # data.aws_iam_policy_document.rehearsal_server_action[0] will be read during apply
  # (config refers to values not yet known)
 <= data "aws_iam_policy_document" "rehearsal_server_action" {
      + id            = (known after apply)
      + json          = (known after apply)
      + minified_json = (known after apply)

      + statement {
          + actions   = [
              + "ssm:StartAutomationExecution",
            ]
          + effect    = "Allow"
          + resources = [
              + "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StartEC2Instance:*",
              + "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StopEC2Instance:*",
            ]
          + sid       = "TheStopDocumentAndItsReverse"
        }
      + statement {
          + actions   = [
              + "ec2:StartInstances",
              + "ec2:StopInstances",
            ]
          + effect    = "Allow"
          + resources = [
              + (known after apply),
            ]
          + sid       = "ThatInstanceThroughSystemsManager"

          + condition {
              + test     = "ForAnyValue:StringEquals"
              + values   = [
                  + "ssm.amazonaws.com",
                ]
              + variable = "aws:CalledVia"
            }
        }
      + statement {
          + actions   = [
              + "ec2:DescribeInstanceStatus",
              + "ec2:DescribeInstances",
            ]
          + effect    = "Allow"
          + resources = [
              + "*",
            ]
          + sid       = "ItsState"
        }
    }

  # aws_budgets_budget.rehearsal_model[0] will be created
  + resource "aws_budgets_budget" "rehearsal_model" {
      + account_id        = (known after apply)
      + arn               = (known after apply)
      + budget_type       = "COST"
      + id                = (known after apply)
      + limit_amount      = "0.01"
      + limit_unit        = "USD"
      + name              = "h4-rehearsal-model"
      + name_prefix       = (known after apply)
      + tags              = {
          + "component" = "rehearsal"
        }
      + tags_all          = {
          + "component"   = "rehearsal"
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
          + subscriber_sns_topic_arns  = [
              + "arn:aws:sns:us-east-1:<account>:h4-alerts",
            ]
          + threshold                  = 100
          + threshold_type             = "PERCENTAGE"
        }
    }

  # aws_budgets_budget.rehearsal_server[0] will be created
  + resource "aws_budgets_budget" "rehearsal_server" {
      + account_id        = (known after apply)
      + arn               = (known after apply)
      + budget_type       = "COST"
      + id                = (known after apply)
      + limit_amount      = "0.01"
      + limit_unit        = "USD"
      + metrics           = [
          + "UnblendedCost",
        ]
      + name              = "h4-rehearsal-server"
      + name_prefix       = (known after apply)
      + tags              = {
          + "component" = "rehearsal"
        }
      + tags_all          = {
          + "component"   = "rehearsal"
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
          + subscriber_sns_topic_arns  = [
              + "arn:aws:sns:us-east-1:<account>:h4-alerts",
            ]
          + threshold                  = 100
          + threshold_type             = "PERCENTAGE"
        }
    }

  # aws_budgets_budget_action.rehearsal_model[0] will be created
  + resource "aws_budgets_budget_action" "rehearsal_model" {
      + account_id         = (known after apply)
      + action_id          = (known after apply)
      + action_type        = "APPLY_IAM_POLICY"
      + approval_model     = "AUTOMATIC"
      + arn                = (known after apply)
      + budget_name        = "h4-rehearsal-model"
      + execution_role_arn = (known after apply)
      + id                 = (known after apply)
      + notification_type  = "ACTUAL"
      + status             = (known after apply)
      + tags               = {
          + "component" = "rehearsal"
        }
      + tags_all           = {
          + "component"   = "rehearsal"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + action_threshold {
          + action_threshold_type  = "PERCENTAGE"
          + action_threshold_value = 100
        }

      + definition {
          + iam_action_definition {
              + policy_arn = "arn:aws:iam::<account>:policy/h4-deny-paid-models"
              + roles      = [
                  + "h4-rehearsal-target",
                ]
            }
        }

      + subscriber {
          + address           = "arn:aws:sns:us-east-1:<account>:h4-alerts"
          + subscription_type = "SNS"
        }
    }

  # aws_budgets_budget_action.rehearsal_server[0] will be created
  + resource "aws_budgets_budget_action" "rehearsal_server" {
      + account_id         = (known after apply)
      + action_id          = (known after apply)
      + action_type        = "RUN_SSM_DOCUMENTS"
      + approval_model     = "AUTOMATIC"
      + arn                = (known after apply)
      + budget_name        = "h4-rehearsal-server"
      + execution_role_arn = (known after apply)
      + id                 = (known after apply)
      + notification_type  = "ACTUAL"
      + status             = (known after apply)
      + tags               = {
          + "component" = "rehearsal"
        }
      + tags_all           = {
          + "component"   = "rehearsal"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }

      + action_threshold {
          + action_threshold_type  = "PERCENTAGE"
          + action_threshold_value = 100
        }

      + definition {
          + ssm_action_definition {
              + action_sub_type = "STOP_EC2_INSTANCES"
              + instance_ids    = (known after apply)
              + region          = "us-east-1"
            }
        }

      + subscriber {
          + address           = "arn:aws:sns:us-east-1:<account>:h4-alerts"
          + subscription_type = "SNS"
        }
    }

  # aws_cloudwatch_event_target.credential_audit[0] will be created
  + resource "aws_cloudwatch_event_target" "credential_audit" {
      + arn            = (known after apply)
      + event_bus_name = "default"
      + force_destroy  = false
      + id             = (known after apply)
      + region         = "us-east-1"
      + rule           = "h4-credential-audit-weekly"
      + target_id      = "h4-credential-audit"

      + retry_policy {
          + maximum_event_age_in_seconds = 3600
          + maximum_retry_attempts       = 2
        }
    }

  # aws_cloudwatch_event_target.probe[0] will be created
  + resource "aws_cloudwatch_event_target" "probe" {
      + arn            = (known after apply)
      + event_bus_name = "default"
      + force_destroy  = false
      + id             = (known after apply)
      + region         = "us-east-1"
      + rule           = "h4-probe-every-minute"
      + target_id      = "h4-probe"

      + retry_policy {
          + maximum_event_age_in_seconds = 60
          + maximum_retry_attempts       = 0
        }
    }

  # aws_iam_role.rehearsal_model_action[0] will be created
  + resource "aws_iam_role" "rehearsal_model_action" {
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
      + description           = "The model rehearsal: h4-deny-paid-models on h4-rehearsal-target, and nothing else"
      + force_detach_policies = false
      + id                    = (known after apply)
      + managed_policy_arns   = (known after apply)
      + max_session_duration  = 3600
      + name                  = "h4-budget-action-rehearsal-model"
      + name_prefix           = (known after apply)
      + path                  = "/"
      + tags                  = {
          + "component" = "rehearsal"
        }
      + tags_all              = {
          + "component"   = "rehearsal"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + unique_id             = (known after apply)

      + inline_policy (known after apply)
    }

  # aws_iam_role.rehearsal_server_action[0] will be created
  + resource "aws_iam_role" "rehearsal_server_action" {
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
      + description           = "The server rehearsal: AWS-StopEC2Instance and its reverse on h4-rehearsal-instance, and nothing else"
      + force_detach_policies = false
      + id                    = (known after apply)
      + managed_policy_arns   = (known after apply)
      + max_session_duration  = 3600
      + name                  = "h4-budget-action-rehearsal-server"
      + name_prefix           = (known after apply)
      + path                  = "/"
      + tags                  = {
          + "component" = "rehearsal"
        }
      + tags_all              = {
          + "component"   = "rehearsal"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + unique_id             = (known after apply)

      + inline_policy (known after apply)
    }

  # aws_iam_role.rehearsal_target[0] will be created
  + resource "aws_iam_role" "rehearsal_target" {
      + arn                   = (known after apply)
      + assume_role_policy    = jsonencode(
            {
              + Statement = [
                  + {
                      + Action    = "sts:AssumeRole"
                      + Condition = {
                          + ArnEquals = {
                              + "aws:PrincipalArn" = "arn:aws:iam::<account>:root"
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + AWS = "arn:aws:iam::<account>:root"
                        }
                      + Sid       = "NoOne"
                    },
                ]
              + Version   = "2012-10-17"
            }
        )
      + create_date           = (known after apply)
      + description           = "The model rehearsal's target, of h4-laptop-bedrock's shape; no one assumes it (spec 001 FR-026)"
      + force_detach_policies = false
      + id                    = (known after apply)
      + managed_policy_arns   = (known after apply)
      + max_session_duration  = 3600
      + name                  = "h4-rehearsal-target"
      + name_prefix           = (known after apply)
      + path                  = "/"
      + tags                  = {
          + "component" = "rehearsal"
        }
      + tags_all              = {
          + "component"   = "rehearsal"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + unique_id             = (known after apply)

      + inline_policy (known after apply)
    }

  # aws_iam_role_policy.rehearsal_model_action[0] will be created
  + resource "aws_iam_role_policy" "rehearsal_model_action" {
      + id          = (known after apply)
      + name        = "attach-the-deny"
      + name_prefix = (known after apply)
      + policy      = (known after apply)
      + role        = (known after apply)
    }

  # aws_iam_role_policy.rehearsal_server_action[0] will be created
  + resource "aws_iam_role_policy" "rehearsal_server_action" {
      + id          = (known after apply)
      + name        = "stop-the-rehearsal-instance"
      + name_prefix = (known after apply)
      + policy      = (known after apply)
      + role        = (known after apply)
    }

  # aws_iam_role_policy.rehearsal_target[0] will be created
  + resource "aws_iam_role_policy" "rehearsal_target" {
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

  # aws_instance.rehearsal[0] will be created
  + resource "aws_instance" "rehearsal" {
      + ami                                  = "ami-0ac4d209e5e82d684"
      + arn                                  = (known after apply)
      + associate_public_ip_address          = false
      + availability_zone                    = (known after apply)
      + disable_api_stop                     = (known after apply)
      + disable_api_termination              = (known after apply)
      + ebs_optimized                        = (known after apply)
      + enable_primary_ipv6                  = (known after apply)
      + force_destroy                        = false
      + get_password_data                    = false
      + host_id                              = (known after apply)
      + host_resource_group_arn              = (known after apply)
      + iam_instance_profile                 = (known after apply)
      + id                                   = (known after apply)
      + instance_initiated_shutdown_behavior = (known after apply)
      + instance_lifecycle                   = (known after apply)
      + instance_state                       = (known after apply)
      + instance_type                        = "t4g.nano"
      + ipv6_address_count                   = (known after apply)
      + ipv6_addresses                       = (known after apply)
      + key_name                             = (known after apply)
      + monitoring                           = (known after apply)
      + outpost_arn                          = (known after apply)
      + password_data                        = (known after apply)
      + placement_group                      = (known after apply)
      + placement_group_id                   = (known after apply)
      + placement_partition_number           = (known after apply)
      + primary_network_interface_id         = (known after apply)
      + private_dns                          = (known after apply)
      + private_ip                           = (known after apply)
      + public_dns                           = (known after apply)
      + public_ip                            = (known after apply)
      + region                               = "us-east-1"
      + secondary_private_ips                = (known after apply)
      + security_groups                      = (known after apply)
      + source_dest_check                    = true
      + spot_instance_request_id             = (known after apply)
      + subnet_id                            = (known after apply)
      + tags                                 = {
          + "Name"      = "h4-rehearsal-instance"
          + "component" = "rehearsal"
        }
      + tags_all                             = {
          + "Name"        = "h4-rehearsal-instance"
          + "component"   = "rehearsal"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + tenancy                              = (known after apply)
      + user_data_base64                     = (known after apply)
      + user_data_replace_on_change          = false
      + vpc_security_group_ids               = (known after apply)

      + capacity_reservation_specification (known after apply)

      + cpu_options (known after apply)

      + ebs_block_device (known after apply)

      + enclave_options (known after apply)

      + ephemeral_block_device (known after apply)

      + instance_market_options (known after apply)

      + maintenance_options (known after apply)

      + metadata_options {
          + http_endpoint               = "enabled"
          + http_protocol_ipv6          = "disabled"
          + http_put_response_hop_limit = 1
          + http_tokens                 = "required"
          + instance_metadata_tags      = (known after apply)
        }

      + network_interface (known after apply)

      + primary_network_interface (known after apply)

      + private_dns_name_options (known after apply)

      + root_block_device {
          + delete_on_termination = true
          + device_name           = (known after apply)
          + encrypted             = true
          + iops                  = (known after apply)
          + kms_key_id            = (known after apply)
          + tags_all              = (known after apply)
          + throughput            = (known after apply)
          + volume_id             = (known after apply)
          + volume_size           = (known after apply)
          + volume_type           = "gp3"
        }

      + secondary_network_interface (known after apply)
    }

  # aws_lambda_function.alert_bridge[0] will be created
  + resource "aws_lambda_function" "alert_bridge" {
      + architectures                  = [
          + "arm64",
        ]
      + arn                            = (known after apply)
      + code_sha256                    = (known after apply)
      + description                    = "h4-alerts to Telegram (spec 001 contracts/aws-alerts.md §2)"
      + function_name                  = "h4-alert-bridge"
      + id                             = (known after apply)
      + image_uri                      = "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-alert-bridge@sha256:d245392171b5432b2f159f202e2ed753b793c120388802d1bb2a79dc146ad1b2"
      + invoke_arn                     = (known after apply)
      + last_modified                  = (known after apply)
      + memory_size                    = 128
      + package_type                   = "Image"
      + publish                        = false
      + qualified_arn                  = (known after apply)
      + qualified_invoke_arn           = (known after apply)
      + region                         = "us-east-1"
      + reserved_concurrent_executions = -1
      + response_streaming_invoke_arn  = (known after apply)
      + role                           = "arn:aws:iam::<account>:role/h4-alert-bridge-fn"
      + signing_job_arn                = (known after apply)
      + signing_profile_version_arn    = (known after apply)
      + skip_destroy                   = false
      + source_code_hash               = (known after apply)
      + source_code_size               = (known after apply)
      + tags                           = {
          + "component" = "alert-bridge"
        }
      + tags_all                       = {
          + "component"   = "alert-bridge"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + timeout                        = 30
      + version                        = (known after apply)

      + environment {
          + variables = {
              + "H4_TELEGRAM_CHAT_PARAMETER"  = "/h4reet/alerts/TELEGRAM_CHAT_ID"
              + "H4_TELEGRAM_TOKEN_PARAMETER" = "/h4reet/alerts/TELEGRAM_BOT_TOKEN"
            }
        }

      + ephemeral_storage (known after apply)

      + logging_config {
          + log_format = "Text"
          + log_group  = "/aws/lambda/h4-alert-bridge"
        }

      + tracing_config (known after apply)
    }

  # aws_lambda_function.credential_audit[0] will be created
  + resource "aws_lambda_function" "credential_audit" {
      + architectures                  = [
          + "arm64",
        ]
      + arn                            = (known after apply)
      + code_sha256                    = (known after apply)
      + description                    = "The weekly credential audit (spec 001 contracts/infra-records.md §4)"
      + function_name                  = "h4-credential-audit"
      + id                             = (known after apply)
      + image_uri                      = "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-credential-audit@sha256:9a660808453e99673c769f4fb9e51ffd2b1396bfa15fd7707a3db6881be8793d"
      + invoke_arn                     = (known after apply)
      + last_modified                  = (known after apply)
      + memory_size                    = 256
      + package_type                   = "Image"
      + publish                        = false
      + qualified_arn                  = (known after apply)
      + qualified_invoke_arn           = (known after apply)
      + region                         = "us-east-1"
      + reserved_concurrent_executions = -1
      + response_streaming_invoke_arn  = (known after apply)
      + role                           = "arn:aws:iam::<account>:role/h4-credential-audit-fn"
      + signing_job_arn                = (known after apply)
      + signing_profile_version_arn    = (known after apply)
      + skip_destroy                   = false
      + source_code_hash               = (known after apply)
      + source_code_size               = (known after apply)
      + tags                           = {
          + "component" = "credential-audit"
        }
      + tags_all                       = {
          + "component"   = "credential-audit"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + timeout                        = 120
      + version                        = (known after apply)

      + environment {
          + variables = {
              + "H4_ALERTS_TOPIC_ARN"      = "arn:aws:sns:us-east-1:<account>:h4-alerts"
              + "H4_AUDIT_ALLOW_PARAMETER" = "/h4reet/audit/IAM_ALLOW"
              + "H4_AUDIT_BUCKET"          = "h4reet-ai-releases-4882eb8c403bb9b4c565471254"
            }
        }

      + ephemeral_storage (known after apply)

      + logging_config {
          + log_format = "Text"
          + log_group  = "/aws/lambda/h4-credential-audit"
        }

      + tracing_config (known after apply)
    }

  # aws_lambda_function.probe[0] will be created
  + resource "aws_lambda_function" "probe" {
      + architectures                  = [
          + "arm64",
        ]
      + arn                            = (known after apply)
      + code_sha256                    = (known after apply)
      + description                    = "The uptime probe (spec 001 contracts/aws-alerts.md §5)"
      + function_name                  = "h4-probe"
      + id                             = (known after apply)
      + image_uri                      = "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-probe@sha256:85e0a4e0a428482e9f10829f8fde23313762cce3fc06410b3fd87ca460e7f205"
      + invoke_arn                     = (known after apply)
      + last_modified                  = (known after apply)
      + memory_size                    = 128
      + package_type                   = "Image"
      + publish                        = false
      + qualified_arn                  = (known after apply)
      + qualified_invoke_arn           = (known after apply)
      + region                         = "us-east-1"
      + reserved_concurrent_executions = -1
      + response_streaming_invoke_arn  = (known after apply)
      + role                           = "arn:aws:iam::<account>:role/h4-probe-fn"
      + signing_job_arn                = (known after apply)
      + signing_profile_version_arn    = (known after apply)
      + skip_destroy                   = false
      + source_code_hash               = (known after apply)
      + source_code_size               = (known after apply)
      + tags                           = {
          + "component" = "probe"
        }
      + tags_all                       = {
          + "component"   = "probe"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + timeout                        = 15
      + version                        = (known after apply)

      + environment {
          + variables = {
              + "H4_PROBE_SITE" = "https://hareet.ai"
            }
        }

      + ephemeral_storage (known after apply)

      + logging_config {
          + log_format = "Text"
          + log_group  = "/aws/lambda/h4-probe"
        }

      + tracing_config (known after apply)
    }

  # aws_lambda_function_event_invoke_config.alert_bridge[0] will be created
  + resource "aws_lambda_function_event_invoke_config" "alert_bridge" {
      + function_name                = "h4-alert-bridge"
      + id                           = (known after apply)
      + maximum_event_age_in_seconds = 3600
      + maximum_retry_attempts       = 2
      + region                       = "us-east-1"

      + destination_config {
          + on_failure {
              + destination = "arn:aws:sqs:us-east-1:<account>:h4-alert-bridge-failed"
            }
        }
    }

  # aws_lambda_function_event_invoke_config.credential_audit[0] will be created
  + resource "aws_lambda_function_event_invoke_config" "credential_audit" {
      + function_name                = "h4-credential-audit"
      + id                           = (known after apply)
      + maximum_event_age_in_seconds = 3600
      + maximum_retry_attempts       = 1
      + region                       = "us-east-1"
    }

  # aws_lambda_function_event_invoke_config.probe[0] will be created
  + resource "aws_lambda_function_event_invoke_config" "probe" {
      + function_name                = "h4-probe"
      + id                           = (known after apply)
      + maximum_event_age_in_seconds = 60
      + maximum_retry_attempts       = 0
      + region                       = "us-east-1"
    }

  # aws_lambda_permission.alert_bridge_sns[0] will be created
  + resource "aws_lambda_permission" "alert_bridge_sns" {
      + action              = "lambda:InvokeFunction"
      + function_name       = "h4-alert-bridge"
      + id                  = (known after apply)
      + principal           = "sns.amazonaws.com"
      + region              = "us-east-1"
      + source_arn          = "arn:aws:sns:us-east-1:<account>:h4-alerts"
      + statement_id        = "h4-alerts"
      + statement_id_prefix = (known after apply)
    }

  # aws_lambda_permission.credential_audit_events[0] will be created
  + resource "aws_lambda_permission" "credential_audit_events" {
      + action              = "lambda:InvokeFunction"
      + function_name       = "h4-credential-audit"
      + id                  = (known after apply)
      + principal           = "events.amazonaws.com"
      + region              = "us-east-1"
      + source_arn          = "arn:aws:events:us-east-1:<account>:rule/h4-credential-audit-weekly"
      + statement_id        = "h4-credential-audit-weekly"
      + statement_id_prefix = (known after apply)
    }

  # aws_lambda_permission.probe_events[0] will be created
  + resource "aws_lambda_permission" "probe_events" {
      + action              = "lambda:InvokeFunction"
      + function_name       = "h4-probe"
      + id                  = (known after apply)
      + principal           = "events.amazonaws.com"
      + region              = "us-east-1"
      + source_arn          = "arn:aws:events:us-east-1:<account>:rule/h4-probe-every-minute"
      + statement_id        = "h4-probe-every-minute"
      + statement_id_prefix = (known after apply)
    }

  # aws_security_group.rehearsal[0] will be created
  + resource "aws_security_group" "rehearsal" {
      + arn                    = (known after apply)
      + description            = "h4-rehearsal-instance: no rule in or out"
      + egress                 = (known after apply)
      + id                     = (known after apply)
      + ingress                = (known after apply)
      + name                   = "h4-rehearsal"
      + name_prefix            = (known after apply)
      + owner_id               = (known after apply)
      + region                 = "us-east-1"
      + revoke_rules_on_delete = false
      + tags                   = {
          + "component" = "rehearsal"
        }
      + tags_all               = {
          + "component"   = "rehearsal"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + vpc_id                 = (known after apply)
    }

  # aws_sns_topic_subscription.alert_bridge[0] will be created
  + resource "aws_sns_topic_subscription" "alert_bridge" {
      + arn                             = (known after apply)
      + confirmation_timeout_in_minutes = 1
      + confirmation_was_authenticated  = (known after apply)
      + endpoint                        = (known after apply)
      + endpoint_auto_confirms          = false
      + filter_policy_scope             = (known after apply)
      + id                              = (known after apply)
      + owner_id                        = (known after apply)
      + pending_confirmation            = (known after apply)
      + protocol                        = "lambda"
      + raw_message_delivery            = false
      + region                          = "us-east-1"
      + topic_arn                       = "arn:aws:sns:us-east-1:<account>:h4-alerts"
    }

  # aws_subnet.rehearsal[0] will be created
  + resource "aws_subnet" "rehearsal" {
      + arn                                            = (known after apply)
      + assign_ipv6_address_on_creation                = false
      + availability_zone                              = (known after apply)
      + availability_zone_id                           = (known after apply)
      + cidr_block                                     = "10.250.0.0/28"
      + enable_dns64                                   = false
      + enable_resource_name_dns_a_record_on_launch    = false
      + enable_resource_name_dns_aaaa_record_on_launch = false
      + id                                             = (known after apply)
      + ipv6_cidr_block                                = (known after apply)
      + ipv6_cidr_block_association_id                 = (known after apply)
      + ipv6_native                                    = false
      + map_public_ip_on_launch                        = false
      + owner_id                                       = (known after apply)
      + private_dns_hostname_type_on_launch            = (known after apply)
      + region                                         = "us-east-1"
      + tags                                           = {
          + "Name"      = "h4-rehearsal"
          + "component" = "rehearsal"
        }
      + tags_all                                       = {
          + "Name"        = "h4-rehearsal"
          + "component"   = "rehearsal"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
      + vpc_id                                         = (known after apply)
    }

  # aws_vpc.rehearsal[0] will be created
  + resource "aws_vpc" "rehearsal" {
      + arn                                  = (known after apply)
      + cidr_block                           = "10.250.0.0/28"
      + default_network_acl_id               = (known after apply)
      + default_route_table_id               = (known after apply)
      + default_security_group_id            = (known after apply)
      + dhcp_options_id                      = (known after apply)
      + enable_dns_hostnames                 = (known after apply)
      + enable_dns_support                   = true
      + enable_network_address_usage_metrics = (known after apply)
      + id                                   = (known after apply)
      + instance_tenancy                     = "default"
      + ipv6_association_id                  = (known after apply)
      + ipv6_cidr_block                      = (known after apply)
      + ipv6_cidr_block_network_border_group = (known after apply)
      + main_route_table_id                  = (known after apply)
      + owner_id                             = (known after apply)
      + region                               = "us-east-1"
      + tags                                 = {
          + "Name"      = "h4-rehearsal"
          + "component" = "rehearsal"
        }
      + tags_all                             = {
          + "Name"        = "h4-rehearsal"
          + "component"   = "rehearsal"
          + "environment" = "account"
          + "project"     = "h4reet-ai"
        }
    }

Plan: 26 to add, 0 to change, 0 to destroy.
```
<!-- /h4-plan -->

## Checks

- **RED, at 176a6a4d:** `infra/lambdas/credential_audit` fails exactly the two new tests: the set named as iam.tf's, and the name read at each run.
- **GREEN, with the rehearsal on (this branch's tip):**
  - `infra/test`, `infra/lambdas`, and `evals/test_disclosure.py`: 313 passed;
  - `scripts/infra`, `tools/gates/test/test_disclosure_check.py`, and `tools/gates/test/test_infra_policy.py`: 212 passed, plus one failure caused by the sandbox (`test_infra_check_runs_the_policy_then_waits_for_terraform` can't `mktemp` in its read-only `/tmp`).
- **With the rehearsal off,** on a copy with `rehearsal = false` and no marker, as the branch that ends it will have: `infra/test` gives 125 passed. The three rehearsal tests now follow the tree's state, so both pass.
- **The tools:** `tools/gates/disclosure_check.py` passes ("every outward thing the tree holds has its row"); `tools/gates/infra_policy.py --root .` passes, 15 files; `terraform fmt -check` passes on `main.tf`; ruff passes.

## Cost and data-flow impact

- **Cost:** the rehearsal's `t4g.nano` costs cents while it runs. The two $0.01 budgets are among Budgets' free actions while they exist. The three functions stay inside Lambda's free tier: the bridge on each alert, the audit weekly, and the probe's schedule written DISABLED (group 8 enables it).
- **Data flow:** no new flow. Row F2 now names the STS host it already used.
