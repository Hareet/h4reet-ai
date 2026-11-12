# The probe's alarm reading missing data as fine: a probe that stopped running would never page.
# root: account
# expect: probe: its alarm doesn't read a probe that didn't run as failing
resource "aws_cloudwatch_metric_alarm" "probe_failing" {
  count               = local.wired ? 1 : 0
  alarm_name          = "h4-probe-failing"
  alarm_description   = "h4-probe failed for 5 minutes: hareet.ai or its status request isn't answering (spec 001 FR-061)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = "h4-probe" }
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  ok_actions          = [data.aws_sns_topic.alerts.arn]

  tags = {
    component = "probe"
  }
}
