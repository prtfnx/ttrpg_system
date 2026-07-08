# Add a canvas tool

Audience: contributors adding a tool that changes canvas interaction.

Status: usable.

Last source audit: 2026-07-08

## Before you start

Read:

- [Web UI architecture](../WEB_UI_ARCHITECTURE.md)
- [WASM React boundary](../WASM_REACT_BOUNDARY.md)
- [Rust/WASM engine](../RUST_WASM_ENGINE.md)

Canvas tools usually span React UI, shared app state, `WasmRuntime`, and Rust
input/rendering behavior. Decide which layer owns the new behavior before
editing.

## Current tool flow

The common path is:

```text
ToolsPanel -> useGameStore.activeTool -> RenderEngine input mode -> canvas events -> Rust/runtime callback -> protocol/store
```

Important files:

- `apps/web-ui/src/features/canvas/components/ToolsPanel.tsx`
- `apps/web-ui/src/features/canvas/components/GameCanvas.tsx`
- `apps/web-ui/src/features/canvas/components/GameCanvas/useCanvasEventsEnhanced.ts`
- `apps/web-ui/src/features/canvas/services/InputManager.ts`
- `apps/web-ui/src/lib/wasm/runtime/`
- `packages/rust-core/src/render/`
- `packages/rust-core/src/event_system/`

## Steps

1. Add any new active tool value to the store type or usage that owns
   `activeTool`.
2. Add the UI control in `ToolsPanel`.
3. Gate the tool by role with `isDM`, `isElevated`, or `canInteract`.
4. Map the tool to a `RenderEngine` input mode in the `ToolsPanel` effect.
5. Add or expose the Rust input/render behavior if the existing engine modes do
   not cover it.
6. If Rust needs to report app intent, add a runtime event or operation and
   handle it in `WasmRuntime`.
7. If the tool persists or broadcasts state, send a typed protocol message
   through `WebClientProtocol`.
8. Add tests at the boundary you changed.

## Runtime events and operations

`WasmRuntime` already bridges several Rust-originated events to browser event
names, including sprite previews, wall events, measurement completion, polygon
creation, text sprite clicks, tool-mode changes, token double-click, and cursor
hints.

Prefer adding a typed runtime mapping over dispatching ad hoc browser events
from Rust.

## Server boundary

If the tool changes shared multiplayer state, the server needs to accept it.

Examples:

- sprite changes go through sprite protocol helpers;
- wall changes go through wall protocol helpers;
- paint strokes go through paint protocol helpers;
- combat movement goes through `combat_command`, not raw sprite movement.

Preview-only UI can stay local, but accepted multiplayer state cannot.

## Tests

React/tool tests:

```powershell
cd apps/web-ui
pnpm.cmd exec vitest run --project jsdom src/features/canvas
```

Runtime tests:

```powershell
pnpm.cmd exec vitest run --project jsdom src/lib/wasm/runtime/__tests__/WasmRuntime.test.ts
```

Rust tests:

```powershell
cd packages/rust-core
cargo test
```

Use browser tests when the behavior depends on real canvas, WebGL, DOM events,
or generated WASM in a way jsdom cannot model.

## Checklist

- Tool has a clear owner: local preview, React state, runtime, Rust, or server.
- Role visibility is explicit.
- Input mode is synchronized with `activeTool`.
- Rust callbacks route through `WasmRuntime`.
- Shared state goes through protocol.
- Tests cover UI trigger and changed boundary behavior.
