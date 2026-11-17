# The private group's description brought up to date with its rules (fix F1): a changed description forces a new
# group, so the plan replaces the group the private interface holds, where the fix wanted one rule in place.
# expect: groups: the private group's name, description, or VPC isn't the applied one, so the plan replaces it
resource "aws_security_group" "tunnel_end_private" {
  name        = "h4-tunnel-end-private"
  description = "The tunnel end private interface: 8080 from the CloudFront VPC origins, 5432 and 2301 from EC2"
  vpc_id      = aws_vpc.prod.id

  ingress {
    description     = "The relay edge listener, for the CloudFront VPC origin"
    protocol        = "tcp"
    from_port       = 8080
    to_port         = 8080
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  ingress {
    description     = "The relay edge listener, from the CloudFront VPC origins group"
    protocol        = "tcp"
    from_port       = 8080
    to_port         = 8080
    security_groups = [data.aws_security_group.cloudfront_vpc_origins.id]
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
