# The server rehearsal's role can stop the instance but not run AWS-StartEC2Instance, which reversing the action takes.
# expect: rehearsal server action: its execution role may do more than run AWS-StopEC2Instance and its reverse
data "aws_iam_policy_document" "rehearsal_server_action" {
  count = local.rehearsal ? 1 : 0

  statement {
    sid       = "TheStopDocumentAndItsReverse"
    effect    = "Allow"
    actions   = ["ssm:StartAutomationExecution"]
    resources = ["arn:aws:ssm:us-east-1:*:automation-definition/AWS-StopEC2Instance:*"]
  }

  statement {
    sid       = "ThatInstanceThroughSystemsManager"
    effect    = "Allow"
    actions   = ["ec2:StartInstances", "ec2:StopInstances"]
    resources = [aws_instance.rehearsal[0].arn]

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
