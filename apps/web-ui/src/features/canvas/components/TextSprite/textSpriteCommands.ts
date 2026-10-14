import { createMessage, MessageType, type WebClientProtocol } from '@lib/websocket';
import { sendConfirmedSpriteCommand } from '../../services/spriteCommands';
import { assertTextSprite, rasterizeTextSprite, TEXT_LIMITS, type TextSpriteDescriptor } from './textSpriteModel';

export interface TextSpriteCommand {
  id: string;
  tableId: string;
  x: number;
  y: number;
  layer: string;
  descriptor: TextSpriteDescriptor;
  metadata: Record<string, unknown>;
  revision: number | null;
}

/** Resolve only a correlated server acknowledgement, never a local render insert. */
export async function saveTextSprite(protocol: WebClientProtocol, command: TextSpriteCommand, signal: AbortSignal): Promise<void> {
  assertTextSprite(command.descriptor);
  const rendered = await rasterizeTextSprite(command.descriptor);
  if (signal.aborted) throw new Error('Text edit cancelled.');
  if (!protocol.isConnected()) throw new Error('Connect to the session before saving text.');
  if (rendered.width > TEXT_LIMITS.maxDimension || rendered.height > TEXT_LIMITS.maxDimension) {
    throw new Error('Text is too large. Use shorter lines or a smaller font.');
  }
  const metadata = JSON.stringify({ ...command.metadata, text_sprite: command.descriptor });
  if (new TextEncoder().encode(metadata).byteLength > TEXT_LIMITS.maxMetadataBytes) throw new Error('Text metadata exceeds 32 KiB.');
  const fields = { metadata, width: rendered.width, height: rendered.height };
  const message = command.revision === null
    ? createMessage(MessageType.SPRITE_CREATE, { table_id: command.tableId, sprite_data: {
      ...fields, sprite_id: command.id, name: command.descriptor.text.split('\n')[0].slice(0, 100),
      x: command.x, y: command.y, layer: command.layer, texture_path: '__TEXT__',
    } }, 2)
    : createMessage(MessageType.SPRITE_UPDATE, { ...fields, sprite_id: command.id, table_id: command.tableId, expected_text_revision: command.revision }, 2);
  return sendConfirmedSpriteCommand(protocol, message, signal, 'Text edit cancelled.');
}
