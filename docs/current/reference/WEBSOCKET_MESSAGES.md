# WebSocket messages

Audience: contributors changing browser/server protocol behavior.

Status: partial. This page catalogs the currently registered server handlers
and the main browser message families. It does not document every payload field.

Last source audit: 2026-10-16

## Envelope identities

Sprite create/remove/move/scale/rotate/update and compendium sprite
add/update/remove, and `character_update`, require a nonempty `message_id` and the original envelope
`timestamp` in epoch seconds. Resends preserve both.
Missing/null timestamps and identities reject instead of creating fresh retry
intent at decode time. This is separate from paint/canvas `issued_at`, which uses
epoch milliseconds. Old clients without these sprite envelope fields must upgrade.

Standalone `paint_object_create`, `paint_object_update` and
`paint_object_delete` require `issued_at`, the original intent time in epoch
milliseconds. Retries retain it together with the exact operation ID/body.
The server rejects expired intent even when its earlier receipt was removed;
clients without this field must upgrade before writing paint.

Message, correlation and causation IDs are bounded to 128 characters by the
shared envelope schema. This bounds response correlation overhead; clients
must not attach arbitrary-size strings as identities. Generated Python and
browser schemas share the same boundary.

## Stat reconciliation request schema

`character_update` reserves a closed `stat_reconciliation` branch. Its data
contains only `character_id` and `stat_reconciliation`. The latter is exactly
`{ "mode": "dry_run" }` or
`{ "mode": "apply", "expected_digest": "<64 lowercase hexadecimal characters>" }`.
It cannot mix ordinary `updates`, a supplied source version, or extra fields
into this branch. The shared schema validates both modes before dispatch;
authorization and current-state preconditions remain server responsibilities.
Normal character deltas retain their existing shape, with original identity/time
required. Atomic actor/session-scoped receipts bind the complete patch, expected
version and reconciliation digest. Acceptance exposes `accepted_version` and
current `version`; replay asks for resync and may report `character_archived`.
Current database edit authority gates receipt disclosure. Unknown commit/cache
outcomes remain fenced until current projections install. A denied lookup cannot
prove rollback; the browser retains its uncertain original unless `not_accepted`
is explicitly proved with the original operation identity. Negotiated
`session-operations-v2` retains complete character/repair, choice and multiclass
original envelopes across same-tab reloads. The four-domain v1 fallback remains
closed; unsupported v2 records stay dormant. Reconnect retries wait for matching
authenticated welcome. See
[Characters](../features/CHARACTERS_AND_COMPENDIUMS.md).

## Uncertain persistence outcomes

The closed `error` payload schema includes `combat_outcome_unknown` and
`character_outcome_unknown` with `outcome: unknown` and `resync_required: true`.
The required `error` string describes the situation. Combat errors may identify
the nonnegative `sequence_id`; character errors may identify `character_id`
(1-64 characters). A session-wide recovery lookup may omit that identity.
Envelope `causation_id` identifies the request that triggered the response.
An unknown outcome is not proof of rollback; read/reconcile saved state before
creating a replacement mutation. `operation_id_conflict` rejects reuse of a
recovered character request identity for different update data.

These fields are declared in the canonical schema and both generated copies.
`tests/test_protocol_schema.py` checks valid server-shaped recovery errors and
rejects invalid fields without opening the payload to arbitrary properties.

## Text sprite save acknowledgements

Text sprite command fields are checked against source on 2026-10-06. A
`sprite_create` carries `sprite_data.metadata.text_sprite` (encoded JSON is
accepted), measured `width`/`height`, the captured top-level `table_id`, and a
client UUID. `sprite_update` carries the same descriptor/dimensions plus
`sprite_id` and `expected_text_revision`. The server assigns/increments
`text_revision`; stale edits return `error` with `code: text_version_conflict`
and the current revision. Normal layer filtering and sprite-control rules apply.

`sprite_response` confirms creation. `success` confirms an edit and carries
accepted `updates`; the sender applies those only to the active table.
`textSpriteCommands.ts` matches `correlation_id` to the outgoing `message_id`,
registers before sending, and removes its handlers on completion, cancellation,
or the 15-second deadline. Unrelated acknowledgements cannot close the editor.
There is no automatic retry: a timeout or local cancellation cannot prove the
server did not save. Check/reload saved state before retrying an uncertain write.
See [Sprites, tokens, and entities](../features/SPRITES_TOKENS_AND_ENTITIES.md)
for descriptor limits, database ownership and visibility.

