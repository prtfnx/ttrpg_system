# Characters and compendiums

Audience: contributors changing character sheets, character persistence,
compendium data, character-token links, rolls, XP, or multiclass behavior.

Status: current but partial.

Last source audit: 2026-07-09

## Source owners

- `apps/server/service/protocol/characters.py`: character save, load, list,
  delete, delta update, logs, rolls, XP award, and multiclass handlers.
- `apps/server/managers/character_manager.py`: server character persistence
  and ownership checks used by actions.
- `apps/server/routers/compendium.py`: REST API for races, classes,
  backgrounds, spells, equipment, monsters, feats, advancement, and
  multiclass reference data.
- `apps/server/database/models.py`: `SessionCharacter`, `CharacterLog`, and
  token links through `Entity.character_id`.
- `apps/web-ui/src/features/character/`: character panel, sheet, wizard,
  inventory, spell, XP, advancement, import/export, and sharing UI.
- `apps/web-ui/src/features/compendium/`: compendium browser, hooks, monster
  creation, and compendium service.
- `packages/core-table/core_table/Character.py`: reusable D&D 5e character
  model.
- `packages/core-table/core_table/compendiums/`: exported compendium data and
  loaders.

## What the feature does

Characters are session-owned records with JSON character data, owner/user
metadata, and a version. The server owns persistence and permission checks.
The browser owns editing workflows, wizard state, import/export, and display.

Compendium data is read-only REST data loaded from JSON exports inside the
installed `core_table` package. Character creation and spell/equipment
selection use that API through `compendiumService`.

## Character protocol

Current character messages:

- `character_save_request`
- `character_save_response`
- `character_load_request`
- `character_load_response`
- `character_list_request`
- `character_list_response`
- `character_delete_request`
- `character_delete_response`
- `character_update`
- `character_update_response`
- `character_log_request`
- `character_log_response`
- `character_roll`
- `character_roll_result`
- `xp_award`
- `xp_award_response`
- `multiclass_request`
- `multiclass_response`

Save and delete broadcast `character_update` to other clients. Delta update
uses optimistic version checking in the action layer and broadcasts the
accepted update with the returned version.

DMs list all characters in a session. Non-DM users list characters filtered to
their user id.

## Rolls, XP, and logs

`character_roll` sends intent to the server: character id, roll type, skill,
modifier, advantage, and disadvantage. The server computes the d20 roll through
the action layer and broadcasts `character_roll_result` to all clients.

`xp_award` is DM-only. The handler updates XP, marks pending level-up when the
D&D 5e threshold changes level, writes a `CharacterLog` entry, and broadcasts
`xp_award_response`.

Character logs are returned by `character_log_request` and come from
`CharacterLog`.

## Token sync

Characters and tokens meet at `Entity.character_id`.

After a character delta update, the server syncs HP, max HP, and AC to linked
tokens for the session. The reverse direction also exists in the sprite
handler: token HP, max HP, and AC updates can write back to the linked
character.

See [Sprites, tokens, and entities](SPRITES_TOKENS_AND_ENTITIES.md) for token
authority and vision fields.

## Compendium API

Current REST routes include:

- `/api/compendium/status`
- `/api/compendium/races`
- `/api/compendium/races/{race_name}`
- `/api/compendium/classes`
- `/api/compendium/classes/{class_name}`
- `/api/compendium/classes/{class_name}/subclasses`
- `/api/compendium/backgrounds`
- `/api/compendium/backgrounds/{background_name}`
- `/api/compendium/spells`
- `/api/compendium/spells/{spell_name}`
- `/api/compendium/equipment`
- `/api/compendium/monsters`
- `/api/compendium/monsters/{monster_name}`
- `/api/compendium/feats`
- `/api/compendium/feats/{feat_name}`
- `/api/compendium/advancement`
- `/api/compendium/classes/{class_name}/multiclass`
- `/api/compendium/classes/multiclass/all`

The browser `CompendiumService` caches responses for five minutes and includes
authentication cookies in fetch requests.

## Tests to run

- `apps/server/tests/unit/test_character_protocol.py`
- `apps/server/tests/unit/test_character_overhaul.py`
- `apps/server/tests/integration/test_compendium_routes.py`
- `apps/web-ui/src/features/character/**/__tests__/`
- `apps/web-ui/src/features/compendium/**/__tests__/`
- `packages/core-table/tests/test_character.py`

Use server tests for persistence, ownership, rolls, XP, multiclass, and
compendium route changes. Use Vitest for wizard, sheet, panel, service, and
token binding changes.

## Known edges

- `xp_award` and `multiclass_request` exist in the Python protocol enum, but
  the browser message constants currently do not expose them.
- Compendium reload is a development endpoint and reloads JSON from the server
  process, not from the browser cache.
