# The account root (spec 001 FR-012, FR-013, FR-022 to FR-026, FR-061; research.md R-02, R-15, R-22 to R-24), applied
# after the bootstrap: the alert bridge, the probe, and the credential audit (lambdas.tf), the registry and the release
# bucket (registry.tf), and the rehearsal instance below. The laptop's Bedrock identity, the functions' roles, the model
# action and both rehearsals' actions, and the topic's subscriber and the schedules are protected (FR-012) and arrive as
# the Author's patch, P-I2: iam.tf, killswitch.tf, and alerts.tf.

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      project     = "h4reet-ai"
      environment = "account"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # Both budget actions' rehearsals (FR-026; contracts/aws-alerts.md §4; tasks.md T040): true only while the Author
  # rehearses, by a reviewed change like any other, since every apply needs its plan in a merged note. That change also
  # adds infra/account/rehearsal-on.txt, naming its note, whose `<!-- h4-rehearsal: on -->` line says it is the
  # rehearsal; the change that ends it sets false and removes the marker (infra/test/test_account.py). The permission
  # set's name is iam.tf's own local.
  rehearsal = false

  # The one inference profile config/routing.yaml's bedrock adapter names, and the models it routes to (spec 000
  # T105; research.md R-15). infra/test/test_account.py holds the first to routing.yaml's.
  inference_profile = "us.anthropic.claude-haiku-5-5"
  foundation_model  = "anthropic.claude-haiku-5-5"

  # Each function's image in ECR, by digest, once the Author has built and pushed it (tasks.md T040): a function is
  # made only once its digest is set, so the first apply makes the registry the images go to.
  lambda_images = {
    # The bridge's again, since W1's patches changed bridge.py (P-I3, P-I7, P-I6): the Author's T174 push, from main
    # 5932748c, 2026-11-16, written here by T175.
    alert_bridge = "sha256:e0f5e03b15b620a0bcaff76e16cc1d1594c1dd2bc45dc399f76dc44d4051b95a"
    probe        = "sha256:85e0a4e0a428482e9f10829f8fde23313762cce3fc06410b3fd87ca460e7f205"
    # Spec 032's (the launch permissions' check, run_holds): the Author's push from main f2f63e7f, 2026-11-22.
    credential_audit = "sha256:76f01fe94d7aeec7ca4d91d7e975ebc5c69bdc3c2a7fbd22b2fbcb1cde1be0da"
    # Group 9's (tasks.md T122), then spec 032's (the replace, the dry runs, the repair, the budget check): the
    # Author's push from main f2f63e7f, 2026-11-22. "" was the one form handover.tf's preconditions refuse, so no plan
    # ran before these digests were in.
    ec2_start = "sha256:b457ac9f4f7458cce2df54c40e7d781cae842d568cd3d39cb7382578d07e6992"
    ec2_guard = "sha256:67866d55c51facdf86cfca79ba94920aceea2f6d0ff91712ead29adc2b616b95"
  }

  # One repository per function, and one per service the cloud hosts run (contracts/env-cloud.md §3): EC2's whole
  # stack but the model server and the local store, and the tunnel end's collector. Group 5 adds the three the tunnel
  # end's deployer pulls before groups 8 to 10 build their images (tasks.md T051; the regrouping review's I4): the
  # tunnel's, both ends' one image; the relay's; and the snapshot's, the sink's and the publisher's.
  # Group 9 adds the start function's and the guard's, made by W1's apply so the Author can push before W2 (T122,
  # T174).
  lambda_repositories = ["h4-alert-bridge", "h4-probe", "h4-credential-audit", "h4-ec2-start", "h4-ec2-guard"]
  stack_repositories = [
    "edge",
    "web",
    "gateway",
    "otel-collector",
    "prometheus",
    "loki",
    "grafana",
    "langfuse-web",
    "langfuse-worker",
    "langfuse-db",
    "clickhouse",
    "valkey",
    "seaweedfs",
    "tunnel",
    "relay",
    "snapshot",
    # Group 6's shared state (tasks.md T164): spec 000's pinned Postgres, gateway-state's, copied by its index digest.
    "shared-state",
  ]
}

# ----------------------------------------------------------------------------------------------------------------------
# h4-rehearsal-instance, the server rehearsal's target (FR-026; contracts/aws-alerts.md §4): a t4g.nano in a network
# of its own with no route out and no rule in, which the rehearsal's action stops through Systems Manager's
# AWS-StopEC2Instance. It exists only while local.rehearsal is true, and runs from its creation: the Author checks it
# is running before the trip, since stopping a stopped instance proves nothing (tasks.md T040).

data "aws_ami" "rehearsal" {
  count       = local.rehearsal ? 1 : 0
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-minimal-2023.*-arm64"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

resource "aws_vpc" "rehearsal" {
  count      = local.rehearsal ? 1 : 0
  cidr_block = "10.250.0.0/28"

  tags = {
    Name      = "h4-rehearsal"
    component = "rehearsal"
  }
}

resource "aws_subnet" "rehearsal" {
  count      = local.rehearsal ? 1 : 0
  vpc_id     = aws_vpc.rehearsal[0].id
  cidr_block = "10.250.0.0/28"

  tags = {
    Name      = "h4-rehearsal"
    component = "rehearsal"
  }
}

# No rule, in or out: the instance talks to nothing, and Systems Manager's stop reaches it through EC2's own API.
resource "aws_security_group" "rehearsal" {
  count       = local.rehearsal ? 1 : 0
  name        = "h4-rehearsal"
  description = "h4-rehearsal-instance: no rule in or out"
  vpc_id      = aws_vpc.rehearsal[0].id

  tags = {
    component = "rehearsal"
  }
}

resource "aws_instance" "rehearsal" {
  count                       = local.rehearsal ? 1 : 0
  ami                         = data.aws_ami.rehearsal[0].id
  instance_type               = "t4g.nano"
  subnet_id                   = aws_subnet.rehearsal[0].id
  vpc_security_group_ids      = [aws_security_group.rehearsal[0].id]
  associate_public_ip_address = false

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
  }

  tags = {
    Name      = "h4-rehearsal-instance"
    component = "rehearsal"
  }
}
