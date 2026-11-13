# A document built from another by source_policy_documents, whose statements the check doesn't read.
# into: iam.tf
# expect: role: aws_iam_policy_document.extra takes source_policy_documents
data "aws_iam_policy_document" "extra" {
  source_policy_documents = [jsonencode({ Statement = [{ Effect = "Allow", Action = "ssm:*", Resource = "*" }] })]
}

resource "aws_iam_role_policy" "extra" {
  name   = "extra"
  role   = aws_iam_role.tunnel_end.id
  policy = data.aws_iam_policy_document.extra.json
}
