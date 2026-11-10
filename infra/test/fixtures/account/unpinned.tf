# The aws provider takes any 6.x, not the pin (FR-004; rule T3).
# expect: versions: the aws provider isn't pinned to 6.72.0
terraform {
  required_version = "1.17.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.72"
    }
  }

  backend "s3" {
    key          = "account.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
