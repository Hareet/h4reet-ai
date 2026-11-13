# A second policy that names the role by its literal name: the check would read past it (group 5's fixes' review,
# 1).
# into: iam.tf
# expect: role: aws_iam_role_policy.extra names its role other than by a reference
resource "aws_iam_role_policy" "extra" {
  name   = "extra"
  role   = "h4-prod-tunnel-end"
  policy = data.aws_iam_policy_document.tunnel_end.json
}
