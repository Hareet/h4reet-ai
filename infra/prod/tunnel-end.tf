# The tunnel end's network side and its host (spec 001 FR-051 to FR-055, FR-076; research.md R-04, R-10, R-11;
# contracts/tunnel.md §1 and §6; plan.md §4): its type, its image, its two interfaces and their groups, its Elastic IP,
# and the user data that makes its host. The instance itself, on spot, is the protected ec2-market.tf's; its role is
# iam.tf's.

locals {
  # The tunnel end's type, measured with its five services before W1's plan blocks (tasks.md T166) and priced by the
  # Author (T167). It is the only type the root names; ec2-market.tf's precondition still refuses the placeholder,
  # "measure-in-T166". T166's block, on his engine, 2026-11-13: "The type, the larger of the two (R-33's rule on the
  # peaks and on the limits): t4g.small." (research.md R-33).
  tunnel_end_type = "t4g.small"

  # The tunnel end's generation: a new one replaces it on the newest Amazon Linux 2023 image, which is how its OS is
  # updated (docs/runbooks/tunnel-end.md, "An OS update"), since nftables keeps dnf from the repository after the first
  # boot. terraform_data.tunnel_end_host holds it.
  tunnel_end_generation = 1

  # The host's files, from deploy/hosts/tunnel-end/ and deploy/scripts/, into cloud-init's user data at the first boot.
  # A later change to them reaches a running tunnel end only through a replace, which the plan shows: ec2-market.tf
  # ignores the user data's drift, and is replaced when terraform_data.tunnel_end_host, its SHA-256, changes (group 5's
  # review, I3; docs/runbooks/tunnel-end.md).
  host_files = {
    "/etc/h4reet/nftables.nft"                                       = { source = "deploy/hosts/tunnel-end/nftables.nft", mode = "0600" }
    "/etc/h4reet/egress-allowlist.txt"                               = { source = "deploy/hosts/tunnel-end/egress-allowlist.txt", mode = "0644" }
    "/etc/h4reet/tunnel-end.env.example"                             = { source = "deploy/hosts/tunnel-end/tunnel-end.env.example", mode = "0644" }
    "/etc/docker/daemon.json"                                        = { source = "deploy/hosts/tunnel-end/daemon.json", mode = "0644" }
    "/etc/systemd/system/h4-nftables.service"                        = { source = "deploy/hosts/tunnel-end/systemd/h4-nftables.service", mode = "0644" }
    "/etc/systemd/system/h4-egress-proxy.service"                    = { source = "deploy/hosts/tunnel-end/systemd/h4-egress-proxy.service", mode = "0644" }
    "/etc/systemd/system/h4-write-env.service"                       = { source = "deploy/hosts/tunnel-end/systemd/h4-write-env.service", mode = "0644" }
    "/etc/systemd/system/h4-stack.service"                           = { source = "deploy/hosts/tunnel-end/systemd/h4-stack.service", mode = "0644" }
    "/etc/systemd/system/h4-deployer.service"                        = { source = "deploy/hosts/tunnel-end/systemd/h4-deployer.service", mode = "0644" }
    "/etc/systemd/system/h4-deployer.timer"                          = { source = "deploy/hosts/tunnel-end/systemd/h4-deployer.timer", mode = "0644" }
    "/etc/systemd/system/h4-tunnel-restart.service"                  = { source = "deploy/hosts/tunnel-end/systemd/h4-tunnel-restart.service", mode = "0644" }
    "/etc/systemd/system/amazon-ssm-agent.service.d/h4-proxy.conf"   = { source = "deploy/hosts/tunnel-end/systemd/amazon-ssm-agent-proxy.conf", mode = "0644" }
    "/etc/systemd/network/70-ens6.network.d/zz-h4-public-first.conf" = { source = "deploy/hosts/tunnel-end/networkd/zz-h4-public-first.conf", mode = "0644" }
    "/etc/systemd/network/70-ens5.network.d/zz-h4-ec2-route.conf"    = { source = "deploy/hosts/tunnel-end/networkd/zz-h4-ec2-route.conf", mode = "0644" }
    "/opt/h4reet/deploy/scripts/write_env.py"                        = { source = "deploy/scripts/write_env.py", mode = "0755" }
    "/opt/h4reet/deploy/scripts/egress_proxy.py"                     = { source = "deploy/scripts/egress_proxy.py", mode = "0755" }
    "/opt/h4reet/deploy/scripts/deploy_first_step.py"                = { source = "deploy/scripts/deploy_first_step.py", mode = "0755" }
  }
  # The tunnel end's first boot, deploy/hosts/tunnel-end/cloud-init.yaml.tftpl (spec 001 FR-051, FR-076;
  # contracts/tunnel.md §1 and §6; research.md R-10): a template this local fills with templatefile(), and the
  # instance takes gzipped as its user data. `files` is the host's files, by their place on the host, each with its
  # mode and its text from deploy/hosts/tunnel-end/ and deploy/scripts/ at the plan's commit; nothing in it is secret,
  # and the secrets come from Parameter Store at each boot (h4-write-env.service). A later change to these files reaches
  # the tunnel end only through a reviewed replace, since the instance ignores its user data's drift
  # (docs/runbooks/tunnel-end.md).
  #
  # The packages come first, from Amazon Linux's own repository in the Region, before the packet filter is loaded: at
  # the first boot only, the security group's 443 lets dnf reach it directly (disclosure row C17). Then the filter, then
  # the egress proxy, and only then anything that sends. The way out is ens6, attached once the instance runs (B-6,
  # option C): runcmd waits for it and its default route, then installs and loads the filter in one chain that ends the
  # script on a failure. This comment was the template's; it lives here to keep the user data under its bound (the
  # review of 59dfdc4a, nit 3).
  tunnel_end_user_data = templatefile("${path.module}/../../deploy/hosts/tunnel-end/cloud-init.yaml.tftpl", {
    files = { for path, f in local.host_files : path => { mode = f.mode, content = file("${path.module}/../../${f.source}") } }
  })
}

