# The VPC origins' group's read waiting on the tunnel end's templates (spec 032): the templates take the private
# interface, which holds the private group, whose 8080 names this read, so Terraform refuses the root ("Error: Cycle").
# expect: groups: the read of CloudFront-VPCOrigins-Service-SG waits on [aws_launch_template.tunnel_end], so it isn't made at plan time
# expect: cycles: aws_security_group.tunnel_end_private leads back to itself
data "aws_security_group" "cloudfront_vpc_origins" {
  name   = "CloudFront-VPCOrigins-Service-SG"
  vpc_id = aws_vpc.prod.id

  depends_on = [aws_launch_template.tunnel_end]
}
