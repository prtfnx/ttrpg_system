# Rust/WASM engine

Audience: contributors changing the browser engine or its TypeScript boundary.

Status: usable.

Last source audit: 2026-09-22

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
- `packages/rust-core/src/net/` contains the table-data ingestion adapter. It
  does not own HTTP or WebSocket transport.
- `packages/rust-core/src/asset_hash.rs` contains the CPU-bound xxHash64 helper
  used to verify browser-fetched asset bytes.
- `packages/rust-core/src/lighting/` contains lighting and visibility logic.

## Main exported objects

The app currently depends on these generated WASM exports through
`WasmRuntime`:

- `init_game_renderer`
- `version`
- `RenderEngine`
- `ActionsClient`
- `calculate_asset_hash`
- `PlanningManager`
- `TableManager`
- `create_default_brush_presets`

React feature code should not import those generated exports directly.
`RenderEngine` embeds the Rust `TableSync` parser. `WasmRuntime` does not
create or expose a second standalone `TableSync` object.

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

Authoritative hydration restores the persisted table position and uniform
scale as camera state. Sprite coordinates and table bounds remain table-local;
the renderer does not apply the table transform to every sprite a second time.
Each active frame clears to a workspace color, draws the bounded table plane
using the table background color, and then draws map imagery, the grid, and
ordinary scene layers. This explicit plane is the fallback when map imagery is
absent or unavailable.

`RenderEngine.handle_table_data` parses and validates the complete DTO before
changing table sync, camera, or layer state. It rejects unknown layers,
non-finite geometry, invalid table dimensions, mismatched sprite containers,
duplicate/empty sprite IDs, invalid aura radii, and malformed polygon or line
geometry without replacing the resident scene. It also stages every `Sprite`
and derived aura light before clearing layers. The commit phase then uses only
prevalidated layer insertions, so a conversion failure cannot leave a
half-replaced table visible.

Synchronized lights enter through `add_light_for_table`; the legacy
active-table form remains for immediate local UI placement. Rendering filters
lights and obstacle sprites by the active table. The light/stencil pass uses a
camera-derived WebGL scissor rectangle so additive light is confined to the
bounded table plane, and cleanup restores scissor state even after an error.

## Renderer diagnostics

`RenderEngine.get_render_diagnostics()` returns counters owned by the current
renderer instance. `WasmRuntime.getRenderDiagnostics()` resolves the active
engine on every read, so diagnostics continue to follow the renderer after a
WebGL context restore instead of retaining a stale engine reference.

Each submitted frame reports sprite consideration/draw/cull counts, draw calls,
buffer uploads, active lights, shadow segment totals/candidates/accepted counts,
shadow draw calls, the occlusion revision and rebuild count, and resident
textures. The occlusion revision and rebuild count are lifetime values for the
current engine; the other operation counters describe the latest frame.

TypeScript measures CPU submission duration immediately around
`RenderEngine.render()`. This is main-thread submission time, not GPU execution
time. `performanceService` keeps the latest 600 frame durations, derives mean,
p50, p95, and maximum values, and reads renderer counters every 250 ms. Its
history is bounded to 1,200 snapshots. The Performance panel is a read-only
view of these measurements; it does not expose renderer cache or quality
controls.

Texture byte, budget, and over-budget fields are part of the boundary but
remain zero until `TextureManager` owns explicit byte accounting. Do not treat
those values as evidence that resident textures consume no memory.

`performance_fixtures.rs` provides deterministic ordinary, large, shadow
stress, culling stress, and long-segment scenes. Use those builders for
repeatable renderer tests instead of inventing benchmark-only scene shapes.

## WebGL pipeline lifetime

The general quad path and lighting path each own a pipeline object containing
their linked program, vertex array object, buffers, and validated uniform
locations. Attribute layouts are fixed in GLSL. Draw calls bind the owning VAO
and update only dynamic vertex bytes with `bufferSubData`; the quad index data
is uploaded once with `STATIC_DRAW` when the engine is created. A buffer grows
with `bufferData` only when the next upload exceeds its current capacity.

Pipeline construction deletes compiled shader objects after linking and cleans
up partial resources if initialization fails. Dropping the engine deletes each
pipeline's program, VAO, and buffers. Lighting unbinds its VAO before handing
control to paint or fog paths, so those independent renderers cannot mutate the
cached lighting attribute state.

For each active light, accepted shadow quads are converted to independent
triangles in a reusable CPU vector. Lighting uploads that complete triangle
list once and submits one stencil draw for the light; it does not issue one
upload and draw per obstacle segment. Shadow batches are never combined across
lights because each light owns a separate stencil-mask lifetime. The current
candidate selection still scans the complete occlusion segment list for every
light.

A restored WebGL context receives a new `RenderEngine` and therefore new
pipelines. Never carry a program, buffer, uniform location, or VAO across
context restoration.

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

For asset-backed sprites, `texture_id` is the canonical server `asset_id`.
Rust emits that same opaque value in `assetDownloadRequested`, and
`TextureManager` indexes the uploaded WebGL texture by it. Filesystem paths and
display filenames are compatibility input only. Procedural sentinel values
such as `__LIGHT__` and `__FOG_HIDE__` are not asset identities.

Rust also does not fetch asset URLs or retain downloaded byte vectors. The
TypeScript `WasmRuntime` owns browser fetch and a Blob/object-URL LRU cache,
passes a temporary typed-array view to `calculate_asset_hash`, and rejects a
server hash mismatch before the asset becomes renderable. Rust remains the
compute boundary; browser transport, cache eviction, and URL disposal remain
TypeScript responsibilities.

Combat-specific rule: Rust may preview an action, but it must not accept the
action. Final combat legality, resource spending, movement cost, cover/terrain
effects, and persistence are server responsibilities.

## Build targets

Native Rust tests cover pure logic. WASM builds cover browser-facing exports.

Use:

```powershell
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
cargo check --target wasm32-unknown-unknown --features wasm-start
wasm-pack test --node --test wasm_node --locked
pnpm.cmd run test:browser
pnpm.cmd run test:wasm
```

## Change guide

- Add pure logic in normal Rust modules first.
- Export only the methods the runtime needs.
- Add wasm-bindgen tests for exported behavior.
- Regenerate bindings after export changes.
- Add or update the `WasmRuntime` method that owns the generated export.
- Do not hand-edit generated `.js`, `.d.ts`, or `.wasm` files.

## External colors and texture lifetime

`render/mod.rs` parses hexadecimal colors using checked ASCII bytes. Invalid
or non-ASCII input returns the parser's safe fallback rather than slicing
through a UTF-8 character or panicking. Server acceptance alone is not proof
that a string is a valid render color.

`rendering/texture_manager.rs` owns pending image loads and both load/error
closures. Completion detaches DOM handlers; replacement and disposal cancel
pending loads and release the owned closures. Replaced and disposed WebGL
textures are explicitly deleted. Do not call `Closure::forget()` for a callback
whose lifetime is bound to a renderer. Unavailable WebGL2 is a recoverable
initialization error.

Native tests cover color parsing. `packages/rust-core/tests/wasm_browser.rs`
covers actual image success/failure, renderer disposal, unavailable WebGL2,
and malformed color behavior in a browser. Rebuild the tracked generated WASM
when changing this code; native tests alone do not exercise DOM/GL lifetimes.
