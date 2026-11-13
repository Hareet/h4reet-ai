# A policy document merged with more by jsonencode(merge(jsondecode(...))) (the second review).
# into: iam.tf
# expect: role: aws_iam_role_policy.extra's policy isn't a data.aws_iam_policy_document this root reads
resource "aws_iam_role_policy" "extra" {
  name   = "extra"
  role   = aws_iam_role.tunnel_end.id
  policy = jsonencode(merge(jsondecode(data.aws_iam_policy_document.tunnel_end.json), { Version = "2012-10-17" }))
}
