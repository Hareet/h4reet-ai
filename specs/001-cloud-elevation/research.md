# Research: Cloud Elevation (spec 001), re-planned for EC2 as prod's default host

Phase 0 output of `/speckit-plan`, **drafted on 2026-11-09 for the Author's review**, for spec 001 as reworked and clarified on 2026-11-09 (spec.md, at b2ea2765). It replaces the September research. Each entry gives the decision, why, and what else was weighed. An entry carried from the September research cites it as "September R-nn", meaning `research.md` at commit 00309c47, and says what changed. The plan's [Questions for the Author](plan.md#questions-for-the-author) name the entries they would change.

**Prices.** No AWS pricing page was read for this draft: agent sessions can't fetch them. Every figure below is one the repository already holds, with the date it was read, and each is marked **to confirm**. Most come from September R-04 and R-05, read on 2026-10-18 from AWS's pages and, for spot, from third-party trackers. A line the repository has no price for is marked **to price**: the Author's terminal prices it before he sets the server budget's figure (spec question 14, "Measure, then you set it"). This file writes no new figure.

**Two sentences quoted from web-search summaries, not from AWS's pages**, carry over from September: the AWS Budgets free-tier sentence (R-05) and the VPC origins' sentence (R-07). The first infra task re-reads both pages from the Author's terminal.

**What is measured, not estimated.** The stack's memory without the model server, and whether every pinned image has an arm64 build, are measured by a task (R-04, R-33). The session's "about 8 GB" stays an estimate, and nothing here relies on it.

## Index

| Entry | Subject | Status |
|---|---|---|
| R-01 | One region, us-east-1 | carried |
| R-02 | Terraform, pinned, in three roots | changed |
| R-03 | State in S3 with S3's own lock | carried |
| R-04 | The instances: EC2 measured, the tunnel end small | changed |
| R-05 | The cost lines | changed |
| R-06 | No breaker that switches the edge off | carried |
| R-07 | How the edge reaches the serving host | changed; plan question 1 |
| R-08 | The edge's own degraded answer | changed |
| R-09 | The zone in Route 53 | settled by the spec |
| R-10 | Egress through an allowlisting proxy | carried, on two hosts |
| R-11 | The tunnel: OpenSSH, ending on the tunnel end | changed |
| R-12 | The relay block and the health block on each host's `edge` | changed |
| R-13 | The plan in the note, and the apply record | carried |
| R-14 | Offline checks and the policy | carried, grown |
| R-15 | The identities | changed |
| R-16 | Refusing Terraform's state-changing commands | carried, grown |
| R-17 | Releases and the deployers on three hosts | changed |
| R-18 | The relay on the tunnel end | changed; plan question 1 |
| R-19 | The public view | changed |
| R-20 | The shared state in RDS for PostgreSQL | replaced |
| R-21 | Infrastructure on the meter | dropped (spec FR-020) |
| R-22 | The budgets and the two automatic actions | changed |
| R-23 | AWS-side alerts through a bridge | carried |
| R-24 | The uptime probe | carried |
| R-25 | Telemetry across the hosts | changed |
| R-26 | Secrets outside Terraform | carried, grown |
| R-27 | The route per host, and rule R1 | new |
| R-28 | How each host knows which one it is | new |
| R-29 | The health check and the start function's trigger | new |
| R-30 | Spot with interruption behavior "stop", and the guard | new |
| R-31 | The handover sequence and its windows | new |
| R-32 | The operator's commands | new |
| R-33 | The measurement task | new |

---

## Account, Terraform, and the records

### R-01: One region, us-east-1 (carried)

**Decision.** Everything that has a region runs in us-east-1: EC2, the tunnel end, RDS, the network, the registry, the buckets, the functions, the SNS topic, and the parameters. Carried from September R-01: CloudFront's certificate must be in us-east-1; the Bedrock inference profile is called from us-east-1 (`config/routing.yaml`); the spec's Out of scope excludes "more than one AWS region for the stack". The Anthropic API is not an AWS service and has no region here.

### R-02: Terraform, pinned, in three roots (changed)

**Decision.** As September R-02: Terraform and `hashicorp/aws` pinned in `.devcontainer/toolchain.vars`, each root's `required_version`, and its lockfile; the versions chosen in the first infra task from the Author's terminal; no other provider; environments by root, not by workspace; `default_tags` with `project` and `environment`, and `component` on every resource. What each root holds changes:
- **`infra/bootstrap`:** the state bucket; the model-spend budgets and the server budget (R-22); the anomaly monitor; the `h4-alerts` topic and its email subscription. Applied first (FR-003, FR-022).
- **`infra/account`:** the two budget actions and their rehearsals (R-22); the alert bridge, the probe, and the credential audit (R-23, R-24); the start function and the guard, their EventBridge rules, and the autostart switch's parameter (R-29, R-30); the probe's and the audit's EventBridge schedules, in the protected `alerts.tf` (rule T5); the registry and the release bucket.
- **`infra/prod`:** the VPC and its subnets; the tunnel end (R-04, R-11); RDS (R-20); EC2 and its spot request (R-04, R-30); the Route 53 zone, the certificate, the health check and its alarm (R-29); the edge and the site's bucket (R-07); the roles (R-15).

**The versions, pinned in group 1 (tasks.md T008),** for the Author's "Use the latest dependenices adn versions for aws services, plugins" (T000, 2026-11-10):

| What | Pinned | Released | Source | Status |
|---|---|---|---|---|
| Terraform | 1.17.1 | 2026-10-28 | the main session's web search, 2026-11-10, of endoflife.date's Terraform page (endoflife.date/terraform); the Author confirms at T011 | `TERRAFORM_VERSION` |
| `hashicorp/aws` provider | 6.72.0 | 2026-11-04 | the main session's web search, 2026-11-10, of the provider's GitHub releases page (github.com/hashicorp/terraform-provider-aws/releases); the Author confirms at T011. Latest at 2026-11-10: it releases weekly, so recheck at T011 | `TERRAFORM_AWS_PROVIDER_VERSION` |
| Lambda runtimes | `python3.14` and `nodejs24.x`, on arm64 | listed on 2026-11-10 | the main session's web search, 2026-11-10, of AWS's Lambda runtimes page (docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html); the Author confirms at T011. Node.js 26's runtime may be live but isn't confirmed; 24 matches the repository's Node 24 | group 4 pins each base image by digest |
| AWS CLI v2 | 2.29.1 | — | the repository: the host's version on 2026-10-07 (`docs/merge-requests/2026-10-07-chore-repo-hygiene.md`; spec 000's tasks.md T104) | `AWS_CLI_VERSION`; the latest is to confirm, and a newer pin is his to choose |
| Session Manager plugin | — | — | the repository holds no version | to confirm |
| `python-hcl2` | not added | — | the gates read HCL with their own standard-library reader (R-14) | — |

