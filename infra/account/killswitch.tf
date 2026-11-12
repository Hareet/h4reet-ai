# The budget actions (spec 001 FR-023, FR-026; research.md R-22; contracts/aws-alerts.md §4): the model action on
# h4-model-month, which attaches h4-deny-paid-models to h4-laptop-bedrock (and, from group 7, to EC2's h4-prod-gateway),
# and, while main.tf's local.rehearsal is true, both actions' rehearsals on $0.01 budgets of the real ones' shape. The
# server action itself waits for EC2 (group 7). Protected (FR-012; rule T5): it changes only by the Author's patch.

resource "aws_iam_policy" "deny_paid_models" {
  name        = "h4-deny-paid-models"
  path        = "/"
  description = "Bedrock's invocations denied: the model action's policy (spec 001 FR-023)"
  policy      = data.aws_iam_policy_document.deny_paid_models.json

  tags = {
    component = "kill-switch"
  }
}

data "aws_iam_policy_document" "deny_paid_models" {
  statement {
    sid       = "DenyPaidModels"
    effect    = "Deny"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"]
  }
}

# AWS Budgets runs each action with its execution role, for this account alone.
data "aws_iam_policy_document" "budgets_trust" {
  statement {
    sid     = "BudgetsForThisAccount"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

# ----------------------------------------------------------------------------------------------------------------------
# The model action: at 100% of h4-model-month's actual cost (infra/bootstrap/budgets.tf), automatically. Its role may
# attach and detach that one policy, on that one role, and nothing else. The Author reverses it after the incident
# note (docs/runbooks/aws-budget-action.md).

resource "aws_iam_role" "model_action" {
  name               = "h4-budget-action-model"
  path               = "/"
  description        = "The model action: h4-deny-paid-models on the Bedrock roles, and nothing else"
  assume_role_policy = data.aws_iam_policy_document.budgets_trust.json

  tags = {
    component = "kill-switch"
  }
}

data "aws_iam_policy_document" "model_action" {
  statement {
    sid       = "ThatPolicyOnThoseRoles"
    effect    = "Allow"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = [aws_iam_role.laptop_bedrock.arn]

    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = [aws_iam_policy.deny_paid_models.arn]
    }
  }
}

resource "aws_iam_role_policy" "model_action" {
  name   = "attach-the-deny"
  role   = aws_iam_role.model_action.id
  policy = data.aws_iam_policy_document.model_action.json
}

resource "aws_budgets_budget_action" "model" {
  budget_name        = "h4-model-month"
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.model_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.deny_paid_models.arn
      roles      = [aws_iam_role.laptop_bedrock.name]
    }
  }

  subscriber {
    address           = data.aws_sns_topic.alerts.arn
    subscription_type = "SNS"
  }

  depends_on = [aws_iam_role_policy.model_action]
}

# ----------------------------------------------------------------------------------------------------------------------
# The rehearsals (FR-026; SC-009), while local.rehearsal is true: two $0.01 budgets of the real ones' shape, the model
# rehearsal's on Bedrock's spend (var.bedrock_service_names) and the server rehearsal's on h4-server-month's filter, so
# each fires on spend the month already holds, and proves its filter too. Each acts, automatically, at 100%, as the
# real ones do: the model rehearsal attaches the deny to h4-rehearsal-target, and the server rehearsal stops
# h4-rehearsal-instance through Systems Manager (main.tf). The model rehearsal fires only once the month holds a cent of
# Bedrock's spend. Prod's route on main names the Anthropic API, so that cent comes from the Author's live runs on
# Bedrock: one `make redteam-live ADAPTER=bedrock ENV=prod` run cost about $0.055 on 2026-11-09, metered as `test`
# inside the ceilings, and November's runs already hold about $0.49 (the merge-request note). Like h4-model-month, it
# counts usage, not cost net of credits, so a credit can't hide the cent (T038's review, nit 2); the server rehearsal
# keeps AWS's default, as h4-server-month does.

resource "aws_budgets_budget" "rehearsal_model" {
  count        = local.rehearsal ? 1 : 0
  name         = "h4-rehearsal-model"
  budget_type  = "COST"
  limit_amount = "0.01"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = var.bedrock_service_names
  }

  cost_types {
    include_credit = false
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [data.aws_sns_topic.alerts.arn]
  }

  tags = {
    component = "rehearsal"
  }
}

resource "aws_iam_role" "rehearsal_model_action" {
  count              = local.rehearsal ? 1 : 0
  name               = "h4-budget-action-rehearsal-model"
  path               = "/"
  description        = "The model rehearsal: h4-deny-paid-models on h4-rehearsal-target, and nothing else"
  assume_role_policy = data.aws_iam_policy_document.budgets_trust.json

  tags = {
    component = "rehearsal"
  }
}

