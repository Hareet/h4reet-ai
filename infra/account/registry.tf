# The registry and the release bucket (spec 001 FR-046 to FR-048; plan.md §9, Technical Context; research.md R-17;
# data-model.md §1 at 00309c47): one ECR repository per function and per service the cloud hosts run, each tag fixed
# once pushed and each image scanned on push; and the bucket releases' records go to, with the credential audit's
# results (contracts/infra-records.md §4). The Author pushes to both from his terminal (disclosure row C10); the hosts
# and the functions only pull.

resource "aws_ecr_repository" "lambda" {
  for_each             = toset(local.lambda_repositories)
  name                 = each.key
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    component = "registry"
  }
}

resource "aws_ecr_repository" "stack" {
  for_each             = toset(local.stack_repositories)
  name                 = "h4reet/${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    component = "registry"
  }
}

# The newest ten images a function's repository holds; a function runs one digest, and the Author's rollback the one
# before it.
resource "aws_ecr_lifecycle_policy" "lambda" {
  for_each   = aws_ecr_repository.lambda
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the newest ten images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      },
    ]
  })
}

# The newest ten tagged releases of a service; a multi-architecture index's platform images are untagged and stay with
# it (research.md R-05's three releases, two platforms, to confirm in group 7).
resource "aws_ecr_lifecycle_policy" "stack" {
  for_each   = aws_ecr_repository.stack
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the newest ten tagged releases"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["*"]
          countType      = "imageCountMoreThan"
          countNumber    = 10
        }
        action = { type = "expire" }
      },
    ]
  })
}

# Lambda pulls a function's image as its own service, for this account's h4- functions alone.
data "aws_iam_policy_document" "lambda_pull" {
  statement {
    sid     = "LambdaPullsTheFunctionsImages"
    effect  = "Allow"
    actions = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:lambda:us-east-1:${data.aws_caller_identity.current.account_id}:function:h4-*"]
    }
  }
}

resource "aws_ecr_repository_policy" "lambda" {
  for_each   = aws_ecr_repository.lambda
  repository = each.value.name
  policy     = data.aws_iam_policy_document.lambda_pull.json
}

# ----------------------------------------------------------------------------------------------------------------------
# The release bucket: releases/, trees/, and audits/credential/ (data-model.md §1 and §6.6 at 00309c47). Its name is
# AWS's, from the prefix, so the root needs no new variable; the hosts read it from Parameter Store, from group 7.

resource "aws_s3_bucket" "releases" {
  bucket_prefix = "h4reet-ai-releases-"

  tags = {
    component = "releases"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "releases" {
  bucket = aws_s3_bucket.releases.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "releases" {
  bucket = aws_s3_bucket.releases.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "releases" {
  bucket = aws_s3_bucket.releases.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# TLS only, naming the account as the state bucket's policy does (plan.md §16, group 3's departure 5): it grants
# nothing.
data "aws_iam_policy_document" "releases" {
  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.releases.arn, "${aws_s3_bucket.releases.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "releases" {
  bucket = aws_s3_bucket.releases.id
  policy = data.aws_iam_policy_document.releases.json

  depends_on = [aws_s3_bucket_public_access_block.releases]
}
