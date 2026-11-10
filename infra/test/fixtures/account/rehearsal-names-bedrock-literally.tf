# The model rehearsal names Bedrock's service itself, so it can't prove the name the Author reads in Cost Explorer.
# expect: rehearsal model budget: it doesn't read Bedrock's cost by var.bedrock_service_names
resource "aws_budgets_budget" "rehearsal_model" {
  count        = local.rehearsal ? 1 : 0
  name         = "h4-rehearsal-model"
  budget_type  = "COST"
  limit_amount = "0.01"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon Bedrock"]
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
