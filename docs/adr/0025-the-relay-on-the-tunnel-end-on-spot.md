# ADR 0025: The relay on the tunnel end, which picks the serving host; the tunnel end on spot

Status: proposed, 2026-11-10 · Spec: 001 (FR-029, FR-034, FR-054, FR-066, FR-075, FR-076; plan Q1, Q2, Q8, §4, §8.1, §12; research.md R-04, R-07, R-18; contracts/relay-http.md, edge.md) · Accepted when the Author merges spec 001's group 1, after his approval at T000 · Number: one of 0024 to 0029, allocated to spec 001 since September

## Context

CloudFront reaches a private origin only through a VPC origin, bound to one resource, so DNS can switch only between public origins, which need certificates on both hosts and a secret header (research.md R-07). The plan asked the Author; his answers, verbatim (plan.md, Questions for the Author):

> Question 1: "Spec 001's plan: how should visitors reach whichever machine is serving (your laptop or EC2)?" He chose "Relay picks the host (Recommended)", which read: "The site's edge always talks to the tiny always-on relay (your tunnel's end). The relay checks both hosts every second and sends each request to the laptop if it's up, else EC2, else the resting reply. Switching takes seconds, and neither host needs a public certificate. Route 53's health check only wakes EC2. This changes the DNS-failover design you approved, so the spec's wording changes with your OK."

> Question 2: "Spec 001's plan: the tiny always-on instance where your laptop's tunnel ends (and, with the relay option, every request passes through). On demand or spot?" He chose "Spot", which read: "About $2.20 a month (October's figure). AWS can take it back, and while it's gone the site rests, even if the laptop or EC2 is up."

Question 8, the relay on spot against the Cloud standard's "must be always-on", was asked at T000. His approval, 2026-11-10: "Let's approve the t000 and spec 001 plan." It chooses neither option. The session takes the plan's recommendation, A, provisionally under its reading of that approval, as it took questions 5 to 7: his wording in the still-unapplied 1.1.0 patch on `docs/001-ec2-default`, his to write or confirm at T001 (spec.md, Clarifications, Session 2026-11-10). T001 applied it (3c89a8b0): the Cloud standard reads "the thin API/relay on spot capacity where the Author accepts the gap (ADR 0044)".

## Decision

1. **The relay runs on the tunnel end,** a `t4g.micro` on a persistent spot request that stops on interruption (rule T11), with two interfaces: a private one for CloudFront's one VPC origin, and a public one for the tunnel's port and the health port.
2. **It picks the host:** it checks both hosts' relay blocks every second, sends each request to the laptop while it is healthy, else to EC2, else answers `no_host_serving`; a host is unhealthy after one failed check and healthy after three passes (research.md R-18). It reads the shared kill switch on every request and holds the public cap (ADR 0029).
3. **Route 53 moves no visitor.** Its health check, through the tunnel end, only wakes EC2 (ADR 0027); nothing writes DNS at run time (FR-072).
4. **While the tunnel end is gone,** CloudFront's error responses answer `no_host_serving` from the site's bucket, the site still loads, the warning and the return are alerted, and the start function doesn't start EC2 for a path no visitor can reach (FR-076).
5. **The Cloud standard:** the relay runs "around the clock, on spot", never "always-on", until T001 applies his wording in the 1.1.0 patch.

## Alternatives considered

The plan's options, as it offered them:
- **DNS failover between public origins** (question 1's B): certificates on both hosts, a third-party authority, Route 53 write access from both, and a secret header; handovers wait on a record's time to live.
- **CloudFront picking the origin** with a function and a key-value store (question 1's C): rests on a feature to confirm, and writes the store at run time.
- **An on-demand tunnel end** (question 2's A, recommended with question 1's A, not chosen): about $6.13 a month (research.md R-04, read 2026-10-18, to confirm) against about $2.20 on spot.

## Consequences

- One small spot instance carries every dynamic request, so a spot interruption rests the twin on both hosts while the site still loads; the plan names the risk (§12, §16), and the runbook moves the request to another zone when capacity stays short.
- The status answer stays live while no host serves, and the relay's in-memory caps restart empty after an interruption.

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) · Contracts: [relay-http.md](../../specs/001-cloud-elevation/contracts/relay-http.md), [edge.md](../../specs/001-cloud-elevation/contracts/edge.md)
- Related: [ADR 0026](0026-the-tunnel-openssh-to-the-tunnel-end.md), [ADR 0027](0027-ec2-on-spot-the-start-function-and-the-guard.md), [ADR 0029](0029-the-public-request-cap-in-the-relay.md), [ADR 0044](0044-ec2-as-prods-default-host.md) (accepted)
