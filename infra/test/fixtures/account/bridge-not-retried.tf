# A Telegram outage loses the alert: no retry, no failure queue (contracts/aws-alerts.md §2).
# expect: functions: the bridge isn't retried twice, then sent to its failure queue
resource "aws_lambda_function_event_invoke_config" "alert_bridge" {
  count                  = length(aws_lambda_function.alert_bridge)
  function_name          = aws_lambda_function.alert_bridge[0].function_name
  maximum_retry_attempts = 0
}
