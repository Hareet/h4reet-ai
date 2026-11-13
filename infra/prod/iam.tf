# Prod's identities (spec 001 FR-012; research.md R-15; the plan's question 7, provisional). The tunnel end's,
# h4-prod-tunnel-end: its instance role, which its host services use through IMDSv2 alone, with one hop, so no container
# on it reaches the role. Every grant names its target by a name-built ARN, since this root reads nothing another root
# makes (plan.md §16). Group 9 adds the dashboard's reads. Group 6 adds the shared state's (P-I7): the two role
# passwords of /h4reet/ec2/ its roles target sets, and the hourly backup's put. Group 7 adds EC2's two (P-I4), below.
# The budget actions' execution roles are killswitch.tf's. Protected (FR-012; rule T5): it changes only by the
# Author's patch.

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

  # write_env.py's reads at boot: its own path, and the hosts' shared one (the release bucket's name). And the shared
  # state's (group 6; contracts/shared-state.md §2, §3): its TLS key and certificate under its own path, and the two
  # role passwords of /h4reet/ec2/ its roles target sets, by name. Nothing else of EC2's: a tunnel end that holds the
  # store's superuser gains nothing from those two.
  statement {
    sid     = "ItsParameters"
    effect  = "Allow"
    actions = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/tunnel-end/*",
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/hosts/*",
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/ec2/DB_GATEWAY_PASSWORD",
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/ec2/DB_GRAFANA_RO_PASSWORD",
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
        "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/ec2/DB_GATEWAY_PASSWORD",
        "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/ec2/DB_GRAFANA_RO_PASSWORD",
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

  # Its deployer's alerts (contracts/aws-alerts.md §1): deploy_rolled_back, deploy_rollback_failed, deploy_refused; and,
  # from group 6, the backup timer's shared_state_backup_failed.
  statement {
    sid       = "ItsAlerts"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = ["arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"]
  }

  # The shared state's hourly backup (group 6; contracts/shared-state.md §1): its one prefix, put only. Nothing that
  # reads, lists, or deletes there, so a compromised tunnel end can't read a dump; a restore's GET is presigned in the
  # Author's terminal (§8).
  statement {
    sid       = "PutTheBackups"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.shared_state_backups.arn}/dumps/*"]
  }
}

resource "aws_iam_role_policy" "tunnel_end" {
  name   = "tunnel-end"
  role   = aws_iam_role.tunnel_end.id
  policy = data.aws_iam_policy_document.tunnel_end.json
}

# ----------------------------------------------------------------------------------------------------------------------
# EC2's two ordinary roles (research.md R-15; group 7, P-I4). h4-prod-ec2, the instance's, for its host services through
# IMDSv2 alone, with one hop: the deployer's pulls and reads, write_env.py's parameters, its alerts, Session Manager, and
# the credential timer's assume of h4-prod-gateway. h4-prod-gateway holds Bedrock, and only h4-prod-ec2 may assume it,
# so the model action's deny attaches to the one role EC2's gateway calls Bedrock with (killswitch.tf; tasks.md T180).

data "aws_iam_policy_document" "ec2_trust" {
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

resource "aws_iam_role" "ec2" {
  name                 = "h4-prod-ec2"
  path                 = "/"
  description          = "EC2's host services (spec 001 research.md R-15)"
  assume_role_policy   = data.aws_iam_policy_document.ec2_trust.json
  max_session_duration = 3600

  tags = {
    component = "ec2"
  }
}

resource "aws_iam_instance_profile" "ec2" {
  name = "h4-prod-ec2"
  role = aws_iam_role.ec2.name

  tags = {
    component = "ec2"
  }
}

data "aws_iam_policy_document" "ec2" {
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

  # write_env.py's reads at boot: EC2's own path (the Anthropic key, the alert channels', the store's passwords, its
  # relay token) and the hosts' shared one (the release bucket's name, the shared state's CA certificate).
  statement {
    sid     = "ItsParameters"
    effect  = "Allow"
    actions = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/ec2/*",
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/hosts/*",
    ]
  }

  # Its SecureStrings, decrypted by Parameter Store alone, with this account's keys, for its own parameters alone.
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

    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:PARAMETER_ARN"
      values = [
        "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/ec2/*",
        "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/hosts/*",
      ]
    }
  }

  # Session Manager and Run Command, the one way in (FR-050; make cloud-session HOST=ec2), as the tunnel end's: the
  # actions AWS documents for an instance profile without AmazonSSMManagedInstanceCore, none of which reads a parameter.
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

  # The deployer's reads of the release bucket, by its name's prefix, in this account.
  statement {
    sid     = "ReadReleases"
    effect  = "Allow"
    actions = ["s3:GetObject"]
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

  # Its deployer's alerts (contracts/aws-alerts.md §1).
  statement {
    sid       = "ItsAlerts"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = ["arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"]
  }

  # The credential timer's assume (deploy/hosts/ec2/ec2_host.py credentials): h4-prod-gateway's short-lived credentials,
  # written to tmpfs for EC2's gateway alone.
  statement {
    sid       = "AssumeTheGatewaysRole"
    effect    = "Allow"
    actions   = ["sts:AssumeRole"]
    resources = [aws_iam_role.gateway.arn]
  }
}

resource "aws_iam_role_policy" "ec2" {
  name   = "ec2"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.ec2.json
}

# Only h4-prod-ec2 may assume h4-prod-gateway, by its ARN from this root.
data "aws_iam_policy_document" "gateway_trust" {
  statement {
    sid     = "EC2sHostRoleOnly"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.ec2.arn]
    }
  }
}

resource "aws_iam_role" "gateway" {
  name                 = "h4-prod-gateway"
  path                 = "/"
  description          = "EC2 gateway's Bedrock, assumed by its credential timer (spec 001 research.md R-15)"
  assume_role_policy   = data.aws_iam_policy_document.gateway_trust.json
  max_session_duration = 3600

  tags = {
    component = "ec2"
  }
}

# bedrock:InvokeModel* on the one inference profile, and on its models only through that profile, as
# h4-laptop-bedrock's (infra/account/iam.tf). Converse is authorized by these two.
data "aws_iam_policy_document" "gateway" {
  statement {
    sid       = "TheInferenceProfile"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["arn:aws:bedrock:us-east-1:${data.aws_caller_identity.current.account_id}:inference-profile/us.anthropic.claude-haiku-5-5"]
  }

  statement {
    sid       = "ItsModelsThroughTheProfileOnly"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5*"]

    condition {
      test     = "StringLike"
      variable = "bedrock:InferenceProfileArn"
      values   = ["arn:aws:bedrock:us-east-1:${data.aws_caller_identity.current.account_id}:inference-profile/us.anthropic.claude-haiku-5-5"]
    }
  }
}

resource "aws_iam_role_policy" "gateway" {
  name   = "bedrock-invoke"
  role   = aws_iam_role.gateway.id
  policy = data.aws_iam_policy_document.gateway.json
}
