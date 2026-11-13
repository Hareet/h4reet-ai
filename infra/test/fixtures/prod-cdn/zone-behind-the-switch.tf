# The zone made in W2 alone: the Author couldn't delegate to it before the certificate needs it (T115).
# expect: zone: the zone waits behind a switch
resource "aws_route53_zone" "site" {
  count   = local.wired ? 1 : 0
  name    = "hareet.ai"
  comment = "hareet.ai, the site and its API at the edge (spec 001 contracts/edge.md)"

  tags = {
    component = "edge"
  }
}
