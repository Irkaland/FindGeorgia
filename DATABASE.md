# Database

Migrations are ordered in `server/migrations` and tracked in `schema_migrations`.

## Authoritative tables

- Identity/access: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`, `verification_tokens`.
- Cases: `missing_people`, `cases`, `case_status_history`.
- Public tips: `tips`, `tip_attachments`, `risk_signals`, `moderation_actions`.
- Privacy/operations: `privacy_requests`, `privacy_request_history`, `audit_events`, `background_jobs`, `notifications`, `rate_limit_events`.
- Migration ledger: `architecture_deprecations`.

`cases.admin_status` is authoritative and accepts only `DRAFT`, `PUBLISHED`, `UNPUBLISHED`, `FOUND`, `CLOSED`, or `ARCHIVED`. Source metadata and administrator notes live on the case but are emitted only by `AdminCaseDTO`.

## Non-destructive legacy migration

Migration `003_admin_managed_model.sql` adds the new lifecycle and source fields, maps old states, disables obsolete demo users, revokes their sessions, and records deprecated tables/columns. Legacy `family_relationships`, `case_updates`, `case_evidence`, `cases.state`, and `owner_user_id` remain only to preserve historical rows and foreign-key-safe rollback. No current route reads them for authorization or product behavior.

The Alpha uses WAL, foreign keys, transactional writes, and `PRAGMA integrity_check`. Backups must include the database and both media stores.
