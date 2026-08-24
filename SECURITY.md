# Security Model

## Active controls

- Server-held roles and permissions; client role claims are ignored.
- MFA for `ADMIN`, `TIP_REVIEWER`, and `SUPER_ADMIN`.
- Random HttpOnly same-site sessions, rotation/revocation support, and CSRF checks on mutations.
- Same-origin enforcement, Helmet/CSP, HSTS in production, and restrictive browser permissions.
- Rate limits and bot checks for public tip/privacy intake.
- True file-type and size validation; public images are re-encoded with metadata removed.
- Private attachments use non-public storage and short-lived, session-bound signed downloads.
- Sensitive contact fields are encrypted at rest.
- Explicit public/admin DTOs; source URLs, source notes, admin notes, internal IDs, contacts, and tips are never public.
- Append-only database audit rows and case status history.
- Encrypted backup snapshots with integrity validation and recoverable restore layout.

## Operational work before public launch

Move from local SQLite/files to a resilient production database and managed object storage; add dedicated malware scanning, key management, monitoring/alerting, centralized logs, disaster-recovery exercises, staff provisioning/offboarding, privacy response procedures, and jurisdiction-specific legal review.

Never place real missing-person, reporter, source, or private attachment data in this Alpha.
# Production security note (2026-08-24)

Production startup now rejects SQLite, filesystem storage, development bot/scanner modes, reused signing/encryption keys, weak secrets, HTTP origins, demo seed helpers, and missing email/monitoring configuration. PostgreSQL audit triggers, database sessions/rate limits, exact-origin CORS/CSRF, ClamAV quarantine, R2 presigned private access, Sentry, and Turnstile are implemented but require live provider verification before launch. See `PRODUCTION_READINESS.md`.
