# Development

Audience: contributors changing code or running local verification.

Status: current.

Last source audit: 2026-08-04

This page lists the common local commands and the checks that match the main
code areas.

## Workspace

For VS Code, open `ttrpg_system.code-workspace`. It exposes the four
semi-independent app/package leaves without also opening an overlapping
repository root. See [Editor workspace](reference/EDITOR_WORKSPACE.md) for
folder ownership, Pylance scopes, tasks, and stale-diagnostic troubleshooting.

Run from the repository root:

```powershell
pnpm install
pnpm dev
pnpm build
pnpm test
```

The root workspace uses Turbo. Package-specific commands are often clearer when
working in one area.

## Web UI

Run from `apps/web-ui`:

```powershell
pnpm.cmd exec tsc -b --pretty false
pnpm.cmd exec vitest run --project jsdom
pnpm.cmd exec vitest run --project browser
pnpm.cmd exec vitest run --project browser-components
pnpm.cmd run lint:css
pnpm.cmd run validate:css
```

Use JSDOM tests for React logic, stores, protocol adapters, and runtime
contracts. Use browser tests for real browser APIs such as canvas, WebGL, and
WASM behavior that jsdom cannot model.

For component styling and token ownership, follow
[UI theme tokens](reference/UI_THEME_TOKENS.md). Run both `lint:css` and
`validate:css` for CSS changes; they enforce different parts of the contract.

Focused combat UI/protocol checks:

```powershell
pnpm.cmd exec vitest run src/features/combat/hooks/__tests__/useCombatCommands.test.ts src/features/combat/components/__tests__/DMCombatPanel.test.tsx src/lib/websocket/__tests__/clientProtocol.test.ts
```

## Server

Run from `apps/server`:

```powershell
pytest tests/ -q
ruff check .
pnpm.cmd dlx pyright@1.1.411 --project pyrightconfig.json
```

Use unit tests for protocol handlers and services. Use integration or e2e tests
when route behavior, database state, or WebSocket lifecycle matters.

Focused combat command checks from the repository root:

```powershell
python -m pytest apps\server\tests\unit\test_combat_command_service.py apps\server\tests\unit\test_combat_protocol.py
```

## Core table

Run from `packages/core-table`:

```powershell
pytest -q
ruff check .
pnpm.cmd dlx pyright@1.1.411 --project pyrightconfig.json
```

This package should stay free of FastAPI and browser concerns. Put reusable
tabletop rules here.

Run the repository-wide Python contract from the repository root:

```powershell
pnpm.cmd dlx pyright@1.1.411 --project pyrightconfig.json
```

## Rust/WASM

Run from `packages/rust-core`:

```powershell
cargo fmt --all -- --check
cargo test
cargo check --target wasm32-unknown-unknown --features wasm-start
wasm-pack test --node
wasm-pack test --headless --chrome
```

Use native Rust tests for pure logic. Use wasm-bindgen tests for exported WASM
behavior. Use browser WASM tests for canvas, WebGL, and DOM-bound behavior.

## Documentation

Current docs live in `docs/current/`. Treat other docs as historical until
reviewed against source code.

Run from the repository root:

```powershell
pnpm.cmd run docs:check
```

The checker validates relative links and required current-doc metadata.

When adding docs:

- Start from code and tests.
- Keep each page focused.
- Link to source paths.
- Say what owns what.
- Avoid migration history unless the page is explicitly a plan.
