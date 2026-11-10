# Runbook: the model action ran

`h4-model-month` reached 100% of its $20, and AWS Budgets attached `h4-deny-paid-models` to the Bedrock roles by itself: `h4-laptop-bedrock`, the role the laptop's permission set assumes, and, from spec 001's group 7, EC2's `h4-prod-gateway`. This page covers the alert `model_action_executed` ([spec 001 contracts/aws-alerts.md §2 and §4](../../specs/001-cloud-elevation/contracts/aws-alerts.md#4-the-two-actions-infraaccountkillswitchtf-protected)). The action is `infra/account/killswitch.tf`'s (spec 001 FR-023).

## Symptoms

- **A Telegram message** from the alert bridge, and SNS's email: `[hareet.ai aws] model_action_executed: h4-model-month's action ran`, with `- budget: h4-model-month`, or `- rehearsal: yes` for the model rehearsal's, `h4-rehearsal-model`, whose action attaches the deny to `h4-rehearsal-target` instead.
- **Bedrock's calls fail** as `auth` (`AccessDeniedException`): on the laptop, prod answers `fallback_unavailable` where Bedrock is its fallback (the runbook `bedrock-unavailable.md`); on EC2, the Anthropic API keeps answering, inside the ceilings and its cap.
- The model budget's own `model_budget_reached` alert, before or after it (the runbook `aws-budget.md`).

## Impact

- **No Bedrock call succeeds** from either host until you reverse the action. Local answers on the laptop continue; the meter is untouched and stays the control (FR-024).
- The action re-arms itself for the next month.
- Nothing about it can be undone by an agent: IAM is yours.

## Act

In your own terminal, with your SSO session (`pf` your administrator profile).

1. **Write the incident note first.** The constitution's rule: a ceiling's action is reversed only after the note, seven days at most, says why spend reached it.
2. **Record when AWS acted**, from the action's history:

   ```bash
   aws budgets describe-budget-action-histories --account-id "$(aws sts get-caller-identity --query Account --output text --profile "$pf")" --budget-name h4-model-month --profile "$pf" --region us-east-1
   ```

3. **Find the source:** the runbook `aws-budget.md`'s Act.

## Verify

- On the role, the attached policies list `h4-deny-paid-models`:

  ```bash
  aws iam list-attached-role-policies --role-name h4-laptop-bedrock --profile "$pf"
  ```

- After the Undo, the same list is empty, and `make operator-status ENV=prod` shows Bedrock's adapter healthy again within its health interval.

## Undo

After the incident note, reverse the action; this detaches the policy:

```bash
aws budgets describe-budget-actions-for-budget --account-id "$(aws sts get-caller-identity --query Account --output text --profile "$pf")" --budget-name h4-model-month --profile "$pf" --region us-east-1
aws budgets execute-budget-action --execution-type REVERSE_BUDGET_ACTION --account-id "$(aws sts get-caller-identity --query Account --output text --profile "$pf")" --budget-name h4-model-month --action-id <the action's ID, from the line above> --profile "$pf" --region us-east-1
```

For the rehearsal's, the budget is `h4-rehearsal-model`, and the role `h4-rehearsal-target`. Never detach the policy by hand in the console: the action would read as executed while the policy is gone.

## Record

In the incident note and the next merge-request note: the action's history (its times), when each channel got the alert, what spent, and when you reversed it. For the rehearsal, the record tasks.md T040 asks (contracts/aws-alerts.md §4). Never the account's ID or a key.
