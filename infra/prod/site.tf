# The site's bucket (spec 001 FR-027, FR-036 to FR-038, FR-057; contracts/edge.md §3 and §5; contracts/public-view.md
# §1; contracts/releases-deployer.md §2.5; plan.md §8.2 and §16, "Why a switch"). One bucket: the release syncs the
# room's built site to site/ and keeps each release's copy under releases/<commit>/ for a rollback; the snapshot sink
# writes the public view to site/status/latest.json (group 10). CloudFront reads site/ alone, through its origin
# access control (edge.tf); nothing else reads it, and no object is public. The bucket, its encryption, its owner's
# objects, and its public access block are W1's. Its policy waits behind prod's local.wired, since its aws:SourceArn
# is the distribution's, which is W2's. Its name holds the account's ID, which the Author's terminal reads for itself,
# so no root reads another's.

resource "aws_s3_bucket" "site" {
  bucket = "h4reet-ai-site-${data.aws_caller_identity.current.account_id}"

  tags = {
    component = "site"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Old releases' copies go after 90 days; the newest few are what a rollback reads (contracts/edge.md §5).
resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    id     = "releases-kept-90-days"
    status = "Enabled"

    filter {
      prefix = "releases/"
    }

    expiration {
      days = 90
    }
  }
}

# CloudFront reads site/*, for this distribution alone; and every request without TLS is refused, whoever makes it.
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

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site[0].arn]
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

resource "aws_s3_bucket_policy" "site" {
  count  = local.wired ? 1 : 0
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site[0].json

  depends_on = [aws_s3_bucket_public_access_block.site]
}
