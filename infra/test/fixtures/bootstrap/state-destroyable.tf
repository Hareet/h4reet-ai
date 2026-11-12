# The state bucket without prevent_destroy: a plan could delete every root's state.
# expect: state bucket: prevent_destroy isn't set
resource "aws_s3_bucket" "state" {
  bucket = "h4reet-ai-tfstate-${var.state_bucket_suffix}"

  tags = {
    component = "terraform-state"
  }
}
