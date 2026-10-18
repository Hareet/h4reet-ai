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

## Plan draft, 2026-10-18

Written by: the lead session (research.md and plan.md) and a forked helper of it (data-model.md, contracts/, quickstart.md, and the plan's follow-on changes), in `/tmp/claude-1000/wt-spec001`. Authorized by: the Author's direction of 2026-10-17, "trust the recommendations and keep going as far as we can!", and the overnight plan agreed that evening: "spec/001: rebase onto main, then draft /speckit-plan's artifacts for the Author's approval".

**Status: a draft plan for your approval. Nothing in it is approved.** The branch was rebased onto main at 58bd232, cleanly (it was 292 commits behind). Then `/speckit-plan` ran. There is no task list and no code.

### What's new

- **`research.md`:** 25 decisions, each with its rationale and the alternatives weighed; the idle-cost table at prices checked on 2026-10-18; and "The plan interview, to ask": nine questions, each with the answer the plan assumes until you give yours.
- **`plan.md`:** spec 000's layout: Technical Context, the constitution gate, the project structure, fifteen design sections, eight task groups with the guard patch first, the risks, and the coverage of every FR and SC.
- **`data-model.md`:** the gateway's changes (the `cloud` stack, the `prod-cloud` route class, the `infra` attribution and its migration), and the new records: releases, deployments, the plan block, the apply record, the credential audit, the public view's document, the relay's caps, the tunnel.
- **`contracts/`:** `relay-http`, `tunnel`, `edge`, `releases-deployer`, `infra-records`, `aws-alerts`, `public-view`, and `env-cloud`.
- **`quickstart.md`:** your validation runs, per task group, each naming the success criterion it proves.

Writing the contracts changed twelve details of the first plan commit, each carried into `plan.md` and `research.md` in the same commit, so the contract and the plan agree. Among them:
- the viewer's address travels as `X-H4-Viewer`, since `X-H4-Client` is spec 000's client label;
- the edge's error responses replace only 502 and 504, so the relay's own 503s keep their causes;
- the heavy services (Langfuse and its stores, Prometheus, Loki, Grafana) join a new `local` profile that prod, dev, and dev-cpu select and the cloud stack doesn't;
- the tunnel's blocks on the local `edge` are guarded by their own tokens, not a fixed subnet, which prod and dev would share on one host;
- the provider mirror lives under `~/.local/share/h4reet/`, beside spec 000's lint toolchain.

### For you: the plan interview

The plan assumes each recommended answer until you give yours. research.md argues each one.
1. **Approve now, or after spec 000's open runs?** The spec's Assumptions say spec 000 passes "before this spec is planned", and SC-001's re-run, SC-002, SC-005's dashboard timing, and SC-007 are open. Recommended: approve the plan now; task group 4, the first that needs a stack, waits for SC-001's re-run and SC-002.
2. **How CloudFront reaches the relay.** Recommended: a VPC origin on a second, private network interface, so only this distribution can reach the relay, and no secret sits in Terraform's state. The trade: from CloudFront to the VM, a request travels as HTTP inside AWS's network. The alternative is TLS end to end, with a certificate on the VM and a shared secret header.
3. **The instance.** Recommended: a t4g.micro spot instance, about $8.10 a month idle in all (research R-05). If the thin services don't fit in 1 GiB, a t4g.small, about $11.00, just over the $10 target.
4. **The DNS zone.** Which registrar and DNS provider hold h4reet.ai today? Recommended: the zone in Route 53, with the registrar's name servers pointed at it.
5. **Apply records.** Recommended: `make infra-record` commits each one on an `ops/apply-*` branch for you to merge.
6. **FR-013: import or replace spec 000's hand-made Bedrock identity?** Recommended: replace it with a Terraform role the fallback gateway assumes on the VM, then delete the Identity Center user, its permission set, and the old IAM user.
7. **The local tier's release source.** Your clarify answer was "both deployers pull it by digest". The plan reads it as the local deployer taking each release by digest from a local source: the images your release build already left in your engine. Recommended: your own release directory, written by `make release`, so the local tier holds no AWS credential. The other reading, the local tier pulling from the registry itself, needs an AWS credential on the local tier.
8. **A last-resort breaker that switches the site off past a hard stop?** Recommended: not in this spec; the risk is named.
9. **Telemetry and the public snapshot through the tunnel?** Recommended: yes, so the local tier never holds an AWS credential.

### Worth knowing

- **No `make apply`.** The plan keeps CLAUDE.md's "There is no `make apply` on purpose", word for word. You apply with Terraform yourself, between `make infra-verify`, which matches your saved plan to the reviewed note, and `make infra-record`. CLAUDE.md's infra line still says apply happens "in the protected CI environment"; the guard patch (task group 1) keeps that sentence and adds the local-phase wording after it (plan §2).
- **No secret ever passes through Terraform.** You create each secret parameter yourself with `aws ssm put-parameter`; Terraform only grants read access to their path. That's a named exception to FR-001, for FR-009 (plan Complexity Tracking, research R-26).
- **The guard rule already exists in part.** Spec 000's bash gate already refuses Terraform's apply, destroy, import, and three state writes; FR-006 grows the list and its spellings.
- **The new ADRs start at 0024,** since the pin-rule proposal (docs/000-claude-pin-rule) took 0023. They're written in the commit that records your approval (plan §13), from their research entries.
- **Prices** come from AWS's pricing pages for everything but spot, which AWS publishes only through its API; the spot figures are from trackers that sample it. Two of research.md's AWS sentences come from tonight's web-search summaries of AWS's pages, not the pages themselves: the Budgets free-tier sentence and the VPC origins' private-subnet sentence. The first infra task re-prices the table, and re-reads both, from your terminal.

### Verification

- **Links:** `evals/docs_links.py`: 0 failed, 977 relative links in 97 files.
- **Format:** `ruff format --check` on the folder: 16 files already formatted.
- **Quotes:** each quote of 25 characters or more in the new files was checked against its sources: the spec, spec 000's files, the constitution, CLAUDE.md, the ADRs, and the configuration. Five that weren't word for word were fixed. What's left unmatched is literal values and new proposed text, not quotes.
- **Secrets:** no account ID, portal URL, key, or address appears; the commits' pre-commit scans passed.
- `make check` wasn't run: no gate reads `specs/001-cloud-elevation/` beyond the links check, as this note found for the spec.

### Review

One `REVIEW.md` pass, by the reviewer agent, which wrote neither the spec nor the plan, over `git diff main...spec/001-cloud-elevation` at 7fb4032: the clarified spec (its pass was owed after clarify) and the draft plan with its companions. **Verdict: BLOCK, one blocker, fixed in this branch's next commit.**

**The blocker (FR-009).** The plan put secret values in Terraform's state. Terraform created each `/h4reet/cloud/*` SecureString with a placeholder and `ignore_changes = [value]`, which only hides the diff. Every refresh reads each value back, decrypted, into `prod.tfstate` and every saved plan: the Telegram token, the SMTP credentials, the database passwords, the tunnel's host key, and the tunnel tokens. **Fixed:** Terraform never creates or reads a secret. You create and update each one with `aws ssm put-parameter --type SecureString`, and Terraform names the path only in IAM policies. `make secrets-check` lists the expected names by name only. The policy's rule T9 now refuses a Terraform SecureString or any data source that reads one. It's recorded as a named exception to FR-001, on FR-009's "Terraform refers to the secret without reading its value" (plan §1.4 and Complexity Tracking; research R-26; contracts/env-cloud.md §1; contracts/infra-records.md §5; quickstart §3 and §4.2; tasks T008, T021, T062, T067).

**What the review found sound:**
- the guard patch lands before any `infra/` file, and there's no `make apply` target;
- FR-010's values are supplied at run time and redacted;
- the meter moves by `operator-init`, so nothing restarts at zero; local prod is refused a paid route; infrastructure cost is booked on the meter;
- CloudFront's access logs are off, and nginx's log format holds no address;
- R-05 adds up (8.01 and 10.92, before this commit's ECR change), and plan.md agrees with it;
- every FR and SC is covered, and `publication-carryover.md` is word for word;
- the interview questions are real open decisions.

**Its backlog, and what was done:**
1. **The CLAUDE.md line.** The proposed line had dropped "There is no `make apply` on purpose", though this note said the plan keeps it. Fixed: plan §2 keeps the sentence word for word and adds the local-phase wording after it.
2. **T4g's unlimited CPU credits.** Surplus credits could bill up to about $50 a month at full CPU, which the meter sees only in the next day's correction. Fixed: the launch template sets standard credits (plan §6.1, research R-04, T062).
3. **Costs.**
   - The release contract copied every `images.lock` image (the CUDA model server, Langfuse, ClickHouse) into the registry. Fixed: it copies only the upstream images the cloud stack runs, and the registry keeps the last 3 releases' images. Re-checked against those images' full indexes, R-05's ECR line is now about 3 GiB, $0.30, and the idle totals are about $8.10 and $11.00.
   - On-demand's extra cost was the price, not the difference; it now reads about $4–7 more.
   - CloudWatch Synthetics at one run a minute is about $52 a month, not $10. Fixed.
4. **The web-search sentences.** research.md presented the Budgets and VPC-origin sentences as checked AWS text, and only this note said otherwise. Fixed: the Prices note, R-05, and R-07 say so, and plan §13 carries the caveat into the ADRs written from them.
5. **The relay's reachability.** Any cloud-stack container could reach `relay:8080` and set `CloudFront-Viewer-Address` to anything, the sink called `/api/status` on a listener that refuses it, and the Author's Systems Manager path reached the relay without the edge. Fixed:
   - the edge listener refuses peers on the VM itself: loopback, the Docker pool the VM's `daemon.json` fixes, and the VM's own addresses. The daemon runs without the userland proxy, so outside callers keep their source address;
   - a separate internal listener serves the sink, and the Author's test client at the fixed documentation-range identity `192.0.2.10`, named as FR-032's one exception (contracts/relay-http.md §1–§2, env-cloud.md §7, plan §4.2, §6.2, and Complexity Tracking);
   - group 6 now measures that CloudFront replaces a forged `CloudFront-Viewer-Address`, and that the prefix list admits the VPC origin's traffic (quickstart §6.5, T092).
6. **The policy's order in your terminal.** `terraform init` and `plan` ran agent-written HCL with an admin session before the policy saw it. Fixed: `make plan ROOT=…` runs `infra_policy.py` on the HCL first and refuses on a finding, and the plan's JSON is the second pass (contracts/infra-records.md §1 and §5, research R-13 and R-14, plan §1.3, T014).
7. **The VM's firewall.** It didn't allow instance metadata, so the host services and the Systems Manager agent would get no credentials, and the owner match didn't cover containers. Fixed: the `output` chain allows the link-local endpoints for the users that need them, and a `forward` chain drops containers' traffic outside the pool except to the proxy. Group 4 checks both (contracts/tunnel.md §8, plan §6.3, quickstart §4.2, T061).
8. **The edge's 502.** Turning every origin 502 into the edge's body hid a real `local_error`. Fixed: the relay never answers 502 or 504. A gateway's 502 becomes a degraded 503 with its cause kept (`local_error`, `upstream_error`), so the edge's 502 and 504 mean only "not reached" (contracts/relay-http.md §6.2 and §7, edge.md §5, research R-08).
9. **The meter's move.** Quickstart read local prod's meters before removing its Bedrock route. Fixed: the route goes first, then the reading, then the cloud store's initialization (quickstart §4.3, research R-20, T067).
10. **Consistency.**
    - The local path's timeout is 12 s everywhere.
    - The relay reads `v_state` as `relay_ro`.
    - The estimate's key is `infra.month_estimate_usd` everywhere.
    - Only group 4 waits for spec 000's runs (quickstart §0).
    - The spec's Assumptions no longer quote the routing comment T105 replaced; they cite 6c6b23e and main's current comment.
    - Plan §13 schedules ADR 0013's Consequence update, as the Clarifications require.
    - Interview question 7 states its reading of your answer and asks.
    - The plan says local prod's `make up` starts the local tier's whole topology, everything but the cloud-only services, which is how FR-045 is read.

**Still open:**
- Group 6's two measurements: the forged-header replacement and the prefix list.

The reviewer couldn't re-check the spec's quote of the operator CLI's ports, because the bash gate refuses commands that contain those port numbers. The fix's session read contracts/operator-admin.md §6 on main with the Read tool instead: the quote ("`127.0.0.1` or `localhost`, at the stack's own port (18003, 18103, or 18303) and no other") is word for word.
