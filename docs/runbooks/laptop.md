# Runbook: the laptop's prod

What the laptop's prod needs from the account, as spec 001 builds it, group by group. From group 4: its Bedrock profile, which chains from the runtime user's SSO session to `h4-laptop-bedrock`, the ordinary role the model action's deny attaches to (spec 001 FR-013, FR-023; research.md R-15; disclosure row F2). Groups 5 and 6 add the tunnel and the shared state. This page is for the cutover to that profile, and for Bedrock failing on the laptop after it.

## Symptoms

- **After group 4's apply** (tasks.md T040, step 2): the permission set allows only `sts:AssumeRole` on `h4-laptop-bedrock`, so the profile must assume that role, or prod's Bedrock calls fail as `auth` once spec 000's hand-made policy is detached.
- **Preflight P19 refuses** `make up ENV=prod` with "the h4reet-bedrock profile assumes a role, which must be h4-laptop-bedrock", "source_profile names no profile", or "source_profile assumes a role too".
- **`fallback_unavailable`** on the laptop with `auth` calls (the runbook `bedrock-unavailable.md`), after the cutover.

- **From group 5, the tunnel** (the section below): preflight's P22 refuses `make up ENV=prod` while `COMPOSE_PROFILES` adds `tunnel` and the tunnel lacks its part: "TUNNEL_END_ADDRESS isn't the tunnel end's public IPv4 address", "RELAY_TOKEN_SELF isn't a token's shape", "H4_TUNNEL_DIR isn't a folder only its owner can open", "id_ed25519 in H4_TUNNEL_DIR is missing or others can read it", or "known_hosts in H4_TUNNEL_DIR doesn't pin the tunnel end's one host key". P4 refuses with "missing H4_TUNNEL_DIR, RELAY_TOKEN_SELF, TELEMETRY_BLOCK_TOKEN, TUNNEL_END_ADDRESS" until `make init-env ENV=prod SYNC=1` adds them.

## Impact

- While prod's route names the Anthropic API as its fallback, as `config/routing.yaml` on `main` does (spec 010's T059), the laptop's gateway calls no Bedrock, and P19 doesn't read the profile: it matters to a route back to Bedrock, and to your live runs on it (`make redteam-live ADAPTER=bedrock ENV=prod`).
- While the profile is wrong and the route names Bedrock, prod on the laptop answers locally only; its Bedrock fallback is down. Prod on EC2 isn't affected.
- The `credentials_expiring` warning keeps working: the gateway reads the session's end from the source profile (`services/gateway/src/adapters/bedrock-converse.ts`).

- **Without the tunnel,** the laptop's prod answers on its own `127.0.0.1` as before, and nothing in the cloud reaches it: once the relay exists (group 8), it serves EC2, or answers `no_host_serving`. The tunnel profile is yours to add; nothing adds it for you.

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

3. **Sign in as the runtime user,** never as yourself, and check the role. `make aws-login ENV=prod` follows the chain and starts `h4reet-bedrock-sso`'s session in `aws-home`, where prod's gateway reads it; never `PROFILE=…`, which is your own `~/.aws`:

   ```bash
   make aws-login ENV=prod
   h=~/.config/h4reet-ai/aws-home
   HOME="$h" aws sts get-caller-identity \
     --profile h4reet-bedrock
   ```

   Its `Arn` names `assumed-role/h4-laptop-bedrock/h4reet-laptop`, and no paid call is made.
4. **Start prod**, `make up ENV=prod`: preflight P19 passes with the chained profile.
5. **Then detach spec 000's hand-made policy** from the permission set, once, by hand (tasks.md T040, step 2): IAM Identity Center, Permission sets, the laptop's set, Permissions, the customer-managed policy `h4reet-ai-cloud`, Detach; then provision the set to the account. From then on the set holds only what `infra/account/iam.tf` defines.

### The tunnel (group 5)

The laptop's end of the tunnel, the `tunnel` service in prod's `tunnel` profile, dials the tunnel end's Elastic IP and holds the five forwards (spec 001 contracts/tunnel.md §3). After W1's applies, prod's among them, in your own terminal:

