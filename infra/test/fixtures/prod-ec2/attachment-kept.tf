# The data volume's attachment still Terraform's: a plan after a replace would detach it from the new instance
# (spec 032 FR-015).
# into: ec2.tf
# drop: removed
# expect: volume: Terraform attaches a volume
# expect: volume: its attachment isn't forgotten by a removed block that keeps it
# expect: ec2: aws_instance.ec2 isn't forgotten by a removed block that keeps it
resource "aws_volume_attachment" "ec2_data" {
  device_name                    = "/dev/sdf"
  volume_id                      = aws_ebs_volume.ec2_data.id
  instance_id                    = data.aws_instance.ec2.id
  stop_instance_before_detaching = true
}
