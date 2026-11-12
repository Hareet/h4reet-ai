# h4-model-month above the $20 ceiling (FR-022; spec 000's ceilings).
# expect: h4-model-month: limit_amount isn't 20 USD
resource "aws_budgets_budget" "model_month" {
  name         = "h4-model-month"
  budget_type  = "COST"
  limit_amount = "25"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = var.bedrock_service_names
  }

  cost_types {
    include_credit = false
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
