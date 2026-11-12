# ADR 0049: What names an instance lives in that instance's root: the server action, a model action for EC2, the failover's alarm, and the instance rules move to `infra/prod`

Status: proposed, 2026-11-12 · Spec: 001 (FR-001, FR-023, FR-065, FR-071, FR-072, SC-005; spec.md Assumptions, "The roots, amended"; plan.md §16, "No root holds another root's instance or health-check ID"; research.md R-02, R-15, R-22, amended; contracts/aws-alerts.md §4 and contracts/handover.md §2, amended; tasks.md T046, T084, T097, T119, T180) · Amends [ADR 0007](0007-one-aws-account.md)'s decision 2, which stands otherwise · Accepted when the Author merges spec 001's W1 (tasks.md T172)

## Context

ADR 0007's decision 2 gives each root its share: `infra/bootstrap` the state bucket, the budgets, the anomaly monitor, and the alert topic; `infra/account` "the budget actions, the AWS-side functions, the handover's functions, the registry"; `infra/prod` "the network, the tunnel end, RDS, EC2, the edge".

The Author's answers of 2026-11-11 set spec 001's four gates: "Let's do the least amount of gates as possible", then "4 gates in all (Recommended)". A plan block is made before its gate, and the gate before its applies. W1's regrouping found that the account root, as designed, held prod's IDs:
- the server action's instance;
- the four instance rules' filters;
- the failover alarm's health check.

That broke two things:
1. **W1's plans.** The account's block would read instances that prod's apply, in the same gate, hadn't yet made (tasks.md T055, T093, T129).
2. **SC-005's destroy-and-recreate of EC2, and the tunnel end's move to another zone.** After a replace, the account's references would point at a gone instance. Only a second account plan, made after the replace's apply, could mend them, and no gate can hold that plan (tasks.md T097).

W1's review also found a gap in FR-023: from W1's prod apply until W2, `h4-prod-gateway` would hold `bedrock:InvokeModel*` that no model action reaches.

## Decision

1. **No root holds another root's instance or health-check ID.** Between roots, a reference is a fixed name: a function's, a rule's, an alarm's, a role's, a budget's, a topic's, a parameter's.
2. **These move to `infra/prod`,** beside what they name, in protected files:
   - the server action on `h4-server-month`, by the budget's name, with its own execution role (`killswitch.tf`);
   - a second model action on `h4-model-month`, by its name, attaching `h4-deny-paid-models` to `h4-prod-gateway`, with its own execution role (`killswitch.tf`), made in the same apply as the role;
   - `h4-laptop-away`, the failover's alarm (`failover.tf`);
   - `h4-ec2-spot-warning`, `h4-ec2-running`, `h4-tunnel-end-spot-warning`, and `h4-tunnel-end-running` (`handover.tf`);
   - `/h4reet/prod/ec2-instance-id`, a String parameter holding EC2's ID, which the functions read by its name at run time (`handover.tf`).
3. **`infra/account` keeps:**
   - the model action on `h4-laptop-bedrock`;
   - the AWS-side functions, and the start function and the guard, with their roles and permissions;
   - the autostart switch;
   - `h4-laptop-away-rule`, matching the alarm by its name;
   - the hours' schedules (ADR 0048);
   - the registry, the release bucket, and the rehearsals.
4. **`infra/prod`'s RDS** is replaced by the tunnel end's `shared-state` service, its data volume, and its backups' bucket (ADR 0024's decision 1, as amended on 2026-11-11).
5. **Decision 2's other parts stand:** environments by root, never by workspace, and each root with its own state key.

## Alternatives considered

- **Keep the IDs in the account, behind W2's switch:** it makes W1's plans possible, but leaves the replace impossible. Not chosen.
- **Rules that match every instance, filtered in a function:** no ID at all, but the spot warnings, which go straight to `h4-alerts`, would alert on the Author's other work's instances in this shared account (ADR 0047). Not chosen.
- **The account's model action gains `h4-prod-gateway` behind the switch, in W2:** fewer actions, but FR-023 doesn't reach EC2's role from W1's apply until W2's. Not chosen; it is the fallback if one budget may not hold two actions of a type (to confirm in W1's prod apply: a plan never calls Budgets).

## Consequences

- **A replace is planned and applied in one root.** EC2's replacement for SC-005 is W2's `local.ec2_generation` from 1 to 2, and its plan updates the server action, the rules, and the parameter with it.
- **R-02's reason holds:** the functions and their IAM still don't share a root with the instances they act on. A plan of `infra/prod` can widen a budget action or a rule only through the protected files, so only by the Author's patch.
- **Three budget actions,** on the same two action-enabled budgets, so AWS Budgets' free actions are unchanged (research.md R-05, to confirm).
- **Each function's role reads by name:** the alarm's name-built ARN, the parameter's path, and the budget's name. Route 53's health checks can't be scoped by tag, so neither function reads one (research.md R-15, amended).
- **To confirm:**
  - in W1's prod apply, not its plan, which never calls Budgets, that a budget may hold two `APPLY_IAM_POLICY` actions, with the step for an apply that fails there in `docs/runbooks/aws-budget-action.md`, "A partly failed apply";
  - in W2's apply, that EventBridge takes a target whose function the account's apply makes after it (plan.md §16, W2's order).

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) (Assumptions) · Plan: [§16](../../specs/001-cloud-elevation/plan.md#16-order-of-work-risks-and-proof) · Research: [R-02](../../specs/001-cloud-elevation/research.md#r-02-terraform-pinned-in-three-roots-changed), [R-22](../../specs/001-cloud-elevation/research.md#r-22-the-budgets-and-the-two-automatic-actions-changed) · Note: [2026-11-13-spec-001-w1-regroup.md](../merge-requests/2026-11-13-spec-001-w1-regroup.md)
- Related: [ADR 0007](0007-one-aws-account.md) (decision 2 amended), [ADR 0024](0024-the-shared-state-in-rds.md), [ADR 0027](0027-ec2-on-spot-the-start-function-and-the-guard.md), [ADR 0047](0047-one-account-shared-with-other-work.md), [ADR 0048](0048-ec2-on-12-hours-a-day.md).
