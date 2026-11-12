# Session Manager by AWS's managed policy again: AmazonSSMManagedInstanceCore grants ssm:GetParameter and
# ssm:GetParameters on "*", every parameter in the account (group 5's review, I1).
# into: iam.tf
# expect: role: a managed policy is attached
resource "aws_iam_role_policy_attachment" "tunnel_end_ssm" {
  role       = aws_iam_role.tunnel_end.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
