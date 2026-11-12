# Runbook: a credential finding

The credential audit found an identity that holds a long-lived credential, or one of this spec's identities wider than Terraform writes it. This page covers the alert `credential_finding` ([spec 001 contracts/aws-alerts.md §2](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts); [contracts/infra-records.md §4](../../specs/001-cloud-elevation/contracts/infra-records.md#4-the-credential-audit-fr-008-sc-004)). The audit is `infra/lambdas/credential_audit/audit.py`: weekly as `h4-credential-audit` (`infra/account/alerts.tf`'s schedule), and in your terminal by `make infra-audit` and before every apply by `make infra-verify` (spec 001 FR-008, FR-013; SC-004).

## Symptoms

- **A Telegram message** from the alert bridge, and SNS's email: `[hareet.ai aws] credential_finding: <n> findings`, one line a finding, `- <check>: <name>`, where the check is one of:
  - `iam_user_access_key`: an IAM user holds an access key, active or not;
  - `root_access_key`: the root user holds one;
  - `role_foreign_trust`: a role trusts a principal outside the account, its services, and its Identity Center;
  - `oidc_provider_present`: an OIDC provider exists, before publication;
  - `laptop_identity_not_terraform`: `h4-laptop-bedrock`, or the laptop's Bedrock permission set, isn't Terraform's;
  - `laptop_permission_set_too_broad`: that set holds anything but `sts:AssumeRole` on `h4-laptop-bedrock`;
  - `handover_policy_too_broad`: a start, guard, or stop policy reaches more than the tagged instance (from group 9).
- **`make infra-verify` refuses** with `credential_finding`, and so no apply can start.
- The weekly result is in the release bucket, under `audits/credential/<date>.json`.

## Impact

- A long-lived key is the one credential no session ends: the constitution's Principle IV holds none. Until the finding is gone, no apply runs, so no plan of yours can make it worse.
- No visitor sees anything.

## Act

In your own terminal, with your SSO session. Run the same audit, which prints the findings as JSON:

```bash
make infra-audit PROFILE=h4reet-admin
```

Then, by check:

- **`iam_user_access_key`, `root_access_key`:** delete the key in the console (IAM, the user, Security credentials). If something used it, that thing moves to a short-lived identity first.
- **`role_foreign_trust`, `oidc_provider_present`:** if Terraform made it, the plan that did is in a merged note; otherwise remove it in the console, and find out who made it.
- **`laptop_identity_not_terraform`, `laptop_permission_set_too_broad`:** the set or the role was changed outside Terraform. Its next plan, `make plan ROOT=account`, shows the drift; apply the reviewed plan to put it back. Spec 000's hand-made customer-managed policy on the set is detached once, at the cutover (tasks.md T040; the runbook `laptop.md`).

## Verify

`make infra-audit PROFILE=h4reet-admin` exits 0, with `"clean": true` and no finding; `make infra-verify` passes its `credential_finding` step.

## Undo

Nothing to undo: removing a key or a stray trust is the fix. A key you deleted can't come back; a new identity, if you need one, is a Terraform change.

## Record

In an incident note in `docs/incidents/` for any key or trust you didn't make, and in the next merge-request note otherwise: the check, the identity's name, when it appeared if you can tell, and what you did. Never a key's ID or the account's ID.
