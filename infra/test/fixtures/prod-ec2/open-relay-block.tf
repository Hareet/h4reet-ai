# The relay block open to the internet, not to the tunnel end alone.
# expect: group: EC2 doesn't admit exactly 8085 and 4318
resource "aws_security_group" "ec2" {
  name        = "h4-ec2"
  description = "EC2's interface: 8085 and 4318 from the tunnel end alone"
  vpc_id      = aws_vpc.prod.id

  ingress {
    description = "The relay block, for the tunnel end's relay"
    protocol    = "tcp"
    from_port   = 8085
    to_port     = 8085
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "EC2's collector, for the tunnel end's collector"
    protocol    = "tcp"
    from_port   = 4318
    to_port     = 4318
    cidr_blocks = ["10.42.0.10/32", "10.42.1.10/32"]
  }

  egress {
    description = "HTTPS, through the egress proxies alone"
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "The alerts mailbox's SMTP, implicit TLS, through the gateway's proxy alone"
    protocol    = "tcp"
    from_port   = 465
    to_port     = 465
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
    component = "ec2"
  }
}
