# Characters and compendiums

Audience: contributors changing character persistence, drafts, rules, imports,
compendium data, or character-token links.

Status: usable. Character storage and authority and the bundled starter
compendium are implemented.

Last source audit: 2026-10-27

## Ownership

- `service/protocol/characters.py` owns character WebSocket commands.
- `managers/character_manager.py` owns persistence, sharing, concurrency, and
  archive behavior.
- `service/character_schema.py` owns the versioned character document.
- `service/character_rules.py` is the versioned XP and multiclass rules source.
- `service/character_protocol_persistence_service.py` owns linked-stat staging
  and standalone XP-log/token helpers. Generic updates supply the source transaction.
- `managers/character_draft_manager.py` owns durable wizard drafts.
- `routers/compendium.py` exposes read-only, bounded compendium REST routes.
- `service/compendium_artifact.py` verifies production artifact manifests.
- `apps/web-ui/src/features/character/` owns editing and wizard workflows.
- `apps/web-ui/src/features/character/hooks/useCharacterUpdateCommand.ts` is
  the shared edit command for the character panel and modeless sheets.
- `apps/web-ui/src/lib/websocket/clientProtocol.ts` owns update correlation,
  reconnect replay, acknowledgement, and the bounded conflict retry.

## Persisted character flow

Characters are stored in `session_characters`. The JSON document uses schema
version 1 and is validated on create, load, list, update, and draft conversion.
Unknown feature fields survive validation so newer clients do not lose data.

One access policy covers load, list, update, roll, logs, and event delivery.
Owners and explicit editors can edit. Session DMs can inspect and administer.
Only owners and DMs can change sharing or archive a character.

Updates use recursive JSON Merge Patch semantics and an atomic version
compare-and-swap. A conflict returns the canonical document and current version.
Accepted HP, max-HP, and AC changes synchronize every linked token in the
session and use normal authorized sprite broadcasts.

The character and draft managers intentionally keep short-lived synchronous
SQLAlchemy transactions, but async protocol actions run those I/O-bound calls
through a worker thread. Recipient permission checks, draft operations, XP
load/update/logging, multiclass load/update, and linked-token stat writes use
the same boundary. Each direct persistence helper creates and closes its own
worker-owned session and returns detached data. Do not pass ORM sessions or
rows across the boundary. Apply returned token updates to the in-memory table
and send WebSocket messages only after control returns to the event loop.

`character_save_request` creates a character only. It cannot overwrite an
existing id without a version. XP, level, class, class-list, pending-level, and
proficiency changes are protected from generic deltas even when the browser
sends an otherwise unchanged full nested snapshot; use the advancement commands
below.

Deletion is an idempotent archive operation. It detaches linked tokens and
removes active sharing grants while retaining character logs and an archive
event.

## Linked-stat transaction boundary

`stage_character_token_stats(db, session_id, character_id, stats)` locks linked
entity rows in stable ID order and flushes HP/max-HP/AC inside a caller-owned
transaction. It cannot change identity or permissions, and it never commits or
rolls back that transaction. Its detached token identities/layers are provisional
until the caller commits. `persist_character_token_stats` remains the standalone
session-owning wrapper. Outer commit/rollback and cross-session isolation are
covered by `tests/unit/test_character_protocol_persistence_service.py`.

Generic character updates now stage the source document, version, audit records,
and all linked HP/max-HP/AC projections in one transaction. A failed projection
write rolls back source and token changes together. Projection values are
validated independently of legacy document field placement. `data.stats` is
the structured source; a legacy delta that disagrees with it rejects with
`Conflicting character stat locations; update data.stats` before source or
projection writes. Zero is a real value and explicit null clears a field.
Removing canonical `data.stats` clears its linked HP/max-HP/AC projections.

`ActionsCore` carries the committed detached token identities/stats back to the
handler. Publication performs no second token write. The handler holds loaded
table write locks in stable order through acceptance and cache installation,
so queued background snapshots cannot overwrite the new stats with old live
values. Cancellation retains session/table ownership until this work settles.
All loaded projections install before the first transport await. One failed
notification cannot skip later tokens or reject durable success; the response
sets `resync_required=true` when publication fails. Layer filtering still uses
current live layers or the committed layer for unloaded tokens.

