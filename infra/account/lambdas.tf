# The account's three functions (spec 001 FR-008, FR-022, FR-061; research.md R-23, R-24; contracts/aws-alerts.md §1,
# §2, §5): container images on arm64, each from its own repository by digest (registry.tf; plan.md Technical Context),
# on AWS's python3.14 base, and each made only once local.lambda_images names its digest (main.tf). Their roles are
# iam.tf's; what invokes them, the topic's subscription and the two schedules, is alerts.tf's (rule T5): no EventBridge
# rule lives here.

resource "aws_cloudwatch_log_group" "alert_bridge" {
  name              = "/aws/lambda/h4-alert-bridge"
  retention_in_days = 30

  tags = {
    component = "alert-bridge"
  }
}

resource "aws_cloudwatch_log_group" "probe" {
  name              = "/aws/lambda/h4-probe"
  retention_in_days = 30

  tags = {
    component = "probe"
  }
}

resource "aws_cloudwatch_log_group" "credential_audit" {
  name              = "/aws/lambda/h4-credential-audit"
  retention_in_days = 90

  tags = {
    component = "credential-audit"
  }
}

# h4-alert-bridge: h4-alerts' Telegram half. It reads the bot's token and the chat ID from Parameter Store at each run,
# the Author's SecureStrings, which Terraform never reads or writes (FR-009; research.md R-26).
resource "aws_lambda_function" "alert_bridge" {
  count         = local.lambda_images.alert_bridge == "" ? 0 : 1
  function_name = "h4-alert-bridge"
  description   = "h4-alerts to Telegram (spec 001 contracts/aws-alerts.md §2)"
  role          = aws_iam_role.alert_bridge.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.lambda["h4-alert-bridge"].repository_url}@${local.lambda_images.alert_bridge}"
  architectures = ["arm64"]
  memory_size   = 128
  timeout       = 30

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.alert_bridge.name
  }

  environment {
    variables = {
      H4_TELEGRAM_TOKEN_PARAMETER = "/h4reet/alerts/TELEGRAM_BOT_TOKEN"
      H4_TELEGRAM_CHAT_PARAMETER  = "/h4reet/alerts/TELEGRAM_CHAT_ID"
    }
  }

  tags = {
    component = "alert-bridge"
  }
}

# SNS invokes it asynchronously: a message it couldn't send after its own three attempts is retried twice by Lambda,
# then lands in the failure queue, where the Author finds it and the dashboard counts it (contracts/aws-alerts.md §2).
resource "aws_lambda_function_event_invoke_config" "alert_bridge" {
  count                        = length(aws_lambda_function.alert_bridge)
  function_name                = aws_lambda_function.alert_bridge[0].function_name
  maximum_retry_attempts       = 2
  maximum_event_age_in_seconds = 3600

  destination_config {
    on_failure {
      destination = aws_sqs_queue.alert_bridge_failed.arn
    }
  }
}

resource "aws_sqs_queue" "alert_bridge_failed" {
  name                      = "h4-alert-bridge-failed"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true

  tags = {
    component = "alert-bridge"
  }
}

# h4-probe: the two checks with X-H4-Probe: 1, once a minute when alerts.tf's schedule is enabled (group 8's P-I5).
resource "aws_lambda_function" "probe" {
  count         = local.lambda_images.probe == "" ? 0 : 1
  function_name = "h4-probe"
  description   = "The uptime probe (spec 001 contracts/aws-alerts.md §5)"
  role          = aws_iam_role.probe.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.lambda["h4-probe"].repository_url}@${local.lambda_images.probe}"
  architectures = ["arm64"]
  memory_size   = 128
  timeout       = 15

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.probe.name
  }

  environment {
    variables = {
      H4_PROBE_SITE = "https://hareet.ai"
    }
  }

  tags = {
    component = "probe"
  }
}

# A failed run is the alarm's data point (group 8): the next minute is its retry, so Lambda retries none.
resource "aws_lambda_function_event_invoke_config" "probe" {
  count                        = length(aws_lambda_function.probe)
  function_name                = aws_lambda_function.probe[0].function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 60
}

# h4-credential-audit: weekly, from alerts.tf's schedule; audit.py's handler, with the AWS SDK its base carries. It
# stores each result in the release bucket and publishes any finding to h4-alerts (contracts/infra-records.md §4).
resource "aws_lambda_function" "credential_audit" {
  count         = local.lambda_images.credential_audit == "" ? 0 : 1
  function_name = "h4-credential-audit"
  description   = "The weekly credential audit (spec 001 contracts/infra-records.md §4)"
  role          = aws_iam_role.credential_audit.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.lambda["h4-credential-audit"].repository_url}@${local.lambda_images.credential_audit}"
  architectures = ["arm64"]
  memory_size   = 256
  timeout       = 120

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.credential_audit.name
  }

  environment {
    variables = {
      H4_AUDIT_BUCKET     = aws_s3_bucket.releases.bucket
      H4_ALERTS_TOPIC_ARN = data.aws_sns_topic.alerts.arn
    }
  }

  tags = {
    component = "credential-audit"
  }
}

resource "aws_lambda_function_event_invoke_config" "credential_audit" {
  count                        = length(aws_lambda_function.credential_audit)
  function_name                = aws_lambda_function.credential_audit[0].function_name
  maximum_retry_attempts       = 1
  maximum_event_age_in_seconds = 3600
}
