# The laptop's rule on any alarm's change: every alarm in the shared account would start EC2 (ADR 0047).
# root: account
# expect: laptop rule: it doesn't match h4-laptop-away into ALARM, by its name
resource "aws_cloudwatch_event_rule" "laptop_away" {
  count       = local.wired ? 1 : 0
  name        = "h4-laptop-away-rule"
  description = "h4-laptop-away into ALARM, to h4-ec2-start (spec 001 contracts/handover.md §2)"
  event_pattern = jsonencode({
    source      = ["aws.cloudwatch"]
    detail-type = ["CloudWatch Alarm State Change"]
    detail = {
      state = {
        value = ["ALARM"]
      }
    }
  })

  tags = {
    component = "handover"
  }
}
