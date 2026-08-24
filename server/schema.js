export const MIGRATED_TABLES = [
  "roles", "permissions", "role_permissions", "users", "user_roles", "sessions", "verification_tokens",
  "missing_people", "cases", "family_relationships", "case_evidence", "case_updates", "tips", "tip_attachments",
  "case_reports", "privacy_requests", "privacy_request_history", "moderation_actions", "risk_signals", "audit_events",
  "sensitive_access_logs", "notifications", "background_jobs", "consents", "counters", "rate_limit_events",
  "case_status_history", "architecture_deprecations", "idempotency_requests",
];

export function canonicalRows(rows, columns) {
  return rows.map((row) => columns.map((column) => {
    const value = row[column];
    if (value === null || value === undefined) return null;
    if (Buffer.isBuffer(value)) return `base64:${value.toString("base64")}`;
    return String(value);
  }));
}

export function assertIdentifier(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return value;
}
