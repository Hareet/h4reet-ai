# Quickstart: validating spec 001, EC2 as prod's default host

Phase 1 output of `/speckit-plan`, drafted on 2026-11-09 for the Author's review. It replaces the September quickstart (`quickstart.md` at 00309c47). These are the runs that prove each task group and each success criterion, against real AWS, the laptop, and the agents' engine. It is a validation guide, not an implementation: the commands are the plan's, and the contracts hold the details. The relay runs on the tunnel end, and the tunnel end on spot, by the Author's answers to the plan's questions 1 and 2.

**Conventions.**
- **"Your terminal"** is the Author's, outside Claude Code. Agents can't run these commands.
- **Each run's record** (outputs, times, and AWS's own timestamps) goes into the group's merge-request note, redacted of account IDs and addresses.
- **No run reads or prints a secret value.**
- **Each group's order** (plan §16; tasks.md): your plan block on the branch, from a scratch clone with the group's patches applied and committed there; the review and the note; then your patches on the branch, the gate, and the merge; then your apply on `main`. The runs below are the ones after the merge.

## 0. Before any group

1. Approve the spec and the plan (tasks.md T000), and answer the plan's question 8. Done on 2026-11-10: his approval takes option A (spec.md Clarifications, Session 2026-11-10).
2. Apply the constitution's 1.1.0 patch as amended on `docs/001-ec2-default`, with your question 8 wording if you chose A, and accept ADR 0044 (T001). `.specify/memory/constitution.md` reads "**Version**: 1.1.0". Groups 3 to 9 check this first.

## 1. Group 1: the guards

1. Apply P-1 and P-3 (plan §2, §14). Run the matrix. Expect zero failures, and a planned row only for checks whose targets don't exist yet.
2. In an agent session, try `terraform apply`, `make ec2-start`, `make operator-init ENV=shared`, and `make release`, in the matrix's spellings. Each is refused, with a reason and an audit record.
3. In your terminal, `make infra-mirror`; then `make check`. `infra-check` moves from "PLANNED (T011)" to "PLANNED (T020)": it reads PLANNED until group 3 writes `infra/` (tasks.md T011), then PASS.

## 2. Group 2: the measurement, and your figure

