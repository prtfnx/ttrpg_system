# Web UI architecture

Audience: contributors changing React, browser state, protocol integration, or
web styling.

Status: current.

Last source audit: 2026-08-03

The web UI is a Vite React app. React owns user workflows and browser state.
Protocol code owns the WebSocket connection. `WasmRuntime` owns Rust/WASM.

## Main areas

- `apps/web-ui/src/app/`: app-level providers and shell components.
- `apps/web-ui/src/features/`: feature UI and feature services.
- `apps/web-ui/src/shared/`: shared components, hooks, styles, test helpers,
  and utilities.
- `apps/web-ui/src/shared/styles/tokens.css`: primitive design scales and
  palette.
- `apps/web-ui/src/shared/styles/theme.css`: semantic, component, and
  theme/customization token mappings.
- `apps/web-ui/src/features/customization/uiPreferences.ts`: validated
  browser preference loading and document-level token hooks.
- `apps/web-ui/src/lib/websocket/`: client protocol and WebSocket message
  types.
- `apps/web-ui/src/lib/api/ProtocolService.ts`: singleton access to the active
  protocol instance.
- `apps/web-ui/src/lib/wasm/runtime/`: TypeScript boundary for Rust/WASM.
- `apps/web-ui/src/store.ts`: broad Zustand store for game state.

Combat feature code lives under `apps/web-ui/src/features/combat/`.

Important combat pieces:

- `CombatDock`: mounted once on the main canvas play surface.
- `useCombatCommands`: builds and sends canonical combat command envelopes.
- `useCombatSelection`: selected actor lookup from the role-filtered combat
  state.
- `ActionPanel`, `MovementPlanner`, `CommitButton`, and `DMCombatPanel`:
  player and DM combat workflow surfaces.
- `plannedCommand.service.ts`: turns queued UI intent into schema-complete
  command payloads.
- `planning.service.ts`: preview-only WASM planning access.

## Providers

`ProtocolProvider`:

- Creates `WebClientProtocol`.
- Resolves the active session code.
- Registers the protocol in `ProtocolService`.
- Connects and disconnects the WebSocket.
- Exposes protocol connection state through React context.

`WasmRuntimeProvider`:

- Creates one `WasmRuntime`.
- Passes the active protocol into the runtime.
- Registers the current runtime for non-React integration code.
- Disposes the runtime on unmount.

## State ownership

- React component state is for local UI interaction.
- Feature stores are for feature-specific state.
- `useGameStore` is for shared table, sprite, wall, layer, grid, role, and
  connection state.
- `WebClientProtocol` is for network messages and protocol handlers.
- `WasmRuntime` is for Rust object lifecycle and renderer access.

Development panels do not create independent WebSocket connections. Network
diagnostics must read the active `ProtocolProvider` state so diagnostics cannot
replace handlers or disconnect the application transport.

Avoid adding new browser globals as state. If a value must cross domains, pass
it through a provider, store, protocol method, or runtime port.

## Styling ownership

`apps/web-ui/src/index.css` loads primitive tokens before semantic theme
tokens and owns shared focus-visible and disabled-control behavior. Feature
components keep static styles in their CSS or CSS modules and consume tokens
from the shared system.

Use semantic/component tokens for colors and interaction states. Use primitive
spacing, size, radius, typography, and font-weight scales for geometry. Keep
inline styles for genuinely runtime-derived values rather than static visual
rules.

See [UI theme tokens](reference/UI_THEME_TOKENS.md) for the complete contract
and verification commands.

## Feature code rules

- UI components should call hooks, stores, services, or runtime ports.
- UI components should not import generated WASM bindings.
- Protocol handlers should normalize server messages before updating store or
  runtime state.
- Feature hooks and development tools must not construct a second network
  client. Use `ProtocolProvider` or `ProtocolService` for browser transport.
- Shared utilities should not depend on a mounted React tree unless their name
  makes that dependency clear.
- Tests should mock the boundary being used: protocol, runtime, store, or DOM.

Combat UI rules:

- Combat mutations should go through `useCombatCommands`.
- Do not send direct combat mutation websocket messages from components.
- Clear planned turns from `ACTION_RESULT` / `ACTION_REJECTED`, not
  optimistically on click.
- Keep `sendProtocolMessage` for non-combat mutations or approved
  query/suggestion messages only.

## WASM access

Use exports from `apps/web-ui/src/lib/wasm/runtime/`:

- `useWasmRuntime`
- `useRenderEngine`
- `useActionsEngine`
- `useWasmStatus`
- `WasmRuntimePort`

Do not import generated `ttrpg_rust_core` files from feature code.

For combat, WASM access is preview-only. The planning service can show ghost
movement, local distance estimates, LOS previews, and AoE candidates. The
accepted command still goes to the server for final validation and mutation.

## Verification

- TypeScript: `pnpm.cmd exec tsc -b --pretty false` from `apps/web-ui`.
- JSDOM tests: `pnpm.cmd exec vitest run --project jsdom` from `apps/web-ui`.
- Browser tests: `pnpm.cmd exec vitest run --project browser` from
  `apps/web-ui`.
- CSS lint: `pnpm.cmd run lint:css` from `apps/web-ui`.
- Token validation: `pnpm.cmd run validate:css` from `apps/web-ui`.
