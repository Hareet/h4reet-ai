# The guard's role allowed to start EC2 too: the guard stops, and only the start function starts (research.md R-30).
# root: account
# expect: roles: h4-ec2-guard-fn's actions aren't its own
data "aws_iam_policy_document" "ec2_guard" {
  statement {
    sid       = "ItsLog"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.ec2_guard.arn}:*"]
  }

  statement {
    sid     = "TheSwitchAndEC2sID"
    effect  = "Allow"
    actions = ["ssm:GetParameter"]
    resources = [
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/prod/ec2-autostart",
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/prod/ec2-instance-id",
    ]
  }

  statement {
    sid       = "TheServerActionsStatus"
    effect    = "Allow"
    actions   = ["budgets:DescribeBudgetActionsForBudget"]
    resources = ["arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/h4-server-month"]
  }

  statement {
    sid       = "TheTaggedInstances"
    effect    = "Allow"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  statement {
    sid       = "TheLaptopsAlarm"
    effect    = "Allow"
    actions   = ["cloudwatch:DescribeAlarms"]
    resources = ["arn:aws:cloudwatch:us-east-1:${data.aws_caller_identity.current.account_id}:alarm:h4-laptop-away"]
  }

  statement {
    sid       = "StopATaggedInstance"
    effect    = "Allow"
    actions   = ["ec2:StopInstances", "ec2:StartInstances"]
    resources = ["arn:aws:ec2:us-east-1:${data.aws_caller_identity.current.account_id}:instance/*"]

    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Name"
      values   = ["h4-prod-ec2"]
    }
  }

  statement {
    sid       = "ItsAlerts"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [data.aws_sns_topic.alerts.arn]
  }
}
