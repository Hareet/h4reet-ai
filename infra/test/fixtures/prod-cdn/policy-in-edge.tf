# The site's cache policy in edge.tf, outside the file rule T5 protects for CloudFront's policies.
# into: edge.tf
# expect: policies: aws_cloudfront_cache_policy.site lives outside edge-limits.tf
# expect: files: aws_cloudfront_cache_policy.site lives only in edge-limits*.tf
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
