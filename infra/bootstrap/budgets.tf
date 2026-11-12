# The model-spend budgets and the server budget, and the account's anomaly monitor (spec 001 FR-021, FR-022;
# research.md R-22; contracts/aws-alerts.md §3), applied first. Each budget notifies h4-alerts (alerts.tf) at 70% and
# 100% of actual cost; the monitor, at once, on any anomaly of $1 or more. Protected (FR-012; contracts/infra-records.md
# §3, rule T5): it changes only by the Author's patch, with an ADR. Its two actions are infra/account's (group 4).
#
# Bedrock's cost is the services var.bedrock_service_names names, as the Author reads them in his Cost Explorer: Claude
# on Bedrock is sold through AWS Marketplace and can show under a name of its own (T028's review, B3). The model budgets
# count usage, not cost net of credits, so a credit can't hide the spend from them (nit 4); the server budget keeps
# AWS's default, his to change.

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

# Every cost of this project but Bedrock's (FR-021): model spend has the two budgets above, and the meter. Its
# figure is the Author's, which nothing here sets. The account is shared with the Author's other work (spec 001
# Assumptions, "One account, shared with the Author's other work"; ADR 0047), so the budget counts only costs
# tagged project = h4reet-ai, as every provider's default_tags writes it: the other work's spend never trips the
# server action. The project tag must be an active cost-allocation tag (T030), or this budget sees nothing.
resource "aws_budgets_budget" "server_month" {
  name         = "h4-server-month"
  budget_type  = "COST"
  limit_amount = tostring(var.server_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  # hashicorp/aws 6.72.0 refuses filter_expression without metrics (the T027 plan, 2026-11-11). Unblended cost:
  # the account has no credits (the Author's answer, 2026-11-11).
  metrics = ["UnblendedCost"]

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

resource "aws_ce_anomaly_monitor" "account" {
  name              = "h4-anomaly"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"

  tags = {
    component = "anomaly"
  }
}

resource "aws_ce_anomaly_subscription" "account" {
  name             = "h4-anomaly-at-once"
  frequency        = "IMMEDIATE"
  monitor_arn_list = [aws_ce_anomaly_monitor.account.arn]

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.alerts.arn
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["1"]
    }
  }

  tags = {
    component = "anomaly"
  }

  depends_on = [aws_sns_topic_policy.alerts]
}
