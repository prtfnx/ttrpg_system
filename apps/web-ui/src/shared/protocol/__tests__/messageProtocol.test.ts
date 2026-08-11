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

  it('should validate the session welcome payload', () => {
    const validData = {
      message: 'Welcome to game session ABC123',
      client_id: 'client-1',
      user_id: 7,
      username: 'Ada',
      session_code: 'ABC123',
      connection_id: null,
      tables: ['table-1'],
      role: 'player',
      permissions: ['compendium:read'],
      visible_layers: ['map', 'tokens'],
      game_mode: 'free_roam',
      session_rules: { session_id: 'ABC123' },
      choice_encounter: null,
    };

    expect(parseMessage(JSON.stringify({
      type: MessageType.WELCOME,
      data: validData,
    })).data).toEqual(validData);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.WELCOME,
      data: { ...validData, role: 'administrator' },
    }))).toThrow(/Invalid message/);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.WELCOME,
      data: { ...validData, game_mode: 'combat' },
    }))).toThrow(/Invalid message/);
  });

  it('should validate player lifecycle payloads', () => {
    const joinedData = {
      username: 'Ada',
      user_id: 7,
      client_id: 'client-1',
      role: 'player',
      timestamp: '2026-08-07T12:00:00+00:00',
    };
    const leftData = {
      username: 'Ada',
      timestamp: '2026-08-07T12:05:00+00:00',
    };

    expect(parseMessage(JSON.stringify({
      type: MessageType.PLAYER_JOINED,
      data: joinedData,
    })).data).toEqual(joinedData);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.PLAYER_JOINED,
      data: { user_id: joinedData.user_id },
    }))).toThrow(/Invalid message/);
    expect(parseMessage(JSON.stringify({
      type: MessageType.PLAYER_LEFT,
      data: { ...leftData, reason: 'Kicked by GM: idle', kicked: true },
    })).data).toMatchObject({ kicked: true });
    expect(parseMessage(JSON.stringify({
      type: MessageType.PLAYER_LEFT,
      data: { ...leftData, reason: 'Banned by GM for permanent: abuse', banned: true, duration: 'permanent' },
    })).data).toMatchObject({ banned: true });
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.PLAYER_LEFT,
      data: { ...leftData, duration: 'permanent' },
    }))).toThrow(/Invalid message/);
  });

  it('should validate player role change payloads', () => {
    const validData = {
      user_id: 7,
      new_role: 'trusted_player',
      permissions: ['compendium:read'],
      visible_layers: ['map', 'tokens'],
    };

    expect(parseMessage(JSON.stringify({
      type: MessageType.PLAYER_ROLE_CHANGED,
      data: validData,
    })).data).toEqual(validData);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.PLAYER_ROLE_CHANGED,
      data: { ...validData, new_role: 'administrator' },
    }))).toThrow(/Invalid message/);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.PLAYER_ROLE_CHANGED,
      data: { ...validData, permissions: 'all' },
    }))).toThrow(/Invalid message/);
  });

  it('should validate player roster response payloads', () => {
    const validData = {
      players: [{
        client_id: 'client-1',
        username: 'Ada',
        user_id: 7,
        role: 'player',
        ready: true,
        connected_at: 1,
        last_ping: 2,
      }],
      count: 1,
      session_code: 'ABC123',
    };

    expect(parseMessage(JSON.stringify({
      type: MessageType.PLAYER_LIST_RESPONSE,
      data: validData,
    })).data).toEqual(validData);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.PLAYER_LIST_RESPONSE,
      data: {
        ...validData,
        players: [{ ...validData.players[0], role: 'administrator' }],
      },
    }))).toThrow(/Invalid message/);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.PLAYER_LIST_RESPONSE,
      data: { ...validData, session_code: null },
    }))).toThrow(/Invalid message/);
  });

  it('should keep player status request, response, and event contracts distinct', () => {
    expect(parseMessage(JSON.stringify({
      type: MessageType.PLAYER_STATUS_REQUEST,
      data: { client_id: 'client-1' },
    })).data).toEqual({ client_id: 'client-1' });
    expect(parseMessage(JSON.stringify({
      type: MessageType.PLAYER_STATUS_RESPONSE,
      data: {
        client_id: 'client-1',
        status: { ready: true, last_action: 42 },
      },
    })).data).toMatchObject({ status: { ready: true } });
    expect(parseMessage(JSON.stringify({
      type: MessageType.PLAYER_STATUS_CHANGED,
      data: {
        client_id: 'client-1',
        status: { ready: false, last_action: 43 },
      },
    })).data).toMatchObject({ status: { ready: false } });
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.PLAYER_STATUS_REQUEST,
      data: { status: { ready: true } },
    }))).toThrow(/Invalid message/);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.PLAYER_STATUS_RESPONSE,
      data: { client_id: 'client-1', status: 'ready' },
    }))).toThrow(/Invalid message/);
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

  it('should validate accepted action result payloads', () => {
    const validData = {
      accepted: true,
      sequence_id: 42,
      applied: [{ action_type: 'move', actor_id: 'sprite-1' }],
      combat: { combat_id: 'combat-1' },
      state_version: 3,
    };

    expect(parseMessage(JSON.stringify({
      type: MessageType.ACTION_RESULT,
      data: validData,
    })).data).toEqual(validData);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.ACTION_RESULT,
      data: { ...validData, applied: {} },
    }))).toThrow(/Invalid message/);
  });

  it('should validate rejected combat and sprite action payloads', () => {
    expect(parseMessage(JSON.stringify({
      type: MessageType.ACTION_REJECTED,
      data: {
        accepted: false,
        sequence_id: 43,
        applied: [],
        failed_index: 0,
        reason: 'Not your turn',
      },
    })).data).toMatchObject({ reason: 'Not your turn' });
    expect(parseMessage(JSON.stringify({
      type: MessageType.ACTION_REJECTED,
      data: {
        reason: 'Movement blocked',
        sprite_id: 'sprite-1',
        action_id: 'action-1',
      },
    })).data).toMatchObject({ sprite_id: 'sprite-1' });
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.ACTION_REJECTED,
      data: { sequence_id: 43 },
    }))).toThrow(/Invalid message/);
  });

  it('should validate direction-specific batches and every nested message', () => {
    const ping = createMessage(MessageType.PING);
    expect(parseMessage(JSON.stringify({
      type: MessageType.BATCH_REQUEST,
      data: { messages: [ping], seq: 3 },
    })).data).toMatchObject({ seq: 3 });
    expect(parseMessage(JSON.stringify({
      type: MessageType.BATCH_RESPONSE,
      data: {
        messages: [createMessage(MessageType.SUCCESS, { acknowledged: true })],
        seq: 3,
        processed_count: 1,
        response_count: 1,
      },
    })).data).toMatchObject({ response_count: 1 });
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.BATCH_REQUEST,
      data: {
        messages: [{
          type: MessageType.PLAYER_STATUS_REQUEST,
          data: { status: 'ready' },
        }],
      },
    }))).toThrow(/Invalid message/);
    expect(() => parseMessage(JSON.stringify({
      type: MessageType.BATCH_REQUEST,
      data: {
        messages: [{
          type: MessageType.BATCH_REQUEST,
          data: { messages: [ping] },
        }],
      },
    }))).toThrow(/Invalid message/);
  });
});
