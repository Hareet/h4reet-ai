# The type written into the protected file, where only a patch could change what T166 measures.
# expect: type: the tunnel end doesn't read local.tunnel_end_type
resource "aws_instance" "tunnel_end" {
  ami                  = data.aws_ami.al2023.id
  instance_type        = "t4g.small"
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
    network_interface_id = aws_network_interface.tunnel_end_public.id
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
