# Runbook: an AWS model budget's alert

AWS's own budgets on Bedrock's spend crossed 70% or 100% of their figure: `h4-model-month` ($20 a month) or `h4-model-day` ($5 a day). This page covers the alerts `model_budget_warn` and `model_budget_reached` ([spec 001 contracts/aws-alerts.md §2 and §3](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts)). They are the safety net behind the meter, which bounds model spend in real time and is the control (spec 001 FR-022, FR-024; research.md R-22). The budgets are `infra/bootstrap/budgets.tf`'s.

## Symptoms

- **A Telegram message** from the alert bridge, and SNS's email of the same notice:
  - `[hareet.ai aws] model_budget_warn: h4-model-month at $14.52, past $14.00 of $20.00`, or `h4-model-day` past $3.50 of $5.00;
  - `[hareet.ai aws] model_budget_reached: …` past $20.00 or $5.00;
  - with `- rehearsal: yes` when it is the model rehearsal's $0.01 budget, `h4-rehearsal-model` (tasks.md T040).
- AWS's billing data comes late, by hours, so the meter usually got there first: spec 000's `warn` or `trip` alert (the runbooks `cost-warning.md` and `kill-switch-trip.md`).

## Impact

- **A warning** changes nothing.
- **At 100% of `h4-model-month`**, the model action runs by itself: `h4-deny-paid-models` attaches to `h4-laptop-bedrock`, and, from spec 001's group 7, to EC2's `h4-prod-gateway`. Bedrock's calls then fail as `auth`; the runbook `aws-budget-action.md` follows, with its `model_action_executed` alert.
- **At 100% of `h4-model-day`**, no action runs; the meter's $5 daily ceiling has already tripped, or the two disagree, which is what to find out.
- The Anthropic API's spend isn't on AWS's bill: the meter and spec 010's cap bound it (FR-073).

## Act

In your own terminal, with your SSO session.

1. **Compare with the meter:**

   ```bash
   make operator-status ENV=prod
   ```

   The meter's month and day, and AWS's figure in the alert, should agree within the calls billed after the meter's last commit. AWS's figure much higher than the meter's means a Bedrock call the gateway didn't meter: a call outside the gateway, a live run (`test` attribution), or the model's own console Playground.
2. **Look at Cost Explorer**, Billing console, grouped by Service, for this month: the names Bedrock's spend shows under must be the ones `TF_VAR_bedrock_service_names` lists in `~/.config/h4reet-ai/infra/bootstrap.env` and `account.env`. A name that isn't there is spend the model budgets miss and the server budget counts.
3. **Stop the source** if it shouldn't be spending: the runbook `cost-warning.md`'s step 2.
4. **Don't raise a budget's figure** to get past an alert: it is protected Terraform, by your patch, with an ADR (FR-012).

## Verify

- Cost Explorer's Bedrock line stops climbing over the next day.
- `make operator-status ENV=prod` shows the meter flat.
- No `model_action_executed` follows, unless `h4-model-month` reached 100%.

## Undo

- An alert changes nothing, so there is nothing to undo. The budgets reset on the 1st (monthly) and at 00:00 UTC (daily).
- After the model action, the runbook `aws-budget-action.md`'s Undo.

## Record

In the next merge-request note, or in an incident note in `docs/incidents/` when the spend was unexpected: the alert's first line, the meter's figures beside AWS's, the service names Cost Explorer showed, and what you did. Never a key, a token, or the account's ID.
