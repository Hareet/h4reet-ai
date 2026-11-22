# The data volume without component, so Cost Explorer can't show it as EC2's (T154).
# expect: volume: it isn't tagged Name = h4-ec2-data, by which h4-ec2-start finds it, and component = ec2
resource "aws_ebs_volume" "ec2_data" {
  availability_zone = local.zone
  size              = local.ec2_data_volume_gib
  type              = "gp3"
  encrypted         = true

  tags = {
    Name = "h4-ec2-data"
  }
}
