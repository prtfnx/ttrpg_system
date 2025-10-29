import { describe, it, expect } from 'vitest';
import { createMessage, parseMessage, MessageType } from '../message';

describe('Protocol Message Utilities', () => {
  it('should serialize and deserialize a basic message', () => {
    const msg = createMessage(MessageType.CHARACTER_UPDATE, { id: 'c1', name: 'Hero' });
    const json = JSON.stringify(msg);
    const parsed = parseMessage(json);
    expect(parsed.type).toBe(MessageType.CHARACTER_UPDATE);
    expect(parsed.payload).toEqual({ id: 'c1', name: 'Hero' });
  });

  it('should handle missing payload gracefully', () => {
    const msg = createMessage(MessageType.PING);
    const json = JSON.stringify(msg);
    const parsed = parseMessage(json);
    expect(parsed.type).toBe(MessageType.PING);
    expect(parsed.payload).toBeUndefined();
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseMessage('{invalid json')).toThrow();
  });

  it('should throw on missing type field', () => {
    const badJson = JSON.stringify({ payload: { foo: 1 } });
    expect(() => parseMessage(badJson)).toThrow();
  });

  it('should handle extra fields in message', () => {
    const msg = { type: MessageType.PING, payload: {}, extra: 123 };
    const json = JSON.stringify(msg);
    const parsed = parseMessage(json);
    expect(parsed.type).toBe(MessageType.PING);
    expect(parsed.payload).toEqual({});
    // Extra fields are ignored
    expect(parsed.extra).toBeUndefined();
  });
});