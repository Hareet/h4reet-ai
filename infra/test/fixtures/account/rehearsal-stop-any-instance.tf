# The server rehearsal's role may stop and start any instance of the account, EC2 and the tunnel end among them.
# expect: rehearsal server action: its execution role may do more than run AWS-StopEC2Instance
data "aws_iam_policy_document" "rehearsal_server_action" {
  count = local.rehearsal ? 1 : 0

  statement {
    sid     = "TheStopDocumentAndItsReverse"
    effect  = "Allow"
    actions = ["ssm:StartAutomationExecution"]
    resources = [
      "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StopEC2Instance:*",
      "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StartEC2Instance:*",
    ]
  }

  statement {
    sid       = "ThatInstanceThroughSystemsManager"
    effect    = "Allow"
    actions   = ["ec2:StartInstances", "ec2:StopInstances"]
    resources = ["*"]

    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "aws:CalledVia"
      values   = ["ssm.amazonaws.com"]
    }
  }

  statement {
    sid       = "ItsState"
    effect    = "Allow"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"]
    resources = ["*"]
  }
}
