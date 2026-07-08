# Documentation map

Audience: maintainers and contributors who need to find the right current doc
without reading the whole tree.

Status: partial. This map covers the current docs and the next durable docs to
create. It should change as pages are added.

Last source audit: 2026-07-08

## Reader paths

New developer:

1. [README](README.md)
2. [Development](DEVELOPMENT.md)
3. [Source map](SOURCE_MAP.md)
4. [App architecture](APP_ARCHITECTURE.md)
5. [Testing strategy](TESTING_STRATEGY.md)

Protocol contributor:

1. [Protocol boundary](PROTOCOL_BOUNDARY.md)
2. [Server architecture](SERVER_ARCHITECTURE.md)
3. [Web UI architecture](WEB_UI_ARCHITECTURE.md)
4. [Testing strategy](TESTING_STRATEGY.md)

Combat contributor:

1. [Battle flow](BATTLE_FLOW.md)
2. [State ownership](STATE_OWNERSHIP.md)
3. [Protocol boundary](PROTOCOL_BOUNDARY.md)
4. [Testing strategy](TESTING_STRATEGY.md)

Canvas or WASM contributor:

1. [WASM React boundary](WASM_REACT_BOUNDARY.md)
2. [Rust/WASM engine](RUST_WASM_ENGINE.md)
3. [Web UI architecture](WEB_UI_ARCHITECTURE.md)
4. [Testing strategy](TESTING_STRATEGY.md)

## Current pages

| Page | Type | Main audience | Status |
| --- | --- | --- | --- |
| [README](README.md) | index | all contributors | partial |
| [App architecture](APP_ARCHITECTURE.md) | explanation | maintainers | usable |
| [Server architecture](SERVER_ARCHITECTURE.md) | explanation | server contributors | usable |
| [Web UI architecture](WEB_UI_ARCHITECTURE.md) | explanation | web contributors | usable |
| [Protocol boundary](PROTOCOL_BOUNDARY.md) | explanation/how-to | protocol contributors | usable |
| [Battle flow](BATTLE_FLOW.md) | explanation/how-to | combat contributors | usable |
| [WASM React boundary](WASM_REACT_BOUNDARY.md) | explanation/how-to | web and WASM contributors | usable |
| [Rust/WASM engine](RUST_WASM_ENGINE.md) | explanation | WASM contributors | usable |
| [State ownership](STATE_OWNERSHIP.md) | explanation | maintainers | usable |
| [Testing strategy](TESTING_STRATEGY.md) | how-to | contributors | usable |
| [Source map](SOURCE_MAP.md) | reference | contributors | usable |
| [Development](DEVELOPMENT.md) | how-to/reference | contributors | usable |
| [Docs style](DOC_STYLE.md) | reference | doc contributors | new |
| [Glossary](GLOSSARY.md) | reference | all contributors | new |

## Verified source areas

The current app is split across these source owners:

- `apps/server`: FastAPI app, HTTP routes, WebSocket entry, protocol services,
  persistence, auth, storage, and combat command authority.
- `apps/web-ui`: Vite React app, UI features, browser protocol adapter,
  app state, and WASM runtime boundary.
- `packages/core-table`: reusable Python tabletop domain behavior.
- `packages/rust-core`: Rust/WASM canvas engine, rendering, geometry, lighting,
  fog, paint, planning, and runtime-facing exports.
- `legacy/desktop_client`: historical desktop client code and tests. Treat it
  as legacy unless a task explicitly targets it.

Current React feature folders under `apps/web-ui/src/features/`:

`actions`, `assets`, `auth`, `canvas`, `character`, `chat`, `combat`,
`compendium`, `customization`, `entities`, `fog`, `game`, `integration`,
`layout`, `lighting`, `measurement`, `network`, `painting`, `session`, `table`.

Current server protocol modules under `apps/server/service/protocol/`:

`assets`, `auth`, `characters`, `chat`, `combat`, `encounter`, `paint`,
`players`, `session`, `sprites`, `tables`, `walls`.

Current HTTP router modules under `apps/server/routers/`:

`auth`, `compendium`, `demo`, `game`, `invitations`, `users`.

## Missing durable docs

Create these next, in this order:

1. Product overview: what the app does for DMs and players.
2. Local first-run tutorial: install, build WASM, run server and web UI.
3. Feature map: visible app features linked to source and tests.
4. WebSocket message reference: complete protocol message catalog.
5. Combat command reference: complete `combat_command` catalog.
6. Environment and configuration reference.
7. Database schema and migration guide.
8. Deployment, backup, restore, and troubleshooting operations docs.
9. ADRs for server authority, combat commands, and WASM runtime ownership.

Do not move historical plans into `docs/current/`. Extract current facts into
focused pages instead.
