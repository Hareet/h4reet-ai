# The email subscription moved into main.tf, outside the protected files (FR-012; rule T5).
# into: main.tf
# expect: files: aws_sns_topic_subscription.email lives outside budgets.tf and alerts.tf
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
