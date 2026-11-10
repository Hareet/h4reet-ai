# The service names with a default, a guess standing in for what the Author reads in his Cost Explorer (B3).
# expect: variables: bedrock_service_names has a default
variable "bedrock_service_names" {
  description = "Bedrock's service names in Cost Explorer."
  type        = list(string)
  default     = ["Amazon Bedrock"]

  validation {
    condition     = length(var.bedrock_service_names) > 0 && alltrue([for n in var.bedrock_service_names : length(trimspace(n)) > 0])
    error_message = "bedrock_service_names: at least one name."
  }
}
