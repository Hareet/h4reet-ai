# The probe's schedule enabled in W1, before the site exists: it would fail every minute.
# root: account
# expect: probe: its schedule isn't enabled by the account's switch
resource "aws_cloudwatch_event_rule" "probe" {
  name                = "h4-probe-every-minute"
  description         = "h4-probe once a minute, from W2 (spec 001 FR-061)"
  schedule_expression = "rate(1 minute)"
  state               = "ENABLED"

  tags = {
    component = "probe"
  }
}
