# The site's origin without origin access control: the bucket would have to be readable some other way.
# expect: distribution: the origin `site` isn't the bucket under /site through origin access control
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
    origin_id   = "site"
    domain_name = aws_s3_bucket.site.bucket_regional_domain_name
    origin_path = "/site"
  }

  # The relay on the tunnel end, which picks the serving host (contracts/relay-http.md). Read for 30 s, the relay's
  # 25 s deadline and its hops.
  origin {
    origin_id   = "relay"
    domain_name = aws_instance.tunnel_end.private_dns

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.relay[0].id
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  # Every other path: the site, cached, with spec 002's headers, and no function (the index behaviors, below).
  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.site.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id
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

  # A folder's path, the site's, with its policies, through the index function: `*/` is its index.html, and each of the
  # site's folders without its slash is redirected to it (/credits, /disclosure, and group 10's /status). After
  # /api/*, which comes first; every other site path runs no function.
  ordered_cache_behavior {
    path_pattern               = "*/"
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

  ordered_cache_behavior {
    path_pattern               = "/credits"
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

  ordered_cache_behavior {
    path_pattern               = "/disclosure"
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

  ordered_cache_behavior {
    path_pattern               = "/status"
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
