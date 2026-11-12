# A policy document's JSON rewritten by replace(): the reference is inside it, not the policy (the second review).
# into: iam.tf
# expect: role: aws_iam_role_policy.extra's policy isn't a data.aws_iam_policy_document this root reads
resource "aws_iam_role_policy" "extra" {
  name   = "extra"
  role   = aws_iam_role.tunnel_end.id
  policy = replace(data.aws_iam_policy_document.tunnel_end.json, "h4reet/tunnel-end", "*")
}
