# One trusted session scope

Audience: contributors deciding which reliability fixes are needed for play.

Status: current implementation scope.

Last source audit: 2026-10-26

The immediate target is one game session with a trusted DM and trusted
players on one active server process. Existing authentication and role
checks remain in place. No multi-session scaling or package-wide
architecture extraction is required to use this scope.

## Current fixes and visible effects

- Table settings install live values and publish changes after a confirmed
  database save. Failed or uncertain saves report an error and ask for reload.
- Full runtime disposal removes session subscriptions and owned objects.
  Late initialization/attachment cannot recreate a stopped canvas; normal
  detach retains snapshots for reattachment.
- Terrain/cover commands require one edit outside active combat. Ordinary
  move/attack batches remain supported. Noninteractive roles cannot mutate
  combat through a stale controller assignment.
- Combat moves save against the authenticated numeric session ID; the
  public session code is used for combat lookup. Weapon ranges convert
  pixels using persisted table units, including meters and hidden grids.
- Populated table copies get independent sprite, wall, and cover-zone IDs.
  Failed persistent creation/import does not register a phantom live table
  or queue it for retries. Paint objects/previews are not copied.
- New-table announcements contain only table metadata; clients hydrate
  scene contents through role-filtered requests.

See [Tables](../features/TABLES_AND_CANVAS.md),
[Settings](../features/SETTINGS_AND_CUSTOMIZATION.md),
[Combat](../BATTLE_FLOW.md), and
[WASM ownership](../WASM_REACT_BOUNDARY.md) for implementation and regression owners.

## TODO beyond this scope

These are remaining limitations, not completed architecture guarantees:

- Extend durable operation receipts beyond existing canvas/sprite/paint/chat
  and combat mechanisms, especially table creation and XP awards. Reconcile
  unknown commit outcomes; reload before retrying an unconfirmed create.
- Transactions or durable repair across table/token/character/combat
  resources, including transactional terrain changes during combat.
- Detached environment-save inputs and settlement review for remaining
  worker migrations. Combat commands already retain ownership through SQL
  settlement, cache installation, and protocol publication.
- Worker migration for remaining join/choice/permission/compendium
  paths. Wall command persistence already uses worker-owned sessions. One session can still pause during synchronous database work.
- Independent core-table persistence adapters and browser dependency cycles.
- Adversarial-client confidentiality, multi-session capacity measurement,
  and production backup/restore verification. Fog is a rendering feature.

Existing-table edits whose saves fail may remain dirty and later persist;
they do not universally roll back and can be lost on process termination.
Atomic full-table snapshots do not make all session resources atomic. See
[Persistence boundaries](PERSISTENCE_AND_WRITER_OWNERSHIP.md).

## Verification limits

Focused regressions cover failures, cancellation, runtime subscription
ownership, prohibited combat envelopes, and real SQLite copy/settings
persistence. `apps/server/tests/integration/test_trusted_session_workflow.py`
uses the production session dispatcher and validated JSON envelopes with
recorded DM/player transports. It covers join, create/switch tables,
create/move tokens, private-layer hydration, walls/lighting, pre-combat
terrain, move/attack and compensating movement, duplicate replay, end turn,
reconnect, and reconstruction of saved table/combat state. It uses real
SQLite and controls asset listing and dice; it does not run HTTP
authentication or a live socket server. The real-browser WASM suite
separately covers table switching and WebGL context restoration.

TODO: a complete served DM/player playthrough with real R2, production
PostgreSQL, and the intended deployment before release acceptance. These
automated tests do not establish provider behavior or deployment capacity.
