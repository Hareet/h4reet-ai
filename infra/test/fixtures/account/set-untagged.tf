# The laptop's permission set with no component tag: Identity Center's permission sets take tags, and the policy's
# source list (TAGGABLE) lacks the type (tasks.md T157; rule T2 on the saved plan).
# expect: tags: aws_ssoadmin_permission_set.laptop sets no component
resource "aws_ssoadmin_permission_set" "laptop" {
  name         = local.laptop_permission_set
  instance_arn = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  description  = "The laptop's Bedrock: sts:AssumeRole on h4-laptop-bedrock alone (spec 001 FR-013)"

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [session_duration, relay_state]
  }
}
