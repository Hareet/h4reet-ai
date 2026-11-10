# The Bedrock policy reaches every model, not the one inference profile (research.md R-15).
# expect: laptop role: it holds more than bedrock:InvokeModel* on the one inference profile
data "aws_iam_policy_document" "bedrock_invoke" {
  statement {
    sid       = "TheInferenceProfile"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"]
  }
}
