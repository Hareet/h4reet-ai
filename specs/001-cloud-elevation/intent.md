# Intent: elevate the compose stack to AWS with Terraform
Author: the Author. Status: accepted (pairs with `spec.md`). Created: 2026-09-07.

## Problem
Spec 000 produces a production topology that runs only on my machine. Visitors need h4reet.ai to answer whether or not the machine is awake, the kill switch needs a home the cloud relay can read, and the cost safety net needs AWS-side budgets. All of it must fit the same $5/day, $20/month ceiling.

## Proposed outcome
Terraform in one AWS account stands up the thin, cheap, always-on control plane — DNS and TLS for h4reet.ai, the static site at the edge, the relay, the kill-switch state, budgets and anomaly detection, the alert path — and a VM that runs the very same compose definition from spec 000. The local tier reaches the cloud through an outbound tunnel and pulls its deployments. The public dashboard stays up when the machine is off.

## Affected users and systems
Visitors; the operator; CI (OIDC to AWS); the local tier; the compose stack from spec 000.

## Constraints
One account; environments by VM, IAM role, tag, budget. Plan in PR, human apply. Idle cloud cost must leave headroom for the Bedrock fallback. No inbound ports on the local tier; no self-hosted runners.

## Expected cost impact
Idle infrastructure target ≤ $10/month; the rest of the ceiling is fallback inference and burst.

## Data-flow impact
Visitor requests now traverse the edge and relay; the relay carries no payload it does not need to route. Disclosed on the site.

## Open questions
Edge rate limiting within budget; how the relay behaves when both the local tier and the fallback sub-budget are gone (degraded page vs. static answers).
