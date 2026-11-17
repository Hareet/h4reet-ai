# Prod reading a security group by name other than CloudFront's VPC origins' (fix F1): a group another root, or a hand,
# may make, which prod must name as its own resource instead.
# expect: reads: aws_security_group.ec2_by_name reads a security group other than CloudFront's VPC origins'
data "aws_security_group" "ec2_by_name" {
  name   = "h4-ec2"
  vpc_id = aws_vpc.prod.id
}
