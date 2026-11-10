# ADR 0008: Terraform with reviewed plans and the Author's recorded apply until publication; the GitHub-side half moves to the publication spec

Status: proposed, 2026-11-10 · Spec: 001 (FR-001 to FR-012; plan §1, §2; research.md R-02, R-03, R-13, R-14, R-16; contracts/infra-records.md) · Replaces one Consequence of [ADR 0013](0013-local-until-publication.md), "in spec 001, plan-in-PR and the protected apply", as [ADR 0014](0014-github-side-requirements-to-a-publication-spec.md) did for spec 000 · Accepted when the Author merges spec 001's groups 1 to 4 (`feat/001-cloud-elevation`), after his approval at T000 · Number: reserved for spec 001 since 2026-09-07

## Context

The constitution's Cloud standard asks for "plan output posted on every PR; apply from a protected environment requiring human approval", and Principle IV says "`apply` and `destroy` are human actions". Until publication there are no pull requests and no CI (ADR 0013).

The Author's answers, verbatim, as spec.md's Clarifications quote them:

> Session 2026-10-11. Q: Should the GitHub-only requirements stay in spec 001 as after-publication items, or move to the publication spec the way spec 000's did? → A: "B" (recommended), which read: "Move them word for word to the publication spec, through a carry-over file like spec 000's `publication-carryover.md`. Spec 001 keeps FR-005 and FR-007 and closes on local criteria. ADR 0008 records the move."

> Session 2026-10-12. Q: Who runs the real `terraform plan` before publication? (FR-005) → A: "A (recommended)", which read: "the Author's terminal, while agent sessions run offline checks against a provider cache the Author seeds."

His approval of the plan, and his direction on versions, 2026-11-10: "Let's approve the t000 and spec 001 plan. Let's have you build it out but not push or try anything in the cloud yet, i will do that in the morning, but you can have everything ready and verified by then. Use the latest dependenices adn versions for aws services, plugins"

## Decision

1. **Terraform, pinned:** Terraform 1.17.1 and `hashicorp/aws` 6.72.0, the latest releases the session established on 2026-11-10, which he confirms in his terminal at T011, in `.devcontainer/toolchain.vars`, each root's `required_version` and `required_providers`, and its lockfile. No other provider (rules T3 and T10).
2. **State** in a versioned, encrypted, never-public S3 bucket with S3's own lock file, one key per root, bootstrapped from a local state under `~/.config/h4reet-ai/infra/` and migrated by the Author (research.md R-03).
3. **The plan in the note:** `make plan ROOT=<root>` in his terminal runs the policy on the HCL before `init`, then `init` and `plan -out`, the policy again on the plan's JSON, and prints a redacted block tied to `infra/`'s tree hash. The gate's `infra-plan-note` step fails a branch whose changed roots have no such block (contracts/infra-records.md §2).
4. **The apply, recorded:** `make infra-verify`, then his own `terraform -chdir=infra/<root> apply <saved plan>`, then `make infra-record`, whose record arrives on an `ops/apply-<root>-<date>` branch he merges. There is no `make apply`.
5. **Agents plan offline only:** `make infra-check` (fmt, validate against his provider mirror, the policy), and the bash gate refuses every state-changing Terraform command in every spelling, the Author-only targets, and their API equivalents (research.md R-16, R-32; the guard patch P-1).
6. **The GitHub-side half moves** to the publication spec word for word (`specs/001-cloud-elevation/publication-carryover.md`): FR-014 to FR-016, SC-015, and flow C12.

## Alternatives considered

- **Plans posted on pull requests and a protected apply now:** not possible before publication (ADR 0013).
- **Refusing `terraform` entirely to agents:** it would also refuse `fmt` and `validate`, the offline checks agents need (research.md R-16).

## Consequences

- ADR 0013's Consequence "in spec 001, plan-in-PR and the protected apply" is replaced by this record: the plan travels in the merge-request note and the apply is the Author's terminal action, recorded, until the publication spec.
- The deviation is named in spec.md's Assumptions ("Deviation for the local phase") and lasts until publication.
- A later release of Terraform or the provider is a pin change in his terminal, with the mirror re-seeded (`make infra-mirror`) and each root's lockfile written again from it.

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) · Contract: [infra-records.md](../../specs/001-cloud-elevation/contracts/infra-records.md) · Carry-over: [publication-carryover.md](../../specs/001-cloud-elevation/publication-carryover.md)
- Replaces one Consequence of: [ADR 0013](0013-local-until-publication.md) · Related: [ADR 0014](0014-github-side-requirements-to-a-publication-spec.md), [ADR 0007](0007-one-aws-account.md)
