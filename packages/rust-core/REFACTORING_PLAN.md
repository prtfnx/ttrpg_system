# Rust WASM Codebase — Tests-First Refactoring Plan

> **Principle**: "First add tests, then do your changes." — Michael Feathers  
> **Approach**: Characterization tests to capture current behavior, then safe refactoring.  
> **Rule**: No dead code removal or restructuring until test safety net is in place.

---

## Cross-Reference Analysis Summary

### Methodology

Every method in the WASM API surface was cross-referenced against 285 production
TypeScript/TSX files in `apps/web-ui/src/` (excluding tests, mocks, and `wasm.d.ts`).
Internal Rust usage was verified separately via `Select-String` across all `.rs` files.

### WASM Classes in wasm.d.ts (typed, 7 classes)

| Class | Methods Typed | Used from React | Unused from React |
|-------|--------------|-----------------|-------------------|
| **RenderEngine** | 180 | **126** | **54** |
| **PaintSystem** | 31 | **31** (100%) | 0 |
| **AssetManager** | 21 | **21** (100%) | 0 |
| **PlanningManager** | 19 | **19** (100%) | 0 |
| **TableManager** | 18 | **18** (100%) | 0 |
| **CollisionSystem** | 9 | **9** (100%) | 0 |
| **BrushPreset** | 3 | **3** (100%) | 0 |

### WASM Classes NOT in wasm.d.ts (accessed via `any` type)

| Class | React Hook | Methods Called | Notes |
|-------|-----------|---------------|-------|
| **NetworkClient** | `useNetworkClient.ts` | 21 methods | Instantiated via `m.NetworkClient`, typed as `any` |
| **TableSync** | `useTableSync.ts` | 11 methods | Instantiated via WASM module, typed as `any` |
| **ActionsClient** | — | 0 direct calls | All functionality proxied through RenderEngine |

**NetworkClient methods called (21):**
`set_message_handler`, `set_connection_handler`, `set_error_handler`, `get_client_id`,
`connect`, `disconnect`, `free`, `authenticate`, `set_user_info`, `join_session`,
`request_table_list`, `request_player_list`, `send_sprite_update`, `send_sprite_create`,
`send_sprite_remove`, `send_table_update`, `send_message`, `send_ping`,
`request_asset_upload`, `request_asset_download`, `confirm_asset_upload`

**TableSync methods called (11):**
`init`, `dispose`, `set_error_handler`, `set_sprite_update_handler`,
`set_table_received_handler`, `set_network_client`, `request_table`, `request_new_table`,
`add_sprite`, `remove_sprite`, `update_sprite`, `service`

### Confirmed Dead Code (0 React usage, 0 internal Rust usage)

| Module | Class/Struct | Evidence |
|--------|-------------|----------|
| **game.rs** | `GameEngine` | Not in `wasm.d.ts`, not imported in any React file, not used by any Rust module. 12 tests test dead code. |
| **input_controller.rs** | `InputController` | Not in `wasm.d.ts`, not imported in any React file. |

### 54 Unused-from-React RenderEngine Methods — Internal Usage Check

Methods with **1 Rust ref** = definition only (dead from both React AND Rust):

| Method | Rust Refs | Verdict |
|--------|-----------|---------|
| `get_viewport_bounds` | 1 | ❌ Dead |
| `toggle_grid` | 1 | ❌ Dead |
| `toggle_grid_snapping` | 1 | ❌ Dead |
| `get_grid_size` | 1 | ❌ Dead |
| `is_grid_snapping_enabled` | 1 | ❌ Dead |
| `turn_on_all_lights` | 1 | ❌ Dead |
| `turn_off_all_lights` | 1 | ❌ Dead |
| `set_light_drag_mode` | 1 | ❌ Dead |
| `is_in_fog_draw_mode` | 1 | ❌ Dead |
| `is_in_light_drag_mode` | 1 | ❌ Dead |
| `get_current_input_mode` | 1 | ❌ Dead |
| `create_rectangle_sprite` | 1 | ❌ Dead |
| `create_circle_sprite` | 1 | ❌ Dead |
| `create_line_sprite` | 1 | ❌ Dead |
| `get_sprite_network_data` | 1 | ❌ Dead |
| `apply_network_sprite_update` | 1 | ❌ Dead |
| `apply_network_sprite_create` | 1 | ❌ Dead |
| `apply_network_sprite_remove` | 1 | ❌ Dead |
| `set_actions_auto_sync` | 1 | ❌ Dead |
| `get_layer_names` | 1 | ❌ Dead |
| `paint_get_current_table` | 1 | ❌ Dead |
| `paint_clear_table` | 1 | ❌ Dead |
| `paint_on_event` | 1 | ❌ Dead |
| `set_table_error_handler` | 1 | ❌ Dead |

