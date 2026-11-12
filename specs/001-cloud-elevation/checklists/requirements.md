# Specification Quality Checklist: Cloud Elevation — Terraform, One Account, EC2 as Prod's Default Host

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-10 · **Revalidated**: 2026-11-09, four times: after the rework around the Author's decisions (ADR 0044, proposed); after his answers to clarify questions 13, 14, 15, and 17; after his answers to the plan's questions 1 to 4, with tasks.md written; and after `/speckit-analyze` over 8acc2686
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs). The spec names Terraform, one AWS account, the compose definition, SSO and OIDC, Bedrock, the Anthropic API, Telegram and email, Grafana and Langfuse, EC2, Route 53's health check, a Lambda, spot instances, September's OpenSSH tunnel, and the relay on the tunnel end, because the constitution, the intent, specs 000 and 010, and the Author's answers of 2026-11-09 fix them. The plan picks the rest: RDS for the shared state, the instance types, and the libraries.
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders. Partly: the readers include a principal engineer, and infrastructure vocabulary can't be avoided. Each story states its value in plain words before its scenarios.
- [x] All mandatory sections completed: User Scenarios & Testing, Requirements, Success Criteria, Assumptions. Added sections: Scope, Expected Cost Impact, Degraded Modes, Data-Flow Disclosure Entries, Constitution Check, Open questions (with how each kept item was settled).

## Requirement Completeness

- [x] No needs-clarification markers remain. The spec's questions 13 to 17 and the plan's questions 1 to 4 are answered in the Author's words. The provisional answers, marked as the session's defaults and not his words, are the spec's question 16 and the plan's questions 5 to 7; tasks.md's T000 asks him to confirm or overturn them. One question is open, and not a marker in the spec: the plan's question 8, the relay on spot against the Cloud standard's "must be always-on", which T000 asks.
- [x] Requirements are testable and unambiguous. All 73 functional requirements use an EARS keyword (WHEN, WHILE, IF … THEN, WHERE, or a plain SHALL). Each names something a test, a scan, the matrix, an audit, or a rehearsal can check.
- [x] Success criteria are measurable. There are 17, and each has a count, a time, a percentage, or a pass condition. SC-002's target is the figure the Author sets after the plan measures (tasks.md T017).
- [x] Success criteria are technology-agnostic. Mostly: SC-005 (image digests), SC-012 (merge-request notes and apply records), and SC-017 (adapters and ledger rows) name the project's own process objects.
- [x] All acceptance scenarios are defined: 61 Given/When/Then scenarios across 8 user stories.
- [x] Edge cases are identified (24).
- [x] Scope is clearly bounded: the Scope section and "Out of scope" in Assumptions.
- [x] Dependencies and assumptions identified: spec 000, the constitution's 1.1.0 amendment as amended, spec 010's preconditions, spec 002's contract, the publication spec, and the Author's terminal actions. Named readings: the server budget's scope and the resting message's words. Decided: the tunnel end and the relay, what serves while no host does, and the laptop without a network. Named deviations: the local-phase apply, the CI-side supply-chain controls, identical images, the secrets outside Terraform, and one deviation that ends (the hand-made runtime identity).

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria. Each EARS statement is its own criterion, and tasks.md ties each to a test task or an Author's run.
- [x] User scenarios cover primary flows: infrastructure change and apply; the two budgets and the safety net; visitors served from EC2; the laptop's takeover and EC2's return; the tunnel end's spot interruptions; the disclosure; the stack on EC2; EC2 on spot; and the public dashboard.
- [ ] Feature meets measurable outcomes defined in Success Criteria. Not yet: tasks.md waits on T000, the Author's approval, and then on T001, his constitution patch, before any group.
- [x] No implementation details leak into specification. The same note applies as for Content Quality.

## Notes

