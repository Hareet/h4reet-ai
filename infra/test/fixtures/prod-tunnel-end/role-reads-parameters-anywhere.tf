# The role reading every parameter in the account, as AmazonSSMManagedInstanceCore's ssm:GetParameter* on "*"
# would (group 5's review, I1).
# expect: role: ssm:GetParameter reaches
# expect: role: ssm:GetParameters reaches
# expect: role: ssm:GetParameter, ssm:GetParameters on every resource
# expect: role: kms:Decrypt isn't held to its own parameters
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
  # store's superuser gains nothing from those two. And, from group 9 (P-I6), the autostart switch, a String, for the
  # dashboard (plan.md §11).
  statement {
    sid     = "ItsParameters"
    effect  = "Allow"
    actions = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [
      "*",
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
        "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/prod/ec2-autostart",
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
  #
  # From group 9 (P-I6; research.md R-15; contracts/public-view.md §2), the sink's one key too: the public view's
  # document, site/status/latest.json in the site's bucket, put only, which group 10's sink writes.
  statement {
    sid    = "PutTheBackupsAndThePublicViewsDocument"
    effect = "Allow"
    actions = [
      "s3:PutObject",
    ]
    resources = [
      "${aws_s3_bucket.shared_state_backups.arn}/dumps/*",
      "${aws_s3_bucket.site.arn}/site/status/latest.json",
    ]
  }

  # The sink's cloud reads for the dashboard (group 9, P-I6; plan.md §11; contracts/public-view.md §2; research.md
  # R-15): EC2's state and its spot request's, which EC2's describe calls give with no narrower resource; the health
  # check's status, prod's own; the server budget's month and its action's status, by the budget's name; and the two
  # functions' outcome counts, from their embedded metrics, which CloudWatch's GetMetricData gives with no narrower
  # resource either. All reads.
  statement {
    sid    = "TheDashboardsEC2Reads"
    effect = "Allow"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeSpotInstanceRequests",
      "cloudwatch:GetMetricData",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "TheHealthChecksStatus"
    effect    = "Allow"
    actions   = ["route53:GetHealthCheckStatus"]
    resources = ["arn:aws:route53:::healthcheck/${aws_route53_health_check.laptop.id}"]
  }

  statement {
    sid    = "TheServerBudget"
    effect = "Allow"
    actions = [
      "budgets:ViewBudget",
      "budgets:DescribeBudgetActionsForBudget",
    ]
    resources = ["arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/h4-server-month"]
  }
}
