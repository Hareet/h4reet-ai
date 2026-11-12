# The model action aimed at the role Identity Center makes for the permission set, by its name (research.md R-22).
# expect: model action: its targets aren't ordinary roles of this root
# expect: model action: it doesn't target h4-laptop-bedrock
resource "aws_budgets_budget_action" "model" {
  budget_name        = "h4-model-month"
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.model_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.deny_paid_models.arn
      roles      = ["AWSReservedSSO_H4Bedrock_0123456789abcdef"]
    }
  }

  subscriber {
    address           = data.aws_sns_topic.alerts.arn
    subscription_type = "SNS"
  }

  tags = {
    component = "kill-switch"
  }
}
