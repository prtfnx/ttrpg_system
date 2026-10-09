# Settings and Customization

Audience: contributors changing account settings, session settings, table
settings, or browser-only UI preferences.

Status: current but split across several feature owners.

Last source audit: 2026-09-22

## Per-member selection mode

The Paint panel offers **Select sprites and paint together**. The default is
separate sprite selection and paint editing, including paint marquee selection.
The authenticated GET/PUT `/game/api/sessions/{code}/selection-preference`
route stores `selection_mode` on the caller's game-session membership. It
accepts `separate` or `combined`, not a client user ID. Responses are private
and non-cacheable. Removing the membership removes its preference.

`selectionPreferences.ts` loads and saves this scope without `localStorage`.
Loading a different user/session starts in separate mode; late responses from
the old scope are ignored. The checkbox stays disabled during load/save. A
failed save keeps the accepted mode and shows an error. The rest of this page
retains its earlier audit date; this section is checked against the membership
route and `test_selection_preferences.py` on 2026-10-06.

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
- Interface preference loading, validation, persistence, and document updates
  live in `apps/web-ui/src/features/customization/uiPreferences.ts`.
- Canvas performance diagnostics live in
  `apps/web-ui/src/features/canvas/services/performance.service.ts` and the
  read-only `components/PerformanceSettingsPanel.tsx`.

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

`handle_table_settings_update` validates a settings draft and persists it
through a worker-owned `VirtualTableUpdate` before installing live values or
broadcasting `table_settings_changed`. A false save result or exception sends
`table_settings_save_failed` and leaves live settings unchanged. The error
asks the caller to reload before retrying: a lost connection can leave the
commit outcome uncertain. Cancellation waits for the submitted write to settle
and installs confirmed committed values before releasing mutation ownership.
The browser handler updates `useGameStore` and syncs grid/background values to
the WASM runtime when available. Failure, cancellation, and real database
save/reload regressions are in `test_tables_protocol.py` and
`test_table_settings_roundtrip.py`. This path was reviewed on 2026-10-06.

TODO: durable operation receipts and automatic reconciliation for unknown
commit outcomes; these are not current settings guarantees.

Layer settings are separate. `layer_settings_update` is handled by the session
protocol, persists into `VirtualTable.layer_settings`, and is applied by the
browser protocol to the runtime and store. The server scopes the target table
to the authenticated session and broadcasts only after persistence succeeds.

Layer settings, game mode, session rules, rules reads, and player active-table
state use worker-owned synchronous ORM sessions. Validation, authorization,
cache invalidation, and WebSocket delivery remain on the event-loop thread.

## Browser-Only Preferences

`initializeUiPreferences` runs before React mounts. It reads supported values
from `localStorage`, rejects unknown choices and out-of-range numbers, then
applies the current preferences to the document. Storage failures fall back to
the defaults without preventing the UI from loading.

`CustomizePanel` applies and saves changes immediately. It currently covers:

- dark, light, high-contrast, cyberpunk, and forest themes through
  `data-theme`;
- blue, purple, green, red, and orange accent schemes through
  `data-color-scheme`;
- rounded, sharp, and pill buttons through `data-button-style`;
- accent opacity through `--accent-opacity` and
  `--accent-overlay-percent`;
- the shared radius scale through `--custom-radius`.

Reset applies and persists the complete default preference set. Theme and
accent selectors remap shared semantic tokens, so token-driven components
change consistently without feature code branching on the selected theme.

Canvas performance diagnostics are observational, not settings.
`performanceService` measures renderer submission timing and reads counters
from the active WASM renderer. The panel does not persist a quality level or
claim to clear renderer-owned caches. See [Rust/WASM engine](../RUST_WASM_ENGINE.md#renderer-diagnostics)
for the metric ownership and lifetime contract.

`GameClient.tsx` stores side panel width and visibility in `localStorage` using
`panel_left_width`, `panel_right_width`, `panel_left_visible`, and
`panel_right_visible`.

## Tests

Useful coverage lives in:

- `apps/web-ui/src/features/customization/components/CustomizePanel/__tests__/CustomizePanel.test.tsx`
- `apps/web-ui/src/features/customization/__tests__/uiPreferences.test.ts`
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

## Save/load contract

Table appearance settings survive full snapshot serialization and database
reload, including false `grid_enabled` and `snap_to_grid` values and custom
grid/background colors. The direct settings route and full-table save path
must preserve the same fields. `apps/server/tests/unit/test_table_settings_roundtrip.py`
covers this boundary. See [Tables and canvas](TABLES_AND_CANVAS.md) for shared
transforms and the distinction from browser camera preferences.
