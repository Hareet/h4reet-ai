# The state bucket without its default encryption (research.md R-03; FR-001).
# drop: resource aws_s3_bucket_server_side_encryption_configuration state
# expect: state bucket: no default encryption
