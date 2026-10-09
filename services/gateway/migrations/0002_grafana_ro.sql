-- 0002_grafana_ro.sql: the read-only role Grafana's `gateway` datasource uses (data-model.md §2.9).
--
-- grafana_ro reads exactly two objects: gateway.audit_log (FR-034's audit panel reads the authoritative table, not
-- telemetry) and gateway.v_state. Neither exposes client_label. The view runs with its owner's rights, so the role
-- needs no grant on the tables behind it. Its password is set by the gateway at every start, from
-- GATEWAY_GRAFANA_RO_PASSWORD, as a SCRAM-SHA-256 verifier: the plaintext never reaches Postgres or its logs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grafana_ro') THEN
    CREATE ROLE grafana_ro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END;
$$;

ALTER ROLE grafana_ro SET default_transaction_read_only = on;
ALTER ROLE grafana_ro SET statement_timeout = '2s';

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO grafana_ro', current_database());
END;
$$;
GRANT USAGE ON SCHEMA gateway TO grafana_ro;
GRANT SELECT ON gateway.audit_log, gateway.v_state TO grafana_ro;
