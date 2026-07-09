# Sprites, tokens, and entities

Audience: contributors changing token placement, sprite updates, text sprites,
character-token links, or vision fields on tokens.

Status: current but partial.

Last source audit: 2026-07-09

## Source owners

- `apps/server/service/protocol/sprites.py`: sprite create, move, resize,
  rotate, update, delete, preview, compendium sprite, and sprite request
  handlers.
- `apps/server/database/models.py`: `Entity` persistence for sprites/tokens.
- `apps/web-ui/src/store.ts`: browser sprite list, sprite update helpers,
  ownership checks, and active table context.
- `apps/web-ui/src/features/canvas/components/EntitiesPanel.tsx`: entity list
  and canvas-side entity controls.
- `apps/web-ui/src/features/canvas/components/TokenConfigModal.tsx`: token
  stats, ownership, character link, aura, and vision settings.
- `apps/web-ui/src/features/canvas/components/TextSprite/`: text sprite create,
  edit, update, and delete helpers.
- `apps/web-ui/src/lib/websocket/clientProtocol.ts`: sprite protocol senders
  and incoming event handlers.
- `packages/rust-core/src/actions/sprite_ops.rs`: WASM-side sprite actions.
- `packages/rust-core/src/rendering/sprite_manager.rs` and
  `packages/rust-core/src/render/sprites.rs`: sprite rendering.

## What the feature does

Sprites are the renderable objects on a table. Tokens are sprites with gameplay
meaning: character links, HP/AC, control ownership, aura fields, and vision
fields. The server stores these as `Entity` rows and treats the server-side
table actions as the persistence boundary.

Text sprites are browser-created sprite-like objects. They render text to a
texture, add that texture to the WASM renderer, and send normal sprite protocol
messages for shared state.

## Protocol messages

Current sprite messages:

- `sprite_create`
- `sprite_update`
- `sprite_remove`
- `sprite_move`
- `sprite_scale`
- `sprite_rotate`
- `sprite_request`
- `sprite_response`
- `sprite_data`
- `sprite_drag_preview`
- `sprite_resize_preview`
- `sprite_rotate_preview`
- `compendium_sprite_add`
- `compendium_sprite_update`
- `compendium_sprite_remove`

Nested sprite operations inside `sprite_update` are rejected. Use the dedicated
sprite messages.

## Authority rules

Server handlers enforce the role rules:

- Spectators cannot create, move, resize, rotate, or update sprites.
- Non-DM users can create sprites only on non-DM layers and are limited by
  `get_sprite_limit()`.
- DMs can create sprites on DM layers; non-DMs cannot.
- DM-created sprites get an empty `controlled_by` list.
- Player-created sprites are controlled by the creating user.
- Non-DM users can move, resize, rotate, and update only sprites they control.
- Sprite deletion is DM-only.
- Combat token movement is rejected unless it goes through
  `combat_command`, except for the DM table-edit override.

Preview messages are live UI hints. They broadcast drag, resize, or rotate
state after the same control check, but do not write the database.

## Persistence

`Entity` stores the durable sprite/token fields:

- `sprite_id`, table relation, name, layer, image URL, position, size, scale,
  and rotation;
- `character_id` for linked session characters;
- `controlled_by` as JSON;
- HP, max HP, AC, aura fields, obstacle metadata, and arbitrary metadata;
- vision fields: `vision_radius`, `has_darkvision`,
  `darkvision_radius`, plus unit-based variants.

`handle_sprite_update()` also syncs HP, max HP, and AC back to a linked
character when a token stat changes and a character id can be resolved.

## Browser and WASM flow

The browser store owns the React-visible sprite array and permission helpers.
Protocol handlers update store state and dispatch DOM events such as
`sprite-created`, `sprite-moved`, and `sprite-removed`.

WASM owns render-time sprite state. React reaches it through `WasmRuntime` and
the render engine, not by importing generated bindings in feature code.

## Tests to run

- `apps/server/tests/unit/test_sprites_protocol.py`
- `apps/server/tests/unit/test_movement_validator.py`
- `apps/web-ui/src/lib/websocket/__tests__/clientProtocol.test.ts`
- `apps/web-ui/src/features/entities/components/EntitiesPanel/__tests__/`
- `apps/web-ui/src/features/canvas/components/__tests__/TokenConfigModal.test.tsx`
- `apps/web-ui/src/features/canvas/components/TextSprite/__tests__/`
- `packages/rust-core/tests/wasm_browser.rs`
- `packages/rust-core/tests/wasm_node.rs`

Run server tests for permission or persistence changes. Run browser tests for
store, modal, protocol, and text sprite behavior. Run Rust/WASM tests when
render-engine sprite behavior changes.

## Known edges

- The code still accepts both snake_case and camelCase sprite fields in some
  browser-side paths. Keep server persistence canonical when adding fields.
- Vision and lighting use token fields, but the actual visibility computation
  is in the lighting/fog feature boundary.
