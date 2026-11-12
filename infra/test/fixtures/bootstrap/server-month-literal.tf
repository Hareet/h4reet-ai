# h4-server-month at a figure written into the file, not the Author's variable (FR-021).
# expect: h4-server-month: limit_amount isn't var.server_budget_usd, in USD
resource "aws_budgets_budget" "server_month" {
  name         = "h4-server-month"
  budget_type  = "COST"
  limit_amount = "30"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  metrics      = ["UnblendedCost"]

  filter_expression {
    and {
      not {
        dimensions {
          key    = "SERVICE"
          values = var.bedrock_service_names
        }
      }
    }
    and {
      tags {
        key    = "project"
        values = ["h4reet-ai"]
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
