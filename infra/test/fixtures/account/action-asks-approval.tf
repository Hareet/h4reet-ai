# The model action waits for someone to approve it, in the night (FR-023: automatic).
# expect: model action: it isn't an automatic APPLY_IAM_POLICY on actual cost
resource "aws_budgets_budget_action" "model" {
  budget_name        = "h4-model-month"
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "MANUAL"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.model_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.deny_paid_models.arn
      roles      = [aws_iam_role.laptop_bedrock.name]
    }
  }

  subscriber {
    address           = data.aws_sns_topic.alerts.arn
    subscription_type = "SNS"
  }

  depends_on = [aws_iam_role_policy.model_action]
}
