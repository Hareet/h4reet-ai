# Security posture and known gaps

This page says where hareet.ai stands against the AWS Well-Architected Framework, what it leaves out on purpose, what is still open, and what was fixed before the repository went public. It states each gap plainly, without operational detail that would help an attacker with one still open. To report a vulnerability, see [Reporting a vulnerability](#reporting-a-vulnerability).

Reviewed on 2026-11-22; this page written on 2026-11-23. The **Status** columns are the Author's to keep current: `open` means no work has started, and `in flight: <branch>` names the branch that carries the work.

## What was reviewed, and how

- **The framework:** the AWS Well-Architected Framework as one consolidated document, "Framework update (11-16-2026)" (its release notes, PDF page 1130): the Cloud Foundations lens (FND01 to FND07) and the six pillars, 261 best practices in all. Page numbers on this page are the PDF's.
- **The readers:** five AI reader agents in the Author's session on 2026-11-22, each reading one block of the document in full and in order (pages 1 to 250, 251 to 400, 401 to 600, 601 to 830, and 831 to 1,135), so that all 1,135 pages were read once. Each rated every practice in its block against the project: meets, partial, gap, or not applicable.
- **One synthesis** the same day put the five readers' notes together: the scorecard, a backlog ranked by risk reduced per effort, nine decisions for the Author, and six corrections to the project's own documents. Where the readers disagreed, it kept both views rather than choosing one.
- **What they read of the project:** the repository at `main` 37e4a623 and its records (merge-request notes, apply records, fix notes), plus `fix/032-launch-policy`, which fixes one finding. Nothing was checked against the live AWS account; the backlog marks what only the account can answer.
- **What this review doesn't cover:** the twin's own guardrails, which the red-team suite in [`redteam/`](../redteam/) tests on every route, and the application code, which a separate pre-publication code review read. That review's two confirmed findings are under [Fixed before publication](#fixed-before-publication).

## The scorecard

| Pillar | Practices | Meets | Partial | Gap | Not applicable |
| --- | --- | --- | --- | --- | --- |
| Cloud Foundations | 45 | 8 | 23 | 9 | 5 |
| Operational Excellence | 28 | 5 | 20 | 3 | 0 |
| Security | 52 | 8 | 38 | 4 | 2 |
| Reliability | 63 | 15 | 34 | 9 | 5 |
| Performance Efficiency | 26 | 10 | 13 | 0 | 3 |
| Cost Optimization | 33 | 21 | 12 | 0 | 0 |
| Sustainability | 14 | 7 | 4 | 3 | 0 |
| **All** | **261** | **74** | **144** | **28** | **15** |

"Not applicable" includes what the no-high-availability decision below excludes on purpose.

- **Cloud Foundations.** Strong on cost guardrails and policy as code: budgets with automatic actions, rehearsed, and plan-time gate rules that refuse rather than warn. Weakest at the account layer: an account shared with other work and no organization, no durable control-plane audit trail, no automatic patching of the hosts, and no written emergency-access procedure.
- **Operational Excellence.** Everything is code and reviewed: one trace from the relay through the gateway to the model call, dashboards tested against their contracts, alerts that name their runbooks, and a reviewer that never wrote the change. The gaps sit where the incidents happened: automation that fails without paging, no availability measure or objective, and changes first tried in production.
- **Security.** Deep at the host, container, and repository layers: default-deny egress with name allowlists, containers that drop every capability, single sign-on and roles, encrypted parameters behind path-scoped key grants, authenticated hops between services, and publish checks. The largest gap is traceability and detection on the account's control plane. The shared account and host patching follow.
- **Reliability.** The request path is well built for a one-host design: explicit timeouts, one retry layer, throttles, graceful degradation, an unknown kill-switch state treated as degraded, and failover from the laptop to EC2. Recovery is the weak half: no recovery objectives, a replace that failed on its first real run, and no backup restored in a test yet.
- **Performance Efficiency.** Requirements have metrics, targets, and conditions; stores and hosts are chosen by fit and sized from measurement; the edge serves HTTP/3 with compression. The visitor's side isn't measured yet, and sizing rests on one x86 run.
- **Cost Optimization.** The strongest pillar: cost is a constitutional gate, every model call carries its cost, and budgets come with automatic actions. Missing: a unit cost (per answered turn or visit), forecast alerts, two retention rules, and proof that the cost-allocation tags the server budget filters on are active.
- **Sustainability.** Graviton only, spot, 12 hours a day, the smallest Claude tier, and deterministic guards before any model. Missing: an efficiency or emissions figure, a Region weighed for carbon, and compression of the room's 3D assets, which [ADR 0010](adr/0010-real-time-avatar-rig-and-art-direction.md) refuses (decision D03).

## What is by decision

Some of what a framework review flags is the design, chosen with its cost in view.

- **No high availability.** One host serves at a time: EC2 inside its hours, 07:00 to 19:00 Mountain time ([ADR 0048](adr/0048-ec2-on-12-hours-a-day.md)), and the Author's laptop whenever he runs it. When neither can serve, the twin rests and the site still loads.
- **One zone.** Both cloud hosts run in `us-east-1a` ([ADR 0057](adr/0057-spot-with-interchangeable-types.md), "One zone, no high availability, no swap back").
- **Spot, with interchangeable types.** Each cloud host has an ordered list of Graviton types, each capped at the first type's on-demand price; when one type has no capacity, the start function replaces the host with the next ([ADR 0057](adr/0057-spot-with-interchangeable-types.md)).
- **One AWS account, shared with the Author's other work** ([ADR 0007](adr/0007-one-aws-account.md), [ADR 0047](adr/0047-one-account-shared-with-other-work.md)). The separation between the two rests on IAM scoping, tags, and names, not on an account boundary. Decision D01 below asks whether to change that.
- **The tunnel end as the one hard dependency.** Every host's path runs through it, so while it is down no host serves, the laptop included. Spec 032 names this under "The downtime that remains"; its automatic replacement is built and stays switched off until a rehearsal proves it.

The Author's words on 2026-11-18, verbatim ([ADR 0057](adr/0057-spot-with-interchangeable-types.md)):

> "Let's set the spot with interchangeable types. Since we want to discuss cost optimization skills and cost
> efficiency, this will be a good showcase of how I work, that we build cost optimization into the workflow. I know
> its minimal savings in this instance, but this is just a demostration of the production-grade thinking we bring to
> costs. We can say that because there is no need for this service to be highly available, we are okay with
> interchanging spot instances for cost efficiency and some downtime that brings if capacity is not available."

The framework allows the trade when it is deliberate and measured: "Relatively minor trade-offs in availability can result in much larger improvements in utilization" (p. 1071). It also sets a condition this project doesn't meet yet: "Start from your availability and recovery objectives and work backward" (p. 587). Those objectives are decision D06 and backlog item R16.

## Decisions for the Author

Nine questions the review couldn't answer for him. Each has a recommended option; none is decided yet.

| ID | Question | Options weighed | Recommended | Status |
| --- | --- | --- | --- | --- |
| D01 | The account shared with other work, with no organization | keep it; an interim perimeter now and a member account as a later spec; a member account under a new organization before publication; move the other work out | An interim perimeter now (R20), a member account as a later spec | decision pending |
| D02 | The tunnel end as the single point of failure | accept, name, and measure it; run it on demand; a warm standby; move the database to a host of its own | Accept it, name it, and measure it | decision pending |
| D03 | ADR 0010's refusal of 3D asset compression | keep ADR 0010; measure first, then decide; amend for geometry only; amend for geometry and textures | Measure first, then decide | decision pending |
| D04 | The tunnel end's fallback types priced above their ceiling | keep every ceiling; read 90 days of spot prices first; raise each ceiling to its own on-demand price; drop the types that can't fill | Read 90 days of spot prices first (R14) | decision pending |
| D05 | The tunnel's SSH endpoint on the internet | keep it public, hardened, patched, and watched; allow only the laptop's address; replace it with a port-forward through Systems Manager | Keep it public, hardened, patched, and watched (R18, R27) | decision pending |
| D06 | The availability and recovery numbers | adopt the readers' candidate numbers now; measure for a month, then set targets; keep no numbers | Measure for a month, then set targets from history (R04, R16) | decision pending |
| D07 | How a replace resumes after a killed run | a journal in the function's lock; a Step Functions workflow | A journal in the lock (R19) | decision pending |
| D08 | EC2's data volume: expendable or snapshotted | declare it expendable; a weekly snapshot, about $0.40 a month | A weekly snapshot | decision pending |
| D09 | GuardDuty: now, at publication, or not at all | at publication with its 30-day trial; now; rule-based detection only | At publication, with its 30-day trial | decision pending |

## The start-now batch

The review recommends starting these eight now. Together they fit three gates: one account apply (R01, then R03, R04's alarm, and R05's audit), one bootstrap apply (R02 and R08), and one docs branch (R06 and R07).

| ID | What | Pillars | Effort | Risk reduced | Status |
| --- | --- | --- | --- | --- | --- |
| R01 | Merge the start function's fixes from the 2026-11-22 replace before the next account apply: 1,024 MB, bounded calls, a run deadline, an idempotent launch, and the launch policy AWS accepted, in code | Operational Excellence, Security, Reliability | S | High | in flight: `fix/032-launch-policy` |
| R02 | Confirm the cost-allocation tags are active, put them in code, add forecast alerts, and start the cost export | Foundations, Cost | S | High | open |
| R03 | Alarms on the start and guard functions' errors and duration, and AWS Health and container-scan findings routed to the alerts | Foundations, Operational Excellence, Reliability | S | High | open |
| R04 | An alarm when no host serves inside the hours, as the first availability measure | Operational Excellence, Reliability | S | High | open |
| R05 | Root and emergency access: audit the root user's MFA weekly, confirm no long-lived key of the project remains, and write the break-glass runbook | Foundations, Security | S | High | open |
| R06 | Write the two runbooks the alerts already name, and test that every page an alert names exists | Foundations, Operational Excellence, Reliability | S | Medium | open |
| R07 | Write the incident notes, and fix the template | Operational Excellence, Security, Reliability | S | Medium | in flight: `docs/prepublication` |
| R08 | A durable, tamper-evident audit trail of the account's control plane, with alarms on sensitive changes | Foundations, Security | M | High | open |

R06 is open on purpose: neither page can be written from the code alone yet (see [Corrections](#corrections-to-our-own-documents), item 4). R07's three notes are in [`docs/incidents/`](incidents/); the template change it also proposes (contributing factors, a timeline line, and severities) and a check that warns when a fix names a production date without a note are left for the Author.

## The ranked backlog

The other 27 items, in the review's rank order: risk reduced per effort. "Next" follows the start-now batch, "later" waits on something before it, and "accept" records a risk the project keeps on purpose, with the trigger that would change that.

| ID | What | When | Status |
| --- | --- | --- | --- |
| R09 | Run the pre-publication checks, as a publication checklist | next | open |
| R10 | Fold the remaining supply-chain gaps into spec 031, CI on GitHub, while it is built | next | in flight: `feat/031-ci` |
| R11 | A ledger of hand fixes, and a weekly drift check | next | open |
| R12 | Prove the shared state's backups by a restore, and make them immutable | next | open |
| R13 | An operability pass in `REVIEW.md`, seeded from the incidents (the Author's file) | next | open |
| R14 | Price the fallback types from 90 days of spot prices (D04) | next | open |
| R15 | A level-triggered check of EC2 inside the hours | next | open |
| R16 | Availability and recovery objectives in an ADR, in the Author's words (D06) | next | open |
| R17 | The account's security baseline settings | next | open |
| R18 | Patch the hosts by immutable replacement, on a cadence | next | open |
| R19 | A replace that resumes after a killed run, and the rest of the control path hardened (D07) | next | open |
| R20 | An in-account boundary around the project's buckets, until D01 is decided | next | open |
| R21 | A quarterly game day with fault injection, alternating with a security tabletop | next | open |
| R22 | The cost page, and the cost story's figures checked | next | open |
| R23 | An ephemeral AWS rehearsal cell, so changes meet AWS outside production first | next | open |
| R24 | A weekly operations review, with quarterly readiness and cost passes | later | open |
| R25 | Client-side timing, and a latency target for the EC2 path (D03) | later | open |
| R26 | An inventory of secrets, a rotation schedule, and compromise playbooks | later | open |
| R27 | The hosts' evidence kept off the hosts, and the network signals | later | open |
| R28 | One authoritative page per runbook, a vendors page, and the recurring hand steps scripted | later | open |
| R29 | Releases staged by host class, and a rollback command for the cloud hosts | later | open |
| R30 | A runtime threat model and a data-classification scheme | later | open |
| R31 | Close two retention gaps | later | open |
| R32 | Unit cost and resource efficiency, measured monthly | later | open |
| R33 | Re-measure the stack on arm64; try EC2 without the Langfuse services | later | open |
| R34 | Compress the room's 3D assets, if ADR 0010 is amended (D03) | later | open |
| R35 | Record the deliberate non-adoptions, each with its trigger | accept | open |

## Fixed before publication

The pre-publication code review confirmed two findings. Both are fixed on reviewed branches, merged into the stack that goes to `main` before the push.

| Finding | Fix | Status |
| --- | --- | --- |
| **The tunnel end acted on its SSH server's log.** Spec 001's fix F10 (2026-11-22) added a safety net that ended older SSH sessions when a refused-port line appeared in the log. The review found that unauthenticated input could produce that line, and so end the laptop's tunnel at will. | F11 removes the net and the log-read count; the tunnel end now decides nothing from that log, and a dead session ends at the kernel's bound instead ([f11.md](../specs/001-cloud-elevation/fixes/f11.md); [its note](merge-requests/2026-11-22-fix-001-f11.md)). | in flight: `fix/001-f11-log-trigger` (live with the release after its merge) |
| **The hand start could run the start function twice.** The AWS CLI's 60-second read timeout and its retries sent a long replace again; the lock refused the second run (`busy`), but its output read as a failed start while the first run went on. | The hand start waits 960 s for the function and sends once, and `busy` says another start holds the lock ([its note](merge-requests/2026-11-22-fix-032-launch-policy.md); [the incident note](incidents/2026-11-22-first-real-replace.md)). | in flight: `fix/032-launch-policy` |

Three incidents in November are written up in [`docs/incidents/`](incidents/): [the tunnel end's network on 2026-11-18](incidents/2026-11-18-tunnel-end-network.md), [EC2's capacity on 2026-11-18](incidents/2026-11-18-ec2-capacity.md), and [the first real replace on 2026-11-22](incidents/2026-11-22-first-real-replace.md). None is known to have been a security incident, though one question is still open: who stopped EC2 near 01:00Z on 2026-11-18. Each note lists what it changed.

## Corrections to our own documents

The synthesis found six places where the project's documents said something the code or the record doesn't support. Each was checked on this branch's tree first.

| # | Where | What was wrong | Status |
| --- | --- | --- | --- |
| 1 | [spec 032's cost estimate](../specs/032-spot-flexibility/spec.md#cost-estimate-constitution-principle-v) | EC2 on spot "about $7" a month; the Author-confirmed figure is $9.45 at `us-east-1a` (spec 001, research R-05) | corrected on `docs/prepublication` |
| 2 | [ADR 0057](adr/0057-spot-with-interchangeable-types.md) and the ADR index | "proposed", though its condition (the merge and both applies) was met on 2026-11-22 | corrected on `docs/prepublication`, for the Author to confirm |
| 3 | [server-budget.md](runbooks/server-budget.md) | said tasks.md T030 had activated the cost-allocation tags; that step isn't in the record (R02) | corrected on `docs/prepublication` |
| 4 | the alert bridge and contracts/aws-alerts.md §2 | name two runbooks that don't exist. `probe-failing.md`: the code says what the alert means (the uptime probe failed five minutes running) but not what to do for each check, and no runbook covers the edge. `certificate.md`: no rule in the infrastructure code routes the certificate's expiry event to the alerts, so the alert can't arrive today, and nothing says what to do | open (R06) |
| 5 | [the deployer's contract, §4](../specs/001-cloud-elevation/contracts/releases-deployer.md#4-rollback-and-holds-fr-047-fr-049) | a rollback command for the cloud hosts that the Makefile doesn't have | contract corrected on `docs/prepublication`; the command is open (R29) |
| 6 | [ADR 0057's open question](adr/0057-spot-with-interchangeable-types.md#consequences) | implied a durable record of who stopped EC2 near 01:00Z on 2026-11-18; with no trail, the evidence expires about 2027-02-16 unless exported | corrected on `docs/prepublication`; the export is R08's first step |

## Reporting a vulnerability

Report it privately, as [SECURITY.md](../SECURITY.md) says: through GitHub's private vulnerability reporting, the repository's **Security** tab, then **Report a vulnerability**. Please don't open a public issue, discussion, or pull request about a vulnerability. SECURITY.md lists what is in scope (the twin's guardrails, the cost controls, the data flows, the agent enforcement layer, and secrets and the supply chain) and how to test without harming the live site. A gap listed on this page is known; a working way to exploit one is still worth reporting privately.
