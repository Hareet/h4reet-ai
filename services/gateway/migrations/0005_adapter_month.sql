-- 0005_adapter_month.sql: the adapter month (spec 010, Amendment 0-5; FR-022, FR-023; its plan §4.4, departure B7).
-- Append-only, as every migration: 0001's CHECKs change here, not there.
--
-- 1. A fourth meter, adapter_month: one row per capped paid adapter and UTC month, keyed <adapter id>:<YYYY-MM>, its
--    spend and reservations held to the adapter's cap from config/budgets.yaml's adapter_monthly_usd. Its warned_at
--    and reached_at record the cap's warning and the cap. The allowance and the grant stay fallback_day's alone.
ALTER TABLE gateway.meters DROP CONSTRAINT meters_meter_check;
ALTER TABLE gateway.meters ADD CONSTRAINT meters_meter_check
  CHECK (meter IN ('day', 'month', 'fallback_day', 'adapter_month'));
ALTER TABLE gateway.meters DROP CONSTRAINT meters_period_key_format;
ALTER TABLE gateway.meters ADD CONSTRAINT meters_period_key_format CHECK (
  (meter IN ('day', 'fallback_day') AND period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
  OR (meter = 'month' AND period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
  OR (meter = 'adapter_month' AND period_key ~ '^[a-z][a-z0-9-]{0,31}:[0-9]{4}-(0[1-9]|1[0-2])$')
);

-- 2. Whether a reservation reserved against its adapter's month: the commit, the sweep, and a compensation release and
--    charge that row only when it did, so a cap added or removed across a restart never subtracts what no reservation
--    holds (spec 010's plan, departure B7).
ALTER TABLE gateway.reservations ADD COLUMN adapter_month boolean NOT NULL DEFAULT false;

-- 3. The dashboard's table of the paid adapters' months (spec 010, FR-036), for grafana_ro: the adapter, the month, the
--    spend and reservations, and when the warning and the cap were crossed. Nothing that names a call.
CREATE VIEW gateway.v_adapter_months AS
SELECT split_part(period_key, ':', 1) AS adapter, split_part(period_key, ':', 2) AS month, spent_micro, reserved_micro,
       warned_at, reached_at
FROM gateway.meters
WHERE meter = 'adapter_month';
GRANT SELECT ON gateway.v_adapter_months TO grafana_ro;
