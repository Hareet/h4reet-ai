# The VPC origins' group's read waiting on the VPC origin, as impl-f1 wrote it (fix F1's rework, R-1): the origin
# targets the tunnel end, whose primary interface holds the private group, whose 8080 names this read, so Terraform
# refuses the root ("Error: Cycle") at validate and at plan.
# expect: groups: the read of CloudFront-VPCOrigins-Service-SG waits on [aws_cloudfront_vpc_origin.relay], so it isn't made at plan time
# expect: cycles: aws_security_group.tunnel_end_private leads back to itself: aws_security_group.tunnel_end_private -> data.aws_security_group.cloudfront_vpc_origins -> aws_cloudfront_vpc_origin.relay -> aws_instance.tunnel_end -> aws_network_interface.tunnel_end_private -> aws_security_group.tunnel_end_private
data "aws_security_group" "cloudfront_vpc_origins" {
  name   = "CloudFront-VPCOrigins-Service-SG"
  vpc_id = aws_vpc.prod.id

  depends_on = [aws_cloudfront_vpc_origin.relay]
}
