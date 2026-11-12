# A policy document granting everything but a few actions, which reads as no action at all (group 5's fixes'
# review, 1).
# into: iam.tf
# expect: role: aws_iam_policy_document.extra grants by not_actions, not_resources, or not_principals
data "aws_iam_policy_document" "extra" {
  statement {
    effect      = "Allow"
    not_actions = ["iam:*"]
    resources   = ["*"]
  }
}

resource "aws_iam_role_policy" "extra" {
  name   = "extra"
  role   = aws_iam_role.tunnel_end.id
  policy = data.aws_iam_policy_document.extra.json
}
