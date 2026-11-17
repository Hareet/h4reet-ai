# The VPC origins' group read by its name alone (fix F1): CloudFront makes one in each VPC that has a VPC origin, so
# the read isn't held to prod's.
# expect: groups: CloudFront-VPCOrigins-Service-SG isn't read by its name in prod's VPC, in tunnel-end.tf
data "aws_security_group" "cloudfront_vpc_origins" {
  name = "CloudFront-VPCOrigins-Service-SG"
}
