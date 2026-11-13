# The warning rule in the unprotected tunnel-end.tf, where an agent could change it (rule T5).
# into: tunnel-end.tf
# expect: warning: the rule lives outside prod's handover.tf
# expect: files: aws_cloudwatch_event_rule.tunnel_end_spot_warning lives only in a protected file
resource "aws_cloudwatch_event_rule" "tunnel_end_spot_warning" {
  name        = "h4-tunnel-end-spot-warning"
  description = "AWS's interruption warning for the tunnel end, to h4-alerts (spec 001 FR-076)"
  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Spot Instance Interruption Warning"]
    detail = {
      instance-id = [aws_instance.tunnel_end.id]
    }
  })

  tags = {
    component = "tunnel-end"
  }
}
