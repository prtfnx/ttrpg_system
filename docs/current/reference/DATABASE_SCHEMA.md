# Database schema

Audience: contributors changing persistence, migrations, or server state.

Status: partial. This page describes the current model families and migration
flow. It is not a complete column-by-column schema.

Last source audit: 2026-07-17

## Source of truth

SQLAlchemy models live in `apps/server/database/models.py`.

Database setup lives in `apps/server/database/database.py`.

Database CRUD and helpers live in:

- `apps/server/database/crud.py`
- `apps/server/database/session_utils.py`
- `apps/server/service/combat_persistence_service.py`
- `apps/server/service/asset_manager.py`

Alembic revisions live in `apps/server/database/alembic/versions/`.

## Database URL

`DATABASE_URL` controls the database connection.

If it is unset in development, the server uses local SQLite:

```text
apps/server/ttrpg.db
```

Production requires PostgreSQL. Render startup applies `alembic upgrade head`
and production startup verifies that the database and repository Alembic heads
match. `Base.metadata.create_all()` is limited to isolated tests.

## Current model families

| Table | Model | Purpose |
| --- | --- | --- |
| `users` | `User` | account identity, password hash, verification, Google id, session version |
| `game_sessions` | `GameSession` | session metadata, owner, session code, ban list, rules JSON, game mode |
| `game_players` | `GamePlayer` | user membership in a session, role, connection state, active table |
| `virtual_tables` | `VirtualTable` | persisted table state, dimensions, position, layers, lighting, grid, terrain, cover |
| `entities` | `Entity` | table sprites/tokens, ownership, character link, transform, vision, token stats |
| `assets` | `Asset` | uploaded asset metadata and R2 object references |
| `session_assets` | `SessionAsset` | session visibility and display names for global R2 assets |
| `asset_upload_intents` | `AssetUploadIntent` | durable staged-upload confirmation state |
| `session_characters` | `SessionCharacter` | character JSON blobs scoped to a session |
| `character_permissions` | `CharacterPermission` | explicit character sharing and control grants |
| `character_drafts` | `CharacterDraft` | resumable, versioned character-creation drafts |
| `session_invitations` | `SessionInvitation` | invite code, role, limits, expiry, active state |
| `email_verification_tokens` | `EmailVerificationToken` | signup verification token state |
| `password_reset_tokens` | `PasswordResetToken` | password reset token hashes and expiry |
| `pending_email_changes` | `PendingEmailChange` | pending email-change token hashes and expiry |
| `combat_encounters` | `CombatEncounter` | current combat snapshot by encounter |
| `combat_actions` | `CombatActionJournal` | accepted combat command journal and idempotency key |
| `choice_encounters` | `ChoiceEncounter` | current lightweight choice-encounter snapshot |
| `choice_encounter_events` | `ChoiceEncounterEvent` | append-only accepted choice transitions |
| `walls` | `Wall` | persistent wall/door segments for movement, light, sight, and sound |
| `audit_logs` | `AuditLog` | security and audit events |
| `character_logs` | `CharacterLog` | per-character action log entries |
| `chat_messages` | `ChatMessage` | persisted session chat messages |
| `paint_strokes` | `PaintStroke` | persisted table drawing strokes |

## Important relationships

- `GameSession.owner_id` points to `User`.
- `GamePlayer` joins users to sessions and stores the session role.
- `VirtualTable.session_id` points to `GameSession`.
- `Entity.table_id` points to `VirtualTable.id`.
- `Wall.table_id` and `PaintStroke.table_id` point to
  `VirtualTable.table_id`.
- `Entity.character_id` can point to `SessionCharacter.character_id`.
- `CombatActionJournal.encounter_id` points to
  `CombatEncounter.encounter_id`.

Several gameplay fields are JSON strings in the database. Examples include
session rules, table layer settings, combatants, action logs, terrain, cover,
character data, chat message payloads, and paint stroke data.

## Combat persistence

Accepted combat commands are persisted through
`CombatPersistenceService.persist_accepted`.

The service:

- finds duplicate commands by `encounter_id`, requester key, and `sequence_id`;
- creates or updates a `combat_encounters` snapshot;
- increments `state_version`;
- appends a `combat_actions` row with command payload, result payload,
  state-before JSON, state-after hash, and creator.

The `combat_actions` table has a uniqueness constraint on
`encounter_id`, `requester_key`, and `sequence_id`.

## Asset persistence

Asset metadata is stored in `assets`.

R2 object operations are handled by `R2AssetManager`; server-side upload,
download, validation, and permission behavior is coordinated by
`ServerAssetManager`.

The database stores metadata such as:

- original asset name;
- R2 asset id;
- content type;
- file size;
- xxHash;
- uploader and session links;
- R2 key and bucket.

## Migrations

Alembic revisions live under:

```text
apps/server/database/alembic/versions/
```

The current PostgreSQL baseline is `0001_postgresql_baseline`. Alembic records
the deployed revision in `alembic_version`. The old numbered SQLite runner and
ledger were retired; they are not an upgrade path for existing SQLite files.

## Change checklist

1. Update the SQLAlchemy model.
2. Add or update CRUD/session helper behavior.
3. Generate and review an incremental Alembic revision.
4. Update tests for model, CRUD, route, or protocol behavior.
5. Update references for environment, protocol, or feature behavior if the
   persisted contract changed.
6. For combat persistence changes, update
   [Combat commands](COMBAT_COMMANDS.md) if command idempotency, rollback, or
   journal behavior changes.
