# The failover's health check and its alarm (spec 001 FR-054, FR-063 to FR-065; contracts/handover.md §1 and §2,
# amended; research.md R-29; plan.md §16, "No root holds another root's instance or health-check ID"; ADR 0049,
# proposed). Protected (FR-012; rule T5): it changes only by the Author's patch, P-I6.
#
# The check probes the laptop's health block through the tunnel end (contracts/tunnel.md §4): its Elastic IP, port
# 8087, /health, which S17's reverse forward 2203 carries to the laptop's edge. So it fails if the tunnel end, the
# tunnel, or the laptop's stack fails. Its alarm, h4-laptop-away, is what wakes EC2: the account's h4-laptop-away-rule
# matches its change into ALARM by its name (W2), and both functions read its state by its name-built ARN as the
# laptop's serving, OK meaning the laptop serves (research.md R-15, amended). Neither is behind the switch: both need
# nothing of another root.

resource "aws_route53_health_check" "laptop" {
  type              = "HTTP"
  ip_address        = aws_eip.tunnel_end.public_ip
  port              = 8087
  resource_path     = "/health"
  request_interval  = 30
  failure_threshold = 3

  tags = {
    Name      = "h4-laptop-health"
    component = "handover"
  }
}

# Route 53 publishes HealthCheckStatus in us-east-1, this root's Region: 1 while healthy, 0 while not. In alarm below 1
# over one minute, and with missing data breaching, so a check that stops reporting reads as the laptop gone. No alarm
# action: the account's rule reads the change itself, and the alert is the start function's.
resource "aws_cloudwatch_metric_alarm" "laptop_away" {
  alarm_name          = "h4-laptop-away"
  alarm_description   = "The laptop's health block fails through the tunnel end (spec 001 contracts/handover.md §2)"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    HealthCheckId = aws_route53_health_check.laptop.id
  }

  tags = {
    component = "handover"
  }
}
