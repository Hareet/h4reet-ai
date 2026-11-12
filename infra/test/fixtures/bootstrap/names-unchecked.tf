# The service names without the check that the list isn't empty: an empty filter would watch nothing (B3).
# expect: variables: bedrock_service_names isn't a list(string) validated non-empty
variable "bedrock_service_names" {
  description = "Bedrock's service names in Cost Explorer."
  type        = list(string)
}
