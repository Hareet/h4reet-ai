# The state bucket with one of Block Public Access's four settings off (FR-001: never public).
# expect: state bucket: public access isn't blocked on all four settings
resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = false
}
