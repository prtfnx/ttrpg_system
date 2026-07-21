# Assets and storage

Audience: contributors changing asset upload, authorization, R2, or recovery.

Status: current. Image upload and storage integrity are implemented. Independent
production backup remains an operations blocker.

Last source audit: 2026-07-21

## Ownership

- `service/protocol/assets.py` owns the WebSocket asset contract.
- `service/asset_manager.py` owns authorization, intents, validation, and
  metadata transactions.
- `storage/r2.py` owns Cloudflare R2 operations.
- `database/models.py` defines `Asset`, `SessionAsset`, and
  `AssetUploadIntent`.
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
2. The server validates role, rate, type, size, hash, and session context, then
   persists an upload intent.
3. The browser uploads to a signed
   `pending/{session}/{asset}.{ext}` R2 key.
4. Confirmation reloads the object, verifies metadata and bytes, recomputes the
   hash, and decodes the image.
5. Verified bytes move to `assets/{asset}.{ext}`.
6. `assets` stores object metadata. `session_assets` stores session
   visibility and display names.
7. List, lookup, download, table enrichment, and deletion resolve through an
   authorized session link. Ambiguous filenames fail closed.

Upload intents are durable; a process restart does not turn an unconfirmed
object into a usable asset. The removed local metadata fallback and legacy
`assets.session_id` column are not active paths.

## Permissions

Membership is checked for every operation. Role policy governs uploads and
moderation. Reads require a link to the active session. Delete checks session
visibility and owner/DM authority. Object keys and presigned URLs are not
written to normal logs.

## Operations

Readiness validates required production R2 configuration and live dependency
operations. The admin script applies CORS/lifecycle rules, runs a create/read/
delete smoke check, and audits database keys against the whole dedicated bucket.
Normal output is count-only; verbose output can reveal object keys.

Relational metadata is now PostgreSQL. The retired SQLite/R2 snapshot workflow
must not be used as production recovery evidence. Follow
[Backup and restore](../operations/BACKUP_AND_RESTORE.md).

## Verification

Run asset-storage unit tests, R2 administration tests, browser asset tests, and
the release smoke flow documented in
[Release checklist](../operations/RELEASE_CHECKLIST.md).
