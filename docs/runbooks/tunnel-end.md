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
unit's `Requires=docker.service` starts Docker again even after `systemctl stop docker`. In a shell on the tunnel end
(the EC2 console's Session Manager on `h4-prod-tunnel-end`, as [ec2.md](ec2.md)'s Act says; `make cloud-session` is a
port-forward, not a shell), as root (`sudo -i`):

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

- **`write_env: refused, nothing written: missing in Parameter Store: …`:** a parameter is missing. `make secrets-check PROFILE=h4reet-admin` names it; your tunnel-keys target writes the tunnel's, and `make secrets-fill PROFILE=h4reet-admin` the relay's two role passwords and the rest, each once, never overwriting (spec 001 fixes/f8.md). Then the restart above.
- **A failed deploy:** the deployer returned to the release before and alerted `deploy_rolled_back`, or refused the release and alerted `deploy_refused` with its reason (the runbook `deploy.md`, from group 7). The tunnel end runs what `current.json` names meanwhile.
- **sshd stopped** (`tunnel-end: sshd stopped`): compose restarts it; if it stops again, its last lines say why: a host key it can't read, most likely, which the restart above writes again.
- **A revoked key** shows on the laptop as `Permission denied (publickey)`. If you didn't mean it, put the key back: `make tunnel-revoke RESTORE=1 PROFILE=h4reet-admin`.

### Revoking the laptop's key

One action (FR-055): `make tunnel-revoke PROFILE=h4reet-admin`. It empties `/h4reet/tunnel-end/AUTHORIZED_KEY` and, in one Systems Manager command, starts `h4-tunnel-restart.service`, which writes the key files again and restarts the sshd alone. The tunnel's connection drops at once, and every attempt after it is refused.

- **Put the same key back:** `make tunnel-revoke RESTORE=1 PROFILE=h4reet-admin`.
- **A key that may have leaked:** make new ones instead, `make tunnel-keys ROTATE=1 PROFILE=h4reet-admin`, which writes the new authorized key and host key, then `make tunnel-revoke RESTORE=1 PROFILE=h4reet-admin`, so the tunnel end reads them now. The laptop's tunnel reads its new key at its next attempt.

### The tunnel end lost

An instance that is gone, or a root volume that won't boot: your prod plan shows the tunnel end to be made again, and your apply makes it. Its Elastic IP is a resource of its own, so the laptop dials the same address; its host key comes from Parameter Store at boot, so the laptop's pinned key still matches. Its first boot installs its host from the user data, then its deployer takes the newest release. From group 6, the shared state's data volume has its own page for a restore.

### The public view gone stale

`/status/` says its values are older than 5 minutes, or last-known, while a host serves; the Hosts row's "The public view's age" reads red, and "The public view's writes and posts" shows `failed`, `refused`, or a host's `not_serving` or `unread` (spec 001 FR-057, FR-058; contracts/public-view.md §5).

1. **The write, on the tunnel end,** in your Systems Manager session: `sudo journalctl -u h4-snapshot-sink.service -n 20` prints one word a run, `written`, `failed`, or `refused`. `failed` with nothing else: the put didn't reach the site's bucket (before W2's apply the bucket doesn't exist, so every write fails, which is right). `refused`: the document failed its own schema, which is a bug to report, never a value to see.
2. **The sink:** `sudo docker logs --tail 20 h4reet-prod-snapshot-sink-1` prints each request's method, path, and status, never a body. 401: a publisher's token isn't the sink's (your tunnel-keys target writes both). 409: the relay doesn't serve that host. 400: a part failed the schema.
3. **A publisher,** on the serving host: its container's log, one word a run. `unread`: it can't reach the sink (the laptop's tunnel, or EC2's route to `10.42.1.10:2301`); `not_serving`: the relay serves another host, which is right.
4. **Restart the write:** `sudo systemctl restart h4-snapshot-sink.service`. The document it keeps in `/var/lib/h4reet/snapshot/` holds the last host part, so a restart never empties the view.

### The interfaces and the way out (T058)

B-6, option C (contracts/tunnel.md §1): the private interface, `10.42.1.10`, is device 0, and the public one, `10.42.0.10` with the Elastic IP, device 1, attached once the instance runs. The first boot waits up to 5 minutes for the public interface, and as long again for its default route, before `dnf` runs. Once the first boot is done, open a shell on the tunnel end, with `id` as at the top of "Act":

```bash
p=h4reet-admin
r=us-east-1
aws ssm start-session \
  --profile "$p" --region "$r" \
  --target "$id"
```

Then, in it:

```bash
ip -br -4 addr
ip -4 route
ip -4 route get 192.0.2.1
cloud-init status --long
```

