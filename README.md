# Find Georgia

Find Georgia is an admin-managed missing-person public information platform for Georgia. Authorized staff create and publish cases, public visitors can submit private tips and privacy requests, and sensitive data is never exposed through public DTOs.

## Architecture

- React frontend with a Node/Express API.
- PostgreSQL production adapter and Cloudflare R2-compatible storage.
- Admin-only case publishing and private public-tip submission.
- Append-only audit logging with MFA and role-based access control.

## Local Development

```bash
npm ci
npm run dev
```

Local development uses SQLite, filesystem storage, and fictional seed data. Use `docker compose up --build` for PostgreSQL and ClamAV when Docker is installed. Never run `db:seed` in production; production startup rejects demo seeding and development bot protection.

`npm run dev` builds the production bundle and serves it with the local API. Use `npm run dev:hot` only when Vite hot reloading is supported by the local environment, alongside `npm run dev:api`.

## Environment

Copy `.env.example` to a local ignored `.env` and replace only the values needed for the selected runtime. Never commit `.env` or production credentials. See [PRODUCTION_ENV.md](PRODUCTION_ENV.md).

## Testing

```bash
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

## Deployment

The production/staging scaffold targets OpenAI Sites, Render API/worker/PostgreSQL/ClamAV, Cloudflare R2, Turnstile, Resend, and Sentry. Follow [DEPLOYMENT.md](DEPLOYMENT.md); readiness evidence and unresolved provider gates are tracked in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) — staging, cutover, rollback, and service topology.
- [PRODUCTION_ENV.md](PRODUCTION_ENV.md) — exact environment variables and secret ownership.
- [POSTGRES_MIGRATION.md](POSTGRES_MIGRATION.md) — controlled export/import and verification.
- [STORAGE.md](STORAGE.md) — R2 buckets, quarantine, scanning, and private access.
- [OBSERVABILITY.md](OBSERVABILITY.md) — logs, health checks, alerts, and incident signals.
- [TESTING.md](TESTING.md) — executed and provider-dependent test matrices.
