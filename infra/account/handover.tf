# The account's half of the handover (spec 001 FR-063 to FR-066, FR-069 to FR-072; contracts/handover.md §2 to §5;
# plan.md §16, "Why a switch"; ADR 0048 and ADR 0049, proposed). Protected (FR-012; rule T5): it changes only by the
# Author's patch. Group 5 writes the switch alone; group 9 (P-I6) adds the hours, h4-ec2-start and h4-ec2-guard, their
# log groups and permissions, the autostart switch, h4-laptop-away-rule, and the hours' two schedules. Their roles are
# iam.tf's. Nothing here names a prod instance or health check, or reads prod's state: the alarm, the rules, and the
# functions are named by their names (plan.md §16, "No root holds another root's instance or health-check ID").

locals {
  # The switch (plan.md §16): false in W1, whose three plan blocks are made before any of W1's applies, so nothing here
  # may need another root's W1 apply, or an image not pushed yet. The Author's P-W2 sets it true for W2, whose blocks
  # follow W1's applies and T174's pushed images. Each resource behind it is written `count = local.wired ? 1 : 0`.
  wired = true
}

# EC2's hours, in a block of their own, so P-W2 changes the switch's block alone.
locals {
  # EC2's hours (ADR 0048, decision 1; the Author's "12 hours, from 7am to 7pm Mountain Standard Time", 2026-11-12):
  # the one source of the hours. Both schedules and both functions' H4_EC2_HOURS read it, and nothing else holds a
  # copy. Provisional: question 1a, recommended option A, America/Denver, the local clock with daylight saving, until
  # the Author's answer; option B is "Etc/GMT+7", a fixed UTC−7. The functions carry exactly those two zones' rules.
  ec2_hours = {
    zone  = "America/Denver"
    open  = "07:00"
    close = "19:00"
  }
  # The functions' one environment value, "<zone> <open>-<close>" (infra/lambdas/ec2_start/start.py).
  ec2_hours_value = "${local.ec2_hours.zone} ${local.ec2_hours.open}-${local.ec2_hours.close}"
  # EventBridge Scheduler's cron, in the zone's own clock: minute, hour, every day.
  ec2_hours_open_cron  = "cron(${tonumber(split(":", local.ec2_hours.open)[1])} ${tonumber(split(":", local.ec2_hours.open)[0])} * * ? *)"
  ec2_hours_close_cron = "cron(${tonumber(split(":", local.ec2_hours.close)[1])} ${tonumber(split(":", local.ec2_hours.close)[0])} * * ? *)"
}

# ----------------------------------------------------------------------------------------------------------------------
# The autostart switch (contracts/handover.md §5): "on" lets EC2 start automatically, "off" stops that. Made "off", so
# nothing starts EC2 on its own until the Author sets it at T178; its value is his from then on, written only by his
# autostart target, and a plan never shows it as drift. W1's: it needs nothing of another root.
resource "aws_ssm_parameter" "ec2_autostart" {
  name        = "/h4reet/prod/ec2-autostart"
  description = "on lets EC2 start automatically; off stops that (spec 001 contracts/handover.md §5)"
  type        = "String"
  value       = "off"

  tags = {
    component = "handover"
  }

  lifecycle {
    ignore_changes = [value]
  }
}

# ----------------------------------------------------------------------------------------------------------------------
# The two functions (contracts/handover.md §3 and §4): container images on arm64, from their repositories by digest
# (registry.tf; main.tf's local.lambda_images), behind the switch, since their digests exist only after W1's account
# apply makes the repositories and the Author pushes (tasks.md T174). Their log groups need nothing and are W1's.

resource "aws_cloudwatch_log_group" "ec2_start" {
  name              = "/aws/lambda/h4-ec2-start"
  retention_in_days = 90

  tags = {
    component = "handover"
  }
}

resource "aws_cloudwatch_log_group" "ec2_guard" {
  name              = "/aws/lambda/h4-ec2-guard"
  retention_in_days = 90

  tags = {
    component = "handover"
  }
}

