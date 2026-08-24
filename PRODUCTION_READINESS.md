# Production readiness

Status date: 2026-08-24. `TESTED` means the evidence named in that row actually ran in the stated environment. Local or CI evidence is not presented as a managed-provider test.

| Area | Status | Evidence / date / test | Blocker |
|---|---|---|---|
| Existing UX and admin-only model | IMPLEMENTED | 2026-08-24: route/config review confirms no public account or family-ownership flow was restored. | Live staging regression test remains pending. |
| SQLite compatibility | TESTED | 2026-08-24: `npm test` completed with 19 passed, 0 failed, and 1 provider-only PostgreSQL test skipped locally. | None for local compatibility. |
| Frontend production build | TESTED | 2026-08-24: `npm run build` completed successfully with Vite 6.4.3 and prepared the Sites artifact. | A real staging API URL is required before publishing the frontend. |
| PostgreSQL schema, pool, locking, and audit trigger | TESTED | 2026-08-24: GitHub `CI / verify` passed against PostgreSQL 17, including the PostgreSQL contract, row-locking/shared-state behavior, and append-only audit trigger. | Managed Render PostgreSQL connectivity, version, migration, and PgBouncer evidence are BLOCKED by Render authentication. |
| Controlled SQLite import | PARTIAL | 2026-08-24: the read-only export baseline remains 28 tables / 168 rows with SHA-256 `f4baed9c74f75423c77fc572c246f0ddf672b809e2fedb660d18bbbafa2b819b`; export and verification tooling exist. | No managed target database; the 28-table / 168-row target comparison was not run. |
| Multi-instance concurrency and idempotency | PARTIAL | 2026-08-24: SQLite concurrency tests and the PostgreSQL CI contract pass. | No two-instance Render service exists, so shared sessions, rate limits, revocation, and simultaneous publish were not live-tested. |
| Append-only audit enforcement | PARTIAL | 2026-08-24: SQLite trigger tests and PostgreSQL CI trigger tests reject audit mutation. | No ordinary-role `UPDATE`/`DELETE` attempt was run on managed staging PostgreSQL. |
| Managed object storage | IMPLEMENTED | 2026-08-24: R2 S3 adapter, separate bucket configuration, quarantine, and signed private GET paths are present. | R2 authentication absent; buckets and live public/private/presigned tests are BLOCKED. |
| Malware scanning | IMPLEMENTED | 2026-08-24: ClamAV INSTREAM fail-closed path and EICAR test guard exist. | No private ClamAV service; clean/EICAR/unavailable-scanner live tests are BLOCKED. |
| Sessions, MFA, rate limits, and worker | IMPLEMENTED | 2026-08-24: database-backed sessions/rate limits, MFA, safe job claims, and retries are covered by local/CI tests. | Real MFA enrollment, distributed behavior, worker restart, notification, and cleanup jobs are BLOCKED by provider deployment. |
| Turnstile | IMPLEMENTED | 2026-08-24: server code validates Siteverify success, exact hostname, and action. | Cloudflare authentication absent; no staging widget or live valid/invalid/replay test. |
| Resend | IMPLEMENTED | 2026-08-24: provider adapter and minimal password-recovery/staff-notification payload paths exist. | Resend authentication/sender absent; delivery and failure handling are not live-tested. |
| Sentry | IMPLEMENTED | 2026-08-24: monitoring adapter disables default PII and avoids request-body capture. | Sentry authentication/DSN absent; no controlled staging event was received or inspected. |
| Container and Render Blueprint | IMPLEMENTED | 2026-08-24: Docker build passed in GitHub CI; `render.yaml` now defines staging-only API, worker, ClamAV, and PostgreSQL names. | Render dashboard is unauthenticated; no Blueprint or URL exists. |
| Backups and restore | PARTIAL | 2026-08-24: logical dump, authenticated manifest, integrity check, and restore-drill scripts exist. | Managed PostgreSQL and provider backup access absent; no backup identifier or timed clean restore exists. |
| HTTPS, DNS, CORS, cookies, and headers | IMPLEMENTED | 2026-08-24: exact-origin CORS, secure strict cookies, CSRF, Helmet, CSP, and Sites configuration exist. | No real staging origins/certificates, so HTTPS/header/browser evidence is BLOCKED. |
| CI/CD | TESTED | 2026-08-24: GitHub Actions run `32717825023` passed install, SQLite/PostgreSQL tests, build, audit, and container build from `main`. | Provider deploy integration is not configured. |
| Dependency vulnerability audit | TESTED | 2026-08-24: `npm audit --omit=dev --audit-level=high` reported 0 vulnerabilities. | Continuous provider/repository alert handling remains an operational responsibility. |
| Real staging URLs and end-to-end lifecycle | BLOCKED | 2026-08-24: Render, Cloudflare, Resend, and Sentry dashboards showed sign-in; no provider CLI credentials were available. | Authorized provider sessions/credentials and approved paid-plan provisioning are required. |
| Legal/privacy operating decisions | LEGAL DECISION REQUIRED | 2026-08-24: code and runbooks minimize public/internal DTOs and isolate private tips. | Counsel/data-controller approval is still required for retention/deletion, lawful basis, family verification, safeguarding/escalation, breach response, vendor DPAs/transfers, and publication/minimization policy. |

Local verification on 2026-08-24 also confirmed `npm ci`, the production build, all runnable tests, and a high-severity production dependency audit. No live provider test is inferred from those checks.

## Launch gate

Do not call this deployment production-ready until every `PARTIAL` or `BLOCKED` row has dated provider evidence, the real HTTPS smoke test and responsive bilingual QA pass, a restore drill is timed and verified, alert destinations receive test events, and a human security/privacy review accepts the configuration.
