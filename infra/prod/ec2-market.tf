# The tunnel end and EC2 on spot (spec 001 FR-069, FR-076; research.md R-04, R-30; the Author's answers to the spec's
# question 15 and the plan's question 2; contracts/tunnel.md §1): each a persistent spot request that stops on
# interruption, so the instance, its volumes, and its interfaces stay, and AWS starts it again when capacity returns.
# Protected (FR-012; rule T5: what holds instance_market_options lives only in ec2-market*): it changes only by the
# Author's patch. Group 5 wrote the tunnel end; group 7 adds EC2 (P-I4).

resource "aws_instance" "tunnel_end" {
  ami                  = data.aws_ami.al2023.id
  instance_type        = local.tunnel_end_type
  iam_instance_profile = aws_iam_instance_profile.tunnel_end.name
  user_data_base64     = base64gzip(local.tunnel_end_user_data)

  instance_market_options {
    market_type = "spot"

    spot_options {
      spot_instance_type             = "persistent"
      instance_interruption_behavior = "stop"
    }
  }

  # IMDSv2 alone, one hop, so no container reaches the instance's credentials (rule T13; research.md R-15).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  # A busy burstable instance slows down rather than billing past its baseline (research.md R-04).
  credit_specification {
    cpu_credits = "standard"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 8
    encrypted             = true
    delete_on_termination = true

    tags = {
      component = "tunnel-end"
    }
  }

  primary_network_interface {
    network_interface_id = aws_network_interface.tunnel_end_private.id
  }

  tags = {
    Name      = "h4-prod-tunnel-end"
    component = "tunnel-end"
  }

  lifecycle {
    # A newer image or a changed host file reaches the tunnel end only through a reviewed replace, never as drift in
    # a later plan: terraform_data.tunnel_end_host holds the user data's SHA-256 and local.tunnel_end_generation
    # (tunnel-end.tf), so a changed host file or a new generation plans as the replace (group 5's review, I3;
    # docs/runbooks/tunnel-end.md).
    ignore_changes       = [ami, user_data_base64]
    replace_triggered_by = [terraform_data.tunnel_end_host]

    # T166 measures the type with the tunnel end's five services; until then prod's plan stops here.
    precondition {
      condition     = local.tunnel_end_type != "measure-in-T166"
      error_message = "The tunnel end's type isn't measured yet: tasks.md T166 sets local.tunnel_end_type in infra/prod/tunnel-end.tf."
    }
  }
}

# EC2, prod's default host (spec 001 FR-043, FR-044, FR-050, FR-069; research.md R-04, R-28, R-30; plan.md §5.1): the
# whole stack but the model server, from its release. Its type, its generation, its user data, its data volume, and
# W1's stop are the unprotected ec2.tf's. One interface, in the public subnet, at its fixed private address, a literal
# the compose file's ec2 class publishes on, with an address AWS assigns at each start, used only for egress through
# its proxy (R-10): no Elastic IP, and nothing reaches it from outside but the tunnel end (network.tf's group).
resource "aws_instance" "ec2" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = local.ec2_type
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  user_data_base64            = base64gzip(local.ec2_user_data)
  subnet_id                   = aws_subnet.public.id
  private_ip                  = "10.42.0.20"
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.ec2.id]

  instance_market_options {
    market_type = "spot"

    spot_options {
      spot_instance_type             = "persistent"
      instance_interruption_behavior = "stop"
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

  # A busy burstable instance slows down rather than billing past its baseline (research.md R-04).
  credit_specification {
    cpu_credits = "standard"
  }

  # The images and the OS; the stack's stores are on the data volume (ec2.tf). Tagged with project too, which the
  # server budget's filter reads and the provider's default tags may not reach on a root volume (T154).
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    encrypted             = true
    delete_on_termination = true

    tags = {
      project   = "h4reet-ai"
      component = "ec2"
    }
  }

  tags = {
    Name      = "h4-prod-ec2"
    component = "ec2"
  }

  lifecycle {
    # A newer image or a changed host file reaches EC2 only through a reviewed replace: terraform_data.ec2_generation
    # holds the user data's SHA-256 and local.ec2_generation (ec2.tf), and W2 sets the generation to 2 for SC-005
    # (tasks.md T097). The server action, EC2's model action's role, and /h4reet/prod/ec2-instance-id name this
    # instance from this root, so the same plan updates them.
    ignore_changes       = [ami, user_data_base64]
    replace_triggered_by = [terraform_data.ec2_generation]
  }
}
