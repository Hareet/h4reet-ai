# Contract: the tunnel, the tunnel end, and the hosts' relay, telemetry, and health blocks

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/tunnel.md` at 00309c47): the OpenSSH design is carried, as the Author's question 13 answer asked ("using September's OpenSSH tunnel design"), and it now ends on the tunnel end. Research: R-11, R-12, R-29, R-10.

## 1. The tunnel end's ports

| Port | Interface | Security group admits | Leads to |
|---|---|---|---|
| 2222 | public, the Elastic IP | any address (the laptop's address changes) | `tunnel-end`'s sshd |
| 8087 | public, the Elastic IP | Route 53's health-checker address ranges only (the published form to confirm in the first task) | `tunnel-end:2203`, the reverse forward to the laptop's health block |
| 8080 | private | CloudFront's VPC origin only | the relay (contracts/relay-http.md) |

Nothing else is open. The policy (contracts/infra-records.md §3, T7) refuses any other rule from outside the account.

**The instance** is a persistent spot request that stops on interruption (the Author's answer to the plan's question 2; spec FR-076). Its Elastic IP stays associated with its interface across a stop (to confirm), so the laptop's `tunnel` reconnects to the same address within its backoff once AWS starts it again.

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
PermitOpen shared-state:5432 snapshot-sink:8080
ClientAliveInterval 10
ClientAliveCountMax 3
```

