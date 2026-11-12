# EC2, prod's default host (spec 001 FR-043, FR-044, FR-046, FR-069; research.md R-04, R-30; plan.md §5.1 and §16,
# "Group 7, as built"): what Terraform makes for it beside the instance itself, which is the protected ec2-market.tf's,
# and its two roles, iam.tf's. Its type, its generation, its host files, its data volume, and W1's stop. The server
# action and its model action, which name it from this root, are killswitch.tf's; its ID's parameter is handover.tf's.

locals {
  # R-04's choice of 2026-11-11, from group 2's measurement: 2 vCPU and 8 GiB, Graviton, burstable (standard credits).
  ec2_type = "t4g.large"

  # EC2's generation: W2 sets 2, so W2's prod block shows EC2 replaced, the server action and the ID's parameter
  # updated with it, and SC-005 is checked after W2's apply (tasks.md T097, T175). An OS update is a new one too.
  ec2_generation = 1

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
    files = { for path, f in local.ec2_host_files : path => { mode = f.mode, content = file("${path.module}/../../${f.source}") } }
  })
}

# What EC2's host is made of: its rendered user data's SHA-256 and its generation. A change to either is an update
# here, and the instance's replace_triggered_by makes that its replace (ec2-market.tf; tasks.md T097).
resource "terraform_data" "ec2_generation" {
  input = {
    user_data  = sha256(local.ec2_user_data)
    generation = local.ec2_generation
  }
}

# Docker's data root, a volume of its own in EC2's zone, so a replace keeps the stack's stores and its images. cloud-
# init's boot command formats it once, when it holds no filesystem, and mounts it at /srv/h4reet/data before Docker
# starts, which docker-data.conf requires (deploy/hosts/ec2/). EC2 stops before a detach.
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

resource "aws_volume_attachment" "ec2_data" {
  device_name                    = "/dev/sdf"
  volume_id                      = aws_ebs_volume.ec2_data.id
  instance_id                    = aws_instance.ec2.id
  stop_instance_before_detaching = true
}

# W1's apply makes EC2 stopped (spec.md Assumptions, "From W1 to W2"; plan.md §16, W1's departure 11): the start
# function, the guard, and the hours are W2's, so until then EC2 runs only by the Author's hand, inside the hours, for
# SC-017's and the red-team's runs. W2's switch drops this, and dropping it leaves the instance as it is (to confirm in
# W2's plan), so no plan after W2 holds a state that would fight the start function and the guard (FR-072).
resource "aws_ec2_instance_state" "ec2_w1" {
  count       = local.wired ? 0 : 1
  instance_id = aws_instance.ec2.id
  state       = "stopped"

  depends_on = [aws_volume_attachment.ec2_data]
}
