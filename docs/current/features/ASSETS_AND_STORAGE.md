# Assets and storage

Audience: contributors changing asset upload, download, R2/local storage,
texture loading, or asset-backed table data.

Status: current but partial.

Last source audit: 2026-07-09

## Source owners

- `apps/server/service/protocol/assets.py`: asset upload, download, list,
  confirmation, delete, hash check, and table asset hash helpers.
- `apps/server/service/asset_manager.py`: presigned URL generation,
  permissions, rate limits, pending uploads, R2 metadata, and database writes.
- `apps/server/storage/`: storage backend and R2 manager.
- `apps/server/database/models.py`: `Asset` metadata.
- `apps/web-ui/src/features/assets/`: asset manager panels, background panel,
  asset cache, and integration service.
- `apps/web-ui/src/features/canvas/components/GameClient.tsx`: handles
  renderer asset download requests.
- `apps/web-ui/src/lib/websocket/clientProtocol.ts`: asset protocol senders,
  incoming handlers, and asset DOM events.
- `packages/rust-core/src/net/asset_manager.rs`: WASM-side asset cache,
  xxHash lookup, downloads, and stats.

## What the feature does

Assets are image files used by sprites, backgrounds, and renderer textures. The
server stores metadata in the database and stores file bytes in R2 when R2 is
configured. The browser asks the server for upload and download URLs over the
WebSocket protocol, then loads downloaded image data into the WASM texture
cache.

## Protocol messages

Current asset messages:

- `asset_upload_request`
- `asset_upload_response`
- `asset_upload_confirm`
- `asset_download_request`
- `asset_download_response`
- `asset_list_request`
- `asset_list_response`
- `asset_delete_request`
- `asset_delete_response`
- `asset_hash_check`
- `file_data`

`file_data` is not a supported direct file-transfer path. The server returns an
error that tells callers to use the asset upload flow.

## Upload flow

1. The browser sends `asset_upload_request` with filename, file size, content
   type, session code, client asset id, and xxHash.
2. `handle_asset_upload_request()` calls
   `request_upload_url_with_hash()`.
3. `ServerAssetManager` validates extension, MIME type, size, permissions, and
   rate limit.
4. The manager creates a pending upload entry in memory and returns a presigned
   PUT URL.
5. The browser uploads directly to that URL.
6. The browser sends `asset_upload_confirm`.
7. The server verifies the pending upload belongs to the same user, creates the
   `Asset` row, and moves metadata into the in-memory registry.

Database rows are created after successful upload confirmation, not when the
presigned URL is generated.

## Download and texture flow

1. The browser or WASM integration asks for an asset by id.
2. `handle_asset_download_request()` asks the asset manager for a presigned GET
   URL.
3. The response includes the download URL, asset id, expiry, and server xxHash
   when known.
4. `assetIntegrationService` fetches the image or decodes base64 data.
5. The image is loaded into the current render engine with `load_texture()`.

`GameClient` listens for `request-asset-download` and calls
`protocol.downloadAsset()` when the renderer needs a texture.

## Persistence and permissions

`Asset` stores asset name, R2 asset id, content type, size, xxHash, uploader,
session id, R2 key, bucket, and access timestamps.

Asset manager permissions are role-shaped but currently stored in memory:

- DM-like roles can upload, download, share, and moderate.
- Players can upload and download.
- Observers can download.

When permissions have not been set for a session, the manager grants player
permissions for test or unknown sessions. Established sessions without explicit
permissions fall back to read-only defaults.

Deletion is allowed for DMs or the asset owner. The server deletes the database
row first, then tries to delete the R2 object best-effort.

## Table integration

Table responses and table creation helpers can add asset hashes or R2 URLs to
entity data. `add_asset_hashes_to_table()` calculates xxHash for local static
assets when files exist and writes missing local asset metadata to the database.
`ensure_assets_in_r2()` adds a download URL when a matching asset row already
exists.

## Tests to run

- `apps/web-ui/src/features/assets/services/__tests__/assetCache.test.ts`
- `apps/web-ui/src/features/assets/services/__tests__/assetIntegration.service.test.ts`
- `apps/web-ui/src/features/assets/services/__tests__/performanceOptimizedBackground.service.test.ts`
- `apps/web-ui/src/features/assets/__tests__/AssetManagementPerformance.test.tsx`
- `apps/web-ui/src/lib/websocket/__tests__/clientProtocol.test.ts`
- asset-related server tests under `apps/server/tests/`
- `packages/rust-core/tests/wasm_browser.rs`
- `packages/rust-core/tests/wasm_node.rs`

Run browser tests for upload/download events and WASM texture loading. Run
server tests when changing permission, R2, database, or hash behavior.

## Known edges

- `asset_list_request` currently returns an empty list with a message that
  listing is not fully implemented.
- `assetIntegrationService` expects `presigned_url`, while the server upload
  response currently uses `upload_url`.
- Pending uploads are in memory. A process restart loses unconfirmed upload
  state.
