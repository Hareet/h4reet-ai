# No alarm on the bridge's failure queue: a Telegram message that couldn't be sent waits there, unseen, for 14 days
# (group 4's Backlog; tasks.md T159).
# drop: resource aws_cloudwatch_metric_alarm bridge_failed
# expect: alarms: h4-alert-bridge-failed is missing
