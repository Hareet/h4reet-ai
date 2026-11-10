# The anomaly subscription as a daily summary, not at once (research.md R-22: "an immediate subscription").
# expect: anomaly subscription: frequency isn't IMMEDIATE
resource "aws_ce_anomaly_subscription" "account" {
  name             = "h4-anomaly-at-once"
  frequency        = "DAILY"
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
