# A fourth variable, whose TF_VAR_ name the guard patch doesn't deny (FR-011; contracts/env-cloud.md §5).
# expect: variables: region isn't one the guard patch denies
variable "region" {
  description = "A region, as a run-time value."
  type        = string
}
