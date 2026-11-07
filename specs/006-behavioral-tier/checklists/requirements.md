# Specification Quality Checklist: The Behavioral Tier Off the Merge Path

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-06
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- **The markers, on purpose:** three, the template's limit, for `/speckit-clarify`: FR-006 (does the constitution's run "before merge" have to pass, Q1), FR-007 (when a patch's run happens, Q3), and FR-009 (which effects escalate, Q2). The intent's other two open questions took recommended defaults (Q4, Q5), with eight confirmations.
- **Implementation details:** this is a process change, so the spec names the project's own gates, files, and steps (`tools/gates/gate`, `make evals`, `behavioral.py`): they are what the Author uses, not choices of technique. How each rule is detected, and in which function, is left to the plan ("The plan chooses how", Changes to Human-Only Paths). The human-only table is there because the Author asked that the spec describe what those paths need, since this branch writes none of them.
- **Stakeholders:** the reader is the Author, who runs the gate; the spec uses the gate's own words (PASS, WARN, PENDING, FAIL, SKIP) for that reason.
- **Success criteria:** each is a count or a replay over the recorded history (the twelve hand merges, the four 2026-10-27 misreads, the six entries), so each can be checked without knowing the implementation.
