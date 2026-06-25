import { useGameStore } from '@/store';
import { useOptionalProtocol } from '@lib/api';
import type { WebClientProtocol } from '@lib/websocket';
import { MessageType } from '@lib/websocket/message';
import { useCallback } from 'react';
import { useCombatStore } from '../stores/combatStore';
import styles from './ActionPanel.module.css';

interface ActionPanelProps {
  onSelectTarget?: (action: 'attack' | 'help') => void;
}
type ProtocolMessage = Parameters<WebClientProtocol['sendMessage']>[0];
type CombatCommandType = 'dash' | 'dodge' | 'disengage' | 'hide' | 'end_turn';


export function ActionPanel({ onSelectTarget }: ActionPanelProps) {
  const combat = useCombatStore((s) => s.combat);
  const userId = useGameStore((s) => s.userId);
  const protocolCtx = useOptionalProtocol();
  const protocol = protocolCtx?.protocol;
  const send = useCallback(
    (type: string, data: Record<string, unknown>) => {
      protocol?.sendMessage({
        type,
        data,
      } as ProtocolMessage);
    },
    [protocol],
  );

  
  if (!combat || combat.phase !== 'active') return null;

  const active = combat.combatants.filter((c) => !c.is_defeated);
  const current = active[combat.current_turn_index % Math.max(active.length, 1)];

  if (!current || userId === null || !current.controlled_by.includes(String(userId))) {
    return null;
  }

  const sendCommand = (commandType: CombatCommandType) => {
    send(MessageType.COMBAT_COMMAND, {
      sequence_id: Date.now(),
      commands: [{
        type: commandType,
        actor_id: current.combatant_id,
      }],
    });
  };

  const endTurn = () => {
    sendCommand('end_turn');
  };

  const noAction = !current.has_action;

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Your Turn — {current.name}</div>
      <div className={styles.grid}>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => onSelectTarget?.('attack')}
          title="Attack (action)"
        >
          ⚔ Attack
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('dash')}
          title="Dash: double movement (action)"
        >
          ⚡ Dash
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('dodge')}
          title="Dodge: attackers have disadvantage (action)"
        >
          🛡 Dodge
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('disengage')}
          title="Disengage: move without provoking OAs (action)"
        >
          🏃 Disengage
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => onSelectTarget?.('help')}
          title="Help: give ally advantage (action)"
        >
          🤝 Help
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('hide')}
          title="Hide: Stealth check (action)"
        >
          👁 Hide
        </button>
        <button
          className={[styles.btn, styles.btnEnd].join(' ')}
          onClick={endTurn}
          title="End your turn"
        >
          End Turn
        </button>
      </div>
    </div>
  );
}
