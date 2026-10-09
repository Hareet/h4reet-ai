# Contract: the agents' engine

Spec 000 (FR-007, FR-008, FR-017, FR-018, FR-036, FR-039; SC-003; User Story 3 scenarios 1 and 9) · Plan: [§10](../plan.md#10-the-agents-engine-and-the-sandbox-opening), [§13](../plan.md#13-the-forbidden-action-matrix) stage E, [§15](../plan.md#15-the-enforcement-layer-patch) · ADRs: [0015](../../../docs/adr/0015-agents-run-containers-on-their-own-engine.md), [0016](../../../docs/adr/0016-agents-engine-rootless-docker.md) · Research: [R-21](../research.md#r-21-the-agents-engine-rootless-docker-under-its-own-user-adr-0016-the-author), [R-22](../research.md#r-22-the-sandbox-opening-one-ip-entry-a-relay-and-mutual-tls)

The disposable container engine agent sessions run the stack on, CPU-only (FR-039): rootless Docker under the user `h4agents`, reached through one sandbox opening. This file is the engine's contract: its endpoint, what its admission plugin allows and refuses, its egress, the host-side controls and what each prevents, how it is seeded, the proof of each FR-039 limit, and the make targets.

**Everything under `deploy/agents-engine/` is human-only.** It is the FR-039 boundary, and parts of it run with sudo. Agents may propose changes in a merge-request note; only the Author's hand changes the files (ADR 0017), and the matrix proves agents can't (plan §13, stage H and S rows on the path).

## 1. The picture

```text
agent session (bubblewrap sandbox, the Author's uid)
  docker / docker compose ──► 127.0.0.1:2376 ──► deploy/agents-engine/docker-relay (socat)
                                                   └─► the sandbox's proxy ── CONNECT 198.18.0.1:2376 (the one allowedDomains IP entry)
host network namespace
  h4agents0 (dummy interface) 198.18.0.1/32
    :2376  RootlessKit's port forward, as h4agents ──► dockerd-rootless :2376, mutual TLS
    :3128  egress-proxy.py, as the Author ──► only the hosts in .claude/settings.json allowedDomains
  nftables table inet h4agents: traffic from uid h4agents may reach 198.18.0.1:3128 and nothing else
RootlessKit namespaces (user h4agents, its own subuid range, slice: 4 CPUs, 16 GB)
  dockerd-rootless (containerd image store) ── consults h4-authz (authz.py) on every API call
  containers (slirp4netns, --disable-host-loopback)
    binds allowed: /run/h4agents/tree (read-only), /run/h4agents/models (read-only), /var/lib/h4agents/state (read-write)
```

Each layer holds a different limit. The table in [§7](#7-the-fr-039-limits-and-their-proofs) maps each FR-039 limit to the layers that hold it and the matrix row that proves it.

## 2. The endpoint and the client configuration

### 2.1 The endpoint

| Aspect | Contract |
|---|---|
| Address | `198.18.0.1:2376`, on the dummy interface `h4agents0`, which a systemd unit keeps. Check 2 found `198.18.0.0/15` unused on this host (R-21). |
| Listener | The daemon listens on `tcp://0.0.0.0:2376` inside RootlessKit's network namespace, plus its own Unix socket under `h4agents`' `XDG_RUNTIME_DIR`. RootlessKit's builtin port driver forwards `198.18.0.1:2376` to it, with `--publish 198.18.0.1:2376:2376/tcp` in `DOCKERD_ROOTLESS_ROOTLESSKIT_FLAGS`. |
| Mutual TLS | `--tlsverify`. The daemon accepts only client certificates signed by the engine's CA, and passes the certificate's common name to the admission plugin as the request's user. TLS 1.2 at least. |
| The PKI | `/etc/h4agents/pki/`, owned by root, directory 0750 with group `h4agents`: `ca.pem` (0644); `ca-key.pem` (0600, root only, never readable by `h4agents`); `server-cert.pem` (0644) with subject alternative names `IP:198.18.0.1` and `IP:127.0.0.1`, the second because sessions reach the engine through the relay's `127.0.0.1`; and `server-key.pem` (0640, group `h4agents`). The early patch adds the directory to the sandbox's `denyRead` ([env-files.md §8](env-files.md#8-the-fr-007-deny-list)). |
| Client certificates | Two, both signed by the engine's CA and valid for 397 days. `deploy/agents-engine/engine.sh setup` reissues any with fewer than 30 days left. |

| Client certificate | Common name | Directory | Modes | Who reads it |
|---|---|---|---|---|
| The agents' | `h4agents-sandbox` | `~/.config/h4reet/agents-engine/docker/` (`ca.pem`, `cert.pem`, `key.pem`) | files 0444, directory 0555 | agent sessions. Outside the sandbox's write roots, so agents can read it and not write it (plan §10). |
| The Author's | `h4agents-author` | `~/.config/h4reet-ai/agents-engine/docker/` | files 0600, directory 0700 | `engine.sh`, which the Author runs. Denied to agents by the early patch's deny on `~/.config/h4reet-ai` (tasks.md T045). |

Both identities are held to the same admission rules ([§3](#3-admission-authzpy)). The common name only tells the audit log who acted: the Author's seeding from an agent session's commands.

### 2.2 The relay

`deploy/agents-engine/docker-relay docker|make [arguments…]`, Bash, run inside the sandbox:

1. **Outside the sandbox it refuses** (`SANDBOX_RUNTIME` unset), with exit 2 and "outside the sandbox, run docker directly, or deploy/agents-engine/engine.sh".
2. **Only the Docker CLI and make.** The first argument must be `docker` or `make`. Anything else (`sh`, `bash`, `python3`, a path) is refused with exit 2, so the relay can't become a general shell for a role granted only `docker-relay docker *`.
3. **Nesting.** If `DOCKER_HOST` is already `tcp://127.0.0.1:2376` and a relay answers there, it runs the command directly, so a make target that calls another one doesn't start a second relay.
4. **The tunnel.** It reads the sandbox proxy's host, port, and any `user:pass` from `HTTPS_PROXY` and starts `socat TCP-LISTEN:2376,bind=127.0.0.1,reuseaddr,fork PROXY:<proxy host>:198.18.0.1:2376,proxyport=<proxy port>` in the background. When `HTTPS_PROXY` carries credentials (the sandbox proxy requires Basic authentication), it also passes `proxy-authorization-file=<file>`, the credentials written to a mode-0600 file in a `mktemp` work directory rather than socat's argument list, so they are not in the process table. It waits up to 5 s for the listener, or fails with "the engine's opening isn't reachable; ask the Author: deploy/agents-engine/engine.sh up".
5. **The command** runs with `DOCKER_HOST=tcp://127.0.0.1:2376`, `DOCKER_TLS_VERIFY=1`, `BUILDX_CONFIG=$TMPDIR/buildx` (the config directory is read-only), and the session's `DOCKER_CONFIG`.
6. **Cleanup.** When the command exits, it stops socat and exits with the command's status.

Why a relay at all: Docker's exec, attach, and BuildKit streams don't go through an HTTP proxy, so a plain `HTTPS_PROXY` client can't run them (R-22). Make targets that touch containers run themselves again through the relay (`docker-relay make <target>`) when `SANDBOX_RUNTIME=1` (plan §10). CLAUDE.md, in the early patch, tells sessions to prefix ad-hoc `docker` commands with it. `.claude/agents/ops.md` gains `Bash(deploy/agents-engine/docker-relay docker *)`: the Docker CLI only, never `make` through the relay, because `make -f` runs any recipe.

### 2.3 What a session's client uses

| Setting | Value | Set by |
|---|---|---|
| `DOCKER_CONFIG` | `~/.config/h4reet/agents-engine/docker` | the settings `env`, in the early patch |
| The client certificate | `$DOCKER_CONFIG/ca.pem`, `cert.pem`, `key.pem`. The Docker CLI looks for its certificates in its config directory when `DOCKER_CERT_PATH` is unset. | `deploy/agents-engine/engine.sh setup` writes them |
| `DOCKER_HOST`, `DOCKER_TLS_VERIFY` | `tcp://127.0.0.1:2376`, `1` | the relay only. Outside the relay a session has no engine at all: the default Unix socket is blocked by the sandbox. |
| `BUILDX_CONFIG` | `$TMPDIR/buildx` | the relay |
| `$DOCKER_CONFIG/config.json` | `{}`: no credentials and no `proxies` entry. Owned by the Author, mode 0444, like the certificates beside it. | `deploy/agents-engine/engine.sh setup`, which rewrites it when it is anything else |
| `ENV` | `dev-cpu`, on every stack target | the agent. Any other stack is refused on this engine by preflight's engine check ([env-files.md §10](env-files.md#10-make-up-preflight), P11). |

There is no `proxies` entry because the CLI would inject the proxy variables into every container, and Python's urllib in the breach probe and the Telegram stand-in honours them, which would send in-network calls to the proxy. Builds get the proxy as build arguments instead (`H4_BUILD_PROXY`, [env-files.md §2](env-files.md#2-stack-keys)).

**The opening itself** (in the early patch, tasks.md T045): one `sandbox.network.allowedDomains` entry, `"198.18.0.1:2376"`, and nothing else. Rejected: `allowUnixSockets`, which Linux ignores, and `allowAllUnixSockets`, which would open the host's `docker.sock` and every other socket (R-22, ADR 0016).

## 3. Admission: `authz.py`

### 3.1 The plugin

- **What it is:** a Docker authorization plugin (plugin API v1: `Plugin.Activate` answers `{"Implements": ["authz"]}`, then `AuthZPlugin.AuthZReq` and `AuthZPlugin.AuthZRes`), written in the Python standard library.
- **Where it runs:** the `h4-authz` systemd user service of `h4agents`, on a Unix socket in rootless dockerd's plugin socket directory (`$XDG_RUNTIME_DIR/docker/plugins/h4-authz.sock`; the engine task confirms the directory for Docker 28.3.3). `daemon.json` names it: `"authorization-plugins": ["h4-authz"]`.
- **Which code runs:** the copy `deploy/agents-engine/engine.sh setup` installs, root-owned, at `/usr/local/lib/h4agents/authz.py`, never the working tree's file. Neither an agent nor `h4agents` can change the code that runs ([§5](#5-host-side-controls)).
- **Fail closed:** if the plugin is down or answers badly, the daemon refuses every request (ADR 0016). Docker 28.3.3 carries the fix for CVE-2024-41110, the authorization-plugin bypass through an empty body, and the plugin refuses a missing body on its own too (A0 below).
- **Responses:** `AuthZRes` always allows; only requests are judged.

### 3.2 How a request is judged

1. **Normalize the path.** Strip a version prefix (`/v1.51/…`), split off the query string, collapse repeated slashes, and percent-decode once. A path that still holds `..`, or that decodes to something different a second time, is refused (`malformed`).
2. **Look up the endpoint** by method and normalized path in the table below. A method and path not in it is refused (`default_deny`). Docker's read-only `GET` and `HEAD` endpoints are in it (lists, inspection, logs, events, `_ping`, `version`, `info`, `system/df`).
3. **Read the body** where the endpoint takes one. A missing, empty, non-JSON, or oversized body is refused (`A0`). Docker forwards bodies up to 1 MiB; a larger one arrives without its body and is refused.
   - **Keys are read as the daemon reads them.** Docker decodes bodies with Go's `encoding/json`, which matches a key to a field case-insensitively, under simple Unicode folding (U+017F matches `s`, U+212A matches `k`). So `"hostconfig": {"privileged": true}` is a privileged container. The plugin casefolds every key, a wider folding, before any rule looks.
   - **A repeated key is refused** (`malformed`), counting keys that fold together. Go decodes both into one field, and merges a repeated object or map into the first instead of replacing it, so the plugin and the daemon would read different requests. It over-refuses on purpose: two keys of a map the client fills (labels, volumes, exposed ports) that differ only in case are refused too, though Docker would take them, and the refusal names `malformed`, not the daemon. dev-cpu's bodies hold no such keys.
   - **The create rules hold the body's top level too.** Older daemons' create wrapper embedded a deprecated `HostConfig` there, read for fields "not in the inner host config". No top-level `Config` field shares a name with a field the rules read, so a body from the docker CLI or compose is judged as before.
4. **Apply the field rules** (§3.3 and §3.4). The first refusal wins.
5. **Write the audit record** (§3.5) and answer.

| Endpoint | Rule |
|---|---|
| `POST /containers/create` | every field rule in §3.3 and §3.4 |
| `POST /containers/{id}/start` | refused with any non-empty body (`A27`: the legacy start-time `HostConfig`) |
| `POST /containers/{id}/update` | refused if `Devices`, `DeviceRequests`, or `DeviceCgroupRules` is non-empty (`A26`) |
| `POST /containers/{id}/exec` | refused with `Privileged: true` (`A25`) |
| other container writes: `stop`, `kill`, `restart`, `wait`, `attach`, `resize`, `rename`, `pause`, `unpause`, `DELETE`, `PUT /archive`, `GET /export`, `POST /exec/{id}/start`, `POST /exec/{id}/resize` | allowed |
| `POST /volumes/create` | the volume rule (`A17`) |
| `POST /networks/create` | allowed for the `bridge` driver (or none named); refused for `host`, `macvlan`, `ipvlan`, `overlay`, and any other driver (`A35`) |
| `POST /networks/{id}/connect`, `disconnect`; `DELETE` of networks and volumes; the `prune` endpoints | allowed: the engine is disposable |
| `POST /images/create` (pull), `POST /images/load`, `POST /images/{name}/tag`, `DELETE /images/{name}`, `POST /commit` | allowed. Pulls go through the egress proxy ([§4](#4-egress-the-proxy)). |
| `POST /images/{name}/push` | refused (`A32`): nothing leaves the engine as an image |
| `POST /auth` | refused (`A33`): no registry login on the engine |
| `POST /build` | refused with `networkmode=host`, or with a `remote` context the daemon would fetch itself (`A30`) |
| `POST /session`, `POST /grpc` (BuildKit) | allowed. The plugin can't read a BuildKit request's entitlements inside the stream, so the daemon's own configuration holds that limit: it grants neither `network.host` nor `security.insecure` (`daemon.json`, [§5](#5-host-side-controls)), and row E8c proves a build that asks is refused. |
| `POST /plugins/*`, `DELETE /plugins/*` | refused (`A28`). `GET /plugins` is allowed. |
| any write under `/swarm`, `/services`, `/nodes`, `/secrets`, `/configs`, `/tasks` | refused (`A29`) |

### 3.3 Container fields

For `POST /containers/create`. A field that is absent or null is allowed unless the table says otherwise.

| ID | Field | Allowed | Refused |
|---|---|---|---|
| A1 | `HostConfig.Privileged` | `false` | `true` |
| A2 | `HostConfig.Devices` | empty | any entry, such as `/dev/dxg`, `/dev/kvm`, or `/dev/fuse` |
| A3 | `HostConfig.DeviceRequests` | empty | any entry: `--gpus` |
| A4 | `HostConfig.DeviceCgroupRules` | empty | any entry |
| A5 | `HostConfig.CapAdd` | capabilities in Docker's default set, with or without `CAP_`, in any case: `CHOWN`, `DAC_OVERRIDE`, `FSETID`, `FOWNER`, `MKNOD`, `NET_RAW`, `SETGID`, `SETUID`, `SETFCAP`, `SETPCAP`, `NET_BIND_SERVICE`, `SYS_CHROOT`, `KILL`, `AUDIT_WRITE`. Adding these back after `cap_drop: [ALL]` gives a container nothing it wouldn't have by default; plan §1's databases do exactly that. | `ALL`, and every other capability: `SYS_ADMIN`, `NET_ADMIN`, `SYS_PTRACE`, `SYS_MODULE`, `BPF`, `PERFMON`, `DAC_READ_SEARCH`, … |
| – | `HostConfig.CapDrop` | anything | – |
| A6 | `HostConfig.SecurityOpt` | `no-new-privileges`, `no-new-privileges:true`, `no-new-privileges=true` | anything else: `seccomp=…` (unconfined or a custom profile), `apparmor=…`, `label=…`, `systempaths=unconfined`, `no-new-privileges:false`, `writable-cgroups=true` |
| A7 | `HostConfig.MaskedPaths`, `HostConfig.ReadonlyPaths` | absent or null, so Docker's defaults apply | any value, even the defaults spelled out |
| A8 | `HostConfig.PidMode` | empty, `container:<id>` | `host` |
| A9 | `HostConfig.IpcMode` | empty, `private`, `shareable`, `none`, `container:<id>` | `host` |
| A10 | `HostConfig.UTSMode` | empty | `host` |
| A11 | `HostConfig.UsernsMode` | empty | `host`, or any other value |
| A12 | `HostConfig.CgroupnsMode`, `HostConfig.Cgroup` | empty or `private`; `Cgroup` empty | `host`; any `Cgroup` |
| A13 | `HostConfig.NetworkMode` | `default`, `bridge`, `none`, a user-defined network, `container:<id>` | `host`: in rootless mode that is RootlessKit's namespace, where the API listens |
| A16 | `HostConfig.VolumeDriver` | empty, `local` | any other driver |
| A18 | `HostConfig.VolumesFrom` | allowed: other engine containers | – |
| A19 | `HostConfig.Sysctls` | empty | any entry |
| A20 | `HostConfig.Runtime` | empty, `runc` | anything else, such as `nvidia` |
| A21 | `HostConfig.PortBindings`, `PublishAllPorts` | a binding whose `HostIp` is `127.0.0.1` or `::1`: RootlessKit publishes it on the host's loopback as `h4agents`, out of the sandbox's reach (rows E14, E15) | a binding with no `HostIp` or an empty one, which Docker reads as every interface, so RootlessKit would listen on the WSL VM's own interfaces (H3); any other address; `PublishAllPorts` |
| A22 | `HostConfig.ExtraHosts` | allowed: a name pointing anywhere still meets the firewall | – |
| A24 | `HostConfig.LogConfig.Type` | empty, `local`, `json-file`, `none` | every other driver (`syslog`, `journald`, `gelf`, `fluentd`, `awslogs`, `splunk`, …): they write to host sockets or the network |
| – | `Config.Env`, `Config.Cmd`, `Config.User`, `Image`, resources, `RestartPolicy`, `Init`, `AutoRemove` | allowed, and never written to the audit log | – |

### 3.4 Mounts and volumes

The three roots, and nothing else, may be bind sources:

| Root | Mode | What it is |
|---|---|---|
| `/run/h4agents/tree` and anything under it | read-only, required | the masked, read-only view of the working tree ([§5](#5-host-side-controls)) |
| `/run/h4agents/models` and anything under it | read-only, required | the stand-in model ([§6](#6-seeding)) |
| `/var/lib/h4agents/state` and anything under it | read-write allowed | the engine stack's journal and incident drafts (dev-cpu's `H4_STATE_DIR`), wiped by `engine.sh reset` |

| ID | Where the request names a mount | Allowed | Refused |
|---|---|---|---|
| A14 | `HostConfig.Binds`, `source:target[:options]` | a source that isn't an absolute path is a named volume: allowed. An absolute source, after lexical normalization, under a root above, with `ro` under the two read-only roots. Options: `ro`, `rw` (state only), `nocopy`, `private`, `rprivate`. | any other absolute source: `/`, `/home/**`, `/mnt/**`, `/run/WSL`, `/run/user/**`, `/run/dbus`, `/var/run/docker.sock` and `/run/docker.sock`, `/etc`, `/proc`, `/sys`, `/dev`, `/usr/lib/wsl`; a source holding `..`; `rw` under a read-only root; the options `shared`, `rshared`, `slave`, `rslave`, `z`, `Z` |
| A15 | `HostConfig.Mounts` | `Type: bind` under the rule of A14, with `ReadOnly: true` under the read-only roots and `BindOptions.Propagation` empty, `private`, or `rprivate`; `Type: volume` whose driver configuration passes A17; `Type: tmpfs`; `Type: image` | `Type: bind` outside the roots; `Type: npipe` and `Type: cluster`; a volume whose driver options bind a host path |
| A17 | `POST /volumes/create`, and `VolumeOptions.DriverConfig` inside `Mounts` | driver empty or `local`, with no options, or with `type=tmpfs` and `device=tmpfs` and size or mode options only | any other driver; a `local` volume whose `o` holds `bind` or `rbind`, or whose `device` is a path: that is a bind mount in disguise; any `type` but `tmpfs` (`nfs`, `cifs`, `none`, …) |

**Symlinks.** A lexical check can't see a symlink inside a root, and an agent can create one in the working tree that points at `/run/WSL`. So the three roots are mounted `nosymfollow` ([§5](#5-host-side-controls)): the kernel refuses to follow any symlink on them, and a bind through one fails with `ELOOP` (row E5c). The plugin also resolves the source's real path where it can see it and refuses one that leaves its root, as a second layer.

### 3.5 The audit record

One JSON line per decision in `/var/log/h4agents/authz.jsonl`: written by `h4agents`, mode 0640 in a 0750 directory, outside the engine's data root, so `engine.sh reset` keeps it; rotated by the plugin at 10 MB, keeping 5 files. The Author reads it with `make engine-status` or `sudo`.

| Field | Content |
|---|---|
| `ts` | UTC, milliseconds |
| `decision` | `allow` or `refuse` |
| `rule` | the rule's ID (`A1` to `A35`), `default_deny`, `malformed`, or `A0` for a missing body |
| `user` | the client certificate's common name: `h4agents-sandbox` or `h4agents-author`; `unknown` for a request with none, which only a client on the daemon's own unix socket, running as `h4agents`, can send |
| `method`, `path` | the normalized path, with the query's keys but not its values |
| `endpoint` | the table's name for it, such as `containers.create` |
| `field`, `value` | for a refusal: the field and the offending value: a bind source and its mode, a capability, a device path, a mode such as `host`. Never an environment variable, a command, or a body. |
| `container`, `image` | for `containers.create`: the requested name and the image reference |

The plugin's log, the egress proxy's log ([§4](#4-egress-the-proxy)), and the firewall's drop counter are SC-003's audit records for the engine (plan §13).

## 4. Egress: the proxy

`egress-proxy.py`, standard library only: a systemd user service of the Author's (`h4-egress-proxy.service`), running the root-owned copy at `/usr/local/lib/h4agents/egress-proxy.py` and listening on `198.18.0.1:3128` only. Lingering is on for the Author's user (H1), so the proxy runs without a login. The firewall lets `h4agents`' traffic reach this port and nothing else ([§5](#5-host-side-controls)), so it is the engine's only way out.

**The list.**
- At start it reads `sandbox.network.allowedDomains` from the repository's `.claude/settings.json`, which only the Author changes, so the engine's list and the sandbox's are the same by construction (FR-039).
- **It fails closed on the list.** If the file is missing, unreadable, or not valid JSON, or is valid JSON of another shape (the file, its `sandbox`, or its `network` not an object, or a `deniedDomains` that isn't a list), or the list it yields is empty, the proxy refuses every request with `no_list`, logs that at most once a minute rather than once a request, and keeps refusing until it restarts with a readable list. It never falls back to allowing.
- It keeps hostname entries only. It drops IP literals and `host:port` entries, so the opening `198.18.0.1:2376` never becomes a destination.
- An entry starting with `*.` matches any subdomain; any other entry matches exactly. A host in `deniedDomains` is refused even if listed.
- The list is fixed until the proxy restarts. `deploy/agents-engine/engine.sh up` restarts it, and `make engine-status` shows the digest of the list in use next to the digest of the settings' current list. Both come from the proxy's own code. When it starts serving, the proxy records `{"digest": "<sha256 hex>", "hosts": [...]}` in `~/.local/state/h4reet/agents-engine/egress-list.json` (`H4_EGRESS_LIST_FILE`): mode 0600, written to a temporary name and renamed, never through a link. `egress-proxy.py --list <settings.json>` prints the same line for a settings file, exits 0, or 3 when it yields no list, and starts no listener. `hosts` is the allowed entries as the proxy serves them, sorted, each once; the digest covers the denied entries too, so a change to either list shows.

**What it allows,** and only for a listed host:
- `CONNECT <host>:443`, as a plain tunnel. It never intercepts TLS. Bytes the client sends after its request, before the proxy answers, go to the host once the tunnel opens.
- An absolute-form `GET http://<host>/…` on port 80, forwarded with its query and the client's headers, minus the hop-by-hop ones (`Connection` and each header it names, `Keep-Alive`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`) and every `Proxy-*` header, so the client's proxy credentials never leave. `Host` is set from the request-target, and `Connection: close` ends the exchange after one response. A request-target with a space or a control character, or a head longer than 16 KiB, is refused (`method`).

**What it refuses:** every other method and port, origin-form requests, IP-literal destinations (`ip_literal` on any port, bracketed IPv6 too, so `198.18.0.1:2376` and `169.254.169.254:80` are logged as IP literals rather than as ports), unlisted hosts, and any listed name that resolves to an address that isn't global unicast: loopback, RFC 1918, link-local (including `169.254.169.254`, the instance-metadata address), `100.64.0.0/10`, `198.18.0.0/15`, multicast, and the IPv6 equivalents (`::1`, `fc00::/7`, `fe80::/10`). It resolves each name once, as the Author's user, and connects to the address it checked, so a rebinding name can't swap it afterwards.

**Limits:** 64 tunnels at once; 10 s to connect; 120 s idle.

**What the client is told:** `403` for a refused request; `503` with no list (`no_list`) or at the tunnel cap (`tunnel_cap`); `502` when a listed name doesn't resolve or its address doesn't answer (`upstream_unreachable`).

**The log:** one JSON line per decision in `~/.local/state/h4reet/agents-engine/egress.jsonl`, owned by the Author, except that `no_list` is written at most once a minute; the early patch's `denyWrite` on `~/.local/state/h4reet` keeps agents from editing it. Fields: `ts`; `decision`; `reason` (`allowed`, `not_on_list`, `no_list`, `denied_domain`, `ip_literal`, `non_global_address`, `upstream_unreachable`, `tunnel_cap`, `method`, `port`); `method`; `host`; `port`; `path` for a GET, without its query; `bytes_up`; `bytes_down`; `duration_ms`.

**Who uses it:**
- the rootless daemon's own pulls: the unit sets `HTTPS_PROXY=http://198.18.0.1:3128` and `NO_PROXY=127.0.0.1,localhost`;
- builds, through the `H4_BUILD_PROXY` build arguments ([env-files.md §2](env-files.md#2-stack-keys));
- nothing else: no container gets proxy variables.

**What can't come through it,** with today's list (`registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, `ghcr.io`):
- **Images from any registry.** ghcr.io answers, but it serves its blobs from `pkg-containers.githubusercontent.com`, which isn't on the list. ECR Public, Docker Hub, and Quay aren't on it either. So every image comes from the host by digest ([§6](#6-seeding)).
- **Models.** Hugging Face isn't on the list; the stand-in is seeded.
- **What works:** npm and PyPI, so `npm ci` runs in the engine's builds.

**The devcontainer image isn't built here.** Its build downloads Node from nodejs.org and runs apt against Ubuntu's mirrors, and neither is on the list. Adding them would widen agents' egress too, which CLAUDE.md says to ask about rather than do. On the engine, the image gate builds the compose images only: the gateway, the Telegram stand-in, and the probe. Their bases are seeded, and their `npm ci` goes through the proxy. The Author's gate builds the devcontainer image on the host's engine ([plan.md §11](../plan.md#11-local-gates-fr-041)), and so does whoever opens the devcontainer.

The proxied pulls are disclosed as the "Development time: the engine's proxied pulls" flow (plan §17).

## 5. Host-side controls

`deploy/agents-engine/engine.sh setup` sets these, once, with sudo, then asks for one `wsl --shutdown` (plan §10). Check 2's facts are from research.md R-21.

| # | Control | How it is set | What it prevents | Check 2 found | Row |
|---|---|---|---|---|---|
| H1 | The user `h4agents` | home `/var/lib/h4agents/home` (0700), shell `/usr/sbin/nologin`, lingering on so its services run without a login; not in `docker`, `h4gpu`, or `sudo`. Lingering is also enabled for the Author's user, whose user service is the egress proxy ([§4](#4-egress-the-proxy)). | The host's `docker.sock` (root:docker, 0660) refuses it. No one logs in as it. | – | E1, E2 |
| H2 | Its own subordinate ID range | `usermod --add-subuids` and `--add-subgids` `1065536-1131071`: 65,536 IDs that don't overlap the Author's range, or anyone's. Setup refuses, naming the entry, when that range, or any range `h4agents` already holds, overlaps an entry of `/etc/subuid` or `/etc/subgid` that isn't `h4agents`', by name or uid; a line it can't read counts as one. It checks both files before it changes either, and leaves an `h4agents` entry with that range as it is. | Container IDs never map into the Author's own subordinate IDs, so files a container writes can't belong to the Author's rootless resources. | `/etc/subuid` and `/etc/subgid` held ranges only for the Author | E2 |
| H3 | The engine's address | the dummy interface `h4agents0` with `198.18.0.1/32`, kept by `h4agents-net.service` | Nothing listens on a real interface. `198.18.0.0/15` is a benchmarking range that no network routes, so the LAN can't reach the engine. | `198.18.0.0/15` unused | E9, E15 (A21) |
| H4 | The firewall | `h4agents-nft.service` loads `/usr/local/lib/h4agents/h4agents.nft`: table `inet h4agents`, chain `output` (hook output, priority 0, policy accept): `meta skuid != "h4agents" accept`; `ct state established,related accept`; `ip daddr 198.18.0.1 tcp dport 3128 accept`; then a named counter `h4agents_dropped`, `log prefix "h4agents-drop "` limited to 10 a second, and `drop`. The file replaces only its own table and never flushes the ruleset, so rootful Docker's rules stay untouched. | Every connection a container makes leaves the namespace through slirp4netns as `h4agents`, so this one rule holds them all: no internet, no LAN, no DNS, none of the host's stacks on the WSL address or the bridge networks, not the engine's own API, only the proxy. | – | E4, E8 |
| H5 | No host loopback | RootlessKit with slirp4netns and `--disable-host-loopback` (`DOCKERD_ROOTLESS_ROOTLESSKIT_NET=slirp4netns`, `DOCKERD_ROOTLESS_ROOTLESSKIT_DISABLE_HOST_LOOPBACK=true`), with slirp4netns's own sandbox and seccomp on | Containers can't reach the host's `127.0.0.1`: prod's and dev's ports, their admin listeners, and x004. | – | E4 |
| H6 | The GPU | `h4agents-dxg.service` sets `/dev/dxg` to root:`h4gpu`, mode 0660, at every boot; the Author joins `h4gpu`. Rootful Docker runs as root and keeps the GPU. | `h4agents` can't open the GPU device, even if one were passed in (A2 and A3 refuse that first). | `/dev/dxg` was 0666, open to every user | E3 |
| H7 | Windows files | `/etc/wsl.conf`: `[automount] options = "metadata,umask=077,fmask=077"`, merged with the file's other settings; effective after one `wsl --shutdown` | Only the Author can open `/mnt/c` (and `/mnt/d`): not `h4agents`, and not a container that a bind somehow reached. With `metadata`, a file that already carries Linux permissions keeps them; the row checks the Author's Windows profile. | `/mnt/c` mounted with no `umask`, readable by every user | E5 |
| H8 | The masked tree | `h4agents-tree.service` (root): a bind of the working tree at `/run/h4agents/tree` with `ro,nosuid,nodev,nosymfollow`; an empty read-only tmpfs over every path in `deploy/agents-engine/tree-masks.txt`: `deploy/env`, `corpus/intake/private`, `secrets`, and `.git` (an empty file instead, where `.git` is a file). `engine.sh up` creates a listed directory that doesn't exist yet as an empty 0700 directory, so its mask always applies. It refuses to start the tree, naming the path, while the sandbox read-denies a path inside the tree that the list lacks (it reads `sandbox.filesystem.denyRead` and the `Read(...)` denies in `.claude/settings.json`), or while a file matching a denied glob (`.env*`, `*.env`, except `*.env.example`) exists outside a masked path, or while the installed list differs from the working tree's. The repository's path is fixed at `engine.sh setup`. **Propagation:** the bind is made a slave of the repository's mount and then shared in a peer group of its own, before any mask, so no mask can propagate back onto the Author's tree (mount_namespaces(7): a bind of a shared mount joins its peer group). If a mask reaches the repository anyway, the unit unmounts everything and fails. **Order:** h4agents' `docker.service` starts only after `bind-tree.sh check` finds the tree and every mask mounted, so the daemon's mount namespace, a copy of the host's when it starts, always holds them; the unit's reload mounts a new mask without unmounting any, and it reaches a running engine through the bind's peer group. | Containers can't write the tree (`EROFS`), can't read the paths the sandbox denies, and can't follow a symlink an agent planted in the tree. | the Author's home is mode 750, so the bind is the only way in | E5, E6, E7 |
| H9 | The models share | `/var/lib/h4agents/models` (root, 0755; files 0444), bound at `/run/h4agents/models` with `ro,nosuid,nodev,nosymfollow` | Containers see only the stand-in model, and can't change it. | – | E6 |
| H10 | The state root | `/var/lib/h4agents/state` (`h4agents`, 0700), bound onto itself with `nosuid,nodev,nosymfollow`; wiped by `engine.sh reset` | A symlink a container writes into the state can't redirect a later bind. | – | E5 |
| H11 | The Author's home | stays mode 750; `h4agents` isn't in the Author's group | `h4agents` can't traverse it to the repository, `~/.config/h4reet-ai`, or anything else. | home 750 | E11 |
| H12 | The limits | `/etc/systemd/system/user-<uid>.slice.d/h4agents.conf` for `h4agents`' uid: `CPUQuota=400%`, `MemoryMax=16G`, `TasksMax=4096` | The engine can't starve prod of CPU or memory (the host has 24 CPUs and 62 GB). 16 GB holds the dev-cpu stack's summed memory limits, about 13.2 GiB with the breach probe, with room to spare; its real use is 5 to 6 GB ([env-files.md §10](env-files.md#10-make-up-preflight), P15). | cgroup v2 with the systemd driver | E13 |
| H13 | Installed copies | `engine.sh setup` copies `authz.py`, `egress-proxy.py`, `h4agents.nft`, `daemon.json`, and the units from `deploy/agents-engine/` into root-owned `/usr/local/lib/h4agents/` and `/etc/systemd/` | The running engine never executes the working tree's files. An agent can't change what runs, even before the early patch's deny on `deploy/agents-engine`. `h4agents` can't change the root-owned copies, but it owns its user manager, its units, and its `daemon.json`, so a process running as `h4agents` could start something else in their place. That is ADR 0016's residual risk: such a process is already inside the boundary, and the engine gives it nothing `h4agents` lacks. A reviewed change takes effect when the Author runs `engine.sh setup` again. | – | – |
| H14 | The daemon | `dockerd-rootless.sh` as `h4agents`' `docker.service`, with `daemon.json`: `"features": {"containerd-snapshotter": true}`, `"authorization-plugins": ["h4-authz"]`, `"tls": true`, `"tlsverify": true` and the PKI paths, `"hosts"` with its Unix socket and `tcp://0.0.0.0:2376` (in `daemon.json` or as `-H` flags, never both), `"builder": {"entitlements": {"network-host": false, "security-insecure": false}}`, `"log-driver": "local"` with 10 MB × 3, `"live-restore": false`, and `"ip": "127.0.0.1"`, the default address of a published port, behind A21 | Admission on every call; mutual TLS; no BuildKit build with host networking or insecure entitlements; digests that survive seeding | the rootless extras, uidmap, slirp4netns 1.2.1, and nftables installed; systemd is PID 1 | E8, E12 |

The two sockets check 2 found open (R-21): WSL's interop sockets under `/run/WSL` (0777) and the D-Bus system bus (0666). The plugin keeps containers off both (A14 refuses binds of `/run/WSL` and `/run/dbus`), and row E5 proves it. A process that escaped a container onto the host as `h4agents` could still use them; that is part of the residual risk in [§9](#9-degraded-modes-and-residual-risk).

## 6. Seeding

### 6.1 The host's Docker moves to the containerd image store first

`docker save | docker load` keeps an image's index digest only when both daemons use the containerd image store, and only then do `image@sha256:…` pins resolve offline on the engine. Check 2 found the host's Docker on the classic `overlay2` store (R-21). Before the first seed, the Author, in their own terminal, with no agents working, after the disk preflight ([env-files.md §10](env-files.md#10-make-up-preflight), P13):

1. `make down ENV=prod` and `make down ENV=dev`. Named volumes, the meters with them, don't depend on the image store and survive.
2. `docker image prune -a`, which removes the images nothing uses. With the stacks down, that is all of them. Images left in the old store stay on disk, invisible, until that store is active again, so the prune comes first.
3. Add `"features": {"containerd-snapshotter": true}` to `/etc/docker/daemon.json`, beside the `nvidia` runtime entry `nvidia-ctk` wrote.
4. `sudo systemctl restart docker`. Check: `docker info --format '{{json .DriverStatus}}'` names `io.containerd.snapshotter.v1`.
5. `make pull`, then `make up` for the host stacks.

### 6.2 `engine.sh seed`

The Author's terminal. `deploy/agents-engine/engine.sh seed`:

0. **The image stores.** It refuses, before anything else, unless the host's `docker info --format '{{json .DriverStatus}}'` names `io.containerd.snapshotter.v1` ([§6.1](#61-the-hosts-docker-moves-to-the-containerd-image-store-first)), and while the engine doesn't answer on `198.18.0.1:2376`, since what it lacks can't be known without it.
1. **The disk check,** engine.sh's own copy of the rule in [env-files.md §10](env-files.md#10-make-up-preflight) P13, before any pull on the host: free space on the Windows drive (`H4_VHDX_MOUNT` from `dev-cpu.vars`, `/mnt/c` by default) and on ext4 must cover the host-side size of every image still to seed, the ones the engine lacks, plus a 20 GB margin. An image the host must pull first has no size yet, so it counts as P13's 12 GB for images missing locally. Once the pulls are done, and before any load, it checks again with their real sizes. It names both figures if it refuses, and a figure it can't read fails closed. The boundary code never calls agent-editable code.
2. **Which images:** every `deploy/images.lock` entry dev-cpu uses, which is every service image except `model-server-gpu`, plus the gate and devcontainer bases. The CUDA image is never seeded: the engine has no GPU. An entry with no digest yet is named in a note and not seeded.
3. **For each the engine lacks:** `docker pull <repository>:<tag>@<digest>` on the host if it is missing there too; then `docker save --platform linux/amd64 <repository>:<tag>@<digest>`, piped into `docker load` on the engine over `tcp://198.18.0.1:2376` with the Author's client certificate.
4. **Verify:** on the engine, `docker image inspect <repository>@<digest>` succeeds for every entry. It prints a table: image, digest prefix, and `seeded`, `present`, or `FAILED`, and exits non-zero on any `FAILED`.
5. **The stand-in model:** it verifies the host cache's copy (`H4_MODEL_DIR` of the dev stack, `~/.local/share/h4reet/models` by default) against `models.lock`'s sha256, then copies it into `/var/lib/h4agents/models/` with sudo: a temporary name, fsync, rename, mode 0444, owned by root. The prod model is never copied.

6. **dev-cpu's state directory:** the state root is `h4agents`' and 0700, so only the engine can make `dev-cpu/gateway` and give it to the gateway's `node` user, uid 1000 in the container: `docker run --rm --pull never -v /var/lib/h4agents/state:/s <base:node> sh -c 'mkdir -p /s/dev-cpu/gateway && chown -R 1000:1000 /s/dev-cpu'`. The image is `images.lock`'s one `base:node` line, by digest, with each field in its shape, so no field reaches `docker run` as an option. A missing, repeated, or malformed line, or a run that fails, fails the seed with the engine's own last line. `engine.sh up` takes the same step, but there the image may not be seeded yet, so a failure is a note (tasks.md T145 and its review).

The engine never downloads a model, and pulls nothing from a registry outside the list. Only what `images.lock` pins is seeded. `deploy/agents-engine/engine.sh reset` seeds again as its last step.

## 7. The FR-039 limits and their proofs

Matrix stage E: `deploy/agents-engine/prove-limits.sh`, run from the host by `deploy/agents-engine/engine.sh prove` (plan §13). Each row is one probe, and its result goes in the merge-request note. API probes use the agents' client certificate, so they test exactly what a session can do; no row needs the Author's, which only `engine.sh` uses, in rows E7 (`up`) and E10 (`reset`). Host-side probes use `sudo -u h4agents`. A row passes only on what it saw: a probe that can't run fails its row, and its detail says why. The sandbox's half of the opening is matrix stage S, run inside a session.

| Row | FR-039's words | Probe | Expected | Held by |
|---|---|---|---|---|
| E1 | "MUST NOT run privileged on the host's engine" | the engine's `dockerd`, and a probe container's processes (its root, and a child that drops to uid 1000), by owner on the host; `docker info` on the engine; the host's `docker ps -a` for any `h4reet-dev-cpu` container; a `--privileged` container | `dockerd` and the container's root run as `h4agents`, its uid 1000 as one of `h4agents`' subordinate IDs, never as root or the Author; the engine reports `rootless`; no engine container on the host's daemon; `--privileged` refused (A1) | H1, H2, A1 |
| E2 | "MUST NOT reach the host's container engine" | `sudo -u h4agents` opening `/var/run/docker.sock`; a container binding it | `EACCES`; the bind refused (A14); `h4agents` in no `docker` group | H1, H2, A14 |
| E3 | "the GPU" | `--gpus all`; `--device /dev/dxg`; `--device-cgroup-rule`; `ls /dev` inside a plain container; `sudo -u h4agents` opening `/dev/dxg`, and any `/dev/nvidia*` on the host, for reading and for writing | refused (A3, A2, A4); no `/dev/dxg` or `/dev/nvidia*` inside; `EACCES` | H6, A2–A4 |
| E4 | "the host's stacks" | from a probe container: TCP to `10.0.2.2` on 18000–18004 and 18100–18104; to the WSL address (`eth0`) and the gateways of the host daemon's bridge networks on the same ports; to the addresses of prod's and dev's containers, on the ports each exposes or publishes and the stacks' own service ports, for each stack that is running (one that isn't is named, not probed). An address inside one of the engine's own networks never leaves the engine, so it is counted and set aside | refused or timed out; the firewall's `h4agents_dropped` counter grows whenever a probe left the engine | H4, H5 |
| E5 | "the Author's files and credentials" | binds and `Mounts` of `/home/h4reet`, `/home/h4reet/.config/h4reet-ai`, `/run/WSL`, `/run/dbus`, `/mnt/c`, `/`, `/etc`; a local volume with `o=bind,device=/home/h4reet`; a read-write bind of the tree; (E5c) a bind through a symlink to `/etc` planted in the tree, and one planted in the state root; `mount(2)` inside a probe container; (E5d) `sudo -u h4agents` listing `/mnt/c/Users` and each profile in it; the mount table of a probe container with the tree and the models bound | every bind refused (A14, A15, A17); E5c's binds refused by A14's real-path check or failing with `ELOOP` (the row names which), and the `mount` refused (`EPERM`); E5d `EACCES`; the probe's only host mounts are the tree and the models, both read-only | H7, H8, H10, A14–A17 |
| E6 | "MAY see the working tree only read-only" | inside a container with the tree and the models bound: a write; a `mount -o remount,rw` | `EROFS`; the remount refused | H8, H9 |
| E7 | "…and without the paths the sandbox denies" | inside a container with the tree bound: each path in `tree-masks.txt` that exists, in the container's own mount table (a listing alone can't tell a mask from a directory the container can't read); every `*.env`, `.env`, or `.env.*` file in the tree other than a `*.env.example` template. On the host: each read deny of `.claude/settings.json` (`sandbox.filesystem.denyRead`, and the `Read(...)` rules) that names a path inside the tree, against the installed list, and the installed list against the tree's; `engine.sh up` with an env file planted outside a masked path | every listed path a read-only, empty mask; no env file; the list complete, and the tree's own; `engine.sh up` refuses and names the file | H8 |
| E8 | "Its containers MUST be held to the sandbox's network allowlist" | through the proxy, as `h4agents`: `https://registry.npmjs.org/`, `https://example.com`, `https://github.com`, `https://api.anthropic.com`; `CONNECT` to `198.18.0.1:2376`, `10.0.0.1:443`, and `169.254.169.254:80`; each refusal's line in the proxy's log. Without it, from a probe container: TCP to `1.1.1.1:443`; a DNS query. (E8c) a BuildKit build with `RUN --network=host` and `--allow network.host`; the classic builder's `docker build --network host` (`DOCKER_BUILDKIT=0`). (E8d) the list the running proxy wrote when it started (`egress-list.json`) against `egress-proxy.py --list` on the settings now, and that against `allowedDomains`' hostnames | npm 200; the three hosts refused and logged (`not_on_list`, or `denied_domain` for a host the settings deny); the IP destinations refused and logged (`ip_literal`); no route; no DNS answer; both builds refused, BuildKit's by the daemon's entitlements and the classic one by A30 (either refusal passes, and the row names which); the lists equal | H4, H14, [§4](#4-egress-the-proxy) |
| E9 | "the opening MUST reach that engine and nothing else" | on the host: the listeners on `198.18.0.1`, with their processes and owners (`ss -ltnp`, as root); a `GET /_ping` to 2376, the server verified with the engine's CA, with no client certificate, with one from another CA, and, as the control, with the agents'. A request, not only a handshake: TLS 1.3 reports a missing client certificate after the handshake completes. Stage S, inside a session: `198.18.0.1:2376` with the agents' certificate; `198.18.0.1:3128`; `198.18.0.1:22`; `127.0.0.1` on every stack and admin port | only RootlessKit (as `h4agents`) on 2376 and the proxy (as the Author) on 3128, and no other socket bound to `198.18.0.1`; with no certificate and with the other CA's, the TLS layer refuses before any HTTP answer, where the agents' certificate gets 200; in the session, 2376 answers and everything else is refused | H3, mutual TLS, the one `allowedDomains` entry |
| E10 | "disposable means it can be destroyed and recreated with one command and holds nothing the Author needs" | `deploy/agents-engine/engine.sh reset` (Heavy: it seeds about 10 GB again); then the engine's ID, its volumes and containers, the state root, and any file under the data root owned by the Author's uid | a new ID; no volumes, no containers, an empty state root, no file of the Author's; every seeded image back | §8 |
| E11 | "the Author's files" (the home directory) | `sudo -u h4agents ls /home/h4reet`; reading a file inside `~/.config/h4reet-ai` (the newest token or env file, else any file there), not the directory, which no one can read as a file | `EACCES` | H11 |
| E12 | (admission fails closed, ADR 0016) | stop `h4-authz`, then `docker ps` through the API; start it again | refused while the plugin is down; allowed after | H14 |
| E13 | (the slice limits, plan §10) | `systemctl show` on `h4agents`' slice | `MemoryMax` 16G, CPU quota 400%, `TasksMax` 4096 | H12 |
| E14 | (dev-cpu's ports reach only the host's own loopback, plan §1) | with dev-cpu up: from the host, `127.0.0.1:18300` to `18304`; from the sandbox, the same ports | from the host, they answer: RootlessKit publishes them there, as `h4agents`, for the Author's browser. From the sandbox, refused by the proxy (row E9) | §2.1 |
| E15 | (nothing the engine runs listens on a real interface, H3) | `docker run -p 18999:80`, `-P --expose 80`, and `-p 0.0.0.0:18999:80`; then `-p 127.0.0.1:18999:80` | the first three refused (A21); the loopback one runs | A21, H3 |
| E16 | (the plugin reads a body as the daemon does, §3.2) | raw `POST /containers/create` bodies, with the agents' certificate: `"hostconfig": {"privileged": true}`; `"HostConfig": {}` followed by `"hostConfig": {"Privileged": true}`; `"Privileged": true` at the top level | each refused with 403, and no container created | §3.2 |

Rows E1 to E11 are plan §13's list, E9 by its own number. E12 to E14 are this contract's additions. The definition and the opening changing only by the Author's hand is proved by stage H (edits to `deploy/agents-engine/**` and `.claude/settings.json` blocked; `engine.sh` blocked for agents except its `smoke` and `status` subcommands) and stage S (`deploy/agents-engine` unwritable) (plan §13).

**The positive half,** US3-9: `make engine-smoke`, run in a session: `make up ENV=dev-cpu` comes up healthy, `make breach-test ENV=dev-cpu` passes, and `make down ENV=dev-cpu` stops it ([quickstart.md](../quickstart.md)).

**SC-003's audit records** for the engine are the plugin's log ([§3.5](#35-the-audit-record)), the proxy's log ([§4](#4-egress-the-proxy)), and the firewall's counter and journal lines, which `engine.sh prove` excerpts into its report: decisions only, never a body.

## 8. Commands

The Author runs `deploy/agents-engine/engine.sh <subcommand>` directly, never through make. A recipe in the agent-editable Makefile, or a planted `GNUmakefile`, would otherwise sit between the Author's sudo and the human-only code: the same reason the gate runs directly ([plan.md §11](../plan.md#11-local-gates-fr-041)). Agents have two make targets, `engine-smoke` and `engine-status`. bash-gate blocks every other `engine.sh` subcommand for agents, in the early patch (plan §13, §15). `engine.sh prove` is Heavy: E10 resets and reseeds the engine, and E14 needs dev-cpu up, so it runs with no agent session using the engine.

| Command | Who runs it | What it does |
|---|---|---|
| `engine.sh setup` | the Author, with sudo | `sudo deploy/agents-engine/setup-host.sh`, idempotent: H1 to H14 in [§5](#5-host-side-controls); the PKI and both client certificates (reissued with fewer than 30 days left); the installed copies. It ends by asking for `wsl --shutdown` from PowerShell, which ends every WSL session, agents' included, and then `deploy/agents-engine/engine.sh up`. |
| `engine.sh up` | the Author | checks the masks (H8), starts the system units (the address, the firewall, `/dev/dxg`, the tree and models binds, the state bind), reloads the tree unit and runs `bind-tree.sh check`, `h4agents`' `h4-authz` and `docker` user services; restarts the Author's proxy, so it serves the settings' list as it is now; waits for TLS on `198.18.0.1:2376`; makes dev-cpu's state directory ([§6.2](#62-enginesh-seed), step 6), or notes that it waits for the seed; prints the engine's ID and `docker info`'s summary. It may ask for sudo. |
| `engine.sh down` | the Author | stops the daemon, the plugin, and the proxy. Data stays. |
| `engine.sh reset` | the Author | `engine.sh down`; deletes the daemon's data root (its images, containers, and every volume) and the contents of `/var/lib/h4agents/state`; `engine.sh up`; `engine.sh seed`. The reset takes about a minute; the seed adds its load time. The PKI, the models share, and the plugin's log survive. |
| `engine.sh destroy` | the Author | `engine.sh down`; removes the units, the firewall table, the dummy interface, the binds, the data root, the state, the models share, the PKI, and both client certificates. It keeps the user and its ID range, and the two host settings that protect the Author's files whether or not an engine exists (H6, H7). |
| `engine.sh seed` | the Author | [§6.2](#62-enginesh-seed) |
| `engine.sh prove` | the Author | `deploy/agents-engine/prove-limits.sh`: rows E1 to E16 with PASS or FAIL, the log excerpts, and the counter. Non-zero on any FAIL. Its output goes in the merge-request note. |
| `engine.sh status`, or `make engine-status` for agents | anyone: it changes nothing | through the API: reachable, the engine's ID, rootless, the plugin listed, images present against `images.lock`, `docker system df`. In the Author's terminal it adds the units' states, the proxy's list digest against the settings' ([§4](#4-egress-the-proxy)), and the plugin's last 20 refusals. The running digest is the one the proxy recorded when it started; the settings' comes from the installed proxy's `--list`. When they differ it says so, and to restart the proxy. |
| `make engine-smoke` | an agent session, through the relay | `make up ENV=dev-cpu`, `make breach-test ENV=dev-cpu`, `make down ENV=dev-cpu`. It needs the early patch's opening ([§2.3](#23-what-a-sessions-client-uses)). |

`engine.sh status` is read-only, so both the Author and agents may run it.

In the Author's terminal, engine.sh's client for the engine is always `tcp://198.18.0.1:2376` with TLS verified and the Author's certificate, and its client for the host's own daemon (seed's checks, pulls, and saves) is always `unix:///var/run/docker.sock`, whatever the shell's `DOCKER_HOST`, `DOCKER_CONTEXT`, or proxy variables name. So an ambient `DOCKER_HOST` can't send a step meant for the engine to the host's rootful daemon, or the other way round. Inside a session, `status` and `smoke` use the relay's values as they stand ([§2.3](#23-what-a-sessions-client-uses)).

## 9. Degraded modes and residual risk

| What fails | What happens |
|---|---|
| The engine is down | The image gate fails with "ask the Author: deploy/agents-engine/engine.sh up". Ops falls back to its batched request to the Author (plan §19). |
| The plugin is down | The daemon refuses every request: fail closed (row E12). |
| The proxy is down | Pulls, and the npm steps of builds, fail closed. Seeded images still run. |
| The proxy's list can't be read | It refuses every request (`no_list`): fail closed. |
| The dummy interface is gone after a WSL restart | `engine.sh up` fails and shows the unit's status. |
| An image is missing after a reset | `make up ENV=dev-cpu` fails at preflight; the fix is `deploy/agents-engine/engine.sh seed`. |
| The stand-in model is missing | preflight P18: "ask the Author to run deploy/agents-engine/engine.sh seed". |
| The Windows drive is short of space | The seed refuses before it writes, naming both figures. |
| A client certificate is near expiry | `engine.sh setup` reissues it. |

**Residual risk,** in ADR 0016's words: "the kernel is shared. A kernel exploit from a container reaches the host as `h4agents`, not as root. The admission plugin then becomes part of the boundary, so a plugin bug is a boundary bug. The matrix tests each refusal. It cannot prove the kernel is free of bugs. The KVM VM is the answer if that risk stops being acceptable."

Two consequences of that risk, from check 2's facts (R-21), not stated in the ADR:
- A process that escaped to `h4agents` on the host could reach WSL's interop sockets (mode 0777), and through them start Windows programs as the Windows user, and the D-Bus system bus (0666). The firewall would still hold its network traffic.
- Allowlisted registries can carry data out of the engine, as they can from the sandbox. Plan §13 records it as a residual risk, contained by keeping secrets out of agent context.

The KVM VM closes the first; nothing in spec 000 closes the second.
