> **Superseded on 2026-11-09.** Spec 001 was reworked that day around the Author's decisions (ADR 0044, proposed: EC2 is prod's default host); this contract is the September design's (the laptop serves, the cloud is a thin control plane) and waits for a re-plan, kept unedited below as the record.

# Contract: AWS-side alerts, the budget action, and the uptime probe

Spec 001 (FR-022 to FR-024, FR-026, FR-027, FR-056, FR-060, FR-061) · Plan: [§3](../plan.md#3-cost-the-safety-net-and-the-meter-of-record) · Research: [R-22](../research.md#r-22-the-budgets-the-action-and-the-rehearsal-fr-022-fr-023-fr-026), [R-23](../research.md#r-23-aws-side-alerts-reach-telegram-through-a-bridge-email-directly), [R-24](../research.md#r-24-the-uptime-probe-fr-061)

Spec 000's alerts come from the gateway's outbox ([alerts.md](../../000-local-foundations/contracts/alerts.md)), and they keep doing so on every stack, the cloud stack included. This contract covers the alerts that don't pass through a gateway: AWS's budgets and anomaly monitor, the budget action, the certificate, the probe, the credential audit, and the VM's deployer. They reach the same two channels, Telegram first and email second, never SMS (ADR 0005; FR-022). And they work while the VM is down, because no part of their path runs on it.

## 1. The path

```text
 AWS Budgets ──────────┐
 Cost Anomaly Detection ┤
 ACM expiry (EventBridge)┤      ┌─► email subscription ──────────► the alerts mailbox
 the probe's alarm ─────┼─► SNS topic h4-alerts ─┼─► h4-alert-bridge (Lambda) ──► Telegram Bot API
 h4-credential-audit ───┤      └─► SQS h4-alerts-copy ──► h4-aws-poller (on the VM) ──► the dashboard
 the VM's deployer ─────┘
```

- **The topic** is in `infra/bootstrap/alerts.tf` (protected). Its policy allows `sns:Publish` from `budgets.amazonaws.com`, `costalerts.amazonaws.com`, `events.amazonaws.com`, `cloudwatch.amazonaws.com`, and two roles: the credential audit's and the VM's instance role. Nothing else may publish.
- **Email:** an SNS email subscription to `alert_email`, a sensitive variable the Author supplies (FR-010). SNS sends the Author one confirmation link, which the Author follows once (quickstart §2).
- **The SQS copy** gives the dashboard a count of AWS-side alerts by source (FR-060). It holds a notice for at most 4 days, and losing it loses no alert.

## 2. The alerts and their messages

**Telegram.** `h4-alert-bridge` receives each SNS notice, recognizes its source by its shape, and sends one plain-text message with `sendMessage` (5 s timeout, 3 attempts, 2 s apart).
- **Its secrets:** it reads `/h4reet/cloud/TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from Parameter Store at each run, and logs neither.
- **Its log:** the source, the kind, and the outcome.
- **When it fails:** the function's error goes to the Lambda's own retry, twice, then to its failure destination, the SQS copy, so the dashboard still counts it.

**Email** carries SNS's own rendering of the same notice.

| Kind | Source | When | Telegram message (one line, then facts) | Runbook |
|---|---|---|---|---|
| `aws_budget_warn` | the four ceiling budgets | actual spend at 70% of a budget | `[h4reet.ai aws] budget warning: <budget> at <actual> of <limit> (<period>)` | `docs/runbooks/aws-budget.md` |
| `aws_budget_reached` | the same | actual spend at 100% | `[h4reet.ai aws] budget reached: <budget> at <actual> of <limit> (<period>)` | the same |
| `aws_budget_action` | `h4-account-month`'s action | the action ran: `h4-deny-paid-models` attached to the fallback gateway's role | `[h4reet.ai aws] paid models revoked at the provider: <budget> at <actual>. Restore only after the incident note: see the runbook.` | `docs/runbooks/aws-budget-action.md` |
| `aws_anomaly` | Cost Anomaly Detection | an anomaly whose total impact is over $1 | `[h4reet.ai aws] cost anomaly: <service>, impact <amount>, since <date>` | `docs/runbooks/aws-anomaly.md` |
| `cert_expiring` | ACM, through EventBridge | ACM's "approaching expiration" event (45 days ahead, then daily) | `[h4reet.ai aws] certificate expiring: <domain> on <date>` | `docs/runbooks/certificate.md` |
| `probe_failing` | the probe's alarm | 5 failed minutes in a row (§4) | `[h4reet.ai aws] uptime probe failing for 5 minutes: <check>` | `docs/runbooks/probe-failing.md` |
| `probe_recovered` | the same alarm, back to OK | the next passing minute | `[h4reet.ai aws] uptime probe passing again` | – |
| `credential_finding` | `h4-credential-audit` | any finding ([infra-records.md §7](infra-records.md#7-the-credential-audit-fr-008-sc-004)) | `[h4reet.ai aws] credential audit: <n> findings: <check names>` | `docs/runbooks/credential-audit.md` |
| `deploy_rolled_back`, `deploy_rollback_failed`, `deploy_refused` | the VM's deployer | [releases-deployer.md §3](releases-deployer.md#3-the-deployer) | `[h4reet.ai cloud] deploy <outcome>: release <commit12>, <reason>` | `docs/runbooks/deploy.md` |

**What a message never holds:** a payload, a client identifier, an account ID (the bridge applies [infra-records.md §2](infra-records.md#2-the-plan-block-fr-005)'s 12-digit rule), a key's ID, or a secret.

## 3. The budget action (FR-023, FR-026)

| Setting | `h4-account-month`'s action | The rehearsal's action |
|---|---|---|
| Budget | `h4-account-month`: $20, monthly, actual cost, the whole account | `h4-rehearsal`: $0.01, monthly, actual cost, while `rehearsal = true` |
| Threshold | 100% of the budget, actual | 100%, actual |
| Type | `APPLY_IAM_POLICY` | the same |
| Policy | `h4-deny-paid-models` (§3.1) | the same |
| Target | the role `h4-prod-fallback-gateway` | the role `h4-rehearsal-target`, which trusts no principal |
| Approval | `AUTOMATIC` | the same |
| Execution role | `h4-budget-action`, trusted by `budgets.amazonaws.com`, allowed `iam:AttachRolePolicy` and `iam:DetachRolePolicy` on its one target with its one policy (`iam:PolicyARN` condition) | its own, scoped the same way to the rehearsal target |
| Notifies | `h4-alerts` | `h4-alerts` |

### 3.1 `h4-deny-paid-models`

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyPaidModels",
    "Effect": "Deny",
    "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    "Resource": "*"
  }]
}
```

Bedrock's Converse and ConverseStream calls, which the gateway's adapter makes, are authorized by these two actions, so denying them denies those calls.

### 3.2 What follows an action

- **The fallback gateway's next Bedrock call** fails with `AccessDeniedException`. Spec 000's gateway classes it `auth`, opens the circuit, and answers `fallback_unavailable`.
- **Local answers continue:** the local path calls no provider (FR-023).
- **The meter is unaffected,** and stays the control (FR-024).
- **The kill switch:** if the meter has also reached a ceiling, the switch is already `degraded` by the gateway's own transaction, and the action is the slower second layer.

### 3.3 Restoring (the Author, by hand)

After the constitution's seven-day incident note, the runbook's steps are:
1. `aws budgets describe-budget-action-histories`, to record when AWS acted;
2. `aws budgets execute-budget-action --execution-type REVERSE_BUDGET_ACTION`, which detaches the policy;
3. `make operator-reset ENV=cloud` if the meter's switch tripped too, and `make operator-renew ENV=cloud` for the sub-budget.

The action re-arms itself for the next month.

### 3.4 The rehearsal's record (SC-009)

Written into the group's merge-request note, from AWS's own timestamps:
- when the budget was created;
- when AWS evaluated it, from `describe-budget-performance-history`'s update time;
- when the action ran, from `describe-budget-action-histories`;
- when each channel's message arrived: Telegram's `message_id` and date, and the email's `Date` header;
- the difference between the evaluation and the action, "how long AWS took" (FR-026).

## 4. The uptime probe (FR-061)

`h4-probe`, a Lambda container image (stdlib Python, arm64, 128 MB), runs on an EventBridge schedule, `rate(1 minute)`. Each run:

| Check | Request | Passes when |
|---|---|---|
| `site` | `GET https://h4reet.ai/` with `User-Agent: h4reet-probe/1` | 200 within 5 s, and the body contains `data-h4-page="home"` |
| `status` | `GET https://h4reet.ai/api/status` with `X-H4-Probe: 1` and the same `User-Agent` | 200 within 5 s, and a JSON body with a `state` field |

- **The run fails,** raising so Lambda counts an error, if either check fails. It logs one line per check: the name, the status, the duration, and `pass` or `fail`.
- **It never calls hello.** `X-H4-Probe: 1` on status marks the relay's spans `h4.probe=true`, which spec 000's collector filter drops before traces. A probe never causes a model call or a metered call.
- **The alarm:** CloudWatch alarm `h4-probe-failing`, on the function's `Errors` metric, `Sum >= 1` over 5 consecutive 1-minute periods, missing data treated as breaching. It notifies `h4-alerts` on ALARM and on OK.
- **The dashboard** shows the probe's result per minute from the alarm's state and the SQS copy (`h4_aws_alerts_total{source="probe"}`).

## 5. Tests

`infra/lambdas/*/test_*.py`, with stub SNS events, a stub Telegram server, and a stub Parameter Store:
- each kind in §2 gives its message;
- no message or log line holds the stub's token, chat ID, or a 12-digit number;
- the probe fails on a slow site, a non-200, and a body without its mark;
- the audit reports each finding in [infra-records.md §7](infra-records.md#7-the-credential-audit-fr-008-sc-004) from stub IAM answers.
