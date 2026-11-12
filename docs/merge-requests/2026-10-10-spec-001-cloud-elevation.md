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

## Rework, 2026-11-09

**Status: the spec, the plan, and the tasks, reworked for your review. Nothing in them is approved, and no task has started.** T000, your approval, comes first. The section below was written by the spec-writer for the main session to place in this note.

### The commits

| Commit | What it did |
|---|---|
| 9e5ac5c0 | Reworked spec.md around your decisions of 2026-11-09 (ADR 0044, proposed, on `docs/001-ec2-default`): EC2 as prod's default host, the laptop when you run it, one host at a time, one shared meter, and a server budget outside the model ceilings |
| b2ea2765 | Recorded your answers to clarify questions 13, 14, 15, and 17; question 16 taken provisionally as the session's default |
| 4e211e57 | Drafted the plan, with research.md, data-model.md, contracts/, and quickstart.md, replacing September's |
| 8acc2686 | Recorded your answers to the plan's questions 1 to 4 (5 to 7 provisional), applied the spec amendments question 1 needed, and wrote tasks.md |
| this pass | The revision after `/speckit-analyze` over 8acc2686, below |

### Your answers of 2026-11-09, verbatim

Your decisions:
- "On the ec2 server, anthropic api will answer first. That ec2 server will end up being the main server running, I will rarely be running the stack from my laptop other than a demo to showcase or talk about, but it should be the local-first primary scenario we built for."
- "Keep the cap as-is at $20 a month, $5 a day."
- "Here is how we are imagining the move to ec2 workflow: That is the default, and if i run the stack locally, the bootup should ask me what my ip address is, and a script that can configure route53 etc to point to my IP, and the necessary router / firewall settings that would need to change. If i am running locally, then the ec2 should be shut off and not incurring costs. The kill-switch monitor should turn the ec2 on if it detects that the laptop is not present or the local ip address route is offline, then a lambda function can update route53 back to the ec2."
- "The server size and budget is outside the $20 model spend cost. Yes, bedrock stays as the ec2 second paid route."
- On the session's five points: "Okay, all of your feedback is approved. for server size, we will try to use spot instances, or only keep the server online for 8-12 hours a day."

Your choices, each the option's title, then its text as offered:
- Principle I: "Record the reason (Recommended)": "Principle I stays as written. ADR 0044 records why EC2 complies: within the server budget EC2 has no GPU, and a model run on its CPU wouldn't meet the twin's quality bar, which your laptop's GPU model does. So the API is what meets the bar there, and the laptop stays self-hosted-first."
- The version: "1.1.0, MINOR": "Principle V's rules stay (the meter, the kill switch, degrading). Only its reason changes. This follows general semantic versioning rather than the rule's text."
- EC2's paid spend: "The $5 and $20 ceilings (Recommended)": "On EC2, the daily $5 and monthly $20 ceilings and the adapter caps limit the Anthropic API and Bedrock. When a ceiling trips, the twin rests until you reset it, as today. The $2-a-day sub-budget stays the laptop's fallback rule."
- Clarify Q13: "Tiny always-on relay (Recommended)": "A small always-on instance in your AWS account, separate from EC2, using September's OpenSSH tunnel design. No third party carries visitors' messages, and the health check sees the whole path. The repo's research priced it in October at about $2.20 a month for a t4g.micro spot instance plus $3.65 for its address; that gets re-priced in the plan."
- Clarify Q14: "Measure, then you set it (Recommended)": "The plan measures the stack without the model server and prices the smallest instance types that fit, spot and 8 to 12 hours a day, from AWS's pages. You set the figure before the first apply."
- Clarify Q15: "Spot, around the clock (Recommended)": "A spot instance running all day, with a schedule kept in reserve. It's your first choice, and only one mechanism then starts and stops EC2."
- Clarify Q17: "Same gap, plus an alert (Recommended)": "Like the start-up gap you already accepted. You get an alert, and visitors see the resting message until capacity returns or you start the laptop."
- Plan Q1: "Relay picks the host (Recommended)": "The site's edge always talks to the tiny always-on relay (your tunnel's end). The relay checks both hosts every second and sends each request to the laptop if it's up, else EC2, else the resting reply. Switching takes seconds, and neither host needs a public certificate. Route 53's health check only wakes EC2. This changes the DNS-failover design you approved, so the spec's wording changes with your OK."
- Plan Q2: "Spot": "About $2.20 a month (October's figure). AWS can take it back, and while it's gone the site rests, even if the laptop or EC2 is up."
- Plan Q3: "Add both (Recommended)": "The patch gains two small wording changes: Langfuse self-hosted in the stack, and Bedrock called from the serving host. Still 1.1.0. The ADR's old → new list grows to match."
- Plan Q4: "Use ENV=dev offline (Recommended)": "Prod needs the network. For an offline demo you run the dev stack, which keeps its own local counter."

