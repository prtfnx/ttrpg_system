# Backup and restore

Audience: operators and maintainers protecting persisted game data.

Status: implemented for the current SQLite plus Cloudflare R2 deployment.
Provider-native tooling is required for non-SQLite databases.

Last source audit: 2026-07-14

## Backup-set contract

An application backup is one database snapshot and one R2 snapshot with the
same backup-set ID. Do not restore components from different sets.

`scripts/backup_database.py` uses SQLite's online backup API and creates:

- `database.sqlite3`;
- `manifest.json` with the application commit, migration ledger, byte count,
  SHA-256 checksum, SQLite `quick_check`, foreign-key result, and R2 snapshot ID.

`scripts/r2_storage_admin.py` copies durable `assets/` objects to the separate
bucket configured by `R2_BACKUP_BUCKET_NAME`. Its manifest records object sizes
and binds the snapshot to the exact database-manifest and database checksums.
Every copied object is checked before the R2 manifest is published.

Backups contain authentication and game data. Store the database backup root
outside the repository and disposable application filesystem, restrict access,
and use encrypted storage with independent retention. The R2 backup bucket must
not be the live asset bucket.

## Create and verify a backup set

Choose one unique ID. Production paths below are examples; use the mounted
database path and an externally persisted backup destination for the actual
deployment.

```bash
set_id="release-20260714T120000Z"
python scripts/backup_database.py backup \
  --database /var/data/ttrpg.db \
  --output-dir /secure-backups/ttrpg \
  --backup-set-id "$set_id"
python scripts/r2_storage_admin.py backup \
  --snapshot "$set_id" \
  --database-manifest "/secure-backups/ttrpg/$set_id/manifest.json"
python scripts/backup_database.py verify \
  --manifest "/secure-backups/ttrpg/$set_id/manifest.json"
```

The R2 command requires the normal R2 credentials plus
`R2_BACKUP_BUCKET_NAME`. It rejects a snapshot name that differs from the
database backup-set ID. Any zero-byte file, failed SQLite integrity check,
checksum mismatch, incomplete R2 copy, or component mismatch fails the command.

Run backups from scheduled infrastructure, capture command exit status and
manifest location, and alert on missed or failed runs. The migration runner's
local pre-migration copy is only a last line of defense; it is not a separate
failure domain.

## Restore rehearsal

Restore is dry-run by default. First copy the database set to an isolated host,
configure access to the backup R2 bucket, and verify both halves:

```bash
python scripts/backup_database.py restore \
  --manifest "/secure-backups/ttrpg/$set_id/manifest.json" \
  --database /rehearsal/ttrpg.db \
  --output-dir /secure-backups/rehearsal
python scripts/r2_storage_admin.py restore \
  --snapshot "$set_id" \
  --database-manifest "/secure-backups/ttrpg/$set_id/manifest.json"
```

Then use `--apply` only in an approved rehearsal or maintenance window. The R2
restore is additive and manifest-driven. Restore and verify R2 first so every
database asset reference will have an object, then atomically replace SQLite:

```bash
python scripts/r2_storage_admin.py restore \
  --snapshot "$set_id" \
  --database-manifest "/secure-backups/ttrpg/$set_id/manifest.json" \
  --apply
python scripts/backup_database.py restore \
  --manifest "/secure-backups/ttrpg/$set_id/manifest.json" \
  --database /var/data/ttrpg.db \
  --output-dir /secure-backups/pre-restore \
  --apply
```

The database tool verifies the source, creates a new verified backup of the
current target, restores into a temporary SQLite file, verifies it again, and
uses an atomic filesystem replacement. Stop the application or otherwise block
all writers before `--apply`; an open SQLite file can prevent replacement and
must never be restored underneath active writers.

## Post-restore acceptance

Before reopening traffic:

1. Run the numbered migration runner only if the selected release expects a
   schema newer than the restored ledger.
2. Confirm `/health/ready` is ready and reports the expected schema revision.
3. Run `r2_storage_admin.py audit` and require no database keys missing in R2.
4. Log in, open a known session and table, load a character, and verify public
   chat plus a whisper from the restored period.
5. Load at least one linked asset and perform a small R2 smoke round trip.
6. Record start/end time, chosen manifest, achieved recovery point and recovery
   time, validation evidence, and the approving operator.

Define accepted RPO, RTO, backup frequency, retention, and the restore-drill
owner outside the codebase. Exercise a clean-environment restore at least
quarterly and after material persistence changes; a successful backup command
without a successful restore rehearsal is not recovery evidence.
