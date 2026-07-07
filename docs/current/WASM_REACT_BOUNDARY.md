# WASM React boundary

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
- Add new Rust-facing behavior through `WasmRuntimePort`.
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
