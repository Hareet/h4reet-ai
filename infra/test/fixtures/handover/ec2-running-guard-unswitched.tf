# The guard's target made in W1, before the account's W2 apply makes the function (plan.md §16, "Why a switch").
# root: prod
# expect: ec2 running: its one target isn't h4-ec2-guard, by its name-built ARN, behind the switch
resource "aws_cloudwatch_event_target" "ec2_running_guard" {
  rule      = aws_cloudwatch_event_rule.ec2_running.name
  target_id = "h4-ec2-guard"
  arn       = "arn:aws:lambda:us-east-1:${data.aws_caller_identity.current.account_id}:function:h4-ec2-guard"
}
