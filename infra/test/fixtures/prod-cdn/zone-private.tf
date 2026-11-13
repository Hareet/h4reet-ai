# A private zone: no resolver outside the VPC would find the site.
# expect: zone: the zone isn't public
resource "aws_route53_zone" "site" {
  name    = "hareet.ai"
  comment = "hareet.ai, the site and its API at the edge (spec 001 contracts/edge.md)"

  vpc {
    vpc_id = aws_vpc.prod.id
  }

  tags = {
    component = "edge"
  }
}
