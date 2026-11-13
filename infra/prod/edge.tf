# The edge: hareet.ai's certificate and its CloudFront distribution (spec 001 FR-027 to FR-029, FR-034, FR-042,
# FR-066, FR-076; contracts/edge.md §2 to §4 and §6; research.md R-07 to R-09; plan.md §8.1 and §16, "Why a switch").
# Under spec 000's protected names (infra/*edge*), so it arrives as the Author's patch P-I5 (plan.md §16, "Groups 1 to
# 4, as one branch", 6). CloudFront's policies are edge-limits.tf's (rule T5).
#
# W1 makes the origin access control and the VPC origin to the relay on the tunnel end (plan.md §16, "B-6: option C,
# and the VPC origin from W1"). Behind prod's local.wired, W2's: the certificate, issued once the registrar points at
# the zone W1 makes (T115), and the distribution. No access log anywhere: it would store visitors' addresses (FR-042).

# CloudFront signs its reads of the site's bucket, which only this distribution may make (site.tf's policy).
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "h4-site"
  description                       = "hareet.ai's reads of the site's bucket (spec 001 contracts/edge.md §3)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# A path that ends in a slash is its folder's index.html, as the web image's nginx serves it: S3 through origin access
# control serves no index document of its own (/disclosure/, /credits/, and group 10's /status/). It names nothing, so
# W1 makes it.
resource "aws_cloudfront_function" "index" {
  name    = "h4-site-index"
  runtime = "cloudfront-js-2.0"
  comment = "A folder's path to its index.html (spec 001 contracts/edge.md §3)"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      if (request.uri.endsWith("/")) {
        request.uri += "index.html";
      }
      return request;
    }
  EOT
}

# hareet.ai and www.hareet.ai, in us-east-1 as CloudFront requires, validated by DNS in the zone (dns.tf) and renewed
# by ACM (contracts/edge.md §2).
resource "aws_acm_certificate" "site" {
  count                     = local.wired ? 1 : 0
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

# The relay's origin: the tunnel end, over CloudFront's private path into the VPC, to the relay's edge listener, 8080,
# in HTTP inside AWS's network (contracts/edge.md §3). B-6, option C: the tunnel end's primary interface is the private
# one, 10.42.1.10, where the relay listens, so the instance sits in the private subnet, as AWS documents for a VPC
# origin. Made in W1, unswitched (the Author's answer: "Yes w1 can create the vpc origin"); nothing sends through it
# until W2's distribution, and the private group's 8080 admits CloudFront's origin-facing prefix list alone (plan.md
# §16, "B-6: option C, and the VPC origin from W1").
resource "aws_cloudfront_vpc_origin" "relay" {
  vpc_origin_endpoint_config {
    name                   = "h4-relay"
    arn                    = aws_instance.tunnel_end.arn
    http_port              = 8080
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }

  tags = {
    component = "edge"
  }
}

resource "aws_cloudfront_distribution" "site" {
  count               = local.wired ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  comment             = "hareet.ai (spec 001 contracts/edge.md)"
  aliases             = ["hareet.ai", "www.hareet.ai"]
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  # The room's built site, synced to site/ by each release (contracts/edge.md §5).
  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_path              = "/site"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  # The relay on the tunnel end, which picks the serving host (contracts/relay-http.md). Read for 30 s, the relay's
  # 25 s deadline and its hops.
  origin {
    origin_id   = "relay"
    domain_name = aws_instance.tunnel_end.private_dns

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.relay.id
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  # Every path but /api/*: the site, cached, with spec 002's headers.
  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.site.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.index.arn
    }
  }

  # /api/*: the relay, never cached, with the four headers it reads and nothing of the viewer's beyond them.
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "relay"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = false
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.relay.id
  }

  # The edge's own degraded answer (contracts/edge.md §4; research.md R-08): the relay unreachable, as while AWS has
  # the tunnel end back (FR-076), is a 503 with spec 000's degraded body, cause no_host_serving, from the site's
  # bucket, never cached. The relay's own 503s pass through with their cause: no 503 is mapped here.
  custom_error_response {
    error_code            = 502
    response_code         = 503
    response_page_path    = "/_degraded/api.json"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 504
    response_code         = 503
    response_page_path    = "/_degraded/api.json"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    component = "edge"
  }
}
