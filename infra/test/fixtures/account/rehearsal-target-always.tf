# h4-rehearsal-target made whether or not the Author rehearses.
# expect: rehearsal: a rehearsal resource doesn't exist only while local.rehearsal is true
resource "aws_iam_role" "rehearsal_target" {
  name                 = "h4-rehearsal-target"
  path                 = "/"
  description          = "The model rehearsal's target"
  assume_role_policy   = data.aws_iam_policy_document.rehearsal_target_trust[0].json
  max_session_duration = 3600

  tags = {
    component = "rehearsal"
  }
}