From W1 the store is the tunnel end's own `shared-state` (plan.md §16, "The shared state on the tunnel end"), so no endpoint is written at boot (amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end"). The keys come from Parameter Store at boot (§5). **As built in group 5:** `deploy/tunnel/sshd_config` holds these lines and closes every other kind of session and forward (`PermitTTY no`, `X11Forwarding no`, `AllowAgentForwarding no`, `AllowStreamLocalForwarding no`, `PermitTunnel no`, `PermitUserRC no`, `UsePAM no`, `PidFile none`); the image is Ubuntu's OpenSSH on the pinned `base:ubuntu` (plan.md §16, group 5's departure 4).

## 3. `tunnel` (the client, on the laptop)

In the laptop's prod, profile `tunnel`. The same image, unprivileged. It connects to the tunnel end's Elastic IP on 2222, with the pinned host key, and holds:

| Forward | From | To | Carries |
|---|---|---|---|
| `-R 0.0.0.0:2201` | the tunnel end | `edge:8085`, the relay block (§4) | visitors' requests from the relay |
| `-R 0.0.0.0:2202` | the tunnel end | `edge:8086`, the telemetry block | the tunnel end's collector's export (research.md R-25) |
| `-R 0.0.0.0:2203` | the tunnel end | `edge:8088`, the health block (edge's 8087 is spec 002's site) | Route 53's health checks (research.md R-29) |
| `-L 0.0.0.0:5432` | the laptop's stack (`tunnel:5432`) | `shared-state:5432` (W1) | the laptop's gateway to the shared state, inside TLS (contracts/shared-state.md §3) |
| `-L 0.0.0.0:2301` | the laptop's stack (`tunnel:2301`) | `snapshot-sink:8080` | the public view's panels |

- **Reconnecting:** backoff 1, 2, 5, 10, 30 s, with `ServerAliveInterval 10`, `ServerAliveCountMax 3` and `ExitOnForwardFailure yes`.
- **Its health:** `h4.tunnel.up`, from both ends.
- **The admin-only stack** for `make operator-* ENV=shared` runs the same image with only `-L 5432`, and only while the laptop's prod isn't running; while it runs, the command uses prod's own admin listener (contracts/shared-state.md §7).

## 4. The hosts' blocks on `edge` (spec 000's nginx)

| Block | Hosts | Published | Accepts | Auth | Notes |
|---|---|---|---|---|---|
| 8085, relay | the laptop; EC2 | the laptop: unpublished (the tunnel reaches it). EC2: its private address, a literal in the `ec2` class, admitted only from the tunnel end's security group | `POST /hello`, `POST /room/turn`, `POST /room/events` to `gateway:8080`; `GET /health` (below) | `Authorization: Bearer <relay token for this host>`, from the host's env file; 401 otherwise, logged with no address | it moves `X-H4-Viewer` into the one `X-Forwarded-For` value it sends on, drops any other, and keeps `traceparent` |
| 8086, telemetry | the laptop | unpublished | `POST /v1/{traces,metrics,logs}` to `otel-collector:4318` | its own bearer token, `TELEMETRY_BLOCK_TOKEN` | EC2's collector is reached in the VPC instead |
| 8088, health (8087 until group 5, which found edge's 8087 taken) | the laptop | unpublished | `GET /health` only | none: Route 53's checkers can't send one (spec FR-053's conditional) | answers 200 or 503 with an empty body; rate-limited to 10 requests a second |

**`GET /health` on 8085 and on the health block** both ask the gateway, and answer 200 only if it answers and the shared state reads. **As built in group 5** (tasks.md T043, T048): the gateway's health answer already carries the store's readability, `store`, but it answers 200 whatever the state (spec 000's contracts/gateway-http.md §5), so the blocks ask the gateway's `GET /health/serving`, which answers 200 while the store reads and 503 otherwise, each with an empty body, and pass that on as it is; a gateway that doesn't answer is 503 too. **The health block listens on edge's 8088,** since edge's 8087 is spec 002's site, x005: the tunnel's `-R 2203` leads to `edge:8088`, and the tunnel end still publishes 2203 on its public 8087 (§1, §3).

**The tokens** reach nginx, which reads no environment, as two maps in a file on edge's tmpfs, which `deploy/edge/entrypoint.sh` writes from `RELAY_TOKEN_SELF` and `TELEMETRY_BLOCK_TOKEN` before nginx starts: each matches `Bearer <token>` and nothing else, and with no token, as on dev and dev-cpu, nothing matches. **After group 5's review:** each entry is the regular expression `~^Bearer <token>$`, so it matches exactly, case and all; nginx matches a map's plain strings without case, and hashes them in buckets that a token of the longest shape overflows, so nginx wouldn't start (`nginx -t` on the pinned image, `deploy/edge/test_edge_on_engine.py`).

## 5. Keys and revocation (FR-055)

| Item | Made by | Kept |
|---|---|---|
| The client's key pair | `make tunnel-keys` (the Author) | the private key in `~/.config/h4reet-ai/tunnel/`, denied to agents; the public key in Parameter Store, `/h4reet/tunnel-end/AUTHORIZED_KEY` |
| The server's host key | the same | the private key in Parameter Store, `/h4reet/tunnel-end/HOST_KEY` (SecureString); its public key pinned in the laptop's `known_hosts` under `~/.config/h4reet-ai/tunnel/` |
| The relay's tokens, one per host | `make tunnel-keys` | Parameter Store under `/h4reet/tunnel-end/`, and each host's own copy: the laptop's prod env file, EC2's Parameter Store path |
| The sink's token, `SNAPSHOT_SINK_TOKEN`, and the telemetry block's token, `TELEMETRY_BLOCK_TOKEN` | `make tunnel-keys` | Parameter Store under `/h4reet/tunnel-end/`; the sink's token also in the laptop's prod env file and EC2's path, the telemetry block's in the laptop's prod env file |

`make tunnel-revoke` empties `AUTHORIZED_KEY`, and a Systems Manager command restarts `tunnel-end`: one action (FR-055).

## 6. Egress (FR-051; research.md R-10)

On EC2 and on the tunnel end, as September: a host proxy with a hostname allowlist generated from the disclosure's rows for that host, and nftables `output` and `forward` chains.

| Host | Allowed through the proxy | Reached inside the VPC |
|---|---|---|
| EC2 | `api.anthropic.com`, `bedrock-runtime.us-east-1.amazonaws.com`, `api.telegram.org`, the SMTP host, and the AWS endpoints for ECR, S3, Systems Manager, STS, Budgets, and SNS (its alerts to `h4-alerts`; row C7) | RDS |
| The tunnel end | the AWS endpoints for ECR (its deployer's pulls), S3, Systems Manager, STS, Budgets, EC2's describe calls, SNS (its alerts to `h4-alerts`; row C7), Route 53's health-check status, and CloudWatch's metric reads (the dashboard's reads, plan §11) | RDS; EC2's relay block; EC2's collector |

`tools/gates/disclosure_check.py` fails the gate when an allowlist and the disclosure differ.

## 7. The dashboard's Hosts row: the tunnel (group 5)

`deploy/grafana/dashboards/h4-runtime.json`, in its own row, "Hosts", below the room's rows and above the studio's (plan.md §11). Later groups add their panels to the row, each in the contract of its feature. Group 5's:

| Panel | Type | Query |
|---|---|---|
| Tunnel up (FR-060) | stat, and a state timeline | `max by (h4_tunnel_end) (h4_tunnel_up)` |
| Tunnel reconnects | time series | `sum by (h4_tunnel_end) (increase(h4_tunnel_reconnects_total[1h]))` |
| Telemetry delayed at the tunnel end (FR-060) | time series | `max by (exporter) (otelcol_exporter_queue_size{service_name="tunnel-end-collector"} / otelcol_exporter_queue_capacity{service_name="tunnel-end-collector"})` |
| Telemetry lost at the tunnel end (FR-060) | time series | `sum by (exporter) (rate(otelcol_exporter_enqueue_failed_spans_total{service_name="tunnel-end-collector"}[5m]))`, and the same for metric points and log records |

- **`h4_tunnel_up`** is `h4.tunnel.up`, a gauge each end of the tunnel pushes every 15 seconds, labelled `h4.tunnel.end`: `laptop` from the `tunnel` service, 1 while its connection is up; `tunnel-end` from `tunnel-end`, 1 while its three reverse forwards listen. Up reads "up" in green, down "down" in red.
- **`h4_tunnel_reconnects_total`** is `h4.tunnel.reconnects`, a counter: each new connection after the first, on the laptop; each accepted login, on the tunnel end.
- **The tunnel end's collector** pushes its own counters through its own pipeline, as `service.name` `tunnel-end-collector`, so they reach whichever host is up; its two exporters are `otlphttp/laptop` and `otlphttp/ec2`. "Delayed" is its file-backed queue's fill, "lost" what the queue refused when full.
- `deploy/scripts/test_dashboard.py` reads this section's table.
