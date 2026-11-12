# h4-laptop-bedrock trusts every principal of the account, not the permission set's role alone (research.md R-15).
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
  }
}
