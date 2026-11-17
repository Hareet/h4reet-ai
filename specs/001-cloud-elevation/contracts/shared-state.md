# Contract: the shared state (prod's meter and kill switch, in Postgres on the tunnel end)

Spec 001, re-planned 2026-11-09. New. Spec FR-017 to FR-020, FR-030, FR-074. Research: R-20. Data model: [data-model.md §1](../data-model.md#1-the-shared-state-spec-fr-017-fr-019-researchmd-r-20).

**Amended 2026-11-12** (spec.md Assumptions, "The shared state on the tunnel end"; plan.md §16): the store is no longer RDS. The Author's answer of 2026-11-11 was "Postgres in a container on the tunnel end". Sections 1, 2, 3, and 8 below are rewritten for it. Sections 4 to 7 and 9 stand as written. The RDS design is at 00309c47 and in research.md R-20's first decision.

## 1. The service

(amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end")

| Setting | Value |
|---|---|
| Service | `shared-state`, in `deploy/compose.yaml`'s `tunnel-end` profile and the tunnel end's class (contracts/env-cloud.md §3) |
| Image | spec 000's pinned `postgres:17.11-alpine3.24` (`gateway-state`'s line in `deploy/images.lock`), copied by its index digest to the account's registry as `h4reet/shared-state`; the deployer pulls it by that digest |
| Its data | `/srv/h4reet/shared-state` on the tunnel end: the mount of its own encrypted gp3 volume (`aws_ebs_volume.shared_state`, `prevent_destroy`, in the tunnel end's zone, attached as `/dev/sdf`). A spot stop keeps it (research.md R-30). Its size is T166's measurement |
| Configuration | `deploy/shared-state/postgresql.conf` and `pg_hba.conf`, from the release's tree, read-only. `ssl = on`, TLS 1.3 at least, with the key and certificate from `/run/h4reet/shared-state/` on tmpfs. `hostssl` lines only, with `scram-sha-256`, for `gateway`, `grafana_ro`, `relay_ro`, and `relay_rw`. The superuser `postgres` connects through the container's local socket alone (`peer`). `log_statement = none` and `log_min_duration_statement = -1`, so no statement or value reaches a log |
| Listens | inside the container, on its compose networks; on the host, on the private interface's fixed address alone, `10.42.1.10:5432` |
| Security group | 5432 on the tunnel end's private interface, from EC2's security group only |
| Database | `h4reet` |
| Backups | `pg_dump` every hour, by the host timer `h4-shared-state-backup.timer`, inside the container over its socket, put to its own bucket in the account under `dumps/`, kept 7 days (the regrouping note's question 4, option A, relayed by the main session as the Author's answer). §8 restores from it |

Terraform defines the data volume, its attachment, the backups' bucket, and 5432's rule in `infra/prod/shared-state.tf` and `tunnel-end.tf`, and the tunnel end role's grants in `infra/prod/iam.tf` (P-I7). Nothing in Terraform reads a password or a key (rule T9).

## 2. Roles

(amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end")

| Role | Created by | Rights | Password |
|---|---|---|---|
| `postgres` | the image's first start, on an empty data volume | the superuser, through the container's local socket only: no `hostssl` line names it, so no TCP connection can use it | none that any client holds: the first start sets one from a random file the host writes to tmpfs and never keeps |
| `gateway` | `make shared-state-roles`, on the tunnel end through Systems Manager, as `postgres` over the socket | `LOGIN CREATEROLE`; `CREATE` on database `h4reet`, so its migrations make schema `gateway` and own it | Parameter Store `/h4reet/ec2/DB_GATEWAY_PASSWORD`; the laptop's prod env file, as `GATEWAY_DB_PASSWORD` |
| `grafana_ro` | migration 0002 (spec 000) | `v_state`, `audit_log`, and the views spec 000 and 010 grant, and `v_handovers` (0007) | Parameter Store `/h4reet/ec2/DB_GRAFANA_RO_PASSWORD`; the laptop's prod env file, as `GATEWAY_GRAFANA_RO_PASSWORD`. Each gateway sets it at start, as spec 000's does, so both hold the same value |
| `relay_ro` | migration 0007 | `SELECT` on `gateway.v_state`; read-only; `statement_timeout = 250ms` | Parameter Store `/h4reet/tunnel-end/DB_RELAY_RO_PASSWORD` |
| `relay_rw` | migration 0007 | `INSERT` on `gateway.handover_events` and its sequence | Parameter Store `/h4reet/tunnel-end/DB_RELAY_RW_PASSWORD` |

There is no `h4admin` and no Secrets Manager secret. Migration 0007 creates the two relay roles without passwords. `make shared-state-roles` reads the four passwords from Parameter Store on the tunnel end, with the tunnel end's role, and sets each as a SCRAM-SHA-256 verifier computed on the host, over the socket, on standard input. So no password is in a migration, a log, a command line, a Systems Manager command, or the repository. **As built in group 6:** a role no migration has made yet, on a new store, the target makes as migrations 0002 and 0007 would, whose `IF NOT EXISTS` then keep it; and it gives `gateway` the admin option on the other three, without membership, so the gateway's migrations and its start can alter them (`deploy/hosts/tunnel-end/shared_state.py`).

## 3. Connections

(amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end")

| Client | URL form (`GATEWAY_DB_URL` and the like) | TLS |
|---|---|---|
| EC2's gateway | `postgres://gateway@10.42.1.10:5432/h4reet?sslmode=verify-full` | verified against the shared state's CA certificate, `GATEWAY_DB_TLS_CA`, with the server name `GATEWAY_DB_TLS_SERVERNAME=shared-state` |
| The laptop's gateway | `postgres://gateway@tunnel:5432/h4reet?sslmode=verify-full`, through the tunnel's `-L 5432` to `shared-state:5432` | the same CA and the same server name, since the client connects to `tunnel` |
| The relay | `postgres://relay_ro@shared-state:5432/h4reet?sslmode=verify-full` (and `relay_rw`), over the compose network | the same CA and name (group 8, T106) |
| Grafana on each host | as its gateway, as `grafana_ro` | the same |

**The certificates.** `make shared-state-tls` (the Author's terminal) makes a CA whose key stays in `~/.config/h4reet-ai/shared-state/`, under spec 000's deny, and a server key and certificate for the one name `shared-state`. It writes the key to the SecureString `/h4reet/tunnel-end/SHARED_STATE_TLS_KEY`, the server's certificate to `/h4reet/tunnel-end/SHARED_STATE_TLS_CERT`, and the CA certificate to `/h4reet/hosts/SHARED_STATE_TLS_CA` for EC2 and the relay, as base64 of its PEM on one line, the form both hosts' env files carry and `write_env.py`'s grammar takes (amended 2026-11-17, F3; a rotation writes the new CA in the same form). It then puts the CA certificate into the laptop's prod env file as `GATEWAY_DB_TLS_CA`. The env file holds the certificate itself, base64 of its PEM on one line, since a container sees only the files its five bind roots hold. The tunnel end's host script writes the key to `/run/h4reet/shared-state/server.key` on tmpfs at each start, mode 0400, owned by the container's user.

Preflight refuses a prod `GATEWAY_DB_URL` without `sslmode=verify-full`, without `GATEWAY_DB_TLS_SERVERNAME` and `GATEWAY_DB_TLS_CA`, with a password in it, or naming the local `gateway-state`, on `H4_HOST=laptop` or `ec2` (exit 78 from the gateway too). The gateway checks the server's certificate chain against that CA and its name against the server name, whatever host it dials.

## 4. Two writers (data-model.md §1.3)

Both production gateways run with `H4_STACK=prod`, so both use `stack_state`'s one row. They rely on:
- migrations under `pg_advisory_lock`, so they run once;
- initialization under `pg_advisory_xact_lock`;
- the alert outbox claimed `FOR UPDATE SKIP LOCKED`;
- admission, commit, and the rollover sweep in transactions, which the two-gateways test proves (plan §10).

## 5. Unknown is degraded

| Where | Rule |
|---|---|
| Each host's gateway | spec 000 FR-031: unreachable or empty is unknown, so degraded, at request start. On the laptop a down tunnel means unreachable |
| The relay | not read successfully within 10 s is unknown, so degraded, without forwarding (FR-030) |
| Each host's health answer | 503 while its gateway can't read the store (contracts/tunnel.md §4), so the relay moves visitors off that host |

## 6. The move (data-model.md §1.5)

`make operator-init ENV=shared DAY_USD=… MONTH_USD=… FALLBACK_TODAY_USD=… ADAPTER_MONTH_USD=… [RENEW=yes]` initializes the store through spec 000's initialization (FR-034: the credential, the reason, an audit row with `host`). It refuses unless the store is `uninitialized`: a new store, a store found empty, or a restored store after §8's `operator-restore`.

## 7. Operator access (FR-074)

`make operator-status|reset|renew|init|restore ENV=shared` runs spec 000's operator CLI against the shared state, through one of two gateways, so that only one ever holds `127.0.0.1:18003`:
- **While the laptop's prod runs,** through that prod's own admin listener, `127.0.0.1:18003`. Its gateway already uses the shared state.
- **Otherwise,** through an admin-only stack on the laptop: `tunnel` with only `-L 5432`, and `gateway` with `H4_HOST=laptop`, its admin listener on the same `127.0.0.1:18003`, and no relay block. It can't take visitors, since the relay never sees it as healthy, and it stops when the command ends.

`operator.py` checks which applies before it starts anything, and refuses to start the admin-only stack while prod's gateway holds the port. Each action writes spec 000's audit row, with `host` set.

**After the deploy of 2026-11-17 (night 5's F5, [fixes/f5.md](../fixes/f5.md)):**
- The admin-only stack's gateway is prod's own image, `h4reet-gateway:<H4_REF>`, where `H4_REF` comes from prod's run file (`~/.local/state/h4reet/prod/run.env`), as prod's compose names it. The stack refuses to start, before anything runs, when that file is missing or doesn't name one full commit.
- Before the CLI's first call, the stack waits for two things, each within a bound named in `operator.py`:
  - the tunnel's `/run/tunnel/connected` mark, up to 60 s;
  - then the gateway's `/health`, asked inside its container, to read the store as `ok` or `uninitialized`, up to 20 s.
- If either bound runs out, the stack is stopped and the CLI exits 4, naming which wait failed.

## 8. Restore

(amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end"; plan.md §16, "Restore")

A restored store isn't empty: it holds the meters and the kill switch as they were at the last backup, and §6's `init` refuses it. Spend after that dump is missing from it. So the runbook (`docs/runbooks/shared-state.md`), all in the Author's terminal:
1. **Stop both hosts:** `make ec2-autostart STATE=off`, `make ec2-stop`, and `make down ENV=prod` on the laptop. No gateway may use the restored store before step 4.
2. **Restore** from the last backup: `make shared-state-restore [DUMP=<key>]`. It refuses while EC2 runs or the laptop's prod does. It lists the backups' prefix with his own session and picks the dump he names, or the latest. It makes a presigned GET for that one object, valid for 15 minutes, and passes it to the tunnel end in one Systems Manager command. The command fetches the dump through the tunnel end's egress proxy, empties `shared-state` (the database dropped and made again, over the socket), gives `gateway` back its `CREATE` and `CONNECT` on the database, which the roles target set and a dump carries no grant of, and loads the dump over the socket in one transaction, so a load that fails part way keeps nothing (group 6's review, I-2). The target prints the dump's name, its time, and the command's ID, never the URL or the dump. The tunnel end's role may still only put objects in the bucket, so a compromised tunnel end can't read a dump. The URL is a bearer credential for 15 minutes, and Systems Manager's command history keeps it past its expiry, which the runbook says.
3. **`make operator-restore ENV=shared`** (new; spec 000's operator actions, amended by name): it refuses unless EC2 is stopped and the laptop's prod isn't running. Through the admin-only stack (§7), it prints the restored meters, then, under the initialization lock, sets `stack_state` to `uninitialized`. It keeps the ledger and the audit log. From then on, every gateway and the relay answer degraded, as for a store found empty. **After group 6's review (I-3):** beside the meters it prints the current periods' crossed ceilings and the fallback's renewal flag, as the dump held them. FR-019 says "The initialization SHALL carry over the month's spend, the day's spend, today's fallback spend, the crossed ceilings, the renewal flag, and the adapter caps' months". The reading taken: init carries the four spends by its max rule, the restored meters among its candidates; it carries the crossed ceilings by their effect, since a restored meter at its ceiling refuses paid calls again at once (`meter_at_ceiling`), though the state row starts `normal` as spec 000's init writes it; and it carries the renewal flag by the Author's `RENEW=1`, which the restore's lines tell him to pass when the dump's fallback was renewed (init's renew is a new grant, its allowance today's fallback spend plus one grant), and without which the fallback waits, the safe side. The Author's answer of 2026-11-13: "Show them, you decide (Recommended)".
4. **`make operator-init ENV=shared`** with the values the Author confirms: never lower than the restored meters step 3 printed, and raised by the spend since the dump that the providers' own usage shows (Bedrock's cost in AWS's data, and the Anthropic account's usage). Nothing restarts at zero (FR-019). **After group 6's review (I-3):** the restored meters are init's fourth candidate beside the ledger, the journal, and the stated values, for the day, the month, today's fallback, and each capped adapter's month, so a meter the Author leaves unstated keeps its restored value, and a restored store needs no zero confirmed.
5. **Start the hosts again:** `make ec2-autostart STATE=on`, or the laptop's prod.

Steps 3 and 4 each take the operator credential and a reason naming the restore, and write an audit row with `host`.

**A move to another zone** is this restore: the data volume stays in its zone, and its `prevent_destroy` blocks a plan that replaces it. So the move is a reviewed change that adds a second volume in the new zone and keeps the old one until a later change lifts its `prevent_destroy`. The new volume starts empty, and steps 1 to 5 fill it from the last backup.

## 9. What it never holds

No payload, message, answer, visitor address, or client label. Spec 000's ledger and audit columns are unchanged, apart from `host` (FR-042; SC-011's scan covers the store). Its backups hold what it holds, and nothing more (disclosure row C16).

## 10. The dashboard's Hosts row: the shared state (group 6)

(new in group 6; tasks.md T075.) `deploy/grafana/dashboards/h4-runtime.json`'s "Hosts" row, below group 5's panels (contracts/tunnel.md §7):

| Panel | Type | Query |
|---|---|---|
| Shared state latency, p95 (FR-060) | time series | `histogram_quantile(0.95, sum by (le, h4_host) (rate(h4_shared_state_latency_seconds_bucket[5m])))` |
| Shared state errors (FR-060) | time series | `sum by (h4_host, error_type) (rate(h4_shared_state_errors_total[5m]))` |
| Last good backup's age (FR-019) | stat | `max(h4_shared_state_backup_age_seconds)` |

- **`h4_shared_state_latency_seconds`** is `h4.shared_state.latency`, a histogram each host's gateway records for every query and session on the store, labelled `h4.host`.
- **`h4_shared_state_errors_total`** is `h4.shared_state.errors`, a counter of the store's failures, labelled `h4.host` and `error.type`, the error's class (`ECONNREFUSED`, a SQLSTATE, or `timeout`), never its message.
- **`h4_shared_state_backup_age_seconds`** is `h4.shared_state.backup_age_seconds`, the gauge the tunnel end's backup timer pushes to its collector after each run: the seconds since the last good dump. It reads green under 2 hours, and red from 2 hours, and on no data, when no dump has reached the bucket.
- `deploy/scripts/test_dashboard.py` reads this section's table with contracts/tunnel.md §7's.
