# The warning rule naming an instance by a literal ID: a replace or a zone move would leave it on a gone instance.
# expect: warning: the rule doesn't match the tunnel end's own interruption warning, from this root
resource "aws_cloudwatch_event_rule" "tunnel_end_spot_warning" {
  name        = "h4-tunnel-end-spot-warning"
  description = "AWS's interruption warning for the tunnel end, to h4-alerts (spec 001 FR-076)"
  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Spot Instance Interruption Warning"]
    detail = {
      instance-id = ["i-0123456789abcdef0"]
    }
  })

  tags = {
    component = "tunnel-end"
  }
}
