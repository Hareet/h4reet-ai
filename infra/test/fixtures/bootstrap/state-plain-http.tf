# The state bucket's policy denies something, but not requests without TLS (research.md R-03).
# expect: state bucket: no TLS-only deny on the bucket and its objects
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "NoDelete"
        Effect    = "Deny"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "s3:DeleteBucket"
        Resource  = [aws_s3_bucket.state.arn]
      },
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.state]
}
