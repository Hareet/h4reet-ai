# Implementation Plan: Spot with Interchangeable Instance Types

Approved provisionally by the Author's direction of 2026-11-22: "Go with your recommendations. Let's have you build it out in this session"

**Branch**: `feat/032-spot-flexibility` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

## Summary

Each prod host gets an ordered list of interchangeable Graviton types with a price ceiling each, one launch template per type (spot, persistent, stopping on interruption), and Terraform stops holding the instance itself. The start function, `h4-ec2-start`, starts the current instance as today; when AWS has no capacity for its type, when it was stopped for capacity, or when it is gone or of an earlier generation, the function replaces it from the list in order, under a lock, keeping EC2's address and data volume and the tunnel end's two interfaces and shared-state volume. A 5-minute schedule lets the same function bring the tunnel end back as another type after 10 minutes of a capacity stop. Prod's root reads each host's current instance by tag, so its rules and the server action follow at the next plan. Alerts name the type; the snapshot sink and the runtime dashboard show each host's type.

## Technical Context

**Language/Version**: Terraform 1.17.1 with hashicorp/aws 6.72.0 (pinned in `.devcontainer/toolchain.vars`); Python 3.12 syntax for the Lambda functions (they run on python3.14, arm64) and the host scripts.

**Primary Dependencies**: the Lambda runtime's boto3 (imported only in `BotoAws`); nothing new.

**Storage**: SSM Parameter Store Strings: `/h4reet/prod/ec2-instance-id` (existing, now written by the function), `/h4reet/prod/ec2-launch-templates`, `/h4reet/prod/tunnel-end-launch-templates`, `/h4reet/prod/relay-vpc-origin-id` (new, prod's Terraform), `/h4reet/prod/host-lock` (new, the function's).

**Testing**: pytest through the repository's targets (`make -f Makefile test-fast`, the infra suites under `infra/test/`, the functions' own tests), with AWS stubbed; `make -f Makefile plan` without `ROOT` for the offline checks (the infra policy, `terraform fmt`, `validate`).

**Target Platform**: AWS, one account, `us-east-1`, zone `us-east-1a`.

**Constraints**: no high availability (one instance per host); the hours, the laptop fallback, the server budget and its action unchanged; protected files only by the Author's patches; no AWS call, apply, or release from an agent session.

**Scale/Scope**: two hosts, eight types, one function's new path, five protected files by two patches.

## Constitution Check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local | degraded mode | No byte leaves the visitor's device; the local tier covers EC2's downtime as today (spec, "The downtime that remains"); degraded mode unchanged. |
| II. Production-grade | yes | Tests for every path, a dashboard panel, runbook entries for each new alert, a cost estimate (spec), ADR 0057. |
| III. Intent, spec, humans merge | yes | Accepted intent; spec and plan before code; the Author's patches, plan, gate, merge, and applies. |
| IV. Least privilege | yes | The start role gains scoped grants (tag conditions, launch only from tagged templates, pass role to EC2 only); the credential audit knows them. The function never edits IAM, budgets, or rules. |
| V. Cost | yes | Ceilings bound every type at the first type's on-demand price; the kill switch's effect is kept by the start refusal and the guard's close stop in the gap after a replace: a named, bounded deviation (spec Assumptions; ADR 0057). |
| VI. Build in public | yes | The ADR carries the cost story and the alternatives. |
| VII, VIII | no | No corpus or twin behavior changes. |

Security & governance: protected files (`ec2-market*`, `handover*`, `killswitch*`, `iam*`) change only by the Author's patches, under `docs/merge-requests/human-patches/`. The infra policy's rules hold unchanged: T5 (launch templates with market options in `ec2-market*`), T11 (every prod launch template spot, persistent, stopping), T13 (IMDSv2, hop 1).

## Project Structure

### Documentation (this feature)

