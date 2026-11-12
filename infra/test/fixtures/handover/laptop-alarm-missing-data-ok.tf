# The alarm reading missing data as fine: a check that stops reporting would leave EC2 asleep with no host serving.
# root: prod
# expect: alarm: it isn't the minimum of HealthCheckStatus below 1 over a minute, missing data breaching
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
  treat_missing_data  = "notBreaching"

  dimensions = {
    HealthCheckId = aws_route53_health_check.laptop.id
  }

  tags = {
    component = "handover"
  }
}
