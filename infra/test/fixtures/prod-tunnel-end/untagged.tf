# The VPC with no component tag (rule T2).
# expect: tags: aws_vpc.prod sets no component
resource "aws_vpc" "prod" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "h4-prod"
  }
}