- `ens5` holds `10.42.1.10` and `ens6` holds `10.42.0.10`. If the names differ, nftables' `iifname` lines (`deploy/hosts/tunnel-end/nftables.nft`) and the drop-ins' directories (`70-ens6.network.d`, `70-ens5.network.d`) are wrong: record the names; the fix is a reviewed host-file change, which replaces the tunnel end.
- Two default routes: `ens6`'s at metric 100, from `zz-h4-public-first.conf`, and `ens5`'s at amazon-ec2-net-utils' own, 512 for device 0: this confirms the 512, or records the figure it is. Another figure for `ens5` changes nothing while `ens6`'s is lower.
- A host route, `10.42.0.20 via 10.42.1.1 dev ens5`, from `zz-h4-ec2-route.conf`: EC2's replies leave by the interface they came in on (the review of 59dfdc4a, I1).
- The private interface's replies (fix F2, [specs/001-cloud-elevation/fixes/f2.md](../../specs/001-cloud-elevation/fixes/f2.md)), from the release's tree, once the deployer has run its host step: `ip -4 rule show` has `104: from all fwmark 0x105 lookup 105` and `105: from 10.42.1.10 lookup 105`; `ip -4 route show table 105` reads `default via 10.42.1.1 dev ens5`; `nft list table inet h4reet_reply` holds `iifname "ens5" ct state new ct mark set 0x00000105` then `iifname != "ens5" meta mark set ct mark`; and `systemctl is-enabled h4-reply-route.service` reads `enabled`. Without them, CloudFront's requests reach the relay but its replies leave by `ens6`, which drops them: every dynamic request times out after 30 s while the site's own pages load from the edge. The fix: `sudo systemctl restart h4-reply-route.service`, then `sudo networkctl reload` and `sudo networkctl reconfigure ens5`; if `/etc/systemd/network/70-ens5.network.d/zz-h4-reply-route.conf` or `/etc/h4reet/h4-reply-route.nft` is missing, the release's host step didn't run: `sudo journalctl -u h4-deployer -u h4-stack --since -1h` says why.
- `route get` names `dev ens6`: the host's way out is the public interface.
- `cloud-init status --long` reads `status: done`, with no error.
- From EC2, inside its hours, in a shell on it (the same `start-session`, with `id` found by `Name=tag:Name,Values=h4-prod-ec2`): the shared state answers `accepting connections`, and the sink's port connects. Where the host has no `pg_isready`, the second line's `python3` stands in for 5432 too, with `5432` in place of `2301`. A timeout on either is the reply leaving by the wrong interface: check the host route above.

  ```bash
  pg_isready -h 10.42.1.10
  python3 -c "import socket as s
  s.create_connection(
    ('10.42.1.10', 2301), 5)"
  ```
- The relay's 8080 on `10.42.1.10`: the private group, `h4-tunnel-end-private`, admits it from CloudFront's VPC origins' own group, `CloudFront-VPCOrigins-Service-SG`, which CloudFront makes in the VPC with the origin. `infra/prod/tunnel-end.tf` reads that group by name (fix F1, [specs/001-cloud-elevation/fixes/f1.md](../../specs/001-cloud-elevation/fixes/f1.md)). The rule beside it, from CloudFront's origin-facing prefix list, lets nothing in there: the VPC origin doesn't connect from those addresses. Without the group's rule, every `/api/*` request answers 503 with the cause `no_host_serving`, the edge's own degraded answer, and the site still loads (contracts/edge.md §4). The group's rules are inline, so the next apply removes any rule added by hand. A rule added in the console to restore service is recorded, and lands in `tunnel-end.tf` before the next apply. The read finds the group at plan time because it exists. On a rebuild from nothing it doesn't: CloudFront makes the group only with the VPC origin, which needs the tunnel end and so the private group, so the apply stops at the read. Rebuild in two applies: first from a copy without the read and its 8080 rule, then from the tree as committed (spec 001's plan.md §16, "B-6", item 5).
- If the first boot timed out (`/var/log/cloud-init-output.log` shows `dnf` failing), the public interface wasn't attached or had no route: check the attachment in the console, then replace the tunnel end.

### A spot interruption

`tunnel_end_interruption` gives two minutes. Nothing to do: the request is persistent and stops on interruption, so the instance, its volumes, its interfaces, and its Elastic IP stay, and AWS starts it again when capacity returns, with `tunnel_end_back`. Its boot starts the release it last recorded before its deployer asks the bucket. If capacity for its type doesn't return, the next case.

### A capacity stop that doesn't end (spec 032; ADR 0057)

The tunnel end has a list of interchangeable Graviton types, `local.tunnel_end_types` in `infra/prod/tunnel-end.tf` (`t4g.small`, `c7g.medium`, `c6g.medium`, `t4g.medium`), each at a price ceiling of `t4g.small`'s on-demand price, and one launch template per type. Every 5 minutes the schedule `h4-tunnel-end-check` invokes the start function, `from: tunnel_end_check`. Once the tunnel end has been stopped for capacity 10 minutes (its spot request's code `instance-stopped-*` but `instance-stopped-by-user`), the function replaces it from its list, skipping the short type: it cancels the request, terminates the instance, launches the next type with both interfaces by ID (so `10.42.1.10`, `10.42.0.10`, and the Elastic IP stay), attaches `h4-shared-state` at `/dev/sdf`, points the VPC origin `h4-relay` at the new instance, and then starts EC2 as on any return. A tunnel end you stopped yourself is left alone.

