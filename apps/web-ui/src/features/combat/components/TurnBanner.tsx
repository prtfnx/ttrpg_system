import { useGameStore } from '@/store';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { useCallback, useEffect } from 'react';
import { useCombatStore } from '../stores/combatStore';
import styles from './TurnBanner.module.css';

export function TurnBanner() {
  const combat = useCombatStore((s) => s.combat);
  const getCurrentCombatant = useCombatStore((s) => s.getCurrentCombatant);
  const userId = useGameStore((s) => s.userId);

  const current = combat?.phase === 'active' ? getCurrentCombatant() : null;
  const isMyTurn = !!current && userId !== null && current.controlled_by.includes(String(userId));

  const endTurn = useCallback(() => {
    if (!current) return;
    ProtocolService.getProtocol()?.sendMessage(
      createMessage(MessageType.TURN_END, { combatant_id: current.combatant_id })
    );
  }, [current]);

  useEffect(() => {
    if (!isMyTurn) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'e' && !e.ctrlKey && !e.altKey && !e.metaKey) endTurn();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMyTurn, endTurn]);

  if (!current) return null;

  return (
    <div className={[styles.banner, isMyTurn ? styles.myTurn : styles.otherTurn].join(' ')}>
      {isMyTurn ? (
        <>
          <span>Your Turn!</span>
          <button className={styles.endBtn} onClick={endTurn}>End Turn <kbd className={styles.kbd}>[E]</kbd></button>
        </>
      ) : (
        <span>{current.name}&apos;s Turn</span>
      )}
    </div>
  );
}
