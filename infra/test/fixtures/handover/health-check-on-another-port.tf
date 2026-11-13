# The health check on the relay's port, not the laptop's health block's: it would read the tunnel end, not the laptop
# (contracts/handover.md §1).
# root: prod
# expect: health check: it isn't HTTP on 8087's /health
resource "aws_route53_health_check" "laptop" {
  type              = "HTTP"
  ip_address        = aws_eip.tunnel_end.public_ip
  port              = 8080
  resource_path     = "/health"
  request_interval  = 30
  failure_threshold = 3

  tags = {
    Name      = "h4-laptop-health"
    component = "handover"
  }
}
