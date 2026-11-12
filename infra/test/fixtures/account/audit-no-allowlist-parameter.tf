# h4-credential-audit with no allowlist parameter named, so every week it alerts on the Author's other work, which
# his answers allow (ADR 0047).
# expect: credential audit: its environment doesn't name the Author's allowlist parameter
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
