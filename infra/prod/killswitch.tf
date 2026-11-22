# Prod's budget actions (spec 001 FR-021, FR-023; research.md R-22, amended; contracts/aws-alerts.md §4; plan.md §16,
# "No root holds another root's instance or health-check ID", W1's departure 10; ADR 0049, proposed): the server action,
# which stops EC2, and EC2's model action, which revokes Bedrock from h4-prod-gateway. Each names what it acts on from
# this root, beside it, and each is W1's, made in the same apply as what it acts on. From spec 032 the server action
# names the EC2 instance this root reads by its tag (ec2.tf), so the next plan after h4-ec2-start replaces EC2
# re-points it (spec 032 Assumptions, "The gap after a replace"; ADR 0057), and its role names EC2 by tag. What they
# share with the account's, the budgets and the deny policy, they name by name. Protected (FR-012; rule T5): it changes
# only by the Author's patch, P-I4, then P-032-prod.

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
# The server action (FR-023): at 100% of h4-server-month's actual cost (infra/bootstrap/budgets.tf), automatically, it
# stops EC2 through Systems Manager's AWS-StopEC2Instance. The start function refuses while it stands
# (server_budget_stopped; group 9), and `make server-budget-restore` reverses it (docs/runbooks/server-budget.md). Its
# role, as the rehearsal's (infra/account/killswitch.tf), may run that document and its reverse, on EC2 alone.

resource "aws_iam_role" "server_action" {
  name               = "h4-budget-action-server"
  path               = "/"
  description        = "The server action: AWS-StopEC2Instance and its reverse on EC2, and nothing else"
  assume_role_policy = data.aws_iam_policy_document.budgets_trust.json

  tags = {
    component = "kill-switch"
  }
}

data "aws_iam_policy_document" "server_action" {
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
    resources = ["arn:aws:ec2:us-east-1:${data.aws_caller_identity.current.account_id}:instance/*"]

    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "aws:CalledVia"
      values   = ["ssm.amazonaws.com"]
    }

    # EC2 by its tag, not its ARN, from spec 032: h4-ec2-start may replace it with an instance of another type.
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Name"
      values   = ["h4-prod-ec2"]
    }
  }

  statement {
    sid       = "ItsState"
    effect    = "Allow"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "server_action" {
  name   = "stop-ec2"
  role   = aws_iam_role.server_action.id
  policy = data.aws_iam_policy_document.server_action.json
}

resource "aws_budgets_budget_action" "server" {
  budget_name        = "h4-server-month"
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.server_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_EC2_INSTANCES"
      instance_ids    = [data.aws_instance.ec2.id]
      region          = "us-east-1"
    }
  }

  subscriber {
    address           = "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"
    subscription_type = "SNS"
  }

  tags = {
    component = "kill-switch"
  }

  depends_on = [aws_iam_role_policy.server_action]
}

# ----------------------------------------------------------------------------------------------------------------------
# EC2's model action (FR-023; tasks.md T180): a second action on h4-model-month, by its name, at 100% of actual,
# automatically, attaching the account's h4-deny-paid-models to h4-prod-gateway alone. The account's model action
# reaches h4-laptop-bedrock and gains no target. Whether one budget may hold two actions of one type shows in W1's prod
# apply, not its plan, which never calls Budgets; if it may not, that apply fails at this resource alone, EC2 must be
# stopped before anything else, and the fallback is the account's second target behind the switch (research.md R-22).
# Both steps, and the reverse after the incident note, are docs/runbooks/aws-budget-action.md's.

resource "aws_iam_role" "model_action" {
  name               = "h4-budget-action-model-ec2"
  path               = "/"
  description        = "EC2's model action: h4-deny-paid-models on h4-prod-gateway, and nothing else"
  assume_role_policy = data.aws_iam_policy_document.budgets_trust.json

  tags = {
    component = "kill-switch"
  }
}

data "aws_iam_policy_document" "model_action" {
  statement {
    sid       = "ThatPolicyOnThatRole"
    effect    = "Allow"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = [aws_iam_role.gateway.arn]

    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/h4-deny-paid-models"]
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
      policy_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/h4-deny-paid-models"
      roles      = [aws_iam_role.gateway.name]
    }
  }

  subscriber {
    address           = "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"
    subscription_type = "SNS"
  }

  tags = {
    component = "kill-switch"
  }

  depends_on = [aws_iam_role_policy.model_action]
}
