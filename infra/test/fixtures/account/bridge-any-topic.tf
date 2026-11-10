# SNS may invoke the bridge for any topic of any account.
# expect: bridge: it isn't subscribed to h4-alerts, invoked by SNS for that topic alone
resource "aws_lambda_permission" "alert_bridge_sns" {
  count         = length(aws_lambda_function.alert_bridge)
  statement_id  = "h4-alerts"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alert_bridge[0].function_name
  principal     = "sns.amazonaws.com"
}
