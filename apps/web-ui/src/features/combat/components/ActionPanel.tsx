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

  const utilityAction = (actionType: string) => {
    send(actionType, { combatant_id: current.combatant_id });
  };

  const endTurn = () => {
    send(MessageType.TURN_END, { combatant_id: current.combatant_id });
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
          onClick={() => utilityAction(MessageType.COMBAT_DASH)}
          title="Dash: double movement (action)"
        >
          ⚡ Dash
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => utilityAction(MessageType.COMBAT_DODGE)}
          title="Dodge: attackers have disadvantage (action)"
        >
          🛡 Dodge
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => utilityAction(MessageType.COMBAT_DISENGAGE)}
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
          onClick={() => utilityAction(MessageType.COMBAT_HIDE)}
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