```text
specs/032-spot-flexibility/
├── intent.md      # the accepted intent
├── spec.md        # specify + clarify
├── research.md    # the alternatives, AWS's documented behaviors
├── plan.md        # this file, with the analysis appended
└── tasks.md
```

### Source code and docs that change

```text
infra/prod/ec2-market.tf          # PROTECTED, patch P-032-prod: launch templates per type; removed instances
infra/prod/handover.tf            # PROTECTED, patch P-032-prod: rules and the ID parameter from data sources
infra/prod/killswitch.tf          # PROTECTED, patch P-032-prod: the server action by tag and the data source's ID
infra/prod/ec2.tf                 # the type list, the template map, the data source, removed attachment
infra/prod/tunnel-end.tf          # the type list, the template map, the data source, removed attachment
infra/prod/shared-state.tf        # removed attachment
infra/prod/edge.tf                # the VPC origin's ARN from the data source; the origin's DNS name from the interface
infra/prod/ssm.tf                 # the two template lists and the VPC origin's ID
infra/account/iam.tf              # PROTECTED, patch P-032-account: the start role's new grants
infra/account/handover.tf         # PROTECTED, patch P-032-account: timeout 900 s, the 5-minute schedule
infra/parameters.txt              # the four new Strings, under "Names other hands make"
infra/lambdas/ec2_start/          # start.py, test_start.py: the replace path, the tunnel end check, the lock
infra/lambdas/ec2_guard/          # test_guard.py: a replaced instance named by the parameter is never stopped
infra/lambdas/credential_audit/   # audit.py, test_audit.py: the start role's table
infra/test/                       # patches.py and the prod/account suites: the new model
deploy/scripts/snapshot_sink.py   # h4.host.type
deploy/grafana/dashboards/h4-runtime.json  # "Host types"
deploy/hosts/test_hosts.py        # EC2's template, not its instance
scripts/infra/ec2_ops.py, Makefile  # REPLACE= and SKIP= on ec2-start
docs/adr/0057-spot-with-interchangeable-types.md, docs/adr/README.md
docs/runbooks/handover.md, ec2.md, tunnel-end.md
specs/001-cloud-elevation/contracts/aws-alerts.md §2, handover.md §3 (amendments)
docs/merge-requests/human-patches/2026-11-22-032-prod.patch, 2026-11-22-032-account.patch
docs/merge-requests/2026-11-22-feat-032-spot-flexibility.md
```

**Structure Decision**: no new directory, function, or image repository: the new path lives in `h4-ec2-start`, whose image the Author rebuilds and whose digest he writes, as for any function change.

## Design

### 1. Type lists and templates (prod)

`infra/prod/ec2.tf`:

```hcl
ec2_types = [
  { type = "t4g.large", max_price = "0.0672" },
  { type = "m7g.large", max_price = "0.0672" },
  { type = "m6g.large", max_price = "0.0672" },
  { type = "t4g.xlarge", max_price = "0.0672" },
]
ec2_templates = { for i, t in local.ec2_types : t.type => merge(t, { order = i }) }
```

`infra/prod/tunnel-end.tf` likewise with `t4g.small`, `c7g.medium`, `c6g.medium`, `t4g.medium` at `0.0168`. `local.ec2_type` and `local.tunnel_end_type` stay, each the list's first type, for what reads them today (the measurement script, the tests' R-04 and T166 checks).

`infra/prod/ec2-market.tf` (protected) replaces the two `aws_instance` blocks with `aws_launch_template.ec2` and `aws_launch_template.tunnel_end`, `for_each` over the maps, each: `name = "h4-prod-<host>-<type>"`, `image_id = data.aws_ami.al2023.id`, `instance_type = each.key`, `update_default_version = true`, `user_data = base64gzip(local.<host>_user_data)`, the instance profile, `instance_market_options` (spot, persistent, stop, `max_price = each.value.max_price`), `metadata_options` as today, a `dynamic "credit_specification"` for types starting `t`, the root volume as today, the network interfaces (FR-004), and `tag_specifications` for `instance`, `volume`, `network-interface`, `spot-instances-request` with `Name`, `project`, `environment`, `component`; `lifecycle { ignore_changes = [image_id, user_data]; replace_triggered_by = [terraform_data.<host>_generation] }`. And `removed { from = aws_instance.ec2 ... destroy = false }`, the same for `aws_instance.tunnel_end`.

