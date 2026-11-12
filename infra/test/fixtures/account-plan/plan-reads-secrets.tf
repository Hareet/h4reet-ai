# The deny leaves Secrets Manager out, so ReadOnlyAccess's secretsmanager:GetSecretValue would hand a plan any secret.
# expect: plan role: it may read a parameter's or a secret's value
data "aws_iam_policy_document" "agent_plan" {
  statement {
    sid    = "NoParameterOrSecretValue"
    effect = "Deny"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "ssm:GetParameterHistory",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "TheStatesLockFiles"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::h4reet-ai-tfstate-*/*.tflock"]
  }
}
