# The dumps kept 30 days, not question 4's 7.
# expect: backups: the dumps aren't kept 7 days
resource "aws_s3_bucket_lifecycle_configuration" "shared_state_backups" {
  bucket = aws_s3_bucket.shared_state_backups.id

  rule {
    id     = "dumps-kept-7-days"
    status = "Enabled"

    filter {
      prefix = "dumps/"
    }

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.shared_state_backups]
}
