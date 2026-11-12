# Contract: the shared state (prod's meter and kill switch, in RDS)

Spec 001, re-planned 2026-11-09. New. Spec FR-017 to FR-020, FR-030, FR-074. Research: R-20. Data model: [data-model.md §1](../data-model.md#1-the-shared-state-spec-fr-017-fr-019-researchmd-r-20).

## 1. The instance

| Setting | Value |
|---|---|
| Engine | PostgreSQL 17, the newest minor RDS offers. Spec 000 pins `postgres:17.11-alpine3.24` |
| Class | the smallest Graviton class RDS offers (to price) |
| Placement | single-AZ, a DB subnet group over two private subnets, no public access |
| Storage | encrypted gp3, at RDS's minimum size |
| Parameters | `rds.force_ssl = 1`; `log_statement = none`; `log_min_duration_statement = -1`, so no statement or value reaches a log |
| Backups | automated, kept 7 days; a final snapshot on deletion; deletion protection on |
| Master user | `h4admin`, with its password managed by RDS in Secrets Manager (`manage_master_user_password`), never in Terraform |
| Security group | 5432 from EC2's and the tunnel end's security groups only |
| Database | `h4reet` |

Terraform defines the instance, its subnet group, its parameter group, and its security group in `infra/prod/rds.tf`. Nothing in Terraform reads a password.

## 2. Roles

| Role | Created by | Rights | Password |
|---|---|---|---|
| `gateway` | the Author's one-time setup, as `h4admin`, from `make shared-state-roles` in his terminal | owner of schema `gateway`; runs the migrations | Parameter Store `/h4reet/ec2/DB_GATEWAY_PASSWORD`; the laptop's prod env file |
| `grafana_ro` | migration 0002 (spec 000) | `v_state`, `audit_log`, and the views spec 000 and 010 grant, and `v_handovers` (0007) | Parameter Store; the laptop's prod env file |
| `relay_ro` | migration 0007 | `SELECT` on `gateway.v_state`; read-only; `statement_timeout = 250ms` | Parameter Store `/h4reet/tunnel-end/` |
| `relay_rw` | migration 0007 | `INSERT` on `gateway.handover_events` and its sequence | the same |

Migration 0007 creates the two relay roles without passwords. The Author's `make shared-state-roles` sets them from the values he wrote to Parameter Store, so no password is in a migration, a log, or the repository.

## 3. Connections

| Client | URL form (`GATEWAY_DB_URL` and the like) | TLS |
|---|---|---|
| EC2's gateway | `postgres://gateway@<rds-endpoint>:5432/h4reet` | `verify-full` against RDS's certificate bundle, pinned by SHA-256 in the image |
| The laptop's gateway | `postgres://gateway@tunnel:5432/h4reet`, through the tunnel's `-L 5432` | verified against the same bundle, with the server name set to `<rds-endpoint>`, since the client connects to `tunnel` |
| The relay | `postgres://relay_ro@<rds-endpoint>:5432/h4reet` (and `relay_rw`) | `verify-full` |
| Grafana on each host | as its gateway, as `grafana_ro` | the same |

Preflight refuses a prod `GATEWAY_DB_URL` without TLS, or one that names the local `gateway-state` on `H4_HOST=laptop` or `ec2` (exit 78).

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

## 8. Restore

A restored store isn't empty: it holds the meters and the kill switch as they were at the restore point, and §6's `init` refuses it. Spend after the restore point is missing from it. So the runbook, all in the Author's terminal:
1. **Stop both hosts:** `make ec2-autostart STATE=off`, `make ec2-stop`, and `make down ENV=prod` on the laptop. No gateway may use the restored store before step 4.
2. **Restore** from RDS's automated backups to a new instance, and give it the original instance's identifier, keeping the old one's final snapshot, so the endpoint, the tunnel's permit, and every `GATEWAY_DB_URL` stay as they are. The rename steps, and how Terraform's state then matches the instance, are to confirm against AWS's guide in group 6, and the runbook records them.
3. **`make operator-restore ENV=shared`** (new; spec 000's operator actions, amended by name): it refuses unless EC2 is stopped and the laptop's prod isn't running. Through the admin-only stack (§7), it prints the restored meters, then, under the initialization lock, sets `stack_state` to `uninitialized`. It keeps the ledger and the audit log. From then on, every gateway and the relay answer degraded, as for a store found empty.
4. **`make operator-init ENV=shared`** with the values the Author confirms: never lower than the restored meters step 3 printed, and raised by the spend since the restore point that the providers' own usage shows (Bedrock's cost in AWS's data, and the Anthropic account's usage). Nothing restarts at zero (FR-019).
5. **Start the hosts again:** `make ec2-autostart STATE=on`, or the laptop's prod.

Steps 3 and 4 each take the operator credential and a reason naming the restore, and write an audit row with `host`.

## 9. What it never holds

No payload, message, answer, visitor address, or client label. Spec 000's ledger and audit columns are unchanged, apart from `host` (FR-042; SC-011's scan covers the store).
