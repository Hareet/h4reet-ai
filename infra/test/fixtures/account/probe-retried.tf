# A failed probe run retried within its minute, three requests where the schedule makes one.
# expect: functions: the probe is retried
resource "aws_lambda_function_event_invoke_config" "probe" {
  count                  = length(aws_lambda_function.probe)
  function_name          = aws_lambda_function.probe[0].function_name
  maximum_retry_attempts = 2
}
