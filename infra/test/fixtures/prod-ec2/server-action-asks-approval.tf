# The server action waiting for a person, which the budget's crossing must not.
# expect: actions: aws_budgets_budget_action.server isn't automatic
resource "aws_budgets_budget_action" "server" {
  budget_name        = "h4-server-month"
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "MANUAL"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.server_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_EC2_INSTANCES"
      instance_ids    = [aws_instance.ec2.id]
      region          = "us-east-1"
    }
  }

  subscriber {
    address           = "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"
    subscription_type = "SNS"
  }

  tags = {
    component = "kill-switch"
  }

  depends_on = [aws_iam_role_policy.server_action]
}
