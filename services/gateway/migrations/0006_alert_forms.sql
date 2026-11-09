-- 0006_alert_forms.sql: each channel's form, and the samples' audit action (spec 011, Amendment 0-7; FR-030, FR-033,
-- FR-044; its plan §2.3). Append-only, as every migration: earlier CHECKs change here, not there. The action lists are
-- 0004_twin.sql's, the newest that sets them, with alert_samples added.
--
-- 1. Each channel's form, and the reason when the plain form went in the designed one's place. NULL until the
--    channel's first attempt; each attempt writes the form it sent. No column holds a designed form: the dispatcher
--    renders it at each attempt from the row's facts. A rollback to an older gateway across this migration stops
--    it, exit 78 schema_newer_than_code, as across any migration (data-model.md §2.1); the designs' own undo is
--    formats set to plain in config/alerts.yaml, which needs no rollback.
ALTER TABLE gateway.alert_outbox
  ADD COLUMN telegram_form text CHECK (telegram_form IN ('designed', 'plain')),
  ADD COLUMN email_form text CHECK (email_form IN ('designed', 'plain')),
  ADD COLUMN telegram_fallback text
    CHECK (telegram_fallback IN ('entities_refused', 'render_failed', 'over_limit', 'not_rendered')),
  ADD COLUMN email_fallback text
    CHECK (email_fallback IN ('message_refused', 'render_failed', 'over_limit', 'not_rendered')),
  -- coalesce: a CHECK passes when its expression is NULL, so a reason with no form at all must read as false.
  ADD CONSTRAINT alert_outbox_telegram_fallback_is_plain
    CHECK (telegram_fallback IS NULL OR coalesce(telegram_form = 'plain', false)),
  ADD CONSTRAINT alert_outbox_email_fallback_is_plain
    CHECK (email_fallback IS NULL OR coalesce(email_form = 'plain', false));

-- 2. alert_samples joins the audit log's actions, as an operator write with its reason.
ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('init', 'reset', 'renew', 'trip', 'fallback_exhausted', 'auth_failed', 'test_clock',
                    'test_synthetic', 'adapter_call', 'journal_failed', 'studio_window', 'twin_call', 'alert_samples'));
ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_reason_iff_operator_write;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_reason_iff_operator_write CHECK (
  (action IN ('init', 'reset', 'renew', 'test_clock', 'test_synthetic', 'adapter_call', 'studio_window', 'twin_call',
              'alert_samples')) = (reason IS NOT NULL)
);
