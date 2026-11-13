# The instance's ID as a literal, which a replace would leave on a gone instance.
# expect: id: /h4reet/prod/ec2-instance-id isn't handover.tf's String of EC2's ID
resource "aws_ssm_parameter" "ec2_instance_id" {
  name        = "/h4reet/prod/ec2-instance-id"
  description = "EC2's instance ID, which the start function and the guard act on (spec 001 contracts/handover.md §2)"
  type        = "String"
  value       = "i-0123456789abcdef0"

  tags = {
    component = "ec2"
  }
}
