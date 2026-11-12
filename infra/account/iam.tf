# The account's identities (spec 001 FR-012, FR-013, FR-023; research.md R-15; contracts/aws-alerts.md §4): the
# laptop's Bedrock permission set, imported from spec 000's hand-made one and narrowed; h4-laptop-bedrock, the ordinary
# role it assumes, which holds Bedrock and takes the model action's deny; h4-rehearsal-target, a role of the same shape
# for the rehearsal; and the three functions' roles. Protected (FR-012; rule T5): it changes only by the Author's patch.
# Nothing here changes at run time (FR-070).

# ----------------------------------------------------------------------------------------------------------------------
# The laptop's Bedrock permission set (row F2): imported, then holding nothing but sts:AssumeRole on h4-laptop-bedrock.
# Its name is the local below. The hand-made set's customer-managed policy reference stays outside Terraform until the
# Author detaches it, once the laptop's profile chains through h4-laptop-bedrock (tasks.md T040; plan.md §16, group
# 4's departure 7): until then the model action's deny doesn't reach the set's own role. The credential audit then
# holds the set to this policy alone.

locals {
  # The name of spec 000's hand-made Bedrock permission set, which this file imports, overwrites, and provisions, and
  # whose role alone h4-laptop-bedrock trusts. It lives here, in the protected file, so only the Author's patch sets it
  # (T038's review, I4). The Author read it from IAM Identity Center on 2026-11-11 (the merge-request note, For the
  # Author, 2), and the session put it in this patch.
  laptop_permission_set = "h4reet-ai-cloud"
}

data "aws_ssoadmin_instances" "this" {}

data "aws_ssoadmin_permission_set" "laptop" {
  instance_arn = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  name         = local.laptop_permission_set
}

import {
  to = aws_ssoadmin_permission_set.laptop
  id = "${data.aws_ssoadmin_permission_set.laptop.arn},${tolist(data.aws_ssoadmin_instances.this.arns)[0]}"
}

resource "aws_ssoadmin_permission_set" "laptop" {
  name         = local.laptop_permission_set
  instance_arn = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  description  = "The laptop's Bedrock: sts:AssumeRole on h4-laptop-bedrock alone (spec 001 FR-013)"

  tags = {
    component = "laptop-bedrock"
  }

  # As the hand-made set has them: the plan shows the import, and these stay the Author's. No plan removes the
  # laptop's identity.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [session_duration, relay_state]
  }
}

data "aws_iam_policy_document" "laptop_assume" {
  statement {
    sid       = "AssumeTheBedrockRole"
    effect    = "Allow"
    actions   = ["sts:AssumeRole"]
    resources = [aws_iam_role.laptop_bedrock.arn]
  }
}

resource "aws_ssoadmin_permission_set_inline_policy" "laptop" {
  instance_arn       = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  permission_set_arn = aws_ssoadmin_permission_set.laptop.arn
  inline_policy      = data.aws_iam_policy_document.laptop_assume.json
}

# ----------------------------------------------------------------------------------------------------------------------
# h4-laptop-bedrock: an ordinary role at the path /, never one of Identity Center's, so the model action's deny can
# attach to it (research.md R-22). Only the permission set's role may assume it: Identity Center names that role
# AWSReservedSSO_<set>_<16 characters>, under /aws-reserved/sso.amazonaws.com/, with a Region's segment in the path for
# some accounts. Each `?` is one character, and the role's name follows a `/`, so the pattern is that set's role
# exactly, never a set named <set>_<more> (T038's review, I4). The 16 is the Author's count, read from the set's role
# under IAM, Roles, on 2026-11-11: a wrong length would leave the laptop unable to assume the role, and admit no one
# else.

