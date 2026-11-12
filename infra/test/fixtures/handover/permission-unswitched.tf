# A permission made in W1, before the account's W2 apply makes its function: the apply would fail on it.
# root: account
# expect: permissions: aws_lambda_permission.ec2_start_tunnel_end_back isn't handover.tf's, behind the switch
# expect: switch: aws_lambda_permission.ec2_start_tunnel_end_back doesn't wait behind the account's switch
resource "aws_lambda_permission" "ec2_start_tunnel_end_back" {
  statement_id  = "TheTunnelEndsReturn"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ec2_start[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = "arn:aws:events:us-east-1:${data.aws_caller_identity.current.account_id}:rule/h4-tunnel-end-running"
}
