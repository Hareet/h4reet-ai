# h4-credential-audit's role reading every parameter under /h4reet/, the Telegram token's among them, where it may
# read only the Author's allowlist (ADR 0047).
# expect: credential audit: its role doesn't read exactly the Author's allowlist parameter
data "aws_iam_policy_document" "credential_audit" {
  statement {
    sid       = "ItsLog"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.credential_audit.arn}:*"]
  }

  statement {
    sid    = "ReadIam"
    effect = "Allow"
    actions = [
      "iam:GetAccountSummary",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAccessKeys",
      "iam:ListAttachedRolePolicies",
      "iam:ListOpenIDConnectProviders",
      "iam:ListRolePolicies",
      "iam:ListRoles",
      "iam:ListUsers",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ReadIdentityCenter"
    effect = "Allow"
    actions = [
      "sso:DescribePermissionSet",
      "sso:GetInlinePolicyForPermissionSet",
      "sso:ListCustomerManagedPolicyReferencesInPermissionSet",
      "sso:ListInstances",
      "sso:ListManagedPoliciesInPermissionSet",
      "sso:ListPermissionSets",
      "sso:ListTagsForResource",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "StoreItsResult"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.releases.arn}/audits/credential/*"]
  }

  statement {
    sid       = "AlertAFinding"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [data.aws_sns_topic.alerts.arn]
  }

  statement {
    sid     = "TheAuthorsAllowlist"
    effect  = "Allow"
    actions = ["ssm:GetParameter"]
    resources = [
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/*",
    ]
  }
}
