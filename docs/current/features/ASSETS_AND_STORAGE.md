# Assets and storage

Audience: contributors changing asset upload, authorization, R2, or recovery.

Status: partial. Image upload and storage integrity are implemented. The web
client still has duplicate download-response consumers, and independent
production backup remains an operations blocker.

Last source audit: 2026-08-19

## Ownership

- `service/protocol/assets.py` owns the WebSocket asset contract.
- `service/asset_manager.py` owns authorization, intents, validation, and
  metadata transactions.
- `service/asset_rate_limiter.py` owns shared per-user upload/download token
  buckets and fail-closed limiter-store behavior.
- `service/asset_deletion_service.py` owns transactional unlinking and the
  retryable deletion outbox.
- `storage/r2_manager.py` owns Cloudflare R2 operations.
- `database/models.py` defines asset/link/intent/outbox records, durable rate
  buckets, and the singleton plan-wide quota lock.
- `scripts/r2_storage_admin.py` owns CORS/lifecycle setup, smoke tests, and
  database-to-bucket audits.

## Supported content

Release uploads accept PNG, JPEG, GIF, BMP, and WebP only. The browser performs
an early check, but the server is authoritative. Confirmation verifies signed
metadata, byte size, xxHash, and Pillow decoding so an extension or content type
cannot disguise another payload.

## Upload flow

1. An authenticated session member requests an upload for a bounded image and
   hash-derived asset id.
2. The server takes user ID, username, role, and session only from the
   authenticated WebSocket connection, then validates type, size, hash, and
   durable session membership before persisting an upload intent. Caller-sent
   identity or session fields are ignored.
3. One PostgreSQL transaction reserves user and global bytes plus a pending
   session/actor link slot. It serializes plan-wide reservations, the user
   quota, and the session link decision before returning a URL.
4. The browser uploads through a 15-minute signed PUT URL to a
   `pending/{session}/{asset}.{ext}` R2 key.
5. A separate 30-minute durable intent leaves confirmation grace after the PUT
   credential expires. Confirmation locks the intent, reloads the object,
   verifies metadata and bytes, recomputes the hash, and decodes the image.
6. Verified bytes move to `assets/{asset}.{ext}`.
7. The final session row lock rechecks link capacity. A race that fills the
   quota removes a newly promoted object instead of leaving it untracked.
8. `assets` stores object metadata. `session_assets` stores session
   visibility and display names.
9. List, lookup, download, table enrichment, and deletion resolve through an
   authorized session link. Ambiguous filenames fail closed.

The intended download owner is the browser cache path: TypeScript receives the
authorized presigned URL and expected xxHash, fetches with credentials omitted,
and passes the bytes through `WasmRuntime` for Rust xxHash64 computation. A
mismatch fails closed before a texture is loaded. Verified payloads become
browser-managed Blobs with stable object URLs; the runtime cache revokes those
URLs on LRU/age eviction, clear, or runtime disposal. Rust does not own URLs,
HTTP requests, retries, download queues, or a byte cache.

Current gap: `AssetSyncService` and `AssetIntegrationService` both subscribe to
`asset-downloaded`. The former loads the signed URL directly through `Image`;
the latter performs the verified cache fetch and then loads the Blob URL. When
both runtime services are active, one response can therefore create two R2 GET
operations and the direct path bypasses hash verification. Consolidate this
into the verified browser-cache path before treating download-operation counts
as exact.

The browser cache defaults to 64 MiB and may be configured by the asset UI. Its
size accounts for retained Blob payloads. Repeated metadata/hash-cache access
does not clone full byte vectors across the WASM boundary; bytes cross that
boundary only for the compute-heavy hash operation.

Upload abuse controls are keyed by the authenticated user, not by caller-sent
fields. PostgreSQL-backed token buckets enforce upload burst/hour and download
hour limits across workers and restarts; store failure denies URL issuance.
Database caps cover unconfirmed intents, confirmed object count, per-user
bytes, and 9,000,000,000 plan-wide confirmed-plus-pending bytes. Each session
allows 1,000 links, of which one actor may reserve at most 250. Duplicate links
are idempotent and do not consume new-object or link quota twice.

The plan-wide byte cap protects application-tracked objects in a dedicated R2
Standard bucket. It cannot see unrelated bucket objects or prevent replay of a
presigned bearer URL before expiry. Download URLs expire after five minutes;
upload URLs expire after 15 minutes. Keep Cloudflare billing
notifications and the whole-bucket orphan audit enabled; application limits
are not a provider-side billing hard stop. See
[Environment variables](../reference/ENVIRONMENT_VARIABLES.md) for tuning.

The R2 client and current SQLAlchemy driver are synchronous. Public asset
manager methods therefore run their complete database/storage transaction in a
worker thread and expose one awaited boundary to protocol handlers. Keep each
SQLAlchemy session wholly inside that worker; never pass a live ORM session
back to the event loop.

## Delete flow

Deletion is an eventual, recoverable two-stage operation:

1. The authenticated user requests removal from the active session.
2. One database transaction locks the asset, rechecks session membership and
   owner/DM/uploader authority, removes that session link, and writes
   `asset_deletion_jobs` when it was the final link.
3. The WebSocket response reports the link removed and whether object deletion
   was queued. It does not make success depend on an R2 call.
4. A bounded background worker calls R2 outside the database transaction. On
   success it transactionally removes the outbox row and asset metadata. On
   failure it records exponential retry state; after ten attempts it records a
   durable permanent-failure state for operator action.

R2 deletion is retried idempotently. A crash after the object call but before
the final database commit safely repeats the call. Asset rows remain while a
job is pending, but zero session links make them unavailable for list/download.
Duplicate linking locks the asset and rejects an object with a pending delete,
preventing a new link from racing object removal. Assets with any remaining
session link are never queued.

Upload intents are durable; a process restart does not turn an unconfirmed
object into a usable asset. The removed local metadata fallback and legacy
`assets.session_id` column are not active paths.

The retired `file_request` and `file_data` WebSocket messages are not upload
paths. They had no production caller, and the former chunk handler acknowledged
bytes without storing or validating them. Keep asset bytes on the bounded,
authorized, content-verified presigned upload flow above.

## Permissions

Membership is checked for every operation. Role policy governs uploads and
moderation. Reads require a link to the active session. Delete checks session
visibility and owner/DM/uploader authority. Object keys and presigned URLs are
not written to normal logs.

## Operations

Readiness validates required production R2 configuration and live dependency
operations. The admin script applies CORS/lifecycle rules, runs a create/read/
delete smoke check, and audits database keys against the whole dedicated bucket.
Normal output is count-only; verbose output can reveal object keys.

Relational metadata is now PostgreSQL. The retired SQLite/R2 snapshot workflow
must not be used as production recovery evidence. Follow
[Backup and restore](../operations/BACKUP_AND_RESTORE.md).

## Verification

Run asset-storage unit tests, Alembic/model-schema tests, R2 administration
tests, TypeScript Blob-cache and Rust hash tests, browser asset tests, and the
release smoke flow documented in
[Release checklist](../operations/RELEASE_CHECKLIST.md).
