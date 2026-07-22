# Characters and compendiums

Audience: contributors changing character persistence, drafts, rules, imports,
compendium data, or character-token links.

Status: usable. Character storage and authority and the bundled starter
compendium are implemented.

Last source audit: 2026-07-22

## Ownership

- `service/protocol/characters.py` owns character WebSocket commands.
- `managers/character_manager.py` owns persistence, sharing, concurrency, and
  archive behavior.
- `service/character_schema.py` owns the versioned character document.
- `service/character_rules.py` is the versioned XP and multiclass rules source.
- `managers/character_draft_manager.py` owns durable wizard drafts.
- `routers/compendium.py` exposes read-only, bounded compendium REST routes.
- `service/compendium_artifact.py` verifies production artifact manifests.
- `apps/web-ui/src/features/character/` owns editing and wizard workflows.

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

`character_save_request` creates a character only. It cannot overwrite an
existing id without a version. XP, level, class, class-list, pending-level, and
proficiency changes are protected from generic deltas even when the browser
sends an otherwise unchanged full nested snapshot; use the advancement commands
below.

Deletion is an idempotent archive operation. It detaches linked tokens and
removes active sharing grants while retaining character logs and an archive
event.

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
- `tests/unit/test_character_overhaul.py`;
- `tests/unit/test_character_drafts.py`;
- `tests/integration/test_compendium_routes.py`;
- `tests/unit/test_compendium_manifest_tool.py`;
- character and compendium Vitest suites;
- `src/lib/websocket/__tests__/clientProtocol.test.ts`.
