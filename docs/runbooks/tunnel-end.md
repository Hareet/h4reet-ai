# Runbook: the tunnel end

The tunnel end is the small spot instance in the account that runs around the clock and ends the laptop's tunnel: its sshd, `tunnel-end`, takes the laptop's one connection, and, from later groups, the relay, the snapshot sink, and the shared state run beside it ([spec 001 contracts/tunnel.md](../../specs/001-cloud-elevation/contracts/tunnel.md); FR-052 to FR-055, FR-076). It is `h4-prod-tunnel-end`, in `infra/prod/` (`tunnel-end.tf`, and the protected `ec2-market.tf`, `iam.tf`, and `handover.tf`), and its host is `deploy/hosts/tunnel-end/`. This page covers the alerts `tunnel_end_interruption`, `tunnel_end_back`, and `ec2_start_refused` with the reason `tunnel_end_down` ([contracts/aws-alerts.md §2](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts)), and the cases below.

## Symptoms

- **`[hareet.ai aws] tunnel_end_interruption: AWS will stop the tunnel end in two minutes`**, from the rule `h4-tunnel-end-spot-warning`, with the action and the time as its facts.
- **`[hareet.ai aws] tunnel_end_back: …`**, from `h4-tunnel-end-running` once AWS starts it again, with its time as its fact. A replace's first boot doesn't send it: the rule names the new instance only once the plan has made it, after it is running. From W2 the same rule also invokes the start function (group 9).
- **`[hareet.ai aws] ec2_start_refused (tunnel_end_down): …`**: the start function wouldn't start EC2, since nothing could reach it while the tunnel end is down (group 9).
- **The dashboard's Hosts row:** "Tunnel up" reads `down` for `tunnel-end`, or for `laptop`; "Tunnel reconnects" climbs; "Telemetry delayed at the tunnel end" fills.
- **The laptop's tunnel logs** `tunnel: the connection ended after … s; trying again in … s`, again and again, with ssh's own line before it: `Connection timed out` (the tunnel end is down), `Permission denied (publickey)` (its key was revoked), or `Host key verification failed` (the pinned host key isn't the tunnel end's).

- **From W2, on its return:** `h4-tunnel-end-running` also invokes `h4-ec2-start` once, `from: tunnel_end_back`. It starts EC2 if the laptop isn't serving and the hours, the switch, and the server action allow; it may start EC2 while the laptop's tunnel reconnects, and the laptop's loop then stops EC2 within the window ([handover.md](handover.md)).

## Impact

- **While the tunnel end is down,** nothing reaches the laptop from the cloud: once the relay exists (group 8), every dynamic request answers `no_host_serving`, the room shows its resting message, and the site itself still loads from the edge. EC2 can't serve either, since the relay is on the tunnel end. The Author's laptop prod keeps answering on its own `127.0.0.1`.
- **Its telemetry waits:** the tunnel end's collector queues to a file, 32 MiB a host; past that the queue refuses, and "Telemetry lost at the tunnel end" counts it.
- **A revoked key** closes the tunnel the same way, on purpose (FR-055).

## Act

In your own terminal, with your SSO session (`PROFILE=h4reet-admin`, or yours). The tunnel end takes no SSH but the tunnel's own: every way in is Systems Manager (FR-050). To find it:

```bash
id=$(aws ec2 describe-instances --profile h4reet-admin --region us-east-1 \
  --filters Name=tag:Name,Values=h4-prod-tunnel-end \
  --query 'Reservations[].Instances[].InstanceId' --output text)
```

### A restart

The stack restarts in place: its services, with the release it last recorded, after its env file is written again.

```bash
aws ssm send-command --profile h4reet-admin --region us-east-1 \
  --targets Key=tag:Name,Values=h4-prod-tunnel-end \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":["systemctl restart h4-write-env.service h4-stack.service"]}'
```

A reboot does the same, and more slowly: `aws ec2 reboot-instances --instance-ids "$id"`. The laptop's tunnel reconnects within its backoff, 1 to 30 seconds.

### Stopping the stack on purpose

Hold the deployer first, and stop its timer: otherwise its next run, within a minute, starts the release again, and its
unit's `Requires=docker.service` starts Docker again even after `systemctl stop docker`. In a session
(`make cloud-session HOST=tunnel-end`), as root:

```bash
touch /var/lib/h4reet/deploy/hold
systemctl stop h4-deployer.timer
systemctl stop h4-stack.service
```

`h4-stack.service`'s stop stops the class's containers (`docker compose -p h4reet-prod stop`), and they stay stopped. While `hold` is there the deployer starts, restarts, and deploys nothing, at boot too, says so on its stderr, and alerts `deploy_refused` (reason `held`) once per hold, so a forgotten one doesn't stand unseen; the
key's revocation still restarts the sshd. To resume: `rm /var/lib/h4reet/deploy/hold`, then
`systemctl start h4-deployer.timer`, and its next run brings the release up. Group 7 gives the laptop and EC2 their own form
of the same (contracts/releases-deployer.md §4).

### A crash, a failed deploy, or a revoked key

Open a session and read the host's own record:

