# Quickstart: validating spec 001

Phase 1 output of `/speckit-plan`. These are the runs that prove each task group, and each success criterion, against real AWS and the Author's machine. They're a validation guide, not an implementation: the commands are the plan's, and the contracts hold the details this file links instead of repeating.

Contracts: [env-cloud.md](contracts/env-cloud.md), [infra-records.md](contracts/infra-records.md), [aws-alerts.md](contracts/aws-alerts.md), [relay-http.md](contracts/relay-http.md), [tunnel.md](contracts/tunnel.md), [edge.md](contracts/edge.md), [releases-deployer.md](contracts/releases-deployer.md), [public-view.md](contracts/public-view.md). Data: [data-model.md](data-model.md).

## Conventions

Spec 000's conventions hold (its [quickstart.md](../000-local-foundations/quickstart.md#conventions)): **the Author's terminal**, **an agent session**, **Heavy**, and **the evidence**. Plus:
- **AWS:** every command that touches AWS is the Author's terminal, with the Author's own Identity Center session (`aws sso login`). Agent sessions have no AWS credential at all.
- **Applies:** every apply is §1's sequence: `make plan`, the note, the merge, `make infra-verify`, `terraform apply` of the saved plan, `make infra-record`. Each section below says only which root it applies.
- **What never goes in a note:** an account ID, a portal URL, an email address, a chat ID, a key, a token, or an Elastic IP. The redaction removes them from plans and records ([infra-records.md §2](contracts/infra-records.md#2-the-plan-block-fr-005)). Anything copied by hand gets the same treatment.
- **Spend:** the runs below make a handful of Bedrock calls and run the VM. Every cent lands on the meter of record once group 4 exists, and on AWS's budgets from the first apply.

## 0. Before group 1

| Step | Where | Check |
|---|---|---|
| Spec 000's open criteria: SC-001's re-run and SC-002 (interview question 1) | the Author's terminal; spec 000's quickstart §1.2 and §2.2 | their results are in spec 000's T119 table |
| An administrator permission set for the Author in IAM Identity Center, and `aws sso login` with it | the console, then the Author's terminal | `aws sts get-caller-identity` names the Author's role. Record the role's name, not the account |
| The plan interview's nine answers ([research.md](research.md#the-plan-interview-to-ask)) | the Author | recorded in the plan's approval commit |

## 1. Group 1: the guards (FR-004, FR-006, FR-011, FR-012)

1. Apply the guard patch: `git apply docs/merge-requests/<date>-feat-001-guards.patch`, then `claude doctor` and `make git-hooks`, as spec 000's patches.
2. `make tools`, then `make toolchain-check`. Expected: Terraform and the AWS CLI at their new pins.
3. `make infra-mirror`. Expected: the pinned `hashicorp/aws` under `~/.local/share/h4reet/terraform-providers`.
4. The agent-config evals, once ([spec 000 quickstart §6.3](../000-local-foundations/quickstart.md)).

**Expected, from an agent session's `make check`:**
- `matrix`: every new FR-006, FR-011, and FR-012 row passes. For example: `terraform -chdir=infra/prod apply`, `bash -c 'terraform destroy'`, `tofu apply`, `TF_CLI_ARGS_plan=-out=x terraform plan`, `terraform state rm`, `terraform force-unlock`, `terraform test`, `terraform init -migrate-state`, a Read of `x.tfstate`, an Edit of `infra/prod/iam.tf`. Any gap row names the spelling that gets through.
- `infra-check`: PLANNED until the first `infra/` file; then PASS.

## 2. Group 2: the bootstrap, the first apply (FR-001 to FR-003, FR-005, FR-007, FR-008, FR-022)

1. Write `~/.config/h4reet-ai/infra/bootstrap.env` (0600): `TF_VAR_alert_email`, `TF_VAR_state_suffix`. In an editor, in the Author's terminal.
2. `make plan ROOT=bootstrap`. Paste the block into the note. **Expected:** the gate's `infra-plan-note` passes on the branch.
3. After the merge: `make infra-verify ROOT=bootstrap`, then the printed `terraform … apply …`. **Expected:** the state bucket, five budgets, the anomaly monitor and its subscription, and the `h4-alerts` topic with its email subscription.
4. `terraform -chdir=infra/bootstrap init -migrate-state`, so the bootstrap's state moves to its bucket (FR-003). **Expected:** the bucket holds `bootstrap.tfstate`, versioned, and `aws s3api get-bucket-policy-status` reports it isn't public.
5. `make infra-record ROOT=bootstrap OUTCOME=ok`, which notes the migration too. Merge `ops/apply-bootstrap-<date>`.
6. Follow SNS's confirmation link in the alerts mailbox. Activate the `project`, `environment`, and `component` cost-allocation tags in the Billing console, and record that step in the next note.
7. `make infra-audit`. **Expected:** clean, unless spec 000's old IAM user `h4reet-runtime` still has a key, which FR-013 already requires gone. A finding blocks the next apply.

**Proves:** FR-022's order (the budgets in the first apply); the start of SC-012 (a plan and a record for the first infrastructure change).

## 3. Group 3: the safety net (FR-020, FR-023, FR-026, FR-061; SC-009)

1. **Set the Telegram parameters**, with `aws ssm put-parameter --overwrite --type SecureString`:
   - `/h4reet/cloud/TELEGRAM_BOT_TOKEN`;
   - `/h4reet/cloud/TELEGRAM_CHAT_ID`.

   Never paste either into a note.
2. **Apply the config patch:** `config/budgets.yaml` gains `infra.month_estimate_usd` and the `public` section, by the Author's patch, with its ADR.
3. **Apply `account`** with `rehearsal = true`.
4. **The rehearsal (SC-009):** wait for AWS to evaluate `h4-rehearsal`; AWS updates budgets up to three times a day, so this can take hours. Then record, from AWS's own timestamps ([aws-alerts.md §3.4](contracts/aws-alerts.md#34-the-rehearsals-record-sc-009)):
   - when AWS evaluated the budget;
   - when the action ran;
   - Telegram's `message_id` and date, and the email's `Date`;
   - and check: `aws iam list-attached-role-policies --role-name h4-rehearsal-target` lists `h4-deny-paid-models`.
5. **End the rehearsal:** apply `account` with `rehearsal = false`. **Expected:** the rehearsal budget, its action, and the attachment are gone.
6. **The probe:** its Lambda runs every minute. Before group 6 the site doesn't exist, so the probe fails and its alarm fires. **Expected:** `probe_failing` on both channels within 5 minutes, which is FR-061's path proven early. Then the probe stays disabled (`enabled = false` on its schedule) until group 6.

**Proves:** SC-009, and FR-023's mechanism against a rehearsal target.

## 4. Group 4: the cloud VM (FR-013, FR-017 to FR-019, FR-043 to FR-051; SC-005, SC-008)

### 4.1 One-time on the Author's machine

```bash
docker run --privileged --rm tonistiigi/binfmt@sha256:<the digest the task pins> --install arm64   # once: QEMU for arm64 builds
```

### 4.2 The apply, the secrets, the first release

1. Apply `prod` (network, VM, volumes, roles, parameters; no edge yet).
2. Set each `/h4reet/cloud/*` parameter that `write-env.py` names as `__SET_BY_AUTHOR__` ([env-cloud.md §1](contracts/env-cloud.md#1-the-files)). Generate the passwords as `make init-env` does; mint the operator token with `make operator-token ENV=cloud`, and put its hash, not the token, in the parameter.
3. `make release`. **Expected:** `release.json` printed, the images in ECR with both platforms, and the VM's deployer starting the stack within two minutes. Check through `make cloud-session` and `make status ENV=cloud`, which shows `store: uninitialized` until §4.3.

### 4.3 The meter of record moves (FR-017, FR-019)

1. `make operator-status ENV=prod`. Record the month's spend, today's spend, today's fallback spend, the crossed ceilings, and the renewal flag.
2. With `make cloud-session` open: `make operator-init ENV=cloud REASON="move the meter of record from prod (spec 001 FR-019)" MONTH_USD=… DAY_USD=… FALLBACK_TODAY_USD=…`, plus `RENEW=1` if prod's flag was clear.
3. **Expected:** `make operator-status ENV=cloud` shows the carried values and `normal`, and its audit log holds the `init`. Then `make hello ENV=cloud`, with the local path not yet built, answers `X-H4-Path: fallback` with `route_reason: "local_path_unhealthy"`: one Bedrock call, on the meter of record.
4. Local prod's route loses its fallback in this group's commit. `make up ENV=prod`, then `make hello ENV=prod`. **Expected:** `route: "local"`. With the model server stopped: 503 `no_fallback_in_stack`, and no Bedrock call from the local tier.
5. Delete spec 000's hand-made runtime identity in IAM Identity Center: the user, the permission set, and the assignment. Record it; the next `make infra-audit` checks it (FR-013).

### 4.4 The breach test on dev-cpu (FR-025; SC-008)

Agents run this: `make breach-test ENV=dev-cpu`. **Expected:** spec 000's assertions, plus the relay's:
- within 10 s of the trip, the relay answers 503 `kill_switch_tripped` without forwarding;
- after the operator's reset, it forwards again;
- with the store stopped, 100% of the relay's answers are degraded (`store_unreachable`).

### 4.5 Destroy and recreate the VM (SC-005)

1. Record `make status ENV=cloud`'s digests, and `make operator-status ENV=cloud`'s meters.
2. Plan and apply `prod` with the VM's replacement (`-replace=aws_instance.vm`, which the Author's plan shows). The meter's volume survives (`prevent_destroy`).
3. **Expected:** the new VM's deployer brings up the same release; the digests match; the meters are unchanged; and the store needs no initialization, since its volume came back.

### 4.6 The memory fit (R-04)

The breach test's load (4.4) on the cloud stack, through the operator's session: `make status ENV=cloud` shows each service's memory, and the host's swap in use. **Expected:** under 100 MiB of swap. Otherwise the instance becomes a `t4g.small`, a plan, and research R-05's second total.

## 5. Group 5: the tunnel (FR-052 to FR-056; SC-006, SC-007)

1. `make tunnel-keys`. **Expected:** fingerprints only on screen; the files in `~/.config/h4reet-ai/tunnel/`; the parameters set; the prod env file's tunnel keys filled.
2. `make up ENV=prod`, with `tunnel` added to the prod env file's `COMPOSE_PROFILES`. **Expected:** `h4.tunnel.up` at 1 from both ends, and the relay's local path healthy after three checks.
3. With `make cloud-session` open, a hello at the relay on the VM: `make hello ENV=cloud` ([env-cloud.md §7](contracts/env-cloud.md#7-the-vms-host-credentials-the-operator-session-the-egress-proxy)). **Expected:** `X-H4-Path: local`, `route: "local"`, and one trace that spans the relay and the local gateway.
4. **SC-006, the scan.** From a machine outside the home network, scan the local tier's public address, with the tunnel up and then down: `nmap -Pn -p- <address>`, run by the Author. **Expected:** zero open ports both times. Record the counts, not the address.
5. **SC-007, the cut.** `docker compose -p h4reet-prod … stop tunnel`, while a loop calls `make hello ENV=cloud` once a second. **Expected:** the first `X-H4-Path: fallback` within 5 s of the first failed check. Then start `tunnel`: `X-H4-Path: local` again after three passing checks. Record the timings from the relay's `relay.path.change` logs.
6. **Revocation:** `make tunnel-revoke`. **Expected:** the connection ends, `tunnel` keeps failing to authenticate, and the relay falls back. Then `make tunnel-keys ROTATE=client`, and it's back.
7. **The runbook:** follow `docs/runbooks/local-tier.md` after a `wsl --shutdown` (Heavy). **Expected:** the tier rejoins, and the steps are as written.

## 6. Group 6: going public (FR-027 to FR-042; SC-001, SC-010, SC-011)

### 6.1 The domain

1. Apply `prod`'s edge resources: the zone, the certificate, the distribution, the site's bucket.
2. At the registrar, set the domain's name servers to the zone's four. Record it in `docs/infra/applies/<date>-dns-delegation.md` ([infra-records.md §6](contracts/infra-records.md#6-the-apply-record)).
3. **Expected:** `dig +short NS h4reet.ai` gives the zone's servers; the certificate is issued; `curl -sI http://h4reet.ai/` answers 301 to HTTPS.

### 6.2 Hello's red-team run, then the first public release (FR-039)

1. `make redteam CASES=hello ENV=prod`, against local prod's model. **Expected:** every case passes, and the run is recorded in `redteam/history/` for the commit.
2. `make release`, which now requires that record. **Expected:** the site live at `https://h4reet.ai/`, and the probe re-enabled (apply `account` with the schedule on).

### 6.3 SC-001: the local tier off

With the tunnel stopped (or the machine asleep), time a visit from a browser, and three hellos with `curl -w '%{time_total}'` at `https://h4reet.ai/api/hello`. **Expected:** the page loads; each hello answers within 5 s with `X-H4-Path: fallback` (or degraded, with its cause); and the site says the Author's machine can't be reached.

### 6.4 SC-010: what the browser contacts

In a private browser window with the network log open, load every page, call hello, and open `/status/`. **Expected:**
- every request goes to `h4reet.ai`;
- the storage panel shows zero cookies and no local or session storage.

Record the host list and the counts. The site's static scan in `make check` is the other half.

### 6.5 SC-011: nothing kept

1. **A scripted visit:** `evals/visitor_scan.py visit` sends hellos with a marker message through the public edge.
2. **The scan:** an hour later, `evals/visitor_scan.py scan ENV=prod` and `ENV=cloud`, through the operator's session. It searches every store on both stacks for the marker message, its answers, and the Author's own public address (the test visitor's):
   - Loki's logs, Langfuse's traces, and Prometheus's labels;
   - both ledgers, both journals, and the alert outboxes;
   - the relay's, `tunnel-end`'s, and the edge's logs.
3. **Expected:** zero matches. The script prints counts per store, never the address.

## 7. Group 7: the public view (FR-057 to FR-059; SC-013)

1. **Expected first:** `https://h4reet.ai/status/` shows the local and cloud values, each with when it was taken, and the local part no older than 5 minutes.
2. **SC-013:** stop the tunnel, or the local tier, for one hour. Meanwhile, a loop fetches `/status/` and `/status/latest.json` once a minute. **Expected:**
   - every fetch answers;
   - the page shows the last local values with their old time, fresh cloud values, and "the Author's machine can't be reached".

   Record the count of fetches and failures.
3. **Restart:** `make up ENV=prod`. **Expected:** fresh local values within 5 minutes (FR-058).

## 8. Group 8: the close (SC-002, SC-003, SC-004, SC-012, SC-014)

| Criterion | Run | Expected |
|---|---|---|
| SC-002 | after the first full month: Cost Explorer, with Bedrock excluded, for that month; and the meter's `infra_month_usd` | at most $10, and the meter's figure within AWS's |
| SC-003 | the same month: Cost Explorer's total and daily costs for the account | at most $20 for the month, and no UTC day over $5 |
| SC-004 | `audits/credential/` for each week since group 2 | every result clean, or each finding resolved in the next |
| SC-012 | every merged `infra/` change against `docs/infra/applies/`: a plan block for each, a record matching each block's `sha256`, and the bash gate's log showing no agent apply | 100% |
| SC-014 | from the README, the ADR index, then each of FR-062's ADRs | two clicks each |

The success-criteria table goes in group 8's note, in the spec's words, as spec 000's T119 did.
