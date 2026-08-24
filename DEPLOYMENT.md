# Deployment

## Selected topology

```text
Browser
  -> OpenAI Sites (React, CSP, HTTPS)
  -> https://api.findgeorgia.ge (Render, 2 Express instances)
       -> Render PostgreSQL + PgBouncer
       -> Cloudflare R2 public bucket
       -> Cloudflare R2 private bucket
       -> private Render ClamAV service
       -> Resend + Sentry + Cloudflare Turnstile
  -> Render background worker (same PostgreSQL and service credentials)
```

The frontend and API should use sibling HTTPS hostnames so `SameSite=Strict` cookies remain same-site. The frontend uses `credentials: include`; the API allows only the exact frontend origin and performs CSRF origin plus token checks. Sites remains a frontend host and is not used as an Express or raw PostgreSQL runtime.

## Provision staging

1. Put this directory in a private GitHub or GitLab repository and enable the included CI workflow.
2. Create two R2 buckets. Keep the private bucket fully private; expose the public bucket only through a production custom domain if direct public delivery is enabled. Create bucket-scoped credentials.
3. Create a Turnstile widget restricted to the frontend hostname, a verified Resend sender, and a Sentry project. Set `TURNSTILE_HOSTNAME` to the exact widget hostname; the client labels tokens with `public-intake` and the server enforces that action.
4. Sync `render.yaml`. Enter every `sync: false` value. Copy the generated API signing/encryption secrets to the worker exactly; do not generate different worker values.
5. Set `APP_ORIGIN`, `CORS_ALLOWED_ORIGINS`, and `PUBLIC_BASE_URL` to the Sites URL. Set `API_BASE_URL` to the Render API URL. Add `api.findgeorgia.ge` before production cutover.
6. Run the controlled data and media migration in [POSTGRES_MIGRATION.md](POSTGRES_MIGRATION.md).
7. Run `npm run check:production`, bootstrap the first administrator once, remove the plaintext bootstrap inputs, and retain only the token hash until the bootstrap policy is formally closed.
8. Build Sites with `VITE_API_BASE_URL` and `VITE_TURNSTILE_SITE_KEY`, deploy it, and set the Sites worker `API_ORIGIN` to the API origin for CSP.

## Cutover

1. Put the local application into a documented write freeze.
2. Export SQLite and record the SHA-256 shown by the command.
3. Import PostgreSQL, migrate referenced media, and require a clean verification report.
4. Smoke test public browse/search, admin MFA login, password-reset email/confirmation, draft creation, photo upload, preview, publish/unpublish, tip submission, moderation, fraud staff alert, Found/Closed/Archived, privacy requests, audit, and signed attachment access.
5. Switch frontend API configuration/DNS, monitor error rate and latency, then lift the write freeze.

## Rollback

Before the first new production write, rollback is DNS/config reversal to the frozen local system. After production writes begin, do not blindly revert to the old SQLite file. Freeze writes, export the new PostgreSQL delta, reconcile it, and either repair forward or restore PostgreSQL to a new instance and switch service variables. Media written after cutover must be inventoried by object key before any rollback.

No live deploy was performed in this workspace because there is no Git repository, provider authentication, production database, R2 account, DNS, or deploy CLI.
