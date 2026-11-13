# The Author's stop set on any instance: in the shared account, his other work's instances too (ADR 0047).
# root: account
# expect: stop set: it doesn't hold the stop of the tagged instance alone
data "aws_iam_policy_document" "ec2_stop" {
  statement {
    sid       = "StopTheTaggedInstance"
    effect    = "Allow"
    actions   = ["ec2:StopInstances"]
    resources = ["arn:aws:ec2:us-east-1:${data.aws_caller_identity.current.account_id}:instance/*"]
  }

  statement {
    sid       = "ItsState"
    effect    = "Allow"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  statement {
    sid       = "ItsAlert"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [data.aws_sns_topic.alerts.arn]
  }
}
