# Add a web UI panel

Audience: contributors adding a visible React panel or tab.

Status: usable.

Last source audit: 2026-07-08

## Pick the right surface

The app has more than one panel surface.

Use `RightPanel` when the feature is a persistent side-panel workflow:

- characters;
- tables;
- chat;
- lighting;
- fog;
- compendium;
- players;
- customization.

Use `ToolsPanel` when the feature is a canvas tool or quick canvas control:

- selecting tools;
- drawing;
- measurement;
- paint;
- layers;
- lighting tool controls;
- dev-only canvas diagnostics.

Main files:

- `apps/web-ui/src/app/RightPanel.tsx`
- `apps/web-ui/src/features/canvas/components/ToolsPanel.tsx`

## Add a RightPanel tab

1. Put feature code under `apps/web-ui/src/features/<feature>/`.
2. Add or update the feature `index.ts` export if the folder uses barrel
   exports.
3. Import the panel component in `RightPanel.tsx`.
4. Add a value to the `TabId` union.
5. Add role visibility in `TAB_VISIBLE`.
6. Add the tab to `DEFAULT_TAB_ORDER` when it should be reachable by default.
7. Add the rendered panel under the `tabContent` switch.
8. Add tests near the feature or under the existing panel tests.

Role helpers live in `apps/web-ui/src/features/session/types/roles.ts`:

- `isDM`
- `isElevated`
- `canInteract`
- `isSpectator`

## Add a ToolsPanel control

1. Decide whether the control is a tab, a button, or a nested panel.
2. Add local UI state only when the state is truly local.
3. Use `useGameStore` for shared table/canvas state.
4. Use `useRenderEngine` or `useWasmRuntime` for runtime-owned behavior.
5. Use `ProtocolService` or protocol hooks only when the action crosses the
   server boundary.
6. Gate by role with `isDM`, `isElevated`, or `canInteract`.
7. Add a focused component or hook test.

Canvas tools that change Rust input mode usually update `activeTool` in
`useGameStore`; `ToolsPanel` then maps that active tool to a `RenderEngine`
input mode.

## State ownership

- Local component state: temporary open/closed controls and form drafts.
- Feature store: feature workflow state.
- `useGameStore`: shared table, canvas, layer, role, and connection state.
- `WebClientProtocol`: server messages.
- `WasmRuntime`: Rust object lifecycle and engine calls.

Do not add browser globals as a shortcut for state.

## Styling

Use the local CSS module for the component or feature. Match the current dense,
tool-like UI rather than adding a landing-page or marketing layout.

Use existing shared components when available under `apps/web-ui/src/shared/`.

## Verification

Run from `apps/web-ui`:

```powershell
pnpm.cmd exec tsc -b --pretty false
pnpm.cmd exec vitest run --project jsdom
```

For a focused change, run the colocated test file. Use browser tests only when
the panel depends on real browser APIs that jsdom cannot model.

## Checklist

- The panel is on the correct surface.
- Role visibility is explicit.
- State owner is clear.
- Server-bound actions use protocol helpers or hooks.
- WASM-bound actions go through runtime hooks, not generated bindings.
- Tests cover visible behavior and any boundary call.
