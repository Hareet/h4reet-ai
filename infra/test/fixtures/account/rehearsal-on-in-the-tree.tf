# The rehearsal left on in the tree, so its two $0.01 budgets act all month (tasks.md T040, step 6).
# expect: rehearsal: local.rehearsal isn't false in the tree
locals {
  rehearsal             = true
  laptop_permission_set = null
  inference_profile     = "us.anthropic.claude-haiku-5-5"
  foundation_model      = "anthropic.claude-haiku-5-5"
  lambda_images = {
    alert_bridge     = ""
    probe            = ""
    credential_audit = ""
  }
  lambda_repositories = ["h4-alert-bridge", "h4-probe", "h4-credential-audit"]
  stack_repositories  = ["edge", "web", "gateway"]
}
