# The VPC origins' group read at plan time whatever the origin's state (fix F1): CloudFront makes the group only once
# an origin exists, so on a rebuild from nothing the plan fails on a read that finds no group.
# expect: groups: CloudFront-VPCOrigins-Service-SG isn't read by its name in prod's VPC, in tunnel-end.tf, once the VPC origin exists
data "aws_security_group" "cloudfront_vpc_origins" {
  name   = "CloudFront-VPCOrigins-Service-SG"
  vpc_id = aws_vpc.prod.id
}
