# h4-agent-plan carries the state's component tag, so its cost and the credential audit's reading name the wrong part.
# expect: plan role: its component tag isn't agent-plan
resource "aws_iam_role" "agent_plan" {
  name                 = "h4-agent-plan"
  path                 = "/"
  description          = "The night shift's plans: read-only, and the state's lock files (spec 017 FR-032)"
  assume_role_policy   = data.aws_iam_policy_document.agent_plan_trust.json
  max_session_duration = 3600

  tags = {
    component = "terraform-state"
  }

  lifecycle {
    precondition {
      condition     = can(regex("^[A-Za-z0-9+=,.@_-]{1,32}$", local.plan_permission_set))
      error_message = "local.plan_permission_set: write the Author's administrator permission set's name in iam.tf (spec 017 P-6)."
    }
  }
}
