# h4-laptop-bedrock written under Identity Center's path, where the model action's deny must never attach (R-22).
# expect: laptop role: h4-laptop-bedrock isn't an ordinary role, at the path /
# expect: model action: its targets aren't ordinary roles of this root
resource "aws_iam_role" "laptop_bedrock" {
  name                 = "h4-laptop-bedrock"
  path                 = "/aws-reserved/sso.amazonaws.com/"
  description          = "The laptop gateway's Bedrock"
  assume_role_policy   = data.aws_iam_policy_document.laptop_bedrock_trust.json
  max_session_duration = 3600

  tags = {
    component = "laptop-bedrock"
  }
}
