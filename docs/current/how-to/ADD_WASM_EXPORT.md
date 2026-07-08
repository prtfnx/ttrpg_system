# Add a WASM export

Audience: contributors exposing Rust/WASM behavior to the React app.

Status: usable.

Last source audit: 2026-07-08

## Before you start

Read:

- [WASM React boundary](../WASM_REACT_BOUNDARY.md)
- [Rust/WASM engine](../RUST_WASM_ENGINE.md)

Feature code should not import generated wasm-bindgen files directly. React and
services should use `WasmRuntime` and `WasmRuntimePort`.

## Source owners

Rust exports live under `packages/rust-core/src/`.

Generated bindings are written under:

```text
apps/web-ui/src/lib/wasm/generated/
```

Runtime-owned TypeScript code lives under:

```text
apps/web-ui/src/lib/wasm/runtime/
```

Hand-maintained runtime types live in:

```text
apps/web-ui/src/lib/wasm/runtime/types.ts
```

## Steps

1. Add pure Rust logic first when possible.
2. Add the `wasm_bindgen` export only for the behavior TypeScript needs.
3. Add Rust or wasm-bindgen tests.
4. Build WASM.
5. Update `apps/web-ui/src/lib/wasm/runtime/types.ts` when TypeScript needs a
   hand-maintained interface change.
6. Add a method to `WasmRuntimePort` if app code should call the behavior.
7. Implement the method in `WasmRuntime`.
8. Add or update runtime tests under
   `apps/web-ui/src/lib/wasm/runtime/__tests__/`.
9. Use the runtime method from feature code.

## Build commands

From the repo root:

```powershell
.\scripts\build-wasm.ps1 -dev
```

or:

```powershell
.\build_and_deploy.ps1 -WasmOnly
```

The full build script also syncs generated WASM type files into
`apps/web-ui/src/lib/wasm`.

## Tests

Rust native tests:

```powershell
cd packages/rust-core
cargo test
```

WASM build or test paths:

```powershell
wasm-pack build --target web --out-dir ..\..\apps\web-ui\src\lib\wasm\generated --features wasm-start,dev-logging
wasm-pack test --node
wasm-pack test --headless --chrome
```

Runtime contract test:

```powershell
cd apps/web-ui
pnpm.cmd exec vitest run --project jsdom src/lib/wasm/runtime/__tests__/WasmRuntime.test.ts
```

## Rules

- Do not hand-edit generated `.js`, `.d.ts`, or `.wasm` files.
- Do not import generated bindings from feature components.
- Keep Rust from knowing about React, Zustand, or browser protocol objects.
- Use runtime callbacks for Rust-originated app intent.
- For combat, WASM may preview but must not accept combat state.

## Checklist

- Export is needed by the app boundary.
- Rust tests cover pure or exported behavior.
- WASM bindings are regenerated.
- Runtime port exposes the app-facing method.
- Runtime tests cover the generated binding call.
- Feature code uses runtime hooks or services, not generated files.
