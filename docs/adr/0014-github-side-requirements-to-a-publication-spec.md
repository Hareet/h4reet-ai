# ADR 0014: Spec 000's GitHub-side requirements move to a publication spec

Status: accepted by the Author, 2026-10-07 · Spec: 000; the publication spec, which has no intent yet · Replaces one Consequence of ADR 0013; the rest of ADR 0013 stands.

## Context

ADR 0013 keeps development local until publication. One of its Consequences says that spec 000 "has to say how each [GitHub-side requirement] is verified locally first and confirmed at publication". Those requirements are User Story 4, the public half of User Story 6 scenario 1, FR-001, FR-005, FR-011, FR-012, FR-014, FR-015, FR-016, SC-004, and SC-008. On 2026-10-07 the Author was asked how spec 000 should do that. The recorded answer: "It doesn't. Every GitHub-side requirement moves out of spec 000 into a separate publication spec, and spec 000 closes on local criteria only."

## Decision

- Every requirement in spec 000 that only GitHub can enforce or show moves to a separate publication spec, specified from its own intent. Spec 000 closes on local criteria only.
- A requirement with a local half keeps that half in spec 000. Until the publication spec's intent exists, the moved text is kept word for word in `specs/000-local-foundations/publication-carryover.md`.
- This replaces the ADR 0013 Consequence quoted above. ADR 0013's Decision and its other Consequences are unchanged. That includes its publication steps (protection on before the next agent session) and its Consequence for spec 001 (plan-in-PR and the protected apply).

## Alternatives considered

- **Verify each requirement twice, locally now and on GitHub at publication.** This is what ADR 0013 implied, and the option recommended to the Author. Spec 000 stays whole, but its completion waits on publication.
- **Rehearse on a private GitHub repository.** Real CI sooner, at the cost of a remote that ADR 0013 avoids.
- **Verify only after publication.** Nothing local stands in, and spec 000 stays open until then.

## Consequences

- For the local phase, the constitution's controls that need CI are deferred to the publication spec, and spec 000's Assumptions record this as a deviation. The deferred controls are secret scanning in CI, automated dependency updates, images built in CI with an SBOM, vulnerability and static analysis on every PR, CI actions pinned by SHA, and Development Workflow step 6's containers "built once and promoted".
  - Local stand-ins cover some of them: pre-commit scanning (FR-012), lockfile pins and pinned bases (FR-014), the local gate (FR-041), and the history scan (FR-042).
  - Nothing local stands in for vulnerability scanning, SBOMs, automated updates, or building once and promoting, so until publication the local tier runs without them.
- The Author set no timing for the publication spec. Some of its criteria can only be met once the repository exists on GitHub, such as branch protection refusing a merge and a negative test PR left open, so it can't be finished before the first push.
- Some moved items could run locally before publication: a spec-link check, SBOM and vulnerability scans, and image digests. The Author moved them with the rest and may bring any back into spec 000.

## Links

Intent: none (a process decision; the publication spec's intent is pending). Spec: 000, Clarifications of 2026-10-07. Merge request: `docs/merge-requests/2026-10-07-chore-repo-hygiene.md`.
