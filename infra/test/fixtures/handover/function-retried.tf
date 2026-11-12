# Lambda retrying the start function: a second attempt for one trigger (FR-065: one per invocation).
# root: account
# expect: functions: Lambda may retry h4-ec2-start, a second attempt
resource "aws_lambda_function_event_invoke_config" "ec2_start" {
  count                        = local.wired ? 1 : 0
  function_name                = aws_lambda_function.ec2_start[0].function_name
  maximum_retry_attempts       = 2
  maximum_event_age_in_seconds = 300
}
