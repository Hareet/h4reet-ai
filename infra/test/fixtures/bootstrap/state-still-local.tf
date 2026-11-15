# The state left local after the account's first apply, when T030's move puts it in the bucket (FR-003; research.md
# R-03; group 3's departure 4).
# expect: versions: the state isn't in the bucket, under bootstrap.tfstate
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
