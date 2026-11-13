# Prod's half of the handover (spec 001 FR-063 to FR-066, FR-069 to FR-072, FR-076; contracts/handover.md §2;
# contracts/aws-alerts.md §2; plan.md §16, "Why a switch" and "No root holds another root's instance or health-check
# ID"; ADR 0049, proposed). Protected (FR-012; rule T5): it changes only by the Author's patch. Group 5 writes the
# switch, the tunnel end's interruption warning, and its return's alert; group 7 adds EC2's ID parameter (P-I4); group 9
# adds EC2's rules and the rules' function targets behind the switch, h4-tunnel-end-running's start-function target
# among them.

locals {
  # The switch (plan.md §16): false in W1, whose three plan blocks are made before any of W1's applies, so nothing here
  # may need another root's W1 apply. The Author's P-W2 sets it true for W2, whose blocks follow W1's applies. Each
  # resource behind it is written `count = local.wired ? 1 : 0`.
  wired = false
}

# AWS's two-minute warning before it stops the tunnel end (spec FR-076, "You get an alert"): the rule names the
# instance from this root, so a replace or a move to another zone updates it in the same plan. It targets h4-alerts
# directly, so it needs no other root's apply and waits behind no switch.
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

# One line of kind and facts, as contracts/aws-alerts.md §2 gives it, and nothing of the event but its time and the
# action AWS names: never the account or the instance's ID.
resource "aws_cloudwatch_event_target" "tunnel_end_spot_warning" {
  rule      = aws_cloudwatch_event_rule.tunnel_end_spot_warning.name
  target_id = "h4-alerts"
  arn       = "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"

  input_transformer {
    input_paths = {
      action = "$.detail.instance-action"
      at     = "$.time"
    }
    input_template = "\"[hareet.ai aws] tunnel_end_interruption: AWS will <action> the tunnel end in two minutes\\n- action: <action>\\n- at: <at>\""
  }
}

# The tunnel end's return (spec FR-076, "its return SHALL be alerted"; contracts/handover.md §2): AWS starting it again
# after an interruption, or a replace's first boot. Its h4-alerts target is W1's and needs no other root; its
# start-function target, invoked `from: tunnel_end_back`, waits behind the switch with the function (W2; group 9).
resource "aws_cloudwatch_event_rule" "tunnel_end_running" {
  name        = "h4-tunnel-end-running"
  description = "The tunnel end entering running, to h4-alerts (spec 001 FR-076)"
  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Instance State-change Notification"]
    detail = {
      instance-id = [aws_instance.tunnel_end.id]
      state       = ["running"]
    }
  })

  tags = {
    component = "tunnel-end"
  }
}

# tunnel_end_back in §2's format, with the time alone: never the account or the instance's ID.
resource "aws_cloudwatch_event_target" "tunnel_end_running" {
  rule      = aws_cloudwatch_event_rule.tunnel_end_running.name
  target_id = "h4-alerts"
  arn       = "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"

  input_transformer {
    input_paths = {
      at = "$.time"
    }
    input_template = "\"[hareet.ai aws] tunnel_end_back: the tunnel end runs again\\n- at: <at>\""
  }
}

# EC2's ID, by its name, for what acts on it from another root at run time (plan.md §16; research.md R-15, amended): the
# start function and the guard read it (W2; group 9), and the guard stops any running instance tagged h4-prod-ec2 that
# it doesn't name (contracts/handover.md §4). A replace of EC2 updates it in the same plan. A String, never a secret.
resource "aws_ssm_parameter" "ec2_instance_id" {
  name        = "/h4reet/prod/ec2-instance-id"
  description = "EC2's instance ID, which the start function and the guard act on (spec 001 contracts/handover.md §2)"
  type        = "String"
  value       = aws_instance.ec2.id

  tags = {
    component = "ec2"
  }
}
