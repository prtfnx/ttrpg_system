# WASM React boundary

Audience: contributors changing React-to-Rust integration.

Status: usable.

Last source audit: 2026-09-21

React does not own Rust objects directly. It talks to `WasmRuntime`, and
`WasmRuntime` owns the generated wasm-bindgen module.

## Boundary map

```text
React UI, hooks, stores, protocol
        |
        | WasmRuntimePort
        v
apps/web-ui/src/lib/wasm/runtime
        |
        | generated wasm-bindgen bindings
        v
apps/web-ui/src/lib/wasm/generated/ttrpg_rust_core.*
        |
        | Rust exports
        v
packages/rust-core
```

## Runtime ownership

- `WasmRuntimeProvider` creates one runtime for the React tree.
- The provider starts runtime-owned protocol subscriptions after commit, before
  a canvas is required.
- `WasmRuntime` initializes the WASM module.
- `WasmRuntime` creates and frees Rust-owned objects such as `RenderEngine`.
- Runtime hooks expose app-facing access:
  - `useWasmRuntime`
  - `useRenderEngine`
  - `useActionsEngine`
  - `useWasmStatus`
- `WasmRuntimePort` is the app-facing interface.

## Generated bindings

Generated files are implementation detail:

- `apps/web-ui/src/lib/wasm/generated/ttrpg_rust_core.js`
- `apps/web-ui/src/lib/wasm/generated/ttrpg_rust_core.d.ts`
- `apps/web-ui/src/lib/wasm/generated/ttrpg_rust_core_bg.wasm`

Feature code should not import those files directly. If feature code needs a
WASM type, expose a runtime-owned type from
`apps/web-ui/src/lib/wasm/runtime/types.ts`.

## Canvas lifecycle

1. React mounts `WasmRuntimeProvider`.
2. The provider calls `runtime.start()`, which installs the table protocol
   subscriptions without requiring a renderer.
3. The canvas passes its `HTMLCanvasElement` to `runtime.attachCanvas`.
4. The runtime initializes the WASM module once and creates or reuses the Rust
   `RenderEngine`.
5. The runtime registers Rust callbacks and flushes any table snapshot that
   arrived before the renderer attached.
6. On canvas detach, renderer-specific subscriptions are cleared and the latest
   table snapshot is retained for a later attachment.
7. If the browser loses the WebGL context, the runtime prevents the default
   terminal loss, stops the animation loop, releases the invalid engine, and
   retains the authoritative snapshot. On `webglcontextrestored`, it creates a
   fresh engine, restores user/layer callbacks, replays the retained snapshot,
   and resumes rendering. `isContextLost` distinguishes this recoverable state
   from a detached canvas; readiness is withheld until a restored frame renders.
8. On provider disposal, all subscriptions, callbacks, DOM listeners, and Rust objects are
   released.

## Data flow

User input:

```text
canvas/UI -> WasmRuntimePort -> Rust RenderEngine
```

Rust operation:

```text
Rust -> runtime operation callback -> WebClientProtocol
```

Rust event:

```text
Rust -> runtime event callback -> TypeScript bridge -> current app listener
```

Server table update:

```text
WebClientProtocol -> protocol event -> TableSyncService
                  -> normalizeTableSnapshot -> store + Rust renderer
```

`TableSyncService` is the only application entry point for complete table
snapshots. `WasmRuntimePort` deliberately has no direct `handleTableData`
method, so a caller cannot bypass table-ID validation and normalization.
The runtime also has no standalone `getTableSync()` mirror. The service hydrates
the renderer and then replaces the browser mirrors from the same normalized
snapshot; no follow-up hook replaces store sprites from a disconnected Rust
object. Rust validates the complete renderer DTO before mutating resident
table state.

Authorized asset download:

```text
WebClientProtocol -> TypeScript fetch -> BrowserAssetCache
                  -> WasmRuntime.calculateAssetHash -> Rust xxHash64
                  -> verified Blob URL -> Rust texture upload
```

The runtime owns the browser cache and revokes object URLs on eviction, clear,
or disposal. Browser downloads have a configurable deadline, and a timed-out
request settles readiness instead of waiting forever. On table hydration, the
coordinator unloads superseded GPU textures while retaining IDs shared with
the new table. Rust receives bytes only for hashing and does not retain or
return downloaded payloads.

Table and sprite synchronization must include a non-empty authoritative
`table_id`. The TypeScript boundary rejects incomplete payloads and attaches
the received table ID to every normalized layer, flat sprite, and background
sprite before calling Rust. It does not infer a renderer table from a fallback
name.

When a persisted entity contains both a legacy `texture_path` and an enriched
`asset_id`, normalization uses `asset_id` as the renderer texture key. That key
must remain unchanged through the download request, verified browser cache,
and Rust texture upload. Procedural sentinel textures retain their sentinel
value and bypass the asset identity rule.

The runtime publishes `hydratedTableId` after the normalized snapshot reaches
the renderer. It publishes `frameTableId` only after the table's deduplicated
texture set has settled and that table has rendered a subsequent frame.
Preview capture must wait for both IDs to match the requested table. Only an
upload lifecycle observed by this browser keeps a failed texture request
pending. Server responses expose machine-readable `error_code` and
`requires_upload` fields, but human-readable instructions never control
readiness. A terminal or remotely missing texture settles the request without
pretending that the texture loaded.

Complete snapshots replace prior table-derived state. Before rehydration,
`TableSyncService` removes the lights and token auras it derived from the prior
snapshot and clears fog. Rust replaces ordinary render layers, while walls,
paint strokes, layer settings, grid/units, and browser mirrors are replaced
from the same authoritative snapshot. Empty arrays are replacement values, not
“no update” signals.

Upload URL issuance and browser PUT completion are intermediate states.
`AssetSyncService` retries waiting textures only after the server reports
`status: uploaded`; a failed confirmation clears pending state without a
download loop.

Combat preview:

```text
Combat UI -> planningService -> WasmRuntimePort -> PlanningManager
```

The preview result is display help only. Combat movement, attacks, spells,
cover, terrain, resources, and turns are accepted by the server through
`combat_command`.

## Rules

- Do not add app behavior that reads `window.gameAPI`,
  `window.shapeSettings`, `window.ttrpg_rust_core`, or
  `window.wasmInitialized`.
- Do not import generated bindings from feature code.
- Do not dispatch app-level browser events from Rust.
- Do not add WebSocket ownership or protocol serialization to Rust. Browser
  transport belongs to `WebClientProtocol`.
- Do not call `fetch`, retain presigned URLs, or manage browser download queues
  in Rust. Pass bytes through a runtime method only for measured compute work.
- Add new Rust-facing behavior through `WasmRuntimePort`.
- Use the runtime-owned synchronization services for server snapshots; do not
  add a second direct snapshot-to-renderer entry point.
- Prefer Rust for measured compute-heavy engine work. Keep UI workflows,
  transport lifecycle, and application state in TypeScript.
- Keep runtime tests at the port/callback boundary, not at React component
  implementation details.
- Keep combat-facing WASM behavior preview-only. Do not add a Rust export that
  commits combat state or spends combat resources.

## Add new WASM behavior

1. Add the Rust method, event, or operation.
2. Add a Rust or wasm-bindgen boundary test.
3. Regenerate bindings.
4. Add a runtime method or callback mapping.
5. Add a runtime contract test.
6. Call the runtime from React, store, or protocol code.
