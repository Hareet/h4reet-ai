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

## Clarify session, 2026-10-11 and 2026-10-12

The lead session ran `/speckit-clarify` with the Author, who asked for all twelve open questions rather than the skill's usual five. The session:
- wrote the answers into `spec.md`'s Clarifications and carried each one through the spec;
- created `publication-carryover.md`;
- toggled one checkbox in `checklists/requirements.md`.

There is still no plan and no code.

| # | Question | Answer |
|---|---|---|
| 1 | GitHub-side requirements (FR-014 to FR-016, SC-015) | B: they moved word for word to `publication-carryover.md`, and spec 001 closes on local criteria. ADR 0008 records the move. |
| 2 | Production's meter of record (FR-017) | D, from a reframed set of options. While the local tier is up, its stack answers visitors through the tunnel. The fallback gateway on the cloud VM holds the meter of record and the kill switch. Local prod drops its paid route. |
| 3 | Infrastructure cost (FR-020) | A: the meter books it. |
| 4 | Public request cap (FR-033) | A: in the relay. |
| 5 | Hello public | A: yes, capped, as a test endpoint. |
| 6 | Idle target (FR-021) | A: ≤ $10/month. How the VM runs (on demand or spot) is left to the plan. |
| 7 | Neither tier can answer (FR-036) | A: the degraded response and a notice. |
| 8 | AWS-side breach (FR-023) | A: paid-model calls are revoked until the Author restores them. |
| 9 | Releases before publication | A: built once from the Author's terminal and pulled by digest. |
| 10 | Public view | A: always the cloud-hosted snapshot. |
| 11 | Where the tunnel ends | A: inside the account, on the cloud VM. |
| 12 | Who runs `terraform plan` | A: the Author's terminal; agents run offline checks. |

The Author answered questions 3 to 12 together: "I've read through the clarify questions in teh spec and the rest of them you can go with the recommendeded ones. I agree with the recommendations".

### Reference re-check against main
This branch is 265 commits behind `main`. A subagent re-checked every reference to a source outside spec 001 against `main` at f20be52. Every quote was still word for word. Five passages misstated spec 000 as merged, and each is now fixed:
- **The local tier's egress.** The draft said a decision "stands"; no decision is recorded (disclosure row S2).
- **FR-040's disclosure columns.** It now lists all of spec 000's columns, adding from → to, trigger, and the FR.
- **Human-only config files.** `config/prices.yaml` is now listed with the others (ADR 0017).
- **The image deviation.** It now names both of spec 000's deviations: image variants, and T184's one gateway build per stack.
- **"Spec 000 first".** It now records that T105 and T119 were open, and that prod's route is local only until T105 lands.

### What the answers change in spec 000
The spec's Scope section lists each of these:
- Production's meter, kill switch, and Bedrock route move to the fallback gateway, and the local prod environment file keeps no paid route.
- The meter books infrastructure cost, but data-model.md §2.4's attribution check has no value for it yet.
- `config/routing.yaml`'s schema "keeps every primary local", but the fallback gateway's route has no local primary.
- The operator CLI's `--url` accepts only a local address at the stack's own port, so it can't reach the cloud stack yet.
- The environment contract allows only three stack names, none of them for the cloud stack.
- `edge` authenticates the tunnel's callers. The model server keeps its no-key setup, because the local path reaches `edge`, not the model server.

### For the Author (clarify session)
- **Check this reading.** A degraded answer from the local path counts as a failed local path, so the relay falls back to the paid route within the sub-budget. Only the meter of record's kill switch stops every answer. If tripping your machine's own kill switch should also stop visitors' answers, say so before the plan.
- **Two answers where the session leaned the other way.** They're recorded as you chose them:
  - Question 3: a fixed split, lowering the metered ceilings by the idle target, would avoid both a ledger schema change and billing reconciliation inside the enforcement point.
  - Question 5: your remark that "the LLM calls will only happen from the interacts to the ai twin" points toward keeping hello yours alone until the twin exists.
- **How the VM runs** is the plan's choice within ≤ $10/month. The relay and the tunnel's end are on the VM, so it must be up whenever visitors are served. Your Lambda scenario would therefore need questions 2 and 11 revisited. You can still stop the VM on purpose for days: the site loads, and the edge answers hello and status with its degraded body.
- **START-HERE §5** still lists the idle target and the edge rate-limiting mechanism as open, and both are now answered. START-HERE has changed on main since this branch was cut, so update it after the merge.
- **`.specify/feature.json`** still points at spec 000. Until it points here, `/speckit-plan`'s prerequisite script will use spec 000's paths.
- **The checklist's notes** keep the draft's counts (62 FRs, 15 SCs, 49 scenarios, 18 edge cases), because the clarify skill only toggles checkboxes. The spec now has 59, 14, 46, and 19.
- **Review.** The REVIEW.md pass still belongs to an agent that didn't write the change. This session wrote the clarifications.

### Verification (clarify session)
- No gate reads `specs/001-cloud-elevation/`, so `make check` can't change from main's result, and it wasn't run.
- The spec's own checks all pass:
  - no needs-clarification marker remains;
  - all 59 FRs carry SHALL;
  - nothing refers past FR-062 or SC-014, except to the moved SC-015;
  - the only new headings are Clarifications and its two sessions.
- Every quote added in this session was checked against `main`: the routing header, operator-admin.md §6, env-files.md, data-model.md §2.4, disclosure row S2, ADRs 0003 and 0017, research R-06, the plan-interview record, and tasks T105 and T119. The Author's words are quoted from this session.