**Why.** The safety net is applied first and alone, as FR-022 asks. The handover's functions sit with the account's other functions, so they don't share a root with the instances they act on, and a plan of `infra/prod` can't silently widen them.

### R-03: State in S3 with S3's own lock (carried)

**Decision.** September R-03 unchanged: a versioned, encrypted, never-public bucket with a TLS-only policy; Terraform's S3-native lock file; one key per root; bootstrapped from a local state in `~/.config/h4reet-ai/infra/`, then migrated by the Author (`-migrate-state`, refused to agents, FR-006).

### R-13: The plan in the note, and the apply record (carried)

**Decision.** September R-13 unchanged. `make plan ROOT=<root>` in the Author's terminal runs the policy on the HCL first, then `init` and `plan -out`, and prints a redacted block tied to the `infra/` tree hash. The gate's `infra-plan-note` step checks the note. There is no `make apply`: the Author runs `make infra-verify`, applies the saved plan with Terraform directly, and `make infra-record` writes the record on `ops/apply-<root>-<date>`. September's interview question 5 (the record's branch) is settled as recommended: the record arrives like any other note, which the Author merges.

### R-14: Offline checks and the policy (carried, grown)

**Decision.** September R-14: a provider mirror the Author seeds (`make infra-mirror`, into `~/.local/share/h4reet/terraform-providers`); `make infra-check` runs `fmt`, `validate`, and `tools/gates/infra_policy.py` offline, `init` reading that mirror alone; the policy reads HCL with its own standard-library reader, not `python-hcl2` (group 1's departure, plan §2), and refuses (T0) a file it can't read; the Author's `make plan` runs the policy on the HCL before `init` and on the saved plan's JSON after. Its rules grow with FR-012's longer list. These resource types live only in protected files:
- IAM, budgets and budget actions, SNS, CloudWatch alarms, and EventBridge rules (as before), the probe's and the credential audit's schedules among them (`alerts*.tf`);
- CloudFront's policies (`edge-limits*.tf`);
- the Route 53 health check and the failover's alarm (`failover*.tf`);
- the start function, the guard, and their permissions (`handover*.tf`);
- the autostart switch's parameter (`handover*.tf`);
- EC2's spot and market options (`ec2-market*.tf`).

The policy also refuses an EC2 instance whose market options aren't spot with `instance_interruption_behavior = "stop"` (R-30), and any security group rule open to the world except the tunnel's port on the tunnel end (R-11). Ingress from Route 53's health checkers on the tunnel end's health port (R-29) is the one other non-AWS-service source it allows.

### R-16: Refusing Terraform's state-changing commands (carried, grown)

**Decision.** September R-16's rules and spellings, unchanged. The Author-only make targets grow with R-32's: `ec2-start`, `ec2-stop`, `ec2-autostart`, `operator-* ENV=shared` (`operator-restore` among them), `cloud-session`, `server-budget-restore`, `shared-state-roles`, `release`, `rollback`, `tunnel-keys`, `tunnel-revoke`, `secrets-check`, `infra-verify`, `infra-record`, `infra-mirror`, and `aws-login`. They are refused in an agent session, in every spelling the gate already covers, with matrix rows.

---

## The hosts

### R-04: The instances: EC2 measured, the tunnel end small (changed)

**EC2, the stack's host.**
- **Size:** the smallest instance type that holds the measured stack without the model server with headroom (R-33). The measurement, not the session's estimate, decides it, and the Author's figure bounds it (spec question 14).
- **Architecture:** Graviton (arm64) if every image the stack runs has an arm64 build, which R-33 checks; x86-64 otherwise. September R-04's reasons for Graviton hold: a lower interruption rate on the trackers it cited (2026-10-18, to confirm) and multi-architecture releases (R-17).
- **Credits:** if the chosen type is burstable, standard credits, as September R-04 required: a busy instance slows down instead of billing surplus credits.
- **Market:** spot, persistent, stopping on interruption (spec question 15; R-30).
- **Storage:** an encrypted gp3 root volume, and a data volume for Langfuse's stores, Prometheus, and Loki, both kept while EC2 is stopped. Their sizes come from R-33.
- **Network:** one interface in a public subnet, with an address AWS assigns at each start, used only for egress through the proxy (R-10). No inbound rule except the relay block's port from the tunnel end's security group (R-12). An auto-assigned address is released while the instance is stopped (to confirm), so EC2 holds no fixed address.

**The tunnel end.**
- **Size:** `t4g.micro` (arm64, 1 GiB), the size September R-04 chose for thin services. Its own services are smaller than September's VM's: no gateway and no store (R-20). R-33 measures it too.
- **Market:** spot, the Author's answer to plan question 2 ("Spot": "AWS can take it back, and while it's gone the site rests, even if the laptop or EC2 is up"). A persistent request that stops on interruption, as EC2's (R-30). The plan had recommended on demand, since every dynamic request passes through it (question 1).
- **Network:** two interfaces, as September's VM had (September R-07): a private one in a private subnet for CloudFront's VPC origin, and a public one with an Elastic IP for the tunnel's port and the health port.
- **Root volume:** encrypted gp3, 8 GiB (September R-05's size, to confirm).

### R-28: How each host knows which one it is (new)

**Decision.** A new environment key, `H4_HOST`: `laptop` in the laptop's prod env file, `ec2` in EC2's, `tunnel-end` on the tunnel end, and `laptop` on dev and dev-cpu.
- **`H4_STACK` stays `prod` on both production hosts.** The shared store has one `stack_state` row, `CHECK (stack IN ('prod', 'dev', 'dev-cpu'))` (spec 000's `0001_state.sql`). Both hosts' gateways therefore read and write the same row, and the kill switch is one switch. That is the spec's "a reading of `prod`" (Scope).
- **EC2's env file** is written at boot by its host script from Parameter Store, on the instance itself, with `H4_HOST=ec2`. Its preflight confirms through the instance metadata service (IMDSv2, from the host) that it runs on the instance tagged `h4-prod-ec2`. On the laptop no such service answers, so `H4_HOST=ec2` refuses to start there (exit 78).
- **The laptop's preflight** refuses `H4_HOST=ec2` or `tunnel-end`.
- **The gateway** reads `H4_HOST` to select its route (R-27), to label its spans and ledger rows (data-model.md §1.2), and to refuse a mismatch: `ec2` with a model-server profile, or `laptop` without one.
- **The tunnel end** runs no gateway. Its preflight class selects only `tunnel-end`, `relay`, `snapshot-sink`, and the collector.

**Why.** One key, checked at start against something the host can't fake by configuration, is the smallest change to spec 000's environment contract. A stack name per host would split the kill switch's row, which decision 7 forbids.

**Alternatives.** A third stack name, `cloud` (September R-20): it would need a second `stack_state` row, or a row shared under two names, and the gateway's check "one of the three, and agrees with `H4_ENV`" grows either way.

### R-33: The measurement task (new)

**Decision.** Before the Author sets the server budget, the plan's first measuring task (group 2) does the following:
- **Memory:** run the production topology without the model server on the agents' engine (`dev-cpu`, its CPU model server stopped) under a scripted load: hello and twin turns at the public cap, against a stub paid adapter. Record each service's peak resident memory with `docker stats`, over a run long enough for ClickHouse's merges and Loki's compaction to show. The Author repeats it on the laptop if he wants a second figure.
- **Architectures:** read each pinned image's index in `deploy/images.lock` (`docker buildx imagetools inspect`, offline against the seeded store) and list which have `linux/arm64`.
- **The tunnel end:** the same measurement for its four services.
- **Disks:** the data volumes' sizes after the run.

The record goes in this file under R-33 and in the group's note. The Author prices from it (spec question 14).

---

## The paths

### R-07: How the edge reaches the serving host (changed; plan question 1)

**The constraint.** The spec as first reworked moved visitors between the hosts by DNS: failover records were to answer the dynamic origin's name with the laptop's path or EC2's. CloudFront reaches an origin either by a public name, or through a VPC origin, which is bound to one resource, not to a name. So DNS can switch between public origins only. Public origins bring three costs:
- the visitor's request crosses the internet between CloudFront and the origin, so TLS is needed to each origin, with a certificate for the origin's name on both the tunnel end and EC2;
- that certificate comes from a public certificate authority through a DNS challenge, which gives each host write access to a Route 53 record and adds a third party;
- a secret header is needed to tell this distribution from any other CloudFront distribution, since CloudFront's origin-facing addresses are shared by all of them. That secret must stay out of Terraform's state (FR-009).

**Decision, the Author's answer to plan question 1** ("Relay picks the host (Recommended)", 2026-11-09). The relay runs on the tunnel end (R-18), which CloudFront reaches as its one VPC origin, on the tunnel end's private interface, as September R-07 had it for the VM. The relay sends each request to the serving host: the laptop through the tunnel, EC2 through the VPC. Route 53's health check stays, as the independent detector that fires the start function (R-29). The failover records aren't needed for visitors' traffic.

**Why.** It keeps September R-07's properties: the relay has no public address, nothing outside this distribution can reach it, no secret is in the state, and no certificate or third-party authority is needed. It needs no runtime DNS change at all. The relay sees a host fail within a second (R-18), rather than after the health check's detection time plus a record's time to live. It is also what the title of the Author's question 13 option names: "Tiny always-on relay".

**The trade.** Every dynamic request now passes through the tunnel end, so its outage rests the twin even while EC2 runs. The Author chose spot for it all the same (plan question 2; R-30). Point 1's "Route 53 can switch DNS by itself" changes in one part: the health check and the start function stay, but the relay, not DNS, moves visitors. The spec's wording changed with his answer (plan.md §13).

**Alternatives.**
- **B, the spec as written:** failover records for `api-origin.hareet.ai`, the tunnel end's and EC2's public addresses as primary and secondary, TLS to each, and a secret origin header kept in a CloudFront key-value store the Author writes. That means more parts: two certificates, a third-party authority, DNS write access from both hosts, a key-value store, and EC2 needs a fixed public address. The tunnel end stays out of EC2's path.
- **C, CloudFront picks the origin:** a CloudFront Function reads which host serves from a key-value store the handover writes, and selects one of two VPC origins. Traffic stays private and no relay sits in EC2's path. But it relies on origin selection from a function, a feature to confirm, and the handover writes the store at run time.

**Caveat carried from September:** the VPC origins sentence ("In the private subnet, launch an Application Load Balancer, a Network Load Balancer, or an EC2 instance to use as your origin.") is a web-search summary of AWS's guide, to re-read from the Author's terminal.

### R-08: The edge's own degraded answer (changed)

**Decision.** When CloudFront can't reach the relay, its custom error responses turn the origin's 502 and 504 into a 503 carrying spec 000's degraded body with the cause `no_host_serving`, served from the site's bucket (`/_degraded/api.json`). The minimum error-caching TTL is 0. The relay itself answers `no_host_serving` while it is up and no host serves (R-18). Whether a CloudFront Function can add `X-H4-Degraded-Cause` to an error response is still to measure (September R-08); if not, the cause travels in the body for that case. Spec 002's contract maps `no_host_serving` to "local tier off", so the room shows `cannot_talk.resting` (spec FR-066).

### R-11: The tunnel: OpenSSH, ending on the tunnel end (changed)

**Decision.** September R-11's design, ending on the tunnel end instead of the VM (spec question 13, "using September's OpenSSH tunnel design"):
- **`tunnel`** on the laptop's prod: OpenSSH's client, unprivileged, no capabilities, read-only root. It opens one connection to the tunnel end's Elastic IP on one TCP port and reconnects with backoff (1, 2, 5, 10, 30 s), with a keep-alive every 10 s and a dead link given up after 3 missed. Its forwards:
  - `-R 2201` → the laptop `edge`'s relay block, 8085 (visitors' requests, from the relay);
  - `-R 2202` → the laptop `edge`'s telemetry block, 8086 (the tunnel end's collector, R-25);
  - `-R 2203` → the laptop `edge`'s health block, 8087 (Route 53's health check, R-29);
  - `-L 5432` → RDS's endpoint, port 5432 (the shared state, R-20);
  - `-L 2301` → `snapshot-sink:8080` (the public view, R-19).
