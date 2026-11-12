# The certificate validated by email, which ACM would send to the domain's contacts.
# expect: certificate: not hareet.ai and www.hareet.ai, validated by DNS
resource "aws_acm_certificate" "site" {
  count                     = local.wired ? 1 : 0
  domain_name               = "hareet.ai"
  subject_alternative_names = ["www.hareet.ai"]
  validation_method         = "EMAIL"

  tags = {
    component = "edge"
  }

  lifecycle {
    create_before_destroy = true
  }
}
