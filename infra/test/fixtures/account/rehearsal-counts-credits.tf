# The model rehearsal counts cost net of credits, so a credit could hide the cent that trips it, unlike h4-model-month.
# expect: rehearsal model budget: it counts cost net of credits
resource "aws_budgets_budget" "rehearsal_model" {
  count        = local.rehearsal ? 1 : 0
  name         = "h4-rehearsal-model"
  budget_type  = "COST"
  limit_amount = "0.01"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = var.bedrock_service_names
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [data.aws_sns_topic.alerts.arn]
  }

  tags = {
    component = "rehearsal"
  }
}
