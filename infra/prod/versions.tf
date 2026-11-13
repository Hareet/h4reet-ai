# The prod root's pins and its state (spec 001 FR-003, FR-004; research.md R-02, R-03). The pins are
# .devcontainer/toolchain.vars's, which rules T3 and T10 hold these lines and the lockfile to. The state lives in the
# bootstrap's bucket from the first apply, under its own key, with S3's own lock file; the Author's real plan supplies
# the bucket's name (-backend-config=bucket=…), from the suffix in his bootstrap.env, so no name is written here.
terraform {
  required_version = "1.17.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }

  backend "s3" {
    key          = "prod.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
