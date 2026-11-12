# Runbook: the shared state

The shared state is prod's one meter and kill switch, for both hosts: Postgres in a container on the tunnel end, `shared-state`, with its data on its own encrypted volume and an hourly backup to its own bucket ([spec 001 contracts/shared-state.md](../../specs/001-cloud-elevation/contracts/shared-state.md); FR-017 to FR-020). It is the service in `deploy/compose.yaml`'s `tunnel-end` class, its configuration in `deploy/shared-state/`, its host parts in `deploy/hosts/tunnel-end/shared_state.py`, and its volume and bucket in `infra/prod/shared-state.tf`. This page covers the alert `shared_state_backup_failed` ([contracts/aws-alerts.md §2](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts)), the store unreachable, a restore from the last backup, and the tunnel end's move to another zone.

## Symptoms

- **`[hareet.ai aws] shared_state_backup_failed: the shared state's hourly dump failed, and the last good one is kept`**, with `- step: dump` or `- step: put` and `- last_good:` as its facts: once a failing streak, from the tunnel end's backup timer.
- **The dashboard's Hosts row:** "Last good backup's age" turns red at 2 hours, or reads "no backup"; "Shared state errors" climbs for a host; "Shared state latency, p95" climbs.
- **Every host answers degraded,** `store_unreachable` or `store_uninitialized`, local answers included, and the status request names the cause: the store is down, or being restored (spec.md, Degraded Modes).
- **One host alone degraded:** the laptop's tunnel is down (its store is `tunnel:5432`), or EC2 can't reach `10.42.1.10:5432` (contracts/tunnel.md §3; the security group's 5432 rule).

## Impact

- **While no host can read it,** no model is called anywhere: unknown is degraded (FR-019; CLAUDE.md). The site loads, and the room shows its resting message. Nothing is lost: the meter, the ledger, and the audit log are on the volume.
- **A failed backup** loses nothing now. The last good dump stays on the tunnel end and in the bucket, and a restore would make up the spend since it from the providers' own usage (contracts/shared-state.md §8, step 4). Dumps older than 7 days expire.

## Act

In your own terminal, with your SSO session (`PROFILE=h4reet-admin`, or yours). The tunnel end takes no SSH; every way in is Systems Manager (FR-050), as [tunnel-end.md](tunnel-end.md) shows.

### The store unreachable

1. Is the tunnel end up? Follow [tunnel-end.md](tunnel-end.md) first: the store is one of its services.
2. Is `shared-state` running and healthy? Through Systems Manager: `docker ps --filter name=h4reet-prod-shared-state-1`, and `docker logs --tail 50 h4reet-prod-shared-state-1`. Its log holds no statement or value (`log_statement = none`).
3. A store that won't start for want of its key: the deployer's host step stopped the start, naming the missing parameter in the tunnel end's journal (`journalctl -u h4-deployer.service`). Run `make shared-state-tls` again, then let the deployer try again.
4. A disk that is full or gone: `df -h /srv/h4reet/shared-state` and `findmnt /srv/h4reet/shared-state`. A volume that is gone is a restore, below.

### The backup failed

1. Through Systems Manager: `journalctl -u h4-shared-state-backup.service -n 50`. `step: dump` is the store (step 2 above); `step: put` is the bucket's reach: the egress proxy, its allowlist's `h4reet-ai-shared-state-*.s3.us-east-1.amazonaws.com`, or the role's `s3:PutObject` on `dumps/`.
2. Run one by hand: `systemctl start h4-shared-state-backup.service`. A good run ends the streak, and the next failure alerts again.

### A restore from the last backup

All in your terminal, in contracts/shared-state.md §8's order. No gateway may use the store between steps 2 and 4.

1. **Stop both hosts:** the autostart switch off and EC2 stopped (group 9's `ec2-autostart STATE=off` and `ec2-stop` targets; until they land, EC2 from the console), and `make down ENV=prod` on the laptop.
2. **Load the dump:** `make shared-state-restore`, or `make shared-state-restore DUMP=dumps/<UTC>.dump` for another. It refuses while EC2 runs or the laptop's prod does. It makes a presigned GET for that one dump, valid for 15 minutes, and sends it to the tunnel end in one Systems Manager command, which empties the store, gives the gateway back its grant on the database, and loads the dump in one transaction: a load that fails part way keeps nothing, and the store is empty until you load another. It prints the dump's name and the command's ID, never the URL. Systems Manager's command history keeps the command, the URL in it, past its expiry: the URL reads that one dump for 15 minutes, and nothing after.
3. **`make operator-restore ENV=shared REASON="..."`:** it prints the restored meters and sets the store uninitialized. From here every host and the relay answer degraded.
4. **`make operator-init ENV=shared REASON="..." DAY_USD=... MONTH_USD=... FALLBACK_TODAY_USD=...`:** never lower than step 3's meters, which init refuses, and raised by the spend since the dump that Bedrock's cost in AWS's data and the Anthropic account's usage show. Nothing restarts at zero (FR-019).
5. **Start the hosts again:** the autostart switch on (`ec2-autostart STATE=on`, group 9's), or the laptop's prod.

On a new, empty store (a new volume), run `make shared-state-roles` before step 2, so the dump's grants find their roles.

### A move to another zone

The data volume stays in its zone, and its `prevent_destroy` refuses a plan that would replace it. So the move is a reviewed change, and then a restore:

1. A change on a branch: `infra/prod/main.tf`'s `local.zone`, and a second volume in the new zone beside `aws_ebs_volume.shared_state`, attached in its place; the old volume stays, detached, until a later change lifts its `prevent_destroy`. Plan, gate, and apply it as any change to `infra/`.
2. The tunnel end starts in the new zone with an empty volume, which its host step formats. Run `make shared-state-roles`, then the restore above, from step 1.

## Verify

- `make operator-status ENV=shared` answers `store ok`, `state normal`, with the carried meters.
- "Last good backup's age" is green within the hour, and the bucket holds a new `dumps/<UTC>.dump`.
- Both hosts' "Shared state errors" are flat.

## Undo

- A restore replaces the store's content with the dump's, and isn't undone: the store's content before it was what made the restore needed. Its own dumps from before stay in the bucket for 7 days, and a second restore takes any of them, by `DUMP=`.
- A move to another zone keeps the old volume until a later change lifts its `prevent_destroy`: moving back is the same change the other way, onto the old volume.

## Record

In the next merge-request note, or the apply record of a move: the dump restored, its time, the Systems Manager command's ID, the meters step 3 printed and the values step 4 stated, with their sources; for a backup failure, the step, the streak's length, and the cause. Never the presigned URL, a password, or the account's ID.
