# PostgreSQL migration

## Controlled path

1. Back up the SQLite database and local media without changing the source.
2. Run `npm run db:export-sqlite -- var/migration/cutover.json`. The exporter opens SQLite read-only, runs `PRAGMA integrity_check`, exports tables in dependency order, and records per-table counts and SHA-256 checksums plus a document checksum.
3. Point `POSTGRES_URL` at a fresh PostgreSQL database and run `npm run db:import-postgres -- var/migration/cutover.json`. The importer refuses a target that already contains users and imports inside one transaction.
4. Configure R2 and run `npm run db:migrate-media -- var/migration/cutover.json`. Every referenced object is re-scanned, quarantined, promoted to the correct bucket, and stored under its existing key.
5. Run `npm run db:verify-migration -- var/migration/cutover.json`. It rechecks every table count and canonical row checksum and verifies core foreign-key relationships.
6. Independently compare database storage keys to bucket inventories and test random object reads. Record missing/orphan keys before cutover.

The PostgreSQL baseline includes the simplified roles and permissions, exact admin case states, indexes, durable sessions/jobs/rate limits, optimistic versions, idempotency records, and append-only audit triggers. SQLite-only syntax is isolated to SQLite migrations and backup code; application queries use the shared adapter.

## Audit continuity

Audit IDs, actors, roles, resources, request/session metadata, reasons, and timestamps import as immutable rows. The PostgreSQL append-only triggers are installed before import and allow inserts but reject updates/deletes. Verification must compare audit count and checksum with the export.

## Rollback checkpoint

Keep the source SQLite database and media snapshot immutable through acceptance. If verification fails, discard the target PostgreSQL database and R2 migration objects, fix the migration in staging, and repeat. Do not edit the source to make target checks pass.
