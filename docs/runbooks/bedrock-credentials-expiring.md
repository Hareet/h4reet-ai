# Runbook: the Bedrock SSO session is expiring

Prod's gateway calls Bedrock as the dedicated runtime identity, through that identity's SSO session, which `make aws-login` puts in `~/.config/h4reet-ai/aws-home/.aws` and the gateway mounts read-only as its own `~/.aws` ([research.md R-17](../../specs/000-local-foundations/research.md#r-17-the-runtime-aws-identity-the-author-narrowed-by-the-plan)). IAM Identity Center ends the session on its own schedule, and only you can start a new one. This page covers the `credentials_expiring` alert ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-013, FR-022, FR-032; plan §5.2; [contracts/provider-adapter.md §3.2](../../specs/000-local-foundations/contracts/provider-adapter.md#32-bedrock-converse-type-bedrock-converse).

## Symptoms

- **The alert**, on Telegram and by email: "CREDENTIALS EXPIRING: the Bedrock SSO session ends at <time>", id `prod:credentials_expiring:bedrock:<session end, YYYY-MM-DDTHH:MMZ>`, with the sentence "Fallback to Bedrock stops then. Run make aws-login in your terminal." It comes 2 h before the session ends (`credentials_warn_before_s`, 7,200 s, on the `bedrock` adapter in `config/routing.yaml`), once for each session end. That needs a legacy profile, whose token cache records the session's end. With an `sso_session` profile the cache records only the access token's end, so the gateway knows no session end and this alert never comes: the first sign is `fallback_unavailable` with `credentials`, once the session has ended (the runbook `bedrock-unavailable.md`). Which kind prod uses is the Author's choice at T105.
- **`make operator-status ENV=prod`**: the adapters line reads `bedrock healthy, SSO session ends <time>`; with an `sso_session` profile it names no end.
- **The gateway's log** has a `credentials.expiring` record with the adapter and `expires_at`.
- **Only prod.** The other stacks route no paid adapter and mount the empty `deploy/aws-none` ([contracts/alerts.md §2](../../specs/000-local-foundations/contracts/alerts.md#2-kinds-triggers-and-dedupe-keys), "Outside prod").

## Impact

- **Nothing yet.** Bedrock still serves, local answers are unaffected, and so are the meter, the ceilings, and the sub-budget.
- **When the session ends,** the gateway can't get new role credentials. Once the ones it holds expire, Bedrock's health turns `credentials`, and the `fallback_unavailable` alert follows (the runbook `bedrock-unavailable.md`). From then on, if the local model goes down, hello answers 503 with `fallback_unavailable` instead of falling back.
- **The gateway never renews the session itself.** With an `sso_session` profile, the SDK refreshes the SSO token from its last 5 minutes on, through `oidc.us-east-1.amazonaws.com` (plan §5.2's correction), and uses the fresh token for one exchange of role credentials. Its write back to the read-only mount fails, so the session in the cache stays as it was. Once the session has ended, it asks again at most every 30 s with the dead refresh token, until the next login. With a legacy profile nothing is refreshed. Either way, only `make aws-login` writes a new session.

## Act

In your own terminal. Agent sessions can't read `~/.config/h4reet-ai`, and `make aws-login` refuses inside the sandbox.

1. **Start a new session:**

   ```bash
   make aws-login
   ```

   It runs `aws sso login --profile h4reet-bedrock` with `HOME` set to `~/.config/h4reet-ai/aws-home`, and without your shell's `AWS_*` variables, so the session lands in the cache prod's gateway mounts, never in your own `~/.aws`. The AWS CLI opens the sign-in page in your browser; if it can't, it prints the URL to open.
2. **Sign in as the runtime identity's user** (`h4reet-runtime`, if that is the name you confirmed at T105), never as yourself. An SSO session can fetch credentials for every permission set its user holds, so a session of yours in that cache would hand any gateway build your whole AWS access (research.md R-17).
3. **If it refuses** (exit 2), its message says why:
   - **the directory is missing:** `make init-env ENV=prod` creates `~/.config/h4reet-ai/aws-home/.aws`, mode 0700. Once prod's env file exists, add `SYNC=1`, which only appends the keys the template gained;
   - **a mode other than 0700:** `chmod 700` the directory it names;
   - **a symbolic link:** make it a real directory. A link would put the session, and prod's mount, wherever it points;
   - **no `[profile h4reet-bedrock]`:** configure the profile once, as quickstart.md [§0.6](../../specs/000-local-foundations/quickstart.md#06-the-runtime-aws-identity-fr-013), step 4, does:

     ```bash
     HOME="$HOME/.config/h4reet-ai/aws-home" aws configure sso --profile h4reet-bedrock   # region us-east-1; the runtime user's portal
     ```

   - **no aws CLI on PATH:** install the AWS CLI v2.
4. **If the sign-in fails** (exit 1), the AWS CLI's own message above it says why, such as a sign-in that timed out or was declined. Run `make aws-login` again.
5. **Never copy** anything from `~/.config/h4reet-ai/aws-home/.aws/sso/cache`, or the sign-in's code, into a note, a command, or a chat: the cache holds the session's tokens.

## Verify

- Within about 10 s, the health check's cadence ([contracts/provider-adapter.md §3.2](../../specs/000-local-foundations/contracts/provider-adapter.md#32-bedrock-converse-type-bedrock-converse)), `make operator-status ENV=prod` shows `bedrock healthy, SSO session ends <time>`, with the new end (with an `sso_session` profile, `bedrock healthy` and no end).
- The dashboard's "Model-server health" shows `adapter bedrock` up.
- The alert you got doesn't come again, since its id names the old end. With a legacy profile, the next `credentials_expiring` comes 2 h before the new one.

## Undo

- Nothing to undo: a login replaces the session in the runtime identity's own cache and changes nothing else.
- If you signed in as yourself by mistake, end that session at once, then sign in again as the runtime user:

  ```bash
  HOME="$HOME/.config/h4reet-ai/aws-home" aws sso logout
  make aws-login
  ```

## Record

In the next merge-request note, or in an incident note in `docs/incidents/` when Bedrock lapsed while prod needed it, or a session other than the runtime user's reached the cache: when the alert came, when you logged in, the new session end as `make operator-status ENV=prod` shows it, and whether `fallback_unavailable` fired. Never the account ID, the portal URL, the sign-in's code, or anything from the SSO cache (quickstart.md §0.6).