The removed attachments (`aws_volume_attachment.ec2_data`, `aws_volume_attachment.shared_state`, `aws_network_interface_attachment.tunnel_end_public`) go in their unprotected files with `removed` blocks; `aws_ec2_instance_state.ec2_w1` (count 0 since W2) goes.

`data "aws_instance" "ec2"` and `data "aws_instance" "tunnel_end"`, by `tag:Name` and `instance-state-name` in pending, running, stopping, stopped, in `ec2.tf` and `tunnel-end.tf`. A plan while a host has no instance, or two, fails at its read with AWS's message; the runbook says to plan after the host is back.

### 2. What names an instance (prod)

- `handover.tf` (protected): the four rules' `instance-id = [data.aws_instance.<host>.id]`; `/h4reet/prod/ec2-instance-id`'s `value = data.aws_instance.ec2.id` with `lifecycle { ignore_changes = [value] }`.
- `killswitch.tf` (protected): the server action's role on `instance/*` with `ec2:ResourceTag/Name = h4-prod-ec2` beside `aws:CalledVia`; the budget action's `instance_ids = [data.aws_instance.ec2.id]`.
- `edge.tf`: the VPC origin's `arn = data.aws_instance.tunnel_end.arn`; the distribution's relay origin `domain_name = aws_network_interface.tunnel_end_private.private_dns_name`.
- `ssm.tf`: `/h4reet/prod/ec2-launch-templates` and `/h4reet/prod/tunnel-end-launch-templates`, `jsonencode` of `[{type, template}]` sorted by `order`; `/h4reet/prod/relay-vpc-origin-id`.

### 3. The start function

Events (contracts/handover.md §3, amended):

| Event | Trigger |
|---|---|
| the laptop's alarm into ALARM | `alarm` (today) |
| `{"from": "tunnel_end_back"}`, `{"from": "hours_open"}`, `{"manual": true}` | today's |
| `{"from": "tunnel_end_check"}` | `tunnel_end_check`, the schedule `h4-tunnel-end-check`, every 5 minutes |
| `{"manual": true, "replace": "ec2"\|"tunnel_end", "skip": [...]}` | `manual`, with a replace |

EC2's path: checks 1 to 5 unchanged; step 6 becomes:

