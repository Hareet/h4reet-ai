-- 0003_studio_window.sql: the studio's GPU window (spec 003 FR-035, SC-011; specs/003-studio-assets/contracts/
-- gpu-window.md §1, §3). Append-only, as every migration: 0001's CHECKs change here, not there.
--
-- 1. studio_window joins the audit log's actions, as an operator write with its reason. The window's state is the
--    newest studio_window row: open after a start, closed after an end, closed with none.
ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('init', 'reset', 'renew', 'trip', 'fallback_exhausted', 'auth_failed', 'test_clock',
                    'test_synthetic', 'adapter_call', 'journal_failed', 'studio_window'));
ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_reason_iff_operator_write;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_reason_iff_operator_write CHECK (
  (action IN ('init', 'reset', 'renew', 'test_clock', 'test_synthetic', 'adapter_call', 'studio_window'))
    = (reason IS NOT NULL)
);

-- 2. One row per window for the dashboard's panel: each start with the end that follows it (the writes alternate,
--    under the state lock), and the ledger's fallback spend between them, on the gateway clock, as both tables keep
--    it. An open window has no end, and counts up to now. It shows no reason and no client label, and runs with its
--    owner's rights, as v_state does, so grafana_ro needs no grant on the tables behind it.
CREATE VIEW gateway.v_studio_windows AS
WITH marks AS (
  SELECT id, ts, detail ->> 'state' AS state, lead(ts) OVER (ORDER BY id) AS next_ts
  FROM gateway.audit_log
  WHERE action = 'studio_window'
)
SELECT m.ts                                       AS started_at,
       m.next_ts                                  AS ended_at,
       coalesce(sum(l.cost_micro), 0)::bigint     AS fallback_micro,
       count(l.id)::bigint                        AS fallback_calls
FROM marks m
LEFT JOIN gateway.ledger l
  ON l.attribution = 'fallback' AND l.ts >= m.ts AND (m.next_ts IS NULL OR l.ts < m.next_ts)
WHERE m.state = 'start'
GROUP BY m.id, m.ts, m.next_ts;

GRANT SELECT ON gateway.v_studio_windows TO grafana_ro;
