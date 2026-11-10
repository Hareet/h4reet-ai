# The account root's run-time value (contracts/infra-records.md §1). It comes from the Author's
# ~/.config/h4reet-ai/infra/account.env, which make plan ROOT=account reads as data, as a TF_VAR_ line. It is the same
# variable the bootstrap's budgets read (group 3), so both roots name Bedrock's spend alike. A new variable needs its
# deny first (FR-011; contracts/env-cloud.md §5). It isn't a secret (FR-009).

variable "bedrock_service_names" {
  description = "The service names Bedrock's spend shows under in Cost Explorer, as the Author reads them there: the model rehearsal's budget reads them, and the server rehearsal's reads every cost but theirs (research.md R-22)."
  type        = list(string)

  validation {
    condition     = length(var.bedrock_service_names) > 0 && alltrue([for n in var.bedrock_service_names : length(trimspace(n)) > 0])
    error_message = "bedrock_service_names: at least one name, as Cost Explorer shows Bedrock's spend (the merge-request note's step before T037)."
  }
}