Regression owner: `tests/unit/test_character_stat_transaction.py` exercises the
real manager, ActionsCore, protocol dispatch, SQLite transaction, and queued
snapshot path. PostgreSQL execution and browser resync acceptance remain release
gates. The token panel now uses the same source transaction for linked stats;
active encounter writes remain separate. Durable character request identity
across restart, legacy NPC sources, and existing divergent-row repair still need
reconciliation. This is not a universal stat-ownership or receipt guarantee.

Current field boundaries must remain explicit:

| State | Current owner | Remaining consistency work |
| --- | --- | --- |
| Character document, version, XP and advancement | Character manager and advancement commands | Generic sheet edits include linked projections atomically; XP and token-originated changes still need their own outcome contracts. |
| Token HP/max-HP/AC outside combat | Character projection when linked; independent token fields otherwise | Token panel edits use the source command; qualify legacy NPC creation and existing-row repair, plus served recovery. |
| Active encounter HP, resources and turn state | Combat command snapshot/journal | Define sheet edits during combat and any encounter-completion write-back before unifying these fields. |

Ending an encounter does not currently establish a general character-sheet HP
write-back guarantee. Do not overwrite active encounter values from a delayed
sheet projection or infer that the newest row always owns a shared stat.

## Canonical stat preparation

`service/character_stat_normalization.py` builds detached canonical proposals;
it never changes storage during a read. Existing canonical HP/max-HP/AC wins,
including zero and null. Legacy candidates must agree when no canonical value
exists. Unknown or conflicting values reject, and existing current HP cannot
invent max HP. Known legacy aliases are removed from a successful proposal;
other character and monster fields survive.

The NPC builder understands bounded integer HP/AC and the bundled catalog's
average-HP/dice notation. New NPCs start at their initial HP. Monster content is
kept under `data`, including original compendium metadata, and cannot override
character identity or sharing. `test_character_stat_normalization.py` checks all
201 bundled monsters, combat content preservation, conflicts, zero/null, and
idempotent preparation. Creation and repair must explicitly adopt these proposals
inside their own acceptance transactions.

## Character binding adapter

`service/character_token_binding.py` prepares newly attached token projections
inside a caller-owned sprite transaction. It checks the active source in the
numeric session, requires source edit permission (or session DM authority), and
copies canonical `data.stats` HP/max-HP/AC, including zero and null. It does not
commit, change the character version, or write to another token. Detaching keeps
independent values; changing stats on an existing link is rejected so callers
use the character command. Moving an existing linked token does not require
new character edit permission. `test_character_token_binding.py` covers these
adapter rules. Sprite editor acceptance and canvas paste/history restoration
invoke the adapter before their token/journal commit. New links and linked
creation publish the committed canonical values, with linked creations excluded
from early transport-batch publication. Binding is not a character edit and does
not increment its source version or logs.

The normal sprite update path no longer performs a second reverse source write.
A changed stat on an existing link rejects the entire sprite command, including
other fields; callers use `character_update`. A new binding treats supplied stat
values as hints and copies current source values. Explicit `character_id: null`
detaches without looking up or changing the previous source, even when the same
command sets independent stats. Normal role/layer and sprite-control checks
still apply. Real protocol/SQLite regressions in
`test_sprite_editor_protocol.py` cover binding, canonical publications, failed
flush rollback, durable duplicate replay, batching, and detach.

A source with legacy HP/max-HP/AC outside `data.stats` and no canonical value
for that field rejects binding with a migration conflict. It must not silently
clear the token or guess which legacy value is authoritative. Explicit canonical
zero/null remains valid. The adapter regression covers both root and nested
legacy fields.

Existing divergent rows, older flat NPC documents, and specialized compendium
creation still need reconciliation/qualification. These changes do not establish
a general historical-data repair or encounter-completion write-back guarantee.

## Character commit verification adapter

`service/character_update_recovery.py` can verify one admitted, in-process CAS
attempt using the stable session-row lock and a fresh READ COMMITTED snapshot.
The exact accepted version/document/modifier proves commit; the unchanged source
version/document proves rollback after the original transaction has settled.
Unavailable, missing, archived, or otherwise changed sources stay unknown.
Lookup does not clear quarantine until its caller installs the verified outcome.
The PostgreSQL lock wait is bounded to five seconds. Regression owner:
`tests/unit/test_character_update_recovery.py`.

