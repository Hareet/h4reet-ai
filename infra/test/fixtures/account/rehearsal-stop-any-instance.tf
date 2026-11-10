# The server rehearsal's role may stop any instance of the account, EC2 and the tunnel end among them.
# expect: rehearsal server action: its execution role may do more than run AWS-StopEC2Instance on it
data "aws_iam_policy_document" "rehearsal_server_action" {
  count = local.rehearsal ? 1 : 0

  statement {
    sid       = "TheStopDocument"
    effect    = "Allow"
    actions   = ["ssm:StartAutomationExecution"]
    resources = ["arn:aws:ssm:us-east-1::automation-definition/AWS-StopEC2Instance:*"]
  }

  statement {
    sid       = "ThatInstance"
    effect    = "Allow"
    actions   = ["ec2:StopInstances"]
    resources = ["*"]
  }
}
