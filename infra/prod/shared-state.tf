# The shared state on the tunnel end (spec 001 FR-017 to FR-020; contracts/shared-state.md §1; research.md R-20, as
# built for W1; plan.md §16, "The shared state on the tunnel end"): Postgres in a container, the `shared-state`
# service, by the Author's answer of 2026-11-11, "Postgres in a container on the tunnel end". This file holds what
# Terraform makes for it: its data volume and the volume's attachment, and its backups' bucket. 5432's rule is the
# tunnel end's private group's (tunnel-end.tf), from EC2's group alone; the tunnel end role's grants on the bucket and
# the shared state's parameters are the protected iam.tf's (P-I7). Nothing here holds a password, a key, or a value
# of the store (rule T9).

locals {
  # The data volume's size, in GiB: the meter's rows, its call records, and the audit log, a few megabytes a month.
  # T166 measures the store after its load run and confirms it, beside the tunnel end's type (tunnel-end.tf).
  shared_state_volume_gib = 8
}

# Its own encrypted volume, in the tunnel end's zone, which a spot stop keeps (research.md R-30). prevent_destroy
# blocks a plan that would replace it, so a move to another zone is a reviewed change: a second volume, filled from
# the last backup, with this one kept until a later change lifts its prevent_destroy (docs/runbooks/shared-state.md).
resource "aws_ebs_volume" "shared_state" {
  availability_zone = local.zone
  size              = local.shared_state_volume_gib
  type              = "gp3"
  encrypted         = true

  tags = {
    Name      = "h4-shared-state"
    component = "shared-state"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# /dev/sdf, which the tunnel end's host script, deploy/hosts/tunnel-end/shared_state.py, formats once, when it holds no
# filesystem, and mounts at /srv/h4reet/shared-state. From spec 032, h4-ec2-start attaches it to each tunnel end it
# launches, once the one before is terminated, so Postgres never loses its disk under it (FR-007); this root forgets
# the attachment it made for the first, never detaching it.
removed {
  from = aws_volume_attachment.shared_state

  lifecycle {
    destroy = false
  }
}

# The backups' bucket (the regrouping note's question 4, option A, relayed by the main session as the Author's
# answer): an hourly pg_dump under dumps/, kept 7 days, its old versions too. The tunnel end's role may only put there
# (iam.tf); a restore's GET is presigned in the Author's terminal (contracts/shared-state.md §8). Its name holds the
# account's ID, which the host and the Author's terminal each read for themselves, so no root reads another's.
resource "aws_s3_bucket" "shared_state_backups" {
  bucket = "h4reet-ai-shared-state-${data.aws_caller_identity.current.account_id}"

  tags = {
    component = "shared-state"
  }
}

resource "aws_s3_bucket_versioning" "shared_state_backups" {
  bucket = aws_s3_bucket.shared_state_backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "shared_state_backups" {
  bucket = aws_s3_bucket.shared_state_backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "shared_state_backups" {
  bucket                  = aws_s3_bucket.shared_state_backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "shared_state_backups" {
  bucket = aws_s3_bucket.shared_state_backups.id

  rule {
    id     = "dumps-kept-7-days"
    status = "Enabled"

    filter {
      prefix = "dumps/"
    }

    expiration {
      days = 7
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.shared_state_backups]
}

# Every request without TLS is refused, whoever makes it.
data "aws_iam_policy_document" "shared_state_backups" {
  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.shared_state_backups.arn, "${aws_s3_bucket.shared_state_backups.arn}/*"]

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

resource "aws_s3_bucket_policy" "shared_state_backups" {
  bucket = aws_s3_bucket.shared_state_backups.id
  policy = data.aws_iam_policy_document.shared_state_backups.json

  depends_on = [aws_s3_bucket_public_access_block.shared_state_backups]
}