Generic character acceptance now takes the same stable session-row lock before
validation and records the exact before/after CAS state before attempting commit.
A failed commit response closes its original ORM session, then resolves on a
fresh connection while session/loaded-table ownership is still held. Confirmed
commit returns success; a proven rollback permits failure. A different source
version/document/modifier, archive, missing row, or failed lookup remains unknown.

Unavailable outcomes return `ERROR` with `code=character_outcome_unknown`,
`outcome=unknown`, and `resync_required=true`. Session authoritative work, table
snapshots, and empty-session cleanup share quarantine with combat; heartbeats
remain available. A later serialized request attempts recovery and installs
committed projections before resuming. Recovery cancellation retains ownership.
The result uses the original actor and request correlation; current-authority
viewers receive the separate character event. Replaying that original request
during recovery returns its settled result without another source update;
reusing its identity for different update data rejects.

The request identity crosses the worker through a scoped ContextVar and is reset
after dispatch. `tests/unit/test_character_stat_transaction.py` covers committed
and rolled-back response loss, lookup outages, snapshot fencing, exact replay,
payload mismatch, and cancellation. This is an in-process CAS verifier, not a
durable retry ledger across process restart. A superseding or missing source
cannot be guessed into success/failure; operator reconciliation or clean restart
is required if ordinary recovery cannot establish it. PostgreSQL and complete
browser acceptance remain release gates.

The mandatory `tests/integration/test_postgresql_contract.py` suite includes
source/version/log/token atomic commit and rollback, recovery waiting on the
original session-row lock through commit or rollback, and repeatable-read
rejection. `test_character_stat_transaction.py` also decodes actual outgoing
responses with the shared schema, so serializable but schema-invalid outcomes
fail the regression. Local skipped PostgreSQL cases do not qualify these
database contracts; CI must execute them against its disposable service.

## Browser edits and reconnects

The character panel and modeless character sheets submit edits through
`useCharacterUpdateCommand`. The browser applies the edit optimistically and
marks the character `syncing`; the protocol records the generated message ID
before attempting transport. Responses use `causation_id` before trace
`correlation_id` to settle exactly the originating pending entry. An uncorrelated
legacy response is matched only when exactly one edit to that character is
pending. Duplicate, stale, mismatched, and ambiguous receipts cannot settle a
newer edit. Success advances the version without regressing a newer known
version; the character stays `syncing` while another edit remains pending.

If the socket disconnects, unsent updates stay in the protocol message queue
and sent-but-unacknowledged updates stay in the pending map, marked uncertain.
Reconnecting the same protocol instance replays both categories with their
original identities. A definite version conflict retries the same delta once.
An uncertain edit is never converted into a new mutation on conflict, since the
original may have committed before the connection or server was lost.

`character_outcome_unknown` retains the original intent and sends one serialized
active-table read to trigger server recovery. Repeated unknown responses do not
create a read loop. A recovered receipt, publication-resync requirement, or
uncertain conflict schedules canonical character and active-table reads after
all pending edits to that character settle. This avoids an early recovery read
overwriting a later optimistic edit. If the server cannot confirm the edit, the
browser asks the user to review saved state before retrying. These paths have
protocol-unit coverage in `clientProtocol.test.ts`; a complete served-browser
and PostgreSQL recovery playthrough remains a release gate.

Incoming character data deltas use the same JSON Merge Patch semantics as the
server and optimistic command: nested siblings survive, null members are removed,
and arrays replace. A single HP update cannot discard another client's AC,
inventory, or spell slots. `clientProtocol.test.ts` covers this receiving boundary.

The token configuration panel uses the same versioned character command for
linked HP, max HP, and AC. It sends only the edited nested stat, preserves other
optimistic sheet fields using JSON Merge Patch, and displays pending/error/local
save status. Unlinked tokens retain independent sprite commands. A missing
linked source is loaded before stat editing is enabled. Token projections change
through server acceptance rather than an independent optimistic token save.
`TokenConfigModal.test.tsx` and the shared command-hook tests cover this route.
The panel edits persistent character stats; encounter HP remains under combat
commands and is not automatically written back on encounter completion.

