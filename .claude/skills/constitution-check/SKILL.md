---
name: constitution-check
description: Check an intent, spec, plan, or diff against .specify/memory/constitution.md and list the principles it touches and how it complies. Use during /speckit-specify, /speckit-analyze, review, and before any PR.
---
# Constitution check

Read `.specify/memory/constitution.md`. For the artifact under review, produce a short table: principle → touched? → how it complies or the justified deviation.

Always ask these eight questions:
1. **Data-local**: does any new byte leave the visitor's device or the local tier? Is it disclosed with a reason? Any biometrics? Is degraded mode defined?
2. **Production-grade**: tests, evals, telemetry, cost estimate, runbook, docs — which are missing?
3. **Intent → spec → code**: is there a linked intent and spec? Does the plan match the diff?
4. **Least privilege**: does it widen any permission, allowlist, or credential? Does it touch an enforcement point?
5. **Cost**: gateway-only model calls with cost attributes? Within the daily/monthly model? Fallback sub-budget respected?
6. **Public**: does anything need to be private that shouldn't, or secret that isn't?
7. **Whole product**: does the artifact make the product reasoning as visible as the systems reasoning?
8. **Honest AI**: disclosure intact? Corpus-only answers? Bad-faith refusals evaluated?

A deviation is acceptable only with a written justification in the spec, and an ADR if permanent.