## Source of truth

`packages/core-table/protocol/message.schema.json` is the canonical envelope,
message registry, and incrementally typed payload schema. Run
`python packages/core-table/scripts/generate_protocol_types.py` to generate
the Python enum, TypeScript enum, and packaged schema; `--check` detects drift.
`apps/web-ui/src/lib/websocket/message.ts` and
`packages/core-table/core_table/protocol.py` validate messages against that
shared schema. Server registration lives in `service/protocol/base.py`.

The registry also contains paint-object envelopes. The server registers
`paint_object_create`, `paint_object_update`, `paint_object_delete`,
`paint_snapshot_request`, `paint_preview`, and `paint_preview_cancel`; it
responds with `paint_object_event` and bounded `paint_snapshot_chunk` messages
and relays authorized previews. Envelope metadata is validated by the shared
message schema, while nested objects use
`packages/core-table/protocol/paint_object.schema.json`. The browser uses this
path exclusively. Retired stroke names are absent from the shared registry;
the raw server boundary recognizes only those exact legacy strings to return
`upgrade_required` without decoding, dispatching, or writing them. The same
compatibility rule applies to entries inside a batch.

Paint previews are best-effort and non-durable. The server overwrites any
client-supplied actor ID with authenticated identity, checks interactive
membership for the requested table through a five-second cache, validates the
draft contract, and drops relay payloads over 16 KiB. Preview and cancellation
messages do not receive revisions or operation-ledger records.

An enum value does not by itself register an inbound handler or authorize a
caller. Verify direction, registration, payload validation, and role checks.
See [Protocol boundary](../PROTOCOL_BOUNDARY.md).

## Message envelope

Browser messages use this shape:

```ts
{
  type: MessageType;
  data?: Record<string, unknown>;
  client_id?: string;
  timestamp?: number;
  version: string;
  priority: number;
  sequence_id?: number;
  message_id?: string;
  causation_id?: string;
  correlation_id?: string;
}
```

The Python `Message` dataclass uses the same core fields. Correlation
fields connect an accepted command to its response without trusting them for
identity or authorization. Normal priority is `5`; lower numbers are more
urgent in the existing comments.

## Table creation identity and outcome

`new_table_request` requires its original nonempty `message_id` (up to 128
characters), bounded numeric timestamp and closed data. `table_name` is 1-50
characters. Optional integer width/height are 500-10,000 (default 2,000),
`local_table_id` is bounded to 128 characters, and exactly one of the optional
`source_table_id` UUID or `table_data` object may supply content. Imports retain
their 5 MiB/5,000-entity server bounds. Copy/import fields are admitted by both
shared validators; connection identity supplies all authority and session scope.

The normalized original request identifies `table_create` within the numeric
session and actor scope. Import bodies contribute a canonical content digest;
copy identity names the source, whose snapshot is captured only for first
acceptance. A retry cannot recopy a changed/deleted source into another table.
Table, paint-state initialization and receipt share one transaction. Reusing an
accepted identity with changed input conflicts; different identities create
different tables. Current database DM authority is checked before public replay.

`new_table_response` includes `operation_id`, `table_id`, original local mapping,
and the current table snapshot. Replays set `replayed` and `resync_required` and
never overwrite a resident server table from an old read. A later-deleted target
returns `table_deleted` without scene data. Receipts do not expire by age while
the session is retained. An unknown commit returns `error` with `outcome_unknown`,
original operation/target identities and `resync_required`. Serialized state work
and background snapshots remain fenced until settlement/cache installation.

Only requesting DMs receive scene contents. Installation announces public table
metadata; resident duplicates do not rebroadcast. Large creation replies use the
bounded ordered snapshot outbox. Notification failure after acceptance reports
success requiring resync. See [Tables](../features/TABLES_AND_CANVAS.md).

## XP award identity and outcome

