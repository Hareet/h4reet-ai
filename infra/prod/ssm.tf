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
