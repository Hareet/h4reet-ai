# The probe's schedule enabled in group 4, before the site and the status request exist (contracts/aws-alerts.md §5).
# expect: schedules: the probe's isn't once a minute, written disabled
resource "aws_cloudwatch_event_rule" "probe" {
  name                = "h4-probe-every-minute"
  schedule_expression = "rate(1 minute)"
  state               = "ENABLED"

  tags = {
    component = "probe"
  }
}
