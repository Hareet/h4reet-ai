# h4-agent-plan trusts every Identity Center permission set's role, the laptop's runtime set's among them, not the
# Author's administrator set's alone.
# expect: plan role: its trust admits more than the Author's administrator permission set's role
data "aws_iam_policy_document" "agent_plan_trust" {
  statement {
    sid     = "TheAuthorsAdministratorRoleOnly"
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
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_*",
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-reserved/sso.amazonaws.com/*/AWSReservedSSO_*",
      ]
    }
  }
}
