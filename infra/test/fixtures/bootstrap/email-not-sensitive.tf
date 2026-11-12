# The alert address without sensitive, so a plan would print it (FR-010).
# expect: variables: alert_email isn't sensitive
variable "alert_email" {
  description = "The alerts mailbox's address."
  type        = string
}
