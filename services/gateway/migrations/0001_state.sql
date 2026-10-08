-- 0001_state.sql: the gateway's state in schema `gateway` (specs/000-local-foundations/data-model.md §2.2–§2.9).
--
-- The gateway applies migrations at startup, in file order, each in one transaction, under a fixed advisory lock,
-- and records each in gateway.schema_migrations with its SHA-256 (src/meter/store.ts). Append-only: a change is a
-- new file. Money is integer micro-USD in bigint; periods are UTC.

-- §2.2 The kill switch: one row. Its absence means the store is uninitialized (store_uninitialized, FR-031).
CREATE TABLE gateway.stack_state (
  id                        smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stack                     text        NOT NULL CHECK (stack IN ('prod', 'dev', 'dev-cpu')),
  env                       text        NOT NULL CHECK (env IN ('prod', 'dev')),
  state                     text        NOT NULL CHECK (state IN ('normal', 'degraded')),
  since                     timestamptz NOT NULL,
  crossed                   text[]      NOT NULL DEFAULT '{}',
  fallback_awaiting_renewal boolean     NOT NULL,
  fallback_awaiting_since   timestamptz,
  initialized_at            timestamptz NOT NULL,
  initialized_by            text        NOT NULL,
  test_clock_offset_ms      bigint,
  updated_at                timestamptz NOT NULL,
  CONSTRAINT stack_state_crossed_iff_degraded CHECK ((state = 'degraded') = (cardinality(crossed) > 0)),
  CONSTRAINT stack_state_awaiting_since CHECK (fallback_awaiting_renewal = (fallback_awaiting_since IS NOT NULL)),
  CONSTRAINT stack_state_test_clock_dev_only
    CHECK (test_clock_offset_ms IS NULL OR (env = 'dev' AND test_clock_offset_ms >= 0))
);

