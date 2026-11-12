# The deny policy moved into main.tf, which agents edit (FR-012; rule T5).
# into: main.tf
# expect: files: aws_iam_policy.deny_paid_models lives outside iam.tf, killswitch.tf, alerts.tf, and handover.tf
resource "aws_iam_policy" "deny_paid_models" {
  name   = "h4-deny-paid-models"
  path   = "/"
  policy = data.aws_iam_policy_document.deny_paid_models.json

  tags = {
    component = "kill-switch"
  }
}