1. Read the parameter and describe the named instance. Gone (no such instance, or terminated or shutting down): replace with nothing to stop. Not tagged `h4-prod-ec2`: `start_failed`, `untagged`, as today.
2. A hand replace, or the instance stopped for capacity (its spot request's code `instance-stopped-*` but `-by-user`), or launched from an unlisted template: replace.
3. Otherwise start it; on a capacity code, replace skipping its type; any other code, `start_failed` with the code, as today.

The replace (both hosts): take the lock; cancel the spot request (if any); terminate; poll every 5 s up to 240 s for `terminated`; for each listed template, in order, not skipped: `RunInstances` with the template at `$Default`, `MinCount = MaxCount = 1`; a capacity code moves on, another code stops with `start_failed`; on a launch, EC2's writes the parameter at once; poll until `running`; describe the volume by its `Name` tag and attach it at `/dev/sdf`; release the lock. Outcome `started` with `type`, `replaced` or `tried`; `no_capacity` when none launched.

The tunnel end's path (`tunnel_end_check` or its hand replace): describe the instances tagged `h4-prod-tunnel-end` not terminated. None: launch. Running or pending: a plain log line, done. Stopped: read its spot request; `instance-stopped-by-user`: a plain line, done; another `instance-stopped-*` code whose `UpdateTime` is 10 minutes old or more, or a hand replace: replace; younger: a plain line. After a replace: read `/h4reet/prod/relay-vpc-origin-id`, `GetVpcOrigin`, and if its ARN isn't the new instance's, `UpdateVpcOrigin` with the same configuration and the new ARN; alert `tunnel_end_replaced`; then run EC2's path as `tunnel_end_back`, whose outcome is its own line and alert.

Alerts (contracts/aws-alerts.md §2, amended), in the bridge's existing kinds and reasons, since its folder is protected (`infra/*alert*`; as built, departing from this plan's first draft, which added kinds): `ec2_started` gains `- type:` always, and `- replaced:` / `- tried:` / `- repoint:` after a replace; no capacity and a live lock are `ec2_start_refused (start_failed)` with `- code: no_capacity` or `- code: busy`, a wait that doesn't end `- code: wait_timeout` with `- step:`; the tunnel end's replace is `tunnel_end_back` with `- type:`, `- replaced:`, `- origin:`; its failure is `ec2_start_refused (tunnel_end_down)` with `- tunnel_end: not replaced` and the code. The scheduled open alerts `no_capacity` (`start_failed` is in its alerted set); the check's `busy` and failed reads aren't alerted, only recorded.

Metrics: the outcome line as today for every acting or refusing outcome (`Outcome` gains `no_capacity`, `busy`, `tunnel_end_replaced`; a failed tunnel end replace is `tunnel_end_down`); the check's no-op as `{"function": "h4-ec2-start", "trigger": "tunnel_end_check", "tunnel_end": "<state>"}`, no `_aws` block.

### 4. Account

- `iam.tf` (protected): the start role's statements (spec FR-016): `RunInstances` on `launch-template/*` with `aws:ResourceTag/component` in `ec2`, `tunnel-end`; on `instance/*` with `aws:RequestTag/Name` in the two names; on `volume/*`, `network-interface/*`, `spot-instances-request/*`, `subnet/*`, `security-group/*`, `image/*` with `ec2:LaunchTemplate` set (`ArnLike` on `launch-template/*`); `CreateTags` with `ec2:CreateAction = RunInstances`; `TerminateInstances` and `CancelSpotInstanceRequests` with `ec2:ResourceTag/Name` in the two names; `AttachVolume` on instances and volumes with `ec2:ResourceTag/Name` in the two host names and the two volume names; `iam:PassRole` on `role/h4-prod-ec2` and `role/h4-prod-tunnel-end` with `iam:PassedToService = ec2.amazonaws.com`; describes of spot requests and volumes; `ssm:GetParameter` on the three new parameters; `ssm:PutParameter` on the ID's parameter and the lock, `ssm:DeleteParameter` on the lock; `cloudfront:GetVpcOrigin` and `UpdateVpcOrigin` on `vpcorigin/*`.
- `handover.tf` (protected): the start function's `timeout = 900`, its event age 900 s; `aws_scheduler_schedule.tunnel_end_check`, `rate(5 minutes)`, through `h4-ec2-hours`, no retry.
- `credential_audit/audit.py`: the start role's per-action table (research R-10).

### 5. Patches

Two patches, each built from `git show refs/heads/main:<path>` copies under `$TMPDIR`, `diff -u --label a/<path> --label b/<path>`, verified with `patch -p1 --dry-run` then `patch -p1` on a `git archive refs/heads/main` export and on an export of the branch's tip:

- `docs/merge-requests/human-patches/2026-11-22-032-prod.patch`: `infra/prod/ec2-market.tf`, `infra/prod/handover.tf`, `infra/prod/killswitch.tf`.
- `docs/merge-requests/human-patches/2026-11-22-032-account.patch`: `infra/account/iam.tf`, `infra/account/handover.tf`.

`infra/test/patches.py`'s `PATCHES` names both, so the infra suites read the tree as the patches leave it.

