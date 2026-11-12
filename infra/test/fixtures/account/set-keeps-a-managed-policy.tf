# The hand-made set's customer-managed policy kept on it by Terraform: it holds Bedrock itself, beside the assume.
# into: iam.tf
# expect: permission set: it holds aws_ssoadmin_customer_managed_policy_attachment
resource "aws_ssoadmin_customer_managed_policy_attachment" "legacy" {
  instance_arn       = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  permission_set_arn = aws_ssoadmin_permission_set.laptop.arn

  customer_managed_policy_reference {
    name = "h4reet-ai-cloud"
    path = "/"
  }
}
