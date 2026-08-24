CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  phone_verified_at TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret_encrypted TEXT,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id),
  assigned_at TEXT NOT NULL,
  assigned_by TEXT REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  mfa_verified_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent_hash TEXT,
  ip_prefix TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active_token ON sessions(token_hash) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS missing_people (
  id TEXT PRIMARY KEY,
  name_ka TEXT NOT NULL,
  name_en TEXT NOT NULL,
  age INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  public_case_id TEXT NOT NULL UNIQUE,
  missing_person_id TEXT NOT NULL REFERENCES missing_people(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('DRAFT','SUBMITTED','CONTACT_VERIFIED','EVIDENCE_REVIEW','NEEDS_MORE_INFORMATION','REVIEWED_FOR_PUBLICATION','PUBLISHED','DISPUTED','SUSPENDED','FOUND','CLOSED')),
  admin_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (admin_status IN ('DRAFT','PUBLISHED','UNPUBLISHED','FOUND','CLOSED','ARCHIVED')),
  sex TEXT,
  date_of_birth TEXT,
  missing_time TEXT,
  location_ka TEXT NOT NULL,
  location_en TEXT NOT NULL,
  broad_location_ka TEXT NOT NULL,
  broad_location_en TEXT NOT NULL,
  region_ka TEXT,
  region_en TEXT,
  municipality_ka TEXT,
  municipality_en TEXT,
  missing_date_ka TEXT NOT NULL,
  missing_date_en TEXT NOT NULL,
  story_ka TEXT NOT NULL,
  story_en TEXT NOT NULL,
  public_image_url TEXT,
  public_image_storage_key TEXT,
  contact_verified_at TEXT,
  last_verified_at TEXT NOT NULL,
  last_verified_ka TEXT NOT NULL,
  last_verified_en TEXT NOT NULL,
  published_at TEXT,
  disputed_at TEXT,
  suspended_at TEXT,
  found_at TEXT,
  closed_at TEXT,
  unpublished_at TEXT,
  archived_at TEXT,
  privacy_review_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  indexing_policy TEXT NOT NULL DEFAULT 'NOINDEX',
  moderation_notes TEXT,
  source_type TEXT,
  source_url TEXT,
  source_note TEXT,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  admin_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_cases_admin_status_updated ON cases(admin_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_public_filters ON cases(admin_status, region_en, municipality_en);
CREATE INDEX IF NOT EXISTS idx_cases_public_search ON cases(public_case_id, admin_status);
CREATE TABLE IF NOT EXISTS family_relationships (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  authority_confirmed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(case_id, user_id)
);
CREATE TABLE IF NOT EXISTS case_evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  detected_mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  scan_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  removed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON case_evidence(case_id);
CREATE TABLE IF NOT EXISTS case_updates (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  submitted_by TEXT NOT NULL REFERENCES users(id),
  location_ka TEXT,
  location_en TEXT,
  story_ka TEXT,
  story_en TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS tips (
  id TEXT PRIMARY KEY,
  reference_code TEXT NOT NULL UNIQUE,
  case_id TEXT NOT NULL REFERENCES cases(id),
  tip_type TEXT NOT NULL,
  first_hand INTEGER NOT NULL,
  occurred_at TEXT,
  unknown_time INTEGER NOT NULL DEFAULT 0,
  location_text TEXT NOT NULL,
  municipality TEXT,
  confidence TEXT NOT NULL,
  description TEXT NOT NULL,
  reporter_contact_encrypted TEXT,
  information_quality TEXT NOT NULL,
  moderation_status TEXT NOT NULL,
  fraud_status TEXT NOT NULL,
  submitted_ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tips_case ON tips(case_id);
CREATE INDEX IF NOT EXISTS idx_tips_status_created ON tips(moderation_status, created_at DESC);
CREATE TABLE IF NOT EXISTS tip_attachments (
  id TEXT PRIMARY KEY,
  tip_id TEXT NOT NULL REFERENCES tips(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  detected_mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  scan_status TEXT NOT NULL CHECK (scan_status IN ('PENDING','CLEAN','INFECTED','SCAN_FAILED')),
  created_at TEXT NOT NULL,
  removed_at TEXT
);
CREATE TABLE IF NOT EXISTS case_reports (
  id TEXT PRIMARY KEY,
  public_report_id TEXT NOT NULL UNIQUE,
  case_id TEXT NOT NULL REFERENCES cases(id),
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  reporter_contact_encrypted TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON case_reports(status, priority);
CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  public_request_id TEXT NOT NULL UNIQUE,
  requester_user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  description TEXT NOT NULL,
  contact_encrypted TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_request_history (
  id TEXT PRIMARY KEY,
  privacy_request_id TEXT NOT NULL REFERENCES privacy_requests(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_role TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS risk_signals (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_risk_resource ON risk_signals(resource_type, resource_id);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  reason TEXT,
  session_id TEXT,
  request_id TEXT,
  ip_prefix TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_type, resource_id, created_at DESC);
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$;
DROP TRIGGER IF EXISTS prevent_audit_update ON audit_events;
CREATE TRIGGER prevent_audit_update BEFORE UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
DROP TRIGGER IF EXISTS prevent_audit_delete ON audit_events;
CREATE TRIGGER prevent_audit_delete BEFORE DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TABLE IF NOT EXISTS sensitive_access_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  case_id TEXT REFERENCES cases(id),
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_minimal TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT
);
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  run_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  idempotency_key TEXT NOT NULL UNIQUE,
  locked_at TEXT,
  locked_by TEXT,
  completed_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_ready ON background_jobs(status, run_at);
CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  case_id TEXT REFERENCES cases(id),
  consent_type TEXT NOT NULL,
  granted INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value BIGINT NOT NULL
);
INSERT INTO counters(name, value) VALUES ('public_case', 150), ('public_tip', 108), ('public_report', 201), ('public_privacy', 301)
ON CONFLICT (name) DO NOTHING;
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id TEXT PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  occurred_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket ON rate_limit_events(bucket_key, occurred_at);
CREATE TABLE IF NOT EXISTS case_status_history (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_status_history_case ON case_status_history(case_id, created_at);
CREATE TABLE IF NOT EXISTS architecture_deprecations (
  object_name TEXT PRIMARY KEY,
  deprecated_at TEXT NOT NULL,
  replacement TEXT,
  notes TEXT NOT NULL
);
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
