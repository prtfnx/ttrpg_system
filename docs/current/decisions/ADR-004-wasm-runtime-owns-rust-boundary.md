# ADR-004: WasmRuntime Owns the Rust Boundary

Status: accepted
Date: 2026-07-09

## Context

The browser canvas depends on Rust/WASM for rendering, geometry-heavy behavior,
lighting, fog, paint, planning, and local action helpers. The generated
wasm-bindgen files expose Rust objects, but direct feature imports would spread
Rust object lifetime and generated API details through the React app.

Current source keeps the boundary in:

- `apps/web-ui/src/lib/wasm/runtime/WasmRuntime.ts`
- `apps/web-ui/src/lib/wasm/runtime/WasmRuntimePort.ts`
- `apps/web-ui/src/lib/wasm/runtime/WasmRuntimeProvider.tsx`
- `apps/web-ui/src/lib/wasm/runtime/types.ts`
- `packages/rust-core/src/lib.rs`

## Decision

`WasmRuntime` owns generated WASM bindings and Rust object lifetime.

React features call runtime methods or use runtime-owned types. They do not
import generated `ttrpg_rust_core` files directly. Rust reports app intent
through runtime callbacks, and the runtime decides how to route that intent
back into protocol, stores, or browser events.

## Consequences

- New Rust exports need a runtime method, type, or callback mapping before
  feature code uses them.
- Generated `.js`, `.d.ts`, and `.wasm` files are build artifacts. Do not
  hand-edit them.
- `WasmRuntime` creates, reuses, clears callbacks for, and frees Rust-owned
  objects such as `RenderEngine` and `PlanningManager`.
- Combat-facing WASM behavior remains preview-only. Accepted combat state is
  still decided by the server.

## Links

- [WASM React boundary](../WASM_REACT_BOUNDARY.md)
- [Rust/WASM engine](../RUST_WASM_ENGINE.md)
- [Add a WASM export](../how-to/ADD_WASM_EXPORT.md)
- [Add a canvas tool](../how-to/ADD_CANVAS_TOOL.md)
