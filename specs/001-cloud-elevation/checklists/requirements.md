# Specification Quality Checklist: Cloud Elevation — Terraform, One Account, Same Compose Stack

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs). The spec names Terraform, one AWS account, the compose definition, SSO and OIDC, Bedrock, Telegram and email, and Grafana and Langfuse, because the constitution, the intent, and spec 000 already fix them. It names no language, no library, and no specific AWS service. It writes "a managed web firewall", "a managed secrets store", and "a private registry in the account" instead.
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders. Partly: the readers include a principal engineer, and infrastructure vocabulary can't be avoided. Each story states its value in plain words before its scenarios.
- [x] All mandatory sections completed: User Scenarios & Testing, Requirements, Success Criteria, Assumptions. Added sections: Scope (reused and added), Expected Cost Impact, Degraded Modes, Data Flows This Spec Adds, Constitution Check, Open questions for /speckit-clarify.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain. Four remain by design, for `/speckit-clarify`: the group FR-014 to FR-016 (GitHub-side requirements and ADRs 0013 and 0014), FR-017 (production's meter of record), FR-020 (infrastructure cost and the ceiling), and FR-033 (the public request cap). The brief asked for about three to five markers; the specify skill's own default is at most three.
- [x] Requirements are testable and unambiguous. All 62 functional requirements use an EARS keyword (WHEN, WHILE, IF … THEN, WHERE, or a plain SHALL). Each names something a test, a scan, the matrix, or an audit can check.
- [x] Success criteria are measurable. There are 15, and each has a count, a time, a percentage, or a pass condition from a scan.
- [x] Success criteria are technology-agnostic. Mostly: SC-005 (image digests), SC-012 (merge-request notes and apply records), and SC-015 (pull requests) name the project's own process objects.
- [x] All acceptance scenarios are defined: 49 Given/When/Then scenarios across 7 user stories.
- [x] Edge cases are identified (18).
- [x] Scope is clearly bounded: the Scope section (what's reused, added, and changed in spec 000) and "Out of scope" in Assumptions.
- [x] Dependencies and assumptions identified: spec 000, the publication spec, and the Author's terminal actions. Named deviations: the local-phase plan and apply stand-in, the CI-side supply-chain controls, identical images, and one deviation that ends (the hand-made runtime identity).

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria. Each EARS statement is its own criterion. Most FRs are also tied to a scenario, a success criterion, or a row of Degraded Modes.
- [x] User scenarios cover primary flows: infrastructure change and apply, the cost ceiling and the safety net, visitor access with the local tier on and off, the disclosure, the cloud VM and deployments, the tunnel, and the public dashboard.
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification. The same note applies as for Content Quality.

## Notes

- Validation iteration 1, 2026-10-10, found and fixed three issues:
  1. The Scope section said the gateway's code doesn't change. But the gateway's client-address trust chain changes, and under question 3's option A so does the meter. Both are now listed under "Spec 000 pieces this spec has to change".
  2. FR-036 read as settling the intent's open question ("degraded page vs. static answers"). It now states a default, pending question 7.
  3. Two mentions of the marker text outside requirements (the Input line and the open-questions introduction) would have counted as markers. They were reworded, so exactly four markers remain.
- Checks run on the file:
  - 62 FR lines, each carrying SHALL;
  - 15 SC lines;
  - no reference past FR-062 or SC-015;
  - no 12-digit number, AWS key prefix, operator-token prefix, or bot-token shape;
  - every dollar amount is one of $5, $20, $2, $3.50, $14, $1.40, and $10, all from the intent, spec 000, or `config/budgets.yaml`. The one derived figure is question 3 option B's "$10 a month for metered calls" ($20 less the intent's $10 target).
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`. The only open item is the four markers, which `/speckit-clarify` resolves. Questions 5 to 12 have stated defaults in Assumptions.
