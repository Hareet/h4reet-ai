# Bedrock's service names written into the tree as a default, not the Author's reading of Cost Explorer.
# expect: variables: bedrock_service_names isn't a list of strings, without a default, validated
variable "bedrock_service_names" {
  type    = list(string)
  default = ["Amazon Bedrock"]

  validation {
    condition     = length(var.bedrock_service_names) > 0
    error_message = "at least one"
  }
}
