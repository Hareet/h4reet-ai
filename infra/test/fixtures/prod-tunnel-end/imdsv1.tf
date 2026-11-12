# The tunnel end answering IMDSv1: a container's request could reach its role's credentials (rule T13).
# expect: metadata_options.http_tokens must be "required"
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
    http_tokens                 = "optional"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
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
    # a later plan (docs/runbooks/tunnel-end.md).
    ignore_changes = [ami, user_data_base64]

    # T166 measures the type with the tunnel end's five services; until then prod's plan stops here.
    precondition {
      condition     = local.tunnel_end_type != "measure-in-T166"
      error_message = "The tunnel end's type isn't measured yet: tasks.md T166 sets local.tunnel_end_type in infra/prod/tunnel-end.tf."
    }
  }
}
