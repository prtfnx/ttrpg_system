# Rust/WASM engine

Audience: contributors changing the browser engine or its TypeScript boundary.

Status: usable.

Last source audit: 2026-08-03

The Rust crate is the local engine behind the browser canvas. It should stay
focused on compute-heavy rendering, geometry, visibility, collision, planning,
and explicit WASM exports. TypeScript owns browser transport and application
orchestration.

## Crate shape

- `packages/rust-core/src/lib.rs` controls module visibility and wasm-bindgen
  exports.
- `packages/rust-core/src/render/` contains the WASM-facing `RenderEngine`.
- `packages/rust-core/src/rendering/` contains lower-level WebGL rendering
  pieces.
- `packages/rust-core/src/event_system/` handles canvas input events.
- `packages/rust-core/src/systems/` contains paint, planning, and collision
  systems.
- `packages/rust-core/src/actions/` contains undoable table and sprite action
  helpers.
- `packages/rust-core/src/net/` contains the asset hashing/cache helper and the
  table-data ingestion adapter. It does not own a WebSocket connection.
- `packages/rust-core/src/lighting/` contains lighting and visibility logic.

## Main exported objects

The app currently depends on these generated WASM exports through
`WasmRuntime`:

- `init_game_renderer`
- `version`
- `RenderEngine`
- `ActionsClient`
- `AssetManager`
- `PlanningManager`
- `TableManager`
- `TableSync`
- `create_default_brush_presets`

React feature code should not import those generated exports directly.

`PlanningManager` is used by combat UI as a preview helper. It can compute
ghost movement, movement range overlays, local distance estimates, line of
sight previews, and AoE candidate targets. It is not a combat authority.

## RenderEngine

`RenderEngine` owns the canvas engine state:

- WebGL renderer, text renderer, textures, layers, and grid.
- Camera, view matrix, and canvas size.
- Input and event systems.
- Lighting and fog systems.
- Actions, paint, table sync, table manager, and wall manager.
- User context, active layer, and shape defaults.
- Runtime callbacks for operations and events.

The engine is created by `init_game_renderer(canvas)`. TypeScript creates it
inside `WasmRuntime.attachCanvas`.

A new engine has no active table and can render an empty frame safely. The
first normalized server table payload creates and activates the matching Rust
table. Sprite, light, fog, shape, and input operations are ignored until that
active table exists; Rust never substitutes an invented table ID.

## Runtime callbacks

Rust should not call app-level browser globals. It reports app intent through
callbacks owned by `WasmRuntime`:

- Runtime operations are commands that may become protocol messages.
- Runtime events are app events that TypeScript currently bridges to existing
  listeners.

This keeps Rust from knowing about React, Zustand, or WebSocket objects.

`WebClientProtocol` is the only WebSocket owner. Rust exports do not connect,
authenticate, reconnect, or send protocol messages. `TableSync` accepts data
that TypeScript already received and normalized; it does not request data.

Combat-specific rule: Rust may preview an action, but it must not accept the
action. Final combat legality, resource spending, movement cost, cover/terrain
effects, and persistence are server responsibilities.

## Build targets

Native Rust tests cover pure logic. WASM builds cover browser-facing exports.

Use:

```powershell
cargo test
cargo check --target wasm32-unknown-unknown --features wasm-start
wasm-pack test --node
wasm-pack test --headless --chrome
```

## Change guide

- Add pure logic in normal Rust modules first.
- Export only the methods the runtime needs.
- Add wasm-bindgen tests for exported behavior.
- Regenerate bindings after export changes.
- Add or update the `WasmRuntime` method that owns the generated export.
- Do not hand-edit generated `.js`, `.d.ts`, or `.wasm` files.
