# Feature Specification: Cloud Elevation — Terraform, One Account, Same Compose Stack

**Feature Branch**: `001-cloud-elevation`

**Created**: 2026-09-07 · **Revised**: 2026-10-10

**Status**: Draft, from a full specify pass on 2026-10-10, made ahead of spec 000's completion; awaiting `/speckit-clarify` with the Author. Spec 000 must be implemented, and pass its success criteria, before this spec is planned (Assumptions).

**Input**: `intent.md` in this folder (accepted). Its proposed outcome, in the Author's words: "Terraform in one AWS account stands up the thin, cheap, always-on control plane — DNS and TLS for h4reet.ai, the static site at the edge, the relay, the kill-switch state, budgets and anomaly detection, the alert path — and a VM that runs the very same compose definition from spec 000. The local tier reaches the cloud through an outbound tunnel and pulls its deployments. The public dashboard stays up when the machine is off." Its constraints: "One account; environments by VM, IAM role, tag, budget. Plan in PR, human apply. Idle cloud cost must leave headroom for the Bedrock fallback. No inbound ports on the local tier; no self-hosted runners." Four decisions that change scope carry needs-clarification markers (the group FR-014 to FR-016, then FR-017, FR-020, and FR-033). Everything else the intent leaves open is stated as an assumption, and every open choice is listed for `/speckit-clarify` at the end.

## Scope: what spec 001 reuses from spec 000, and what it adds

Spec 000 hands this spec a named list (its Assumptions): "AWS Budgets, Terraform, the domain, edge protection, the public dashboard snapshot, and the outbound tunnel are spec 001."

