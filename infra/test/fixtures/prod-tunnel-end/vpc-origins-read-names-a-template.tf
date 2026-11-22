# The same cycle by a reference rather than a depends_on (fix F1's rework, R-1): the read filters on a tag that names
# a tunnel end template, so it still comes after the template, which takes the private interface, and the private
# group's 8080 still names the read. Only the walk of the root's references sees it. (Spec 032: the VPC origin itself
# targets the tunnel end read by its tag, so naming the origin no longer closes the cycle.)
# expect: cycles: aws_security_group.tunnel_end_private leads back to itself
data "aws_security_group" "cloudfront_vpc_origins" {
  name   = "CloudFront-VPCOrigins-Service-SG"
  vpc_id = aws_vpc.prod.id

  tags = {
    origin = aws_launch_template.tunnel_end["t4g.small"].id
  }
}
