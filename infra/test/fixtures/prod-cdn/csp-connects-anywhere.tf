# A CSP whose connect-src isn't 'self': the room could send a visitor's words elsewhere (SC-010).
# expect: policies: the CSP isn't spec 002's
resource "aws_cloudfront_response_headers_policy" "site" {
  name    = "h4-site"
  comment = "spec 002's CSP, HSTS, no referrer, and the Permissions-Policy (spec 001 contracts/edge.md §3)"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src *; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
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
