# The release bucket would take a public policy (rule T6).
# expect: registry: the release bucket's public access isn't blocked, all four
resource "aws_s3_bucket_public_access_block" "releases" {
  bucket = aws_s3_bucket.releases.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = true
}
