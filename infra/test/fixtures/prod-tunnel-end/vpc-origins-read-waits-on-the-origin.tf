# The VPC origins' group's read waiting on the VPC origin, as impl-f1 wrote it (fix F1's rework, R-1): then the origin
# targeted the tunnel end, whose primary interface held the private group, whose 8080 names this read, a cycle
# Terraform refuses. From spec 032 the origin targets the tunnel end read by its tag, so the wait alone is the defect;
# the cycle's own fixture is read-waits-on-the-templates.tf.
# expect: groups: the read of CloudFront-VPCOrigins-Service-SG waits on [aws_cloudfront_vpc_origin.relay], so it isn't made at plan time
data "aws_security_group" "cloudfront_vpc_origins" {
  name   = "CloudFront-VPCOrigins-Service-SG"
  vpc_id = aws_vpc.prod.id

  depends_on = [aws_cloudfront_vpc_origin.relay]
}
