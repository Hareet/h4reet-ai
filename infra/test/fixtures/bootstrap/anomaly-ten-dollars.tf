# The anomaly subscription at $10, not $1 (research.md R-22, as September's).
# expect: anomaly subscription: threshold isn't an impact of $1 or more
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
      values        = ["10"]
    }
  }

  tags = {
    component = "anomaly"
  }

  depends_on = [aws_sns_topic_policy.alerts]
}
