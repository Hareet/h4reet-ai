# The rehearsal set on outside its own change, with no marker naming its note, so its two $0.01 budgets could act all
# month (tasks.md T040; T038's review, I1). With the marker and its note, the same block passes (test_account.py).
# expect: rehearsal: local.rehearsal is true without its marker
locals {
  rehearsal         = true
  inference_profile = "us.anthropic.claude-haiku-5-5"
  foundation_model  = "anthropic.claude-haiku-5-5"
  lambda_images = {
    alert_bridge     = "sha256:d245392171b5432b2f159f202e2ed753b793c120388802d1bb2a79dc146ad1b2"
    probe            = "sha256:85e0a4e0a428482e9f10829f8fde23313762cce3fc06410b3fd87ca460e7f205"
    credential_audit = "sha256:dd899845f873e200d23db827797e8e556588f5c4c74aee2c4e4e1f0d71264494"
    ec2_start        = ""
    ec2_guard        = ""
  }
  lambda_repositories = ["h4-alert-bridge", "h4-probe", "h4-credential-audit", "h4-ec2-start", "h4-ec2-guard"]
  stack_repositories  = ["edge", "web", "gateway"]
}
