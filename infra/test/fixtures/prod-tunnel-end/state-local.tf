# Prod's state on the laptop: the state lives in the bootstrap's bucket, under prod.tfstate (research.md R-03).
# expect: versions: the state isn't prod.tfstate in the bucket
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
