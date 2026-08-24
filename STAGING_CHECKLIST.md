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

Non-secret production-mode values are defined in `render.yaml`. Generate signing/encryption values in a secure secret manager and enter the same respective values for API and worker; do not independently regenerate them per service.

### Manual Render provisioning when this workspace is unauthenticated

1. Sign in to the Render Dashboard using an account authorized for the staging workspace.
2. Select **New > Blueprint**, connect `Irkaland/FindGeorgia`, choose branch `main`, and keep the default Blueprint path `render.yaml`.
3. Name the Blueprint `find-georgia-staging`. Before deploying, confirm the preview contains exactly the four staging resources named above, in the Frankfurt region, and review the paid plan charges.
4. Enter every `sync: false` value from a password manager or provider secret store. Do not paste secrets into GitHub issues, commits, chat, or deployment notes.
5. Create two independent random values of at least 32 characters for `SIGNED_URL_SECRET` and `DATA_ENCRYPTION_KEY`. Copy each value from the API service to the worker so the two services match; the two keys must not match each other.
6. Set `API_ORIGIN` on the worker to the final Render API origin. Use exact HTTPS origins for `APP_ORIGIN`, `API_BASE_URL`, `PUBLIC_BASE_URL`, and `CORS_ALLOWED_ORIGINS`.
7. Deploy only after the R2, Turnstile, Resend, and Sentry staging values are available. A production-mode deploy is expected to fail closed when required provider settings are missing.
8. Record the deployed commit SHA and provider-generated URLs, run `npm run check:production`, and then execute every acceptance test below. Do not mark an item tested from configuration alone.

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

Manual Dashboard sequence:

1. Sign in to Cloudflare, select **Storage & databases > R2 > Overview**, and activate R2 if the account has not used it before.
2. Create `find-georgia-public-staging` and `find-georgia-private-staging`; leave public development URL access disabled for the private bucket.
3. Open **Manage R2 API Tokens**, create an Object Read & Write token limited to these two buckets, and copy its access-key ID and secret exactly once into the Render secret store.
4. Set `OBJECT_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `OBJECT_STORAGE_REGION=auto`, and the two exact bucket names. Do not record the token values in this checklist.
5. Add an organization-approved short lifecycle rule for the private `quarantine/` prefix only after confirming it cannot remove evidence awaiting review.

Equivalent authenticated Wrangler bucket creation is `npx wrangler r2 bucket create find-georgia-public-staging` followed by `npx wrangler r2 bucket create find-georgia-private-staging`. Authenticate interactively with `npx wrangler login`; never put an API token directly in shell history.

## Turnstile

- Staging widget restricted to `staging.findgeorgia.ge` or the exact temporary frontend hostname.
- Configure `VITE_TURNSTILE_SITE_KEY` in the frontend build environment.
- Configure `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME`, and `TURNSTILE_ACTION=public-intake` on API and worker.
- Verify hostname/action rejection and successful public tip/privacy submissions over HTTPS.

Manual sequence: in Cloudflare select **Turnstile > Add widget**, use a staging-only name, allow only the exact provider frontend hostname, then store the public site key in the frontend build environment and the secret key in Render. Keep `TURNSTILE_ACTION=public-intake`; server-side Siteverify, hostname, action, expiry, and replay checks remain mandatory.

## Resend

- Staging API key stored only in Render secrets.
- Verified sender/domain for `EMAIL_FROM`.
- Monitored staging recipient for `ADMIN_NOTIFICATION_EMAIL`.
- Test password recovery and a fraud-review staff alert without real personal data.

Manual sequence: create a staging-restricted API key, verify the chosen sender domain or use Resend's supported testing sender only for provider-approved test recipients, and place the key only in Render. Use fictional email content for delivery/failure tests.

## Sentry

- Separate staging project and DSN.
- Configure `ERROR_MONITOR_DSN` and a staging environment/release identifier.
- Verify a controlled test error reaches the staging project without request bodies, credentials, tips, contact data, or default PII.

Manual sequence: create a separate Node/Express staging project, copy only its DSN to `ERROR_MONITOR_DSN`, label events with the staging environment and deployed release, then trigger one synthetic error containing no personal data. Inspect the received event before accepting scrubbing.

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

## Authentication result on 2026-08-24

The Render, Cloudflare, Resend, and Sentry dashboards all presented sign-in pages, and no corresponding authenticated CLI or provider environment credentials were available. Consequently, no provider resource, secret, admin, DNS record, email, backup, or live test was created or run. GitHub remained the only authenticated external system. This is a provider-execution blocker, not evidence of application failure.
