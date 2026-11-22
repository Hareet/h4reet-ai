# The tunnel end and EC2 on spot (spec 001 FR-069, FR-076; research.md R-04, R-30; the Author's answers to the spec's
# question 15 and the plan's question 2; contracts/tunnel.md §1), from spec 032 as launch templates, one for each type
# on each host's list (spec 032 FR-003, FR-004; ADR 0057): each a persistent spot request that stops on interruption,
# so the instance, its volumes, and its interfaces stay, and AWS starts it again when capacity for its type returns.
# When a type has no capacity, h4-ec2-start launches the host from the next template on its list
# (infra/lambdas/ec2_start/start.py). Terraform no longer holds the instances: it forgets them without destroying them
# (the removed blocks below), and reads each host's current one by its Name tag (ec2.tf, tunnel-end.tf).
# Protected (FR-012; rule T5: what holds instance_market_options lives only in ec2-market*): it changes only by the
# Author's patch. Group 5 wrote the tunnel end; group 7 added EC2 (P-I4); spec 032 the templates (P-032-prod).

removed {
  from = aws_instance.tunnel_end

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_instance.ec2

  lifecycle {
    destroy = false
  }
}

# The tunnel end's templates, one for each type on local.tunnel_end_types (tunnel-end.tf), each with its type's price
# ceiling. Its two interfaces by ID, the private one as device 0 (B-6, option C) and the public one, with the Elastic
# IP, as device 1, so a new instance takes both at launch, and the Elastic IP and the addresses never move.
resource "aws_launch_template" "tunnel_end" {
  for_each = local.tunnel_end_templates

  name                   = "h4-prod-tunnel-end-${each.key}"
  description            = "The tunnel end as ${each.key} (spec 032)"
  image_id               = data.aws_ami.al2023.id
  instance_type          = each.key
  update_default_version = true
  user_data              = base64gzip(local.tunnel_end_user_data)

  iam_instance_profile {
    name = aws_iam_instance_profile.tunnel_end.name
  }

  instance_market_options {
    market_type = "spot"

    spot_options {
      spot_instance_type             = "persistent"
      instance_interruption_behavior = "stop"
      max_price                      = each.value.max_price
    }
  }

  # IMDSv2 alone, one hop, so no container reaches the instance's credentials (rule T13; research.md R-15).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  # A busy burstable instance slows down rather than billing past its baseline (research.md R-04); a fixed-performance
  # type takes no credit setting.
  dynamic "credit_specification" {
    for_each = startswith(each.key, "t") ? ["standard"] : []

    content {
      cpu_credits = credit_specification.value
    }
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_type           = "gp3"
      volume_size           = 8
      encrypted             = true
      delete_on_termination = true
    }
  }

  network_interfaces {
    device_index         = 0
    network_interface_id = aws_network_interface.tunnel_end_private.id
  }

  network_interfaces {
    device_index         = 1
    network_interface_id = aws_network_interface.tunnel_end_public.id
  }

  # The provider's default tags don't reach what a template launches: the server budget filters on project (T154).
  # The interfaces are Terraform's own, tagged in tunnel-end.tf.
  dynamic "tag_specifications" {
    for_each = ["instance", "volume", "spot-instances-request"]

    content {
      resource_type = tag_specifications.value
      tags = {
        Name        = "h4-prod-tunnel-end"
        project     = "h4reet-ai"
        environment = "prod"
        component   = "tunnel-end"
      }
    }
  }

  tags = {
    component = "tunnel-end"
  }

  lifecycle {
    # A newer image or a changed host file reaches the tunnel end only through a reviewed change: the templates ignore
    # the image's and the user data's drift, and a new terraform_data.tunnel_end_host (tunnel-end.tf) replaces them;
    # the running tunnel end moves onto them by the Author's hand replace (docs/runbooks/tunnel-end.md).
    ignore_changes       = [image_id, user_data]
    replace_triggered_by = [terraform_data.tunnel_end_host]
  }
}

# EC2's templates, one for each type on local.ec2_types (ec2.tf), each with its type's price ceiling (spec 001
# FR-043, FR-044, FR-050, FR-069; research.md R-04, R-28, R-30; plan.md §5.1; spec 032): the whole stack but the
# model server, from its release. One interface, made at each launch in the public subnet at the fixed private address,
# a literal the compose file's ec2 class publishes on, with an address AWS assigns at each start, used only for egress
# through its proxy (R-10): no Elastic IP, and nothing reaches it from outside but the tunnel end (network.tf's group).
# Its data volume is ec2.tf's, attached by h4-ec2-start after each launch.
resource "aws_launch_template" "ec2" {
  for_each = local.ec2_templates

  name                   = "h4-prod-ec2-${each.key}"
  description            = "EC2 as ${each.key} (spec 032)"
  image_id               = data.aws_ami.al2023.id
  instance_type          = each.key
  update_default_version = true
  user_data              = base64gzip(local.ec2_user_data)

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2.name
  }

  instance_market_options {
    market_type = "spot"

    spot_options {
      spot_instance_type             = "persistent"
      instance_interruption_behavior = "stop"
      max_price                      = each.value.max_price
    }
  }

  # IMDSv2 alone, one hop, so no container reaches the instance's credentials (rule T13; research.md R-15). Its tags are
  # in its metadata: write_env.py and preflight confirm the Name tag, h4-prod-ec2, before the stack starts (R-28).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  # A busy burstable instance slows down rather than billing past its baseline (research.md R-04); a fixed-performance
  # type takes no credit setting.
  dynamic "credit_specification" {
    for_each = startswith(each.key, "t") ? ["standard"] : []

    content {
      cpu_credits = credit_specification.value
    }
  }

  # The images and the OS; the stack's stores are on the data volume (ec2.tf).
  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_type           = "gp3"
      volume_size           = 20
      encrypted             = true
      delete_on_termination = true
    }
  }

  network_interfaces {
    device_index                = 0
    subnet_id                   = aws_subnet.public.id
    private_ip_address          = "10.42.0.20"
    associate_public_ip_address = true
    security_groups             = [aws_security_group.ec2.id]
    delete_on_termination       = true
  }

  # The provider's default tags don't reach what a template launches: the server budget filters on project (T154).
  dynamic "tag_specifications" {
    for_each = ["instance", "volume", "network-interface", "spot-instances-request"]

    content {
      resource_type = tag_specifications.value
      tags = {
        Name        = "h4-prod-ec2"
        project     = "h4reet-ai"
        environment = "prod"
        component   = "ec2"
      }
    }
  }

  tags = {
    component = "ec2"
  }

  lifecycle {
    # A newer image or a changed host file reaches EC2 only through a reviewed change: the templates ignore the image's
    # and the user data's drift, and a new terraform_data.ec2_generation (ec2.tf) replaces them; h4-ec2-start then
    # replaces EC2 at its next start, since it was launched from a template no longer listed (spec 032 FR-010).
    ignore_changes       = [image_id, user_data]
    replace_triggered_by = [terraform_data.ec2_generation]
  }
}
