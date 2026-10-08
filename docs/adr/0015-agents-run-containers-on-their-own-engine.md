# ADR 0015: Agent sessions run containers on their own disposable engine, never the host's

Status: proposed, 2026-10-07, awaiting the Author's acceptance. It records the Author's answer in spec 000's `/speckit-clarify` session. · Spec: 000 (FR-039, FR-018, FR-036; User Story 3)

## Context

Claude Code's sandbox refuses Unix sockets through its seccomp filter, so it blocks the Docker socket, and it exposes no GPU. No agent session can run `make up`, `make breach-test`, or the GPU check; session 1 observed this on 2026-10-07. Opening the host's engine instead would be root-equivalent on the host. A container can mount any path, including the credentials the sandbox denies, and the same engine runs the local production tier.

## Decision

The Author's recorded answer: "Agents get a separate, disposable container engine (a VM or devcontainer with its own daemon) for CPU-only stacks; the host's Docker socket, the GPU, and the host's stacks stay out of their reach. GPU checks and Bedrock calls run in the Author's terminal."

The spec turns that into FR-039, and adds constraints that follow from Principle IV and the sandbox. These additions are this session's reading, not the Author's words, and the Author may change them:

- The engine runs the stack with the same compose definition and images as every other environment (FR-017), selected by an environment file.
- It doesn't run privileged on the host's engine. That rules out the usual Docker-in-Docker devcontainer, which needs privileged mode, so a devcontainer would need an isolated runtime instead.
- It sees the working tree only read-only and without the paths the sandbox denies, so no container can write what the sandbox protects or read what it hides.
- Its containers are held to the sandbox's network allowlist.
- Its definition, and the sandbox opening that lets agents reach it, change only by the Author's hand. The opening reaches that engine and nothing else.
- The forbidden-action matrix proves each limit from the host.
- Real alert delivery stays in the Author's terminal too, alongside GPU checks and Bedrock calls.

## Alternatives considered

- **Agents never run containers, and the Author runs every container check.** This was the option recommended to the Author. It is the simplest and leaves nothing new to secure, but agents can't verify their own container work.
- **Open the host's Docker socket to agent sessions.** Agents get full capability, but also root-equivalent access past every sandbox file and credential deny, on the engine that runs the production tier.

## Consequences

- The plan chooses the engine: a VM, or a devcontainer on an isolated runtime. It also chooses how the sandbox reaches the engine, and how images and the CPU stand-in model arrive: from allowlisted sources, pulled in advance by the Author, or through an allowlist change the Author makes.
- An image or profile chosen by the environment file counts as configuration (spec 000, Clarifications), so the CPU stand-in may use the model server's CPU image.
- The `make up`, `make down`, `make breach-test`, and `docker compose` permissions in `.claude/agents/ops.md` become usable only once this engine exists.

## Links

Intent: none (a decision in spec 000's clarification). Spec: 000, Clarifications of 2026-10-07. Merge request: `docs/merge-requests/2026-10-07-chore-repo-hygiene.md`.
