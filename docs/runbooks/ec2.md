# Runbook: EC2, prod's default host

EC2 runs prod's whole stack but the model server, from the release its deployer takes from the release bucket ([spec 001 plan.md §5.1](../../specs/001-cloud-elevation/plan.md#51-ec2-fr-043-fr-044-fr-050-fr-069-researchmd-r-04-r-30)). It is a persistent spot instance that stops on an interruption, with one interface at `10.42.0.20`, an address AWS assigns at each start for its egress, and a data volume of its own for Docker's data root. Its gateway answers from the Anthropic API first and Bedrock second, as `h4-prod-gateway`, and reaches the shared state on the tunnel end over TLS. From W1's apply it is stopped: you start it by hand, inside the hours, for SC-017's and the red-team's runs, and stop it after them (spec.md Assumptions, "From W1 to W2"). This page covers EC2's boot and stack; its deployer's alerts are [deploy.md](deploy.md)'s, its server budget's [server-budget.md](server-budget.md)'s, and its model action's [aws-budget-action.md](aws-budget-action.md)'s.

## Symptoms

- **Telegram and the mailbox:** `deploy_refused` from EC2's boot, with reason `unreachable` (the bucket out of the network's reach) or `bucket` (it refuses): `[hareet.ai aws] deploy_refused: ec2 started its last release, <id>, without the release bucket`, with `- started: yes`; or `ec2 couldn't start its last release, <id>, without the release bucket`, with `- started: no`, and then EC2 serves nothing. Or any of the deployer's kinds with `ec2` as the host (deploy.md).
- **After you start it:** the stack isn't up a few minutes later (`docker compose -p h4reet-prod ps` in a session), or the dashboard's release panel shows no release on `ec2`.
- **In a session**, `journalctl -u h4-write-env.service -u h4-stack.service -u h4-deployer.service -u h4-sni-proxy.service -u h4-gateway-credentials.service --since -1h` names the step:
  - `write_env: refused, nothing written: this instance's Name tag isn't h4-prod-ec2`, or `missing in Parameter Store: <name>`;
  - preflight's `FAIL E1` to `FAIL E6`: the env file, its keys, its class, its values, the instance's tag, or the gateway's Bedrock profile;
  - `ec2-host: the assume of h4-prod-gateway failed` and `Bedrock answers degraded until the credential timer's next run`, with preflight's `WARN E6`: the stack starts, and Bedrock, EC2's second route, answers degraded until the timer's next run;
  - `sni-proxy: refused <name>:443 (not allowed)`: a provider the gateway calls that the gateway's allowlist doesn't hold.
- Docker doesn't start at all (`journalctl -u docker.service` shows its `mountpoint` step failing, or `h4-nftables.service` failed): the data volume isn't mounted at `/srv/h4reet/data`, or the packet filter didn't load. Docker requires both, so the stores never land on the root volume and no container's traffic goes out past the proxy.
- **At the first start after W1's apply:** the apply stops EC2 as soon as it exists, probably during its first boot's cloud-init. `cloud-init status --long` in a session must read `status: done`; anything else means the first boot didn't finish (step 2, "The first boot").

## Impact

- **While the laptop serves, or in W1:** none. EC2 is the fallback host, and nothing is public until W2.
- **From W2, with the laptop off:** visitors get `no_host_serving` and the room's resting message while EC2's stack is down; the static site still loads (spec FR-066).
- **The gateway's proxy refusing a name:** the provider it names doesn't answer from EC2; the gateway marks it unhealthy and answers from the next route, or degraded.

## Act

From your terminal, with your SSO session. To start EC2 in W1: the EC2 console, the instance tagged `h4-prod-ec2`, Instance state, Start, inside the hours (07:00 to 19:00 Mountain time). Then `make cloud-session HOST=ec2 PROFILE=…` opens a shell on it; the commands below are that shell's.

