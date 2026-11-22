# fix/032-lambda-images
Spec: specs/032-spot-flexibility/ (its note's "For the Author", step 6) · Intent: specs/032-spot-flexibility/intent.md · Written by: Claude Code (the Author's session) · Date: 2026-11-22
Session: /tmp/claude-1000/wt-fix-032-images (worktree of /home/h4reet/h4reet-ai/h4reet-ai) · Repo hooks active: yes (the commit ran the gitleaks and arrival-check hooks)
Authorized by: spec 032's plan and its note's step 6, and the Author's pushes of the three images

## What changed and why

`infra/account/main.tf`'s `local.lambda_images` takes the three digests the Author pushed from main `f2f63e7f` (the
2026-11-22 stack's merge), for linux/arm64 with provenance off, as W2's T174 built them:

| Function | Digest | Why it changed |
|---|---|---|
| `ec2_start` | `sha256:b457ac9f4f7458cce2df54c40e7d781cae842d568cd3d39cb7382578d07e6992` | spec 032: the replace from the type list, the dry runs, the repair, the tunnel-end check |
| `ec2_guard` | `sha256:67866d55c51facdf86cfca79ba94920aceea2f6d0ff91712ead29adc2b616b95` | spec 032: the `budget_check` trigger, `not_ec2` |
| `credential_audit` | `sha256:76f01fe94d7aeec7ca4d91d7e975ebc5c69bdc3c2a7fbd22b2fbcb1cde1be0da` | spec 032: `run_holds`, the launch permissions' check |

032's note named only the first two. The credential audit's source changed in the same stack, so without its image
the deployed audit would keep the check that passed round one's over-broad statements.

The account's apply must not run before these are in: the new five-minute budget check would call the guard's old
image, which refuses an unknown trigger and alerts every five minutes; and the start function's new timeout and
schedule belong to its new code.

## Acceptance criteria

Spec 032's FR for the start function, the guard and the credential audit run the reviewed code (spec 032's SC on the
dry runs and the fallback follow in its note's steps 6 to 9).

## Constitution check