resource "aws_lambda_function" "ec2_start" {
  count         = local.wired ? 1 : 0
  function_name = "h4-ec2-start"
  description   = "Starts EC2 when its checks all pass (spec 001 contracts/handover.md §3)"
  role          = aws_iam_role.ec2_start.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.lambda["h4-ec2-start"].repository_url}@${local.lambda_images.ec2_start}"
  architectures = ["arm64"]
  # fix/032-launch-policy: at 128 MB, Lambda's slowest CPU, the first real replace (2026-11-22) ran slow enough that
  # Lambda killed it at 900 s between the cancel and the terminate; the Author set 1024 MB by hand, and this renders it.
  memory_size = 1024
  # Spec 032: a replace waits for a terminate, a launch, and an attach, and the tunnel end's then starts EC2
  # (its research R-8): Lambda's maximum.
  timeout = 900

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.ec2_start.name
  }

  environment {
    variables = {
      H4_EC2_HOURS        = local.ec2_hours_value
      H4_ALERTS_TOPIC_ARN = data.aws_sns_topic.alerts.arn
    }
  }

  tags = {
    component = "handover"
  }

  lifecycle {
    precondition {
      condition     = local.lambda_images.ec2_start != ""
      error_message = "h4-ec2-start has no digest: tasks.md T174 pushes its image, and T175 writes local.lambda_images.ec2_start."
    }
  }
}

resource "aws_lambda_function" "ec2_guard" {
  count         = local.wired ? 1 : 0
  function_name = "h4-ec2-guard"
  description   = "Stops EC2 when it runs and shouldn't (spec 001 contracts/handover.md §4)"
  role          = aws_iam_role.ec2_guard.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.lambda["h4-ec2-guard"].repository_url}@${local.lambda_images.ec2_guard}"
  architectures = ["arm64"]
  memory_size   = 128
  timeout       = 30

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.ec2_guard.name
  }

  environment {
    variables = {
      H4_EC2_HOURS        = local.ec2_hours_value
      H4_ALERTS_TOPIC_ARN = data.aws_sns_topic.alerts.arn
    }
  }

  tags = {
    component = "handover"
  }

  lifecycle {
    precondition {
      condition     = local.lambda_images.ec2_guard != ""
      error_message = "h4-ec2-guard has no digest: tasks.md T174 pushes its image, and T175 writes local.lambda_images.ec2_guard."
    }
  }
}

# One attempt per invocation (FR-065): Lambda retries no asynchronous invocation of either. Each function also raises
# nothing, so a retry could only follow Lambda's own failure.
resource "aws_lambda_function_event_invoke_config" "ec2_start" {
  count                  = local.wired ? 1 : 0
  function_name          = aws_lambda_function.ec2_start[0].function_name
  maximum_retry_attempts = 0
  # Spec 032: as long as a run may take, so an invocation queued behind a replace still runs.
  maximum_event_age_in_seconds = 900
}

resource "aws_lambda_function_event_invoke_config" "ec2_guard" {
  count                        = local.wired ? 1 : 0
  function_name                = aws_lambda_function.ec2_guard[0].function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 300
}

# ----------------------------------------------------------------------------------------------------------------------
# What invokes them. EventBridge's three rules, each by its name-built ARN: the account's own h4-laptop-away-rule, and
# prod's h4-tunnel-end-running and h4-ec2-running, which name these functions by theirs (infra/prod/handover.tf). The
# schedules invoke through their role, iam.tf's h4-ec2-hours, and need no permission here.

