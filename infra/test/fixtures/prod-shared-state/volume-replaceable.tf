# The data volume without prevent_destroy: a plan could replace it, and the store with it.
# expect: volume: it lacks prevent_destroy
resource "aws_ebs_volume" "shared_state" {
  availability_zone = local.zone
  size              = local.shared_state_volume_gib
  type              = "gp3"
  encrypted         = true

  tags = {
    Name      = "h4-shared-state"
    component = "shared-state"
  }
}