- **`tunnel_end_back` with `- trigger: tunnel_end_check`, `- type:`, `- replaced:`:** the tunnel end runs as another type. Its first boot takes up to a few minutes, then the laptop's tunnel reconnects with the same host key (from Parameter Store). Check `/api/status`. Plan and apply prod when convenient (`- repoint:`): its two rules name the old instance until then.
- **`- origin:`** reads `re-pointed` or `unchanged` when all is well. Any other value is CloudFront's refusal of the re-point (it may refuse a change while the distribution uses the origin): run prod's plan, which shows `aws_cloudfront_vpc_origin.relay`'s ARN to update, and apply it; record what CloudFront did, for spec 032's open question.
- **`ec2_start_refused (tunnel_end_down)` with `- tunnel_end: not replaced`:** no listed type had capacity (`- code: no_capacity`, `- tried:`), or a step failed (`- code:`, `- step:`). No host serves; the next check tries again in 5 minutes.
- **A hand replace**, for an OS update or a changed host file, or to rehearse: `make ec2-start REPLACE=tunnel_end PROFILE=$pf` (`SKIP=` to skip types). It stops every host for a few minutes: pick a quiet hour. Add `DRY_RUN=1` to prove the role launches each type, with no change.
- **`tunnel_end_back` with `- repaired:`** (`volume`, `origin`): the check found a running tunnel end a replace had left without its volume or its origin, and fixed it. A repair that fails isn't alerted every 5 minutes: the dashboard's outcomes show `tunnel_end_repair_failed`; act as for the step it names.
- **The check is off until you turn it on**: `h4-tunnel-end-check` is made DISABLED (`local.tunnel_end_check_state` in `infra/account/handover.tf`) until your dry run passes (the merge-request note, step 6).

### An OS update, or a changed host file

From spec 032 the plan replaces the tunnel end's launch templates, not the instance, and the instance moves onto them by your hand replace (the case above). What follows was written for the instance Terraform held, and stands for what reaches the templates.

Nothing on the tunnel end updates itself: after its first boot nftables keeps `dnf` from Amazon Linux's repository, and the instance ignores its image's and its user data's drift. Both reach it as a replace your prod plan shows. A changed host file the user data carries (`local.host_files` in `infra/prod/tunnel-end.tf`: the boot's files under `deploy/hosts/tunnel-end/`, and `write_env.py`, `egress_proxy.py`, and `deploy_first_step.py`) changes `terraform_data.tunnel_end_host`'s SHA-256, so the plan replaces the tunnel end with it. The release tree's parts aren't among them: the deployer itself runs from the release's tree, by the first step, and `shared_state.py` and `deploy/hosts/tunnel-end/release/` come by the deployer's host step (the private interface's replies among them: `ens5`'s drop-in `zz-h4-reply-route.conf` and the table `inet h4reet_reply`, fix F2), so each changes with a release, with no replace. For an OS update, a reviewed change adds one to `local.tunnel_end_generation` in `infra/prod/tunnel-end.tf`; the plan replaces the tunnel end on the newest Amazon Linux 2023 image. Either way, read the block for the instance replaced and nothing else of the tunnel end's: its interfaces, its Elastic IP, and the shared state's data volume stay and attach to the new instance. While it boots the site rests, as at a spot interruption, and its deployer then takes the newest release. **Watch the VPC origin** (the review of 59dfdc4a, nit 5): a replace changes `aws_cloudfront_vpc_origin.relay`'s target ARN, and once W2's distribution uses the origin, that may plan as the origin's replace, about 15 minutes, or be refused while in use. If the plan shows it, record it and ask before the apply.

### A move to another zone

A spot instance stops and starts in its zone, so a zone without capacity keeps it stopped. The move is a reviewed change: `local.zone` in `infra/prod/main.tf`, to a zone with capacity (`aws ec2 describe-spot-price-history` shows the zones that hold its type). Your plan replaces both subnets, both interfaces, and the instance, and moves the Elastic IP to the new public interface, so the address stays. From group 6, the shared state's volume can't follow: its page makes a second volume in the new zone from the last backup.

## Verify

- The dashboard's "Tunnel up" reads `up` for both ends, and "Tunnel reconnects" stops climbing.
- "Telemetry delayed at the tunnel end" drains to zero once the host it waited for is back.
- `make cloud-session HOST=tunnel-end PROFILE=h4reet-admin` forwards the relay's internal listener to your `127.0.0.1:18505` (it needs AWS's Session Manager plugin), where `curl -s http://127.0.0.1:18505/api/status` answers; and in a shell on the tunnel end (the console's Session Manager), `/var/lib/h4reet/deploy/deployments.jsonl` ends with `deployed` for the release you expect.

## Undo

- A revocation: `make tunnel-revoke RESTORE=1 PROFILE=h4reet-admin`.
- A move: the change that puts `local.zone` back, planned and applied the same way.
- A restart or a reboot needs none.

## Record

In an incident note in `docs/incidents/` for an interruption that lasted over an hour, a loss, or a revocation you didn't mean; in the next merge-request note otherwise: the time, the alerts' lines, what the host's logs said, and what you did. Never the tunnel end's address, the account's ID, or a key.