# What the tunnel end's host is made of: its rendered user data's SHA-256 and its generation. A change to either is an
# update here, and the instance's replace_triggered_by makes that its replace (ec2-market.tf), so a changed host file or
# an OS update shows in the plan as the tunnel end replaced, never as drift it ignores (group 5's review, I3).
resource "terraform_data" "tunnel_end_host" {
  input = {
    user_data  = sha256(local.tunnel_end_user_data)
    generation = local.tunnel_end_generation
  }
}

# Amazon Linux 2023 for arm64, the standard image, which carries the AWS CLI and the Systems Manager agent. Its newest
# release at the tunnel end's creation; ec2-market.tf ignores a newer one, so a new image is a reviewed replace.
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-*-arm64"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

# Route 53's health checkers, by AWS's published ranges (research.md R-29), the one source 8087 admits.
data "aws_ip_ranges" "route53_health_checks" {
  services = ["route53_healthchecks"]
}

# CloudFront's origin-facing addresses, which its VPC origin uses (group 8), the one source 8080 admits.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# The public interface: the tunnel's 2222 from anywhere, since the laptop's address changes, and the health port 8087
# from Route 53's checkers alone (contracts/tunnel.md §1). Out: 443, which nftables keeps to the egress proxy's user
# (deploy/hosts/tunnel-end/nftables.nft), and the VPC.
resource "aws_security_group" "tunnel_end_public" {
  name        = "h4-tunnel-end-public"
  description = "The tunnel end's public interface: 2222 from anywhere, 8087 from Route 53's checkers"
  vpc_id      = aws_vpc.prod.id

  ingress {
    description = "The tunnel"
    protocol    = "tcp"
    from_port   = 2222
    to_port     = 2222
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "The laptop's health block, for Route 53's checkers"
    protocol    = "tcp"
    from_port   = 8087
    to_port     = 8087
    cidr_blocks = data.aws_ip_ranges.route53_health_checks.cidr_blocks
  }

  egress {
    description = "HTTPS, through the egress proxy alone"
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Inside the VPC"
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = [aws_vpc.prod.cidr_block]
  }

  tags = {
    component = "tunnel-end"
  }
}

