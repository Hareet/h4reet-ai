# h4-model-day without its 70% warning, $3.50 (FR-022).
# expect: h4-model-day: notifications aren't at 70% and 100%
resource "aws_budgets_budget" "model_day" {
  name         = "h4-model-day"
  budget_type  = "COST"
  limit_amount = "5"
  limit_unit   = "USD"
  time_unit    = "DAILY"

  cost_filter {
    name   = "Service"
    values = var.bedrock_service_names
  }

  cost_types {
    include_credit = false
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
