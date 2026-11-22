# The data volume attached by Terraform again: a plan after h4-ec2-start replaced the tunnel end would move it back to
# the instance it read, or detach it (spec 032 FR-015).
# into: shared-state.tf
# expect: volume: Terraform attaches it
resource "aws_volume_attachment" "shared_state" {
  device_name                    = "/dev/sdf"
  volume_id                      = aws_ebs_volume.shared_state.id
  instance_id                    = data.aws_instance.tunnel_end.id
  stop_instance_before_detaching = true
}