`xp_award` requires the original nonempty envelope `message_id` (up to 128
characters), a bounded numeric timestamp and a closed data object. Required data:
`character_id` (1-64 characters) and integer `amount` (1-1,000,000). Optional data:
`source` (1-50 characters, default `other`), `description` (up to 300), and the
legacy `session_code` hint. The connection supplies authority and session scope;
payload session hints cannot change them. Unknown fields reject.

The original envelope identity is the XP operation identity. Repeat that identity
with the same normalized input to resolve one intent, including after reconnect
or server restart. Use a new identity for another deliberate award. A changed
payload conflicts; current database DM authority is required before receipt
lookup. XP, version, audit and result commit together. Receipts remain for the
retained session lifetime and are not expired by an age-based cleanup.

`xp_award_response` reports the original `operation_id`, amount, XP/level result
and source version. Fresh acceptance includes the canonical character. A replay
omits old source data and sets `replayed` and `resync_required`: read current
character state instead of installing its historical version. Unresolved commit
lookup returns `success: false`, `code: outcome_unknown`, `outcome: unknown`,
the original operation/character identities and `resync_required`. It does not
prove rejection. Retry only the original identity/body, never a new award guessed
from a timeout. Publication failure after acceptance reports success requiring
resync. See [Characters](../features/CHARACTERS_AND_COMPENDIUMS.md).

## Authenticated connection context

The WebSocket handshake and session join establish the authoritative
`user_id`, `username`, role, session code, and database session ID. Inbound
message payloads are untrusted and must not override any of those values.
Handlers resolve identity through the registered `client_id` and resolve the
session through `GameSessionProtocolService`; if either context is absent, the
operation fails closed. Payload usernames remain valid only when they identify
a command target, such as the player selected for a kick or ban.

Committed role changes update the authorization context for every socket owned
by the affected user before `player_role_changed` is broadcast. Durable
membership removal sends a terminal error, removes every matching socket from
both server registries, and closes them with policy code `1008` and reason
`Kicked from session`. Repeating that cleanup has no effect.

Password reset or change closes all of the account's sockets with reason
`Account session revoked`. Account disablement uses reason `Account disabled`.
Both are terminal policy closes (`1008`), and the server removes authorization
context before awaiting the close notification.

## Registered server inbound messages

These messages are registered in `ServerProtocol.init_handlers`.

| Domain | Client sends | Main server module |
| --- | --- | --- |
| Core | `ping`, `batch_request` | `protocol/base.py` |
| Tables | `new_table_request`, `table_request`, `table_update_request`, `table_scale`, `table_move`, `table_delete`, `table_list_request`, `table_active_request`, `table_active_set`, `table_active_set_all`, `table_settings_update` | `protocol/tables.py` |
| Players | `player_ready`, `player_unready`, `player_status_request`, `player_list_request`, `player_kick_request`, `player_ban_request` | `protocol/players.py` |
| Sprites | `sprite_request`, `sprite_create`, `sprite_remove`, `sprite_move`, `sprite_scale`, `sprite_rotate`, `sprite_update`, `sprite_drag_preview`, `sprite_resize_preview`, `sprite_rotate_preview` | `protocol/sprites.py` |
| Assets | `asset_upload_request`, `asset_download_request`, `asset_list_request`, `asset_upload_confirm`, `asset_delete_request`, `asset_hash_check` | `protocol/assets.py` |
| Compendium sprites | `compendium_sprite_add`, `compendium_sprite_update`, `compendium_sprite_remove` | `protocol/sprites.py` |
| Characters | `character_save_request`, `character_load_request`, `character_list_request`, `character_delete_request`, `character_update`, `character_log_request`, `character_roll`, `xp_award`, `multiclass_request` | `protocol/characters.py` |
| Character drafts | `character_draft_create_request`, `character_draft_list_request`, `character_draft_load_request`, `character_draft_update_request`, `character_draft_finalize_request`, `character_draft_abandon_request` | `protocol/characters.py` |
| Walls and doors | `wall_create`, `wall_update`, `wall_remove`, `door_toggle` | `protocol/walls.py` |
| Paint | `paint_object_create`, `paint_object_update`, `paint_object_delete`, `paint_snapshot_request`, `paint_preview`, `paint_preview_cancel` | `protocol/paint.py` |
| Measurements | `measurement_upsert`, `measurement_delete`, `measurement_clear`, `measurement_sync` | `protocol/measurements.py` |
| Session | `layer_settings_update`, `game_mode_change`, `session_rules_update`, `session_rules_request` | `protocol/session.py` |
| Combat | `combat_state_request`, `cover_zones_sync`, `attack_preview`, `ai_action`, `combat_command` | `protocol/combat.py` |
| Encounters | `encounter_start`, `encounter_end`, `encounter_choice`, `encounter_roll` | `protocol/encounter.py` |
| Chat | `chat`, `chat_request`, `chat_moderate` | `protocol/chat.py` |

