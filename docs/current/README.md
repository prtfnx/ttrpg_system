# Current documentation

These pages describe the current app from source code. They do not depend on
older plans or reports in `docs/`.

## Start here

- [Documentation map](DOCS_MAP.md): reader paths, current coverage, and missing
  durable docs.
- [Product overview](overview/PRODUCT_OVERVIEW.md): what the app is and how a
  user enters it.
- [Local first run](tutorials/LOCAL_FIRST_RUN.md): set up, build, and smoke
  test the integrated app.
- [Docs style](DOC_STYLE.md): how to add current docs without drifting into
  plans or guesses.
- [Glossary](GLOSSARY.md): shared project terms.

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

## Reference

- [WebSocket messages](reference/WEBSOCKET_MESSAGES.md): registered server
  message handlers, response families, and protocol ownership.
- [Combat commands](reference/COMBAT_COMMANDS.md): current
  `combat_command` envelope, command types, authority rules, and change
  checklist.
- [Environment variables](reference/ENVIRONMENT_VARIABLES.md): current server
  configuration, secrets, email, R2, and Render notes.
- [Database schema](reference/DATABASE_SCHEMA.md): model families,
  persistence owners, combat journal, assets, and migrations.

## How To

- [Add a database migration](how-to/ADD_DATABASE_MIGRATION.md): model,
  migration, runner, and verification checklist.
- [Add a WebSocket message](how-to/ADD_WEBSOCKET_MESSAGE.md): enum, handler,
  registration, browser protocol, and tests.
- [Add a combat command](how-to/ADD_COMBAT_COMMAND.md): server-authoritative
  command schema, mutation, persistence, browser send path, and tests.
- [Add a web UI panel](how-to/ADD_WEB_UI_PANEL.md): RightPanel, ToolsPanel,
  role visibility, state ownership, and tests.
- [Add a WASM export](how-to/ADD_WASM_EXPORT.md): Rust export, generated
  bindings, runtime port, and runtime tests.
- [Add a canvas tool](how-to/ADD_CANVAS_TOOL.md): tool UI, active tool state,
  runtime callbacks, server boundary, and tests.

## Read by task

New developer:

1. [Product overview](overview/PRODUCT_OVERVIEW.md)
2. [Local first run](tutorials/LOCAL_FIRST_RUN.md)
3. [Development](DEVELOPMENT.md)
4. [Source map](SOURCE_MAP.md)
5. [App architecture](APP_ARCHITECTURE.md)
6. [Testing strategy](TESTING_STRATEGY.md)

Protocol change:

1. [Add a WebSocket message](how-to/ADD_WEBSOCKET_MESSAGE.md)
2. [WebSocket messages](reference/WEBSOCKET_MESSAGES.md)
3. [Protocol boundary](PROTOCOL_BOUNDARY.md)
4. [Server architecture](SERVER_ARCHITECTURE.md)
5. [Web UI architecture](WEB_UI_ARCHITECTURE.md)

Combat change:

1. [Add a combat command](how-to/ADD_COMBAT_COMMAND.md)
2. [Combat commands](reference/COMBAT_COMMANDS.md)
3. [Battle flow](BATTLE_FLOW.md)
4. [State ownership](STATE_OWNERSHIP.md)
5. [Testing strategy](TESTING_STRATEGY.md)

WASM or canvas change:

1. [Add a canvas tool](how-to/ADD_CANVAS_TOOL.md)
2. [Add a WASM export](how-to/ADD_WASM_EXPORT.md)
3. [WASM React boundary](WASM_REACT_BOUNDARY.md)
4. [Rust/WASM engine](RUST_WASM_ENGINE.md)
5. [Web UI architecture](WEB_UI_ARCHITECTURE.md)

## Maintenance

- Update these pages when code ownership changes.
- Keep plans, audits, and migration notes outside `docs/current/`.
- If an old page is still correct, rewrite the useful part here in current
  language instead of moving the whole file unchanged.
- Check source code and tests before writing facts. If a page is correct but
  incomplete, mark it as partial instead of sounding certain.
