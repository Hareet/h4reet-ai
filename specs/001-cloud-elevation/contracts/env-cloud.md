# Contract: each host's environment, `H4_HOST`, the profiles, and routing's schema 2

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/env-cloud.md` at 00309c47), whose `cloud` stack name this design drops: both serving hosts run `H4_STACK=prod`. It amends spec 000's contracts/env-files.md by name. Research: R-27, R-28, R-26.

## 1. The files

| Host | Env file | Written by | Secrets in it |
|---|---|---|---|
| The laptop | `~/.config/h4reet-ai/env/prod.env` (spec 000's) | the Author | as today, plus `GATEWAY_DB_URL`, the gateway's and `grafana_ro`'s passwords for the shared state, the relay block's token, the telemetry block's token, and the sink's token |
| EC2 | `/run/h4reet/ec2.env`, on tmpfs, mode 0600 | `deploy/scripts/write_env.py` at boot, from Parameter Store `/h4reet/ec2/*` and the String parameters Terraform writes | the Anthropic key, Telegram's and SMTP's credentials, the shared state's passwords, its relay block's token, the sink's token |
| The tunnel end | `/run/h4reet/tunnel-end.env`, on tmpfs | `write_env.py`, from `/h4reet/tunnel-end/*` | the host key, the authorized key, the relay's two host tokens, the sink's token, the telemetry block's token, `relay_ro`'s and `relay_rw`'s passwords |

`write_env.py` refuses to start the stack while an expected name is missing, naming it, never a value. `make secrets-check` (the Author) lists which names exist, by name and type only.

## 2. Keys per host (amending spec 000's env-files.md §2)

| Key | Laptop prod | EC2 | Tunnel end | dev | dev-cpu | Checked |
|---|---|---|---|---|---|---|
| `H4_HOST` (new) | `laptop` | `ec2` | `tunnel-end` | `laptop` | `laptop` | preflight; the gateway (exit 78); on EC2, `write_env.py` and preflight confirm the IMDSv2 tag `h4-prod-ec2` |
| `H4_STACK` | `prod` | `prod` | `prod` | `dev` | `dev-cpu` | spec 000's rule, unchanged |
| `H4_ENV` | `prod` | `prod` | `prod` | `dev` | `dev` | unchanged |
| `COMPOSE_PROFILES` | spec 000's, plus `tunnel` | `ec2` | `tunnel-end` | spec 000's, plus `dev-relay` | spec 000's, plus `dev-relay` | preflight, per class (§3) |
| `GATEWAY_DB_URL` (new) | `postgres://gateway@tunnel:5432/h4reet` | `postgres://gateway@<rds-endpoint>:5432/h4reet` | — | unset (local `gateway-state`) | unset | preflight: on prod, TLS required and the local store refused |
| `GATEWAY_DB_TLS_SERVERNAME` (new) | `<rds-endpoint>` | `<rds-endpoint>` | — | — | — | preflight |
| `RELAY_TOKEN_SELF` (new) | the laptop's | EC2's | — | — | — | the relay block |
| `RELAY_TOKEN_LAPTOP`, `RELAY_TOKEN_EC2` (new) | — | — | both | — | — | the relay |
| `SNAPSHOT_SINK_TOKEN` (new) | the publisher's | the publisher's | the sink's | — | — | the sink (contracts/public-view.md §1) |
| `TELEMETRY_BLOCK_TOKEN` (new) | the telemetry block's | — | the collector's | — | — | the laptop's 8086 block (contracts/tunnel.md §4) |
| `GATEWAY_ANTHROPIC_API_KEY` | as spec 010 | from Parameter Store | — | absent | absent | spec 010's preflight |

The ports keep spec 000's prod values on both serving hosts (18000 to 18005): different machines, the same numbers. On EC2 they bind its loopback, for the operator's session; its relay block binds its private address (contracts/tunnel.md §4). The tunnel end's relay listener binds its private address, and its internal listener `127.0.0.1:18505`.

## 3. Profiles and services by class

| Service | Laptop prod | EC2 | Tunnel end | dev, dev-cpu |
|---|---|---|---|---|
| `edge`, `web`, `gateway`, `otel-collector`, Prometheus, Loki, Grafana, Langfuse and its four stores | yes | yes | no | yes |
| `model-server-gpu` / `-cpu` | gpu | **no** | no | gpu / cpu |
| `gateway-state` | no (prod's meter is the shared state) | no | no | yes |
| `tunnel` | yes (`tunnel`) | no | no | no |
| `snapshot-publisher` | yes | yes | no | no |
| `tunnel-end`, `relay`, `snapshot-sink` | no | no | yes | `relay` only, in `dev-relay` |
| the tunnel end's small `otel-collector` | no | no | yes | no |
| `telegram-standin`, `mailpit`, `breach-probe` | no | no | no | as spec 000 |

Preflight's rule "not exactly one of `gpu` and `cpu`" becomes: exactly one, except for the `ec2` and `tunnel-end` classes, which select neither.

## 4. Routing's schema 2 (`config/routing.yaml`; data-model.md §2.1)

```yaml
schema: 2
envs:
  prod:
    hosts:
      laptop: { primary: local, fallback: anthropic }   # as main's prod route names it
      ec2:    { first: anthropic, second: bedrock }     # the Author's line, in group 7
  dev: { primary: local, fallback: synthetic }
```

The gateway selects `envs.prod.hosts.<H4_HOST>` on prod. It refuses with exit 78:
- a route against R1 as amended;
- `H4_HOST=ec2` while `envs.prod.hosts.ec2` is missing (`route_missing`);
- `H4_HOST=ec2` with a `primary`;
- `H4_HOST=laptop` with a `first`;
- a paid adapter missing its price, cap, or key (spec 010).

## 5. FR-011's deny list grows (the guard patch, plan §2)

- **Names:** `GATEWAY_DB_URL`, `GATEWAY_DB_TLS_SERVERNAME`, `RELAY_TOKEN_*`, `SNAPSHOT_SINK_TOKEN`, `TELEMETRY_BLOCK_TOKEN`, `DB_*_PASSWORD`, `TF_VAR_*`, `AWS_*`, and `TF_CLI_ARGS*`, each with its own matrix row. The sandbox takes names, so each family is denied by its members': `RELAY_TOKEN_SELF`, `RELAY_TOKEN_LAPTOP`, `RELAY_TOKEN_EC2`; `DB_GATEWAY_PASSWORD`, `DB_GRAFANA_RO_PASSWORD`, `DB_RELAY_RO_PASSWORD`, `DB_RELAY_RW_PASSWORD` (contracts/shared-state.md §2's roles); `TF_VAR_alert_email`, `TF_VAR_state_bucket_suffix`, `TF_VAR_server_budget_usd`, and, from group 3's review (T028, B3), `TF_VAR_bedrock_service_names`, whose deny by name P-1 adds (e173a043) (contracts/infra-records.md §1; the Author may write its value before P-1 lands, since the file sits under `~/.config/h4reet-ai/`, which spec 000's `Read(~/.config/h4reet-ai/**)` deny already keeps from agent sessions); `TF_CLI_ARGS` and its forms for init, plan, apply, destroy, import, refresh, state, taint, test, and workspace; and the AWS names spec 000's list lacked (`AWS_SECURITY_TOKEN`, `AWS_DEFAULT_PROFILE`, `AWS_ROLE_SESSION_NAME`, `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`, `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE`, `AWS_BEARER_TOKEN_BEDROCK`). A new member gets its deny in the patch that names it.
- **Paths:** `/run/h4reet/*.env` (on the hosts, never on an agent's machine); `~/.config/h4reet-ai/{infra,tunnel,release}`, already under spec 000's deny, each with its own matrix row.
