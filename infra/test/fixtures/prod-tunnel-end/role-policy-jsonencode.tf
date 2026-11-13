# A second policy on the role written as jsonencode, which the check can't read as a policy document (group 5's
# fixes' review, 1).
# into: iam.tf
# expect: role: aws_iam_role_policy.extra's policy isn't a data.aws_iam_policy_document this root reads
resource "aws_iam_role_policy" "extra" {
  name = "extra"
  role = aws_iam_role.tunnel_end.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["ssm:GetParameter"], Resource = "*" }]
  })
}
