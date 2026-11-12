# Nothing refuses the permission set's name while it still holds its placeholder, so an apply would make a role no one
# can assume, and the night's plans would fail later, at the runner.
# expect: plan role: no precondition refuses the permission set's name unfilled
resource "aws_iam_role" "agent_plan" {
  name                 = "h4-agent-plan"
  path                 = "/"
  description          = "The night shift's plans: read-only, and the state's lock files (spec 017 FR-032)"
  assume_role_policy   = data.aws_iam_policy_document.agent_plan_trust.json
  max_session_duration = 3600

  tags = {
    component = "agent-plan"
  }
}
