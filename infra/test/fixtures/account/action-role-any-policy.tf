# The model action's role may attach any policy to the laptop's role, an administrator's among them.
# expect: model action: its execution role may do more than attach and detach that policy on those roles
data "aws_iam_policy_document" "model_action" {
  statement {
    sid       = "ThatPolicyOnThoseRoles"
    effect    = "Allow"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = [aws_iam_role.laptop_bedrock.arn]
  }
}
