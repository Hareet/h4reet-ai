# The email subscription's endpoint written into the file, not the sensitive variable (FR-010).
# expect: h4-alerts: the email subscription's endpoint isn't var.alert_email
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "the-mailbox"
}