- Validation, 2026-11-09, after the rework:
  1. EC2's Bedrock calls are kept out of the laptop's sub-budget, by the Author's answer ("The $2-a-day sub-budget stays the laptop's fallback rule").
  2. Principle I's preference for self-hosted inference is settled by his recorded reason.
  3. User Story 1's new scenario is numbered 10; 7 to 9 stay unused.
  4. ADR 0044's outline numbering is mapped under Clarifications.
- Validation, 2026-11-09, after the clarify answers: the five markers cleared; the tunnel end added throughout; SC-018 added.
- Validation, 2026-11-09, after the plan's questions:
  1. **The DNS-failover reading of point 1 is superseded** by the plan's question 1 answer. The changed text: Terms (the relay, the tunnel end, the failover), Scope, User Stories 1, 4, and 7, the Edge Cases, FR-001, FR-029, FR-034, FR-037, FR-052 to FR-054, FR-063 to FR-066, FR-072, FR-075, SC-007, SC-016, Assumptions, the cost table, Degraded Modes, the disclosure rows (S15, S17, C1, C5, and the new C14), and the Constitution Check. This line first said that a search found no text left that had DNS moving visitors. That was wrong: the analysis of 2026-11-09 found pre-question-1 text at spec.md :67, :458, :596, :597, and :624, and research.md :138 and :253, now rewritten. A search on 2026-11-09, after that pass, for "DNS moves", "DNS moving", "failover answers", "failover records", and "answering with the laptop" finds them only where the text says the reading is superseded (spec.md's Clarifications) or where plan.md and research.md record the options as first offered.
  2. **FR-076, the tunnel end on spot** (question 2), with its Degraded Modes row, an edge case, User Story 4's scenario 14, and SC-018's three interruptions of the tunnel end.
  3. **The Observability and Cloud standards' two sentences** are no longer deviations (question 3).
  4. **Offline demos on `ENV=dev`** are decided (question 4).
- Validation, 2026-11-09, after `/speckit-analyze` over 8acc2686 (the note's 2026-11-09 section lists the findings and the fixes):
  1. "always-on" no longer describes the tunnel end; it says "around the clock, on spot". The word stays only inside quotes: the Author's option titles, the intent, and the constitution's text.
  2. The disclosure rows V2, V4, V6, C2, C3, C4, and S17 describe one relay, on the tunnel end, and the new row C15 carries the telemetry forward 2202.
  3. FR-017 has the relay read the kill switch; FR-071 has the guard stop EC2 while the server budget's action has run.
  4. The plan's question 8 is open for T000.
- Validation, 2026-11-09, after the analysis's remaining findings (the note's second 2026-11-09 section):
  1. "Pause switch" is now "the autostart switch" throughout the spec: `on` lets EC2 start automatically. The alert codes `paused` and `ec2_stopped_paused` keep their names, in the contracts.
  2. FR-019 covers a store restored from a backup; FR-057 says the public view names no host while the tunnel end is gone; FR-069 lists every start and stop.
  3. Rows C6 and C7 are widened (the loop's status and describe calls; ECR and SNS), and Degraded Modes gains a row for the shared state unreachable everywhere.
  4. The price per turn cites the Author's confirmation (commit ada55c98, version 2026-11-09.1); the tunnel end's figures and the store's line are marked to confirm or to price.
- Checks run on the file:
  - 73 FR lines, each carrying SHALL; FR-014 to FR-016 stay moved, and no number is reused;
  - 61 Given/When/Then scenarios; 24 edge cases;
  - 17 SC lines; SC-015 stays moved;
  - no needs-clarification marker;
  - no reference to ADR 0043 as this spec's; plan.md names it once, as spec 005's;
  - no 12-digit number, AWS key prefix, operator-token prefix, or bot-token shape;
  - every dollar amount comes from the repository or from the Author's quoted options: $5, $20, $2, $3.50, $14, $1.40, the Anthropic cap's $20, $10, spec 010's per-turn estimates, R-05's $2.20 and $3.65 (2026-10-18), and the quoted $50, marked as the session's unmeasured estimate.
