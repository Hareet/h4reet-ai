# The plan role's permission set name is set in main.tf, which agents edit, though it decides whose role may plan.
# into: main.tf
# expect: plan role: the permission set's name isn't a local of iam.tf alone
locals {
  plan_permission_set = "h4reet-ai-cloud"
}
