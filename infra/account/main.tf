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
  rehearsal = true

  # The one inference profile config/routing.yaml's bedrock adapter names, and the models it routes to (spec 000
  # T105; research.md R-15). infra/test/test_account.py holds the first to routing.yaml's.
  inference_profile = "us.anthropic.claude-haiku-5-5"
  foundation_model  = "anthropic.claude-haiku-5-5"

  # Each function's image in ECR, by digest, once the Author has built and pushed it (tasks.md T040): a function is
  # made only once its digest is set, so the first apply makes the registry the images go to.
  lambda_images = {
    alert_bridge     = "sha256:d245392171b5432b2f159f202e2ed753b793c120388802d1bb2a79dc146ad1b2"
    probe            = "sha256:85e0a4e0a428482e9f10829f8fde23313762cce3fc06410b3fd87ca460e7f205"
    credential_audit = "sha256:9a660808453e99673c769f4fb9e51ffd2b1396bfa15fd7707a3db6881be8793d"
    # Group 9's (tasks.md T122). PLACEHOLDER until T174: "" is the one form handover.tf's preconditions refuse, so
    # with P-W2's switch on no plan runs until the Author pushes each image to the repository W1's apply made, reports
    # its digest, and the session writes it here (T175). A named placeholder string would pass `!= ""` and reach the
    # plan as an image URI, so the slot stays empty, and this comment names it.
    ec2_start = "" # PLACEHOLDER: h4-ec2-start's digest, from the Author's T174 report
    ec2_guard = "" # PLACEHOLDER: h4-ec2-guard's digest, from the Author's T174 report
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
