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
    alert_bridge     = ""
    probe            = ""
    credential_audit = ""
  }

  # One repository per function, and one per service the cloud hosts run (contracts/env-cloud.md §3): EC2's whole
  # stack but the model server and the local store, and the tunnel end's collector. Groups 5 and 8 add the relay's,
  # the tunnel's, and the snapshot's.
  lambda_repositories = ["h4-alert-bridge", "h4-probe", "h4-credential-audit"]
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
