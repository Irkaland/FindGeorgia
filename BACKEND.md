# Backend

The Express application uses one asynchronous database contract across both adapters. SQLite remains the local compatibility adapter; production selects `DATABASE_PROVIDER=postgres`, creates a bounded `pg.Pool`, and applies ordered PostgreSQL migrations at startup or via `npm run db:migrate`.

Request authentication, sessions, CSRF tokens, roles, rate-limit events, job leases, moderation actions, and audit events all live in the shared database. No authorization state depends on a process-local singleton. Two API instances can therefore serve the same session and enforce the same rate limit.

Important mutation semantics:

- Case edits use a `version` predicate and return `409 STALE_WRITE` for stale clients.
- State transitions lock the case row in PostgreSQL. Repeating the already-completed target transition is an idempotent replay and does not create duplicate history or audit records.
- Counter allocation is atomic with `UPDATE ... RETURNING` in PostgreSQL.
- PostgreSQL workers claim jobs with `FOR UPDATE SKIP LOCKED`; SQLite serializes transactions through a per-database mutex.
- Job and notification idempotency keys have unique database constraints and retry with bounded exponential backoff.
- Password-reset jobs contain only the user ID and an AES-GCM-encrypted single-use token; the worker decrypts it only when sending through Resend. Fraud-routed tips enqueue a minimal staff alert without tip or case details.

The API exposes `/api/health/live` for process liveness and `/api/health/ready` for database-backed readiness. All responses carry request IDs; structured request completion logs include status and latency but omit bodies, credentials, tips, and contact data.
