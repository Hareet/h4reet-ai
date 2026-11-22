# The server action's role able to stop any instance in the account.
# expect: server action: its role may do more than that document on EC2
# expect: server action: ec2:StartInstances isn't held to the instance tagged h4-prod-ec2
# expect: server action: ec2:StopInstances isn't held to the instance tagged h4-prod-ec2
data "aws_iam_policy_document" "server_action" {
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
