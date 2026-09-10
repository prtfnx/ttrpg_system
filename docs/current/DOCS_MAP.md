# Documentation map

Audience: maintainers and contributors who need to find the right current doc
without reading the whole tree.

Status: usable. This map covers the current docs and maintenance notes. It
should change as pages are added.

Last source audit: 2026-09-10

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

| Page | Type | Main audience |
| --- | --- | --- |
| [README](README.md) | index | all contributors |
| [Product overview](overview/PRODUCT_OVERVIEW.md) | overview | new contributors |
| [Local first run](tutorials/LOCAL_FIRST_RUN.md) | tutorial | new contributors |
| [App architecture](APP_ARCHITECTURE.md) | explanation | maintainers |
| [Server architecture](SERVER_ARCHITECTURE.md) | explanation | server contributors |
| [Web UI architecture](WEB_UI_ARCHITECTURE.md) | explanation | web contributors |
| [Feature map](explanation/FEATURE_MAP.md) | explanation/reference | feature contributors |
| [Protocol boundary](PROTOCOL_BOUNDARY.md) | explanation/how-to | protocol contributors |
| [Battle flow](BATTLE_FLOW.md) | explanation/how-to | combat contributors |
| [WASM React boundary](WASM_REACT_BOUNDARY.md) | explanation/how-to | web and WASM contributors |
| [Rust/WASM engine](RUST_WASM_ENGINE.md) | explanation | WASM contributors |
| [Persistence and application ownership](explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md) | explanation | persistence contributors |
| [Writer handover](operations/WRITER_HANDOVER.md) | operations | operators |
| [Security and reliability contracts](reference/SYSTEM_CONTRACTS.md) | reference | reviewers and maintainers |
| [State ownership](STATE_OWNERSHIP.md) | explanation | maintainers |
| [Testing strategy](TESTING_STRATEGY.md) | how-to | contributors |
| [Source map](SOURCE_MAP.md) | reference | contributors |
| [Development](DEVELOPMENT.md) | how-to/reference | contributors |
| [WebSocket messages](reference/WEBSOCKET_MESSAGES.md) | reference | protocol contributors |
| [Combat commands](reference/COMBAT_COMMANDS.md) | reference | combat contributors |
| [Environment variables](reference/ENVIRONMENT_VARIABLES.md) | reference | operators and server contributors |
| [Database schema](reference/DATABASE_SCHEMA.md) | reference | persistence contributors |
| [Docs quality checks](reference/DOCS_QUALITY_CHECKS.md) | reference | doc contributors |
| [Editor workspace](reference/EDITOR_WORKSPACE.md) | reference | contributors using VS Code |
| [UI theme tokens](reference/UI_THEME_TOKENS.md) | reference | web UI contributors |
| [Auth and roles](features/AUTH_AND_ROLES.md) | feature guide | auth and session contributors |
| [Sessions and invitations](features/SESSIONS_AND_INVITATIONS.md) | feature guide | session contributors |
| [Tables and canvas](features/TABLES_AND_CANVAS.md) | feature guide | table and canvas contributors |
| [Sprites, tokens, and entities](features/SPRITES_TOKENS_AND_ENTITIES.md) | feature guide | token and canvas contributors |
| [Walls, lighting, fog, and vision](features/WALLS_LIGHTING_FOG_AND_VISION.md) | feature guide | canvas and vision contributors |
| [Measurement and painting](features/MEASUREMENT_AND_PAINTING.md) | feature guide | tool and paint contributors |
| [Assets and storage](features/ASSETS_AND_STORAGE.md) | feature guide | asset and storage contributors |
| [Characters and compendiums](features/CHARACTERS_AND_COMPENDIUMS.md) | feature guide | character and compendium contributors |
| [Chat](features/CHAT.md) | feature guide | chat contributors |
| [Encounters](features/ENCOUNTERS.md) | feature guide | combat and encounter contributors |
| [Settings and customization](features/SETTINGS_AND_CUSTOMIZATION.md) | feature guide | settings and UI contributors |
| [Deployment](operations/DEPLOYMENT.md) | operations | operators and maintainers |
| [Configuration](operations/CONFIGURATION.md) | operations | operators and maintainers |
| [Database migrations](operations/DATABASE_MIGRATIONS.md) | operations | operators and persistence maintainers |
| [Backup and restore](operations/BACKUP_AND_RESTORE.md) | operations | operators and persistence maintainers |
| [Security](operations/SECURITY.md) | operations | operators and maintainers |
| [Observability and logging](operations/OBSERVABILITY_AND_LOGGING.md) | operations | operators and maintainers |
| [Release checklist](operations/RELEASE_CHECKLIST.md) | operations | operators and maintainers |
| [Architecture decisions](decisions/README.md) | index | maintainers |
| [ADR-001: Server authority for multiplayer state](decisions/ADR-001-server-authority-for-multiplayer-state.md) | decision | maintainers |
| [ADR-002: Command-oriented combat mutations](decisions/ADR-002-command-oriented-combat-mutations.md) | decision | combat contributors |
| [ADR-003: React owns UI workflow, server owns accepted state](decisions/ADR-003-react-ui-server-accepted-state.md) | decision | web and protocol contributors |
| [ADR-004: WasmRuntime owns the Rust boundary](decisions/ADR-004-wasm-runtime-owns-rust-boundary.md) | decision | web and WASM contributors |
| [ADR-005: Core-table is reusable domain logic](decisions/ADR-005-core-table-is-reusable-domain-logic.md) | decision | server and domain contributors |
| [ADR-006: Docs current is current truth](decisions/ADR-006-docs-current-is-current-truth.md) | decision | doc contributors |
| [Add a database migration](how-to/ADD_DATABASE_MIGRATION.md) | how-to | persistence contributors |
| [Add a WebSocket message](how-to/ADD_WEBSOCKET_MESSAGE.md) | how-to | protocol contributors |
| [Add a combat command](how-to/ADD_COMBAT_COMMAND.md) | how-to | combat contributors |
| [Add a web UI panel](how-to/ADD_WEB_UI_PANEL.md) | how-to | web contributors |
| [Add a WASM export](how-to/ADD_WASM_EXPORT.md) | how-to | WASM contributors |
| [Add a canvas tool](how-to/ADD_CANVAS_TOOL.md) | how-to | canvas contributors |
| [Add an HTTP route](how-to/ADD_HTTP_ROUTE.md) | how-to | server contributors |
| [Add asset storage behavior](how-to/ADD_ASSET_STORAGE_BEHAVIOR.md) | how-to | asset and WASM contributors |
| [Add character or compendium behavior](how-to/ADD_CHARACTER_OR_COMPENDIUM_BEHAVIOR.md) | how-to | character and compendium contributors |
| [Debug common failures](how-to/DEBUG_COMMON_FAILURES.md) | how-to | contributors |
| [Docs style](DOC_STYLE.md) | reference | doc contributors |
| [Glossary](GLOSSARY.md) | reference | all contributors |

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

`assets`, `characters`, `chat`, `combat`, `encounter`, `measurements`, `paint`,
`paint_templates`, `players`, `session`, `sprites`, `tables`, and `walls`.
Registration in `base.py` determines active handlers; file existence does not
make an old auth stub an active protocol.

Current HTTP router modules under `apps/server/routers/`:

`audit`, `auth`, `compendium`, `demo`, `game`, `invitations`, `telemetry`, `users`.

## Maintenance Notes

The [contract index](reference/SYSTEM_CONTRACTS.md) maps implemented reliability
and security behavior to canonical guides and regressions. It does not certify
that every field or deployed service has been verified. Pages marked partial
state their coverage; dated execution results stay outside current docs.

Do not move historical plans into `docs/current/`. Extract current facts into
focused pages instead.

Run `pnpm.cmd run docs:check` after changing current docs.