1. **Read the step that failed:** the journal line above.
2. **By step:**
   - **The env file** (`write_env`): write the missing name to Parameter Store under `/h4reet/ec2/` (SecureString), or the hosts' String it names under `/h4reet/hosts/`; `make secrets-check PROFILE=…` lists which names exist. Then `sudo systemctl restart h4-write-env.service` and `sudo systemctl start h4-deployer.service`.
   - **E3 or E4:** the template's values are the release's; a changed parameter that fails its shape (the CA certificate, the relay token) is yours to correct in Parameter Store.
   - **E5 (the tag):** the instance isn't `h4-prod-ec2` by its metadata: never write EC2's secrets to another instance. If it is EC2, its tags must be in its metadata (`instance_metadata_tags`, `infra/prod/ec2-market.tf`).
   - **E6 or the assume:** a `WARN E6` is Bedrock degraded, and the stack runs; the timer tries again every 15 minutes, and `sudo systemctl start h4-gateway-credentials.service` tries now. If it keeps failing, `h4-prod-gateway`'s trust or the instance role's `sts:AssumeRole` changed outside Terraform, or STS is out of reach; the next prod plan shows the drift. A `FAIL E6` is the profile itself wrong or open beyond 0400: the release's host step writes it, so a new release.
   - **The data volume:** `lsblk` shows `/dev/sdf`; `sudo mount -o nodev,nosuid /dev/sdf /srv/h4reet/data` if it holds a filesystem, then `sudo systemctl start docker.service h4-stack.service`. A volume with no filesystem is formatted by the next boot alone. The gateway's journal is on it too, `/srv/h4reet/data/state/gateway`, which the host step makes.
   - **The packet filter:** `sudo systemctl status h4-nftables.service` names the line `nft` refused; the filter is the user data's, so a reviewed replace with the fix.
   - **The first boot:** `sudo cat /var/log/cloud-init-output.log` names the step the stop interrupted. A module that hadn't finished runs again at this boot; if `cloud-init status --long` still reads `error`, a reviewed replace (`local.ec2_generation`) gives EC2 a first boot again.
   - **The gateway's proxy:** a provider's name outside `deploy/hosts/ec2/release/gateway-allowlist.txt` needs its disclosure row and a release, never a hand edit on the host.
   - **The bucket out of reach at boot:** EC2 runs its last release; the deployer takes the newest on its next run, once the bucket answers.
   - **SC-017's run died mid-phase** (your session dropped, or it was killed): the gateway may still run on the refused Anthropic key, under the run's hold, `sc017 <epoch>` in `/var/lib/h4reet/deploy/hold`. The deployer clears that hold once it is an hour old, removes `/run/h4reet/sc017.env`, and recreates the gateway with the real file. To do it now: `sudo rm /var/lib/h4reet/deploy/hold /run/h4reet/sc017.env`, then `sudo systemctl start h4-deployer.service` and, if the gateway still answers `fallback_unavailable` from the Anthropic API, recreate it from the running release's tree as the harness's restore does (`evals/sc017_ec2_routes.py`, `Ec2Key.recreate`). A hold that reads anything else is yours, and the deployer never clears it.
3. **Stopping it:** the EC2 console's Stop, or group 9's stop target once it exists. A user stop keeps the volumes and the request; AWS doesn't start it again by itself.
4. **The Anthropic account's spend limit** (FR-073): set it at or under $20 a month where the account offers one, and record that it is set, never the account's details.
5. **After a replace** (W2's `local.ec2_generation = 2`, tasks.md T097), from your terminal:
   1. find the old instance's spot request, by the old instance's ID from the apply record, and cancel it if it is still open:

      ```bash
      pf=h4reet-admin
      a=(--profile "$pf" --region us-east-1)
      old=OLD_INSTANCE_ID
      f="Name=instance-id,Values=$old"
      aws ec2 describe-spot-instance-requests \
        "${a[@]}" --filters "$f"
      ```

      and, if its `State` is `open` or `active`, `aws ec2 cancel-spot-instance-requests` with its ID;
   2. check that exactly one instance carries `h4-prod-ec2`, the one `/h4reet/prod/ec2-instance-id` names, and that no instance the old request launched is left, tagged or not;
   3. record both in the apply record.

## Verify

- `docker compose -p h4reet-prod ps` lists the class's fourteen services, each healthy, `ec2-relay-block` among them.
- In the session: `curl -s http://127.0.0.1:18000/health` answers, and a hello through the internal path is answered by `anthropic`, with provider, model, tokens, and cost on the span and the ledger row, `host = ec2`, attribution `metered` (quickstart.md §7, step 3).
- The dashboard's release panel shows `ec2` on the release you expect, started by `deployer`.

## Undo

Nothing to undo: each step only lets EC2 start. Stop EC2 when the run you started it for is done (spec.md Assumptions, "From W1 to W2").

## Record

In the next merge-request note, or an incident note in `docs/incidents/` if visitors met `no_host_serving` from it: the time, the step that failed, the cause, and what you changed. For a replace, the old spot request's state and the one tagged instance. Never a parameter's value, the account's ID, an instance's ID, or an address beyond the VPC's fixed ones.
