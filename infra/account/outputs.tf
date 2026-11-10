# What the Author's next steps read (tasks.md T040): the registry's host, which his push commands log in to and tag
# with, each function's repository, and the release bucket. The plan block's redaction takes the account ID out of the
# registry's host, as it does any 12-digit run (contracts/infra-records.md §2).
output "registry" {
  description = "The account's ECR host, <account>.dkr.ecr.us-east-1.amazonaws.com."
  value       = split("/", aws_ecr_repository.lambda["h4-probe"].repository_url)[0]
}

output "lambda_repositories" {
  description = "Each function's repository, by name (main.tf's local.lambda_repositories)."
  value       = { for name, repo in aws_ecr_repository.lambda : name => repo.repository_url }
}

output "release_bucket" {
  description = "The release bucket's name, AWS's from its prefix."
  value       = aws_s3_bucket.releases.bucket
}
