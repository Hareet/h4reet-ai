# What the state's move reads (research.md R-03; tasks.md T030). The topic's output sits in alerts.tf, beside the topic,
# so these files make a whole root without P-I1. The plan block redacts the bucket's name (redact.txt): its suffix is
# the Author's word.
output "state_bucket" {
  description = "The state bucket, the backend's bucket= when the state moves to it (tasks.md T030)."
  value       = aws_s3_bucket.state.bucket
}
