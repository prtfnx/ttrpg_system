import type { CombatMessage, CombatMessageType, CombatPayloads } from './combat.generated';
import { createMessage, parseMessage, type Message } from './message';

/** Typed construction; runtime parsing remains the wire boundary validator. */
export function createCombatMessage<K extends CombatMessageType>(
  type: K, data: CombatPayloads[K], priority = 5,
): CombatMessage<K> {
  return createMessage(type, data, priority) as CombatMessage<K>;
}

/** Validate before narrowing a generic message to its canonical payload. */
export function parseCombatMessage<K extends CombatMessageType>(message: Message, type: K): CombatMessage<K> {
  if (message.type !== type) throw new Error(`Expected combat message ${type}`);
  return parseMessage(JSON.stringify(message)) as CombatMessage<K>;
}
