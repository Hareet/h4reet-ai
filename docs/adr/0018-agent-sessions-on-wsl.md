# ADR 0018: Agent sessions run on WSL under the full sandbox, with the devcontainer's tool versions

Status: proposed, 2026-10-08 · Spec: 000 (FR-005, FR-014, FR-037; SC-007; User Story 3 scenario 1)

## Context

On 2026-10-08 the Author chose "WSL, devcontainer versions (Recommended)" over running agents inside the devcontainer. That option read: "Agents keep the full sandbox on WSL. The devcontainer still sets every tool version, and make toolchain-check fails if WSL drifts from it. Means amending that scenario; ADR 0018 records why." In this ADR's words: agent sessions run on the WSL host, under the full sandbox, with the devcontainer's tool versions, and a check fails when the host's versions drift from the devcontainer's.

The constitution says "a devcontainer defines the single toolchain used by humans, agents, and CI" (Development). Read literally, that puts agent sessions inside the devcontainer.

Claude Code's sandbox is bubblewrap, which needs unprivileged user namespaces. Inside a container, that means a custom seccomp profile and an unmasked `/proc`, or the weaker nested sandbox. The nested sandbox runs without a fresh `/proc`, so sandboxed commands can see the container's processes. Either way, one boundary is weakened to add another.

## Decision

- Agent sessions run on the WSL host, from the repository, under the committed permissions, hooks, and full sandbox (ADR 0006).
- The devcontainer defines every tool version, in one pin file. Node 24 LTS is the one Node major, shared by the host, the devcontainer, and the gateway image's base. The other pins are uv 0.8.22, ruff 0.16.10, gitleaks 8.30.1, pytest and pyyaml, the lint toolchain, and Claude Code.
- `make tools` (the Author runs it) installs the same pins where agents can't write: pytest through `uv tool`, gitleaks copied from its pinned image into `~/.local/bin`, the lint toolchain under `~/.local/share/h4reet/lint-node`, and Claude Code with `DISABLE_AUTOUPDATER=1`.
- `make toolchain-check` compares installed versions with the pins and fails on any drift, Claude Code included. A failed check fails `make check`.
- The devcontainer is still the newcomer's path (SC-007), the image the gate builds in (ADR 0017), and the place CI will run after publication.

Reading of the clause. The devcontainer defines the one toolchain, so humans, agents, and CI use the same versions. The clause does not say where agents run, and this ADR reads it that way. The literal reading would make agent sessions a deviation. The spec's Assumptions should name the clause and point here. They do not name it yet.

Rejected: Claude Code inside the devcontainer. It needs either a custom seccomp profile with an unmasked `/proc`, or the weaker nested sandbox. Both weaken the sandbox that the constitution's enforcement depends on.

## Alternatives considered

- Claude Code in the devcontainer with a custom seccomp profile and unconfined system paths. Rejected, as above.
- Claude Code in the devcontainer with the weaker nested sandbox. Rejected: sandboxed commands would see the container's processes.
- The host with no version check. Rejected: humans, agents, and CI could run different tools without anyone noticing.

## Consequences

- Cost: $0 cloud. Dev-time model use runs on the Claude Team plan, tracked apart from production (FR-037).
- Drift: a tool upgrade is a pin change, followed by `make tools`. A Claude Code upgrade changes the enforcement layer, so it also triggers the behavioral evals (ADR 0006).
- Degraded mode: a drifted host fails `make toolchain-check`, and therefore `make check`. Nothing merges until the Author runs `make tools`. A devcontainer that won't build sends the gate to the host, marked DEGRADED (ADR 0017).

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0006](0006-artifact-chain-and-hooks.md), [ADR 0012](0012-constitution-1-0-1-spec-kit-lifecycle.md), [constitution](../../.specify/memory/constitution.md)
