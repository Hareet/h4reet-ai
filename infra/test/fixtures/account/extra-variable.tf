# A second variable, whose TF_VAR_ name the guard patch doesn't deny (FR-011).
# into: variables.tf
# expect: variables: the root's variables aren't
variable "alert_email" {
  type      = string
  sensitive = true
}
