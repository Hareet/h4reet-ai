# The String parameters prod writes for its hosts and the Author's terminal (spec 001 research.md R-26; contracts/env-
# cloud.md §1). Never a secret (rule T9): the Author writes those by hand, outside Terraform.

# The tunnel end's public address, which the Author's tunnel-keys target writes into the laptop's prod env file as
# TUNNEL_END_ADDRESS (contracts/tunnel.md §5).
resource "aws_ssm_parameter" "tunnel_end_address" {
  name        = "/h4reet/prod/tunnel-end-address"
  description = "The tunnel end's Elastic IP, which the laptop's tunnel dials (spec 001 contracts/tunnel.md §3)"
  type        = "String"
  value       = aws_eip.tunnel_end.public_ip

  tags = {
    component = "tunnel-end"
  }
}

# The laptop's health check's ID, which the tunnel end's snapshot sink reads for the dashboard's health-check panel
# (group 9; contracts/handover.md §10; contracts/public-view.md §2): a String under the tunnel end's own path, which its
# role reads already, made from the check in this root (infra/prod/failover.tf), so a replace updates it.
resource "aws_ssm_parameter" "health_check_id" {
  name        = "/h4reet/tunnel-end/HEALTH_CHECK_ID"
  description = "The laptop's Route 53 health check, whose status the snapshot sink reads (spec 001 contracts/handover.md §10)"
  type        = "String"
  value       = aws_route53_health_check.laptop.id

  tags = {
    component = "handover"
  }
}

# Spec 032 (FR-007; plan.md §2): each host's launch templates, in its list's order, which h4-ec2-start reads by name to
# launch the host from the next type when one has no capacity. Each a JSON list of {"type", "template"}.
resource "aws_ssm_parameter" "ec2_launch_templates" {
  name        = "/h4reet/prod/ec2-launch-templates"
  description = "EC2's launch templates, in its types' order, which h4-ec2-start launches from (spec 032)"
  type        = "String"
  value = jsonencode([
    for t in local.ec2_types : { type = t.type, template = aws_launch_template.ec2[t.type].id }
  ])

  tags = {
    component = "ec2"
  }
}

resource "aws_ssm_parameter" "tunnel_end_launch_templates" {
  name        = "/h4reet/prod/tunnel-end-launch-templates"
  description = "The tunnel end's launch templates, in its types' order, which h4-ec2-start launches from (spec 032)"
  type        = "String"
  value = jsonencode([
    for t in local.tunnel_end_types : { type = t.type, template = aws_launch_template.tunnel_end[t.type].id }
  ])

  tags = {
    component = "tunnel-end"
  }
}

# The relay's VPC origin's ID (edge.tf), which h4-ec2-start points at a replaced tunnel end (spec 032 FR-014).
resource "aws_ssm_parameter" "relay_vpc_origin_id" {
  name        = "/h4reet/prod/relay-vpc-origin-id"
  description = "The relay's CloudFront VPC origin, which h4-ec2-start points at a replaced tunnel end (spec 032)"
  type        = "String"
  value       = aws_cloudfront_vpc_origin.relay.id

  tags = {
    component = "edge"
  }
}