```bash
aws ssm start-session --profile h4reet-admin --region us-east-1 --target "$id"
sudo journalctl -u h4-write-env -u h4-stack -u h4-deployer -u h4-egress-proxy --since -1h
sudo tail -n 5 /var/lib/h4reet/deploy/deployments.jsonl
sudo docker logs --tail 50 h4reet-prod-tunnel-end-1
```

- **`write_env: refused, nothing written: missing in Parameter Store: …`:** a parameter is missing. `make secrets-check PROFILE=h4reet-admin` names it; your tunnel-keys target writes the tunnel's. Then the restart above.
- **A failed deploy:** the deployer returned to the release before and alerted `deploy_rolled_back`, or refused the release and alerted `deploy_refused` with its reason (the runbook `deploy.md`, from group 7). The tunnel end runs what `current.json` names meanwhile.
- **sshd stopped** (`tunnel-end: sshd stopped`): compose restarts it; if it stops again, its last lines say why: a host key it can't read, most likely, which the restart above writes again.
- **A revoked key** shows on the laptop as `Permission denied (publickey)`. If you didn't mean it, put the key back: `make tunnel-revoke RESTORE=1 PROFILE=h4reet-admin`.

### Revoking the laptop's key

One action (FR-055): `make tunnel-revoke PROFILE=h4reet-admin`. It empties `/h4reet/tunnel-end/AUTHORIZED_KEY` and, in one Systems Manager command, starts `h4-tunnel-restart.service`, which writes the key files again and restarts the sshd alone. The tunnel's connection drops at once, and every attempt after it is refused.

- **Put the same key back:** `make tunnel-revoke RESTORE=1 PROFILE=h4reet-admin`.
- **A key that may have leaked:** make new ones instead, `make tunnel-keys ROTATE=1 PROFILE=h4reet-admin`, which writes the new authorized key and host key, then `make tunnel-revoke RESTORE=1 PROFILE=h4reet-admin`, so the tunnel end reads them now. The laptop's tunnel reads its new key at its next attempt.

### The tunnel end lost

An instance that is gone, or a root volume that won't boot: your prod plan shows the tunnel end to be made again, and your apply makes it. Its Elastic IP is a resource of its own, so the laptop dials the same address; its host key comes from Parameter Store at boot, so the laptop's pinned key still matches. Its first boot installs its host from the user data, then its deployer takes the newest release. From group 6, the shared state's data volume has its own page for a restore.

### A spot interruption

`tunnel_end_interruption` gives two minutes. Nothing to do: the request is persistent and stops on interruption, so the instance, its volumes, its interfaces, and its Elastic IP stay, and AWS starts it again when capacity returns, with `tunnel_end_back`. Its boot starts the release it last recorded before its deployer asks the bucket. If it stays stopped for hours, the next case.

### An OS update, or a changed host file

Nothing on the tunnel end updates itself: after its first boot nftables keeps `dnf` from Amazon Linux's repository, and the instance ignores its image's and its user data's drift. Both reach it as a replace your prod plan shows. A changed host file the user data carries (`local.host_files` in `infra/prod/tunnel-end.tf`: the boot's files under `deploy/hosts/tunnel-end/`, and `write_env.py`, `egress_proxy.py`, and `deploy_first_step.py`) changes `terraform_data.tunnel_end_host`'s SHA-256, so the plan replaces the tunnel end with it. The release tree's parts aren't among them: the deployer itself runs from the release's tree, by the first step, and `shared_state.py` and `deploy/hosts/tunnel-end/release/` come by the deployer's host step, so each changes with a release, with no replace. For an OS update, a reviewed change adds one to `local.tunnel_end_generation` in `infra/prod/tunnel-end.tf`; the plan replaces the tunnel end on the newest Amazon Linux 2023 image. Either way, read the block for the instance replaced and nothing else of the tunnel end's: its interfaces, its Elastic IP, and the shared state's data volume stay and attach to the new instance. While it boots the site rests, as at a spot interruption, and its deployer then takes the newest release.

### A move to another zone

A spot instance stops and starts in its zone, so a zone without capacity keeps it stopped. The move is a reviewed change: `local.zone` in `infra/prod/main.tf`, to a zone with capacity (`aws ec2 describe-spot-price-history` shows the zones that hold its type). Your plan replaces both subnets, both interfaces, and the instance, and moves the Elastic IP to the new public interface, so the address stays. From group 6, the shared state's volume can't follow: its page makes a second volume in the new zone from the last backup.

## Verify

- The dashboard's "Tunnel up" reads `up` for both ends, and "Tunnel reconnects" stops climbing.
- "Telemetry delayed at the tunnel end" drains to zero once the host it waited for is back.
- `make cloud-session HOST=tunnel-end PROFILE=h4reet-admin` opens a session, and `/var/lib/h4reet/deploy/deployments.jsonl` ends with `deployed` for the release you expect.

## Undo

- A revocation: `make tunnel-revoke RESTORE=1 PROFILE=h4reet-admin`.
- A move: the change that puts `local.zone` back, planned and applied the same way.
- A restart or a reboot needs none.

## Record

In an incident note in `docs/incidents/` for an interruption that lasted over an hour, a loss, or a revocation you didn't mean; in the next merge-request note otherwise: the time, the alerts' lines, what the host's logs said, and what you did. Never the tunnel end's address, the account's ID, or a key.
