# Apply: bootstrap, 2026-11-12

| Field | Value |
|---|---|
| Root | bootstrap |
| Commit | 0ada646b345d9cd1f9cda4deadef98e7281092cb (main) |
| Plan | sha256 30bd939b8ebee19d4fc2c6d318dbfa03b7e369c2bd2c2b434cf623ba904b7d41, tree aacec92727116c5a426c4631e8827236c2006d76 (the block in docs/merge-requests/2026-11-12-fix-001-shared-account.md) |
| Applied by | the Author, from the Author's terminal |
| Started, finished | 2026-11-12T05:17:33Z, 2026-11-12T05:20:45Z |
| Outcome | ok |
| Terraform | 1.17.1 |

Started is when make infra-verify passed, just before the apply; finished, when make infra-record ran.

## Resources changed

| Address | Action |
|---|---|
| aws_budgets_budget.model_day | create |
| aws_budgets_budget.model_month | create |
| aws_budgets_budget.server_month | create |
| aws_ce_anomaly_monitor.account | create |
| aws_ce_anomaly_subscription.account | create |
| aws_s3_bucket.state | create |
| aws_s3_bucket_ownership_controls.state | create |
| aws_s3_bucket_policy.state | create |
| aws_s3_bucket_public_access_block.state | create |
| aws_s3_bucket_server_side_encryption_configuration.state | create |
| aws_s3_bucket_versioning.state | create |
| aws_sns_topic.alerts | create |
| aws_sns_topic_policy.alerts | create |
| aws_sns_topic_subscription.email | create |
