-- KEP-005 + KEP-006 + KEP-008 Turso schema for the flag-eval-demo hosted
-- evaluator. Apply via `turso db shell flag-eval-demo < 0001_schema.sql`
-- once the DB is provisioned in the shared `demo` Turso group.
--
-- Naming convention: numeric prefix + short slug. Files are append-only
-- — never edit a migration in place; add a new one to alter shape.
--
-- All timestamps are RFC3339 strings (TEXT) for portability across
-- libsql/Turso and local SQLite. Values are JSON-encoded TEXT so a
-- single column carries booleans, strings, numbers, and JSON objects.

-- Durable store for the standalone manifest digest and control-plane state.
CREATE TABLE IF NOT EXISTS flag_definitions (
  key           TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  scope         TEXT NOT NULL,
  default_value TEXT NOT NULL,
  owner         TEXT,
  description   TEXT,
  tags          TEXT,
  manifest_sha  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS flag_definitions_scope ON flag_definitions (scope);
CREATE INDEX IF NOT EXISTS flag_definitions_owner ON flag_definitions (owner);

-- KEP-006: editable overrides keyed by (scope, env, key).
-- scope is "cloud" by default; "team" reserved for future use.
CREATE TABLE IF NOT EXISTS overrides (
  scope      TEXT NOT NULL DEFAULT 'cloud',
  env        TEXT NOT NULL DEFAULT 'default',
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  actor      TEXT NOT NULL,
  reason     TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, env, key)
);

CREATE INDEX IF NOT EXISTS overrides_by_key ON overrides (key);
CREATE INDEX IF NOT EXISTS overrides_by_env ON overrides (env);

-- KEP-006: append-only audit trail for operator writes.
CREATE TABLE IF NOT EXISTS audit_events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     TEXT NOT NULL,
  action TEXT NOT NULL,
  scope  TEXT NOT NULL,
  env    TEXT NOT NULL,
  key    TEXT NOT NULL,
  value  TEXT,
  prev   TEXT,
  actor  TEXT NOT NULL,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS audit_events_ts ON audit_events (ts DESC);
CREATE INDEX IF NOT EXISTS audit_events_key_ts ON audit_events (key, ts DESC);

-- KEP-009: role-gating for write endpoints.
CREATE TABLE IF NOT EXISTS roles (
  email TEXT PRIMARY KEY,
  role  TEXT NOT NULL
);

-- KEP-009: change-request workflow for approval-required flags.
CREATE TABLE IF NOT EXISTS change_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  env         TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  reason      TEXT,
  proposer    TEXT NOT NULL,
  approver    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL,
  decided_at  TEXT
);

CREATE INDEX IF NOT EXISTS change_requests_status ON change_requests (status);

-- KEP-010: scheduled flag changes, fired by a Cloudflare Cron Trigger.
CREATE TABLE IF NOT EXISTS scheduled_changes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  env         TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  fire_at     TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  fired_at    TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS scheduled_changes_pending ON scheduled_changes (status, fire_at)
  WHERE status = 'pending';

-- KEP-011: exposure event log for variant-attribution / lift analytics.
-- Production-scale deployments should consider sampling at write or
-- pushing to a downstream warehouse via Cloudflare Queues.
CREATE TABLE IF NOT EXISTS exposures (
  ts       TEXT NOT NULL,
  key      TEXT NOT NULL,
  variant  TEXT,
  value    TEXT NOT NULL,
  source   TEXT NOT NULL,
  user_id  TEXT,
  env      TEXT,
  project  TEXT
);

CREATE INDEX IF NOT EXISTS exposures_by_key_ts ON exposures (key, ts DESC);
