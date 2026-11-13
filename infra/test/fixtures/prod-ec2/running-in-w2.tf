# W1's stop standing after W2's switch, where it would fight the start function and the guard.
# expect: stopped: it doesn't stand behind !local.wired
resource "aws_ec2_instance_state" "ec2_w1" {
  count       = 1
  instance_id = aws_instance.ec2.id
  state       = "stopped"

  depends_on = [aws_volume_attachment.ec2_data]
}
