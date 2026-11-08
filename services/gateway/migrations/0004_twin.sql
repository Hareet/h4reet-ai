-- 0004_twin.sql: the twin's conversation (spec 007, Amendment 0-1; FR-026, FR-045, FR-050). Append-only, as every
-- migration: 0001's CHECKs change here, not there.
--
-- 1. The purpose `twin` joins the reservations' and the ledger's purposes: POST /room/turn's calls, and the Author's
--    POST /admin/twin/turn evaluation calls.
ALTER TABLE gateway.reservations DROP CONSTRAINT reservations_purpose_check;
ALTER TABLE gateway.reservations ADD CONSTRAINT reservations_purpose_check
  CHECK (purpose IN ('hello', 'contract', 'eval', 'synthetic', 'twin'));
ALTER TABLE gateway.ledger DROP CONSTRAINT ledger_purpose_check;
ALTER TABLE gateway.ledger ADD CONSTRAINT ledger_purpose_check
  CHECK (purpose IN ('hello', 'contract', 'eval', 'synthetic', 'twin'));

-- 2. A twin call's room feature (a selectable's ID, or free_talk) and topic (a topic's ID, or free_talk), each a
--    bounded ID from the twin's pack; NULL for every other call. Never a turn's words, a prompt, or an answer.
ALTER TABLE gateway.ledger ADD COLUMN room_feature text CHECK (room_feature ~ '^[a-z0-9_-]{1,64}$');
ALTER TABLE gateway.ledger ADD COLUMN room_topic text CHECK (room_topic ~ '^[a-z0-9_-]{1,64}$');

-- 3. twin_call joins the audit log's actions, as an operator write with its reason (contracts/operator-admin.md §8).
ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('init', 'reset', 'renew', 'trip', 'fallback_exhausted', 'auth_failed', 'test_clock',
                    'test_synthetic', 'adapter_call', 'journal_failed', 'studio_window', 'twin_call'));
ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_reason_iff_operator_write;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_reason_iff_operator_write CHECK (
  (action IN ('init', 'reset', 'renew', 'test_clock', 'test_synthetic', 'adapter_call', 'studio_window', 'twin_call'))
    = (reason IS NOT NULL)
);

-- 4. The dashboard's "model each turn used" panel (FR-045): the twin's ledger rows, with no client label, request ID,
--    or trace ID, so grafana_ro reads the model and the feature and nothing that names a visit.
CREATE VIEW gateway.v_twin_models AS
SELECT ts, room_feature, room_topic, route_decision, attribution, request_model, response_model, outcome
FROM gateway.ledger
WHERE purpose = 'twin';
GRANT SELECT ON gateway.v_twin_models TO grafana_ro;
