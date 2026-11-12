# The role reading every parameter in the account, as AmazonSSMManagedInstanceCore's ssm:GetParameter* on "*"
# would (group 5's review, I1).
# expect: role: ssm:GetParameter reaches
# expect: role: ssm:GetParameters reaches
# expect: role: ssm:GetParameter, ssm:GetParameters on every resource
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
      "*",
    ]
  }

  # Its SecureStrings, decrypted by Parameter Store alone, with this account's keys. AWS's aws/ssm key may grant this by
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
