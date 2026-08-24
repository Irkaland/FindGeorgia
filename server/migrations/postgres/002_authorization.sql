INSERT INTO roles(id, name) VALUES
  ('ADMIN', 'ADMIN'), ('TIP_REVIEWER', 'TIP_REVIEWER'), ('SUPER_ADMIN', 'SUPER_ADMIN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO permissions(id, name) VALUES
  ('CASE_READ_ALL', 'CASE_READ_ALL'), ('CASE_ADMIN_CREATE', 'CASE_ADMIN_CREATE'),
  ('CASE_ADMIN_EDIT', 'CASE_ADMIN_EDIT'), ('CASE_ADMIN_PUBLISH', 'CASE_ADMIN_PUBLISH'),
  ('CASE_ADMIN_ARCHIVE', 'CASE_ADMIN_ARCHIVE'), ('SOURCE_EDIT', 'SOURCE_EDIT'),
  ('EVIDENCE_UPLOAD', 'EVIDENCE_UPLOAD'), ('TIP_READ', 'TIP_READ'),
  ('TIP_REVIEW', 'TIP_REVIEW'), ('AUDIT_READ', 'AUDIT_READ'),
  ('ADMIN_ACCOUNT_MANAGE', 'ADMIN_ACCOUNT_MANAGE'), ('SECURITY_ADMIN', 'SECURITY_ADMIN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT 'ADMIN', id FROM permissions WHERE id IN (
  'CASE_READ_ALL','CASE_ADMIN_CREATE','CASE_ADMIN_EDIT','CASE_ADMIN_PUBLISH','CASE_ADMIN_ARCHIVE',
  'SOURCE_EDIT','EVIDENCE_UPLOAD','TIP_READ','TIP_REVIEW','AUDIT_READ'
) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT 'TIP_REVIEWER', id FROM permissions WHERE id IN ('TIP_READ','TIP_REVIEW')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT 'SUPER_ADMIN', id FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO architecture_deprecations(object_name, deprecated_at, replacement, notes) VALUES
  ('family_relationships', now()::text, 'admin-created cases', 'Retained only for controlled historical migration; no application route uses it.'),
  ('case_updates', now()::text, 'direct admin case edits', 'Retained only for controlled historical migration; no new family updates are accepted.'),
  ('case_evidence', now()::text, 'internal source metadata and managed media', 'Legacy evidence is retained privately but no longer accepted by public routes.'),
  ('cases.state', now()::text, 'cases.admin_status', 'Legacy state is retained for historical compatibility.'),
  ('cases.owner_user_id', now()::text, 'admin audit actor', 'Legacy ownership is not an authorization boundary.')
ON CONFLICT (object_name) DO NOTHING;
