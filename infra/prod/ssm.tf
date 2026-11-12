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
