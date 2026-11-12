# The account's state stays local, outside the bootstrap's bucket (research.md R-03).
# expect: versions: the state isn't in the bucket's s3 backend
terraform {
  required_version = "1.17.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }

  backend "local" {}
}
