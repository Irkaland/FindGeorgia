# Staging infrastructure checklist

Use fictional seed data only. Do not migrate or publish real missing-person, tip, contact, or attachment data in staging.

## Render

- One Blueprint connected to the GitHub `main` branch.
- Two-instance web service: recommended name `find-georgia-api-staging`.
- Background worker: `find-georgia-worker-staging`.
- Private ClamAV service: `find-georgia-clamav-staging`.
- PostgreSQL database: `find-georgia-db-staging`, with PgBouncer connection string supplied to both API and worker.
- API readiness path: `/api/health/ready`.
- Run `npm run db:migrate` as the pre-deploy command.
- Shared API/worker values must match exactly: `POSTGRES_URL`, `SIGNED_URL_SECRET`, `DATA_ENCRYPTION_KEY`, object-storage credentials/buckets, email settings, and monitoring DSN.

Required Render secret/environment variables:

```text
APP_ORIGIN
API_BASE_URL
PUBLIC_BASE_URL
CORS_ALLOWED_ORIGINS
POSTGRES_URL
SIGNED_URL_SECRET
DATA_ENCRYPTION_KEY
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_REGION
OBJECT_STORAGE_ACCESS_KEY_ID
OBJECT_STORAGE_SECRET_ACCESS_KEY
OBJECT_STORAGE_PUBLIC_BUCKET
OBJECT_STORAGE_PRIVATE_BUCKET
CLAMAV_HOST
CLAMAV_PORT
TURNSTILE_SECRET_KEY
TURNSTILE_HOSTNAME
TURNSTILE_ACTION
RESEND_API_KEY
EMAIL_FROM
ADMIN_NOTIFICATION_EMAIL
ERROR_MONITOR_DSN
ADMIN_BOOTSTRAP_TOKEN_HASH
```

Non-secret production-mode values are defined in `render.yaml`. Copy generated signing/encryption secrets from the API service to the worker; do not independently regenerate them.

## PostgreSQL

- PostgreSQL 17 staging database with PgBouncer.
- Private database access from API/worker; restrict public IP access.
- Automated backups/PITR appropriate for the selected plan.
- Run migrations, bootstrap one staging super-admin, and run the PostgreSQL contract tests before acceptance.
- Keep staging logically and operationally separate from production.

## Cloudflare R2

- Public bucket: `find-georgia-public-staging`.
- Private bucket: `find-georgia-private-staging`.
- Bucket-scoped S3 credentials with only required object operations.
- Private bucket has no public access.
- Short lifecycle for the private `quarantine/` prefix.
- Optional controlled public-media custom domain; do not use `r2.dev` for production.

## Turnstile

- Staging widget restricted to `staging.findgeorgia.ge` or the exact temporary frontend hostname.
- Configure `VITE_TURNSTILE_SITE_KEY` in the frontend build environment.
- Configure `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME`, and `TURNSTILE_ACTION=public-intake` on API and worker.
- Verify hostname/action rejection and successful public tip/privacy submissions over HTTPS.

## Resend

- Staging API key stored only in Render secrets.
- Verified sender/domain for `EMAIL_FROM`.
- Monitored staging recipient for `ADMIN_NOTIFICATION_EMAIL`.
- Test password recovery and a fraud-review staff alert without real personal data.

## Sentry

- Separate staging project and DSN.
- Configure `ERROR_MONITOR_DSN` and a staging environment/release identifier.
- Verify a controlled test error reaches the staging project without request bodies, credentials, tips, contact data, or default PII.

## DNS

Recommended future records, only after domain ownership and provider targets are available:

- `staging.findgeorgia.ge` → frontend host.
- `api-staging.findgeorgia.ge` → Render API custom domain.

Keep both on sibling HTTPS hostnames so strict same-site cookies work as designed. Do not create DNS records until certificate and rollback plans are ready.

## GitHub

- Protect `main`; require pull requests and successful `CI / verify` before merge.
- Enable secret scanning and push protection where available.
- Enable Dependabot alerts/updates and code scanning.
- Keep provider deployment secrets in provider secret managers. The current CI workflow requires no production provider secrets.

## Acceptance evidence

- GitHub Actions passes installation, SQLite/PostgreSQL tests, build, dependency audit, and container build.
- Staging configuration passes `npm run check:production`.
- Public/admin vertical smoke test passes on real HTTPS origins.
- R2 quarantine/scanner, signed private access, Turnstile, Resend, and Sentry live tests pass.
- PostgreSQL backup/restore drill is timed and verified.
- All evidence is recorded in `PRODUCTION_READINESS.md`; staging success must not be presented as production readiness.
