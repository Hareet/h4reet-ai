# The tunnel end's identity, h4-prod-tunnel-end (spec 001 FR-012; research.md R-15; the plan's question 7,
# provisional): its instance role, which its host services use through IMDSv2 alone, with one hop, so no container on
# it reaches the role. Every grant names its target by a name-built ARN, since this root reads nothing another root
# makes (plan.md §16). Group 9 adds the dashboard's reads. Protected (FR-012; rule T5): it changes only by the Author's
# patch.

data "aws_iam_policy_document" "tunnel_end_trust" {
  statement {
    sid     = "TheInstanceItself"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "tunnel_end" {
  name                 = "h4-prod-tunnel-end"
  description          = "The tunnel end's host services (spec 001 research.md R-15)"
  assume_role_policy   = data.aws_iam_policy_document.tunnel_end_trust.json
  max_session_duration = 3600

  tags = {
    component = "tunnel-end"
  }
}

resource "aws_iam_instance_profile" "tunnel_end" {
  name = "h4-prod-tunnel-end"
  role = aws_iam_role.tunnel_end.name

  tags = {
    component = "tunnel-end"
  }
}

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

  # Its SecureStrings, decrypted by Parameter Store alone, with this account's keys, for its own parameters alone. AWS's aws/ssm key may grant this by
  # its own key policy already; to confirm at T058, after which a later patch can drop the statement.
  statement {
    sid       = "DecryptThroughParameterStore"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:us-east-1:${data.aws_caller_identity.current.account_id}:key/*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.us-east-1.amazonaws.com"]
    }

    # Only for the parameters ItsParameters reads: Parameter Store names each SecureString in its encryption context.
    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:PARAMETER_ARN"
      values = [
        "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/tunnel-end/*",
        "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/hosts/*",
      ]
    }
  }

  # Session Manager and Run Command, the one way in for the Author (FR-050; his cloud-session target), and the Systems
  # Manager commands his targets send: the actions AWS documents for an instance profile without the managed
  # AmazonSSMManagedInstanceCore, whose ssm:GetParameter and ssm:GetParameters on "*" would read every parameter in the
  # account, EC2's and the Author's among them (group 5's review, I1). AWS documents each on "*"; none reads a
  # parameter, a secret, or an object.
  statement {
    sid    = "SessionManager"
    effect = "Allow"
    actions = [
      "ssm:UpdateInstanceInformation",
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "RunCommand"
    effect = "Allow"
    actions = [
      "ec2messages:AcknowledgeMessage",
      "ec2messages:DeleteMessage",
      "ec2messages:FailMessage",
      "ec2messages:GetEndpoint",
      "ec2messages:GetMessages",
      "ec2messages:SendReply",
    ]
    resources = ["*"]
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
    resources = ["arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"]
  }
}

resource "aws_iam_role_policy" "tunnel_end" {
  name   = "tunnel-end"
  role   = aws_iam_role.tunnel_end.id
  policy = data.aws_iam_policy_document.tunnel_end.json
}
