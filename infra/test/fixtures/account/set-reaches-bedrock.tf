# The permission set's own policy also calls Bedrock, past the role the deny attaches to (FR-023).
# expect: permission set: its policy allows more than sts:AssumeRole on h4-laptop-bedrock
data "aws_iam_policy_document" "laptop_assume" {
  statement {
    sid       = "AssumeTheBedrockRole"
    effect    = "Allow"
    actions   = ["sts:AssumeRole", "bedrock:InvokeModel"]
    resources = [aws_iam_role.laptop_bedrock.arn]
  }
}
