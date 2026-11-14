# h4-agent-plan trusts the account with no condition, so any principal in it whose own policy allows sts:AssumeRole,
# the Author's other work's identities among them (ADR 0047), could plan as it.
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
  }
}
