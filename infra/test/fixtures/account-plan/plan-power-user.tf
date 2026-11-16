# h4-agent-plan holds PowerUserAccess in place of ReadOnlyAccess, so a plan's credentials could change the account.
# expect: plan role: its managed policy isn't AWS's ReadOnlyAccess alone
resource "aws_iam_role_policy_attachment" "agent_plan_read_only" {
  role       = aws_iam_role.agent_plan.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}
