# Port 22 open on the public interface: the instance takes no SSH but the tunnel's own, on 2222 (FR-050).
# expect: groups: the public interface doesn't admit exactly 2222 from anywhere and 8087 from Route 53's checkers
resource "aws_security_group" "tunnel_end_public" {
  name        = "h4-tunnel-end-public"
  description = "The tunnel end's public interface: 2222 from anywhere, 8087 from Route 53's checkers"
  vpc_id      = aws_vpc.prod.id

  ingress {
    description = "The tunnel"
    protocol    = "tcp"
    from_port   = 2222
    to_port     = 2222
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "The laptop's health block, for Route 53's checkers"
    protocol    = "tcp"
    from_port   = 8087
    to_port     = 8087
    cidr_blocks = data.aws_ip_ranges.route53_health_checks.cidr_blocks
  }

  ingress {
    description = "SSH"
    protocol    = "tcp"
    from_port   = 22
    to_port     = 22
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "HTTPS, through the egress proxy alone"
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
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
