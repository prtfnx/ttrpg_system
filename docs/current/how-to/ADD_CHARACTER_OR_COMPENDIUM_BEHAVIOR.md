# Add character or compendium behavior

Audience: contributors changing characters, character sheets, advancement, or
rules reference data.

Status: usable.

Last source audit: 2026-07-08

## Pick the right boundary

Character state and compendium data are related in the UI, but they are not the
same backend surface.

Use character protocol behavior when the change stores or mutates a player's
character:

- save, load, list, delete;
- partial updates with version checks;
- character rolls;
- XP awards;
- multiclass requests;
- token stat sync after character stat updates.

Use compendium HTTP behavior when the change reads shared rules data:

- races, classes, subclasses, backgrounds;
- spells, feats, equipment, monsters;
- advancement and multiclass reference data.

## Character steps

1. Put server message handling in
   `apps/server/service/protocol/characters.py`.
2. Put durable character storage behavior in
   `apps/server/managers/character_manager.py` or the existing action layer,
   depending on the nearby code path.
3. Add or update message values in both protocol enums when the browser sends
   or receives a new message.
4. Register new handlers in `ServerProtocol.init_handlers`.
5. Add browser helpers in `apps/web-ui/src/lib/websocket/clientProtocol.ts`.
6. Keep feature UI under `apps/web-ui/src/features/character/`.
7. Add tests for the protocol and the character manager behavior.

Current server rules to preserve:

- DM character list requests use `user_id=0` so the DM can see all characters.
- Player list requests are filtered to the player's user id.
- Character updates can use optimistic version checks.
- Character stat updates can sync HP, max HP, and AC to linked tokens.
- XP award is DM-only.
- Character rolls are computed server-side from intent, not from a client-roll
  result.

## Compendium steps

1. Put HTTP routes in `apps/server/routers/compendium.py`.
2. Keep routes under `/api/compendium`.
3. Load exported JSON from
   `packages/core-table/core_table/compendiums/exports/`.
4. Update browser fetch behavior in
   `apps/web-ui/src/features/compendium/services/compendiumService.ts`.
5. Add or update React hooks in `apps/web-ui/src/features/compendium/hooks/`
   when components need the data.
6. Add integration tests in
   `apps/server/tests/integration/test_compendium_routes.py`.
7. Add browser service or hook tests when the response shape changes.

Current exported data files loaded by the server:

- `character_data.json`;
- `spellbook_optimized.json`;
- `equipment_data.json`;
- `bestiary_optimized.json`;
- `feats_data.json`.

## When both sides change

Many character workflows read compendium data and then save character state.
Keep the reference data read-only unless the feature is explicitly about
editing a character. For example, spell selection should read spells from
compendium routes and store only the chosen character data through the
character protocol.

## Tests

Server:

```powershell
cd apps/server
python -m pytest tests\unit\test_character_protocol.py tests\unit\test_character_overhaul.py tests\integration\test_compendium_routes.py
```

Browser:

```powershell
cd apps/web-ui
pnpm.cmd exec vitest run --project jsdom src/features/character src/features/compendium src/lib/websocket/__tests__/clientProtocol.test.ts
```

## Checklist

- Character writes go through WebSocket protocol and server-side ownership
  checks.
- Compendium reads go through `/api/compendium`.
- Browser services hide fetch and protocol details from components.
- Version, ownership, and DM-only rules are tested when touched.
- Response shape changes are reflected in TypeScript types and tests.
