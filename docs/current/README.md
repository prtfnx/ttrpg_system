# Current documentation

These pages describe the current app from source code. They do not depend on
older plans or reports in `docs/`.

## Read first

- [App architecture](APP_ARCHITECTURE.md): how the server, React client, Python
  domain package, and Rust/WASM engine fit together.
- [Server architecture](SERVER_ARCHITECTURE.md): FastAPI, sessions,
  persistence, protocol handlers, and the domain package boundary.
- [Web UI architecture](WEB_UI_ARCHITECTURE.md): React providers, app state,
  protocol ownership, and WASM access.
- [Protocol boundary](PROTOCOL_BOUNDARY.md): client/server message flow and how
  to add a protocol message.
- [Battle flow](BATTLE_FLOW.md): current combat command pipeline, DM/player
  workflow, persistence, privacy, and WASM preview boundary.
- [WASM React boundary](WASM_REACT_BOUNDARY.md): how React code talks to Rust
  through `WasmRuntime`.
- [Rust/WASM engine](RUST_WASM_ENGINE.md): Rust crate shape, `RenderEngine`,
  exported objects, callbacks, and change rules.
- [State ownership](STATE_OWNERSHIP.md): which domain owns which kind of state.
- [Testing strategy](TESTING_STRATEGY.md): which tests match each kind of
  change.
- [Source map](SOURCE_MAP.md): where the main code lives.
- [Development](DEVELOPMENT.md): local commands and verification by code area.

## Maintenance

- Update these pages when code ownership changes.
- Keep plans, audits, and migration notes outside `docs/current/`.
- If an old page is still correct, rewrite the useful part here in current
  language instead of moving the whole file unchanged.
