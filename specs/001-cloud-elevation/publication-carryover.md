# Spec 001: what moved to the publication spec

Spec 001's clarification of 2026-10-11 moved the plan posted on pull requests, the apply from a protected environment, and CI's OIDC roles out of `spec.md` and into the publication spec. Spec 000's clarification of 2026-10-07 did the same with spec 000's GitHub-side requirements (ADR 0014). Spec 001 then closes on local criteria, and ADR 0008 records the move. The publication spec has no intent yet. Until it does, this file holds the moved text word for word as it stood in spec 001's draft of 2026-10-10 (commit e11dbec), so that the intent can start from this file and spec 000's `publication-carryover.md`. **Nothing in this file is a requirement of spec 001.**

## Moved whole

### Requirements and criteria

- **FR-014**: WHILE the repository is published on GitHub, WHEN a pull request changes `infra/`, THE SYSTEM SHALL post the plan for each affected environment on the pull request and block the merge on a plan failure.
- **FR-015**: WHILE the repository is published on GitHub, WHEN an infrastructure change merges, THE SYSTEM SHALL apply it only from a protected environment, after the Author approves it there.
- **FR-016**: WHILE the repository is published on GitHub, THE SYSTEM SHALL give CI cloud access only through OIDC federation to environment-scoped roles. There SHALL be a read-only plan role for pull requests and an apply role that trusts only the protected environment.
- **SC-015**: After publication, every infrastructure pull request shows its plan, zero applies run without the Author's approval in the protected environment, and CI holds no static credential (question 1).

### User Story 1, acceptance scenarios 7 to 9

7. **Given** a PR changing `infra/` after publication, **When** CI runs, **Then** the plan for the affected environment is posted and merge is blocked on plan failure (FR-014).
8. **Given** a merged infra change after publication, **When** the apply workflow runs, **Then** it pauses on a protected environment requiring the Author's approval (FR-015).
9. **Given** CI needs cloud access after publication, **When** it authenticates, **Then** it uses OIDC to an environment-scoped role; no static credentials exist (FR-016).

### Degraded Modes row

| What is gone | What a visitor gets | What the operator gets | Requirements |
|---|---|---|---|
| CI, after publication | Nothing changes | No plans on pull requests; applies wait | FR-014, FR-015 |

### Data flow C12

| Flow | From → to | Carries | Never carries | Why |
|---|---|---|---|---|
| C12 | after publication: CI → AWS's APIs | OIDC tokens, plan reads, apply writes | static credentials | FR-016 |

## Moved in part

Each item below keeps its local half in `spec.md`. The original text is quoted in full, and the part that moved is named after it.

- **User Story 1**: "As the Author, I want all cloud infrastructure in Terraform in one AWS account. Environments are separated by VM, IAM role, tag, and budget. The plan is posted on every PR, apply is gated behind a protected environment I approve, and only short-lived identity-based credentials exist anywhere. Until publication (ADR 0013) there are no pull requests and no CI. In that phase the plan goes in the branch's merge-request note, and apply is my own terminal action, recorded." Moved: the plan posted on every PR, and apply gated behind a protected environment.
- **User Story 1, Independent Test**: "Take a branch that changes `infra/`. The local gate refuses it until its note carries the redacted plan. Every apply-class command from an agent session is refused. After the Author merges, the Author's apply creates exactly what the plan showed and leaves an apply record. The credential audit finds zero access keys, and the tag check finds no untagged resource. Scenarios 7 to 9 wait for publication." Moved: scenarios 7 to 9.
- **Scope, added by this spec**: "`infra/`: Terraform for one AWS account. It covers the state backend; the budgets, the anomaly monitor, and the budget action; the DNS zone and the certificate; the edge and the static site's storage; the cloud VM, its network, and its roles; the secrets store's entries; and, after publication, CI's OIDC roles." Moved: CI's OIDC roles.
- **Key Entities, plan record**: "a redacted Terraform plan for one environment at one commit. It is carried in the merge-request note and, after publication, posted on the pull request." Moved: posting it on the pull request.

## Also for the publication intent

Noted during spec 001's clarification on 2026-10-11:

- **CI's roles are IAM in spec 001's Terraform.** They go into `infra/`, and spec 001's FR-012 protects the Terraform that defines IAM. An agent can propose them only as a patch the Author applies, with an ADR.
- **The credential audit.** Spec 001's FR-008 says "No CI identity SHALL exist in the account before publication", and a committed audit checks it before every apply and at least weekly. The publication spec changes that audit when it adds the roles.
- **The protected environment.** START-HERE §6 step 4 already adds it: "Add a `production` environment with required reviewers = you (used by spec 001's apply)."
- **The stand-ins.** Until publication, spec 001's FR-005 (the plan in the merge-request note) and FR-007 (the Author's recorded terminal apply) stand in. The publication spec says what replaces them.
