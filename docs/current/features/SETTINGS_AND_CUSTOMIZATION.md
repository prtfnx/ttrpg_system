# Settings and Customization

Audience: contributors changing account settings, session settings, table
settings, or browser-only UI preferences.

Status: current but split across several feature owners.

Last source audit: 2026-07-09

## Ownership

There is no single settings service. Current settings are owned by the feature
that applies them:

- Account settings live in `apps/server/routers/users.py` and render
  `settings.html`.
- Session settings live in `apps/server/routers/game.py` and render
  `session_settings.html`.
- Table settings flow over WebSocket through
  `apps/server/service/protocol/tables.py` and
  `apps/web-ui/src/lib/websocket/clientProtocol.ts`.
- Interface customization lives in
  `apps/web-ui/src/features/character/components/CustomizePanel.tsx`, exported
  through `features/customization/index.ts`.
- Canvas performance settings live in
  `apps/web-ui/src/features/canvas/services/performance.service.ts` and
  `components/PerformanceSettingsPanel.tsx`.

## Account Settings

`/users/settings` renders profile, security, and account controls for the
current user. The same router handles profile name updates, password changes,
email-change verification, and soft account delete. Password and account-delete
actions bump `session_version` so older JWT cookies become invalid.

Account settings persist on `User` fields in `apps/server/database/models.py`.
Pending email changes use `PendingEmailChange`.

## Session Settings

`/game/session/{session_code}/settings` is owner-only. It displays players and
active invitations, and the POST route currently updates the session name after
trimming and length validation.

Session-level rule and mode state also exists on `GameSession`:
`session_rules_json` and `game_mode`. Those values are synchronized through the
session/game-mode WebSocket handlers, not the HTML settings form.

## Table Settings

DMs can change per-table settings with `table_settings_update`. The server
validates and persists:

- dynamic lighting enabled
- fog exploration mode
- ambient light level
- grid cell size, distance per cell, and distance unit
- grid enabled and snap-to-grid
- grid color and background color

`handle_table_settings_update` applies the values to the in-memory table,
persists them through `VirtualTableUpdate`, then broadcasts
`table_settings_changed`. The browser handler updates `useGameStore` and syncs
grid/background values to the WASM runtime when available.

Layer settings are separate. `layer_settings_update` is handled by the session
protocol, persists into `VirtualTable.layer_settings`, and is applied by the
browser protocol to the runtime and store.

## Browser-Only Preferences

`CustomizePanel` changes document attributes and CSS variables immediately, then
writes the value to `localStorage`. It currently covers theme, button style,
accent color, accent opacity, and border radius.

Canvas performance settings are also browser-local. `performanceService` stores
settings under `ttrpg_performance_settings` in `localStorage`; the panel can
apply manual settings or choose a level from current performance metrics.

`GameClient.tsx` stores side panel width and visibility in `localStorage` using
`panel_left_width`, `panel_right_width`, `panel_left_visible`, and
`panel_right_visible`.

## Tests

Useful coverage lives in:

- `apps/web-ui/src/features/customization/components/CustomizePanel/__tests__/CustomizePanel.test.tsx`
- `apps/web-ui/src/features/canvas/services/__tests__/performance.service.test.ts`
- `apps/web-ui/src/features/canvas/components/__tests__/PerformanceSettingsPanel.test.tsx`
- `apps/server/tests/unit/test_tables_protocol.py`
- `apps/server/tests/unit/test_session_protocol.py`
- `apps/server/tests/unit/test_dynamic_lighting.py`

## Current Edges

- Browser-only customization is not loaded from user profile data. It follows
  the current browser and `localStorage`.
- The customization package re-exports the character feature panel instead of
  owning its own component implementation.
- Account/session HTML settings and in-game table settings use different
  routes, persistence paths, and UI surfaces.
