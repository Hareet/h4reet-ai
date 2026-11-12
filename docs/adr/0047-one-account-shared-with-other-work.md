# ADR 0047: One account, shared with the Author's other work: the credential audit's allowlist, kept out of the repository, and the server budget on the project's tag

Status: proposed, 2026-11-12 · Spec: 001 (FR-008, FR-021, SC-002, SC-004, User Story 1's scenario 5; spec.md Assumptions, "One account, shared with the Author's other work"; tasks.md T150 to T154) · Amends [ADR 0007](0007-one-aws-account.md)'s decision 4, which stands otherwise · Accepted when the Author merges `fix/001-shared-account-p`

## Context

At T030, before the bootstrap's first apply, `make infra-verify ROOT=bootstrap` refused with `credential_finding`. The credential audit found the Author's other work in the account:

- six IAM users holding access keys, one of them `h4reet-runtime`, spec 000's hand-made user;
- a GitHub Actions OIDC provider;
- a deploy role trusting a principal outside the account.

Spec 001 had assumed an account holding only this project. FR-008 lets no identity hold a long-lived credential and no CI identity exist before publication. FR-021's server budget counts "every cost of the account that isn't a model call". In a shared account, the Author's other work would also trip the server budget's action, which stops EC2 (FR-023).

The Author's answers:
- The session asked how to go, offering a new account for this project (recommended), cleaning this account, or sharing it. His answer: **"Share it, scope the checks"**.
- Asked whether `h4reet-runtime`, this project's own user, should be allowed or deleted: **"Allow it too"**.
- Asked whether the identities' names may stand in the repository, which becomes public: **"Keep them out of the repo"**.

## Decision

1. **One account stays,** shared with the Author's other work. The constitution's Cloud standard, "one AWS account. Environments are separated by VM, IAM role, cost-allocation tag, and budget", holds as written.
2. **The credential audit reads the Author's allowlist,** one `<finding kind> <name>` a line, kept out of the repository:
   - **Where it lives:** in his terminal, `~/.config/h4reet-ai/infra/iam-allow.txt`, which agent sessions can't read. In the weekly function, his SecureString `/h4reet/audit/IAM_ALLOW` under the AWS-managed `aws/ssm` key. The function's environment names it, and its role may read that one parameter.
   - **What it does:** a finding it names moves to the result's `allowed` list. It's shown on every run, in the terminal and in the stored weekly result, but it doesn't fail.
   - **What it can allow:** only four kinds, `iam_user_present`, `iam_user_access_key`, `oidc_provider_present`, and `role_foreign_trust`, and never this project's own names (`h4-…`, or an Identity Center role, `AWSReservedSSO_…`). The root's keys, the laptop's identity, and the handover's policies stay strict.
   - **A bad line:** any other line is itself a finding, `allowlist_entry_refused`, named by its line number, never its text.
   - **Fails closed:** no file, or no parameter, means no allowlist.
3. **`h4-server-month` and its rehearsal `h4-rehearsal-server` count every cost tagged `project = h4reet-ai` but Bedrock's services.** That's two `and` terms of the `filter_expression`. This replaces ADR 0007's decision 4, "the server budget on every other cost". Because the rehearsal uses the same filter, tripping it proves the real budget reads this project's spend. The model budgets are unchanged: they're on Bedrock's services, and the other work calls no Bedrock today.
4. **The three Terraform files are protected:** `budgets.tf`, `killswitch.tf`, and `iam.tf`. They change only by the Author's patch, P-S1. His allowlist isn't in the repository at all.

## Alternatives considered

- **A new account for this project** (an AWS Organizations member account): every check stays as spec 001 wrote it. Not chosen. It needs Identity Center and Bedrock set up again for the new account, and a new bootstrap plan.
- **Cleaning this account:** removes the other work's deploy role and OIDC provider, which that work uses. Not chosen.
- **The allowlist in the repository:** simplest, with a test pinning it to his answer. Not chosen, since the names of key-holding users would be public.

## Consequences

- **Named deviations** (spec.md Assumptions):
  - the constitution's Principle IV, "Cloud access is short-lived and identity-based";
  - FR-008, SC-004, and User Story 1's scenario 5: the listed identities keep their long-lived keys, and an OIDC provider exists before publication;
  - FR-021 and SC-002: the project's tagged costs, not the account's;
  - spec 000's FR-013: `h4reet-runtime` keeps its keys.
- **Least privilege across projects rests on IAM alone.** An allowed identity whose policies reach this project's resources could change them. The audit doesn't read their policies, so keeping them narrow is the Author's, by hand.
- **The allowlist allows a key by name, active or not.** If `h4reet-runtime`'s key, which spec 000 recorded as removed, is in fact only inactive, reactivating it changes nothing the audit says.
- **The list lives in two places**, his file and his parameter. They're the same lines, kept in step by him. The repository can't check that.
- **A cost the tag doesn't carry isn't counted:** an untagged resource, or a charge AWS doesn't attribute to a tag. EC2's volumes and public address must carry it (T154). The tag counts only once it's an active cost-allocation tag (T030), and only from then on. The anomaly monitor still watches the whole account.
- **To confirm:**
  - at the plan, that the provider takes `and` holding a nested `not`, and `and` holding `tags`;
  - after the apply, that Cost Explorer filtered on the tag shows the project's costs, and that `h4-server-month`'s actual matches. If the budget reads $0 while Cost Explorer doesn't, the key may want `user:project`.

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) (Assumptions) · Research: [R-22](../../specs/001-cloud-elevation/research.md#r-22-the-budgets-and-the-two-automatic-actions-changed) · Note: [2026-11-12-fix-001-shared-account.md](../merge-requests/2026-11-12-fix-001-shared-account.md)
- Related: [ADR 0007](0007-one-aws-account.md) (decision 4 amended), [ADR 0008](0008-terraform-reviewed-plans-recorded-apply.md).