If a message is only present in an enum but not registered here, it is not a
normal server inbound handler unless another path handles it explicitly.

The unused `connection_status_request` and `connection_status_response`
messages were retired on 2026-08-12. Liveness is already owned by WebSocket
state, heartbeat handling, and reconnect state; do not reintroduce a second
status-query API without a production consumer and a distinct requirement.

## Main server response and broadcast families

The server sends responses and broadcasts with the same `Message` envelope.
Common families include:

- Core: `pong`, `success`, `error`, `batch_response`, `welcome`.
- Tables: `new_table_response`, `table_response`, `table_data`,
  `table_update`, `table_list_response`, `table_active_response`,
  `table_active_set_all_response`, `table_settings_changed`.
- Players: `player_joined`, `player_left`, player-status responses and broadcasts,
  `player_list_response`,
  `player_kick_response`, `player_ban_response`, and `player_role_changed`.
- Sprites: `sprite_response`, `sprite_data`, `sprite_update`,
  `sprite_remove`, `sprite_move`, `sprite_scale`, `sprite_rotate`, preview
  messages.
- Assets: upload, download, list, delete, and hash responses.
- Characters: save, load, list, delete, update, log, roll, XP, and multiclass
  responses.
- Walls and paint: `wall_data`, `paint_object_event`,
  `paint_snapshot_chunk`, and authorized best-effort paint previews.
- Session: `game_mode_state`, `session_rules_changed`,
  `layer_settings_update`.
- Combat: `combat_state`, `action_result`, `action_rejected`,
  `initiative_order`, `turn_start`, `conditions_sync`,
  `cover_zones_sync`, `attack_preview_result`, `ai_suggestion`,
  opportunity-attack messages.
- Encounters: `encounter_state`, `encounter_result`.
- Chat: `chat`, `chat_confirmation`.

## Browser protocol owner

Browser WebSocket behavior lives in
`apps/web-ui/src/lib/websocket/clientProtocol.ts`.

That file owns:

- connection lifecycle;
- heartbeat and reconnect behavior;
- batching;
- registered browser handlers;
- typed send helper methods;
- store/runtime updates after server messages.

Reconnect behavior has one owner. `WebClientProtocol` retries transient
transport and server-availability closes with capped exponential backoff and
full jitter, up to ten attempts. Manual disconnect cancels pending work.
Heartbeat timeout closes the stale socket and enters the same retry path.
Close codes for normal shutdown, policy/auth rejection, protocol errors,
unsupported or invalid payloads, oversized messages, and banned users do not
retry. `ProtocolProvider` reflects protocol recovery in React connection state.

Feature code should prefer protocol helper methods or focused hooks over raw
`sendMessage` calls. Combat mutations are stricter: use `combat_command`, not
new direct mutation messages.

One ordered writer per socket uses the bounded `WS_SEND_TIMEOUT_SECONDS`
deadline. Mutation handlers enqueue frames without waiting for peer sends.
Overflow/send failure disconnects that peer for recovery. Table/paint snapshots
have bounded ordered streams instead of consuming the ordinary event byte budget.
See [Action confirmation](ACTION_CONFIRMATION.md) for limits and outcome semantics.

## Adding or changing a message

1. Update `packages/core-table/protocol/message.schema.json`, including payload rules.
2. Run `python packages/core-table/scripts/generate_protocol_types.py`; do not hand-edit generated enums.
3. Add or update the client send helper or handler in `clientProtocol.ts`.
4. Add or update the matching server protocol handler.
5. Register the server handler in `ServerProtocol.init_handlers`.
6. Add focused client and server tests.
7. Update this reference if the message family or handler ownership changes.

