# EC2's warning carrying the instance's ID into the alert (contracts/aws-alerts.md §2: never an ID it needn't).
# root: prod
# expect: ec2 warning: its message may carry the account or the instance's ID
resource "aws_cloudwatch_event_target" "ec2_spot_warning" {
  rule      = aws_cloudwatch_event_rule.ec2_spot_warning.name
  target_id = "h4-alerts"
  arn       = "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"

  input_transformer {
    input_paths = {
      action   = "$.detail.instance-action"
      at       = "$.time"
      instance = "$.detail.instance-id"
    }
    input_template = "\"[hareet.ai aws] spot_interruption: AWS will <action> <instance> in two minutes\\n- action: <action>\\n- at: <at>\""
  }
}
