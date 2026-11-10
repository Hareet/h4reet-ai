# ADR 0009: Pull-based deployment; no inbound ports on the local tier; no self-hosted runners

Status: proposed, 2026-11-10 · Spec: 001 (FR-046 to FR-049, FR-052, FR-055; plan §5.2, §9; research.md R-11, R-17) · Accepted when the Author merges spec 001's groups 1 to 4 (`feat/001-cloud-elevation`), after his approval at T000 · Number: reserved for spec 001 since 2026-09-07

## Context

The intent's constraint, in the Author's words: "No inbound ports on the local tier; no self-hosted runners." The constitution's Principle IV: "the local tier accepts no inbound connections and pulls its deployments rather than receiving pushes".

The Author's answer on releases, verbatim (spec.md, Clarifications, Session 2026-10-12): Q: How are releases made before publication? (FR-046, FR-048) → A: "A (recommended)", which read: "the Author's terminal builds each release once and publishes it to a private registry in the account, and both deployers pull it by digest."

On 2026-11-09 the session put to him, among five points ([ADR 0044](0044-ec2-as-prods-default-host.md), decisions 5 to 9): "I'd avoid pointing DNS at your home IP." … "With a tunnel, the laptop dials out instead, so there's no IP prompt and no router changes." His reply: "Okay, all of your feedback is approved. for server size, we will try to use spot instances, or only keep the server online for 8-12 hours a day."

## Decision

1. **Every host pulls.** Three deployers: EC2's at boot, before its stack takes visitors, and every minute; the tunnel end's every minute; the laptop's from the Author's own release directory. Each pulls by digest, holds a hand-started stack until `make deployer-resume`, and rolls back in one command (`make rollback ENV=ec2|tunnel-end|prod`) (research.md R-17).
2. **One build per release,** in the Author's terminal before publication (`make release`), for `linux/amd64`, and for `linux/arm64` where a Graviton host needs it, published to ECR and the release bucket with its digests.
3. **The laptop takes no inbound connection.** It reaches the cloud only by dialing out: the tunnel to the tunnel end (ADR 0026). No port is forwarded to it and no DNS name points at it.
4. **No CI runner anywhere** before publication, and no CI identity in the account (FR-008).

## Alternatives considered

- **Pushing releases to the hosts** (SSH or Systems Manager commands from the Author's terminal): not chosen; the constitution names pull.
- **Pointing DNS at the laptop's home address,** the Author's first picture of the workflow: replaced by the approved point above.

## Consequences

- A release reaches EC2 and the tunnel end within a minute of its publication, and the laptop at its next `make up`.
- The release record carries each host's digests, and the dashboard shows the release on each host (FR-049).

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) · Contract: [releases-deployer.md](../../specs/001-cloud-elevation/contracts/releases-deployer.md)
- Related: [ADR 0026](0026-the-tunnel-openssh-to-the-tunnel-end.md), [ADR 0013](0013-local-until-publication.md)
