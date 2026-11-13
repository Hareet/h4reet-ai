# The open's schedule in UTC: 07:00 UTC is midnight in Denver, so EC2 would wake at the wrong hour (ADR 0048).
# root: account
# expect: schedules: h4-ec2-hours-open's zone isn't local.ec2_hours's
resource "aws_scheduler_schedule" "ec2_hours_open" {
  count                        = local.wired ? 1 : 0
  name                         = "h4-ec2-hours-open"
  description                  = "EC2's hours open: h4-ec2-start, from hours_open (spec 001 ADR 0048)"
  schedule_expression          = local.ec2_hours_open_cron
  schedule_expression_timezone = "UTC"

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
