# h4-prod-gateway assumable by anyone in the account, not h4-prod-ec2 alone.
# expect: h4-prod-gateway: something other than h4-prod-ec2 may assume it
data "aws_iam_policy_document" "gateway_trust" {
  statement {
    sid     = "EC2sHostRoleOnly"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}