Methods with **>1 Rust refs** = used internally (keep, but remove `#[wasm_bindgen]`):

| Method | Rust Refs | Internal Use |
|--------|-----------|-------------|
| `get_light_count` | 5 | Lighting system queries |
| `clear_lights` | 3 | Table reset / cleanup |
| `hide_entire_table` | 3 | Fog system |
| `is_point_in_fog` | 3 | Fog queries |
| `get_fog_count` | 3 | Fog system |
| `get_light_at_position` | 4 | Light drag system |
| `start_light_drag` | 4 | Event system integration |
| `update_light_drag` | 4 | Event system integration |
| `end_light_drag` | 4 | Event system integration |
| `get_light_radius` | 3 | Light rendering |
| `start_fog_draw` | 2 | Event system integration |
| `update_fog_draw` | 3 | Event system integration |
| `undo_polygon_vertex` | 3 | Event system polygon mode |
| `create_rectangle_sprite_with_options` | 3 | Shape creation API |
| `create_circle_sprite_with_options` | 3 | Shape creation API |
| `create_line_sprite_with_options` | 3 | Shape creation API |
| `get_table_info` | 4 | Table sync queries |
| `get_sprite_info` | 3 | Sprite queries |
| `get_sprites_by_layer` | 4 | Layer rendering |
| `set_layer_blend_mode` | 3 | Layer system |
| `get_table_data` | 4 | Serialization |
| `get_table_id` | 4 | Table identification |
| `get_sprite_data` | 8 | Serialization + sync |

Methods with **0 Rust refs** = possible naming mismatch (verify manually):

| Method | Notes |
|--------|-------|
| `finish_fog_draw` | May be defined with different name in Rust |
| `cancel_fog_draw` | May be defined with different name in Rust |
| `get_fog_at_position` | May be defined with different name in Rust |
| `set_fog_draw_mode` | May be defined with different name in Rust |
| `set_fog_erase_mode` | May be defined with different name in Rust |

### File Inventory (31 files, ~13,350 lines)

| File | Lines | Role | Status |
|------|-------|------|--------|
| render.rs | ~2,893 | Main RenderEngine hub | ⚠️ GOD FILE |
| fog.rs | ~994 | Fog-of-war WebGL rendering | ⚠️ Large but focused |
| lighting/system.rs | ~871 | Dynamic lighting + shadows | ⚠️ Large but focused |
| event_system.rs | ~767 | Mouse/input event handling | ⚠️ 18 input modes |
| actions.rs | ~795 | Action history + undo/redo | ⚠️ Large |
| table_sync.rs | ~726 | Server synchronization | ⚠️ Large |
| paint.rs | ~678 | Drawing/painting system | OK |
| collision.rs | ~650 | A* pathfinding + spatial hash | OK |
| network.rs | ~600 | WebSocket networking | OK |
| input.rs | ~600 | Input state machine | OK |
| asset_manager.rs | ~450 | Asset caching + LRU | OK |
| sprite_renderer.rs | ~400 | Sprite drawing | OK |
| types.rs | ~400 | Core data structures | OK |
| camera.rs | ~350 | 2D camera transforms | OK |
| layer_manager.rs | ~350 | Multi-layer management | OK |
| geometry.rs | ~350 | Visibility polygon | OK |
| webgl_renderer.rs | ~350 | WebGL primitives | OK |
| table_manager.rs | ~250 | Multi-table management | OK |
| wall_manager.rs | ~250 | Wall segment management | OK |
| texture_manager.rs | ~250 | WebGL texture management | OK |
| planning.rs | ~250 | Movement preview/ghost | OK |
| text_renderer.rs | ~200 | Bitmap font rendering | OK |
| grid_system.rs | ~200 | Grid visualization | OK |
| unit_converter.rs | ~200 | Unit/pixel conversion | OK |
| sprite_manager.rs | ~150 | Sprite transform utils | OK |
| lib.rs | ~250 | Module exports + logging | OK |
| **game.rs** | ~100 | **GameEngine wrapper** | ❌ DEAD |
| **input_controller.rs** | ~100 | **InputController** | ❌ DEAD |
| utils.rs | ~50 | Browser utilities | OK |
| math.rs | ~50 | Math utilities | OK |
| lighting/mod.rs | ~5 | Module re-exports | OK |

