# Runbook: the laptop's prod

What the laptop's prod needs from the account, as spec 001 builds it, group by group. From group 4: its Bedrock profile, which chains from the runtime user's SSO session to `h4-laptop-bedrock`, the ordinary role the model action's deny attaches to (spec 001 FR-013, FR-023; research.md R-15; disclosure row F2). Groups 5 and 6 add the tunnel and the shared state. This page is for the cutover to that profile, and for Bedrock failing on the laptop after it.

## Symptoms

- **After group 4's apply** (tasks.md T040, step 2): the permission set allows only `sts:AssumeRole` on `h4-laptop-bedrock`, so the profile must assume that role, or prod's Bedrock calls fail as `auth` once spec 000's hand-made policy is detached.
- **Preflight P19 refuses** `make up ENV=prod` with "the h4reet-bedrock profile assumes a role, which must be h4-laptop-bedrock", "source_profile names no profile", or "source_profile assumes a role too".
- **`fallback_unavailable`** on the laptop with `auth` calls (the runbook `bedrock-unavailable.md`), after the cutover.

## Impact

- While the profile is wrong, prod on the laptop answers locally only; its Bedrock fallback is down. Prod on EC2 isn't affected.
- The `credentials_expiring` warning keeps working: the gateway reads the session's end from the source profile (`services/gateway/src/adapters/bedrock-converse.ts`).

## Act

In your own terminal, on `main` after group 4's apply.

1. **Keep the SSO profile under a new name.** In `~/.config/h4reet-ai/aws-home/.aws/config`, rename `[profile h4reet-bedrock]` to `[profile h4reet-bedrock-sso]`, keeping its lines (its `sso_session` or `sso_start_url`, `sso_region = us-east-1`, the account, and the permission set's name as `sso_role_name`).
2. **Add the profile prod uses**, which assumes the role from it (the form to confirm with your CLI, the AWS CLI 2.29.1 on the record):

   ```ini
   [profile h4reet-bedrock]
   role_arn = arn:aws:iam::<the account>:role/h4-laptop-bedrock
   source_profile = h4reet-bedrock-sso
   role_session_name = h4reet-laptop
   region = us-east-1
   ```

3. **Sign in as the runtime user,** never as yourself, and check the role:

   ```bash
   make aws-login PROFILE=h4reet-bedrock-sso
   HOME="$HOME/.config/h4reet-ai/aws-home" aws sts get-caller-identity --profile h4reet-bedrock
   ```

   Its `Arn` names `assumed-role/h4-laptop-bedrock/h4reet-laptop`, and no paid call is made.
4. **Start prod**, `make up ENV=prod`: preflight P19 passes with the chained profile.
5. **Then detach spec 000's hand-made policy** from the permission set, once, by hand (tasks.md T040, step 2): IAM Identity Center, Permission sets, the laptop's set, Permissions, the customer-managed policy `h4reet-ai-cloud`, Detach; then provision the set to the account. From then on the set holds only what `infra/account/iam.tf` defines.

## Verify

- `make up ENV=prod` passes preflight, and `make operator-status ENV=prod` shows Bedrock's adapter healthy, with the session's end.
- `make infra-audit PROFILE=h4reet-admin` reports no `laptop_permission_set_too_broad`, once the session names the set in the audit (the merge-request note's follow-up).

## Undo

Before step 5, put the old profile back: remove the new `[profile h4reet-bedrock]` and rename `[profile h4reet-bedrock-sso]` back. After step 5 the set allows only the assume, so the chained profile is the only one that works; the way back is a reviewed change to `infra/account/iam.tf`, by your patch.

## Record

In the next merge-request note, or group 4's apply record: the profile's form as it worked, the `sts get-caller-identity` role name (never the account's ID), P19's line, and when you detached the hand-made policy.
