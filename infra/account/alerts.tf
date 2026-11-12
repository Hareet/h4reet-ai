# What reaches h4-alerts' functions, and when (spec 001 FR-022, FR-061; research.md R-23, R-24; contracts/aws-alerts.md
# §1, §2, §5): the bridge's subscription to the topic, the probe's schedule, written disabled, and the credential
# audit's weekly schedule. The topic itself is the bootstrap's (infra/bootstrap/alerts.tf). Protected (FR-012; rule T5:
# SNS, EventBridge, and Lambda's permissions live only in protected files): it changes only by the Author's patch.

data "aws_sns_topic" "alerts" {
  name = "h4-alerts"
}

# ----------------------------------------------------------------------------------------------------------------------
# h4-alerts' Telegram half (row C8): every notice on the topic goes to h4-alert-bridge, and SNS may invoke it for this
# topic alone. The email half is the bootstrap's subscription.

resource "aws_lambda_permission" "alert_bridge_sns" {
  count         = length(aws_lambda_function.alert_bridge)
  statement_id  = "h4-alerts"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alert_bridge[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = data.aws_sns_topic.alerts.arn
}

resource "aws_sns_topic_subscription" "alert_bridge" {
  count     = length(aws_lambda_function.alert_bridge)
  topic_arn = data.aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.alert_bridge[0].arn

  depends_on = [aws_lambda_permission.alert_bridge_sns]
}

# ----------------------------------------------------------------------------------------------------------------------
# The probe's schedule (FR-061): once a minute, written disabled. The line that enables it is group 8's P-I5, once the
# site and the status request exist, with its alarm after 5 failed minutes and h4-alerts' CloudWatch publisher (plan.md
# §16, group 4's departures). Until then the probe calls nothing (row C11).

resource "aws_cloudwatch_event_rule" "probe" {
  name                = "h4-probe-every-minute"
  description         = "h4-probe once a minute; enabled in group 8 (spec 001 FR-061)"
  schedule_expression = "rate(1 minute)"
  state               = "DISABLED"

  tags = {
    component = "probe"
  }
}

resource "aws_cloudwatch_event_target" "probe" {
  count     = length(aws_lambda_function.probe)
  rule      = aws_cloudwatch_event_rule.probe.name
  target_id = "h4-probe"
  arn       = aws_lambda_function.probe[0].arn

  retry_policy {
    maximum_retry_attempts       = 0
    maximum_event_age_in_seconds = 60
  }
}

resource "aws_lambda_permission" "probe_events" {
  count         = length(aws_lambda_function.probe)
  statement_id  = "h4-probe-every-minute"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.probe[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.probe.arn
}

# ----------------------------------------------------------------------------------------------------------------------
# The credential audit's weekly run (FR-008; contracts/infra-records.md §4): Mondays at 06:00 UTC. The Author's
# make infra-audit and make infra-verify run the same checks in his terminal.

resource "aws_cloudwatch_event_rule" "credential_audit" {
  name                = "h4-credential-audit-weekly"
  description         = "h4-credential-audit, weekly (spec 001 FR-008)"
  schedule_expression = "cron(0 6 ? * MON *)"
  state               = "ENABLED"

  tags = {
    component = "credential-audit"
  }
}

resource "aws_cloudwatch_event_target" "credential_audit" {
  count     = length(aws_lambda_function.credential_audit)
  rule      = aws_cloudwatch_event_rule.credential_audit.name
  target_id = "h4-credential-audit"
  arn       = aws_lambda_function.credential_audit[0].arn

  retry_policy {
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 3600
  }
}

resource "aws_lambda_permission" "credential_audit_events" {
  count         = length(aws_lambda_function.credential_audit)
  statement_id  = "h4-credential-audit-weekly"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.credential_audit[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.credential_audit.arn
}
