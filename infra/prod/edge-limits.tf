# CloudFront's policies for hareet.ai (spec 001 FR-028, FR-033, FR-042; contracts/edge.md §3; plan.md §8.1): what the
# edge caches, what it forwards to the relay, and the headers it adds to the site. Protected (FR-012; rule T5: CloudFront's
# cache, origin-request, and response-headers policies live in edge-limits*.tf alone), so it changes only by the
# Author's patch, P-I5 here. None waits behind the switch: a policy names no other resource, so W1 makes them all, and
# W2's distribution uses them (plan.md §16, "What W1 applies").

# /api/*: CloudFront's own managed policy, CachingDisabled: no request is cached or answered from a cache.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# The site: cached at the edge as the bucket's objects say. Each release writes their Cache-Control: hashed assets for
# a year, immutable; index.html and the room's data no-cache, so a release shows at once. No cookie, header, or query
# string is in the key; gzip and Brotli copies are kept apart.
resource "aws_cloudfront_cache_policy" "site" {
  name        = "h4-site"
  comment     = "hareet.ai's site, cached as its objects' Cache-Control says (spec 001 contracts/edge.md §3)"
  min_ttl     = 0
  default_ttl = 3600
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# What the relay receives of the viewer's request: the address CloudFront saw, the two content headers, the trace
# context, and the probe's mark, X-H4-Probe, so the relay knows a probe (contracts/relay-http.md §3, step 1; group 8's
# review B, I1); no cookie, no query string, and no other header (§3, step 6).
resource "aws_cloudfront_origin_request_policy" "relay" {
  name    = "h4-relay"
  comment = "The relay's five headers, and nothing else of the viewer's (spec 001 contracts/edge.md §3)"

  cookies_config {
    cookie_behavior = "none"
  }

  headers_config {
    header_behavior = "whitelist"

    headers {
      items = ["CloudFront-Viewer-Address", "Content-Type", "Accept", "traceparent", "X-H4-Probe"]
    }
  }

  query_strings_config {
    query_string_behavior = "none"
  }
}

# The site's headers, spec 002's (its contracts/web-serving.md §3), with HSTS at the edge: connect-src 'self', so every
# request the room makes stays on hareet.ai (SC-010); no referrer; and the camera, the microphone, and geolocation off.
resource "aws_cloudfront_response_headers_policy" "site" {
  name    = "h4-site"
  comment = "spec 002's CSP, HSTS, no referrer, and the Permissions-Policy (spec 001 contracts/edge.md §3)"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      override                = true
    }

    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }

    content_type_options {
      override = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "microphone=(), camera=(), geolocation=()"
      override = true
    }
  }
}
