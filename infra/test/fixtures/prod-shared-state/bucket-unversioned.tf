# The backups' bucket with versioning suspended: an overwritten dump would be gone.
# expect: backups: the bucket isn't versioned
resource "aws_s3_bucket_versioning" "shared_state_backups" {
  bucket = aws_s3_bucket.shared_state_backups.id

  versioning_configuration {
    status = "Suspended"
  }
}
