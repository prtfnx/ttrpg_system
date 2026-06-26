import { useGameStore } from '@/store';
import { Eye, Footprints, Handshake, LogOut, Shield, Swords, Zap } from 'lucide-react';
import type { CombatCommandType } from '../hooks/useCombatCommands';
import { useCombatCommands } from '../hooks/useCombatCommands';
import { useCombatStore } from '../stores/combatStore';
import styles from './ActionPanel.module.css';

interface ActionPanelProps {
  onSelectTarget?: (action: 'attack' | 'help') => void;
}

export function ActionPanel({ onSelectTarget }: ActionPanelProps) {
  const combat = useCombatStore((s) => s.combat);
  const userId = useGameStore((s) => s.userId);
  const { sendUtilityAction } = useCombatCommands();

  if (!combat || combat.phase !== 'active') return null;

  const active = combat.combatants.filter((c) => !c.is_defeated);
  const current = active[combat.current_turn_index % Math.max(active.length, 1)];

  if (!current || userId === null || !current.controlled_by.includes(String(userId))) {
    return null;
  }

  const sendCommand = (commandType: CombatCommandType) => {
    sendUtilityAction(current.combatant_id, commandType);
  };

  const noAction = !current.has_action;

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Your Turn - {current.name}</div>
      <div className={styles.grid}>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => onSelectTarget?.('attack')}
          title="Attack (action)"
        >
          <Swords size={14} aria-hidden /> Attack
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('dash')}
          title="Dash: double movement (action)"
        >
          <Zap size={14} aria-hidden /> Dash
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('dodge')}
          title="Dodge: attackers have disadvantage (action)"
        >
          <Shield size={14} aria-hidden /> Dodge
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('disengage')}
          title="Disengage: move without provoking OAs (action)"
        >
          <Footprints size={14} aria-hidden /> Disengage
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => onSelectTarget?.('help')}
          title="Help: give ally advantage (action)"
        >
          <Handshake size={14} aria-hidden /> Help
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('hide')}
          title="Hide: Stealth check (action)"
        >
          <Eye size={14} aria-hidden /> Hide
        </button>
        <button
          className={[styles.btn, styles.btnEnd].join(' ')}
          onClick={() => sendCommand('end_turn')}
          title="End your turn"
        >
          <LogOut size={14} aria-hidden /> End Turn
        </button>
      </div>
    </div>
  );
}