For combat writes, read [Combat commands](COMBAT_COMMANDS.md) first. New direct
combat mutation messages are usually the wrong boundary.

## Transport budgets and close behavior

`utils/websocket_rate_limit.py` accounts for commands and disposable sprite
drag/resize/rotate and paint preview/cancel messages separately for each socket
over a rolling minute. Defaults are 120 commands and 1,800 previews. Batch
members consume their own budgets, so batching does not bypass command limits.
The envelope schema allows at most 50 batch entries; the transport parser's
preliminary bound is looser. The frame budget is the sum of the two configured
limits and bounds malformed traffic too.

Paint snapshot chunks always stream as standalone, correlated messages, even
for a `paint_snapshot_request` inside a transport batch. No snapshot entry is
embedded in `batch_response`: combining final chunks would exceed their
per-frame byte budget. `processed_count` includes snapshot requests;
`response_count` counts only embedded responses, not streamed chunks. The
correlated final chunk confirms snapshot completion. Ordinary response entries
retain their existing behavior. Regression owner:
`apps/server/tests/unit/test_batch_message.py`.

Excess previews are dropped while durable commands in a mixed batch are
preserved. Exhausted command/frame budgets close with retryable code 1013.
Normal sustained 20 Hz dragging fits the preview budget. Do not interpret 1013
as lost authorization. `WS_MAX_MESSAGE_BYTES` defaults to 65,536 bytes.

Server replacement or graceful restart uses retryable close 1012. Normal close
1000 and authorization/policy close 1008 remain terminal. The current reconnect
implementation, rather than the reason text, decides retry behavior.

See [Environment variables](ENVIRONMENT_VARIABLES.md) for settings and
[Writer handover](../operations/WRITER_HANDOVER.md) for process replacement.

## Table deletion identity and outcome

`table_delete` requires an original `message_id` of 1-128 characters, a bounded
nonnegative numeric timestamp, and a closed payload containing only `table_id`
as a UUID. Authenticated connection context supplies the actor and session.
Current database DM authority is checked before acceptance or receipt replay.
Table resources, matching active-member pointers, permanent session-lifetime
retirement and the `table_delete` domain receipt share one transaction. Active
combat/choice encounters must end before deletion.

The correlated `success` response carries `success: true`, `operation: delete`,
`operation_id`, `table_id`, `already_deleted`, `replayed` and `resync_required`.
Peers receive `table_update` with `operation: delete` and the table UUID.
Reusing an accepted request ID with changed input returns `conflict`. A different
deliberate deletion of an already-retired table in the same session accepts a
no-op outcome; unknown/foreign identities reject. An unavailable commit lookup
returns `outcome_unknown` and quarantines serialized state work and snapshots
until recovery proves deletion or rollback. Notification failure after acceptance
requires resync rather than another newly identified delete. The browser API can
retain the original request ID in the negotiated tab-scoped recovery journal.

## Settings identity, revisions and outcome recovery

`table_settings_update` requires original `message_id` (1-128 characters),
bounded nonnegative numeric timestamp and a closed, nonempty settings patch
with a UUID target. The trusted connection supplies actor/session authority.
Current database DM authority and same-session table ownership are checked in
the transaction; new requests for retired or unresolved dirty targets reject.
Settings, monotonic revision and original `table_settings` receipt commit together.
No-op patches retain a receipt without a settings revision increment.

`table_settings_changed` keeps the full settings shape and adds optional
`operation_id`, `success`, `changed`, `accepted_revision`, `settings_revision`,
`replayed` and `resync_required`. Peer events carry current settings/revision.
Replays return current SQL values rather than an old accepted patch. A retained
receipt for a later-deleted target carries `table_deleted: true`, original
`operation_id` and `replayed` without obsolete settings. Changed-input reuse
conflicts. Commit lookup failure reports `outcome_unknown` and fences serialized
state work/snapshots until recovery; notification failure after acceptance sets
`resync_required`. Recovery replies remain scoped to current DM authority.

