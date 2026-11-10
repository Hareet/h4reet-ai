# The provider by a range, not the exact pin (FR-004; rule T3).
# expect: versions: the aws provider isn't pinned to
terraform {
  required_version = "1.17.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.72"
    }
  }

  backend "local" {}
}
