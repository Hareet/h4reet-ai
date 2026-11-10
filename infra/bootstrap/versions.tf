# The bootstrap root's pins and its state (spec 001 FR-003, FR-004; research.md R-02, R-03). The pins are
# .devcontainer/toolchain.vars's, which rules T3 and T10 hold these lines and the lockfile to. The state starts local:
# make plan ROOT=bootstrap names its path, ~/.config/h4reet-ai/infra/state/bootstrap.tfstate, outside the tree and
# denied to agents. It moves to the bucket main.tf creates once the Author has applied this root (tasks.md T030).
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
