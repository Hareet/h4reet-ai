# The bucket readable by any distribution: someone else's could serve the site (no aws:SourceArn).
# expect: bucket: its policy doesn't let CloudFront read site/* for this distribution alone
data "aws_iam_policy_document" "site" {
  count = local.wired ? 1 : 0

  statement {
    sid       = "CloudFrontReadsTheSite"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/site/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

  }

  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
