# The object deny spares every bucket's objects, so a plan could read the release bucket and anything else.
# expect: plan role: it may read objects outside the state bucket
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
    sid     = "NoCostFiguresButTheAnomalyResources"
    effect  = "Deny"
    actions = ["ce:*"]
    not_resources = [
      "arn:aws:ce::${data.aws_caller_identity.current.account_id}:anomalymonitor/*",
      "arn:aws:ce::${data.aws_caller_identity.current.account_id}:anomalysubscription/*",
    ]
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
    not_resources = ["arn:aws:s3:::*/*"]
  }

  statement {
    sid       = "TheStatesLockFiles"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::h4reet-ai-tfstate-*/*.tflock"]
  }
}