data "aws_iam_policy_document" "rehearsal_model_action" {
  count = local.rehearsal ? 1 : 0

  statement {
    sid       = "ThatPolicyOnTheTarget"
    effect    = "Allow"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = [aws_iam_role.rehearsal_target[0].arn]

    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = [aws_iam_policy.deny_paid_models.arn]
    }
  }
}

resource "aws_iam_role_policy" "rehearsal_model_action" {
  count  = local.rehearsal ? 1 : 0
  name   = "attach-the-deny"
  role   = aws_iam_role.rehearsal_model_action[0].id
  policy = data.aws_iam_policy_document.rehearsal_model_action[0].json
}

resource "aws_budgets_budget_action" "rehearsal_model" {
  count              = local.rehearsal ? 1 : 0
  budget_name        = aws_budgets_budget.rehearsal_model[0].name
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.rehearsal_model_action[0].arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.deny_paid_models.arn
      roles      = [aws_iam_role.rehearsal_target[0].name]
    }
  }

  subscriber {
    address           = data.aws_sns_topic.alerts.arn
    subscription_type = "SNS"
  }

  depends_on = [aws_iam_role_policy.rehearsal_model_action]
}

resource "aws_budgets_budget" "rehearsal_server" {
  count        = local.rehearsal ? 1 : 0
  name         = "h4-rehearsal-server"
  budget_type  = "COST"
  limit_amount = "0.01"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  # hashicorp/aws 6.72.0 refuses filter_expression without metrics (the T027 plan, 2026-11-11). Unblended cost:
  # the account has no credits (the Author's answer, 2026-11-11).
  metrics = ["UnblendedCost"]

  # h4-server-month's filter (ADR 0047), so tripping the rehearsal proves the real budget reads this project's spend.
  filter_expression {
    and {
      not {
        dimensions {
          key    = "SERVICE"
          values = var.bedrock_service_names
        }
      }
    }
    and {
      tags {
        key    = "project"
        values = ["h4reet-ai"]
      }
    }
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [data.aws_sns_topic.alerts.arn]
  }

  tags = {
    component = "rehearsal"
  }
}

resource "aws_iam_role" "rehearsal_server_action" {
  count              = local.rehearsal ? 1 : 0
  name               = "h4-budget-action-rehearsal-server"
  path               = "/"
  description        = "The server rehearsal: AWS-StopEC2Instance and its reverse on h4-rehearsal-instance, and nothing else"
  assume_role_policy = data.aws_iam_policy_document.budgets_trust.json

  tags = {
    component = "rehearsal"
  }
}

# As AWS's managed policy for these actions, AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM, shapes it,
# as far as the repository can say, narrowed to the one instance (T038's review, nit 1): the stop document and the
# start that reverses it (REVERSE_BUDGET_ACTION runs AWS-StartEC2Instance); EC2's start and stop on that instance,
# only as Systems Manager calls them; and EC2's Describe calls, which take no narrower resource. To confirm at T037,
# against the managed policy's current version in IAM's console; what else, if anything, Budgets asks of the role is
# what the rehearsal shows (tasks.md T040).
data "aws_iam_policy_document" "rehearsal_server_action" {
  count = local.rehearsal ? 1 : 0

  statement {
    sid     = "TheStopDocumentAndItsReverse"
    effect  = "Allow"
    actions = ["ssm:StartAutomationExecution"]
    resources = [
      "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StopEC2Instance:*",
      "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StartEC2Instance:*",
    ]
  }

  statement {
    sid       = "ThatInstanceThroughSystemsManager"
    effect    = "Allow"
    actions   = ["ec2:StartInstances", "ec2:StopInstances"]
    resources = [aws_instance.rehearsal[0].arn]

    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "aws:CalledVia"
      values   = ["ssm.amazonaws.com"]
    }
  }

  statement {
    sid       = "ItsState"
    effect    = "Allow"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "rehearsal_server_action" {
  count  = local.rehearsal ? 1 : 0
  name   = "stop-the-rehearsal-instance"
  role   = aws_iam_role.rehearsal_server_action[0].id
  policy = data.aws_iam_policy_document.rehearsal_server_action[0].json
}

resource "aws_budgets_budget_action" "rehearsal_server" {
  count              = local.rehearsal ? 1 : 0
  budget_name        = aws_budgets_budget.rehearsal_server[0].name
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.rehearsal_server_action[0].arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_EC2_INSTANCES"
      instance_ids    = [aws_instance.rehearsal[0].id]
      region          = "us-east-1"
    }
  }

  subscriber {
    address           = data.aws_sns_topic.alerts.arn
    subscription_type = "SNS"
  }

  depends_on = [aws_iam_role_policy.rehearsal_server_action]
}
