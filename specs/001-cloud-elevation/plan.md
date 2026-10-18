# Implementation Plan: Cloud Elevation — Terraform, One Account, Same Compose Stack

**Branch**: `spec/001-cloud-elevation` (this plan; the work runs on one feature branch per task group, [§14](#14-order-of-work-risks-and-proof)) | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Status**: **Draft for the Author's approval**, written overnight on 2026-10-18 at the Author's direction of 2026-10-17 ("trust the recommendations and keep going as far as we can!"). Nine decisions wait for the Author's answers ([research.md, The plan interview, to ask](research.md#the-plan-interview-to-ask)); the plan assumes each recommended answer until then. Spec 000 hasn't passed every success criterion yet (SC-001's re-run, SC-002, SC-005's dashboard timing, and SC-007 are open), and the spec's Assumptions put that first. Interview question 1 asks whether to approve the plan now, with the first task group that needs a stack waiting for those runs.

**Input**: `specs/001-cloud-elevation/spec.md`, clarified on 2026-10-11 and 2026-10-12 (its Clarifications), and spec 000 as merged on main at 58bd232.

**Companions**: [research.md](research.md) (each decision, its rationale and rejected alternatives, and the idle-cost table), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md) (the validation runs), and the ADRs FR-062 lists, written in the commit that records the Author's approval ([§13](#13-documentation-and-adrs)). Where this plan and a contract disagree on an interface detail, the contract is right and this plan is fixed.

**Conventions** (spec 000's, plus two):
- **The Author's terminal**: commands only the Author runs, outside Claude Code. Hooks block them for agents.
- **Agent-editable** files are changed by agents and reviewed by the Author. **Human-only** files change only by the Author's hand; agents deliver their changes as patches in `docs/merge-requests/`.
- **A stack** is one running copy of the topology. Spec 000 has `prod` and `dev` on the 5090 host and `dev-cpu` on the agents' engine. This spec adds **`cloud`**, on the cloud VM.
- **A root** is one Terraform root module under `infra/`: `bootstrap`, `account`, or `prod`.

## Summary

Spec 001 puts h4reet.ai on the internet without moving the heavy tier off the Author's machine. One AWS account in us-east-1 holds:
- **the safety net, applied first:** AWS budgets at the $5 and $20 ceilings, a cost-anomaly monitor, and a budget action that revokes Bedrock at the provider when the month's bill reaches $20;
- **the edge:** a CloudFront distribution serving the static site from S3 over TLS, with the zone in Route 53;
- **one small Graviton spot VM** running the very same compose file as a fourth stack, `cloud`, with:
  - the relay, which routes visitors' requests;
  - the fallback gateway, which holds the one meter of record and its kill switch;
  - the tunnel's end;
  - a collector that ships telemetry home.

While the Author's machine is up, the relay sends hello through an outbound OpenSSH tunnel to the local tier's own `edge`, gateway, and model. While it isn't, the fallback gateway answers within the $2 sub-budget, or with spec 000's degraded response. Releases are built once in the Author's terminal and pulled by digest by a deployer on each host. The public dashboard is a snapshot the local tier pushes up through the tunnel, so it never goes dark.

Technical approach, by area:
- **Infrastructure** ([§1](#1-infrastructure-the-roots-the-state-and-the-records), R-02, R-03, R-13, R-14):
  - three Terraform roots, pinned, with state in S3 under S3's own lock;
  - the plan goes in the merge-request note, tied to the `infra/` tree it was made from, and the local gate checks it;
  - the Author applies a saved plan that `make infra-verify` has matched to the note, and `make infra-record` writes the record. There is no `make apply`.
- **Guards** ([§2](#2-the-guard-patch-before-any-infra-file), R-16): one patch the Author applies before the first `infra/` file. It refuses every state-changing Terraform command in every spelling, denies the state, the plans, and the new credentials by path and name, and protects the Terraform that defines IAM, budgets, alerts, edge limits, and the kill switch.
- **Cost** ([§3](#3-cost-the-safety-net-and-the-meter-of-record), R-04, R-05, R-20–R-24):
  - idle cloud cost about $8 a month on a t4g.micro spot instance, about $11 on a t4g.small;
  - the meter of record books it as a daily share and corrects it from AWS's own data;
  - the budget action and its rehearsal; AWS-side alerts reach Telegram through a Lambda bridge and email through SNS.
- **The edge and the relay** ([§4](#4-the-edge-the-site-and-the-relay), [§5](#5-the-paths-the-local-path-the-fallback-gateway-and-the-tunnel), R-07, R-08, R-12, R-18):
  - CloudFront reaches the relay only through a VPC origin, on the VM's private interface;
  - the relay applies the public cap, reads the kill switch of record at request start, and picks the path.
- **The tunnel** ([§5](#5-the-paths-the-local-path-the-fallback-gateway-and-the-tunnel), R-11): OpenSSH's reverse forwards in two unprivileged containers. The server permits exactly the forwards the disclosure lists, and the local `edge` authenticates each call.
- **The VM and releases** ([§6](#6-the-cloud-vm), [§7](#7-releases-and-the-deployers), R-10, R-15, R-17):
  - a host egress proxy with a hostname allowlist generated from the disclosure;
  - credentials for the fallback gateway assumed from the instance role, out of the containers' reach;
  - pull-only deployers, and rollback by release.
- **Visitors** ([§8](#8-what-the-visitor-gets-the-site-the-disclosure-and-the-public-view), R-19): a placeholder site, the disclosure rendered from the repository's, a content security policy that keeps every request on h4reet.ai, and the public view.

## Technical Context

**Language/Version**:
- **TypeScript 6.0.3 on Node 24 LTS** (spec 000's pins) for the new `services/relay` and the gateway's changes.
- **Python 3.12, stdlib only,** for the tools:
  - `deploy/scripts/deployer.py`, the snapshot sink and publisher, and the VM's egress proxy;
  - the Lambdas (`h4-alert-bridge`, `h4-probe`, `h4-credential-audit`);
  - the gates' new checks (`infra_policy.py` adds `python-hcl2`, pinned and hashed);
  - `infra_redact.py` and the records.
- **HCL for Terraform.** The Terraform version and `hashicorp/aws` are pinned in the first infra task, from the Author's terminal (R-02).
- **Bash 5.2** for the hooks and the matrix; nginx configuration; OpenSSH configuration; SQL for one migration.

**Primary Dependencies**:
- **The relay:** fastify 5.12.5, pg 8.23.1, zod 4.6.5, and pino 10.4.0, with the OpenTelemetry set spec 000 pins (the same versions as the gateway, one lockfile).
- **AWS** (the VM's host tools, and the Author's terminal): the AWS CLI v2, at the version the devcontainer pins, and the Session Manager plugin.
- **OpenSSH** in Alpine's package, pinned through the base image's digest.
- **Containers** (new images, pinned by index digest in `deploy/images.lock`):
  - `relay`, built from `services/relay/Dockerfile` on spec 000's Node base;
  - `tunnel` and `tunnel-end`, built from `deploy/tunnel/Dockerfile` on a pinned Alpine;
  - `snapshot-publisher` and `snapshot-sink`, built on spec 000's Python base;
  - the Lambda images, on AWS's Python 3.12 Lambda base;
  - every upstream image the cloud stack runs, already pinned by spec 000.

**Storage**:
- **Cloud:**
  - **The meter of record:** spec 000's `gateway-state` Postgres and its journal, on a 2 GiB gp3 volume that outlives the VM (R-20).
  - **Terraform's state:** S3, versioned and locked (R-03).
  - **S3:** the site's bucket (the site, `/_degraded/`, `public-view/`) and the release bucket.
  - **ECR:** one repository per service.
  - **Parameter Store's SecureStrings,** holding values only the Author sets (FR-009).
- **Local:**
  - `~/.config/h4reet-ai/{infra,tunnel,release}/`: the Author's, denied to agents;
  - `~/.local/state/h4reet/releases/`: the local release source.
- **Memory only:** the relay's per-address caps (at most one UTC day, FR-042).

**Testing**:
- **vitest** for the relay and the gateway's changes, with the contract tests in [contracts/relay-http.md](contracts/relay-http.md).
- **pytest** for the tools, the Lambdas (with a stub Telegram and a stub SNS event), the deployer (with a stub engine), and the gates' new checks (fixtures of HCL and plan JSON).
- **The matrix** grows (FR-006, FR-011, FR-012).
- **`make breach-test ENV=dev-cpu`** grows the relay's assertions (FR-025).
- **Offline Terraform checks:** `fmt`, `validate`, and the policy, against the Author's provider mirror (R-14).
- **The Author's runs** in [quickstart.md](quickstart.md), against real AWS.

**Target Platform**:
- **The local tier:** spec 000's host, unchanged.
- **The cloud VM:** EC2 `t4g.micro` (arm64, 1 GiB) as a persistent spot request that stops on interruption, Amazon Linux 2023, Docker from its repository with the pinned Compose plugin, in us-east-1, one availability zone (R-04).
- **The edge:** CloudFront, with S3 and a VPC origin.
- **AWS-side functions:** Lambda container images on arm64.

**Project Type**: an extension of spec 000's multi-service system: one new web service (the relay), cloud infrastructure as code, a static placeholder site, and host services for deployment and egress.

**Performance Goals**:
- **Hello:** within 5 s with the local tier off, by fallback or degraded (SC-001). The fallback answers in 1–2 s (spec 000's SC-005 run: 0.86–1.21 s), plus the edge's hop.
- **Kill-switch changes** reach the relay within 10 s (SC-008); the relay reads the store on every request.
- **Failover** within 5 s of the first failed check (SC-007): the relay checks the local path every second, and a failed request falls back at once.
- **The public view** is at most 5 minutes old while the local tier is up (SC-013): it's published every 2 minutes.

**Constraints**:
- **Idle cloud cost** at most $10 a month (SC-002); the estimate is about $8 (R-05).
- **Ceilings:** every dollar inside $5 a day and $20 a month (SC-003).
- **Credentials:** none long-lived (SC-004), and no AWS credential on the local tier or in any agent session.
- **The local tier** takes no inbound connection (SC-006).
- **Visitor data:** no address, message, or answer stored anywhere (SC-011), no cookie, and nothing stored on the visitor's device (SC-010).
- **Agents** plan offline only, and never apply.

**Scale/Scope**:
- **Traffic:** a portfolio's: test traffic at first, and a public cap per address in the relay (FR-033).
- **Infrastructure:** four stacks, three Terraform roots, about 60 AWS resources.
- **New code:** one TypeScript service, about eight Python tools, three Lambdas, and two OpenSSH images.

## Constitution Check

*GATE: passed before research and re-checked after design ([below](#constitution-check-post-design)).*

| Principle or standard | What spec 001 does | Verdict |
|---|---|---|
| I. Data-local by default | **Local-first:** while the local tier is up, it answers visitors (FR-017, FR-035), and `make up ENV=prod` still starts the whole topology (FR-045). **Disclosure:** every new flow is a disclosure row before it happens, rendered on the site from the repository's file (FR-040, FR-041; [§8](#8-what-the-visitor-gets-the-site-the-disclosure-and-the-public-view)). **No visitor data kept:** no cookies, no device storage, and visitor addresses held in memory only (FR-042). **Degraded modes:** every new path has one ([§11](#11-degraded-modes)). **No biometrics.** | PASS |
| II. Production-grade or not shipped | Tests per contract, red-team cases before hello is public (FR-039), telemetry on every new path (FR-060), a cost estimate with its measurement (R-05; SC-002, SC-003), a runbook per new alert (FR-056), and ADRs (FR-062) | PASS |
| III. Intent → spec → code; humans merge | The accepted intent is in the folder, this plan comes before code, and each task group is a branch with a note. **Deviation, local phase:** the plan in the note and the Author's recorded apply stand in for the plan on a pull request and the protected apply (ADR 0013; spec Assumptions; R-13) | PASS, recorded deviation |
| IV. Least privilege | **Terraform:** apply-class commands refused to agents in every spelling (R-16); IAM, budgets, alerts, edge limits, and the kill switch in protected files (R-14). **Identities:** none long-lived, and none on the local tier (R-15, R-17). **Containers:** IMDS out of their reach; a hostname-allowlisted egress (R-10). **Tunnel:** permits only the listed forwards (R-11). **Operator:** reached only through a short-lived Systems Manager session (FR-050). **Order:** every deny lands before its risk ([§2](#2-the-guard-patch-before-any-infra-file)). **Sandbox:** no new domain | PASS |
| V. Cost is a first-class signal | **The meter:** one meter of record (FR-017, FR-018), booking infrastructure too (FR-020, R-21). **AWS's side:** budgets and the anomaly monitor in the first apply (FR-022), and an automated revoke at the provider (FR-023), both rehearsed (FR-025, FR-026). **On view:** spend on every public view (FR-059) | PASS |
| VI. Build in public | **The public view** never goes dark (FR-057 to FR-059); **apply records** are committed (FR-007). **Deviation, already recorded in ADR 0013:** the repository stays private until publication | PASS, recorded deviation |
| VII. Say exactly what you owned | The placeholder site states nothing about the Author outside the corpus or a filled `facts/` slot (FR-038) | PASS |
| VIII. Honest AI | Hello is named a test of the gateway, not the twin, and passes red-team cases before it is public (FR-038, FR-039) | PASS |
| Prohibited without a human | Apply, destroy, state writes, IAM, budgets, alert routing, edge limits, and the kill switch: the Author's apply or the Author's patch only. The budget action is the system's own degradation, set up by the Author's apply | PASS |
| Secrets and supply chain | **Pins:** Terraform, providers, and images, by version, lockfile, and digest (FR-004). **Secrets:** filled by the Author in Parameter Store, never in state (FR-009). **Deviation, ADR 0014:** the CI-side controls wait for the publication spec | PASS, recorded deviation |
| Cloud standard | **One account,** environments by VM, role, tag, and budget (FR-001, FR-002). **Remote locked state** (FR-003). **Only the constitution's list** in the cloud (FR-044). **Deviation, as above:** "plan output posted on every PR; apply from a protected environment" waits for publication | PASS, recorded deviation |
| Compute standard: one compose definition, identical images | The cloud stack runs `deploy/compose.yaml` with its own env file (FR-043), and each release is one image index per service on both hosts (FR-048). Spec 000's image deviations carry over (ADR 0015) | PASS, carried deviation |
| Local tier standard | **Heavy containers local,** behind an outbound tunnel (FR-052 to FR-055). **Deployments pulled,** not pushed (FR-046). **Production works with the local tier off** (FR-028) | PASS |
| Model access standard | **Gateway only, local first;** Bedrock within the sub-budget, from the fallback gateway alone (FR-035). **No new component calls a provider** | PASS |
| Observability standard | Public read-only dashboards as a cloud-hosted snapshot (FR-057 to FR-059, read as the spec reads them). Payloads are never exported | PASS |
| Alerting standard | AWS-side alerts go to Telegram first and email second, never SMS (FR-022). Degradation never waits on delivery (FR-024) | PASS |
| Development Workflow step 6 | **Releases** are built once and pulled by digest, and roll back automatically on failed health and in one command (FR-046, FR-047). **Deviation, ADR 0014:** building in CI and promoting from there waits for publication | PASS, recorded deviation |

Gate result: **PASS**. Every deviation is justified in the spec's Assumptions and an ADR ([Complexity Tracking](#complexity-tracking)).

## Project Structure

### Documentation (this feature)

```text
specs/001-cloud-elevation/
├── intent.md                  # the accepted intent
├── spec.md                    # clarified 2026-10-11 and 2026-10-12
├── publication-carryover.md   # FR-014 to FR-016 and SC-015, moved word for word
├── plan.md                    # this file
├── research.md                # decisions, rationale, alternatives; the idle-cost table; the interview to ask
├── data-model.md              # the meter's new attribution, releases, deployments, plan and apply records, the public view
├── quickstart.md              # the Author's validation runs, per group
├── contracts/
│   ├── relay-http.md          # /api/hello, /api/status, the cap, the kill switch, the path, headers
│   ├── tunnel.md              # the forwards, sshd's rules, the local edge's tunnel blocks, keys, revocation
│   ├── edge.md                # CloudFront: behaviors, origins, headers, CSP, error responses; DNS; certificate
│   ├── releases-deployer.md   # release.json, make release, the deployer's loop, holds, rollback, records
│   ├── infra-records.md       # the plan block, infra-verify, the apply record, the credential audit
│   ├── aws-alerts.md          # the SNS topic, the bridge's message, the probe, the budget action
│   ├── public-view.md         # the snapshot document, the sink's checks, the page
│   └── env-cloud.md           # the cloud stack's env keys, port range, profiles; changes to spec 000's env contract
├── checklists/requirements.md
└── tasks.md                   # next: /speckit-tasks
```

### Source Code (repository root)

Ownership is marked as in spec 000: **[A]** agent-editable and reviewed; **[H]** human-only; **[P]** delivered in a patch the Author applies.

```text
infra/                              [A] new, except the protected files
  README.md                         how the roots, the state, the plan block, and the records work
  bootstrap/  {main,variables,outputs,versions}.tf, budgets.tf [P], alerts.tf [P], .terraform.lock.hcl
  account/    {main,…}.tf, killswitch.tf [P], iam.tf [P], alerts.tf [P], lambdas.tf, registry.tf
  prod/       {main,network,vm,volumes,edge,dns,site,ssm}.tf, iam.tf [P], edge-limits.tf [P] (empty unless WAF)
  modules/    lambda-image/, tagged-bucket/
  lambdas/    alert_bridge/, probe/, credential_audit/   (stdlib Python, Dockerfile, tests)
  policy/     [P] the policy's rule list and fixtures, read by tools/gates/infra_policy.py
services/relay/                     [A] new: the relay (§4), a second npm workspace
services/gateway/                   [A] changed: migrations/0003_infra.sql, the cloud stack and route class,
                                        the relay as a trusted peer on the cloud stack, the infra booking (§3.3)
config/
  routing.yaml                      [A] changed: prod-cloud: { fallback: bedrock }; prod loses its fallback
  budgets.yaml                      [P] changed: infra_month_estimate_usd; a public section (the relay's cap)
deploy/
  compose.yaml                      [A] changed: relay, tunnel, tunnel-end, snapshot-publisher, snapshot-sink;
                                        profiles cloud, tunnel, dev-relay; the cloud literal bindings (§6.2)
  env.example/cloud.env.example     [A] new
  edge/nginx.conf                   [A] changed: the tunnel blocks 8085 and 8086 (§5.2)
  tunnel/                           [A] new: Dockerfile, ssh_config, sshd_config, entrypoint
  otel/collector-cloud.yaml         [A] new: the cloud collector, file-backed queue, export through the tunnel
  vm/                               [A] new: cloud-init, the systemd units (deployer, egress proxy, credentials,
                                        aws-events), nftables rules
  scripts/deployer.py, release.py, egress_proxy.py, assume_gateway_role.py, snapshot_{publisher,sink}.py
                                    [A] new
  scripts/preflight.py              [A] changed: the cloud class, its profiles, its bindings, FR-018
apps/web/                           [A] new: the placeholder site, /status/, build.py (renders the disclosure)
scripts/operator.py                 [A] changed: the cloud stack's port range
tools/gates/                        [P] infra_policy.py, infra_redact.py, infra_plan_note.py, disclosure_check.py,
                                        compose_policy.py's cloud rules, and their tests
redteam/                            [A] forbidden-actions.sh rows (FR-006, FR-011, FR-012); cases/hello-*.yaml (FR-039)
evals/visitor_scan.py               [A] new: SC-011's scan of every store
docs/
  data-flow-disclosure.md           [A] the new rows (§8.2)
  infra/applies/                    [A] apply records, written by make infra-record
  runbooks/                         [A] the local tier, and one per new alert (§12)
  adr/0007–0009, 0024–0029          [A] written at approval (§13)
.claude/**, CLAUDE.md               [P] the guard patch (§2)
.devcontainer/toolchain.vars        [A] Terraform's and the AWS CLI's pins
```

**Structure Decision**:
- **The relay** is a second npm workspace beside the gateway: the same toolchain, lockfile, and image base.
- **Terraform** gets one root per lifecycle (R-02).
- **The Lambdas** live with the Terraform that deploys them.
- **The VM's host services** are stdlib Python in `deploy/scripts/`, run through `PY_HOST` as spec 000's tools are.
- **`apps/web`** starts here as a placeholder; Phase 1 replaces it.

---

## 1. Infrastructure: the roots, the state, and the records

### 1.1 The roots

| Root | State key | Holds | First applied |
|---|---|---|---|
| `infra/bootstrap` | `bootstrap.tfstate` (local first, then migrated) | **State:** the state bucket. **Safety net:** the budgets (`h4-account-month`, `h4-account-day`, `h4-prod-month`, `h4-prod-day`, and `h4-infra-actual`), the anomaly monitor and its subscription. **Alerts:** the `h4-alerts` topic and its email subscription | group 2, the first apply of all (FR-003, FR-022) |
| `infra/account` | `account.tfstate` | **The kill switch:** the deny policy, the budget action, the rehearsal budget and target. **AWS-side functions:** the alert bridge, the probe and its alarm, the credential audit and its weekly schedule. **Releases:** the ECR repositories and the release bucket. **Alerts:** the EventBridge rule for ACM's expiry events | group 3 |
| `infra/prod` | `prod.tfstate` | **Network:** the VPC, two subnets, the internet gateway, the VM's two interfaces and the Elastic IP, the security groups. **The VM:** the spot instance, its launch template, the meter's volume and its daily snapshots. **Roles:** the instance role, the gateway's role. **Secrets:** the Parameter Store entries. **The edge:** the Route 53 zone, the certificate, the distribution with its VPC origin, the site's bucket | groups 4 and 6 |

Every root sets `default_tags` (`project`, `environment`), and every taggable resource sets `component` (FR-002). No root reads another's state. The values one needs from another (the topic's ARN, the gateway role's name) come from `data` sources, by name, so a root can be planned alone.

### 1.2 The plan, the apply, and their records (FR-005, FR-007; R-13)

1. **On the branch,** agents write Terraform and run `make plan`, which runs the offline checks in an agent session. The Author runs `make plan ROOT=<root>` and pastes the redacted block it prints into the merge-request note.
2. **The gate's `infra-plan-note` step** (in `make check` and `tools/gates/gate`) fails unless every affected root has a block whose tree hash is `HEAD:infra`'s, and which passes the redaction check.
3. **After the merge,** on `main`:
   - `make infra-verify ROOT=<root>` checks that the saved plan matches the note and `main`, and runs the credential audit (FR-008);
   - the Author runs `terraform -chdir=infra/<root> apply <saved plan>`;
   - `make infra-record ROOT=<root> OUTCOME=…` writes `docs/infra/applies/<date>-<root>.md` and commits it on `ops/apply-<root>-<date>`.

[contracts/infra-records.md](contracts/infra-records.md) has the block's format, the redaction rules, and the record's fields.

### 1.3 The offline checks and the policy (FR-002, FR-004, FR-012; R-14)

- **`make infra-mirror`** (the Author) seeds `/opt/h4reet/terraform-providers` with the pinned providers.
- **`make infra-check`**, run by `make check`, does `terraform fmt -check -recursive`, then `init -backend=false` and `validate` for each root against the mirror, then `tools/gates/infra_policy.py` on the HCL. It is PLANNED until the mirror exists, naming its task.
- **In the Author's terminal,** `make plan` also runs the policy on `terraform show -json`.

### 1.4 Credentials and secrets (FR-008, FR-009, FR-010)

- **Who holds credentials:**
  - **Humans:** the Author's IAM Identity Center administrator session, only from the Author's terminal.
  - **Workloads:** the VM's instance role, the gateway's role (assumed from it), and the Lambdas' roles. Nothing else.
  - **CI:** no identity before publication.
- **`h4-credential-audit`** (a Lambda, weekly, plus `make infra-verify` before every apply) lists every IAM user and their access keys, and checks:
  - that the account's root user has no access key;
  - that no role trusts a principal outside the account's services and Identity Center.

  Any finding alerts on both channels; a clean run logs its date. SC-004 reads the history.
- **Secrets:** Terraform creates each Parameter Store entry with the placeholder `__SET_BY_AUTHOR__` and `ignore_changes = [value]`; the Author sets the value with the AWS CLI. The entries:
  - the Telegram bot token and chat ID, and the SMTP credentials;
  - the gateway's database passwords, and the operator token's hash;
  - the tunnel's host key and the client's public key;
  - the relay's and the collector's tunnel tokens, and the snapshot sink's token.
- **Run-time values:** the account ID comes from `data.aws_caller_identity`, never a literal. The alert email address and the Telegram chat ID are sensitive variables, supplied from `~/.config/h4reet-ai/infra/<root>.env` in the Author's terminal. The redaction removes them from plans and records.

## 2. The guard patch, before any infra file

The rule from spec 000's plan §15: a deny lands in a patch applied before the risk it guards exists. Here the risks begin with the first `infra/` file, the first state, and the first key. So group 1 is the patch, and nothing under `infra/` exists until the Author has applied it.

**`docs/merge-requests/<date>-feat-001-guards.patch`:**
- **`.claude/hooks/bash-gate.sh`:** R-16's Terraform rules (subcommands, spellings, `TF_CLI_ARGS*`), and the Author-only make targets: `infra-verify`, `infra-record`, `infra-mirror`, `release`, `tunnel-keys`, `tunnel-revoke`, `cloud-session`, `rollback ENV=cloud`, and `operator-* ENV=cloud`.
- **`.claude/settings.json`:**
  - `denyRead`, `denyWrite`, `Read(...)`, and `Edit(...)` denies on `*.tfstate*`, `*.tfplan`, `*.tfvars*`, `~/.config/h4reet-ai/{infra,tunnel,release}`, and `/opt/h4reet/terraform-providers` (read-only);
  - `credentials.envVars` gains `TF_VAR_*`, `AWS_*`, `TF_CLI_ARGS*`, and the new secrets' variable names ([contracts/env-cloud.md](contracts/env-cloud.md)).
- **`.claude/hooks/protected-paths.sh`:** `infra/**/{iam,budgets,alerts,killswitch,edge-limits}*.tf`, `infra/policy/**`, and `config/budgets*` (already protected).
- **`tools/gates/`:** `infra_policy.py`, `infra_redact.py`, `infra_plan_note.py`, `disclosure_check.py`, their tests, the new gate steps, and `matrix-required.txt`'s new rows.
- **`redteam/forbidden-actions.sh`:** a stage H row per spelling, and a gap row for any that gets through.
- **`CLAUDE.md`:** the infra line reads, for the local phase, "make plan only; the Author applies a verified saved plan from their terminal and records it (spec 001 FR-007)". The things-Claude-gets-wrong list names Terraform's state-changing commands.
- **`.devcontainer/toolchain.vars`:** the Terraform and AWS CLI pins. This file is agent-editable, but it travels with the patch, so `make toolchain-check` and the gate agree when it lands.

The patch's behavioral agent-config evals run once after it lands, as spec 000's did (its static tier at once).

## 3. Cost: the safety net and the meter of record

### 3.1 The budgets and the anomaly monitor (FR-022; R-22)

These come in the first apply, in `infra/bootstrap`, before anything else that costs money:
- **Account:** month $20 and day $5, warnings at 70% ($14, $3.50) and alerts at 100%.
- **Production's tag:** the same amounts, filtered to `environment = prod`.
- **`h4-infra-actual`,** monthly, excluding Amazon Bedrock, with no alert: it feeds R-21's correction.
- **Anomaly detection:** a monitor on AWS services, with an immediate subscription over $1.

Every notice goes to `h4-alerts`. The Author activates the cost-allocation tags in the Billing console once, a recorded step (quickstart).

### 3.2 The budget action and its rehearsal (FR-023, FR-026; R-22)

- **The action:** in `infra/account/killswitch.tf` (protected), the managed policy `h4-deny-paid-models` and a budget action on `h4-account-month` at 100% of actual. It is automatic, attaching the policy to `h4-prod-fallback-gateway`. Restoring is the Author's: `aws budgets execute-budget-action --execution-type REVERSE_BUDGET_ACTION` (the runbook), after the seven-day incident note.
- **The rehearsal:** `rehearsal = true` adds `h4-rehearsal` at $0.01 with the same action against `h4-rehearsal-target`. The Author's run records:
  - when AWS evaluated the budget;
  - when each channel received the alert;
  - when the policy was attached.

  Then `rehearsal = false`. SC-009 reads the record.

### 3.3 The meter of record, and infrastructure on it (FR-017 to FR-020; R-20, R-21)

- **The gateway's changes** (data-model.md):
  - the `cloud` stack name, with `H4_ENV=prod`;
  - the route class `prod-cloud`;
  - the relay as a trusted peer for `X-Forwarded-For`, on the cloud stack only;
  - attribution `infra` in reservations and the ledger, and cost bases `estimate` and `billing_correction`;
  - the daily booking, in the 10 s background task and at admission;
  - the daily correction, from `budgets:DescribeBudget` on `h4-infra-actual` through the egress proxy, with the gateway's assumed role.
- **The refusals** (FR-018): preflight and the gateway refuse a paid adapter in any route but `prod-cloud`. The `prod` class keeps `primary: local`, with no fallback.
- **The move:** the cloud store starts `uninitialized`. The Author initializes it with local prod's meters (R-20; quickstart §4).
- **The config change:** `config/budgets.yaml` gains `infra_month_estimate_usd` and the relay's `public` section, by the Author's patch with an ADR. Its schema version rises, and the gateway's validator learns the new keys in the same group.

### 3.4 AWS-side alerts and probes (FR-061; R-23, R-24)

- **`h4-alert-bridge`** turns each SNS notice into one Telegram message, in spec 000's format.
- **SNS's email subscription** carries the same notice.
- **`h4-probe`** runs once a minute; its alarm fires after 5 failed minutes.
- **`h4-credential-audit`** runs weekly.

Each is a container image in ECR, deployed by `infra/account`, with tests in `infra/lambdas/*/test_*.py`. [contracts/aws-alerts.md](contracts/aws-alerts.md) has the message formats.

## 4. The edge, the site, and the relay

### 4.1 CloudFront and DNS (FR-027 to FR-029, FR-034; R-07 to R-09)

- **The distribution** serves `h4reet.ai` and `www.h4reet.ai`, with ACM's certificate (DNS-validated in the Route 53 zone), and redirects HTTP to HTTPS. Its behaviors:
  - **`/api/*`:** the VPC origin, which is the relay on the VM's `eth0`. `CachingDisabled`, plus an origin request policy that forwards `CloudFront-Viewer-Address` and no cookies. POST and GET only.
  - **default:** the site's bucket, through origin access control. Cached, with a response headers policy carrying the CSP, HSTS, `Referrer-Policy: no-referrer`, and `Permissions-Policy` that turns off the camera, microphone, and geolocation.
- **Custom error responses** turn the origin's 502, 503, and 504 into 503 with `/_degraded/api.json` (R-08).
- **No access logs** on the distribution: they would store visitors' addresses (FR-042). The edge's request and error counts come from CloudFront's free default metrics, read every 5 minutes (§9).

[contracts/edge.md](contracts/edge.md) has the behaviors, the headers, and the CSP.

### 4.2 The relay (FR-029 to FR-033, FR-035 to FR-037; R-18)

`services/relay` handles `POST /api/hello` and `GET /api/status`, in R-18's order: the probe mark, the address, the cap, the kill switch of record, the path, and the identity it passes on. [contracts/relay-http.md](contracts/relay-http.md) has the rest:
- every response code and degraded cause, and the status document;
- the cap's defaults: 10 requests a minute per address, burst 3, 200 a day;
- the global limit: 8 requests in flight across all addresses, so the relay can't saturate the local path.

The cap's values live in `config/budgets.yaml`'s new `public` section (the Author's).

The relay also runs on dev and dev-cpu, in the `dev-relay` profile, against the stack's own store and gateway. That's how the breach test asserts its side (FR-025), and how agents test it on the agents' engine.

## 5. The paths: the local path, the fallback gateway, and the tunnel

### 5.1 The tunnel (FR-052, FR-053, FR-055; R-11)

- **`tunnel`** (local prod, profile `tunnel`) and **`tunnel-end`** (cloud, profile `cloud`) come from `deploy/tunnel/Dockerfile`.
  - Both run unprivileged, with every capability dropped and read-only roots.
  - `tunnel-end`'s configuration permits listening only on 2201 and 2202, and opening only `snapshot-sink:8080`.
  - `tunnel` holds the forwards in R-11, and reconnects with backoff (1, 2, 5, 10, 30 s).
  - Its keep-alive is every 10 s, and it gives up a link after 3 missed.
- **The tunnel's state** is a metric from both ends (§9).
- **Keys:** `make tunnel-keys`; revocation is `make tunnel-revoke` (R-11).

[contracts/tunnel.md](contracts/tunnel.md) has the configurations.

### 5.2 The local `edge`'s tunnel blocks (FR-052, FR-053; R-12)

Two server blocks, 8085 (the local path) and 8086 (telemetry in). They are unpublished, and reachable only from the `tunnel` network's fixed subnet. Each requires its own bearer token from the local prod env file, which nginx's template reads at start. Block 8085 accepts only `POST /hello` and `GET /health`, carries the client's address from `X-H4-Client` into `X-Forwarded-For` after the token check, and clears trace context as port 8080 does.

### 5.3 Health, failover, and recovery (FR-054; R-12)

- **The check:** the relay checks `GET /health` through `tunnel-end:2201` every second, with an 800 ms timeout. It marks the path unhealthy after one failure, and healthy again after three passes in a row.
- **On a failed request:** a request in flight on the local path that fails or times out (the local timeout is 10 s, as spec 000's local adapter's) is retried once on the fallback gateway. A degraded answer from the local path is treated the same way.
- **The window:** the next request after the first failed check goes to the fallback, so the gap is at most one check, about one second, within the 5 s that SC-007 allows.

### 5.4 The local tier's production after the move (FR-017, FR-045)

- **Routing:** local prod keeps `primary: local` and no fallback. With the tunnel down, the Author's own `make hello ENV=prod` answers locally or degraded.
- **The topology:** `make up ENV=prod` still starts the whole topology with one command. The `tunnel` profile adds the tunnel and the snapshot publisher, and preflight checks that their keys exist in `~/.config/h4reet-ai/tunnel/`.

## 6. The cloud VM

### 6.1 The instance (FR-043, FR-044, FR-050; R-04, R-15)

- **Launch template:** `t4g.micro`, a persistent spot request that stops on interruption, and the pinned Amazon Linux 2023 AMI ID (a variable, changed through a plan). Also:
  - IMDSv2 required, with a hop limit of 1;
  - the root volume (8 GiB gp3, encrypted) and the two interfaces (§6.2).
- **cloud-init:**
  - installs Docker and the pinned Compose plugin (by SHA-256), and the egress proxy, the deployer, and the credential timer as systemd units;
  - attaches and mounts the meter's volume at `/var/lib/h4reet/cloud`, the cloud stack's `H4_STATE_DIR`;
  - writes the cloud env file from Parameter Store into a 0600 file on tmpfs, so no secret touches the root volume;
  - starts the deployer, which brings up the newest release.
- **Operator access:** through Systems Manager only. No SSH key exists for the instance, and no port is open for administration. `make cloud-session` (the Author) opens the admin listener's port-forwarding session (FR-050).

### 6.2 Networks and the literal bindings (FR-032, FR-051; R-07, R-10)

| Interface | Subnet | Address | Inbound (security group) | Used for |
|---|---|---|---|---|
| `eth0` | private, no internet route | fixed (`10.42.1.10`) | the relay's port from CloudFront's origin-facing prefix list | the VPC origin |
| `eth1` | public | fixed private (`10.42.0.10`), plus the Elastic IP | TCP 2222 from anywhere (the tunnel) | egress through the proxy; the tunnel's port |

The compose file's `cloud` profile publishes:
- the relay at `10.42.1.10:8443`;
- `tunnel-end` at `10.42.0.10:2222`;
- the admin listener at `127.0.0.1:18503`.

All three are literals, so no environment file can move them. The compose policy allows exactly these non-loopback literals, only in the `cloud` profile and only on those services. On any other host the addresses don't exist, so Docker refuses to start them: they fail closed.

### 6.3 Egress (FR-051; R-10)

- **The proxy:** `h4-egress-proxy` (host service, `deploy/scripts/egress_proxy.py`) on `127.0.0.1:3128` and the compose `egress` network's gateway address. Its allowlist comes from `docs/data-flow-disclosure.md`'s cloud rows by `tools/gates/disclosure_check.py`, which also fails the gate when the two differ.
- **nftables:** only the proxy's user may open connections outside the VPC.
- **The security group's egress:** TCP 443 and the SMTP port.

### 6.4 The fallback gateway's credentials (FR-013; R-15)

`h4-gateway-credentials.timer` (host) assumes `h4-prod-fallback-gateway` every 30 minutes with the instance role. It writes `credentials` into `${H4_AWS_DIR}`, a tmpfs directory mounted read-only into the gateway, as spec 000's prod mounts its SSO directory. The gateway's Bedrock adapter reads it through the SDK's default chain, and its `credentials_warn_before_s` alert still fires if the timer stops.

### 6.5 What the cloud stack runs (FR-044)

| Service | Profile | Image | Limit |
|---|---|---|---|
| `relay` | cloud, dev-relay | `relay` (new) | 0.25 CPU, 96 MiB |
| `gateway` (the fallback gateway) | – | spec 000's | 0.5 CPU, 256 MiB |
| `gateway-state` | – | spec 000's Postgres, `shared_buffers=32MB` | 0.25 CPU, 128 MiB |
| `edge` | – | spec 000's nginx, cloud config: admin only | 0.1 CPU, 32 MiB |
| `otel-collector` | – | spec 000's, `collector-cloud.yaml` | 0.25 CPU, 96 MiB |
| `tunnel-end` | cloud | `tunnel` (new) | 0.1 CPU, 32 MiB |
| `snapshot-sink` | cloud | `snapshot` (new) | 0.1 CPU, 48 MiB |

The cloud env file's `COMPOSE_PROFILES` is `cloud`. The heavy services (the model server, Langfuse and its stores, Prometheus, Loki, Grafana) don't run: preflight's rule "not exactly one of `gpu` and `cpu`" becomes "exactly one, except the cloud class, which selects neither". Each service's absence is a degraded mode spec 000 already defines ([§11](#11-degraded-modes)).

## 7. Releases and the deployers

### 7.1 `make release` (FR-046, FR-048; R-17)

`make release` runs only in the Author's terminal, on a clean `main`. It:
1. **Gates:** checks that the release's commit passed the gate, and that hello's red-team record for that commit passed when the release makes hello public (FR-039).
2. **Builds** the project's images once, for `linux/amd64` and `linux/arm64`, and pushes them to ECR, tagged with the commit.
3. **Copies** every upstream image in `deploy/images.lock` into ECR by digest.
4. **Writes** `release.json` to the release bucket and to the local release directory, and prints the record.

The site's files are synced to the site's bucket under the release's commit, and the distribution's default origin path moves to it through the release record. The previous release's files stay, so a rollback is a pointer change.

### 7.2 The deployer (FR-046 to FR-049; R-17)

The deployer runs every minute (a systemd timer, one run at a time) on both hosts. Each run:
- **polls** its source: the release bucket on the VM, `~/.local/state/h4reet/releases/` on the local tier;
- **verifies** each image's index digest;
- **exports** the commit's tree;
- **runs** `docker compose up -d --wait` on only the services whose image or configuration changed;
- **on failed health**, returns to the previous release and alerts;
- **records** the deployment.

It leaves a hand-started stack alone (FR-049). [contracts/releases-deployer.md](contracts/releases-deployer.md) has the loop, the record, and the hold.

### 7.3 Rollback (FR-047; Development Workflow step 6)

- **Cloud:** `make rollback ENV=cloud` (the Author, through the Systems Manager session) sets the VM's deployer to the previous release.
- **Local:** `make up ENV=prod REF=<previous>`, as in spec 000, or `make rollback ENV=prod`.
- **Schema:** the gateway still refuses a store whose schema is newer than its code (exit 78), so a rollback across a migration fails closed.

## 8. What the visitor gets: the site, the disclosure, and the public view

### 8.1 The site (FR-036 to FR-038, FR-041, FR-042)

`apps/web` is a static placeholder, with no framework, no third-party request, and no cookie. It has:
- **`/`:** what h4reet.ai is, in words from the corpus or `facts/` only. A hello form names hello as "a test of the model gateway, not the twin" (FR-038), and shows the status line from `/api/status` (FR-037), with the notice when the local tier can't be reached (FR-036).
- **`/disclosure/`:** rendered by `apps/web/build.py` from `docs/data-flow-disclosure.md` at release. The gate fails if the built page's rows differ from the Markdown's (FR-041).
- **`/status/`:** the public view (§8.3).

Every page links the disclosure. The CSP (`default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`) makes the browser refuse any other host. A static scan of the built site in `make check` fails on any absolute URL to another host (SC-010's machine half).

### 8.2 The disclosure's new rows (FR-040)

- **The spec's flows** become rows with spec 000's columns: V1–V5 and C1–C11, the numbering kept and C12 not reused.
- **Rows this plan adds:**
  - **C13,** the fallback gateway → the AWS Budgets API: the infra correction's one daily read, carrying no visitor data;
  - **C14,** the VM → AWS's Systems Manager, STS, and Parameter Store: the operator's session, the gateway's credentials, and the secrets at boot.
- **Changes to spec 000's rows:**
  - F1 and F2 move to the fallback gateway, with "a visitor's message can now reach Bedrock";
  - S1 and S2 get the tunnel's attachment at `edge`;
  - A1 and A2 add "also sent from the cloud stack".

`tools/gates/disclosure_check.py` fails a change that adds an outward kind of thing without its row:
- a compose service on `egress`, or in the `tunnel` or `cloud` profile;
- an sshd `PermitListen` or `PermitOpen` entry;
- an egress-proxy host;
- a CloudFront origin, an SNS subscription, a Lambda that calls out.

Each disclosure row carries a machine-readable tag naming its hosts and its compose or Terraform objects.

### 8.3 The public view (FR-057 to FR-059; R-19)

The publisher on the local tier sends the document described in [contracts/public-view.md](contracts/public-view.md) every 2 minutes through the tunnel. The sink checks it and writes `public-view/latest.json`, and `/status/` renders:
- **spec 000's FR-028 panels:** requests, latency p50 and p95, errors, spend today and month to date, fallback remaining, the kill switch, model-server health, and degraded causes;
- **this spec's additions:** the local tier's status now (from `/api/status`, live, not from the snapshot), the tunnel's state, idle cloud cost beside metered spend, and the running release;
- **when the values were taken.**

It has no write action and nothing per client.

## 9. Observability (FR-060)

- **New spans:**
  - `relay.request`, with `h4.relay.path` (`local` | `fallback` | `none`), `h4.relay.reason`, `h4.degraded.cause`, and `h4.cap.refused`, never an address;
  - the gateways' spans, unchanged, now with `h4.stack=cloud` on the fallback.
- **New metrics:**
  - `h4.relay.requests` by path and outcome, `h4.relay.duration`, and `h4.relay.cap_refusals`;
  - `h4.tunnel.up` from both ends, and `h4.tunnel.reconnects`;
  - `h4.deploy.events` by host and outcome, and `h4.release.info` (the running commit and who started it);
  - the edge's `requests` and `errors`, from CloudFront's default metrics, read every 5 minutes by the cloud collector's poller through `GetMetricData` (about $0.35 a month, in R-05);
  - `h4.aws.alerts` by source, from the SNS topic's SQS copy, which a host service drains into the collector;
  - the collector's queue and drop counters.
- **The dashboard:** a new row, "Cloud": paths next to spend, the tunnel, the release, the probes, the edge's errors, AWS-side alerts, and telemetry delayed or lost.
- **No payloads, no client identifiers:** spec 000's collector redaction runs on the cloud collector too.

## 10. Tests and proofs

| What | Where | Proves |
|---|---|---|
| The relay's contract suite | `services/relay/test/**` (vitest), with a stub store, stub gateways, and a stub local path | R-18's order; the cap; the kill switch's 10 s rule; failover on unhealthy, timeout, and degraded; no body kept; no address in any log line (FR-030 to FR-035) |
| The gateway's new cases | `services/gateway/test/**` | the `cloud` stack; `prod-cloud`; the FR-018 refusals; the infra booking and correction; the relay as a trusted peer on cloud only |
| The breach test, grown | `evals/breach.py` on dev-cpu | FR-025: the relay answers degraded within 10 s of the trip, and forwards again after the reset |
| The tunnel's rules | `deploy/tunnel/test_*.py`, two containers on the agents' engine | a forward that isn't permitted is refused; no shell opens; a wrong host key is refused |
| The deployer | `deploy/scripts/test_deployer.py`, with a stub engine | only changed services restart; rollback on failed health; the hold; the record |
| The policy, redaction, plan note, and disclosure checks | `tools/gates/test/*.py` | each rule on fixtures, passing and failing |
| The Lambdas | `infra/lambdas/*/test_*.py` | the message format, no secret in logs, the probe's header, the audit's findings |
| The matrix | `redteam/forbidden-actions.sh` | FR-006's spellings, FR-011's paths and names, and FR-012's files |
| Hello's red-team cases | `redteam/cases/hello-*.yaml` | FR-039: claiming to be the Author or the twin, disparaging, revealing configuration |
| The site's scan | `apps/web/test_site.py` | no other host in the built site; the disclosure page matches the Markdown |
| The visitor scan | `evals/visitor_scan.py` (the Author's run) | SC-011 over every store, after a scripted visit with a marker message |

## 11. Degraded modes

Spec.md's Degraded Modes table holds, with the mechanisms above. This plan adds two rows:

| What is gone | A visitor gets | The operator gets |
|---|---|---|
| The spot VM, interrupted | The site; hello and status get the edge's degraded body (R-08) until AWS has capacity again and the instance restarts on its own | The probe's alert after 5 minutes, and the deployment record when it's back |
| The egress proxy | Hello on the local path works; the fallback answers `fallback_unavailable`; alerts from the cloud stack wait in the outbox | The cloud stack's alert-delivery panel; the AWS-side alerts keep working, because they don't pass the VM |

## 12. Runbooks (FR-056)

New in `docs/runbooks/`:
- the local tier: wake, WSL2 restart, `make up`, the tunnel's recovery, and the local deployer;
- the cloud VM: a spot interruption, a replacement, the egress proxy, a failed deploy and rollback;
- AWS-side alerts: a budget warning or breach, an anomaly, the budget action executed and how to restore it after the incident note, a certificate near expiry, the probe failing, and a credential-audit finding;
- the tunnel: down, revoked, and a key rotation;
- the public view stale;
- the domain's delegation.

Each alert's message names its runbook, as spec 000's do.

## 13. Documentation and ADRs

FR-062's decisions. Each ADR is written in the commit that records the Author's approval of this plan, from its research entry:

| ADR | Decision | From |
|---|---|---|
| 0007 | One AWS account; environments by VM, IAM role, tag, and budget (reserved) | R-01, R-02 |
| 0008 | Terraform with reviewed plans and the Author's recorded apply until publication; the GitHub-side half moved to the publication spec (reserved) | R-13, R-16 |
| 0009 | Pull-based deployment; no inbound ports on the local tier; no self-hosted runners (reserved) | R-17 |
| 0024 | Production's split: the local path, and the fallback gateway holding the meter of record | R-20 |
| 0025 | Infrastructure cost booked on the meter, corrected from AWS's own data | R-21 |
| 0026 | The tunnel: OpenSSH reverse forwards in unprivileged containers, ending on the cloud VM | R-11, R-12 |
| 0027 | The cloud VM: Graviton spot within the idle target; multi-architecture releases | R-04, R-05 |
| 0028 | The public request cap in the relay | R-18 |
| 0029 | CloudFront reaches the relay through a VPC origin on a private interface | R-07 |

ADR 0023 is the Claude Code pin-rule proposal (docs/000-claude-pin-rule), so this spec's new ADRs start at 0024. Also written:
- **START-HERE §3 and §5:** the idle target and the rate-limit mechanism are answered.
- **The README:** links to the ADRs (SC-014's two clicks), the public view, and the disclosure.
- **`infra/README.md`.**

## 14. Order of work, risks, and proof

**Task groups.** Each is a feature branch with a note, merged by the Author in this order.

| # | Branch | What | The Author's part |
|---|---|---|---|
| 1 | `feat/001-guards` | §2's patch; the Terraform pin; `make infra-mirror` | apply the patch; seed the mirror |
| 2 | `feat/001-us1-bootstrap` | `infra/bootstrap`; §1.2's targets and gate step; the credential audit's script; `infra/README.md` | **Before:** make the administrator permission set in Identity Center if it doesn't exist. **Then:** the first plan, verify, and apply; migrate the state; activate the cost tags; confirm the email subscription |
| 3 | `feat/001-us2-safety-net` | `infra/account`: the kill switch, the rehearsal, the three Lambdas, the registry, and the release bucket. The gateway's infra booking (migration 0003). The `budgets.yaml` patch | apply; the Telegram parameters; **the rehearsal (SC-009)**; `rehearsal = false` |
| 4 | `feat/001-us5-cloud-vm` | `infra/prod`'s network, VM, volumes, roles, and parameters; the cloud stack; the relay (not yet public); the egress proxy; cloud-init; releases and the deployer; the gateway's `cloud` stack and `prod-cloud`; local prod drops its fallback; FR-013's role | **Waits for spec 000's SC-001 re-run and SC-002** (interview question 1). **Then:** apply; set the secrets; the first `make release`; `make operator-init ENV=cloud` with carried values; destroy and recreate (SC-005); delete the hand-made identity |
| 5 | `feat/001-us6-tunnel` | the tunnel and `tunnel-end`; the local `edge`'s blocks; the relay's local path; the local deployer; the local-tier runbook | `make tunnel-keys`; start the tunnel; the external scan (SC-006); cut and restore (SC-007) |
| 6 | `feat/001-us3-us4-public` | the zone, the certificate, the distribution and its VPC origin, the site's bucket; `apps/web` and the disclosure's rows; hello's red-team cases; the edge's degraded body; the site's scan; the visitor scan | the name servers; apply; the red-team run; the first public release; **SC-001, SC-010, SC-011** |
| 7 | `feat/001-us7-public-view` | the publisher and sink; `/status/`; the "Cloud" dashboard row | **SC-013:** the local tier off for an hour |
| 8 | `feat/001-close` | the success-criteria table, the runbooks completed, START-HERE and the README; the matrix with zero planned rows | **SC-002 and SC-003** after the first full month; **SC-004** from the audit's history; **SC-012** from the records |

Hello becomes public only in group 6, after the tunnel (group 5), so visitors are answered locally from the first day, and the disclosure is live before the first visitor byte (US4).

**Risks:**

| Risk | Mitigation |
|---|---|
| The thin services don't fit in a t4g.micro's 1 GiB | Measured in group 4 under the breach test's load; a t4g.small is a configuration change, at about $11 a month idle (R-04, R-05) |
| Spot capacity: interruptions, or none in the zone | A stop keeps the disks, and the request restarts the instance; the edge serves the site and its degraded body meanwhile. The runbook moves the request to another zone, which means a snapshot and a new meter volume there |
| CloudFront's error response can't carry `X-H4-Degraded-Cause` | Measured in group 6. If it can't, the cause travels in the body for that one case, and the contract says so (R-08) |
| An application-layer flood bills CloudFront past the free tier | The relay's cap stops it reaching a model; the budgets alert, late; a breaker is the Author's call (R-06) |
| AWS's billing data lags by hours | The meter is the control (FR-024); the correction only ever books upward |
| The VPC origin's second interface misroutes replies | Amazon Linux 2023's per-interface routing; group 4's first test is a request through the origin and a reply |
| arm64 builds of the project's images need emulation on the Author's engine | Only `tunnel-end`'s package install runs under QEMU, installed once (R-04); the Node images copy built JavaScript |
| A provider or Terraform version change between the mirror and the Author's plan | One pin in `toolchain.vars`, the lockfile, and the mirror, checked against each other by `make infra-check` |
| The Author's DNS provider holds the zone | Interview question 4; moving the zone is one name-server change at the registrar |
| Spec 000's open criteria | Interview question 1: group 4 waits for SC-001's re-run and SC-002 |

**Proof.** [quickstart.md](quickstart.md) runs each story in the Author's terminal. Each group's note carries:
- `make check`'s whole output from an agent session, and the gate's summary from the Author's terminal;
- the reviewer's REVIEW.md passes;
- the redacted plan blocks and apply records.

Spec 001 is done when SC-001 to SC-014 pass and the matrix shows zero failures and zero planned rows.

## 15. Requirement coverage

| Requirement | Where | Group |
|---|---|---|
| FR-001, FR-003 | §1.1, R-03 | 2 |
| FR-002 | §1.3, R-14 | 1–2 |
| FR-004 | §1.3, §2 | 1 |
| FR-005, FR-007 | §1.2, R-13 | 2 |
| FR-006, FR-011, FR-012 | §2, R-14, R-16 | 1 |
| FR-008, FR-009, FR-010 | §1.4 | 2–4 |
| FR-013 | §6.4, R-15 | 4 |
| FR-017, FR-018, FR-019 | §3.3, R-20 | 4 |
| FR-020 | §3.3, R-21 | 3 |
| FR-021 | R-04, R-05 | 4 (measured), 8 (SC-002) |
| FR-022 | §3.1, R-22 | 2 |
| FR-023, FR-026 | §3.2, R-22 | 3 |
| FR-024 | §3.3 (the meter stays the control) | 3 |
| FR-025 | §4.2, §10 | 4 |
| FR-027, FR-028, FR-029, FR-034 | §4.1, R-07 to R-09 | 6 |
| FR-030 to FR-033, FR-035, FR-037 | §4.2, R-18 | 4 (code), 6 (public) |
| FR-036, FR-038 | §8.1 | 6 |
| FR-039 | §7.1, §10 | 6 |
| FR-040, FR-041, FR-042 | §8.1, §8.2 | 4–6 (each flow's row with its change) |
| FR-043, FR-044, FR-045 | §6.5, §5.4 | 4–5 |
| FR-046 to FR-049 | §7, R-17 | 4–5 |
| FR-050 | §6.1 | 4 |
| FR-051 | §6.3, R-10 | 4 |
| FR-052 to FR-055 | §5, R-11, R-12 | 5 |
| FR-056 | §12 | 2–8 |
| FR-057 to FR-059 | §8.3, R-19 | 7 |
| FR-060 | §9, R-25 | 4–7 |
| FR-061 | §3.4, R-24 | 3 |
| FR-062 | §13 | approval |
| SC-001 | quickstart §6 | 6 |
| SC-002, SC-003 | quickstart §8 | 8 |
| SC-004 | §1.4 | 8 |
| SC-005 | quickstart §4 | 4 |
| SC-006, SC-007 | quickstart §5 | 5 |
| SC-008 | §10 (the breach test) | 4 |
| SC-009 | quickstart §3 | 3 |
| SC-010, SC-011 | quickstart §6 | 6 |
| SC-012 | §1.2 | 2–8 |
| SC-013 | quickstart §7 | 7 |
| SC-014 | §13 | 8 |

## Constitution Check (post-design)

Re-checked against the design above:
- **No new violation.**
- **Principle IV is stronger than the spec required in four places:**
  - containers can't reach the instance's metadata;
  - the gateway's Bedrock permission sits on a role only a host timer assumes;
  - the tunnel's server refuses any forward it doesn't list;
  - CloudFront is the only route to the relay.
- **Principle I's one trade:** CloudFront to the relay runs as HTTP inside AWS's network (R-07). The disclosure says so, and interview question 2 asks the Author.
- **The guards come first:** they land in group 1, before any `infra/` file, state, or key exists, following spec 000's rule for when a deny lands.
- **Deviations, named in the spec's Assumptions:**
  - the Author's terminal apply (ADR 0013), with its record;
  - the CI-side supply chain (ADR 0014);
  - image variants (ADR 0015), unchanged.

Verdict: **PASS**.

## Complexity Tracking

| Deviation or risk | Why needed | Simpler alternative rejected because |
|---|---|---|
| The Author applies from their own terminal, not a protected environment (ADR 0013) | No CI before publication | Waiting for publication would leave the site without its safety net |
| Two network interfaces on the VM | A VPC origin needs a private subnet; the tunnel and the egress need a public address (R-07) | A public origin needs a shared secret in Terraform's state, or a key-value store, plus a certificate on the VM |
| Multi-architecture releases | Graviton halves the interruption rate at the same price (R-04) | x86 everywhere: one architecture, two to three times the interruptions |
| Host services outside compose (the deployer, the egress proxy, the credential timer) | Each needs the Docker socket, the host's firewall, or the instance role, which the compose policy keeps out of containers | Running them in containers would need `docker.sock` or host networking, which spec 000 refuses |
| CloudFront to the relay as HTTP inside AWS's network | The VPC origin's address has no public certificate name | TLS to the origin needs a public origin (above) |
| The CI-side supply-chain controls wait (ADR 0014) | They need GitHub | Pins, digests, and the local gate stand in |
