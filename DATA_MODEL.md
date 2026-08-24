# Data model

PostgreSQL preserves the active SQLite semantics and imports legacy tables for history and foreign-key continuity. Authoritative active tables are:

- Identity: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions`, `verification_tokens`.
- Cases: `missing_people`, `cases`, `case_status_history`.
- Public intake/private review: `tips`, `tip_attachments`, `case_reports`, `privacy_requests`, `privacy_request_history`.
- Safety and accountability: `risk_signals`, `moderation_actions`, `audit_events`, `sensitive_access_logs`.
- Operations: `background_jobs`, `notifications`, `rate_limit_events`, `counters`, `idempotency_requests`.

`family_relationships`, `case_updates`, and `case_evidence` remain importable historical structures but are not authorization boundaries and have no public write routes. `architecture_deprecations` records that distinction.

Indexes cover active sessions, public case filtering, admin case ordering, tip moderation queues, job readiness, rate-limit windows, and audit resource history. Email uniqueness is case-insensitive through `lower(email)`. PostgreSQL triggers reject every update or delete on `audit_events`; application roles only append.

Times are retained as normalized ISO-8601 text during the controlled migration so values and checksums remain exact across SQLite and PostgreSQL. New application writes use UTC ISO timestamps.