1. **The new keys in your env file.** `make init-env ENV=prod SYNC=1` adds `TUNNEL_END_ADDRESS`, `H4_TUNNEL_DIR`, `RELAY_TOKEN_SELF`, and `TELEMETRY_BLOCK_TOKEN`, the last three empty, and `make init-env ENV=dev SYNC=1` adds dev's `H4_TUNNEL_DIR`, a stand-in folder.
2. **The keys and tokens:** `make tunnel-keys PROFILE=h4reet-admin`. It writes the tunnel end's parameters, keeps the client's key and the pinned host key in `~/.config/h4reet-ai/tunnel/client/`, and fills the four keys above, the address from `/h4reet/prod/tunnel-end-address`.
3. **Check them:** `make secrets-check PROFILE=h4reet-admin` lists the tunnel end's names present.
4. **The profile:** in `~/.config/h4reet-ai/env/prod.env`, set `COMPOSE_PROFILES=gpu,tunnel`.
5. **Start it:** `make up ENV=prod`. Preflight's P22 checks the address, the key, the pinned host key, and the tokens, naming what's missing and never a value; then the `tunnel` service connects, and the dashboard's "Tunnel up" reads `up` for `laptop`.

To take the laptop off the tunnel, set `COMPOSE_PROFILES=gpu` again and `make up ENV=prod`; to close the tunnel from the cloud's side, `make tunnel-revoke PROFILE=h4reet-admin` (the runbook `tunnel-end.md`).

### The shared state (group 6)

From the move (spec 001 tasks.md T080), the laptop's prod keeps no meter of its own: its gateway uses the shared state on the tunnel end, `tunnel:5432` through the tunnel, with TLS verified by the shared state's own CA ([shared-state.md](shared-state.md)). So:

1. **The new keys in your env file.** `make init-env ENV=prod SYNC=1` adds `H4_HOST=laptop`, and `GATEWAY_DB_URL`, `GATEWAY_DB_TLS_SERVERNAME`, and `GATEWAY_DB_TLS_CA`, empty; `make init-env ENV=dev SYNC=1` adds dev's `H4_HOST`. While `GATEWAY_DB_URL` is empty, prod keeps its own `gateway-state`, and preflight's P23 warns of it.
2. **The CA certificate and the name:** `make shared-state-tls PROFILE=h4reet-admin` fills `GATEWAY_DB_TLS_CA` and `GATEWAY_DB_TLS_SERVERNAME`.
3. **The cutover, the move's last step:** set `GATEWAY_DB_URL=postgres://gateway@tunnel:5432/h4reet?sslmode=verify-full` and `GATEWAY_DB_PASSWORD` to the shared state's `gateway` password, keep the `tunnel` profile, and `make up ENV=prod`. P23 then checks the URL, its TLS, and the profile, naming what's missing and never a value.

**Prod needs the network from then on.** A laptop that can't reach the tunnel end can't read the shared state, so prod answers degraded, local answers included: unknown is degraded (FR-019). An offline demo runs `make up ENV=dev`, whose meter is its own (plan Q4).

## Verify

- `make up ENV=prod` passes preflight, and `make operator-status ENV=prod` shows Bedrock's adapter healthy, with the session's end.
- `make infra-audit PROFILE=h4reet-admin` reports no `laptop_permission_set_too_broad`, once the session names the set in the audit (the merge-request note's follow-up).

- **The tunnel:** "Tunnel up" reads `up` for both ends on the dashboard's Hosts row, and the tunnel's own log shows no new "trying again" line.

## Undo

Before step 5, put the old profile back: remove the new `[profile h4reet-bedrock]` and rename `[profile h4reet-bedrock-sso]` back. After step 5 the set allows only the assume, so the chained profile is the only one that works; the way back is a reviewed change to `infra/account/iam.tf`, by your patch.

## Record

In the next merge-request note, or group 4's apply record: the profile's form as it worked, the `sts get-caller-identity` role name (never the account's ID), P19's line, and when you detached the hand-made policy.