### Existing Test Coverage

| Module | Tests | Coverage |
|--------|-------|----------|
| CollisionSystem | 7 unit tests | ✅ Good |
| UnitConverter | 14 tests (4 WASM + 10 unit) | ✅ Excellent |
| PlanningManager | 4 unit tests | ✅ Good |
| Geometry/Visibility | 4 tests (2 WASM + 2 unit) | ✅ Good |
| PaintSystem | 5 tests (1 WASM + 4 unit) | ⚠️ Basic |
| GameEngine | 12 unit tests | ❌ Dead code tests |
| RenderEngine | 0 tests | ❌ Critical gap |
| NetworkClient | 0 tests | ❌ Critical gap |
| AssetManager | 0 tests | ❌ Critical gap |
| ActionsClient | 0 tests | ❌ Critical gap |
| TableSync | 0 tests | ❌ Critical gap |
| LightingSystem | 0 tests | ❌ Critical gap |

**Overall: ~36 tests, ~30% coverage. Major subsystems completely untested.**

---

## Phase 0: Prerequisite Fixes ⏱️ 1 commit

### Step 0.1: Fix Cargo.toml edition
- Change `edition = "2024"` → `edition = "2021"` (2024 is not a valid Rust edition)

### Step 0.2: Verify build compiles
- Run `cargo build --target wasm32-unknown-unknown` to confirm clean build
- Run `cargo test` to confirm existing tests pass

---

## Phase 1: Expand Test Coverage (SAFETY NET) ⏱️ Before any refactoring

> **Goal**: Cover every WASM function that React actually calls. These are
> characterization tests — they capture the current behavior so refactoring
> cannot silently break things.

### Architecture Note: Testing Strategy

Many modules are `#[cfg(target_arch = "wasm32")]` — they only compile for WASM.
Two testing approaches:

1. **Native unit tests** (`cargo test`) — for modules NOT behind `cfg(wasm32)`:
   `types.rs`, `math.rs`, `camera.rs`, `input.rs`, `collision.rs`, `planning.rs`,
   `unit_converter.rs`, `geometry.rs`, `table_manager.rs`, `wall_manager.rs`,
   `grid_system.rs`, `lighting/`

2. **WASM integration tests** (`wasm-pack test --headless --chrome`) — for WASM-only modules:
   `render.rs`, `network.rs`, `actions.rs`, `paint.rs`, `asset_manager.rs`,
   `table_sync.rs`, `event_system.rs`, `sprite_renderer.rs`, etc.

3. **React-level integration tests** (Vitest + WASM mock) — for testing the
   TypeScript hooks that orchestrate WASM calls: `useNetworkClient`, `useTableSync`,
   `useRenderEngine`, `usePaintSystem`, `useAssetManager`

### Step 1.1: Native Unit Tests — Pure Logic Modules

**camera.rs** — transform calculations (0 tests → target 8+):
- [ ] `screen_to_world` / `world_to_screen` round-trip
- [ ] Zoom in/out boundary checks
- [ ] Pan with constraints
- [ ] Viewport bounds calculation

**wall_manager.rs** — wall segments (0 tests → target 6+):
- [ ] Add/remove wall segments
- [ ] Wall intersection detection
- [ ] Wall serialization round-trip

**table_manager.rs** — multi-table CRUD (0 tests → target 8+):
- [ ] Create/delete table
- [ ] Switch active table
- [ ] Table data serialization
- [ ] Multiple tables isolation

**layer_manager.rs** — layer ordering (0 tests → target 6+):
- [ ] Add/remove/reorder layers
- [ ] Layer visibility toggle
- [ ] Default layer creation

**grid_system.rs** — snap-to-grid (0 tests → target 5+):
- [ ] Snap point to grid
- [ ] Grid cell calculation
- [ ] Grid scaling with camera zoom

**input.rs** — state machine transitions (0 tests → target 8+):
- [ ] All mode transitions
- [ ] Invalid transition rejection
- [ ] Mode stack push/pop

