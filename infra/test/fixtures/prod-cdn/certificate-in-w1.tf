# The certificate asked for in W1, before the registrar points at the zone: ACM would never validate it.
# expect: certificate: not hareet.ai and www.hareet.ai, validated by DNS, in edge.tf, behind the switch
resource "aws_acm_certificate" "site" {
  domain_name               = "hareet.ai"
  subject_alternative_names = ["www.hareet.ai"]
  validation_method         = "DNS"

  tags = {
    component = "edge"
  }

  lifecycle {
    create_before_destroy = true
  }
}
