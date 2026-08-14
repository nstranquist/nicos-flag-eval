-- KEP-007 follow-up: make bounded audit replay efficient by environment and ID.
-- Migrations are append-only. Do not edit 0001_schema.sql after deployment.

CREATE INDEX IF NOT EXISTS audit_events_env_id
  ON audit_events (env, id);
