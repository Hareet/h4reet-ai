# Runbook: the server budget

`h4-server-month`, AWS's budget on every cost tagged `project = h4reet-ai` but Bedrock's (the account is shared with your other work, whose costs it doesn't count: ADR 0047), at your figure, crossed 70% or 100%; or, from spec 001's group 7, its action stopped EC2. This page covers the alerts `server_budget_warn`, `server_budget_reached`, `server_action_executed`, and `ec2_stopped_server_budget` ([spec 001 contracts/aws-alerts.md §2 and §4](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts)). The budget is `infra/bootstrap/budgets.tf`'s (spec 001 FR-021, FR-022); the server action is group 7's, and its rehearsal, on `h4-rehearsal-server`, is `infra/account/killswitch.tf`'s (FR-026).

## Symptoms

- **A Telegram message** from the alert bridge, and SNS's email:
  - `[hareet.ai aws] server_budget_warn: h4-server-month at …, past … of …`, at 70%;
  - `[hareet.ai aws] server_budget_reached: …`, at 100%;
  - `[hareet.ai aws] server_action_executed: …`, when the action ran: EC2 stopped (from group 7);
  - `[hareet.ai aws] ec2_stopped_server_budget: …`, when the guard stops a start while the action stands (from group 9);
  - with `- rehearsal: yes` for the server rehearsal's $0.01 budget, whose action stops `h4-rehearsal-instance` instead.
- AWS's billing data comes late, by hours.

## Impact

- **A warning** changes nothing.
- **At 100%, from group 7,** the action stops EC2 by Systems Manager's `AWS-StopEC2Instance`: visitors get the laptop if you run it, else `no_host_serving`. The laptop, the tunnel end, the shared state, and the safety net keep running, and the meter stays the control for model spend.
- **The rehearsal's action** stops only `h4-rehearsal-instance`, a `t4g.nano` with nothing on it.

## Act

In your own terminal, with your SSO session (`pf` your administrator profile).

1. **See what costs:** Cost Explorer, Billing console, this month, filtered on the cost-allocation tag `project` = `h4reet-ai`, as the budget counts, then grouped by Service and by the tag `component` (tasks.md T030 activated both). EC2's hours, the volumes, RDS, and the addresses are the usual lines (research.md R-05).
2. **Stop what shouldn't run.** Before group 7 there is no EC2: the account holds the state bucket, the registry, the release bucket, the functions, and the logs, all cents.
3. **Don't raise the figure** to get past an alert: it is your figure, in `~/.config/h4reet-ai/infra/bootstrap.env`, and a change goes through your plan of the bootstrap root.

## Verify

- Cost Explorer's month stops climbing at the rate it did.
- For the rehearsal: the action's history shows the run, and the instance's state is `stopped`:

  ```bash
  a=(--profile "$pf" --region us-east-1)
  t=Name=tag:Name,Values=h4-rehearsal-instance
  s='Reservations[].Instances[].State.Name'
  aws ec2 describe-instances "${a[@]}" \
    --filters "$t" --query "$s"
  ```

## Undo

- An alert changes nothing. The budget resets on the 1st.
- The rehearsal's action: reverse it with `aws budgets execute-budget-action --execution-type REVERSE_BUDGET_ACTION` on `h4-rehearsal-server`, as the runbook `aws-budget-action.md`'s Undo does for the model's, then end the rehearsal (tasks.md T040, step 6).
- The server action itself, from group 7: after the incident note, its own restore, which group 9 adds; until then, the same reverse on `h4-server-month`.

## Record

In the next merge-request note, or an incident note in `docs/incidents/`: the alert's first line, the month's figure against yours, the lines that spent, and what you stopped. For the rehearsal, tasks.md T040's record: when AWS evaluated, when each channel got the alert, the SSM run's status from the action's history, and the instance's state after it. Never the account's ID.
