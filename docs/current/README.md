# Current documentation

These pages describe the current app from source code. They do not depend on
older plans or reports in `docs/`.

## Start here

- [Documentation map](DOCS_MAP.md): reader paths, current coverage, and
  maintenance notes.
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
- [Docs quality checks](reference/DOCS_QUALITY_CHECKS.md): local link and
  metadata checks for `docs/current/`.

## Feature Guides

- [Auth and roles](features/AUTH_AND_ROLES.md): account auth, JWT cookies,
  Google OAuth, session roles, permissions, role changes, invitations, and
  current rough edges.
- [Sessions and invitations](features/SESSIONS_AND_INVITATIONS.md): session
  entry, player management, invite routes, session rules, game mode, and
  persistence.
- [Tables and canvas](features/TABLES_AND_CANVAS.md): table list/create/load,
  active-table switching, canvas ownership, table settings, and WASM boundary.
- [Sprites, tokens, and entities](features/SPRITES_TOKENS_AND_ENTITIES.md):
  sprite protocol, token authority, entity persistence, text sprites,
  character links, and vision fields.
- [Walls, lighting, fog, and vision](features/WALLS_LIGHTING_FOG_AND_VISION.md):
  walls, doors, fog rectangles, table lighting settings, vision polygons, and
  WASM rendering responsibilities.
- [Measurement and painting](features/MEASUREMENT_AND_PAINTING.md): local
  measurement tools, table-unit sync, WASM paint strokes, paint persistence,
  and join-time paint sync.
- [Assets and storage](features/ASSETS_AND_STORAGE.md): asset upload/download,
  R2 metadata, xxHash, pending upload confirmation, texture loading, and known
  storage gaps.
- [Characters and compendiums](features/CHARACTERS_AND_COMPENDIUMS.md):
  character protocol, rolls, XP, token sync, compendium REST routes, and
  current browser/server gaps.
- [Chat](features/CHAT.md): chat send/history flow, persistence, whispers,
  optimistic browser state, overlay/panel UI, and roll display.
- [Encounters](features/ENCOUNTERS.md): choice encounter prompts, in-memory
  engine state, browser combat UI, combat encounter persistence boundary, and
  current integration edges.
- [Settings and customization](features/SETTINGS_AND_CUSTOMIZATION.md): account
  settings, session settings, table settings, browser preferences, performance
  settings, and persistence ownership.

## Operations

- [Deployment](operations/DEPLOYMENT.md): current Render service, full app
  build path, required environment, database notes, and smoke checks.
- [Configuration](operations/CONFIGURATION.md): server settings, production
  secrets, browser config, R2, CORS, cookies, and change checklist.
- [Database migrations](operations/DATABASE_MIGRATIONS.md): Alembic lifecycle,
  Render startup sequence, recovery policy, and verification.
- [Backup and restore](operations/BACKUP_AND_RESTORE.md): Neon development
  recovery, current production blocker, and R2 asset boundaries.
- [Security](operations/SECURITY.md): current auth, cookies, roles, rate
  limits, audit coverage, known gaps, and verification.
- [Observability and logging](operations/OBSERVABILITY_AND_LOGGING.md):
  structured logs, request correlation, health/readiness, protected metrics,
  optional traces, and R2 operational checks.
- [Release checklist](operations/RELEASE_CHECKLIST.md): source-checked
  preflight, tests, full build artifacts, Render deployment caveats, smoke
  checks, and rollback notes.

## Decisions

- [Architecture decisions](decisions/README.md): accepted architecture choices
  that should survive refactors.
- [ADR-001: Server authority for multiplayer state](decisions/ADR-001-server-authority-for-multiplayer-state.md):
  why shared state is accepted by server routes, protocol handlers, and
  persistence before browsers mirror it.
- [ADR-002: Command-oriented combat mutations](decisions/ADR-002-command-oriented-combat-mutations.md):
  why combat writes use `combat_command`.
- [ADR-003: React owns UI workflow, server owns accepted state](decisions/ADR-003-react-ui-server-accepted-state.md):
  where local UI state ends and accepted state begins.
