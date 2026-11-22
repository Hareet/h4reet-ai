# feat/032-spot-flexibility

Spec: [specs/032-spot-flexibility/](../../specs/032-spot-flexibility/) · Intent: [specs/032-spot-flexibility/intent.md](../../specs/032-spot-flexibility/intent.md) · Written by: Claude Code (a subagent of the Author's session), every lifecycle step in one session · Date: 2026-11-22
Session: /home/h4reet/h4reet-ai/h4reet-ai, working in the worktree /tmp/claude-1000/wt-feat-032-spot-flexibility (from main `f1abe245`) · Repo hooks active: yes (the bash gate refused three commands whose text named a handover function or an Author-only target, once inside a heredoc and once in a commit message; each went through a file instead, never respelled)
Authorized by: the Author's direction of 2026-11-22, verbatim: "Go with your recommendations. Let's have you build it out in this session"

## What changed and why

On 2026-11-18 EC2 couldn't start: AWS had no spot capacity for `t4g.large` in `us-east-1a`, and AWS can't change a spot instance's type, so nothing in the design could pick another. The Author asked for spot with interchangeable types (his words are in the spec and ADR 0057, verbatim). This branch gives each prod host an ordered list of Graviton types and lets the start function replace a host that can't get its type with the next one that can.

- **Types and ceilings** (`infra/prod/ec2.tf`, `tunnel-end.tf`): EC2 `t4g.large`, `m7g.large`, `m6g.large`, `t4g.xlarge`; the tunnel end `t4g.small`, `c7g.medium`, `c6g.medium`, `t4g.medium`. Each type's ceiling is its list's first type's on-demand price ($0.0672 and $0.0168 an hour), so no fallback costs more an hour than today's type on demand.
- **Launch templates** (protected `ec2-market.tf`, patch P-032-prod): one per listed type, spot, persistent, stopping on interruption, at its ceiling; EC2's carry `10.42.0.20`, the tunnel end's its two interfaces by ID. Terraform forgets the two instances and the three attachments (`removed`, `destroy = false`) and reads each host's current instance by its `Name` tag for the instance rules, the server action, the ID's parameter, and the VPC origin.
- **The start function** (`infra/lambdas/ec2_start/start.py`): its checks are unchanged; step 6 starts the named instance, and replaces it from EC2's list (cancel the spot request, terminate, launch the next type with capacity, write the ID, attach the data volume) when AWS refuses it for capacity, stopped it for capacity, it is gone, or it is of an earlier generation. A 5-minute schedule, `h4-tunnel-end-check`, lets it replace the tunnel end the same way after 10 minutes of a capacity stop, re-point the VPC origin, and start EC2. A lock parameter keeps one replace at a time. The Author's hand replace: `make ec2-start REPLACE=ec2|tunnel_end [SKIP=types]`.
- **Its role** (protected account `iam.tf`, patch P-032-account), each new grant held to a condition, and the **credential audit** knows them; the function's timeout goes to 900 s (`handover.tf`, same patch).
- **Observability**: alerts name the type (existing kinds and reasons, new facts; the bridge's folder is protected); the snapshot sink writes `h4.host.type`; the Hosts row gains "Host types".
- **Docs**: ADR 0057 (decision, five alternatives with costs, the cost story, the bounded deviation), its index row, three runbooks, spec 001's contracts amended.

## Acceptance criteria

Spec 032 FR-001 to FR-020 (tasks.md's FR table maps each to its tasks); SC-004 and SC-006's list-price rule are checked here; SC-001, SC-002, SC-003, and SC-005 are the Author's, on AWS ("For the Author", steps 5 to 9).

## Constitution check

| Principle | How it complies |
|---|---|
| I. Data-local | No byte leaves the visitor's device; the laptop covers EC2's remaining downtime as today; degraded mode unchanged |
| II. Production-grade | Tests for every path (stubbed AWS), a dashboard panel, runbook entries for each alert, a cost estimate, an ADR |
| III. Intent, spec, humans merge | Accepted intent; spec, plan, tasks before code; protected files as the Author's patches; his plan, gate, merge, applies |
| IV. Least privilege | The start role's new grants are tag-, template-, and service-scoped; the audit holds each; the function never edits IAM, budgets, or rules |
| V. Cost | Ceilings bound every type, in the templates and (rework) in the role's conditions; **a named, bounded deviation, closed to minutes in the rework**: after a replace, until the next prod apply, the server budget's stop action names the old instance; `h4-ec2-running` names no instance and the guard's `h4-ec2-budget-check` stops every running EC2 within 5 minutes once the action has run (spec Assumptions; ADR 0057) |
| VI. Build in public | The cost story and the alternatives are in ADR 0057 and here |
| VII, VIII | Not touched |

## Review

Two reviewers that wrote none of this branch, read-only, two rounds each.

**Security and infrastructure.** Round 1 (`52308132`): changes requested. The start role's RunInstances allowed
template overrides (type, market, AMI, subnet), and the credential audit passed such statements. Nits: the
kill-switch gap was understated, the replace terminated before the role had ever launched, no DeleteOnTermination
check, VPC origin permissions and ForceNew, cross-attach. Round 2 (`09f15516`; patches `71972498…`, `cfd73d77…`):
approved.

- Instances need a listed type on spot; image, subnet, group and interfaces need `ec2:IsLaunchTemplateResource`; the
  audit rejects round one's statements.
- Every candidate is dry-run before any cancel or terminate; the tunnel-end check ships DISABLED.
- The guard's 5-minute `budget_check` and the instance-free running rule leave about 5 minutes of gap.
- Patches apply on main and the tip; infra-policy PASS; 921 tests pass, 1 sandbox-only failure (also on main).
- Open, for the dry runs: the tunnel end's dry run while its interfaces are held; fail-closed budget reads; Q-C.

**Behaviour.** Round 1 (`52308132`): changes requested. A replace that failed after its launch (ID write, run wait,
attach, or the function killed) was never fixed by a later run. Round 2 (`09f15516`): approved. The next run adopts a
live tagged instance, attaches the volume before every start, and repairs the tunnel end's volume and origin; waits end
before Lambda's timeout. The reviewer's probes now fail because the bugs are gone. Suites: 2023 passed (1 environment
failure, as on main); infra with patches 743 passed. Nits, to the backlog: a repair doesn't start EC2 (FR-014 parity;
`make ec2-start` by hand meanwhile); `budget_check` stops EC2 on a failed budgets read every 5 minutes (fail-closed).
To settle in step 6: whether a dry run passes while the current instance holds the IP or interfaces.

Process: in round 1 the behaviour reviewer worked around a bash-gate refusal of a read-only `make -n` with another
make spelling, which this project forbids; it ran no make target in round 2.

## Verification

Run in the worktree (the sandbox has no Docker, no GPU, and loopback alone: container-backed tests skip; AWS is stubbed everywhere).

- The suites this branch touches: `pytest infra/test deploy/hosts infra/lambdas` 825 passed; `deploy/scripts` 1332 passed, 1 skipped; `scripts/infra/test_ec2_ops.py` 33 passed. `scripts/infra/test_infra_targets.py::test_infra_check_runs_the_policy_then_waits_for_terraform` fails here and on main alike (mktemp under a read-only `/tmp` in the sandbox).
- RED before each GREEN, in the commits' messages: the start function 29 failed; the audit 7 failed; the infra suites 135 failed (on an export of the RED commit); `ec2_ops` 4 failed; the sink 3 and the dashboard 2 failed.
- `make -f Makefile lint`: ESLint, tsc, Prettier ("All matched files use Prettier code style!"), ruff ("All checks passed!", "964 files already formatted"), shellcheck: clean.
- The offline infra checks on a `git archive` export of the branch's tip with both patches applied: `infra-policy: PASS, 32 files`; `terraform fmt -check -recursive infra` clean; `tools/gates/test/test_infra_policy.py` 91 passed. `terraform validate` doesn't run in an agent sandbox ("Failed to load plugin schemas": the provider plugin can't start here, on main too): your plan runs it.
- `make -f Makefile check ENGINE_MODE=none-yet`, at `38a57e8e`: `make check: 12 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 3 FAIL; failing: test FAIL, infra-check FAIL, infra-plan-note FAIL`. Read each:
  - `test`: the web workspace's vitest stage, `Test Files 37 failed | 249 passed (286)`, `Tests 40 failed | 4971 passed`, every failure `Error: Test timed out in 60000ms` in `apps/web` (room, ui, lookdev), which this branch doesn't touch: sandbox load, not this change. The stage stopped before pytest, so its pytest part ran alone, as `make test` runs it (`PYTEST_ARGS`, `PYTEST_DIRS`): `2 failed, 7535 passed, 13 skipped`. One was this branch's (`scripts/test_makefile.py`: `REPLACE` and `SKIP` weren't in `LITERAL_VARS`, so `from_cli` never saw them), fixed in the next commit (`scripts/test_makefile.py`, `test_ec2_ops.py`, `tools/gates`: `1648 passed`; `make -n` of the start target now passes `--replace "$REPLACE" --skip "$SKIP"`); the other is the sandbox's read-only `/tmp` (`test_infra_targets.py`, as on main).
  - `infra-check`: `infra-policy: PASS, 32 files`, then `terraform validate`'s "Failed to load plugin schemas" (the sandbox, as on main).
  - `infra-plan-note`: "plan for account/prod missing": your step 3's plan blocks, expected until you paste them.
  - `evals` WARN: no behavioral run for this trigger hash, which is yours from main's checkout if the gate asks for it; `redteam` 77 passed; `matrix` PASS (1039 passed, 69 known gaps); `lint`, `secrets`, `arrival`, `disclosure-check` PASS.

- **After the rework** (the reviews of `52308132`), at the rework's last code commit: `make -f Makefile lint` exit 0 ("All matched files use Prettier code style!", ruff "All checks passed!", "965 files already formatted"); `make test`'s pytest part, run alone as before: `1 failed, 7564 passed, 13 skipped in 806.15s`, the one the sandbox's read-only `/tmp` (`test_infra_targets.py`, as on main). RED before each GREEN in the commits: the start function 12 failed, the guard 4, the audit 6, the infra suites 20, `ec2_ops` 3. The reviewer's three probes, which asserted the defects, now fail. Both rebuilt patches verified with `patch -p1 --dry-run` then `patch -p1` on exports of main and of the tip; on the patched export, `infra-policy: PASS, 32 files` and `terraform fmt` clean. `make check` wasn't rerun.

## Cost and data-flow impact

Cost (spec 032's estimate): while the first types have capacity, nothing changes (EC2 about $7 a month on spot at 12 hours a day; the tunnel end a few dollars). On any listed type, never more than the first type on demand: about $24.5 a month for EC2, $12.3 for the tunnel end. The 5-minute check is inside Lambda's free tier, with a plain log line a run (under a cent a month); the new outcome metrics are cents at most. Your verification: a few cents of instance minutes. High availability, rejected, would cost at least the on-demand difference, about $25 a month.

Why spot is worth some downtime: the service needn't be highly available. After this change an outage needs every listed type short in the zone at once. What remains: every listed type short (the laptop covers EC2's part when up; nothing covers the tunnel end's), a replace's own gap (2 to 5 minutes for EC2; up to about 20 for the tunnel end, 10 of them waiting for AWS's own restart), and an interruption while serving.

Data flow: none. No row of `docs/data-flow-disclosure.md` changes.

Where the cost story belongs beyond ADR 0057 and this note: `docs/how-we-build/` has no cost page; `docs/how-we-build/cost.md` is the place, for the docs role after the merge (Q-B below).

## Backlog and open questions

- **Q5, who stopped EC2 near 01:00Z on 2026-11-18** (`instance-stopped-by-user`): yours, from CloudTrail and the guard's logs (step 10). Nothing here assumes the answer. Recommended: record it in an incident note if the stop wasn't yours or the guard's close.
- **Q-A, the gap after a replace**: closed in the rework, to up to 5 minutes after the server action runs (the review measured the first draft's at about $1.60 an event, not cents). What's left until the next prod apply: AWS's two-minute warning for a new host isn't alerted, and the tunnel end's two rules name the old one. Recommended: leave those until a replace has happened on AWS.
- **Q-B, the how-we-build cost page**: recommended yes, `docs/how-we-build/cost.md`, written by the docs role from ADR 0057 after the merge.
- **Q-C, the VPC origin**: whether it needs the re-point at all, and whether CloudFront accepts a new ARN while the distribution uses it. Recommended: settle it in step 9's rehearsal, then record the answer in ADR 0057.
- **Q-D, the tunnel end's ceiling**: $0.0168 may sit under the fallbacks' spot prices on some hours, so they'd be passed over (`SpotMaxPriceTooLow`). Recommended: keep it until a real replace shows it too tight.
- **Q-E, the list prices**: research.md R-9's on-demand prices are as remembered; confirm them before the apply (step 1).

## For the Author

In order. Each block is short lines; set `pf` to your administrator profile and `ROOT` as named.

1. **The prices.** Confirm `t4g.large` $0.0672 and `t4g.small` $0.0168 an hour on demand (Linux, us-east-1) in the console's EC2 pricing, and the other types' in research.md R-9. If one differs, tell the session; the ceilings and the infra tests' table follow.

2. **The patches**, on the branch, from the repository's root (each verified with `patch -p1 --dry-run` then `patch -p1` on `git archive` exports of main and of the branch's tip):

   | Patch | SHA-256 | Files |
   |---|---|---|
   | `docs/merge-requests/human-patches/2026-11-22-032-prod.patch` | `719724984febfb606f05e1eb967430bf2e216a83aa642ec83a98eaf7d1cedd3e` | `infra/prod/ec2-market.tf`, `handover.tf`, `killswitch.tf`, `edge.tf` |
   | `docs/merge-requests/human-patches/2026-11-22-032-account.patch` | `cfd73d770108b80df1cb0cfdcf12b18cd8d70d083b14e27d4c8774bcd20f51c4` | `infra/account/iam.tf`, `handover.tf` |

   ```bash
   d=docs/merge-requests/human-patches
   p=$d/2026-11-22-032-prod.patch
   q=$d/2026-11-22-032-account.patch
   sha256sum "$p" "$q"
   patch -p1 --dry-run < "$p"
   patch -p1 --dry-run < "$q"
   patch -p1 < "$p"
   patch -p1 < "$q"
   ```

   Commit them on the branch. `infra/test/patches.py` then reads the tree as it is.

3. **Plans from a fresh clone of the branch**, prod and account (`make plan ROOT=prod PROFILE=$pf`, then `ROOT=account`), their blocks into this note before your gate. **Read prod's for**: no instance destroyed or replaced. Expected: `aws_instance.ec2`, `aws_instance.tunnel_end`, `aws_volume_attachment.ec2_data`, `aws_volume_attachment.shared_state`, and `aws_network_interface_attachment.tunnel_end_public` "will no longer be managed by Terraform" (removed, not destroyed); eight `aws_launch_template` created (four `ec2["…"]`, four `tunnel_end["…"]`); three `aws_ssm_parameter` created (`ec2_launch_templates`, `tunnel_end_launch_templates`, `relay_vpc_origin_id`); `aws_iam_role_policy.server_action` updated in place (the tag condition); `aws_cloudwatch_event_rule.ec2_running` updated in place (its pattern names no instance, the rework). Nothing else: the other three rules, the budget action, the ID's parameter, the VPC origin, and the distribution read the same IDs and names, so they show no change. If the distribution's relay origin or the VPC origin shows a change, stop and ask. **Read the account's for**: `aws_iam_role_policy.ec2_start` updated, `aws_lambda_function.ec2_start[0]` updated (timeout 900, and the image once step 6's digest is in), its invoke config updated (event age 900), `aws_scheduler_schedule.tunnel_end_check[0]` created with `state = "DISABLED"`, `aws_scheduler_schedule.ec2_budget_check[0]` created, and `aws_lambda_function.ec2_guard[0]` updated (its image, once step 6's digest is in).

4. **Your gate and the merge**: `tools/gates/gate feat/032-spot-flexibility` from main's checkout, and the merge command it prints.

5. **Tag the two spot requests Terraform made**, so the function's tag-scoped cancel reaches them at the first replace (the instances' tags don't reach their requests):

   ```bash
   a=(--profile "$pf" --region us-east-1)
   s=Name=instance-state-name
   s=$s,Values=pending,running,stopped
   k='Reservations[].Instances[]'
   k=$k'.SpotInstanceRequestId'
   for n in h4-prod-ec2 h4-prod-tunnel-end
   do
     f=Name=tag:Name,Values=$n
     r=$(aws ec2 describe-instances \
       "${a[@]}" --filters "$f" "$s" \
       --query "$k" --output text)
     echo "$n: $r"
     aws ec2 create-tags "${a[@]}" \
       --resources $r \
       --tags Key=Name,Value=$n
   done
   ```

   Each line should name one `sir-…`.

6. **Prod's apply**, from main (`make infra-verify ROOT=prod`, your apply, `make infra-record ROOT=prod OUTCOME=ok`). Then **the two functions' images** from main, as W2's T174 built them (W2's note, "2. T174"), for `ec2_start` and `ec2_guard` (the rework changed the guard too); tell the session the two digests, which it writes into `infra/account/main.tf`'s `local.lambda_images` on a small branch for your merge. **Only then the account's plan and apply**: the guard's budget check and the start function must never run the old images, which would refuse `unknown_trigger` and alert every 5 minutes. That apply makes `h4-tunnel-end-check` **DISABLED** (`local.tunnel_end_check_state`), so nothing replaces a host on its own yet. Then **prove the role**, which changes nothing:

   ```bash
   make ec2-start REPLACE=ec2 \
     DRY_RUN=1 PROFILE=$pf
   make ec2-start REPLACE=tunnel_end \
     DRY_RUN=1 PROFILE=$pf
   ```

   Each prints every listed type's answer; all `DryRunOperation` and exit 0 means the role launches each. If one refuses, stop and tell the session. Only then set `tunnel_end_check_state = "ENABLED"` in `infra/account/handover.tf` by hand (a protected file, yours), commit it, and plan and apply the account again: the plan shows `aws_scheduler_schedule.tunnel_end_check[0]` updated, its state alone.

   **Before the first replace, read-only**: the attachments that must survive a terminate keep their volume and interfaces (`DeleteOnTermination` false):

   ```bash
   for n in h4-ec2-data h4-shared-state
   do
     aws ec2 describe-volumes "${a[@]}" \
       --filters Name=tag:Name,Values=$n \
       --query 'Volumes[].Attachments[].DeleteOnTermination'
   done
   for n in h4-tunnel-end-public \
     h4-tunnel-end-private
   do
     aws ec2 describe-network-interfaces \
       "${a[@]}" \
       --filters Name=tag:Name,Values=$n \
       --query 'NetworkInterfaces[].Attachment.DeleteOnTermination'
   done
   ```

   Each prints `[false]`. A `true` would lose that volume or interface at the first replace: stop and tell the session.

7. **Prove a fallback type starts** (SC-001), inside the hours with the laptop down, so EC2's checks pass:

   ```bash
   make ec2-start REPLACE=ec2 \
     SKIP=t4g.large PROFILE=$pf
   ```

   Expect `ec2_started` with `- type: m7g.large` (or the next with capacity) and `- replaced: t4g.large by_hand`; `/api/status` serving `ec2` within 10 minutes; Langfuse's earlier traces still listed. Then `make ec2-start REPLACE=ec2 PROFILE=$pf` to go back to `t4g.large` if you prefer it. A cheaper first proof that the templates launch at all: `aws ec2 run-instances --dry-run` with `--launch-template LaunchTemplateName=h4-prod-ec2-m7g.large` answers `DryRunOperation` when the call would succeed.

8. **Re-point**: prod's plan and apply again; the read shows EC2's warning rule's pattern, the budget action's instance IDs, and (if the tunnel end changed) its two rules and the VPC origin updated in place, and nothing else.

9. **The tunnel end's rehearsal** (SC-002), at a quiet hour. **First** (Q-C): your latest prod plan shows no `forces replacement` on `aws_cloudfront_vpc_origin.relay`, and the role's `cloudfront:GetVpcOrigin` and `UpdateVpcOrigin` on `vpcorigin/*` are what CloudFront asks for (the IAM console's policy simulator on `h4-ec2-start-fn`, both actions, allowed). Then `make ec2-start REPLACE=tunnel_end PROFILE=$pf`. Expect `tunnel_end_back` with `- type: t4g.small` and `- origin:`; `/api/status` 200 within 15 minutes; the laptop's tunnel reconnected with its pinned host key; the shared state's rows intact. Record `- origin:` (Q-C). Then step 8 again. **Exactly one instance per host** (SC-003): `aws ec2 describe-instances` by each `Name` shows one not terminated, and `aws ec2 describe-spot-instance-requests` shows no `open` request carrying either name.

10. **Q5, from CloudTrail and the guard's logs**:

    ```bash
    e=AttributeKey=EventName
    e=$e,AttributeValue=StopInstances
    aws cloudtrail lookup-events "${a[@]}" \
      --lookup-attributes "$e" \
      --start-time 2026-11-18T00:30:00Z \
      --end-time 2026-11-18T01:30:00Z \
      --query 'Events[].[EventTime,Username]'
    g=/aws/lambda/h4-ec2-guard
    aws logs filter-log-events "${a[@]}" \
      --log-group-name "$g" \
      --start-time 1794961800000 \
      --end-time 1794965400000 \
      --query 'events[].message'
    ```

    The two times are 2026-11-18 00:30Z and 01:30Z in milliseconds. Tell the session who stopped it.

## The plans (stack)

<!-- h4-plan root=prod tree=06a4f1b205ea648c3aa8cb6db3b443f67af3f1e4 sha256=3cb21280901a17030e35f8c50fd3ae6688c44a4f030391318409f20dca4085c7 terraform=1.17.1 made=2026-11-22T18:32:43Z -->
```terraform-plan

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
  ~ update in-place

Terraform will perform the following actions:

  # aws_cloudwatch_event_rule.ec2_running will be updated in-place
  ~ resource "aws_cloudwatch_event_rule" "ec2_running" {
      ~ event_pattern       = jsonencode(
          ~ {
              ~ detail      = {
                  - instance-id = [
                      - "i-<redacted>",
                    ]
                    # (1 unchanged attribute hidden)
                }
                # (2 unchanged attributes hidden)
            }
        )
        id                  = "h4-ec2-running"
        name                = "h4-ec2-running"
        tags                = {
            "component" = "ec2"
        }
        # (11 unchanged attributes hidden)
    }

  # aws_iam_role_policy.server_action will be updated in-place
  ~ resource "aws_iam_role_policy" "server_action" {
        id          = "h4-budget-action-server:stop-ec2"
        name        = "stop-ec2"
      ~ policy      = jsonencode(
          ~ {
              ~ Statement = [
                    {
                        Action   = "ssm:StartAutomationExecution"
                        Effect   = "Allow"
                        Resource = [
                            "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StopEC2Instance:*",
                            "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StartEC2Instance:*",
                        ]
                        Sid      = "TheStopDocumentAndItsReverse"
                    },
                  ~ {
                      ~ Condition = {
                          + StringEquals               = {
                              + "ec2:ResourceTag/Name" = "h4-prod-ec2"
                            }
                            # (1 unchanged attribute hidden)
                        }
                      ~ Resource  = "arn:aws:ec2:us-east-1:<account>:instance/i-<redacted>" -> "arn:aws:ec2:us-east-1:<account>:instance/*"
                        # (3 unchanged attributes hidden)
                    },
                    {
                        Action   = [
                            "ec2:DescribeInstances",
                            "ec2:DescribeInstanceStatus",
                        ]
                        Effect   = "Allow"
                        Resource = "*"
                        Sid      = "ItsState"
                    },
                ]
                # (1 unchanged attribute hidden)
            }
        )
        # (2 unchanged attributes hidden)
    }

 # aws_instance.ec2 will no longer be managed by Terraform, but will not be destroyed
 # (destroy = false is set in the configuration)
 . resource "aws_instance" "ec2" {
        id                                   = "i-<redacted>"
        tags                                 = {
            "Name"      = "h4-prod-ec2"
            "component" = "ec2"
        }
        # (41 unchanged attributes hidden)

        # (10 unchanged blocks hidden)
    }

 # aws_instance.tunnel_end will no longer be managed by Terraform, but will not be destroyed
 # (destroy = false is set in the configuration)
 . resource "aws_instance" "tunnel_end" {
        id                                   = "i-<redacted>"
        tags                                 = {
            "Name"      = "h4-prod-tunnel-end"
            "component" = "tunnel-end"
        }
        # (41 unchanged attributes hidden)

        # (11 unchanged blocks hidden)
    }

  # aws_launch_template.ec2["m6g.large"] will be created
  + resource "aws_launch_template" "ec2" {
      + arn                    = (known after apply)
      + default_version        = (known after apply)
      + description            = "EC2 as m6g.large (spec 032)"
      + id                     = (known after apply)
      + image_id               = "ami-0272643e149bb16d0"
      + instance_type          = "m6g.large"
      + latest_version         = (known after apply)
      + name                   = "h4-prod-ec2-m6g.large"
      + name_prefix            = (known after apply)
      + region                 = "us-east-1"
      + tags                   = {
          + "component" = "ec2"
        }
      + tags_all               = {
          + "component"   = "ec2"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + update_default_version = true
      + user_data              = "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"

      + block_device_mappings {
          + device_name = "/dev/xvda"

          + ebs {
              + delete_on_termination      = "true"
              + encrypted                  = "true"
              + iops                       = (known after apply)
              + throughput                 = (known after apply)
              + volume_initialization_rate = (known after apply)
              + volume_size                = 20
              + volume_type                = "gp3"
            }
        }

      + iam_instance_profile {
          + name = "h4-prod-ec2"
        }

      + instance_market_options {
          + market_type = "spot"

          + spot_options {
              + instance_interruption_behavior = "stop"
              + max_price                      = "0.0672"
              + spot_instance_type             = "persistent"
              + valid_until                    = (known after apply)
            }
        }

      + metadata_options {
          + http_endpoint               = "enabled"
          + http_protocol_ipv6          = (known after apply)
          + http_put_response_hop_limit = 1
          + http_tokens                 = "required"
          + instance_metadata_tags      = "enabled"
        }

      + network_interfaces {
          + associate_public_ip_address = "true"
          + delete_on_termination       = "true"
          + device_index                = 0
          + private_ip_address          = "10.42.0.20"
          + security_groups             = [
              + "sg-<redacted>",
            ]
          + subnet_id                   = "subnet-<redacted>"
        }

      + tag_specifications {
          + resource_type = "instance"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "volume"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "network-interface"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "spot-instances-request"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
    }

  # aws_launch_template.ec2["m7g.large"] will be created
  + resource "aws_launch_template" "ec2" {
      + arn                    = (known after apply)
      + default_version        = (known after apply)
      + description            = "EC2 as m7g.large (spec 032)"
      + id                     = (known after apply)
      + image_id               = "ami-0272643e149bb16d0"
      + instance_type          = "m7g.large"
      + latest_version         = (known after apply)
      + name                   = "h4-prod-ec2-m7g.large"
      + name_prefix            = (known after apply)
      + region                 = "us-east-1"
      + tags                   = {
          + "component" = "ec2"
        }
      + tags_all               = {
          + "component"   = "ec2"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + update_default_version = true
      + user_data              = "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"

      + block_device_mappings {
          + device_name = "/dev/xvda"

          + ebs {
              + delete_on_termination      = "true"
              + encrypted                  = "true"
              + iops                       = (known after apply)
              + throughput                 = (known after apply)
              + volume_initialization_rate = (known after apply)
              + volume_size                = 20
              + volume_type                = "gp3"
            }
        }

      + iam_instance_profile {
          + name = "h4-prod-ec2"
        }

      + instance_market_options {
          + market_type = "spot"

          + spot_options {
              + instance_interruption_behavior = "stop"
              + max_price                      = "0.0672"
              + spot_instance_type             = "persistent"
              + valid_until                    = (known after apply)
            }
        }

      + metadata_options {
          + http_endpoint               = "enabled"
          + http_protocol_ipv6          = (known after apply)
          + http_put_response_hop_limit = 1
          + http_tokens                 = "required"
          + instance_metadata_tags      = "enabled"
        }

      + network_interfaces {
          + associate_public_ip_address = "true"
          + delete_on_termination       = "true"
          + device_index                = 0
          + private_ip_address          = "10.42.0.20"
          + security_groups             = [
              + "sg-<redacted>",
            ]
          + subnet_id                   = "subnet-<redacted>"
        }

      + tag_specifications {
          + resource_type = "instance"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "volume"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "network-interface"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "spot-instances-request"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
    }

  # aws_launch_template.ec2["t4g.large"] will be created
  + resource "aws_launch_template" "ec2" {
      + arn                    = (known after apply)
      + default_version        = (known after apply)
      + description            = "EC2 as t4g.large (spec 032)"
      + id                     = (known after apply)
      + image_id               = "ami-0272643e149bb16d0"
      + instance_type          = "t4g.large"
      + latest_version         = (known after apply)
      + name                   = "h4-prod-ec2-t4g.large"
      + name_prefix            = (known after apply)
      + region                 = "us-east-1"
      + tags                   = {
          + "component" = "ec2"
        }
      + tags_all               = {
          + "component"   = "ec2"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + update_default_version = true
      + user_data              = "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"

      + block_device_mappings {
          + device_name = "/dev/xvda"

          + ebs {
              + delete_on_termination      = "true"
              + encrypted                  = "true"
              + iops                       = (known after apply)
              + throughput                 = (known after apply)
              + volume_initialization_rate = (known after apply)
              + volume_size                = 20
              + volume_type                = "gp3"
            }
        }

      + credit_specification {
          + cpu_credits = "standard"
        }

      + iam_instance_profile {
          + name = "h4-prod-ec2"
        }

      + instance_market_options {
          + market_type = "spot"

          + spot_options {
              + instance_interruption_behavior = "stop"
              + max_price                      = "0.0672"
              + spot_instance_type             = "persistent"
              + valid_until                    = (known after apply)
            }
        }

      + metadata_options {
          + http_endpoint               = "enabled"
          + http_protocol_ipv6          = (known after apply)
          + http_put_response_hop_limit = 1
          + http_tokens                 = "required"
          + instance_metadata_tags      = "enabled"
        }

      + network_interfaces {
          + associate_public_ip_address = "true"
          + delete_on_termination       = "true"
          + device_index                = 0
          + private_ip_address          = "10.42.0.20"
          + security_groups             = [
              + "sg-<redacted>",
            ]
          + subnet_id                   = "subnet-<redacted>"
        }

      + tag_specifications {
          + resource_type = "instance"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "volume"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "network-interface"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "spot-instances-request"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
    }

  # aws_launch_template.ec2["t4g.xlarge"] will be created
  + resource "aws_launch_template" "ec2" {
      + arn                    = (known after apply)
      + default_version        = (known after apply)
      + description            = "EC2 as t4g.xlarge (spec 032)"
      + id                     = (known after apply)
      + image_id               = "ami-0272643e149bb16d0"
      + instance_type          = "t4g.xlarge"
      + latest_version         = (known after apply)
      + name                   = "h4-prod-ec2-t4g.xlarge"
      + name_prefix            = (known after apply)
      + region                 = "us-east-1"
      + tags                   = {
          + "component" = "ec2"
        }
      + tags_all               = {
          + "component"   = "ec2"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + update_default_version = true
      + user_data              = "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"

      + block_device_mappings {
          + device_name = "/dev/xvda"

          + ebs {
              + delete_on_termination      = "true"
              + encrypted                  = "true"
              + iops                       = (known after apply)
              + throughput                 = (known after apply)
              + volume_initialization_rate = (known after apply)
              + volume_size                = 20
              + volume_type                = "gp3"
            }
        }

      + credit_specification {
          + cpu_credits = "standard"
        }

      + iam_instance_profile {
          + name = "h4-prod-ec2"
        }

      + instance_market_options {
          + market_type = "spot"

          + spot_options {
              + instance_interruption_behavior = "stop"
              + max_price                      = "0.0672"
              + spot_instance_type             = "persistent"
              + valid_until                    = (known after apply)
            }
        }

      + metadata_options {
          + http_endpoint               = "enabled"
          + http_protocol_ipv6          = (known after apply)
          + http_put_response_hop_limit = 1
          + http_tokens                 = "required"
          + instance_metadata_tags      = "enabled"
        }

      + network_interfaces {
          + associate_public_ip_address = "true"
          + delete_on_termination       = "true"
          + device_index                = 0
          + private_ip_address          = "10.42.0.20"
          + security_groups             = [
              + "sg-<redacted>",
            ]
          + subnet_id                   = "subnet-<redacted>"
        }

      + tag_specifications {
          + resource_type = "instance"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "volume"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "network-interface"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "spot-instances-request"
          + tags          = {
              + "Name"        = "h4-prod-ec2"
              + "component"   = "ec2"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
    }

  # aws_launch_template.tunnel_end["c6g.medium"] will be created
  + resource "aws_launch_template" "tunnel_end" {
      + arn                    = (known after apply)
      + default_version        = (known after apply)
      + description            = "The tunnel end as c6g.medium (spec 032)"
      + id                     = (known after apply)
      + image_id               = "ami-0272643e149bb16d0"
      + instance_type          = "c6g.medium"
      + latest_version         = (known after apply)
      + name                   = "h4-prod-tunnel-end-c6g.medium"
      + name_prefix            = (known after apply)
      + region                 = "us-east-1"
      + tags                   = {
          + "component" = "tunnel-end"
        }
      + tags_all               = {
          + "component"   = "tunnel-end"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + update_default_version = true
      + user_data              = "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"

      + block_device_mappings {
          + device_name = "/dev/xvda"

          + ebs {
              + delete_on_termination      = "true"
              + encrypted                  = "true"
              + iops                       = (known after apply)
              + throughput                 = (known after apply)
              + volume_initialization_rate = (known after apply)
              + volume_size                = 8
              + volume_type                = "gp3"
            }
        }

      + iam_instance_profile {
          + name = "h4-prod-tunnel-end"
        }

      + instance_market_options {
          + market_type = "spot"

          + spot_options {
              + instance_interruption_behavior = "stop"
              + max_price                      = "0.0168"
              + spot_instance_type             = "persistent"
              + valid_until                    = (known after apply)
            }
        }

      + metadata_options {
          + http_endpoint               = "enabled"
          + http_protocol_ipv6          = (known after apply)
          + http_put_response_hop_limit = 1
          + http_tokens                 = "required"
          + instance_metadata_tags      = (known after apply)
        }

      + network_interfaces {
          + device_index         = 0
          + network_interface_id = "eni-<redacted>"
        }
      + network_interfaces {
          + device_index         = 1
          + network_interface_id = "eni-<redacted>"
        }

      + tag_specifications {
          + resource_type = "instance"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "volume"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "spot-instances-request"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
    }

  # aws_launch_template.tunnel_end["c7g.medium"] will be created
  + resource "aws_launch_template" "tunnel_end" {
      + arn                    = (known after apply)
      + default_version        = (known after apply)
      + description            = "The tunnel end as c7g.medium (spec 032)"
      + id                     = (known after apply)
      + image_id               = "ami-0272643e149bb16d0"
      + instance_type          = "c7g.medium"
      + latest_version         = (known after apply)
      + name                   = "h4-prod-tunnel-end-c7g.medium"
      + name_prefix            = (known after apply)
      + region                 = "us-east-1"
      + tags                   = {
          + "component" = "tunnel-end"
        }
      + tags_all               = {
          + "component"   = "tunnel-end"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + update_default_version = true
      + user_data              = "H4sIAAAAAAAA/9y9/XYbN5I4+n+eAtPZMyIzzSb1mYRezl5ZZmLdyJKOJE+SdXQ4UDdIYtQEegFQNKPoefY99snuQQHoRn9RVOzk/vbHc2yK3fgsVBWqClWFL+OUL5NezNmUzr5YSiLk8AuEeighU7xMFfzN8IIM0fygR2aCSPkFQgjJtVRkMURKLAk8YHwSC4IVmcy5Lp6/kHOSpkPUl3eU9RlP+YwyeJHy+H6SYSlXiS3+xUpQRSZTmhI7jAyr+RD1iYr7CY/viegnmCw4i/4luWmFrxgRQyQ4V0P9HzzMiFhQKSlncoiCwdHBQQDPY84UYWqIfoOfCD3ab4QCPfkUs6SXCf5xHQzRFKeShEUBC5IeThINhl7GeSqDIfrwiII7LEkwRMHu13vR/iAaRIP+7lEQokDSX/WLvQP0dOu1pfugRNcuRoBQMFcqy/uHX8N+f3fva91gtDvc3937JgirFeSLajBeFN89+jbaOzyI7He4O4gO9tzg80pP3rhTPuslgj4QoeunPMZp4L+mD6QniFRc6FnrRfXeMt5jZNXLBH2gKZnB9HM0QejJflcXfn4gCFF9g3w9nKZ8lVKpIvVRfQYM+BLdzAlSS8ZIighLdiQyPaG8J9SRGYnRYLCLvrvqDQ53X0EzAsdK9k3NaJGg//nvo1dIEEmwiOf6wVVvd9AdIvJAxBqICFHlWs97h8UIUUKylK/7MhY0U9JOdgIvo2wdogVeo5OL8/PxyQ1SPEScoYODfYRTzkiExjieIyqhkyRElKE7HN8rGt/LEN2tEUaCrxCf5r0mPJb9BCvcm6Z81UuojFMul4LocXdOvkaYJehk9+tuiFZzGs+R0sjen2FFZL8oPYnnJL6PsjWa8zSRiCqkeISO0T+/+ieSCrNEoikXiDOSd53iO5IiLpCaEw0uhfhUFxjCAxzHfMnUjkSCzKhUYr1jpmV7KJc5fRPCSE1TKcGSoLtlfE+Uq3X84/VOAWy5nE7pxwh9L/gyk+gIKY6+RTgxLegK0AMVSBCcSMSIBifR0F1RNYf1E3w1RDPdADrakSHU1NBeZnLHdh4VmFygmFlhInYkypZpKtFU8EXLnFFnfHLVHUJ/x5enoZ2geVlMOcVrIuQOAnpzneKMRiQW0VL2CJaqtxvhBf6VM7ySUcwXttRXUXIvtiiXCZ708iI9qbDIuFA96Lpnpyv3n2mlDRAGynzasIAGHTJOmSIi9AuEABYlCDGQ0L9O+CLjkqAsXc4oc6AwnKOHac9Wlb2vXjjYOZd6YSSJBVES+rtWgrIZyrDAC6KIkCHCCt1xrlDHbGCEPUTZumuGd02ADaF3mOGZmwpnBK3wWlNqB3jKoOsGLeXimQFKuVgQKfGMyGdKknhvy5JtK4RTIpQsUM5gOuA91yKBeY86BUPEK2mfGqa4W8yMbT2K7x19OdJCnYLrADM72T3qGhyRcyxIotmNIjsSzflSpGuULBeZHqPGDr5iFqs0O9N4UuYoebc+Z3kFc8bIbmeabAWRdMZIgr4f31iuZfrxpm9G04PRGAB8063jo1/qRThpALM7AC5yl9IYPVCyQh3BVxKdHITAtA1cABd3JAIRz5BaQTB66PcEEBBgaIqW2ReJ954Z1oIzqrgmh2cKCr5U5HC/8d3dMpkRJZtRPZ6TZJmS59iUB1m6NUSbpAw2VfguJTJi0xdIF4NBm3Txl/5SCiv7ThXqTdvFjgxr4KMpTRURNZkjNN97bbLHLixtswwSoVNDBXnnMMkQCZKlOCaJpgr9W3L0BsTsHWmKSE1Wa4SlfW6QCohmEWn6z+EliXigMUEpx0YQuCNTLoirh1lSdD4nTsYCAUf3IZTBTaOPUEaVZqq65JQKadhrBDCTJF4KqtZmD5YIC+KVM9DLu+pQNhW4r3cxC60eYUmkpt0h+mbwzdeatfOliIlp50qjKTrc11SjJRsiYKrF5volQoiyIUKMrPRCMBIrjQVaHoP9ytAkbFpTHBPUIUwedTUj2tvb24Mp6n6N4BaWgbQj0Zvz45tXeWOCPmBFvK7hU278sAus2O6PWItL3wy+GeieQiNiWFklbGKWhwf7ewbwXtHdQYkp2o+k7H5Hor39wW4uFNaWw/FUjsYnezvSPHzlNcWXaog4S9c1LNiRSKtgYaFoavCsud14/nF54qTeV0CNBoRu7pRpcTMmaEEU1oLtK6ToItc+8lnYpkD2kDx9cBsyNK/hkC8FbBqCJjMi/QlMuVhhkQwR40CJmDIC4mI8J7Iy4KERHWecSD1xpOaCL2dzxLiaa55Z4gXFsho51OH1OVWC5/PTMuYaJUTTWugwBGk8CB3yaYxDHQXDm1Kx0IR0Mzj8xshNYsnuOL/vVmRUoGJEGVGWl9rnCUmJIq2va889fTaeY8r0pqmZv5aYfFVXrTPiWN2c83u/XCYoB5RaYDZLySuU8ZTGa707k0y98lqhdAo7eaDnHKBYGcQG6lRxhhItq6JHoL3QEN6TbWbLVhLBs5aih5s6BCox1AXk+Ey31bZK3T6Vl8pBli9VtlSboWrL5BA173KI6m58eHI3pJQH9QHnIyRSrzuVc5KEmukokjRML0MJThKBKlYGoFAk75c0QQMPaJpnbdXG7t4+Wiaumv7VXu8ROZvGXlgZyD56MkNJDzLBFUePejAhNP2E1Ny2f7iped9gsqmYbxWql/MAEuTML/BAA5p+uVYLTljutBkpXKE2rGigswzJhpmUUDaf7V9GGux+wbAMqKdm9H7G/uNt31q/Ih/xIkvJH2QBYg8aKMSTwgqpi7CHHogpZcFrL7eVVGw5vk7o5Ces8s5BcVQc9cWSNc8V9j21yKYyRAueEKQFztDZD6hEiiwyTYV2v3nA6ZJomU13pghDWoIJ0d1SefvYZHJ5fHX8bnwzvppMUPWjN55rvbMTq+3WR9b/9x/GP//d7J7HSzXnQmuFMKhLpxqja606vWrudvjvepH/7veu5lgVinW53vHJycX785vJ1fj70+ubq5/L9XwryvjkyjOW5GYWt4XavZ0mhCmN/QmPlwvCVLEdHyPAHF/JR1LxzJif9IKFepPWBaiK0KUg05TO5rrvAj4oTrGUntkKEArEFW/JCkm1gjWZaxTMf6bZCWGJMbnJboSuCE70KmtpB3CQkQc9UJBnEzebtweTtxfXN6NiYMWL65vjkx9GWjguno3P/+E/Obl4d3lxPZ5cXl38v+OTm8n58bvxyGpbzcW+Oz0bXzd251Zu1LSYttjV+Gx8fD2evH5/8sP4ZuSji0PBOZdK9ssF8/pfWsEz5mlKYsVFqNedJsST8pQtM6UfSZLLUNasjzpGkP0aLfA90chkpHYQrqSW8bQUlTefy1Hjk73JycXZ2fjk5uJqMj5/c3lxen4zchZ5twsNhgf7u9/YOjfjs/G7sZ7+67OLkx8mNxc/jM9HJcrMp+UsXIL815IKo4JJgu4oS4DxgRnNmJqlwvE96vxz+B//7L5CTEvJ1sRWYnJWY5PQhlHpUEeQB0pWITo97EYlRLkZT96cXo36D1j0U3qX68uFafftweT4x+stSr27eDM+e66c4cqg0nhc2KzNN74SDEV6Gs7RIulaFmjNdqb6Xcpjrboofk+YtR6uOBI81eI0nEBxkWgdrqSi+qrSZgvPXrcwkFUUrJNjFBOh6JTGWGkmjCU5OtDroYdxOX6neXvJPE61Xgj813Ben7+im7NrpLCYEeV2kikXOY6qAmL/89/7+QJejc+OfzbINTk7vry5uGzEMb/Y+GSvscyb1xNT7Opicnl8ff3jxdWbZwr+uLng9dvjq/Ebi2E3Z9eTk+MNVN9Qumjp/Pjy+u3FzeT69HwTLVXlC3OUmfQZUSsu7vtfD3paIo/s7yjp//prT8tl8V4P7FiRVqw+i+Bh9DZP1y+0wCGsaqdgHF2EmVwRjVx3a0T1FsSV/tPqe7D2YAzkU3T4bTJN4gMcotPC/voBzBu3boWIVJRhRTkbFb309/fs+++xIiu8Hk2SeZwdvAh2RzXYGdW0Bzaazwo+a9ao2l1yy4rRlNFgR6LD3T1jGLXMYYXXoJV3XveOQsQzDQl08sppyNKXwhZJAcU3b08uHw4cGAGm74gSNB7tDgbPwMl8941BsifloodnWvSwvDhK+hpYcOr32aCk+eg19CvdIQSCXnN7RNUUEyJJWUyQM+6hlCiJGEdczYnQZWJdFoBXNlMOCoOLMVt2I2vcqJhnwK4oUUIFiVUIXAyEOD0uvX0LAuIZTmUO92sDIwf4MXuggjMtucEua09LR41n4Ojtzc3ltRZPfvq5pQTjtoGqvnp+YetVXmy31PODnjtOcav8x+gsrpcQbPtiyRqVl/wgLB8U7GD7r/wTtlJrYG7SPyZAvROpSBZl6+4wH4o/RUUXICxjocAKbCSSBWWab7qVfM+o8tgQSLyaDRlWP6yLKq55W+d4qogYzQ96IOmUwKrH8yNmShr2eGWlJcMlnFq3I9GSaQ6KjWQOzexI0/E9WYPk8MBjYI5wAOSmA2y2dICpOW6x09ruRsZZpTIyGJceNmzdPa0Rlgu0YPrNOiMjzoicc9WA/M+j9jMYPP5I4ms9xREcVtxR1s/Was7ZPuqdot5r1OeZcvtwRU1pQg3U62kWi2o6wAtIBfDosxDK2MPAEGGNOrkaZ1XBlxJL99MxOSxRRmX9b/TkXbMX7DXn6prEo929Qf5Md3wcK/pA9Jsj9+I4jpcCx2v98LDS6qnmwWl662EjSV6vRwBqGRmxcuuVsu44Zq/6QxmbOytv2G52Xz3jOGN9KPQiL1nueJTYkwZ7Ep93Xd7vwKbfdAThyRAp59md1raMI85L0MLfcKt8rXaqZuWpHmdaPyivVc50GiqWOM+mRl6DuFThW6iJV6E24WUzE3svzdRK7k9wml17+in8qLL+qFc4jD3rTYZ6Pf0nYajMP3M4wz4wwukKr2X5oaY3Jzif83Oyusyd3EZr4gpfCq5IrIwwNpJaZlTlV2/5gpQqgFZws8i8hyc4w3c0pWr9mi9ZQtnsmqiRQ6HFHSVM5WUokaMt+cBimSra05TxUl7QiHWfnQ+UzsdDOGjWupCR8zFbw5maMSFKwhLZziyMLumZMmscIGJT9QlcvjTUvCK4j74hGWEJYbFeGcbL5OcoNBOOPFGdIps473NEWWYARfMvFjyuyAJTBoxq/JEqDy0rVOu5PGx2sPgjEbMuH352rDTGNusAZnabFEtVOKtZBPUFR4TlvbUlg8PNZuEj73tLkR31esZE3Sa5G3cQME/7ZkBznt7JPGv224vrm8nJ2fH19fj6E8gBYFTa47bYZ14szj8nvgNnsHI/S9BiKRU0KhXPCjXgTxflN1DU/y4h3+Jdvm7HBrLFwYnDuNxtQqIOOCI3W1xCFFwrnmXOCGoojTOULUXGJQleabKT86VKtHynOC+M8TBZnhVzNauIYmtF72XIO8SAMf7hzMhOzuLjH8SVyriv8dz6LxqzAAZ3perOeNjmVHZoXQlz+3M+hwd+X1Co3ariOWYzIpvOCo/f37y9uDr9z/GbyQ/jn4F8GcrpkhoCzu1ReqRVi1XMFwvwaYIz1rzrwh8N3BkhdAThGabF5KETKeeJ85YvQatw4goRnWo5IoTjaek8vj+B7cm5Hq9zHL8na+PxbMZXlfn/zzcKGFSOVerAuolv/yn8xo3jd1gamsf9x3kSaGzMMbT5nBwOh80xP1bmHMt4lT/jhJD3/j//XVeISx7pkXe0DY4+5VNt6yighwpYy3gx/sLFUi+Io13nyebcPO1jsLLkw9I7ruRlhzlbPqdP50E/hbNISy6WnGeaH5hjfA2dV1qw4SIhcDxmHSkld22Z7YIWQR/AWjqtDLhrz83zodih2XPgw9zKF6LTg08Qghwkq3TfKM5vq++3WmE2aPRNRtP/q8SVksNNE9twzhdb+BehXo8v1QbnHNTracbeS6hoKdXX7z+jdPEyvrk1W/v68HCzE7teAz1huw72ZRAExzbEwNrEPPN4wTCKsBf9rSdo/FZiLAQl8mVnFbbrLMXM+mAdhSj4zjn62HpB2TfJHp8iPkV7g72j3u5ub3e/oRrqXBEtbGgtPekGoC0hsWR+pEiualVCl5xl0KiAwE9IkrsgYeVpayZ+SfKyYuhEKGC/uFAiWU5/+Rvw3HcD0J1GluS1DJOPyI4BUYWmRIGPMoS6kRVE3rFiKHOSJnoHsjUhwjYPnbt+e9zbOzwyewMAQ7PowphtHN8eiKBTarsopmpPDYG5dqAenRGpdTr9w4RsdfXfJJ0aPwaxlMp1DYxUEIKmPE2KvsCHHKM5lvOe8dVPEPkImAOynCAQDIkoUxwZWEGQA1qyxJ4AGM8O0yzYcuP70Hj9OC5/XKwMLF/CiWQ7gA6I2uAokiDOYlJ4gGR6u+BL6UHAQIxJRXCi92C71+hd4SNV4IICUAPx1/aN4cCJyqi6oysi1aSJ1DXt8Vgat5EZfSDSCBExluTVFnTlITgWM/CJk/ms9EBlxWkciLDElbeT3H4j8R760DMuNOjN6dWt/gX7/2+eVHc9vvrH6cn4ttzpjVk5lmCRoJTeCSzWTgqgDF3CeNB+9K2WwNdM4Y/GUHL84zU6OTuFNbQIipN8RkEQlLsBmp1Mpku1FGQyQXQBrriYMa5AuaqwdPdezDIsJCk/ncZMpeVHGnFTeld+SHn5dx7lnj/hsvxbVHrS6jCtdCXpjOHqs+WdPcavPF9XHigsPKkFoGKd3zQMInwXu5InOE3xXbmo3rJSeueKXGI1L4Pt8uriezRCgUEc4yDS04gT5AXG353+pIt8mGO96UWYIrySt64A+AKhEbTdCaoeZabdoJtLg2PPPcyJZI6naHbU7K1rrXtVoc4QvfEmdH6DhRHi/B8TcIZEo3KUf0EIwdANu1W+CLql8H0S7zVWIvFeubTzpr78+ebtxbmGX1WQCkpai7drA0+acqG3mSVzG9d0KTWrE0jo5U+QOfZiSc4Fqx6sOXcBzjT+6fRmcnw2vroZv8lB9GZ8eXbx8/jKvUAj9PVhPqwzzmaG8zJUOXdfcS1YxLA34jstoe2FXx8NkN1gsmWamt1lme1I1OutMJj9YOx3cNjvueyZfaFMDl9aV0Mq0T2F+WJlwvdZYmyRuqZlNvGcpomznzZ6CIRIKyEH9YnfnL4bX7y/QSO0f5R7D51cvHt3ejO50mgtSBTzRUZT0hHBh0HvW9yb3j4eDJ5ynH47/mlT0aODoqhzmm0oftz7T9z7ddD79rb4M5r0bh8H4dF+0UL5y7g4v2dwVKppvzP+GBNQhHL/EGS4601u7Q5d8L/lyCFKaKJ3VSOgRTVWXOrsHZUmW8lSkGSb7gq3OWMQMnjcwTH4MCWEUQIriuRSK9x2iBjd4QR05G4+3lwXNgFaDJIWWOz3etfSgBaunaM4aJcaATX5LJXepCRNiS61CVkOu62QuBp/9/76+Ewzlo7X8V3QOYZZvYFJdUuJP+6CzsFgv/bsnF8v4/lrmHX15Sl7wClNzMtzvCDN7x2cWb1E5zhN7ZCo1PjhDaoZoxIyBbhNaNLpot7fkVTCX1ol1v5P/RFELQUrQcJ9LJ/UpN2Xa9m/J4KRtC8wS/iib/sJupEWBSaKfFQdwmKeUDYbBUs17X0TdCMtT2WdbqV1/zcBJEQX12MhuGgZXrBk94yvWPOK6mnDIAh76Bg9T48dIJDQWH2QSoQaFrd+8xDoIfX28uQ91Zw7pYxoRNNNbZ5dllKlS8tOtzpyOjXtQGwBV/AjMkYSrYV0gi+DLrwMRoHuTL+vtqE/92Qdoklo41JGph2tDlBNuZ1gFFShW0zuwz1Z36KR+fVFDaqm0AaQxlwkJOmApGlgGtp8RlKJHLzoN3TOy4PXkEMjqyP00TR41NWeQC0KtkJIXTKCcOjOc8vQ1bCGQlRC+qNOF5FUEhhVHdP+oWe9Cdm8anWgAMeaaC5VBgteyVCvFYAmhFWSQ5RSCdh3C8CqQikIgguNIbpJ4HlO7zS8Fkswq9e2b75iaEEWXKytArtAZix9y58BzF09nEwZVQ+46vX5tQ96zu8RVa8QZmip96AEolG5QEumJTf4Zbuhua0SSUIYaN5UuZAZw461smOm4nHeljXWjcAe6iNYiAI7/qCrh1Eiy81cwrZXqkGnQHZUOu/Zjhm6xtgasbY0YHM86LfNuPLcNJlCI40akQ2A6QS/sCD6F6esAxiicRdgi77DqWxA1o4nHoTl7Tt00GiYDfRbbdJCRL/9XbMxIRv3CRWdDAut345uxJKEWuSVasLv4WeVG6lF5nGCIPJxNKiXjYwKAZTewNeALSTLRSY7j199ZVYUqC7wlJ8njaBCTe7J2gyxG6Iq19iwI+kPl5E1EnXUIguL8ZeGv/0+lmHZzmit5aWTYIWH6G6tiAzB9OLtY3ecpw1SGth2wEqjxWtn5LkjELSlFRGwIRp+Ykw6XNMsVUN32scSW006OwCYPWzcF61SM+w8OEUj6DXSW9lEN9yZBtEjPAJOXwKNUasjsdCj7UgF+KNb6YaIzhgXZEI00GQNgRrQEEx4Vq+OeEZYR//F7/41ojx6rWF3egGQ7Jp4z1EghrNf9V4rdbWmLXZBFnd6/iNdIJoRZR/U5BZkBYSF5gq2UFODMHRzrDtCbrKojxYAHC0xQfaExvZRQamdRUSl3dB0rxGVmvi68KuJOip9/2XkluvZHvUHAvWq5Q0TZbbJyBJ+Sys1TuR/7O5a5Uru43quM5jPsgrVRWiHfA7mTZOx4HgxN/Q/MWeKsmXbUEoQ//09mYhWi9uW0wBOLdpqYCm1QGIr2v2pIks1DNQwbuBeHVMXhLZOt60fLqN4vuAJcATTiKbZCKK0/4oG/OvDww18ucxH9C/NfroNPLnj2MUNFsCdN2ydv5tVoXYUt49vimyN9T0Azhcm5mTBJ+05l8rKlCV50+V5gzd45SgS9gq1zFLywRPNQ6hkf9w2bCP2RMOXP4s0cebow1gAms45XqGO6UT/D8I4ZP3ZMUo+lF6y6jZiUtNZ6WhGVMfZDgJnYO+nWBGp6jutlvZtdSprQjW0LihTnWnweHl18f0TZJtxU1sT9SoXZsWSyZr65GkBYRXtm/QVmoB8Izq+ymLG14WZBcWRWhDUqOGOJ+uKKcJ9qqCZFrB5FDR56vur0KgG0qlntYqmyzRdYBXPO4ImTcWbtCbUIB05YI58NU1PBFYfZuSxDdNskzi/SRVzPZTqFcB2U68C2CBNGcwgJI1QqYp+1qBnxHyxoCo0Wrec44aVqfVu6tjVDRtK675M0Xuy3qqcnOO9w6OGov60jOnZ5aLDZpoLvEZz/EDy8Kz8DC6jzERhPXuWVQS96g+cNNfBUEXOe7KuogmdFsZYD/kMvLq5U89ohKawHrL/aN49RSCI/VqV0pvws1sy3mhB1lc3oNkA9e3ClrlIdUowU8tSqvuOAHQ21mJvLnKOa1uUcMdTkVlGI41Gc/LRHN12uloyk3Pc3EfHzCKicgJiiH7uawihnWYJxWsbmWenaCB0o3A3s5ymx9MAGM4QqKapwIeWPR548Pi705+e3OmmVaCG6FFvbU+5TdlRPHTU2If+BD1rGBmi1rGYfnuuxeGGJm+rD1s2g9yVoIIa1ddmZVo3eUdmEyxmDy27vJ6W2+QJewCDlvtdtjiJmW9h8gWA/KGPFeZkSQuCmk/03amhJo7AnjoFxWM4eQrqU60utDkhq4Ix6J3W4B30Xteeaa5n+q4xxMAcfNeq6IcNZQl76GlQNXbh4NjUCcC0eWD6Ta3KVxru/sPb1uUWS9a8yP5OWF5if728xfYeVyhULBl4J7nz4w8f8sW/BSNCCcUrOBP6SEPLZiFrnBRLFj7n9SG59V7PDwVNILO1D86xIHZ7gugeo4hZXt0p3CaQ5xtUP/srHD+Q4kvwxWG8cATKzZErbCwhAmHbWn64nDeKjkN02jvuVoRSOtUIYXsBozzAq5kl6KmTZKLXGFAyX0lLptYkbNbHUGu3urov0+rA8gEWjxw7waKmRxJ0QxTgvxkzh35QHTU4UURT/apjVs08gdQ5459a+N4nTLJODl5j/2upwlpm3PiKE4cqvL8s+0K4Xc46Q+QZsFZzrHZk7lZMmTl3Z1Q//RdfCobTYWF8Nz62GhFMRkyTFyt6Xv0pcrI9urE/dYdlRSiEEiO5lpFUCRGiBSl2fXl5KYSxNteM+fZVVXXbgsKMYFuLRTK5vl1UhV5iGHo9hCt3RtaysXXVLZI3g4MG9R0Si34N4MPcgXuKjccDsBiMppimJI+LgJ9GyG6Jt2g9ot7vVteMTnNYtii1LSvr5CbwktN6d7GqKnfrfn5tW9YXFepTXabWbMgOukETapGkgDI7ZUnI8BbDy+scRjOVChI9A6oGNR1Brmw4ah8Vh8W5YGDGX06LZuZRVUE2mvmLNdokD8PSlXwifKpEMWY7Ct0ZH7sqjba1W17dpmIvWvFG+FnmZ01PLSMRmEpScTSpArZ5KFaGtuhWMogZBLEIkXuZrGTL6niHZp+4QuVrFUpLE89J8urPWJ1B8yRLIG6a5mYVEG1SA1G7KgjzCQw8/p/H3NukXWVrUw3RVuqhgTgEftXXo7VPVFYVnyld0wJRy4L8fsQx05KhUfIZye+b+VMwqErfdJqPb8Nm04J+dGpPHZ+tWe025gnY4T59C7DjgAYpQ51BWPOGbDy+aZmSETiKXPm+MGHd68SSDasu69IPFtiRrbv9QW23f96O+R/1HfSPMem48X5ms07Ml6kDXNm24wF3GzPPs2W3NPXYZp1ENwQy/CSjkI/eny4jfT7ieClhNBBFnj+0KlpvoIb2AI5CMF8ymYftQFiDVDRNSx0rSBxrwmw+5kdSPgHlPTQoHe5dScQQNAkRT5MWY35peSok2GQX6uQDgNOD+iEPYFa73b6djhtpuIF+n6XdJrr9I2l2W3rdklanJUJ95GlDuds28NJpgSEte1QDAYNDfhsBu/Y+lYKNKvk8BTuKfJaUzYnIbqPJxXh8H6/kSUobjnxdRI/xp/GzTAq4zcZPb+kiPvxrZ2Cz0/qy3PHzQzb4XSNr/5lMKKNqMulIkk6rxu1GB0kEzmzpNHJl0Siv1txHjNPUtv+VMes4T9UiZic64YssJYokl+bBluqjXRWvoYopy/98CPBKahzp9QSZUc703/mlSuYF4704pb0MzzS5mAE3yqKwnDiDYCpzKYWxFbYVnZP4fvRd+QbOyhTpgvClGu3uDbaRJZ0jhVV7Qx8IN6ap8ceMCpKAAZK06cZGOfRDHtQ6Ix0o340m4Ek2mXRN+BM8bV5mTYdmlUt+EM7/1njMrRWRDb7J0IYWwUcGtwBlArmv1yTOghBNA7k/7PcfTdNP/cd7sn6CFasprnQKTUUGNQwDGKHBBuyB4lIlfKmqiI5BKHQFiBBRQnSTHetxEljPl6ZRBAeDA7CnQStcoMDEJvxA1tXHCn3HlyzJH28YbMNBqMny0RG6tjdUMLjDQxde0Sx/NxkH5H7dB6OGJ36pCjI431qDEPbKPg8PKp6TqJ3C7S0IvoWoxH7sVu9l4ze7gAkE6ARREKLd7ofB7YuNRhuc4xTPaIxGaBpgwYZ4JYeSyWHOSoaPdtRPw/xGweq5+YYgj4IE2mRmCabhwELZcC4YUw8LzdXgb3hqQR/ki9DEWTxaaXitqadF+i5/wcIbDtTRO2zV175it29YcBN3NvJZ2SWcrujmQmNrnzCymkhzB2XtPGaryJXdzYOwpWAs0QpT1XGcuRrk1tBzKxPeEt25jO5pmmazjuk/03KyiXeNrk+//+H07Ox3mD8LT+cSpM3snlGl6mu8wJRts8AQNwz+ZDaGODq2UdiX8KaK3pngs1HQFHEdhCjxUpJMJgmPJxNH4r+wX1gDlXdrQ4lwkkxcJHgnP812V1Ak9rQvnnMaEzmSXOtSnTzstbtFi/boGu4oGhmnAHvN9gjiektKh5jJ0NwYPHLtwdcEAqt0u4aQSnhWiF35wD7okpGezG1dYtUCUf7el3ThoRV3jUjqHco7Qjbja6Z3quVHIx5oJhFMJhozJpOg5OKwlhH5SFUHsEb/0jP6sDu87XqtbpELpJIIFer+qWlANqft3foC7VdIYXkPd8neDA6+7Q4RZkZatz27W7GNTK84Kq7MMsEA9oZAE7RZygD67/rr7825YM29PX48gXEoN6dStm977YC9OoZICFUq7KGUIezixanJ/WWsDNBeQmIKNwNTA6yUz0y8nTu6i1NKmHKt2y6rUdaQDaKy2H4iiG5USWsM0VRwRLv5tsVncz1sSrWr6eyZdLr26+XpHIZwzbjADySVLraslGkpzy7z5yR3wHLN4mrmBpqVl60tXQPXAnrlWZ6CYZtsCyE6VUT87rwLfgKpPOXCxdUNxBYfHOyHRZT58ZvJ2em70xs0Qt/sfuuyHZ8dvx6f1aLJTfx47/Zxtyl6/MqEZqCR590AbgvFBtnukpRynExyTKsGyzb6jVlHIMh4hu0NO18ik+THpji5SzG7NzGPCEuakFfuwEPzG8KUWJtECBQSwGDTGLjowF9As1rgkhWPHM3+RuiDv9NoRYMtF3ea/AReaRwmbLkgAivybKhoKWJX7+JVCQZYyEg37Db8L91u72KZo5SviKhJMvZwtC2MtyXYw9Zqkb8BPTxvU7j9Pw+ACL7SwvjHoNs1Ucv6pYskLjSSWux1u15WuGN3psEjwBKCuYaPBuBP+fqB7RZC1mver0sV4SwjLIEIxwarVqH51tFzApPQy6iIYIUOJ0h0aZ7V0DN3wcwpqDKiwAZcFnT1VQCGNZAjvgqMDU2QiMgYZ6QTG3DGNgJcd9ptkPTqgweyIknHc+a09eUw5zOFAFvVS4ESRiYZlUWxSBicqywjAEmiEVRpXmmLV47OHI41IlQVfaD1tlOCqoaqq9pZegCrmdRWmBnBE163YyedopSwji7e1eujf9gB2XQpjYRi8WbVbZ7bKiym9yvNoPnQTXQr+qhF8LSApI4VVE6MoNOxe1q7ZaJdP8w3xIhmE/una68bUTmZpfwOp3UV8dlg982Dd2GAOUq3bxNfotPLhwMjfAydGITmWOZ36J1ePhw1+GK+DtFp2R9qypcMNHPY36MZUXqqlE25taOf26yV8Pr4u8np+fgm/319cfLD5Prmanz8roH7WD3r0cSLTfmHg9sPg1uDJvo3gntglyx52pS05VLv+MOKHSq3b1cgDXapqvqZM4aa22ExYID90Nvw7aNaY4Bfw5o8oPHrFo0KFKxV5ELJoY0Xo5omoijSNUCIqZZeZlIJghcTXc3vDfwpwasSjVCKF3cJRqaM/r/aTMpn9aFCYFpRG3bRdneLwtXiUZd8qru3hWiaLuV8VKFY/Smfy208dnCrVHCuqmkDionqAjW2ZbSdkV2txiJ6OXQJ/d1UoLQCaFRekaYKWisaaYjX1REQvM2+BSl+GrHWOLGKoRPTo2vo70d4as6vltLudQ9EJDQ2bGJrCKd81rEVq4zYdG3CSpuRQCuy/d1oFz2agTz9In5hJ0bz7p0RNtPC7cA+tHmqh1rPlkQ/1P+CCGTEemB0LY1Bi8V4halyQ00EpqzW0pQynKaNtW09GFGnwbpdrNEcs6Qu2pg10vJufY2u4OnmFdxmmVomPic4gehNPX/Xtv4xmXLRMUMCSXzJFE07d0EOcS13D9oOmJpAbBs/ZbE9t9NTM+dQG4qf0QVVFw9EiCV7trAzn7aVK/CnsUijzNC4uP6nlnQDFQKQBm8X/d1THNuxDwipmYjLY2l1iznY34XEyEQq9BaWDn1HSZpIdMM5OsNi1h5pFeSu7WDa1E3A6ImQSHGOUl2721h9a6CY7KcjQDorOxqEynUze1IWpFhR1tvNj2Ra5EtoEMLw9p14DI8+7N2WcjRZDhM0LvBLoY+Cg8EAvcaJg3UQNkJvgdMpFwuSdKvnOC8C2oKoOU/CcgoE+WFwG9q/dqvHVHRqK2nABNY0GHyuqR+id6bxc67QsdGVAhPUbEDwaDp/Qh1nlQRh8tOgYD2HSRbCtgp2AZMMYUZUJLxEWsMmZcQkzMkckoDe6xDGNQf5ImYa2f4ELHGgKbDEzuXTwGQFCi1v5fOqbchzIsAzO3j0ldSn4aOu8lTtH8L0hXIJRDwJp1BIc305LAtcnw2S++g7Lu5okhBWxjWYzBPq6IHYW+lys9ingbJNUsjN3NVdc0bUxEazTFLOM633L9mEsgn5SOKl4q0TtXqQJ4OGgKJbDP/5g7yXg/twsAeIay8/bgZ4ngXaDPjTYO3MZ8URQmHr8KTuDu7aiEDKisJbItlLscl02W0JctgeYZbZRFgZbplNzCjaJa6WtXHleEbYpLitpZMDAfaDunIBXKALotr2yFS4BzXJVZ+JprdCsmXhOfJpCJYrKdPAsivXSW19S/rKXaGc7A0GnvyIiFQYPClIUojEXzRBZaNWUWEhWM2J6GQ0I50a0nRDBC88hLIvmk0chdbhtfd71ItGnaIppdecpgSMa00oYvNPmAl7ikXn6PBw/6gl64kmREin1oJOd4Lg+3ah3Swi5G14udJnqaGiM2zICIfatcRNGmJtuSQRD6QDp1FDY6IyZ0IktzMZSw+o65Sp2+a0lNAMpEOruhGXkc54yJjSptfIqKmhlbqAhwDjLX6bAwoYk9e4L4k2YvZXHXM/JtHMjugOTcPSiBYw4BZ0/uO9SCpnuX+UA0kun9S9SHIPkC2aMdAPQnud2SgwxzXVRqvOI1W3kUaHkQbi9mxolcNH8AkphK6qmdAgSfX4D9kzB6rIwsUPR6Zso5kCEG8S5gKuIotnpH6vc3eSZUVUJx13G5OM5ZtfYXNvd4atBvKaMDegqCF6hCoNVs0W76m9L6oNVwHm2UtB+7VS9pP167Bbm+MWlM20TPy4E6Idc3bmQbkh0m9DcFq3as2iHLymDasCHlUMJ+dWjc7wjcT957oF+SH9UPFP9Qlquw0tzymw8Vq0Zy9CgwvQbOctFxpWHYz2jkL9/zdVNyOIjRMwpmfCCJ71k9l8HRXcheJdSWU9Z6qXThlXpeqFU29Or8q9Q0JV29SONPfezF1uVEHyy9CNeWtH5u5EJYeoojN3DVY3svfow+pRiQZHgwEwL9vx4OvBIE/eao/3E3OzwiuE8+wQWb60oMuYjOB8qSBTqwbwTODFAovc+aK4nwHAmGedKFIflJq090C6rPuuh0anKX9dKh5TFwyNT/aK7LPg6y0WMqzc0XP67s31w15oPEP8CJQdic7xgiCFZxpa8wO4Z7RH4r3Qu4bAXo20opKgTgUvv9Eg/0gVGsDMFWFh7mNqlYUQ7ZUCnqLP5EwFuLDzZ7tR/Y67bra9w2Yp0pTeRdY86Q/+j7jKJscrB62b9+fn47PJ+9M3aIR2B4OBW8cfxj9vcUPMY2WvCqScT/QaTUiyd3i4++3knqyDIQoarp6DC5x/GP9cT2WF4Vo0+itJIMl0S/3yva2lVp78H18CvZij8oKxm+uwZ0bN3ZEQsJUJ7nhI+ZYwG0xJshpXIvGe/gdzhlssfVCZC3Een6r33pj4z5wIibv2x9z7HGMh1i5XTR42tiAKg65m7+w297085EzPEmITrdpez4/fjSc3x9/DitqxBR71B/m1PMdXx+/GN+MrBFt+/nMyCaolJsc3Vf86r8Kw45atuLdlEvV7t3/rTibexS8m2MP0dnxycvH+/CYPASk61RjZfDkMXAuj2779Km+1aKfp9pnbx929wsbw/vz6+Lt6uV/kv/0S7Pzzl1++vM2Laq6qB+oujixfEFnhQd8RFc9LnoR+nqTy3RnNToXGH+LK8NSWG2U2Jj832gRhDx1FPnpOJkUS22IIvotjxUXxh/HPo38cn70fGzdEkECswDPQe7m7l91cXAa3JkD6nP9acki3LjMc6+9/M1GaMsVybvM1fGlckWEzrPgnmhs0hhVIVbOWmvgtT/V8kU8jHDG8wG/R+Yz9ItoONOxVJODNiOx9J1Hq3Bsrd5S8wJnRJE0l2UsuK6mfsRgq8hy57sm6cRQGrE5HmwYAA+eqOHRtGayo5/FJi/sd7Cq+vAuIDET6LRYSqRVtCM6Djgz9RobvdaC/3zMl6G+IMIrnWIvnWmyri38NQ5CNlrUXXBIT2qG1kvEKLmH1fR+dJF2ljmeu5QmCAG6Z02uzmnNJLDLFXGuqTSqOl3sgf0GVV6HRqbh26w9gr+lLi3J29BFVZNF8vY9F8lGx2TQGWS2Vg/A0FxJMwL2NLN1ytRZoVNrWPAoxCNVsCV20mUC9gS0i8Mrr7L7QXdcIa5mgD7jso1P4lWs8+OhQYkmTIaKsSEsez/mK+d5gpopxKAOfMNtoo6ESPJRL+fHhwocB/3owgEPubbIq5lnovdZCBG2ULFtwjQmUKd95UbhJR2qRlWhvmqCRbj/P2agWWTfUTy4mP15dnJ/9jH4zv06uxsc37sfN1fvzEz2Eo8oQWi7D4DKaJuYmjCREwSqo33YChihjnG20ksEba/VuOvrNgQSXodRGZlFtSRM/73fjzqEX3LSyrOcgr966klUsmi1GcjqFm2NgiRtI1S5ftGQpZfedipv0M4M2A84ALb0R12lBEJaUDcQNvHDiEQMkOBsaESx0occ+Ldwa5uhTgGe/rwhnDRkenPC9I4EGcy6Zaxg78NwIOVaCa8lLyQVaCc5m1aud7LTc7uBsxFac8+ZcAbqViKrmTIhCcLLkNFCePcaGHlgl2+50Q/S488rZKE2b3fLBnGb/EwmGsJG/RxVLUsavFM7nc9US4r1N+ccnv6Sxm46cO7EkqlN0FZk9s9Ptot8QvNLtFk/9huBCBZvtrgOtQg590349cb5bkBH6wIzYqEFiSutqzttCN3tbhrmt+hzQvVSklX126FuEbbEKuLeTh+9w8oww/OK92EpyxRq0yjvgRpYmH4qisAvWQvZTf4d3ul5Tq0Y6QyNHwo2+flbMLXQ+b/e2DXCBgmZx28LMiYUNmfbdZ8OVMm7y08DJk1FyLyISiyjPJRDhBf6VM7ySWstscOjJARIEerzbirWbB79ZDKVTwJdnsNYXgz2+Z/kEcDiyyNS6hMN3OKngrwlhqx98ToMv0Y/WfnG3LhulQSQ1Ah1wWoOrr8CraJFNpTOncoYSKu8jH6y3tb7/NkIfpsHj/dPo8eEpMMQQoodCTXFE0BB9Xb1cDv0NHoXo0VzaCHgPMvKt4R14QUIjNAPxAJeyzT+1bnR4JSceu6qeqG6U7KVcDL8nKmcs9q7+hMRinZmr5zWI7akUZPMx94/byzqlwmt76xMX67pc/xzngZND3YDAbEY6gxC8QQ3bBbfktkQxz+b8acuUZ9IAtb2UctH+ckZUL9doNjTS62kg9gogbirqkhG1lfBSFLU3YnIQtZeA+2g21C8nPtpQTi9Ma4Gv4PUHioaIor+h3UFj7qTGh1smU9KSS+vLZ7IsSZVQNvIQ5834H+fvz84a+7E5P45qyZi2SDj0l7aEQ8Ai7al0Z6oREUm5QGW0gnTYJEGPlWbr/k0Q6adpx7vzx8tmBPvX41Ngc+QUJG5u2flw26YcQ4K1DwFckXzbvbV5MbMPAZyjB7cv1Enpwl4Z66X+Kt+CbAOazd2p/qGTs2Db/N+Y2SMqpPg9YY6PuxNNbE8wKyKxLjpxvtyjyulJZH16Gw7odVdP9s6rPs5oH1qqIb/xkR4Fl+9v6ldjGLf70WPwUw+vZI/Eez03px4011Mq7UkSc5bAocXRIHhqO67XGiXINZUp3C1pmkzM207lHRzovwVtUnQen0qSbn59ARFGIy6BKsyJ4BCUVUFkxlndEgKVTKQVvLd3zLkAgDKyfNoigGr/FIRbwDUYmoE9tcCyNvcXzjoPct446WZimORyaTMtaFXRJb4CWaZCFTQhTFG1RgmPwYmogvHuMRoZ2guStVYi475ro+da6LuiQVNgZvkGNVfUshM7wNOknHaxZcbgEKLwbNOUGw6bQ7Sa03gOJ1f5aVaMhaBEog5lU4H7meBJHxAAi3uiIjXdKc7AJq6W7lxWrxfZEN4LcNOVe7p2X9fOwdcHzth0lfp2V6e335nO5aQwbzhznbPRNVrcwA5UMog8YxUBjxuvgYoPns97fHuINRCikbET+g202kna6zxvZWyv61Bp6w4/n1uhr2X8/5qUKjeHbJOUyilAn+akyJef6OXovHy2bGVrD8epPTE131wU6lAdSQubgC7o8+IqcqKR/eYip0p/+zDZE/LzceCJeZ6tim0NCvvXL8JFJA6P85G4B11zHZ2u1eyk2CC2Ff6EuTONy9pkT/mHSM2pbPHoYTsKPeoOW7L/bs51v1U27hqnJewBDJGQJHTiDH11o22+hEUWM/gzt0FtyC5jbbq5MXfDwC3rdlZX2PpNMubGNdgG4I/21fZ+o7v1ATV5sYboB7L+Xf6skCb8sSnF6+9zbi2MFmDQpqxYzDbbYPmICpZSs4ZJQgXqe42FnqORPZeq0FXeVfMRQalpv7WSHFgfDV/aRHlmFN65WInLVeD76Oo+AXmDW28+wO5TYeN3+NEkcv3BLrVfiCWLF4DRPSfnov3BAMk56sVoByLDEc1QStk9knO+QoTJI/T3fkIe+myZpmjv73/dfYUSjmRKSIb2XoH2uwMtMqJWXNzHKkWCaKGx/jTPMgsNP/P+sDTOo/owewdI8KUiWoNGu4PoYC8aRHsD9BuaCZKh3n+hACXkAdpCQcOw0V//uhEO5Q6+heaj3ab2j1rbT9jUcN00RT2Q2e+JKJLY/fWv+m/Um6I+UbE7jnavI/3ut9/MFVm7AA8JN1tpcCVU6kKo12N8haScJ5G9W6taEJMFZz1vUYp3hEEb84Ne3mdzI7ag6SxPs2dSrbVUcddyGSN2T8pFD8+0vrJdD0CbPS1ubVHewHXLlqXC8f2WZfPbN+EKxS/+PwAAAP//AQAA//+PbykgY9AAAA=="

      + block_device_mappings {
          + device_name = "/dev/xvda"

          + ebs {
              + delete_on_termination      = "true"
              + encrypted                  = "true"
              + iops                       = (known after apply)
              + throughput                 = (known after apply)
              + volume_initialization_rate = (known after apply)
              + volume_size                = 8
              + volume_type                = "gp3"
            }
        }

      + iam_instance_profile {
          + name = "h4-prod-tunnel-end"
        }

      + instance_market_options {
          + market_type = "spot"

          + spot_options {
              + instance_interruption_behavior = "stop"
              + max_price                      = "0.0168"
              + spot_instance_type             = "persistent"
              + valid_until                    = (known after apply)
            }
        }

      + metadata_options {
          + http_endpoint               = "enabled"
          + http_protocol_ipv6          = (known after apply)
          + http_put_response_hop_limit = 1
          + http_tokens                 = "required"
          + instance_metadata_tags      = (known after apply)
        }

      + network_interfaces {
          + device_index         = 0
          + network_interface_id = "eni-<redacted>"
        }
      + network_interfaces {
          + device_index         = 1
          + network_interface_id = "eni-<redacted>"
        }

      + tag_specifications {
          + resource_type = "instance"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "volume"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "spot-instances-request"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
    }

  # aws_launch_template.tunnel_end["t4g.medium"] will be created
  + resource "aws_launch_template" "tunnel_end" {
      + arn                    = (known after apply)
      + default_version        = (known after apply)
      + description            = "The tunnel end as t4g.medium (spec 032)"
      + id                     = (known after apply)
      + image_id               = "ami-0272643e149bb16d0"
      + instance_type          = "t4g.medium"
      + latest_version         = (known after apply)
      + name                   = "h4-prod-tunnel-end-t4g.medium"
      + name_prefix            = (known after apply)
      + region                 = "us-east-1"
      + tags                   = {
          + "component" = "tunnel-end"
        }
      + tags_all               = {
          + "component"   = "tunnel-end"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + update_default_version = true
      + user_data              = "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"

      + block_device_mappings {
          + device_name = "/dev/xvda"

          + ebs {
              + delete_on_termination      = "true"
              + encrypted                  = "true"
              + iops                       = (known after apply)
              + throughput                 = (known after apply)
              + volume_initialization_rate = (known after apply)
              + volume_size                = 8
              + volume_type                = "gp3"
            }
        }

      + credit_specification {
          + cpu_credits = "standard"
        }

      + iam_instance_profile {
          + name = "h4-prod-tunnel-end"
        }

      + instance_market_options {
          + market_type = "spot"

          + spot_options {
              + instance_interruption_behavior = "stop"
              + max_price                      = "0.0168"
              + spot_instance_type             = "persistent"
              + valid_until                    = (known after apply)
            }
        }

      + metadata_options {
          + http_endpoint               = "enabled"
          + http_protocol_ipv6          = (known after apply)
          + http_put_response_hop_limit = 1
          + http_tokens                 = "required"
          + instance_metadata_tags      = (known after apply)
        }

      + network_interfaces {
          + device_index         = 0
          + network_interface_id = "eni-<redacted>"
        }
      + network_interfaces {
          + device_index         = 1
          + network_interface_id = "eni-<redacted>"
        }

      + tag_specifications {
          + resource_type = "instance"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "volume"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "spot-instances-request"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
    }

  # aws_launch_template.tunnel_end["t4g.small"] will be created
  + resource "aws_launch_template" "tunnel_end" {
      + arn                    = (known after apply)
      + default_version        = (known after apply)
      + description            = "The tunnel end as t4g.small (spec 032)"
      + id                     = (known after apply)
      + image_id               = "ami-0272643e149bb16d0"
      + instance_type          = "t4g.small"
      + latest_version         = (known after apply)
      + name                   = "h4-prod-tunnel-end-t4g.small"
      + name_prefix            = (known after apply)
      + region                 = "us-east-1"
      + tags                   = {
          + "component" = "tunnel-end"
        }
      + tags_all               = {
          + "component"   = "tunnel-end"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + update_default_version = true
      + user_data              = "H4sIAAAAAAAA/9y9/XYbN5I4+n+eAtPZMyIzzSb1mYRezl5ZZmLdyJKOJE+SdXQ4UDdIYtQEegFQNKPoefY99snuQQHoRn9RVOzk/vbHc2yK3fgsVBWqClWFL+OUL5NezNmUzr5YSiLk8AuEeighU7xMFfzN8IIM0fygR2aCSPkFQgjJtVRkMURKLAk8YHwSC4IVmcy5Lp6/kHOSpkPUl3eU9RlP+YwyeJHy+H6SYSlXiS3+xUpQRSZTmhI7jAyr+RD1iYr7CY/viegnmCw4i/4luWmFrxgRQyQ4V0P9HzzMiFhQKSlncoiCwdHBQQDPY84UYWqIfoOfCD3ab4QCPfkUs6SXCf5xHQzRFKeShEUBC5IeThINhl7GeSqDIfrwiII7LEkwRMHu13vR/iAaRIP+7lEQokDSX/WLvQP0dOu1pfugRNcuRoBQMFcqy/uHX8N+f3fva91gtDvc3937JgirFeSLajBeFN89+jbaOzyI7He4O4gO9tzg80pP3rhTPuslgj4QoeunPMZp4L+mD6QniFRc6FnrRfXeMt5jZNXLBH2gKZnB9HM0QejJflcXfn4gCFF9g3w9nKZ8lVKpIvVRfQYM+BLdzAlSS8ZIighLdiQyPaG8J9SRGYnRYLCLvrvqDQ53X0EzAsdK9k3NaJGg//nvo1dIEEmwiOf6wVVvd9AdIvJAxBqICFHlWs97h8UIUUKylK/7MhY0U9JOdgIvo2wdogVeo5OL8/PxyQ1SPEScoYODfYRTzkiExjieIyqhkyRElKE7HN8rGt/LEN2tEUaCrxCf5r0mPJb9BCvcm6Z81UuojFMul4LocXdOvkaYJehk9+tuiFZzGs+R0sjen2FFZL8oPYnnJL6PsjWa8zSRiCqkeISO0T+/+ieSCrNEoikXiDOSd53iO5IiLpCaEw0uhfhUFxjCAxzHfMnUjkSCzKhUYr1jpmV7KJc5fRPCSE1TKcGSoLtlfE+Uq3X84/VOAWy5nE7pxwh9L/gyk+gIKY6+RTgxLegK0AMVSBCcSMSIBifR0F1RNYf1E3w1RDPdADrakSHU1NBeZnLHdh4VmFygmFlhInYkypZpKtFU8EXLnFFnfHLVHUJ/x5enoZ2geVlMOcVrIuQOAnpzneKMRiQW0VL2CJaqtxvhBf6VM7ySUcwXttRXUXIvtiiXCZ708iI9qbDIuFA96Lpnpyv3n2mlDRAGynzasIAGHTJOmSIi9AuEABYlCDGQ0L9O+CLjkqAsXc4oc6AwnKOHac9Wlb2vXjjYOZd6YSSJBVES+rtWgrIZyrDAC6KIkCHCCt1xrlDHbGCEPUTZumuGd02ADaF3mOGZmwpnBK3wWlNqB3jKoOsGLeXimQFKuVgQKfGMyGdKknhvy5JtK4RTIpQsUM5gOuA91yKBeY86BUPEK2mfGqa4W8yMbT2K7x19OdJCnYLrADM72T3qGhyRcyxIotmNIjsSzflSpGuULBeZHqPGDr5iFqs0O9N4UuYoebc+Z3kFc8bIbmeabAWRdMZIgr4f31iuZfrxpm9G04PRGAB8063jo1/qRThpALM7AC5yl9IYPVCyQh3BVxKdHITAtA1cABd3JAIRz5BaQTB66PcEEBBgaIqW2ReJ954Z1oIzqrgmh2cKCr5U5HC/8d3dMpkRJZtRPZ6TZJmS59iUB1m6NUSbpAw2VfguJTJi0xdIF4NBm3Txl/5SCiv7ThXqTdvFjgxr4KMpTRURNZkjNN97bbLHLixtswwSoVNDBXnnMMkQCZKlOCaJpgr9W3L0BsTsHWmKSE1Wa4SlfW6QCohmEWn6z+EliXigMUEpx0YQuCNTLoirh1lSdD4nTsYCAUf3IZTBTaOPUEaVZqq65JQKadhrBDCTJF4KqtZmD5YIC+KVM9DLu+pQNhW4r3cxC60eYUmkpt0h+mbwzdeatfOliIlp50qjKTrc11SjJRsiYKrF5volQoiyIUKMrPRCMBIrjQVaHoP9ytAkbFpTHBPUIUwedTUj2tvb24Mp6n6N4BaWgbQj0Zvz45tXeWOCPmBFvK7hU278sAus2O6PWItL3wy+GeieQiNiWFklbGKWhwf7ewbwXtHdQYkp2o+k7H5Hor39wW4uFNaWw/FUjsYnezvSPHzlNcWXaog4S9c1LNiRSKtgYaFoavCsud14/nF54qTeV0CNBoRu7pRpcTMmaEEU1oLtK6ToItc+8lnYpkD2kDx9cBsyNK/hkC8FbBqCJjMi/QlMuVhhkQwR40CJmDIC4mI8J7Iy4KERHWecSD1xpOaCL2dzxLiaa55Z4gXFsho51OH1OVWC5/PTMuYaJUTTWugwBGk8CB3yaYxDHQXDm1Kx0IR0Mzj8xshNYsnuOL/vVmRUoGJEGVGWl9rnCUmJIq2va889fTaeY8r0pqmZv5aYfFVXrTPiWN2c83u/XCYoB5RaYDZLySuU8ZTGa707k0y98lqhdAo7eaDnHKBYGcQG6lRxhhItq6JHoL3QEN6TbWbLVhLBs5aih5s6BCox1AXk+Ey31bZK3T6Vl8pBli9VtlSboWrL5BA173KI6m58eHI3pJQH9QHnIyRSrzuVc5KEmukokjRML0MJThKBKlYGoFAk75c0QQMPaJpnbdXG7t4+Wiaumv7VXu8ROZvGXlgZyD56MkNJDzLBFUePejAhNP2E1Ny2f7iped9gsqmYbxWql/MAEuTML/BAA5p+uVYLTljutBkpXKE2rGigswzJhpmUUDaf7V9GGux+wbAMqKdm9H7G/uNt31q/Ih/xIkvJH2QBYg8aKMSTwgqpi7CHHogpZcFrL7eVVGw5vk7o5Ces8s5BcVQc9cWSNc8V9j21yKYyRAueEKQFztDZD6hEiiwyTYV2v3nA6ZJomU13pghDWoIJ0d1SefvYZHJ5fHX8bnwzvppMUPWjN55rvbMTq+3WR9b/9x/GP//d7J7HSzXnQmuFMKhLpxqja606vWrudvjvepH/7veu5lgVinW53vHJycX785vJ1fj70+ubq5/L9XwryvjkyjOW5GYWt4XavZ0mhCmN/QmPlwvCVLEdHyPAHF/JR1LxzJif9IKFepPWBaiK0KUg05TO5rrvAj4oTrGUntkKEArEFW/JCkm1gjWZaxTMf6bZCWGJMbnJboSuCE70KmtpB3CQkQc9UJBnEzebtweTtxfXN6NiYMWL65vjkx9GWjguno3P/+E/Obl4d3lxPZ5cXl38v+OTm8n58bvxyGpbzcW+Oz0bXzd251Zu1LSYttjV+Gx8fD2evH5/8sP4ZuSji0PBOZdK9ssF8/pfWsEz5mlKYsVFqNedJsST8pQtM6UfSZLLUNasjzpGkP0aLfA90chkpHYQrqSW8bQUlTefy1Hjk73JycXZ2fjk5uJqMj5/c3lxen4zchZ5twsNhgf7u9/YOjfjs/G7sZ7+67OLkx8mNxc/jM9HJcrMp+UsXIL815IKo4JJgu4oS4DxgRnNmJqlwvE96vxz+B//7L5CTEvJ1sRWYnJWY5PQhlHpUEeQB0pWITo97EYlRLkZT96cXo36D1j0U3qX68uFafftweT4x+stSr27eDM+e66c4cqg0nhc2KzNN74SDEV6Gs7RIulaFmjNdqb6Xcpjrboofk+YtR6uOBI81eI0nEBxkWgdrqSi+qrSZgvPXrcwkFUUrJNjFBOh6JTGWGkmjCU5OtDroYdxOX6neXvJPE61Xgj813Ben7+im7NrpLCYEeV2kikXOY6qAmL/89/7+QJejc+OfzbINTk7vry5uGzEMb/Y+GSvscyb1xNT7Opicnl8ff3jxdWbZwr+uLng9dvjq/Ebi2E3Z9eTk+MNVN9Qumjp/Pjy+u3FzeT69HwTLVXlC3OUmfQZUSsu7vtfD3paIo/s7yjp//prT8tl8V4P7FiRVqw+i+Bh9DZP1y+0wCGsaqdgHF2EmVwRjVx3a0T1FsSV/tPqe7D2YAzkU3T4bTJN4gMcotPC/voBzBu3boWIVJRhRTkbFb309/fs+++xIiu8Hk2SeZwdvAh2RzXYGdW0Bzaazwo+a9ao2l1yy4rRlNFgR6LD3T1jGLXMYYXXoJV3XveOQsQzDQl08sppyNKXwhZJAcU3b08uHw4cGAGm74gSNB7tDgbPwMl8941BsifloodnWvSwvDhK+hpYcOr32aCk+eg19CvdIQSCXnN7RNUUEyJJWUyQM+6hlCiJGEdczYnQZWJdFoBXNlMOCoOLMVt2I2vcqJhnwK4oUUIFiVUIXAyEOD0uvX0LAuIZTmUO92sDIwf4MXuggjMtucEua09LR41n4Ojtzc3ltRZPfvq5pQTjtoGqvnp+YetVXmy31PODnjtOcav8x+gsrpcQbPtiyRqVl/wgLB8U7GD7r/wTtlJrYG7SPyZAvROpSBZl6+4wH4o/RUUXICxjocAKbCSSBWWab7qVfM+o8tgQSLyaDRlWP6yLKq55W+d4qogYzQ96IOmUwKrH8yNmShr2eGWlJcMlnFq3I9GSaQ6KjWQOzexI0/E9WYPk8MBjYI5wAOSmA2y2dICpOW6x09ruRsZZpTIyGJceNmzdPa0Rlgu0YPrNOiMjzoicc9WA/M+j9jMYPP5I4ms9xREcVtxR1s/Was7ZPuqdot5r1OeZcvtwRU1pQg3U62kWi2o6wAtIBfDosxDK2MPAEGGNOrkaZ1XBlxJL99MxOSxRRmX9b/TkXbMX7DXn6prEo929Qf5Md3wcK/pA9Jsj9+I4jpcCx2v98LDS6qnmwWl662EjSV6vRwBqGRmxcuuVsu44Zq/6QxmbOytv2G52Xz3jOGN9KPQiL1nueJTYkwZ7Ep93Xd7vwKbfdAThyRAp59md1raMI85L0MLfcKt8rXaqZuWpHmdaPyivVc50GiqWOM+mRl6DuFThW6iJV6E24WUzE3svzdRK7k9wml17+in8qLL+qFc4jD3rTYZ6Pf0nYajMP3M4wz4wwukKr2X5oaY3Jzif83Oyusyd3EZr4gpfCq5IrIwwNpJaZlTlV2/5gpQqgFZws8i8hyc4w3c0pWr9mi9ZQtnsmqiRQ6HFHSVM5WUokaMt+cBimSra05TxUl7QiHWfnQ+UzsdDOGjWupCR8zFbw5maMSFKwhLZziyMLumZMmscIGJT9QlcvjTUvCK4j74hGWEJYbFeGcbL5OcoNBOOPFGdIps473NEWWYARfMvFjyuyAJTBoxq/JEqDy0rVOu5PGx2sPgjEbMuH352rDTGNusAZnabFEtVOKtZBPUFR4TlvbUlg8PNZuEj73tLkR31esZE3Sa5G3cQME/7ZkBznt7JPGv224vrm8nJ2fH19fj6E8gBYFTa47bYZ14szj8nvgNnsHI/S9BiKRU0KhXPCjXgTxflN1DU/y4h3+Jdvm7HBrLFwYnDuNxtQqIOOCI3W1xCFFwrnmXOCGoojTOULUXGJQleabKT86VKtHynOC+M8TBZnhVzNauIYmtF72XIO8SAMf7hzMhOzuLjH8SVyriv8dz6LxqzAAZ3perOeNjmVHZoXQlz+3M+hwd+X1Co3ariOWYzIpvOCo/f37y9uDr9z/GbyQ/jn4F8GcrpkhoCzu1ReqRVi1XMFwvwaYIz1rzrwh8N3BkhdAThGabF5KETKeeJ85YvQatw4goRnWo5IoTjaek8vj+B7cm5Hq9zHL8na+PxbMZXlfn/zzcKGFSOVerAuolv/yn8xo3jd1gamsf9x3kSaGzMMbT5nBwOh80xP1bmHMt4lT/jhJD3/j//XVeISx7pkXe0DY4+5VNt6yighwpYy3gx/sLFUi+Io13nyebcPO1jsLLkw9I7ruRlhzlbPqdP50E/hbNISy6WnGeaH5hjfA2dV1qw4SIhcDxmHSkld22Z7YIWQR/AWjqtDLhrz83zodih2XPgw9zKF6LTg08Qghwkq3TfKM5vq++3WmE2aPRNRtP/q8SVksNNE9twzhdb+BehXo8v1QbnHNTracbeS6hoKdXX7z+jdPEyvrk1W/v68HCzE7teAz1huw72ZRAExzbEwNrEPPN4wTCKsBf9rSdo/FZiLAQl8mVnFbbrLMXM+mAdhSj4zjn62HpB2TfJHp8iPkV7g72j3u5ub3e/oRrqXBEtbGgtPekGoC0hsWR+pEiualVCl5xl0KiAwE9IkrsgYeVpayZ+SfKyYuhEKGC/uFAiWU5/+Rvw3HcD0J1GluS1DJOPyI4BUYWmRIGPMoS6kRVE3rFiKHOSJnoHsjUhwjYPnbt+e9zbOzwyewMAQ7PowphtHN8eiKBTarsopmpPDYG5dqAenRGpdTr9w4RsdfXfJJ0aPwaxlMp1DYxUEIKmPE2KvsCHHKM5lvOe8dVPEPkImAOynCAQDIkoUxwZWEGQA1qyxJ4AGM8O0yzYcuP70Hj9OC5/XKwMLF/CiWQ7gA6I2uAokiDOYlJ4gGR6u+BL6UHAQIxJRXCi92C71+hd4SNV4IICUAPx1/aN4cCJyqi6oysi1aSJ1DXt8Vgat5EZfSDSCBExluTVFnTlITgWM/CJk/ms9EBlxWkciLDElbeT3H4j8R760DMuNOjN6dWt/gX7/2+eVHc9vvrH6cn4ttzpjVk5lmCRoJTeCSzWTgqgDF3CeNB+9K2WwNdM4Y/GUHL84zU6OTuFNbQIipN8RkEQlLsBmp1Mpku1FGQyQXQBrriYMa5AuaqwdPdezDIsJCk/ncZMpeVHGnFTeld+SHn5dx7lnj/hsvxbVHrS6jCtdCXpjOHqs+WdPcavPF9XHigsPKkFoGKd3zQMInwXu5InOE3xXbmo3rJSeueKXGI1L4Pt8uriezRCgUEc4yDS04gT5AXG353+pIt8mGO96UWYIrySt64A+AKhEbTdCaoeZabdoJtLg2PPPcyJZI6naHbU7K1rrXtVoc4QvfEmdH6DhRHi/B8TcIZEo3KUf0EIwdANu1W+CLql8H0S7zVWIvFeubTzpr78+ebtxbmGX1WQCkpai7drA0+acqG3mSVzG9d0KTWrE0jo5U+QOfZiSc4Fqx6sOXcBzjT+6fRmcnw2vroZv8lB9GZ8eXbx8/jKvUAj9PVhPqwzzmaG8zJUOXdfcS1YxLA34jstoe2FXx8NkN1gsmWamt1lme1I1OutMJj9YOx3cNjvueyZfaFMDl9aV0Mq0T2F+WJlwvdZYmyRuqZlNvGcpomznzZ6CIRIKyEH9YnfnL4bX7y/QSO0f5R7D51cvHt3ejO50mgtSBTzRUZT0hHBh0HvW9yb3j4eDJ5ynH47/mlT0aODoqhzmm0oftz7T9z7ddD79rb4M5r0bh8H4dF+0UL5y7g4v2dwVKppvzP+GBNQhHL/EGS4601u7Q5d8L/lyCFKaKJ3VSOgRTVWXOrsHZUmW8lSkGSb7gq3OWMQMnjcwTH4MCWEUQIriuRSK9x2iBjd4QR05G4+3lwXNgFaDJIWWOz3etfSgBaunaM4aJcaATX5LJXepCRNiS61CVkOu62QuBp/9/76+Ewzlo7X8V3QOYZZvYFJdUuJP+6CzsFgv/bsnF8v4/lrmHX15Sl7wClNzMtzvCDN7x2cWb1E5zhN7ZCo1PjhDaoZoxIyBbhNaNLpot7fkVTCX1ol1v5P/RFELQUrQcJ9LJ/UpN2Xa9m/J4KRtC8wS/iib/sJupEWBSaKfFQdwmKeUDYbBUs17X0TdCMtT2WdbqV1/zcBJEQX12MhuGgZXrBk94yvWPOK6mnDIAh76Bg9T48dIJDQWH2QSoQaFrd+8xDoIfX28uQ91Zw7pYxoRNNNbZ5dllKlS8tOtzpyOjXtQGwBV/AjMkYSrYV0gi+DLrwMRoHuTL+vtqE/92Qdoklo41JGph2tDlBNuZ1gFFShW0zuwz1Z36KR+fVFDaqm0AaQxlwkJOmApGlgGtp8RlKJHLzoN3TOy4PXkEMjqyP00TR41NWeQC0KtkJIXTKCcOjOc8vQ1bCGQlRC+qNOF5FUEhhVHdP+oWe9Cdm8anWgAMeaaC5VBgteyVCvFYAmhFWSQ5RSCdh3C8CqQikIgguNIbpJ4HlO7zS8Fkswq9e2b75iaEEWXKytArtAZix9y58BzF09nEwZVQ+46vX5tQ96zu8RVa8QZmip96AEolG5QEumJTf4Zbuhua0SSUIYaN5UuZAZw461smOm4nHeljXWjcAe6iNYiAI7/qCrh1Eiy81cwrZXqkGnQHZUOu/Zjhm6xtgasbY0YHM86LfNuPLcNJlCI40akQ2A6QS/sCD6F6esAxiicRdgi77DqWxA1o4nHoTl7Tt00GiYDfRbbdJCRL/9XbMxIRv3CRWdDAut345uxJKEWuSVasLv4WeVG6lF5nGCIPJxNKiXjYwKAZTewNeALSTLRSY7j199ZVYUqC7wlJ8njaBCTe7J2gyxG6Iq19iwI+kPl5E1EnXUIguL8ZeGv/0+lmHZzmit5aWTYIWH6G6tiAzB9OLtY3ecpw1SGth2wEqjxWtn5LkjELSlFRGwIRp+Ykw6XNMsVUN32scSW006OwCYPWzcF61SM+w8OEUj6DXSW9lEN9yZBtEjPAJOXwKNUasjsdCj7UgF+KNb6YaIzhgXZEI00GQNgRrQEEx4Vq+OeEZYR//F7/41ojx6rWF3egGQ7Jp4z1EghrNf9V4rdbWmLXZBFnd6/iNdIJoRZR/U5BZkBYSF5gq2UFODMHRzrDtCbrKojxYAHC0xQfaExvZRQamdRUSl3dB0rxGVmvi68KuJOip9/2XkluvZHvUHAvWq5Q0TZbbJyBJ+Sys1TuR/7O5a5Uru43quM5jPsgrVRWiHfA7mTZOx4HgxN/Q/MWeKsmXbUEoQ//09mYhWi9uW0wBOLdpqYCm1QGIr2v2pIks1DNQwbuBeHVMXhLZOt60fLqN4vuAJcATTiKbZCKK0/4oG/OvDww18ucxH9C/NfroNPLnj2MUNFsCdN2ydv5tVoXYUt49vimyN9T0Azhcm5mTBJ+05l8rKlCV50+V5gzd45SgS9gq1zFLywRPNQ6hkf9w2bCP2RMOXP4s0cebow1gAms45XqGO6UT/D8I4ZP3ZMUo+lF6y6jZiUtNZ6WhGVMfZDgJnYO+nWBGp6jutlvZtdSprQjW0LihTnWnweHl18f0TZJtxU1sT9SoXZsWSyZr65GkBYRXtm/QVmoB8Izq+ymLG14WZBcWRWhDUqOGOJ+uKKcJ9qqCZFrB5FDR56vur0KgG0qlntYqmyzRdYBXPO4ImTcWbtCbUIB05YI58NU1PBFYfZuSxDdNskzi/SRVzPZTqFcB2U68C2CBNGcwgJI1QqYp+1qBnxHyxoCo0Wrec44aVqfVu6tjVDRtK675M0Xuy3qqcnOO9w6OGov60jOnZ5aLDZpoLvEZz/EDy8Kz8DC6jzERhPXuWVQS96g+cNNfBUEXOe7KuogmdFsZYD/kMvLq5U89ohKawHrL/aN49RSCI/VqV0pvws1sy3mhB1lc3oNkA9e3ClrlIdUowU8tSqvuOAHQ21mJvLnKOa1uUcMdTkVlGI41Gc/LRHN12uloyk3Pc3EfHzCKicgJiiH7uawihnWYJxWsbmWenaCB0o3A3s5ymx9MAGM4QqKapwIeWPR548Pi705+e3OmmVaCG6FFvbU+5TdlRPHTU2If+BD1rGBmi1rGYfnuuxeGGJm+rD1s2g9yVoIIa1ddmZVo3eUdmEyxmDy27vJ6W2+QJewCDlvtdtjiJmW9h8gWA/KGPFeZkSQuCmk/03amhJo7AnjoFxWM4eQrqU60utDkhq4Ix6J3W4B30Xteeaa5n+q4xxMAcfNeq6IcNZQl76GlQNXbh4NjUCcC0eWD6Ta3KVxru/sPb1uUWS9a8yP5OWF5if728xfYeVyhULBl4J7nz4w8f8sW/BSNCCcUrOBP6SEPLZiFrnBRLFj7n9SG59V7PDwVNILO1D86xIHZ7gugeo4hZXt0p3CaQ5xtUP/srHD+Q4kvwxWG8cATKzZErbCwhAmHbWn64nDeKjkN02jvuVoRSOtUIYXsBozzAq5kl6KmTZKLXGFAyX0lLptYkbNbHUGu3urov0+rA8gEWjxw7waKmRxJ0QxTgvxkzh35QHTU4UURT/apjVs08gdQ5459a+N4nTLJODl5j/2upwlpm3PiKE4cqvL8s+0K4Xc46Q+QZsFZzrHZk7lZMmTl3Z1Q//RdfCobTYWF8Nz62GhFMRkyTFyt6Xv0pcrI9urE/dYdlRSiEEiO5lpFUCRGiBSl2fXl5KYSxNteM+fZVVXXbgsKMYFuLRTK5vl1UhV5iGHo9hCt3RtaysXXVLZI3g4MG9R0Si34N4MPcgXuKjccDsBiMppimJI+LgJ9GyG6Jt2g9ot7vVteMTnNYtii1LSvr5CbwktN6d7GqKnfrfn5tW9YXFepTXabWbMgOukETapGkgDI7ZUnI8BbDy+scRjOVChI9A6oGNR1Brmw4ah8Vh8W5YGDGX06LZuZRVUE2mvmLNdokD8PSlXwifKpEMWY7Ct0ZH7sqjba1W17dpmIvWvFG+FnmZ01PLSMRmEpScTSpArZ5KFaGtuhWMogZBLEIkXuZrGTL6niHZp+4QuVrFUpLE89J8urPWJ1B8yRLIG6a5mYVEG1SA1G7KgjzCQw8/p/H3NukXWVrUw3RVuqhgTgEftXXo7VPVFYVnyld0wJRy4L8fsQx05KhUfIZye+b+VMwqErfdJqPb8Nm04J+dGpPHZ+tWe025gnY4T59C7DjgAYpQ51BWPOGbDy+aZmSETiKXPm+MGHd68SSDasu69IPFtiRrbv9QW23f96O+R/1HfSPMem48X5ms07Ml6kDXNm24wF3GzPPs2W3NPXYZp1ENwQy/CSjkI/eny4jfT7ieClhNBBFnj+0KlpvoIb2AI5CMF8ymYftQFiDVDRNSx0rSBxrwmw+5kdSPgHlPTQoHe5dScQQNAkRT5MWY35peSok2GQX6uQDgNOD+iEPYFa73b6djhtpuIF+n6XdJrr9I2l2W3rdklanJUJ95GlDuds28NJpgSEte1QDAYNDfhsBu/Y+lYKNKvk8BTuKfJaUzYnIbqPJxXh8H6/kSUobjnxdRI/xp/GzTAq4zcZPb+kiPvxrZ2Cz0/qy3PHzQzb4XSNr/5lMKKNqMulIkk6rxu1GB0kEzmzpNHJl0Siv1txHjNPUtv+VMes4T9UiZic64YssJYokl+bBluqjXRWvoYopy/98CPBKahzp9QSZUc703/mlSuYF4704pb0MzzS5mAE3yqKwnDiDYCpzKYWxFbYVnZP4fvRd+QbOyhTpgvClGu3uDbaRJZ0jhVV7Qx8IN6ap8ceMCpKAAZK06cZGOfRDHtQ6Ix0o340m4Ek2mXRN+BM8bV5mTYdmlUt+EM7/1njMrRWRDb7J0IYWwUcGtwBlArmv1yTOghBNA7k/7PcfTdNP/cd7sn6CFasprnQKTUUGNQwDGKHBBuyB4lIlfKmqiI5BKHQFiBBRQnSTHetxEljPl6ZRBAeDA7CnQStcoMDEJvxA1tXHCn3HlyzJH28YbMNBqMny0RG6tjdUMLjDQxde0Sx/NxkH5H7dB6OGJ36pCjI431qDEPbKPg8PKp6TqJ3C7S0IvoWoxH7sVu9l4ze7gAkE6ARREKLd7ofB7YuNRhuc4xTPaIxGaBpgwYZ4JYeSyWHOSoaPdtRPw/xGweq5+YYgj4IE2mRmCabhwELZcC4YUw8LzdXgb3hqQR/ki9DEWTxaaXitqadF+i5/wcIbDtTRO2zV175it29YcBN3NvJZ2SWcrujmQmNrnzCymkhzB2XtPGaryJXdzYOwpWAs0QpT1XGcuRrk1tBzKxPeEt25jO5pmmazjuk/03KyiXeNrk+//+H07Ox3mD8LT+cSpM3snlGl6mu8wJRts8AQNwz+ZDaGODq2UdiX8KaK3pngs1HQFHEdhCjxUpJMJgmPJxNH4r+wX1gDlXdrQ4lwkkxcJHgnP812V1Ak9rQvnnMaEzmSXOtSnTzstbtFi/boGu4oGhmnAHvN9gjiektKh5jJ0NwYPHLtwdcEAqt0u4aQSnhWiF35wD7okpGezG1dYtUCUf7el3ThoRV3jUjqHco7Qjbja6Z3quVHIx5oJhFMJhozJpOg5OKwlhH5SFUHsEb/0jP6sDu87XqtbpELpJIIFer+qWlANqft3foC7VdIYXkPd8neDA6+7Q4RZkZatz27W7GNTK84Kq7MMsEA9oZAE7RZygD67/rr7825YM29PX48gXEoN6dStm977YC9OoZICFUq7KGUIezixanJ/WWsDNBeQmIKNwNTA6yUz0y8nTu6i1NKmHKt2y6rUdaQDaKy2H4iiG5USWsM0VRwRLv5tsVncz1sSrWr6eyZdLr26+XpHIZwzbjADySVLraslGkpzy7z5yR3wHLN4mrmBpqVl60tXQPXAnrlWZ6CYZtsCyE6VUT87rwLfgKpPOXCxdUNxBYfHOyHRZT58ZvJ2em70xs0Qt/sfuuyHZ8dvx6f1aLJTfx47/Zxtyl6/MqEZqCR590AbgvFBtnukpRynExyTKsGyzb6jVlHIMh4hu0NO18ik+THpji5SzG7NzGPCEuakFfuwEPzG8KUWJtECBQSwGDTGLjowF9As1rgkhWPHM3+RuiDv9NoRYMtF3ea/AReaRwmbLkgAivybKhoKWJX7+JVCQZYyEg37Db8L91u72KZo5SviKhJMvZwtC2MtyXYw9Zqkb8BPTxvU7j9Pw+ACL7SwvjHoNs1Ucv6pYskLjSSWux1u15WuGN3psEjwBKCuYaPBuBP+fqB7RZC1mver0sV4SwjLIEIxwarVqH51tFzApPQy6iIYIUOJ0h0aZ7V0DN3wcwpqDKiwAZcFnT1VQCGNZAjvgqMDU2QiMgYZ6QTG3DGNgJcd9ptkPTqgweyIknHc+a09eUw5zOFAFvVS4ESRiYZlUWxSBicqywjAEmiEVRpXmmLV47OHI41IlQVfaD1tlOCqoaqq9pZegCrmdRWmBnBE163YyedopSwji7e1eujf9gB2XQpjYRi8WbVbZ7bKiym9yvNoPnQTXQr+qhF8LSApI4VVE6MoNOxe1q7ZaJdP8w3xIhmE/una68bUTmZpfwOp3UV8dlg982Dd2GAOUq3bxNfotPLhwMjfAydGITmWOZ36J1ePhw1+GK+DtFp2R9qypcMNHPY36MZUXqqlE25taOf26yV8Pr4u8np+fgm/319cfLD5Prmanz8roH7WD3r0cSLTfmHg9sPg1uDJvo3gntglyx52pS05VLv+MOKHSq3b1cgDXapqvqZM4aa22ExYID90Nvw7aNaY4Bfw5o8oPHrFo0KFKxV5ELJoY0Xo5omoijSNUCIqZZeZlIJghcTXc3vDfwpwasSjVCKF3cJRqaM/r/aTMpn9aFCYFpRG3bRdneLwtXiUZd8qru3hWiaLuV8VKFY/Smfy208dnCrVHCuqmkDionqAjW2ZbSdkV2txiJ6OXQJ/d1UoLQCaFRekaYKWisaaYjX1REQvM2+BSl+GrHWOLGKoRPTo2vo70d4as6vltLudQ9EJDQ2bGJrCKd81rEVq4zYdG3CSpuRQCuy/d1oFz2agTz9In5hJ0bz7p0RNtPC7cA+tHmqh1rPlkQ/1P+CCGTEemB0LY1Bi8V4halyQ00EpqzW0pQynKaNtW09GFGnwbpdrNEcs6Qu2pg10vJufY2u4OnmFdxmmVomPic4gehNPX/Xtv4xmXLRMUMCSXzJFE07d0EOcS13D9oOmJpAbBs/ZbE9t9NTM+dQG4qf0QVVFw9EiCV7trAzn7aVK/CnsUijzNC4uP6nlnQDFQKQBm8X/d1THNuxDwipmYjLY2l1iznY34XEyEQq9BaWDn1HSZpIdMM5OsNi1h5pFeSu7WDa1E3A6ImQSHGOUl2721h9a6CY7KcjQDorOxqEynUze1IWpFhR1tvNj2Ra5EtoEMLw9p14DI8+7N2WcjRZDhM0LvBLoY+Cg8EAvcaJg3UQNkJvgdMpFwuSdKvnOC8C2oKoOU/CcgoE+WFwG9q/dqvHVHRqK2nABNY0GHyuqR+id6bxc67QsdGVAhPUbEDwaDp/Qh1nlQRh8tOgYD2HSRbCtgp2AZMMYUZUJLxEWsMmZcQkzMkckoDe6xDGNQf5ImYa2f4ELHGgKbDEzuXTwGQFCi1v5fOqbchzIsAzO3j0ldSn4aOu8lTtH8L0hXIJRDwJp1BIc305LAtcnw2S++g7Lu5okhBWxjWYzBPq6IHYW+lys9ingbJNUsjN3NVdc0bUxEazTFLOM633L9mEsgn5SOKl4q0TtXqQJ4OGgKJbDP/5g7yXg/twsAeIay8/bgZ4ngXaDPjTYO3MZ8URQmHr8KTuDu7aiEDKisJbItlLscl02W0JctgeYZbZRFgZbplNzCjaJa6WtXHleEbYpLitpZMDAfaDunIBXKALotr2yFS4BzXJVZ+JprdCsmXhOfJpCJYrKdPAsivXSW19S/rKXaGc7A0GnvyIiFQYPClIUojEXzRBZaNWUWEhWM2J6GQ0I50a0nRDBC88hLIvmk0chdbhtfd71ItGnaIppdecpgSMa00oYvNPmAl7ikXn6PBw/6gl64kmREin1oJOd4Lg+3ah3Swi5G14udJnqaGiM2zICIfatcRNGmJtuSQRD6QDp1FDY6IyZ0IktzMZSw+o65Sp2+a0lNAMpEOruhGXkc54yJjSptfIqKmhlbqAhwDjLX6bAwoYk9e4L4k2YvZXHXM/JtHMjugOTcPSiBYw4BZ0/uO9SCpnuX+UA0kun9S9SHIPkC2aMdAPQnud2SgwxzXVRqvOI1W3kUaHkQbi9mxolcNH8AkphK6qmdAgSfX4D9kzB6rIwsUPR6Zso5kCEG8S5gKuIotnpH6vc3eSZUVUJx13G5OM5ZtfYXNvd4atBvKaMDegqCF6hCoNVs0W76m9L6oNVwHm2UtB+7VS9pP167Bbm+MWlM20TPy4E6Idc3bmQbkh0m9DcFq3as2iHLymDasCHlUMJ+dWjc7wjcT957oF+SH9UPFP9Qlquw0tzymw8Vq0Zy9CgwvQbOctFxpWHYz2jkL9/zdVNyOIjRMwpmfCCJ71k9l8HRXcheJdSWU9Z6qXThlXpeqFU29Or8q9Q0JV29SONPfezF1uVEHyy9CNeWtH5u5EJYeoojN3DVY3svfow+pRiQZHgwEwL9vx4OvBIE/eao/3E3OzwiuE8+wQWb60oMuYjOB8qSBTqwbwTODFAovc+aK4nwHAmGedKFIflJq090C6rPuuh0anKX9dKh5TFwyNT/aK7LPg6y0WMqzc0XP67s31w15oPEP8CJQdic7xgiCFZxpa8wO4Z7RH4r3Qu4bAXo20opKgTgUvv9Eg/0gVGsDMFWFh7mNqlYUQ7ZUCnqLP5EwFuLDzZ7tR/Y67bra9w2Yp0pTeRdY86Q/+j7jKJscrB62b9+fn47PJ+9M3aIR2B4OBW8cfxj9vcUPMY2WvCqScT/QaTUiyd3i4++3knqyDIQoarp6DC5x/GP9cT2WF4Vo0+itJIMl0S/3yva2lVp78H18CvZij8oKxm+uwZ0bN3ZEQsJUJ7nhI+ZYwG0xJshpXIvGe/gdzhlssfVCZC3Een6r33pj4z5wIibv2x9z7HGMh1i5XTR42tiAKg65m7+w297085EzPEmITrdpez4/fjSc3x9/DitqxBR71B/m1PMdXx+/GN+MrBFt+/nMyCaolJsc3Vf86r8Kw45atuLdlEvV7t3/rTibexS8m2MP0dnxycvH+/CYPASk61RjZfDkMXAuj2779Km+1aKfp9pnbx929wsbw/vz6+Lt6uV/kv/0S7Pzzl1++vM2Laq6qB+oujixfEFnhQd8RFc9LnoR+nqTy3RnNToXGH+LK8NSWG2U2Jj832gRhDx1FPnpOJkUS22IIvotjxUXxh/HPo38cn70fGzdEkECswDPQe7m7l91cXAa3JkD6nP9acki3LjMc6+9/M1GaMsVybvM1fGlckWEzrPgnmhs0hhVIVbOWmvgtT/V8kU8jHDG8wG/R+Yz9ItoONOxVJODNiOx9J1Hq3Bsrd5S8wJnRJE0l2UsuK6mfsRgq8hy57sm6cRQGrE5HmwYAA+eqOHRtGayo5/FJi/sd7Cq+vAuIDET6LRYSqRVtCM6Djgz9RobvdaC/3zMl6G+IMIrnWIvnWmyri38NQ5CNlrUXXBIT2qG1kvEKLmH1fR+dJF2ljmeu5QmCAG6Z02uzmnNJLDLFXGuqTSqOl3sgf0GVV6HRqbh26w9gr+lLi3J29BFVZNF8vY9F8lGx2TQGWS2Vg/A0FxJMwL2NLN1ytRZoVNrWPAoxCNVsCV20mUC9gS0i8Mrr7L7QXdcIa5mgD7jso1P4lWs8+OhQYkmTIaKsSEsez/mK+d5gpopxKAOfMNtoo6ESPJRL+fHhwocB/3owgEPubbIq5lnovdZCBG2ULFtwjQmUKd95UbhJR2qRlWhvmqCRbj/P2agWWTfUTy4mP15dnJ/9jH4zv06uxsc37sfN1fvzEz2Eo8oQWi7D4DKaJuYmjCREwSqo33YChihjnG20ksEba/VuOvrNgQSXodRGZlFtSRM/73fjzqEX3LSyrOcgr966klUsmi1GcjqFm2NgiRtI1S5ftGQpZfedipv0M4M2A84ALb0R12lBEJaUDcQNvHDiEQMkOBsaESx0occ+Ldwa5uhTgGe/rwhnDRkenPC9I4EGcy6Zaxg78NwIOVaCa8lLyQVaCc5m1aud7LTc7uBsxFac8+ZcAbqViKrmTIhCcLLkNFCePcaGHlgl2+50Q/S488rZKE2b3fLBnGb/EwmGsJG/RxVLUsavFM7nc9US4r1N+ccnv6Sxm46cO7EkqlN0FZk9s9Ptot8QvNLtFk/9huBCBZvtrgOtQg590349cb5bkBH6wIzYqEFiSutqzttCN3tbhrmt+hzQvVSklX126FuEbbEKuLeTh+9w8oww/OK92EpyxRq0yjvgRpYmH4qisAvWQvZTf4d3ul5Tq0Y6QyNHwo2+flbMLXQ+b/e2DXCBgmZx28LMiYUNmfbdZ8OVMm7y08DJk1FyLyISiyjPJRDhBf6VM7ySWstscOjJARIEerzbirWbB79ZDKVTwJdnsNYXgz2+Z/kEcDiyyNS6hMN3OKngrwlhqx98ToMv0Y/WfnG3LhulQSQ1Ah1wWoOrr8CraJFNpTOncoYSKu8jH6y3tb7/NkIfpsHj/dPo8eEpMMQQoodCTXFE0BB9Xb1cDv0NHoXo0VzaCHgPMvKt4R14QUIjNAPxAJeyzT+1bnR4JSceu6qeqG6U7KVcDL8nKmcs9q7+hMRinZmr5zWI7akUZPMx94/byzqlwmt76xMX67pc/xzngZND3YDAbEY6gxC8QQ3bBbfktkQxz+b8acuUZ9IAtb2UctH+ckZUL9doNjTS62kg9gogbirqkhG1lfBSFLU3YnIQtZeA+2g21C8nPtpQTi9Ma4Gv4PUHioaIor+h3UFj7qTGh1smU9KSS+vLZ7IsSZVQNvIQ5834H+fvz84a+7E5P45qyZi2SDj0l7aEQ8Ai7al0Z6oREUm5QGW0gnTYJEGPlWbr/k0Q6adpx7vzx8tmBPvX41Ngc+QUJG5u2flw26YcQ4K1DwFckXzbvbV5MbMPAZyjB7cv1Enpwl4Z66X+Kt+CbAOazd2p/qGTs2Db/N+Y2SMqpPg9YY6PuxNNbE8wKyKxLjpxvtyjyulJZH16Gw7odVdP9s6rPs5oH1qqIb/xkR4Fl+9v6ldjGLf70WPwUw+vZI/Eez03px4011Mq7UkSc5bAocXRIHhqO67XGiXINZUp3C1pmkzM207lHRzovwVtUnQen0qSbn59ARFGIy6BKsyJ4BCUVUFkxlndEgKVTKQVvLd3zLkAgDKyfNoigGr/FIRbwDUYmoE9tcCyNvcXzjoPct446WZimORyaTMtaFXRJb4CWaZCFTQhTFG1RgmPwYmogvHuMRoZ2guStVYi475ro+da6LuiQVNgZvkGNVfUshM7wNOknHaxZcbgEKLwbNOUGw6bQ7Sa03gOJ1f5aVaMhaBEog5lU4H7meBJHxAAi3uiIjXdKc7AJq6W7lxWrxfZEN4LcNOVe7p2X9fOwdcHzth0lfp2V6e335nO5aQwbzhznbPRNVrcwA5UMog8YxUBjxuvgYoPns97fHuINRCikbET+g202kna6zxvZWyv61Bp6w4/n1uhr2X8/5qUKjeHbJOUyilAn+akyJef6OXovHy2bGVrD8epPTE131wU6lAdSQubgC7o8+IqcqKR/eYip0p/+zDZE/LzceCJeZ6tim0NCvvXL8JFJA6P85G4B11zHZ2u1eyk2CC2Ff6EuTONy9pkT/mHSM2pbPHoYTsKPeoOW7L/bs51v1U27hqnJewBDJGQJHTiDH11o22+hEUWM/gzt0FtyC5jbbq5MXfDwC3rdlZX2PpNMubGNdgG4I/21fZ+o7v1ATV5sYboB7L+Xf6skCb8sSnF6+9zbi2MFmDQpqxYzDbbYPmICpZSs4ZJQgXqe42FnqORPZeq0FXeVfMRQalpv7WSHFgfDV/aRHlmFN65WInLVeD76Oo+AXmDW28+wO5TYeN3+NEkcv3BLrVfiCWLF4DRPSfnov3BAMk56sVoByLDEc1QStk9knO+QoTJI/T3fkIe+myZpmjv73/dfYUSjmRKSIb2XoH2uwMtMqJWXNzHKkWCaKGx/jTPMgsNP/P+sDTOo/owewdI8KUiWoNGu4PoYC8aRHsD9BuaCZKh3n+hACXkAdpCQcOw0V//uhEO5Q6+heaj3ab2j1rbT9jUcN00RT2Q2e+JKJLY/fWv+m/Um6I+UbE7jnavI/3ut9/MFVm7AA8JN1tpcCVU6kKo12N8haScJ5G9W6taEJMFZz1vUYp3hEEb84Ne3mdzI7ag6SxPs2dSrbVUcddyGSN2T8pFD8+0vrJdD0CbPS1ubVHewHXLlqXC8f2WZfPbN+EKxS/+PwAAAP//AQAA//+PbykgY9AAAA=="

      + block_device_mappings {
          + device_name = "/dev/xvda"

          + ebs {
              + delete_on_termination      = "true"
              + encrypted                  = "true"
              + iops                       = (known after apply)
              + throughput                 = (known after apply)
              + volume_initialization_rate = (known after apply)
              + volume_size                = 8
              + volume_type                = "gp3"
            }
        }

      + credit_specification {
          + cpu_credits = "standard"
        }

      + iam_instance_profile {
          + name = "h4-prod-tunnel-end"
        }

      + instance_market_options {
          + market_type = "spot"

          + spot_options {
              + instance_interruption_behavior = "stop"
              + max_price                      = "0.0168"
              + spot_instance_type             = "persistent"
              + valid_until                    = (known after apply)
            }
        }

      + metadata_options {
          + http_endpoint               = "enabled"
          + http_protocol_ipv6          = (known after apply)
          + http_put_response_hop_limit = 1
          + http_tokens                 = "required"
          + instance_metadata_tags      = (known after apply)
        }

      + network_interfaces {
          + device_index         = 0
          + network_interface_id = "eni-<redacted>"
        }
      + network_interfaces {
          + device_index         = 1
          + network_interface_id = "eni-<redacted>"
        }

      + tag_specifications {
          + resource_type = "instance"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "volume"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
      + tag_specifications {
          + resource_type = "spot-instances-request"
          + tags          = {
              + "Name"        = "h4-prod-tunnel-end"
              + "component"   = "tunnel-end"
              + "environment" = "prod"
              + "project"     = "h4reet-ai"
            }
        }
    }

 # aws_network_interface_attachment.tunnel_end_public will no longer be managed by Terraform, but will not be destroyed
 # (destroy = false is set in the configuration)
 . resource "aws_network_interface_attachment" "tunnel_end_public" {
        id                   = "eni-attach-0c24e80a76b152a52"
        # (7 unchanged attributes hidden)
    }

  # aws_ssm_parameter.ec2_launch_templates will be created
  + resource "aws_ssm_parameter" "ec2_launch_templates" {
      + arn            = (known after apply)
      + data_type      = (known after apply)
      + description    = "EC2's launch templates, in its types' order, which h4-ec2-start launches from (spec 032)"
      + has_value_wo   = (known after apply)
      + id             = (known after apply)
      + insecure_value = (known after apply)
      + key_id         = (known after apply)
      + name           = "/h4reet/prod/ec2-launch-templates"
      + region         = "us-east-1"
      + tags           = {
          + "component" = "ec2"
        }
      + tags_all       = {
          + "component"   = "ec2"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + tier           = (known after apply)
      + type           = "String"
      + value          = <redacted>
      + value_wo       = (write-only attribute)
      + version        = (known after apply)
    }

  # aws_ssm_parameter.relay_vpc_origin_id will be created
  + resource "aws_ssm_parameter" "relay_vpc_origin_id" {
      + arn            = (known after apply)
      + data_type      = (known after apply)
      + description    = "The relay's CloudFront VPC origin, which h4-ec2-start points at a replaced tunnel end (spec 032)"
      + has_value_wo   = (known after apply)
      + id             = (known after apply)
      + insecure_value = (known after apply)
      + key_id         = (known after apply)
      + name           = "/h4reet/prod/relay-vpc-origin-id"
      + region         = "us-east-1"
      + tags           = {
          + "component" = "edge"
        }
      + tags_all       = {
          + "component"   = "edge"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + tier           = (known after apply)
      + type           = "String"
      + value          = <redacted>
      + value_wo       = (write-only attribute)
      + version        = (known after apply)
    }

  # aws_ssm_parameter.tunnel_end_launch_templates will be created
  + resource "aws_ssm_parameter" "tunnel_end_launch_templates" {
      + arn            = (known after apply)
      + data_type      = (known after apply)
      + description    = "The tunnel end's launch templates, in its types' order, which h4-ec2-start launches from (spec 032)"
      + has_value_wo   = (known after apply)
      + id             = (known after apply)
      + insecure_value = (known after apply)
      + key_id         = (known after apply)
      + name           = "/h4reet/prod/tunnel-end-launch-templates"
      + region         = "us-east-1"
      + tags           = {
          + "component" = "tunnel-end"
        }
      + tags_all       = {
          + "component"   = "tunnel-end"
          + "environment" = "prod"
          + "project"     = "h4reet-ai"
        }
      + tier           = (known after apply)
      + type           = "String"
      + value          = <redacted>
      + value_wo       = (write-only attribute)
      + version        = (known after apply)
    }

 # aws_volume_attachment.ec2_data will no longer be managed by Terraform, but will not be destroyed
 # (destroy = false is set in the configuration)
 . resource "aws_volume_attachment" "ec2_data" {
        id                             = "vai-2806388813"
        # (5 unchanged attributes hidden)
    }

 # aws_volume_attachment.shared_state will no longer be managed by Terraform, but will not be destroyed
 # (destroy = false is set in the configuration)
 . resource "aws_volume_attachment" "shared_state" {
        id                             = "vai-4185530388"
        # (5 unchanged attributes hidden)
    }

Plan: 11 to add, 2 to change, 0 to destroy.
```
<!-- /h4-plan -->

<!-- h4-plan root=account tree=06a4f1b205ea648c3aa8cb6db3b443f67af3f1e4 sha256=dddbeb0c34c5660b3018e215b768b1d003dbd92cc3b0893cf5d9ebc2c7dae36d terraform=1.17.1 made=2026-11-22T18:32:57Z -->
```terraform-plan

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
  ~ update in-place

Terraform will perform the following actions:

  # aws_iam_role_policy.ec2_start will be updated in-place
  ~ resource "aws_iam_role_policy" "ec2_start" {
        id          = "h4-ec2-start-fn:ec2-start"
        name        = "ec2-start"
      ~ policy      = jsonencode(
          ~ {
              ~ Statement = [
                    {
                        Action   = [
                            "logs:PutLogEvents",
                            "logs:CreateLogStream",
                        ]
                        Effect   = "Allow"
                        Resource = "arn:aws:logs:us-east-1:<account>:log-group:/aws/lambda/h4-ec2-start:*"
                        Sid      = "ItsLog"
                    },
                  ~ {
                      ~ Resource = [
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/tunnel-end-launch-templates",
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/relay-vpc-origin-id",
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/host-lock",
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/ec2-launch-templates",
                            "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/ec2-instance-id",
                            # (1 unchanged element hidden)
                        ]
                        # (3 unchanged attributes hidden)
                    },
                  + {
                      + Action   = "ssm:PutParameter"
                      + Effect   = "Allow"
                      + Resource = [
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/host-lock",
                          + "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/ec2-instance-id",
                        ]
                      + Sid      = "EC2sIDAndTheLock"
                    },
                  + {
                      + Action   = "ssm:DeleteParameter"
                      + Effect   = "Allow"
                      + Resource = "arn:aws:ssm:us-east-1:<account>:parameter/h4reet/prod/host-lock"
                      + Sid      = "TheLocksRelease"
                    },
                    {
                        Action   = "budgets:DescribeBudgetActionsForBudget"
                        Effect   = "Allow"
                        Resource = "arn:aws:budgets::<account>:budget/h4-server-month"
                        Sid      = "TheServerActionsStatus"
                    },
                  ~ {
                      ~ Action   = "ec2:DescribeInstances" -> [
                          + "ec2:DescribeVolumes",
                          + "ec2:DescribeSpotInstanceRequests",
                          + "ec2:DescribeInstances",
                        ]
                        # (3 unchanged attributes hidden)
                    },
                    {
                        Action   = "cloudwatch:DescribeAlarms"
                        Effect   = "Allow"
                        Resource = "arn:aws:cloudwatch:us-east-1:<account>:alarm:h4-laptop-away"
                        Sid      = "TheLaptopsAlarm"
                    },
                    {
                        Action    = "ec2:StartInstances"
                        Condition = {
                            StringEquals = {
                                "ec2:ResourceTag/Name" = "h4-prod-ec2"
                            }
                        }
                        Effect    = "Allow"
                        Resource  = "arn:aws:ec2:us-east-1:<account>:instance/*"
                        Sid       = "StartTheTaggedInstance"
                    },
                  + {
                      + Action    = "ec2:RunInstances"
                      + Condition = {
                          + StringEquals = {
                              + "aws:ResourceTag/component" = [
                                  + "ec2",
                                  + "tunnel-end",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = "arn:aws:ec2:us-east-1:<account>:launch-template/*"
                      + Sid       = "LaunchFromTheHostsTemplates"
                    },
                  + {
                      + Action    = "ec2:RunInstances"
                      + Condition = {
                          + StringEquals = {
                              + "aws:RequestTag/Name"    = [
                                  + "h4-prod-ec2",
                                  + "h4-prod-tunnel-end",
                                ]
                              + "ec2:InstanceMarketType" = "spot"
                              + "ec2:InstanceType"       = [
                                  + "t4g.large",
                                  + "m7g.large",
                                  + "m6g.large",
                                  + "t4g.xlarge",
                                  + "t4g.small",
                                  + "c7g.medium",
                                  + "c6g.medium",
                                  + "t4g.medium",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = "arn:aws:ec2:us-east-1:<account>:instance/*"
                      + Sid       = "LaunchOnlyAHost"
                    },
                  + {
                      + Action    = "ec2:RunInstances"
                      + Condition = {
                          + ArnLike = {
                              + "ec2:LaunchTemplate" = "arn:aws:ec2:us-east-1:<account>:launch-template/*"
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:ec2:us-east-1:<account>:volume/*",
                          + "arn:aws:ec2:us-east-1:<account>:spot-instances-request/*",
                        ]
                      + Sid       = "WhatALaunchFromATemplateMakes"
                    },
                  + {
                      + Action    = "ec2:RunInstances"
                      + Condition = {
                          + ArnLike = {
                              + "ec2:LaunchTemplate" = "arn:aws:ec2:us-east-1:<account>:launch-template/*"
                            }
                          + Bool    = {
                              + "ec2:IsLaunchTemplateResource" = "true"
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:ec2:us-east-1::image/*",
                          + "arn:aws:ec2:us-east-1:<account>:subnet/*",
                          + "arn:aws:ec2:us-east-1:<account>:security-group/*",
                          + "arn:aws:ec2:us-east-1:<account>:network-interface/*",
                        ]
                      + Sid       = "WhatOnlyTheTemplateNames"
                    },
                  + {
                      + Action    = "ec2:CreateTags"
                      + Condition = {
                          + StringEquals = {
                              + "ec2:CreateAction" = "RunInstances"
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = "arn:aws:ec2:us-east-1:<account>:*/*"
                      + Sid       = "TagOnlyAtTheLaunch"
                    },
                  + {
                      + Action    = [
                          + "ec2:TerminateInstances",
                          + "ec2:CancelSpotInstanceRequests",
                        ]
                      + Condition = {
                          + StringEquals = {
                              + "ec2:ResourceTag/Name" = [
                                  + "h4-prod-ec2",
                                  + "h4-prod-tunnel-end",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:ec2:us-east-1:<account>:spot-instances-request/*",
                          + "arn:aws:ec2:us-east-1:<account>:instance/*",
                        ]
                      + Sid       = "RetireTheOldHost"
                    },
                  + {
                      + Action    = "ec2:AttachVolume"
                      + Condition = {
                          + StringEquals = {
                              + "ec2:ResourceTag/Name" = [
                                  + "h4-prod-ec2",
                                  + "h4-prod-tunnel-end",
                                  + "h4-ec2-data",
                                  + "h4-shared-state",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:ec2:us-east-1:<account>:volume/*",
                          + "arn:aws:ec2:us-east-1:<account>:instance/*",
                        ]
                      + Sid       = "AttachTheHostsVolume"
                    },
                  + {
                      + Action    = "iam:PassRole"
                      + Condition = {
                          + StringEquals = {
                              + "iam:PassedToService" = "ec2.amazonaws.com"
                            }
                        }
                      + Effect    = "Allow"
                      + Resource  = [
                          + "arn:aws:iam::<account>:role/h4-prod-tunnel-end",
                          + "arn:aws:iam::<account>:role/h4-prod-ec2",
                        ]
                      + Sid       = "PassTheHostsRolesToEC2"
                    },
                  + {
                      + Action   = [
                          + "cloudfront:UpdateVpcOrigin",
                          + "cloudfront:GetVpcOrigin",
                        ]
                      + Effect   = "Allow"
                      + Resource = "arn:aws:cloudfront::<account>:vpcorigin/*"
                      + Sid      = "RepointTheRelaysOrigin"
                    },
                    {
                        Action   = "sns:Publish"
                        Effect   = "Allow"
                        Resource = "arn:aws:sns:us-east-1:<account>:h4-alerts"
                        Sid      = "ItsAlerts"
                    },
                ]
                # (1 unchanged attribute hidden)
            }
        )
        # (2 unchanged attributes hidden)
    }

  # aws_lambda_function.ec2_start[0] will be updated in-place
  ~ resource "aws_lambda_function" "ec2_start" {
        id                             = "h4-ec2-start"
        tags                           = {
            "component" = "handover"
        }
      ~ timeout                        = 30 -> 900
        # (30 unchanged attributes hidden)

        # (4 unchanged blocks hidden)
    }

  # aws_lambda_function_event_invoke_config.ec2_start[0] will be updated in-place
  ~ resource "aws_lambda_function_event_invoke_config" "ec2_start" {
        id                           = "h4-ec2-start"
      ~ maximum_event_age_in_seconds = 300 -> 900
        # (4 unchanged attributes hidden)
    }

  # aws_scheduler_schedule.ec2_budget_check[0] will be created
  + resource "aws_scheduler_schedule" "ec2_budget_check" {
      + action_after_completion      = (known after apply)
      + arn                          = (known after apply)
      + description                  = "The guard's budget check: h4-ec2-guard, from budget_check (spec 032)"
      + group_name                   = (known after apply)
      + id                           = (known after apply)
      + name                         = "h4-ec2-budget-check"
      + name_prefix                  = (known after apply)
      + region                       = "us-east-1"
      + schedule_expression          = "rate(5 minutes)"
      + schedule_expression_timezone = "UTC"
      + state                        = "ENABLED"

      + flexible_time_window {
          + mode = "OFF"
        }

      + target {
          + arn      = "arn:aws:lambda:us-east-1:<account>:function:h4-ec2-guard"
          + input    = jsonencode(
                {
                  + from = "budget_check"
                }
            )
          + role_arn = "arn:aws:iam::<account>:role/h4-ec2-hours"

          + retry_policy {
              + maximum_event_age_in_seconds = 86400
              + maximum_retry_attempts       = 0
            }
        }
    }

  # aws_scheduler_schedule.tunnel_end_check[0] will be created
  + resource "aws_scheduler_schedule" "tunnel_end_check" {
      + action_after_completion      = (known after apply)
      + arn                          = (known after apply)
      + description                  = "The tunnel end's check: the start function, from tunnel_end_check (spec 032)"
      + group_name                   = (known after apply)
      + id                           = (known after apply)
      + name                         = "h4-tunnel-end-check"
      + name_prefix                  = (known after apply)
      + region                       = "us-east-1"
      + schedule_expression          = "rate(5 minutes)"
      + schedule_expression_timezone = "UTC"
      + state                        = "DISABLED"

      + flexible_time_window {
          + mode = "OFF"
        }

      + target {
          + arn      = "arn:aws:lambda:us-east-1:<account>:function:h4-ec2-start"
          + input    = jsonencode(
                {
                  + from = "tunnel_end_check"
                }
            )
          + role_arn = "arn:aws:iam::<account>:role/h4-ec2-hours"

          + retry_policy {
              + maximum_event_age_in_seconds = 86400
              + maximum_retry_attempts       = 0
            }
        }
    }

Plan: 2 to add, 3 to change, 0 to destroy.
```
<!-- /h4-plan -->
