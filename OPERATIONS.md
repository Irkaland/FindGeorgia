# Operations

## Routine checks

- Render checks `/api/health/ready`; uptime monitoring should also check `/api/health/live` externally.
- Run `npm run check:production` after a secret rotation or dependency change. It checks PostgreSQL, append-only triggers, both R2 buckets, ClamAV, and production configuration.
- Review failed `background_jobs`, email failures, upload scanner failures, authentication spikes, `429` rates, and PostgreSQL pool errors.
- Confirm the worker and API use the same database, encryption key, signing key, R2 credentials, and email configuration.
- Confirm Turnstile responses match the configured production hostname and `public-intake` action; test password recovery and a fraud-review alert through the real Resend domain.

## Backup and recovery

Use paid Render PostgreSQL PITR as the primary recovery mechanism and take scheduled encrypted logical exports with `npm run backup:postgres`. Run `npm run restore:postgres-drill -- <snapshot>` only against a disposable database; the script rejects the live URL and requires an exact `RESTORE_CONFIRM` value. Record restore duration and verified row counts.

R2 provides replicated durable storage, but durability does not prevent deletion. Apply bucket locks to private retained content according to policy, a short lifecycle to `quarantine/`, least-privilege bucket tokens, and periodic inventory comparison against database keys.

## Incident priorities

1. Protect people: unpublish or minimize a case when safety or privacy is at risk.
2. Preserve evidence: retain logs, audit rows, request IDs, and deployment version.
3. Contain access: revoke sessions, rotate affected credentials, and disable compromised accounts.
4. Recover on a new database/object target, verify it, then switch service variables. Do not restore over the only live copy.
