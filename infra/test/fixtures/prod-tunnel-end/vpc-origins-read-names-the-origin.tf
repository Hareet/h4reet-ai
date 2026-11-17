# The same cycle by a reference rather than a depends_on (fix F1's rework, R-1): the read filters on a tag that names
# the VPC origin, so it still comes after the origin, and the private group's 8080 still names the read. Only the walk
# of the root's references sees it.
# expect: cycles: aws_security_group.tunnel_end_private leads back to itself
data "aws_security_group" "cloudfront_vpc_origins" {
  name   = "CloudFront-VPCOrigins-Service-SG"
  vpc_id = aws_vpc.prod.id

  tags = {
    origin = aws_cloudfront_vpc_origin.relay.id
  }
}
