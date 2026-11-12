# h4-model-month on cost net of credits, AWS's default, so a credit could hide the spend (T028's review, nit 4).
# expect: h4-model-month: counts credits against the spend
resource "aws_budgets_budget" "model_month" {
  name         = "h4-model-month"
  budget_type  = "COST"
  limit_amount = "20"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = var.bedrock_service_names
  }

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
    component = "model-spend"
  }

  depends_on = [aws_sns_topic_policy.alerts]
}
