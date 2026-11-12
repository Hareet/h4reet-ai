# The tunnel end's return invoking the start function with the raw event: it would read as an unknown trigger, and
# skip the laptop's check that `from: tunnel_end_back` needs (contracts/handover.md §3, step 4).
# root: prod
# expect: return: no one h4-ec2-start target, `from: tunnel_end_back`, behind the switch
resource "aws_cloudwatch_event_target" "tunnel_end_running_start" {
  count     = local.wired ? 1 : 0
  rule      = aws_cloudwatch_event_rule.tunnel_end_running.name
  target_id = "h4-ec2-start"
  arn       = "arn:aws:lambda:us-east-1:${data.aws_caller_identity.current.account_id}:function:h4-ec2-start"
}
