# Documentation map

Audience: maintainers and contributors who need to find the right current doc
without reading the whole tree.

Status: partial. This map covers the current docs and the next durable docs to
create. It should change as pages are added.

Last source audit: 2026-07-09

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
| [Product overview](overview/PRODUCT_OVERVIEW.md) | overview | new contributors | new |
| [Local first run](tutorials/LOCAL_FIRST_RUN.md) | tutorial | new contributors | new |
| [App architecture](APP_ARCHITECTURE.md) | explanation | maintainers | usable |
| [Server architecture](SERVER_ARCHITECTURE.md) | explanation | server contributors | usable |
| [Web UI architecture](WEB_UI_ARCHITECTURE.md) | explanation | web contributors | usable |
| [Feature map](explanation/FEATURE_MAP.md) | explanation/reference | feature contributors | new |
| [Protocol boundary](PROTOCOL_BOUNDARY.md) | explanation/how-to | protocol contributors | usable |
| [Battle flow](BATTLE_FLOW.md) | explanation/how-to | combat contributors | usable |
| [WASM React boundary](WASM_REACT_BOUNDARY.md) | explanation/how-to | web and WASM contributors | usable |
| [Rust/WASM engine](RUST_WASM_ENGINE.md) | explanation | WASM contributors | usable |
| [State ownership](STATE_OWNERSHIP.md) | explanation | maintainers | usable |
| [Testing strategy](TESTING_STRATEGY.md) | how-to | contributors | usable |
| [Source map](SOURCE_MAP.md) | reference | contributors | usable |
| [Development](DEVELOPMENT.md) | how-to/reference | contributors | usable |
| [WebSocket messages](reference/WEBSOCKET_MESSAGES.md) | reference | protocol contributors | new |
| [Combat commands](reference/COMBAT_COMMANDS.md) | reference | combat contributors | new |
| [Environment variables](reference/ENVIRONMENT_VARIABLES.md) | reference | operators and server contributors | new |
| [Database schema](reference/DATABASE_SCHEMA.md) | reference | persistence contributors | new |
| [Auth and roles](features/AUTH_AND_ROLES.md) | feature guide | auth and session contributors | new |
| [Sessions and invitations](features/SESSIONS_AND_INVITATIONS.md) | feature guide | session contributors | new |
| [Tables and canvas](features/TABLES_AND_CANVAS.md) | feature guide | table and canvas contributors | new |
| [Sprites, tokens, and entities](features/SPRITES_TOKENS_AND_ENTITIES.md) | feature guide | token and canvas contributors | new |
| [Walls, lighting, fog, and vision](features/WALLS_LIGHTING_FOG_AND_VISION.md) | feature guide | canvas and vision contributors | new |
| [Measurement and painting](features/MEASUREMENT_AND_PAINTING.md) | feature guide | tool and paint contributors | new |
| [Assets and storage](features/ASSETS_AND_STORAGE.md) | feature guide | asset and storage contributors | new |
| [Characters and compendiums](features/CHARACTERS_AND_COMPENDIUMS.md) | feature guide | character and compendium contributors | new |
| [Chat](features/CHAT.md) | feature guide | chat contributors | new |
| [Encounters](features/ENCOUNTERS.md) | feature guide | combat and encounter contributors | new |
| [Settings and customization](features/SETTINGS_AND_CUSTOMIZATION.md) | feature guide | settings and UI contributors | new |
| [Deployment](operations/DEPLOYMENT.md) | operations | operators and maintainers | new |
| [Configuration](operations/CONFIGURATION.md) | operations | operators and maintainers | new |
| [Database migrations](operations/DATABASE_MIGRATIONS.md) | operations | operators and persistence maintainers | new |
| [Backup and restore](operations/BACKUP_AND_RESTORE.md) | operations | operators and persistence maintainers | new |
| [Security](operations/SECURITY.md) | operations | operators and maintainers | new |
| [Observability and logging](operations/OBSERVABILITY_AND_LOGGING.md) | operations | operators and maintainers | new |
| [Release checklist](operations/RELEASE_CHECKLIST.md) | operations | operators and maintainers | new |
| [Architecture decisions](decisions/README.md) | index | maintainers | new |
| [ADR-001: Server authority for multiplayer state](decisions/ADR-001-server-authority-for-multiplayer-state.md) | decision | maintainers | new |
| [Add a database migration](how-to/ADD_DATABASE_MIGRATION.md) | how-to | persistence contributors | new |
| [Add a WebSocket message](how-to/ADD_WEBSOCKET_MESSAGE.md) | how-to | protocol contributors | new |
| [Add a combat command](how-to/ADD_COMBAT_COMMAND.md) | how-to | combat contributors | new |
| [Add a web UI panel](how-to/ADD_WEB_UI_PANEL.md) | how-to | web contributors | new |
| [Add a WASM export](how-to/ADD_WASM_EXPORT.md) | how-to | WASM contributors | new |
| [Add a canvas tool](how-to/ADD_CANVAS_TOOL.md) | how-to | canvas contributors | new |
| [Add an HTTP route](how-to/ADD_HTTP_ROUTE.md) | how-to | server contributors | new |
| [Add asset storage behavior](how-to/ADD_ASSET_STORAGE_BEHAVIOR.md) | how-to | asset and WASM contributors | new |
| [Add character or compendium behavior](how-to/ADD_CHARACTER_OR_COMPENDIUM_BEHAVIOR.md) | how-to | character and compendium contributors | new |
| [Debug common failures](how-to/DEBUG_COMMON_FAILURES.md) | how-to | contributors | new |
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

1. ADRs for combat commands, React/server state split, WASM runtime ownership,
   `core-table` ownership, and docs/current policy.
2. Docs quality checks for broken relative links and required metadata.

Do not move historical plans into `docs/current/`. Extract current facts into
focused pages instead.
