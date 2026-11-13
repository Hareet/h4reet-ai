# The guard invocable from a rule that isn't h4-ec2-running: any rule of that name pattern could stop EC2.
# root: account
# expect: permissions: ec2_guard's invokers aren't its rules alone
resource "aws_lambda_permission" "ec2_guard_running" {
  count         = local.wired ? 1 : 0
  statement_id  = "EC2EnteringRunning"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ec2_guard[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = "arn:aws:events:us-east-1:${data.aws_caller_identity.current.account_id}:rule/h4-*"
}
