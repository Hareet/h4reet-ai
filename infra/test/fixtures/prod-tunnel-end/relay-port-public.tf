# The relay's 8080 from anywhere: only CloudFront's VPC origin may reach it.
# expect: groups: the private interface doesn't admit exactly 8080 from CloudFront's origin-facing list and 5432
resource "aws_security_group" "tunnel_end_private" {
  name        = "h4-tunnel-end-private"
  description = "The tunnel end's private interface: 8080 from CloudFront's origin-facing addresses"
  vpc_id      = aws_vpc.prod.id

  ingress {
    description = "The relay's edge listener, for CloudFront's VPC origin"
    protocol    = "tcp"
    from_port   = 8080
    to_port     = 8080
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Inside the VPC"
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = [aws_vpc.prod.cidr_block]
  }

  tags = {
    component = "tunnel-end"
  }
}
