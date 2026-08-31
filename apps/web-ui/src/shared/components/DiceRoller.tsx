import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './DiceRoller.module.css';

/**
 * DiceRoller - Minimal, reusable dice roller component for TTRPGs.
 * - Rolls any standard dice (d4, d6, d8, d10, d12, d20, d100)
 * - TypeScript, no external dependencies, concise code
 * - Best practices: stateless dice logic, local state for UI, accessible
 */
export type DiceType = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export interface DiceRollerProps {
  dice?: DiceType; // default: 20
  count?: number; // default: 1
  onRoll?: (results: number[]) => void;
}


export function DiceRoller({ dice = 20, count = 1, onRoll }: DiceRollerProps) {
  const diceTypeId = useId();
  const [results, setResults] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [selectedDice, setSelectedDice] = useState<DiceType>(dice);
  const [sentToChat, setSentToChat] = useState(false);
  const chatStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (chatStatusTimerRef.current) clearTimeout(chatStatusTimerRef.current);
  }, []);

  function rollDice() {
    setRolling(true);
    const newResults = Array.from({ length: count }, () => Math.floor(Math.random() * selectedDice) + 1);
    setResults(newResults);
    setRolling(false);
    onRoll?.(newResults);

    // Send to chat if possible
    const text = `Rolled ${count}d${selectedDice}: ${newResults.join(', ')}${newResults.length > 1 ? ` (Total: ${newResults.reduce((a, b) => a + b, 0)})` : ''}`;
    if (ProtocolService.hasProtocol()) {
      ProtocolService.getProtocol().sendMessage(createMessage(MessageType.CHAT, { text }));
      setSentToChat(true);
      if (chatStatusTimerRef.current) clearTimeout(chatStatusTimerRef.current);
      chatStatusTimerRef.current = setTimeout(() => {
        chatStatusTimerRef.current = null;
        setSentToChat(false);
      }, 1200);
    }
  }

  return (
    <div className={styles.diceRoller}>
      <h3 className={styles.title}>Dice Roller</h3>
      <div className={styles.controls}>
        <label className={styles.formLabel} htmlFor={diceTypeId}>Roll:</label>
        <select
          id={diceTypeId}
          value={selectedDice}
          onChange={e => setSelectedDice(Number(e.target.value) as DiceType)}
          className={styles.formSelect}
        >
          <option value={4}>d4</option>
          <option value={6}>d6</option>
          <option value={8}>d8</option>
          <option value={10}>d10</option>
          <option value={12}>d12</option>
          <option value={20}>d20</option>
          <option value={100}>d100</option>
        </select>
        <span className={styles.diceCount}>(x{count})</span>
      </div>
      <button
        type="button"
        onClick={rollDice}
        disabled={rolling}
        className={styles.rollButton}
        aria-label={`Roll ${count}d${selectedDice}`}
      >
        Roll
      </button>
      <div className={styles.results} aria-live="polite">
        {results.length > 0 && (
          <span>
            Result: {results.join(', ')}
            {results.length > 1 && (
              <span className={styles.total}>
                (Total: {results.reduce((a, b) => a + b, 0)})
              </span>
            )}
          </span>
        )}
      </div>
      {sentToChat && (
        <div className={styles.chatSent} role="status">Sent to chat!</div>
      )}
    </div>
  );
}

export default DiceRoller;