- [ADR-004: WasmRuntime owns the Rust boundary](decisions/ADR-004-wasm-runtime-owns-rust-boundary.md):
  why feature code goes through the runtime instead of generated bindings.
- [ADR-005: Core-table is reusable domain logic](decisions/ADR-005-core-table-is-reusable-domain-logic.md):
  what belongs in the shared Python package.
- [ADR-006: Docs current is current truth](decisions/ADR-006-docs-current-is-current-truth.md):
  why plans and progress notes stay outside `docs/current/`.

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
- [Add an HTTP route](how-to/ADD_HTTP_ROUTE.md): FastAPI router ownership,
  authentication, route inclusion, and integration tests.
- [Add asset storage behavior](how-to/ADD_ASSET_STORAGE_BEHAVIOR.md):
  presigned URL flow, R2, upload confirmation, hashes, and tests.
- [Add character or compendium behavior](how-to/ADD_CHARACTER_OR_COMPENDIUM_BEHAVIOR.md):
  character WebSocket writes, compendium REST reads, ownership, and tests.
- [Debug common failures](how-to/DEBUG_COMMON_FAILURES.md): boundary-first
  checks for server, protocol, WASM, persistence, assets, and compendium data.

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
4. [Encounters](features/ENCOUNTERS.md)
5. [State ownership](STATE_OWNERSHIP.md)
6. [Testing strategy](TESTING_STRATEGY.md)

WASM or canvas change:

1. [Add a canvas tool](how-to/ADD_CANVAS_TOOL.md)
2. [Add a WASM export](how-to/ADD_WASM_EXPORT.md)
3. [WASM React boundary](WASM_REACT_BOUNDARY.md)
4. [Rust/WASM engine](RUST_WASM_ENGINE.md)
5. [Web UI architecture](WEB_UI_ARCHITECTURE.md)

HTTP, assets, or character data:

1. [Add an HTTP route](how-to/ADD_HTTP_ROUTE.md)
2. [Add asset storage behavior](how-to/ADD_ASSET_STORAGE_BEHAVIOR.md)
3. [Assets and storage](features/ASSETS_AND_STORAGE.md)
4. [Characters and compendiums](features/CHARACTERS_AND_COMPENDIUMS.md)
5. [Add character or compendium behavior](how-to/ADD_CHARACTER_OR_COMPENDIUM_BEHAVIOR.md)
6. [Debug common failures](how-to/DEBUG_COMMON_FAILURES.md)
7. [Database schema](reference/DATABASE_SCHEMA.md)

Session or table behavior:

1. [Sessions and invitations](features/SESSIONS_AND_INVITATIONS.md)
2. [Tables and canvas](features/TABLES_AND_CANVAS.md)
3. [Sprites, tokens, and entities](features/SPRITES_TOKENS_AND_ENTITIES.md)
4. [Walls, lighting, fog, and vision](features/WALLS_LIGHTING_FOG_AND_VISION.md)
5. [Measurement and painting](features/MEASUREMENT_AND_PAINTING.md)
6. [Auth and roles](features/AUTH_AND_ROLES.md)
7. [WebSocket messages](reference/WEBSOCKET_MESSAGES.md)
8. [State ownership](STATE_OWNERSHIP.md)

Settings or customization:

1. [Settings and customization](features/SETTINGS_AND_CUSTOMIZATION.md)
2. [Auth and roles](features/AUTH_AND_ROLES.md)
3. [Sessions and invitations](features/SESSIONS_AND_INVITATIONS.md)
4. [Tables and canvas](features/TABLES_AND_CANVAS.md)
5. [State ownership](STATE_OWNERSHIP.md)

## Maintenance

- Update these pages when code ownership changes.
- Keep plans, audits, and migration notes outside `docs/current/`.
- If an old page is still correct, rewrite the useful part here in current
  language instead of moving the whole file unchanged.
- Check source code and tests before writing facts. If a page is correct but
  incomplete, mark it as partial instead of sounding certain.
- Run `pnpm.cmd run docs:check` from PowerShell before committing doc changes.
