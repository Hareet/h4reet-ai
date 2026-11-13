# h4-alerts, the one topic every AWS-side alert goes to, and its email subscription to the alerts mailbox, the Author's
# sensitive variable (spec 001 FR-010, FR-022; research.md R-23; contracts/aws-alerts.md §1). Telegram's half, through
# h4-alert-bridge, comes with group 4. Protected (FR-012; contracts/infra-records.md §3, rule T5).

resource "aws_sns_topic" "alerts" {
  name = "h4-alerts"

  tags = {
    component = "alerts"
  }
}

# Who may publish: AWS Budgets, Cost Anomaly Detection, CloudWatch's alarms, and EventBridge, each for this account
# alone. CloudWatch's and EventBridge's join in W1 (tasks.md T160; plan.md §16, W1's departure 4), for the credential
# audit's and the bridge's alarms and the tunnel end's interruption warning. The account's own principals keep what IAM
# gives them; this policy grants nothing else.
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
    sid       = "CostAnomalyDetection"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["costalerts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "CloudWatchAlarms"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "EventBridge"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

# SNS asks the mailbox to confirm, once, before it delivers (tasks.md T030).
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# The account root's publishers and subscribers read the topic by this. It sits here, beside the topic, so the files the
# branch holds without this patch still make a whole root.
output "alerts_topic_arn" {
  description = "h4-alerts (contracts/aws-alerts.md §1)."
  value       = aws_sns_topic.alerts.arn
}
