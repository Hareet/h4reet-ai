# h4-alerts' policy letting any principal publish, in Cost Anomaly Detection's place (contracts/aws-alerts.md §1).
# expect: h4-alerts: its policy lets a principal other than Budgets, Cost Anomaly Detection, CloudWatch's alarms, and EventBridge publish
data "aws_iam_policy_document" "alerts" {
  statement {
    sid       = "Budgets"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "Anyone"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}
