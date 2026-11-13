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
# The probe's schedule (FR-061): once a minute, enabled by the account's switch, local.wired, in handover.tf (group 8's
# P-I5). W1 holds the switch off, so the schedule stays disabled until W2's apply, after prod's, has made the site and
# the status request it checks (plan.md §16, "Why a switch", "W2's order"). Until then the probe calls nothing (row
# C11).

resource "aws_cloudwatch_event_rule" "probe" {
  name                = "h4-probe-every-minute"
  description         = "h4-probe once a minute, from W2 (spec 001 FR-061)"
  schedule_expression = "rate(1 minute)"
  state               = local.wired ? "ENABLED" : "DISABLED"

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

# ----------------------------------------------------------------------------------------------------------------------
# Two alarms to h4-alerts (tasks.md T159; group 4's Backlog; contracts/aws-alerts.md §2). Each reads missing data as
# not breaching, so neither pages while its function or queue is idle; h4-alerts lets CloudWatch's alarms publish for
# this account alone (the bootstrap's alerts.tf, T160).

# The credential audit raised: its weekly run didn't finish, so no result was written and no finding was sent.
resource "aws_cloudwatch_metric_alarm" "credential_audit_errors" {
  count               = length(aws_lambda_function.credential_audit)
  alarm_name          = "h4-credential-audit-errors"
  alarm_description   = "h4-credential-audit raised: the weekly audit didn't finish (spec 001 FR-022)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.credential_audit[0].function_name }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]

  tags = {
    component = "credential-audit"
  }
}

# The probe failed for 5 minutes in a row (contracts/aws-alerts.md §5; group 4's departure 2): probe_failing, and on its
# next pass probe_recovered. A run that didn't happen counts as a failed one, so the alarm reads missing data as
# breaching, and so it waits behind the switch with the schedule: in W1 it would page every five minutes. It also waits
# for the probe's function, which exists once its digest is set: an alarm on a function that isn't there would page as
# surely (group 8's review B, nit 5).
resource "aws_cloudwatch_metric_alarm" "probe_failing" {
  count               = local.wired && length(aws_lambda_function.probe) > 0 ? 1 : 0
  alarm_name          = "h4-probe-failing"
  alarm_description   = "h4-probe failed for 5 minutes: hareet.ai or its status request isn't answering (spec 001 FR-061)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = "h4-probe" }
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  ok_actions          = [data.aws_sns_topic.alerts.arn]

  tags = {
    component = "probe"
  }
}

# A notice the bridge couldn't send to Telegram, after Lambda's two retries, waits in its failure queue. The email half
# still has SNS's own copy, and this alarm's.
resource "aws_cloudwatch_metric_alarm" "bridge_failed" {
  alarm_name          = "h4-alert-bridge-failed"
  alarm_description   = "A notice the bridge couldn't send to Telegram is in h4-alert-bridge-failed (spec 001 FR-022)"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.alert_bridge_failed.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]

  tags = {
    component = "alert-bridge"
  }
}
