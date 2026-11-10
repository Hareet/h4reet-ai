# The permission set's name moved back into main.tf, which agents edit, though it decides which set the protected
# iam.tf imports, overwrites, and provisions (T038's review, I4).
# into: main.tf
# expect: permission set: its name isn't a local of iam.tf alone
locals {
  laptop_permission_set = null
}
