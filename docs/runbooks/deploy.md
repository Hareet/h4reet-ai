# Runbook: a cloud host's deployer refused, rolled back, or couldn't run

Each cloud host's deployer, EC2's and the tunnel end's, takes releases from the release bucket by pull ([spec 001 contracts/releases-deployer.md §3](../../specs/001-cloud-elevation/contracts/releases-deployer.md#3-the-deployers)). The host's user data carries only its first step, `deploy/scripts/deploy_first_step.py`, which runs the deployer of the release the host last started, from that release's own tree. This page covers the deployer's three alerts ([contracts/aws-alerts.md §2](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts)):

- `deploy_refused`: the host refused a release, by its reason: `commit`, `tree`, `compose`, `digest`, `class`, `services`, `release`, `missing`, `pin`, `preflight`, `preflight_after`, `preflight_after_restore_failed`, `deployer` (the release's deployer didn't run), `held` (your hold stands), `bucket` (the release bucket refuses the host's role, or the env file names none), or `unreachable` (EC2's boot couldn't reach the bucket, and started its last release, or couldn't: [ec2.md](ec2.md));
- `deploy_rolled_back`: a new release failed its start, and the host is back on the release before it;
- `deploy_rollback_failed`: a new release failed its start, and so did the return.

## Symptoms

- **Telegram and the mailbox:** `[hareet.ai aws] deploy_refused: <host> refused release <id>`, with `- reason: <reason>`; or `deploy_rolled_back: <host> returned from <new> to <old>`; or `deploy_rollback_failed: <host> couldn't start <new> or return to <old>`. Each alert is sent once per incident: one SNS refused waits in the deployer's `pending.json` and goes on a later run.
- The dashboard's release panel (Hosts row) shows the host still on the older release, or none.
- In a Systems Manager session on the host: `journalctl -u h4-deployer.service -u h4-stack.service` names the step that failed; `/var/lib/h4reet/deploy/deployments.jsonl` holds one line for each attempt, with its outcome.

## Impact

- **`deploy_refused` and `deploy_rolled_back`:** the host keeps serving its running release. Nothing a visitor sees changes, but the new release isn't live there.
- **`deploy_rollback_failed`, or a refusal with nothing running:** the host's stack is down. On EC2, visitors get `no_host_serving` unless the laptop serves; on the tunnel end, the edge's own degraded body answers every dynamic request.
- **`bucket`:** the host takes no release until the bucket answers it again; it keeps what it runs.

## Act

From your terminal, with your SSO session: `make cloud-session HOST=<ec2|tunnel-end> PROFILE=…` opens a shell on the host; the commands below are that shell's.

1. **Read the cause.** `journalctl -u h4-deployer.service --since -1h` and the last lines of `/var/lib/h4reet/deploy/deployments.jsonl`. The alert's reason names the step.
2. **By reason:**
   - **`commit`, `tree`, `compose`, `digest`, `class`, `services`, `release`, `missing`, `pin`:** the release itself is wrong: release.json doesn't match its tree, its plugin, or the lock. Make a new release from `main`; the host takes it on its next run and forgets the refusal.
   - **`preflight` or `preflight_after`:** the host's env file or its host step's files fail the class's preflight. The journal names the check (T1 to T5 on the tunnel end, E1 to E6 on EC2). Fix the parameter in Parameter Store, then `sudo systemctl restart h4-write-env.service`, which writes `/run/h4reet/<host>.env` again from it, and retry (step 3).
   - **`deployer`:** the release's own deployer didn't start (a traceback). The previous release's deployer ran instead, so the host still takes the next release: make one with the fix.
   - **`held`:** your hold stands (`/var/lib/h4reet/deploy/hold`). Remove it when you're done: `sudo rm /var/lib/h4reet/deploy/hold`.
   - **`bucket`:** the host's role can't read the bucket, or `RELEASE_BUCKET` is empty. Check `/h4reet/hosts/RELEASE_BUCKET` and the role's policy in the next plan; then `sudo systemctl restart h4-write-env.service` and retry (step 3), or reboot the host.
   - **`deploy_rolled_back` or `deploy_rollback_failed`:** a service failed its health check. `docker compose -p h4reet-prod ps -a` and `docker logs <container>` name it. The deployer tries the release again after a backoff that doubles from two minutes to an hour, and at every boot.
3. **The manual retry.** The deployer keeps each attempt in `/var/lib/h4reet/deploy/attempts.json`: a refusal waits for a newer release, a failed start for its backoff. To try again now:

   ```bash
   sudo rm /var/lib/h4reet/deploy/attempts.json
   sudo systemctl start h4-deployer.service
   ```

   A reboot retries every attempt too.

## Verify

- The dashboard's release panel shows the host on the release you expect, with `deployer` as who started it.
- The last line of `/var/lib/h4reet/deploy/deployments.jsonl` reads `"outcome": "deployed"` for that release.
- `docker compose -p h4reet-prod ps` lists the host class's services, each healthy.

## Undo

Nothing to undo: removing `attempts.json` only lets the deployer try again. To hold a host on purpose instead, make the hold, as `docs/runbooks/tunnel-end.md`'s "Stopping the stack on purpose" gives it.

## Record

In the next merge-request note, or an incident note in `docs/incidents/` if a host stopped serving: the time, the host, the release, the reason, and what you changed. Never a parameter's value, the account's ID, or an address.
