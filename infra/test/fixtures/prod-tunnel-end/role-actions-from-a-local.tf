# A statement whose actions come from a local, which the check can't read as a list (the second review, I-A).
# into: iam.tf
# expect: role: aws_iam_policy_document.extra has a statement whose effect or actions aren't literals
data "aws_iam_policy_document" "extra" {
  statement {
    actions   = local.tunnel_end_actions
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "extra" {
  name   = "extra"
  role   = aws_iam_role.tunnel_end.id
  policy = data.aws_iam_policy_document.extra.json
}
