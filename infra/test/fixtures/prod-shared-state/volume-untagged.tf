# The data volume with no component tag.
# expect: volume: it isn't tagged component = shared-state
resource "aws_ebs_volume" "shared_state" {
  availability_zone = local.zone
  size              = local.shared_state_volume_gib
  type              = "gp3"
  encrypted         = true

  tags = {
    Name = "h4-shared-state"
  }

  lifecycle {
    prevent_destroy = true
  }
}
