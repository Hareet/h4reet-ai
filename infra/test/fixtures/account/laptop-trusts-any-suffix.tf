# h4-laptop-bedrock trusts any Identity Center role whose name begins with the set's, so a set named <name>_Other
# could assume it too (T038's review, I4).
# expect: laptop role: its trust admits more than the permission set's role
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
      values   = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_${local.laptop_permission_set}_*"]
    }
  }
}
