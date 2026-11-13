# The bridge's failure queue with no component tag: SQS queues take tags, and the policy's source list (TAGGABLE) lacks
# the type, as it lacked budget actions (tasks.md T157; rule T2 on the saved plan).
# expect: tags: aws_sqs_queue.alert_bridge_failed sets no component
resource "aws_sqs_queue" "alert_bridge_failed" {
  name                      = "h4-alert-bridge-failed"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
