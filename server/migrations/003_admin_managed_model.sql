ALTER TABLE cases ADD COLUMN admin_status TEXT NOT NULL DEFAULT 'DRAFT'
  CHECK (admin_status IN ('DRAFT','PUBLISHED','UNPUBLISHED','FOUND','CLOSED','ARCHIVED'));
ALTER TABLE cases ADD COLUMN sex TEXT;
ALTER TABLE cases ADD COLUMN date_of_birth TEXT;
ALTER TABLE cases ADD COLUMN missing_time TEXT;
ALTER TABLE cases ADD COLUMN region_ka TEXT;
ALTER TABLE cases ADD COLUMN region_en TEXT;
ALTER TABLE cases ADD COLUMN municipality_ka TEXT;
ALTER TABLE cases ADD COLUMN municipality_en TEXT;
ALTER TABLE cases ADD COLUMN source_type TEXT;
ALTER TABLE cases ADD COLUMN source_url TEXT;
ALTER TABLE cases ADD COLUMN source_note TEXT;
ALTER TABLE cases ADD COLUMN verified_by TEXT REFERENCES users(id);
ALTER TABLE cases ADD COLUMN verified_at TEXT;
ALTER TABLE cases ADD COLUMN admin_notes TEXT;
ALTER TABLE cases ADD COLUMN unpublished_at TEXT;
ALTER TABLE cases ADD COLUMN archived_at TEXT;

UPDATE cases SET
  admin_status = CASE state
    WHEN 'PUBLISHED' THEN 'PUBLISHED'
    WHEN 'FOUND' THEN 'FOUND'
    WHEN 'CLOSED' THEN 'CLOSED'
    WHEN 'SUSPENDED' THEN 'UNPUBLISHED'
    WHEN 'DISPUTED' THEN 'UNPUBLISHED'
    ELSE 'DRAFT'
  END,
  region_ka = broad_location_ka,
  region_en = broad_location_en,
  municipality_ka = location_ka,
  municipality_en = location_en,
  source_type = 'OTHER_REVIEWED_SOURCE',
  source_note = 'Migrated from the family-submission Alpha. Re-review before any new publication.',
  verified_at = COALESCE(published_at, last_verified_at);

UPDATE cases SET
  story_ka = 'ნინო ბოლოს ქუთაისში ნახეს. ნებისმიერი შესაძლო ინფორმაცია მხოლოდ პლატფორმის დაცული არხით უნდა გაიგზავნოს.',
  story_en = 'Nino was last seen in Kutaisi. Any possible information should be shared only through the platform''s protected channel.'
WHERE public_case_id = 'GEO-00124';
UPDATE cases SET
  story_ka = 'გიორგი ბოლოს თელავის მუნიციპალიტეტში ნახეს. გვერდზე ნაჩვენებია მხოლოდ Find Georgia-ს მიერ გამოსაქვეყნებლად განხილული ინფორმაცია.',
  story_en = 'Giorgi was last seen in Telavi municipality. Only information reviewed for publication by Find Georgia appears on this page.'
WHERE public_case_id = 'GEO-00131';

CREATE INDEX IF NOT EXISTS idx_cases_admin_status_updated ON cases(admin_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_cases_public_filters ON cases(admin_status, region_en, municipality_en);

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
INSERT OR IGNORE INTO architecture_deprecations(object_name, deprecated_at, replacement, notes) VALUES
  ('family_relationships', datetime('now'), 'admin-created cases', 'Retained read-only for migration history; no application route uses it.'),
  ('case_updates', datetime('now'), 'direct admin case edits', 'Retained for migration history; no new family updates are accepted.'),
  ('case_evidence', datetime('now'), 'internal source metadata and public media', 'Legacy authority evidence is retained privately but no longer accepted.'),
  ('cases.state', datetime('now'), 'cases.admin_status', 'Legacy state retained for compatibility with historical rows and foreign-key-safe migration.'),
  ('cases.owner_user_id', datetime('now'), 'admin audit actor', 'Legacy ownership column is no longer an authorization boundary.');

-- Install the complete simplified role set before assigning permissions. This
-- migration must also succeed on a clean database, before the seed runs.
INSERT OR IGNORE INTO roles(id, name) VALUES
  ('ADMIN', 'ADMIN'),
  ('TIP_REVIEWER', 'TIP_REVIEWER'),
  ('SUPER_ADMIN', 'SUPER_ADMIN');
INSERT OR IGNORE INTO permissions(id, name) VALUES
  ('CASE_ADMIN_CREATE', 'CASE_ADMIN_CREATE'),
  ('CASE_ADMIN_EDIT', 'CASE_ADMIN_EDIT'),
  ('CASE_ADMIN_PUBLISH', 'CASE_ADMIN_PUBLISH'),
  ('CASE_ADMIN_ARCHIVE', 'CASE_ADMIN_ARCHIVE'),
  ('SOURCE_EDIT', 'SOURCE_EDIT'),
  ('ADMIN_ACCOUNT_MANAGE', 'ADMIN_ACCOUNT_MANAGE');

INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT 'ADMIN', id FROM permissions WHERE id IN (
  'CASE_READ_ALL','CASE_ADMIN_CREATE','CASE_ADMIN_EDIT','CASE_ADMIN_PUBLISH','CASE_ADMIN_ARCHIVE',
  'SOURCE_EDIT','EVIDENCE_UPLOAD','TIP_READ','TIP_REVIEW','AUDIT_READ'
);
INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT 'SUPER_ADMIN', id FROM permissions;

DELETE FROM user_roles WHERE user_id = '10000000-0000-4000-8000-000000000004';
INSERT OR IGNORE INTO user_roles(user_id, role_id, assigned_at)
SELECT id, 'ADMIN', datetime('now') FROM users WHERE id = '10000000-0000-4000-8000-000000000004';
UPDATE cases SET owner_user_id = '10000000-0000-4000-8000-000000000004', verified_by = '10000000-0000-4000-8000-000000000004'
WHERE EXISTS (SELECT 1 FROM users WHERE id = '10000000-0000-4000-8000-000000000004');

UPDATE users SET disabled_at = COALESCE(disabled_at, datetime('now')), updated_at = datetime('now')
WHERE id IN (
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000008'
);
UPDATE sessions SET revoked_at = COALESCE(revoked_at, datetime('now'))
WHERE user_id IN (
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000008'
);

UPDATE tips SET moderation_status = CASE moderation_status
  WHEN 'NEW' THEN 'NEW'
  WHEN 'HIGH_INFORMATION_QUALITY' THEN 'IMPORTANT'
  WHEN 'FORWARDED' THEN 'FORWARDED'
  WHEN 'ESCALATED' THEN 'FORWARDED'
  WHEN 'FRAUD_SUSPECTED' THEN 'FRAUD_SUSPECTED'
  WHEN 'ABUSE_SPAM' THEN 'SPAM'
  WHEN 'DUPLICATE' THEN 'SPAM'
  WHEN 'LOW_INFORMATION' THEN 'SPAM'
  ELSE 'REVIEWED'
END;