### 6. Order of the Author's steps (the note's "For the Author")

1. Apply both patches on the branch; plan prod and account from a fresh clone; their blocks into the note; gate; merge.
2. Tag the two current spot requests (`Name` = the host's name) so the function's tag-scoped cancel reaches them (spec Edge Cases).
3. Prod apply (templates, parameters, removed, data sources); then rebuild and push `h4-ec2-start`'s image, write its digest, and apply the account (role, timeout, schedule, image).
4. Verify (Proof, below).

## Proof

- **Tests** (this session): the start function's suite for FR-005 to FR-014; the guard's for a replaced named instance; the audit's for the new table; the bridge's, unchanged, against the amended contract; the sink's for `h4.host.type`; `scripts/infra/test_ec2_ops.py` for `REPLACE`/`SKIP`; the infra suites for FR-001 to FR-004 and FR-015 on the patched tree; `make -f Makefile lint`; `make -f Makefile check ENGINE_MODE=none-yet`.
- **Offline plan** on an export with the patches applied: the infra policy (T5, T11, T13 among them) and `terraform fmt`; `validate` where the sandbox can start the provider (it can't in agent sessions: the provider plugin doesn't start here, on `main` too).
- **On AWS** (the Author): prod's plan shows no instance destroyed (SC-005); a hand replace of EC2 skipping `t4g.large` inside the hours with the laptop down (SC-001); a hand replace of the tunnel end at a quiet hour (SC-002), which also settles the VPC origin's re-point (research R-6); then exactly one instance and no open untagged request per host (SC-003).

## Risks

| Risk | Mitigation |
|---|---|
| The VPC origin refuses a new ARN while in use | Alerted; the runbook's fallback is a prod apply; the rehearsal finds out first (R-6) |
| A refused `RunInstances` leaves a persistent request open | The guard's unrecognised stop (EC2); the interfaces in use (tunnel end); the Author's check after each rehearsal |
| A plan while a host is mid-replace or gone fails at the data source | The runbook: plan after the host is back; the failure is loud, never a wrong value |
| The first replace meets untagged legacy spot requests | The Author tags them before (step 2); if not, the cancel is refused, the run alerts `start_failed` with the code, and nothing is terminated |
| Termination before a fallback is known to launch | Named in the spec; the next trigger tries again; the data volume and stores survive |
| A tight tunnel end ceiling | Research R-9; a one-line raise if the rehearsal shows it |

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected because |
|---|---|---|
| Kill switch's stop names the old instance until the next prod apply (Principle V) | Terraform reads the instance at plan time; the function must not edit budget actions | Function-owned budget edits put the kill switch in a function's hands; on-demand removes the need but triples the price |

## Analysis (speckit-analyze, 2026-11-22)

Run over spec.md, plan.md, research.md, and tasks.md after tasks.

| ID | Category | Severity | Location | Finding | Resolution |
|---|---|---|---|---|---|
| A1 | Coverage | — | FR-001..FR-020 | Every FR maps to at least one task (tasks.md's FR column) | none needed |
| A2 | Consistency | LOW | spec FR-013 vs plan §3 | The check's "unlisted template while stopped for capacity" is covered by the capacity rule itself | kept as written; no separate path |
| A3 | Underspecification | MEDIUM | FR-014 | Whether the VPC origin needs the re-point is unknown | an Assumption, a risk, and SC-002's rehearsal |
| A4 | Constitution | MEDIUM | Principle V | The gap after a replace | named in spec Assumptions, Complexity Tracking, and ADR 0057 |
| A5 | Ambiguity | LOW | SC-002 "within 15 minutes" | Hand replace has no 10-minute wait | consistent: the 20-minute bound is the automatic path's |
| A6 | Terminology | LOW | "replace" | Used for both the Terraform replace (templates) and the function's (instances) | the plan says which in each place |

No CRITICAL or HIGH findings.
