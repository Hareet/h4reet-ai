# The bucket's policy made in W1, before the distribution whose ARN it names exists.
# expect: bucket: its policy doesn't wait behind the switch
resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site[0].json

  depends_on = [aws_s3_bucket_public_access_block.site]
}
