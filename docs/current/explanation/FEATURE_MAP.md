# Feature map

Audience: contributors looking for the source owner of a visible app feature.

Status: partial. This map names the main current locations. It is not a full
API or protocol reference.

Last source audit: 2026-07-08

## How to read this

Use this page to find the first file or folder to inspect. Use
[Source map](../SOURCE_MAP.md) and the focused architecture pages for deeper
ownership rules.

## Product shell

| Area | Source | Tests |
| --- | --- | --- |
| FastAPI app setup | `apps/server/main.py` | `apps/server/tests/` |
| Server templates | `apps/server/templates/` | route and integration tests under `apps/server/tests/` |
| React app bootstrap | `apps/web-ui/src/App.tsx` and `apps/web-ui/src/app/` | `apps/web-ui/src/test/` and colocated tests |
| Main game client | `apps/web-ui/src/features/canvas/components/GameClient.tsx` | `apps/web-ui/src/features/canvas/components/__tests__/` |
| Shared app state | `apps/web-ui/src/store.ts` | `apps/web-ui/src/__tests__/` |

## Server features

| Area | Source | Notes |
| --- | --- | --- |
| Users and auth pages | `apps/server/routers/users.py` | login, register, profile, settings, password reset |
| Google OAuth | `apps/server/routers/auth.py` | optional when Google credentials are configured |
| Game sessions | `apps/server/routers/game.py` | create, join, session page, settings |
| Invitations | `apps/server/routers/invitations.py` | invite creation, lookup, accept flow |
| Compendium HTTP API | `apps/server/routers/compendium.py` | races, classes, backgrounds, spells, equipment, monsters, feats |
| WebSocket entry | `apps/server/api/game_ws.py` | session socket connection |
| Session runtime | `apps/server/service/game_session.py` and `apps/server/service/game_session_protocol.py` | connection manager and per-session protocol service |
| Protocol handlers | `apps/server/service/protocol/` | domain-split WebSocket handlers |
| Database | `apps/server/database/` | models, CRUD, migrations, session helpers |
| Asset storage | `apps/server/storage/` and `apps/server/service/asset_manager.py` | local/R2 storage behavior |

## React feature areas

| Area | Source | Main surface |
| --- | --- | --- |
| Auth | `apps/web-ui/src/features/auth/` | auth service and authenticated WebSocket hook |
| Session | `apps/web-ui/src/features/session/` | session selector, management panel, invitations, roles |
| Table | `apps/web-ui/src/features/table/` | table management and sync panels |
| Canvas | `apps/web-ui/src/features/canvas/` | game canvas, tools, entities, token config, layer controls |
| Actions | `apps/web-ui/src/features/actions/` | action panels and queue UI |
| Assets | `apps/web-ui/src/features/assets/` | asset and background panels |
| Character | `apps/web-ui/src/features/character/` | character panel, sheet, wizard, customization |
| Chat | `apps/web-ui/src/features/chat/` | chat panel and overlay |
| Combat | `apps/web-ui/src/features/combat/` | combat dock, command hooks, planning, DM controls |
| Compendium | `apps/web-ui/src/features/compendium/` | compendium browsing UI |
| Fog | `apps/web-ui/src/features/fog/` | fog panel and table visibility controls |
| Lighting | `apps/web-ui/src/features/lighting/` | lighting panel and vision service |
| Measurement | `apps/web-ui/src/features/measurement/` | measurement tools and advanced panel |
| Painting | `apps/web-ui/src/features/painting/` | paint panel and paint service |
| Network | `apps/web-ui/src/features/network/` | player and network panels |

## Protocol feature split

Server protocol modules under `apps/server/service/protocol/` currently split
message behavior by area:

- `auth.py`
- `tables.py`
- `sprites.py`
- `walls.py`
- `paint.py`
- `assets.py`
- `players.py`
- `characters.py`
- `combat.py`
- `encounter.py`
- `session.py`
- `chat.py`

Browser protocol code lives under `apps/web-ui/src/lib/websocket/`.

## Rust/WASM feature split

Rust engine behavior lives under `packages/rust-core/src/`:

- `render/`: WASM-facing renderer, sync, input, and draw behavior.
- `rendering/`: WebGL rendering pieces.
- `event_system/`: canvas input dispatch.
- `systems/`: paint, planning, and collision systems.
- `actions/`: table and sprite action helpers.
- `lighting/`: visibility and lighting logic.
- `net/`: WASM-facing network, asset, and table sync helpers.

TypeScript must reach this code through
`apps/web-ui/src/lib/wasm/runtime/`, not by importing generated bindings from
feature code.

## Domain package

Reusable Python tabletop behavior lives in `packages/core-table/core_table/`:

- `table.py`
- `protocol.py`
- `server.py`
- `combat.py`
- `combat_fsm.py`
- `conditions.py`
- `dice.py`
- `entities.py`
- `game_mode.py`
- `pathfinding.py`
- `session_rules.py`
- `compendiums/`

Keep FastAPI, database, WebSocket, and browser concerns out of this package.

## Where to add tests

- Server behavior: `apps/server/tests/`.
- Reusable domain behavior: `packages/core-table/tests/`.
- React behavior: colocated `__tests__` under `apps/web-ui/src/`.
- WASM runtime contracts: `apps/web-ui/src/lib/wasm/runtime/__tests__/`.
- Rust logic and WASM boundary behavior: `packages/rust-core/tests/`.

For a cross-domain change, add one focused test at each changed boundary.
