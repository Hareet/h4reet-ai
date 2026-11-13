# The origin access control that never signs: the bucket would refuse CloudFront, or have to be public.
# expect: oac: the site's origin access control isn't S3's, signing always
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "h4-site"
  description                       = "hareet.ai's reads of the site's bucket (spec 001 contracts/edge.md §3)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "never"
  signing_protocol                  = "sigv4"
}
