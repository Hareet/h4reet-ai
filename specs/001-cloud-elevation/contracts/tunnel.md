# Contract: the tunnel, its two ends, and the local `edge`'s tunnel blocks

Spec 001 (FR-040, FR-051 to FR-055, FR-060) · Plan: [§5](../plan.md#5-the-paths-the-local-path-the-fallback-gateway-and-the-tunnel), [§6.3](../plan.md#63-egress-fr-051-r-10) · Research: [R-11](../research.md#r-11-the-tunnel-openssh-reverse-forwards-ending-on-the-vm-to-ask-question-9), [R-12](../research.md#r-12-the-local-paths-health-and-the-local-edges-tunnel-blocks), [R-10](../research.md#r-10-the-vms-egress-one-allowlisting-proxy-fr-051)

The local tier opens one outbound OpenSSH connection to the cloud VM and holds three forwards on it (FR-052: "reachable from the cloud only through an outbound tunnel that it opens itself"). The server end permits exactly those forwards and nothing else. This contract also lists the VM's egress allowlist (§8), because the tunnel and the proxy together are everything that crosses the VM's public interface.

## 1. The picture

```text
 local tier (prod, profile tunnel)                         cloud VM (profile cloud)
 ┌───────────────────────────────┐   one TCP connection   ┌────────────────────────────────┐
 │ tunnel  ── egress ──────────────────────────────────────► eth1 10.42.0.10:2222 tunnel-end │
 │   │  -R tunnel-end:2201 ◄──────── relay (C1) ─────────────── listens 0.0.0.0:2201         │
 │   │        → edge:8085 (local path)                      │                               │
 │   │  -R tunnel-end:2202 ◄──────── otel-collector (C3) ───── listens 0.0.0.0:2202         │
 │   │        → edge:8086 (telemetry in)                    │                               │
 │   │  -L tunnel:2301 ─────────────────────────────────────── opens snapshot-sink:8080 (C4)  │
 │ snapshot-publisher → tunnel:2301                         │                               │
 └───────────────────────────────┘                         └────────────────────────────────┘
```

## 2. The forwards

| Forward | Direction of the TCP connections it carries | Listens | Reaches | Flow | Who authenticates each call |
|---|---|---|---|---|---|
| `-R 0.0.0.0:2201:edge:8085` | cloud → local | `tunnel-end`, port 2201, on the cloud stack's `internal` network | the local `edge`'s 8085 block | C1, the local path | the block's bearer token (§5) |
| `-R 0.0.0.0:2202:edge:8086` | cloud → local | `tunnel-end`, port 2202 | the local `edge`'s 8086 block | C3, telemetry | the block's bearer token |
| `-L 0.0.0.0:2301:snapshot-sink:8080` | local → cloud | `tunnel`, port 2301, on the local stack's `internal` network | `snapshot-sink` on the VM | C4, the public snapshot | the sink's bearer token ([public-view.md §2](public-view.md#2-the-sink)) |

Nothing else crosses: no shell, no command, no agent forwarding, no X11, no other port, no subsystem (§3). The forwards reach the local `edge`, never the model server, Langfuse, the admin listener, or Grafana (FR-052).

## 3. `tunnel-end`: the server

The image is `deploy/tunnel/Dockerfile`, Alpine with its `openssh-server` package, pinned by the base image's digest. It runs as `tunnel` (uid 10022), unprivileged, with `cap_drop: [ALL]`, `read_only: true`, and a tmpfs `/run`. Its entrypoint:
- writes the host key from the `H4_TUNNEL_HOST_KEY` environment value into `/run/sshd/host_key` (0600);
- writes `H4_TUNNEL_AUTHORIZED_KEY` into `/run/sshd/authorized_keys` with the options below;
- clears both variables;
- `exec`s `sshd -D -e -f /etc/ssh/sshd_config`.

`/etc/ssh/sshd_config`, in the image:

```text
Port 2222
ListenAddress 0.0.0.0
HostKey /run/sshd/host_key
PidFile /run/sshd/sshd.pid
AuthorizedKeysFile /run/sshd/authorized_keys
AuthenticationMethods publickey
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers tunnel
MaxAuthTries 2
MaxSessions 0
MaxStartups 4:50:10
LoginGraceTime 10
PermitTTY no
X11Forwarding no
AllowAgentForwarding no
AllowStreamLocalForwarding no
PermitTunnel no
GatewayPorts clientspecified
AllowTcpForwarding yes
PermitListen 0.0.0.0:2201 0.0.0.0:2202
PermitOpen snapshot-sink:8080
ClientAliveInterval 10
ClientAliveCountMax 3
KexAlgorithms sntrup761x25519-sha512@openssh.com,curve25519-sha256
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com
PubkeyAcceptedAlgorithms ssh-ed25519
LogLevel VERBOSE
```

`authorized_keys` carries one line, with the same limits again on the key, so a weakened `sshd_config` alone can't widen it:

```text
restrict,port-forwarding,permitlisten="0.0.0.0:2201",permitlisten="0.0.0.0:2202",permitopen="snapshot-sink:8080" ssh-ed25519 AAAA… h4reet-tunnel
```

**Refused, and tested** (`deploy/tunnel/test_tunnel.py`, two containers on the agents' engine):

| Attempt | Result |
|---|---|
| a password, or a key other than the authorized one | authentication fails |
| a shell, a command, `-t`, or a subsystem (`sftp`) | refused (`MaxSessions 0`, `restrict`) |
| `-R` on any other port or address | "remote port forwarding failed" |
| `-L` or `-D` to anything but `snapshot-sink:8080` | refused (`PermitOpen`, `permitopen`) |
| a client that doesn't know the server's host key | the client refuses the connection (§4) |
| `revoked` as the authorized key | no key matches (§7) |

**Its logs** carry the connection's start and end, the key's fingerprint, and each refused request. The client's address is in sshd's own log line, which the container's log driver keeps for at most 10 MB × 3, as spec 000's services do. It is not a visitor's address, and it isn't sent home.

## 4. `tunnel`: the client

- **The image and container:** the same image, run as uid 10022, unprivileged, `cap_drop: [ALL]`, `read_only: true`. The keys are mounted read-only from `${H4_TUNNEL_DIR}` at `/keys`.
- **Its networks:** `internal`, to reach `edge`, and `egress`, to reach the VM. It is the second service on spec 000's `egress` network, after the gateway, and the compose policy allows it there in the `tunnel` profile only.
- **Its command,** in a loop that restarts the connection with backoff of 1, 2, 5, 10, then every 30 s:

```text
ssh -N -T -F /etc/ssh/tunnel_config -p 2222 tunnel@<H4_TUNNEL_ENDPOINT's address> \
  -R 0.0.0.0:2201:edge:8085 -R 0.0.0.0:2202:edge:8086 -L 0.0.0.0:2301:snapshot-sink:8080
```

- **`/etc/ssh/tunnel_config`:**
  - `IdentityFile /keys/id_ed25519`, `IdentitiesOnly yes`, `UserKnownHostsFile /keys/known_hosts`, and `StrictHostKeyChecking yes`;
  - `ExitOnForwardFailure yes`, so a refused forward ends the connection rather than leaving a half tunnel;
  - `ServerAliveInterval 10` and `ServerAliveCountMax 3`, so a dead link ends within 30 s;
  - the same key-exchange, cipher, and MAC lists as the server.

## 5. The local `edge`'s tunnel blocks

Two new server blocks in `deploy/edge/nginx.conf`, rendered at start from nginx's environment template. They are on ports the compose file doesn't publish. Any service on the local `internal` network can open them, but only the cloud side's two callers hold their tokens: the relay for 8085, and the cloud collector for 8086. `tunnel` itself only carries bytes. The blocks exist on every stack, and on stacks without the tunnel nothing calls them with a token.

| Block | Port | Accepts | Upstream | Token, from the local prod env file |
|---|---|---|---|---|
| The local path | 8085 | `POST /hello`, `GET /health`; anything else 404 | `gateway:8080` | `H4_TUNNEL_API_TOKEN` |
| Telemetry in | 8086 | `POST /v1/traces`, `/v1/metrics`, `/v1/logs`; anything else 404 | `otel-collector:4318` | `H4_TUNNEL_OTLP_TOKEN` |

**Each block, in order:**
1. **The token:** `Authorization` must be `Bearer <the token>`, compared in full. If it isn't, the block answers 401 `{"error":"tunnel_auth"}` and logs one line with the block's name, never the presented value. On a stack whose env file has no token (dev, dev-cpu, or prod before `make tunnel-keys`), the template renders a block that answers 401 to every call.
2. **Headers:** it removes `Authorization`.
3. **On 8085 only:**
   - it sets `X-Forwarded-For` to the value of `X-H4-Viewer`, then removes `X-H4-Viewer` and `X-H4-Client`;
   - it keeps `traceparent` and `tracestate` from the relay, since only a token holder reaches the block, and clears `baggage`;
   - it caps bodies at 16 KB, as port 8080 does;
   - when the gateway can't answer, it serves spec 000's `api_unavailable` body, as port 8080 does.
4. **On 8086:** bodies are capped at 4 MB. The local collector's spec 000 pipelines take the data, with their redaction, and nothing on that block can reach Langfuse's own API directly.

**The gateway's trust:** on the local stack, the gateway still believes `X-Forwarded-For` only from `edge` (spec 000's rule), so the address from 8085 counts, and no other caller can choose one.

## 6. State and telemetry

| Signal | From | Meaning |
|---|---|---|
| `h4.tunnel.up` (gauge, 0 or 1), `h4.tunnel.end` = `local` | `tunnel`'s loop, which pushes it over OTLP to the local collector | the connection is established and every forward was granted |
| `h4.tunnel.up`, `h4.tunnel.end` = `cloud` | `tunnel-end`'s entrypoint, which reads sshd's log and pushes it to the cloud collector | a client holds both remote listeners |
| `h4.tunnel.reconnects` (counter) | `tunnel` | each new connection |
| `relay.path.change` (log) | the relay | the local path's health changing ([relay-http.md §6.1](relay-http.md#61-the-local-paths-health-fr-054)) |

`GET /api/status`'s `tunnel` field is `tunnel-end`'s view. The local tier's status is the relay's health check.

## 7. Keys, revocation, and rotation

`make tunnel-keys` runs in the Author's terminal only (the bash gate refuses it to agents). It writes nothing into the repository, and prints only fingerprints. It:
1. generates `id_ed25519` and its `.pub` in `~/.config/h4reet-ai/tunnel/` (0600 and 0644, directory 0700);
2. generates the server's host key in a temporary directory, writes its public half to `~/.config/h4reet-ai/tunnel/known_hosts` as `[<Elastic IP>]:2222 ssh-ed25519 …`, then removes the temporary private file;
3. generates the three tokens: 32 random bytes each, as 64 lowercase hex characters;
4. puts the host key, the client's public key, and the tokens into Parameter Store (`/h4reet/cloud/H4_TUNNEL_HOST_KEY`, `H4_TUNNEL_AUTHORIZED_KEY`, `H4_TUNNEL_API_TOKEN`, `H4_TUNNEL_OTLP_TOKEN`, and `H4_SNAPSHOT_TOKEN`) with the Author's session;
5. writes the tokens and `H4_TUNNEL_ENDPOINT` into `~/.config/h4reet-ai/env/prod.env`.

| Action | How | Effect |
|---|---|---|
| **Revoke** (FR-055's "revocable by the Author in one action") | `make tunnel-revoke`: sets `/h4reet/cloud/H4_TUNNEL_AUTHORIZED_KEY` to `revoked`, then restarts `tunnel-end` through `aws ssm send-command` | the live connection ends with the restart, and no key matches again |
| **Rotate the client key** | `make tunnel-keys ROTATE=client` | a new client key, and the new public key in Parameter Store; `tunnel-end` restarts |
| **Rotate the host key** | `make tunnel-keys ROTATE=host` | a new host key, both halves updated; the client's next connection uses the new `known_hosts` |
| **Rotate the tokens** | `make tunnel-keys ROTATE=tokens` | new tokens in both places; both stacks' affected services restart (`make up ENV=prod`, and the cloud deployer's next run) |

A VM that is destroyed and recreated reads the same host key from Parameter Store, so the client's pin still matches (SC-005).

## 8. The VM's egress allowlist

`h4-egress-proxy` admits `CONNECT <host>:<port>` only for the pairs below. Every other connection is refused with 403, and logged with the requested host, which is never a visitor's data. `tools/gates/disclosure_check.py` generates the list from the disclosure's rows tagged `cloud-egress`, and fails the gate when the two differ (FR-040, FR-051).

| Host | Port | Who | Row |
|---|---|---|---|
| `bedrock-runtime.us-east-1.amazonaws.com` | 443 | the gateway | C2 |
| `budgets.amazonaws.com` | 443 | the gateway | C13 |
| `api.telegram.org` | 443 | the gateway | C7 |
| the SMTP host, from the cloud env file | 465 or 587 | the gateway | C7 |
| `s3.us-east-1.amazonaws.com`, `<site bucket>.s3.us-east-1.amazonaws.com` | 443 | `snapshot-sink`; the deployer | C4, C6 |
| `<release bucket>.s3.us-east-1.amazonaws.com` | 443 | the deployer | C6 |
| `api.ecr.us-east-1.amazonaws.com`, `<account>.dkr.ecr.us-east-1.amazonaws.com`, and ECR's layer bucket `prod-us-east-1-starport-layer-bucket.s3.us-east-1.amazonaws.com` | 443 | Docker's pulls | C6 |
| `ssm.us-east-1.amazonaws.com`, `ssmmessages.us-east-1.amazonaws.com`, `ec2messages.us-east-1.amazonaws.com` | 443 | the Systems Manager agent; `write-env.py` | C14 |
| `sts.us-east-1.amazonaws.com` | 443 | the credential timer | C14 |
| `monitoring.us-east-1.amazonaws.com`, `sqs.us-east-1.amazonaws.com` | 443 | `h4-aws-poller` | C13 |

The account's registry host is matched by its pattern, `^[0-9]{12}\.dkr\.ecr\.us-east-1\.amazonaws\.com$`. The literal is never committed (FR-010).

nftables on the VM lets only the proxy's user (`h4proxy`) open connections to addresses outside the VPC, except:
- `tunnel-end`'s replies on 2222;
- the VPC's own resolver;
- Amazon Time Sync at 169.254.169.123.

The security group's egress admits TCP 443 and the SMTP port, as a second layer.