This queue is deliberately page-memory durability, not offline persistence. It
survives a transport reconnect while the current page and protocol instance
remain alive, but not navigation, reload, tab closure, or browser failure. UI
copy must not claim that disconnected edits are durably saved. Wait for the
`synced` state before leaving the page, or export the current character before
an unavoidable reload.

## Draft flow

Wizard drafts are durable and session-scoped. An owner can create, list, load,
autosave, resume, finalize, or abandon a draft across clients. A DM can inspect
but cannot modify or finalize another user's draft. Version compare-and-swap
rejects stale saves. Finalization creates the playable character and marks the
draft converted in one transaction.

## Rolls and advancement

A roll request names intent only. The server verifies character access and
derives the modifier and roll mode from the canonical sheet. A successful roll
atomically persists character activity and a typed public system-chat record.

XP awards are DM-only. `xp_award` resolves the pinned
`dnd5e-2014-v1` XP table, updates through character version
compare-and-swap, and returns the canonical document. Players see XP as
read-only state.

Multiclass changes use `multiclass_request`. The server validates the pinned
prerequisites, preserves a legacy primary class when normalizing the class
array, enforces the total-level cap, and returns the canonical document. The
browser does not carry fallback prerequisite tables.

## Import and export

Browser exports use format `1.0`. Import accepts exactly that version,
regenerates identity and session fields, and then saves through normal server
validation. Missing and unknown format versions fail closed. The server
character document separately accepts legacy unversioned documents through its
deterministic schema-version migration.

## Compendium artifact

The default artifact is the generated SRD 5.1 starter in
`packages/core-table/core_table/compendiums/bundled_srd51/`. It matches the
pinned `dnd5e-2014-v1` ruleset and contains:

- 9 race options and all 12 SRD classes;
- the Acolyte background and Grappler feat;
- 56 level-zero and level-one starter spells;
- 149 armor, weapon, and adventuring-gear entries;
- 201 monsters.

This is a starter catalog, not every SRD rule or every published fifth-edition
option. The manifest reports `scope: starter`. The source conversion commit and
input hashes are pinned by `scripts/compendium/build_srd51_starter.py`.

The loader activates all five data files atomically. Every production artifact
requires a manifest containing the artifact/schema version, exact file list,
byte counts, SHA-256 digests, source, source version, license, and attribution.
Readiness fails when the artifact is absent, corrupt, incomplete, or
unattributed. `/api/compendium/status` exposes the active scope, ruleset,
sources, and licenses.

Collection routes are bounded and paginated where appropriate. Verified
generations use ETags and shared cache headers. Runtime reload is not public.

The bundled content uses SRD 5.1 under CC BY 4.0. Required attribution is in
`THIRD_PARTY_NOTICES.md` and in the artifact manifest. The mixed local exports
under the ignored `compendiums/exports/` path are not the bundled source and
must not be redistributed.

## Replace the starter with a complete artifact

Set `COMPENDIUM_DIR` to an absolute directory containing these exact files:

- `character_data.json`;
- `spellbook_optimized.json`;
- `equipment_data.json`;
- `bestiary_optimized.json`;
- `feats_data.json`;
- `manifest.json`.

Create the manifest after assembling data you are authorized to distribute:

```powershell
python scripts/compendium/create_manifest.py C:\compendiums\licensed-full `
  --artifact-version licensed-full-v1 `
  --source-name "Licensed source" `
  --source-url "https://example.com/source" `
  --source-version "1" `
  --license-id "CC-BY-4.0" `
  --license-url "https://creativecommons.org/licenses/by/4.0/legalcode" `
  --attribution-file C:\compendiums\licensed-full\ATTRIBUTION.txt
```

The tool validates the required top-level JSON keys, hashes the generation,
and refuses to overwrite a manifest unless `--replace` is explicit. A manifest
records integrity and provenance; it does not grant rights to unlicensed data.
Restart the server after changing `COMPENDIUM_DIR`; runtime reload is not
public.

## Verification

Run:

- `tests/unit/test_character_protocol.py`;
- `tests/unit/test_character_protocol_persistence_service.py`;
- `tests/unit/test_character_overhaul.py`;
- `tests/unit/test_character_drafts.py`;
- `tests/integration/test_compendium_routes.py`;
- `tests/unit/test_compendium_manifest_tool.py`;
- character and compendium Vitest suites;
- `src/lib/websocket/__tests__/clientProtocol.test.ts`.
