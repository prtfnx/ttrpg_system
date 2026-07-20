# Add asset storage behavior

Audience: contributors changing image upload, download, cache, or token texture
flows.

Status: usable.

Last source audit: 2026-07-08

## Current shape

Asset storage is split across three boundaries:

- browser feature code in `apps/web-ui/src/features/assets/`;
- browser protocol and WASM sync in `apps/web-ui/src/lib/websocket/` and
  `apps/web-ui/src/lib/wasm/`;
- server protocol and storage service in
  `apps/server/service/protocol/assets.py` and
  `apps/server/service/asset_manager.py`.

The server uses Cloudflare R2 presigned URLs when R2 is configured. Upload
metadata is kept in memory as pending until the browser confirms the upload.
Only confirmed uploads are saved to the `assets` database table.

## Before you start

Read:

- [WebSocket messages](../reference/WEBSOCKET_MESSAGES.md)
- [Database schema](../reference/DATABASE_SCHEMA.md)
- [Environment variables](../reference/ENVIRONMENT_VARIABLES.md)
- [Add a WASM export](ADD_WASM_EXPORT.md), if the change touches generated
  asset bindings

## Server steps

1. Keep asset protocol handlers in `apps/server/service/protocol/assets.py`.
2. Keep validation, permission, R2, pending-upload, and database logic in
   `apps/server/service/asset_manager.py`.
3. Preserve the current upload sequence:
   `asset_upload_request` -> presigned PUT URL -> browser upload ->
   `asset_upload_confirm` -> database row.
4. Validate filename, content type, file size, session, and permission before
   creating a presigned URL.
5. Keep `asset_id` content-addressed when the browser provides xxHash data.
6. Store durable metadata in the `Asset` model only after successful upload
   confirmation.
7. Delete the R2 object before removing its metadata. The current handler keeps
   database rows when storage deletion fails so the operation can be retried.

Current validation limits in `ServerAssetManager`:

- max file size: 50 MB;
- extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`;
- MIME types: PNG, JPEG, GIF, BMP, WebP.

Current role defaults:

- DM or dungeon master: upload, download, share, moderate;
- player: upload and download;
- observer: download only;
- test or unknown sessions may be auto-granted player-like permissions.

## Browser steps

1. Put user-facing asset UI under `apps/web-ui/src/features/assets/`.
2. Use `WebClientProtocol` methods for protocol sends rather than raw socket
   calls from components.
3. Keep runtime asset coordination in `apps/web-ui/src/lib/wasm/`.
4. Use protocol events such as `asset-downloaded`, `asset-uploaded`, and
   `protocol-success` for cross-boundary notifications.
5. If WASM needs a new asset operation, update `WasmRuntimePort`,
   `WasmRuntime`, generated bindings, and runtime tests together.

## Known incomplete area

`handle_asset_list_request` currently returns an empty list with a message that
asset listing is not fully implemented. Do not document or build UI as if
server-side asset listing is complete until that handler is implemented.

## Tests

Useful focused checks:

```powershell
cd apps/server
python -m pytest tests\unit -q
```

```powershell
cd apps/web-ui
pnpm.cmd exec vitest run --project jsdom src/features/assets src/lib/wasm src/lib/websocket/__tests__/clientProtocol.test.ts
```

Add server tests for permission, validation, pending upload, confirm, and delete
behavior when changing the storage service.

## Checklist

- R2 configuration failure has a clear response.
- Upload confirmation is required before creating durable DB records.
- Permissions are enforced server-side.
- Hash, filename, MIME, and size checks still agree with the browser flow.
- Browser code handles both presigned URL success and upload failure.
- Tests cover at least one denied or failed path.
