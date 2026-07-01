import { useCombatStore } from '../stores/combatStore';
import { useOAStore, type PendingCombatCommand } from '../stores/oaStore';
import { createMessage, MessageType } from '@lib/websocket';
import type { WebClientProtocol } from '@lib/websocket/clientProtocol';

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

let lastSequenceId = 0;

export function nextMovementSequenceId(): number {
  lastSequenceId = Math.max(Date.now(), lastSequenceId + 1);
  return lastSequenceId;
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
    const sequenceId = input.actionId && Number.isSafeInteger(Number(input.actionId))
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

    useOAStore.getState().setPendingCombatCommand(payload);
    protocol.sendMessage(createMessage(MessageType.COMBAT_COMMAND, {
      sequence_id: payload.sequence_id,
      commands: payload.commands,
    }));
    return 'combat';
  }

  protocol.sendMessage(createMessage(MessageType.SPRITE_MOVE, {
    sprite_id: input.spriteId,
    table_id: input.tableId,
    from: input.from,
    to: input.to,
    ...(input.actionId ? { action_id: input.actionId } : {}),
    ...(input.path ? { path: input.path } : {}),
  }, 2));
  return 'table';
}
