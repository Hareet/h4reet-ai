# EC2, prod's default host (spec 001 FR-043, FR-044, FR-046, FR-069; research.md R-04, R-30; plan.md §5.1 and §16,
# "Group 7, as built"): what Terraform makes for it beside its launch templates, which are the protected ec2-market.tf's,
# and its two roles, iam.tf's. Its types, its generation, its host files, its data volume, and, from spec 032, the
# instance h4-ec2-start launched, read by its tag. The server action and its model action, which name it from this root,
# are killswitch.tf's; its ID's parameter is handover.tf's.

# Spec 032 (FR-015): Terraform no longer holds the instance or its volume's attachment; h4-ec2-start attaches the volume
# to each instance it launches. The attachment is forgotten, never destroyed, so the running instance keeps its volume.
removed {
  from = aws_volume_attachment.ec2_data

  lifecycle {
    destroy = false
  }
}

locals {
  # R-04's choice of 2026-11-11, from group 2's measurement: 2 vCPU and 8 GiB, Graviton, burstable (standard credits).
  # From spec 032 the first of EC2's list.
  ec2_type = local.ec2_types[0].type

  # EC2's interchangeable types, in the order h4-ec2-start tries them when a type has no spot capacity (spec 032 FR-001,
  # FR-002; ADR 0057): Graviton alone, each with the first type's memory or more, in local.zone. Each one's price
  # ceiling, in US dollars an hour, is the first type's on-demand price, so no fallback costs more an hour than
  # t4g.large would on demand (the Author confirms the list prices before his apply; spec 032 SC-006).
  ec2_types = [
    { type = "t4g.large", max_price = "0.0672" },
    { type = "m7g.large", max_price = "0.0672" },
    { type = "m6g.large", max_price = "0.0672" },
    { type = "t4g.xlarge", max_price = "0.0672" },
  ]
  # The protected ec2-market.tf's launch templates, one for each type, with its place on the list.
  ec2_templates = { for i, t in local.ec2_types : t.type => merge(t, { order = i }) }

  # EC2's generation: 1 in W1; W2 sets 2, so W2's prod block shows EC2 replaced, the server action and the ID's
  # parameter updated with it, and SC-005 is checked after W2's apply (tasks.md T097, T175). An OS update is a new one
  # too.
  ec2_generation = 2

  # The data volume: Docker's data root, so the images and the stack's named volumes (Langfuse's four stores, Prometheus,
  # Loki, Grafana) outlive a replace of the instance. 20 GiB, R-05's size from R-33's measurement.
  ec2_data_volume_gib = 20

  # The host's files, from deploy/hosts/ec2/ and deploy/scripts/, into cloud-init's user data at the first boot, as the
  # tunnel end's: a change to them reaches a running EC2 only through a replace, which terraform_data.ec2_generation
  # shows in the plan. The deployer itself comes from the release's tree (deploy_first_step.py; plan.md §16, "From the
  # release"), and so do the host's later parts: the gateway's proxy and its allowlist, and the gateway's credential
  # timer (deploy/hosts/ec2/ec2_host.py, from deploy/hosts/ec2/release/).
  ec2_host_files = {
    "/etc/h4reet/nftables.nft"                                     = { source = "deploy/hosts/ec2/nftables.nft", mode = "0600" }
    "/etc/h4reet/egress-allowlist.txt"                             = { source = "deploy/hosts/ec2/egress-allowlist.txt", mode = "0644" }
    "/etc/h4reet/ec2.env.example"                                  = { source = "deploy/hosts/ec2/ec2.env.example", mode = "0644" }
    "/etc/docker/daemon.json"                                      = { source = "deploy/hosts/ec2/daemon.json", mode = "0644" }
    "/etc/systemd/system/h4-nftables.service"                      = { source = "deploy/hosts/ec2/systemd/h4-nftables.service", mode = "0644" }
    "/etc/systemd/system/h4-egress-proxy.service"                  = { source = "deploy/hosts/ec2/systemd/h4-egress-proxy.service", mode = "0644" }
    "/etc/systemd/system/h4-write-env.service"                     = { source = "deploy/hosts/ec2/systemd/h4-write-env.service", mode = "0644" }
    "/etc/systemd/system/h4-stack.service"                         = { source = "deploy/hosts/ec2/systemd/h4-stack.service", mode = "0644" }
    "/etc/systemd/system/h4-deployer.service"                      = { source = "deploy/hosts/ec2/systemd/h4-deployer.service", mode = "0644" }
    "/etc/systemd/system/h4-deployer.timer"                        = { source = "deploy/hosts/ec2/systemd/h4-deployer.timer", mode = "0644" }
    "/etc/systemd/system/docker.service.d/h4-data.conf"            = { source = "deploy/hosts/ec2/systemd/docker-data.conf", mode = "0644" }
    "/etc/systemd/system/amazon-ssm-agent.service.d/h4-proxy.conf" = { source = "deploy/hosts/ec2/systemd/amazon-ssm-agent-proxy.conf", mode = "0644" }
    "/opt/h4reet/deploy/scripts/write_env.py"                      = { source = "deploy/scripts/write_env.py", mode = "0755" }
    "/opt/h4reet/deploy/scripts/egress_proxy.py"                   = { source = "deploy/scripts/egress_proxy.py", mode = "0755" }
    "/opt/h4reet/deploy/scripts/deploy_first_step.py"              = { source = "deploy/scripts/deploy_first_step.py", mode = "0755" }
  }
  ec2_user_data = templatefile("${path.module}/../../deploy/hosts/ec2/cloud-init.yaml.tftpl", {
    files = { for p, f in local.ec2_host_files : p => { mode = f.mode, content = file("${path.module}/../../${f.source}") } }
  })
}

# What EC2's host is made of: its rendered user data's SHA-256 and its generation. A change to either is an update
# here, and the launch templates' replace_triggered_by makes that their replace (ec2-market.tf; tasks.md T097); from
# spec 032, h4-ec2-start replaces EC2 onto them at its next start (FR-010).
resource "terraform_data" "ec2_generation" {
  input = {
    user_data  = sha256(local.ec2_user_data)
    generation = local.ec2_generation
  }
}

# Docker's data root, a volume of its own in EC2's zone, so a replace keeps the stack's stores and its images. cloud-
# init's boot command formats it once, when it holds no filesystem, and mounts it at /srv/h4reet/data before Docker
# starts, which docker-data.conf requires (deploy/hosts/ec2/). From spec 032, h4-ec2-start attaches it at /dev/sdf to
# each instance it launches, finding it by its Name tag, once the instance before has let it go.
resource "aws_ebs_volume" "ec2_data" {
  availability_zone = local.zone
  size              = local.ec2_data_volume_gib
  type              = "gp3"
  encrypted         = true

  tags = {
    Name      = "h4-ec2-data"
    component = "ec2"
  }
}

# The EC2 instance h4-ec2-start launched, by its Name tag, in any state but gone (spec 032 FR-015): what the instance
# rules, the server action, and the ID's parameter name. A plan while EC2 has no instance, or two, fails here with
# AWS's message: plan once it has one again (docs/runbooks/ec2.md).
data "aws_instance" "ec2" {
  filter {
    name   = "tag:Name"
    values = ["h4-prod-ec2"]
  }

  filter {
    name   = "instance-state-name"
    values = ["pending", "running", "stopping", "stopped"]
  }
}
