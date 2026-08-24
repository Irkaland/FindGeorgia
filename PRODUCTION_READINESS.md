# Production readiness

Status date: 2026-08-24. “Implemented” means code/config exists and local checks passed. It does not mean a live provider test passed.

| Area | Status | Evidence / missing proof |
|---|---|---|
| Existing UX and admin-only model | Implemented | No public account or family-ownership routes were restored. |
| SQLite compatibility | Verified locally | `npm test`: 19 passed, 0 failed, 1 PostgreSQL contract skipped. |
| Frontend production build | Verified locally | Vite/Sites build succeeds; local public and signed-in admin screens render with no browser console errors. |
| PostgreSQL schema and pool | Implemented, provider test pending | Migrations, adapter, PgBouncer config, and CI test exist; no local Docker/psql and no managed URL were available. |
| Controlled SQLite migration | Export verified locally; live import pending | Read-only export, transactional import, checksums, and orphan verification exist. |
| Concurrency/idempotency | Verified on SQLite; PostgreSQL CI pending | Concurrent publish produces one transition/audit; stale versions return 409; PG row locks and worker skip-locked claims are implemented. |
| Append-only audit | Verified on SQLite; PostgreSQL trigger pending | Both database triggers exist; managed PG execution not available locally. |
| Managed object storage | Implemented, live test pending | R2 S3 adapter, separate buckets, quarantine, signed private GET, and migration code exist; no R2 credentials. |
| Malware scanning | Implemented, live test pending | ClamAV INSTREAM fail-closed path and EICAR development guard exist; no ClamAV runtime/Docker locally. |
| Sessions/rate limits/jobs | Implemented | Shared DB sessions and rate limits; separate worker with safe job claims and retries. Multi-instance managed test pending. |
| Turnstile/Resend/Sentry | Implemented, live test pending | Turnstile verifies success, hostname, and action; Resend handles encrypted-queue password recovery and minimal staff alerts; Sentry captures errors without default PII. Provider credentials are absent. |
| Container/deployment blueprint | Implemented, not executed | Dockerfile, Compose, and `render.yaml` exist; Docker/Render CLI and Git repo absent. |
| Backups and restore | Procedure implemented, drill blocked | Managed PITR plan and logical dump/restore-drill scripts exist; `pg_dump`/`pg_restore` and managed DB absent. |
| HTTPS/DNS/CORS/cookies/CSP | Configured, live proof pending | Exact-origin CORS, secure strict cookies, CSRF, Helmet, and Sites CSP exist; no real hostnames/certificates. |
| CI/CD | Implemented, not executed | GitHub workflow runs SQLite, PostgreSQL 17, build, audit, and Docker build; directory is not a Git repository. |
| Real frontend/API URLs | Blocked | No provider authentication, Git remote, DNS, production secrets, or API URL. |
| Rollback/restore evidence | Blocked | Requires staging services and a timed restore drill. |

Local evidence captured on 2026-08-24: production build passed, `npm audit --omit=dev --audit-level=high` reported 0 vulnerabilities, `/api/health/live` returned `ok`, `/api/health/ready` returned `ready`, and the current SQLite export contains 28 tables / 168 rows with document SHA-256 `f4baed9c74f75423c77fc572c246f0ddf672b809e2fedb660d18bbbafa2b819b`.

## Launch gate

Do not call this deployment production-ready until every “pending” or “blocked” row has dated evidence, the real HTTPS smoke test passes, a restore drill has been timed and verified, alert destinations have fired test events, and a human security/privacy review accepts the configuration.
