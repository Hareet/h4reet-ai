# The VPC origin asked for HTTPS, which the relay's listener doesn't speak.
# expect: vpc origin: not the tunnel end on 8080, HTTP inside AWS's network
resource "aws_cloudfront_vpc_origin" "relay" {
  vpc_origin_endpoint_config {
    name                   = "h4-relay"
    arn                    = data.aws_instance.tunnel_end.arn
    http_port              = 8080
    https_port             = 443
    origin_protocol_policy = "https-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }

  tags = {
    component = "edge"
  }
}
