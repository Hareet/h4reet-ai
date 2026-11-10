# The rehearsal set on outside its own change, with no marker naming its note, so its two $0.01 budgets could act all
# month (tasks.md T040; T038's review, I1). With the marker and its note, the same block passes (test_account.py).
# expect: rehearsal: local.rehearsal is true without its marker
locals {
  rehearsal         = true
  inference_profile = "us.anthropic.claude-haiku-5-5"
  foundation_model  = "anthropic.claude-haiku-5-5"
  lambda_images = {
    alert_bridge     = ""
    probe            = ""
    credential_audit = ""
  }
  lambda_repositories = ["h4-alert-bridge", "h4-probe", "h4-credential-audit"]
  stack_repositories  = ["edge", "web", "gateway"]
}