Your words for row F3 were adopted on `feat/010-anthropic-switch`, which quotes them in its note, with your weighing: "We can say nothing is retained when running local models. Refer to Anthropic if cloud models are on."

Taken provisionally by the session, not your words, for you to confirm or overturn at T000: clarify question 16 (the IAM), and the plan's questions 5 (the resting words as a spec 002 follow-up in your words), 6 ("it" is the laptop's stack), and 7 (the IAM default and its additions).

### The analysis of 8acc2686, and what this pass fixed

`/speckit-analyze` said T000 should wait for one revision pass. This pass had the text of C1, C2, H1 to H9, M10, and M12. The text of M1 to M9, M11, M13, M14, L1 to L5, and the four counted nits didn't reach it; the main session holds the analysis. This pass made its own consistency fixes instead (the last list below), and maps none of them to those IDs.

| ID | The finding, in short | Fixed by |
|---|---|---|
| C1 | Your constitution patch sat in group 2 (old T016), after group 1, and the "first `infra/` file" line named the wrong task | It is now T001, before any group, the default order you confirm at T000. Groups 3 to 9 each check it first. The first file under `infra/` is T020 (old T018), and tasks.md's Dependencies say so |
| C2 | The "Hosts" dashboard row came in group 10, after its features, against the constitution's Development Workflow step 7 | Each panel moved into its feature's group (plan §11): the tunnel and the collector's counters (group 5, T053), the shared state (group 6, T075), the release per host (group 7, T091), the relay's panels (group 8, T110), and the handover's and the server budget's panels (group 9, T127). Group 9 now writes the sink's cloud reads as metrics (T121, T126), since those panels need them. T138 (old T109) keeps only `/status/` |
| H1 | `placeholder_gate` reads only `envs.prod.fallback`; EC2's route line is yours (ADR 0041); your F3 words are already adopted | Group 6 gains a test-first pair, T062 and T069, that make the gate read every host route's `first`, `second`, and `fallback`, landing before schema 2 (T070). T070 writes only the laptop's line. EC2's line is your step, T095, in group 7. "Write your words into F3" is gone from the tasks and the quickstart; spec, plan, and tasks say your words reach `main` with `feat/010-anthropic-switch`, before group 6 |
| H2 | spec.md's Degraded Modes row at :780 | Rewritten, with a row for the tunnel end down for reasons other than spot (a crash, a failed deploy, a revoked key) |
| H3 | Rows V2, V4, V6, C2, C3, C4, and S17 described more than one relay; no row for the telemetry forward | Rewritten for one relay, on the tunnel end. New row C15: the tunnel end's collector to the serving host's, the laptop's through the reverse forward 2202 to its `edge`'s 8086 |
| H4 | Pre-question-1 text left at spec.md :67, :458, :596, :597, :624, and research.md :138, :253; the checklist claimed none was left | Each rewritten. The checklist now says its first claim was wrong, and what a search after this pass finds |
| H5 | The guard didn't stop EC2 while the server budget's action had run | FR-071, the handover contract, research R-15, and the alerts contract: the guard reads the action's status and stops EC2 with `ec2_stopped_server_budget`. Tests T117 and T119 |
| H6 | Each group's order put your patches and the apply before the review | Each group is now: tests; code; your plan block on the branch; review and note; your patches, the gate, and the merge; your apply on `main`. Your plan block comes from a scratch clone with the group's patches applied, so the tree hash matches once you commit them on the branch |
| H7 | No patch for the relay's public cap figures | P-6, `config/budgets.yaml`'s new `public` section, each figure yours: in plan §14, drafted in group 8 before the relay (T105), applied with your figures before the gate (T114). spec.md's Assumptions name it |
| H8 | The Bedrock deny could attach to a role Identity Center manages | The deny attaches to `h4-laptop-bedrock`, an ordinary role the laptop's permission set assumes, and to `h4-prod-gateway`. The rehearsal's target is an ordinary role of the same shape. Both to confirm in group 4. Row F2 changes to match |
| H9 | The relay runs on spot, and the Cloud standard lists it among what "must be always-on" | Not decided: it is the plan's question 8, for T000, with option A (your wording in the unapplied 1.1.0 patch) and option B (a deviation in the Assumptions, citing ADR 0044). "always-on" no longer describes the tunnel end outside quotes |
| M10 | ADR 0044 | Left to the main session, which routes it to its branch |
| M12 | This section | This section |

