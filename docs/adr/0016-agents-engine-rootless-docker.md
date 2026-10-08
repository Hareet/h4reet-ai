# ADR 0016: Agents' containers run on rootless Docker under their own user, reached through one sandbox opening

Status: proposed, 2026-10-08 · Spec: 000 (FR-007, FR-008, FR-017, FR-018, FR-036, FR-039; SC-003; User Story 3 scenario 9)

## Context

FR-039 requires agent sessions to run the stack CPU-only, including `make up`, `make down`, and `make breach-test`, on a container engine of their own. That engine must not run privileged on the host's engine. It must not reach the host's engine, the GPU, the host's stacks, or the Author's files and credentials. ADR 0015 set these limits and left the engine's design to the plan.

On 2026-10-07 the Author chose "Separate Docker for agents", which read: "A disposable VM or devcontainer with its own Docker engine for CPU-only stacks; host socket, GPU, and the prod stack stay out of reach. GPU and Bedrock checks stay with you. More setup." (spec.md's Clarifications). ADR 0015, accepted, turned that into FR-039's engine, and among its Consequences said: "The plan chooses the engine: a VM, or a devcontainer on an isolated runtime."

On 2026-10-08 the Author chose "Rootless Docker, own user", which read: "A second Docker daemon under a separate Linux user. No VM, but it shares the host's kernel. It also needs per-user firewall rules to limit internet access, a permission change to keep it out of your Windows files, and its own fix to keep it off the GPU." That is neither a VM nor a devcontainer. **This ADR therefore replaces that one Consequence of ADR 0015**, as ADR 0014 replaced one of ADR 0013's. The rest of ADR 0015 stands: the engine is the agents' own, disposable, not privileged on the host's engine, and changed only by the Author's hand. The KVM VM the plan's first design recommended stays the documented upgrade. The price of the choice is a shared kernel (see Consequences).

## Decision

Set-up, once, by the Author with sudo (`deploy/agents-engine/setup-host.sh`, human-only):

- User `h4agents`, with subordinate uid and gid ranges and lingering enabled. It is not in the `docker` group, so the host's `docker.sock` refuses it.
- A dummy interface holding `198.18.0.1/32`, the engine's address.
- An nftables table matching `meta skuid h4agents`. It allows established traffic and `198.18.0.1:3128` (the egress proxy), and it logs and drops the rest. Containers have no route to the internet, the LAN, the host's stacks, the bridge networks, or DNS.
- `/dev/dxg` stays with the host's rootful Docker, through group `h4gpu`, which the Author joins. `h4agents` is not in that group.
- `/etc/wsl.conf` sets the automount to `umask=077,fmask=077`, so only the Author can open `/mnt/c`. It takes effect after one `wsl --shutdown`.
- The working tree is bound read-only at `/run/h4agents/tree`, with empty tmpfs mounts over `deploy/env`, `corpus/intake/private`, and `.git`. The model cache is bound read-only at `/run/h4agents/models`. `h4agents` never traverses the Author's home, which stays mode 750.
- A systemd slice caps `h4agents` at 4 CPUs and 12 GB.

The daemon:

- `dockerd-rootless` runs as an `h4agents` user service, with the containerd image store, slirp4netns or pasta networking, and `--disable-host-loopback`. Its own pulls use `HTTPS_PROXY=http://198.18.0.1:3128`.
- Its API listens on TCP 2376 with `--tlsverify`, which is mutual TLS. RootlessKit forwards it to `198.18.0.1:2376`.

Admission: `authz.py`, a Docker authorization plugin written in the standard library, is consulted on every API call. It refuses privileged containers; devices, device requests, and `--gpus`; added capabilities and relaxed security options; host pid, ipc, uts, or user namespaces; bind mounts and bind-backed volumes outside the tree and the models; plugin installs; and swarm. Each decision goes to an audit log.

Egress: `egress-proxy.py`, a CONNECT proxy on `198.18.0.1:3128`, allows exactly the sandbox's `allowedDomains`, read from `.claude/settings.json` at start, and logs every decision. Images from registries outside that list are seeded from the host by digest (`make engine-seed`, using `docker save | docker load`).

Sandbox opening: one `allowedDomains` entry, `198.18.0.1:2376`. `deploy/agents-engine/docker-relay`, a socat relay through the sandbox proxy, gives sessions `DOCKER_HOST=tcp://127.0.0.1:2376` with mutual TLS. `DOCKER_CONFIG` points at the client certificate, which agents can read and not write. The relay is needed because the Docker client's exec, attach, and BuildKit streams do not pass through an HTTP proxy. That is the plan's reading, and matrix row E9 proves it.

Human-only: `deploy/agents-engine/**` and the `make engine-*` targets. The bash gate blocks agents from them (ADR 0017).

Proof: the matrix checks each limit from the host (stage E) and from inside the sandbox (stage S). Examples: `--gpus all` and `--device /dev/dxg` are refused; binds of `/home/h4reet`, `/run/WSL`, and `/mnt/c` are refused; `docker.sock` refuses `h4agents`; from the sandbox, `198.18.0.1:2376` answers while `198.18.0.1:3128` and the stack ports on 127.0.0.1 do not.

Disposable: `make engine-reset` deletes the data root and volumes, then re-seeds, in about a minute. `make engine-destroy` removes everything except the user. Nothing of the Author's lives there.

## Alternatives considered

- The KVM virtual machine (QEMU, its own kernel, its own egress path). Kept as the upgrade. It needs QEMU, a golden image, its own certificates and file shares, and about 12 GB of RAM while it runs.
- A separate WSL distro. Rejected: it shares the utility VM's kernel and network namespace. Its root is root in that VM, and its dockerd shares netfilter with the host's engine.
- Sysbox. Rejected: it must be installed into the production engine, which restarts it. WSL2 is not a listed host, and it still shares the kernel.
- Sandbox `allowUnixSockets`. Rejected: it is macOS only, and Linux ignores it, because seccomp cannot filter by path.
- Sandbox `allowAllUnixSockets`. Rejected: it opens every socket, including the host's `docker.sock`, the user's D-Bus and systemd buses, and WSL interop.
- The host's Docker socket. Rejected by ADR 0015.

## Consequences

- Residual risk, stated plainly: the kernel is shared. A kernel exploit from a container reaches the host as `h4agents`, not as root. The admission plugin then becomes part of the boundary, so a plugin bug is a boundary bug. The matrix tests each refusal. It cannot prove the kernel is free of bugs. The KVM VM is the answer if that risk stops being acceptable.
- Cost: $0 cloud. The host cost is capped at 4 CPUs and 12 GB, plus the images on disk. dev-cpu uses about 5 to 6 GB of RAM.
- Degraded mode: engine down gives a failed image gate that names the command to run (`make engine-up`). Admission plugin down: the daemon refuses every request, which fails closed. Egress proxy down: pulls fail closed, and images already seeded still run. A broken engine is rebuilt with `make engine-reset`, and nothing else depends on it.
- Agents are refused resets and renewals on every stack except the engine's own (FR-008, FR-034).

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0015](0015-agents-run-containers-on-their-own-engine.md), [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md), [ADR 0018](0018-agent-sessions-on-wsl.md)
