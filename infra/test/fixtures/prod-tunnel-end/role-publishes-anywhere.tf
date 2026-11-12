# The role publishing to any topic: its alerts go to h4-alerts alone (contracts/aws-alerts.md §1).
# expect: role: sns:Publish reaches
data "aws_iam_policy_document" "tunnel_end" {
  # The deployer's pulls: a registry token, and the project's repositories alone (infra/account/registry.tf).
  statement {
    sid       = "RegistryToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "PullTheProjectsImages"
    effect = "Allow"
    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchCheckLayerAvailability",
    ]
    resources = ["arn:aws:ecr:us-east-1:${data.aws_caller_identity.current.account_id}:repository/h4reet/*"]
  }

  # write_env.py's reads at boot: its own path, and the hosts' shared one (the release bucket's name).
  statement {
    sid     = "ItsParameters"
    effect  = "Allow"
    actions = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/tunnel-end/*",
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/hosts/*",
    ]
  }

  # Its SecureStrings, decrypted by Parameter Store alone.
  statement {
    sid       = "DecryptThroughParameterStore"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.us-east-1.amazonaws.com"]
    }
  }

  # The deployer's reads of the release bucket (infra/account/registry.tf), by its name's prefix, in this account.
  statement {
    sid    = "ReadReleases"
    effect = "Allow"
    actions = [
      "s3:GetObject",
    ]
    resources = [
      "arn:aws:s3:::h4reet-ai-releases-*/releases/*",
      "arn:aws:s3:::h4reet-ai-releases-*/trees/*",
      "arn:aws:s3:::h4reet-ai-releases-*/tools/*",
    ]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "ListReleases"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::h4reet-ai-releases-*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # Its deployer's alerts (contracts/aws-alerts.md §1): deploy_rolled_back, deploy_rollback_failed, deploy_refused.
  statement {
    sid       = "ItsAlerts"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = ["*"]
  }
}
