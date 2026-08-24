# Backup and Restore

Status: encrypted local snapshot and tested restore mechanics are implemented. Off-site automation and disaster-recovery operations require production infrastructure.

## Snapshot format

`npm run backup` uses SQLite's online backup API, then encrypts the database and every private/public object independently with AES-256-GCM. The manifest records plaintext hashes/sizes and is authenticated with HMAC. The encryption key is not stored in the snapshot.

Set `BACKUP_ENCRYPTION_KEY` from a secret manager (minimum 32 characters). Keep it separate from application signing keys.

```powershell
$env:BACKUP_ENCRYPTION_KEY = '<secret-manager-value>'
npm run backup
```

Snapshots default to `var/backups/snapshot-<UTC timestamp>/`. Move completed snapshots to encrypted, access-controlled, versioned off-site storage. Local snapshots alone are not disaster recovery.

## Validate before restore

Stop application and job writers before an applied restore. Validation decrypts to a guarded temporary location, verifies the authenticated manifest and each file hash, then runs SQLite `PRAGMA integrity_check` without changing live data.

```powershell
$env:BACKUP_ENCRYPTION_KEY = '<secret-manager-value>'
npm run restore -- snapshot-2026-08-24T...
```

## Apply a restore

An applied restore requires both `--apply` and an exact confirmation value. Existing database and object directories are moved—not deleted—to a `pre-restore-*` recovery directory.

```powershell
$env:BACKUP_ENCRYPTION_KEY = '<secret-manager-value>'
$env:RESTORE_CONFIRM = 'snapshot-2026-08-24T...'
npm run restore -- snapshot-2026-08-24T... --apply
```

After restore, run the backend/security suite, compare required record counts, verify a private-file read and a minimized Found response, then bring writers back. Keep the pre-restore directory until owners approve disposal.

## Tested status

The automated suite creates an encrypted snapshot, proves the database ciphertext lacks the SQLite header, mutates live data, validates the snapshot, applies the restore, checks the recovered value and SQLite integrity, and preserves a rollback directory.

## Production plan and objectives

- Proposed initial RPO: 15 minutes; proposed RTO: 4 hours. These are planning targets, not current guarantees.
- Use PostgreSQL point-in-time recovery plus encrypted daily full backups; versioned object-storage replication must share a consistent retention/cutoff policy.
- Store at least one copy in a separate account/region, enforce immutability, and monitor backup age/failure.
- Perform scheduled restore drills into an isolated environment and record achieved RPO/RTO.
- KMS/HSM custody, rotation, deletion, legal holds, retention duration, and backup residency require security/legal approval.

Current Alpha RPO is the time since the last manual snapshot; current Alpha RTO is uncommitted.
