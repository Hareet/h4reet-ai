# The instance ID's parameter with its drift not ignored: each plan after a replace would write back the ID it
# read, the instance h4-ec2-start launched in its place excepted (spec 032 FR-015).
# expect: id: a plan would undo the ID h4-ec2-start writes after a replace
resource "aws_ssm_parameter" "ec2_instance_id" {
  name        = "/h4reet/prod/ec2-instance-id"
  description = "EC2's instance ID, which the start function and the guard act on (spec 001 contracts/handover.md §2)"
  type        = "String"
  value       = data.aws_instance.ec2.id

  tags = {
    component = "ec2"
  }
}
