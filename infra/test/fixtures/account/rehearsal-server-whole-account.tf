# The server rehearsal's budget on every cost of the account but Bedrock's, so tripping it wouldn't prove that
# h4-server-month's project filter reads this project's spend (ADR 0047).
# expect: rehearsal server budget: it doesn't read every cost of this project but var.bedrock_service_names'
resource "aws_budgets_budget" "rehearsal_server" {
  count        = local.rehearsal ? 1 : 0
  name         = "h4-rehearsal-server"
  budget_type  = "COST"
  limit_amount = "0.01"
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
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [data.aws_sns_topic.alerts.arn]
  }

  tags = {
    component = "rehearsal"
  }
}
