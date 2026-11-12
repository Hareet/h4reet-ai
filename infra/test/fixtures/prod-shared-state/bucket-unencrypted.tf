# The backups' bucket without its default encryption.
# drop: resource aws_s3_bucket_server_side_encryption_configuration shared_state_backups
# expect: backups: the bucket isn't encrypted by default
