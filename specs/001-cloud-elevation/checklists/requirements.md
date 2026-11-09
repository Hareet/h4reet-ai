# Specification Quality Checklist: Cloud Elevation — Terraform, One Account, EC2 as Prod's Default Host

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-10 · **Revalidated**: 2026-11-09, after the rework around the Author's decisions (ADR 0044, proposed)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs). The spec names Terraform, one AWS account, the compose definition, SSO and OIDC, Bedrock, the Anthropic API, Telegram and email, and Grafana and Langfuse, because the constitution, the intent, and specs 000 and 010 already fix them. Since the rework it also names EC2, Route 53 failover records, a Lambda (the start function), and spot instances, because the Author's decisions of 2026-11-09 name them. It names no language or library, and it leaves the shared state's store, the tunnel product, and the instance type to the re-plan or to the open questions.
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders. Partly: the readers include a principal engineer, and infrastructure vocabulary can't be avoided. Each story states its value in plain words before its scenarios.
- [x] All mandatory sections completed: User Scenarios & Testing, Requirements, Success Criteria, Assumptions. Added sections: Scope (reused, added, and changed in other specs), Expected Cost Impact, Degraded Modes, Data-Flow Disclosure Entries, Constitution Check, Open questions for /speckit-clarify.

## Requirement Completeness

- [ ] No needs-clarification markers remain. Five remain by design, for `/speckit-clarify`: FR-052 (the tunnel, question 13), FR-021 (the server budget's figure and the instance type, question 14), FR-069 (spot or a schedule, question 15), FR-070 (the IAM to start and stop EC2, question 16), and FR-071 (a spot interruption's handover, question 17). Each question offers options and a recommendation. What the Author settled on 2026-11-09 is not asked again.
- [x] Requirements are testable and unambiguous. All 72 functional requirements use an EARS keyword (WHEN, WHILE, IF … THEN, WHERE, or a plain SHALL). Each names something a test, a scan, the matrix, or an audit can check.
- [x] Success criteria are measurable. There are 16, and each has a count, a time, a percentage, or a pass condition from a scan. SC-002's target waits on question 14's figure.
- [x] Success criteria are technology-agnostic. Mostly: SC-005 (image digests), SC-012 (merge-request notes and apply records), and SC-017 (adapters and ledger rows) name the project's own process objects.
- [x] All acceptance scenarios are defined: 59 Given/When/Then scenarios across 8 user stories.
- [x] Edge cases are identified (22).
- [x] Scope is clearly bounded: the Scope section (what's reused, added, and changed in other specs) and "Out of scope" in Assumptions.
- [x] Dependencies and assumptions identified: spec 000, the constitution's 1.1.0 amendment, spec 010's preconditions, spec 002's contract, the publication spec, and the Author's terminal actions. Named readings: the server budget's scope, what serves while no host does, the laptop without a network, and the resting message's words. Named deviations: the local-phase plan and apply stand-in, the CI-side supply-chain controls, identical images, and one deviation that ends (the hand-made runtime identity).

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria. Each EARS statement is its own criterion. Most FRs are also tied to a scenario, a success criterion, or a row of Degraded Modes.
- [x] User scenarios cover primary flows: infrastructure change and apply, the two budgets and the safety net, visitors served from EC2, the laptop's takeover and EC2's return, the disclosure, the stack on EC2, the server's running pattern, and the public dashboard.
- [ ] Feature meets measurable outcomes defined in Success Criteria. Not yet: the plan waits on the five questions and on the Author's constitution patch.
- [x] No implementation details leak into specification. The same note applies as for Content Quality.

## Notes

- Validation, 2026-11-09, after the rework:
  1. The first pass read EC2's Bedrock calls as fallback calls under the $2-a-day sub-budget. The Author's answer of the same day ("The $2-a-day sub-budget stays the laptop's fallback rule") overturned that reading. FR-017, FR-067, SC-017, User Story 3, the cost section, the degraded modes, and the disclosure entries now say so.
  2. The first pass marked Principle I's preference for self-hosted inference as a reading for the Author. His answer ("Record the reason (Recommended)") settled it, and the Constitution Check quotes his reason.
  3. The first pass reused User Story 1's scenario number 7, which the 2026-10-11 reading keeps unused. The new scenario is 10.
  4. ADR 0044 cites spec 001 by the 2026-09-07 outline's numbers. A table under Clarifications maps each conflict and open item it names to this spec.
- Checks run on the file:
  - 72 FR lines, each carrying SHALL; FR-014 to FR-016 stay moved, and no number is reused;
  - 16 SC lines; SC-015 stays moved;
  - exactly five needs-clarification markers, all inside requirements;
  - no reference to ADR 0043, which is spec 005's;
  - no 12-digit number, AWS key prefix, operator-token prefix, or bot-token shape;
  - every dollar amount comes from the repository: $5, $20, $2, $3.50, $14, $1.40, and the Anthropic cap's $20 (`config/budgets.yaml`; spec 000 FR-030); $10 (this folder's intent); $0.0007, $0.00095, and $0.0002 (spec 010's estimate); $2.20 and $3.65 (research.md R-05, dated 2026-10-18); and $50, only inside the quoted point 5, marked as the session's unmeasured estimate. The turn counts and the "hour and a half" are derived from spec 010's estimate and `config/budgets.yaml`'s global limit, and say so.
