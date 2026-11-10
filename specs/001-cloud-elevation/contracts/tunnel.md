# Contract: the tunnel, the tunnel end, and the hosts' relay, telemetry, and health blocks

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/tunnel.md` at 00309c47): the OpenSSH design is carried, as the Author's question 13 answer asked ("using September's OpenSSH tunnel design"), and it now ends on the tunnel end. Research: R-11, R-12, R-29, R-10.

## 1. The tunnel end's ports

| Port | Interface | Security group admits | Leads to |
|---|---|---|---|
| 2222 | public, the Elastic IP | any address (the laptop's address changes) | `tunnel-end`'s sshd |
| 8087 | public, the Elastic IP | Route 53's health-checker address ranges only (the published form to confirm in the first task) | `tunnel-end:2203`, the reverse forward to the laptop's health block |
| 8080 | private | CloudFront's VPC origin only | the relay (contracts/relay-http.md) |

Nothing else is open. The policy (contracts/infra-records.md §5, T7) refuses any other rule from outside the account.

## 2. `tunnel-end` (the server)

Image `tunnel`, from `deploy/tunnel/Dockerfile`: Alpine's OpenSSH, pinned by the base's digest. It runs unprivileged with no capabilities, a read-only root, and tmpfs `/run`. Its `sshd_config`:

```text
Port 2222
HostKey /run/keys/ssh_host_ed25519_key
AuthorizedKeysFile /run/keys/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AllowUsers tunnel
MaxSessions 0
AllowTcpForwarding yes
GatewayPorts clientspecified
PermitListen 0.0.0.0:2201 0.0.0.0:2202 0.0.0.0:2203
PermitOpen <rds-endpoint>:5432 snapshot-sink:8080
ClientAliveInterval 10
ClientAliveCountMax 3
```

`<rds-endpoint>` is written at boot from a `String` parameter Terraform writes. The keys come from Parameter Store at boot (§6).

## 3. `tunnel` (the client, on the laptop)

In the laptop's prod, profile `tunnel`. The same image, unprivileged. It connects to the tunnel end's Elastic IP on 2222, with the pinned host key, and holds:

| Forward | From | To | Carries |
|---|---|---|---|
| `-R 0.0.0.0:2201` | the tunnel end | `edge:8085`, the relay block (§4) | visitors' requests from the relay |
| `-R 0.0.0.0:2202` | the tunnel end | `edge:8086`, the telemetry block | the tunnel end's collector's export (research.md R-25) |
| `-R 0.0.0.0:2203` | the tunnel end | `edge:8087`, the health block | Route 53's health checks (research.md R-29) |
| `-L 0.0.0.0:5432` | the laptop's stack (`tunnel:5432`) | `<rds-endpoint>:5432` | the laptop's gateway to the shared state, inside TLS (contracts/shared-state.md §3) |
| `-L 0.0.0.0:2301` | the laptop's stack (`tunnel:2301`) | `snapshot-sink:8080` | the public view's panels |

- **Reconnecting:** backoff 1, 2, 5, 10, 30 s, with `ServerAliveInterval 10`, `ServerAliveCountMax 3` and `ExitOnForwardFailure yes`.
- **Its health:** `h4.tunnel.up`, from both ends.
- **The admin-only stack** for `make operator-* ENV=shared` runs the same image with only `-L 5432` (contracts/handover.md §7).

## 4. The hosts' blocks on `edge` (spec 000's nginx)

| Block | Hosts | Published | Accepts | Auth | Notes |
|---|---|---|---|---|---|
| 8085, relay | the laptop; EC2 | the laptop: unpublished (the tunnel reaches it). EC2: its private address, a literal in the `ec2` class, admitted only from the tunnel end's security group | `POST /hello`, `POST /room/turn`, `POST /room/events` to `gateway:8080`; `GET /health` (below) | `Authorization: Bearer <relay token for this host>`, from the host's env file; 401 otherwise, logged with no address | it moves `X-H4-Viewer` into the one `X-Forwarded-For` value it sends on, drops any other, and keeps `traceparent` |
| 8086, telemetry | the laptop | unpublished | `POST /v1/{traces,metrics,logs}` to `otel-collector:4318` | its own bearer token | EC2's collector is reached in the VPC instead |
| 8087, health | the laptop | unpublished | `GET /health` only | none: Route 53's checkers can't send one (spec FR-053's conditional) | answers 200 or 503 with an empty body; rate-limited to 10 requests a second |

**`GET /health` on 8085 and 8087** both ask `gateway:8080/health` and answer 200 only if it reports itself up and the shared state readable. The plan's gateway task adds that field to the gateway's health answer if it isn't there.

## 5. Keys and revocation (FR-055)

| Item | Made by | Kept |
|---|---|---|
| The client's key pair | `make tunnel-keys` (the Author) | the private key in `~/.config/h4reet-ai/tunnel/`, denied to agents; the public key in Parameter Store, `/h4reet/tunnel-end/AUTHORIZED_KEY` |
| The server's host key | the same | the private key in Parameter Store, `/h4reet/tunnel-end/HOST_KEY` (SecureString); its public key pinned in the laptop's `known_hosts` under `~/.config/h4reet-ai/tunnel/` |
| The relay's tokens, one per host | `make tunnel-keys` | Parameter Store under `/h4reet/tunnel-end/`, and each host's own copy: the laptop's prod env file, EC2's Parameter Store path |

`make tunnel-revoke` empties `AUTHORIZED_KEY`, and a Systems Manager command restarts `tunnel-end`: one action (FR-055).

## 6. Egress (FR-051; research.md R-10)

On EC2 and on the tunnel end, as September: a host proxy with a hostname allowlist generated from the disclosure's rows for that host, and nftables `output` and `forward` chains.

| Host | Allowed through the proxy | Reached inside the VPC |
|---|---|---|
| EC2 | `api.anthropic.com`, `bedrock-runtime.us-east-1.amazonaws.com`, `api.telegram.org`, the SMTP host, and the AWS endpoints for ECR, S3, Systems Manager, STS, and Budgets | RDS |
| The tunnel end | the AWS endpoints for S3, Systems Manager, STS, Budgets, and EC2's describe calls | RDS; EC2's relay block; EC2's collector |

`tools/gates/disclosure_check.py` fails the gate when an allowlist and the disclosure differ.
