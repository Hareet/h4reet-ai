# The relay's origin requests carry X-Forwarded-For, which a viewer can set.
# expect: policies: the relay's origin requests don't carry exactly
resource "aws_cloudfront_origin_request_policy" "relay" {
  name    = "h4-relay"
  comment = "The relay's four headers, and nothing else of the viewer's (spec 001 contracts/edge.md §3)"

  cookies_config {
    cookie_behavior = "none"
  }

  headers_config {
    header_behavior = "whitelist"

    headers {
      items = ["CloudFront-Viewer-Address", "Content-Type", "Accept", "traceparent", "X-Forwarded-For"]
    }
  }

  query_strings_config {
    query_string_behavior = "none"
  }
}
