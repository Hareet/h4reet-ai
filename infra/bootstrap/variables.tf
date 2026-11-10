# The bootstrap root's run-time values (contracts/infra-records.md §1). They come from the Author's
# ~/.config/h4reet-ai/infra/bootstrap.env, which make plan ROOT=bootstrap reads as data, as TF_VAR_ lines. The guard
# patch denies each name to agent sessions (contracts/env-cloud.md §5), so a new variable needs its deny there before
# the Author writes its value (FR-011): TF_VAR_bedrock_service_names waits for its own. None is a secret (FR-009); the
# alert address is kept out of the repository and the plan (FR-010).

variable "state_bucket_suffix" {
  description = "The state bucket's suffix, a word the Author picks, in h4reet-ai-tfstate-<suffix> (research.md R-03)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$", var.state_bucket_suffix))
    error_message = "state_bucket_suffix: 3 to 42 lower-case letters, digits, or hyphens, starting and ending with a letter or digit."
  }

  validation {
    condition     = !can(regex("[0-9]{12}", var.state_bucket_suffix))
    error_message = "state_bucket_suffix: never the account ID, or anything of its shape (FR-010)."
  }
}

variable "alert_email" {
  description = "The alerts mailbox, for h4-alerts' email subscription (contracts/aws-alerts.md §1)."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+[.][^@ ]+$", var.alert_email))
    error_message = "alert_email: one address."
  }
}

# The names Bedrock's cost shows under in the Author's Cost Explorer, which the model budgets watch and the server
# budget leaves out (T028's review, B3). Claude on Bedrock is sold through AWS Marketplace, and its cost can show under
# a name of its own, such as "Claude … (Amazon Bedrock Edition)", not "Amazon Bedrock". He reads them there, grouped
# by Service, so no default stands in for what he sees.
variable "bedrock_service_names" {
  description = "Bedrock's service names in Cost Explorer, as the Author reads them there (budgets.tf)."
  type        = list(string)

  validation {
    condition     = length(var.bedrock_service_names) > 0 && alltrue([for n in var.bedrock_service_names : length(trimspace(n)) > 0])
    error_message = "bedrock_service_names: at least one name, none empty, as Cost Explorer shows Bedrock's cost."
  }
}

variable "server_budget_usd" {
  description = "h4-server-month's figure, in US dollars a month: the Author's, from group 2's measurement and his prices (FR-021)."
  type        = number

  validation {
    condition     = var.server_budget_usd > 0
    error_message = "server_budget_usd: a figure above zero, which the Author sets (tasks.md T017)."
  }
}
