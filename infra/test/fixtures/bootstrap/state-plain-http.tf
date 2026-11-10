# The state bucket's policy denies something, but not requests without TLS (research.md R-03).
# expect: state bucket: no TLS-only deny on the bucket and its objects
data "aws_iam_policy_document" "state" {
  statement {
    sid       = "NoDelete"
    effect    = "Deny"
    actions   = ["s3:DeleteBucket"]
    resources = [aws_s3_bucket.state.arn]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}
