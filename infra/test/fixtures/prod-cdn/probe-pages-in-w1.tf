# The probe's alarm made in W1: with the schedule off, missing data breaches, and it would page every 5 minutes.
# root: account
# expect: probe: its alarm isn't in alerts.tf behind the switch
resource "aws_cloudwatch_metric_alarm" "probe_failing" {
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
  treat_missing_data  = "breaching"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  ok_actions          = [data.aws_sns_topic.alerts.arn]

  tags = {
    component = "probe"
  }
}
