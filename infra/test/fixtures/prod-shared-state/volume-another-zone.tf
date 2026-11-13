# The data volume in another zone than the tunnel end's: it couldn't attach.
# expect: volume: it isn't in the tunnel end's zone
resource "aws_ebs_volume" "shared_state" {
  availability_zone = "us-east-1b"
  size              = local.shared_state_volume_gib
  type              = "gp3"
  encrypted         = true

  tags = {
    Name      = "h4-shared-state"
    component = "shared-state"
  }

  lifecycle {
    prevent_destroy = true
  }
}
