# EC2's model action attaching the deny to another role than h4-prod-gateway.
# expect: model action: it doesn't attach h4-deny-paid-models
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
      policy_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/h4-deny-paid-models"
      roles      = [aws_iam_role.ec2.name]
    }
  }

  subscriber {
    address           = "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"
    subscription_type = "SNS"
  }

  tags = {
    component = "kill-switch"
  }

  depends_on = [aws_iam_role_policy.model_action]
}