Browser buffers preserve unknown original messages through hydration and can
probe that exact request once per connection; later patches wait for settlement.
Older settings revisions cannot replace newer confirmed browser state. The negotiated journal also retains that ownership across same-tab reloads. Regression owners are
`test_table_settings_service.py`, `tableSettingsBuffer.test.ts`,
`clientProtocol.test.ts` and the PostgreSQL settings contracts.

## Browser recovery negotiation and settlement

New clients offer `operation_recovery=session-operations-v1` as fallback and
`operation_recovery_extended=session-operations-v2` for extended domains on the
WebSocket URL. The server chooses v2 only for that explicit offer. Only opted-in
clients receive the optional welcome capability; older closed
validators keep their existing welcome shape. The capability names supported
domains and the retained session instance. Its welcome actor/session are the
recovery scope; a saved payload supplies no authority. Unknown or absent capability
never authorizes replay of stored requests.

The browser retains exact supported envelopes before transmission, including
settings members and flat explicit batches. A reconnect/reconstructed owner
waits for welcome before probing saved originals once per connection; manual
review may retry again. Domain-specific correlated acceptance completes local
records. Unknown outcomes remain pending, denied lookups remain held for review,
and snapshots alone cannot settle these requests. A restored create response
uses reconciliation rather than initial scene hydration. V2 extends this
contract to character/repair, choice and multiclass originals. Explicit
identity-bound v2 nonacceptance also completes matching records; denied lookups
retain evidence. General offline mutation queues remain outside this contract.


## Durable choice outcomes (November 2)

`encounter_start/end/choice/roll` require bounded original message identity/time
and closed payloads; every post-start request names its original encounter.
Actor/session authority comes from the connection and current database role,
not payload fields. The canonical schema defines prompt, choice, target and
integer bonus bounds. A required roll needs its DC.

Snapshot/event/receipt acceptance is atomic. `accepted`, `operation_id`, original
`encounter_id`, transition `kind` and `accepted_version` identify the small outcome;
roll receipts retain their actual dice. A failed game roll (`success: false`) can
still be an accepted transition. Replay uses `encounter_state` and current
role-filtered `encounter` state with `replayed`/`resync_required`; explicit
`state_authoritative: true` plus `encounter: null` clears stale browser prompts.
An old receipt must not reinstall its historical snapshot or close a newer prompt.

`choice_outcome_unknown` is not rejection. Fresh lookup behind the original
session-row barrier and current installation precede release of serialized state
work/snapshots. Proven rejection carries `not_accepted: true`. Revoked actors
receive no private receipt details; recovery peers get public current state.
Unknown browser outcomes request a bounded serialized read without inventing
another mutation. The four-domain persisted v1 journal still excludes choice;
explicitly negotiated v2 retains complete original choice envelopes across
same-tab reloads. Unsupported records stay dormant under v1 fallback.
See [Encounters](../features/ENCOUNTERS.md) for recovery and qualification limits.


## Raw sprite uncertain outcomes

Production raw sprite/compendium commands and bounded sprite runs use their
existing actor/table editor journal. An unavailable outcome/current installation
returns `error` with `code: outcome_unknown`, `outcome: unknown` and
`resync_required: true`. The original actor may receive its original message ID
as `operation_id` and the affected `table_id`. Normal envelope causation identifies
the triggering request; a blocked read can identify an earlier unresolved original.

Fresh verified acceptance uses a small correlated `sprite_response` with
`success: true`, `resync_required: true` and current history flags, without old
sprite data/updates. Verified rollback uses a correlated error with
`not_accepted: true` and original operation identity. Current database authority
precedes receipt disclosure; private history is withheld after revocation.
Peers receive only a table resync hint, never the original actor's history.

Unknown never releases an optimistic action as rejected. Read probes are bounded
per original/connection; the mutation is not automatically resent. The shared
confirmed sprite helper waits through unknown replies until a causally matched
outcome, cancellation or its existing deadline. These are existing error/response
schema fields; no sprite domain is added to closed v1/v2 recovery negotiation.


## Direct canvas outcome semantics

`canvas_command_result` uses existing schema fields. `success: false` with
`code: outcome_unknown` and `resync_required: true` means the original is still
being checked, not rejected. `forbidden` plus `resync_required: true` withholds
an outcome that current authority cannot disclose; denial cannot prove an earlier
original never committed. Both keep browser command ownership. A blocked state
read instead receives the existing generic `error` with `outcome: unknown`.

