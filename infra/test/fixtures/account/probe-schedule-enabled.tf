# The probe's schedule enabled outright, before W2 makes the site and the status request it checks
# (contracts/aws-alerts.md §5; plan.md §16, "Why a switch").
# expect: schedules: the probe's isn't once a minute, enabled by the account's switch alone
resource "aws_cloudwatch_event_rule" "probe" {
  name                = "h4-probe-every-minute"
  schedule_expression = "rate(1 minute)"
  state               = "ENABLED"

  tags = {
    component = "probe"
  }
}
