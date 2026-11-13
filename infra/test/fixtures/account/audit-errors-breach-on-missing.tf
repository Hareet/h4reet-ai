# The credential audit's Errors alarm reading missing data as breaching: the function runs once a week, so it would
# page every other period (tasks.md T159).
# expect: alarms: h4-credential-audit-errors treats missing data as breaching
resource "aws_cloudwatch_metric_alarm" "credential_audit_errors" {
  count               = length(aws_lambda_function.credential_audit)
  alarm_name          = "h4-credential-audit-errors"
  alarm_description   = "h4-credential-audit raised: the weekly audit didn't finish (spec 001 FR-022)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.credential_audit[0].function_name }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]

  tags = {
    component = "credential-audit"
  }
}
