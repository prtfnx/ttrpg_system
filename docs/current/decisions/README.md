# Architecture Decisions

Audience: maintainers and contributors who need the reason behind current
architecture rules.

Status: usable.

Last source audit: 2026-07-09

## Format

Decision pages use this shape:

```markdown
# ADR-NNN: Title

Status: accepted | proposed | superseded
Date: YYYY-MM-DD

## Context
## Decision
## Consequences
## Links
```

Keep ADRs short. They record durable decisions, not implementation plans.

## Current Decisions

- [ADR-001: Server Authority for Multiplayer State](ADR-001-server-authority-for-multiplayer-state.md)
- [ADR-002: Command-Oriented Combat Mutations](ADR-002-command-oriented-combat-mutations.md)
- [ADR-003: React Owns UI Workflow, Server Owns Accepted State](ADR-003-react-ui-server-accepted-state.md)
- [ADR-004: WasmRuntime Owns the Rust Boundary](ADR-004-wasm-runtime-owns-rust-boundary.md)
- [ADR-005: Core-Table Is Reusable Domain Logic](ADR-005-core-table-is-reusable-domain-logic.md)

## When To Add One

Add an ADR when a rule should survive refactors and code reviews, especially
around authority, persistence, protocol shape, React/server ownership,
Rust/WASM boundaries, or documentation policy.
