# The deny leaves the streaming call open (contracts/aws-alerts.md §4; September §3.1).
# expect: deny policy: h4-deny-paid-models doesn't deny bedrock:InvokeModel* on every resource
data "aws_iam_policy_document" "deny_paid_models" {
  statement {
    sid       = "DenyPaidModels"
    effect    = "Deny"
    actions   = ["bedrock:InvokeModel"]
    resources = ["*"]
  }
}
