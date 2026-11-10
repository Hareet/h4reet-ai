# ADR 0026: The tunnel: OpenSSH from the laptop, ending on the tunnel end

Status: proposed, 2026-11-10 · Spec: 001 (FR-052 to FR-055; plan §4, §5.2; research.md R-11, R-12; contracts/tunnel.md) · Accepted when the Author merges spec 001's group 1, after his approval at T000 · Number: one of 0024 to 0029, allocated to spec 001 since September

## Context

The constitution's Local tier standard: "exposed only through an outbound tunnel". While the laptop serves, EC2 is stopped, so the tunnel needs somewhere else to end. The Author's answers, verbatim (spec.md, Clarifications):

> Session 2026-10-12. Q: Where does the tunnel end? (FR-052) → A: "A (recommended)", which read: "inside the project's AWS account."

> Session 2026-11-09. Q13: "Spec 001: while your laptop serves, EC2 is off, so the laptop's outbound tunnel needs somewhere else to end. Where should it end?" → A: "Tiny always-on relay (Recommended)", which read: "A small always-on instance in your AWS account, separate from EC2, using September's OpenSSH tunnel design. No third party carries visitors' messages, and the health check sees the whole path. The repo's research priced it in October at about $2.20 a month for a t4g.micro spot instance plus $3.65 for its address; that gets re-priced in the plan."

## Decision

1. **OpenSSH, ending on the tunnel end** (ADR 0025), in two unprivileged containers: the laptop's `tunnel` in prod's `tunnel` profile, and the tunnel end's `tunnel-end`.
2. **Only the listed forwards:** reverse forwards 2201 (the relay block), 2202 (the telemetry block), and 2203 (the health block), exactly, by `PermitListen`; local forwards to RDS on 5432 and to the snapshot sink, exactly, by `PermitOpen`; public-key authentication only, one authorized key, the host key pinned on the laptop's side, and no shell (`MaxSessions 0`) (research.md R-11).
3. **The blocks on each host's `edge`:** 8085, the relay block, behind a bearer token per host; 8086, telemetry in, on the laptop; 8087, health, unauthenticated and status-only, since Route 53's checkers can't send a credential (research.md R-12; FR-053's conditional).
4. **Keys** from `make tunnel-keys`, the Author's, kept in `~/.config/h4reet-ai/tunnel/`, denied to agents; the public halves to Parameter Store, by him; revocation in one action, `make tunnel-revoke`.
5. **Every flow it carries has its disclosure row** (S16, S17, C3, C15), and `disclosure_check.py` fails an sshd permit no row names.

## Alternatives considered

- **A tunnel run by a third party:** ruled out by the option he chose, "No third party carries visitors' messages".
- **Ending on EC2:** EC2 is stopped while the laptop serves (ADR 0044, proposed, decision 3).

## Consequences

- The laptop takes no inbound connection (SC-006), and the health check sees the whole path: the tunnel end, the tunnel, and the laptop's stack.
- The tunnel end is the one place the tunnel's port is open to the world, which rule T7 allows on its group alone.

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) · Contract: [tunnel.md](../../specs/001-cloud-elevation/contracts/tunnel.md)
- Related: [ADR 0025](0025-the-relay-on-the-tunnel-end-on-spot.md), [ADR 0009](0009-pull-based-deployment-no-inbound-ports.md)
