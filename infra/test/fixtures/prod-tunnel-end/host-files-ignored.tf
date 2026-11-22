# The templates ignoring their user data's drift with nothing to replace them: a changed host file plans as no
# change (group 5's review, I3; spec 032 FR-010).
# expect: host: a changed host file or a new generation doesn't replace the tunnel end
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
    ignore_changes = [image_id, user_data]
  }
}
