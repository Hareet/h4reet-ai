# ADR 0015: Agent sessions run containers on their own disposable engine, never the host's

Status: proposed, 2026-10-07. It records the Author's answer in spec 000's `/speckit-clarify` session; the Author accepts it. · Spec: 000 (FR-039, FR-018, FR-036; User Story 3)

## Context

Claude Code's sandbox refuses Unix sockets through its seccomp filter, so it blocks the Docker socket, and it exposes no GPU. No agent session can run `make up`, `make breach-test`, or the GPU check; session 1 observed this on 2026-10-07. Opening the host's engine instead would be root-equivalent on the host. A container can mount any path, including the credentials the sandbox denies, and the same engine runs the local production tier.

## Decision

- Agent sessions get their own disposable container engine, separate from the host's. They run the stack CPU-only there, with the same compose definition and images (FR-017), selected by an environment file.
- The engine doesn't run privileged on the host's engine. It can't reach the host's engine, the GPU, the host's stacks, or the Author's files and credentials outside the working tree. Its containers are held to the sandbox's network allowlist.
- The sandbox opening that lets agents reach the engine is a settings change only the Author makes. It reaches that engine and nothing else, and the forbidden-action matrix proves it on the host.
- GPU checks, Bedrock calls, and real alert delivery stay in the Author's terminal.

## Alternatives considered

- **Agents never run containers, and the Author runs every container check.** This was the option recommended to the Author. It is the simplest and leaves nothing new to secure, but agents can't verify their own container work.
- **Open the host's Docker socket to agent sessions.** Agents get full capability, but also root-equivalent access past every sandbox file and credential deny, on the engine that runs the production tier.

## Consequences

- The plan chooses the engine (a VM, or an isolated container runtime), how the sandbox reaches it, and how images and the CPU stand-in model arrive: from allowlisted sources, pulled in advance by the Author, or through an allowlist change the Author makes.
- The model server has to run CPU-only from the same image. Otherwise the Author decides whether an image or profile chosen by the environment file counts as configuration (spec 000, open for the plan interview).
- The `make up`, `make down`, `make breach-test`, and `docker compose` permissions in `.claude/agents/ops.md` become usable only once this engine exists.

## Links

Intent: none (a decision in spec 000's clarification). Spec: 000, Clarifications of 2026-10-07. Merge request: `docs/merge-requests/2026-10-07-chore-repo-hygiene.md`.