resource "aws_lambda_permission" "ec2_start_laptop_away" {
  count         = local.wired ? 1 : 0
  statement_id  = "TheLaptopsAlarm"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ec2_start[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.laptop_away[0].arn
}

resource "aws_lambda_permission" "ec2_start_tunnel_end_back" {
  count         = local.wired ? 1 : 0
  statement_id  = "TheTunnelEndsReturn"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ec2_start[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = "arn:aws:events:us-east-1:${data.aws_caller_identity.current.account_id}:rule/h4-tunnel-end-running"
}

resource "aws_lambda_permission" "ec2_guard_running" {
  count         = local.wired ? 1 : 0
  statement_id  = "EC2EnteringRunning"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ec2_guard[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = "arn:aws:events:us-east-1:${data.aws_caller_identity.current.account_id}:rule/h4-ec2-running"
}

# The laptop's alarm, prod's h4-laptop-away, by its name: its change into ALARM, the laptop going, starts EC2
# (contracts/handover.md §2; research.md R-29). The function reads the event itself.
resource "aws_cloudwatch_event_rule" "laptop_away" {
  count       = local.wired ? 1 : 0
  name        = "h4-laptop-away-rule"
  description = "h4-laptop-away into ALARM, to h4-ec2-start (spec 001 contracts/handover.md §2)"
  event_pattern = jsonencode({
    source      = ["aws.cloudwatch"]
    detail-type = ["CloudWatch Alarm State Change"]
    detail = {
      alarmName = ["h4-laptop-away"]
      state = {
        value = ["ALARM"]
      }
    }
  })

  tags = {
    component = "handover"
  }
}

resource "aws_cloudwatch_event_target" "laptop_away" {
  count     = local.wired ? 1 : 0
  rule      = aws_cloudwatch_event_rule.laptop_away[0].name
  target_id = "h4-ec2-start"
  arn       = aws_lambda_function.ec2_start[0].arn
}

# ----------------------------------------------------------------------------------------------------------------------
# The hours' two schedules (ADR 0048, decision 2): at the open, the start function, `from: hours_open`; at the close,
# the guard, `from: hours_close`. Each in the zone of local.ec2_hours, with no flexible window, and no retry: the
# functions make their one attempt. Neither calls EC2's API, so only the functions start and stop EC2.

resource "aws_scheduler_schedule" "ec2_hours_open" {
  count                        = local.wired ? 1 : 0
  name                         = "h4-ec2-hours-open"
  description                  = "EC2's hours open: h4-ec2-start, from hours_open (spec 001 ADR 0048)"
  schedule_expression          = local.ec2_hours_open_cron
  schedule_expression_timezone = local.ec2_hours.zone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.ec2_start[0].arn
    role_arn = aws_iam_role.ec2_hours.arn
    input    = jsonencode({ from = "hours_open" })

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

resource "aws_scheduler_schedule" "ec2_hours_close" {
  count                        = local.wired ? 1 : 0
  name                         = "h4-ec2-hours-close"
  description                  = "EC2's hours close: h4-ec2-guard, from hours_close (spec 001 ADR 0048)"
  schedule_expression          = local.ec2_hours_close_cron
  schedule_expression_timezone = local.ec2_hours.zone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.ec2_guard[0].arn
    role_arn = aws_iam_role.ec2_hours.arn
    input    = jsonencode({ from = "hours_close" })

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

# The tunnel end's check's state: DISABLED until the Author's dry run of the start function proves its role
# launches each listed type (the merge-request note's step 6, `make ec2-start REPLACE=… DRY_RUN=1`); his hand
# sets ENABLED, in this protected file, and his account apply turns it on (spec 032's rework).
locals {
  tunnel_end_check_state = "DISABLED"
}

# The tunnel end's check (spec 032 FR-013; ADR 0057): every 5 minutes, the start function, `from: tunnel_end_check`,
# which replaces the tunnel end from its list after 10 minutes of a capacity stop. Through h4-ec2-hours, which may
# invoke the start function already; no retry, since the next check is 5 minutes away.
resource "aws_scheduler_schedule" "tunnel_end_check" {
  count               = local.wired ? 1 : 0
  name                = "h4-tunnel-end-check"
  description         = "The tunnel end's check: the start function, from tunnel_end_check (spec 032)"
  schedule_expression = "rate(5 minutes)"
  state               = local.tunnel_end_check_state

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.ec2_start[0].arn
    role_arn = aws_iam_role.ec2_hours.arn
    input    = jsonencode({ from = "tunnel_end_check" })

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

# The guard's budget check (spec 032's rework): every 5 minutes, h4-ec2-guard, `from: budget_check`, which stops every
# running EC2 while the server action has run and isn't reversed, whichever instance the action names, so a replace
# before the next prod apply leaves the kill switch these minutes' gap. Enabled from its apply: it reads, and stops
# only by the server action's own condition.
resource "aws_scheduler_schedule" "ec2_budget_check" {
  count               = local.wired ? 1 : 0
  name                = "h4-ec2-budget-check"
  description         = "The guard's budget check: h4-ec2-guard, from budget_check (spec 032)"
  schedule_expression = "rate(5 minutes)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.ec2_guard[0].arn
    role_arn = aws_iam_role.ec2_hours.arn
    input    = jsonencode({ from = "budget_check" })

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}
