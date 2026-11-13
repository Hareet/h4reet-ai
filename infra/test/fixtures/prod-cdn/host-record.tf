# A record for a host: visitors would reach the tunnel end around the edge and the relay (FR-072).
# expect: zone: records beyond the aliases and the certificate's validation
# into: dns.tf
resource "aws_route53_record" "tunnel_end" {
  count   = local.wired ? 1 : 0
  zone_id = aws_route53_zone.site.zone_id
  name    = "relay.hareet.ai"
  type    = "A"
  ttl     = 60
  records = [aws_eip.tunnel_end.public_ip]
}
