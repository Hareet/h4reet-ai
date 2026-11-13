# A dynamic statement block, whose statements the check doesn't read.
# into: iam.tf
# expect: role: aws_iam_policy_document.extra has a dynamic block
data "aws_iam_policy_document" "extra" {
  dynamic "statement" {
    for_each = ["ssm:*"]
    content {
      actions   = [statement.value]
      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "extra" {
  name   = "extra"
  role   = aws_iam_role.tunnel_end.id
  policy = data.aws_iam_policy_document.extra.json
}
