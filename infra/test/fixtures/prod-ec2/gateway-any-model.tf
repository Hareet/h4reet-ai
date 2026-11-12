# h4-prod-gateway on every Bedrock model, not the one inference profile.
# expect: h4-prod-gateway: Bedrock isn't the one inference profile and its models
data "aws_iam_policy_document" "gateway" {
  statement {
    sid       = "TheInferenceProfile"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"]
  }

  statement {
    sid       = "ItsModelsThroughTheProfileOnly"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5*"]

    condition {
      test     = "StringLike"
      variable = "bedrock:InferenceProfileArn"
      values   = ["arn:aws:bedrock:us-east-1:${data.aws_caller_identity.current.account_id}:inference-profile/us.anthropic.claude-haiku-5-5"]
    }
  }
}
