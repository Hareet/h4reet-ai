# The prod root (spec 001 FR-043, FR-044, FR-051 to FR-055, FR-076; research.md R-02, R-04, R-10, R-11; plan.md §4,
# §5, and §16), applied after the account: from group 5, the network and the tunnel end (network.tf, tunnel-end.tf,
# ssm.tf), and the protected files that arrive as the Author's patch P-I3: the tunnel end's spot instance
# (ec2-market.tf), its role (iam.tf), and its interruption warning and the root's switch (handover.tf). Later groups add
# the shared state, EC2, the edge, and the handover.
#
# No root reads another's resources (plan.md §16, "Why a switch"): what this root needs of the account and the
# bootstrap, the topic and the repositories, it names by name-built ARNs, never by a data source or a remote state.

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      project     = "h4reet-ai"
      environment = "prod"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # One zone for both subnets, so the tunnel end's two interfaces share it. Its runbook's move to another zone is a
  # reviewed change of this line (docs/runbooks/tunnel-end.md), since a spot instance stops and starts in its zone.
  zone = "us-east-1a"
}
