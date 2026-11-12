# The server rehearsal's budget with filter_expression and no metrics, which hashicorp/aws 6.72.0 refuses at plan
# (T027, 2026-11-11).
# expect: rehearsal server budget: metrics isn't ["UnblendedCost"], which filter_expression needs
resource "aws_budgets_budget" "rehearsal_server" {
  count        = local.rehearsal ? 1 : 0
  name         = "h4-rehearsal-server"
  budget_type  = "COST"
  limit_amount = "0.01"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

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
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [data.aws_sns_topic.alerts.arn]
  }

  tags = {
    component = "rehearsal"
  }
}