**lighting/** — Light struct + LightType (0 tests → target 5+):
- [ ] Light creation with all LightType variants
- [ ] Light property getters/setters
- [ ] Light bounds/radius calculations

**Expand existing tests:**
- [ ] `collision.rs` — add edge cases: empty grid, single cell, obstacle-only grid (7 → 12+)
- [ ] `planning.rs` — add ghost token movement, range boundary checks (4 → 8+)
- [ ] `paint.rs` — add multi-stroke, undo stroke, brush preset application (5 → 12+)

### Step 1.2: WASM Integration Tests — Critical Classes

> These require `wasm-pack test` or `wasm_bindgen_test`. They test the actual
> `#[wasm_bindgen]` boundary that React calls through.

**RenderEngine** (0 tests → target 30+ covering 126 used methods):

This is the highest priority. RenderEngine is the hub that React calls for
everything. Group tests by functional area:

- [ ] **Lifecycle**: `new()`, `dispose()`, `draw_frame()`, `resize()`
- [ ] **Sprite CRUD**: `create_sprite()`, `remove_sprite()`, `move_sprite()`, `resize_sprite()`, `rotate_sprite()`
- [ ] **Sprite queries**: `get_sprite_at()`, `get_selected_sprites()`, `select_sprite()`, `deselect_all()`
- [ ] **Selection**: `start_selection_box()`, `update_selection_box()`, `end_selection_box()`
- [ ] **Camera**: `set_camera_position()`, `set_zoom()`, `zoom_to_fit()`
- [ ] **Layers**: `add_layer()`, `remove_layer()`, `set_active_layer()`, `reorder_layers()`
- [ ] **Background**: `set_background_image()`, `clear_background()`
- [ ] **Fog-of-war**: `add_fog_polygon()`, `remove_fog()`, `reveal_area()`
- [ ] **Lighting**: `add_light()`, `remove_light()`, `update_light()`, `set_ambient_light()`
- [ ] **Walls**: `add_wall()`, `remove_wall()`
- [ ] **Input dispatch**: `handle_mouse_down()`, `handle_mouse_move()`, `handle_mouse_up()`, `handle_wheel()`
- [ ] **Actions/undo**: `undo_action()`, `redo_action()`, `create_table_action()`
- [ ] **Table sync proxy**: `handle_table_data()`, `send_sprite_move()`, `send_sprite_resize()`
- [ ] **Paint proxy**: `start_paint_stroke()`, `update_paint_stroke()`, `end_paint_stroke()`

**NetworkClient** (0 tests → target 8+):
- [ ] Construction (`new()`)
- [ ] Handler registration (`set_message_handler`, `set_connection_handler`, `set_error_handler`)
- [ ] Client ID generation (`get_client_id`)
- [ ] Connection state machine (can't test actual WebSocket — mock or test state only)
- [ ] `free()` cleanup

**ActionsClient** (0 tests → target 10+):
- [ ] Construction
- [ ] Add action / undo / redo cycle
- [ ] Action stack overflow (max history)
- [ ] Sprite CRUD actions recording
- [ ] Table management actions

**TableSync** (0 tests → target 8+):
- [ ] Construction + `init()`
- [ ] Handler registration (error, sprite update, table received)
- [ ] `set_network_client()` integration
- [ ] `add_sprite()` / `update_sprite()` / `remove_sprite()` operations
- [ ] `request_table()` / `request_new_table()`
- [ ] `dispose()` cleanup

**AssetManager** (0 tests → target 8+):
- [ ] Construction
- [ ] Cache `set()` / `get()` / `has()` / `remove()` cycle
- [ ] LRU eviction when cache full
- [ ] Cache statistics (`get_stats()`)
- [ ] `clear()` and `dispose()`

**LightingSystem** (0 tests → target 6+):
- [ ] Construction
- [ ] Add/remove/update lights
- [ ] Shadow calculation with walls
- [ ] Ambient light level

### Step 1.3: React-Level Integration Tests (Vitest)

> These test the TypeScript hooks that bridge React ↔ WASM. They use mocked
> WASM modules to verify the hook logic, error handling, and state management.

**useNetworkClient** (0 tests → target 10+):
- [ ] Initializes NetworkClient from WASM module
- [ ] Calls `set_message_handler` on init
- [ ] Calls `set_connection_handler` on init
- [ ] Calls `set_error_handler` on init
- [ ] Auto-connect when `autoConnect=true`
- [ ] `connect()` / `disconnect()` exposed callbacks work
- [ ] `authenticate()` passes credentials correctly
- [ ] `sendMessage()` delegates to client
- [ ] Error state propagation
- [ ] Cleanup calls `disconnect()` + `free()` on unmount

**useTableSync** (0 tests → target 8+):
- [ ] Initializes TableSync from WASM module
- [ ] Sets up handlers (error, sprite update, table received)
- [ ] `set_network_client()` called when networkClient available
- [ ] `request_table()` / `request_new_table()` work
- [ ] Sprite CRUD operations delegate correctly
- [ ] `dispose()` called on unmount

**useRenderEngine** (0 tests → target 6+):
- [ ] Initializes via `init_game_renderer(canvas)`
- [ ] Exposes render engine instance
- [ ] Cleanup on unmount

**usePaintSystem** (0 tests → target 5+):
- [ ] Stroke lifecycle (start → update → end)
- [ ] Brush preset selection
- [ ] Undo integration

**useAssetManager** (0 tests → target 5+):
- [ ] Cache operations via hook interface
- [ ] Loading state management
- [ ] Error handling

### Step 1.4: Validate Test Coverage

- [ ] Run `cargo test` — all native tests pass
- [ ] Run `wasm-pack test --headless --chrome` — all WASM tests pass
- [ ] Run `pnpm test` in web-ui — all Vitest tests pass
- [ ] Create coverage report: `cargo tarpaulin` or `wasm-pack test` with coverage
- [ ] Target: **100% of React-called WASM methods have at least one test**

---

## Phase 2: Remove Dead Code ⏱️ Low risk after Phase 1

> Only proceed after Phase 1 tests are green. Every deletion should be followed
> by `cargo test` + `wasm-pack test` to verify nothing breaks.

### Step 2.1: Delete `game.rs` (GameEngine) — CONFIRMED DEAD
- Remove `mod game;` from `lib.rs`
- Delete `src/game.rs`
- Impact: ~200 lines removed (100 code + 12 dead tests)
- Verification: `cargo test` passes, no React references

### Step 2.2: Delete `input_controller.rs` (InputController) — CONFIRMED DEAD
- Remove `mod input_controller;` from `lib.rs`
- Delete `src/input_controller.rs`
- Verify no internal Rust imports

### Step 2.3: Remove 24 dead RenderEngine methods (1 Rust ref = definition only)
These methods have zero React calls AND zero internal Rust calls:

```
get_viewport_bounds, toggle_grid, toggle_grid_snapping, get_grid_size,
is_grid_snapping_enabled, turn_on_all_lights, turn_off_all_lights,
set_light_drag_mode, is_in_fog_draw_mode, is_in_light_drag_mode,
get_current_input_mode, create_rectangle_sprite, create_circle_sprite,
create_line_sprite, get_sprite_network_data, apply_network_sprite_update,
apply_network_sprite_create, apply_network_sprite_remove, set_actions_auto_sync,
get_layer_names, paint_get_current_table, paint_clear_table, paint_on_event,
set_table_error_handler
```

- Remove each method one at a time
- Run `cargo build --target wasm32-unknown-unknown` after each removal
- If build fails → method is used internally via a path the grep missed → keep it

### Step 2.4: Verify 5 zero-ref fog methods
These had 0 Rust references (possible naming mismatch):
```
finish_fog_draw, cancel_fog_draw, get_fog_at_position,
set_fog_draw_mode, set_fog_erase_mode
```
- Manually search render.rs and fog.rs for these exact strings
- If truly absent from Rust code but present in wasm.d.ts → remove from wasm.d.ts
- If defined with `#[wasm_bindgen(js_name = "...")]` → check the Rust name

### Step 2.5: Strip `#[wasm_bindgen]` from internally-used-only methods
23 methods are unused from React but used internally in Rust. They don't need
to be exported to JavaScript:

```
get_light_count, clear_lights, hide_entire_table, is_point_in_fog,
get_fog_count, get_light_at_position, start_light_drag, update_light_drag,
end_light_drag, get_light_radius, start_fog_draw, update_fog_draw,
undo_polygon_vertex, create_rectangle_sprite_with_options,
create_circle_sprite_with_options, create_line_sprite_with_options,
get_table_info, get_sprite_info, get_sprites_by_layer, set_layer_blend_mode,
get_table_data, get_table_id, get_sprite_data
```

- Remove `#[wasm_bindgen]` attribute (keep the method as `pub(crate)`)
- This reduces WASM binary size without changing any behavior
- Run tests after each batch

### Step 2.6: Add `NetworkClient`, `TableSync`, `ActionsClient` types to wasm.d.ts
Currently these classes are accessed via `any` type. Either:
- Add proper TypeScript definitions to `wasm.d.ts`, OR
- Document why they use `any` (e.g., dynamic API that changes frequently)

### Step 2.7: Audit `types.rs`, `math.rs` for unused public items
- Run `cargo build` with `#[warn(dead_code)]`
- Remove any items not used by WASM exports or internal logic

### Step 2.8: Clean up analyze.ps1
- Delete `apps/web-ui/analyze.ps1` (temporary analysis script)

---

## Phase 3: Split God Files ⏱️ Medium risk

> Prerequisite: Phase 1 tests pass, Phase 2 dead code removed.
> After each split, run full test suite to confirm behavior preserved.

### Step 3.1: Split `render.rs` (~2,893 lines → 6 files)

```
src/render/
  mod.rs          — RenderEngine struct definition + constructor + dispose
  draw.rs         — draw_frame(), draw_sprites(), draw_grid(), draw_selection
  state.rs        — WebGL state, viewport, resize, cursor management
  integration.rs  — Subsystem wiring: lighting, fog, paint, collision
  sprites.rs      — Sprite CRUD, selection, movement, transform
  background.rs   — Background image management, tiling
```

**Approach** (Rust supports split `impl` blocks):
1. Create `src/render/` directory
2. Move `RenderEngine` struct + `new()` + fields to `mod.rs`
3. Split methods into `impl RenderEngine` blocks in each sub-file
4. Each sub-file: `use super::*;` to access struct fields
5. All `#[wasm_bindgen]` annotations stay on the methods — just in different files
6. `lib.rs` changes `mod render;` path — no other changes needed
7. **Run full test suite after completion**

### Step 3.2: Split `event_system.rs` (~767 lines → 4 files)

```
src/event_system/
  mod.rs          — EventSystem struct + dispatch logic
  mouse.rs        — Mouse down/up/move/wheel handlers
  selection.rs    — Marquee selection, lasso
  modes.rs        — Input mode handlers (drag, resize, polygon, etc.)
```

### Step 3.3: Split `actions.rs` (~795 lines → 3 files)

```
src/actions/
  mod.rs          — ActionsClient struct + undo/redo stack
  sprite_ops.rs   — Sprite-level action recording
  table_ops.rs    — Table-level action recording
```

### Step 3.4: Run full test suite
- `cargo test` — native tests
- `wasm-pack test --headless --chrome` — WASM tests
- `pnpm test` in web-ui — React hook tests
- All must pass before proceeding

---

## Phase 4: Module Reorganization ⏱️ Low risk

### Step 4.1: Group related modules into directories

Current flat structure → organized:

```
src/
  lib.rs
  types.rs
  math.rs
  utils.rs

  render/             — (from Phase 3.1)
  event_system/       — (from Phase 3.2)
  actions/            — (from Phase 3.3)

  systems/
    collision.rs
    planning.rs
    paint.rs

  network/
    client.rs         — NetworkClient (was network.rs)
    table_sync.rs     — TableSync
    asset_manager.rs  — AssetManager

  rendering/
    camera.rs
    grid_system.rs
    sprite_renderer.rs
    sprite_manager.rs
    webgl_renderer.rs
    texture_manager.rs
    text_renderer.rs
    layer_manager.rs

  lighting/           — (already a module)
    mod.rs
    system.rs

  fog.rs              — Keep as single file (focused, ~994 lines)
  geometry.rs         — Keep as single file (focused)
  wall_manager.rs     — Keep (used by lighting + collision)
  table_manager.rs    — Keep (used by render + table_sync)
  input.rs            — Keep (state machine, self-contained)
  unit_converter.rs   — Keep (self-contained)
```

### Step 4.2: Update `lib.rs` module declarations
- Update all `mod` paths to match new directory structure
- Update all `pub use` re-exports
- Ensure `#[cfg(target_arch = "wasm32")]` gates are correct

### Step 4.3: Create proper `mod.rs` re-exports
- Each directory module exports only public API
- Internal helpers: `pub(crate)` or private
- No leaking of internal types

### Step 4.4: Run full test suite
- All tests must pass after reorganization

---

## Phase 5: Code Quality Improvements ⏱️ Low risk

### Step 5.1: Reduce WASM binary size
- Already using `opt-level = "s"` and `lto = true` ✅
- Audit `web-sys` features — only enable features actually used
- Consider `wasm-opt` in build pipeline
- Check if `IdbFactory`, `IdbDatabase` etc. features are needed

### Step 5.2: Error handling consistency
- Replace `.unwrap()` in WASM-boundary code with `Result<T, JsValue>`
- Add `#[wasm_bindgen(catch)]` for methods that can fail
- Keep `.unwrap()` only where failure is truly impossible

### Step 5.3: Reduce `pub` exposure
- Change `pub fn` → `pub(crate) fn` for internal helpers
- Only `pub` what's exported via `#[wasm_bindgen]` or used cross-module

### Step 5.4: Documentation
- Add `//!` module-level docs to each module
- Document the architecture: `RenderEngine` as hub, subsystem integration pattern
- Document the `cfg(target_arch)` split and testing strategy

---

## Execution Checklist

- [ ] **Phase 0**: Fix Cargo.toml, verify build
- [ ] **Phase 1.1**: Native unit tests (camera, wall_manager, table_manager, layer_manager, grid_system, input, lighting)
- [ ] **Phase 1.2**: WASM integration tests (RenderEngine, NetworkClient, ActionsClient, TableSync, AssetManager, LightingSystem)
- [ ] **Phase 1.3**: React Vitest tests (useNetworkClient, useTableSync, useRenderEngine, usePaintSystem, useAssetManager)
- [ ] **Phase 1.4**: Validate 100% coverage of React-called methods
- [ ] **Phase 2.1**: Delete game.rs
- [ ] **Phase 2.2**: Delete input_controller.rs
- [ ] **Phase 2.3**: Remove 24 dead RenderEngine methods
- [ ] **Phase 2.4**: Verify 5 zero-ref fog methods
- [ ] **Phase 2.5**: Strip `#[wasm_bindgen]` from 23 internal-only methods
- [ ] **Phase 2.6**: Add missing wasm.d.ts types
- [ ] **Phase 2.7**: Audit types.rs, math.rs
- [ ] **Phase 2.8**: Clean up temporary files
- [ ] **Phase 3.1**: Split render.rs
- [ ] **Phase 3.2**: Split event_system.rs
- [ ] **Phase 3.3**: Split actions.rs
- [ ] **Phase 3.4**: Full test suite green
- [ ] **Phase 4.1**: Reorganize modules
- [ ] **Phase 4.2**: Update lib.rs
- [ ] **Phase 4.3**: Proper mod.rs re-exports
- [ ] **Phase 4.4**: Full test suite green
- [ ] **Phase 5.1**: Binary size optimization
- [ ] **Phase 5.2**: Error handling
- [ ] **Phase 5.3**: Pub exposure audit
- [ ] **Phase 5.4**: Documentation

---

## Execution Order & Dependencies

```
Phase 1 (Dead code removal)     → Can start immediately, no dependencies
Phase 5.1 (Fix edition)         → Can start immediately
Phase 2.1 (Split render.rs)     → Highest impact, do first in Phase 2
Phase 2.2 (Split event_system)  → After 2.1 (may have render.rs refs)
Phase 2.3 (Split actions.rs)    → Independent of 2.1/2.2
Phase 3 (Directory reorg)       → After Phase 2 complete
Phase 4 (Tests)                 → Can start in parallel with Phase 2/3
Phase 5 (Quality)               → Ongoing, do alongside other phases
```

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|------------|
| 1 (Dead code) | Very Low | Only removing unused code |
| 2 (Split files) | Medium | `impl` blocks can span files; careful with re-exports |
| 3 (Reorg) | Medium | Module paths change; update all `use` statements |
| 4 (Tests) | Low | Adding tests doesn't break existing code |
| 5 (Quality) | Low | Incremental improvements |

## Success Criteria

- [ ] Zero dead code (GameEngine removed)
- [ ] No file over 800 lines
- [ ] render.rs split into ≤5 focused files
- [ ] Test coverage ≥60% of WASM API surface
- [ ] Clean `cargo clippy` output
- [ ] Correct `edition = "2021"` in Cargo.toml
- [ ] All `pub fn` either `#[wasm_bindgen]` or `pub(crate)`