Images built once and promoted unchanged, by digest; no apply here (the Author's plan and apply follow); no secret or
account ID in the repository.

## Review

None by an agent: three digests the Author pushed, written as given; the comment beside them says where they came
from. The account's plan block below is the review of what they change.

## Verification

From the worktree: `uv run --offline --frozen pytest -q -p no:cacheprovider infra/test/test_account.py`, `104 passed
in 5.42s`; `infra/test`, `390 passed in 9.76s`.

## Cost and data-flow impact

None.

## For the Author

1. The account's plan from a fresh clone of this branch, its block appended here, committed, and the plan-note check
   (the runbook's B1 and B2). Read it for: `aws_lambda_function.ec2_start[0]`, `ec2_guard[0]` and
   `credential_audit[0]` updated in place (their image URIs; the start function's timeout 900), the start function's
   policy and invoke config updated, the two schedules created (`tunnel_end_check` with `state = "DISABLED"`), and
   nothing destroyed or replaced.
2. Your gate on this branch and the merge.
3. The account's apply from main (`infra-verify ROOT=account`, the apply line it prints, `infra-record`).
4. Then spec 032's note, step 6's dry runs, the DeleteOnTermination check, and the tunnel-end check enabled.

## The account's plan

<!-- h4-plan root=account tree=2ef1910982ae3e78c61bea21c5eda2fa6068606c sha256=61933d1bfaba00c299acd57102fb51c88d67a079a76bf18eb0bb57d8a5f47f12 terraform=1.17.1 made=2026-11-22T19:58:41Z -->
```terraform-plan

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
  ~ update in-place

Terraform will perform the following actions:

  # aws_iam_role_policy.ec2_start will be updated in-place
  ~ resource "aws_iam_role_policy" "ec2_start" {
        id          = "h4-ec2-start-fn:ec2-start"
        name        = "ec2-start"
      ~ policy      = jsonencode(
          ~ {
              ~ Statement = [
                    {
                        Action   = [
                            "logs:PutLogEvents",
                            "logs:CreateLogStream",
                        ]
                        Effect   = "Allow"
                        Resource = "arn:aws:logs:us-east-1:<account>:log-group:/aws/lambda/h4-ec2-start:*"
                        Sid      = "ItsLog"
                    },
                  ~ {
                      ~ Resource = [
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/tunnel-end-launch-templates",
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/relay-vpc-origin-id",
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/host-lock",
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/ec2-launch-templates",
                            "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/ec2-instance-id",
                            # (1 unchanged element hidden)
                        ]
                        # (3 unchanged attributes hidden)
                    },
                  + {
                      + Action   = "ssm:PutParameter"
                      + Effect   = "Allow"
                      + Resource = [
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/host-lock",
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/ec2-instance-id",
                        ]
                      + Sid      = "EC2sIDAndTheLock"
                    },
                  + {
                      + Action   = "ssm:DeleteParameter"
                      + Effect   = "Allow"
                      + Resource = "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/host-lock"
                      + Sid      = "TheLocksRelease"
                    },
                    {
                        Action   = "budgets:DescribeBudgetActionsForBudget"
                        Effect   = "Allow"
                        Resource = "arn:aws:budgets::<account>:budget/h4-server-month"
                        Sid      = "TheServerActionsStatus"
                    },
                  ~ {
                      ~ Action   = "ec2:DescribeInstances" -> [
                          + "ec2:DescribeVolumes",
                          + "ec2:DescribeSpotInstanceRequests",
                          + "ec2:DescribeInstances",
                        ]
                        # (3 unchanged attributes hidden)
                    },
                    {
                        Action   = "cloudwatch:DescribeAlarms"
                        Effect   = "Allow"
                        Resource = "arn:aws:cloudwatch:us-east-1:<account>:alarm:h4-laptop-away"
                        Sid      = "TheLaptopsAlarm"
                    },
                    {
                        Action    = "ec2:StartInstances"
                        Condition = {
                            StringEquals = {
                                "ec2:ResourceTag/Name" = "h4-prod-ec2"
                            }
                        }
                        Effect    = "Allow"
                        Resource  = "arn:aws:ec2:us-east-1:<account>:instance/*"
                        Sid       = "StartTheTaggedInstance"
                    },
                  + {
                      + Action    = "ec2:RunInstances"
                      + Condition = {
                          + StringEquals = {
                              + "aws:ResourceTag/component" = [
                                  + "ec2",
                                  + "tunnel-end",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = "arn:aws:ec2:us-east-1:<account>:launch-template/*"
                      + Sid       = "LaunchFromTheHostsTemplates"
                    },
                  + {
                      + Action    = "ec2:RunInstances"
                      + Condition = {
                          + StringEquals = {
                              + "aws:RequestTag/Name"    = [
                                  + "h4-prod-ec2",
                                  + "h4-prod-tunnel-end",
                                ]
                              + "ec2:InstanceMarketType" = "spot"
                              + "ec2:InstanceType"       = [
                                  + "t4g.large",
                                  + "m7g.large",
                                  + "m6g.large",
                                  + "t4g.xlarge",
                                  + "t4g.small",
                                  + "c7g.medium",
                                  + "c6g.medium",
                                  + "t4g.medium",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = "arn:aws:ec2:us-east-1:<account>:instance/*"
                      + Sid       = "LaunchOnlyAHost"
                    },
                  + {
                      + Action    = "ec2:RunInstances"
                      + Condition = {
                          + ArnLike = {
                              + "ec2:LaunchTemplate" = "arn:aws:ec2:us-east-1:<account>:launch-template/*"
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:ec2:us-east-1:<account>:volume/*",
                          + "arn:aws:ec2:us-east-1:<account>:spot-instances-request/*",
                        ]
                      + Sid       = "WhatALaunchFromATemplateMakes"
                    },
                  + {
                      + Action    = "ec2:RunInstances"
                      + Condition = {
                          + ArnLike = {
                              + "ec2:LaunchTemplate" = "arn:aws:ec2:us-east-1:<account>:launch-template/*"
                            }
                          + Bool    = {
                              + "ec2:IsLaunchTemplateResource" = "true"
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:ec2:us-east-1::image/*",
                          + "arn:aws:ec2:us-east-1:<account>:subnet/*",
                          + "arn:aws:ec2:us-east-1:<account>:security-group/*",
                          + "arn:aws:ec2:us-east-1:<account>:network-interface/*",
                        ]
                      + Sid       = "WhatOnlyTheTemplateNames"
                    },
                  + {
                      + Action    = "ec2:CreateTags"
                      + Condition = {
                          + StringEquals = {
                              + "ec2:CreateAction" = "RunInstances"
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = "arn:aws:ec2:us-east-1:<account>:*/*"
                      + Sid       = "TagOnlyAtTheLaunch"
                    },
                  + {
                      + Action    = [
                          + "ec2:TerminateInstances",
                          + "ec2:CancelSpotInstanceRequests",
                        ]
                      + Condition = {
                          + StringEquals = {
                              + "ec2:ResourceTag/Name" = [
                                  + "h4-prod-ec2",
                                  + "h4-prod-tunnel-end",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:ec2:us-east-1:<account>:spot-instances-request/*",
                          + "arn:aws:ec2:us-east-1:<account>:instance/*",
                        ]
                      + Sid       = "RetireTheOldHost"
                    },
                  + {
                      + Action    = "ec2:AttachVolume"
                      + Condition = {
                          + StringEquals = {
                              + "ec2:ResourceTag/Name" = [
                                  + "h4-prod-ec2",
                                  + "h4-prod-tunnel-end",
                                  + "h4-ec2-data",
                                  + "h4-shared-state",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:ec2:us-east-1:<account>:volume/*",
                          + "arn:aws:ec2:us-east-1:<account>:instance/*",
                        ]
                      + Sid       = "AttachTheHostsVolume"
                    },
                  + {
                      + Action    = "iam:PassRole"
                      + Condition = {
                          + StringEquals = {
                              + "iam:PassedToService" = "ec2.amazonaws.com"
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:iam::<account>:role/h4-prod-tunnel-end",
                          + "arn:aws:iam::<account>:role/h4-prod-ec2",
                        ]
                      + Sid       = "PassTheHostsRolesToEC2"
                    },
                  + {
                      + Action   = [
                          + "cloudfront:UpdateVpcOrigin",
                          + "cloudfront:GetVpcOrigin",
                        ]
                      + Effect   = "Allow"
                      + Resource = "arn:aws:cloudfront::<account>:vpcorigin/*"
                      + Sid      = "RepointTheRelaysOrigin"
                    },
                    {
                        Action   = "sns:Publish"
                        Effect   = "Allow"
                        Resource = "arn:aws:sns:us-east-1:<account>:h4-alerts"
                        Sid      = "ItsAlerts"
                    },
                ]
                # (1 unchanged attribute hidden)
            }
        )
        # (2 unchanged attributes hidden)
    }

  # aws_lambda_function.credential_audit[0] will be updated in-place
  ~ resource "aws_lambda_function" "credential_audit" {
        id                             = "h4-credential-audit"
      ~ image_uri                      = "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-credential-audit@sha256:dd899845f873e200d23db827797e8e556588f5c4c74aee2c4e4e1f0d71264494" -> "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-credential-audit@sha256:76f01fe94d7aeec7ca4d91d7e975ebc5c69bdc3c2a7fbd22b2fbcb1cde1be0da"
      ~ last_modified                  = "2026-11-13T05:30:15.000+0000" -> (known after apply)
        tags                           = {
            "component" = "credential-audit"
        }
        # (29 unchanged attributes hidden)

        # (4 unchanged blocks hidden)
    }

  # aws_lambda_function.ec2_guard[0] will be updated in-place
  ~ resource "aws_lambda_function" "ec2_guard" {
        id                             = "h4-ec2-guard"
      ~ image_uri                      = "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-ec2-guard@sha256:0172b6d16564624020224dd73a8212d990e7e54acbf739b549239d146f76fdd6" -> "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-ec2-guard@sha256:67866d55c51facdf86cfca79ba94920aceea2f6d0ff91712ead29adc2b616b95"
      ~ last_modified                  = "2026-11-17T00:36:56.397+0000" -> (known after apply)
        tags                           = {
            "component" = "handover"
        }
        # (29 unchanged attributes hidden)

        # (4 unchanged blocks hidden)
    }

  # aws_lambda_function.ec2_start[0] will be updated in-place
  ~ resource "aws_lambda_function" "ec2_start" {
        id                             = "h4-ec2-start"
      ~ image_uri                      = "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-ec2-start@sha256:bd6a6a044d5d0c8353db65066bdbfa86627bef972d567c08850646f85df93a8a" -> "<account>.dkr.ecr.us-east-1.amazonaws.com/h4-ec2-start@sha256:b457ac9f4f7458cce2df54c40e7d781cae842d568cd3d39cb7382578d07e6992"
      ~ last_modified                  = "2026-11-17T00:36:56.392+0000" -> (known after apply)
        tags                           = {
            "component" = "handover"
        }
      ~ timeout                        = 30 -> 900
        # (28 unchanged attributes hidden)

        # (4 unchanged blocks hidden)
    }

  # aws_lambda_function_event_invoke_config.ec2_start[0] will be updated in-place
  ~ resource "aws_lambda_function_event_invoke_config" "ec2_start" {
        id                           = "h4-ec2-start"
      ~ maximum_event_age_in_seconds = 300 -> 900
        # (4 unchanged attributes hidden)
    }

  # aws_scheduler_schedule.ec2_budget_check[0] will be created
  + resource "aws_scheduler_schedule" "ec2_budget_check" {
      + action_after_completion      = (known after apply)
      + arn                          = (known after apply)
      + description                  = "The guard's budget check: h4-ec2-guard, from budget_check (spec 032)"
      + group_name                   = (known after apply)
      + id                           = (known after apply)
      + name                         = "h4-ec2-budget-check"
      + name_prefix                  = (known after apply)
      + region                       = "us-east-1"
      + schedule_expression          = "rate(5 minutes)"
      + schedule_expression_timezone = "UTC"
      + state                        = "ENABLED"

      + flexible_time_window {
          + mode = "OFF"
        }

      + target {
          + arn      = "arn:aws:lambda:us-east-1:<account>:function:h4-ec2-guard"
          + input    = jsonencode(
                {
                  + from = "budget_check"
                }
            )
          + role_arn = "arn:aws:iam::<account>:role/h4-ec2-hours"

          + retry_policy {
              + maximum_event_age_in_seconds = 86400
              + maximum_retry_attempts       = 0
            }
        }
    }

  # aws_scheduler_schedule.tunnel_end_check[0] will be created
  + resource "aws_scheduler_schedule" "tunnel_end_check" {
      + action_after_completion      = (known after apply)
      + arn                          = (known after apply)
      + description                  = "The tunnel end's check: the start function, from tunnel_end_check (spec 032)"
      + group_name                   = (known after apply)
      + id                           = (known after apply)
      + name                         = "h4-tunnel-end-check"
      + name_prefix                  = (known after apply)
      + region                       = "us-east-1"
      + schedule_expression          = "rate(5 minutes)"
      + schedule_expression_timezone = "UTC"
      + state                        = "DISABLED"

      + flexible_time_window {
          + mode = "OFF"
        }

      + target {
          + arn      = "arn:aws:lambda:us-east-1:<account>:function:h4-ec2-start"
          + input    = jsonencode(
                {
                  + from = "tunnel_end_check"
                }
            )
          + role_arn = "arn:aws:iam::<account>:role/h4-ec2-hours"

          + retry_policy {
              + maximum_event_age_in_seconds = 86400
              + maximum_retry_attempts       = 0
            }
        }
    }

Plan: 2 to add, 5 to change, 0 to destroy.
```
<!-- /h4-plan -->