- **`tunnel-end`** on the tunnel end: OpenSSH's server, unprivileged, with public-key authentication only and one authorized key. The host key is pinned on the laptop's side, and `MaxSessions 0` allows no shell. `PermitListen` allows exactly 2201, 2202, and 2203, and `PermitOpen` exactly RDS's endpoint on 5432 and `snapshot-sink:8080`. `GatewayPorts clientspecified` lets the listens bind the container's interface, so the relay and the published health port reach them.
- **Its port** is published on the public interface; the security group admits that one port from anywhere, because the laptop's network address changes.
- **Keys:** `make tunnel-keys` (the Author) makes the client key and the host key. The client key and the pinned host key stay in `~/.config/h4reet-ai/tunnel/`, denied to agents. The host key and the client's public key go to Parameter Store, written by the Author, never by Terraform (R-26). `make tunnel-revoke` empties the authorized key and restarts `tunnel-end` through a Systems Manager command.

**Why.** September R-11's reasons hold: no capabilities, `PermitListen` and `PermitOpen` as the least reach, and the tunnel ends in the account with no third party (FR-052). The two forwards September didn't have, to RDS and to the health block, follow from R-20 and R-29.

### R-12: The relay block and the health block on each host's `edge` (changed)

**Decision.** Each host's `edge` (spec 000's nginx) gains the same unpublished server blocks, so the relay talks to both hosts the same way:
- **8085, the relay block:** accepts `POST /hello`, `POST /room/turn`, `POST /room/events`, and `GET /health` to `gateway:8080`, and nothing else. It requires `Authorization: Bearer` with the relay's token for that host. After the token check, it moves the relay's `X-H4-Viewer` into the one `X-Forwarded-For` value it sends on, and keeps the trace context. On the laptop, the tunnel reaches it. On EC2 it is published on EC2's private address, and the security group admits only the tunnel end.
- **8086, the telemetry block** (the laptop only; EC2's collector is reached in the VPC): OTLP in, with its own token (R-25).
- **8087, the health block** (the laptop only): `GET /health` and nothing else, with no token. Route 53's checkers can't send one (to confirm in the first task; spec FR-053's conditional). It answers 200 or 503 with an empty body: 200 while the laptop's relay block would serve, meaning its gateway is up and the shared state is readable (spec FR-054).

**Why.** One block, two transports. The relay needs no per-host logic beyond the address and the token. The health block carries nothing but the status, so leaving it unauthenticated exposes nothing (FR-053).

### R-18: The relay on the tunnel end (changed; the Author's answer to plan question 1)

**Decision.** `services/relay`, as September R-18 (Fastify 5 on Node 24, a second npm workspace), runs as a container on the tunnel end. Its order at each request:
1. **The probe mark**, as September.
2. **The client's address** from `CloudFront-Viewer-Address`, on the edge listener only; a request without it is refused (FR-032).
3. **The public cap** (FR-033), in memory, per address, sized by `config/budgets.yaml`'s `public` section, the Author's figures (P-6). It lives on the tunnel end, so it survives handovers; it restarts empty after a spot interruption of the tunnel end.
4. **The kill switch**, read from the shared state (R-20) as `relay_ro`, `statement_timeout=250ms`. Degraded, unknown, unreadable, or not confirmed in 10 s: the degraded response (FR-030).
5. **The host:** the laptop while its relay block is healthy, else EC2 while its relay block is healthy, else `no_host_serving` (spec FR-063, FR-066). Each host is checked with `GET /health` every second, with an 800 ms timeout; unhealthy after one failure, healthy after three passes in a row (spec 000's rule). A request that fails on one host before any byte of the answer is retried once on the other, if it is healthy.
6. **The identity** goes on as `X-H4-Viewer`, which the host's relay block turns into `X-Forwarded-For` (R-12).

It answers `GET /api/status` itself (FR-037), with the serving host, EC2's state from the last read (R-29), the kill switch, and the cause a hello would get. It writes each change of serving host to the shared state's `handover_events` (data-model.md §1.3), as `relay_rw`, which may insert there and nowhere else.

**Why.** The relay holds the cap, the kill switch read, and the host choice in one place that runs around the clock. The status answer stays live while no host serves. The Cloud standard lists the relay among what "must be always-on", and on spot it has gaps: plan question 8 asked the Author how to carry that; the session takes option A provisionally under its reading of his approval at T000, the wording in the 1.1.0 patch his to write or confirm at T001.


### R-10: Egress through an allowlisting proxy (carried, on two hosts)

**Decision.** September R-10's host proxy and nftables chains, on EC2 and on the tunnel end. Each allowlist is generated from the disclosure's rows for that host:
- **EC2:** the Anthropic API (F3), Bedrock (F1), Telegram and the SMTP host (A1, A2), and the AWS endpoints it uses: ECR, S3, Systems Manager, STS, Budgets, and SNS, to publish its alerts to `h4-alerts` (C7). RDS is reached inside the VPC.
- **The tunnel end:** ECR, which its deployer pulls from; S3; Systems Manager; STS; Budgets; EC2's describe calls; SNS, to publish its alerts to `h4-alerts` (C7); and, for the dashboard's reads, Route 53's health-check status and CloudWatch's metric reads (plan §11). RDS and EC2 are reached inside the VPC.

### R-27: The route per host, and rule R1 (new)

**Decision.** `config/routing.yaml`'s `envs.prod` becomes a route per host, selected by `H4_HOST` (R-28):

```yaml
envs:
  prod:
    hosts:
      laptop: { primary: local, fallback: anthropic }  # ADR 0001's order, the $2 sub-budget; as main's prod route names it
      ec2:    { first: anthropic, second: bedrock }    # the ceilings and the adapter caps; the Author's line (ADR 0041)
  dev: { primary: local, fallback: synthetic }
```

The laptop's line keeps whatever prod's route names on `main` when group 6 starts. That is `anthropic` once `feat/010-anthropic-switch` has merged, which carries the Author's switch and his words in row F3, and which reaches `main` before group 6. Group 6's agents write schema 2 with the laptop's line only. The `ec2` line, which names the Anthropic API first, is the Author's own step in group 7: ADR 0041 makes the route change his.

- **Rule R1** (spec 000's contracts/config-files.md, `services/gateway/src/config/validate.ts`) becomes: "every `primary` is local; a route with `first` names no local adapter, only paid ones, and exists only under `envs.prod.hosts.ec2`". Spec 010's FR-001 is amended by name to match.
- **Attribution:** calls on the `ec2` route are attributed `metered`, which spec 000's ledger and reservations already accept (`CHECK (attribution IN ('fallback','metered','test'))`). So they count against the day and month ceilings and the adapter's month, and never against `fallback_day`, the sub-budget (the Author's answer, "The $2-a-day sub-budget stays the laptop's fallback rule"). Calls on the laptop's fallback stay `fallback`. No schema change is needed for this.
- **The order on EC2:** the kill switch first, then the Anthropic API while it is healthy and admitted (the ceilings, then its cap, `adapter_month_spent`), then Bedrock under the same admission, then degraded with the condition that applied.
- **Spec 010's preconditions** hold for the `ec2` route as for a `fallback: anthropic`: the price (in `config/prices.yaml` since version 2026-11-09.1, "read 2026-11-09"), the cap (`adapter_monthly_usd: { anthropic: 20.00 }`), the key (on EC2, in Parameter Store, R-26), and the Author's words in row F3, adopted on 2026-11-09 on `feat/010-anthropic-switch`. `evals/test_disclosure.py`'s `placeholder_gate` reads only `envs.prod.fallback` today; group 6 makes it read every host route's `first`, `second`, and `fallback`, test-first, so `make test` refuses F3's placeholder whichever host route names the adapter.

**Why.** The smallest schema change that states the two orders, keeps local-first wherever a local model runs, and reuses the existing attributions.

**Alternatives.** Two env names, `prod` and `prod-ec2`, selected by `H4_ENV`: it would split `H4_ENV`, which also selects the thresholds and the dev-only switches, and both hosts' budgets must stay one (`config/budgets.yaml`'s `envs.prod`).

### R-20: The shared state in RDS for PostgreSQL (replaced)

**The need.** One store for prod's meter and kill switch that both hosts use, that runs whether or not either host does, and that outlives both (spec FR-017, FR-019). It can't live on EC2, which is stopped while the laptop serves, nor on the laptop.

**Decision.** Amazon RDS for PostgreSQL, single instance, holding spec 000's `gateway` schema unchanged plus migration 0007 (data-model.md §1). Its settings:
- **Engine:** PostgreSQL 17, matching spec 000's `postgres:17.11-alpine3.24` (`deploy/images.lock`), at the newest 17 minor RDS offers.
- **Class:** the smallest Graviton class RDS offers (to price).
- **Placement:** single-AZ, in two private subnets (RDS's subnet group needs two zones); no public access.
- **Storage:** encrypted gp3, at RDS's minimum size.
- **Recovery:** automated backups kept 7 days, deletion protection, and a final snapshot.
- **Connections:** `rds.force_ssl` on. The security group admits 5432 from EC2's and the tunnel end's security groups only.
- **The master password:** managed by RDS in Secrets Manager (`manage_master_user_password`), so Terraform never holds it (FR-009). September R-26 put Secrets Manager at about $0.40 a secret a month (2026-10-18, to confirm).

How each reaches it:
- **EC2's gateway:** inside the VPC, TLS verified against RDS's certificate authority (the bundle pinned in the gateway's image), with the endpoint's name.
- **The laptop's gateway:** through the tunnel's `-L 5432` forward (R-11), TLS inside the tunnel, verified the same way. The client is given the endpoint's name as the server name, since it connects to `tunnel:5432`.
- **The relay** on the tunnel end: inside the VPC, as `relay_ro` and `relay_rw`.
- **Grafana on each host:** as `grafana_ro`, as today.

The rules that make two writers safe are already in spec 000's code: migrations take an advisory lock (`services/gateway/src/meter/store.ts`), initialization takes a transaction lock (`meter/init.ts`), and the alert dispatcher claims outbox rows `FOR UPDATE SKIP LOCKED` (`alerts/dispatcher.ts`). A task proves admission and the rollover sweep with two gateways on one store (plan §10). Unreachable or unconfirmed is unknown, so degraded, on each host (spec FR-019).

**The move.** The store starts empty, so both hosts stay degraded (FR-019). Before the cutover, the laptop's prod stops its paid route, so no spend lands on the old meter after the reading. The Author reads the old meter (`make operator-status ENV=prod`) and initializes the shared one with the carried values (`make operator-init ENV=shared`, R-32): the month's and the day's spend, today's fallback spend, the crossed ceilings, the renewal flag, and the Anthropic adapter's month. Nothing starts at zero.

**Why.** It runs spec 000's schema and transactions as they are, so the meter's logic and its tests carry over, and Grafana's reads keep working. It runs apart from both hosts, and its backups outlive any one instance.

**Alternatives.**
- **DynamoDB:** pay per request, likely cheaper at this traffic (to price). But the meter's admission, reservations, ledger, outbox, and audit would need a second store implementation, and Grafana's panels would need rework.
- **Postgres on the tunnel end:** no new line, but it puts the meter on one small instance that runs on spot (plan question 2), so an interruption would take the meter away from EC2 too, and it adds a store to an instance the spec keeps to the tunnel, the relay, the sink, and a collector (spec Terms).
- **Aurora Serverless:** a cold resume at request start, against the 10-second kill-switch rule.

If the Author's price check puts RDS's line out of proportion to the server budget, DynamoDB is the alternative to return to, with its rewrite.

---

## The handover

### R-29: The health check and the start function's trigger (new)

**Decision.**
- **The check:** a Route 53 health check, HTTP, on the tunnel end's Elastic IP, at the published health port, path `/health`. It reaches the laptop's health block through the tunnel (R-11, R-12), so it fails if the tunnel end, the tunnel, or the laptop's stack fails (spec FR-054). It uses Route 53's standard interval and a failure threshold of 3 (both to price and to confirm). The tunnel end's security group admits the health port only from Route 53's health-checker address ranges, as AWS publishes them (to confirm the form).
- **The alarm:** a CloudWatch alarm on the health check's `HealthCheckStatus` (published in us-east-1), in alarm below 1, with missing data treated as failing. September R-05 priced an alarm at $0.10 a month (2026-10-18, to confirm).
- **The trigger:** an EventBridge rule on the alarm's change into the alarm state invokes `h4-ec2-start`, a Lambda function packaged as a container image (stdlib Python, as September's Lambdas), in `infra/account`. One alarm change, one invocation: no loop (spec FR-065). The function:
  1. reads the autostart switch, the String parameter `/h4reet/prod/ec2-autostart` (`on` lets EC2 start automatically, `off` doesn't); `off` refuses, with the code `paused`;
  2. reads the server budget's action status (`budgets:DescribeBudgetActionsForBudget`); executed refuses;
  3. reads the tunnel end's state (`ec2:DescribeInstances` on its tag); not running refuses with `tunnel_end_down`, since no visitor could reach EC2 (plan question 2);
  4. calls `ec2:StartInstances` on the instance tagged `h4-prod-ec2`, and nothing else;
  5. publishes the outcome, started or refused and why, to `h4-alerts`, which reaches Telegram and email (R-23).
- **Invoked by hand too:** `make ec2-start` and `make ec2-autostart STATE=on` invoke it (R-32), with the same checks, plus one more: it refuses while the health check is healthy, since the laptop then serves.
- **A second trigger:** an EventBridge rule on the tunnel end entering `running` invokes it once, with the health-check test too. The alarm stays in alarm through a tunnel-end outage, so it wouldn't change again; this run starts EC2 if the laptop isn't serving. Its health-check read can still show the outage while the laptop's tunnel reconnects, so it may start EC2 though the laptop is about to serve. That is accepted rather than delayed: once the relay serves the laptop, the laptop's loop stops EC2 within the handover window (spec FR-063), and SC-016 counts the minutes. A delay would need a schedule or a waiting function, and a laptop that doesn't come back would leave the twin resting longer.
- **The default state.** EC2 is the default host, so the alarm is in the alarm state whenever the laptop isn't serving, and the function fires only on the laptop's departure. EC2 is started or stopped otherwise only by the laptop's stop, the guard (R-30), AWS's interruption and restart, the server budget's action, or the Author's own `make ec2-start` and `make ec2-stop`.

**Why.** Point 1's mechanism ("a Lambda, fired when that health check fails, to start EC2"), with the health check probing through the tunnel end as question 13's option said. EventBridge, rather than an SNS subscription, invokes the function with no topic to manage.

**Alternatives.** The relay starting EC2: it would put an infrastructure permission on the public-facing instance. A schedule polling the laptop (the Author's 2026-10-12 scenario, "an endpoint is available that Lambda polls"): slower, and it adds a schedule.

### R-30: Spot with interruption behavior "stop", and the guard (new)

**Decision.**
- **EC2** is a persistent spot request with `instance_interruption_behavior = "stop"` (spec FR-069, question 15). On an interruption, AWS stops it and keeps its volumes, and starts it again when capacity returns (to confirm against AWS's guide in the first task). A stop by the laptop or the Author is a user stop, after which AWS does not restart the instance on its own (to confirm).
- **The interruption notice:** an EventBridge rule on "EC2 Spot Instance Interruption Warning" for that instance publishes to `h4-alerts` (spec FR-071, "You get an alert"). Visitors get `no_host_serving` until EC2 serves again or the laptop does (R-18).
- **The tunnel end** is a persistent spot request with the same interruption behavior (the Author's answer to plan question 2). Its warning publishes `tunnel_end_interruption` to `h4-alerts`, and its return publishes `tunnel_end_back`. While it is gone, the edge's own body answers (R-08), and the start function refuses (R-29). Its Elastic IP stays associated with its interface across the stop (to confirm), so the laptop's tunnel finds it again.
- **`h4-ec2-guard`:** a second function, on "EC2 Instance State-change Notification" to `running` for that instance. If the laptop serves (the health check is healthy), the autostart switch is `off`, or the server budget's action has run, it calls `ec2:StopInstances` and alerts (`ec2_stopped_laptop_serving`, `ec2_stopped_paused`, `ec2_stopped_server_budget`). It may stop that one instance and nothing else (spec FR-071, "IF EC2 starts again on its own…"). It is a separate function with its own role, so the start function's role stays start-only, as question 16's default says.

**Why.** Spot around the clock is the Author's answer. The guard makes the spec's rule hold whatever AWS's restart does, so the plan needn't depend on that behavior being exactly as documented.

### R-31: The handover sequence and its windows (new)

**The laptop takes over** (`make up ENV=prod` on the laptop; spec FR-064):
1. Preflight, then the tunnel first: the laptop's gateway needs the shared state through the tunnel's `-L 5432`.
2. The whole topology starts (FR-045).
3. The laptop's relay block turns healthy; the relay sees three passes in a row (about 3 s) and sends visitors to the laptop (R-18). Route 53's check turns healthy, and the alarm returns to OK.
4. `h4-handover`, a host loop that `make up ENV=prod` starts in the Author's session, reads the relay's status. Once it says `laptop`, the loop stops EC2 through the Author's short-lived SSO session (R-15) and records it. The window, from the relay sending to the laptop to EC2's stop, is at most 5 minutes (spec FR-063).
5. Every 60 s while the laptop serves: if EC2 runs, stop it again (FR-064, a flap; R-30 covers AWS's restart). If the session has expired, alert once and keep serving; the shared meter bounds spend.

**EC2 takes over** (the laptop goes; spec FR-065):
1. The relay sees the laptop fail within about a second and sends visitors to EC2 if it is healthy, else answers `no_host_serving`.
2. Route 53's check fails after its threshold; the alarm changes, and the start function starts EC2 (R-29).
3. EC2 boots: its host script writes the env file, the deployer checks for a new release (FR-046), and compose brings the stack up.
4. The relay sees EC2 pass three checks and sends visitors to it.

The gap runs from the relay's last answer from the laptop to its first from EC2, and the relay records it in `handover_events` (spec SC-007). How long it is depends on R-29's detection time and EC2's boot, which group 9's rehearsal measures; the spec sets no bound on it, only on what visitors get meanwhile (SC-001's exception).

**When the tunnel end comes back after AWS took it** (plan question 2): its services start, the laptop's tunnel reconnects, the relay finds whichever host is up, and a rule on the tunnel end's `running` state invokes the start function once (R-29). That run can start EC2 just before the laptop serves again; the loop then stops it, as after any handover.

### R-32: The operator's commands (new)

All run in the Author's terminal only (R-16), each with an audit record:

| Command | Does |
|---|---|
| `make plan ROOT=…`, `make infra-verify`, `make infra-record`, `make infra-mirror` | the plan and apply cycle (R-13, R-14) |
| `make release`, `make rollback ENV=ec2\|tunnel-end\|prod` | releases and rollback (R-17) |
| `make ec2-status` | EC2's state, its spot request's state, the autostart switch, the serving host from the relay's status, the server budget's action status |
| `make ec2-start` | invokes `h4-ec2-start` by hand, so the same rules apply: refused while the autostart switch is `off`, the server action is executed, or the laptop serves |
| `make ec2-stop` | stops EC2 through the Author's SSO session (`h4-ec2-stop`) |
| `make ec2-autostart STATE=on\|off` | sets the autostart switch: `on` lets EC2 start automatically, `off` stops that (spec FR-065, FR-012), and writes an audit row to the shared state. Setting it `on` also invokes `h4-ec2-start` once, since the alarm won't change again while the laptop stays away |
| `make operator-status\|reset\|renew\|init\|restore ENV=shared` | spec 000's operator actions on the shared state, whichever host serves, or none (spec FR-074). While the laptop's prod runs, it uses that prod's own admin listener, `127.0.0.1:18003`, whose gateway is already on the shared state. Otherwise it starts a short-lived admin-only stack on the laptop: `tunnel` with only its `-L 5432` forward, and a `gateway` with its admin listener on the same loopback port and no public route. So the two never hold the port together, the stack can't take visitors, and the relay never sees the laptop as healthy. It runs the operator CLI, then stops. `restore` is new: it marks a store restored from a backup uninitialized, so that `init` can confirm its values (contracts/shared-state.md §8) |
| `make cloud-session HOST=ec2\|tunnel-end` | a Systems Manager port-forwarding session to a host's admin listener (spec FR-050) |
| `make shared-state-roles` | once, as RDS's master user: sets the shared state's role passwords from the values the Author wrote to Parameter Store (contracts/shared-state.md §2) |
| `make server-budget-restore` | reverses the server budget's action after the seven-day incident note (spec FR-023) |
| `make tunnel-keys`, `make tunnel-revoke`, `make secrets-check`, `make aws-login` | keys, revocation, the secrets' presence by name, and the SSO session (tasks.md: `aws-login` and `infra-mirror` in group 1, `cloud-session` in group 5) |

---

## Cost and the safety net

### R-05: The cost lines (changed)

**Model spend** is spec 010's and `config/budgets.yaml`'s: the $5 daily and $20 monthly ceilings, the $2-a-day fallback sub-budget on the laptop, and the Anthropic adapter's $20 monthly cap. The price table's current version is 2026-11-09.1: Claude Haiku 5.5 at $0.10 input and $0.50 output per million tokens, on both the Anthropic API and Bedrock (`config/prices.yaml`, "read 2026-11-09"). Spec 010's estimate per turn, and the spec's Expected Cost Impact, stand.

**The server budget's lines.** Repository figures carry their date and are to confirm. Lines without one are to price.

| Line | Repository figure, and its source | Status |
|---|---|---|
| EC2, running, on spot | none for the measured type | to price, after R-33 |
| EC2's volumes, running or stopped | gp3 at $0.08 per GiB a month (September R-05, 2026-10-18) | to confirm; sizes from R-33 |
| EC2's address, while running | AWS's public IPv4 charge, $0.005 per address-hour since 2024-02-01 (September R-05) | to confirm that an auto-assigned address isn't charged while stopped |
| The tunnel end, `t4g.micro` | spot about $0.0030 an hour, about $2.20 a month; on demand $0.0084 an hour, $6.13 a month (September R-04 and R-05, 2026-10-18, spot from trackers) | to confirm; spot, the Author's answer to plan question 2 ("About $2.20 a month (October's figure)") |
| The tunnel end's Elastic IP | $0.005 per address-hour, $3.65 a month (September R-05) | to confirm |
| The tunnel end's root volume | 8 GiB gp3 at $0.08, $0.64 a month (September R-05) | to confirm |
| RDS for PostgreSQL, the instance and its storage | none | to price |
| RDS's master password in Secrets Manager | about $0.40 a secret a month (September R-26, 2026-10-18) | to confirm |
| The Route 53 zone and its queries | about $0.51 a month (September R-05) | to confirm |
| The Route 53 health check | none | to price |
| The failover's CloudWatch alarm | $0.10 an alarm a month (September R-05) | to confirm |
| CloudFront, and its VPC origin | inside the always-free tier for a portfolio's traffic (September R-05) | to confirm, and whether a VPC origin adds a charge |
| S3: state, site, public view, release records | about $0.15 a month (September R-05) | to confirm |
| ECR: the stack's images for the last three releases, two platforms | $0.10 per GB a month (September R-05) | to price the size: EC2 now runs the whole stack's images |
| Lambda, EventBridge, SNS, Session Manager, Parameter Store standard tier | inside the always-free tier, or free (September R-05) | to confirm, with EventBridge's rules on AWS service events |
| AWS Budgets | the first two action-enabled budgets free (September R-05; from a web-search summary) | to confirm: this design has two actions, plus their rehearsals while they run |
| The uptime probe's alarm, `GetMetricData` | $0.10 an alarm; $0.01 per 1,000 metrics (September R-05) | to confirm, with the tunnel end's dashboard reads (plan §11) |
| AWS's fault-injection service, for SC-018's rehearsed interruptions (eight in group 9) | none | to price; the console's interruption test is the alternative (tasks.md T133) |
| `h4-rehearsal-instance`, the server rehearsal's target: a `t4g.nano`, started for each rehearsal and stopped by it | none | to price: its running minutes per rehearsal, and its root volume while stopped |

**What the Author prices from.** R-33's measurement, these lines, and spot first (question 15), with the 8-to-12-hour schedule only as the reserve. He sets the server budget's figure before the first apply, since the state bucket is already a resource the server budget covers (spec FR-021).

### R-06: No breaker that switches the edge off (carried)

**Decision.** As September R-06, with the server budget now in place: its action stops EC2 (R-22), and a flood's CloudFront and request charges reach the server budget's alerts, late. A breaker that disables the distribution stays out unless the Author asks for one. The meter bounds model spend in real time, which is where spend can run away quickly.

### R-22: The budgets and the two automatic actions (changed)

**Decision.** In `infra/bootstrap/budgets.tf` (protected), applied first:
- **`h4-model-month` and `h4-model-day`:** $20 and $5 on Bedrock's cost (a service filter), with warnings at 70% ($14, $3.50) and alerts at 100%. The Anthropic API's spend isn't on AWS's bill (spec FR-073).
- **`h4-server-month`:** the Author's figure, on every cost but Bedrock's, with a warning at 70% and an alert at 100%.
- **The anomaly monitor,** with an immediate subscription to `h4-alerts`, as September R-22 had it.

In `infra/account/killswitch.tf` (protected):
- **The model action:** on `h4-model-month` at 100% of actual, automatic, of type "apply IAM policy". It attaches `h4-deny-paid-models` (deny `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`) to both hosts' Bedrock roles: EC2's `h4-prod-gateway`, and `h4-laptop-bedrock`, the ordinary role the laptop's permission set assumes (R-15). It never attaches to a role Identity Center makes for a permission set, which Identity Center manages itself; that such a role can't take the attachment, and that the assumed role works for the laptop's gateway, are to confirm in group 4. The Author reverses it after the incident note (spec FR-023).
- **The server action:** on `h4-server-month` at 100% of actual, automatic, of type "run an SSM document", `AWS-StopEC2Instance` on the tagged instance (to confirm the action type's name and its target form). The start function reads its status and refuses while it is executed (R-29). `make server-budget-restore` reverses it.
- **Rehearsals (spec FR-026):** while `rehearsal = true`, two $0.01 budgets with the same actions against `h4-rehearsal-target`, an ordinary role of the same shape as `h4-laptop-bedrock`, which no one assumes, and `h4-rehearsal-instance` (a `t4g.nano` with no volume of note; to price). The Author starts the rehearsal instance before each server rehearsal, since stopping a stopped instance proves nothing, and records the SSM run's status from the action's history (`AWS-StopEC2Instance` succeeded, and the instance reached `stopped`). Each run records when AWS evaluated, when each channel got the alert, and when the action took effect. Then `rehearsal = false`.

**Why.** Spec FR-022 and FR-023, as answered. The server action stops only EC2: the laptop, the tunnel end, RDS, and the safety net keep running, so the laptop can still serve and the meter stays the control.

### R-23: AWS-side alerts through a bridge (carried)

September R-23 unchanged: one topic, `h4-alerts`, with email through SNS and Telegram through `h4-alert-bridge`, which reads its token from Parameter Store and logs neither. It now also carries the start function's and the guard's outcomes, the spot interruption warning, and the server budget's alerts.

### R-24: The uptime probe (carried)

September R-24 unchanged: `h4-probe`, once a minute, fetches `https://hareet.ai/` and `/api/status` with `X-H4-Probe: 1`, from outside every host; its alarm fires after 5 failed minutes. It runs on AWS's side, independent of EC2, the tunnel end, and the laptop.

### R-15: The identities (changed)

| Identity | Holds | Used by |
|---|---|---|
| `h4-prod-ec2` (instance role) | read its Parameter Store path; pull from ECR; read the release bucket; publish to `h4-alerts`; Session Manager; assume `h4-prod-gateway` | EC2's host services |
| `h4-prod-gateway` | `bedrock:InvokeModel*` on the one inference profile and the models it routes to | EC2's gateway, through credentials a host timer writes to tmpfs (September R-15); IMDSv2 with hop limit 1 keeps containers out of the metadata |
| `h4-prod-tunnel-end` (instance role) | read its Parameter Store path; pull from ECR; read the release bucket; write `site/status/latest.json`; `budgets:ViewBudget` on `h4-server-month`; `ec2:DescribeInstances` on the tagged instance; `sns:Publish` on `h4-alerts`, for its deployer's alerts (contracts/aws-alerts.md §1). For the dashboard's panels (plan §11), all reads: the autostart switch's parameter; the health check's status; the server action's status (`budgets:DescribeBudgetActionsForBudget` on `h4-server-month`); and the two functions' outcome counts (`cloudwatch:GetMetricData` on their namespace, to confirm in group 9). Session Manager | the tunnel end's host services and `snapshot-sink` |
| The laptop's Bedrock permission set (spec 000's runtime identity) | only `sts:AssumeRole` on `h4-laptop-bedrock` | the laptop's gateway, through SSO (row F2). Imported into Terraform and narrowed, ending spec 000's "made by hand" (spec FR-013) |
| `h4-laptop-bedrock` (new, an ordinary role) | `bedrock:InvokeModel*` on the one inference profile; trusts only the permission set's role | the laptop's gateway, assumed with its SSO credentials, so the budget action's deny can attach to it (to confirm, R-22) |
| `h4-ec2-stop` permission set (question 16's default) | `ec2:StopInstances` on the tagged instance; `ec2:DescribeInstances` | `h4-handover` and `make ec2-stop`, through the Author's SSO session |
| `h4-ec2-start-fn` | `ec2:StartInstances` on the tagged instance; read the autostart switch, the server action's status, the health check's status, and the tunnel end's state; publish to `h4-alerts` | `h4-ec2-start` |
| `h4-ec2-guard-fn` | `ec2:StopInstances` on the tagged instance; read the autostart switch, the health check's status, and the server action's status; publish to `h4-alerts` | `h4-ec2-guard` |
| The Author's administrator permission set | as September | Terraform, by hand |

Every role and permission set is in protected Terraform (FR-012). Nothing changes IAM at run time (spec FR-070).

---

## Releases, telemetry, and the public view

### R-17: Releases and the deployers on three hosts (changed)

**Decision.** As September R-17, with three deployers:
- **`make release`** builds the project's images once, for `linux/amd64` and, if R-33 picks Graviton for EC2 or the tunnel end, `linux/arm64`. It pushes them to ECR, copies every upstream image the cloud hosts run into ECR by digest, and writes `release.json` to the release bucket and to `~/.local/state/h4reet/releases/`.
- **EC2's deployer** runs at each boot before the stack takes visitors (spec FR-046), and every minute while it runs.
- **The tunnel end's deployer** runs every minute.
- **The laptop's deployer** takes releases from the Author's local release directory; the laptop holds no registry credential (September's interview question 7, settled as recommended).

Rollback and the hand-started hold are as September R-17.

### R-19: The public view (changed)

**Decision.** `snapshot-sink` runs on the tunnel end, which runs around the clock, on spot. Each host's `snapshot-publisher` posts its panel values every 2 minutes while it serves: the laptop's through the tunnel's `-L 2301`, EC2's inside the VPC. The sink adds the cloud part every 2 minutes whether or not a host serves:
- the serving host and EC2's state;
- the kill switch and model spend, from the shared state;
- the server's month to date against its budget, from `budgets:DescribeBudget`, read once an hour.

It writes `site/status/latest.json` (spec FR-057 to FR-059). The rest is as September R-19.

**While the tunnel end is gone,** the sink is gone with it, and `latest.json` keeps naming the last serving host. So `/status/` doesn't take the host from the document alone: it also reads `/api/status`, and the edge's degraded answer there (`no_host_serving`, `stack` null), or no answer, means `none`. The document's values then show as last-known, with their times (spec FR-057). This was weighed against moving the cloud part's writer off the tunnel end, to a scheduled function: that adds a function, a schedule, and a role with the same reads, to cover a gap the page can already see.

### R-25: Telemetry across the hosts (changed)

**Decision.**
- **Each host's stack** keeps spec 000's collector, Langfuse, Prometheus, Loki, and Grafana. EC2's run on EC2, which the 1.1.0 patch as amended allows: "Langfuse self-hosted in the stack" (plan question 3).
- **The tunnel end** runs a small collector with a file-backed queue (64 MiB, as September R-25). The relay labels its spans and metrics with `h4.relay.host`. A routing connector sends `laptop` to the laptop's collector (the tunnel's `-R 2202`), and `ec2` and `none` to EC2's collector (in the VPC). EC2 is the host that comes up next when none serves.
- **The relay's trace context** goes on with each request, so the host's gateway spans are its children.
- **Delayed or lost:** the queue's and the exporters' counters reach the dashboard (spec FR-060).

### R-26: Secrets outside Terraform (carried, grown)

**Decision.** September R-26: Terraform never creates or reads a secret; the Author writes each under `/h4reet/<host>/` with `aws ssm put-parameter --type SecureString`, and `make secrets-check` lists them by name only. New secrets:
- EC2's Anthropic API key (spec FR-068), in place of the laptop's env-file key;
- the shared state's role passwords: `gateway`, `grafana_ro`, `relay_ro`, `relay_rw`;
- the relay's two host tokens (`RELAY_TOKEN_*`);
- the sink's token, which the publishers send (`SNAPSHOT_SINK_TOKEN`), and the laptop's telemetry block's token, which the tunnel end's collector sends (`TELEMETRY_BLOCK_TOKEN`). Each is named in FR-011's deny list (contracts/env-cloud.md §5; P-1).

RDS's master password is RDS's own, in Secrets Manager (R-20). This stays a named exception to FR-001 (plan Complexity Tracking).

---

## Rejected for now

- **AWS WAF's rate-based rules** at the edge: as September (R-06).
- **A standing cloud staging environment:** out of scope.
- **A model server on EC2:** the Author's recorded reason under Principle I (spec Clarifications).
- **The laptop's egress allowlist:** still the Author's open decision from spec 000.
- **Infrastructure booked on the meter** (September R-21): spec FR-020 now keeps the meter to model calls.