**Other fixes this pass made, from its own read:**
- spec.md: FR-017 has the relay read the kill switch; the Assumption that said the spec "is not planned" until 1.1.0 now says no task starts past T001; Clarifications list question 7's later additions and question 8.
- plan.md: the Status, the Constitution Check, and Complexity Tracking carry T001 and question 8; §8.3 lists F2, C14, and C15, and which group adds each row; §10 has the guard's three stops, the placeholder gate, and the tunnel end's collector; §14's "His steps" drop the F3 words (adopted) and add EC2's route line; the Phases section and the documentation tree no longer say the tasks are still to write.
- tasks.md: the laptop's route keeps `fallback: anthropic`, as `main` names it after the switch (the old T056 said `bedrock`); the tunnel end's collector configuration, which no task wrote, is T045 and T050; the disclosure rows C8 to C11, which no task added, are in T026 and T036; the sink's one-key write grant moved from group 10, which had no patch or apply for it, into group 9's P-I6; `make ec2-start` in group 7's quickstart became a start from the console, since the command arrives in group 9.
- contracts: the credential audit checks `h4-laptop-bedrock`; the start function and the guard log one embedded-metric line per outcome, which the sink counts (to confirm); the public view's sink exports its cloud reads.
- research.md R-15: the tunnel end's role gains its dashboard reads, all reads, under question 7.

**Old task numbers to new.** The tasks were renumbered:
- before any group: T000 stays; T016 → T001;
- group 1: T001 to T007 → T002 to T008; T009 stays the review; T008 → T010 (your patches, gate, merge) and T011 (the mirror);
- group 2: T010 to T015 → T012 to T017; T017 → T018; T019 new (gate, merge);
- group 3: T018 to T023 → T020 to T025; T026 and T027 new; T025 → T028; T024 → T029 and T030;
- group 4: T026 to T031 → T031 to T036; T037 new; T033 → T038; T032 → T039 and T040;
- group 5: T034 to T037 → T041 to T044; T045 new; T038 to T041 → T046 to T049; T050 new; T042, T043 → T051, T052; T053 new; T044 → T054; T055 new; T046 → T056; T045 → T057 and T058;
- group 6: T047 to T049 → T059 to T061; T062 new; T050 to T055 → T063 to T068; T069 new; T056 to T060 → T070 to T074; T075 new; T061 → T076; T077 new; T063 → T078; T079 new; T062 → T080;
- group 7: T064 to T073 → T081 to T090; T091 new; T074 → T092; T093 new; T077 → T094; T095 new; T075, T076 → T096, T097;
- group 8: T078 to T084 → T098 to T104; T105 new; T085 to T088 → T106 to T109; T110 new; T089 → T111; T112 new; T091 → T113; T114 new; T090 → T115;
- group 9: T092 to T096 → T116 to T120; T121 new; T097 to T100 → T122 to T125; T126 and T127 new; T101 → T128; T129 new; T105 → T130; T131 new; T102 to T104 → T132 to T134;
- group 10: T106 to T108 → T135 to T137; T109 → T138; T111 → T139; T140 new; T110 → T141;
- group 11: T112 to T114 → T142 to T144; T118 → T145; T146 new; T115 to T117 → T147 to T149.

