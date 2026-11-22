# The instance still Terraform's beside the templates: a plan after h4-ec2-start replaced it would make it again
# (spec 032 FR-015).
# into: ec2-market.tf
# drop: removed
# expect: tunnel end: prod holds an instance; h4-ec2-start launches the hosts (spec 032)
# expect: tunnel end: aws_instance.tunnel_end isn't forgotten by a removed block that keeps it
# expect: tunnel end: aws_network_interface_attachment.tunnel_end_public isn't forgotten by a removed block that keeps it
# expect: type: another resource sets an instance type
resource "aws_instance" "tunnel_end" {
  ami                  = data.aws_ami.al2023.id
  instance_type        = local.tunnel_end_type
  iam_instance_profile = aws_iam_instance_profile.tunnel_end.name

  instance_market_options {
    market_type = "spot"

    spot_options {
      spot_instance_type             = "persistent"
      instance_interruption_behavior = "stop"
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  primary_network_interface {
    network_interface_id = aws_network_interface.tunnel_end_private.id
  }

  tags = {
    Name      = "h4-prod-tunnel-end"
    component = "tunnel-end"
  }
}
