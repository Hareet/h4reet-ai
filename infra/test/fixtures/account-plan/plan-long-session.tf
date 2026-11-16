# h4-agent-plan's sessions may last twelve hours, so a plan's credentials outlive the one-hour bound (research.md R-06).
# expect: plan role: a session may last longer than an hour
resource "aws_iam_role" "agent_plan" {
  name                 = "h4-agent-plan"
  path                 = "/"
  description          = "The night shift's plans: read-only, and the state's lock files (spec 017 FR-032)"
  assume_role_policy   = data.aws_iam_policy_document.agent_plan_trust.json
  max_session_duration = 43200

  tags = {
    component = "agent-plan"
  }

  lifecycle {
    precondition {
      condition     = can(regex("^[A-Za-z0-9+=,.@_-]{1,32}$", local.plan_permission_set))
      error_message = "local.plan_permission_set: write the name of the Author's administrator permission set, the one his h4reet-admin profile signs in with, in infra/account/iam.tf. IAM Identity Center lists it under Multi-account permissions, Permission sets (spec 017 P-6)."
    }
  }
}
