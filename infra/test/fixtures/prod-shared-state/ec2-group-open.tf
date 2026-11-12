# EC2's group admitting 5432 from anywhere before group 7 says what it admits.
# expect: groups: EC2's group admits something
resource "aws_security_group" "ec2" {
  name        = "h4-ec2"
  description = "EC2's interface: group 7 gives it its rules"
  vpc_id      = aws_vpc.prod.id

  ingress {
    description = "Anything"
    protocol    = "tcp"
    from_port   = 5432
    to_port     = 5432
    cidr_blocks = ["10.42.0.0/16"]
  }

  tags = {
    component = "ec2"
  }
}
