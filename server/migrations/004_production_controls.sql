ALTER TABLE background_jobs ADD COLUMN locked_by TEXT;

CREATE TABLE IF NOT EXISTS idempotency_requests (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_sessions_active_expiry ON sessions(expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_expiry ON verification_tokens(expires_at, consumed_at);
