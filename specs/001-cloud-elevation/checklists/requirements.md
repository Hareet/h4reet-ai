# Specification Quality Checklist: Cloud Elevation — Terraform, One Account, EC2 as Prod's Default Host

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-10 · **Revalidated**: 2026-11-09, after the rework around the Author's decisions (ADR 0044, proposed), and again after his answers to questions 13, 14, 15, and 17 the same day
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs). The spec names Terraform, one AWS account, the compose definition, SSO and OIDC, Bedrock, the Anthropic API, Telegram and email, and Grafana and Langfuse, because the constitution, the intent, and specs 000 and 010 already fix them. Since the rework it also names EC2, Route 53 failover records, a Lambda (the start function), spot instances, and September's OpenSSH tunnel, because the Author's decisions and answers of 2026-11-09 name them. It names no language or library, and it leaves the shared state's store and the instance type to the plan.
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders. Partly: the readers include a principal engineer, and infrastructure vocabulary can't be avoided. Each story states its value in plain words before its scenarios.
- [x] All mandatory sections completed: User Scenarios & Testing, Requirements, Success Criteria, Assumptions. Added sections: Scope (reused, added, and changed in other specs), Expected Cost Impact, Degraded Modes, Data-Flow Disclosure Entries, Constitution Check, Open questions for /speckit-clarify (with "Kept for the plan").

## Requirement Completeness

- [x] No needs-clarification markers remain. The Author answered questions 13, 14, 15, and 17 on 2026-11-09, each with the recommended option. Question 16, the IAM, wasn't asked: the session took its recommended option provisionally, as a default the plan carries, marked in FR-070 and Clarifications as not the Author's words. The conflicts the spec couldn't settle are listed under "Kept for the plan" and block no requirement.
- [x] Requirements are testable and unambiguous. All 72 functional requirements use an EARS keyword (WHEN, WHILE, IF … THEN, WHERE, or a plain SHALL). Each names something a test, a scan, the matrix, or an audit can check.
- [x] Success criteria are measurable. There are 17, and each has a count, a time, a percentage, or a pass condition from a scan. SC-002's target is the figure the Author sets after the plan measures (question 14).
- [x] Success criteria are technology-agnostic. Mostly: SC-005 (image digests), SC-012 (merge-request notes and apply records), and SC-017 (adapters and ledger rows) name the project's own process objects.
- [x] All acceptance scenarios are defined: 60 Given/When/Then scenarios across 8 user stories.
- [x] Edge cases are identified (24).
- [x] Scope is clearly bounded: the Scope section (what's reused, added, and changed in other specs) and "Out of scope" in Assumptions.
- [x] Dependencies and assumptions identified: spec 000, the constitution's 1.1.0 amendment, spec 010's preconditions, spec 002's contract, the publication spec, and the Author's terminal actions. Named readings: the server budget's scope, the tunnel end and the relay, spot, what serves while no host does, the laptop without a network, and the resting message's words. Named deviations: the local-phase plan and apply stand-in, the CI-side supply-chain controls, identical images, and one deviation that ends (the hand-made runtime identity).

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria. Each EARS statement is its own criterion. Most FRs are also tied to a scenario, a success criterion, or a row of Degraded Modes.
- [x] User scenarios cover primary flows: infrastructure change and apply, the two budgets and the safety net, visitors served from EC2, the laptop's takeover and EC2's return, the disclosure, the stack on EC2, EC2 on spot and its interruptions, and the public dashboard.
- [ ] Feature meets measurable outcomes defined in Success Criteria. Not yet: the plan waits on the Author's constitution patch, and the server budget's figure waits on the plan's measurement.
- [x] No implementation details leak into specification. The same note applies as for Content Quality.

## Notes

- Validation, 2026-11-09, after the rework:
  1. The first pass read EC2's Bedrock calls as fallback calls under the $2-a-day sub-budget. The Author's answer of the same day ("The $2-a-day sub-budget stays the laptop's fallback rule") overturned that reading. FR-017, FR-067, SC-017, User Story 3, the cost section, the degraded modes, and the disclosure entries now say so.
  2. The first pass marked Principle I's preference for self-hosted inference as a reading for the Author. His answer ("Record the reason (Recommended)") settled it, and the Constitution Check quotes his reason.
  3. The first pass reused User Story 1's scenario number 7, which the 2026-10-11 reading keeps unused. The new scenario is 10.
  4. ADR 0044 cites spec 001 by the 2026-09-07 outline's numbers. A table under Clarifications maps each conflict and open item it names to this spec.
- Validation, 2026-11-09, after the clarify answers:
  1. The five markers are cleared: FR-052 (the tunnel end), FR-021 (measure, then the Author sets the figure), FR-069 (spot, around the clock), FR-071 (the same gap, plus an alert), and FR-070 (the session's provisional default, marked as not his answer).
  2. Added for the answers: the tunnel end in Terms, Scope, Key Entities, the disclosure (S17; C1, C3, C5, and C7 changed), the cost table, and the degraded modes; FR-053's health-path clause; FR-054's probe at the tunnel end; SC-018 for spot interruptions; User Story 7's scenario 5; and three edge cases.
  3. Removed what the answers closed: the schedule as a live pattern (it stays in reserve), the start function's "running pattern says off" condition, and the schedule's edge case.
- Checks run on the file:
  - 72 FR lines, each carrying SHALL; FR-014 to FR-016 stay moved, and no number is reused;
  - 17 SC lines; SC-015 stays moved;
  - no needs-clarification marker;
  - no reference to ADR 0043, which is spec 005's;
  - no 12-digit number, AWS key prefix, operator-token prefix, or bot-token shape;
  - every dollar amount comes from the repository: $5, $20, $2, $3.50, $14, $1.40, and the Anthropic cap's $20 (`config/budgets.yaml`; spec 000 FR-030); $10 (this folder's intent); $0.0007, $0.00095, and $0.0002 (spec 010's estimate); $2.20 and $3.65 (research.md R-05, dated 2026-10-18, also quoted in question 13's option); and $50, only inside the quoted point 5, marked as the session's unmeasured estimate. The turn counts and the "hour and a half" are derived from spec 010's estimate and `config/budgets.yaml`'s global limit, and say so.
