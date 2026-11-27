import { describe, expect, it } from 'vitest';
import { createCombatMessage, parseCombatMessage } from '../combatMessages';
import { createMessage, MessageType } from '../message';

describe('canonical combat messages', () => {
  it('constructs and parses a typed command without changing its identity or payload', () => {
    const data = { sequence_id: 42, combat_id: 'encounter', expected_state_version: 2,
      commands: [{ type: 'dodge' as const, actor_id: 'actor' }] };
    const message = createCombatMessage(MessageType.COMBAT_COMMAND, data);
    expect(parseCombatMessage(message, MessageType.COMBAT_COMMAND).data).toEqual(data);
    expect(message.message_id).toBeTruthy();
  });

  it('narrows receipt outcomes and accepts recovery results with no active combat', () => {
    const message = createCombatMessage(MessageType.COMBAT_STATE, { combat: null,
      receipt: { combat_id: 'encounter', sequence_id: 42, status: 'accepted', state_version: 3 } });
    const receipt = parseCombatMessage(message, MessageType.COMBAT_STATE).data.receipt;
    expect(receipt?.status === 'accepted' && receipt.state_version).toBe(3);
    for (const result of [
      createCombatMessage(MessageType.ACTION_RESULT, { accepted: true, sequence_id: 42, applied: [], combat: null, resync_required: true }),
      createCombatMessage(MessageType.ACTION_REJECTED, { reason: 'Did not commit', combat: null, resync_required: true }),
    ]) expect(parseCombatMessage(result, result.type).data.combat).toBeNull();
  });

  it.each([{ commands: [] }, { commands: [{ type: 'invented', actor_id: 'actor' }] },
    { commands: [{ type: 'dodge', actor_id: 'actor' }], sequence_id: true },
    { commands: [{ type: 'dodge', actor_id: 'actor', user_id: 99 }] },
  ])('rejects untyped malformed input at runtime', data => {
    expect(() => parseCombatMessage(createMessage(MessageType.COMBAT_COMMAND, data), MessageType.COMBAT_COMMAND)).toThrow(/Invalid message/);
  });

  it('rejects a different message family before narrowing', () => {
    expect(() => parseCombatMessage(createMessage(MessageType.PING, {}), MessageType.COMBAT_COMMAND)).toThrow(/Expected combat message/);
  });

  it('checks invalid message/payload pairs during TypeScript compilation', () => {
    const compileContract = () => {
      // @ts-expect-error Invented action names are outside the canonical command enum.
      createCombatMessage(MessageType.COMBAT_COMMAND, { commands: [{ type: 'invented', actor_id: 'actor' }] });
      // @ts-expect-error A combat command must provide its command list.
      createCombatMessage(MessageType.COMBAT_COMMAND, { sequence_id: 42 });
      // @ts-expect-error A state response uses a combat view rather than command fields.
      createCombatMessage(MessageType.COMBAT_STATE, { commands: [] });
      // @ts-expect-error Closed command types cannot carry an authenticated user override.
      createCombatMessage(MessageType.COMBAT_COMMAND, { commands: [{ type: 'dodge', actor_id: 'actor', user_id: 99 }] });
    };
    expect(compileContract).toBeTypeOf('function');
  });
});
