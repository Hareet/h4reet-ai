# h4-server-month with filter_expression and no metrics, which hashicorp/aws 6.72.0 refuses at plan (T027, 2026-11-11).
# expect: h4-server-month: metrics isn't ["UnblendedCost"], which filter_expression needs
resource "aws_budgets_budget" "server_month" {
  name         = "h4-server-month"
  budget_type  = "COST"
  limit_amount = tostring(var.server_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

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
