# The warning to a topic other than h4-alerts, which neither channel reads.
# expect: warning: its one target isn't h4-alerts, by its name-built ARN
resource "aws_cloudwatch_event_target" "tunnel_end_spot_warning" {
  rule      = aws_cloudwatch_event_rule.tunnel_end_spot_warning.name
  target_id = "h4-alerts"
  arn       = "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:elsewhere"

  input_transformer {
    input_paths = {
      action = "$.detail.instance-action"
      at     = "$.time"
    }
    input_template = "\"[hareet.ai aws] tunnel_end_interruption: AWS will <action> the tunnel end in two minutes\\n- action: <action>\\n- at: <at>\""
  }
}