**Terms.** **The edge** is the cloud edge that serves h4reet.ai over TLS (the constitution's "the static site and edge"). Spec 000's nginx proxy is called **the stack's `edge` service**. **The relay** is the new thin public API in front of the gateway: CLAUDE.md's `services/relay`, which doesn't exist yet. **The cloud VM** is the Terraform-provisioned VM that runs the compose definition with a cloud environment file. **The local tier** is the stacks on the Author's RTX 5090 machine. **The meter of record** is the one spec 000 meter, with its kill switch, that all production spend counts against (FR-017). **A release** is a commit on `main` with its images pinned by digest (Key Entities). **Before publication** is ADR 0013's local phase; **after publication** starts once the Author has published the repository on GitHub.

**Reused from spec 000.** Each piece runs as spec 000 built it, with only configuration differing, as spec 000's FR-017 allows. The exceptions are listed under "has to change" below.

| Spec 000 piece | In this spec | Note |
|---|---|---|
| The one compose definition, `deploy/compose.yaml` (ADR 0002) | reused; extended in place | The cloud VM runs it with a cloud environment file (FR-043). New services and profiles go into the same file, never an override or a fork (FR-043, FR-045). |
| The gateway (`services/gateway`): adapters, the FR-022 routing order, the per-client cap, the meter and kill switch, the operator interface, alerts, incident drafts, telemetry | reused; configured per environment | Which instance holds the meter of record is FR-017's open question. If infrastructure cost is booked on the meter (FR-020, option A), the meter changes. |
| `config/routing.yaml`, `prices.yaml`, `budgets.yaml`, `alerts.yaml` | reused | The ceilings stay $5/day and $20/month, and the fallback sub-budget stays $2/day. The human-only files change only by the Author's hand, with an ADR. |
| The local tier's heavy services: the model server on the GPU, Langfuse and its stores, Prometheus, Loki, Grafana, the collector | reused unchanged | They stay on the local tier (FR-044). |
| The degraded response and its causes, and the `api_unavailable` body that the stack's `edge` service returns | reused | The relay and the edge answer in the same shape (FR-030, FR-034). |
| Alerts through Telegram first and SMTP second (ADR 0005) | reused unchanged | AWS-side alerts go to the same channels (FR-022). |
| The agents' engine (spec 000 FR-039) | reused unchanged | Agents build and test the relay, the tunnel's ends, and the deployer CPU-only, with stand-ins for AWS and for the tunnel's peer. |
| The local gate, the forbidden-action matrix, the breach test (dev only), rollback by `REF` | reused; the matrix and the breach test grow | FR-005, FR-006, FR-011, FR-012, FR-025 |
| The data-flow disclosure (spec 000 FR-040) | reused; rows added; published on the site | FR-040, FR-041 |

**Added by this spec.**
- `infra/`: Terraform for one AWS account. It covers the state backend; the budgets, the anomaly monitor, and the budget action; the DNS zone and the certificate; the edge and the static site's storage; the cloud VM, its network, and its roles; the secrets store's entries; and, after publication, CI's OIDC roles.
- The relay, a new container in the one compose definition.
- The outbound tunnel: a client on the local tier, and its end in the cloud.
- The pull-based deployer, for the cloud VM and the local tier, and the releases it pulls.
- A cloud environment file. Production's environment may also split into cloud and local files, depending on FR-017's answer.
- The public dashboard view and its cloud-hosted snapshot.
- A placeholder static site, which publishes the disclosure.
- Runbooks, uptime probes, and ADRs.

**Spec 000 pieces this spec has to change.** Each is named so that none changes silently:
- Production's meter of record and kill switch may move to another stack (FR-017). The move carries their values over through an operator initialization (FR-019).
- If question 3 picks option A, the meter also books infrastructure cost (FR-020).
- How the gateway learns a client's address. Spec 000's gateway believes `X-Forwarded-For` only from the stack's `edge` service (contracts/gateway-http.md §2.3). With the relay in front, that chain of trust has to end at a hop the edge reached, without letting any caller choose its own identity (FR-032).
- The model server becomes reachable through the tunnel, so it needs the authentication spec 000 deferred: "no `--api-key`, because only containers in the same project reach it (revisited when spec 001's tunnel exists)" (spec 000 plan §3; FR-053).
- Spec 000 binds every published port to the literal `127.0.0.1`, which no environment file can change (plan §1). The cloud VM has to accept the edge's requests without loosening that binding on the local tier (FR-032, FR-052).
- Spec 000's preflight assumes a model-server profile in every stack (plan §4: it refuses when "not exactly one of `gpu` and `cpu` is selected"). A cloud stack without a model server needs that rule extended for the cloud class only.
- The hand-made Bedrock runtime identity moves under Terraform (FR-013).
- Disclosure rows S1, S2, F1, F2, A1, and A2 change. The tunnel attaches at the stack's `edge` service (spec 000 research R-06: "Spec 001's tunnel attaches to `edge`"), the cloud VM's egress gets an allowlist (FR-051), and visitors' messages can now reach Bedrock (FR-040).

## User Scenarios & Testing *(mandatory)*

The users of this spec are three groups. Visitors reach h4reet.ai for the first time. The Author is the operator and the builder. The agents plan the infrastructure but never apply it.

### User Story 1 - Infrastructure Changes Are Planned by Machines and Applied by a Human (Priority: P1)

As the Author, I want all cloud infrastructure in Terraform in one AWS account. Environments are separated by VM, IAM role, tag, and budget. The plan is posted on every PR, apply is gated behind a protected environment I approve, and only short-lived identity-based credentials exist anywhere. Until publication (ADR 0013) there are no pull requests and no CI. In that phase the plan goes in the branch's merge-request note, and apply is my own terminal action, recorded.

**Why this priority**: Principle III says only a human "applies infrastructure", and Principle IV says "`apply` and `destroy` are human actions". Every other story needs cloud resources, and none may come into existence any other way.

**Independent Test**: Take a branch that changes `infra/`. The local gate refuses it until its note carries the redacted plan. Every apply-class command from an agent session is refused. After the Author merges, the Author's apply creates exactly what the plan showed and leaves an apply record. The credential audit finds zero access keys, and the tag check finds no untagged resource. Scenarios 7 to 9 wait for publication.

**Acceptance Scenarios**:

1. **Given** a branch that changes `infra/`, **When** the local gate runs, **Then** it fails unless the merge-request note carries a plan for each affected environment. The plan must be made from the branch's latest `infra/` change and redacted of account IDs and secret values (FR-005).
2. **Given** an agent session, **When** it tries `terraform apply`, `destroy`, `import`, a state write, or `force-unlock`, in any spelling, **Then** the attempt is refused with a reason and an audit record (FR-006).
3. **Given** a merged infrastructure change before publication, **When** the Author applies it from their own terminal, **Then** the apply uses the Author's short-lived SSO session and runs only a saved plan that matches the reviewed one. It leaves an apply record with no secrets or account IDs (FR-007).
4. **Given** resources exist, **When** costs are reported, **Then** every resource carries project, environment, and component tags under the correct environment budget (FR-002).
5. **Given** any identity in the account, **When** the credential audit runs, **Then** it finds no IAM user access key and no other long-lived credential (FR-008).
6. **Given** the Terraform that defines IAM, budgets, alert routing, edge rate limits, or the kill switch, **When** an agent session tries to change it, **Then** the write is refused. A change can arrive only as a patch the Author applies, with an ADR (FR-012).
7. **Given** a PR changing `infra/` after publication, **When** CI runs, **Then** the plan for the affected environment is posted and merge is blocked on plan failure (FR-014).
8. **Given** a merged infra change after publication, **When** the apply workflow runs, **Then** it pauses on a protected environment requiring the Author's approval (FR-015).
9. **Given** CI needs cloud access after publication, **When** it authenticates, **Then** it uses OIDC to an environment-scoped role; no static credentials exist (FR-016).

---

### User Story 2 - One Ceiling for Everything, With a Cloud Safety Net (Priority: P1)

As the operator, I want AWS Budgets and Cost Anomaly Detection on the account, routed to the same Telegram and email channels. I want the kill-switch state where the relay can read it. And I want every dollar of production spend counted against one set of ceilings, so that non-model costs and meter failures are also bounded. The intent puts it this way: "the cost safety net needs AWS-side budgets. All of it must fit the same $5/day, $20/month ceiling."

**Why this priority**: This story was P2 in the 2026-09-07 outline. Principle V raises it: "Budgets, alerts, and the automated kill switch ship before the first feature and are tested by deliberately tripping them." Spec 000's research also leaves to this spec the cap on Bedrock calls made with a stolen session: "spec 000 has no AWS Budgets to cap that (spec 001 does)".

**Independent Test**: Apply the budgets on their own, then trip a rehearsal budget. Both channels alert, and the automated action takes effect. Run the breach test on dev: the relay follows the trip within 10 seconds. Start a second production-class stack whose paid route bypasses the meter of record: it refuses to start.

**Acceptance Scenarios**:

1. **Given** this spec's first apply, **When** it completes, **Then** the account's budgets, the anomaly monitor, and their alert routes exist, created no later than any other resource that costs money (FR-022).
2. **Given** AWS billing data updates, **When** it crosses the budget thresholds, **Then** alerts arrive on both channels (lagging safety net, not the control) (FR-022, FR-024).
3. **Given** a rehearsal budget set below the month's actual spend, **When** AWS evaluates it, **Then** both channels get the alert and the automated action takes effect on its rehearsal target. The record says how long AWS took (FR-026).
4. **Given** AWS's billing data shows the account at the $20 ceiling, **When** the budget action runs, **Then** production can no longer call paid models at the provider, and local answers continue. Only the Author can restore the permission (FR-023).
5. **Given** production spend from any stack, **When** it is metered, **Then** it lands on the one meter of record. A production-class stack that would spend outside that meter refuses to start (FR-017, FR-018).
6. **Given** the meter in the stack sets `degraded`, **When** the relay reads state, **Then** it sees the same state within 10 seconds. **Given** the state store is unreachable, **Then** the relay treats it as `degraded` (FR-030).
7. **Given** the breach test on dev, **When** the ceiling trips, **Then** the relay answers degraded within 10 seconds, and after the operator's reset it forwards again (FR-025).
8. **Given** the meter of record moves to another stack or loses its store, **When** that stack starts, **Then** it stays degraded until the operator initializes it with the carried-over values. Nothing restarts at zero (FR-019).

---

### User Story 3 - h4reet.ai Answers Whether or Not My Machine Is Awake (Priority: P1)

As a visitor, I want h4reet.ai to load over TLS from the edge and the hello endpoint to respond, degraded if necessary, regardless of the local tier's state.

**Why this priority**: It is the intent's first problem: "Visitors need h4reet.ai to answer whether or not the machine is awake".

**Independent Test**: With the local tier off, the site loads, hello answers via Bedrock or degraded within 5 seconds, and the site says the local tier can't be reached. With the local tier on, hello answers locally with a full trace. With the cloud VM stopped, the site still loads and hello gets the degraded body.

**Acceptance Scenarios**:

1. **Given** h4reet.ai, **When** requested, **Then** the static site is served over TLS from the edge with DNS managed in Terraform (FR-027).
2. **Given** the local tier is healthy, **When** a visitor calls hello, **Then** the local model answers, and the call has a complete trace (FR-035).
3. **Given** the local tier is unreachable, **When** hello is called, **Then** it is answered by the fallback within the sub-budget or with the degraded response, in spec 000's routing order, and the reason is visible on the dashboard (FR-035, FR-036).
4. **Given** the cloud VM is down, **When** h4reet.ai is requested, **Then** the static site still loads, and hello gets the degraded body with its cause (FR-028, FR-034).
5. **Given** the kill switch is `degraded`, unknown, or unreadable, **When** hello is called, **Then** the relay answers with the degraded response without forwarding (FR-030).
6. **Given** public exposure, **When** a client exceeds the public request cap, **Then** it is limited before reaching the gateway (FR-033, pending clarification).
7. **Given** a request that reaches the cloud stack without passing through the edge, **When** it arrives, **Then** it is refused (FR-032).
8. **Given** a release that makes hello public, **When** it is about to deploy, **Then** hello's red-team cases must pass first, or the release is refused (FR-039).

---

### User Story 4 - A Visitor Can See What Leaves Their Device (Priority: P1)

As a visitor, I want the site to tell me exactly what my visit sends, where it goes, and why, before I send anything.

**Why this priority**: Principle I: "Every byte that leaves a visitor's device MUST be enumerated in a public data-flow disclosure with a stated reason." This spec carries the project's first visitor bytes. In the intent's words: "Visitor requests now traverse the edge and relay; the relay carries no payload it does not need to route. Disclosed on the site." So the disclosure has to be live before hello is.

**Independent Test**: Open every page with the browser's network log on, and call hello and the status request. Compare every host the browser contacted with the published disclosure. After the run, scan the stores for visitor addresses and messages.

**Acceptance Scenarios**:

1. **Given** any page of the site, **When** a visitor opens it, **Then** it links the data-flow disclosure. The disclosure lists every flow the visit can cause, with what each carries, what it never carries, and why (FR-040, FR-041).
2. **Given** a browser that loads every page and calls hello and the status request, **When** its network requests are recorded, **Then** every request goes to a host the disclosure lists, and none goes to a third party (FR-038, FR-041).
3. **Given** a visit, **When** it ends, **Then** nothing is stored on the visitor's device, and no cookie was set (FR-042).
4. **Given** a test run of visitor calls, **When** logs, traces, metrics, alerts, the ledger, and the other stores are scanned, **Then** no visitor address, message, or answer is found (FR-031, FR-042).
5. **Given** a change that adds a service, a tunnel route, or an egress destination, **When** the local gate runs, **Then** it fails unless the disclosure lists the new flow in the same change (FR-040).

---

### User Story 5 - The Same Compose Stack Runs on a Cloud VM (Priority: P1)

As the Author, I want the very same compose definition from spec 000 to run on a Terraform-provisioned VM with a different environment file, so that "one topology, many environments" is demonstrated rather than claimed. The 2026-09-07 outline said "unchanged". This spec adds services to the one file, so it uses the intent's words, "the very same compose definition".

**Why this priority**: It is the intent's "a VM that runs the very same compose definition from spec 000". The constitution's Compute standard asks the same: "One compose definition describes the production topology and is what runs in every environment". The VM is also the always-on home for the relay and the paid fallback path.

**Independent Test**: `terraform apply` (human) creates the VM. The deployer pulls the release, and hello answers via the relay with a full trace. Destroying and recreating the VM yields the same digests and the same meter values. On the local tier, `make up ENV=prod` still starts the whole topology.

**Acceptance Scenarios**:

1. **Given** the VM is provisioned, **When** the deployer runs, **Then** the stack from `deploy/compose.yaml` starts with the cloud environment file and no other change (FR-043).
2. **Given** the VM runs the stack, **When** hello is called through the relay, **Then** it routes exactly as spec 000 defines (local tier if healthy, Bedrock within sub-budget, else degraded) (FR-035).
3. **Given** a new release, **When** the deployer polls, **Then** it pulls and restarts only the affected service and records the deployment (FR-046, FR-047). The outline's "a new image on `main`" became "a new release", because images built on `main` need CI.
4. **Given** a new release fails its health checks, **When** the deployer sees it, **Then** it returns to the previous release and alerts (FR-047).
5. **Given** the same release, **When** it runs on the cloud VM and on the local tier, **Then** their images match by digest, and only their environment files differ (FR-043, FR-048).
6. **Given** the VM is destroyed and recreated, **When** the deployer finishes, **Then** the stack's digests match the release, and the meter of record's values are unchanged (FR-019, FR-048).
7. **Given** this spec's changes to the compose definition, **When** the Author runs `make up ENV=prod` on the local tier, **Then** the whole topology still starts with one command, calling local models (FR-045).
8. **Given** a cloud stack, **When** its operator interface is probed from the internet, **Then** it is unreachable. The Author reaches it only through an identity-based, short-lived session (FR-050).

---

### User Story 6 - The Local Tier Joins Production Without Opening a Port (Priority: P2)

As the operator, I want the RTX 5090 tier reachable from the cloud only through an outbound tunnel. I want deployments to it to be pull-based, and a runbook for wake, restart, and tunnel recovery.

**Why this priority**: Principle IV: "the local tier accepts no inbound connections and pulls its deployments rather than receiving pushes." Visitors are served without the tunnel (User Story 3), so this follows the P1 stories. The tunnel is what keeps answers local and the bill near zero.

**Independent Test**: An external scan finds no open port. Cutting the tunnel makes hello fall back within 5 seconds, and restoring it brings local answers back. After a WSL2 restart, the runbook's steps bring the tier back. A new release arrives by pull only.

**Acceptance Scenarios**:

1. **Given** the local tier is running, **When** scanned from the internet, **Then** no inbound port is open, and the cloud reaches it only via the tunnel (FR-052).
2. **Given** the tunnel drops, **When** health checks fail, **Then** routing falls back within 5 seconds, and the runbook's restart procedure recovers it (FR-054, FR-056).
3. **Given** the tunnel is back, **When** the local model passes three checks in a row, **Then** routing returns to local (FR-054).
4. **Given** a call through the tunnel, **When** it doesn't come from an authenticated cloud caller that the disclosure names, **Then** the local service refuses it. Langfuse and the admin listener are not reachable through the tunnel at all (FR-052, FR-053).
5. **Given** a new release, **When** the local tier's deployer polls, **Then** it pulls the release. Nothing pushes to the local tier, and no CI runner runs there (FR-046, FR-055).
6. **Given** the Author started prod by hand from a commit, **When** the deployer polls, **Then** it leaves that stack running until the Author hands control back. The dashboard shows the commit and who started it (FR-049).
7. **Given** the host slept or WSL2 restarted, **When** the Author follows the local-tier runbook, **Then** the tier rejoins production (FR-056).

---

### User Story 7 - The Public Dashboard Never Goes Dark (Priority: P2)

As a visitor, I want to watch the system run: spend next to latency and errors, and whether the Author's machine is up. I want that view to stay up when the machine is off.

**Why this priority**: Principle VI makes operational dashboards public. The constitution's Observability standard asks for "Grafana for public read-only dashboards, with a cloud-hosted last-known snapshot so the public view never goes dark", and the intent says: "The public dashboard stays up when the machine is off." Spec 000's FR-028 left the dashboard's public exposure to this spec.

**Independent Test**: Turn the local tier off for an hour. The public view keeps answering with last-known values, the time they were taken, and the tier's status. Turn the local tier back on, and the values are fresh again within 5 minutes.

**Acceptance Scenarios**:

1. **Given** the local tier is unreachable, **When** the public dashboard is viewed, **Then** a cloud-hosted snapshot shows last-known values and the tier's current status; it does not go dark (FR-057).
2. **Given** the local tier is up, **When** the public view is opened, **Then** its values are at most 5 minutes old, and it says when they were taken (FR-058).
3. **Given** the public view, **When** inspected, **Then** it shows the listed panels with no payload, client identifier, operator reason, or secret, and it offers no write action (FR-059).
4. **Given** a month of operation, **When** the public view is opened, **Then** idle cloud cost appears next to metered spend (FR-059, SC-002).

---

### Edge Cases

- **The machine sleeps mid-request.** The call fails or times out, and spec 000's routing fails over (`local_failed`). The next requests find the local adapter unhealthy (FR-054).
- **The tunnel flaps.** Spec 000's recovery rule, three passing checks in a row, keeps routing from bouncing. Each drop shows on the dashboard.
- **The cloud VM is replaced while visitors are on the site.** Static pages keep loading from the edge. Hello gets the edge's degraded body until the new stack is healthy. The meter of record's store outlives the VM (FR-019, FR-028, FR-034).
- **Both the local tier and the fallback are gone.** The degraded response names its cause, and the site says the local tier can't be reached (FR-036).
- **AWS's billing data lags by hours.** The meter stays the control. The provider-side cut-off may fire after the ceiling has already passed (FR-023, FR-024).
- **A visitor floods hello.** The public cap acts first, then spec 000's per-client cap and global metered limits, then the meter. The budgets catch the edge's request charges, late (FR-033).
- **A request reaches the cloud VM without passing through the edge.** It is refused (FR-032).
- **The kill switch flips while a request is in flight.** The request completes, because the state is read at request start (spec 000).
- **A second production-class stack with a paid route starts.** An example is the Author's standalone local production while the cloud holds the meter of record. It is refused unless it meters against the meter of record (FR-018).
- **An uptime probe runs while the local tier is down.** It checks the status request, which makes no model call, so it never spends (FR-061).
- **An apply fails halfway.** The state lock holds, the apply record says what changed, and the Author re-plans. Only the Author force-unlocks (FR-006, FR-007).
- **A secret rotates.** The Author updates the secrets store, and the stack picks the new value up on restart. The value never passes through the repository or agent context (FR-009).
- **A release fails its health checks.** The deployer returns to the previous release and alerts (FR-047).
- **The Author runs production by hand from a branch.** The deployer leaves it alone until the Author hands control back (FR-049).
- **An edge cache holds a degraded answer.** It can't happen: dynamic responses are never cached (FR-029).
- **The certificate fails to renew.** An alert fires before expiry, and the runbook covers recovery (FR-027, FR-056).
- **The domain's delegation is wrong or lapses.** That happens outside Terraform. The uptime probe catches it, and the runbook covers it (FR-056, FR-061).
- **The cloud gateway's telemetry can't reach the local tier.** Answers continue, and the dashboard shows what was delayed or lost (FR-060).

## Requirements *(mandatory)*

### Functional Requirements

**Infrastructure as code, in one account (User Story 1)**

- **FR-001**: THE SYSTEM SHALL define every cloud resource in Terraform, in one AWS account. Terraform's state SHALL be remote, encrypted, versioned, never public, and locked during every plan and apply.
- **FR-002**: THE SYSTEM SHALL separate environments by VM, IAM role, cost-allocation tag, and budget, never by account. Every taggable resource SHALL carry project, environment, and component tags, and the local gate SHALL fail any change that would create or keep an untagged taggable resource.
- **FR-003**: THE SYSTEM SHALL define the state backend in Terraform too. Its one-time bootstrap SHALL be an apply by the Author, recorded like any other (FR-007).
- **FR-004**: THE SYSTEM SHALL pin Terraform and every provider by version and lockfile, as spec 000's FR-014 pins every other dependency. The devcontainer SHALL carry the pinned Terraform, which spec 000's plan left to this spec.
- **FR-005**: WHEN a branch changes `infra/`, THE SYSTEM SHALL fail the local gate unless the branch's merge-request note carries the plan for each affected environment. Each plan SHALL be made from the branch's latest `infra/` change and redacted of account IDs and secret values. Until publication, this stands in for the plan posted on a pull request (FR-014).
- **FR-006**: IF an agent session attempts a Terraform command that changes infrastructure or state, THEN THE SYSTEM SHALL refuse it with a reason and an audit record. The covered commands are `apply`, `destroy`, `import`, `refresh`, `taint`, `untaint`, `force-unlock`, `test`, the `state` writes (`mv`, `rm`, `push`, `replace-provider`), `workspace new` and `workspace delete`, and `init` with `-migrate-state` or `-force-copy`. The refusal SHALL cover every spelling, including `-chdir`, wrappers, `bash -c`, subshells, and drop-in replacements. The forbidden-action matrix SHALL prove each spelling, with a gap row for any spelling that gets through.
- **FR-007**: WHILE the repository is unpublished (ADR 0013), THE SYSTEM SHALL let only the Author apply. The Author applies from their own terminal, with a short-lived SSO session, and only a saved plan that matches the reviewed plan of FR-005. Each apply SHALL leave an apply record in the repository with the commit, the plan's hash, the time, the outcome, and the resources changed, and no secrets or account IDs.
- **FR-008**: THE SYSTEM SHALL let no identity hold a long-lived credential. No IAM user access key exists, humans use SSO, and workloads use roles with short-lived credentials. No CI identity SHALL exist in the account before publication. A committed audit SHALL check all of this before every apply and at least weekly.
- **FR-009**: THE SYSTEM SHALL keep secret values out of the repository, the Terraform configuration, its state, its plan output, and agent context. The Author fills each secret by hand in a managed secrets store, and Terraform refers to the secret without reading its value.
- **FR-010**: THE SYSTEM SHALL keep the AWS account ID, the alert recipients' addresses, and the Telegram chat ID out of the repository. They SHALL be supplied at run time, and recorded plans and apply records SHALL be redacted of them.
- **FR-011**: WHEN this spec introduces a secret, a credential, a Terraform state file, or a paid route, THE SYSTEM SHALL deny it to agent sessions by name and by path, with a forbidden-action matrix row. The deny SHALL land in the same patch that creates the item or an earlier one (CLAUDE.md; spec 000 FR-007).
- **FR-012**: THE SYSTEM SHALL protect the Terraform that defines IAM, budgets, alert routing, edge rate limits, and the kill switch the way spec 000 protects `config/budgets*` and `config/alert*`. An agent may propose a change to it only as a patch the Author applies, with an ADR, and the forbidden-action matrix SHALL prove the protection. The sources are the constitution's "Prohibited without a human" list and `.claude/agents/ops.md`.
- **FR-013**: THE SYSTEM SHALL bring spec 000's hand-made Bedrock runtime identity under Terraform, either by importing it or by replacing it with an environment-scoped role. The identity SHALL still be allowed only to invoke the one configured model. This ends spec 000's deviation "the runtime identity is made by hand".

**After publication: what only GitHub can enforce (User Story 1)**

[NEEDS CLARIFICATION: ADR 0013 keeps development local until publication. ADR 0014 left ADR 0013's Consequence for spec 001 unchanged, so FR-014 to FR-016 can't be verified until the repository is on GitHub. Options: (A) keep them here, scoped to after publication with a dependency on the publication spec, while FR-005 and FR-007 stand in until then; (B) move them word for word to the publication spec, as ADR 0014 did for spec 000, which needs an ADR because ADR 0014 kept them here; (C) make no cloud apply before publication, so spec 001's first apply runs from the protected environment; (D) rehearse on a private GitHub repository, which needs an ADR superseding part of ADR 0013.]

- **FR-014**: WHILE the repository is published on GitHub, WHEN a pull request changes `infra/`, THE SYSTEM SHALL post the plan for each affected environment on the pull request and block the merge on a plan failure.
- **FR-015**: WHILE the repository is published on GitHub, WHEN an infrastructure change merges, THE SYSTEM SHALL apply it only from a protected environment, after the Author approves it there.
- **FR-016**: WHILE the repository is published on GitHub, THE SYSTEM SHALL give CI cloud access only through OIDC federation to environment-scoped roles. There SHALL be a read-only plan role for pull requests and an apply role that trusts only the protected environment.

**One ceiling for all spend (User Story 2)**

- **FR-017**: THE SYSTEM SHALL count every production metered call, from every production-class stack, against one meter of record. That meter holds spec 000's ceilings ($5 a day and $20 a month, each with a warning at 70%) and the fallback sub-budget ($2 a day, inside the daily ceiling). The relay and the gateway SHALL read that meter's kill switch at request start. [NEEDS CLARIFICATION: which stack holds production's meter of record and kill switch? Options: (A) the cloud VM's gateway, always on and routing local-first to the local tier through the tunnel, while the local tier's production environment file keeps the model server, tracing, and dashboards and drops its paid route; (B) the local tier's gateway, as in spec 000, with its state copied to the cloud for the relay, so that no fallback serves visitors while the local tier is unreachable; (C) a managed store in the cloud that both gateways meter against, so the local tier's gateway fails closed whenever the cloud can't be reached.]
- **FR-018**: IF a production-class stack with a paid route would spend outside the meter of record, THEN THE SYSTEM SHALL refuse to start it.
- **FR-019**: THE SYSTEM SHALL keep the meter of record's store and journal on storage that survives the replacement of the VM that runs them. WHEN the meter of record moves to another stack, or its store is lost, THE SYSTEM SHALL keep that stack degraded until the operator initializes it under spec 000's FR-031 and FR-034. The initialization SHALL carry over the month's spend, the day's spend, today's fallback spend, the crossed ceilings, and the renewal flag. Nothing SHALL start at zero silently.
- **FR-020**: THE SYSTEM SHALL fit cloud infrastructure cost and metered spend inside the same ceiling. In the intent's words: "All of it must fit the same $5/day, $20/month ceiling." [NEEDS CLARIFICATION: how does infrastructure cost count? Options: (A) the meter of record also books infrastructure cost, as a daily share of the month's estimate corrected when AWS's billing data arrives, so metered calls stop when metered spend plus infrastructure reaches either ceiling; (B) the Author lowers the metered monthly ceiling in `config/budgets.yaml` by the idle target, a fixed split; (C) the meter keeps $5 and $20 for metered calls only, and AWS's account budget at $20 serves as the lagging safety net, so a month's total can pass $20 by up to the infrastructure cost.]
- **FR-021**: THE SYSTEM SHALL keep idle cloud infrastructure at or under the intent's "Idle infrastructure target ≤ $10/month". Before the first apply, the plan SHALL estimate each component's idle cost from published prices.
- **FR-022**: THE SYSTEM SHALL create the AWS budgets and a cost-anomaly monitor on the account in this spec's first apply, no later than any other resource that costs money. The budgets cover the account and production's tag at the ceilings, with warnings at 70% ($3.50 a day, $14 a month), and any other environment's tag at the amount the Author sets before that environment exists. Each budget and the monitor SHALL alert through Telegram (primary) and email (secondary), never by SMS (ADR 0005).
- **FR-023**: WHEN AWS's billing data shows the account's month-to-date cost at or above the $20 ceiling, THE SYSTEM SHALL, without a human, revoke production's permission to call paid models at the provider and alert on both channels. The permission SHALL stay revoked until the Author restores it, and the breach SHALL get the constitution's seven-day incident note.
- **FR-024**: THE SYSTEM SHALL keep the in-stack meter as the enforcement point and treat AWS-side budgets as the lagging safety net. No automated degradation SHALL wait on an AWS-side alert being delivered (Principle V; the constitution's Alerting standard).
- **FR-025**: WHEN the breach test runs on dev, THE SYSTEM SHALL also assert the relay's side. Within 10 seconds of the trip the relay answers with the degraded response, and after the operator's reset it forwards again. This extends spec 000's FR-036, and it stays dev only.
- **FR-026**: THE SYSTEM SHALL rehearse the AWS-side path by deliberately tripping a rehearsal budget set below the month's actual spend. The record SHALL show that both channels received the alert, that the automated action took effect on a rehearsal target, and how long AWS took.

**The edge, the site, and the relay (User Story 3)**

- **FR-027**: THE SYSTEM SHALL manage the h4reet.ai DNS zone in Terraform and serve the static site from the edge only over TLS. The certificate SHALL be issued and renewed automatically, with an alert before it expires. Plain HTTP SHALL redirect to HTTPS.
- **FR-028**: WHILE the cloud VM, the local tier, or both are down, THE SYSTEM SHALL keep serving the static site from the edge.
- **FR-029**: THE SYSTEM SHALL send visitors' dynamic requests from the edge to the relay, which SHALL be a container in the one compose definition (the constitution: "everything runs as a container"). THE SYSTEM SHALL never cache a dynamic response at the edge.
- **FR-030**: WHEN a request reaches the relay, THE SYSTEM SHALL read the kill-switch state of record at request start. IF that state is `degraded`, unknown, unreadable, or not confirmed within the last 10 seconds, THEN the relay SHALL return spec 000's degraded response with its cause, without forwarding.
- **FR-031**: WHEN the relay forwards a request, THE SYSTEM SHALL forward only the fields the gateway's contract accepts, plus the client identity of FR-032. The relay SHALL keep no copy of the message or the answer after responding, and SHALL log neither. In the intent's words, "the relay carries no payload it does not need to route".
- **FR-032**: THE SYSTEM SHALL identify each client by the address the edge observed, accept that address only from the edge, and pass it to the gateway, so that spec 000's per-client cap (FR-025) applies per visitor. Spec 000's contract expected this: "Spec 001's relay will set a verified identity." IF a request reaches the cloud stack other than through the edge, THEN THE SYSTEM SHALL refuse it.
- **FR-033**: WHEN a client exceeds the public request cap, THE SYSTEM SHALL refuse its requests before they reach the gateway, with spec 000's 429 refusal shape, and SHALL count the refusals. [NEEDS CLARIFICATION: where is the cap enforced within budget? Options: (A) in the relay, from the address the edge supplies, with no fixed cost, although capped requests still reach the edge and the relay and are billed there; (B) a managed web firewall at the edge, which refuses before the relay but is "a large fixed share of the ceiling" (2026-09-07 outline); (C) an edge function with a counter store, charged per request; (D) a free CDN tier in front, which adds a second vendor that sees every visitor request and needs its own disclosure row.]
- **FR-034**: IF the relay can't reach the gateway, THEN THE SYSTEM SHALL return the degraded response with a cause that names this. IF the edge can't reach the relay, THEN the edge SHALL return the same degraded body itself, as the stack's `edge` service does with `api_unavailable` in spec 000.
- **FR-035**: THE SYSTEM SHALL answer hello through the gateway in spec 000's FR-022 order: the local model if it is healthy, then the paid fallback within the sub-budget, otherwise the degraded response. No new component SHALL call a model provider.
- **FR-036**: WHILE neither the local tier nor the paid fallback can answer, THE SYSTEM SHALL answer hello with spec 000's degraded response, naming its cause. The site SHALL say that the local tier, the Author's machine, can't be reached. This takes the "degraded page" side of the intent's open question, "degraded page vs. static answers", as the default until question 7 is answered; static answers are out of scope (Assumptions).
- **FR-037**: THE SYSTEM SHALL answer a public status request at the relay, without a model call. The answer gives the local tier's current status, the kill-switch state, and the cause a hello would get now.
- **FR-038**: THE static site in this spec SHALL name hello as a test of the model gateway, not the twin. It SHALL state nothing about the Author that isn't in the corpus or a filled `facts/` slot, and it SHALL load nothing from any host other than h4reet.ai.
- **FR-039**: WHEN a release would make hello reachable from the internet, THE SYSTEM SHALL first run red-team cases against hello: attempts to make it claim to be the Author or the twin, to disparage, or to reveal its configuration. THE SYSTEM SHALL refuse the release if any case fails (Principle VIII).

**Data flows that leave the visitor's device or the local tier (User Story 4)**

- **FR-040**: WHEN this spec adds a flow that leaves a visitor's device or the local tier, THE SYSTEM SHALL list it in the data-flow disclosure, in the change that creates the flow and before the flow first happens. Each row uses spec 000's columns: what the flow carries, what it never carries, why, its default, and how to switch it off. The local gate SHALL fail a change that adds a service, a tunnel route, or an egress destination without its row. The flows are those in "Data Flows This Spec Adds". Spec 000's row F1 SHALL say that visitors' messages can now reach the paid fallback.
- **FR-041**: THE SYSTEM SHALL publish the disclosure on the site, linked from every page and built from the repository's disclosure, so that the two can't differ.
- **FR-042**: THE SYSTEM SHALL set no cookie and store nothing on the visitor's device. It SHALL hold a visitor's address only in memory, and only for as long as the request caps need it: at most one UTC day, as spec 000's per-client cap does. The address SHALL be written to no log, trace, metric, alert, ledger, or other store.

**The cloud VM and deployments (User Story 5)**

- **FR-043**: THE SYSTEM SHALL run the very same compose definition from spec 000 on a Terraform-provisioned cloud VM, with only a cloud environment file differing. This follows spec 000's FR-017, including what an environment file may select. Any service or profile this spec adds SHALL go into that one definition, with no override file and no fork (ADR 0002).
- **FR-044**: THE SYSTEM SHALL host in the cloud only what the constitution lists: "the static site and edge, the thin API/relay, the kill-switch state, budgets and alerting, and the Bedrock fallback path". The heavy services SHALL stay on the local tier. The whole topology SHALL run on a cloud VM only for a demonstration the Author applies, within budget.
- **FR-045**: WHEN this spec changes the compose definition, THE SYSTEM SHALL keep `make up ENV=prod` on the local tier starting the whole production topology with one command, calling local models (Principle I; spec 000 FR-018).
- **FR-046**: THE SYSTEM SHALL deploy to the cloud VM and to the local tier only by pull. Each host's deployer polls the release source and takes only a release made from `main`: by the Author's terminal before publication, by CI after it. The deployer SHALL check the release's images against its recorded digests before starting them. It SHALL record each deployment, with the release, its digests, the time, who started it, and the outcome, where the dashboard shows it.
- **FR-047**: WHEN a deployer takes a new release, THE SYSTEM SHALL restart only the services whose image or configuration changed. IF the new release fails its health checks, THEN the deployer SHALL return to the previous release and alert. The previous release SHALL also be one command away for the Author (Development Workflow step 6).
- **FR-048**: THE SYSTEM SHALL run the same images for a release on every host, by digest. The local tier and a destroyed-and-recreated cloud VM SHALL both show the release's digests.
- **FR-049**: WHEN the Author starts a stack by hand (spec 000's `make up ENV=… REF=…`), THE SYSTEM SHALL keep the deployer from replacing it until the Author hands control back. The dashboard SHALL show the running commit and who started it.
- **FR-050**: THE SYSTEM SHALL keep a cloud stack's operator interface (spec 000's admin listener) unreachable from the internet. The Author SHALL reach it only through an identity-based, short-lived session.
- **FR-051**: THE SYSTEM SHALL limit the cloud VM's outbound traffic to the destinations the disclosure lists, and refuse all others. Spec 000's research deferred the gateway's egress allowlist "to spec 001, where the relay and edge get their own controls".

**The local tier (User Story 6)**

- **FR-052**: THE local tier SHALL accept no inbound connection from outside its host. It SHALL be reachable from the cloud only through an outbound tunnel that it opens itself. The tunnel SHALL carry only the flows the disclosure lists. It SHALL NOT reach Langfuse, the admin listener, or any part of Grafana beyond a public view that FR-059 allows.
- **FR-053**: WHERE the tunnel reaches a local service, THE SYSTEM SHALL authenticate every call through it and accept only the cloud callers the disclosure names. Spec 000's plan left the model server's missing API key to be "revisited when spec 001's tunnel exists".
- **FR-054**: WHEN the tunnel drops or the local model fails its health check, THE SYSTEM SHALL route new requests in spec 000's FR-022 order within 5 seconds of the first failed check. It SHALL return to local only after spec 000's recovery rule: three passing checks in a row.
- **FR-055**: THE local tier SHALL host no CI runner and receive no pushed deployment. The tunnel's credential SHALL be scoped to the tunnel alone, revocable by the Author in one action, and kept outside the repository and agent context.
- **FR-056**: THE SYSTEM SHALL include a local-tier runbook that covers wake, WSL2 restart, tunnel recovery, the deployer, and `make up`, and a runbook entry for every alert this spec adds. The constitution asks for "a runbook entry if it can page a human", and spec 000 left wake, restart, and the tunnel to this runbook.

**The public dashboard (User Story 7)**

- **FR-057**: WHEN the local tier is unreachable, THE SYSTEM SHALL serve a cloud-hosted dashboard snapshot with last-known values and the local tier's current status. The snapshot SHALL be kept in the project's own account, with no third-party snapshot service; spec 000 switched Grafana's external snapshots off.
- **FR-058**: WHILE the local tier is up, THE SYSTEM SHALL keep the public view's values at most 5 minutes old. Every public view SHALL show when its values were taken.
- **FR-059**: THE public view SHALL show spec 000's FR-028 panels: request count, latency p50 and p95, error rate, spend today and month to date, fallback remaining, kill-switch state, model-server health, and why responses are degraded. It SHALL also show the local tier's status, the tunnel's state, idle cloud cost next to metered spend, and the running release. The view SHALL be read-only, and it SHALL show no payload, client identifier, operator reason, or secret.

**Observability and records**

- **FR-060**: THE SYSTEM SHALL emit telemetry for every new path: relay requests with their outcome, latency, refusals, and degraded causes; tunnel state; deployer actions; edge requests and errors; and AWS-side alerts. The telemetry SHALL carry no payloads or client identifiers (spec 000 FR-026, FR-029), and the dashboard SHALL show each path next to spend. IF the local tier's telemetry backends are unreachable, THEN the cloud stack SHALL keep answering, and the dashboard SHALL show how much telemetry was delayed or lost.
- **FR-061**: THE SYSTEM SHALL probe the site and the relay's status from outside the cloud VM at a fixed interval. Each probe SHALL be marked so it never reaches traces (spec 000 reserves `h4.probe` for "spec 001's uptime checks") and SHALL cause no metered call. THE SYSTEM SHALL alert on both channels after 5 minutes of failure.
- **FR-062**: WHEN a decision in this spec is made, THE SYSTEM SHALL record it as an ADR in the same change. The decisions are:
  - one account separated by VM, IAM role, tag, and budget (0007);
  - Terraform with reviewed plans and human apply, including the stand-in until publication (0008);
  - pull-based deployment to the local tier, with no inbound ports and no self-hosted runners (0009);
  - the public request cap's mechanism;
  - production's meter of record;
  - how infrastructure cost counts against the ceiling;
  - the tunnel.

### Key Entities

- **Environment**: a deployment target: cloud production, the local tier, or an ephemeral cloud dev or staging VM. Environments are separated by VM, IAM role, cost-allocation tag, and budget. Each runs the one compose definition with its own environment file.
- **Release**: a commit on `main`, with its images pinned by digest and its configuration. The Author's terminal makes releases before publication, and CI makes them after. Deployers pull releases.
- **Deployment record**: which release runs on which host, who started it (a deployer or the Author), when, and the outcome.
- **Plan record**: a redacted Terraform plan for one environment at one commit. It is carried in the merge-request note and, after publication, posted on the pull request.
- **Apply record**: who applied which plan (by its hash), at which commit, when, which resources changed, and the outcome.
- **Meter of record**: spec 000's meter, with its kill-switch state, in the one stack that all production spend counts against.
- **Cloud budget**: an AWS-side budget for the account or for one environment's tag. It has thresholds and alert routes, and the account budget carries FR-023's automated action. The cost-anomaly monitor sits beside the budgets.
- **Tunnel**: the outbound connection from the local tier to the cloud, its credential, and the local services it reaches.
- **Public view**: the read-only dashboard visitors see, its values, and the time those values were taken.
- **Data-flow disclosure entry**: a row in spec 000's format, published on the site.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the local tier off, h4reet.ai loads and hello answers (fallback or degraded) within 5 seconds.
- **SC-002**: Idle cloud cost is at or under the confirmed target over the first full month after the first apply. The target is the intent's "≤ $10/month" unless question 6 changes it. The cost is measured from AWS's cost data with model calls excluded, and it is shown on the dashboard.
- **SC-003**: Each month's cost for the account in AWS's cost data, model calls and infrastructure together, is at or under $20, and no UTC day's cost is over $5.
- **SC-004**: Zero long-lived credentials for any identity, verified weekly by a committed audit script.
- **SC-005**: Destroy-and-recreate of the VM yields an identical stack, verified by image digests, and the meter of record's values are unchanged.
- **SC-006**: An external scan of the local tier's public address finds zero open inbound ports, both with the tunnel up and with it down.
- **SC-007**: With the tunnel cut, hello falls back within 5 seconds of the first failed check. Once the tunnel is restored, hello answers locally again after three passing checks.
- **SC-008**: A kill-switch change on the meter of record reaches the relay within 10 seconds. While the state can't be read, 100% of the relay's answers are degraded.
- **SC-009**: A deliberately tripped rehearsal budget alerts on both channels, and its automated action takes effect. AWS's delay is recorded.
- **SC-010**: When every page is loaded and hello and the status request are called, 100% of the browser's requests go to hosts the published disclosure lists, and the site sets zero cookies.
- **SC-011**: After a test run, a scan finds a visitor's address, message, or answer in zero logs, traces, metrics, alerts, ledger rows, or other stores.
- **SC-012**: Until publication, 100% of infrastructure changes carry a redacted plan in their merge-request note and an apply record that matches it, and zero applies come from an agent session.
- **SC-013**: With the local tier off for one hour, the public view answers 100% of the time with last-known values, the time they were taken, and the local tier's current status.
- **SC-014**: Every decision FR-062 lists has an ADR reachable from the README in two clicks.
- **SC-015**: After publication, every infrastructure pull request shows its plan, zero applies run without the Author's approval in the protected environment, and CI holds no static credential (question 1).

## Assumptions

- **Spec 000 first.** Spec 000 is implemented, and its stack passes its success criteria, before this spec is planned. This specify pass ran earlier, on 2026-10-10, ahead of START-HERE §3's "Spec 001 is specified in full only after spec 000's success criteria pass on your machine". Its references to spec 000's plan, research, contracts, and disclosure are to those files as they stood on 2026-10-10 across spec 000's feature branches through US5, not all of which had reached `main`. The clarify session re-checks each reference against spec 000 as merged.
- **Deviation for the local phase: no pull requests and no protected environment for infrastructure** (ADR 0013, accepted).
  - The constitution's Cloud standard asks for "plan output posted on every PR; apply from a protected environment requiring human approval". CLAUDE.md's infra line says "apply is a human action in the protected CI environment".
  - Until publication there are no pull requests and no CI. The plan goes in the merge-request note (FR-005), and apply is the Author's terminal action, recorded (FR-007).
  - Basis: ADR 0013's Consequences already name "in spec 001, plan-in-PR and the protected apply" as unverifiable until publication, and ADR 0014 left that Consequence unchanged. ADR 0003 (proposed) says: "Until publication, apply is the Author's terminal action, and spec 001 must say how it is recorded."
  - The deviation is temporary, so it needs no new ADR; ADR 0008 records it. Options B and D of question 1 would each need an ADR.
  - Agents still plan only and never apply (CLAUDE.md: "Running `terraform apply`. Never. Plan only."; FR-006).
- **Carried deviation: CI-side supply-chain controls** (ADR 0014). This spec's new services and its Terraform get no SBOM, no vulnerability scan, no automated updates, and no CI-built releases until the publication spec. Lockfile and version pins (FR-004), digest checks (FR-046), and the local gate stand in. Spec 000's publication carry-over already notes that Dependabot doesn't cover Terraform providers.
- **Carried deviation: identical images** (spec 000's Assumptions; ADR 0015; spec 000 tasks.md T184). The cloud environment file selects which services run, and spec 000's FR-017 counts that as configuration. FR-048 asks for the same digests on every host for a release. If question 9 lands on per-host builds, FR-048 holds only on spec 000's layer reading, as T184 does today.
- **Ending a deviation.** Spec 000's "the runtime identity is made by hand" ends with FR-013.
- **Enforcement points change by the Author's hand.** FR-005, FR-006, FR-011, and FR-012 change hooks, deny lists, the matrix, and the local gate, which only the Author changes (`.claude/**`, `tools/gates/**`). They arrive as patches the Author applies, each before the risk it guards (spec 000 plan §15).
- **Who runs the real plan before publication** (question 12). Agent sessions have no AWS credentials, and their sandbox doesn't allow the Terraform registry. Default: the Author's terminal makes the plan that goes in the note. Agent sessions run formatting, validation, and policy checks offline, against a provider cache the Author seeds, the way the agents' engine's images are seeded. Opening the sandbox would be the Author's decision ("Widening `permissions.allow` or sandbox domains to make a task easier. Ask instead.").
- **Hello is public** (question 5). The intent's visitor story and the 2026-09-07 outline both have visitors calling hello. So hello is reachable through the relay, capped, as a test endpoint with spec 000's fixed prompt; it is not the twin.
- **When neither the local tier nor the fallback can answer** (question 7, the intent's open question). Default: spec 000's degraded response plus the site's notice (FR-036). Static answers would be content about the Author, which only the corpus may supply (Principle VIII), so they wait for the twin's spec.
- **The idle target** (question 6). The intent says: "Idle infrastructure target ≤ $10/month; the rest of the ceiling is fallback inference and burst." START-HERE §5 still lists it as open ("proposed ≤ $10/month"), so the clarify session confirms it.
- **What an AWS-side breach does** (question 8). Default: FR-023 revokes paid-model calls at the provider automatically. Principle V: "When spend crosses a threshold the system degrades itself without waiting for a human, and a human must consciously restore it." The Author's apply sets the action up, just as the kill switch's trip is set up in advance.
- **Releases before publication** (question 9). Default: the Author's terminal builds each release once and publishes it, with its digests, to a private registry in the account, and both deployers pull from there. After publication, CI publishes releases. That depends on the publication spec's half of spec 000's FR-016, "built in CI and promoted unchanged".
- **The public view** (question 10). Default: the public view is always the cloud-hosted snapshot, refreshed so its values are at most 5 minutes old (FR-058), and the operator's Grafana never faces the internet. This reads the constitution's "Grafana for public read-only dashboards" as Grafana's dashboards served as snapshots. The Author may choose the live view through the tunnel instead.
- **The tunnel** (question 11). Default: it ends inside the project's AWS account, so no third party can read what it carries.
- **Default intervals.** The 5 minutes for the public view and the uptime probe reuse spec 000's 5-minute alert window. The relay's 10 seconds and the 5-second failover come from the 2026-09-07 outline. These are defaults, not facts about the Author.
- **Only production lives in the cloud.** Cloud dev/staging VMs, if used, are ephemeral; dev and staging otherwise remain on the local host. Each ephemeral VM gets its own role, tag, and budget, and the Author sets the budget's amount before the VM is created.
- **The heavy tiers stay on the local machine.** The cloud VM runs the thin services and can run the full stack for demonstration only within budget (FR-044).
- **The domain.** The Author holds h4reet.ai's registration (to confirm). Pointing the registration at the Terraform-managed zone is a human action outside Terraform, recorded like an apply.
- **The site.** `apps/web` is Phase 1 (spec 000's plan). This spec ships a placeholder page with what h4reet.ai is, the disclosure, the status, and a way to call hello.
- **Alerts.** SMTP stays the email channel. Spec 000's answer allowed that "spec 001 can swap in SES by configuration", but nothing here needs it. No mail is received on h4reet.ai; the publication spec may add an address for the code of conduct, with its own disclosure row.
- **The local tier's egress.** Spec 000 left the local gateway's open egress route to the Author's decision, and that decision stands. FR-051 limits only the cloud VM's egress.
- **The clock.** Every budget day and month is UTC, as in spec 000 and AWS billing.
- **Agents and the cloud.** No agent session reaches AWS. The agents' engine is reused unchanged, with stand-ins for AWS and for the tunnel's peer.
- **Development-time spend** stays on the Team plan (spec 000 FR-037).
- **Changes that need a human.** IAM, budgets, alert routing, edge rate limits, and the kill switch change only with the Author and an ADR (FR-012). The same holds for `config/budgets.yaml` and `config/alerts.yaml`, which this spec doesn't change unless question 3's answer requires it.
- **Out of scope**:
  - the twin, the corpus, voice, avatars, and the room (Phases 1 to 3);
  - the publication spec's own work: branch protection, CI workflows, Dependabot, and the code of conduct;
  - more than one AWS region for the stack;
  - a standing cloud staging environment.

**Dependencies**:
- Spec 000, implemented and passing its success criteria.
- The publication spec, which has no intent yet. FR-014 to FR-016 and CI-built releases depend on it.
- The Author's terminal, for every apply, the domain's delegation, the secrets, and releases before publication.

**Traceability to the 2026-09-07 outline**:

| Outline | This draft |
|---|---|
| User Story 1 | User Story 1; its scenarios 1 to 3 are now scenarios 7 to 9, after publication |
| User Story 2 | User Story 5 ("unchanged" became the intent's "the very same"; "a new image on `main`" became "a new release") |
| User Story 3 | User Story 3; its dashboard scenario moved to User Story 7 |
| User Story 4 | User Story 6 |
| User Story 5 | User Story 2, now P1 |
| FR-001 | FR-001, FR-002 |
| FR-002 | FR-005 and FR-007 until publication; FR-014 and FR-015 after |
| FR-003 | FR-008; FR-016 after publication |
| FR-004 | FR-027 |
| FR-005 | FR-043, FR-046 |
| FR-006 | FR-046, FR-052, FR-055 |
| FR-007 | FR-017, FR-030 |
| FR-008 | FR-022 |
| FR-009 | FR-057 |
| FR-010 | FR-033 |
| FR-011 | FR-056 |
| SC-001 | SC-004 |
| SC-002 | SC-002; the target is the intent's, and confirming it is question 6 |
| SC-003 | SC-001 |
| SC-004 | SC-005 |
| SC-005 | SC-014 |

## Expected Cost Impact

The intent sets the budget in two lines: "All of it must fit the same $5/day, $20/month ceiling", and "Idle infrastructure target ≤ $10/month; the rest of the ceiling is fallback inference and burst." The fallback sub-budget stays spec 000's: $2 a day per grant, inside the $5 daily ceiling. Warnings stay at 70%: $3.50 a day, $14 a month, and $1.40 of each fallback grant (`config/budgets.yaml`; spec 000 FR-030).

| Component | Kind of cost | Expected |
|---|---|---|
| The cloud VM with the thin services (the relay, production's gateway path and kill-switch state, the tunnel's end), its disk, and its public address | fixed, all month | The largest idle line. The plan sizes the VM from the services it runs and prices it; spec 000's plan puts the gateway and its store at about 0.6 GB of memory. |
| The DNS zone and the certificate | fixed, small | — |
| The edge and the static site's storage | per request and per byte | Close to zero at a portfolio's traffic. The caps bound a flood (FR-033), and the budgets catch it, late (FR-022, FR-023). |
| Terraform state, the secrets store, the release registry, the public snapshot | storage, small | — |
| AWS budgets, the anomaly monitor, the budget action, and the bridge that carries AWS-side alerts to Telegram | small or none | — |
| The uptime probe | per check | Never a metered call (FR-061). |
| A managed web firewall, only if question 4 picks it | fixed, all month | "a large fixed share of the ceiling" (2026-09-07 outline) |
| Bedrock fallback | metered, per call | Spec 000's sub-budget. At worst the ceilings, less infrastructure under question 3's rule. |
| Telegram and SMTP alerts | none | Both are free (ADR 0005). |
| The local tier | none in the cloud | — |
| Development time | the Team plan (spec 000 FR-037) | Agent sessions reach no cloud. |

Before the first apply, the plan prices every line from the published pricing pages and sums the idle lines against "≤ $10/month" (FR-021). It also states how much of each ceiling question 3's rule leaves for fallback and burst. SC-002 and SC-003 measure the result. The worst case comes from AWS's billing lag: a non-model overrun can pass the ceiling before the budgets react. The meter bounds model spend in real time, and FR-023 then cuts paid model calls off at the provider.

## Degraded Modes

This table gives every new path's behavior when something it needs is gone. Principle I: "Every user-facing capability MUST define its degraded mode before its happy path".

| What is gone | What a visitor gets | What the operator gets | Requirements |
|---|---|---|---|
| The local tier (asleep, off, or WSL2 restarting), or its tunnel | The site. Hello is answered by the paid fallback inside the sub-budget, or with the degraded response and its cause. The site says the local tier can't be reached, and the public view shows last-known values and the tier's current status. | Tier and tunnel status, fallback spend, a probe alert after 5 minutes, and the local-tier runbook | FR-028, FR-035, FR-036, FR-054, FR-056, FR-057 |
| Both the local tier and the paid fallback (the sub-budget is spent or awaiting renewal, a ceiling was reached, the provider is down, or its permission was revoked) | The degraded response naming its cause, and the site's notice | Spec 000's alerts, renewal, and reset | FR-036 |
| The kill-switch state is unreadable, unknown, or not confirmed in 10 seconds | The degraded response (fail closed) | Spec 000's store alert | FR-030 |
| The gateway, seen from the relay | The degraded response naming it | The relay panel, a probe alert | FR-034 |
| The relay or the whole cloud VM, down or being replaced | The site, plus the edge's own degraded body for hello and status | A probe alert and a deployment record; the meter of record's store survives the VM | FR-019, FR-028, FR-034, FR-061 |
| The edge or the DNS service itself | Nothing loads. There is no second host: one account, and no second vendor. | The probe alerts | FR-061 |
| A client's share of the caps | A 429 refusal | Refusal counts | FR-033 |
| Paid-model permission, after an AWS-side breach | Local answers continue; the fallback is refused | An alert and the seven-day incident note | FR-023 |
| AWS's billing data, arriving late | Nothing changes | The safety net acts late; the meter is unaffected | FR-024 |
| A new release that fails its health checks | The previous release keeps answering | An alert and a deployment record | FR-047 |
| The release source | Nothing changes | The deployer's last poll, on the dashboard | FR-046 |
| The local tier's telemetry backends | Nothing changes | Delayed or lost telemetry, shown on the dashboard; enforcement is unaffected | FR-060 |
| The snapshot's refresh, while the local tier is up | Older values, with their time | The freshness panel | FR-058 |
| The uptime probe | Nothing changes | Missing probe results on the dashboard | FR-061 |
| One alert channel | Nothing changes | The other channel (spec 000 FR-032) | FR-022 |
| The state backend or its lock | Nothing changes | Plan and apply refuse to run; only the Author may force-unlock | FR-001, FR-006 |
| The secrets store, when a cloud stack starts | The edge's degraded body | The stack refuses to start (spec 000's startup refusals), and a probe alert | FR-009 |
| The certificate's renewal | Browser warnings once it expires | An alert before expiry, and the runbook | FR-027, FR-056 |
| CI, after publication | Nothing changes | No plans on pull requests; applies wait | FR-014, FR-015 |

## Data Flows This Spec Adds

Each row below becomes a row of `docs/data-flow-disclosure.md`, with spec 000's columns, in the change that creates the flow (FR-040). The site publishes the result (FR-041). This is the list the spec commits to; the disclosure itself is authoritative.

| Flow | From → to | Carries | Never carries | Why |
|---|---|---|---|---|
| V1 | the visitor's browser → the edge, for the static site and the disclosure | the path, the IP address, the user agent, standard headers, the TLS server name | cookies (none are set); requests to third parties (none are made, FR-038) | to serve the site (FR-027) |
| V2 | the visitor's browser → the edge → the relay, for hello and the status request | hello's message (at most 500 characters) and its answer; the IP address, held in memory for the caps; the user agent | the message or the answer in any log, trace, or store; the address in any log, trace, metric, alert, ledger, or store (FR-031, FR-042) | to answer hello and to show whether the machine is awake (FR-030 to FR-037) |
| V3 | the visitor's resolver → the DNS service for h4reet.ai | the lookup, as the resolver sends it | — | to find the site |
| V4 | the visitor's browser → the public view | the IP address, the user agent | — | to watch the system run (FR-057 to FR-059) |
| V5 | the visitor's browser's own checks, such as a certificate's status | what the browser sends | — | listed because the site can't switch them off |
| C1 | the cloud → the local tier, through the tunnel: production's calls to the local model (or, under FR-017's option B, the relay's forwarded request) | the fixed system prompt and hello's message, and the answer back | client identifiers, the operator token, secrets | local-first answers (FR-035) |
| C2 | production's gateway → Bedrock: spec 000's row F1, which visitors' messages can now reach | as F1, with a visitor's message | as F1 | the capped fallback (FR-035) |
| C3 | the cloud stack → the local tier's collector, through the tunnel | spans, metrics, logs | payloads, client identifiers, secrets (spec 000 FR-029) | observability (FR-060) |
| C4 | the local tier → the cloud: the public snapshot | dashboard values and their time | payloads, client identifiers, operator reasons, secrets | so the public view never goes dark (FR-057) |
| C5 | the local tier → the tunnel's cloud end: the tunnel itself | the tunnel credential, keep-alives | — | FR-052 |
| C6 | both deployers → the release source; the cloud VM → image registries | release IDs, image names and digests, the host's address | credentials beyond pull access | pull-based deployment (FR-046) |
| C7 | production's gateway in the cloud → Telegram and the alerts mailbox: spec 000's rows A1 and A2, now sent from the cloud | as A1 and A2 | as A1 and A2 | alerts (spec 000 FR-032) |
| C8 | AWS's budgets and anomaly monitor → Telegram and the alerts mailbox | the budget or monitor, the threshold, the amounts, the time | payloads, client identifiers | the safety net (FR-022) |
| C9 | the Author's terminal → AWS's APIs: Terraform plans and applies, and the state | resource configuration, the state, the Author's short-lived session | secrets' values (FR-009) | infrastructure as code (FR-001, FR-007) |
| C10 | the Author's terminal → the release source, before publication | release images and their digests | — | releases (question 9) |
| C11 | the uptime probe → the site and the relay's status | probe requests, marked as probes | — | detection (FR-061) |
| C12 | after publication: CI → AWS's APIs | OIDC tokens, plan reads, apply writes | static credentials | FR-016 |

## Constitution Check

This applies the `constitution-check` skill against `.specify/memory/constitution.md` 1.0.1.

| Principle or standard | Touched | How this spec complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | This spec carries the project's first visitor bytes, and every flow is in the public disclosure, on the site, before it happens (FR-040 to FR-042). There are no cookies, no device storage, and no stored visitor address. Routing stays local-first (FR-035), and the local tier still runs the whole topology with one command (FR-045). Every new path has a degraded mode (Degraded Modes). No biometrics: the only visitor input is hello's text. |
| II. Production-grade or not shipped | Yes | Tests come from the acceptance scenarios and the matrix, and hello's red-team cases are the evals (FR-039). Every new path gets telemetry and panels (FR-060). There is a cost estimate (Expected Cost Impact) with measurements (SC-002, SC-003), runbooks for every new alert (FR-056), and ADRs (FR-062). |
| III. Intent → spec → code; humans merge | Yes | The accepted intent is in this folder, no code comes before an approved plan, and decisions get ADRs. Deviation for the local phase: merge-request notes and the local gate stand in for pull requests (ADR 0013; FR-005, FR-007). The GitHub-side half is FR-014 to FR-016, pending question 1. |
| IV. Least privilege | Yes | Apply, destroy, and state writes are human-only, and agents are refused in every spelling (FR-006). Access is only short-lived and identity-based (FR-008, FR-016). No secret is in the repository, the state, plans, or agent context (FR-009 to FR-011). The Terraform for IAM, budgets, alert routing, edge rate limits, and the kill switch is human-only (FR-012). The local tier takes no inbound connection, pulls its releases, and runs no CI runner (FR-046, FR-052, FR-055). The cloud operator interface isn't public (FR-050), and the cloud VM's egress is allowlisted (FR-051). No new sandbox domain is added (Assumptions). The spec touches enforcement points (the bash gate, the deny lists, the matrix, and the local gate) through the Author's patches. Deviation for the local phase: apply runs from the Author's terminal, not a protected environment (Assumptions). |
| V. Cost is a first-class signal | Yes | One meter of record (FR-017, FR-018; question 2). Infrastructure cost sits inside the same ceiling (FR-020; question 3), under the idle target (FR-021). AWS budgets and anomaly detection come first (FR-022), with an automated provider-side cut-off (FR-023); both paths are rehearsed by tripping them (FR-025, FR-026). The meter stays the control (FR-024), model calls go only through the gateway (FR-035), and spend is on every public view (FR-059). |
| VI. Build in public | Yes | The public dashboard never goes dark (FR-057 to FR-059), the disclosure is on the site (FR-041), apply records are committed (FR-007), and decisions get ADRs (FR-062). Deviation, already recorded in ADR 0013: the repository stays private until publication, although the site may go live before it (question 1). |
| VII. Say exactly what you owned | Lightly | The placeholder site states nothing about the Author that isn't in the corpus or a filled `facts/` slot (FR-038). The product reasoning shows where visitors look: whether the machine is awake, what leaves their device, and what the system spends. |
| VIII. Honest AI | Yes | Hello is named as a test, not the twin (FR-038; spec 000's fixed prompt), and it passes red-team cases before it goes public (FR-039). There is no twin in this spec. |
| Prohibited without a human | Yes | IAM, budgets, alert routing, edge rate limits, and the kill switch change only through the Author's apply or the operator credential (FR-007, FR-012), and agents plan only. The provider-side cut-off (FR-023) is the system's own degradation, set up by the Author's apply, as the kill switch's trip is. |
| Secrets and supply chain | Yes | Terraform and its providers are pinned (FR-004), and plan and apply records are redacted (FR-010). The CI-side controls stay with the publication spec (ADR 0014; Assumptions). |
| Incidents | Yes | An AWS-side breach gets the seven-day incident note (FR-023). Meter breaches keep spec 000's drafts. |
| Cloud standard | Yes | One account, with environments separated by VM, role, tag, and budget (FR-001, FR-002). Remote state with locking (FR-001). The cloud hosts only the constitution's list (FR-044). The plan on every PR and the protected apply come after publication (FR-014, FR-015), with the local-phase deviation above. |
| Compute standard | Yes | One compose definition runs on the cloud VM and on the local tier (FR-043). The relay is a container (FR-029). Hosts run the same images by digest (FR-048), and spec 000's image deviations carry over (Assumptions). |
| Local tier standard | Yes | Heavy containers stay local, behind an outbound tunnel, with pull-based deployment. Production works while the local tier is off, through the fallback or degraded mode (FR-028, FR-044, FR-052 to FR-055). |
| Model access standard | Unchanged | Gateway-only, local-first, with Bedrock inside its capped sub-budget (FR-035). |
| Observability standard | Yes | Public read-only dashboards with a cloud-hosted last-known snapshot (FR-057 to FR-059). This reads them as snapshots of Grafana's dashboards unless the Author chooses the live view (question 10). Payloads are never exported (spec 000 FR-029). |
| Alerting standard | Yes | AWS-side alerts go to Telegram, then email, never SMS (FR-022). Degradation never waits on delivery (FR-024). |
| Development Workflow step 6 | Yes | Releases are pulled by digest and restarted per service. A release that fails its health checks rolls back automatically, and the previous release is one command away (FR-046, FR-047). Building once and promoting in CI waits for the publication spec (ADR 0014). |

## Open questions for /speckit-clarify

Questions 1 to 4 carry this spec's four needs-clarification markers. `/speckit-clarify` asks at most five questions a session, so questions 5 to 12 either take a second session or stand as the defaults in Assumptions if the Author accepts them. Each question lists the recommended option first.

1. **The GitHub-side requirements and ADRs 0013 and 0014** (FR-014 to FR-016; SC-015). How do the plan on PRs, the protected apply, and CI's OIDC roles relate to the local phase?
   - **A (recommended)**: keep them in spec 001, scoped to after publication with a dependency on the publication spec. FR-005 and FR-007 stand in until then, and the after-publication criteria are checked once the publication spec turns on the protected environment. *ADR 0014 left ADR 0013's Consequence for spec 001 unchanged, so this needs no new ADR.*
   - B: move them word for word to the publication spec, as ADR 0014 did for spec 000, so spec 001 closes on local criteria only. This needs an ADR, because ADR 0014 kept them in spec 001.
   - C: no cloud apply before publication. Spec 001 is planned and built locally, its first apply runs from the protected environment, and nothing goes live before publication.
   - D: rehearse on a private GitHub repository. Real CI comes sooner, but this needs an ADR superseding part of ADR 0013.
2. **Production's meter of record** (FR-017). Which stack holds the one meter and kill switch that all production spend counts against?
   - **A (recommended)**: the cloud VM's gateway, always on, routing local-first to the local tier through the tunnel. The local tier's production environment file keeps the model server, tracing, and dashboards, and drops its paid route. *It's the only always-on place, and it matches the constitution's split ("the Bedrock fallback path" in the cloud, the heavy containers local). It's also what the option the Author chose in spec 000's plan interview anticipated: "Spec 001 can split prod into cloud and local files later."*
   - B: the local tier's gateway, as in spec 000, with its state copied to the cloud for the relay. While the local tier is unreachable, hello is degraded and no fallback serves visitors, which departs from the constitution's Cloud standard.
   - C: a managed store in the cloud that both gateways meter against. The local tier's gateway then fails closed whenever the cloud is unreachable, unlike spec 000's stack (ADR 0003: "the stack needs no cloud to run").
3. **Infrastructure cost and the ceiling** (FR-020). How does cloud infrastructure cost count against "$5/day, $20/month"?
   - **A (recommended)**: the meter of record also books infrastructure cost, as a daily share of the month's estimate corrected when AWS's billing data arrives. Metered calls stop when metered spend plus infrastructure reaches $5 for the day or $20 for the month. This changes spec 000's meter and needs an ADR. *It's the intent's "All of it must fit", with the meter still the enforcement point (Principle V).*
   - B: the Author lowers the metered monthly ceiling in `config/budgets.yaml` by the idle target, which leaves $10 a month for metered calls if the target stays "≤ $10/month", and keeps $5 a day. It's a fixed split, with an ADR.
   - C: the meter keeps $5 and $20 for metered calls only, and AWS's account budget at $20 serves as the lagging safety net. A month's total can then pass $20 by up to the infrastructure cost.
4. **The public request cap** (FR-033). Where is it enforced within budget?
   - **A (recommended)**: in the relay, from the address the edge supplies. *There's no fixed cost. Capped requests still reach the edge and the relay and are billed there, which the budgets bound.*
   - B: a managed web firewall at the edge. It refuses before the relay, but it's "a large fixed share of the ceiling" (2026-09-07 outline).
   - C: an edge function with a counter store, charged per request.
   - D: a free CDN tier in front. That adds a second vendor that sees every visitor request and needs its own disclosure row.
5. **Is hello public in spec 001?** (Assumptions; FR-030 to FR-039)
   - **A (recommended)**: yes, through the relay, capped, as a test endpoint with spec 000's fixed prompt. *It's the intent's visitor story, and it proves the routing in public.*
   - B: the Author only, until the twin exists. Visitors get the site and the status, and no visitor text flows yet.
   - C: status only for visitors, with no model call from the public at all.
6. **The idle target** (FR-021; SC-002). START-HERE §5 still lists it as open.
   - **A (recommended)**: confirm the intent's "Idle infrastructure target ≤ $10/month". *It's already the accepted intent's figure.*
   - B: a different target that the Author states.
7. **When neither the local tier nor the fallback can answer** (FR-036). This is the intent's open question, "degraded page vs. static answers".
   - **A (recommended)**: spec 000's degraded response and a notice on the site; static answers wait for the twin's spec. *Static answers are content about the Author, which only the corpus may supply (Principle VIII).*
   - B: static answers now, from a short curated set drawn from the corpus.
   - C: the degraded response only, with no notice on the site.
8. **What an AWS-side breach does on its own** (FR-023).
   - **A (recommended)**: revoke paid-model calls at the provider, automatically, until the Author restores them. *Principle V says the system "degrades itself", and spec 000's research left a stolen session's Bedrock spend to this spec's budgets.*
   - B: that, plus stopping the cloud VM, so non-model costs stop too, at the price of the relay going dark.
   - C: alert only, as a pure safety net.
9. **Releases before publication** (FR-046, FR-048).
   - **A (recommended)**: the Author's terminal builds each release once and publishes it to a private registry in the account, and both deployers pull it by digest. *That gives identical images and pull-based deployment, with no GitHub needed.*
   - B: each host builds the gateway from the released commit, as spec 000's host stacks do. Digests then differ per host (spec 000's T184 reading).
   - C: no cloud deployments until publication, when CI builds releases.
10. **The public view** (FR-057 to FR-059).
    - **A (recommended)**: always the cloud-hosted snapshot, refreshed so its values are at most 5 minutes old while the local tier is up. The operator's Grafana never faces the internet. *Least privilege: nothing on the Author's machine answers visitors' dashboard requests.*
    - B: the live Grafana public dashboard through the tunnel, read-only and path-limited, with the snapshot used only while the local tier is unreachable. This is closer to the constitution's "Grafana for public read-only dashboards".
11. **Where the tunnel ends** (FR-052; Assumptions).
    - **A (recommended)**: inside the project's AWS account. *No new vendor can read what it carries.*
    - B: a third-party managed tunnel. It's often free, but it adds a vendor that sees the visitors' messages it carries, with its own disclosure row.
12. **Who runs the real `terraform plan` before publication** (FR-005; Assumptions).
    - **A (recommended)**: the Author's terminal, while agent sessions run offline checks against a provider cache the Author seeds. *No new credential and no new sandbox domain.*
    - B: a read-only plan identity for the ops agent, with the Terraform registry added to the sandbox's allowlist. This widens the sandbox, so it needs the Author and an ADR.
    - C: no real plan until CI exists, after publication.
