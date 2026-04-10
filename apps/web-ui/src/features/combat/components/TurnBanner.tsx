import styles from './TurnBanner.module.css';
import { useGameStore } from '@/store';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { useCombatStore } from '../stores/combatStore';

export function TurnBanner() {
  const combat = useCombatStore((s) => s.combat);
  const getCurrentCombatant = useCombatStore((s) => s.getCurrentCombatant);
  const userId = useGameStore((s) => s.userId);

  if (!combat || combat.phase !== 'active') return null;

  const current = getCurrentCombatant();
  if (!current) return null;

  const isMyTurn = userId !== null && current.controlled_by.includes(String(userId));

  const endTurn = () => {
    ProtocolService.getProtocol()?.sendMessage(
      createMessage(MessageType.TURN_END, { combatant_id: current.combatant_id })
    );
  };

  return (
    <div className={[styles.banner, isMyTurn ? styles.myTurn : styles.otherTurn].join(' ')}>
      {isMyTurn ? (
        <>
          <span>Your Turn!</span>
          <button className={styles.endBtn} onClick={endTurn}>End Turn</button>
        </>
      ) : (
        <span>{current.name}&apos;s Turn</span>
      )}
    </div>
  );
}
