import { createMessage, MessageType, type Message, type WebClientProtocol } from '@lib/websocket';
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
  return new Promise<void>((resolve, reject) => {
    const types = [MessageType.SPRITE_RESPONSE, MessageType.SUCCESS, MessageType.ERROR];
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      types.forEach(type => protocol.unregisterHandler(type, receive));
    };
    const abort = () => { cleanup(); reject(new Error('Text edit cancelled.')); };
    const receive = (reply: Message) => {
      if (reply.correlation_id !== message.message_id) return;
      cleanup();
      if (reply.type === MessageType.ERROR) reject(new Error(String(reply.data?.error ?? 'Text save rejected.')));
      else resolve();
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Save confirmation timed out. Check the saved table before retrying.'));
    }, 15_000);
    signal.addEventListener('abort', abort, { once: true });
    types.forEach(type => protocol.registerHandler(type, receive));
    try { protocol.sendMessage(message); } catch (error) { cleanup(); reject(error); }
  });
}
