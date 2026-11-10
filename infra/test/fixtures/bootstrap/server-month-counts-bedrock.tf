# h4-server-month on every cost, Bedrock's included, so model spend could stop EC2 (FR-021, FR-023).
# expect: h4-server-month: doesn't count every cost but Bedrock's
resource "aws_budgets_budget" "server_month" {
  name         = "h4-server-month"
  budget_type  = "COST"
  limit_amount = tostring(var.server_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 70
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  tags = {
    component = "server-spend"
  }

  depends_on = [aws_sns_topic_policy.alerts]
}
