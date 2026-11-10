> **Superseded on 2026-11-09.** Spec 001 was reworked that day around the Author's decisions (ADR 0044, proposed: EC2 is prod's default host); this contract is the September design's (the laptop serves, the cloud is a thin control plane) and waits for a re-plan, kept unedited below as the record.

# Contract: the cloud stack's environment, and what changes in spec 000's

Spec 001 (FR-009, FR-010, FR-011, FR-017, FR-018, FR-043, FR-050, FR-055) · Plan: [§1.4](../plan.md#14-credentials-and-secrets-fr-008-fr-009-fr-010), [§2](../plan.md#2-the-guard-patch-before-any-infra-file), [§6](../plan.md#6-the-cloud-vm) · Research: [R-15](../research.md#r-15-the-fallback-gateways-identity-fr-013-to-ask-question-6), [R-16](../research.md#r-16-refusing-terraforms-state-changing-commands-in-every-spelling-fr-006-fr-011), [R-20](../research.md#r-20-the-meter-of-record-moves-to-the-cloud-stack-fr-017-fr-018-fr-019)

This contract extends spec 000's [env-files.md](../../000-local-foundations/contracts/env-files.md). Everything there holds unless a row here changes it: the grammar (its §1.1), the sources (§1.2), the rule that no service has an `env_file:` line, and preflight's checks P1 to P21. This file adds the fourth stack, `cloud`; the keys the tunnel adds to local prod; the preflight checks and gateway refusals this spec needs; and FR-011's deny list.

## 1. The files

| File | Stack | Committed | Mode | Holds |
|---|---|---|---|---|
| `deploy/env.example/cloud.env.example` | cloud (template) | yes | 0644 | every cloud key: fixed values filled, `__SSM__` for values the VM reads from Parameter Store at boot |
| `/run/h4reet/cloud.env` on the VM | cloud | never: written at boot onto tmpfs | 0600, owner root, in a 0700 directory | the real values: the template's fixed values, and each `__SSM__` key's value from `/h4reet/cloud/<KEY>` |
| `deploy/env.example/prod.env.example` | prod (template) | yes | 0644 | spec 000's keys, plus §4's tunnel keys |
| `~/.config/h4reet-ai/env/prod.env` | prod | never | 0600 | the same, with the tunnel keys' values from `make tunnel-keys` |

**`__SSM__` is a fifth source** beside spec 000's fixed, filled, generated, asked, and dummy. `deploy/vm/write-env.py`, which cloud-init runs, writes the file:
- **Reading:** it reads `/h4reet/cloud/*` with the instance role and `WithDecryption`, then copies the template, replacing each `__SSM__` with its parameter's value.
- **Refusals:** it refuses to write the file while any `__SSM__` key's parameter is missing, naming the missing keys, so the stack never starts without one.
- **Logging:** it logs key names only.

**Terraform never holds a secret parameter (FR-009).** The spec asks that "Terraform refers to the secret without reading its value" (FR-009). A Terraform-managed `aws_ssm_parameter` can't meet that: even with a placeholder and `lifecycle { ignore_changes = [value] }`, every refresh reads the SecureString back, decrypted, into the state and into every saved plan. So:
- **The secret parameters** (every row of §2 marked "yes" under Secret) are created and updated only by the Author, with `aws ssm put-parameter --type SecureString --overwrite`, from the Author's terminal (quickstart §4.2). Terraform names their path, `/h4reet/cloud/*`, only in IAM policies: the instance role's read grant and the alert bridge's (`/h4reet/cloud/TELEGRAM_*`). No `aws_ssm_parameter` resource and no `aws_ssm_parameter` data source names one.
- **The non-secret parameters** whose values Terraform already knows, the two bucket names (`H4_SITE_BUCKET`, `H4_RELEASE_BUCKET`), are `String` parameters Terraform writes. The other non-secret ones the Author sets (`OPERATOR_TOKEN_SHA256`, `H4_TUNNEL_AUTHORIZED_KEY`) are `String` parameters the Author writes the same way as the secrets.
- **`make secrets-check`** (the Author's terminal) lists which expected names exist under `/h4reet/cloud/`, by name and type only, with `aws ssm describe-parameters`: it never reads a value. `write-env.py`'s refusal is the same check at boot.

This is a named exception to FR-001 ("THE SYSTEM SHALL define every cloud resource in Terraform"): the secret parameters are cloud resources Terraform doesn't define (plan Complexity Tracking; research.md R-26).

## 2. The cloud stack's keys

Spec 000's columns. "As prod" means the key, its rule, and its consumer are spec 000's prod row. Only what differs is listed.

| Key | cloud | Secret | Source | Consumed by | Validated by |
|---|---|---|---|---|---|
| `H4_STACK` | `cloud` | no | fixed | compose, preflight, the gateway, the relay, the collector | preflight: equals `ENV`. Gateway: one of four, and agrees with `H4_ENV` (§6) |
| `H4_ENV` | `prod` | no | fixed | as prod | `prod` for prod and cloud, `dev` otherwise |
| `COMPOSE_PROJECT_NAME` | `h4reet-cloud` | no | fixed | compose | `h4reet-<H4_STACK>` |
| `COMPOSE_PROFILES` | `cloud` | no | fixed | compose | preflight P6, as changed in §5 |
| `H4_STATE_DIR` | `/var/lib/h4reet/cloud` | no | fixed | compose: the gateway's journal, the store's data, the collector's queue | preflight: the meter volume's mount point (P25) |
| `H4_AWS_DIR` | `/run/h4reet/aws` | no (a path) | fixed | compose: the gateway's `/home/node/.aws:ro` | preflight: a tmpfs directory, 0700, not a link (P19, extended to cloud) |
| `H4_MODEL_DIR` | – | – | – | – | absent: the cloud class runs no model server |
| `H4_VHDX_MOUNT` | – | – | – | – | absent on cloud: P13 checks the root volume instead |
| `H4_API_PORT`, `H4_LANGFUSE_PORT`, `H4_GRAFANA_PORT`, `H4_ADMIN_PORT`, `H4_OTLP_PORT` | `18500` to `18504` | no | fixed | compose: `edge` publishes them on the VM's `127.0.0.1`, as on every stack | the stack's values. Only x003, the admin listener, is used, through the operator's session (§7) |
| `H4_BUILD_PROXY` | empty | no | fixed | as prod | – |
| `GATEWAY_DB_PASSWORD` | `__SSM__` | yes | Parameter Store | as prod | as prod |
| `GATEWAY_GRAFANA_RO_PASSWORD` | `__SSM__` | yes | Parameter Store | the gateway (it sets the role's password), and `snapshot-sink`, which reads the meter of record's values through `grafana_ro` ([public-view.md §2](public-view.md#2-the-sink)). No Grafana runs on cloud | as prod |
| `GATEWAY_RELAY_RO_PASSWORD` | `__SSM__` | yes | Parameter Store | the gateway (it sets `relay_ro`'s password at each start, [data-model.md §2.4](../data-model.md#24-the-role-relay_ro)), the relay | printable ASCII without spaces, as `grafana_ro`'s |
| `OPERATOR_TOKEN_SHA256` | `__SSM__` | no: a hash | Parameter Store | the gateway | as prod, and not equal to prod's hash (§6) |
| `ALERT_DELIVERY`, `TELEGRAM_API_BASE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SMTP_*`, `ALERT_EMAIL_*` | as prod; the secrets are `__SSM__` | as prod | Parameter Store | the gateway | as prod |
| `GATEWAY_AWS_PROFILE` | `h4-fallback` | no | fixed | the gateway's `AWS_PROFILE` | the profile the credential timer writes (§7) |
| `TELEMETRY_PAYLOAD_SAMPLING` | `off` | no | fixed | as prod | as prod |
| `H4_EGRESS_PROXY` | `http://host.docker.internal:3128` | no | fixed | compose: `HTTPS_PROXY` for the gateway (Bedrock, the Budgets API, Telegram) and `snapshot-sink` (S3); nodemailer's `proxy` option for SMTP. The relay, the collector, and `tunnel-end` get none: they never leave the VM | preflight: exactly this value on cloud, absent elsewhere |
| `H4_SINK_AWS_DIR` | `/run/h4reet/aws-sink` | no (a path) | fixed | compose: `snapshot-sink`'s `/home/app/.aws:ro` | as `H4_AWS_DIR` |
| `SNAPSHOT_AWS_PROFILE` | `h4-public-view` | no | fixed | `snapshot-sink` as `AWS_PROFILE` | the profile the credential timer writes (§7) |
| `H4_SITE_BUCKET` | `__SSM__` | no | Parameter Store | `snapshot-sink` | an S3 bucket name |
| `H4_TUNNEL_API_TOKEN` | `__SSM__` | yes | Parameter Store | the relay ([relay-http.md §6](relay-http.md#6-the-path)) | 64 lowercase hex |
| `H4_TUNNEL_OTLP_TOKEN` | `__SSM__` | yes | Parameter Store | the collector's export ([tunnel.md §5](tunnel.md#5-the-local-edges-tunnel-blocks)) | 64 lowercase hex |
| `H4_SNAPSHOT_TOKEN` | `__SSM__` | yes | Parameter Store | `snapshot-sink` ([public-view.md §2](public-view.md#2-the-sink)) | 64 lowercase hex |
| `H4_TUNNEL_HOST_KEY` | `__SSM__` | yes | Parameter Store | `tunnel-end`, as a tmpfs file (never an environment variable inside the container) | an OpenSSH Ed25519 private key |
| `H4_TUNNEL_AUTHORIZED_KEY` | `__SSM__` | no: a public key | Parameter Store | `tunnel-end` | one `ssh-ed25519` line, or the literal `revoked` ([tunnel.md §7](tunnel.md#7-keys-revocation-and-rotation)) |
| `H4_RELEASE_BUCKET` | `__SSM__` | no | Parameter Store | the deployer | an S3 bucket name |

The **host's** values aren't in this file: the instance's ID, the Elastic IP, and the AWS region come from instance metadata on the host, never inside a container (IMDSv2, hop limit 1).

## 3. Profiles and services, by stack

| Profile | Selected by | Services |
|---|---|---|
| `gpu` / `cpu` | prod and dev (`gpu`); dev-cpu (`cpu`) | the model server, as in spec 000 |
| `dev-receivers` | dev, dev-cpu | as in spec 000 |
| `dev-relay` | dev, dev-cpu | `relay`, against the stack's own store and gateway (FR-025) |
| `cloud` | cloud only | `relay`, `tunnel-end`, `snapshot-sink` |
| `tunnel` | prod only, once the Author has run `make tunnel-keys` | `tunnel`, `snapshot-publisher` |

**On the cloud stack, these services start without a profile:** `edge`, `gateway`, `gateway-state`, and `otel-collector`. The collector is `collector-cloud.yaml`, chosen by `H4_STACK` in compose's command line.

**These never start on cloud:** Langfuse and its stores, Prometheus, Loki, and Grafana. They go into a `local` profile that prod, dev, and dev-cpu select and cloud doesn't. Each local template's `COMPOSE_PROFILES` gains `local`: prod's becomes `gpu,local` (`gpu,local,tunnel` with the tunnel), dev's `gpu,dev-receivers,dev-relay,local`, and dev-cpu's `cpu,dev-receivers,dev-relay,local`.

## 4. The keys the tunnel adds to local prod

| Key | prod | Secret | Source | Consumed by | Validated by |
|---|---|---|---|---|---|
| `H4_TUNNEL_ENDPOINT` | `__ASK__` | no | asked: the Elastic IP and port, `<address>:2222` | `tunnel` | preflight: `IPv4:2222` |
| `H4_TUNNEL_DIR` | `__HOME__/.config/h4reet-ai/tunnel` | no (a path) | filled | compose: `tunnel`'s `/keys:ro` | preflight P23 |
| `H4_TUNNEL_API_TOKEN`, `H4_TUNNEL_OTLP_TOKEN`, `H4_SNAPSHOT_TOKEN` | `__ASK__`: `make tunnel-keys` prints none of them, and writes them into both this file and Parameter Store | yes | asked | the local `edge` (the first two, through nginx's environment template), `snapshot-publisher` (the third) | 64 lowercase hex; the same values as the cloud's |

The local prod gateway's route loses its fallback in group 4 ([data-model.md §3](../data-model.md#3-routing-the-cloud-stacks-class)). Its AWS keys then retire: `GATEWAY_AWS_PROFILE` leaves prod's template, `H4_AWS_DIR` becomes `__REPO__/deploy/aws-none` as dev's, and P19 stops asking for an SSO directory on prod.

## 5. Preflight

| ID | Change |
|---|---|
| P6 | `COMPOSE_PROFILES` is the stack's exact value (§3). Exactly one of `gpu` and `cpu`, except the cloud class, which selects neither, and `cloud`. `tunnel` only on prod; `cloud` only on cloud. |
| P11 | cloud runs on the VM's rootful engine, as prod does on the host's: a rootless engine refuses. |
| P12, P14, P18 | skipped on cloud (no model) |
| P13 | on cloud, the root volume's free space and the meter volume's, through `statvfs` |
| P22 (new) | FR-018: the route this stack resolves names a `paid` adapter, and the stack isn't cloud. With the message: "IF a production-class stack with a paid route would spend outside the meter of record, THEN THE SYSTEM SHALL refuse to start it" (FR-018). |
| P23 (new) | `tunnel` selected, and `${H4_TUNNEL_DIR}` lacks `id_ed25519` (0600) or `known_hosts` (0644), or is a link, or its directory isn't 0700 |
| P24 (new) | cloud only: the literal addresses compose binds (`10.42.1.10`, `10.42.0.10`) aren't on the host's interfaces. Docker would refuse anyway; preflight names it first |
| P25 (new) | cloud only: `H4_STATE_DIR` isn't the mount point of a block device other than the root volume's (the meter's volume, FR-019) |
| P26 (new) | cloud only: `H4_AWS_DIR/credentials` is missing or older than 45 minutes (the credential timer has stopped, §7) |

## 6. What the gateway checks for itself

Additions to spec 000's [env-files.md §11](../../000-local-foundations/contracts/env-files.md#11-what-the-gateway-checks-for-itself), each exit 78:

| Check | Reason |
|---|---|
| `H4_STACK` is `prod`, `dev`, `dev-cpu`, or `cloud`; `cloud` with `H4_ENV=prod` | `invalid_stack`, `stack_env_mismatch` (widened) |
| The route this stack resolves ([data-model.md §3](../data-model.md#3-routing-the-cloud-stacks-class)) names a paid adapter, and `H4_STACK` isn't `cloud` | `paid_route_outside_cloud` |
| `H4_STACK=cloud` and the resolved route has a primary | `cloud_route_has_primary` |
| `OPERATOR_TOKEN_SHA256` on cloud equals the dev-cpu dummy's hash | `operator_hash_is_dummy` (as prod) |
| `GATEWAY_RELAY_RO_PASSWORD` is set but isn't printable ASCII without spaces | `relay_ro_password_invalid` |

The operator token's prefix is `h4op_cloud_` for the cloud stack ([data-model.md §2.5](../data-model.md#25-the-operator-credential-on-the-cloud-stack)).

## 7. The VM's host: credentials, the operator session, the egress proxy

**The containers' credentials** (R-15). No container can reach the instance's metadata (IMDSv2, hop limit 1), so the two containers that call AWS get short-lived credentials for their own roles from a host timer:

| Container | Role it gets | Allowed | File |
|---|---|---|---|
| `gateway` | `h4-prod-fallback-gateway` | `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the inference profile and the models it routes to; `budgets:ViewBudget` on `h4-infra-actual` | `/run/h4reet/aws/credentials`, profile `h4-fallback` |
| `snapshot-sink` | `h4-prod-public-view-writer` | `s3:PutObject` on the one key `site/status/latest.json` in the site's bucket | `/run/h4reet/aws-sink/credentials`, profile `h4-public-view` |

The host services (the deployer, the egress proxy, `h4-aws-poller`) use the instance role directly.

`h4-gateway-credentials.timer` runs every 30 minutes, and at boot. For each row, with the instance role, it calls `sts:AssumeRole` for one hour, then writes the file atomically: a temporary file, then a rename, mode 0640, group readable by the container's user. The gateway's file holds:

```ini
[h4-fallback]
aws_access_key_id = …
aws_secret_access_key = …
aws_session_token = …
h4_expires_at = 2026-11-02T14:31:07Z
```

- **The extra key:** the SDK ignores `h4_expires_at`. The gateway reads it for spec 000's `credentials_expiring` alert in place of an SSO session's end (`credentials_warn_before_s`, 7,200 s, in `config/routing.yaml`). Since the file is renewed every 30 minutes, the alert fires only when the timer has stopped.
- **What the timer logs:** the role's name and the expiry, never the keys.

**The operator session** (FR-050). `make cloud-session` (the Author's terminal) opens two Systems Manager port-forwarding sessions to the VM. Both run on the Author's own SSO session, so they last that session's length at most:

| Local port | Document | Reaches | For |
|---|---|---|---|
| `127.0.0.1:18503` | `AWS-StartPortForwardingSession` | the VM's `127.0.0.1:18503`, the admin listener | `make operator-* ENV=cloud` |
| `127.0.0.1:18505` | `AWS-StartPortForwardingSession` | the VM's `127.0.0.1:18505`, the relay's internal listener ([relay-http.md §1](relay-http.md#1-listener-reachability-and-common-rules)) | `make hello ENV=cloud`, before the edge exists and for tests after |

- **The operator CLI:** `scripts/operator.py`'s `--url` rule widens by one stack: `127.0.0.1` or `localhost`, at the stack's own port, and for `ENV=cloud` that is 18503. The token file is `~/.config/h4reet-ai/operator/cloud.token`.
- **The hello client:** for `ENV=cloud`, `scripts/hello.py` calls `http://127.0.0.1:18505/api/hello`. The internal listener gives every request the fixed identity `192.0.2.10`, an address from the documentation range, whatever the client sends: that's the Author's test identity, it never stands for a visitor, and it's FR-032's one named exception ([relay-http.md §2](relay-http.md#2-the-clients-address-fr-032)).

**The VM's Docker daemon** (`deploy/vm/daemon.json`): `"userland-proxy": false`, so traffic to a published port keeps its source address, and `"default-address-pools": [{"base": "172.30.0.0/16", "size": 24}]`, so every compose network on the VM comes from one range the relay's peer rule refuses ([relay-http.md §1](relay-http.md#1-listener-reachability-and-common-rules)).

**The egress proxy** (R-10) listens on the host's `127.0.0.1:3128` and on the Docker bridge gateway's address, so containers reach it as `host.docker.internal:3128` through compose's `extra_hosts: host.docker.internal:host-gateway`. On cloud, the compose policy allows that entry on the gateway and `snapshot-sink` only. Its allowlist is in [tunnel.md §8](tunnel.md#8-the-vms-egress-allowlist).

**`h4-aws-poller`** (a host service, `deploy/scripts/aws_poller.py`) does two jobs with the instance role:
- **every 5 minutes,** it reads CloudFront's default metrics for the distribution (`Requests`, `4xxErrorRate`, `5xxErrorRate`, `BytesDownloaded`) through `cloudwatch:GetMetricData`;
- **every 20 seconds,** it drains `h4-alerts-copy`, the SQS queue subscribed to the `h4-alerts` topic, counting each notice by source.

It serves both as Prometheus text on the bridge gateway's address, port 9464: `h4_edge_requests`, `h4_edge_error_rate{class}`, and `h4_aws_alerts_total{source}`. The cloud collector scrapes them and sends them home through the tunnel (plan §9).

## 8. FR-011's deny list

The rule from spec 000's FR-007: every secret is denied by name and by the file that holds it, with a matrix row for each, in the same patch that creates it or an earlier one. The guard patch (plan §2) lands before any of these exist.

| Secret or sensitive item | Variables in `credentials.envVars` | Paths | Denied before this spec? |
|---|---|---|---|
| Terraform's state and plans | – | `*.tfstate`, `*.tfstate.*`, `*.tfplan`; `~/.config/h4reet-ai/infra/` (the bootstrap's local state, the saved plans, the per-root run-time values) | the directory, yes: spec 000 denies all of `~/.config/h4reet-ai`. The file globs are new |
| Variable files | `TF_VAR_*` | `*.tfvars`, `*.tfvars.json` | no |
| Terraform's run-time arguments | `TF_CLI_ARGS`, `TF_CLI_ARGS_*`, `TF_CLI_CONFIG_FILE` | – | no |
| AWS: the Author's SSO session in the Author's terminal | the `AWS_*` names spec 000 lists, plus `AWS_SSO_SESSION`, `AWS_DEFAULT_PROFILE` | `~/.aws` (already) | mostly |
| The tunnel's client key and pinned host key | `H4_TUNNEL_HOST_KEY`, `H4_TUNNEL_AUTHORIZED_KEY` | `~/.config/h4reet-ai/tunnel/` | the directory, yes; the names are new |
| The tunnel's and the sink's tokens | `H4_TUNNEL_API_TOKEN`, `H4_TUNNEL_OTLP_TOKEN`, `H4_SNAPSHOT_TOKEN` | the prod env file (already) | no |
| `relay_ro`'s password | `GATEWAY_RELAY_RO_PASSWORD` | the env files (already) | no |
| The cloud operator token | `H4_OPERATOR_TOKEN` (already) | `~/.config/h4reet-ai/operator/cloud.token` (already, by directory) | yes |
| Release-time values | – | `~/.config/h4reet-ai/release/` | yes, by directory |

**Read-only to agents, not denied:** `~/.local/share/h4reet/terraform-providers`, the provider mirror (R-14). Agents read it for `terraform init`; it sits outside every sandbox write root, as spec 000's lint toolchain under `~/.local/share/h4reet/` does.

**The rows that prove it,** for each line: a stage H row for the name and for each path in `denyRead` and `denyWrite`, an Edit row for each path, and a stage S row that reads each path from inside the sandbox. The canary run (`make matrix-canary`) adds the new names to its fake environment.
