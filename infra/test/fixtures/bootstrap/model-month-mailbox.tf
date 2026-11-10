# h4-model-month's 100% alert also mailed straight from Budgets, around h4-alerts (FR-010, FR-022).
# expect: h4-model-month: a notification goes somewhere other than h4-alerts alone
resource "aws_budgets_budget" "model_month" {
  name         = "h4-model-month"
  budget_type  = "COST"
  limit_amount = "20"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon Bedrock"]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 70
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_sns_topic_arns  = [aws_sns_topic.alerts.arn]
    subscriber_email_addresses = [var.alert_email]
  }

  tags = {
    component = "model-spend"
  }

  depends_on = [aws_sns_topic_policy.alerts]
}
