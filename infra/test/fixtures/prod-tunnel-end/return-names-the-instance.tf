# The return's message carrying the instance's ID, which no alert carries (contracts/aws-alerts.md §2).
# expect: return: its message carries the account or the instance's ID
resource "aws_cloudwatch_event_target" "tunnel_end_running" {
  rule      = aws_cloudwatch_event_rule.tunnel_end_running.name
  target_id = "h4-alerts"
  arn       = "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"

  input_transformer {
    input_paths = {
      at       = "$.time"
      instance = "$.detail.instance-id"
    }
    input_template = "\"[hareet.ai aws] tunnel_end_back: the tunnel end runs again\\n- at: <at>\\n- instance: <instance>\""
  }
}
