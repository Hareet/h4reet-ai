# The state bucket with no component tag (FR-002; rule T2).
# expect: tags: aws_s3_bucket.state sets no component
resource "aws_s3_bucket" "state" {
  bucket = "h4reet-ai-tfstate-${var.state_bucket_suffix}"

  lifecycle {
    prevent_destroy = true
  }
}
