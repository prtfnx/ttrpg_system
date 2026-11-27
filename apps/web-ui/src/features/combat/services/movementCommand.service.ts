import { useCombatStore } from '../stores/combatStore';
import { useOAStore, type PendingCombatCommand } from '../stores/oaStore';
import { createMessage, MessageType } from '@lib/websocket';
import type { WebClientProtocol } from '@lib/websocket/clientProtocol';
import { nextCombatSequenceId } from './combatSequence';
import { createCombatMessage } from '@lib/websocket/combatMessages';

interface Position {
  x: number;
  y: number;
}

export interface SpriteMovementInput {
  spriteId: string;
  tableId: string;
  from: Position;
  to: Position;
  actionId?: string;
  path?: unknown[];
}

export function nextMovementSequenceId(): number {
  return nextCombatSequenceId();
}

export function sendSpriteMovement(
  protocol: Pick<WebClientProtocol, 'sendMessage'>,
  input: SpriteMovementInput,
): 'combat' | 'table' {
  const combat = useCombatStore.getState().combat;
  const combatant = combat?.combatants.find(
    (candidate) => String(candidate.entity_id) === String(input.spriteId),
  );

  if (
    combat
    && combat.phase !== 'inactive'
    && combat.table_id === input.tableId
    && combatant
  ) {
    const sequenceId = input.actionId && /^[1-9]\d*$/.test(input.actionId) && Number.isSafeInteger(Number(input.actionId))
      ? Number(input.actionId)
      : nextMovementSequenceId();
    const payload: PendingCombatCommand = {
      sequence_id: sequenceId,
      commands: [{
        type: 'move',
        actor_id: combatant.combatant_id,
        table_id: input.tableId,
        from_x: input.from.x,
        from_y: input.from.y,
        target_x: input.to.x,
        target_y: input.to.y,
        path: input.path ?? [],
      }],
    };

    const previous = useOAStore.getState().pendingCombatCommand;
    useOAStore.getState().setPendingCombatCommand(payload);
    try {
      if (protocol.sendMessage(createCombatMessage(MessageType.COMBAT_COMMAND, payload)) === false) {
        throw new Error('Movement could not be sent');
      }
    } catch (error) {
      const state = useOAStore.getState();
      if (state.pendingCombatCommand?.sequence_id === sequenceId) {
        if (previous) state.setPendingCombatCommand(previous);
        else state.clearPendingCombatCommand();
      }
      throw error;
    }
    return 'combat';
  }

  if (protocol.sendMessage(createMessage(MessageType.SPRITE_MOVE, {
    sprite_id: input.spriteId,
    table_id: input.tableId,
    from: input.from,
    to: input.to,
    ...(input.actionId ? { action_id: input.actionId } : {}),
    ...(input.path ? { path: input.path } : {}),
  }, 2)) === false) throw new Error('Movement could not be sent');
  return 'table';
}
