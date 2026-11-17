# The private group as the W2 deploy applied it (fix F1): 8080 from CloudFront's origin-facing prefix list alone. The
# VPC origin connects from its own group, CloudFront-VPCOrigins-Service-SG, so /api/* never reaches the relay, and the
# next apply removes the rule the Author added by hand.
# expect: groups: the private interface doesn't admit exactly 8080 from CloudFront's origin-facing list and from its VPC origins' group
resource "aws_security_group" "tunnel_end_private" {
  name        = "h4-tunnel-end-private"
  description = "The tunnel end private interface: 8080 from the CloudFront origin-facing addresses, 5432 and 2301 from EC2"
  vpc_id      = aws_vpc.prod.id

  ingress {
    description     = "The relay edge listener, for the CloudFront VPC origin"
    protocol        = "tcp"
    from_port       = 8080
    to_port         = 8080
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  ingress {
    description     = "The shared state, for the EC2 gateway"
    protocol        = "tcp"
    from_port       = 5432
    to_port         = 5432
    security_groups = [aws_security_group.ec2.id]
  }

  ingress {
    description     = "The public view sink, for the EC2 publisher"
    protocol        = "tcp"
    from_port       = 2301
    to_port         = 2301
    security_groups = [aws_security_group.ec2.id]
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
