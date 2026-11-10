# The bootstrap root, applied first and alone (spec 001 FR-001 to FR-003, FR-022; research.md R-02, R-03): Terraform's
# state bucket here; the budgets, the anomaly monitor, and the h4-alerts topic in budgets.tf and alerts.tf, which are
# protected (FR-012) and arrive as the Author's patch, P-I1.

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      project     = "h4reet-ai"
      environment = "account"
    }
  }
}

data "aws_caller_identity" "current" {}

# Terraform's state, one key per root: versioned, encrypted with S3's own keys, never public, reachable only over TLS,
# and kept from any plan's destroy (research.md R-03). The suffix is a word the Author picks, never the account ID.
resource "aws_s3_bucket" "state" {
  bucket = "h4reet-ai-tfstate-${var.state_bucket_suffix}"

  tags = {
    component = "terraform-state"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# TLS only, for every principal. It grants nothing.
data "aws_iam_policy_document" "state" {
  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state.json

  depends_on = [aws_s3_bucket_public_access_block.state]
}