-- §2.3 Spend per UTC period.
CREATE TABLE gateway.meters (
  meter           text        NOT NULL CHECK (meter IN ('day', 'month', 'fallback_day')),
  period_key      text        NOT NULL,
  spent_micro     bigint      NOT NULL DEFAULT 0 CHECK (spent_micro >= 0),
  reserved_micro  bigint      NOT NULL DEFAULT 0 CHECK (reserved_micro >= 0),
  allowance_micro bigint      CHECK (allowance_micro > 0),
  grant_no        integer     CHECK (grant_no >= 1),
  warned_at       timestamptz,
  reached_at      timestamptz,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL,
  PRIMARY KEY (meter, period_key),
  CONSTRAINT meters_period_key_format CHECK (
    (meter IN ('day', 'fallback_day') AND period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
    OR (meter = 'month' AND period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
  ),
  CONSTRAINT meters_allowance_fallback_only CHECK ((meter = 'fallback_day') = (allowance_micro IS NOT NULL)),
  CONSTRAINT meters_grant_fallback_only CHECK ((meter = 'fallback_day') = (grant_no IS NOT NULL))
);

-- §2.4 Metered calls in flight. A sweep settles an expired one at its maximum, so a reservation also keeps the
-- call's identity, which the ledger row the sweep writes needs (§2.5).
CREATE TABLE gateway.reservations (
  id            uuid        PRIMARY KEY,
  attribution   text        NOT NULL CHECK (attribution IN ('fallback', 'metered', 'test')),
  adapter_id    text        NOT NULL,
  provider      text        NOT NULL,
  model         text        NOT NULL,
  price_version text        NOT NULL,
  max_micro     bigint      NOT NULL CHECK (max_micro >= 0),
  period_day    text        NOT NULL,
  period_month  text        NOT NULL,
  created_at    timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  request_id    text        NOT NULL,
  trace_id      text        NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  purpose       text        NOT NULL CHECK (purpose IN ('hello', 'contract', 'eval', 'synthetic')),
  route_reason  text        CHECK (route_reason IN ('local_unhealthy', 'local_failed')),
  routing_sha   text        NOT NULL CHECK (routing_sha ~ '^[0-9a-f]{64}$'),
  CONSTRAINT reservations_route_reason_fallback_only CHECK (route_reason IS NULL OR attribution = 'fallback')
);
CREATE INDEX reservations_expires_at ON gateway.reservations (expires_at);

-- §2.5 The Model Call Record (FR-023): one row per provider attempt. Never a prompt, a completion, the system
-- prompt, or the client's address; the client label stays here and nowhere else.
CREATE TABLE gateway.ledger (
  id                uuid        PRIMARY KEY,
  reservation_id    uuid        UNIQUE,
  ts                timestamptz NOT NULL,
  started_at        timestamptz NOT NULL,
  stack             text        NOT NULL,
  request_id        text        NOT NULL,
  trace_id          text        NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  purpose           text        NOT NULL CHECK (purpose IN ('hello', 'contract', 'eval', 'synthetic')),
  route_decision    text        NOT NULL CHECK (route_decision IN ('local', 'fallback', 'metered')),
  route_reason      text        CHECK (route_reason IN ('local_unhealthy', 'local_failed')),
  attribution       text        NOT NULL CHECK (attribution IN ('none', 'fallback', 'metered', 'test')),
  adapter_id        text        NOT NULL,
  provider          text        NOT NULL,
  request_model     text        NOT NULL,
  response_model    text,
  input_tokens      integer     CHECK (input_tokens >= 0),
  output_tokens     integer     CHECK (output_tokens >= 0),
  cache_read_tokens integer     CHECK (cache_read_tokens >= 0),
  latency_ms        integer     NOT NULL CHECK (latency_ms >= 0),
  finish_reason     text        CHECK (finish_reason IN ('stop', 'length', 'content_filter', 'error', 'other')),
  outcome           text        NOT NULL CHECK (outcome IN ('ok', 'error', 'unknown')),
  error_kind        text        CHECK (error_kind IN ('unavailable', 'timeout', 'rate_limited', 'auth', 'bad_request',
                                                      'content_filtered', 'provider_error')),
  cost_micro        bigint      NOT NULL CHECK (cost_micro >= 0),
  cost_basis        text        NOT NULL CHECK (cost_basis IN ('usage', 'reservation', 'expired', 'none')),
  price_version     text        NOT NULL,
  routing_sha       text        NOT NULL CHECK (routing_sha ~ '^[0-9a-f]{64}$'),
  period_day        text        NOT NULL,
  period_month      text        NOT NULL,
  client_label      text        CHECK (client_label ~ '^[a-z0-9-]{1,32}$'),
  CONSTRAINT ledger_route_reason_fallback_only CHECK (route_reason IS NULL OR route_decision = 'fallback'),
  CONSTRAINT ledger_unknown_only_expired CHECK (outcome <> 'unknown' OR cost_basis = 'expired'),
  CONSTRAINT ledger_error_kind_iff_error CHECK ((outcome = 'error') = (error_kind IS NOT NULL)),
  -- The row rules: an unmetered call costs nothing and has no reservation; a metered one always has one.
  CONSTRAINT ledger_reservation_iff_metered CHECK ((attribution = 'none') = (reservation_id IS NULL)),
  CONSTRAINT ledger_unmetered_costs_nothing CHECK (attribution <> 'none' OR (cost_micro = 0 AND cost_basis = 'none'))
);
CREATE INDEX ledger_ts ON gateway.ledger (ts);
CREATE INDEX ledger_period_day_attribution ON gateway.ledger (period_day, attribution);
CREATE INDEX ledger_period_month_attribution ON gateway.ledger (period_month, attribution);
CREATE INDEX ledger_trace_id ON gateway.ledger (trace_id);

-- §2.6 Who, when, why (FR-034). Append-only.
CREATE TABLE gateway.audit_log (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  ts          timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  stack       text        NOT NULL,
  actor       text        NOT NULL CHECK (actor ~ '^(operator:(prod|dev|dev-cpu)#[0-9a-f]{8}|gateway|unknown)$'),
  action      text        NOT NULL CHECK (action IN ('init', 'reset', 'renew', 'trip', 'fallback_exhausted',
                                                     'auth_failed', 'test_clock', 'test_synthetic', 'adapter_call',
                                                     'journal_failed')),
  reason      text,
  before      jsonb,
  after       jsonb,
  detail      jsonb       NOT NULL DEFAULT '{}',
  CONSTRAINT audit_log_reason_iff_operator_write CHECK (
    (action IN ('init', 'reset', 'renew', 'test_clock', 'test_synthetic', 'adapter_call')) = (reason IS NOT NULL)
  ),
  CONSTRAINT audit_log_reason_length CHECK (reason IS NULL OR char_length(reason) BETWEEN 10 AND 500)
);
CREATE INDEX audit_log_ts ON gateway.audit_log (ts DESC);
CREATE INDEX audit_log_action_recorded_at ON gateway.audit_log (action, recorded_at);

-- The gateway owns the table, so this guards against bugs, not against the owner.
CREATE FUNCTION gateway.audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gateway.audit_log is append-only: % refused', TG_OP;
END;
$$;
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON gateway.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION gateway.audit_log_append_only();

-- §2.7 Alerts committed with their cause. store_unreachable is never stored: the store is down when it fires.
CREATE TABLE gateway.alert_outbox (
  id                    bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dedupe_key            text        NOT NULL UNIQUE,
  kind                  text        NOT NULL CHECK (kind IN ('warn', 'trip', 'fallback_exhausted', 'operator_action',
                                                           'credentials_expiring', 'fallback_unavailable',
                                                           'auth_failed', 'reminder')),
  stack                 text        NOT NULL,
  created_at            timestamptz NOT NULL,
  enqueued_at           timestamptz NOT NULL DEFAULT now(),
  subject               text        NOT NULL,
  body                  text        NOT NULL,
  facts                 jsonb       NOT NULL,
  telegram_status       text        NOT NULL CHECK (telegram_status IN ('pending', 'delivered', 'failed')),
  email_status          text        NOT NULL CHECK (email_status IN ('pending', 'delivered', 'failed')),
  telegram_attempts     smallint    NOT NULL DEFAULT 0,
  email_attempts        smallint    NOT NULL DEFAULT 0,
  telegram_next_at      timestamptz,
  email_next_at         timestamptz,
  telegram_delivered_at timestamptz,
  email_delivered_at    timestamptz,
  telegram_ref          text,
  email_ref             text,
  telegram_error        text,
  email_error           text
);
CREATE INDEX alert_outbox_telegram_due ON gateway.alert_outbox (telegram_next_at) WHERE telegram_status = 'pending';
CREATE INDEX alert_outbox_email_due ON gateway.alert_outbox (email_next_at) WHERE email_status = 'pending';

-- §2.8 Incident drafts queued by a trip (FR-035). A period's ceiling is crossed once: spend never decreases.
CREATE TABLE gateway.incidents (
  id             bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at     timestamptz NOT NULL,
  stack          text        NOT NULL,
  ceiling        text        NOT NULL CHECK (ceiling IN ('day', 'month')),
  period_key     text        NOT NULL,
  ledger_id      uuid        NOT NULL,
  trip_alert_key text        NOT NULL,
  status         text        NOT NULL CHECK (status IN ('queued', 'written', 'failed')),
  path           text,
  sha256         text,
  written_at     timestamptz,
  error          text,
  UNIQUE (ceiling, period_key)
);

-- §2.9 The state row joined to the current periods' meters, by the gateway clock, so it never shows yesterday's
-- row as today's. grafana_ro reads it (0002), and it runs with its owner's rights.
CREATE VIEW gateway.v_state AS
WITH s AS (
  SELECT st.*,
         (now() + make_interval(secs => coalesce(st.test_clock_offset_ms, 0) / 1000.0))
           AT TIME ZONE 'UTC' AS gateway_time
  FROM gateway.stack_state st
  WHERE st.id = 1
)
SELECT s.stack, s.env, s.state, s.since, s.crossed,
       s.fallback_awaiting_renewal, s.fallback_awaiting_since, s.initialized_at,
       s.test_clock_offset_ms,
       to_char(s.gateway_time, 'YYYY-MM-DD')  AS day_key,
       to_char(s.gateway_time, 'YYYY-MM')     AS month_key,
       coalesce(d.spent_micro, 0)    AS day_spent_micro,
       coalesce(d.reserved_micro, 0) AS day_reserved_micro,
       coalesce(m.spent_micro, 0)    AS month_spent_micro,
       coalesce(m.reserved_micro, 0) AS month_reserved_micro,
       coalesce(f.spent_micro, 0)    AS fallback_spent_micro,
       coalesce(f.reserved_micro, 0) AS fallback_reserved_micro,
       f.allowance_micro             AS fallback_allowance_micro,  -- NULL until today's row exists
       f.grant_no                    AS fallback_grant_no
FROM s
LEFT JOIN gateway.meters d ON d.meter = 'day'          AND d.period_key = to_char(s.gateway_time, 'YYYY-MM-DD')
LEFT JOIN gateway.meters m ON m.meter = 'month'        AND m.period_key = to_char(s.gateway_time, 'YYYY-MM')
LEFT JOIN gateway.meters f ON f.meter = 'fallback_day' AND f.period_key = to_char(s.gateway_time, 'YYYY-MM-DD');
