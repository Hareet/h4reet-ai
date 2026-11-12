# The bucket as the backend from the first apply, before the bucket exists (FR-003; research.md R-03).
# expect: versions: the state doesn't start local
terraform {
  required_version = "1.17.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }

  backend "s3" {}
}
