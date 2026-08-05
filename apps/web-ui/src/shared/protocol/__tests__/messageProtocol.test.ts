import { createMessage, MessageType, parseMessage } from '@lib/websocket/message';
import { describe, expect, it } from 'vitest';

describe('Protocol Message Utilities', () => {

  it('should serialize and deserialize a basic message', () => {
    const msg = createMessage(MessageType.CHARACTER_UPDATE, { id: 'c1', name: 'Hero' });
    const json = JSON.stringify(msg);
    const parsed = parseMessage(json);
    expect(parsed.type).toBe(MessageType.CHARACTER_UPDATE);
    expect(parsed.data).toEqual({ id: 'c1', name: 'Hero' });
  });

  it('should handle missing data gracefully', () => {
    const msg = createMessage(MessageType.PING);
    const json = JSON.stringify(msg);
    const parsed = parseMessage(json);
    expect(parsed.type).toBe(MessageType.PING);
    expect(parsed.data).toEqual({});
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseMessage('{invalid json')).toThrow();
  });

  it('should throw on missing type field', () => {
    const badJson = JSON.stringify({ payload: { foo: 1 } });
    expect(() => parseMessage(badJson)).toThrow();
  });

  it('should throw on unknown message types', () => {
    expect(() => parseMessage(JSON.stringify({ type: 'not_registered' })))
      .toThrow(/Invalid message/);
  });

  it.each([
    null,
    [],
    'payload',
    1,
  ])('should throw when data is not an object: %j', (data) => {
    expect(() => parseMessage(JSON.stringify({ type: MessageType.PING, data })))
      .toThrow(/Invalid message/);
  });

  it('should reject extra envelope fields', () => {
    const msg = { type: MessageType.PING, data: {}, extra: 123 };
    expect(() => parseMessage(JSON.stringify(msg))).toThrow(/Invalid message/);
  });

  it('should reject invalid envelope metadata', () => {
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.PING,
      priority: 'high',
    }))).toThrow(/Invalid message/);
  });

  it('should preserve zero priority instead of replacing it with the default', () => {
    const parsed = parseMessage(JSON.stringify({
      type: MessageType.PING,
      priority: 0,
    }));

    expect(parsed.priority).toBe(0);
  });

  it('should validate table settings payloads', () => {
    const validData = {
      table_id: 'table-1',
      dynamic_lighting_enabled: false,
      fog_exploration_mode: 'current_only',
      ambient_light_level: 0.25,
      grid_cell_px: 50,
      cell_distance: 5,
      distance_unit: 'ft',
      grid_enabled: true,
      snap_to_grid: false,
      grid_color_hex: '#ffffff',
      background_color_hex: '#2a3441',
    };

    expect(parseMessage(JSON.stringify({
      type: MessageType.TABLE_SETTINGS_CHANGED,
      data: validData,
    })).data).toEqual(validData);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.TABLE_SETTINGS_CHANGED,
      data: { ...validData, grid_enabled: 'false' },
    }))).toThrow(/Invalid message/);
  });
});
