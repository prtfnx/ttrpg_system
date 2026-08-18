# WASM React boundary

Audience: contributors changing React-to-Rust integration.

Status: usable.

Last source audit: 2026-08-17

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
apps/web-ui/src/lib/wasm/ttrpg_rust_core.*
        |
        | Rust exports
        v
packages/rust-core
```

## Runtime ownership

- `WasmRuntimeProvider` creates one runtime for the React tree.
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

- `apps/web-ui/src/lib/wasm/ttrpg_rust_core.js`
- `apps/web-ui/src/lib/wasm/ttrpg_rust_core.d.ts`
- `apps/web-ui/src/lib/wasm/ttrpg_rust_core_bg.wasm`

Feature code should not import those files directly. If feature code needs a
WASM type, expose a runtime-owned type from
`apps/web-ui/src/lib/wasm/runtime/types.ts`.

## Canvas lifecycle

1. React mounts `WasmRuntimeProvider`.
2. The runtime initializes the WASM module once.
3. The canvas passes its `HTMLCanvasElement` to `runtime.attachCanvas`.
4. The runtime creates or reuses the Rust `RenderEngine`.
5. The runtime registers Rust callbacks for operations and events.
6. On detach or dispose, the runtime clears callbacks and frees Rust objects.

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

Server update:

```text
WebClientProtocol -> store/runtime method -> Rust renderer
```

Authorized asset download:

```text
WebClientProtocol -> TypeScript fetch -> BrowserAssetCache
                  -> WasmRuntime.calculateAssetHash -> Rust xxHash64
                  -> verified Blob URL -> Rust texture upload
```

The runtime owns the browser cache and revokes object URLs on eviction, clear,
or disposal. Rust receives bytes only for hashing and does not retain or return
downloaded payloads.

Table and sprite synchronization must include a non-empty authoritative
`table_id`. The TypeScript boundary rejects incomplete payloads and attaches
the received table ID to every normalized layer, flat sprite, and background
sprite before calling Rust. It does not infer a renderer table from a fallback
name.

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
