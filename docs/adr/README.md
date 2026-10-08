# Architecture Decision Records

One file per decision, numbered, immutable once accepted (supersede with a new ADR). Template: Context · Decision · Alternatives considered · Consequences · Links (intent, spec, PR).

| # | Decision | Status | Spec |
|---|---|---|---|
| 0001 | Local-first routing with Bedrock as capped fallback | proposed | 000 |
| 0002 | Everything containerized; one compose topology for every environment | proposed | 000 |
| 0003 | Local-compose-first delivery, then Terraform elevation to AWS | proposed | 000, 001 |
| 0004 | Langfuse (self-hosted, in the stack) + Grafana dashboards | proposed | 000 |
| 0005 | Telegram primary / email secondary alerting; no SNS SMS | proposed | 000 |
| 0006 | intent.md + Spec Kit + REVIEW.md as the artifact chain; hooks as the deterministic layer | proposed | 000 |
| 0007 | One AWS account; environments separated by VM, IAM role, tag, and budget | proposed | 001 |
| 0008 | Terraform, plan-in-PR, human-gated apply | proposed | 001 |
| 0009 | Pull-based deployment to the local tier; no inbound ports; no self-hosted runners | proposed | 001 |
| 0010 | Real-time 3D avatar rig (not generated video); GTA V-inspired original art direction | proposed | Phase 2 |
| 0011 | Cloned voice for the twin, disclosed | proposed | Phase 2 |
| [0012](0012-constitution-1-0-1-spec-kit-lifecycle.md) | Constitution 1.0.1: Spec Kit 1.0.8 lifecycle order and command names | accepted | — |
| [0013](0013-local-until-publication.md) | Develop locally until publication; publish the history from its first commit | accepted (0014, if accepted, replaces one Consequence) | 000, 001 |
| [0014](0014-github-side-requirements-to-a-publication-spec.md) | Spec 000's GitHub-side requirements move to a publication spec (replaces one Consequence of 0013) | proposed | 000, publication |
| [0015](0015-agents-run-containers-on-their-own-engine.md) | Agent sessions run containers on their own disposable engine, never the host's | proposed | 000 |
