# The audit's schedule moved beside its function, outside the protected files (rule T5).
# into: lambdas.tf
# expect: schedules: aws_cloudwatch_event_rule.credential_audit lives outside alerts.tf
# expect: files: aws_cloudwatch_event_rule.credential_audit lives outside iam.tf, killswitch.tf, and alerts.tf
resource "aws_cloudwatch_event_rule" "credential_audit" {
  name                = "h4-credential-audit-weekly"
  schedule_expression = "cron(0 6 ? * MON *)"
  state               = "ENABLED"

  tags = {
    component = "credential-audit"
  }
}
