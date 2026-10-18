# Research: Cloud Elevation (spec 001)

Phase 0 output of `/speckit-plan`, **drafted on 2026-10-18 for the Author's approval**. One entry per decision the plan rests on: the decision, why, and what else was weighed. Entries marked **(to ask)** are the plan interview's questions, gathered in [The plan interview, to ask](#the-plan-interview-to-ask); their recommended answers are what the plan assumes until the Author answers. Spec 000's plan was settled in an interview of this kind ([spec 000 research.md](../000-local-foundations/research.md#the-plan-interview-word-for-word)).

**Prices.** FR-021 asks the plan to estimate each idle line "from published prices". The figures below were checked on 2026-10-18 against AWS's pricing pages and, for spot prices, which AWS publishes only through its API and console, against third-party trackers that sample them. They are list prices in us-east-1, without the free tier unless a line says so. [R-05](#r-05-the-idle-budget-line-by-line) gives the table, and tasks.md re-prices it from the pages in the Author's terminal before the first apply, since spot prices move hourly.

**Two sentences quoted below came from web-search summaries of AWS's pages, not from the pages themselves:** the AWS Budgets free-tier sentence (R-05) and the VPC origins' private-subnet sentence (R-07). They are AWS's wording as the summaries gave it, unchecked against the live pages, which agent sessions can't fetch. The first infra task re-reads both pages from the Author's terminal, and the ADRs written from these entries carry the same caveat until then.

**No `NEEDS CLARIFICATION` remains** in the plan's Technical Context. What stays open is the Author's to answer (the interview below), or measured in a named task (R-04's memory fit, R-08's error-page header).

## The plan interview, to ask

Each row is a question for the Author, the recommended option, and the entry that argues it. The plan assumes the recommended option until the Author answers; an answer that differs changes the entry, the plan section it names, and nothing else.

| # | Question | Recommended | Entry |
|---|---|---|---|
| 1 | Spec 000 isn't finished: SC-001's re-run, SC-002, SC-005's dashboard timing, and SC-007 are open, and the spec's Assumptions say spec 000 passes "before this spec is planned". Approve this plan now, with tasks starting only after those runs, or wait? | Approve the plan now; the first task group that needs a stack (group 4, the cloud VM) waits for SC-001's re-run and SC-002 | plan Summary |
| 2 | How should CloudFront reach the relay on the cloud VM? | A VPC origin, through a second network interface in a private subnet: only this distribution can reach the relay, and no secret sits in Terraform's state. CloudFront to the VM runs over HTTP inside AWS's network | R-07 |
| 3 | Which instance? | A t4g.micro (Graviton, 1 GiB) as spot, about $8.10 a month idle in all; a t4g.small, about $11.00 and so just over the target, if the memory doesn't fit | R-04, R-05 |
| 4 | Where does the h4reet.ai zone live? Which registrar and DNS provider hold it today? | Route 53 in the project's account, with the registrar's name servers pointed at it by you | R-09 |
| 5 | How does an apply record reach `main`? | `make infra-record` writes it on a branch `ops/apply-<root>-<date>` that you merge, like any note | R-13 |
| 6 | Spec 000's hand-made Bedrock runtime identity: import it, or replace it (FR-013)? | Replace it with a Terraform role the fallback gateway assumes on the VM, then delete the Identity Center user, its permission set, and the old IAM user | R-15 |
| 7 | The local tier's release source before publication. Your clarify answer was "the Author's terminal builds each release once and publishes it to a private registry in the account, and both deployers pull it by digest". The plan reads "both deployers pull it by digest" as: the local deployer takes the release by digest from a local source, the images your release build already left in your engine, checked by index digest. Is that right, or should the local tier pull from the registry itself, which needs an AWS credential on the local tier? | Your own release directory, which `make release` writes as it pushes to the registry; no AWS credential on the local tier | R-17 |
| 8 | A last-resort breaker that switches the edge off if the account's bill passes a hard stop? | Not in this spec. The budgets alert, the meter bounds model spend, and the risk is named. Say if you want one, and at what amount | R-06 |
| 9 | Telemetry from the cloud, and the public snapshot, both through the tunnel? | Yes: the cloud collector exports through the tunnel, and the local tier's snapshot goes up through it, so the local tier never holds an AWS credential | R-11, R-19 |

---

## Account, Terraform, and the records

### R-01: One region, us-east-1

**Decision.** Everything that has a region runs in us-east-1: the VM, its network, the registry, the buckets, the Lambdas, the SNS topic, and the secrets.

**Rationale.** CloudFront's certificate must be in us-east-1. The gateway's Bedrock inference profile, `us.anthropic.claude-haiku-5-5`, is called from us-east-1 today (`config/routing.yaml`, `region: us-east-1`). Budgets, Cost Explorer data, and Cost Anomaly Detection are global, but their SNS targets live in a region. One region keeps one disclosure row per flow. The spec's Out of scope already excludes "more than one AWS region for the stack".

**Alternatives.** us-east-2 or us-west-2, which the inference profile also routes to: no gain, and the certificate would still need us-east-1.

### R-02: Terraform, pinned, in three root modules

**Decision.**
- **Tool:** Terraform (HashiCorp), the version and the `hashicorp/aws` provider pinned in `.devcontainer/toolchain.vars` and in each root's `required_version` and `.terraform.lock.hcl`, which `.gitignore` already commits ("pins the providers (lockfile pinning, spec 000 FR-014; Terraform arrives with spec 001)"). The exact versions are chosen in the first infra task from the Author's terminal, the only place with registry access, and recorded there. No other provider: `random`, `null`, `external`, `local`, and `http` are refused by the policy check (R-14), as are `local-exec` and `remote-exec` provisioners.
- **Roots,** each with its own state key: `infra/bootstrap` (the state bucket, the budgets, the anomaly monitor, the alert topic, and the email route; FR-003, FR-022), `infra/account` (the budget action and its rehearsal, the alert bridge, the uptime probe, the registry, the release bucket, the deny policy; FR-023, FR-026, FR-061), and `infra/prod` (the network, the VM and its volumes, its roles and their read grant on the secrets' path, the two non-secret bucket-name parameters, the DNS zone, the certificate, the edge, the site's bucket). The secret parameters themselves are the Author's, outside Terraform (R-26). Shared code in `infra/modules/`.
- **Environments by root, not by workspace.** FR-006 refuses agents `workspace new` and `workspace delete`, and a root per environment keeps a plan's blast radius on its name. An ephemeral cloud dev VM, if the Author ever wants one, is a fourth root with its own tag and budget (spec Assumptions: "Each ephemeral VM gets its own role, tag, and budget").
- **Tags** come from each root's `provider "aws" { default_tags { ... } }`: `project = "h4reet-ai"`, `environment = "prod" | "account"`, plus a `component` tag on every resource. FR-002's check reads them (R-14).

**Rationale.** The constitution's Technology Standards ask for "Infrastructure exclusively via Terraform". Three roots let the safety net (bootstrap) be applied first and alone, as FR-022 requires ("in this spec's first apply, no later than any other resource that costs money"), and keep IAM-heavy account resources apart from the stack's.

**Alternatives.** OpenTofu: a drop-in fork. The constitution names Terraform, so FR-006's spelling rules cover `tofu` as a drop-in replacement instead. One root with workspaces: one plan for everything, and the refused workspace commands.

### R-03: State in S3 with S3's own lock, bootstrapped by the Author

**Decision.** The state bucket `h4reet-ai-tfstate-<suffix>` (the suffix is a random word the Author picks at bootstrap, not the account ID, FR-010):
- versioning on; server-side encryption with S3's managed keys; S3 Block Public Access on all four settings; a bucket policy that refuses non-TLS requests and every principal except the Author's administrator role from IAM Identity Center;
- locking with Terraform's S3-native lock file (`use_lockfile = true`), so no DynamoDB table is needed;
- one key per root: `bootstrap.tfstate`, `account.tfstate`, `prod.tfstate`.

**Bootstrap (FR-003).** `infra/bootstrap` declares the bucket and starts with a local state in the Author's `~/.config/h4reet-ai/infra/` (denied to agents, FR-011). The Author's first apply creates the bucket and the budgets together. The Author then runs `terraform init -migrate-state`, a command FR-006 refuses to agents, and the record of both steps goes in the first apply record (R-13).

**Rationale.** FR-001 asks for state that is "remote, encrypted, versioned, never public, and locked during every plan and apply". S3's lock file needs no second resource. A customer-managed KMS key would add $1 a month for a control the bucket policy already gives.

**Alternatives.** DynamoDB locking, now deprecated in Terraform's S3 backend. HCP Terraform: a third party holding the state.

### R-13: The plan in the note, and the apply record (FR-005, FR-007)

**Decision.**
- **`make plan ROOT=<root>`** (the Author's terminal, CLAUDE.md's existing command) first runs `tools/gates/infra_policy.py` on the root's HCL and refuses on any finding, because `init` and `plan` run agent-written configuration with the Author's administrator session (R-14). Then it runs `terraform init` and `plan -out` into `~/.config/h4reet-ai/infra/plans/<root>-<tree>.tfplan`, where `<tree>` is the git tree hash of `infra/` at HEAD. It then prints the plan through `tools/gates/infra_redact.py`, which removes account IDs (12-digit runs, and ARNs' account fields), email addresses, and any value Terraform marks sensitive. No secret is a Terraform value to begin with (R-26). Its output is a fenced block that names the root and the tree hash, ready to paste into the merge-request note. In an agent session, with no AWS credentials, `make plan` runs the offline checks instead (R-14) and says so.
- **FR-005's gate step**, `infra-plan-note`, in `make check` and the Author's gate: for a branch whose diff touches `infra/<root>/` or `infra/modules/`, the note must hold a block for each affected root whose tree hash equals `git rev-parse HEAD:infra`, and the block must pass the redaction check. A later `infra/` commit makes the block stale, and the gate fails until a new plan is pasted.
- **No `make apply`.** CLAUDE.md: "There is no `make apply` on purpose". The Author applies with Terraform directly, between two make targets:
  1. `make infra-verify ROOT=<root>` checks that the checkout is `main`, clean, at the merge that carried the note; that the saved plan's tree hash is `main`'s; and that `terraform show -json` of the saved plan, redacted, matches the note's block. It prints the one apply command to run.
  2. The Author runs `terraform -chdir=infra/<root> apply <saved plan>`.
  3. `make infra-record ROOT=<root> OUTCOME=…` writes `docs/infra/applies/<date>-<root>.md`: the commit, the plan's SHA-256, the time, the outcome, and the resources changed (addresses and actions only), redacted. It commits the record on a new branch `ops/apply-<root>-<date>`, for the Author to merge **(to ask, question 5)**.
- **A failed apply** still gets a record, with the outcome and what changed. The state lock stays the Author's to release (`force-unlock`, FR-006).

**Rationale.** FR-007 asks that the Author apply "only a saved plan that matches the reviewed plan", and that each apply leave a record "with the commit, the plan's hash, the time, the outcome, and the resources changed". A saved plan file is exactly what Terraform applies, so checking its tree hash and its rendering against the reviewed note closes the gap between review and apply without a wrapper that applies. The tree hash, not the commit, ties the plan to "the branch's latest `infra/` change" (FR-005), so a docs-only commit after the plan doesn't make it stale.

**Alternatives.** A `make infra-apply` wrapper: simpler for the Author, and it contradicts CLAUDE.md's rule. A record the Author writes by hand: easy to forget, and FR-007 asks for every apply.

### R-14: The offline checks agents can run, and the policy (FR-002, FR-004, FR-012)

**Decision.**
- **A provider mirror the Author seeds.** `make infra-mirror` (the Author's terminal) runs `terraform providers mirror` for the pinned versions into `~/.local/share/h4reet/terraform-providers`, as the agents' engine's images are seeded. That's where spec 000's lint toolchain lives too: readable by agents, and outside every sandbox write root. Agent sessions run `terraform init -backend=false` against it with a CLI configuration that names only that mirror, then `fmt -check` and `validate`. The sandbox gets no new domain (spec Assumptions: "Opening the sandbox would be the Author's decision").
- **`tools/gates/infra_policy.py`** (human-only, like the other gates), on the HCL parsed by `python-hcl2` (pinned and hashed in the tools' requirements). In the Author's terminal it runs twice: on the HCL **before** `terraform init`, refusing on any finding, since `init` and `plan` run agent-written configuration with the Author's administrator session; and again on `terraform show -json` of the saved plan, which also covers what a module computes. Its rules:
  - every root sets `default_tags` with the three keys, and every resource type that takes tags carries `component` (FR-002);
  - IAM resources, budgets and budget actions, SNS topics and subscriptions, CloudWatch alarms, EventBridge rules, and CloudFront's cache and origin-request policies live only in the protected files (below), so an agent can't add an IAM grant in `main.tf` (FR-012);
  - no public S3 bucket, no bucket without Block Public Access, no security group rule open to the world except the tunnel's port (R-11);
  - no provisioner, no `external` or `http` data source, and no provider outside the pinned list; every `required_providers` entry is pinned to an exact version (FR-004);
  - no literal that looks like an account ID, an email address, or a key (FR-009, FR-010);
  - no Terraform-managed secret parameter, and no data source that reads one (FR-009, R-26).
- **Protected files (FR-012):** in every root and module, `iam*.tf`, `budgets*.tf`, `alerts*.tf`, `killswitch*.tf`, and `edge-limits*.tf`, plus `infra/policy/**`. They change only through the Author's patches, with an ADR. Their names are what `protected-paths.sh` matches, and the policy keeps the resource types inside them.

**Rationale.** FR-012 names the Terraform "that defines IAM, budgets, alert routing, edge rate limits, and the kill switch". A path rule alone can be evaded by putting a resource in another file; the type check closes that, and the plan's JSON check closes it again in the Author's terminal.

**Alternatives.** Checkov, tfsec, or OPA's conftest: large rule sets, mostly for other threat models, and new pinned tools; a short stdlib check states exactly this spec's rules. `terraform test`: FR-006 refuses it to agents, since its `apply` mode creates real resources.

### R-16: Refusing Terraform's state-changing commands in every spelling (FR-006, FR-011)

**Decision.** Spec 000's bash gate already refuses `apply`, `destroy`, `import`, and `state rm|mv|push`, with global options between `terraform` and the subcommand (`.claude/hooks/bash-gate.sh`, its `tf_sub` rule). This spec's patch extends it:
- **subcommands:** `refresh`, `taint`, `untaint`, `force-unlock`, `test`, `state replace-provider`, `workspace new|delete`, and `init` with `-migrate-state`, `-force-copy`, or `-reconfigure`;
- **spellings:** `tofu` and `terragrunt` as drop-in replacements; a path to the binary (`/usr/local/bin/terraform`, `./terraform`); `command`, `exec`, `env`, `nice`, `timeout`, `xargs`, `bash -c`, `sh -c`, and subshells; `-chdir` and `TF_CLI_ARGS*` (an environment variable that adds `apply`'s flags or a plan file to any command is refused when it's set at all); and `make infra-verify`, `make infra-record`, and `make infra-mirror`, which only the Author runs;
- **paths and names (FR-011),** in the same patch:
  - `denyRead` and `denyWrite` on `*.tfstate*`, `*.tfplan`, and `*.tfvars*`;
  - `~/.config/h4reet-ai/infra`, `tunnel`, and `release` are already denied, by spec 000's deny on all of `~/.config/h4reet-ai`, and get their own matrix rows;
  - the variables `TF_VAR_*`, `AWS_*`, and `TF_CLI_ARGS*` in `credentials.envVars`;
  - a matrix row for each (contracts/env-cloud.md §8).

Every rule gets matrix rows in stage H, and a gap row for any spelling that gets through, as CLAUDE.md asks ("Also test `git -C`/`-c`, `bash -c`, subshells, quoting, and config or API equivalents, and add a gap row to `redteam/forbidden-actions.sh` for any that get through").

**Rationale.** FR-006 lists the commands and asks for "every spelling, including `-chdir`, wrappers, `bash -c`, subshells, and drop-in replacements". Agent sessions hold no AWS credentials, so the gate is the second layer, not the only one: without the Author's SSO session, an apply from an agent fails at the provider anyway.

**Alternatives.** Refusing `terraform` entirely: it would also refuse `fmt` and `validate`, the offline checks agents need.

---

## Cost

### R-04: The cloud VM: Graviton, spot, the smallest size that holds the thin services (FR-021)

**Decision.** One EC2 instance, `t4g.micro` (2 vCPUs burstable, 1 GiB) **(to ask, question 3)**, as a **persistent spot request that stops on interruption**, in one availability zone, running Amazon Linux 2023 (arm64), with:
- a 1 GiB swap file on the root volume, as a buffer, not a working set;
- memory limits that sum under 800 MiB: the fallback gateway 256 MiB (spec 000's 512 MiB is its ceiling, not its use), `gateway-state` 128 MiB (Postgres tuned to `shared_buffers=32MB`), the relay 96 MiB, the collector 96 MiB with its memory limiter, `tunnel-end` 32 MiB, and `edge` 32 MiB;
- the egress proxy and the deployer as host services (R-10, R-17);
- **standard CPU credits** (`credit_specification { cpu_credits = "standard" }` on the launch template). T4g instances start in unlimited mode, where sustained load above the baseline bills surplus credits: up to about $50 a month at full CPU on a t4g.small, which the meter of record would see only in the next day's correction (R-21). In standard mode, a busy instance slows down instead of billing.

The first VM task measures the stack's resident memory under the breach test's load. If it doesn't fit in 1 GiB with less than 100 MiB of swap in use, the instance becomes a `t4g.small` (2 GiB), a configuration change.

**Rationale.** The relay and the tunnel's end live on the VM (spec FR-017, FR-052), so it runs whenever visitors are served, which rules out the Author's on-demand-only scenario (spec Assumptions). That leaves the price of an always-on instance, against "≤ $10/month" for everything idle (R-05):

| Instance, us-east-1 | On demand, $/h (a month) | Spot, $/h (a month) | Interruption, as trackers report |
|---|---|---|---|
| t4g.micro (1 GiB) | 0.0084 (6.13) | about 0.0025–0.0035 (1.8–2.6) | low |
| t4g.small (2 GiB) | 0.0168 (12.26) | 0.0061–0.0097 (4.45–7.08) | 5–10% |
| t3a.small (2 GiB, x86) | 0.0188 (13.72) | 0.0065–0.0103 (4.75–7.52) | 15–20% and more |

On demand, even a t4g.micro leaves no room under the target once the public address is added (R-05). Spot interruptions on burstable Graviton types are rare, and a stop keeps the root volume, so the instance comes back on its own when capacity returns. While it's stopped, the site loads and the edge answers hello and status with its degraded body (spec FR-034).

**Arm64, and multi-architecture releases.** The local tier is x86-64, so each release is one multi-architecture image index, as the spec allows ("If the cloud VM's processor architecture differs from the local tier's, a release is one multi-architecture image index; the plan picks the instance type"). Spec 000 already pins images by index digest, so "the same images by digest" (FR-048) compares index digests on both hosts. The project's own images (the gateway, the relay, `tunnel-end`) build their JavaScript on the build platform and copy it into a runtime stage that runs nothing; the `tunnel-end` image's package install needs QEMU's arm64 emulation on the Author's engine, installed once (R-17). Every upstream image the VM runs is published for arm64 (Postgres, nginx-unprivileged, the collector).

**Alternatives.**
- `t3a.small`, x86 like the local tier: one architecture, and two to three times the trackers' interruption rate, at the same price.
- On demand: about $4–7 more a month (a t4g.micro at $6.13 against about $2.20 on spot; a t4g.small at $12.26 against about $5), over the target.
- A Savings Plan or reserved instance: a one-year commitment for about $8 a month on a `t4g.small`, still over the target with the address.
- Fargate: per-task pricing above an always-on t4g.micro, and no place for the meter's volume.
- Lightsail: a cheaper bundle with an address included, but outside the account's VPC, so no VPC origin (R-07), and its own networking model for the tunnel's port.

### R-05: The idle budget, line by line

**Decision.** The estimate the plan commits to, at list prices checked on 2026-10-18, before the free tier except where noted:

| Line | Assumption | $ a month |
|---|---|---|
| The VM, t4g.micro spot | about $0.0030 an hour, 730 hours | about 2.20 |
| Its public IPv4 address | $0.005 an hour, in use or not (AWS's public IPv4 charge) | 3.65 |
| The root volume, gp3 | 8 GiB at $0.08 | 0.64 |
| The meter's volume, gp3 | 2 GiB at $0.08 | 0.16 |
| The meter volume's daily snapshots | incremental, under 1 GiB at $0.05 | 0.05 |
| The Route 53 hosted zone | one zone, plus queries | 0.51 |
| CloudFront | inside the always-free tier: 1 TB out, 10 million requests, 2 million function invocations a month | 0.00 |
| S3: the state, the site, the public view, the release records | under 1 GiB stored; the public view written every 2 minutes, about 21,900 PUTs | 0.15 |
| ECR: the project's images (two platforms) for the last three releases, the Lambda images, and copies of the upstream images the cloud stack runs (Postgres, nginx-unprivileged, the collector), whose full indexes keep every platform's layers so their digests stay the lock's | about 3 GiB at $0.10 | 0.30 |
| CloudWatch: one alarm for the probe, and the edge's default metrics read every 5 minutes (plan §9) | $0.10 an alarm; `GetMetricData` at $0.01 per 1,000 metrics, 4 metrics × 8,760 reads a month | 0.45 |
| Lambda (the alert bridge, the probe), SNS, Session Manager, Parameter Store's standard tier, AWS-managed KMS keys | inside the always-free tier, or free | 0.00 |
| AWS Budgets and Cost Anomaly Detection | monitoring is free; the first two action-enabled budgets are free | 0.00 |
| **Idle total** | | **about 8.10** |
| The same with a t4g.small spot instead (R-04) | about $0.0070 an hour | about 11.00 |

**What it leaves (FR-020).** The meter of record books the idle estimate as a daily share: about $0.27 a day for the t4g.micro, against the $5 daily ceiling, and about $8.10 of the $20 month. That leaves about $4.73 a day and $11.90 a month for metered calls, the fallback sub-budget's $2 a day inside them. Thirty days at the full sub-budget would be $60, so the month's ceiling binds first, as in spec 000.

**Rationale.** The spec's Expected Cost Impact: "Before the first apply, the plan prices every line from the published pricing pages and sums the idle lines against "≤ $10/month" (FR-021). It also states how much of each ceiling FR-020's booking of infrastructure cost leaves for fallback and burst." The public address is the largest fixed line after the instance, and no design removes it: the tunnel's end needs a public address the local tier can reach (R-11), and the VM's outbound calls need IPv4.

**Sources.** AWS Budgets pricing ("Your first two action-enabled budgets are free (regardless of the number of actions you configure per budget) per month", as a web-search summary of the pricing page gave it on 2026-10-18; to re-read from the page itself, as the Prices note above says), AWS's public IPv4 charge ($0.005 per address-hour since 2024-02-01), EC2 on-demand pricing; spot prices from Holori's, Spare Cores', Vantage's, and DoiT's trackers on 2026-10-18 (AWS publishes them only through `describe-spot-price-history`). The re-pricing task runs `aws ec2 describe-spot-price-history` in the Author's terminal.

### R-06: The worst case outside the meter, and a breaker left out **(to ask, question 8)**

**Decision.** No breaker that switches the edge off. The risk is named in the plan's risk table.

**Rationale.** The meter bounds model spend in real time, and FR-023's budget action revokes Bedrock at the provider once AWS's data shows $20. Everything else is billed per request and lags: an application-layer flood past CloudFront's free 10 million requests costs about $0.01 per 10,000 HTTPS requests, roughly $10 for each further 10 million. AWS WAF's rate-based rule would bound it at the edge, but a web ACL costs $5 a month plus $1 a rule and per-request fees, about two-thirds of the idle budget. Shield Standard, which is free and automatic, covers network-layer floods only.

**Alternatives.** A last-resort breaker: an SNS-triggered Lambda that disables the CloudFront distribution when the account's month passes a hard stop (for example $40), so the site goes dark until the Author re-enables it. It stays out unless the Author asks; Principle V's self-degradation is met for model spend, which is where spend can run away quickly.

---

## The edge, the relay, and the paths

### R-07: CloudFront reaches the relay through a VPC origin, on a second network interface **(to ask, question 2)**

**Decision.**
- The VM has two network interfaces in one availability zone:
  - **`eth0`, in a private subnet** (no route to the internet gateway), with a fixed private address. It is CloudFront's VPC origin. Its security group admits only CloudFront's origin-facing prefix list, on the relay's port.
  - **`eth1`, in a public subnet,** with the Elastic IP. It carries the VM's outbound traffic (through the egress proxy, R-10) and the tunnel's one inbound port (R-11), and nothing else.
- The relay's port is published on `eth0`'s fixed address, written as a literal in the compose file's `cloud` profile, so no environment file can move it (spec 000's rule, plan §1: "bound to the literal `127.0.0.1`, which no env file can change", extended by one literal for the cloud stack's one public-facing listener).
- The distribution forwards `CloudFront-Viewer-Address` to the relay through an origin request policy, and caches nothing under `/api/*` (the `CachingDisabled` managed policy; FR-029).

**Rationale.**
- FR-032: "IF a request reaches the cloud stack other than through the edge, THEN THE SYSTEM SHALL refuse it." With a VPC origin, the relay's address is private, and only a distribution in this account can reach it. Requests that don't come through this distribution have no route at all.
- The alternative needs a shared secret header to tell this distribution from anyone else's, since CloudFront's origin-facing prefix list admits every distribution. That secret would sit in the distribution's configuration and so in Terraform's state, which FR-009 forbids, or in a CloudFront Function's key-value store, which adds a moving part.
- AWS's guide puts VPC origins in private subnets: "In the private subnet, launch an Application Load Balancer, a Network Load Balancer, or an EC2 instance to use as your origin." (That sentence is as a web-search summary of the guide's "Restrict access with VPC origins" page gave it on 2026-10-18, not read from the page itself; the first infra task re-reads it.) The VM still needs a public address for its outbound calls and the tunnel, hence the second interface. Amazon Linux 2023 sets up per-interface routing for a second interface on its own; the default route goes through `eth1`.

**The trade, stated for the Author.** From CloudFront to the relay, the request travels inside AWS's network, between CloudFront and an interface in the account's VPC, as HTTP. The visitor's connection to CloudFront is TLS. The data-flow disclosure's row V2 says so.

**Alternatives.**
- **A public origin with TLS end to end:** the VM holds a certificate for an origin name (Let's Encrypt through Route 53's DNS challenge, which gives the VM's role write access to one TXT record), and the relay checks a secret header CloudFront adds from a key-value store. This is TLS all the way, with more parts, one more third party (the certificate authority), and DNS write access from the VM.
- **An Application Load Balancer:** about $16 a month before traffic.
- **API Gateway through a VPC link:** no secret header, but a hop with its own logs and its own limits, and request fees.

### R-08: The edge's own degraded answer (FR-034)

**Decision.** When the relay can't be reached, CloudFront answers `/api/*` from custom error responses: 502 and 504 from the origin become a 503 carrying spec 000's degraded JSON body, with the cause `edge_origin_unreachable`, served from the site's bucket (`/_degraded/api.json`). The minimum error-caching TTL is 0, so the edge asks again on the next request. A 503 isn't replaced: the relay's own degraded answers are 503s, and their causes must reach the visitor. The relay never answers 502 or 504 itself: a gateway's 502, such as spec 000's `local_error`, becomes a degraded 503 at the relay with its cause kept (R-18), so a 502 or 504 at the edge always means the relay wasn't reached, and replacing it hides nothing.

**Open, measured in the edge task.** Spec 000's body comes with the header `X-H4-Degraded-Cause`. A custom error response can't add a header, and whether a viewer-response CloudFront Function runs on a CloudFront-generated error response is to be measured. If it doesn't, the cause travels in the body only for this one case, and the relay contract says so.

**Rationale.** FR-034: "IF the edge can't reach the relay, THEN the edge SHALL return the same degraded body itself". Custom error responses are free, and the site's bucket is already an origin.

**Alternatives.** Lambda@Edge origin-failover logic: per-request fees and logs in every region the edge runs in.

### R-18: The relay: a thin TypeScript service

**Decision.** `services/relay`: Fastify 5 on Node 24, a second npm workspace beside the gateway, with the same lint, test, and telemetry setup (spec 000 plan §5). Its listeners and routes:
- **8080, the edge listener:** `POST /api/hello` and `GET /api/status`, from the edge only (R-07). On the cloud stack it refuses any request whose TCP peer is on the VM itself: loopback, the Docker address pool the VM's daemon fixes, or the VM's own interface addresses. The security group keeps the internet out, but the VM's own containers and host processes would otherwise reach `relay:8080` and could set `CloudFront-Viewer-Address` to anything. Published-port traffic keeps its source address, since the VM's daemon runs without the userland proxy (contracts/relay-http.md §1).
- **8081, the internal listener,** on the `internal` network, published only at the VM's loopback for the Author's Systems Manager session: `GET /api/status` for the snapshot sink, and `POST /api/hello` for the Author's test client, which always gets the fixed documentation-range identity `192.0.2.10`, whatever it sends. That's FR-032's one named exception: the operator's own authenticated session, told apart by the listener, never by a header (contracts/relay-http.md §2).
- `GET /health/live` for the container's own check.

At each request, in order:
1. **The probe mark.** A request carrying `X-H4-Probe: 1` gets `h4.probe=true` on its spans, so the collector drops them (spec 000's `filter/probes`). On hello it's refused with 400 before any model is called: probes call status only (spec FR-061, "SHALL cause no metered call").
2. **The client's address** from `CloudFront-Viewer-Address` (the address, without the port), on the edge listener only. A request without it is refused, as it didn't come through the edge (FR-032).
3. **The public cap** (FR-033): per address, a token bucket and a UTC-day count, in memory only, sized by a new `public` section of `config/budgets.yaml` (human-only: the Author's patch, with an ADR). Over the cap: spec 000's 429 shape, counted by a metric with no address on it.
4. **The kill switch of record** (FR-030): `SELECT state, since, crossed FROM gateway.v_state` on the fallback gateway's store, as the read-only role `relay_ro`, which is granted that view and nothing else (data-model.md §2.4), with `statement_timeout=250ms`. Degraded, unknown, unreadable, or not read successfully within the last 10 s: spec 000's degraded response, without forwarding.
5. **The path** (FR-017, FR-035): the local path while it's healthy (R-12), else the fallback gateway. A degraded or failed answer on the local path counts as a failed local path, and the request goes to the fallback gateway once, with `X-H4-Local-Path` naming why (`unhealthy`, `failed`, `degraded`). A local 502 `local_error` doesn't fall back, and the relay answers it as a degraded 503 with that cause, so the relay never gives the edge a 502 (R-08). The fallback gateway records it as its route reason, so its trace and the dashboard show it (spec FR-035, scenario 3: "the reason is visible on the dashboard").
6. **The client identity** goes on to whichever gateway answers as `X-Forwarded-For`, one value, from a hop that gateway trusts: on the cloud stack, the relay itself; on the local path, the local `edge`'s tunnel block (R-12). Spec 000's gateway believes the header "only when its TCP peer is edge", so its trusted-peer list gains the relay, on the cloud stack only.

The relay keeps no body after it answers and logs neither the message nor the answer (FR-031). It holds the address in memory for the caps, at most one UTC day (FR-042).

**Rationale.** FR-029 makes the relay "a container in the one compose definition", and FR-031 keeps it to routing. Reading the kill switch straight from the store, rather than asking the fallback gateway, makes the relay's answer independent of the gateway process's health, and the store is already what the gateway reads at request start.

**Alternatives.** The relay asking the fallback gateway's `/health` for the state: one more hop and one more failure mode on every request. A Lambda relay: outside the compose definition, against FR-029.

### R-12: The local path's health, and the local `edge`'s tunnel blocks

**Decision.**
- **Two new server blocks in the local `edge`** (`deploy/edge/nginx.conf`), on unpublished ports, each guarded by its own bearer token, which only the cloud side's callers hold. A `tunnel` network with a fixed subnet was weighed and dropped: prod and dev on one host would collide on it.
  - **8085, the local path:** `POST /hello` and `GET /health` to `gateway:8080`, and nothing else. It requires `Authorization: Bearer` with the relay's tunnel token, from a value the local env file holds (FR-053: "authenticate every call through it and accept only the cloud callers the disclosure names"). After the token check, it takes the client's address from the relay's `X-H4-Viewer` header as the one `X-Forwarded-For` value it sends on. (`X-H4-Client` is spec 000's client label, a different thing.) Without the token, it answers 401 and logs the refusal with no address.
  - **8086, telemetry in:** `POST /v1/{traces,metrics,logs}` to `otel-collector:4318`, with its own token (flow C3).
- **The relay's health check** of the local path: `GET /health` through the tunnel every second. It follows spec 000's rule: unhealthy after one failure, healthy after three passing checks in a row (FR-054). The local `/health` returns 200 only when the gateway and the model server are both up.

**Rationale.** The spec reads it this way: "The local path reaches `edge`, not the model server, so the model server keeps spec 000's setup with no API key (FR-053)." The local `edge` is already the stack's one publisher, and making the tunnel its third kind of caller keeps Langfuse, Grafana, and the admin listener off the tunnel by construction (FR-052: "The tunnel SHALL NOT reach Langfuse, the admin listener, or any part of Grafana").

**Alternatives.** The tunnel straight to the gateway: one fewer hop, but it bypasses `edge`'s limits, its trace-context scrubbing, and its body cap.

### R-11: The tunnel: OpenSSH reverse forwards, ending on the VM **(to ask, question 9)**

**Decision.**
- **The local end, `tunnel`,** a service in the compose file's `tunnel` profile, which only the local tier's production environment selects. It runs OpenSSH's client as a non-root user with every capability dropped and a read-only root, and opens one connection to the VM's Elastic IP on one TCP port. It holds three forwards:
  - `-R` from `tunnel-end:2201` to the local `edge`'s 8085: the local path (C1);
  - `-R` from `tunnel-end:2202` to the local `edge`'s 8086: telemetry in (C3);
  - `-L` from its own 2301 to `snapshot-sink:8080` on the VM: the public snapshot going up (C4).
  It reconnects with backoff, and its keep-alives make a dead link visible in 30 seconds.
- **The cloud end, `tunnel-end`,** a service in the `cloud` profile: OpenSSH's server, running unprivileged as its single user, with:
  - public-key authentication only, one key, and the host key pinned on the local side;
  - `MaxSessions 0`, so no shell, command, or subsystem can open;
  - `PermitListen` for the two remote ports and `PermitOpen` for the one local forward, so the connection can carry nothing else (FR-052: "SHALL carry only the flows the disclosure lists").
  Its port is published on `eth1`'s address, and its security group admits that one port from anywhere, because the local tier's home address changes.
- **Credentials (FR-055).** `make tunnel-keys` (the Author's terminal) makes the local tier's key pair and the server's host key. The private client key and the pinned host key stay in `~/.config/h4reet-ai/tunnel/` (denied to agents, R-16). The server's host key goes to Parameter Store as a SecureString, and the client's public key goes there too, both written by `make tunnel-keys` from the Author's terminal, never by Terraform (R-26). Revoking is one action: `make tunnel-revoke` empties the authorized key and restarts `tunnel-end` through Systems Manager.

**Rationale.**
- **No capabilities.** OpenSSH's forwards run in user space. WireGuard, the usual alternative, needs `NET_ADMIN` and `/dev/net/tun` in the local container, an exception to spec 000's rule that every service drops all capabilities.
- **Least reach.** `PermitListen` and `PermitOpen` make the server refuse any forward that isn't listed, whatever the client asks for. A routed tunnel would need firewall rules inside it to do the same.
- **Ends in the account** (spec FR-052, Clarifications: "inside the project's AWS account"), with no third party in the path.

**Alternatives.**
- WireGuard: a stealthier port, because it doesn't answer unauthenticated packets, but it needs capabilities, and its routes need filtering.
- frp, chisel, or rathole: purpose-built reverse tunnels, each a smaller project with a less reviewed protocol than OpenSSH's.
- Systems Manager's port forwarding: it forwards only from the caller toward the instance, never the other way, and the local tier would need AWS credentials.

### R-10: The VM's egress: one allowlisting proxy (FR-051)

**Decision.**
- **A host service, `h4-egress-proxy`,** a stdlib Python CONNECT proxy on the VM, on the agents' engine's proxy's design (spec 000 plan §10), runs as its own user. It allows CONNECT only to the hostnames the disclosure's cloud rows name: Bedrock's runtime endpoint, `api.telegram.org`, the SMTP host, and the AWS endpoints the VM uses (ECR, S3, Systems Manager, STS, and the Budgets API). The list is generated from the disclosure's rows, so the two can't differ.
- **nftables** on the VM, in two chains, because an owner match sees only the host's own processes, never a container's forwarded traffic (contracts/tunnel.md §8):
  - **`output`, host processes:** only the proxy's user may leave for addresses outside the VPC, besides the link-local endpoints host services need: the instance metadata service for root, the Systems Manager agent, and the credential timer; Amazon Time Sync; and the VPC resolver. Docker's pulls, the Systems Manager agent, and the deployer use the proxy through `HTTPS_PROXY`.
  - **`forward`, containers:** traffic from the Docker address pool to anything outside it is dropped, except to the proxy on the bridge gateway's address. Containers use `HTTPS_PROXY` too, and one that ignores it gets nowhere.
- **The security group's egress** admits TCP 443 and the SMTP port, as a second layer.

**Rationale.** FR-051: "limit the cloud VM's outbound traffic to the destinations the disclosure lists, and refuse all others". Security groups filter by address, and none of these services has a fixed one. A DNS firewall (Route 53 Resolver's) filters by name but costs about $1.20 a month, and it doesn't stop a connection to a bare address.

**Alternatives.** Squid: a much larger program for one allowlist. A NAT gateway with a network firewall: tens of dollars a month.

### R-09: The domain in Route 53 **(to ask, question 4)**

**Decision.** The `h4reet.ai` public hosted zone lives in Route 53, in `infra/prod`. It holds the site's records (an alias to CloudFront, for `h4reet.ai` and `www`) and the certificate's validation record. The Author changes the registrar's name servers to the zone's, which is a human action outside Terraform, recorded like an apply (spec Assumptions). The ACM certificate covers `h4reet.ai` and `www.h4reet.ai`, validated by DNS, renewed by ACM.

**Rationale.** The spec's Degraded Modes table leans on one vendor ("There is no second host: one account, and no second vendor"). Route 53's alias records let the apex point at CloudFront. The Author said "we already have a dns provider" (spec Assumptions, 2026-10-12); keeping it would need its own Terraform provider and an API token, which is one more secret and one more third party in flow V3.

**Alternatives.** Keeping the current DNS provider, if Terraform can manage its records; the spec allows that ("That provider can keep the zone if Terraform can manage its records").

---

## The meter of record, and the AWS-side safety net

### R-20: The meter of record moves to the cloud stack (FR-017, FR-018, FR-019)

**Decision.**
- **The cloud stack** is a fourth stack, `cloud`, with `H4_ENV=prod`: the gateway checks that `H4_STACK` is "one of the three, and agrees with `H4_ENV`", and that list grows to four. Its routing class is new, `prod-cloud: { fallback: bedrock }`, with no primary, and the router goes straight to the fallback's admission, recording `route.reason` from the relay's `X-H4-Local-Path`. The schema's rule ("keeps every primary local") is restated: every route with a primary keeps it local, and only `prod-cloud` has none.
- **The local tier's production** routes `prod: { primary: local }` with no fallback. Preflight and the gateway refuse a paid adapter in any route outside the cloud stack (FR-018: "IF a production-class stack with a paid route would spend outside the meter of record, THEN THE SYSTEM SHALL refuse to start it"). The Bedrock route that T105 added to `prod` moves to `prod-cloud` in the same patch.
- **The store survives the VM** (FR-019): `gateway-state`'s data and the journal live on their own 2 GiB gp3 volume, which Terraform guards with `prevent_destroy` and snapshots daily. The VM attaches it at boot, in the same availability zone.
- **The move** follows spec 000's initialization. The cloud store starts `uninitialized`, so degraded. First local prod loses its paid route, so no fallback spend can land on its meter after the reading. Then the Author reads local prod's meters (`make operator-status ENV=prod`), and runs `make operator-init ENV=cloud` with `DAY_USD=`, `MONTH_USD=`, `FALLBACK_TODAY_USD=`, and the renewal flag, through the operator session (R-15). Nothing starts at zero.
- **The operator CLI** keeps its rule that `--url` is loopback only. The cloud stack's ports are 18500–18504. The Author's Systems Manager port-forwarding session puts the VM's admin listener on the Author's own `127.0.0.1:18503` (FR-050), so the CLI's check grows by one stack and nothing else.

**Rationale.** The spec's answer to question 2, and its list of spec 000 pieces "this spec has to change". Each change keeps spec 000's fail-closed rules: an unknown stack name, a paid route on the wrong stack, or an empty store all stop the stack or keep it degraded.

### R-21: Infrastructure cost on the meter (FR-020)

**Decision.**
- **A new attribution, `infra`,** in the ledger's checks (migration `0003_infra.sql`, data-model.md §2); an infra booking never reserves. The estimate counts against the day and month meters, the correction against the month only, and neither against `fallback_day`.
- **The daily share.** At the first admission or background sweep of each UTC day, the meter of record books one ledger row: `infra.month_estimate_usd` ÷ the days in the month, `cost_basis = estimate`. The estimate is a new key in `config/budgets.yaml` (human-only; the Author's patch, with an ADR), set from R-05.
- **The correction.** Once a day, the fallback gateway reads the month-to-date actual of a budget that excludes Amazon Bedrock (`h4-infra-actual`, a monitoring-only budget, which is free) through `budgets:DescribeBudget`. When AWS's actual for the month so far is above what the meter has booked as infrastructure, it books the difference with `cost_basis = billing_correction`, against the month only, since it is for past days. It never books a negative row: the meter never counts less than was spent (spec 000's rule for expired reservations).
- **Admission** then refuses metered calls when metered spend plus infrastructure reaches $5 for the day or $20 for the month, as FR-020 asks, with no other change to spec 000's transaction.

**Rationale.** The spec's answer to question 3, booked on the meter. The budget's actual comes from AWS's own data, which lags by hours, so the correction catches up later rather than in real time (FR-024: the meter stays the control).

**Alternatives.** Cost Explorer's `GetCostAndUsage`: $0.01 a request, and the same data. A fixed split that lowers the ceilings by the target: no schema change, which the clarify session noted, and the Author chose the booking.

### R-22: The budgets, the action, and the rehearsal (FR-022, FR-023, FR-026)

**Decision.** In `infra/bootstrap/budgets.tf` (the first apply):
- `h4-account-month` ($20, monthly, actual, warning at 70% and 100%) and `h4-account-day` ($5, daily, actual, warning at 70% and 100%);
- `h4-prod-month` and `h4-prod-day`, the same amounts filtered to `environment = prod` (the cost-allocation tag, activated in the Billing console by the Author: a recorded human step);
- `h4-infra-actual`: monthly, excluding Amazon Bedrock, for R-21's correction, with no alert;
- a Cost Anomaly Detection monitor on AWS services, with an immediate subscription to the alert topic for any anomaly over $1.

In `infra/account/killswitch.tf` (protected):
- the managed policy `h4-deny-paid-models`, which denies `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on every resource (the Converse calls the gateway makes are authorized by those two);
- a budget action on `h4-account-month` at 100% of actual, automatic, of type "apply IAM policy", attaching that policy to the fallback gateway's role (R-15), with an execution role scoped to that one attachment;
- **the rehearsal (FR-026):** while `rehearsal = true`, a budget `h4-rehearsal` set at $0.01, below any month's actual spend, with the same action attaching the policy to `h4-rehearsal-target`, a role no one can assume. The record of the rehearsal (quickstart) says when AWS evaluated it, when the alerts came, and when the policy was attached. Then `rehearsal = false`.

The two action-enabled budgets are the free two. Every budget notifies the SNS topic, which routes to email and to the alert bridge (R-23).

**Rationale.** FR-023: "revoke production's permission to call paid models at the provider and alert on both channels. The permission SHALL stay revoked until the Author restores it". A budget action's "apply IAM policy" type does exactly that, and it stays applied until it is reversed, which only the Author can do. Local answers continue, because the local path calls no provider.

**Alternatives.** A service control policy: it needs AWS Organizations. A budget action that stops the VM: it stops the fallback and the relay too, so local answers would stop with it.

### R-23: AWS-side alerts reach Telegram through a bridge; email directly

**Decision.** One SNS topic, `h4-alerts`, in `infra/bootstrap/alerts.tf`:
- **email** through an SNS email subscription, to the address the Author supplies at run time as a sensitive variable (FR-010). SNS asks the Author to confirm it once;
- **Telegram** through `h4-alert-bridge`, a Lambda function packaged as a container image (stdlib Python), which formats the notice like spec 000's alerts (`[h4reet.ai aws]`, the budget or monitor, the threshold, the amounts, the time) and calls the Bot API's `sendMessage`. It reads the bot token and the chat ID from Parameter Store at each run, and logs neither.

The topic also takes ACM's certificate-expiry events (through an EventBridge rule; FR-027's "alert before it expires") and the probe's alarm (R-24).

**Rationale.** ADR 0005's channels, with no SMS (FR-022). The bridge runs whether or not the VM does, so the safety net doesn't depend on what it guards. A Lambda container image keeps CLAUDE.md's rule: "Everything ships as a container".

**Alternatives.** The fallback gateway reading an SQS queue and reusing spec 000's dispatcher: the AWS-side alerts would stop with the VM. AWS Chatbot: it has no Telegram target.

### R-24: The uptime probe (FR-061)

**Decision.** `h4-probe`, a Lambda container image (stdlib Python) on an EventBridge schedule, once a minute: it fetches `https://h4reet.ai/` and `https://h4reet.ai/api/status` with `X-H4-Probe: 1`, and fails the run if either doesn't answer 200 in 5 seconds. A CloudWatch alarm on the function's own `Errors` metric, at 5 failed minutes in a row, notifies `h4-alerts` (FR-061: "alert on both channels after 5 minutes of failure"). Each probe's result also lands as a log line the dashboard reads.

**Rationale.** It runs outside the VM, as FR-061 asks, for about $0.10 a month (the alarm), inside Lambda's free tier.

**Alternatives.** Route 53 health checks: they can't send the probe's header. CloudWatch Synthetics: about $52 a month at one run a minute ($0.0012 a run, 43,800 runs).

---

## Releases, deployment, and the public view

### R-17: Releases from the Author's terminal; deployers that pull **(to ask, question 7)**

**Decision.**
- **`make release`** (the Author's terminal, on a clean `main`) builds each of the project's images once, for `linux/amd64` and `linux/arm64`, and pushes them to the account's private registry (ECR, one repository per service, tag = the commit). It copies the upstream images the cloud stack runs (Postgres, nginx-unprivileged, the collector), and no others, into the same registry by digest (`docker buildx imagetools create`, which keeps the index digest), so the VM pulls from one registry. The registry keeps each repository's last three releases' images (R-05). It writes the release record, `release.json` (the commit, every service's index digest, the time, and who built it), to the release bucket and to `~/.local/state/h4reet/releases/`.
- **The deployer,** `deploy/scripts/deployer.py` (stdlib, run through `PY_HOST`), runs every minute from a systemd timer on each host, outside compose: on the VM as a host service, and on the local tier in the Author's user session. It reads the newest release from its source (the bucket on the VM, the Author's release directory on the local tier). For a release it hasn't run, it verifies each image's digest, exports the commit's tree as `make up` does (spec 000 plan §4), and restarts only the services whose image or configuration changed (FR-047). It waits for health, returns to the previous release if a check fails, and alerts. It records each deployment as a JSON line in the stack's state directory and as a log event the dashboard shows (FR-046).
- **A hand-started stack** (FR-049): `make up ENV=… REF=…` writes `started_by=author` into the run file, and the deployer leaves that stack alone until `make deployer-resume`. The dashboard's release panel shows the commit and who started it.
- **The local tier holds no AWS credential.** The release's images are already in the Author's engine, since the Author built them there. `make release` checks each index digest against the local store before writing the record.

**Rationale.** The spec's answer to question 9: "the Author's terminal builds each release once and publishes it to a private registry in the account, and both deployers pull it by digest." The plan reads "both deployers pull it by digest" as each deployer taking the release by digest from its own source: the VM from the registry, and the local tier from the images the release build already left in the Author's engine, checked by index digest. Interview question 7 asks whether that reading is right. The deployer is a host service because the compose policy refuses `docker.sock` in any service (spec 000 plan §11), and a deployer in a container would need it.

**Alternatives.** The local tier pulling from ECR: it would need AWS credentials, through IAM Roles Anywhere or a long-lived key, against FR-008. The local tier pulling through the tunnel from the VM: a registry proxy on the VM, for images the local tier already holds.

### R-15: The fallback gateway's identity (FR-013) **(to ask, question 6)**

**Decision.** Replace spec 000's hand-made identity.
- **`h4-prod-fallback-gateway`,** a role in `infra/prod/iam.tf` (protected), allowed only `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the one inference profile and the foundation models it routes to, plus `budgets:ViewBudget` on `h4-infra-actual`. The budget action's deny policy attaches here (R-22).
- **The instance role,** `h4-prod-vm`, may:
  - assume the gateway's role and `h4-prod-public-view-writer` (one S3 key, for `snapshot-sink`);
  - read its own Parameter Store path, pull from the project's ECR repositories, and read the release bucket;
  - publish to `h4-alerts`, read CloudFront's metrics, and drain the alerts' SQS copy;
  - attach Session Manager.

  Nothing else.
- **How the containers get credentials:** IMDSv2 with a hop limit of 1, so no container reaches the instance metadata. A host timer assumes each container's role every 30 minutes and writes its short-lived credentials to a tmpfs file. For the gateway, compose mounts it read-only where spec 000's gateway already reads its AWS configuration (`${H4_AWS_DIR}`). contracts/env-cloud.md §7 has the table.
- **After the cutover,** the Author deletes the Identity Center user, its permission set, and spec 000's old IAM user `h4reet-runtime` (whose keys FR-013 already requires gone), and `make aws-login` retires.

**Rationale.** FR-013 allows either; replacing it ends spec 000's deviation ("the runtime identity is made by hand") and moves the paid route's identity where the paid route now runs. The local tier keeps no paid route, so it needs no AWS identity at all.

**Alternatives.** Importing the Identity Center user and its permission set: the gateway on the VM would need an SSO session, which a human renews.

### R-19: The public view: a snapshot the local tier pushes up **(to ask, question 9)**

**Decision.**
- **`snapshot-publisher`,** a service in the local tier's `tunnel` profile, evaluates the public dashboard's panel queries every 2 minutes against Prometheus and the gateway's store, as the read-only Grafana role. The queries are read from the provisioned dashboard's public panels, so the view and Grafana can't drift. It posts the values, with the time they were taken, to `snapshot-sink` through the tunnel's forward (C4).
- **`snapshot-sink`** on the VM checks the local part against a schema (numbers, states, and times only: no payload, client identifier, operator reason, or secret, FR-059). It adds the cloud part, which it reads itself from the meter of record every 2 minutes, whether or not the local tier is up: the kill switch, spend, the fallback's remainder, and the `infra` and metered totals R-21 books, so idle cloud cost sits beside metered spend (FR-059). It writes the merged document to the site's bucket as `site/status/latest.json`, with a role that may write that one key.
- **The view** is a static page on the site, `/status/`, which reads `latest.json` (cached for 60 s) and the relay's `/api/status` (the local tier's status now, FR-057), and says when each part's values were taken (FR-058). It needs no Grafana in the cloud and no third-party snapshot service.

**Rationale.** The spec's answer to question 10: "always the cloud-hosted snapshot, refreshed so its values are at most 5 minutes old while the local tier is up. The operator's Grafana never faces the internet." Every two minutes stays under five with room for a missed run, and it costs about $0.11 a month in S3 writes.

**Alternatives.** Grafana's own snapshots: they need a Grafana to serve them, in the cloud, or the external snapshot service spec 000 switched off. Grafana's image renderer: a headless browser on the local tier, and pictures a screen reader can't read.

### R-25: Cloud telemetry and its losses (FR-060)

**Decision.** The cloud stack runs spec 000's collector image with a file-backed sending queue (the `file_storage` extension, on the meter's volume, 64 MiB), exporting OTLP through the tunnel to the local tier's collector (C3). Its own metrics (queue size, sends failed, data dropped) travel the same way, and on reconnect the dashboard shows how much was delayed or lost, by the collector's counters.

**Rationale.** FR-060: "IF the local tier's telemetry backends are unreachable, THEN the cloud stack SHALL keep answering, and the dashboard SHALL show how much telemetry was delayed or lost." Nothing in the answer path waits on the collector, as in spec 000.

**Alternatives.** CloudWatch for the cloud stack's telemetry: a second backend, and payload-free only by policy rather than by spec 000's collector redaction.

### R-26: Secrets stay outside Terraform: a named exception to FR-001 (FR-009)

**Decision.** Terraform never creates or reads a secret. The Author creates and updates each secret parameter under `/h4reet/cloud/` with `aws ssm put-parameter --type SecureString --overwrite`, from the Author's terminal, by hand or through `make tunnel-keys`. Terraform names the path only in IAM policies: the instance role's read grant, and the alert bridge's on `/h4reet/cloud/TELEGRAM_*`. The policy refuses an `aws_ssm_parameter` resource of type `SecureString` and any data source that reads a secret (contracts/infra-records.md §5, T9). `make secrets-check` lists which expected names exist, by name and type only, with `ssm:DescribeParameters`, and never reads a value. On the VM, `write-env.py` refuses to start the stack while a name is missing (contracts/env-cloud.md §1). The non-secret parameters Terraform already knows, the two bucket names, stay Terraform's, as `String` parameters.

**Rationale.** FR-009: "Terraform refers to the secret without reading its value". A Terraform-managed parameter can't meet that. Even with a placeholder value and `lifecycle { ignore_changes = [value] }`, every refresh reads the SecureString back, decrypted, into the state and every saved plan: the Telegram token, the SMTP credentials, the database passwords, the tunnel's host key, and the tunnel tokens (the review of 2026-10-18 found it). Keeping the secrets out of Terraform departs from FR-001 ("THE SYSTEM SHALL define every cloud resource in Terraform"), so it is named as an exception (plan Complexity Tracking): the secret parameters are cloud resources Terraform doesn't define. FR-009 is the narrower and later rule, about the values themselves.

**Alternatives.**
- **Write-only arguments** in the AWS provider, which keep a value out of the state: unverified for the provider version the first task pins, and the value still has to reach Terraform at apply time, through a variable in the Author's terminal.
- **Secrets Manager,** with Terraform holding only the secrets' names: about $0.40 a secret a month, roughly $4–5 for the dozen or so secrets of contracts/env-cloud.md §2, over half of R-05's idle budget.
- **A Terraform-managed placeholder with `ignore_changes`:** the first design, rejected because the state then holds every value after its first refresh.

---

## Rejected for now, revisit later

- **AWS WAF's rate-based rules** at the edge: a cost line of about two-thirds of the idle budget (R-06).
- **A standing cloud staging environment:** out of scope (spec Assumptions).
- **Static answers when both paths are down:** they wait for the twin's spec (spec FR-036).
- **CI-built releases, OIDC roles, and the plan on pull requests:** the publication spec (`publication-carryover.md`).
- **The local tier's own egress allowlist:** still the Author's open decision from spec 000 (disclosure row S2); FR-051 covers only the cloud VM.
