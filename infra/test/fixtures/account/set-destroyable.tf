# The imported permission set without prevent_destroy, so a plan could remove the laptop's identity.
# expect: permission set: a plan may destroy it (prevent_destroy)
resource "aws_ssoadmin_permission_set" "laptop" {
  name         = local.laptop_permission_set
  instance_arn = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  description  = "The laptop's Bedrock"

  tags = {
    component = "laptop-bedrock"
  }

  lifecycle {
    ignore_changes = [session_duration, relay_state]
  }
}
