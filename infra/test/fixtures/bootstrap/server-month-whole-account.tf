# h4-server-month on every cost of the account but Bedrock's, so the Author's other work in the shared account could
# trip the server action and stop EC2 (spec.md Assumptions, "One account, shared with the Author's other work").
# expect: h4-server-month: doesn't count every cost of this project but Bedrock's
resource "aws_budgets_budget" "server_month" {
  name         = "h4-server-month"
  budget_type  = "COST"
  limit_amount = tostring(var.server_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  metrics      = ["UnblendedCost"]

  filter_expression {
    not {
      dimensions {
        key    = "SERVICE"
        values = var.bedrock_service_names
      }
    }
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
    component = "server-spend"
  }

  depends_on = [aws_sns_topic_policy.alerts]
}
