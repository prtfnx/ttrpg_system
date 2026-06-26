import { useOptionalProtocol } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { useCallback } from 'react';

export type CombatCommandType = 'dash' | 'dodge' | 'disengage' | 'hide' | 'end_turn';

export interface CombatCommandPayload {
  type: string;
  actor_id: string;
  [key: string]: unknown;
}

export interface CombatCommandBatch {
  sequence_id: number;
  commands: CombatCommandPayload[];
}

export function useCombatCommands() {
  const protocolCtx = useOptionalProtocol();
  const protocol = protocolCtx?.protocol;

  const sendCommandBatch = useCallback((batch: CombatCommandBatch) => {
    protocol?.sendMessage(createMessage(MessageType.COMBAT_COMMAND, batch));
    return Boolean(protocol);
  }, [protocol]);

  const sendCommand = useCallback((command: CombatCommandPayload, sequenceId = Date.now()) => (
    sendCommandBatch({
      sequence_id: sequenceId,
      commands: [command],
    })
  ), [sendCommandBatch]);

  const sendUtilityAction = useCallback((actorId: string, type: CombatCommandType) => (
    sendCommand({
      type,
      actor_id: actorId,
    })
  ), [sendCommand]);

  const endTurn = useCallback((actorId: string) => (
    sendUtilityAction(actorId, 'end_turn')
  ), [sendUtilityAction]);

  return {
    sendCommandBatch,
    sendCommand,
    sendUtilityAction,
    endTurn,
  };
}
