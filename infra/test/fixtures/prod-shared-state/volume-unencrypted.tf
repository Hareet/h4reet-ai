# The data volume unencrypted.
# expect: volume: it isn't encrypted gp3
resource "aws_ebs_volume" "shared_state" {
  availability_zone = local.zone
  size              = local.shared_state_volume_gib
  type              = "gp3"
  encrypted         = false

  tags = {
    Name      = "h4-shared-state"
    component = "shared-state"
  }

  lifecycle {
    prevent_destroy = true
  }
}
