# Production environment

All secrets belong in Render/OpenAI Sites/provider secret managers, never source control. API and worker values marked “shared” must be identical.

| Variable | API | Worker | Frontend build | Purpose |
|---|---:|---:|---:|---|
| `NODE_ENV=production` | yes | yes | no | Enables fail-closed guardrails. |
| `PROCESS_ROLE` | `api` | `worker` | no | Runtime role. |
| `POSTGRES_URL` | yes | yes | no | PgBouncer connection string. |
| `DATABASE_PROVIDER=postgres` | yes | yes | no | Disables SQLite production use. |
| `SIGNED_URL_SECRET` | shared | shared | no | Local signed-link fallback only. |
| `DATA_ENCRYPTION_KEY` | shared | shared | no | AES-GCM sensitive field encryption; separate from signing. |
| `OBJECT_STORAGE_*` | yes | yes | no | R2 endpoint, credentials, region, and distinct bucket names. |
| `CLAMAV_HOST/PORT` | yes | yes | no | Private scanner service. |
| `TURNSTILE_SECRET_KEY` | yes | yes (config parity) | no | Server-side Siteverify secret. |
| `TURNSTILE_HOSTNAME`, `TURNSTILE_ACTION` | yes | yes (config parity) | no | Exact validated hostname and `public-intake` action. |
| `VITE_TURNSTILE_SITE_KEY` | no | no | yes | Public widget site key. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL` | yes | yes | no | Password recovery plus minimal staff/security notifications. |
| `ERROR_MONITOR_DSN` | yes | yes | no | Sentry release/error reporting. |
| `APP_ORIGIN`, `CORS_ALLOWED_ORIGINS` | yes | yes (config parity) | no | Exact Sites HTTPS origin. |
| `API_BASE_URL` | yes | yes (config parity) | no | Canonical API HTTPS origin. |
| `VITE_API_BASE_URL` | no | no | yes | Frontend API target. |
| `ADMIN_BOOTSTRAP_TOKEN_HASH` | yes | yes (config parity) | no | One-time bootstrap authorization hash. |

Production rejects SQLite, filesystem storage, development bot checks, a missing Turnstile hostname, development scanner mode, missing email/monitoring configuration, weak or reused encryption keys, HTTP origins, demo seeding, and development helpers.

Rotate R2, Resend, Turnstile, and monitoring credentials independently. Rotating `DATA_ENCRYPTION_KEY` requires an explicit re-encryption migration; replacing it without that migration makes existing encrypted contact and MFA values unreadable. Rotate session access by revoking database sessions. Treat signed URLs as bearer tokens and keep their TTL short.
