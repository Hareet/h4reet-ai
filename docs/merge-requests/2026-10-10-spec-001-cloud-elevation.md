# spec/001-cloud-elevation
Spec: specs/001-cloud-elevation/ · Intent: specs/001-cloud-elevation/intent.md (accepted) · Written by: the spec-writer agent (the draft); the lead session (checks, this note) · Date: 2026-10-10
Session: /home/h4reet/h4reet-ai/h4reet-ai · Repo hooks active: yes. The spec-writer had no shell, and its writes were under specs/001-cloud-elevation/ only.
Authorized by: the Author's direction of 2026-10-10: "try to continue on to the other User Stories and even the other Spec if you have time". This is a draft for `/speckit-clarify`, with no plan and no code.

## What changed and why
`spec.md` goes from the 2026-09-07 outline (96 lines) to a full specify pass (565 lines). Its Status line says so: "Draft, from a full specify pass on 2026-10-10, made ahead of spec 000's completion; awaiting `/speckit-clarify` with the Author." The rule that spec 000 is implemented, and passes its success criteria, before this spec is planned still stands.

- **Scope.** A new section lists what spec 001 reuses from spec 000 and what it adds. It also names each spec 000 piece that has to change, so none changes silently:
  - production's meter of record may move;
  - the gateway's client-address trust chain;
  - the model server's deferred API key;
  - the literal `127.0.0.1` port bindings;
  - preflight's rule of exactly one `gpu` or `cpu` profile;
  - the hand-made Bedrock runtime identity;
  - disclosure rows S1, S2, F1, F2, A1, and A2.
- **Seven user stories, five of them P1.**
  - P1: infrastructure planned by machines and applied by a human; one ceiling for everything, with a cloud safety net (raised from P2 by Principle V); h4reet.ai answers whether or not the machine is awake; a visitor can see what leaves their device (new: this spec carries the first visitor bytes); the same compose stack on a cloud VM.
  - P2: the local tier joins production without opening a port; the public dashboard never goes dark.
- **Counts:** 62 functional requirements in EARS form, 15 success criteria, 49 scenarios, and 18 edge cases. New sections: Expected Cost Impact, Degraded Modes (19 rows), Data Flows This Spec Adds (17 flows), a Constitution Check, a traceability table from the outline's numbers to the new ones, and 12 open questions.
- **GitHub and ADRs 0013 and 0014.** The plan on PRs, the protected apply, and CI's OIDC roles are FR-014 to FR-016, scoped "WHILE the repository is published on GitHub". Until publication, two stand-ins apply:
  - FR-005: the local gate fails unless the merge-request note carries a redacted plan;
  - FR-007: the Author applies a saved plan from their own terminal, and the apply leaves a record.

  This answers ADR 0003's "spec 001 must say how it is recorded". FR-006 refuses agents every apply-class Terraform command, in every spelling. Apply from the Author's terminal is named in Assumptions as a local-phase deviation, and its basis is ADR 0013.
- `checklists/requirements.md` is new. Every item passes except "no markers remain", which stays open by design.

## Acceptance criteria
None: this is a specification draft. Its own criteria are SC-001 to SC-015.

## Constitution check
The table is the spec's "Constitution Check" section. It covers the eight principles and the standards. It names three deviations, all for the local phase or carried over:
- applying from the Author's terminal instead of a protected environment (ADR 0013);
- the CI-side supply-chain controls (ADR 0014);
- identical images (spec 000's existing deviation).

## Review
- The lead session, which didn't write the draft, read it whole. It then checked each of its 49 quoted passages of 25 characters or more against the repository. All are word for word in their sources:
  - spec 000's spec, plan, research, and contracts;
  - ADRs 0003, 0005, 0013, and 0014;
  - START-HERE, the constitution, and the intent;
  - two in the 2026-09-07 outline that this branch replaces.

  Two quotes had ended with a period where the source's sentence goes on: the intent's first problem and Principle V. This commit fixes both.
- The new ADR numbers 0007 to 0009 are the ones the ADR index reserves for spec 001.
- No secret, account-ID, or key shape appears.
- Each dollar figure is $5, $20, $2, $3.50, $14, $1.40, or $10, from the intent, spec 000, or `config/budgets.yaml`. The one derived figure, $10 a month for metered calls in question 3's option B, is $20 less the intent's $10 target.
- A REVIEW.md pass by a reviewer agent belongs after `/speckit-clarify`, once the Author's answers have settled the markers.

## Verification
- No gate reads `specs/001-cloud-elevation/`. On this branch, `git grep` finds `specs/` only in Spec Kit's own scripts and in the matrix's scratch stand-in for spec 000. So `make check` can't change from main's result, and it wasn't run here.
- The commit ran the pre-commit secret scan.

## Cost and data-flow impact
None until the spec is planned and built. The spec itself commits to the cost model ("All of it must fit the same $5/day, $20/month ceiling"; "Idle infrastructure target ≤ $10/month") and to 17 new flows. Each flow becomes a disclosure row in the change that creates it (FR-040).

## For the Author
- **Run `/speckit-clarify` on this spec.** Four markers carry the decisions that change scope:
  1. the GitHub-side requirements against ADRs 0013 and 0014;
  2. which stack holds production's meter of record;
  3. how infrastructure cost counts against the ceiling;
  4. where the public request cap is enforced.

  Questions 5 to 12 have stated defaults in Assumptions; accept them or answer them. Each question has a recommended option first.
- **The drafter's uncertainties.**
  - Question 2's recommendation drops the local production stack's own Bedrock fallback, which is a real change to spec 000's production.
  - Question 10's recommendation, the snapshot only, leans on least privilege, while the constitution's wording leans toward live Grafana.
  - The 5-minute and 1-hour figures are defaults, not sources.
- **The spec 000 references.** They come from spec 000's branches as they stood on 2026-10-10, through US5's simulated merge. The clarify session re-checks them against spec 000 as merged.
- **START-HERE §3** says spec 001 is "specified in full only after spec 000's success criteria pass on your machine". This pass ran earlier, at your direction, and the Status line and Assumptions say so.
