# The data volume attached on another device than the host script mounts.
# expect: volume: it isn't attached to the tunnel end alone, as /dev/sdf
resource "aws_volume_attachment" "shared_state" {
  device_name                    = "/dev/sdg"
  volume_id                      = aws_ebs_volume.shared_state.id
  instance_id                    = aws_instance.tunnel_end.id
  stop_instance_before_detaching = true
}
