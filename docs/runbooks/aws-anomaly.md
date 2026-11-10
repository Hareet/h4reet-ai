# Runbook: a cost anomaly

AWS Cost Anomaly Detection's monitor of the account, `h4-anomaly`, found spend it didn't expect, of $1 or more. This page covers the alert `aws_anomaly` ([spec 001 contracts/aws-alerts.md §2](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts)). The monitor and its immediate subscription are `infra/bootstrap/budgets.tf`'s (spec 001 FR-022; research.md R-22).

## Symptoms

- **A Telegram message** from the alert bridge, and SNS's email of AWS's full notice: `[hareet.ai aws] aws_anomaly: <service>, impact $<amount>, since <date>`.
- It may come before any budget's alert: the monitor looks at the shape of spend, not a figure.

## Impact

- Nothing stops. An anomaly is a question, not an action.
- When the service is Bedrock, the meter bounds model spend in real time; anything else counts against the server budget (the runbook `server-budget.md`).

## Act

In your own terminal, or the console, with your SSO session.

1. **Open the anomaly** from SNS's email, which links it, or in the Billing console, Cost Anomaly Detection: its root causes name the service, the Region, and the usage type.
2. **Bedrock:** compare with the meter, `make operator-status ENV=prod`, and the runbook `aws-budget.md`'s Act.
3. **Anything else:** find the resource by its `component` tag in Cost Explorer. A resource with no tag of this project's is outside Terraform: the credential audit's checks (`make infra-audit PROFILE=…`) and your own console session find who made it.
4. **A real change** you made, a new instance type, say: mark the anomaly as expected in the console, so the monitor learns.

## Verify

- The anomaly's impact stops growing in the console over the next day.
- No second `aws_anomaly` for the same service follows.

## Undo

Nothing to undo: an anomaly changes no state. A resource you stopped or removed comes back through your Terraform plan, as any change does.

## Record

In the next merge-request note, or an incident note in `docs/incidents/` for spend you didn't expect: the alert's line, the anomaly's root cause, its impact, and what you did. Never the account's ID.