### For you at T000

1. Approve the spec and the plan, or say what to change.
2. Confirm or overturn the session's provisional answers: clarify question 16, and the plan's questions 5, 6, and 7, with question 7's four additions (the start function's read of the tunnel end's state; the guard's read of the server action's status; `h4-laptop-bedrock`; the tunnel end's reads for the dashboard).
3. Answer the plan's question 8: A, your wording in the 1.1.0 patch, or B, a deviation in the Assumptions citing ADR 0044.
4. Confirm T001's place: the 1.1.0 patch, as amended, before any group.

### Verification

Documents only. No code, configuration, or infrastructure file changed. The main session runs Prettier and commits.

### The analysis's remaining findings, fixed (2026-11-09, after f57a404d)

The main session passed on the text of the remaining findings, and this pass fixed each. The analysis's file lines and task numbers are 8acc2686's; the task numbers below are mapped through the old-to-new table above, the old number first. Where a fix needed a choice the analysis left open, the choice is the session's default, not your words, and it is listed under "For you at T000" below.

| ID | The finding, in short | Fixed by |
|---|---|---|
| M1 | The tunnel end's egress allowlist lacked ECR, which its deployer pulls from; neither host's allowlist had SNS, though both publish to `h4-alerts`; R-15's tunnel-end role lacked `sns:Publish` | Both allowlists now list ECR and SNS (contracts/tunnel.md §6, research.md R-10), and the tunnel end's also lists the dashboard's reads (Route 53's health-check status, CloudWatch's metric reads). R-15 gives the tunnel end's role `sns:Publish` on `h4-alerts`, which joins question 7's provisional additions. Row C7 now names ECR and SNS, the alerts' one line, and what an alert never carries. Tasks: T044, T046, T054 (C7's tunnel-end part), T086, T092 (C7's EC2 part) |
| M2 | While the tunnel end is gone, the sink is gone too, so `latest.json` keeps naming the last host | Of the two ways offered, the session took the page's: `/status/` takes the serving host from `/api/status` first, and the edge's degraded answer there, or none, means `none`, whatever the document says. Moving the writer off the tunnel end would add a function, a schedule, and a role with the same reads. FR-057 says so; contracts/public-view.md §3 and §4, research.md R-19, plan §8.4, both tunnel-end rows of Degraded Modes, and quickstart §9. Test: T136 (old T107); code: T138 (old T109) |
| M3 | Old T060 lacked spec 000's FR-030 and FR-031; plan §13 said "in their own branches" while the tasks amended them on feature branches | Settled for the feature branches: each amendment travels in the group branch whose code needs it, so one gate checks the code against the amended text, and you approve both in one merge. Spec 000, spec 007, and spec 010 go in group 6 (T074, old T060), which now has FR-030, FR-031, and spec 000's new operator action; spec 002's contract §3 goes in group 8 (T108, old T087). Plan §13 and §16 and Technical Context say so. The resting words stay spec 002's own change (P-5) |
| M4 | The probe's and the audit's EventBridge schedules sat in the unprotected `lambdas.tf`, and old T089 had an agent enable the probe | Both schedules are in the protected `infra/account/alerts.tf`, in P-I2 (T034, old T029; tested in T033, old T028), the probe's disabled. The line that enables it is part of P-I5 (T107, old T086), so P-I5 now always exists, and group 8's plan block and apply cover the account root too (T112, T114, T115). Old T089 (T111) no longer enables anything. Contracts aws-alerts.md §5 and infra-records.md T5, research.md R-02 and R-14, plan §16 |
| M5 | "Set the pause switch `on`" read as pausing | It is "the autostart switch" everywhere: `on` lets EC2 start automatically, `off` stops that. The refusal and stop codes keep their names, `paused` and `ec2_stopped_paused`, and the handover contract §5 and the alerts table say each means the switch is `off`. Spec, plan, research, data model, contracts, tasks, and quickstart |
| M6 | The restore runbook needed `operator-init`, which refuses a store that isn't uninitialized | A new operator action, `make operator-restore ENV=shared` (Author-only; spec 000's operator actions, amended by name in T074). It refuses unless EC2 is stopped and the laptop's prod isn't running. It prints the restored meters, then marks the store uninitialized under the initialization lock, keeping the ledger and the audit log. `operator-init` then confirms values never lower than those meters, raised by the spend the providers show since the restore point. contracts/shared-state.md §6 and §8 (five steps, with the rename steps to confirm in group 6), FR-019, data-model.md §1.5, research.md R-16 and R-32. Test: T064 (old T051); code: T071 (old T057); runbook: T076 (old T061) |
| M7 | The sink's token and the telemetry block's token had no deny by name | Named `SNAPSHOT_SINK_TOKEN` and `TELEMETRY_BLOCK_TOKEN`, with their hosts, in contracts/env-cloud.md §1, §2, and §5, contracts/tunnel.md §4 and §5, contracts/public-view.md §1, and research.md R-26; P-1's `credentials.envVars` in plan §2 and T005 (old T004); `make tunnel-keys` makes both (T052, old T043) |
| M8 | Old T042 wrote the warning rule into `infra/account/handover.tf`, but old T045 planned and applied only `infra/prod` | Already fixed by the first pass: T055 makes the plan block for both roots, and T058 verifies, applies, and records both. Quickstart §5 now says so too |
| M9 | The laptop's loop polls `/api/status` every 5 s and calls DescribeInstances every 60 s, but row C6 listed only the stop | Row C6 is widened: the loop's status request to the edge, marked as a probe; the describe and stop calls; the laptop's address to the edge and to AWS's API; and `make down ENV=prod` to switch it off. The handover contract §6 cites it |
| M11 | The server rehearsal's target was "a stopped t4g.nano" | The Author starts `h4-rehearsal-instance` before the trip, and the record keeps the SSM run's status and the instance's state after it. contracts/aws-alerts.md §4, research.md R-22, plan §3.2, quickstart §4, and T040 (old T032), whose check now names the run's success and the instance going from `running` to `stopped` |
| M13 | FR-069 said only the start function and the laptop's stop start and stop EC2 | FR-069 now lists them all: the start function (the alarm, the tunnel end's return, `make ec2-start`, and `make ec2-autostart STATE=on`), the guard, the laptop's loop, and `make ec2-stop`; and, besides those, AWS's interruption and restart, and the server budget's action. The Q15 reading in Clarifications matches |
| M14 | No task wrote `make cloud-session`, `make aws-login`, or `make infra-mirror` | T008 (old T007) writes `make infra-mirror` and `make aws-login`, refused to agents, with the pins at the versions you choose. T052 (old T043) writes `make cloud-session HOST=ec2\|tunnel-end` (FR-050). Research R-32 names where each lands |
| L1 | The plan's $3.65 and the spec's "the plan re-prices both" weren't marked to confirm; R-05 had no line for the fault-injection service or the rehearsal `t4g.nano` | Both marked to confirm, with T017 named as where you re-price them. R-05 gains two lines, both to price: the fault-injection service for SC-018's rehearsals, and the rehearsal `t4g.nano`. T017 lists the `t4g.nano`. The spec's cost lines for the store and the zone now say to price or to confirm, too |
| L2 | quickstart.md:64 ran `make ec2-start` in group 7 | Confirmed: quickstart §7 and T096 start EC2 from the console, since the command arrives in group 9 |
| L3 | plan.md:632 wrote the ADRs "in the commit that records his approval", but old T006 wrote them in group 1 | They are written in group 1 (T007, old T006), proposed, and become accepted when you merge group 1, after your approval at T000. Plan §14 and the project structure say so |
| L4 | spec.md:744 said the price was "marked est.", while the plan said it was confirmed | Both say it is confirmed: your commit ada55c98 on `main`, `config/prices.yaml` version 2026-11-09.1, "read 2026-11-09" |
| L5 | On the tunnel end's return, the start function reads a health check still failing from the outage, so it can start EC2 while the laptop reconnects | Noted, not delayed: once the relay serves the laptop, the loop stops EC2 within the handover window, and SC-016 counts the minutes. A delay would need a schedule or a waiting function, and a laptop that doesn't come back would leave the twin resting longer. Research R-29 and R-31, plan "What the answers change" and §7, the handover contract §8, the data model's EC2 states, the spec's edge case, and quickstart §9. Tests: T118 (old T094) covers the loop's stop; runbook: T128 |
| Nit 1 | data-model §1.5 called step 2 "an agent's change", but old T062 had it under you | Step 2 is yours: your route change (ADR 0041 makes prod's route change yours) and `make up`; step 5 too. T080 (old T062) says so |
| Nit 2 | The admin-only stack's listener on 18003 clashed with a running laptop prod | While the laptop's prod runs, `ENV=shared` uses that prod's own admin listener, whose gateway already uses the shared state; otherwise it starts the admin-only stack on the same port, and never while prod holds it. contracts/shared-state.md §7, contracts/tunnel.md §3, research R-32, data model §1.1, plan §7. Test: T064; quickstart §6 runs both |
| Nit 3 | Degraded Modes lacked a row for the shared state unreachable everywhere, which plan §12 had | Added: the site loads, every answer is degraded, local ones included, and the status request still answers; you get a store alert and the restore runbook |
| Nit 4 | Old T086 said "if the policy puts them in a protected file", but rule T5 already does | T107 (old T086) puts CloudFront's policies in the protected `infra/prod/edge-limits.tf`, as P-I5; T104's fixtures check it |

**Task numbers didn't change in this section.** It added no task: each fix landed in an existing task.

### For you at T000, added by these fixes

The session's defaults, not your words, for you to confirm or overturn with the rest at T000:
1. **Plan question 7 gains a fifth addition:** the tunnel end's `sns:Publish` on `h4-alerts`, for its deployer's alerts (M1).
2. **The public view's `none` comes from the page** reading the edge's degraded status answer, rather than a second writer off the tunnel end (M2).
3. **Other specs' amendments travel in the feature branches** whose code needs them (M3).
4. **`make operator-restore ENV=shared`,** a new operator action, amended into spec 000 by name; the restore's rename steps are to confirm in group 6 (M6).
5. **The token names,** `SNAPSHOT_SINK_TOKEN` and `TELEMETRY_BLOCK_TOKEN` (M7).
6. **The start on the tunnel end's return is accepted, not delayed** (L5).
7. **The alert codes keep `paused`** while the switch is called the autostart switch (M5).

### Verification

Documents only, under `specs/001-cloud-elevation/`. The counts are unchanged: 73 FR lines, 17 SC lines, 61 scenarios, 24 edge cases; Degraded Modes has one more row. No new figure: every dollar amount is one the repository already had. The main session runs Prettier and commits.
