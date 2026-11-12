# The model action with no component tag: budget actions take tags, and the saved plan's tags_all must name
# component (rule T2; the Author's T037 plan, 2026-11-12).
# expect: tags: aws_budgets_budget_action.model sets no component
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
      roles      = [aws_iam_role.laptop_bedrock.name]
    }
  }

  subscriber {
    address           = data.aws_sns_topic.alerts.arn
    subscription_type = "SNS"
  }

  depends_on = [aws_iam_role_policy.model_action]
}
