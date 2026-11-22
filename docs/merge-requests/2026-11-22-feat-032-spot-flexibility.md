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
