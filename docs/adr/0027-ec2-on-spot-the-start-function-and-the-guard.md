# ADR 0027: EC2 on spot, stopping on interruption; the start function, the guard, and the autostart switch

Status: proposed, 2026-11-10 · Spec: 001 (FR-021, FR-023, FR-063 to FR-065, FR-069 to FR-072; plan §5.1, §7; research.md R-15, R-29, R-30, R-31; contracts/handover.md) · Accepted when the Author merges spec 001's group 1, after his approval at T000 · Number: one of 0024 to 0029, allocated to spec 001 since September

## Context

The Author's words of 2026-11-09, verbatim (spec.md, Clarifications): "Here is how we are imagining the move to ec2 workflow: That is the default, and if i run the stack locally, the bootup should ask me what my ip address is, and a script that can configure route53 etc to point to my IP, and the necessary router / firewall settings that would need to change. If i am running locally, then the ec2 should be shut off and not incurring costs. The kill-switch monitor should turn the ec2 on if it detects that the laptop is not present or the local ip address route is offline, then a lambda function can update route53 back to the ec2."

His answers the same day, verbatim:

> Q15: "Spec 001: you said "we will try to use spot instances, or only keep the server online for 8-12 hours a day". Which should the plan build?" → A: "Spot, around the clock (Recommended)", which read: "A spot instance running all day, with a schedule kept in reserve. It's your first choice, and only one mechanism then starts and stops EC2."

> Q17: "Spec 001: when AWS takes a spot instance back, which can happen with two minutes' notice, what should happen?" → A: "Same gap, plus an alert (Recommended)", which read: "Like the start-up gap you already accepted. You get an alert, and visitors see the resting message until capacity returns or you start the laptop."

Question 16, the IAM, wasn't asked. The session took its recommended option provisionally, not his words: "all in Terraform, human-only. The start function's role may start only the one tagged instance; the laptop's stop uses its own permission set, which may stop only that instance, through a short-lived SSO session." His approval of the plan on 2026-11-10, "Let's approve the t000 and spec 001 plan.", leaves it standing (spec.md, Clarifications, Session 2026-11-10).

## Decision

1. **EC2 is a persistent spot request with `instance_interruption_behavior = "stop"`** (rule T11), its volumes kept while it is stopped, IMDSv2 with hop limit 1 (rule T13). The schedule of 8 to 12 hours stays in reserve, and arrives only by his patch with an ADR.
2. **`h4-ec2-start`,** fired once per change of the Route 53 health check's alarm and once on the tunnel end's return, starts the one tagged instance. It refuses while the autostart switch is `off`, while the server budget's action has run, while the tunnel end is down, or, when invoked by hand or on the tunnel end's return, while the laptop serves.
3. **`h4-ec2-guard`,** on EC2 entering `running`, stops it again if the laptop serves, the switch is `off`, or the server budget's action has run, whatever AWS's own restart did (research.md R-30).
4. **The laptop's `h4-handover` loop** stops EC2 within 5 minutes of the relay sending to the laptop, through the Author's SSO session and the `h4-ec2-stop` permission set; `make up` never fails because the stop fails (FR-064).
5. **The autostart switch** is a String parameter, `/h4reet/prod/ec2-autostart`, `on` letting EC2 start automatically; Terraform creates it and ignores its value afterwards (FR-072).
6. **Each identity holds one action on one instance** (research.md R-15), and all of it lives in the protected `handover*.tf`, `failover*.tf`, `ec2-market*.tf`, and `iam*.tf` (rule T5).

## Alternatives considered

- **The schedule, 8 to 12 hours a day:** kept in reserve by his answer to Q15.
- **A function that rewrites Route 53** (his first picture): replaced by the relay moving visitors (ADR 0025) and the approved points of 2026-11-09.

## Consequences

- An interruption is the same gap as a start, plus an alert; the gap's length is recorded and on the dashboard (SC-018).
- EC2's running time while the laptop serves is at most the handover window per handover (SC-016), counted inside the server budget.

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) · Contract: [handover.md](../../specs/001-cloud-elevation/contracts/handover.md)
- Related: [ADR 0025](0025-the-relay-on-the-tunnel-end-on-spot.md), ADR 0044 (proposed, on `docs/001-ec2-default`)