Fresh verified acceptance returns the original operation/table identity and
clipboard identity when applicable, current history flags and current visible
selection references, with `resync_required: true`. It contains no historical
scene delta. Verified nonacceptance after commit uncertainty reports
`persistence_failed`; unavailable/expired/missing known-accepted history stays
unknown. Normal pre-commit validation/conflict/dependency errors retain their
existing semantics. The envelope correlates receipt delivery to the original
sender while the domain operation ID supports retries with unchanged command
input/timestamp. No new negotiated browser recovery domain or wire property is
added. See [Command/history](COMMAND_AND_HISTORY.md) for retention limits.

## Wall original-intent receipts

Production `wall_create`, `wall_update`, `wall_remove` and `door_toggle` require
a nonblank original envelope `message_id` (up to 128 characters) before decode
can mint a replacement identity. Older clients that omit it must upgrade. They bind
the original envelope `message_id`, authenticated actor/session, message kind
and complete data to a durable `wall_command` receipt. Deliberate retries retain
that exact input and identity; changed input conflicts. Current SQL authority
and table/door state govern acceptance. Matching create/toggle retries do not
repeat effects, even after later wall edits or deletion.

Fresh acceptance keeps the existing closed `wall_data` payload. Recovered or
replayed acceptance instead sends generic `success` with `success: true`,
`domain: wall_command`, `operation_id`, `table_id`, `wall_id`, `command`,
`replayed: true` and `resync_required: true`. `table_deleted: true` reports a
verified later table retirement. These receipt fields are not added to the
closed `wall_data` schema and contain no old wall geometry. Peer notifications
request normal current-state resync. Publication failure after acceptance uses
the same small success receipt rather than reporting nonacceptance.

An unavailable outcome/installation returns `error` with `code: outcome_unknown`,
`outcome: unknown` and `resync_required: true`, causally scoped to the incoming
request. Blocked followers do not receive another actor's original identity.
State reads/writes, snapshots, cleanup and join wait for recovery. Revocation
may permit internal repair while a forbidden private lookup remains unconfirmed.
Wall commands remain outside negotiated persisted v1/v2 recovery domains.

## Table metadata and transform originals

`table_move`, `table_scale` and metadata `table_update_request` (inner type
`table_update`) require a nonblank original `message_id`, up to 128 characters,
before decoding can mint another identity. Matching retries retain exact kind,
table and full data. Both packaged schemas enforce this rule; older clients
without IDs must upgrade. This does not impose a new timestamp/expiry contract
or extend persisted v1/v2 recovery domains. Fog replacements now also require
the original message ID and use the separate receipt boundary below.

Atomic field acceptance returns generic `success` with `success: true`,
`domain: table_edit`, `operation_id`, `table_id`, `replayed` and
`resync_required: true`. Verified later retirement adds `table_deleted: true`.
These are receipts, not historical table fields. Peer `table_update` uses
`operation: resync` and `resync_required: true`, or `operation: delete` for a
retired table. Browsers reload list metadata and the active scene. Unknown
responses use `error`/`outcome: unknown`, correlate to each incoming original or
blocked follower, and never expose another actor's original identity. Current
database DM authority gates private results after internal cache recovery.

## Fog replacement receipts

The closed `table_update_request`/`fog_update` body is unchanged. Its original
nonblank `message_id` (at most 128 characters) is now mandatory before decode;
older clients omitting it must upgrade. The original actor/session/message/kind/
complete body is bound to a `fog_edit` receipt. Finite original JSON is bounded
to 60 KiB and geometry validation rejects a whole invalid replacement.

Generic success includes `success`, `domain: fog_edit`, `operation_id`, `table_id`,
`replayed` and `resync_required`, with `table_deleted` for verified later retirement.
No historical geometry is returned. Current table resync hints use the existing
table-edit mechanism; unknown and denied outcomes retain its private lookup and
quarantine rules. Fog remains outside negotiated persisted v1/v2 domains. The
browser-only `fog-hydrated` event is emitted after validated snapshot installation;
it is not an additional server wire message.