1. An agent session runs research.md R-33's measurement on `dev-cpu`, and records each service's peak memory, the disks, and which images have arm64. **As built** (plan.md §16, group 2's departures): first your disk check in your terminal, at least 30 GB free on the drive under WSL's disk (`df -h /mnt/c`), with no other agent using the engine. Then the main working tree on `feat/001-measure`, since dev-cpu runs from it. Then the session runs `make up ENV=dev-cpu`, `make measure-stack ENV=dev-cpu`, and `make down ENV=dev-cpu` there. `make arch-inventory` reads the store alone and has already run (R-33's record).
2. Price research.md R-05's lines from AWS's pages in your terminal: EC2's measured types on spot, and an 8-to-12-hour day as the reserve; the tunnel end on spot (plan question 2); RDS; the health check; and the "to confirm" lines.
3. Set `TF_VAR_server_budget_usd` in `~/.config/h4reet-ai/infra/bootstrap.env`, and record your prices on the branch before its review.

## 3. Group 3: the bootstrap (SC-012 starts)

1. **As built:** first, on the branch, make the root's lockfile from your mirror (`terraform -chdir=infra/bootstrap providers lock -fs-mirror=…`, as `infra/README.md` gives it) and commit it. Then `make plan ROOT=bootstrap PROFILE=…` in a scratch clone with P-I1 applied; paste the block; after the review, apply P-I1 on the branch; the gate passes; merge.
2. `make infra-verify ROOT=bootstrap PROFILE=…`, run the command it prints, then `make infra-record ROOT=bootstrap OUTCOME=ok`. Migrate the state (`terraform init -migrate-state`), and record it: **as built,** from a branch of its own that switches `versions.tf`'s backend to `s3` (plan.md §16, group 3's departure 4).
3. Activate the cost-allocation tags in the Billing console. Confirm SNS's email subscription.
4. Check that `h4-model-month`, `h4-model-day`, `h4-server-month`, and the anomaly monitor exist with their thresholds.

## 4. Group 4: the safety net (SC-009)

1. Apply `infra/account`, with the import of the laptop's Bedrock permission set, now narrowed to `sts:AssumeRole` on `h4-laptop-bedrock`. Point the laptop's Bedrock profile at that role, as the runbook says, and check with `aws sts get-caller-identity` that it names `h4-laptop-bedrock`, with no paid call. Write the Telegram parameters.
2. Set `rehearsal = true`, plan, and apply. Start `h4-rehearsal-instance`, since stopping a stopped instance proves nothing, and check it is `running`. Wait for AWS to evaluate both $0.01 budgets.
3. Record, per action, from AWS's timestamps: when it evaluated; when Telegram and email got the alert; when the policy was attached to `h4-rehearsal-target`, an ordinary role of the same shape as `h4-laptop-bedrock` (to confirm), and when `h4-rehearsal-instance` was stopped, with the SSM run's status from the action's history (`AWS-StopEC2Instance` succeeded) and the instance's state after it (`stopped`). Note the delay.
4. `rehearsal = false`; plan; apply.

**SC-009 passes** when both channels got each alert and each action took effect on its target.

**As built in group 4** (plan.md §16, group 4's departures): every apply needs its plan in a merged note, so steps 2 and 4 are reviewed changes of `infra/account/main.tf`'s `local.rehearsal`, and the functions come in a change of their own, once their images are in the registry the first apply makes (`local.lambda_images`): apply the account root; push the images; set their digests and `rehearsal = true` together, with the marker `infra/account/rehearsal-on.txt` naming that change's note; then `rehearsal = false`, removing the marker. The model rehearsal fires only once the month holds a cent of Bedrock's spend, as Cost Explorer shows it under `TF_VAR_bedrock_service_names`'s names. The instance runs from its creation. Spec 000's hand-made policy on the permission set is detached by hand, once, after the chained profile works (`docs/runbooks/laptop.md`). The branch's note gives each step as commands.

## 5. Group 5: the tunnel end and the tunnel (SC-006)

1. Apply `infra/prod`'s network and the tunnel end, and `infra/account`'s warning rule for it. Run `make tunnel-keys`, then `make secrets-check`. `make cloud-session HOST=tunnel-end` opens a Systems Manager session to it.
2. `make up ENV=prod` on the laptop, with the `tunnel` profile. `h4.tunnel.up` is 1 on both ends.
3. From a machine outside your network, scan your public address: zero open ports. Stop the tunnel and scan again: zero.
4. Scan the tunnel end's Elastic IP: only 2222, and 8087 from Route 53's ranges, which looks closed from your scanner.
5. `make tunnel-revoke`: the tunnel drops within a minute, and the dashboard's tunnel panel shows it. Restore the key.

**SC-006 passes** when both scans of your address find zero open ports.

## 6. Group 6: the shared state, and the move

1. Apply RDS. Write the role passwords to Parameter Store and the laptop's env file, then run `make shared-state-roles`.
2. Start any prod gateway against it: migrations 0001–0007 run once, and the store is `uninitialized`, so it answers degraded.
3. Move the meter (data-model.md §1.5):
   - stop the laptop's paid route;
   - run `make operator-status ENV=prod`, and record its values;
   - run `make operator-init ENV=shared` with them, and a reason;
   - release the cutover, so the laptop's prod uses the shared store.
4. Run `make operator-status ENV=shared`. The values are the carried ones, and nothing is zero that wasn't.
5. Run the two-gateways test's record (plan §10), from the group's note.
6. Run `make operator-status ENV=shared` once while the laptop's prod runs, and once while it doesn't: the first uses prod's admin listener, the second the admin-only stack, and neither fails on port 18003.

## 7. Group 7: EC2 (SC-005, SC-017)

1. Before the merge, on the branch: apply P-I4, then add EC2's route line to `config/routing.yaml`, `ec2: { first: anthropic, second: bedrock }`, in your own commit (ADR 0041; tasks.md T095). Your words in row F3 are already adopted, on `feat/010-anthropic-switch`, which reached `main` before group 6. So `make test`'s placeholder gate, which now reads every host route, passes with EC2's route naming the Anthropic API. Gate, and merge.
2. Apply EC2, and write its secrets: the Anthropic key, Telegram's and SMTP's, the store's passwords, and its relay token. Set the Anthropic account's monthly spend limit at or under $20 where the account offers one, and record that it is set.
3. `make release`. Start EC2 from the console (`make ec2-start` arrives in group 9). Its deployer checks the bucket, then the stack starts. `make cloud-session HOST=ec2`, then hello through the internal path: answered by `anthropic`, with provider, model, tokens, and cost on the span and the ledger row, `host = ec2`, attribution `metered`.
4. **SC-017:** run the recorded 100-turn run on EC2's stack, with stand-ins for both paid APIs, healthy and then with the Anthropic stand-in failing:
   - with both healthy, 100% of answered turns come from the Anthropic adapter;
   - with it failing, 100% of admitted turns come from Bedrock;
   - `fallback_day` is unchanged in both.
5. **SC-005:** destroy and recreate EC2 (plan, apply). Its digests match the release, and `make operator-status ENV=shared` is unchanged.

## 8. Group 8: the edge and the relay

1. Point the registrar's name servers at the zone, and record it. Apply the certificate, the distribution, and the VPC origin, and `infra/account`'s P-I5 line that enables the probe's schedule. Deploy the relay on the tunnel end.
2. Run the red-team cases on all four adapters, and record that they passed (FR-039).
3. `curl -I https://hareet.ai/`: TLS, HSTS, the CSP. `curl http://hareet.ai/` redirects to HTTPS.
4. Stop EC2 with the laptop off. `POST /api/hello` gets 503 `no_host_serving` from the relay. Stop the relay: the edge's own body, the same cause. The site still loads.

## 9. Group 9: the handover (SC-001, SC-007, SC-010, SC-011, SC-018)

1. Apply the health check, the alarm, the rules, the two functions, and the autostart switch, set `on` so EC2 may start automatically.
2. **Laptop to EC2, ten times:** with the laptop serving and EC2 stopped, cut the laptop: `make down ENV=prod`, or pull its network. For each run, check that:
   - `h4-ec2-start` fires once;
   - EC2 starts, and the relay serves it;
   - every dynamic request in between got an answer or `no_host_serving`, with no DNS, TLS, or gateway error page, from a scripted client sending a request a second;
   - the gap's length is recorded.
3. **EC2 to the laptop, ten times:** with EC2 serving, run `make up ENV=prod` on the laptop. For each run, check that:
   - the relay serves the laptop;
   - `h4-handover` stops EC2 within 5 minutes;
   - no request went unanswered.
4. **The autostart switch:** `make ec2-autostart STATE=off`, then cut the laptop. EC2 stays stopped, and `ec2_start_refused (paused)` arrives. `make ec2-autostart STATE=on`: EC2 starts.
5. **The guard:** with the laptop serving, `make ec2-start` is refused (`laptop_serving`). Start EC2 from the console: the guard stops it and alerts `ec2_stopped_laptop_serving`. Its third stop, while the server budget's action has run (`ec2_stopped_server_budget`), is proven by its tests (tasks.md T117); group 4's rehearsal of that action stops `h4-rehearsal-instance`, never EC2.
6. **The dashboard:** the "Hosts" row shows EC2's state, each start and refusal, the guard's stops, the autostart switch, the health check's status, and the handover window, from the sink's cloud reads.
7. **SC-018, five times:** rehearse a spot interruption on EC2, through AWS's fault-injection service or the console's interruption test (to confirm and to price). Check each time that:
   - the warning's alert arrives within AWS's notice;
   - requests get `no_host_serving`;
   - EC2 serves again without you once capacity returns;
   - the shared state's values are unchanged.

   Then **three times on the tunnel end** (spec FR-076), once while each host serves and once while EC2 is stopped. Check that:
   - `tunnel_end_interruption` arrives;
   - the site loads, and every dynamic request gets the edge's `no_host_serving`;
   - while it is gone, cutting the laptop gives `ec2_start_refused (tunnel_end_down)`;
   - while it is gone, `/status/` names no host serving, beside its last-known values and their times (spec FR-057);
   - on its return, `tunnel_end_back` arrives, the laptop's tunnel reconnects, the start function runs once, and the relay serves whichever host is up. If the start function started EC2 while the laptop was reconnecting, the loop stops it within 5 minutes of the relay serving the laptop.
8. **SC-001:** over a day, with the laptop off and EC2 serving, the probe's results: 100% within 5 s; windows with no host answered `no_host_serving` within 5 s.
9. **The first public release.** Then **SC-010:** load every page and call hello, the status, and a twin turn with the browser's network log on. 100% of requests go to hareet.ai, and no cookie is set. **SC-011:** `evals/visitor_scan.py` after a scripted visit with a marker message, on each host and the shared state: zero finds.

## 10. Group 10: the public view (SC-013)

With both hosts off for an hour, `/status/` answers 100% of the time with last-known values, their times, and "no host serving". Start a host: fresh values within 5 minutes.

## 11. Group 11: the close (SC-002, SC-003, SC-004, SC-012, SC-014, SC-016)

After the first full month:
- **SC-002:** AWS's cost data, all but Bedrock, at or under your figure;
- **SC-003:** model spend on the shared meter at or under $20 for the month and $5 for each day, with AWS's Bedrock cost and the Anthropic account's usage each at or under what the meter counted;
- **SC-016:** from `handover_events` and EC2's state history, EC2's running time while the laptop served is at most 5 minutes per handover and per AWS restart;
- **SC-004:** the credential audit's weekly results;
- **SC-012:** every infrastructure change has its block and its record;
- **SC-014:** every ADR in plan §14 is two clicks from the README.

Spec 001 is done when SC-001 to SC-018 pass, but SC-015, which moved to the publication spec, and the matrix shows zero failures and zero planned rows.
