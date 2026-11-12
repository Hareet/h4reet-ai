# The backups' bucket with one public access setting off.
# expect: backups: public access isn't blocked
resource "aws_s3_bucket_public_access_block" "shared_state_backups" {
  bucket                  = aws_s3_bucket.shared_state_backups.id
  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = true
}
