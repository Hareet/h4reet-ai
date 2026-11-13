# The backups' bucket without the policy that refuses a request without TLS.
# drop: resource aws_s3_bucket_policy shared_state_backups
# expect: backups: the bucket's policy doesn't refuse a request without TLS
