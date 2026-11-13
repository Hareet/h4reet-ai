# The zone and its records (spec 001 FR-027, FR-072; contracts/edge.md §1; contracts/infra-records.md §2; plan.md §8.1
# and §16, "Why a switch", W1's departure 5). The public zone hareet.ai is made in W1, without the switch, so the
# Author can point the registrar's name servers at it, from this root's output, before W2 (tasks.md T115). Until he
# does, and until W2's apply, the zone answers nothing anyone asks for. Behind prod's local.wired, W2's: the
# certificate's validation records, which resolve once the delegation does, and the aliases to the distribution.
# There is no record for a host: visitors reach the hosts only through the edge and the relay, and no DNS answer
# changes at run time (FR-072).

resource "aws_route53_zone" "site" {
  name    = "hareet.ai"
  comment = "hareet.ai, the site and its API at the edge (spec 001 contracts/edge.md)"

  tags = {
    component = "edge"
  }
}

# The four name servers the Author points the registrar at (contracts/infra-records.md §2), read from the root's output
# after W1's apply: `terraform output -json zone_name_servers` in his terminal.
output "zone_name_servers" {
  description = "hareet.ai's name servers, for the registrar (spec 001 tasks.md T115)"
  value       = aws_route53_zone.site.name_servers
}

# ACM's DNS validation, one record a name, which ACM renews by (contracts/edge.md §2).
resource "aws_route53_record" "site_validation" {
  for_each = local.wired ? {
    for option in aws_acm_certificate.site[0].domain_validation_options : option.domain_name => option
  } : {}

  zone_id         = aws_route53_zone.site.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  count                   = local.wired ? 1 : 0
  certificate_arn         = aws_acm_certificate.site[0].arn
  validation_record_fqdns = [for record in aws_route53_record.site_validation : record.fqdn]
}

# hareet.ai and www.hareet.ai, A and AAAA, to the distribution.
resource "aws_route53_record" "apex_a" {
  count   = local.wired ? 1 : 0
  zone_id = aws_route53_zone.site.zone_id
  name    = "hareet.ai"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site[0].domain_name
    zone_id                = aws_cloudfront_distribution.site[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "apex_aaaa" {
  count   = local.wired ? 1 : 0
  zone_id = aws_route53_zone.site.zone_id
  name    = "hareet.ai"
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site[0].domain_name
    zone_id                = aws_cloudfront_distribution.site[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_a" {
  count   = local.wired ? 1 : 0
  zone_id = aws_route53_zone.site.zone_id
  name    = "www.hareet.ai"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site[0].domain_name
    zone_id                = aws_cloudfront_distribution.site[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_aaaa" {
  count   = local.wired ? 1 : 0
  zone_id = aws_route53_zone.site.zone_id
  name    = "www.hareet.ai"
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site[0].domain_name
    zone_id                = aws_cloudfront_distribution.site[0].hosted_zone_id
    evaluate_target_health = false
  }
}
