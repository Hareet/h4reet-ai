# The state bucket with versioning suspended (research.md R-03).
# expect: state bucket: versioning isn't Enabled
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Suspended"
  }
}
