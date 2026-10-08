# Spec 000: what moved to the publication spec

Spec 000's clarification of 2026-10-07 moved everything that only GitHub can enforce or show out of `spec.md` and into a separate publication spec, so spec 000 closes on local criteria only (ADR 0014). That spec has no intent yet. Until it does, this file holds the moved requirements word for word as they stood in spec 000 on `main` before the clarification, so its intent can start here. **Nothing in this file is a requirement of spec 000.**

## Moved whole

### User Story 4 - No Code Merges Without a Spec, and Every PR Is Reviewed by Someone Who Didn't Write It (Priority: P1)

As the Author, I want CI on hosted runners to refuse any implementation PR without an approved spec, run the tests and the eval and red-team scaffolds, and post the `REVIEW.md` passes from a reviewer with no write access.

**Why this priority**: Constitution Principle III.

**Independent Test**: A PR changing source without a spec link fails with an actionable message; a PR with a link runs all gates and receives the reviewer's comment; a PR changing a hook runs the agent-configuration evals.

**Acceptance Scenarios**:

1. **Given** a PR touching `apps/`, `services/`, `deploy/`, or `infra/`, **When** it references no `specs/NNN-*/spec.md`, **Then** the required check fails and explains how to link one.
2. **Given** a linked PR, **When** CI runs, **Then** tests, eval harness, red-team harness, secret scanning, dependency and static analysis, image build, and a constitution check all report status.
3. **Given** the same PR, **When** the reviewer agent runs headlessly, **Then** it posts one comment with the four `REVIEW.md` passes tagged by severity, and it has no write access.
4. **Given** a PR changing `CLAUDE.md`, `REVIEW.md`, or `.claude/**`, **When** CI runs, **Then** the agent-configuration eval suite runs and a drop below threshold blocks merge.
5. **Given** branch protection on `main`, **When** any actor other than the Author attempts to merge, **Then** it is refused.

### Requirements and criteria

- **FR-015**: CI MUST run only on hosted runners.
- **SC-004**: Zero PRs touching `apps/`, `services/`, `deploy/`, or `infra/` can merge without a linked spec; a negative test PR stays open as evidence.
- **Edge case**: Fork PR from a stranger: hosted runners, read-only tokens; no self-hosted runner ever.

## Moved in part

Each requirement below keeps its local half in `spec.md`. The original text is quoted in full, and the part that moved is named after it.

- **FR-001**: "The repository MUST be public from its first commit and contain the MIT license, `SECURITY.md`, `CONTRIBUTING.md`, a code of conduct, `CODEOWNERS` covering the enforcement layer, `intent/` with the template, `docs/adr/`, `docs/incidents/`, and `docs/how-we-build/`." Moved: public from its first commit.
- **FR-005**: "A devcontainer MUST provide the complete toolchain, and CI MUST run in the same image." Moved: CI runs in the same image.
- **FR-011**: "WHEN `CLAUDE.md`, `REVIEW.md`, or `.claude/**` changes, THE SYSTEM SHALL run the agent-configuration evals in CI and block merge below threshold." Moved: running them in CI and blocking the merge there.
- **FR-012**: "No secret MUST exist in the repository, agent context, or telemetry; secret scanning MUST run on pre-commit and CI." Moved: scanning in CI.
- **FR-014**: "Dependencies MUST be lockfile-pinned with automated updates; CI actions pinned by SHA; images built in CI from pinned bases with an SBOM; vulnerability and static analysis on every PR." Moved: automated updates, actions pinned by SHA, images built in CI with an SBOM, and analysis on every PR.
- **FR-016**: "Every service MUST be a container image built in CI and promoted unchanged." Moved: built in CI and promoted unchanged.
- **SC-008**: "The agent-configuration evals run on every `.claude/**` change and their history is public." Moved: the history is public.
- **User Story 6, scenario 1**: "**Given** the public repository, **When** opened, **Then** the README links the constitution, `intent/`, the spec index, the ADR index, `docs/how-we-build/`, `SECURITY.md`, and the MIT license." Moved: the check on the public repository.
- **Edge case**: "Legitimate change to budgets, alerting, or the kill switch: ADR plus Author approval; CI flags it sensitive." Moved: CI flags it sensitive.
- **Edge case**: "Indirect forbidden actions (a script that does the thing): hooks plus sandbox network and credential denies plus branch protection. The matrix includes one indirect variant per action." Moved: branch protection. Until publication, spec 000 names the git hook that keeps `main` the Author's in its place.

## Also for the publication intent

Found while specifying and reviewing spec 000 on 2026-10-07 (`docs/merge-requests/2026-10-07-chore-repo-hygiene.md` has the detail):

- **Branch protection.** GitHub doesn't count a pull request author's own approval. Agent pull requests need an identity of their own, the Author's own pull requests to the governance files need a way to merge, and CODEOWNERS works only if the rules require code-owner review.
- **Dependabot.** `.github/dependabot.yml` covers npm, pip, GitHub Actions, and Dockerfile base images. Images pinned in compose files, Terraform providers, and devcontainer features aren't covered yet. Dependabot pull requests that touch manifests under `apps/` or `services/` need an exemption from the spec-link check.
- **Locally checkable items.** Some moved items could also run before publication: a spec-link check, SBOM and vulnerability scans through the allowlisted registries, and image digests compared across environments. The Author moved them with the rest and may bring any back into spec 000. Until then, nothing local stands in for vulnerability scanning, SBOMs, automated updates, or building images once and promoting them.
- **Timing.** The Author set no timing for the publication spec. Some of its criteria can only be met once the repository exists on GitHub, such as branch protection refusing a merge and a negative test PR left open, so it can't be finished before the first push.
