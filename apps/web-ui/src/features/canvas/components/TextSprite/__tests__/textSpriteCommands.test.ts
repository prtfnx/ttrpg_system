import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageType, type Message, type WebClientProtocol } from '@lib/websocket';
import { saveTextSprite, type TextSpriteCommand } from '../textSpriteCommands';
import { DEFAULT_TEXT } from '../textSpriteModel';

vi.mock('../textSpriteModel', async importOriginal => ({ ...await importOriginal<object>(),
  rasterizeTextSprite: vi.fn(async () => ({ width: 120, height: 40 })) }));

export function textProtocolHarness() {
  const handlers = new Map<MessageType, Set<(reply: Message) => void>>();
  const protocol = {
    isConnected: vi.fn(() => true), sendMessage: vi.fn(), requestSpriteData: vi.fn(),
    registerHandler: vi.fn((type: MessageType, handler: (reply: Message) => void) => {
      const subscribers = handlers.get(type) ?? new Set(); subscribers.add(handler); handlers.set(type, subscribers);
    }),
    unregisterHandler: vi.fn((type: MessageType, handler: (reply: Message) => void) => handlers.get(type)?.delete(handler)),
  };
  return { protocol: protocol as unknown as WebClientProtocol, send: protocol.sendMessage,
    reply(type: MessageType, correlation_id: string, data: Record<string, unknown> = {}) {
      handlers.get(type)?.forEach(handler => handler({ type, correlation_id, data } as Message));
    }, count: () => [...handlers.values()].reduce((count, set) => count + set.size, 0) };
}

const command: TextSpriteCommand = { id: 'text-1', tableId: 'captured-table', x: 10, y: 20, layer: 'tokens',
  descriptor: { ...DEFAULT_TEXT, text: 'Hello' }, metadata: {}, revision: null };
afterEach(() => vi.useRealTimers());
describe('authoritative text sprite commands', () => {
  it('captures table and geometry and waits for the matching server response', async () => {
    const h = textProtocolHarness();
    const done = vi.fn();
    const pending = saveTextSprite(h.protocol, command, new AbortController().signal).then(done);
    await vi.waitFor(() => expect(h.send).toHaveBeenCalled());
    const sent = h.send.mock.calls[0][0] as Message;
    expect(sent.data).toMatchObject({ table_id: 'captured-table', sprite_data: { sprite_id: 'text-1', width: 120, height: 40, texture_path: '__TEXT__' } });
    h.reply(MessageType.SUCCESS, 'unrelated');
    expect(done).not.toHaveBeenCalled();
    h.reply(MessageType.SPRITE_RESPONSE, sent.message_id!);
    await pending;
    expect(done).toHaveBeenCalledOnce(); expect(h.count()).toBe(0);
  });
  it('sends revisioned edits and exposes rejection without automatic retry', async () => {
    const h = textProtocolHarness();
    const pending = saveTextSprite(h.protocol, { ...command, revision: 4 }, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow('Stale text');
    await vi.waitFor(() => expect(h.send).toHaveBeenCalled());
    const sent = h.send.mock.calls[0][0] as Message;
    expect(sent.type).toBe(MessageType.SPRITE_UPDATE); expect(sent.data?.expected_text_revision).toBe(4);
    h.reply(MessageType.ERROR, sent.message_id!, { error: 'Stale text' });
    await rejected;
    expect(h.send).toHaveBeenCalledOnce(); expect(h.count()).toBe(0);
  });
  it('cleans all handlers on cancellation', async () => {
    const h = textProtocolHarness(); const abort = new AbortController();
    const pending = saveTextSprite(h.protocol, command, abort.signal);
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(h.send).toHaveBeenCalled()); abort.abort(); await rejected;
    expect(h.count()).toBe(0);
  });
  it('times out without retrying an uncertain write', async () => {
    vi.useFakeTimers(); const h = textProtocolHarness();
    const pending = saveTextSprite(h.protocol, command, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow('Check the saved table');
    await vi.advanceTimersByTimeAsync(15000); await rejected;
    expect(h.send).toHaveBeenCalledOnce(); expect(h.count()).toBe(0);
  });
});
