# Create and edit text sprites

Audience: session users and contributors checking the text workflow.

Status: usable.

Last source audit: 2026-10-06

## Create

1. Connect to a game session and select a table.
2. Choose Map or Tokens. DMs may also choose the DM layer. Text is not an
   obstacle or light; other layers reject text creation.
3. Choose **Text sprite** in the tools panel and click the table to capture its
   world position. The sidebar editor receives focus.
4. Enter plain Unicode text. Enter inserts a line break. Set color, size,
   sans/serif/monospace typeface, bold/italic style, language and direction.
   Language tags such as `uk-UA`, `en` and `ar` inform shaping, not translation.
   Automatic direction uses the first strong letter. IME composition is not
   treated as a save shortcut.
5. Choose **Save text**, or Ctrl/Cmd+Enter. The form stays open until the server
   acknowledges the captured table's command. Confirmation returns to Select.

Players, trusted players and DMs can author text subject to normal sprite
quotas and layer rules. Spectators cannot author or edit. Every authorized
viewer reconstructs text from saved metadata; no author-local PNG is required.
Generic fonts use each client's platform fallback rather than promising
pixel-identical glyphs across operating systems.

## Edit and move

Select one saved text sprite, then choose **Edit selected text**. The same form
edits its content and styling. Non-DMs must control the sprite; DMs can edit any
visible text sprite. The form keeps its draft on validation or stale-edit errors.
**Reload saved text (discard draft)** requests the current authoritative sprite;
reopen its editor to edit that version. Other viewers receive accepted changes.

Move text with the normal Select tool, or include it in combined sprite/paint
selection. Movement uses the existing sprite command and combat rules. Text
remains database-persistent after moving. Deletion follows the app's DM-only
sprite deletion policy, not paint creator permissions.

## Cancellation and limits

Cancel or Escape discards the local editor. Changing table, tool, layer, user,
role or protocol cancels an obsolete editor; losing control or removing the
edited sprite also closes it. Once a save has been sent, cancellation cannot
roll back a write already accepted by the server. A save timeout is uncertain:
check/reload saved state before retrying. The client never retries automatically.

Text allows 4096 characters, at most 32 explicit lines and font sizes 8–128.
Very long lines may exceed the 4096-world-unit size budget and require shorter
lines or a smaller font. The renderer separately bounds texture memory.

Source owners are `TextSpriteTool.tsx`, `textSpriteCommands.ts`,
`textSpriteModel.ts`, runtime sprite/texture services and
`apps/server/service/protocol/sprites.py`. The React user-flow, descriptor,
command-correlation, database-reload and real-WebGL tests cover these boundaries.
See [Sprites, tokens, and entities](../features/SPRITES_TOKENS_AND_ENTITIES.md)
for the canonical protocol, authority, persistence and rendering contract.