# The private interface: the relay's edge listener, 8080, from CloudFront's VPC origin alone (group 8 makes the origin);
# and, from group 6, the shared state's 5432, and from group 10 the public view's sink's 2301, each from EC2's group
# alone (contracts/shared-state.md §1; contracts/public-view.md §1). Nothing is applied yet, so the description's
# change replaces nothing.
resource "aws_security_group" "tunnel_end_private" {
  name        = "h4-tunnel-end-private"
  description = "The tunnel end's private interface: 8080 from CloudFront's origin-facing addresses, 5432 and 2301 from EC2"
  vpc_id      = aws_vpc.prod.id

  ingress {
    description     = "The relay's edge listener, for CloudFront's VPC origin"
    protocol        = "tcp"
    from_port       = 8080
    to_port         = 8080
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  ingress {
    description     = "The shared state, for EC2's gateway"
    protocol        = "tcp"
    from_port       = 5432
    to_port         = 5432
    security_groups = [aws_security_group.ec2.id]
  }

  ingress {
    description     = "The public view's sink, for EC2's publisher"
    protocol        = "tcp"
    from_port       = 2301
    to_port         = 2301
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    description = "Inside the VPC"
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = [aws_vpc.prod.cidr_block]
  }

  tags = {
    component = "tunnel-end"
  }
}

# The two fixed addresses the compose file's tunnel-end class publishes on (contracts/tunnel.md §1), as literals in both
# places, so no env file can move them; on any other host they don't exist, and Docker refuses to start the service.
# Docker binds each port to its address, so which interface is the primary changes no port.
resource "aws_network_interface" "tunnel_end_public" {
  subnet_id         = aws_subnet.public.id
  private_ips       = ["10.42.0.10"]
  security_groups   = [aws_security_group.tunnel_end_public.id]
  source_dest_check = true

  tags = {
    Name      = "h4-tunnel-end-public"
    component = "tunnel-end"
  }
}

resource "aws_network_interface" "tunnel_end_private" {
  subnet_id         = aws_subnet.private.id
  private_ips       = ["10.42.1.10"]
  security_groups   = [aws_security_group.tunnel_end_private.id]
  source_dest_check = true

  tags = {
    Name      = "h4-tunnel-end-private"
    component = "tunnel-end"
  }
}

# The second interface, device 1: the public one. B-6, option C (the Author's answer: "We aren't building option A, we
# went with Option C"): the private one is the instance's primary, device 0 (ec2-market.tf), so the instance sits in the
# private subnet and CloudFront's VPC origin reaches 10.42.1.10, where the relay listens. The host's way out is this
# interface's default route, which the user data's networkd drop-in puts first (zz-h4-public-first.conf). Both stay
# through a spot stop, and the Elastic IP with the public one, on a second interface as on a first (contracts/tunnel.md
# §1, to confirm at T058). Attached once the instance runs, so its first boot waits for it (cloud-init.yaml.tftpl).
resource "aws_network_interface_attachment" "tunnel_end_public" {
  instance_id          = aws_instance.tunnel_end.id
  network_interface_id = aws_network_interface.tunnel_end_public.id
  device_index         = 1
}

# The tunnel's address, which the laptop dials and Route 53's check targets (contracts/handover.md §1).
resource "aws_eip" "tunnel_end" {
  domain                    = "vpc"
  network_interface         = aws_network_interface.tunnel_end_public.id
  associate_with_private_ip = "10.42.0.10"

  tags = {
    Name      = "h4-tunnel-end"
    component = "tunnel-end"
  }

  depends_on = [aws_internet_gateway.prod]
}
