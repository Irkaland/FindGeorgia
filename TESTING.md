# Testing

## Local evidence

`npm test` exercises SQLite migration, admin-only enrollment rules, MFA and RBAC, encrypted password-recovery job creation, private drafts, publication prerequisites, explicit public DTOs, public/private image authorization, case editing, Found/Closed/Archived minimization, private tips, moderation, CSRF, append-only audit, restart persistence, encrypted SQLite restore, concurrent publication serialization, stale-write rejection, and Sites worker behavior. The latest local run passed 19 tests, failed 0, and skipped the provider-dependent PostgreSQL contract.

`npm run build` builds the production frontend and Sites package. `tests/postgres-production.test.mjs` is deliberately skipped locally unless `RUN_POSTGRES_TESTS=true`; CI enables it against PostgreSQL 17 and checks migrations, shared sessions across two app instances, concurrent row locking, and PostgreSQL audit triggers.

## Required before launch

- Execute the CI PostgreSQL job in a real Git repository.
- Run the complete SQLite export, PostgreSQL import, media migration, checksum verification, and object inventory comparison against a staging copy.
- Run two API instances plus one worker; test login persistence, simultaneous publish/edit/moderation, job single-claim behavior, restart behavior, and pool exhaustion.
- Upload benign files, EICAR, MIME mismatches, oversized files, and a scanner-unavailable case. EICAR must be rejected and scanner failure must return a controlled fail-closed error.
- Test Turnstile, Resend, Sentry, CORS, CSRF, secure cookies, CSP, signed private URLs, and unauthorized download attempts on real HTTPS origins.
- Perform and time a PostgreSQL PITR or logical restore into a new database, verify counts/checksums, and document the switchback.

Provider-dependent checks are not represented as passed until their command output or monitoring evidence is captured in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
