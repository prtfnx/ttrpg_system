# ADR-005: Core-Table Is Reusable Domain Logic

Status: accepted; implementation incomplete
Date: 2026-07-09

## Context

The server needs tabletop behavior that can be tested without FastAPI, browser
state, or deployment setup. The repository provides `packages/core-table` as a
Python package named `ttrpg-core-table`, with modules for protocol messages,
tables, combat, dice, conditions, pathfinding, game mode, session rules, and
compendium loaders.

Current server code imports it for reusable behavior, for example
`core_table.protocol`, `core_table.server`, `core_table.table`,
`core_table.combat`, `core_table.session_rules`, and `core_table.dice`.

## Decision

The intended boundary puts reusable rules and models in `packages/core-table`
and infrastructure in the server. Current rule modules can be tested without
FastAPI or browser state, but the package is not fully infrastructure-free:
`TableManager` owns database sessions/persistence, wall actions import server
CRUD, and token/compendium resolution imports server database code. These paths
also rely on SQLAlchemy outside the package's declared independent contract.

TODO: move database adapters and worker/transaction ownership into the server,
then test the package in an isolated installation. This extraction is deferred
for the one trusted session scope. Browser and Rust code do not become direct
owners of Python domain state.

## Consequences

- Put reusable rules and data models in `packages/core-table/core_table/`.
- Put HTTP, WebSocket, database, auth, deployment, and session socket behavior
  in `apps/server`.
- Test core-table behavior with the package tests before wiring it through the
  server.
- Keep protocol enums/models shared, but keep handler registration and
  broadcast behavior in server protocol modules.

## Links

- [Server architecture](../SERVER_ARCHITECTURE.md)
- [App architecture](../APP_ARCHITECTURE.md)
- [State ownership](../STATE_OWNERSHIP.md)
- [Testing strategy](../TESTING_STRATEGY.md)
