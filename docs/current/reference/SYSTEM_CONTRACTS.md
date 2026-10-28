# Security and reliability contracts

Audience: contributors locating the current behavior and its regression owner.

Status: usable. This index covers the first codebase audit's implemented fixes;
it is not a claim that every possible defect or operational risk is resolved.

Last source audit: 2026-10-26

Use the linked guide as the behavioral reference. Source and tests determine
whether the contract still holds after a change. Test filenames below are in
`apps/server/tests/unit/` unless a different path is stated.

| Contract | Current guide | Regression owner |
| --- | --- | --- |
| Sprite identity cannot overwrite another table/session | [Sprites](../features/SPRITES_TOKENS_AND_ENTITIES.md) | `test_sprite_identity_security.py` |
| Google email does not implicitly link an existing password account | [Auth and roles](../features/AUTH_AND_ROLES.md) | `apps/server/tests/integration/test_auth_routes.py` |
| Malformed UTF-8 color input does not panic the renderer | [Rust/WASM](../RUST_WASM_ENGINE.md) | native color tests and `packages/rust-core/tests/wasm_browser.rs` |
| CSP permits WASM and the configured asset fetch origin | [Security](../operations/SECURITY.md) | `test_http_security.py` and a FastAPI-served browser smoke |
| Drag previews do not exhaust the durable command budget | [WebSocket messages](WEBSOCKET_MESSAGES.md) | `test_game_ws_security.py`, `test_websocket_rate_limit.py` |
| Dedicated sprite requests/events apply authoritative layer visibility | [Sprites](../features/SPRITES_TOKENS_AND_ENTITIES.md) | `test_sprite_event_visibility.py`, `test_sprites_protocol.py` |
| Shared table transforms require DM authority and confirmed persistence | [Tables](../features/TABLES_AND_CANVAS.md) | `test_table_transform_persistence.py`, `test_tables_protocol.py` |
| Failed existing-table snapshot state remains pending and is retried | [Persistence](../explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md) | `test_persistence_recovery.py` |
| Table/entity/wall snapshots commit atomically | [Persistence](../explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md) | `test_atomic_table_snapshot.py` |
| Async full-table saves use bounded workers with detached snapshots | [Persistence](../explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md) | `test_async_table_persistence.py` |
| Replaced processes cannot overwrite newer committed state | [Writer handover](../operations/WRITER_HANDOVER.md) | `apps/server/tests/integration/test_writer_fencing_postgresql.py` |
| Settings publish only after confirmed save; failures require reload | [Settings](../features/SETTINGS_AND_CUSTOMIZATION.md) | `test_tables_protocol.py`, `test_table_settings_roundtrip.py` |
| Creation announcements exclude scene layers/walls/metadata | [Tables](../features/TABLES_AND_CANVAS.md) | `test_tables_protocol.py` |
| Populated copies receive independent sprite/wall identities | [Tables](../features/TABLES_AND_CANVAS.md) | `test_table_copy_persistence.py` |
| Unresolved combat commit outcomes quarantine snapshots until verified recovery | [Combat](../BATTLE_FLOW.md) | `test_combat_movement_transaction.py`, PostgreSQL outcome barrier tests |
| Authenticated combat movement and acceptance commit together; validated endpoints are saved | [Combat](../BATTLE_FLOW.md) | `test_combat_movement_transaction.py`, `apps/server/tests/integration/test_postgresql_contract.py` |
| Combat lifecycle snapshot and journal share acceptance; rejected lifecycle changes do not survive restart | [Combat](../BATTLE_FLOW.md) | `test_combat_lifecycle_persistence.py` |
| Cancelled combat commands settle before releasing ordering/publication ownership | [Combat](../BATTLE_FLOW.md) | `test_combat_cancellation.py` |
| Character stat events respect token layers, including unloaded tables | [Sprites](../features/SPRITES_TOKENS_AND_ENTITIES.md) | `test_character_protocol.py` |
| Account WebSocket authority expires with its signed credential | [Auth and roles](../features/AUTH_AND_ROLES.md) | `apps/server/tests/integration/test_websocket_auth_expiry.py` |
| Environment edits require one DM command outside combat | [Combat](../BATTLE_FLOW.md) | `test_combat_command_service.py`, browser `DMCombatPanel.test.tsx` |
| Full runtime disposal removes table listeners and invalidates stale initialization | [WASM boundary](../WASM_REACT_BOUNDARY.md) | browser `WasmRuntime.test.ts`, `WasmRuntime.lifecycle.test.tsx` |
| Table appearance settings survive save/load | [Settings](../features/SETTINGS_AND_CUSTOMIZATION.md) | `test_table_settings_roundtrip.py` |
| Connection changes cannot invalidate broadcast iteration | [Protocol boundary](../PROTOCOL_BOUNDARY.md) | `test_game_session_protocol.py` |
| Sprite quotas account for loaded live and unloaded durable tables | [Sprites](../features/SPRITES_TOKENS_AND_ENTITIES.md) | `test_sprite_quotas.py` |
| Guest login expires and preserves normal account login | [Auth and roles](../features/AUTH_AND_ROLES.md) | `test_demo_system.py`, `test_demo_guest_migration.py` and browser auth-service tests |
| Sprite requests use the domain entity index | [Sprites](../features/SPRITES_TOKENS_AND_ENTITIES.md) | `test_sprites_protocol.py` |
| Image callbacks and GL textures are released with their owner | [Rust/WASM](../RUST_WASM_ENGINE.md) | `packages/rust-core/tests/wasm_browser.rs` |
| Retired extractor cannot rewrite current protocol modules | [Server architecture](../SERVER_ARCHITECTURE.md) | retired-script invocation and source refusal |

## Limits to retain in reviews

- The immediate support scope is [one trusted session](../explanation/TRUSTED_SESSION_SCOPE.md).
- TODO: complete worker migration, linked character/token/encounter stat repair,
  and general table/settings/XP operation-outcome recovery.
- TODO: independent core-table adapters and browser import-cycle cleanup.
- Fog/vision hides rendered pixels; it is not a confidentiality boundary for
  all world data delivered to the browser. TODO: review every sensitive payload
  before supporting adversarial clients.
- PostgreSQL ownership is single-active-process coordination, not horizontal scaling.
- Canvas/sprite/paint journals cover their supported commands, not every
  table/settings mutation. Memory-resident dirty snapshots do not make
  unconfirmed edits crash-durable.
- CSP still allows inline scripts/styles; auth/demo rate limits are process-local.
- A real deployed provider, capacity profile, independent backup, or restore drill
  cannot be verified from source alone.
- The current SQLite importer and standalone R2 admin CLI have documented
  integration limitations. See [Database migrations](../operations/DATABASE_MIGRATIONS.md)
  and [Observability and logging](../operations/OBSERVABILITY_AND_LOGGING.md).

Dated audit findings, commit maps, and test-run totals belong outside current
docs. Update these contracts with code changes instead of appending another
historical fix report to this directory.
