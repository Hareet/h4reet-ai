# No Cost Explorer deny: ReadOnlyAccess's ce:Get* would hand a plan the account's cost and usage figures.
# expect: plan role: it may read cost and usage figures
data "aws_iam_policy_document" "agent_plan" {
  statement {
    sid    = "NoParameterOrSecretValue"
    effect = "Deny"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "ssm:GetParameterHistory",
      "secretsmanager:GetSecretValue",
      "secretsmanager:BatchGetSecretValue",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "NoLogEvents"
    effect = "Deny"
    actions = [
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
      "logs:GetLogRecord",
      "logs:StartQuery",
      "logs:GetQueryResults",
      "logs:StartLiveTail",
    ]
    resources = ["*"]
  }


  statement {
    sid       = "NoAnomalyFigures"
    effect    = "Deny"
    actions   = ["ce:GetAnomalies"]
    resources = ["*"]
  }

  statement {
    sid           = "NoObjectButTheState"
    effect        = "Deny"
    actions       = ["s3:GetObject", "s3:GetObjectVersion"]
    not_resources = ["arn:aws:s3:::h4reet-ai-tfstate-*/*"]
  }

  statement {
    sid       = "TheStatesLockFiles"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::h4reet-ai-tfstate-*/*.tflock"]
  }
}
