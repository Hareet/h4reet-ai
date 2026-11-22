# A plan holding EC2's state: it would fight the start function and the guard (FR-072).
# into: ec2.tf
# expect: stopped: a plan holds an instance's state
resource "aws_ec2_instance_state" "ec2_w1" {
  instance_id = data.aws_instance.ec2.id
  state       = "running"
}
