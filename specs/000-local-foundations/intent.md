# Intent: foundations before features, in compose before cloud
Author: the Author. Status: accepted (pairs with `spec.md` in this folder). Created: 2026-09-05. Revised: 2026-09-07.

## Problem
Nothing exists yet, and the first thing agents build tends to become the shape of everything after. If features come first, cost control, agent governance, and the spec-driven lifecycle get retrofitted — the failure mode this portfolio argues against. And if cloud comes first, the local tier becomes a demo instead of production.

## Proposed outcome
Before any visitor-facing feature and before any cloud resource: a public repo governed by the constitution; role-scoped agents that cannot perform forbidden actions; CI on hosted runners that refuses code without a spec and runs review, evals, and red-team scaffolds on every PR; and the entire production topology as one compose stack on my RTX 5090 machine — local model server, provider-agnostic gateway (local and Bedrock adapters, local-first), real-time cost meter and kill switch with Telegram alerts, self-hosted Langfuse and Grafana, hello endpoint — proven by deliberately tripping the kill switch, recorded, and linked from the README. Spec 001 then elevates that same stack to AWS with Terraform.

## Affected users and systems
Me as operator; the agent roles; GitHub Actions; the RTX 5090 machine (Windows, WSL2, GPU passthrough); Langfuse and Grafana containers; my AWS SSO identity for the Bedrock adapter only.

## Constraints
$5/day, $20/month ceiling enforced by the stack's own meter. Containers everywhere; one compose definition. No cloud resources in this phase. Telegram primary alerts. MIT. Everything public.

## Expected cost impact
Cloud: only Bedrock fallback calls during testing, within the sub-budget. Dev-time: agent-configuration evals on every `.claude/**` change; keep the suite small.

## Data-flow impact
None visitor-facing; hello is stateless. Telemetry carries no payloads.

## Open questions
Carried into `spec.md`: the Bedrock fallback sub-budget within the daily ceiling.
