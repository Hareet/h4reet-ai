# The role with an inline_policy block, a policy beside its policy resources (group 5's fixes' review, 1).
# expect: role: it holds an inline_policy block
resource "aws_iam_role" "tunnel_end" {
  name                 = "h4-prod-tunnel-end"
  description          = "The tunnel end's host services (spec 001 research.md R-15)"
  assume_role_policy   = data.aws_iam_policy_document.tunnel_end_trust.json
  max_session_duration = 3600

  inline_policy {
    name   = "extra"
    policy = data.aws_iam_policy_document.tunnel_end.json
  }

  tags = {
    component = "tunnel-end"
  }
}