data "aws_iam_policy_document" "laptop_bedrock_trust" {
  statement {
    sid     = "ThePermissionSetsRoleOnly"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:PrincipalArn"
      values = [
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_${local.laptop_permission_set}_????????????????",
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-reserved/sso.amazonaws.com/*/AWSReservedSSO_${local.laptop_permission_set}_????????????????",
      ]
    }
  }
}

# bedrock:InvokeModel* on the one inference profile, and on its models only through that profile (spec 000 plan
# §5.2's "the one inference profile and the foundation models it routes to"). Converse is authorized by these two.
data "aws_iam_policy_document" "bedrock_invoke" {
  statement {
    sid       = "TheInferenceProfile"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["arn:aws:bedrock:us-east-1:${data.aws_caller_identity.current.account_id}:inference-profile/${local.inference_profile}"]
  }

  statement {
    sid       = "ItsModelsThroughTheProfileOnly"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["arn:aws:bedrock:*::foundation-model/${local.foundation_model}*"]

    condition {
      test     = "StringLike"
      variable = "bedrock:InferenceProfileArn"
      values   = ["arn:aws:bedrock:us-east-1:${data.aws_caller_identity.current.account_id}:inference-profile/${local.inference_profile}"]
    }
  }
}

resource "aws_iam_role" "laptop_bedrock" {
  name                 = "h4-laptop-bedrock"
  path                 = "/"
  description          = "The laptop gateway's Bedrock, assumed from its permission set (spec 001 FR-013)"
  assume_role_policy   = data.aws_iam_policy_document.laptop_bedrock_trust.json
  max_session_duration = 3600

  tags = {
    component = "laptop-bedrock"
  }
}

resource "aws_iam_role_policy" "laptop_bedrock" {
  name   = "bedrock-invoke"
  role   = aws_iam_role.laptop_bedrock.id
  policy = data.aws_iam_policy_document.bedrock_invoke.json
}

# ----------------------------------------------------------------------------------------------------------------------
# h4-rehearsal-target, the model rehearsal's target (FR-026): an ordinary role of the same shape as h4-laptop-bedrock,
# while local.rehearsal is true. No one assumes it: only the account's root user could, and the root user holds no key
# (the credential audit's root_access_key).

data "aws_iam_policy_document" "rehearsal_target_trust" {
  count = local.rehearsal ? 1 : 0

  statement {
    sid     = "NoOne"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:PrincipalArn"
      values   = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}

resource "aws_iam_role" "rehearsal_target" {
  count                = local.rehearsal ? 1 : 0
  name                 = "h4-rehearsal-target"
  path                 = "/"
  description          = "The model rehearsal's target, of h4-laptop-bedrock's shape; no one assumes it (spec 001 FR-026)"
  assume_role_policy   = data.aws_iam_policy_document.rehearsal_target_trust[0].json
  max_session_duration = 3600

  tags = {
    component = "rehearsal"
  }
}

resource "aws_iam_role_policy" "rehearsal_target" {
  count  = local.rehearsal ? 1 : 0
  name   = "bedrock-invoke"
  role   = aws_iam_role.rehearsal_target[0].id
  policy = data.aws_iam_policy_document.bedrock_invoke.json
}

# ----------------------------------------------------------------------------------------------------------------------
# The functions' roles: each writes its own log group, and holds what its function needs, no more.

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    sid     = "LambdaForThisAccount"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "alert_bridge" {
  name               = "h4-alert-bridge-fn"
  path               = "/"
  description        = "h4-alert-bridge: its log, its two parameters, its failure queue"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json

  tags = {
    component = "alert-bridge"
  }
}

# The two parameters are the Author's SecureStrings under the AWS-managed aws/ssm key, whose own policy lets the
# account's principals decrypt through Parameter Store; a key of his own would need kms:Decrypt here.
data "aws_iam_policy_document" "alert_bridge" {
  statement {
    sid       = "ItsLog"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.alert_bridge.arn}:*"]
  }

  statement {
    sid     = "TheBotsTokenAndTheChat"
    effect  = "Allow"
    actions = ["ssm:GetParameter"]
    resources = [
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/alerts/TELEGRAM_BOT_TOKEN",
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/alerts/TELEGRAM_CHAT_ID",
    ]
  }

  statement {
    sid       = "ItsFailureQueue"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.alert_bridge_failed.arn]
  }
}

resource "aws_iam_role_policy" "alert_bridge" {
  name   = "alert-bridge"
  role   = aws_iam_role.alert_bridge.id
  policy = data.aws_iam_policy_document.alert_bridge.json
}

resource "aws_iam_role" "probe" {
  name               = "h4-probe-fn"
  path               = "/"
  description        = "h4-probe: its log alone; its checks call the public site"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json

  tags = {
    component = "probe"
  }
}

data "aws_iam_policy_document" "probe" {
  statement {
    sid       = "ItsLog"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.probe.arn}:*"]
  }
}

resource "aws_iam_role_policy" "probe" {
  name   = "probe"
  role   = aws_iam_role.probe.id
  policy = data.aws_iam_policy_document.probe.json
}

resource "aws_iam_role" "credential_audit" {
  name               = "h4-credential-audit-fn"
  path               = "/"
  description        = "h4-credential-audit: IAM's and Identity Center's reads, its results, its alert"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json

  tags = {
    component = "credential-audit"
  }
}

# The reads audit.py makes (contracts/infra-records.md §4): IAM's list and get calls, which take no narrower resource
# for the account-wide listing, and Identity Center's permission sets; then its result into the release bucket's
# audits/credential/, and any finding to h4-alerts. And the Author's allowlist, his SecureString under the AWS-managed
# aws/ssm key, kept out of the repository (spec 001 Assumptions, "One account, shared with the Author's other work";
# ADR 0047).
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
      "arn:aws:ssm:us-east-1:${data.aws_caller_identity.current.account_id}:parameter/h4reet/audit/IAM_ALLOW",
    ]
  }
}

resource "aws_iam_role_policy" "credential_audit" {
  name   = "credential-audit"
  role   = aws_iam_role.credential_audit.id
  policy = data.aws_iam_policy_document.credential_audit.json
}
