-- 0007_hosts.sql: spec 001's two hosts on one shared state (specs/001-cloud-elevation/data-model.md §1.2).
--
-- 1. The host on each ledger and audit row: laptop or ec2. The gateway names its host for every session it opens
--    (h4.host, from H4_HOST; src/meter/store.ts), and each new row takes it as its default, so every writer sets it
--    without naming it. The column is added first and its default set after, so the rows from before 0007 stay NULL.
-- 2. The relay's handover events, its two roles, and the view grafana_ro reads them by.
-- 3. The operator's restore among the audited writes, with its reason (contracts/shared-state.md §8, step 3).
-- Nothing else changes.

ALTER TABLE gateway.ledger ADD COLUMN host text;
ALTER TABLE gateway.ledger ADD CONSTRAINT ledger_host_check CHECK (host IN ('laptop', 'ec2'));
ALTER TABLE gateway.ledger ALTER COLUMN host SET DEFAULT nullif(current_setting('h4.host', true), '');

ALTER TABLE gateway.audit_log ADD COLUMN host text;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_host_check CHECK (host IN ('laptop', 'ec2'));
ALTER TABLE gateway.audit_log ALTER COLUMN host SET DEFAULT nullif(current_setting('h4.host', true), '');

ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('init', 'reset', 'renew', 'trip', 'fallback_exhausted', 'auth_failed', 'test_clock',
                    'test_synthetic', 'adapter_call', 'journal_failed', 'studio_window', 'twin_call', 'alert_samples',
                    'restore'));
ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_reason_iff_operator_write;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_reason_iff_operator_write CHECK (
  (action IN ('init', 'reset', 'renew', 'test_clock', 'test_synthetic', 'adapter_call', 'studio_window', 'twin_call',
              'alert_samples', 'restore')) = (reason IS NOT NULL)
);

-- Each change of serving host, which the relay on the tunnel end writes (spec SC-007, SC-016, SC-018). The gap is
-- the time no host served, set on a move out of none.
CREATE TABLE gateway.handover_events (
  id        bigserial   PRIMARY KEY,
  at        timestamptz NOT NULL,
  from_host text        NOT NULL CHECK (from_host IN ('laptop', 'ec2', 'none')),
  to_host   text        NOT NULL CHECK (to_host IN ('laptop', 'ec2', 'none')),
  reason    text        NOT NULL CHECK (reason IN ('laptop_healthy', 'laptop_unhealthy', 'ec2_healthy', 'ec2_unhealthy')),
  gap_ms    integer,
  CONSTRAINT handover_events_gap CHECK (gap_ms IS NULL OR (from_host = 'none' AND gap_ms >= 0))
);
CREATE INDEX handover_events_at ON gateway.handover_events (at DESC);

-- The relay's two roles, without passwords: the Author's shared-state roles target sets them, as verifiers, from
-- Parameter Store (contracts/shared-state.md §2). A store whose roles exist already, as a restored or a moved one's
-- do, keeps them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'relay_ro') THEN
    CREATE ROLE relay_ro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'relay_rw') THEN
    CREATE ROLE relay_rw LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END;
$$;

-- relay_ro reads the kill switch, and nothing else, within the relay's 250 ms (FR-030).
ALTER ROLE relay_ro SET default_transaction_read_only = on;
ALTER ROLE relay_ro SET statement_timeout = '250ms';
-- relay_rw records each change of serving host, and nothing else.
ALTER ROLE relay_rw SET statement_timeout = '250ms';

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO relay_ro, relay_rw', current_database());
END;
$$;
GRANT USAGE ON SCHEMA gateway TO relay_ro, relay_rw;
GRANT SELECT ON gateway.v_state TO relay_ro;
GRANT INSERT ON gateway.handover_events TO relay_rw;
GRANT USAGE ON SEQUENCE gateway.handover_events_id_seq TO relay_rw;

-- The dashboard's handover panel: the last 30 days, with no address or client in them. It runs with its owner's
-- rights, as v_state does, so grafana_ro needs no grant on the table.
CREATE VIEW gateway.v_handovers AS
SELECT at, from_host, to_host, reason, gap_ms
FROM gateway.handover_events
WHERE at > now() - interval '30 days';
GRANT SELECT ON gateway.v_handovers TO grafana_ro;
