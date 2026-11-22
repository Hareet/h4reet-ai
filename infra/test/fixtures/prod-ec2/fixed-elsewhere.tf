# EC2 at another address: the compose file's ec2 class publishes on 10.42.0.20 alone, so nothing would start.
# expect: ec2: its one interface isn't 10.42.0.20
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
    private_ip_address          = "10.42.0.21"
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
